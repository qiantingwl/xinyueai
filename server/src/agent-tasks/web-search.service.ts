import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Prisma, WebSearchChannel, WebSearchProviderType } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { CredentialCryptoService } from '../providers/credential-crypto.service'

type SearchInput = { query: string; maxResults?: number; topic?: string; includeDomains?: string[]; excludeDomains?: string[]; timeoutMs?: number }
type SearchResult = { title: string; url: string; content: string; publishedAt?: string; score?: number }
type ChannelInput = {
  name: string; type: WebSearchProviderType; endpoint?: string; apiKey?: string; enabled?: boolean; priority?: number
  timeoutMs?: number; maxResults?: number; config?: Record<string, unknown>; clearApiKey?: boolean
}
type TgmengInput = {
  license?: string
  recommendationEnabled?: boolean
  fallbackEnabled?: boolean
  rootCategories?: string[]
  recommendationLimit?: number
  cacheMinutes?: number
}

const TGMENG_ENDPOINT = 'https://trendapi.tgmeng.com/api/skill/search'
const TGMENG_CATEGORIES = ['新闻', '羊毛', '媒体', '电视', '生活', '社区', '财经', '股讯', '体育', '科技', '设计', '影音', '游戏', '健康', '教育', '期货', 'AI', '副业']

const endpoints: Record<WebSearchProviderType, string> = {
  TAVILY: 'https://api.tavily.com/search',
  SERPER: 'https://google.serper.dev/search',
  BRAVE: 'https://api.search.brave.com/res/v1/web/search',
  EXA: 'https://api.exa.ai/search',
  CUSTOM: '',
}

@Injectable()
export class WebSearchService {
  private tgmengCache: { expiresAt: number; value: Record<string, unknown> } | null = null

  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService, private readonly crypto: CredentialCryptoService) {}

  async isAvailable() {
    const channels = await this.prisma.webSearchChannel.findMany({ where: { enabled: true, endpoint: { not: '' } } })
    if (channels.some((channel) => (!this.isTgmeng(channel) || this.record(channel.config).fallbackEnabled === true) && (channel.type === WebSearchProviderType.CUSTOM || Boolean(channel.encryptedApiKey)))) return true
    const endpoint = this.config.get<string>('WEB_SEARCH_ENDPOINT') || ''
    const apiKey = this.config.get<string>('WEB_SEARCH_API_KEY') || ''
    return Boolean(endpoint && apiKey)
  }

  async search(input: SearchInput) {
    const query = input.query.trim()
    if (!query) return { query, results: [], message: '搜索词为空', sources: [] }
    const now = new Date()
    const channels = await this.prisma.webSearchChannel.findMany({
      where: { enabled: true }, orderBy: [{ priority: 'desc' }, { consecutiveFailures: 'asc' }, { createdAt: 'asc' }],
    })
    const eligible = channels.filter((channel) => (!this.isTgmeng(channel) || this.record(channel.config).fallbackEnabled === true) && (!channel.cooldownUntil || channel.cooldownUntil <= now))
    const primaryChannels = eligible.filter((channel) => !this.isTgmeng(channel))
    const fallbackChannels = eligible.filter((channel) => this.isTgmeng(channel))
    const errors: string[] = channels.length && !eligible.length ? ['已配置渠道均处于故障冷却期'] : []
    const tryChannels = async (candidates: WebSearchChannel[]) => {
      for (const channel of candidates) {
        try {
          const output = await this.execute(channel, input)
          if (!output.results.length) throw new Error('搜索服务未返回可用结果')
          await this.markSuccess(channel.id, output.results.length)
          return { ...output, query, channel: { id: channel.id, name: channel.name, type: channel.type }, fallbackCount: errors.length, sources: output.results.map(({ title, url }) => ({ title, url })) }
        } catch (reason) {
          const message = reason instanceof Error ? reason.message : '搜索失败'
          errors.push(`${channel.name}: ${message}`)
          await this.markFailure(channel.id, message)
        }
      }
      return null
    }
    const primary = await tryChannels(primaryChannels)
    if (primary) return primary
    const legacy = await this.legacy(input).catch((reason) => { errors.push(`环境变量渠道: ${reason instanceof Error ? reason.message : '搜索失败'}`); return null })
    if (legacy?.results.length) return { ...legacy, query, channel: { id: 'legacy', name: '环境变量渠道', type: 'CUSTOM' }, fallbackCount: errors.length, sources: legacy.results.map(({ title, url }) => ({ title, url })) }
    const fallback = await tryChannels(fallbackChannels)
    if (fallback) return fallback
    throw new Error(`所有联网搜索渠道均不可用${errors.length ? `：${errors.join('；')}` : '，请在管理端配置搜索渠道'}`)
  }

  list() { return this.prisma.webSearchChannel.findMany({ orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }] }).then((rows) => rows.filter((row) => !this.isTgmeng(row)).map((row) => this.publicChannel(row))) }

  async tgmengSettings() {
    const row = await this.findTgmeng()
    const config = this.record(row?.config)
    return {
      endpoint: TGMENG_ENDPOINT,
      categories: TGMENG_CATEGORIES,
      hasLicense: Boolean(row?.encryptedApiKey),
      licenseHint: row?.apiKeyHint || '',
      recommendationEnabled: config.recommendationEnabled === true,
      fallbackEnabled: config.fallbackEnabled === true,
      rootCategories: this.categories(config.rootCategories),
      recommendationLimit: Math.min(12, Math.max(3, Number(config.recommendationLimit || 6))),
      cacheMinutes: Math.min(1440, Math.max(1, Number(config.cacheMinutes || 10))),
      lastHealthStatus: row?.lastHealthStatus || null,
      lastHealthMessage: row?.lastHealthMessage || '',
      lastSuccessAt: row?.lastSuccessAt || null,
    }
  }

  async saveTgmeng(input: TgmengInput) {
    const current = await this.findTgmeng()
    const license = input.license?.trim() || ''
    if (!current && !license) throw new BadRequestException('请填写糖果梦通用密钥')
    const recommendationEnabled = input.recommendationEnabled ?? (this.record(current?.config).recommendationEnabled === true)
    const fallbackEnabled = input.fallbackEnabled ?? (this.record(current?.config).fallbackEnabled === true)
    const config = {
      integration: 'tgmeng',
      recommendationEnabled,
      fallbackEnabled,
      rootCategories: this.categories(input.rootCategories ?? this.record(current?.config).rootCategories),
      recommendationLimit: Math.min(12, Math.max(3, Number(input.recommendationLimit ?? this.record(current?.config).recommendationLimit ?? 6))),
      cacheMinutes: Math.min(1440, Math.max(1, Number(input.cacheMinutes ?? this.record(current?.config).cacheMinutes ?? 10))),
    }
    const encryptedApiKey = license ? this.crypto.encrypt(license) : current?.encryptedApiKey || ''
    const data = {
      name: '糖果梦热榜', type: WebSearchProviderType.CUSTOM, endpoint: TGMENG_ENDPOINT, encryptedApiKey,
      apiKeyHint: license ? this.crypto.hint(license) : current?.apiKeyHint || '', enabled: recommendationEnabled || fallbackEnabled,
      priority: -10000, timeoutMs: 15000, maxResults: config.recommendationLimit, config: config as Prisma.InputJsonValue,
      lastHealthStatus: null, lastHealthMessage: '', cooldownUntil: null, consecutiveFailures: 0,
    }
    if (current) await this.prisma.webSearchChannel.update({ where: { id: current.id }, data })
    else await this.prisma.webSearchChannel.create({ data })
    this.tgmengCache = null
    return this.tgmengSettings()
  }

  async checkTgmeng() {
    const row = await this.findTgmeng()
    if (!row?.encryptedApiKey) throw new BadRequestException('请先保存糖果梦通用密钥')
    const started = Date.now()
    try {
      const output = await this.executeTgmeng(row, { query: '', maxResults: 3 })
      if (!output.results.length) throw new Error('连接成功，但实时热榜没有返回内容')
      await this.markSuccess(row.id, output.results.length, `连接正常，返回 ${output.results.length} 条热榜，${Date.now() - started}ms`)
      return { healthy: true, latencyMs: Date.now() - started, resultCount: output.results.length }
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : '连接失败'
      await this.markFailure(row.id, message)
      throw new BadRequestException(message)
    }
  }

  async recommendations(force = false) {
    const row = await this.findTgmeng()
    const config = this.record(row?.config)
    if (!row?.enabled || !row.encryptedApiKey || config.recommendationEnabled !== true) return { enabled: false, items: [] }
    if (!force && this.tgmengCache && this.tgmengCache.expiresAt > Date.now()) return this.tgmengCache.value
    try {
      const limit = Math.min(12, Math.max(3, Number(config.recommendationLimit || 6)))
      const output = await this.executeTgmeng(row, { query: '', maxResults: limit, timeoutMs: 4000 })
      const items = output.results.slice(0, limit).map((item) => ({
        title: item.title,
        prompt: `请联网搜索并介绍这个热点：${item.title}`,
        targetUrl: '',
        source: item.source || '',
        category: item.rootCategory || '',
        publishedAt: item.publishedAt || '',
      }))
      const value = { enabled: true, items, updatedAt: new Date().toISOString(), stale: false }
      this.tgmengCache = { expiresAt: Date.now() + Math.min(1440, Math.max(1, Number(config.cacheMinutes || 10))) * 60_000, value }
      await this.markSuccess(row.id, items.length)
      return value
    } catch {
      if (this.tgmengCache) return { ...this.tgmengCache.value, stale: true }
      const value = { enabled: true, items: [], stale: true }
      this.tgmengCache = { expiresAt: Date.now() + 60_000, value }
      return value
    }
  }

  async create(input: ChannelInput) {
    const row = await this.prisma.webSearchChannel.create({ data: this.channelData(input) })
    return this.publicChannel(row)
  }

  async update(id: string, input: Partial<ChannelInput>) {
    const current = await this.prisma.webSearchChannel.findUnique({ where: { id } })
    if (!current) throw new NotFoundException('搜索渠道不存在')
    const encryptedApiKey = input.clearApiKey ? '' : input.apiKey ? this.crypto.encrypt(input.apiKey) : current.encryptedApiKey
    const row = await this.prisma.webSearchChannel.update({ where: { id }, data: {
      ...(input.name === undefined ? {} : { name: input.name.trim() }), ...(input.type === undefined ? {} : { type: input.type }),
      ...(input.endpoint === undefined && input.type === undefined ? {} : { endpoint: (input.endpoint ?? endpoints[input.type || current.type]).trim() }),
      ...(input.apiKey === undefined && !input.clearApiKey ? {} : { encryptedApiKey, apiKeyHint: encryptedApiKey ? this.crypto.hint(input.apiKey || this.crypto.decrypt(encryptedApiKey)) : '' }),
      ...(input.enabled === undefined ? {} : { enabled: input.enabled }), ...(input.priority === undefined ? {} : { priority: input.priority }),
      ...(input.timeoutMs === undefined ? {} : { timeoutMs: input.timeoutMs }), ...(input.maxResults === undefined ? {} : { maxResults: input.maxResults }),
      ...(input.config === undefined ? {} : { config: input.config as Prisma.InputJsonValue }),
      lastHealthStatus: null, lastHealthMessage: '', cooldownUntil: null, consecutiveFailures: 0,
    } })
    return this.publicChannel(row)
  }

  async remove(id: string) { await this.prisma.webSearchChannel.delete({ where: { id } }).catch(() => { throw new NotFoundException('搜索渠道不存在') }); return { deleted: true } }

  async check(id: string) {
    const channel = await this.prisma.webSearchChannel.findUnique({ where: { id } })
    if (!channel) throw new NotFoundException('搜索渠道不存在')
    const started = Date.now()
    try {
      const output = await this.execute(channel, { query: 'OpenAI', maxResults: 3 })
      if (!output.results.length) throw new Error('连接成功，但没有返回可用的搜索结果')
      await this.markSuccess(channel.id, output.results.length, `连接正常，返回 ${output.results.length} 条结果，${Date.now() - started}ms`)
      return { healthy: true, latencyMs: Date.now() - started, resultCount: output.results.length }
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : '连接失败'
      await this.markFailure(channel.id, message)
      throw new BadRequestException(message)
    }
  }

  async checkAll() {
    const channels = await this.prisma.webSearchChannel.findMany({ where: { enabled: true } })
    const rows = channels.filter((row) => !this.isTgmeng(row)).map(({ id, name }) => ({ id, name }))
    const results = await Promise.all(rows.map(async (row) => { try { return { id: row.id, name: row.name, ...await this.check(row.id) } } catch (reason) { return { id: row.id, name: row.name, healthy: false, error: reason instanceof Error ? reason.message : '连接失败' } } }))
    return { checked: results.length, healthy: results.filter((item) => item.healthy).length, unhealthy: results.filter((item) => !item.healthy).length, results }
  }

  private async execute(channel: WebSearchChannel, input: SearchInput) {
    if (this.isTgmeng(channel)) return this.executeTgmeng(channel, input)
    const apiKey = channel.encryptedApiKey ? this.crypto.decrypt(channel.encryptedApiKey) : ''
    if (!apiKey && channel.type !== 'CUSTOM') throw new Error('未配置 API 密钥')
    const maxResults = Math.min(20, Math.max(1, input.maxResults || channel.maxResults))
    let endpoint = channel.endpoint || endpoints[channel.type]
    if (!endpoint) throw new Error('未配置搜索地址')
    const config = this.record(channel.config)
    if (channel.type === 'BRAVE') endpoint = `${endpoint}?${new URLSearchParams({ q: input.query, count: String(maxResults), ...(input.topic === 'news' ? { freshness: 'pm' } : {}) })}`
    if (channel.type === 'CUSTOM' && String(config.method || 'POST').toUpperCase() === 'GET') {
      const url = new URL(endpoint)
      url.searchParams.set(String(config.queryParam || 'query'), input.query)
      url.searchParams.set(String(config.maxResultsParam || 'max_results'), String(maxResults))
      endpoint = url.toString()
    }
    const init = this.request(channel.type, apiKey, input, maxResults, config)
    const response = await fetch(endpoint, { ...init, signal: AbortSignal.timeout(Math.min(60_000, Math.max(1000, channel.timeoutMs))) })
    const text = await response.text()
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 300)}`)
    let payload: Record<string, unknown>
    try { payload = JSON.parse(text) as Record<string, unknown> } catch { throw new Error('搜索服务返回的不是有效 JSON') }
    return this.normalize(channel.type, payload, maxResults, config)
  }

  private async executeTgmeng(channel: WebSearchChannel, input: SearchInput) {
    const license = channel.encryptedApiKey ? this.crypto.decrypt(channel.encryptedApiKey) : ''
    if (!license) throw new Error('未配置糖果梦通用密钥')
    const config = this.record(channel.config)
    const query = input.query.trim()
    const maxResults = Math.min(20, Math.max(1, input.maxResults || channel.maxResults))
    let response: Response
    try {
      response = await fetch(TGMENG_ENDPOINT, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(Math.min(60_000, Math.max(1000, input.timeoutMs ?? channel.timeoutMs))),
        body: JSON.stringify({ license, keywords: query ? [query] : [], mode: 'REALTIME', rootCategories: query ? [] : this.categories(config.rootCategories), limit: maxResults, offset: 0, distinct: true }),
      })
    } catch (reason) {
      throw new Error(`无法连接糖果梦接口：${this.networkError(reason)}`)
    }
    const text = await response.text()
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 300)}`)
    let payload: Record<string, unknown>
    try { payload = JSON.parse(text) as Record<string, unknown> } catch { throw new Error('糖果梦返回的不是有效 JSON') }
    if (Number(payload.code) !== 200) throw new Error(String(payload.message || '糖果梦业务请求失败').slice(0, 300))
    const data = this.record(payload.data as Prisma.JsonValue)
    const raw = Array.isArray(data.items) ? data.items : []
    const results = raw.slice(0, maxResults).map((item) => {
      const row = this.record(item as Prisma.JsonValue)
      const source = String(row.source || '')
      const category = String(row.category || '')
      const rootCategory = String(row.rootCategory || '')
      return {
        title: String(row.title || '').trim(), url: this.normalizeWebUrl(String(row.url || '')),
        content: [source ? `来源：${source}` : '', rootCategory || category ? `分类：${rootCategory || category}` : '', Number.isFinite(Number(row.rank)) ? `榜单排名：${Number(row.rank)}` : ''].filter(Boolean).join('；'),
        publishedAt: row.publishedAt ? String(row.publishedAt) : undefined, source, category, rootCategory,
      }
    }).filter((item) => Boolean(item.title) && (!query || Boolean(item.url)))
    return { results }
  }

  private request(type: WebSearchProviderType, apiKey: string, input: SearchInput, maxResults: number, config: Record<string, unknown>): RequestInit {
    if (type === 'BRAVE') {
      return { method: 'GET', headers: { Accept: 'application/json', 'X-Subscription-Token': apiKey } }
    }
    if (type === 'SERPER') return { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-KEY': apiKey }, body: JSON.stringify({ q: input.query, num: maxResults, ...(input.topic === 'news' ? { type: 'news' } : {}), ...config }) }
    if (type === 'EXA') return { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey }, body: JSON.stringify({ query: input.query, numResults: maxResults, contents: { text: { maxCharacters: 3000 } }, includeDomains: input.includeDomains, excludeDomains: input.excludeDomains, ...config }) }
    if (type === 'CUSTOM') {
      const method = String(config.method || 'POST').toUpperCase()
      const headers = { 'Content-Type': 'application/json', ...(this.record(config.headers as Prisma.JsonValue) || {}), ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) }
      return { method, headers, ...(method === 'GET' ? {} : { body: JSON.stringify({ query: input.query, max_results: maxResults, ...config.body as object }) }) }
    }
    return { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: input.query, max_results: maxResults, search_depth: config.searchDepth || 'advanced', include_answer: true, include_domains: input.includeDomains, exclude_domains: input.excludeDomains, api_key: apiKey }) }
  }

  private normalize(type: WebSearchProviderType, payload: Record<string, unknown>, maxResults: number, config: Record<string, unknown>) {
    const answerValue = type === 'CUSTOM' && typeof config.answerPath === 'string' ? this.atPath(payload, config.answerPath) : payload.answer
    const answer = typeof answerValue === 'string' ? answerValue : undefined
    const raw = type === 'CUSTOM' && typeof config.resultPath === 'string' ? this.atPath(payload, config.resultPath)
      : type === 'SERPER' ? (Array.isArray(payload.organic) ? payload.organic : Array.isArray(payload.news) ? payload.news : [])
      : type === 'BRAVE' ? ((payload.web as Record<string, unknown> | undefined)?.results || [])
      : Array.isArray(payload.results) ? payload.results : Array.isArray(payload.data) ? payload.data : []
    const results = (Array.isArray(raw) ? raw : []).slice(0, maxResults).map<SearchResult>((item) => {
      const row = item && typeof item === 'object' ? item as Record<string, unknown> : {}
      const custom = type === 'CUSTOM'
      const title = custom && typeof config.titleField === 'string' ? this.atPath(row, config.titleField) : row.title ?? row.name
      const url = custom && typeof config.urlField === 'string' ? this.atPath(row, config.urlField) : row.url ?? row.link
      const text = custom && typeof config.contentField === 'string' ? this.atPath(row, config.contentField) : row.content ?? row.text ?? row.snippet ?? row.description ?? ((row.contents as Record<string, unknown> | undefined)?.text)
      const published = custom && typeof config.publishedAtField === 'string' ? this.atPath(row, config.publishedAtField) : row.publishedDate ?? row.published_at ?? row.age
      return { title: String(title || url || ''), url: this.normalizeWebUrl(String(url || '')), content: String(text || '').slice(0, 3000), publishedAt: published ? String(published) : undefined, score: typeof row.score === 'number' ? row.score : undefined }
    }).filter((item) => Boolean(item.url))
    return { answer, results }
  }

  private async legacy(input: SearchInput) {
    const endpoint = this.config.get<string>('WEB_SEARCH_ENDPOINT') || ''
    const apiKey = this.config.get<string>('WEB_SEARCH_API_KEY') || ''
    if (!endpoint || !apiKey) return null
    const channel = { id: 'legacy', name: '环境变量渠道', type: WebSearchProviderType.TAVILY, endpoint, encryptedApiKey: this.crypto.encrypt(apiKey), apiKeyHint: '', enabled: true, priority: -999, timeoutMs: 30000, maxResults: 8, config: null, lastHealthStatus: null, lastHealthMessage: '', lastHealthAt: null, lastSuccessAt: null, lastFailureAt: null, consecutiveFailures: 0, cooldownUntil: null, totalRequests: 0, totalFailures: 0, createdAt: new Date(), updatedAt: new Date() } satisfies WebSearchChannel
    return this.execute(channel, input)
  }

  private markSuccess(id: string, count: number, message?: string) { return this.prisma.webSearchChannel.updateMany({ where: { id }, data: { totalRequests: { increment: 1 }, consecutiveFailures: 0, cooldownUntil: null, lastSuccessAt: new Date(), lastHealthAt: new Date(), lastHealthStatus: 'healthy', lastHealthMessage: message || `最近调用成功，返回 ${count} 条结果` } }) }
  private async markFailure(id: string, message: string) { const channel = await this.prisma.webSearchChannel.findUnique({ where: { id }, select: { consecutiveFailures: true } }); if (!channel) return; const failures = channel.consecutiveFailures + 1; return this.prisma.webSearchChannel.update({ where: { id }, data: { totalRequests: { increment: 1 }, totalFailures: { increment: 1 }, consecutiveFailures: failures, lastFailureAt: new Date(), lastHealthAt: new Date(), lastHealthStatus: 'unhealthy', lastHealthMessage: message.slice(0, 500), cooldownUntil: new Date(Date.now() + Math.min(300, 15 * 2 ** Math.min(4, failures - 1)) * 1000) } }) }
  private channelData(input: ChannelInput): Prisma.WebSearchChannelCreateInput { const apiKey = input.apiKey?.trim() || ''; const endpoint = (input.endpoint || endpoints[input.type]).trim(); if (!endpoint) throw new BadRequestException('请填写搜索地址'); return { name: input.name.trim(), type: input.type, endpoint, encryptedApiKey: apiKey ? this.crypto.encrypt(apiKey) : '', apiKeyHint: apiKey ? this.crypto.hint(apiKey) : '', enabled: input.enabled ?? false, priority: input.priority ?? 0, timeoutMs: input.timeoutMs ?? 30000, maxResults: input.maxResults ?? 8, config: (input.config || {}) as Prisma.InputJsonValue } }
  private publicChannel<T extends WebSearchChannel>(row: T) { return { ...row, encryptedApiKey: undefined, hasApiKey: Boolean(row.encryptedApiKey) } }
  private findTgmeng() { return this.prisma.webSearchChannel.findMany({ where: { type: WebSearchProviderType.CUSTOM } }).then((rows) => rows.find((row) => this.isTgmeng(row)) || null) }
  private isTgmeng(channel: Pick<WebSearchChannel, 'config'>) { return this.record(channel.config).integration === 'tgmeng' }
  private categories(value: unknown) { return Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === 'string' && TGMENG_CATEGORIES.includes(item)))].slice(0, TGMENG_CATEGORIES.length) : [] }
  private record(value: Prisma.JsonValue | null | undefined): Record<string, any> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {} }
  private atPath(value: unknown, path: string): unknown {
    return path.split('.').filter(Boolean).reduce<unknown>((current, key) => current && typeof current === 'object' ? (current as Record<string, unknown>)[key] : undefined, value)
  }
  private normalizeWebUrl(value: string) {
    try {
      const url = new URL(value)
      if (!['http:', 'https:'].includes(url.protocol)) return ''
      url.username = ''
      url.password = ''
      return url.toString()
    } catch { return '' }
  }
  private networkError(reason: unknown) {
    const error = reason instanceof Error ? reason : null
    const cause = error?.cause && typeof error.cause === 'object' ? error.cause as { code?: string; message?: string } : null
    const code = cause?.code || ''
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError' || code === 'ETIMEDOUT' || code === 'UND_ERR_CONNECT_TIMEOUT') return '连接超时，请检查部署服务器的 DNS、出口网络或代理设置'
    if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return 'DNS 解析失败，请检查部署服务器的 DNS 设置'
    if (code === 'ECONNRESET') return '连接被对方或出口网络重置'
    if (code === 'ECONNREFUSED') return '目标服务器拒绝连接'
    return [cause?.message, error?.message].find((message) => message && message !== 'fetch failed') || '网络请求失败'
  }
}
