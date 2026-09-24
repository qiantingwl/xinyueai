import { Prisma, PrismaClient } from '@prisma/client'

export const defaultAssistantPresets = [
  {
    id: 'xinyue_assistant_general',
    name: '通用工作助手',
    description: '处理日常问答、总结、改写、翻译和方案梳理，适合作为默认助手。',
    systemPrompt: '你是可靠的通用工作助手。先识别用户真正要完成的任务，再给出准确、清晰、可直接使用的结果。区分事实、推断和建议；信息不足时明确说明，不编造来源、数字或承诺。优先使用简洁标题、清单和表格组织复杂内容。',
    templateIds: ['prompt-rewrite', 'prompt-structured-summary', 'prompt-accurate-translation'],
    toolIds: ['xinyue_tool_project_context', 'xinyue_tool_file_catalog', 'xinyue_tool_search', 'xinyue_tool_current_time'],
    sortOrder: 1,
  },
  {
    id: 'xinyue_assistant_commerce',
    name: '商品视觉策划',
    description: '将商品信息拆解为可执行的主图、详情页和投放素材方案。',
    systemPrompt: '你是商品视觉策划助手。先澄清商品、用户、渠道和转化目标，再输出视觉定位、镜头清单、文案层级、生成提示词与验收标准。不要虚构产品参数、材质或卖点；资料不足时列出待确认项，再给可落地的备选方案。',
    templateIds: ['prompt-product-hero-image', 'prompt-product-copy', 'prompt-campaign-poster'],
    toolIds: ['xinyue_tool_file_catalog', 'xinyue_tool_search', 'xinyue_tool_project_context'],
    sortOrder: 10,
  },
  {
    id: 'xinyue_assistant_copy',
    name: '商业文案助手',
    description: '面向品牌、电商与社交媒体的结构化文案工作助手。',
    systemPrompt: '你是商业文案助手。根据品牌语调、目标受众和发布渠道产出可直接使用的文案。先给主方案，再给可测试变体；明确事实依据，不编造背书、销量和功效。需要资料时先检索已有文件和知识库，再补写作。',
    templateIds: ['prompt-product-copy', 'prompt-ad-variants', 'prompt-audience-persona'],
    toolIds: ['xinyue_tool_file_catalog', 'xinyue_tool_search', 'xinyue_tool_current_time'],
    sortOrder: 20,
  },
  {
    id: 'xinyue_assistant_support',
    name: '知识服务助手',
    description: '基于已绑定知识库回答产品、流程与服务问题。',
    systemPrompt: '你是知识服务助手。优先依据绑定知识库回答；当资料不足时明确说明缺口并提出需要补充的信息，不要猜测政策、价格或承诺。回答应简明、可执行并保留关键出处线索，便于用户核对原文。',
    templateIds: ['prompt-structured-summary', 'prompt-concept-tutor', 'prompt-accurate-translation'],
    toolIds: ['xinyue_tool_search', 'xinyue_tool_file_catalog', 'xinyue_tool_current_time'],
    sortOrder: 30,
  },
  {
    id: 'xinyue_assistant_research',
    name: '深度调研助手',
    description: '用于联网调研、竞品对比、资料核验和决策备忘录。',
    systemPrompt: '你是严谨的研究分析助手。先拆解研究问题和证据标准，再检索或整理多个独立来源。明确区分已证实事实、合理推断和未知信息；来源冲突时并列说明，不得编造引用。结论前置，并给出关键证据、风险、限制和下一步。',
    templateIds: ['prompt-option-comparison', 'prompt-decision-memo', 'prompt-paper-reading'],
    toolIds: ['xinyue_tool_project_context', 'xinyue_tool_file_catalog', 'xinyue_tool_search', 'xinyue_tool_current_time'],
    sortOrder: 40,
  },
  {
    id: 'xinyue_assistant_office',
    name: '办公写作助手',
    description: '起草邮件、周报、项目计划、会议材料和正式文档。',
    systemPrompt: '你是专业办公写作助手。先确认受众、目的、语气和交付格式，再输出可直接使用的完整成稿。保留用户提供的事实和术语，不用空泛套话补齐未知信息。涉及行动项时明确负责人、时间、依赖和验收标准。',
    templateIds: ['prompt-business-email', 'prompt-weekly-report', 'prompt-project-plan'],
    toolIds: ['xinyue_tool_project_context', 'xinyue_tool_file_catalog', 'xinyue_tool_search', 'xinyue_tool_current_time'],
    sortOrder: 50,
  },
  {
    id: 'xinyue_assistant_data',
    name: '数据分析助手',
    description: '解释表格和经营数据，梳理指标、异常、口径与行动建议。',
    systemPrompt: '你是数据分析助手。分析前先核对字段、单位、时间范围、缺失值和计算口径；展示关键计算过程，区分相关性与因果关系。优先用表格呈现指标、异常和对比，所有结论必须能追溯到输入数据。没有数据时只提供分析框架，不虚构数值。',
    templateIds: ['prompt-data-insights', 'prompt-option-comparison', 'prompt-risk-review'],
    toolIds: ['xinyue_tool_file_catalog', 'xinyue_tool_data_summary', 'xinyue_tool_current_time'],
    sortOrder: 60,
  },
  {
    id: 'xinyue_assistant_code',
    name: '代码与架构助手',
    description: '用于代码审查、故障诊断、测试设计和技术方案。',
    systemPrompt: '你是高级软件工程师。优先保证正确性、安全性、可维护性和可验证性。审查时先列可复现问题并按严重程度排序；实现时给出完整代码、边界处理和验证方式。尊重现有项目约束，不把个人风格偏好当作缺陷。',
    templateIds: ['prompt-code-review', 'prompt-debug-assistant', 'prompt-test-cases', 'prompt-api-design'],
    toolIds: ['xinyue_tool_project_context', 'xinyue_tool_file_catalog', 'xinyue_tool_current_time'],
    sortOrder: 70,
  },
  {
    id: 'xinyue_assistant_meeting',
    name: '会议纪要助手',
    description: '从会议文字或转写内容提炼决定、待办、负责人和风险。',
    systemPrompt: '你是会议纪要助手。严格依据原始内容整理议题、关键讨论、已确认决定、待确认事项和行动项。不得猜测未明确出现的负责人、截止日期或结论；缺失项标记为待确认。输出摘要、决定、行动项表格、风险和后续议题。',
    templateIds: ['prompt-meeting-summary', 'prompt-structured-summary'],
    toolIds: ['xinyue_tool_file_catalog', 'xinyue_tool_search', 'xinyue_tool_current_time'],
    sortOrder: 80,
  },
  {
    id: 'xinyue_assistant_product',
    name: '产品经理助手',
    description: '把想法梳理成需求文档、用户故事、优先级和上线计划。',
    systemPrompt: '你是资深产品经理。先澄清目标用户、使用场景、业务目标和约束，再输出需求背景、用户故事、功能优先级、交互要点、验收标准和风险。每条需求都要能被设计、开发和测试直接理解；不虚构市场数据，信息不足时列出假设和待确认问题。',
    templateIds: ['prompt-project-plan', 'prompt-audience-persona', 'prompt-option-comparison', 'prompt-risk-review'],
    toolIds: ['xinyue_tool_project_context', 'xinyue_tool_file_catalog', 'xinyue_tool_search', 'xinyue_tool_current_time'],
    sortOrder: 90,
  },
  {
    id: 'xinyue_assistant_visual',
    name: '视觉创意助手',
    description: '为海报、人像、插画和图片修改撰写可直接生成的提示词与视觉方案。',
    systemPrompt: '你是视觉创意总监。先确认用途、画幅、受众和必须保留的元素，再给出视觉方向、构图、光线、色彩、材质和风格参考，并输出可直接用于图片生成的中文提示词及 1 到 2 个变体。不改变用户明确指定的主体和品牌信息，避免堆砌互相冲突的风格词，不模仿在世艺术家或受版权保护的角色。',
    templateIds: ['prompt-campaign-poster', 'prompt-editorial-portrait', 'prompt-product-hero-image', 'prompt-image-edit'],
    toolIds: ['xinyue_tool_file_catalog', 'xinyue_tool_search', 'xinyue_tool_project_context'],
    sortOrder: 100,
  },
  {
    id: 'xinyue_assistant_tutor',
    name: '学习辅导助手',
    description: '讲解概念、制定学习计划、出练习题并陪伴阅读论文与资料。',
    systemPrompt: '你是耐心的学习教练。先判断学习者的基础和目标，再由浅入深讲解：给出直观类比、关键定义、典型例子和常见误区。制定计划时拆成可执行的阶段和检验方式；出题时附答案与解析。遇到不确定的知识点明确说明，不编造文献和数据。',
    templateIds: ['prompt-concept-tutor', 'prompt-learning-plan', 'prompt-quiz-generator', 'prompt-paper-reading'],
    toolIds: ['xinyue_tool_search', 'xinyue_tool_file_catalog', 'xinyue_tool_current_time'],
    sortOrder: 110,
  },
] as const

export const defaultToolPresets = [
  {
    id: 'xinyue_tool_project_context', key: 'project_context', name: '项目上下文',
    description: '平台内置：读取当前项目目标、说明、工作流状态、版本和文件摘要，无需第三方服务。',
    icon: 'folder-kanban', documentationUrl: '', endpoint: '', httpMethod: 'POST', timeoutMs: 15000,
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }, scopes: ['project:read'], enabled: true, requiresApproval: false,
  },
  {
    id: 'xinyue_tool_file_catalog', key: 'file_catalog', name: '文件目录',
    description: '平台内置：按名称、类型或项目检索用户已授权文件，无需第三方服务。',
    icon: 'files', documentationUrl: '', endpoint: '', httpMethod: 'POST', timeoutMs: 15000,
    inputSchema: { type: 'object', properties: { query: { type: 'string', maxLength: 300 }, kind: { type: 'string', enum: ['IMAGE', 'VIDEO', 'FILE'] }, projectId: { type: 'string', maxLength: 100 } }, additionalProperties: false }, scopes: ['asset:read'], enabled: true, requiresApproval: false,
  },
  {
    id: 'xinyue_tool_data_summary', key: 'data_summary', name: '数据汇总',
    description: '平台内置：对数字或表格行计算计数、合计、均值、中位数、最小值和最大值。',
    icon: 'table-2', documentationUrl: '', endpoint: '', httpMethod: 'POST', timeoutMs: 15000,
    inputSchema: { type: 'object', properties: { values: { type: 'array', maxItems: 20000, items: { type: ['number', 'string'] } }, rows: { type: 'array', maxItems: 5000, items: { type: 'object' } } }, anyOf: [{ required: ['values'] }, { required: ['rows'] }], additionalProperties: false }, scopes: ['data:read'], enabled: true, requiresApproval: false,
  },
  {
    id: 'xinyue_tool_current_time', key: 'current_time', name: '日期与时间',
    description: '平台内置：返回服务器当前时间和时区，无需第三方服务。',
    icon: 'clock-3', documentationUrl: '', endpoint: '', httpMethod: 'POST', timeoutMs: 5000,
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }, scopes: ['system:time'], enabled: true, requiresApproval: false,
  },
  {
    id: 'xinyue_tool_search', key: 'knowledge_search', name: '知识库检索',
    description: '平台内置：从已授权知识库检索文档片段和内部资料，无需第三方服务。',
    icon: 'search', documentationUrl: '', endpoint: '', httpMethod: 'POST', timeoutMs: 15000,
    inputSchema: { type: 'object', properties: { query: { type: 'string', minLength: 1, maxLength: 500 }, q: { type: 'string', minLength: 1, maxLength: 500 } }, anyOf: [{ required: ['query'] }, { required: ['q'] }], additionalProperties: false }, scopes: ['knowledge:read'], enabled: true, requiresApproval: false,
  },
  {
    id: 'xinyue_tool_n8n', key: 'n8n_workflow', name: 'n8n 工作流（需部署）',
    description: '接入自托管或云端 n8n Webhook。先完成 n8n 部署并创建生产 Webhook，再填写 Endpoint；如启用鉴权，请在敏感请求头中配置。',
    icon: 'workflow', documentationUrl: 'https://docs.n8n.io/hosting/installation/docker/', endpoint: '', httpMethod: 'POST', timeoutMs: 60000,
    inputSchema: { type: 'object', properties: { task: { type: 'string', description: '要交给工作流处理的任务' }, data: { type: 'object', description: '结构化业务数据' } }, required: ['task'], additionalProperties: true }, scopes: ['workflow:execute'], enabled: false, requiresApproval: true,
  },
  {
    id: 'xinyue_tool_dify', key: 'dify_workflow', name: 'Dify 工作流（需部署/配置）',
    description: '调用 Dify Workflow API。填写 /v1/workflows/run 地址，并在敏感请求头配置 Authorization: Bearer app-xxx 后再启用。',
    icon: 'workflow', documentationUrl: 'https://docs.dify.ai/en/getting-started/install-self-hosted/docker-compose', endpoint: '', httpMethod: 'POST', timeoutMs: 90000,
    inputSchema: { type: 'object', properties: { inputs: { type: 'object' }, response_mode: { type: 'string', enum: ['blocking'], default: 'blocking' }, user: { type: 'string' } }, required: ['inputs'], additionalProperties: true }, scopes: ['workflow:execute'], enabled: false, requiresApproval: true,
  },
  {
    id: 'xinyue_tool_fastgpt', key: 'fastgpt_workflow', name: 'FastGPT 应用（需部署/配置）',
    description: '调用 FastGPT 应用 API。完成部署并创建应用后，填写 API 地址并在敏感请求头配置 Bearer Key，检测成功后再启用。',
    icon: 'bot', documentationUrl: 'https://doc.fastgpt.io/docs/development/docker/', endpoint: '', httpMethod: 'POST', timeoutMs: 90000,
    inputSchema: { type: 'object', properties: { chatId: { type: 'string' }, stream: { type: 'boolean', default: false }, detail: { type: 'boolean', default: true }, messages: { type: 'array', items: { type: 'object' } } }, required: ['messages'], additionalProperties: true }, scopes: ['workflow:execute'], enabled: false, requiresApproval: true,
  },
] as const

export function assistantCreateData(preset: typeof defaultAssistantPresets[number]): Prisma.AssistantCreateInput {
  return { id: preset.id, name: preset.name, description: preset.description, systemPrompt: preset.systemPrompt, defaultModel: '', templateIds: [...preset.templateIds], enabled: true, visibility: 'PUBLIC', sortOrder: preset.sortOrder, tools: { create: preset.toolIds.map((toolId) => ({ toolId })) } }
}

export function toolCreateData(preset: typeof defaultToolPresets[number]): Prisma.ToolDefinitionCreateInput {
  return { id: preset.id, key: preset.key, name: preset.name, description: preset.description, icon: preset.icon, kind: 'BUILT_IN', authType: 'NONE', documentationUrl: preset.documentationUrl, credentialFields: [], endpoint: preset.endpoint, httpMethod: preset.httpMethod, timeoutMs: preset.timeoutMs, headers: {}, inputSchema: preset.inputSchema as Prisma.InputJsonValue, scopes: [...preset.scopes], enabled: preset.enabled, requiresApproval: preset.requiresApproval }
}

function templateIdList(value: Prisma.JsonValue | null): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : []
}

export async function ensureDefaultCapabilityPresets(prisma: PrismaClient) {
  const usableToolIds = defaultToolPresets.filter((item) => item.enabled).map((item) => item.id)
  await prisma.$transaction(async (tx) => {
    for (const preset of defaultToolPresets) {
      await tx.toolDefinition.upsert({ where: { key: preset.key }, update: {}, create: toolCreateData(preset) })
    }
    for (const preset of defaultAssistantPresets) {
      await tx.assistant.upsert({ where: { id: preset.id }, update: {}, create: assistantCreateData(preset) })
      const row = await tx.assistant.findUniqueOrThrow({ where: { id: preset.id }, select: { description: true, systemPrompt: true, templateIds: true } })
      const patch: Prisma.AssistantUpdateInput = {}
      if (!row.description.trim()) patch.description = preset.description
      if (!row.systemPrompt.trim()) patch.systemPrompt = preset.systemPrompt
      if (!templateIdList(row.templateIds).length) patch.templateIds = [...preset.templateIds]
      if (Object.keys(patch).length) await tx.assistant.update({ where: { id: preset.id }, data: patch })
      await tx.assistantTool.deleteMany({ where: { assistantId: preset.id } })
      if (preset.toolIds.length) {
        await tx.assistantTool.createMany({ data: preset.toolIds.map((toolId) => ({ assistantId: preset.id, toolId })) })
      }
    }
    await tx.assistant.updateMany({ where: { enabled: true, systemPrompt: '', description: '' }, data: { enabled: false } })
    const leftover = await tx.assistant.findMany({ where: { enabled: true, visibility: 'PUBLIC', tools: { none: {} } }, select: { id: true } })
    if (leftover.length && usableToolIds.length) {
      await tx.assistantTool.createMany({
        data: leftover.flatMap((row) => usableToolIds.map((toolId) => ({ assistantId: row.id, toolId }))),
        skipDuplicates: true,
      })
    }
  })
}
