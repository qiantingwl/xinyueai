import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import AdmZip = require('adm-zip')
import { load as loadYaml } from 'js-yaml'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fetchWithAllowedRedirects } from '../common/allowed-redirect-fetch'
import { isEnvironmentOptInEnabled } from '../common/external-content-policy'
import { PluginsService } from './plugins.service'

export type ExternalMarketSource = 'skillsmp' | 'lobehub' | 'cocoloop' | 'skillhub'
export type ExternalSkillCategory = '开发编程' | '办公效率' | '研究分析' | '内容创作' | '设计创意' | '营销运营' | 'Agent 自动化' | '通用技能'
export type ExternalLicenseStatus = 'unverified' | 'restricted'

export type ExternalSkill = {
  id: string
  source: ExternalMarketSource
  sourceName: string
  name: string
  description: string
  author: string
  version: string
  sourceUrl: string
  githubUrl?: string
  downloadUrl?: string
  skillUrl?: string
  installable: boolean
  risk: 'unreviewed' | 'reviewed'
  stars?: number
  installs?: number
  updatedAt?: string
  category?: ExternalSkillCategory
  installed?: boolean
  licenseStatus?: ExternalLicenseStatus
  licenseNote?: string
}

type SkillsMpRow = {
  id?: unknown
  name?: unknown
  author?: unknown
  description?: unknown
  githubUrl?: unknown
  stars?: unknown
  updatedAt?: unknown
  branch?: unknown
  path?: unknown
}

const SOURCES: Array<{ id: ExternalMarketSource; name: string; homepage: string; description: string; licenseStatus: ExternalLicenseStatus; licenseNote: string }> = [
  { id: 'lobehub', name: 'LobeHub', homepage: 'https://lobehub.com/zh/skills', description: '面向 Agent 的 Skills 市场，提供 SKILL.md 技能目录。', licenseStatus: 'restricted', licenseNote: '来源采用社区许可并可能包含商业限制，安装前必须核验具体技能及其上游许可证。' },
  { id: 'skillhub', name: 'SkillHub', homepage: 'https://www.skillhub.cn/skills', description: '腾讯 SkillHub 社区，提供 Skills 与插件目录及 SKILL.md 接口。', licenseStatus: 'unverified', licenseNote: '市场条目的许可证未统一确认，安装和商用前必须逐项核验。' },
  { id: 'skillsmp', name: 'SkillsMP', homepage: 'https://skillsmp.com/zh/occupations', description: '大规模 Skills 索引，结果通常指向公开 GitHub 仓库。', licenseStatus: 'unverified', licenseNote: '索引不代表获得授权，安装和商用前必须核验目标仓库许可证。' },
  { id: 'cocoloop', name: 'CocoLoop', homepage: 'https://hub.cocoloop.cn/', description: '带安全评级与 ZIP 下载的 Skills 商店。', licenseStatus: 'unverified', licenseNote: '安全评级不等于许可证审核，安装和商用前必须核验具体条款。' },
]

// Directory metadata is untrusted. Keep each marketplace's visible source
// links on the provider's own domains (or its documented GitHub mirror).
const SOURCE_HOSTS: Record<ExternalMarketSource, ReadonlySet<string>> = {
  skillsmp: new Set(['skillsmp.com', 'www.skillsmp.com', 'github.com']),
  lobehub: new Set(['lobehub.com', 'www.lobehub.com', 'github.com']),
  cocoloop: new Set(['hub.cocoloop.cn', 'dl.cocoloop.cn']),
  skillhub: new Set(['skillhub.cn', 'www.skillhub.cn', 'api.skillhub.cn']),
}

const EXTERNAL_MARKET_DISABLED_NOTICE = '外部技能市场已关闭。部署管理员可通过 EXTERNAL_SKILL_MARKET_ENABLED=true 重新启用。'

const REMOTE_HOSTS = new Set(['skillsmp.com', 'www.skillsmp.com', 'lobehub.com', 'www.lobehub.com', 'hub.cocoloop.cn', 'dl.cocoloop.cn', 'skillhub.cn', 'www.skillhub.cn', 'api.skillhub.cn', 'github.com', 'raw.githubusercontent.com'])
const RISK_PATTERN = /(?:<script|javascript:|data:text\/html|child_process|eval\s*\()/i
const COMMAND_PATTERN = /(?:^|\r?\n)\s*(?:powershell|cmd(?:\.exe)?|\/bin\/sh|curl\s|wget\s|npm\s+(?:i|install)|pnpm\s+(?:add|install)|yarn\s+(?:add|install)|pip\s+install|rm\s+-rf|chmod\s+\+x|base64\s+-d)\b/im
const CATALOG_LIMIT = 2_000
const DEFAULT_RESULT_LIMIT = 96
const DIRECTORY_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000
const DIRECTORY_PAGE_COUNT = 20
const DIRECTORY_SCHEMA_VERSION = 2
const COMMUNITY_DISCOVERY_QUERIES = ['', 'agent', 'writing', 'development', 'office', 'design', 'research', 'marketing']
const SKILL_CATEGORIES: ExternalSkillCategory[] = ['开发编程', '办公效率', '研究分析', '内容创作', '设计创意', '营销运营', 'Agent 自动化', '通用技能']

type ExternalSkillDirectory = { version: number; updatedAt: string; items: ExternalSkill[] }

@Injectable()
export class ExternalMarketService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ExternalMarketService.name)
  private readonly directoryPath = process.env.EXTERNAL_SKILL_DIRECTORY_PATH?.trim() || resolve(process.cwd(), 'storage', 'external-skill-directory.json')
  private directory: ExternalSkill[] = []
  private directoryUpdatedAt = 0
  private syncPromise: Promise<void> | null = null
  private syncTimer?: NodeJS.Timeout

  constructor(private readonly plugins: PluginsService) {}

  private get enabled() {
    return isEnvironmentOptInEnabled('EXTERNAL_SKILL_MARKET_ENABLED')
  }

  async onModuleInit() {
    if (!this.enabled) {
      this.logger.log('外部技能市场未启用；不会读取缓存、联网同步或启动定时任务')
      return
    }
    await this.loadDirectory()
    if (!this.directory.length) await this.syncDirectory().catch((error) => this.logger.warn(`社区技能目录首次同步失败：${error instanceof Error ? error.message : String(error)}`))
    else if (this.directoryOutdated()) void this.syncDirectory()
    this.syncTimer = setInterval(() => void this.syncDirectory(), DIRECTORY_REFRESH_INTERVAL_MS)
    this.syncTimer.unref()
  }

  onModuleDestroy() {
    if (this.syncTimer) clearInterval(this.syncTimer)
  }

  categories() {
    return SKILL_CATEGORIES
  }

  async search(userId: string, query = '', category = '', limit = DEFAULT_RESULT_LIMIT, offset = 0) {
    const normalized = query.trim().slice(0, 100)
    if (!this.enabled) {
      return { enabled: false, notice: EXTERNAL_MARKET_DISABLED_NOTICE, query: normalized, categories: SKILL_CATEGORIES, sources: SOURCES, items: [], total: 0, indexedAt: null }
    }
    const selectedCategory = SKILL_CATEGORIES.includes(category as ExternalSkillCategory) ? category as ExternalSkillCategory : undefined
    const safeLimit = Math.max(1, Math.min(limit, 100))
    const safeOffset = Math.max(0, Math.min(offset, CATALOG_LIMIT))
    if (!this.directory.length) await this.syncDirectory().catch(() => undefined)
    const matches = this.directory.filter((item) => (!selectedCategory || item.category === selectedCategory) && this.matches(item, normalized))
    const selectedCategories = selectedCategory ? [selectedCategory] : SKILL_CATEGORIES
    const installedKeys = await this.plugins.externalInstallationKeys(userId)
    const items = this.balanceItems(matches, selectedCategories, safeOffset + safeLimit).slice(safeOffset).map((item) => ({
      ...item,
      installed: installedKeys.has(`${item.source}:${item.id}`),
    }))
    return { enabled: true, notice: '外部条目来自第三方市场，安全扫描不代表许可证审核；安装和商用前请逐项核验。', query: normalized, categories: SKILL_CATEGORIES, sources: SOURCES, items, total: matches.length, indexedAt: this.directoryUpdatedAt ? new Date(this.directoryUpdatedAt).toISOString() : null }
  }

  private async loadDirectory() {
    try {
      const parsed = JSON.parse(await readFile(this.directoryPath, 'utf8')) as ExternalSkillDirectory
      if (!parsed || parsed.version !== DIRECTORY_SCHEMA_VERSION || !Array.isArray(parsed.items)) return
      this.directory = this.mergeItems(parsed.items.filter((item) => this.validDirectoryItem(item))).slice(0, CATALOG_LIMIT)
      this.directoryUpdatedAt = Date.parse(parsed.updatedAt) || 0
    } catch { /* A missing or invalid directory is rebuilt during service startup. */ }
  }

  private async saveDirectory() {
    try {
      await mkdir(dirname(this.directoryPath), { recursive: true })
      const payload: ExternalSkillDirectory = { version: DIRECTORY_SCHEMA_VERSION, updatedAt: new Date(this.directoryUpdatedAt || Date.now()).toISOString(), items: this.directory }
      await writeFile(this.directoryPath, JSON.stringify(payload), 'utf8')
    } catch (error) {
      this.logger.warn(`社区技能目录写入失败：${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private directoryOutdated() {
    return !this.directoryUpdatedAt || Date.now() - this.directoryUpdatedAt > DIRECTORY_REFRESH_INTERVAL_MS
  }

  private async syncDirectory() {
    if (!this.enabled) return
    if (this.syncPromise) return this.syncPromise
    this.syncPromise = (async () => {
      const pages = Array.from({ length: DIRECTORY_PAGE_COUNT }, (_, index) => index + 1)
      const tasks: Array<Promise<ExternalSkill[]>> = [
        ...pages.map((page) => this.searchSkillsMp('', 50, page)),
        ...pages.map((page) => this.searchSkillHub('', 50, page)),
        ...COMMUNITY_DISCOVERY_QUERIES.map((query) => this.searchLobeHub(query, 30)),
        ...COMMUNITY_DISCOVERY_QUERIES.map((query) => this.searchCocoLoop(query, 30)),
      ]
      const settled = await Promise.allSettled(tasks)
      const discovered = settled.flatMap((result) => result.status === 'fulfilled' ? result.value : [])
      if (!discovered.length) throw new Error('所有外部技能市场暂时不可用')
      const merged = this.mergeItems([...discovered, ...this.directory])
      this.directory = this.balanceBuckets(SOURCES.map((source) => merged.filter((item) => item.source === source.id)), CATALOG_LIMIT)
      this.directoryUpdatedAt = Date.now()
      await this.saveDirectory()
      this.logger.log(`社区技能目录已同步，共 ${this.directory.length} 项`)
    })().finally(() => { this.syncPromise = null })
    return this.syncPromise
  }

  private balanceItems(items: ExternalSkill[], categories: ExternalSkillCategory[], limit: number) {
    return this.balanceBuckets(categories.map((category) => items.filter((item) => item.category === category)), limit)
  }

  private balanceBuckets(buckets: ExternalSkill[][], limit: number) {
    const result: ExternalSkill[] = []
    const seen = new Set<string>()
    for (let index = 0; result.length < limit && buckets.some((bucket) => index < bucket.length); index += 1) {
      for (const bucket of buckets) {
        const item = bucket[index]
        if (!item) continue
        const key = `${item.source}:${item.id}`
        if (seen.has(key)) continue
        seen.add(key)
        result.push(item)
        if (result.length >= limit) break
      }
    }
    return result
  }

  private mergeItems(items: ExternalSkill[]) {
    const result: ExternalSkill[] = []
    const seen = new Set<string>()
    for (const item of items) {
      if (!this.validDirectoryItem(item)) continue
      const key = `${item.source}:${item.id}`
      if (seen.has(key)) continue
      seen.add(key)
      result.push({
        ...item,
        sourceUrl: this.canonicalSourceUrl(item.sourceUrl, item.source),
        ...this.licenseMetadata(item.source),
        category: this.skillCategory(item),
      })
    }
    return result
  }

  private matches(item: ExternalSkill, query: string) {
    if (!query) return true
    const normalized = query.toLocaleLowerCase()
    return [item.name, item.description, item.author, item.sourceName].some((value) => value.toLocaleLowerCase().includes(normalized))
  }

  private validDirectoryItem(item: unknown): item is ExternalSkill {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return false
    const row = item as Partial<ExternalSkill>
    return typeof row.id === 'string' && Boolean(row.id) && typeof row.name === 'string' && typeof row.sourceUrl === 'string' && SOURCES.some((source) => source.id === row.source)
  }

  private skillCategory(item: ExternalSkill): ExternalSkillCategory {
    const value = `${item.name} ${item.description}`.toLocaleLowerCase()
    if (/(?:code|coding|developer|development|github|git\b|react|vue|typescript|javascript|python|debug|testing|database|api\b|开发|编程|代码|调试|测试|数据库)/i.test(value)) return '开发编程'
    if (/(?:figma|image|video|visual|design|designer|ui\b|ux\b|canvas|slide|presentation|ppt|图像|图片|视频|视觉|设计|演示)/i.test(value)) return '设计创意'
    if (/(?:research|search|analysis|analytics|data\b|academic|paper|science|investigation|研究|搜索|分析|数据|论文|调研)/i.test(value)) return '研究分析'
    if (/(?:office|excel|spreadsheet|sheet|document|docx|word|pdf|calendar|email|meeting|notion|办公|表格|文档|日历|邮件|会议)/i.test(value)) return '办公效率'
    if (/(?:marketing|seo|sales|social|commerce|brand|campaign|growth|营销|运营|销售|电商|品牌|增长)/i.test(value)) return '营销运营'
    if (/(?:writing|writer|copywriting|content|blog|translate|translation|language|文案|写作|内容|博客|翻译|语言)/i.test(value)) return '内容创作'
    if (/(?:agent|automation|workflow|mcp\b|skill|tool|assistant|自动化|工作流|智能体|助手|技能|工具)/i.test(value)) return 'Agent 自动化'
    return '通用技能'
  }

  private skillCapabilities(item: ExternalSkill) {
    const value = `${item.name} ${item.description} ${item.category || ''}`.toLocaleLowerCase()
    if (/(?:office|excel|spreadsheet|document|docx|word|pdf|calendar|email|meeting|notion|办公|表格|文档|日历|邮件|会议)/i.test(value)) return ['OFFICE']
    if (/(?:video|movie|animation|短视频|视频|动画)/i.test(value)) return ['VIDEO']
    if (/(?:image|photo|illustration|visual|figma|canvas|图片|图像|摄影|插画|视觉|设计)/i.test(value)) return ['IMAGE']
    if (/(?:commerce|商品|电商|营销|运营|销售|seo|brand|campaign)/i.test(value)) return ['COMMERCE']
    return ['CHAT']
  }

  async install(userId: string, input: { source: ExternalMarketSource; id: string; sourceUrl?: string; githubUrl?: string; downloadUrl?: string; skillUrl?: string }) {
    if (!this.enabled) throw new BadRequestException(EXTERNAL_MARKET_DISABLED_NOTICE)
    const existing = await this.plugins.findImported(userId, input.source, input.id)
    if (existing) return { ...existing, installed: true, alreadyInstalled: true }
    try {
      // Search results already contain the canonical download URL. Reusing the
      // local directory avoids repeating every external marketplace request.
      const localItem = this.directory.find((item) => item.source === input.source && item.id === input.id)
      let item: ExternalSkill = { ...(localItem || await this.resolve(input)), ...this.licenseMetadata(input.source) }
      // Directory entries from page-based marketplaces need one detail-page
      // lookup to discover their actual file endpoint; API/GitHub entries stay
      // fully local and do not incur another marketplace search.
      if (localItem?.source === 'lobehub' && localItem.skillUrl && !localItem.downloadUrl && !localItem.githubUrl) item = await this.lobeDetail(this.canonicalSourceUrl(localItem.skillUrl, localItem.source), localItem.id)
      if (localItem?.source === 'cocoloop' && localItem.sourceUrl && !localItem.downloadUrl) item = await this.cocoloopDetail(this.canonicalSourceUrl(localItem.sourceUrl, localItem.source), localItem.id)
      item = {
        ...item,
        sourceUrl: this.canonicalSourceUrl(item.sourceUrl, item.source),
        ...this.licenseMetadata(item.source),
      }
      if (!item.installable && !item.githubUrl && !item.downloadUrl) throw new BadRequestException('该技能没有可验证的 SKILL.md 或技能包地址，请先打开来源页确认')
      const { fileName, bytes } = await this.downloadSkill(item)
      const normalized = this.normalizeSkill(fileName, bytes, item)
      const scanned = this.scanArchive(normalized.fileName, normalized.bytes)
      const plugin = await this.plugins.importPrivate(userId, scanned.fileName, scanned.bytes)
      const config = plugin.config && typeof plugin.config === 'object' && !Array.isArray(plugin.config) ? plugin.config as Record<string, unknown> : {}
      const updated = await this.plugins.updateImportedMetadata(userId, plugin.id, {
        ...config,
        externalSource: item.source,
        externalSourceName: item.sourceName,
        externalId: item.id,
        externalUrl: item.sourceUrl,
        externalGithubUrl: item.githubUrl || null,
        externalVersion: item.version,
        externalRisk: item.risk,
        externalLicenseStatus: item.licenseStatus,
        externalLicenseNote: item.licenseNote,
        externalCategory: item.category || this.skillCategory(item),
        // Marketplace entries are classified from their directory metadata.
        // Do not copy a legacy "all capabilities" frontmatter declaration.
        externalCapabilities: this.skillCapabilities(item),
        externalExecutionMode: 'instruction-only',
        externalScriptsOmitted: scanned.omittedScripts,
      })
      const warning = scanned.omittedScripts.length ? `已安装；技能包中的 ${scanned.omittedScripts.length} 个脚本未启用` : ''
      return { ...updated, installed: true, external: { ...item, installed: true }, warning, omittedScripts: scanned.omittedScripts }
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof NotFoundException) throw error
      this.logger.error(`外部技能安装失败（${input.source}:${input.id}）：${error instanceof Error ? error.message : String(error)}`)
      throw new BadRequestException('外部技能安装失败，来源暂时无法访问或技能格式不兼容，请稍后重试')
    }
  }

  private async resolve(input: { source: ExternalMarketSource; id: string; sourceUrl?: string; githubUrl?: string; downloadUrl?: string; skillUrl?: string }): Promise<ExternalSkill> {
    const source = SOURCES.find((item) => item.id === input.source)
    if (!source) throw new NotFoundException('外部市场来源不存在')
    if (input.source === 'skillsmp') {
      const result = await this.searchSkillsMp(input.id, 5)
      const found = result.find((item) => item.id === input.id) || result.find((item) => item.githubUrl === input.githubUrl)
      if (found) return found
    }
    if (input.source === 'skillhub') {
      const result = await this.searchSkillHub(input.id, 10)
      const found = result.find((item) => item.id === input.id || item.skillUrl === input.skillUrl)
      if (found) return found
    }
    const sourceUrl = input.sourceUrl ? this.canonicalSourceUrl(input.sourceUrl, input.source) : source.homepage
    const skillUrl = input.skillUrl ? this.canonicalSourceUrl(input.skillUrl, input.source) : undefined
    if (input.source === 'lobehub' && skillUrl) return this.lobeDetail(skillUrl, input.id)
    if (input.source === 'cocoloop' && input.sourceUrl) return this.cocoloopDetail(sourceUrl, input.id)
    const fallback = { id: input.id, source: input.source, sourceName: source.name, name: input.id, description: '', author: '', version: '1.0.0', sourceUrl, githubUrl: input.githubUrl, downloadUrl: input.downloadUrl, skillUrl, installable: Boolean(input.githubUrl || input.downloadUrl), risk: 'unreviewed' as const }
    return fallback
  }

  private licenseMetadata(sourceId: ExternalMarketSource) {
    const source = SOURCES.find((item) => item.id === sourceId)
    return {
      licenseStatus: (source?.licenseStatus || 'unverified') as ExternalLicenseStatus,
      licenseNote: source?.licenseNote || '外部内容许可证未确认，安装和商用前必须核验。',
    }
  }

  private async searchSkillsMp(query: string, limit: number, page = 1): Promise<ExternalSkill[]> {
    const url = `https://skillsmp.com/api/skills?search=${encodeURIComponent(query)}&page=${Math.max(1, page)}&limit=${Math.min(limit, 50)}`
    const payload = await this.json(url) as { skills?: SkillsMpRow[] }
    return (Array.isArray(payload.skills) ? payload.skills : []).map((row) => {
      const githubUrl = this.text(row.githubUrl)
      const id = this.text(row.id) || githubUrl || this.text(row.name)
      return { id, source: 'skillsmp' as const, sourceName: 'SkillsMP', name: this.text(row.name) || id, description: this.text(row.description), author: this.text(row.author), version: '1.0.0', sourceUrl: githubUrl || `https://skillsmp.com/skills/${encodeURIComponent(id)}`, githubUrl, skillUrl: githubUrl, installable: Boolean(githubUrl), risk: 'unreviewed' as const, stars: this.number(row.stars), updatedAt: this.date(row.updatedAt), downloadUrl: githubUrl ? this.githubRaw(githubUrl) : undefined }
    }).filter((item) => item.id)
  }

  private async searchLobeHub(query: string, limit: number): Promise<ExternalSkill[]> {
    const html = await this.textResponse(`https://lobehub.com/zh/skills?search=${encodeURIComponent(query)}`)
    const match = html.match(/<script[^>]*id=["']structured-data["'][^>]*>([\s\S]*?)<\/script>/i)
    if (!match) return []
    let graph: unknown
    try { graph = JSON.parse(match[1]) } catch { return [] }
    const list = Array.isArray((graph as { '@graph'?: unknown[] })?.['@graph']) ? (graph as { '@graph': unknown[] })['@graph'].find((item) => (item as Record<string, unknown>)?.['@type'] === 'ItemList') as { itemListElement?: unknown[] } : undefined
    return (Array.isArray(list?.itemListElement) ? list.itemListElement : []).slice(0, limit).flatMap((entry) => {
      const item = (entry as { item?: Record<string, unknown> }).item
      if (!item) return []
      const skillUrl = this.text(item.url)
      const id = skillUrl.split('/').pop() || this.text(item.name)
      return [{ id, source: 'lobehub' as const, sourceName: 'LobeHub', name: this.text(item.name) || id, description: this.text(item.description), author: '', version: '1.0.0', sourceUrl: skillUrl, skillUrl, installable: true, risk: 'unreviewed' as const } satisfies ExternalSkill]
    })
  }

  private async searchSkillHub(query: string, limit: number, page = 1): Promise<ExternalSkill[]> {
    const url = `https://api.skillhub.cn/api/skills?page=${Math.max(1, page)}&pageSize=${Math.min(limit, 50)}&sortBy=stars&order=desc&keyword=${encodeURIComponent(query)}`
    const payload = await this.json(url) as { data?: { skills?: Array<Record<string, unknown>> } }
    const rows = Array.isArray(payload.data?.skills) ? payload.data.skills : []
    return rows.flatMap((row) => {
      const slug = this.text(row.slug)
      if (!slug) return []
      const namespace = row.namespace && typeof row.namespace === 'object' ? row.namespace as Record<string, unknown> : undefined
      const skillUrl = `https://api.skillhub.cn/api/v1/skills/${encodeURIComponent(slug)}/file?path=SKILL.md`
      return [{ id: slug, source: 'skillhub' as const, sourceName: 'SkillHub', name: this.text(row.name) || slug, description: this.text(row.description_zh) || this.text(row.description), author: this.text(row.ownerName) || this.text(namespace?.displayName), version: this.text(row.version) || '1.0.0', sourceUrl: this.text(row.homepage) || `https://www.skillhub.cn/skills/${encodeURIComponent(slug)}`, skillUrl, downloadUrl: skillUrl, installable: true, risk: 'unreviewed' as const, stars: this.number(row.stars), installs: this.number(row.installs), updatedAt: this.date(row.updated_at) } satisfies ExternalSkill]
    })
  }

  private async searchCocoLoop(query: string, limit: number): Promise<ExternalSkill[]> {
    const html = await this.textResponse(`https://hub.cocoloop.cn/skills?search=${encodeURIComponent(query)}`)
    const results: ExternalSkill[] = []
    const seen = new Set<string>()
    const pattern = /href=["'](\/skills\/\d+)["'][^>]*>([\s\S]*?)<\/a>/gi
    let match: RegExpExecArray | null
    while ((match = pattern.exec(html)) && results.length < limit) {
      const sourceUrl = `https://hub.cocoloop.cn${match[1]}`
      if (seen.has(sourceUrl)) continue
      seen.add(sourceUrl)
      const text = match[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      results.push({ id: match[1].split('/').pop() || sourceUrl, source: 'cocoloop', sourceName: 'CocoLoop', name: text.slice(0, 100) || 'CocoLoop Skill', description: text.slice(100, 500), author: '', version: '1.0.0', sourceUrl, skillUrl: sourceUrl, installable: true, risk: 'unreviewed' })
    }
    return results
  }

  private async lobeDetail(skillUrl: string, id: string) {
    const canonicalUrl = this.canonicalSourceUrl(skillUrl, 'lobehub')
    const item = { id, source: 'lobehub' as const, sourceName: 'LobeHub', name: id, description: '', author: '', version: '1.0.0', sourceUrl: canonicalUrl, skillUrl: `${canonicalUrl.replace(/\/$/, '')}/skill.md`, installable: true, risk: 'unreviewed' as const }
    let github: string | undefined
    try {
      const html = await this.textResponse(canonicalUrl)
      github = html.match(/https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\/tree\/[^"'\\ ]+)?/i)?.[0]
    } catch { /* The direct /skill.md endpoint remains the canonical install source. */ }
    return { ...item, githubUrl: github, downloadUrl: github ? this.githubRaw(github) : undefined, installable: true } satisfies ExternalSkill
  }

  private async cocoloopDetail(sourceUrl: string, id: string) {
    const canonicalUrl = this.canonicalSourceUrl(sourceUrl, 'cocoloop')
    const html = await this.textResponse(canonicalUrl)
    const downloadUrl = html.match(/https:\/\/dl\.cocoloop\.cn\/[^"'\\ ]+\.zip/i)?.[0]
    return { id, source: 'cocoloop' as const, sourceName: 'CocoLoop', name: id, description: '', author: '', version: '1.0.0', sourceUrl: canonicalUrl, skillUrl: canonicalUrl, downloadUrl, installable: Boolean(downloadUrl), risk: 'unreviewed' as const } satisfies ExternalSkill
  }

  private async downloadSkill(item: ExternalSkill) {
    const url = item.downloadUrl || (item.githubUrl ? this.githubRaw(item.githubUrl) : '') || item.skillUrl || ''
    if (!url) throw new BadRequestException('外部技能没有下载地址')
    const { response, url: resolvedUrl } = await this.fetchAllowed(
      url,
      { signal: AbortSignal.timeout(12_000), headers: { accept: 'text/plain, application/zip, application/octet-stream' } },
      '外部技能下载超时或来源暂时无法访问，请稍后重试',
    )
    if (!response.ok) throw new BadRequestException(`外部技能下载失败（HTTP ${response.status}）`)
    const bytes = Buffer.from(await response.arrayBuffer())
    if (!bytes.length || bytes.length > 5 * 1024 * 1024) throw new BadRequestException('外部技能包大小必须在 5MB 以内')
    const isZip = /\.zip(?:$|\?)/i.test(resolvedUrl.pathname)
    return { fileName: isZip ? `${item.name || item.id}.zip` : 'SKILL.md', bytes }
  }

  private normalizeSkill(fileName: string, bytes: Buffer, item: ExternalSkill) {
    if (/\.zip$/i.test(fileName)) return { fileName, bytes }
    const markdown = bytes.toString('utf8')
    if (/^---\s*\r?\n/.test(markdown)) return { fileName: 'SKILL.md', bytes }
    const name = item.name.replace(/[\r\n:]/g, ' ').trim().slice(0, 80) || item.id
    const description = item.description.replace(/[\r\n:]/g, ' ').trim().slice(0, 500)
    const capabilities = this.skillCapabilities(item)
    const frontmatter = `---\nname: ${JSON.stringify(name)}\ndescription: ${JSON.stringify(description)}\nversion: ${JSON.stringify(item.version || '1.0.0')}\ncapabilities: [${capabilities.join(', ')}]\n---\n`
    return { fileName: 'SKILL.md', bytes: Buffer.from(`${frontmatter}${markdown}`, 'utf8') }
  }

  private scanArchive(fileName: string, bytes: Buffer) {
    if (!/\.zip$/i.test(fileName)) {
      const markdown = bytes.toString('utf8')
      if (RISK_PATTERN.test(markdown) || COMMAND_PATTERN.test(markdown)) throw new BadRequestException('外部技能包含脚本、命令或远程执行内容，已拦截')
      this.validateMarkdown(markdown)
      return { fileName: 'SKILL.md', bytes: Buffer.from(markdown, 'utf8'), omittedScripts: [] as string[] }
    }
    let archive: AdmZip
    try { archive = new AdmZip(bytes) } catch { throw new BadRequestException('外部技能 ZIP 无法解析') }
    const entries = archive.getEntries()
    if (!entries.length || entries.length > 100) throw new BadRequestException('外部技能包文件数量无效')
    let expandedSize = 0
    const omittedScripts: string[] = []
    for (const entry of entries) {
      const name = entry.entryName.replaceAll('\\', '/')
      if (name.startsWith('/') || name.split('/').includes('..')) throw new BadRequestException('外部技能包包含不安全路径')
      if (/\.(?:exe|dll|so|dylib|msi|apk|jar|com|scr)$/i.test(name)) throw new BadRequestException('外部技能包包含二进制可执行文件，已拦截')
      if (!entry.isDirectory && /\.(?:bat|cmd|ps1|sh|bash|zsh|fish|py|pyw|js|jsx|ts|tsx|mjs|cjs|rb|php|pl|lua)$/i.test(name)) omittedScripts.push(name.slice(0, 240))
      expandedSize += entry.header.size
      if (expandedSize > 10 * 1024 * 1024) throw new BadRequestException('外部技能包解压后大小超过限制')
    }
    const skill = entries.find((entry) => /(^|\/)SKILL\.md$/i.test(entry.entryName) && !entry.isDirectory)
    if (!skill) throw new BadRequestException('外部技能包中缺少 SKILL.md')
    const markdown = skill.getData().toString('utf8')
    if (RISK_PATTERN.test(markdown) || COMMAND_PATTERN.test(markdown)) throw new BadRequestException('外部技能说明包含脚本、命令或远程执行内容，已拦截')
    this.validateMarkdown(markdown)
    return { fileName: 'SKILL.md', bytes: Buffer.from(markdown, 'utf8'), omittedScripts }
  }

  private validateMarkdown(markdown: string) {
    if (markdown.length > 100_000) throw new BadRequestException('SKILL.md 内容过大')
    const match = markdown.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?([\s\S]*)$/)
    if (!match) throw new BadRequestException('SKILL.md 顶部必须包含 YAML 元数据')
    try { loadYaml(match[1]) } catch { throw new BadRequestException('SKILL.md YAML 元数据格式错误') }
    if (!match[2].trim()) throw new BadRequestException('SKILL.md 缺少技能执行说明')
  }

  private githubRaw(url: string) {
    const match = url.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)(?:\/tree\/([^/]+)\/(.*))?/i)
    if (!match) return undefined
    const owner = match[1]; const repo = match[2].replace(/\.git$/, ''); const branch = match[3] || 'main'; const path = match[4] ? `${match[4].replace(/\/$/, '')}/SKILL.md` : 'SKILL.md'
    return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`
  }

  private canonicalSourceUrl(value: string, sourceId: ExternalMarketSource) {
    const source = SOURCES.find((item) => item.id === sourceId)
    if (!source) return value
    try {
      const url = new URL(value)
      const hosts = SOURCE_HOSTS[sourceId]
      if (url.protocol === 'https:' && !url.username && !url.password && (!url.port || url.port === '443') && hosts.has(url.hostname.toLowerCase())) return url.toString()
    } catch {
      // Invalid upstream metadata falls back to the canonical marketplace page.
    }
    return source.homepage
  }

  private fetchAllowed(value: string, init: RequestInit, unavailableMessage: string) {
    return fetchWithAllowedRedirects(value, init, {
      allowedHosts: REMOTE_HOSTS,
      maxRedirects: 3,
      messages: {
        invalidUrl: '外部技能地址无效',
        disallowedHost: '外部技能来源不在允许列表',
        invalidLocation: '外部市场重定向地址无效',
        tooManyRedirects: '外部市场重定向次数超过限制',
      },
      createError: (message) => new BadRequestException(message),
      wrapFetchError: (error) => {
        if (error instanceof BadRequestException) throw error
        throw new BadRequestException(unavailableMessage)
      },
    })
  }

  private async textResponse(value: string) {
    const { response } = await this.fetchAllowed(
      value,
      { signal: AbortSignal.timeout(12_000), headers: { accept: 'text/html, application/xhtml+xml' } },
      '外部市场请求超时或暂时无法访问，请稍后重试',
    )
    if (!response.ok) throw new BadRequestException(`外部市场请求失败（HTTP ${response.status}）`)
    return response.text()
  }

  private async json(value: string) {
    const { response } = await this.fetchAllowed(
      value,
      { signal: AbortSignal.timeout(12_000), headers: { accept: 'application/json' } },
      '外部市场请求超时或暂时无法访问，请稍后重试',
    )
    if (!response.ok) throw new BadRequestException(`外部市场请求失败（HTTP ${response.status}）`)
    return response.json()
  }

  private text(value: unknown) { return typeof value === 'string' ? value.trim() : value == null ? '' : String(value) }
  private number(value: unknown) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : undefined }
  private date(value: unknown) { if (!value) return undefined; const numeric = typeof value === 'number' ? value : Number(value); const parsed = Number.isFinite(numeric) ? new Date(numeric > 1_000_000_000_000 ? numeric : numeric * 1000) : new Date(String(value)); return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString() }
}
