import { BadRequestException, ForbiddenException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { ModelCapability, Prisma, ProviderAuthType, ProviderType, SystemSetting } from '@prisma/client'
import { isIP } from 'node:net'
import { PrismaService } from '../prisma/prisma.service'
import { CredentialCryptoService } from './credential-crypto.service'

type ProviderInput = {
  name: string
  type: ProviderType
  baseUrl: string
  apiKey?: string
  authType?: ProviderAuthType
  enabled?: boolean
  priority?: number
  weight?: number
  timeoutMs?: number
  allowUserKeys?: boolean
  customHeaders?: Record<string, string>
  metadata?: Record<string, unknown>
}

type CredentialInput = {
  name: string
  providerType: ProviderType
  baseUrl: string
  apiKey?: string
  authType?: ProviderAuthType
  enabled?: boolean
  isDefault?: boolean
  customHeaders?: Record<string, string>
}

type SystemSettingsInput = Partial<{
  siteName: string
  siteLogoUrl: string
  supportUrl: string
  sidebarCreationEnabled: boolean
  sidebarCommerceEnabled: boolean
  sidebarOfficeEnabled: boolean
  sidebarPromptsEnabled: boolean
  sidebarPluginsEnabled: boolean
  sidebarProjectsEnabled: boolean
  sidebarAssetsEnabled: boolean
  registrationEnabled: boolean
  emailLoginEnabled: boolean
  emailVerifyEnabled: boolean
  passwordLoginEnabled: boolean
  passwordRegistrationEnabled: boolean
  linuxDoLoginEnabled: boolean
  linuxDoClientId: string
  linuxDoClientSecret: string
  linuxDoRedirectUrl: string
  linuxDoScopes: string
  linuxDoAuthorizeUrl: string
  linuxDoTokenUrl: string
  linuxDoUserInfoUrl: string
  allowedEmailDomains: string[]
  otpTtlMinutes: number
  otpResendSeconds: number
  defaultUserCredits: number
  defaultTheme: string
  defaultLanguage: string
  chatUiPreset: string
  chatHomeContent: Record<string, unknown>
  defaultChatModelKey: string
  defaultImageModelKey: string
  userByokEnabled: boolean
  inviteRewardCredits: number
  rechargeEnabled: boolean
  minRechargeCents: number
  currency: string
  creditValueMicros: number
  subscriptionsEnabled: boolean
  trialEnabled: boolean
  defaultTrialPlanId: string
  trialCredits: number
  defaultUserGroupId: string
  temporaryChatRetentionHours: number
  defaultChatHistoryEnabled: boolean
  defaultTrainingOptOut: boolean
  defaultShareUsageAnalytics: boolean
  smtpEnabled: boolean
  smtpHost: string
  smtpPort: number
  smtpSecure: boolean
  smtpUsername: string
  smtpPassword: string
  smtpFromName: string
  smtpFromEmail: string
}>

export type ResolvedProvider = {
  source: 'user' | 'admin' | 'environment' | 'demo'
  providerId?: string
  credentialId?: string
  routeId?: string
  label?: string
  type: ProviderType
  baseUrl: string
  apiKey: string
  authType: ProviderAuthType
  headers: Record<string, string>
  timeoutMs: number
  model: string
  presetKey?: string
  creditCost: number
  creditValueMicros: number
  inputCostMicrosPerMillion: number
  outputCostMicrosPerMillion: number
  imageCostMicros: number
  videoCostMicros: number
  inputCreditsPerMillion: number
  outputCreditsPerMillion: number
  imageCapabilities?: Record<string, unknown>
  videoCapabilities?: Record<string, unknown>
  creditRatePercent: number
  apiProtocol: 'openai' | 'anthropic' | 'gemini'
}

type ResolvedPreset = {
  preset: Prisma.ModelPresetGetPayload<{ include: { provider: true; providerRoutes: { include: { provider: true } } } }> | null
  model: string
  creditCost: number
  policy: Awaited<ReturnType<ProvidersService['userPolicy']>>
  settings: SystemSetting | null
}

type VideoCapabilities = {
  resolutions: string[]
  durations: number[]
  aspectRatios: string[]
}

type VideoCapabilityRoute = {
  options: Prisma.JsonValue | null
  provider: { type: ProviderType; enabled: boolean; encryptedApiKey: string }
}

const DEFAULT_CHAT_HOME_CONTENT = {
  doubaoRecommendations: [
    { title: '热点：北语教授刘宗迪称《山海经》并非怪物图鉴', prompt: '请介绍这个热点，并说明相关观点和背景。', targetUrl: '' },
    { title: '语言模型的训练数据如何影响 AI 回答的准确性和多样性？', prompt: '语言模型的训练数据如何影响 AI 回答的准确性和多样性？', targetUrl: '' },
    { title: '长期喝全糖饮品对身体有哪些影响？', prompt: '长期喝全糖饮品对身体有哪些影响？', targetUrl: '' },
    { title: '有哪些训练方法能让猫听懂指令？', prompt: '有哪些训练方法能让猫听懂指令？', targetUrl: '' },
  ],
  qianwenBanners: [
    { title: 'Xinyue 办公助理上线', description: '解锁本地任务能力，多格式交付', buttonText: '立即体验', imageUrl: '', targetUrl: '/office' },
    { title: 'Xinyue 输入法 App 全新上线', description: '说话即成稿，支持多种语言', buttonText: '立即下载体验', imageUrl: '', targetUrl: '/office' },
    { title: '一键生成录音纪要', description: '纪要自动整理，重要内容清晰呈现', buttonText: '立即体验', imageUrl: '', targetUrl: '/office' },
  ],
  kimiProject: { label: '选择项目', targetUrl: '/projects' },
}

const DEFAULT_PRESETS = [
  { key: 'gpt-5.5', displayName: 'gpt-5.5', upstreamModel: 'gpt-5.5', capability: ModelCapability.CHAT, sortOrder: 10, isDefault: true },
  { key: 'gpt-5.6-sol', displayName: 'gpt-5.6-sol', upstreamModel: 'gpt-5.6-sol', capability: ModelCapability.CHAT, sortOrder: 20 },
  { key: 'gpt-5.6-terra', displayName: 'gpt-5.6-terra', upstreamModel: 'gpt-5.6-terra', capability: ModelCapability.CHAT, sortOrder: 30 },
  { key: 'gpt-5.6-luna', displayName: 'gpt-5.6-luna', upstreamModel: 'gpt-5.6-luna', capability: ModelCapability.CHAT, sortOrder: 40 },
  { key: 'grok-4.5', displayName: 'grok-4.5', upstreamModel: 'grok-4.5', capability: ModelCapability.CHAT, sortOrder: 50 },
  { key: 'claude-sonnet', displayName: 'Claude Sonnet', upstreamModel: 'claude-sonnet-4-5', capability: ModelCapability.CHAT, sortOrder: 60, description: '支持 Anthropic Messages 或 OpenAI Compatible 渠道' },
  { key: 'gemini-pro', displayName: 'Gemini Pro', upstreamModel: 'gemini-2.5-pro', capability: ModelCapability.CHAT, sortOrder: 70, description: '支持 Gemini GenerateContent 或 OpenAI Compatible 渠道' },
  { key: 'deepseek-chat', displayName: 'DeepSeek', upstreamModel: 'deepseek-chat', capability: ModelCapability.CHAT, sortOrder: 80 },
  { key: 'qwen-max', displayName: 'Qwen Max', upstreamModel: 'qwen-max', capability: ModelCapability.CHAT, sortOrder: 90 },
  {
    key: 'pollinations-free',
    displayName: 'Pollinations',
    upstreamModel: 'flux',
    capability: ModelCapability.IMAGE,
    sortOrder: 5,
    enabled: false,
    flatCreditCost: 0,
    imageCostMicros: 0,
    description: '可选的无密钥图片生成渠道，启用前请确认服务条款与可用性',
    options: {
      imageCapabilities: {
        sizes: ['1024x1024', '1280x720', '720x1280', '1536x1024', '1024x1536'],
        qualities: ['medium'],
        outputFormats: ['jpeg'],
        backgrounds: ['opaque'],
        maxCount: 1,
        defaultSize: '1024x1024',
        defaultQuality: 'medium',
        supportsReference: false,
        supportsMask: false,
        resolutionPricing: { '1K': 0 },
      },
    },
  },
  { key: 'gpt-image-2', displayName: 'GPT Image 2', upstreamModel: 'gpt-image-2', capability: ModelCapability.IMAGE, sortOrder: 10, isDefault: true },
  { key: 'grok-imagine', displayName: 'Grok Imagine', upstreamModel: 'grok-imagine-image', capability: ModelCapability.IMAGE, sortOrder: 20 },
  { key: 'nano-banana-pro', displayName: 'Nano Banana Pro', upstreamModel: 'nano-banana-pro', capability: ModelCapability.IMAGE, sortOrder: 30 },
  { key: 'flux-pro', displayName: 'FLUX Pro', upstreamModel: 'flux-pro', capability: ModelCapability.IMAGE, sortOrder: 40 },
  { key: 'seedream', displayName: 'Seedream', upstreamModel: 'seedream-4.5', capability: ModelCapability.IMAGE, sortOrder: 50 },
  {
    key: 'sora-2',
    displayName: 'Grok Imagine Video',
    upstreamModel: 'grok-imagine-video',
    capability: ModelCapability.VIDEO,
    sortOrder: 10,
    isDefault: true,
    flatCreditCost: 10,
    description: 'Grok 视频生成',
    options: {
      videoCapabilities: {
        resolutions: ['480p', '720p'],
        durations: [5, 10],
        aspectRatios: ['16:9', '9:16', '1:1'],
        defaultResolution: '720p',
        defaultDuration: 5,
        defaultAspectRatio: '16:9',
        pricing: { '480p:5': 5, '480p:10': 10, '720p:5': 10, '720p:10': 20 },
        createPath: '/videos',
        statusPath: '/videos/{id}',
        contentPath: '/videos/{id}/content',
        pollIntervalMs: 3000,
        maxPollSeconds: 600,
      },
    },
  },
  { key: 'commerce-gpt-image-2', displayName: 'GPT Image 2', upstreamModel: 'gpt-image-2', capability: ModelCapability.COMMERCE, sortOrder: 10, isDefault: true },
]

@Injectable()
export class ProvidersService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService, private readonly crypto: CredentialCryptoService, private readonly config: ConfigService) {}

  async onModuleInit() {
    await this.prisma.systemSetting.upsert({ where: { id: 'global' }, update: {}, create: { id: 'global' } })
    await this.prisma.modelPreset.createMany({ data: DEFAULT_PRESETS, skipDuplicates: true })
  }

  normalizeBaseUrl(input: string, type?: ProviderType) {
    let url: URL
    try { url = new URL(input.trim()) } catch { throw new BadRequestException('API 地址格式不正确') }
    if (!['http:', 'https:'].includes(url.protocol)) throw new BadRequestException('API 地址只支持 HTTP 或 HTTPS')
    url.search = ''
    url.hash = ''
    url.pathname = url.pathname.replace(/\/(chat\/completions|responses|images\/generations|videos(?:\/[^/]+(?:\/content)?)?|models)\/?$/i, '').replace(/\/+$/, '')
    const pollinations = type === ProviderType.POLLINATIONS || url.hostname.toLowerCase().endsWith('pollinations.ai')
    if (pollinations) url.pathname = url.pathname.replace(/\/v1$/i, '') || '/'
    else if (!url.pathname.toLowerCase().endsWith('/v1')) url.pathname = `${url.pathname}/v1`.replace(/\/{2,}/g, '/')
    return url.toString().replace(/\/$/, '')
  }

  private providerReady(provider: { type: ProviderType; encryptedApiKey: string }) {
    return provider.type === ProviderType.POLLINATIONS || Boolean(provider.encryptedApiKey)
  }

  buildPollinationsImageUrl(baseUrl: string, prompt: string, options: { model: string; width: number; height: number; seed: number }) {
    const url = new URL(this.normalizeBaseUrl(baseUrl, ProviderType.POLLINATIONS))
    const basePath = url.pathname.replace(/\/+$/, '')
    url.pathname = `${basePath}/prompt/${encodeURIComponent(prompt)}`.replace(/\/{2,}/g, '/')
    url.searchParams.set('model', options.model || 'flux')
    url.searchParams.set('width', String(options.width))
    url.searchParams.set('height', String(options.height))
    url.searchParams.set('seed', String(options.seed))
    url.searchParams.set('nologo', 'true')
    url.searchParams.set('enhance', 'false')
    return url
  }

  assertUserProviderUrl(input: string) {
    const normalized = this.normalizeBaseUrl(input)
    const url = new URL(normalized)
    const host = url.hostname.toLowerCase()
    const privateHost = host === 'localhost' || host.endsWith('.local') || host === '0.0.0.0' || host === '::1' || /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    if (privateHost || (isIP(host) && url.protocol !== 'https:')) throw new BadRequestException('用户 API 地址不能指向本机或内网')
    return normalized
  }

  private headers(value: Prisma.JsonValue | null | undefined) {
    if (!value || Array.isArray(value) || typeof value !== 'object') return {}
    const result: Record<string, string> = {}
    for (const [key, item] of Object.entries(value)) {
      if (typeof item === 'string' && !['authorization', 'x-api-key', 'x-goog-api-key', 'host'].includes(key.toLowerCase())) result[key] = item
    }
    return result
  }

  private videoRouteCapabilities(value: Prisma.JsonValue | null | undefined) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
    const options = value as Record<string, unknown>
    const video = options.videoCapabilities
    return video && typeof video === 'object' && !Array.isArray(video) ? video as Record<string, unknown> : undefined
  }

  private normalizeVideoCapabilities(value: Record<string, unknown> | undefined): VideoCapabilities {
    const resolutions = Array.isArray(value?.resolutions)
      ? value.resolutions.map((item) => String(item).trim().toLowerCase()).filter((item) => {
        const match = /^(\d{3,4})p$/.exec(item)
        return Boolean(match && Number(match[1]) >= 144 && Number(match[1]) <= 4320)
      })
      : []
    const durations = Array.isArray(value?.durations)
      ? value.durations.map(Number).filter((item) => Number.isInteger(item) && item >= 1 && item <= 300)
      : []
    const aspectRatios = Array.isArray(value?.aspectRatios)
      ? value.aspectRatios.map((item) => String(item).trim()).filter((item) => /^[1-9]\d?:[1-9]\d?$/.test(item))
      : []
    return {
      resolutions: [...new Set(resolutions)],
      durations: [...new Set(durations)].sort((a, b) => a - b),
      aspectRatios: [...new Set(aspectRatios)],
    }
  }

  private effectiveVideoOptions(
    value: Prisma.JsonValue | null,
    routes: VideoCapabilityRoute[],
    fallbackProvider?: { type: ProviderType; enabled: boolean; encryptedApiKey: string } | null,
  ) {
    const options = value && typeof value === 'object' && !Array.isArray(value)
      ? structuredClone(value) as Record<string, unknown>
      : {}
    const rawGlobal = this.videoRouteCapabilities(options as Prisma.JsonObject)
    if (!rawGlobal) return options
    const global = this.normalizeVideoCapabilities(rawGlobal)
    const activeRoutes = routes.filter((route) => route.provider.enabled && this.providerReady(route.provider))
    const routeCapabilities = activeRoutes.map((route) => {
      const configured = this.videoRouteCapabilities(route.options)
      return configured ? this.normalizeVideoCapabilities(configured) : global
    })
    if (!activeRoutes.length && fallbackProvider?.enabled && this.providerReady(fallbackProvider)) routeCapabilities.push(global)
    if (!routeCapabilities.length) routeCapabilities.push(global)

    const available = routeCapabilities.reduce<VideoCapabilities>((union, route) => ({
      resolutions: [...new Set([...union.resolutions, ...route.resolutions])],
      durations: [...new Set([...union.durations, ...route.durations])].sort((a, b) => a - b),
      aspectRatios: [...new Set([...union.aspectRatios, ...route.aspectRatios])],
    }), { resolutions: [], durations: [], aspectRatios: [] })
    const intersect = <T extends string | number>(configured: T[], supported: T[]) => configured.length
      ? configured.filter((item) => supported.includes(item))
      : supported
    const resolutions = intersect(global.resolutions, available.resolutions)
    const durations = intersect(global.durations, available.durations)
    const aspectRatios = intersect(global.aspectRatios, available.aspectRatios)
    const pricing = rawGlobal.pricing && typeof rawGlobal.pricing === 'object' && !Array.isArray(rawGlobal.pricing)
      ? Object.fromEntries(Object.entries(rawGlobal.pricing).filter(([key]) => {
        const [resolution, duration] = key.split(':')
        return resolutions.includes(resolution) && durations.includes(Number(duration))
      }))
      : rawGlobal.pricing
    options.videoCapabilities = {
      ...rawGlobal,
      resolutions,
      durations,
      aspectRatios,
      defaultResolution: resolutions.includes(String(rawGlobal.defaultResolution || '').toLowerCase()) ? String(rawGlobal.defaultResolution).toLowerCase() : resolutions[0],
      defaultDuration: durations.includes(Number(rawGlobal.defaultDuration)) ? Number(rawGlobal.defaultDuration) : durations[0],
      defaultAspectRatio: aspectRatios.includes(String(rawGlobal.defaultAspectRatio || '')) ? String(rawGlobal.defaultAspectRatio) : aspectRatios[0],
      pricing,
    }
    return options
  }

  private normalizeRouteOptions(value: Record<string, unknown> | null | undefined, capability: ModelCapability, enabled: boolean, index: number) {
    if (capability !== ModelCapability.VIDEO) return value || undefined
    const options = value && typeof value === 'object' && !Array.isArray(value) ? structuredClone(value) : {}
    const normalized = this.normalizeVideoCapabilities(this.videoRouteCapabilities(options as Prisma.JsonObject))
    if (enabled && (!normalized.resolutions.length || !normalized.durations.length || !normalized.aspectRatios.length)) {
      throw new BadRequestException(`第 ${index + 1} 个视频渠道必须完整配置分辨率、时长和画面比例`)
    }
    return { ...options, videoCapabilities: normalized }
  }

  private routeSupportsVideo(value: Prisma.JsonValue | null | undefined, requirements: Record<string, unknown>) {
    const capabilities = this.videoRouteCapabilities(value)
    if (!capabilities) return true
    const supports = (key: 'resolutions' | 'durations' | 'aspectRatios', requested: unknown, normalize: (item: unknown) => string | number) => {
      if (requested === undefined || requested === null || requested === '') return true
      const configured = Array.isArray(capabilities[key]) ? capabilities[key].map(normalize) : []
      return !configured.length || configured.includes(normalize(requested))
    }
    return supports('resolutions', requirements.resolution, (item) => String(item).trim().toLowerCase())
      && supports('durations', requirements.duration, Number)
      && supports('aspectRatios', requirements.aspectRatio, (item) => String(item).trim())
  }

  private routeVideoCapabilities(value: Prisma.JsonValue | null | undefined, fallback: Record<string, unknown> | undefined) {
    const override = this.videoRouteCapabilities(value)
    return override ? { ...(fallback || {}), ...override } : fallback
  }

  publicProvider<T extends { encryptedApiKey: string }>(provider: T) {
    const { encryptedApiKey, ...safe } = provider
    return { ...safe, hasApiKey: Boolean(encryptedApiKey) }
  }

  publicCredential<T extends { encryptedApiKey: string }>(credential: T) {
    const { encryptedApiKey, ...safe } = credential
    return { ...safe, hasApiKey: Boolean(encryptedApiKey) }
  }

  listProviders() {
    return this.prisma.providerChannel.findMany({ orderBy: [{ enabled: 'desc' }, { priority: 'desc' }, { createdAt: 'asc' }], include: { _count: { select: { modelPresets: true, modelRoutes: true } } } }).then((rows) => rows.map((row) => this.publicProvider(row)))
  }

  async createProvider(input: ProviderInput) {
    const row = await this.prisma.providerChannel.create({ data: {
      name: input.name.trim(), type: input.type, baseUrl: this.normalizeBaseUrl(input.baseUrl, input.type), encryptedApiKey: this.crypto.encrypt(input.apiKey || ''), apiKeyHint: this.crypto.hint(input.apiKey || ''), authType: input.authType, enabled: input.enabled, priority: input.priority, weight: input.weight, timeoutMs: input.timeoutMs, allowUserKeys: input.type === ProviderType.POLLINATIONS ? false : input.allowUserKeys, customHeaders: input.customHeaders as Prisma.InputJsonValue, metadata: input.metadata as Prisma.InputJsonValue,
    } })
    return this.publicProvider(row)
  }

  async updateProvider(id: string, input: Partial<ProviderInput>) {
    const existing = await this.prisma.providerChannel.findUnique({ where: { id } })
    if (!existing) throw new NotFoundException('上游渠道不存在')
    const nextType = input.type ?? existing.type
    const row = await this.prisma.providerChannel.update({ where: { id }, data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.type !== undefined ? { type: input.type } : {}),
      ...(input.baseUrl !== undefined || input.type !== undefined ? { baseUrl: this.normalizeBaseUrl(input.baseUrl ?? existing.baseUrl, nextType) } : {}),
      ...(input.apiKey ? { encryptedApiKey: this.crypto.encrypt(input.apiKey), apiKeyHint: this.crypto.hint(input.apiKey) } : {}),
      ...(input.apiKey === '' ? { encryptedApiKey: '', apiKeyHint: '' } : {}),
      ...(input.authType !== undefined ? { authType: input.authType } : {}),
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
      ...(input.weight !== undefined ? { weight: input.weight } : {}),
      ...(input.timeoutMs !== undefined ? { timeoutMs: input.timeoutMs } : {}),
      ...(nextType === ProviderType.POLLINATIONS ? { allowUserKeys: false } : input.allowUserKeys !== undefined ? { allowUserKeys: input.allowUserKeys } : {}),
      ...(input.customHeaders !== undefined ? { customHeaders: input.customHeaders as Prisma.InputJsonValue } : {}),
      ...(input.metadata !== undefined ? { metadata: input.metadata as Prisma.InputJsonValue } : {}),
    } })
    return this.publicProvider(row)
  }

  async deleteProvider(id: string) {
    await this.prisma.providerChannel.delete({ where: { id } }).catch(() => { throw new NotFoundException('上游渠道不存在') })
    return { success: true }
  }

  private applyAuth(headers: Record<string, string>, authType: ProviderAuthType, apiKey: string) {
    if (!apiKey) return headers
    if (authType === ProviderAuthType.BEARER || authType === ProviderAuthType.BOTH) headers.Authorization = `Bearer ${apiKey}`
    if (authType === ProviderAuthType.X_API_KEY || authType === ProviderAuthType.BOTH) headers['x-api-key'] = apiKey
    return headers
  }

  private hasSupportedImageSignature(bytes: Uint8Array) {
    const ascii = (start: number, end: number) => Buffer.from(bytes.subarray(start, end)).toString('ascii')
    return (bytes.length >= 8 && bytes[0] === 0x89 && ascii(1, 4) === 'PNG')
      || (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8)
      || (bytes.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP')
      || (bytes.length >= 6 && ['GIF87a', 'GIF89a'].includes(ascii(0, 6)))
  }

  async fetchRemoteModels(id: string) {
    const provider = await this.prisma.providerChannel.findUnique({ where: { id } })
    if (!provider) throw new NotFoundException('上游渠道不存在')
    const apiKey = this.crypto.decrypt(provider.encryptedApiKey)
    if (!apiKey && provider.type !== ProviderType.POLLINATIONS) throw new BadRequestException('请先配置渠道 API 密钥')
    const startedAt = Date.now()
    try {
      if (provider.type === ProviderType.POLLINATIONS) {
        const url = this.buildPollinationsImageUrl(provider.baseUrl, 'minimal blue circle on white background', { model: 'flux', width: 64, height: 64, seed: 1 })
        const response = await fetch(url, { headers: this.headers(provider.customHeaders), signal: AbortSignal.timeout(Math.min(provider.timeoutMs, 30_000)) })
        const contentType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() || ''
        const declaredSize = Number(response.headers.get('content-length') || 0)
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`)
        if (!contentType.startsWith('image/')) throw new Error(`渠道返回了非图片内容：${contentType || '未知类型'}`)
        if (declaredSize > 5 * 1024 * 1024) throw new Error('渠道健康检查返回的图片超过 5 MB')
        const bytes = new Uint8Array(await response.arrayBuffer())
        if (bytes.length < 64 || bytes.length > 5 * 1024 * 1024 || !this.hasSupportedImageSignature(bytes)) throw new Error('渠道返回的图片数据无效')
        const models = ['flux']
        await this.prisma.providerChannel.update({ where: { id }, data: { lastHealthStatus: 'healthy', lastHealthMessage: `图片接口正常，${Date.now() - startedAt}ms`, lastHealthAt: new Date() } })
        return { models, latencyMs: Date.now() - startedAt }
      }
      const response = await fetch(`${provider.baseUrl}/models`, { headers: this.applyAuth(this.headers(provider.customHeaders), provider.authType, apiKey), signal: AbortSignal.timeout(Math.min(provider.timeoutMs, 30_000)) })
      const raw = await response.text()
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${raw.slice(0, 300)}`)
      const parsed = JSON.parse(raw) as { data?: Array<string | { id?: string }> }
      const models = (parsed.data || []).map((item) => typeof item === 'string' ? item : item.id).filter((item): item is string => Boolean(item)).sort()
      await this.prisma.providerChannel.update({ where: { id }, data: { lastHealthStatus: 'healthy', lastHealthMessage: `发现 ${models.length} 个模型，${Date.now() - startedAt}ms`, lastHealthAt: new Date() } })
      return { models, latencyMs: Date.now() - startedAt }
    } catch (error) {
      const message = error instanceof Error ? error.message : '连接失败'
      await this.prisma.providerChannel.update({ where: { id }, data: { lastHealthStatus: 'unhealthy', lastHealthMessage: message, lastHealthAt: new Date() } })
      throw new BadRequestException(message)
    }
  }

  async checkAllProviders() {
    const providers = await this.prisma.providerChannel.findMany({ where: { enabled: true }, select: { id: true, name: true } })
    const results = await Promise.all(providers.map(async (provider) => {
      try {
        const result = await this.fetchRemoteModels(provider.id)
        return { id: provider.id, name: provider.name, healthy: true, latencyMs: result.latencyMs, modelCount: result.models.length, error: '' }
      } catch (reason) {
        return { id: provider.id, name: provider.name, healthy: false, latencyMs: null, modelCount: 0, error: reason instanceof Error ? reason.message : '连接失败' }
      }
    }))
    return { checked: results.length, healthy: results.filter((item) => item.healthy).length, unhealthy: results.filter((item) => !item.healthy).length, results }
  }

  async resetProviderHealth(id: string) {
    const result = await this.prisma.providerChannel.updateMany({ where: { id }, data: { consecutiveFailures: 0, cooldownUntil: null, lastHealthStatus: null, lastHealthMessage: '管理员已清除故障状态，等待下次检测' } })
    if (!result.count) throw new NotFoundException('上游渠道不存在')
    return { reset: true }
  }

  async listModels(capability?: ModelCapability, includeDisabled = false) {
    if (includeDisabled) {
      return this.prisma.modelPreset.findMany({ where: { ...(capability ? { capability } : {}) }, orderBy: [{ capability: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }], include: { provider: { select: { id: true, name: true, type: true, enabled: true } }, providerRoutes: { orderBy: { createdAt: 'asc' }, include: { provider: { select: { id: true, name: true, type: true, enabled: true, priority: true, weight: true, cooldownUntil: true } } } } } })
    }
    const models = await this.prisma.modelPreset.findMany({ where: { enabled: true, ...(capability ? { capability } : {}) }, orderBy: [{ capability: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }], include: { provider: { select: { id: true, name: true, type: true, enabled: true, encryptedApiKey: true } }, providerRoutes: { where: { enabled: true }, orderBy: { createdAt: 'asc' }, include: { provider: { select: { id: true, name: true, type: true, enabled: true, priority: true, weight: true, cooldownUntil: true, encryptedApiKey: true } } } } } })
    return models.map(({ provider, providerRoutes, ...model }) => ({
      ...model,
      options: model.capability === ModelCapability.VIDEO ? this.effectiveVideoOptions(model.options, providerRoutes, provider) : model.options,
      provider: provider ? this.publicProvider(provider) : null,
      providerRoutes: providerRoutes.map(({ provider: routeProvider, ...route }) => ({ ...route, provider: this.publicProvider(routeProvider) })),
    }))
  }

  async userPolicy(userId: string) {
    const [memberships, subscription] = await Promise.all([
      this.prisma.userGroupMember.findMany({ where: { userId, group: { enabled: true } }, include: { group: { include: { modelAccess: { select: { modelPresetId: true, flatCreditCostOverride: true } } } } } }),
      this.prisma.userSubscription.findFirst({ where: { userId, status: { in: ['ACTIVE', 'TRIALING'] }, OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { gt: new Date() } }] }, orderBy: { createdAt: 'desc' }, include: { plan: true } }),
    ])
    const groups = memberships.map((item) => item.group)
    const restricted = groups.filter((group) => group.restrictModels)
    return {
      allowUserByok: groups.every((group) => group.allowUserByok) && (subscription?.plan.allowByok ?? true),
      creditRatePercent: groups.length ? Math.min(...groups.map((group) => group.creditRatePercent)) : 100,
      restrictModels: restricted.length > 0,
      allowedModelIds: [...new Set(restricted.flatMap((group) => group.modelAccess.map((item) => item.modelPresetId)))],
      costOverrides: new Map(restricted.flatMap((group) => group.modelAccess.filter((item) => item.flatCreditCostOverride !== null).map((item) => [item.modelPresetId, item.flatCreditCostOverride!] as const))),
      groups: groups.map((group) => ({ id: group.id, name: group.name })),
      subscription: subscription ? { id: subscription.id, status: subscription.status, plan: { id: subscription.plan.id, code: subscription.plan.code, name: subscription.plan.name } } : null,
    }
  }

  async listModelsForUser(userId: string, capability?: ModelCapability) {
    const policy = await this.userPolicy(userId)
    const models = await this.prisma.modelPreset.findMany({ where: { enabled: true, ...(capability ? { capability } : {}), ...(policy.restrictModels ? { id: { in: policy.allowedModelIds } } : {}) }, orderBy: [{ capability: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }], include: { provider: { select: { id: true, name: true, type: true, enabled: true, encryptedApiKey: true } }, providerRoutes: { where: { enabled: true }, select: { id: true, providerId: true, options: true, provider: { select: { type: true, enabled: true, encryptedApiKey: true } } } } } })
    return models.map((model) => {
      const override = policy.costOverrides.get(model.id)
      const effectiveCreditCost = override ?? Math.ceil(model.flatCreditCost * policy.creditRatePercent / 100)
      const options = model.options && typeof model.options === 'object' && !Array.isArray(model.options) ? structuredClone(model.options) as Record<string, unknown> : {}
      if (model.capability === ModelCapability.VIDEO) Object.assign(options, this.effectiveVideoOptions(model.options, model.providerRoutes, model.provider))
      const image = options.imageCapabilities && typeof options.imageCapabilities === 'object' && !Array.isArray(options.imageCapabilities) ? options.imageCapabilities as Record<string, unknown> : undefined
      if (image) {
        const raw = image.resolutionPricing && typeof image.resolutionPricing === 'object' && !Array.isArray(image.resolutionPricing) ? image.resolutionPricing as Record<string, unknown> : {}
        image.resolutionPricing = override !== undefined
          ? { '1K': override, '2K': override * 2, '4K': override * 4 }
          : Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, Math.ceil(Number(value || 0) * policy.creditRatePercent / 100)]))
      }
      const video = options.videoCapabilities && typeof options.videoCapabilities === 'object' && !Array.isArray(options.videoCapabilities) ? options.videoCapabilities as Record<string, unknown> : undefined
      if (video) {
        const raw = video.pricing && typeof video.pricing === 'object' && !Array.isArray(video.pricing) ? video.pricing as Record<string, unknown> : {}
        video.pricing = Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, Math.ceil(Number(value || 0) * policy.creditRatePercent / 100)]))
      }
      const { provider, providerRoutes, ...safeModel } = model
      return {
        ...safeModel,
        provider: provider ? this.publicProvider(provider) : null,
        providerRoutes: providerRoutes.map(({ provider: _provider, ...route }) => route),
        options,
        effectiveCreditCost,
      }
    })
  }

  async createModel(input: Prisma.ModelPresetUncheckedCreateInput) {
    if (input.isDefault) await this.prisma.modelPreset.updateMany({ where: { capability: input.capability }, data: { isDefault: false } })
    return this.prisma.modelPreset.create({ data: input, include: { provider: { select: { id: true, name: true, type: true, enabled: true } }, providerRoutes: { include: { provider: { select: { id: true, name: true, type: true, enabled: true } } } } } })
  }

  async updateModel(id: string, input: Prisma.ModelPresetUncheckedUpdateInput) {
    const existing = await this.prisma.modelPreset.findUnique({ where: { id } })
    if (!existing) throw new NotFoundException('模型预设不存在')
    const capability = typeof input.capability === 'string' ? input.capability : existing.capability
    if (input.isDefault === true) await this.prisma.modelPreset.updateMany({ where: { capability, id: { not: id } }, data: { isDefault: false } })
    return this.prisma.modelPreset.update({ where: { id }, data: input, include: { provider: { select: { id: true, name: true, type: true, enabled: true } }, providerRoutes: { include: { provider: { select: { id: true, name: true, type: true, enabled: true } } } } } })
  }

  async replaceModelRoutes(modelPresetId: string, routes: Array<{ providerId: string; upstreamModelOverride?: string; enabled?: boolean; priority?: number | null; weight?: number | null; inputCostMicrosPerMillion?: number | null; outputCostMicrosPerMillion?: number | null; imageCostMicros?: number | null; videoCostMicros?: number | null; options?: Record<string, unknown> | null }>) {
    const preset = await this.prisma.modelPreset.findUnique({ where: { id: modelPresetId } })
    if (!preset) throw new NotFoundException('模型预设不存在')
    const unique = [...new Map(routes.map((route) => [route.providerId, route])).values()]
    const providerCount = await this.prisma.providerChannel.count({ where: { id: { in: unique.map((route) => route.providerId) } } })
    if (providerCount !== unique.length) throw new BadRequestException('包含不存在的渠道')
    const normalizedRoutes = unique.map((route, index) => ({
      ...route,
      options: this.normalizeRouteOptions(route.options, preset.capability, route.enabled ?? true, index),
    }))
    await this.prisma.$transaction(async (tx) => {
      await tx.modelProviderRoute.deleteMany({ where: { modelPresetId } })
      if (normalizedRoutes.length) await tx.modelProviderRoute.createMany({ data: normalizedRoutes.map((route) => ({ modelPresetId, providerId: route.providerId, upstreamModelOverride: route.upstreamModelOverride?.trim() || null, enabled: route.enabled ?? true, priority: route.priority ?? null, weight: route.weight ?? null, inputCostMicrosPerMillion: route.inputCostMicrosPerMillion ?? null, outputCostMicrosPerMillion: route.outputCostMicrosPerMillion ?? null, imageCostMicros: route.imageCostMicros ?? null, videoCostMicros: route.videoCostMicros ?? null, options: (route.options ?? undefined) as Prisma.InputJsonValue | undefined })) })
    })
    return this.prisma.modelPreset.findUniqueOrThrow({ where: { id: modelPresetId }, include: { providerRoutes: { include: { provider: { select: { id: true, name: true, type: true, enabled: true, priority: true, weight: true } } } } } })
  }

  async deleteModel(id: string) {
    await this.prisma.modelPreset.delete({ where: { id } }).catch(() => { throw new NotFoundException('模型预设不存在') })
    return { success: true }
  }

  async getSystemSettings(admin = false) {
    const row = await this.prisma.systemSetting.upsert({ where: { id: 'global' }, update: {}, create: { id: 'global' } })
    const {
      encryptedSmtpPassword,
      encryptedLinuxDoClientSecret,
      encryptedSub2apiClientSecret: _encryptedSub2apiClientSecret,
      sub2apiLoginEnabled: _sub2apiLoginEnabled,
      sub2apiBaseUrl: _sub2apiBaseUrl,
      sub2apiClientId: _sub2apiClientId,
      sub2apiClientSecretHint: _sub2apiClientSecretHint,
      sub2apiRedirectUrl: _sub2apiRedirectUrl,
      sub2apiScopes: _sub2apiScopes,
      sub2apiAuthorizeUrl: _sub2apiAuthorizeUrl,
      sub2apiTokenUrl: _sub2apiTokenUrl,
      sub2apiUserInfoUrl: _sub2apiUserInfoUrl,
      ...safe
    } = row
    if (admin) return {
      ...safe,
      chatHomeContent: this.chatHomeContent(row.chatHomeContent),
      hasSmtpPassword: Boolean(encryptedSmtpPassword),
      hasLinuxDoClientSecret: Boolean(encryptedLinuxDoClientSecret),
    }
    return {
      siteName: row.siteName,
      siteLogoUrl: row.siteLogoUrl,
      supportUrl: row.supportUrl,
      sidebarCreationEnabled: row.sidebarCreationEnabled,
      sidebarCommerceEnabled: row.sidebarCommerceEnabled,
      sidebarOfficeEnabled: row.sidebarOfficeEnabled,
      sidebarPromptsEnabled: row.sidebarPromptsEnabled,
      sidebarPluginsEnabled: row.sidebarPluginsEnabled,
      sidebarProjectsEnabled: row.sidebarProjectsEnabled,
      sidebarAssetsEnabled: row.sidebarAssetsEnabled,
      registrationEnabled: row.registrationEnabled,
      emailLoginEnabled: row.emailLoginEnabled,
      emailVerifyEnabled: row.emailVerifyEnabled,
      passwordLoginEnabled: row.passwordLoginEnabled,
      passwordRegistrationEnabled: row.passwordRegistrationEnabled,
      linuxDoLoginEnabled: row.linuxDoLoginEnabled,
      linuxDoLoginReady: row.linuxDoLoginEnabled && Boolean(row.linuxDoClientId.trim() && row.encryptedLinuxDoClientSecret.trim() && row.linuxDoRedirectUrl.trim()),
      otpResendSeconds: row.otpResendSeconds,
      defaultTheme: row.defaultTheme,
      defaultLanguage: row.defaultLanguage,
      chatUiPreset: row.chatUiPreset,
      chatHomeContent: this.chatHomeContent(row.chatHomeContent),
      userByokEnabled: row.userByokEnabled,
      rechargeEnabled: row.rechargeEnabled,
      currency: row.currency,
      subscriptionsEnabled: row.subscriptionsEnabled,
      trialEnabled: row.trialEnabled,
      smtpReady: row.smtpEnabled && Boolean(row.smtpHost.trim() && row.smtpFromEmail.trim() && encryptedSmtpPassword.trim()),
      temporaryChatRetentionHours: row.temporaryChatRetentionHours,
    }
  }

  async updateSystemSettings(input: SystemSettingsInput) {
    const { smtpPassword, linuxDoClientSecret, chatHomeContent, ...settings } = input
    const data: Prisma.SystemSettingUpdateInput = { ...settings }
    if (chatHomeContent) data.chatHomeContent = this.chatHomeContent(chatHomeContent) as Prisma.InputJsonValue
    if (smtpPassword) {
      data.encryptedSmtpPassword = this.crypto.encrypt(smtpPassword)
      data.smtpPasswordHint = this.crypto.hint(smtpPassword)
    } else if (smtpPassword === '') {
      data.encryptedSmtpPassword = ''
      data.smtpPasswordHint = ''
    }
    if (linuxDoClientSecret) {
      data.encryptedLinuxDoClientSecret = this.crypto.encrypt(linuxDoClientSecret)
      data.linuxDoClientSecretHint = this.crypto.hint(linuxDoClientSecret)
    } else if (linuxDoClientSecret === '') {
      data.encryptedLinuxDoClientSecret = ''
      data.linuxDoClientSecretHint = ''
    }
    await this.prisma.systemSetting.upsert({ where: { id: 'global' }, update: data, create: { id: 'global', ...data } as Prisma.SystemSettingCreateInput })
    return this.getSystemSettings(true)
  }

  private chatHomeContent(value: Prisma.JsonValue | Record<string, unknown> | null | undefined) {
    const input = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
    const text = (item: unknown, fallback = '', max = 500) => typeof item === 'string' ? item.trim().slice(0, max) : fallback
    const destination = (item: unknown, fallback: string) => {
      const value = text(item, fallback, 1000)
      if (value.startsWith('/')) return value
      try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.toString() : fallback } catch { return fallback }
    }
    const defaultRecommendations = DEFAULT_CHAT_HOME_CONTENT.doubaoRecommendations
    const recommendations = Array.isArray(input.doubaoRecommendations) ? input.doubaoRecommendations : defaultRecommendations
    const defaultBanners = DEFAULT_CHAT_HOME_CONTENT.qianwenBanners
    const banners = Array.isArray(input.qianwenBanners) ? input.qianwenBanners : defaultBanners
    const rawProject = input.kimiProject && typeof input.kimiProject === 'object' && !Array.isArray(input.kimiProject) ? input.kimiProject as Record<string, unknown> : DEFAULT_CHAT_HOME_CONTENT.kimiProject
    return {
      doubaoRecommendations: recommendations.slice(0, 12).map((item, index) => {
        const row = item && typeof item === 'object' && !Array.isArray(item) ? item as Record<string, unknown> : {}
        const fallback = defaultRecommendations[index % defaultRecommendations.length]
        return { title: text(row.title, fallback.title, 160), prompt: text(row.prompt, fallback.prompt, 2000), targetUrl: destination(row.targetUrl, fallback.targetUrl) }
      }).filter((item) => item.title),
      qianwenBanners: banners.slice(0, 8).map((item, index) => {
        const row = item && typeof item === 'object' && !Array.isArray(item) ? item as Record<string, unknown> : {}
        const fallback = defaultBanners[index % defaultBanners.length]
        return {
          title: text(row.title, fallback.title, 120), description: text(row.description, fallback.description, 240),
          buttonText: text(row.buttonText, fallback.buttonText, 40), imageUrl: destination(row.imageUrl, ''), targetUrl: destination(row.targetUrl, fallback.targetUrl),
        }
      }).filter((item) => item.title),
      kimiProject: { label: text(rawProject.label, DEFAULT_CHAT_HOME_CONTENT.kimiProject.label, 60), targetUrl: destination(rawProject.targetUrl, DEFAULT_CHAT_HOME_CONTENT.kimiProject.targetUrl) },
    }
  }

  private externalUrl(input: string) {
    let url: URL
    try { url = new URL(input.trim()) } catch { throw new BadRequestException('外部入口地址格式不正确') }
    if (!['http:', 'https:'].includes(url.protocol)) throw new BadRequestException('外部入口只支持 HTTP 或 HTTPS 地址')
    return url.toString()
  }

  listExternalLinks(includeDisabled = false) {
    return this.prisma.externalNavLink.findMany({
      where: includeDisabled ? {} : { enabled: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    })
  }

  createExternalLink(input: Prisma.ExternalNavLinkUncheckedCreateInput) {
    return this.prisma.externalNavLink.create({ data: { ...input, key: input.key.trim().toLowerCase(), name: input.name.trim(), url: this.externalUrl(input.url) } })
  }

  async updateExternalLink(id: string, input: Prisma.ExternalNavLinkUncheckedUpdateInput) {
    if (!await this.prisma.externalNavLink.findUnique({ where: { id }, select: { id: true } })) throw new NotFoundException('外部入口不存在')
    return this.prisma.externalNavLink.update({ where: { id }, data: {
      ...input,
      ...(typeof input.key === 'string' ? { key: input.key.trim().toLowerCase() } : {}),
      ...(typeof input.name === 'string' ? { name: input.name.trim() } : {}),
      ...(typeof input.url === 'string' ? { url: this.externalUrl(input.url) } : {}),
    } })
  }

  async deleteExternalLink(id: string) {
    await this.prisma.externalNavLink.delete({ where: { id } }).catch(() => { throw new NotFoundException('外部入口不存在') })
    return { success: true }
  }

  listRechargePackages(includeDisabled = false) {
    return this.prisma.rechargePackage.findMany({ where: includeDisabled ? {} : { enabled: true }, orderBy: [{ sortOrder: 'asc' }, { priceCents: 'asc' }] })
  }

  createRechargePackage(input: Prisma.RechargePackageUncheckedCreateInput) {
    return this.prisma.rechargePackage.create({ data: input })
  }

  async updateRechargePackage(id: string, input: Prisma.RechargePackageUncheckedUpdateInput) {
    return this.prisma.rechargePackage.update({ where: { id }, data: input }).catch(() => { throw new NotFoundException('充值套餐不存在') })
  }

  async deleteRechargePackage(id: string) {
    await this.prisma.rechargePackage.delete({ where: { id } }).catch(() => { throw new NotFoundException('充值套餐不存在') })
    return { success: true }
  }

  async listCredentials(userId: string) {
    const rows = await this.prisma.userApiCredential.findMany({ where: { userId }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] })
    return rows.map((row) => this.publicCredential(row))
  }

  async createCredential(userId: string, input: CredentialInput) {
    if (!input.apiKey?.trim()) throw new BadRequestException('请输入 API 密钥')
    const settings = await this.prisma.systemSetting.findUnique({ where: { id: 'global' } })
    if (!settings?.userByokEnabled) throw new BadRequestException('管理员未开放用户 API 密钥')
    if (!(await this.userPolicy(userId)).allowUserByok) throw new ForbiddenException('当前用户分组或套餐不允许使用个人 API 密钥')
    const baseUrl = this.assertUserProviderUrl(input.baseUrl)
    if (input.isDefault) await this.prisma.userApiCredential.updateMany({ where: { userId }, data: { isDefault: false } })
    const row = await this.prisma.userApiCredential.create({ data: { userId, name: input.name.trim(), providerType: input.providerType, baseUrl, encryptedApiKey: this.crypto.encrypt(input.apiKey), apiKeyHint: this.crypto.hint(input.apiKey), authType: input.authType, enabled: input.enabled, isDefault: input.isDefault, customHeaders: input.customHeaders as Prisma.InputJsonValue } })
    return this.publicCredential(row)
  }

  async updateCredential(userId: string, id: string, input: Partial<CredentialInput>) {
    const existing = await this.prisma.userApiCredential.findFirst({ where: { id, userId } })
    if (!existing) throw new NotFoundException('API 凭据不存在')
    if (!(await this.userPolicy(userId)).allowUserByok) throw new ForbiddenException('当前用户分组或套餐不允许使用个人 API 密钥')
    if (input.isDefault) await this.prisma.userApiCredential.updateMany({ where: { userId, id: { not: id } }, data: { isDefault: false } })
    const row = await this.prisma.userApiCredential.update({ where: { id }, data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.providerType !== undefined ? { providerType: input.providerType } : {}),
      ...(input.baseUrl !== undefined ? { baseUrl: this.assertUserProviderUrl(input.baseUrl) } : {}),
      ...(input.apiKey ? { encryptedApiKey: this.crypto.encrypt(input.apiKey), apiKeyHint: this.crypto.hint(input.apiKey) } : {}),
      ...(input.authType !== undefined ? { authType: input.authType } : {}),
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      ...(input.isDefault !== undefined ? { isDefault: input.isDefault } : {}),
      ...(input.customHeaders !== undefined ? { customHeaders: input.customHeaders as Prisma.InputJsonValue } : {}),
    } })
    return this.publicCredential(row)
  }

  async deleteCredential(userId: string, id: string) {
    const result = await this.prisma.userApiCredential.deleteMany({ where: { id, userId } })
    if (!result.count) throw new NotFoundException('API 凭据不存在')
    return { success: true }
  }

  private async resolvePreset(userId: string, requestedModel: string | undefined, capability: ModelCapability): Promise<ResolvedPreset> {
    const settings = await this.prisma.systemSetting.findUnique({ where: { id: 'global' } })
    const policy = await this.userPolicy(userId)
    const configuredDefault = capability === ModelCapability.CHAT ? settings?.defaultChatModelKey : capability === ModelCapability.IMAGE || capability === ModelCapability.COMMERCE ? settings?.defaultImageModelKey : undefined
    const requested = requestedModel?.trim()
    const videoAliases: Record<string, string> = {
      'sora 2': 'sora-2',
      sora2: 'sora-2',
      'grok imagine video': 'grok-imagine-video',
    }
    const lookup = capability === ModelCapability.VIDEO && requested
      ? videoAliases[requested.toLowerCase()] || requested
      : requested || configuredDefault || undefined
    const accessWhere = policy.restrictModels ? { id: { in: policy.allowedModelIds } } : {}
    const include = { provider: true, providerRoutes: { include: { provider: true } } } as const
    const preset = await this.prisma.modelPreset.findFirst({ where: { capability, enabled: true, ...accessWhere, ...(lookup ? { OR: [{ key: lookup }, { displayName: lookup }, { upstreamModel: lookup }] } : { isDefault: true }) }, include })
      || (!lookup ? await this.prisma.modelPreset.findFirst({ where: { capability, enabled: true, ...accessWhere }, orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }], include }) : null)
    if (lookup && !preset) {
      if (policy.restrictModels) throw new ForbiddenException('当前用户分组无权使用该模型')
      throw new NotFoundException('模型未配置或已停用')
    }
    const model = preset?.upstreamModel || lookup || (capability === ModelCapability.CHAT ? this.config.get<string>('AI_CHAT_MODEL') : capability === ModelCapability.VIDEO ? 'grok-imagine-video' : this.config.get<string>('AI_IMAGE_MODEL')) || 'default'
    const creditCost = preset ? policy.costOverrides.get(preset.id) ?? Math.ceil(preset.flatCreditCost * policy.creditRatePercent / 100) : 1
    return { preset, model, creditCost, policy, settings }
  }

  async resolveCandidates(userId: string, requestedModel: string | undefined, capability: ModelCapability, requirements: Record<string, unknown> = {}): Promise<ResolvedProvider[]> {
    const { preset, model, creditCost, policy, settings } = await this.resolvePreset(userId, requestedModel, capability)
    const candidates: ResolvedProvider[] = []
    const presetOptions = preset?.options && typeof preset.options === 'object' && !Array.isArray(preset.options) ? preset.options as Record<string, unknown> : {}
    const configuredProtocol = String(presetOptions.apiProtocol || 'openai').toLowerCase()
    const apiProtocol: ResolvedProvider['apiProtocol'] = configuredProtocol === 'anthropic' || configuredProtocol === 'gemini' ? configuredProtocol : 'openai'
    const basePricing = {
      creditValueMicros: settings?.creditValueMicros ?? 10000,
      inputCostMicrosPerMillion: preset?.inputCostMicrosPerMillion ?? 0,
      outputCostMicrosPerMillion: preset?.outputCostMicrosPerMillion ?? 0,
      imageCostMicros: preset?.imageCostMicros ?? 0,
      videoCostMicros: preset?.videoCostMicros ?? 0,
      inputCreditsPerMillion: Math.ceil((preset?.inputCreditsPerMillion ?? 0) * policy.creditRatePercent / 100),
      outputCreditsPerMillion: Math.ceil((preset?.outputCreditsPerMillion ?? 0) * policy.creditRatePercent / 100),
      imageCapabilities: presetOptions.imageCapabilities && typeof presetOptions.imageCapabilities === 'object' && !Array.isArray(presetOptions.imageCapabilities) ? presetOptions.imageCapabilities as Record<string, unknown> : undefined,
      videoCapabilities: presetOptions.videoCapabilities && typeof presetOptions.videoCapabilities === 'object' && !Array.isArray(presetOptions.videoCapabilities) ? presetOptions.videoCapabilities as Record<string, unknown> : undefined,
      creditRatePercent: policy.creditRatePercent,
      apiProtocol,
    }

    if (settings?.userByokEnabled && policy.allowUserByok && preset?.allowUserKey !== false && (preset?.provider?.allowUserKeys ?? true)) {
      const credentials = await this.prisma.userApiCredential.findMany({ where: { userId, enabled: true }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] })
      const compatibleTypes = new Set([preset?.provider?.type, ...(preset?.providerRoutes || []).map((route) => route.provider.type)].filter(Boolean))
      const ordered = [...credentials].sort((a, b) => Number(compatibleTypes.has(b.providerType)) - Number(compatibleTypes.has(a.providerType)))
      for (const credential of ordered) candidates.push({ source: 'user', credentialId: credential.id, label: credential.name, type: credential.providerType, baseUrl: credential.baseUrl, apiKey: this.crypto.decrypt(credential.encryptedApiKey), authType: credential.authType, headers: this.headers(credential.customHeaders), timeoutMs: 120_000, model, presetKey: preset?.key, creditCost, ...basePricing, inputCostMicrosPerMillion: 0, outputCostMicrosPerMillion: 0, imageCostMicros: 0, videoCostMicros: 0 })
    }

    const now = Date.now()
    const allConfiguredRoutes = (preset?.providerRoutes || []).filter((route) => route.enabled && route.provider.enabled && this.providerReady(route.provider))
    const configuredRoutes = allConfiguredRoutes.filter((route) => capability !== ModelCapability.VIDEO || this.routeSupportsVideo(route.options, requirements))
    const readyRoutes = configuredRoutes.filter((route) => !route.provider.cooldownUntil || route.provider.cooldownUntil.getTime() <= now)
    // Cooldown keeps an unhealthy route behind healthy alternatives. It must not make the only
    // configured route look unbound, otherwise admins cannot verify a corrected upstream.
    const routes = (readyRoutes.length ? readyRoutes : configuredRoutes)
      .map((route) => ({ route, priority: route.priority ?? route.provider.priority, weight: Math.max(1, route.weight ?? route.provider.weight), random: Math.random() }))
      .sort((a, b) => b.priority - a.priority || (b.random ** (1 / b.weight)) - (a.random ** (1 / a.weight)))
    for (const { route } of routes) candidates.push({ source: 'admin', providerId: route.provider.id, routeId: route.id, label: route.provider.name, type: route.provider.type, baseUrl: route.provider.baseUrl, apiKey: this.crypto.decrypt(route.provider.encryptedApiKey), authType: route.provider.authType, headers: this.headers(route.provider.customHeaders), timeoutMs: route.provider.timeoutMs, model: route.upstreamModelOverride || model, presetKey: preset?.key, creditCost, ...basePricing, videoCapabilities: this.routeVideoCapabilities(route.options, basePricing.videoCapabilities), inputCostMicrosPerMillion: route.inputCostMicrosPerMillion ?? basePricing.inputCostMicrosPerMillion, outputCostMicrosPerMillion: route.outputCostMicrosPerMillion ?? basePricing.outputCostMicrosPerMillion, imageCostMicros: route.imageCostMicros ?? basePricing.imageCostMicros, videoCostMicros: route.videoCostMicros ?? basePricing.videoCostMicros })

    if (!allConfiguredRoutes.length && preset?.provider?.enabled && this.providerReady(preset.provider)) {
      candidates.push({ source: 'admin', providerId: preset.provider.id, label: preset.provider.name, type: preset.provider.type, baseUrl: preset.provider.baseUrl, apiKey: this.crypto.decrypt(preset.provider.encryptedApiKey), authType: preset.provider.authType, headers: this.headers(preset.provider.customHeaders), timeoutMs: preset.provider.timeoutMs, model, presetKey: preset.key, creditCost, ...basePricing })
    }

    const envKey = this.config.get<string>('AI_PROVIDER_API_KEY') || ''
    const envBase = this.config.get<string>('AI_PROVIDER_BASE_URL') || 'https://api.openai.com/v1'
    if (envKey) candidates.push({ source: 'environment', label: '环境变量渠道', type: ProviderType.OPENAI_COMPATIBLE, baseUrl: this.normalizeBaseUrl(envBase), apiKey: envKey, authType: ProviderAuthType.BEARER, headers: {}, timeoutMs: 120_000, model, presetKey: preset?.key, creditCost, ...basePricing })
    if (!candidates.length && capability === ModelCapability.VIDEO && allConfiguredRoutes.length && !configuredRoutes.length) throw new BadRequestException('当前视频规格没有可用上游渠道，请调整分辨率、时长或画面比例')
    if (!candidates.length) candidates.push({ source: 'demo', label: '演示模式', type: ProviderType.OPENAI_COMPATIBLE, baseUrl: '', apiKey: '', authType: ProviderAuthType.BEARER, headers: {}, timeoutMs: 120_000, model, presetKey: preset?.key, creditCost, ...basePricing, inputCostMicrosPerMillion: 0, outputCostMicrosPerMillion: 0, imageCostMicros: 0, videoCostMicros: 0 })
    return candidates
  }

  async resolve(userId: string, requestedModel: string | undefined, capability: ModelCapability, requirements: Record<string, unknown> = {}): Promise<ResolvedProvider> {
    return (await this.resolveCandidates(userId, requestedModel, capability, requirements))[0]
  }

  async recordProviderResult(providerId: string | undefined, success: boolean, message = '') {
    if (!providerId) return
    if (success) {
      await this.prisma.providerChannel.updateMany({ where: { id: providerId }, data: { consecutiveFailures: 0, cooldownUntil: null, lastSuccessAt: new Date(), lastHealthAt: new Date(), lastHealthStatus: 'healthy', lastHealthMessage: message || '最近调用成功' } })
      return
    }
    const provider = await this.prisma.providerChannel.findUnique({ where: { id: providerId }, select: { consecutiveFailures: true } })
    if (!provider) return
    const failures = provider.consecutiveFailures + 1
    const cooldownSeconds = failures >= 3 ? Math.min(300, 15 * 2 ** Math.min(failures - 3, 5)) : 0
    await this.prisma.providerChannel.update({ where: { id: providerId }, data: { consecutiveFailures: failures, lastFailureAt: new Date(), lastHealthAt: new Date(), lastHealthStatus: 'unhealthy', lastHealthMessage: message.slice(0, 500), cooldownUntil: cooldownSeconds ? new Date(Date.now() + cooldownSeconds * 1000) : null } })
  }

  buildRequestHeaders(provider: ResolvedProvider, protocol: 'openai' | 'claude' | 'gemini' = 'openai', contentType: string | undefined = 'application/json') {
    const headers: Record<string, string> = { ...provider.headers }
    if (contentType) headers['Content-Type'] = contentType
    else { delete headers['Content-Type']; delete headers['content-type'] }
    this.applyAuth(headers, provider.authType, provider.apiKey)
    if (protocol === 'claude') {
      headers['x-api-key'] = provider.apiKey
      headers['anthropic-version'] ||= '2023-06-01'
    }
    if (protocol === 'gemini') headers['x-goog-api-key'] = provider.apiKey
    return headers
  }
}
