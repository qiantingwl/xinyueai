import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import Ajv, { type ErrorObject, type ValidateFunction } from 'ajv'
import { PrismaService } from '../prisma/prisma.service'
import { CredentialCryptoService } from '../providers/credential-crypto.service'
import { WebSearchService } from './web-search.service'
import { ResourceAccessService } from '../common/resource-access.service'
import { PublicEndpointPolicyService } from '../common/public-endpoint-policy.service'
import { fetchPublicNoRedirect } from '../common/outbound-http'
import { AssetsService } from '../assets/assets.service'
import { adaptWorkflowRequest, isWorkflowToolKey, WORKFLOW_TOOL_KEYS, workflowPlannerSchema } from './workflow-adapters'

export type AgentToolDescriptor = {
  id?: string
  key: string
  name: string
  description: string
  requiresApproval: boolean
  kind: 'builtin' | 'external'
  inputSchema?: Prisma.JsonValue | null
}

type ToolExecutionTask = { id: string; userId: string; assistantId: string | null; projectId: string | null; webSearchEnabled: boolean; attachmentIds?: Prisma.JsonValue | string[] | null }

@Injectable()
export class AgentToolsService {
  private readonly ajv = new Ajv({ allErrors: true, strict: false, coerceTypes: false })
  private readonly validators = new Map<string, ValidateFunction>()

  constructor(private readonly prisma: PrismaService, private readonly crypto: CredentialCryptoService, private readonly web: WebSearchService, private readonly access: ResourceAccessService, private readonly endpointPolicy: PublicEndpointPolicyService, private readonly assets: AssetsService) {}

  async available(task: ToolExecutionTask): Promise<AgentToolDescriptor[]> {
    const tools: AgentToolDescriptor[] = [
      { key: 'knowledge_search', name: '知识库检索', description: '从用户已授权的知识库中检索事实、文档片段和内部资料', requiresApproval: false, kind: 'builtin', inputSchema: { type: 'object', properties: { query: { type: 'string', minLength: 1, maxLength: 500 }, q: { type: 'string', minLength: 1, maxLength: 500 } }, anyOf: [{ required: ['query'] }, { required: ['q'] }], additionalProperties: false } },
      { key: 'project_context', name: '项目上下文', description: '读取当前项目的目标、说明、工作流状态、版本记录和项目文件摘要', requiresApproval: false, kind: 'builtin', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
      { key: 'file_catalog', name: '文件目录', description: '按名称、类型或项目筛选用户文件，返回可用于后续办公任务的文件元数据', requiresApproval: false, kind: 'builtin', inputSchema: { type: 'object', properties: { query: { type: 'string', maxLength: 300 }, kind: { type: 'string', enum: ['IMAGE', 'VIDEO', 'FILE'] }, projectId: { type: 'string', maxLength: 100 } }, additionalProperties: false } },
      { key: 'file_read', name: '读取文件', description: '读取用户已授权文件的正文或知识库摘录，适合在列出文件后继续引用原文', requiresApproval: false, kind: 'builtin', inputSchema: { type: 'object', properties: { assetId: { type: 'string', minLength: 1, maxLength: 100 }, id: { type: 'string', minLength: 1, maxLength: 100 } }, anyOf: [{ required: ['assetId'] }, { required: ['id'] }], additionalProperties: false } },
      { key: 'data_summary', name: '数据汇总', description: '对输入的数字数组或表格行执行计数、合计、均值、最小值和最大值计算', requiresApproval: false, kind: 'builtin', inputSchema: { type: 'object', properties: { values: { type: 'array', maxItems: 20000, items: { type: ['number', 'string'] } }, rows: { type: 'array', maxItems: 5000, items: { type: 'object' } } }, anyOf: [{ required: ['values'] }, { required: ['rows'] }], additionalProperties: false } },
      { key: 'current_time', name: '日期与时间', description: '获取当前服务器日期、时间和时区', requiresApproval: false, kind: 'builtin', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
    ]
    if (task.webSearchEnabled && await this.web.isAvailable()) tools.push({ key: 'web_search', name: '网页搜索', description: '检索公开网页并返回可引用的标题、链接、摘要和来源，适合最新信息、事实核验与调研任务', requiresApproval: false, kind: 'builtin', inputSchema: { type: 'object', properties: { query: { type: 'string', minLength: 1, maxLength: 500 }, q: { type: 'string', minLength: 1, maxLength: 500 }, maxResults: { type: 'integer', minimum: 1, maximum: 20 }, max_results: { type: 'integer', minimum: 1, maximum: 20 }, topic: { type: 'string', maxLength: 50 }, includeDomains: { type: 'array', maxItems: 20, items: { type: 'string', maxLength: 253 } }, excludeDomains: { type: 'array', maxItems: 20, items: { type: 'string', maxLength: 253 } } }, anyOf: [{ required: ['query'] }, { required: ['q'] }], additionalProperties: false } })
    const seen = new Set(tools.map((tool) => tool.key))
    const bindings = task.assistantId
      ? await this.prisma.assistantTool.findMany({ where: { assistantId: task.assistantId, tool: { enabled: true, kind: 'BUILT_IN' } }, include: { tool: true } })
      : []
    const workspace = await this.prisma.toolDefinition.findMany({
      where: { enabled: true, kind: 'BUILT_IN', endpoint: { not: '' }, key: { in: [...WORKFLOW_TOOL_KEYS] } },
    })
    const external = [...bindings.map(({ tool }) => tool), ...workspace]
      .filter((tool) => tool.endpoint.trim() && !seen.has(tool.key))
    for (const tool of external) {
      seen.add(tool.key)
      tools.push({
        id: tool.id,
        key: tool.key,
        name: tool.name,
        description: tool.description,
        requiresApproval: tool.requiresApproval,
        kind: 'external',
        inputSchema: isWorkflowToolKey(tool.key) ? workflowPlannerSchema : tool.inputSchema,
      })
    }
    return tools
  }

  async execute(task: ToolExecutionTask, tool: AgentToolDescriptor, input: Record<string, unknown>, executionKey?: string, signal?: AbortSignal) {
    const schema = isWorkflowToolKey(tool.key) ? workflowPlannerSchema : tool.inputSchema || null
    this.validateInput(input, schema)
    if (tool.key === 'knowledge_search') return this.knowledgeSearch(task, String(input.query || input.q || ''))
    if (tool.key === 'web_search') return this.web.search({ query: String(input.query || input.q || ''), maxResults: Number(input.maxResults || input.max_results) || undefined, topic: String(input.topic || ''), includeDomains: this.stringArray(input.includeDomains || input.include_domains), excludeDomains: this.stringArray(input.excludeDomains || input.exclude_domains), signal })
    if (tool.key === 'project_context') return this.projectContext(task)
    if (tool.key === 'file_catalog') return this.fileCatalog(task, input)
    if (tool.key === 'file_read') return this.fileRead(task, input)
    if (tool.key === 'data_summary') return this.dataSummary(input)
    if (tool.key === 'current_time') return { iso: new Date().toISOString(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }
    if (!tool.id) throw new Error('工具配置不存在')
    const configured = await this.prisma.toolDefinition.findFirst({ where: { id: tool.id, enabled: true, kind: 'BUILT_IN' } })
    if (!configured?.endpoint) throw new Error('工具尚未配置 Endpoint')
    const payload = isWorkflowToolKey(tool.key) ? adaptWorkflowRequest(tool.key, input, { userId: task.userId }) : input
    const started = Date.now()
    let status = 'FAILED'
    let output = ''
    let error = ''
    try {
      const method = configured.httpMethod.toUpperCase()
      const publicHeaders = this.record(configured.headers)
      const secretHeaders = configured.encryptedHeaders ? this.record(JSON.parse(this.crypto.decrypt(configured.encryptedHeaders))) : {}
      const url = await this.endpointPolicy.assertPublicHttpUrl(configured.endpoint)
      if (method === 'GET' || method === 'DELETE') Object.entries(payload).forEach(([key, value]) => { if (value !== undefined && value !== null) url.searchParams.set(key, typeof value === 'string' ? value : JSON.stringify(value)) })
      const response = await fetchPublicNoRedirect(url, {
        method,
        headers: { ...publicHeaders, ...secretHeaders, 'Content-Type': publicHeaders['Content-Type'] || publicHeaders['content-type'] || 'application/json', ...(executionKey ? { 'Idempotency-Key': executionKey } : {}) },
        ...(method === 'GET' || method === 'DELETE' ? {} : { body: JSON.stringify(payload) }),
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(Math.min(120_000, Math.max(1000, configured.timeoutMs)))])
          : AbortSignal.timeout(Math.min(120_000, Math.max(1000, configured.timeoutMs))),
      })
      output = (await response.text()).slice(0, 100_000)
      if (!response.ok) throw new Error(`工具返回 ${response.status}`)
      status = 'SUCCEEDED'
    } catch (reason) {
      error = reason instanceof Error ? reason.message : '工具调用失败'
    }
    await this.prisma.toolCallAudit.create({
      data: {
        userId: task.userId,
        toolId: configured.id,
        assistantId: task.assistantId,
        status,
        input: this.json(input),
        output: output ? this.json({ text: output }) : undefined,
        error: error || null,
        durationMs: Date.now() - started,
      },
    })
    if (status === 'FAILED') throw new Error(error || '工具调用失败')
    try { return JSON.parse(output) as unknown } catch { return { text: output } }
  }

  private async knowledgeSearch(task: ToolExecutionTask, query: string) {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return { results: [], message: '检索词为空' }
    const assets = await this.prisma.knowledgeBaseAsset.findMany({
      where: task.assistantId
        ? { knowledgeBase: { assistants: { some: { assistantId: task.assistantId } } } }
        : { knowledgeBase: { is: this.access.knowledgeBaseWhere(task.userId) } },
      include: { knowledgeBase: { select: { id: true, name: true } }, asset: { select: { id: true, name: true } } },
      take: 100,
    })
    const terms = [...new Set(normalized.split(/[\s,，。；;:：!?！？]+/).filter((term) => term.length > 1))].slice(0, 12)
    const scored = assets.map((item) => {
      const text = item.extractedText || ''
      const lower = text.toLowerCase()
      const hits = terms.reduce((total, term) => total + (lower.includes(term) ? 1 : 0), 0)
      const first = terms.map((term) => lower.indexOf(term)).filter((index) => index >= 0).sort((a, b) => a - b)[0] ?? 0
      const start = Math.max(0, first - 240)
      return { score: hits, knowledgeBase: item.knowledgeBase.name, file: item.asset.name, assetId: item.asset.id, excerpt: text.slice(start, start + 1800) }
    }).filter((item) => item.score > 0 || !terms.length).sort((a, b) => b.score - a.score).slice(0, 8)
    return { query, results: scored }
  }

  private async projectContext(task: ToolExecutionTask) {
    if (!task.projectId) return { project: null, message: '当前任务未关联项目' }
    const project = await this.prisma.project.findFirst({
      where: { id: task.projectId, archivedAt: null, ...this.access.projectWhere(task.userId) },
      select: {
        id: true,
        name: true,
        description: true,
        instructions: true,
        workflowStatus: true,
        revision: true,
        updatedAt: true,
        versions: { orderBy: { version: 'desc' }, take: 5, select: { version: true, label: true, changeSummary: true, createdAt: true } },
        assets: { where: { deletedAt: null }, orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, name: true, kind: true, mimeType: true, size: true, createdAt: true } },
      },
    })
    if (!project) return { project: null, message: '项目不存在或已归档' }
    return { ...project, assets: project.assets.map((asset) => ({ ...asset, size: Number(asset.size) })) }
  }

  private async fileCatalog(task: ToolExecutionTask, input: Record<string, unknown>) {
    const query = String(input.query || input.name || '').trim()
    const kind = String(input.kind || '').trim().toUpperCase()
    const allowedKinds = new Set(['IMAGE', 'VIDEO', 'FILE'])
    const attachmentIds = Array.isArray(task.attachmentIds) ? task.attachmentIds.filter((item): item is string => typeof item === 'string') : []
    const assets = await this.prisma.asset.findMany({
      where: {
        ...this.access.assetWhere(task.userId),
        deletedAt: null,
        ...(task.projectId && input.allProjects !== true ? { OR: [{ projectId: task.projectId }, { projectId: null }] } : {}),
        ...(query ? { name: { contains: query, mode: 'insensitive' } } : {}),
        ...(allowedKinds.has(kind) ? { kind: kind as 'IMAGE' | 'VIDEO' | 'FILE' } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, projectId: true, kind: true, name: true, mimeType: true, size: true, width: true, height: true, metadata: true, createdAt: true },
    })
    const files = assets.map((asset) => ({ ...asset, size: Number(asset.size), attached: attachmentIds.includes(asset.id) }))
    return { query, count: files.length, attachmentIds, files }
  }

  private async fileRead(task: ToolExecutionTask, input: Record<string, unknown>) {
    const assetId = String(input.assetId || input.id || '').trim()
    if (!assetId) return { results: [], message: '请提供 assetId' }
    const knowledge = await this.prisma.knowledgeBaseAsset.findFirst({
      where: {
        assetId,
        knowledgeBase: task.assistantId
          ? { assistants: { some: { assistantId: task.assistantId } } }
          : { is: this.access.knowledgeBaseWhere(task.userId) },
      },
      include: { knowledgeBase: { select: { name: true } }, asset: { select: { id: true, name: true, mimeType: true } } },
    })
    if (knowledge?.extractedText.trim()) {
      const text = knowledge.extractedText.slice(0, 20_000)
      return { assetId, name: knowledge.asset.name, mimeType: knowledge.asset.mimeType, source: 'knowledge', knowledgeBase: knowledge.knowledgeBase.name, text, truncated: knowledge.extractedText.length > 20_000 }
    }
    const excerpt = await this.assets.readTextExcerptForUser(task.userId, assetId, 20_000)
    const asset = await this.prisma.asset.findFirst({ where: { id: assetId, ...this.access.assetWhere(task.userId), deletedAt: null }, select: { name: true } })
    return { assetId, name: asset?.name || '', mimeType: excerpt.mimeType, source: 'file', text: excerpt.text, truncated: excerpt.truncated, message: excerpt.text ? undefined : '该文件没有可提取的文本，请改用文件目录查看元数据' }
  }

  private dataSummary(input: Record<string, unknown>) {
    const raw = Array.isArray(input.values)
      ? input.values
      : Array.isArray(input.rows)
        ? input.rows.flatMap((row) => row && typeof row === 'object' && !Array.isArray(row) ? Object.values(row as Record<string, unknown>) : [])
        : []
    const values = raw.map((value) => typeof value === 'number' ? value : Number(String(value).replace(/,/g, ''))).filter(Number.isFinite).slice(0, 20_000)
    if (!values.length) return { count: 0, message: '未找到可计算的数字，请通过 values 或 rows 传入数据' }
    const sum = values.reduce((total, value) => total + value, 0)
    const sorted = [...values].sort((a, b) => a - b)
    const middle = Math.floor(sorted.length / 2)
    const median = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
    return { count: values.length, sum, average: sum / values.length, median, min: sorted[0], max: sorted[sorted.length - 1] }
  }

  json(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
  }

  private record(value: Prisma.JsonValue | null): Record<string, string> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    return Object.fromEntries(Object.entries(value).filter(([, item]) => typeof item === 'string')) as Record<string, string>
  }

  private stringArray(value: unknown): string[] | undefined { return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').slice(0, 20) : undefined }

  private validateInput(input: Record<string, unknown>, schema: Prisma.JsonValue | null) {
    if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return
    const cacheKey = JSON.stringify(schema)
    let validate = this.validators.get(cacheKey)
    if (!validate) {
      try { validate = this.ajv.compile(schema as object); this.validators.set(cacheKey, validate) }
      catch (reason) { throw new Error(`工具 JSON Schema 配置无效：${reason instanceof Error ? reason.message : '无法编译'}`) }
    }
    if (validate(input)) return
    const describe = (error: ErrorObject) => `${error.instancePath || '参数'} ${error.message || '格式不正确'}`.trim()
    throw new Error(`工具参数校验失败：${(validate.errors || []).slice(0, 5).map(describe).join('；')}`)
  }
}
