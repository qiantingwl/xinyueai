import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleInit, ServiceUnavailableException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { ModelCapability, Prisma, ProviderAuthType, ProviderType, SystemSetting } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { localWorkerHttpUrl, PublicEndpointPolicyService } from '../common/public-endpoint-policy.service'
import { CredentialCryptoService } from './credential-crypto.service'
import { normalizeSiteContent } from './site-content'
import { CapabilityRegistryService } from './capability-registry.service'
import { DiscoveredModel } from './model-discovery.service'
import { normalizeChatHomeContent } from './chat-home-content'
import { ProviderHealthService } from './provider-health.service'
import { ProviderRoutingService } from './provider-routing.service'
import {
  orderPlatformRoutes,
  orderPrivateRoutes,
  providerSourceRequirement,
  userCredentialCreditCost
} from './provider-routing'
import { modelPricingFields, ProviderPricingService } from './provider-pricing.service'
import { fetchNoRedirect, fetchPublicNoRedirect, fetchPublicSameHostRedirects } from '../common/outbound-http'
import { packWorkspaceNav, presentSystemNav, sanitizeSidebarNav, SIDEBAR_AND_NESTED_KEYS } from '../common/sidebar-nav'
import { UpstreamChannelError, upstreamHttpError, upstreamSafeMessage } from './upstream-errors'
import { asJsonRecord } from '../common/json-record'
import { hasSupportedImageSignature, remoteModelIds } from './provider-remote-models'

type ProviderInput = {
  name: string
  templateId?: string | null
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

type ModelAvailabilityReason = 'NO_CHANNEL' | 'API_KEY_MISSING' | 'CHANNEL_COOLDOWN' | 'HEALTH_CHECK_REQUIRED'

type ModelVendorInput = {
  key: string
  name: string
  icon?: string
  websiteUrl?: string
  enabled?: boolean
  sortOrder?: number
}

type ProviderTemplateInput = {
  key: string
  name: string
  description?: string
  vendorId?: string | null
  type: ProviderType
  baseUrl?: string
  authType?: ProviderAuthType
  apiProtocol?: 'openai' | 'anthropic' | 'gemini'
  nativeSearchProvider?: 'openai' | 'anthropic' | 'gemini' | 'xai' | 'qwen' | 'doubao' | 'disabled'
  customHeaders?: Record<string, string>
  supportsDiscovery?: boolean
  enabled?: boolean
  sortOrder?: number
}

type CredentialInput = {
  name: string
  templateId?: string
  providerType: ProviderType
  baseUrl: string
  apiKey?: string
  authType?: ProviderAuthType
  enabled?: boolean
  isDefault?: boolean
  priority?: number
  weight?: number
  customHeaders?: Record<string, string>
  expiresAt?: string | null
}

type UserModelInput = {
  displayName: string
  description?: string
  vendorId?: string
  capability: ModelCapability
  apiProtocol?: 'openai' | 'anthropic' | 'gemini'
  routingStrategy?: 'PRIORITY' | 'WEIGHTED' | 'ROUND_ROBIN'
  enabled?: boolean
  isDefault?: boolean
  options?: Record<string, unknown>
  routes: Array<{ credentialId: string; upstreamModel: string; enabled?: boolean; priority?: number; weight?: number }>
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
  sidebarNav: Record<string, unknown>
  workspaceNav: Record<string, unknown>
  sectionNav: Record<string, unknown>
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
  chatAvatarMotion: string
  chatAvatarEnabled: boolean
  chatAvatarStyle: string
  chatAvatarColor: string
  chatHomeContent: Record<string, unknown>
  siteContent: Record<string, unknown>
  defaultChatModelKey: string
  defaultImageModelKey: string
  imagePromptEnabled: boolean
  imagePromptModelKey: string
  imagePromptBillingMode: string
  userByokEnabled: boolean
  inviteRewardCredits: number
  referralEnabled: boolean
  referralCoolingDays: number
  referralMinimumPaidCents: number
  referralMonthlyRewardLimit: number
  referralAutoApprove: boolean
  rechargeEnabled: boolean
  minRechargeCents: number
  currency: string
  creditValueMicros: number
  pricingUsdExchangeRateMicros: number
  modelImportMarkupPercent: number
  modelPriceCatalogUrl: string
  modelPriceCatalogRefreshHours: number
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
  source: 'user' | 'admin' | 'environment'
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
  settlementCurrency: string
  creditValueMicros: number
  pricingUsdExchangeRateMicros: number
  inputCostMicrosPerMillion: number
  outputCostMicrosPerMillion: number
  imageCostMicros: number
  videoCostMicros: number
  inputCreditsPerMillion: number
  outputCreditsPerMillion: number
  baseInputCreditsPerMillion: number
  baseOutputCreditsPerMillion: number
  imageCapabilities?: Record<string, unknown>
  videoCapabilities?: Record<string, unknown>
  creditRatePercent: number
  apiProtocol: 'openai' | 'anthropic' | 'gemini'
  /** Model/route request hints such as reasoning_effort or enable_thinking. */
  options?: Record<string, unknown>
  nativeSearchProvider?: 'openai' | 'anthropic' | 'gemini' | 'xai' | 'qwen' | 'doubao'
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

const DEFAULT_PRESETS = [
  { key: 'gpt-5.5', displayName: 'gpt-5.5', upstreamModel: 'gpt-5.5', capability: ModelCapability.CHAT, sortOrder: 10, isDefault: true, flatCreditCost: 0, inputCreditsPerMillion: 260, outputCreditsPerMillion: 1040 },
  { key: 'gpt-5.6-sol', displayName: 'gpt-5.6-sol', upstreamModel: 'gpt-5.6-sol', capability: ModelCapability.CHAT, sortOrder: 20, flatCreditCost: 0, inputCreditsPerMillion: 260, outputCreditsPerMillion: 1040 },
  { key: 'gpt-5.6-terra', displayName: 'gpt-5.6-terra', upstreamModel: 'gpt-5.6-terra', capability: ModelCapability.CHAT, sortOrder: 30, flatCreditCost: 0, inputCreditsPerMillion: 260, outputCreditsPerMillion: 1040 },
  { key: 'gpt-5.6-luna', displayName: 'gpt-5.6-luna', upstreamModel: 'gpt-5.6-luna', capability: ModelCapability.CHAT, sortOrder: 40, flatCreditCost: 0, inputCreditsPerMillion: 260, outputCreditsPerMillion: 1040 },
  { key: 'grok-4.5', displayName: 'grok-4.5', upstreamModel: 'grok-4.5', capability: ModelCapability.CHAT, sortOrder: 50, flatCreditCost: 0, inputCreditsPerMillion: 390, outputCreditsPerMillion: 1300 },
  { key: 'claude-sonnet', displayName: 'Claude Sonnet', upstreamModel: 'claude-sonnet-4-5', capability: ModelCapability.CHAT, sortOrder: 60, flatCreditCost: 0, description: '支持 Anthropic Messages 或 OpenAI Compatible 渠道', inputCreditsPerMillion: 390, outputCreditsPerMillion: 1950 },
  { key: 'gemini-pro', displayName: 'Gemini Pro', upstreamModel: 'gemini-2.5-pro', capability: ModelCapability.CHAT, sortOrder: 70, flatCreditCost: 0, description: '支持 Gemini GenerateContent 或 OpenAI Compatible 渠道', inputCreditsPerMillion: 163, outputCreditsPerMillion: 1300 },
  { key: 'deepseek-chat', displayName: 'DeepSeek', upstreamModel: 'deepseek-chat', capability: ModelCapability.CHAT, sortOrder: 80, flatCreditCost: 0, inputCreditsPerMillion: 36, outputCreditsPerMillion: 143 },
  { key: 'qwen-max', displayName: 'Qwen Max', upstreamModel: 'qwen-max', capability: ModelCapability.CHAT, sortOrder: 90, flatCreditCost: 0, inputCreditsPerMillion: 100, outputCreditsPerMillion: 300 },
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

const DEFAULT_VENDORS = [
  { key: 'openai', name: 'OpenAI', websiteUrl: 'https://openai.com', sortOrder: 10 },
  { key: 'anthropic', name: 'Anthropic', websiteUrl: 'https://anthropic.com', sortOrder: 20 },
  { key: 'google', name: 'Google Gemini', websiteUrl: 'https://ai.google.dev', sortOrder: 30 },
  { key: 'xai', name: 'xAI', websiteUrl: 'https://x.ai', sortOrder: 40 },
  { key: 'deepseek', name: 'DeepSeek', websiteUrl: 'https://deepseek.com', sortOrder: 50 },
  { key: 'qwen', name: 'Qwen', websiteUrl: 'https://bailian.console.aliyun.com', sortOrder: 60 },
  { key: 'doubao', name: 'Doubao', websiteUrl: 'https://www.volcengine.com/product/ark', sortOrder: 70 },
  { key: 'kimi', name: 'Kimi', websiteUrl: 'https://kimi.moonshot.cn', sortOrder: 80 },
  { key: 'zhipu', name: '智谱 GLM', websiteUrl: 'https://open.bigmodel.cn', sortOrder: 90 },
  { key: 'minimax', name: 'MiniMax', websiteUrl: 'https://www.minimax.io', sortOrder: 100 },
  { key: 'hunyuan', name: '腾讯混元', websiteUrl: 'https://hunyuan.tencent.com', sortOrder: 110 },
  { key: 'other', name: 'Other', websiteUrl: '', sortOrder: 999 },
] as const

const DEFAULT_PROVIDER_TEMPLATES = [
  { key: 'openai', name: 'OpenAI', vendorKey: 'openai', type: ProviderType.OPENAI, baseUrl: 'https://api.openai.com/v1', authType: ProviderAuthType.BEARER, apiProtocol: 'openai', nativeSearchProvider: 'openai', sortOrder: 10 },
  { key: 'anthropic', name: 'Anthropic', vendorKey: 'anthropic', type: ProviderType.OPENAI_COMPATIBLE, baseUrl: 'https://api.anthropic.com/v1', authType: ProviderAuthType.X_API_KEY, apiProtocol: 'anthropic', nativeSearchProvider: 'anthropic', sortOrder: 20 },
  { key: 'gemini', name: 'Google Gemini', vendorKey: 'google', type: ProviderType.OPENAI_COMPATIBLE, baseUrl: 'https://generativelanguage.googleapis.com/v1beta', authType: ProviderAuthType.X_API_KEY, apiProtocol: 'gemini', nativeSearchProvider: 'gemini', supportsDiscovery: false, sortOrder: 30 },
  { key: 'xai', name: 'xAI', vendorKey: 'xai', type: ProviderType.OPENAI_COMPATIBLE, baseUrl: 'https://api.x.ai/v1', authType: ProviderAuthType.BEARER, apiProtocol: 'openai', nativeSearchProvider: 'xai', sortOrder: 40 },
  { key: 'deepseek', name: 'DeepSeek', vendorKey: 'deepseek', type: ProviderType.OPENAI_COMPATIBLE, baseUrl: 'https://api.deepseek.com/v1', authType: ProviderAuthType.BEARER, apiProtocol: 'openai', sortOrder: 50 },
  { key: 'qwen', name: '阿里云百炼', vendorKey: 'qwen', type: ProviderType.OPENAI_COMPATIBLE, baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', authType: ProviderAuthType.BEARER, apiProtocol: 'openai', nativeSearchProvider: 'qwen', sortOrder: 60 },
  { key: 'doubao', name: '火山方舟', vendorKey: 'doubao', type: ProviderType.OPENAI_COMPATIBLE, baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', authType: ProviderAuthType.BEARER, apiProtocol: 'openai', nativeSearchProvider: 'doubao', supportsDiscovery: false, sortOrder: 70 },
  { key: 'newapi', name: 'NewAPI', vendorKey: 'other', type: ProviderType.NEW_API, baseUrl: '', authType: ProviderAuthType.BEARER, apiProtocol: 'openai', nativeSearchProvider: 'openai', sortOrder: 80 },
  { key: 'sub2api', name: 'Sub2API', vendorKey: 'other', type: ProviderType.SUB2API, baseUrl: '', authType: ProviderAuthType.BEARER, apiProtocol: 'openai', sortOrder: 90 },
  { key: 'openrouter', name: 'OpenRouter', vendorKey: 'other', type: ProviderType.OPENAI_COMPATIBLE, baseUrl: 'https://openrouter.ai/api/v1', authType: ProviderAuthType.BEARER, apiProtocol: 'openai', sortOrder: 100 },
  { key: 'litellm', name: 'LiteLLM', vendorKey: 'other', type: ProviderType.OPENAI_COMPATIBLE, baseUrl: '', authType: ProviderAuthType.BEARER, apiProtocol: 'openai', sortOrder: 110 },
  { key: 'ollama', name: 'Ollama / OpenAI Compatible', vendorKey: 'other', type: ProviderType.OPENAI_COMPATIBLE, baseUrl: '', authType: ProviderAuthType.BEARER, apiProtocol: 'openai', sortOrder: 120 },
  { key: 'local-worker', name: 'Xinyue Local Worker', vendorKey: 'other', type: ProviderType.LOCAL_WORKER, baseUrl: '', authType: ProviderAuthType.BEARER, apiProtocol: 'openai', supportsDiscovery: true, sortOrder: 130 },
] as const

@Injectable()
export class ProvidersService implements OnModuleInit {
  private readonly logger = new Logger(ProvidersService.name)

  constructor(private readonly prisma: PrismaService, private readonly crypto: CredentialCryptoService, private readonly config: ConfigService, private readonly capabilities: CapabilityRegistryService, private readonly pricing: ProviderPricingService, private readonly health: ProviderHealthService, private readonly routing: ProviderRoutingService, private readonly endpointPolicy: PublicEndpointPolicyService) {}

  async onModuleInit() {
    await this.prisma.systemSetting.upsert({ where: { id: 'global' }, update: {}, create: { id: 'global' } })
    await this.prisma.modelVendor.createMany({ data: DEFAULT_VENDORS.map((vendor) => ({ ...vendor })), skipDuplicates: true })
    const vendors = new Map((await this.prisma.modelVendor.findMany()).map((vendor) => [vendor.key, vendor.id]))
    await this.prisma.providerTemplate.createMany({ data: DEFAULT_PROVIDER_TEMPLATES.map(({ vendorKey, ...data }) => ({ ...data, vendorId: vendors.get(vendorKey) })), skipDuplicates: true })
    await this.prisma.modelPreset.createMany({ data: DEFAULT_PRESETS.map((preset) => ({ ...preset, enabled: false, isDefault: false })), skipDuplicates: true })
    await this.prisma.modelPreset.updateMany({ where: { enabled: true, providerId: null, providerRoutes: { none: {} } }, data: { enabled: false, isDefault: false } })
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
    else if (!/\/(?:api\/)?v\d+(?:beta\d*)?$/i.test(url.pathname)) url.pathname = `${url.pathname}/v1`.replace(/\/{2,}/g, '/')
    return url.toString().replace(/\/$/, '')
  }

  private localWorkerAllowedHosts() {
    const configured = this.config.get<string>('LOCAL_WORKER_ALLOWED_HOSTS', '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
    // These are the service names shipped by docker-compose.prod.yml. Custom
    // workers must be added explicitly through LOCAL_WORKER_ALLOWED_HOSTS.
    return configured.length ? configured : ['image-worker', 'iopaint-worker', 'realesrgan-worker', 'comfyui-gateway', 'comfyui']
  }

  private async assertProviderEndpoint(input: string, type: ProviderType) {
    const normalized = this.normalizeBaseUrl(input, type)
    if (type === ProviderType.LOCAL_WORKER) {
      localWorkerHttpUrl(normalized, this.localWorkerAllowedHosts())
      return normalized
    }
    await this.endpointPolicy.assertPublicHttpUrl(normalized)
    return normalized
  }

  private async providerEndpointAllowed(input: string, type: ProviderType) {
    try {
      await this.assertProviderEndpoint(input, type)
      return true
    } catch {
      return false
    }
  }

  private providerReady(provider: { type: ProviderType; encryptedApiKey: string }) {
    return provider.type === ProviderType.POLLINATIONS || provider.type === ProviderType.LOCAL_WORKER || Boolean(provider.encryptedApiKey)
  }

  private providerPublished(provider: { type: ProviderType; encryptedApiKey: string; enabled: boolean; lastHealthStatus?: string | null; cooldownUntil?: Date | null } | null | undefined) {
    return Boolean(provider?.enabled
      && this.providerReady(provider)
      && (!provider.cooldownUntil || provider.cooldownUntil.getTime() <= Date.now()))
  }

  private providerHealthy(provider: { type: ProviderType; encryptedApiKey: string; enabled: boolean; lastHealthStatus?: string | null; cooldownUntil?: Date | null } | null | undefined) {
    return Boolean(this.providerPublished(provider) && provider?.lastHealthStatus === 'healthy')
  }

  private modelAvailabilityReason(
    provider: { type: ProviderType; encryptedApiKey: string; enabled: boolean; cooldownUntil?: Date | null } | null | undefined,
    routes: Array<{ enabled?: boolean; provider: { type: ProviderType; encryptedApiKey: string; enabled: boolean; cooldownUntil?: Date | null } }>,
    routeCount: number,
  ): ModelAvailabilityReason | undefined {
    const active = [
      ...(provider ? [{ enabled: true, provider }] : []),
      ...routes.map((route) => ({ enabled: route.enabled, provider: route.provider })),
    ].filter((route) => route.enabled !== false && route.provider.enabled)
    if (!active.length) return 'NO_CHANNEL'
    if (active.some((route) => !this.providerReady(route.provider)) && !routeCount) return 'API_KEY_MISSING'
    if (!routeCount && active.some((route) => route.provider.cooldownUntil && route.provider.cooldownUntil.getTime() > Date.now())) return 'CHANNEL_COOLDOWN'
    if (!routeCount) return 'HEALTH_CHECK_REQUIRED'
    return undefined
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

  async assertUserProviderUrl(input: string) {
    const normalized = this.normalizeBaseUrl(input)
    try { await this.endpointPolicy.assertPublicHttpUrl(normalized) } catch { throw new BadRequestException('用户 API 地址必须是可解析的公网 HTTP 或 HTTPS 地址') }
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

  private nativeSearchProvider(baseUrl: string, apiProtocol: ResolvedProvider['apiProtocol'], ...settings: unknown[]): ResolvedProvider['nativeSearchProvider'] {
    for (const setting of settings) {
      if (!setting || typeof setting !== 'object' || Array.isArray(setting)) continue
      const configured = String((setting as Record<string, unknown>).nativeSearchProvider || '').trim().toLowerCase()
      if (['openai', 'anthropic', 'gemini', 'xai', 'qwen', 'doubao'].includes(configured)) return configured as ResolvedProvider['nativeSearchProvider']
      if (configured === 'none' || configured === 'disabled') return undefined
    }
    const host = (() => { try { return new URL(baseUrl).hostname.toLowerCase() } catch { return '' } })()
    if (apiProtocol === 'anthropic' || host.endsWith('anthropic.com')) return 'anthropic'
    if (apiProtocol === 'gemini' || host.includes('generativelanguage.googleapis.com')) return 'gemini'
    if (host.endsWith('api.openai.com')) return 'openai'
    if (host.endsWith('api.x.ai')) return 'xai'
    if (host.includes('dashscope.aliyuncs.com')) return 'qwen'
    if (host.includes('volces.com')) return 'doubao'
    return undefined
  }

  publicProvider<T extends { encryptedApiKey: string }>(provider: T) {
    const { encryptedApiKey, ...safe } = provider
    return { ...safe, hasApiKey: Boolean(encryptedApiKey) }
  }

  publicCredential<T extends { encryptedApiKey: string }>(credential: T) {
    const { encryptedApiKey, ...safe } = credential
    const output = { ...safe } as Record<string, unknown>
    if (typeof output.inputTokens === 'bigint') output.inputTokens = output.inputTokens.toString()
    if (typeof output.outputTokens === 'bigint') output.outputTokens = output.outputTokens.toString()
    return { ...output, hasApiKey: Boolean(encryptedApiKey) }
  }

  listModelVendors(includeDisabled = false) {
    return this.prisma.modelVendor.findMany({ where: includeDisabled ? {} : { enabled: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] })
  }

  listProviderTemplates(includeDisabled = false) {
    return this.prisma.providerTemplate.findMany({ where: includeDisabled ? {} : { enabled: true, type: { notIn: [ProviderType.POLLINATIONS, ProviderType.LOCAL_WORKER] } }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], include: { vendor: true, _count: { select: { providerChannels: true, userCredentials: true } } } })
  }

  async createModelVendor(input: ModelVendorInput) {
    return this.prisma.modelVendor.create({ data: {
      key: input.key.trim().toLowerCase(), name: input.name.trim(), icon: input.icon?.trim() || '', websiteUrl: input.websiteUrl?.trim() || '', enabled: input.enabled ?? true, sortOrder: input.sortOrder ?? 0,
    } })
  }

  async updateModelVendor(id: string, input: Partial<ModelVendorInput>) {
    const existing = await this.prisma.modelVendor.findUnique({ where: { id } })
    if (!existing) throw new NotFoundException('模型厂商不存在')
    return this.prisma.modelVendor.update({ where: { id }, data: {
      ...(input.key !== undefined ? { key: input.key.trim().toLowerCase() } : {}),
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.icon !== undefined ? { icon: input.icon.trim() } : {}),
      ...(input.websiteUrl !== undefined ? { websiteUrl: input.websiteUrl.trim() } : {}),
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
    } })
  }

  async deleteModelVendor(id: string) {
    const vendor = await this.prisma.modelVendor.findUnique({ where: { id }, include: { _count: { select: { providerTemplates: true, modelPresets: true, userModels: true } } } })
    if (!vendor) throw new NotFoundException('模型厂商不存在')
    const references = vendor._count.providerTemplates + vendor._count.modelPresets + vendor._count.userModels
    if (references) throw new BadRequestException(`该厂商仍被 ${references} 项配置引用，请先迁移引用`)
    await this.prisma.modelVendor.delete({ where: { id } })
    return { success: true }
  }

  private async assertTemplateVendor(vendorId?: string | null) {
    if (!vendorId) return
    if (!await this.prisma.modelVendor.count({ where: { id: vendorId } })) throw new BadRequestException('模型厂商不存在')
  }

  async createProviderTemplate(input: ProviderTemplateInput) {
    await this.assertTemplateVendor(input.vendorId)
    return this.prisma.providerTemplate.create({ data: {
      key: input.key.trim().toLowerCase(), name: input.name.trim(), description: input.description?.trim() || '', vendorId: input.vendorId || null, type: input.type, baseUrl: input.baseUrl?.trim() || '', authType: input.authType ?? ProviderAuthType.BEARER, apiProtocol: input.apiProtocol ?? 'openai', nativeSearchProvider: input.nativeSearchProvider ?? 'disabled', customHeaders: input.customHeaders as Prisma.InputJsonValue, supportsDiscovery: input.supportsDiscovery ?? true, enabled: input.enabled ?? true, sortOrder: input.sortOrder ?? 0,
    }, include: { vendor: true, _count: { select: { providerChannels: true, userCredentials: true } } } })
  }

  async updateProviderTemplate(id: string, input: Partial<ProviderTemplateInput>) {
    if (!await this.prisma.providerTemplate.count({ where: { id } })) throw new NotFoundException('渠道模板不存在')
    if (input.vendorId !== undefined) await this.assertTemplateVendor(input.vendorId)
    return this.prisma.providerTemplate.update({ where: { id }, data: {
      ...(input.key !== undefined ? { key: input.key.trim().toLowerCase() } : {}),
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.description !== undefined ? { description: input.description.trim() } : {}),
      ...(input.vendorId !== undefined ? { vendorId: input.vendorId || null } : {}),
      ...(input.type !== undefined ? { type: input.type } : {}),
      ...(input.baseUrl !== undefined ? { baseUrl: input.baseUrl.trim() } : {}),
      ...(input.authType !== undefined ? { authType: input.authType } : {}),
      ...(input.apiProtocol !== undefined ? { apiProtocol: input.apiProtocol } : {}),
      ...(input.nativeSearchProvider !== undefined ? { nativeSearchProvider: input.nativeSearchProvider } : {}),
      ...(input.customHeaders !== undefined ? { customHeaders: input.customHeaders as Prisma.InputJsonValue } : {}),
      ...(input.supportsDiscovery !== undefined ? { supportsDiscovery: input.supportsDiscovery } : {}),
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
    }, include: { vendor: true, _count: { select: { providerChannels: true, userCredentials: true } } } })
  }

  async deleteProviderTemplate(id: string) {
    const template = await this.prisma.providerTemplate.findUnique({ where: { id }, include: { _count: { select: { providerChannels: true, userCredentials: true } } } })
    if (!template) throw new NotFoundException('渠道模板不存在')
    const references = template._count.providerChannels + template._count.userCredentials
    if (references) throw new BadRequestException(`该模板仍被 ${references} 个渠道或用户密钥引用，请先迁移引用`)
    await this.prisma.providerTemplate.delete({ where: { id } })
    return { success: true }
  }

  listProviders() {
    return this.prisma.providerChannel.findMany({ orderBy: [{ enabled: 'desc' }, { priority: 'desc' }, { createdAt: 'asc' }], include: { template: { select: { id: true, name: true, apiProtocol: true, nativeSearchProvider: true } }, _count: { select: { modelPresets: true, modelRoutes: true } } } }).then((rows) => rows.map((row) => this.publicProvider(row)))
  }

  async createProvider(input: ProviderInput) {
    const template = input.templateId ? await this.prisma.providerTemplate.findUnique({ where: { id: input.templateId } }) : null
    if (input.templateId && !template) throw new BadRequestException('渠道模板不存在')
    const metadata = { ...(template ? { apiProtocol: template.apiProtocol, nativeSearchProvider: template.nativeSearchProvider } : {}), ...(input.metadata || {}) }
    const providerType = template?.type ?? input.type
    const baseUrl = await this.assertProviderEndpoint(input.baseUrl || template?.baseUrl || '', providerType)
    const row = await this.prisma.providerChannel.create({ data: {
      name: input.name.trim(), template: input.templateId ? { connect: { id: input.templateId } } : undefined, type: providerType, baseUrl, encryptedApiKey: this.crypto.encrypt(input.apiKey || ''), apiKeyHint: this.crypto.hint(input.apiKey || ''), authType: template?.authType ?? input.authType, enabled: input.enabled, priority: input.priority, weight: input.weight, timeoutMs: input.timeoutMs, allowUserKeys: providerType !== ProviderType.POLLINATIONS && providerType !== ProviderType.LOCAL_WORKER && input.allowUserKeys, customHeaders: (input.customHeaders ?? template?.customHeaders) as Prisma.InputJsonValue, metadata: metadata as Prisma.InputJsonValue,
    } })
    return this.publicProvider(row)
  }

  async updateProvider(id: string, input: Partial<ProviderInput>) {
    const existing = await this.prisma.providerChannel.findUnique({ where: { id } })
    if (!existing) throw new NotFoundException('上游渠道不存在')
    const template = input.templateId ? await this.prisma.providerTemplate.findUnique({ where: { id: input.templateId } }) : null
    if (input.templateId && !template) throw new BadRequestException('渠道模板不存在')
    const nextType = template?.type ?? input.type ?? existing.type
    const existingMetadata = asJsonRecord(existing.metadata)
    const metadata = input.templateId !== undefined
      ? { ...existingMetadata, ...(template ? { apiProtocol: template.apiProtocol, nativeSearchProvider: template.nativeSearchProvider } : {}), ...(input.metadata || {}) }
      : input.metadata
    const normalizedBaseUrl = input.baseUrl !== undefined
      ? await this.assertProviderEndpoint(input.baseUrl, nextType)
      : existing.baseUrl
    const endpointChanged = normalizedBaseUrl !== existing.baseUrl || (input.type !== undefined && input.type !== existing.type) || (template && template.type !== existing.type)
    const baseUrl = endpointChanged
      ? normalizedBaseUrl
      : existing.baseUrl
    const suppliedApiKey = input.apiKey === undefined ? undefined : input.apiKey.trim()
    const row = await this.prisma.providerChannel.update({ where: { id }, data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.templateId !== undefined ? { template: input.templateId ? { connect: { id: input.templateId } } : { disconnect: true } } : {}),
      ...(input.type !== undefined || template ? { type: nextType } : {}),
      ...(endpointChanged ? { baseUrl } : {}),
      ...(endpointChanged ? { lastHealthStatus: null, lastHealthMessage: '渠道地址已变更，请重新检测', lastHealthAt: null, cooldownUntil: null } : {}),
      ...(suppliedApiKey ? { encryptedApiKey: this.crypto.encrypt(suppliedApiKey), apiKeyHint: this.crypto.hint(suppliedApiKey), lastHealthStatus: null, lastHealthMessage: '密钥已轮换，等待重新检测', cooldownUntil: null } : {}),
      ...(suppliedApiKey === '' ? { encryptedApiKey: '', apiKeyHint: '' } : {}),
      ...(input.authType !== undefined || template ? { authType: template?.authType ?? input.authType } : {}),
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
      ...(input.weight !== undefined ? { weight: input.weight } : {}),
      ...(input.timeoutMs !== undefined ? { timeoutMs: input.timeoutMs } : {}),
      ...(nextType === ProviderType.POLLINATIONS || nextType === ProviderType.LOCAL_WORKER ? { allowUserKeys: false } : input.allowUserKeys !== undefined ? { allowUserKeys: input.allowUserKeys } : {}),
      ...(input.customHeaders !== undefined || template ? { customHeaders: (input.customHeaders ?? template?.customHeaders) as Prisma.InputJsonValue } : {}),
      ...(metadata !== undefined ? { metadata: metadata as Prisma.InputJsonValue } : {}),
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

  async fetchRemoteModels(id: string) {
    const provider = await this.prisma.providerChannel.findUnique({ where: { id } })
    if (!provider) throw new NotFoundException('上游渠道不存在')
    const apiKey = this.crypto.decrypt(provider.encryptedApiKey)
    if (!apiKey && provider.type !== ProviderType.POLLINATIONS && provider.type !== ProviderType.LOCAL_WORKER) throw new BadRequestException('请先配置渠道 API 密钥')
    const startedAt = Date.now()
    try {
      const baseUrl = await this.assertProviderEndpoint(provider.baseUrl, provider.type)
      if (provider.type === ProviderType.POLLINATIONS) {
        const url = this.buildPollinationsImageUrl(baseUrl, 'minimal blue circle on white background', { model: 'flux', width: 64, height: 64, seed: 1 })
        const response = await fetchPublicNoRedirect(url, { headers: this.headers(provider.customHeaders), signal: AbortSignal.timeout(Math.min(provider.timeoutMs, 30_000)) })
        const contentType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() || ''
        const declaredSize = Number(response.headers.get('content-length') || 0)
        if (!response.ok) throw upstreamHttpError('渠道图片接口', response.status)
        if (!contentType.startsWith('image/')) throw new UpstreamChannelError(`渠道返回了非图片内容：${contentType || '未知类型'}`)
        if (declaredSize > 5 * 1024 * 1024) throw new UpstreamChannelError('渠道健康检查返回的图片超过 5 MB')
        const bytes = new Uint8Array(await response.arrayBuffer())
        if (bytes.length < 64 || bytes.length > 5 * 1024 * 1024 || !hasSupportedImageSignature(bytes)) throw new UpstreamChannelError('渠道返回的图片数据无效')
        const models = ['flux']
        await this.prisma.providerChannel.update({ where: { id }, data: { lastHealthStatus: 'healthy', lastHealthMessage: `图片接口正常，${Date.now() - startedAt}ms`, lastHealthAt: new Date() } })
        const candidates = await this.describeDiscoveredModels(models)
        return { models, candidates: await this.adminDiscoveryStatus(id, candidates), latencyMs: Date.now() - startedAt }
      }
      if (provider.type === ProviderType.LOCAL_WORKER) {
        const headers = this.applyAuth(this.headers(provider.customHeaders), provider.authType, apiKey)
        const health = await fetchNoRedirect(`${baseUrl}/health`, { headers, signal: AbortSignal.timeout(Math.min(provider.timeoutMs, 30_000)) })
        if (!health.ok) throw upstreamHttpError('Worker 健康检查', health.status)
        const response = await fetchNoRedirect(`${baseUrl}/models`, { headers, signal: AbortSignal.timeout(Math.min(provider.timeoutMs, 30_000)) })
        const raw = await response.text()
        if (!response.ok) throw upstreamHttpError('Worker 模型目录', response.status)
        const parsed = JSON.parse(raw) as { data?: Array<string | { id?: string }>; models?: Array<string | { id?: string; name?: string }> }
        const models = remoteModelIds(parsed)
        if (!models.length) throw new UpstreamChannelError('Worker 未发布任何可用能力')
        await this.prisma.providerChannel.update({ where: { id }, data: { lastHealthStatus: 'healthy', lastHealthMessage: `Worker 正常，发现 ${models.length} 个能力，${Date.now() - startedAt}ms`, lastHealthAt: new Date() } })
        const candidates = await this.describeDiscoveredModels(parsed)
        return { models, candidates: await this.adminDiscoveryStatus(id, candidates), latencyMs: Date.now() - startedAt }
      }
      const catalog = await this.fetchCompatibleModelCatalog(baseUrl, this.applyAuth(this.headers(provider.customHeaders), provider.authType, apiKey), Math.min(provider.timeoutMs, 30_000))
      await this.prisma.providerChannel.update({ where: { id }, data: { lastHealthStatus: 'healthy', lastHealthMessage: `发现 ${catalog.models.length} 个模型，${Date.now() - startedAt}ms`, lastHealthAt: new Date() } })
      return { models: catalog.models, candidates: await this.adminDiscoveryStatus(id, catalog.candidates), latencyMs: Date.now() - startedAt }
    } catch (error) {
      const message = upstreamSafeMessage(error)
      this.logger.warn(`渠道 ${id} 模型发现失败：${error instanceof Error ? error.message : String(error)}`)
      await this.prisma.providerChannel.update({ where: { id }, data: { lastHealthStatus: 'unhealthy', lastHealthMessage: message, lastHealthAt: new Date() } })
      throw new BadRequestException(message)
    }
  }

  private async describeDiscoveredModels(payload: unknown, markupPercent?: number, forceRefresh = false) {
    return this.pricing.discover(payload, markupPercent, forceRefresh)
  }

  private async fetchCompatibleModelCatalog(baseUrl: string, headers: Record<string, string>, timeoutMs: number) {
    const paths = [`${baseUrl}/models`, `${baseUrl}/model/list`]
    let lastError: unknown
    for (const url of paths) {
      try {
        const response = await fetchPublicSameHostRedirects(url, { headers, signal: AbortSignal.timeout(timeoutMs) })
        const raw = await response.text()
        if (!response.ok) {
          lastError = upstreamHttpError('渠道模型目录', response.status)
          if (response.status === 404 || response.status === 405) continue
          throw lastError
        }
        let parsed: unknown
        try {
          parsed = JSON.parse(raw) as unknown
        } catch {
          lastError = new UpstreamChannelError('渠道模型目录不是可解析的 JSON')
          continue
        }
        const candidates = await this.describeDiscoveredModels(parsed)
        if (!candidates.length) {
          lastError = new UpstreamChannelError('渠道未返回可识别的模型列表')
          continue
        }
        return { candidates, models: candidates.map((item) => item.id) }
      } catch (error) {
        lastError = error
      }
    }
    throw lastError instanceof Error ? lastError : new UpstreamChannelError('渠道未返回可识别的模型列表')
  }

  async modelPricingComparison(markupPercent?: number, forceRefresh = true) {
    return this.pricing.comparison(markupPercent, forceRefresh)
  }

  async applyModelPricing(input: { modelIds: string[]; markupPercent?: number }) {
    return this.pricing.apply(input, (id, update) => this.updateModel(id, update))
  }

  private async adminDiscoveryStatus(providerId: string, candidates: DiscoveredModel[]) {
    const ids = candidates.map((item) => item.id)
    const existing = await this.prisma.modelPreset.findMany({
      where: { OR: [{ upstreamModel: { in: ids } }, { providerRoutes: { some: { providerId, upstreamModelOverride: { in: ids } } } }] },
      select: { id: true, key: true, upstreamModel: true, providerRoutes: { where: { providerId }, select: { upstreamModelOverride: true } } },
    })
    const status = new Map<string, { id: string; key: string }>()
    for (const model of existing) {
      status.set(model.upstreamModel, { id: model.id, key: model.key })
      for (const route of model.providerRoutes) if (route.upstreamModelOverride) status.set(route.upstreamModelOverride, { id: model.id, key: model.key })
    }
    return candidates.map((candidate) => ({ ...candidate, existingPreset: status.get(candidate.id) || null }))
  }

  private importedModelKey(modelId: string) {
    return modelId.toLowerCase().replace(/^models\//, '').replace(/[^a-z0-9._:-]+/g, '-').replace(/^-|-$/g, '').slice(0, 96) || `model-${Date.now().toString(36)}`
  }

  private discoveredModelOptions(candidate: DiscoveredModel, apiProtocol = 'openai') {
    const discovery = { source: candidate.pricingSource, confidence: candidate.confidence, contextWindow: candidate.contextWindow, maxOutputTokens: candidate.maxOutputTokens, features: candidate.features, importedAt: new Date().toISOString() }
    if (candidate.capability === ModelCapability.IMAGE) return {
      apiProtocol,
      discovery,
      imageCapabilities: { sizes: ['1024x1024'], qualities: ['medium'], outputFormats: ['png'], backgrounds: ['opaque'], maxCount: 1, defaultSize: '1024x1024', defaultQuality: 'medium', supportsReference: false, supportsMask: false, resolutionPricing: { '1K': Math.max(1, candidate.flatCreditCost || 1) } },
    }
    if (candidate.capability === ModelCapability.VIDEO) {
      const perSecond = Math.max(1, candidate.flatCreditCost || 1)
      return {
        apiProtocol,
        discovery,
        videoCapabilities: { resolutions: ['720p'], durations: [5, 10], aspectRatios: ['16:9', '9:16', '1:1'], defaultResolution: '720p', defaultDuration: 5, defaultAspectRatio: '16:9', pricing: { '720p:5': perSecond * 5, '720p:10': perSecond * 10 }, createPath: '/videos', statusPath: '/videos/{id}', contentPath: '/videos/{id}/content', pollIntervalMs: 3000, maxPollSeconds: 600 },
      }
    }
    return { apiProtocol, discovery, agentEnabled: candidate.agentCapabilities?.eligible !== false, agentCapabilities: candidate.agentCapabilities }
  }

  async agentModelProfile(userId: string, requestedModel: string) {
    const normalized = requestedModel.trim()
    const models = await this.listModelsForUser(userId, ModelCapability.CHAT)
    const model = models.find((item) => item.key === normalized || item.displayName === normalized || item.upstreamModel === normalized)
    if (!model) throw new BadRequestException('当前账户不能使用这个 Agent 模型，请重新选择')
    const options = model.options && typeof model.options === 'object' && !Array.isArray(model.options) ? model.options as Record<string, unknown> : {}
    const capabilities = options.agentCapabilities && typeof options.agentCapabilities === 'object' && !Array.isArray(options.agentCapabilities)
      ? options.agentCapabilities as Record<string, unknown>
      : {}
    const discovery = options.discovery && typeof options.discovery === 'object' && !Array.isArray(options.discovery)
      ? options.discovery as Record<string, unknown>
      : {}
    const contextWindow = Number(capabilities.contextWindow ?? discovery.contextWindow ?? 0) || null
    const explicitlyEnabled = options.agentEnabled
    const eligible = explicitlyEnabled !== false && (explicitlyEnabled === true || !contextWindow || contextWindow >= 8192) && capabilities.eligible !== false
    const reason = String(capabilities.reason || (eligible ? '可用于 Xinyue Agent 服务端编排' : '模型已被管理员停用 Agent 能力'))
    if (!eligible) throw new BadRequestException(`模型“${model.displayName}”不适合 Agent 任务：${reason}`)
    return {
      key: model.key,
      displayName: model.displayName,
      source: model.source,
      contextWindow,
      maxOutputTokens: Number(capabilities.maxOutputTokens ?? discovery.maxOutputTokens ?? 0) || null,
      supportsTools: capabilities.supportsTools === true,
      supportsStructuredOutput: capabilities.supportsStructuredOutput === true,
      supportsReasoning: capabilities.supportsReasoning === true,
      reason,
    }
  }

  async importProviderModels(providerId: string, input: { modelIds?: string[]; importAll?: boolean; markupPercent?: number; overwritePricing?: boolean }) {
    const provider = await this.prisma.providerChannel.findUnique({ where: { id: providerId }, include: { template: true } })
    if (!provider) throw new NotFoundException('上游渠道不存在')
    const discovered = await this.fetchRemoteModels(providerId)
    const selected = new Set((input.importAll ? discovered.candidates.filter((item) => item.importable).map((item) => item.id) : input.modelIds || []).map((item) => item.trim()))
    if (!selected.size) throw new BadRequestException('请选择需要导入的模型')
    const candidates = input.markupPercent === undefined
      ? discovered.candidates
      : await this.describeDiscoveredModels(discovered.candidates.map((item) => ({ id: item.id })), input.markupPercent)
    const importable = candidates.filter((item) => selected.has(item.id) && item.importable && item.capability)
    if (!importable.length) throw new BadRequestException('选择的模型不属于当前可导入能力')
    const defaultCapabilities = new Set((await this.prisma.modelPreset.findMany({ where: { isDefault: true }, select: { capability: true } })).map((item) => item.capability))
    const result: Array<{ id: string; key: string; modelId: string; action: 'created' | 'routed' | 'updated' }> = []
    for (const candidate of importable) {
      const capability = candidate.capability!
      const vendor = await this.prisma.modelVendor.upsert({
        where: { key: candidate.vendorKey },
        update: { name: candidate.vendorName },
        create: { key: candidate.vendorKey, name: candidate.vendorName, sortOrder: candidate.vendorKey === 'other' ? 999 : 500 },
      })
      const aliases = [...new Set([candidate.id, candidate.id.replace(/^[^/]+\//, '')].map((item) => item.trim()).filter(Boolean))]
      const aliasKeys = aliases.map((item) => this.importedModelKey(item))
      const baseKey = this.importedModelKey(candidate.id)
      let model = await this.prisma.modelPreset.findFirst({ where: { capability, OR: [{ key: { in: aliasKeys } }, { upstreamModel: { in: aliases } }] } })
      let action: 'created' | 'routed' | 'updated' = 'routed'
      if (!model) {
        let key = baseKey
        if (await this.prisma.modelPreset.count({ where: { key } })) key = `${candidate.vendorKey}-${baseKey}`.slice(0, 100)
        const isDefault = !defaultCapabilities.has(capability)
        model = await this.createModel({
          key,
          displayName: candidate.displayName,
          description: `${candidate.vendorName} · 自动发现`,
          vendorId: vendor.id,
          upstreamModel: candidate.id,
          capability,
          enabled: true,
          isDefault,
          allowUserKey: true,
          sortOrder: 500,
          flatCreditCost: candidate.flatCreditCost,
          inputCreditsPerMillion: candidate.inputCreditsPerMillion,
          outputCreditsPerMillion: candidate.outputCreditsPerMillion,
          inputCostMicrosPerMillion: candidate.inputCostMicrosPerMillion,
          outputCostMicrosPerMillion: candidate.outputCostMicrosPerMillion,
          imageCostMicros: candidate.imageCostMicros,
          videoCostMicros: candidate.videoCostMicros,
          badge: candidate.pricingSource === 'none' ? '待定价' : '自动定价',
          options: this.discoveredModelOptions(candidate, String(provider.template?.apiProtocol || asJsonRecord(provider.metadata).apiProtocol || 'openai')),
        })
        defaultCapabilities.add(capability)
        action = 'created'
      } else if (input.overwritePricing || !model.enabled || model.vendorId !== vendor.id) {
        model = await this.updateModel(model.id, {
          ...(!model.enabled ? { enabled: true } : {}),
          ...(model.vendorId !== vendor.id ? { vendorId: vendor.id } : {}),
          ...(input.overwritePricing ? {
            inputCreditsPerMillion: candidate.inputCreditsPerMillion,
            outputCreditsPerMillion: candidate.outputCreditsPerMillion,
            inputCostMicrosPerMillion: candidate.inputCostMicrosPerMillion,
            outputCostMicrosPerMillion: candidate.outputCostMicrosPerMillion,
            imageCostMicros: candidate.imageCostMicros,
            videoCostMicros: candidate.videoCostMicros,
            ...(candidate.flatCreditCost ? { flatCreditCost: candidate.flatCreditCost } : {}),
          } : {}),
        })
        action = input.overwritePricing ? 'updated' : 'routed'
      }
      const routeOptions = candidate.capability === ModelCapability.VIDEO
        ? { videoCapabilities: (this.discoveredModelOptions(candidate) as Record<string, unknown>).videoCapabilities } as Prisma.InputJsonValue
        : undefined
      await this.prisma.modelProviderRoute.upsert({
        where: { modelPresetId_providerId: { modelPresetId: model.id, providerId } },
        update: { upstreamModelOverride: candidate.id, enabled: true, inputCostMicrosPerMillion: candidate.inputCostMicrosPerMillion || null, outputCostMicrosPerMillion: candidate.outputCostMicrosPerMillion || null, imageCostMicros: candidate.imageCostMicros || null, videoCostMicros: candidate.videoCostMicros || null, ...(routeOptions ? { options: routeOptions } : {}) },
        create: { modelPresetId: model.id, providerId, upstreamModelOverride: candidate.id, enabled: true, inputCostMicrosPerMillion: candidate.inputCostMicrosPerMillion || null, outputCostMicrosPerMillion: candidate.outputCostMicrosPerMillion || null, imageCostMicros: candidate.imageCostMicros || null, videoCostMicros: candidate.videoCostMicros || null, ...(routeOptions ? { options: routeOptions } : {}) },
      })
      result.push({ id: model.id, key: model.key, modelId: candidate.id, action })
    }
    return { discovered: discovered.models.length, availableModels: discovered.models, selected: selected.size, imported: result.length, models: result }
  }

  async cancelLocalWorkerTask(providerChannelId: string, taskId: string) {
    const provider = await this.prisma.providerChannel.findUnique({ where: { id: providerChannelId } })
    if (!provider || provider.type !== ProviderType.LOCAL_WORKER) return { requested: false, reason: 'not-local-worker' }
    const baseUrl = await this.assertProviderEndpoint(provider.baseUrl, provider.type)
    const apiKey = this.crypto.decrypt(provider.encryptedApiKey)
    let response: Response
    try {
      response = await fetchNoRedirect(`${baseUrl}/tasks/${encodeURIComponent(taskId)}/cancel`, {
        method: 'POST',
        headers: this.applyAuth(this.headers(provider.customHeaders), provider.authType, apiKey),
        signal: AbortSignal.timeout(Math.min(provider.timeoutMs, 5_000)),
      })
    } catch (error) {
      throw new ServiceUnavailableException(`本地 Worker 取消请求失败：${error instanceof Error ? error.message : '网络错误'}`)
    }
    if (!response.ok && response.status !== 404 && response.status !== 409) throw new ServiceUnavailableException(`本地 Worker 取消请求返回 ${response.status}`)
    return { requested: true, acknowledged: response.ok, status: response.status }
  }

  async checkAllProviders() {
    const providers = await this.prisma.providerChannel.findMany({ where: { enabled: true }, select: { id: true, name: true } })
    // 分批并发探测，避免渠道多时同时对全部上游发起连接形成洪峰
    const results: Array<{ id: string; name: string; healthy: boolean; latencyMs: number | null; modelCount: number; error: string }> = []
    const batchSize = 10
    for (let offset = 0; offset < providers.length; offset += batchSize) {
      const batch = providers.slice(offset, offset + batchSize)
      results.push(...await Promise.all(batch.map(async (provider) => {
        try {
          const result = await this.fetchRemoteModels(provider.id)
          return { id: provider.id, name: provider.name, healthy: true, latencyMs: result.latencyMs, modelCount: result.models.length, error: '' }
        } catch (reason) {
          return { id: provider.id, name: provider.name, healthy: false, latencyMs: null, modelCount: 0, error: reason instanceof Error ? reason.message : '连接失败' }
        }
      })))
    }
    return { checked: results.length, healthy: results.filter((item) => item.healthy).length, unhealthy: results.filter((item) => !item.healthy).length, results }
  }

  async resetProviderHealth(id: string) {
    const result = await this.prisma.providerChannel.updateMany({ where: { id }, data: { consecutiveFailures: 0, cooldownUntil: null, lastHealthStatus: null, lastHealthMessage: '管理员已清除故障状态，等待下次检测' } })
    if (!result.count) throw new NotFoundException('上游渠道不存在')
    return { reset: true }
  }

  async listModels(capability?: ModelCapability, includeDisabled = false) {
    if (includeDisabled) {
      const models = await this.prisma.modelPreset.findMany({ where: { ...(capability ? { capability } : {}) }, orderBy: [{ capability: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }], include: { vendor: true, provider: { select: { id: true, name: true, type: true, enabled: true, encryptedApiKey: true, lastHealthStatus: true, cooldownUntil: true } }, providerRoutes: { orderBy: { createdAt: 'asc' }, include: { provider: { select: { id: true, name: true, type: true, enabled: true, priority: true, weight: true, cooldownUntil: true, encryptedApiKey: true, lastHealthStatus: true } } } } } })
      return models.map(({ provider, providerRoutes, ...model }) => {
        const activeRoutes = providerRoutes.filter((route) => route.enabled)
        const routeCount = Number(this.providerPublished(provider)) + activeRoutes.filter((route) => this.providerPublished(route.provider)).length
        const healthyRouteCount = Number(this.providerHealthy(provider)) + activeRoutes.filter((route) => this.providerHealthy(route.provider)).length
        return {
          ...model,
          availability: healthyRouteCount ? 'AVAILABLE' : routeCount ? 'DEGRADED' : 'UNCONFIGURED',
          availabilityReason: this.modelAvailabilityReason(provider, providerRoutes, routeCount),
          healthyRouteCount,
          routeCount,
          provider: provider ? this.publicProvider(provider) : null,
          providerRoutes: providerRoutes.map(({ provider: routeProvider, ...route }) => ({ ...route, provider: this.publicProvider(routeProvider) })),
        }
      })
    }
    const models = await this.prisma.modelPreset.findMany({ where: { enabled: true, ...(capability ? { capability } : {}) }, orderBy: [{ capability: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }], include: { vendor: true, provider: { select: { id: true, name: true, type: true, enabled: true, encryptedApiKey: true, lastHealthStatus: true, cooldownUntil: true } }, providerRoutes: { where: { enabled: true }, orderBy: { createdAt: 'asc' }, include: { provider: { select: { id: true, name: true, type: true, enabled: true, priority: true, weight: true, cooldownUntil: true, encryptedApiKey: true, lastHealthStatus: true } } } } } })
    return models.map(({ provider, providerRoutes, ...model }) => {
      const routeCount = Number(this.providerPublished(provider)) + providerRoutes.filter((route) => this.providerPublished(route.provider)).length
      const healthyRouteCount = Number(this.providerHealthy(provider)) + providerRoutes.filter((route) => this.providerHealthy(route.provider)).length
      return {
        ...model,
        availability: healthyRouteCount ? 'AVAILABLE' : routeCount ? 'DEGRADED' : 'UNCONFIGURED',
        availabilityReason: this.modelAvailabilityReason(provider, providerRoutes, routeCount),
        healthyRouteCount,
        routeCount,
        options: model.capability === ModelCapability.VIDEO ? this.effectiveVideoOptions(model.options, providerRoutes, provider) : model.options,
        provider: provider ? this.publicProvider(provider) : null,
        providerRoutes: providerRoutes.map(({ provider: routeProvider, ...route }) => ({ ...route, provider: this.publicProvider(routeProvider) })),
      }
    })
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
    const [models, privateModels, settings] = await Promise.all([
      this.prisma.modelPreset.findMany({ where: { enabled: true, ...(capability ? { capability } : {}), ...(policy.restrictModels ? { id: { in: policy.allowedModelIds } } : {}) }, orderBy: [{ capability: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }], include: { vendor: true, provider: { select: { id: true, name: true, type: true, enabled: true, encryptedApiKey: true, lastHealthStatus: true, cooldownUntil: true } }, providerRoutes: { where: { enabled: true }, select: { id: true, providerId: true, options: true, provider: { select: { type: true, enabled: true, encryptedApiKey: true, lastHealthStatus: true, cooldownUntil: true } } } } } }),
      this.prisma.userModel.findMany({ where: { userId, enabled: true, ...(capability ? { capability } : {}) }, orderBy: [{ capability: 'asc' }, { isDefault: 'desc' }, { createdAt: 'asc' }], include: { vendor: true, routes: { where: { enabled: true }, include: { credential: { select: { enabled: true, lastHealthStatus: true, cooldownUntil: true } } } } } }),
      this.prisma.systemSetting.findUnique({ where: { id: 'global' } }),
    ])
    const platformModels = models.map((model) => {
      const override = policy.costOverrides.get(model.id)
      const effectiveCreditCost = override ?? Math.ceil(model.flatCreditCost * policy.creditRatePercent / 100)
      const routeCount = Number(this.providerPublished(model.provider)) + model.providerRoutes.filter((route) => this.providerPublished(route.provider)).length
      const healthyRouteCount = Number(this.providerHealthy(model.provider)) + model.providerRoutes.filter((route) => this.providerHealthy(route.provider)).length
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
        source: 'PLATFORM',
        provider: provider ? this.publicProvider(provider) : null,
        providerRoutes: providerRoutes.map(({ provider: _provider, ...route }) => route),
        options,
        effectiveCreditCost,
        availability: healthyRouteCount ? 'AVAILABLE' : routeCount ? 'DEGRADED' : 'UNCONFIGURED',
        availabilityReason: this.modelAvailabilityReason(model.provider, model.providerRoutes, routeCount),
        healthyRouteCount,
        routeCount,
      }
    })
    const now = Date.now()
    const userModels = privateModels.map(({ routes, ...model }) => {
      const healthyRoutes = routes.filter((route) => route.credential.enabled && (!route.cooldownUntil || route.cooldownUntil.getTime() <= now) && route.lastHealthStatus !== 'unhealthy' && route.credential.lastHealthStatus !== 'unhealthy')
      return {
        ...model,
        source: 'USER',
        upstreamModel: routes[0]?.upstreamModel || '',
        flatCreditCost: 0,
        effectiveCreditCost: 0,
        inputCreditsPerMillion: 0,
        outputCreditsPerMillion: 0,
        baseInputCreditsPerMillion: 0,
        baseOutputCreditsPerMillion: 0,
        badge: '我的模型',
        healthyRouteCount: healthyRoutes.length,
        routeCount: routes.length,
        availability: healthyRoutes.length ? 'AVAILABLE' : routes.length ? 'DEGRADED' : 'UNCONFIGURED',
        provider: null,
        providerRoutes: [],
      }
    })
    if (settings?.userByokEnabled && policy.allowUserByok) {
      const inject = [ModelCapability.CHAT, ModelCapability.IMAGE, ModelCapability.VIDEO].filter((item) => (!capability || capability === item) && !userModels.some((model) => model.capability === item))
      if (inject.length) {
        const credentialCount = await this.prisma.userApiCredential.count({ where: { userId, enabled: true, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } })
        if (credentialCount) {
          for (const item of inject) {
            userModels.push(this.virtualByokCatalogModel(userId, item, credentialCount) as (typeof userModels)[number])
          }
        }
      }
    }
    return [...platformModels, ...userModels]
  }

  async createModel(input: Prisma.ModelPresetUncheckedCreateInput) {
    if (input.isDefault) await this.prisma.modelPreset.updateMany({ where: { capability: input.capability }, data: { isDefault: false } })
    return this.prisma.$transaction(async (tx) => {
      const model = await tx.modelPreset.create({ data: input, include: { provider: { select: { id: true, name: true, type: true, enabled: true } }, providerRoutes: { include: { provider: { select: { id: true, name: true, type: true, enabled: true } } } } } })
      await tx.modelPriceVersion.create({ data: { modelPresetId: model.id, version: 1, ...modelPricingFields(model) } })
      return model
    })
  }

  async updateModel(id: string, input: Prisma.ModelPresetUncheckedUpdateInput) {
    const existing = await this.prisma.modelPreset.findUnique({ where: { id } })
    if (!existing) throw new NotFoundException('模型预设不存在')
    const capability = typeof input.capability === 'string' ? input.capability : existing.capability
    if (input.isDefault === true) await this.prisma.modelPreset.updateMany({ where: { capability, id: { not: id } }, data: { isDefault: false } })
    return this.prisma.$transaction(async (tx) => {
      const model = await tx.modelPreset.update({ where: { id }, data: input, include: { provider: { select: { id: true, name: true, type: true, enabled: true } }, providerRoutes: { include: { provider: { select: { id: true, name: true, type: true, enabled: true } } } } } })
      if (JSON.stringify(modelPricingFields(existing)) !== JSON.stringify(modelPricingFields(model))) {
        const latest = await tx.modelPriceVersion.aggregate({ where: { modelPresetId: id }, _max: { version: true } })
        await tx.modelPriceVersion.create({ data: { modelPresetId: id, version: (latest._max.version || 0) + 1, ...modelPricingFields(model) } })
      }
      return model
    })
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

  async modelPriceVersions(modelPresetId: string) {
    if (!await this.prisma.modelPreset.count({ where: { id: modelPresetId } })) throw new NotFoundException('模型预设不存在')
    return this.prisma.modelPriceVersion.findMany({ where: { modelPresetId }, orderBy: { version: 'desc' }, take: 100 })
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
      ...safe
    } = row
    const chatHomeContent = normalizeChatHomeContent(row.chatHomeContent)
    if (admin) return {
      ...safe,
      ...presentSystemNav(row.sidebarNav, row.workspaceNav),
      chatHomeContent,
      quickActionRegistry: await this.capabilities.snapshot(chatHomeContent.quickActions),
      siteContent: normalizeSiteContent(row.siteContent),
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
      ...presentSystemNav(row.sidebarNav, row.workspaceNav),
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
      chatAvatarMotion: row.chatAvatarMotion,
      chatAvatarEnabled: row.chatAvatarEnabled,
      chatAvatarStyle: row.chatAvatarStyle,
      chatAvatarColor: row.chatAvatarColor,
      chatHomeContent: {
        ...chatHomeContent,
        // Live hot topics are served by /v1/catalog/recommendations. Never
        // expose an old manually saved list as if it were current data.
        doubaoRecommendations: [],
        quickActions: await this.capabilities.filterPublished(chatHomeContent.quickActions),
      },
      siteContent: normalizeSiteContent(row.siteContent),
      imagePromptEnabled: row.imagePromptEnabled,
      imagePromptBillingMode: row.imagePromptBillingMode,
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
    const { smtpPassword, linuxDoClientSecret, chatHomeContent, siteContent, sidebarNav, workspaceNav, sectionNav, ...settings } = input
    const data: Prisma.SystemSettingUpdateInput = { ...settings }
    if (chatHomeContent) data.chatHomeContent = normalizeChatHomeContent(chatHomeContent) as Prisma.InputJsonValue
    if (siteContent) data.siteContent = normalizeSiteContent(siteContent) as unknown as Prisma.InputJsonValue
    if (sidebarNav !== undefined) {
      const nav = sanitizeSidebarNav(sidebarNav, SIDEBAR_AND_NESTED_KEYS)
      data.sidebarNav = nav as Prisma.InputJsonValue
      const hidden = new Set(nav.hidden)
      data.sidebarCreationEnabled = !hidden.has('creation')
      data.sidebarCommerceEnabled = !hidden.has('commerce')
      data.sidebarOfficeEnabled = !hidden.has('office')
      data.sidebarPromptsEnabled = !hidden.has('prompts')
      data.sidebarPluginsEnabled = !hidden.has('plugins')
    }
    if (workspaceNav !== undefined || sectionNav !== undefined) {
      const nav = packWorkspaceNav(workspaceNav, sectionNav)
      data.workspaceNav = nav as Prisma.InputJsonValue
      const hidden = new Set(nav.hidden)
      data.sidebarProjectsEnabled = !hidden.has('projects')
      data.sidebarAssetsEnabled = !hidden.has('files')
      data.imagePromptEnabled = !hidden.has('image-prompts')
    }
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
    if (input.providerType === ProviderType.LOCAL_WORKER) throw new BadRequestException('本地 Worker 只能由管理员配置')
    if (!input.apiKey?.trim()) throw new BadRequestException('请输入 API 密钥')
    const settings = await this.prisma.systemSetting.findUnique({ where: { id: 'global' } })
    if (!settings?.userByokEnabled) throw new BadRequestException('管理员未开放用户 API 密钥')
    if (!(await this.userPolicy(userId)).allowUserByok) throw new ForbiddenException('当前用户分组或套餐不允许使用个人 API 密钥')
    const baseUrl = await this.assertUserProviderUrl(input.baseUrl)
    if (input.isDefault) await this.prisma.userApiCredential.updateMany({ where: { userId }, data: { isDefault: false } })
    const row = await this.prisma.userApiCredential.create({ data: { userId, name: input.name.trim(), templateId: input.templateId || null, providerType: input.providerType, baseUrl, encryptedApiKey: this.crypto.encrypt(input.apiKey), apiKeyHint: this.crypto.hint(input.apiKey), authType: input.authType, enabled: input.enabled, isDefault: input.isDefault, priority: input.priority ?? 0, weight: input.weight ?? 100, customHeaders: input.customHeaders as Prisma.InputJsonValue, lastRotatedAt: new Date(), expiresAt: input.expiresAt ? new Date(input.expiresAt) : null } })
    return this.publicCredential(row)
  }

  async updateCredential(userId: string, id: string, input: Partial<CredentialInput>) {
    const existing = await this.prisma.userApiCredential.findFirst({ where: { id, userId } })
    if (!existing) throw new NotFoundException('API 凭据不存在')
    if (!(await this.userPolicy(userId)).allowUserByok) throw new ForbiddenException('当前用户分组或套餐不允许使用个人 API 密钥')
    if (input.providerType === ProviderType.LOCAL_WORKER || existing.providerType === ProviderType.LOCAL_WORKER) throw new BadRequestException('本地 Worker 只能由管理员配置')
    if (input.isDefault) await this.prisma.userApiCredential.updateMany({ where: { userId, id: { not: id } }, data: { isDefault: false } })
    const suppliedApiKey = input.apiKey === undefined ? undefined : input.apiKey.trim()
    const credentialChanged = input.baseUrl !== undefined || input.providerType !== undefined || input.authType !== undefined || input.customHeaders !== undefined || suppliedApiKey !== undefined
    const healthReset = { lastHealthStatus: null, lastHealthMessage: '凭据配置已变更，请重新检测', lastHealthAt: null, cooldownUntil: null }
    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.userApiCredential.update({ where: { id }, data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.templateId !== undefined ? { templateId: input.templateId || null } : {}),
      ...(input.providerType !== undefined ? { providerType: input.providerType } : {}),
      ...(input.baseUrl !== undefined ? { baseUrl: await this.assertUserProviderUrl(input.baseUrl) } : {}),
      ...(credentialChanged ? healthReset : {}),
      ...(suppliedApiKey ? { encryptedApiKey: this.crypto.encrypt(suppliedApiKey), apiKeyHint: this.crypto.hint(suppliedApiKey), lastRotatedAt: new Date() } : {}),
      ...(suppliedApiKey === '' ? { encryptedApiKey: '', apiKeyHint: '' } : {}),
      ...(input.authType !== undefined ? { authType: input.authType } : {}),
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      ...(input.isDefault !== undefined ? { isDefault: input.isDefault } : {}),
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
      ...(input.weight !== undefined ? { weight: input.weight } : {}),
      ...(input.customHeaders !== undefined ? { customHeaders: input.customHeaders as Prisma.InputJsonValue } : {}),
      ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt ? new Date(input.expiresAt) : null } : {}),
      } })
      if (credentialChanged) await tx.userModelRoute.updateMany({ where: { credentialId: id }, data: { lastHealthStatus: null, lastHealthMessage: '凭据配置已变更，请重新检测', lastHealthAt: null, consecutiveFailures: 0, cooldownUntil: null } })
      return updated
    })
    return this.publicCredential(row)
  }

  async rotateCredential(userId: string, id: string, apiKey: string, expiresAt?: string | null) {
    if (!(await this.userPolicy(userId)).allowUserByok) throw new ForbiddenException('当前用户分组或套餐不允许使用个人 API 密钥')
    const row = await this.prisma.userApiCredential.findFirst({ where: { id, userId } })
    if (!row) throw new NotFoundException('API 凭据不存在')
    const updated = await this.prisma.userApiCredential.update({ where: { id }, data: {
      encryptedApiKey: this.crypto.encrypt(apiKey), apiKeyHint: this.crypto.hint(apiKey), lastRotatedAt: new Date(),
      expiresAt: expiresAt ? new Date(expiresAt) : expiresAt === null ? null : row.expiresAt,
      lastHealthStatus: null, lastHealthMessage: '密钥已轮换，等待重新检测', lastHealthAt: null, cooldownUntil: null,
    } })
    return this.publicCredential(updated)
  }

  async credentialUsage(userId: string, id?: string) {
    const rows = await this.prisma.userApiCredential.findMany({ where: { userId, ...(id ? { id } : {}) }, orderBy: [{ lastUsedAt: 'desc' }, { createdAt: 'asc' }] })
    if (id && !rows.length) throw new NotFoundException('API 凭据不存在')
    const since = new Date(Date.now() - 30 * 86_400_000)
    const jobs = await this.prisma.generationJob.groupBy({ by: ['userCredentialId', 'status'], where: { userId, userCredentialId: { in: rows.map((row) => row.id) }, createdAt: { gte: since } }, _count: { _all: true }, _sum: { inputTokens: true, outputTokens: true, upstreamCostMicros: true } })
    return rows.map((row) => ({ ...this.publicCredential(row), usage30d: jobs.filter((job) => job.userCredentialId === row.id).reduce((summary, job) => ({ requests: summary.requests + job._count._all, succeeded: summary.succeeded + (job.status === 'SUCCEEDED' ? job._count._all : 0), failed: summary.failed + (job.status === 'FAILED' ? job._count._all : 0), inputTokens: summary.inputTokens + Number(job._sum.inputTokens || 0), outputTokens: summary.outputTokens + Number(job._sum.outputTokens || 0) }), { requests: 0, succeeded: 0, failed: 0, inputTokens: 0, outputTokens: 0 }) }))
  }

  adminByokSummary() {
    const since = new Date(Date.now() - 30 * 86_400_000)
    return Promise.all([
      this.prisma.userApiCredential.count(),
      this.prisma.userApiCredential.count({ where: { enabled: true } }),
      this.prisma.userApiCredential.count({ where: { OR: [{ expiresAt: { lte: new Date(Date.now() + 14 * 86_400_000) } }, { lastHealthStatus: 'unhealthy' }] } }),
      this.prisma.generationJob.aggregate({ where: { userCredentialId: { not: null }, createdAt: { gte: since } }, _count: { _all: true }, _sum: { inputTokens: true, outputTokens: true } }),
      this.prisma.userApiCredential.findMany({ orderBy: [{ lastUsedAt: 'desc' }, { createdAt: 'desc' }], take: 200, include: { user: { select: { id: true, displayName: true, email: true } }, _count: { select: { generationJobs: true, modelRoutes: true } } } }),
    ]).then(([total, enabled, attention, usage, credentials]) => ({ total, enabled, attention, usage: { requests: usage._count._all, inputTokens: Number(usage._sum.inputTokens || 0), outputTokens: Number(usage._sum.outputTokens || 0) }, credentials: credentials.map((row) => this.publicCredential(row)) }))
  }

  async deleteCredential(userId: string, id: string) {
    const result = await this.prisma.userApiCredential.deleteMany({ where: { id, userId } })
    if (!result.count) throw new NotFoundException('API 凭据不存在')
    return { success: true }
  }

  async discoverCredentialModels(userId: string, id: string) {
    const credential = await this.prisma.userApiCredential.findFirst({ where: { id, userId }, include: { template: true } })
    if (!credential) throw new NotFoundException('API 凭据不存在')
    if (credential.template && !credential.template.supportsDiscovery) throw new BadRequestException('该渠道不提供模型列表，请手动填写模型 ID 后执行最小调用验证')
    const startedAt = Date.now()
    try {
      const apiKey = this.crypto.decrypt(credential.encryptedApiKey)
      const baseUrl = await this.assertUserProviderUrl(credential.baseUrl)
      const catalog = await this.fetchCompatibleModelCatalog(
        baseUrl,
        this.applyAuth(this.headers(credential.customHeaders), credential.authType, apiKey),
        30_000,
      )
      const latencyMs = Date.now() - startedAt
      await this.prisma.userApiCredential.update({ where: { id }, data: { lastHealthStatus: 'healthy', lastHealthMessage: `发现 ${catalog.models.length} 个模型，${latencyMs}ms`, lastHealthAt: new Date(), lastSuccessAt: new Date(), cooldownUntil: null } })
      return { models: catalog.models, candidates: catalog.candidates, latencyMs }
    } catch (error) {
      const message = upstreamSafeMessage(error)
      this.logger.warn(`用户凭据 ${id} 模型发现失败：${error instanceof Error ? error.message : String(error)}`)
      await this.prisma.userApiCredential.update({ where: { id }, data: { lastHealthStatus: 'unhealthy', lastHealthMessage: message, lastHealthAt: new Date(), lastFailureAt: new Date() } })
      throw new BadRequestException(message)
    }
  }

  async importCredentialModels(userId: string, credentialId: string, input: { modelIds?: string[]; importAll?: boolean }) {
    if (!(await this.userPolicy(userId)).allowUserByok) throw new ForbiddenException('当前用户分组或套餐不允许使用个人 API 密钥')
    const credential = await this.prisma.userApiCredential.findFirst({ where: { id: credentialId, userId }, include: { template: true } })
    if (!credential) throw new NotFoundException('API 凭据不存在')
    const discovered = await this.discoverCredentialModels(userId, credentialId)
    const importable = discovered.candidates.filter((item) => item.importable && item.capability)
    const fallback = discovered.candidates.filter((item) => item.capability)
    const selected = new Set((input.importAll
      ? (importable.length ? importable : fallback).map((item) => item.id)
      : input.modelIds || []).map((item) => item.trim()))
    if (!selected.size) throw new BadRequestException('请选择需要导入的模型')
    const candidates = discovered.candidates.filter((item) => selected.has(item.id) && (item.capability || item.importable)).map((item) => ({ ...item, capability: item.capability || ModelCapability.CHAT }))
    if (!candidates.length) throw new BadRequestException('选择的模型不属于当前可导入能力')
    const defaultCapabilities = new Set((await this.prisma.userModel.findMany({ where: { userId, isDefault: true }, select: { capability: true } })).map((item) => item.capability))
    // 整批导入包进事务：中途失败不留半导入的模型/路由，也不必每个候选 3-4 次独立往返
    const models = await this.prisma.$transaction(async (tx) => {
      const imported: Array<{ id: string; key: string; modelId: string }> = []
      for (const candidate of candidates) {
        const capability = candidate.capability!
        const vendor = await tx.modelVendor.upsert({ where: { key: candidate.vendorKey }, update: {}, create: { key: candidate.vendorKey, name: candidate.vendorName, sortOrder: candidate.vendorKey === 'other' ? 999 : 500 } })
        let model = await tx.userModel.findFirst({ where: { userId, capability, routes: { some: { upstreamModel: candidate.id } } } })
        if (!model) {
          const isDefault = !defaultCapabilities.has(capability)
          model = await tx.userModel.create({ data: {
            userId,
            vendorId: vendor.id,
            key: this.privateModelKey(userId, candidate.id),
            displayName: candidate.displayName,
            description: `${candidate.vendorName} · 由 ${credential.name} 自动识别`,
            capability,
            apiProtocol: credential.template?.apiProtocol || 'openai',
            routingStrategy: 'PRIORITY',
            enabled: true,
            isDefault,
            options: { ...this.discoveredModelOptions(candidate, credential.template?.apiProtocol || 'openai'), discovery: { ...(this.discoveredModelOptions(candidate).discovery as Record<string, unknown>), referenceCost: { inputCostMicrosPerMillion: candidate.inputCostMicrosPerMillion, outputCostMicrosPerMillion: candidate.outputCostMicrosPerMillion, imageCostMicros: candidate.imageCostMicros, videoCostMicros: candidate.videoCostMicros } } },
          } })
          defaultCapabilities.add(capability)
        }
        await tx.userModelRoute.upsert({
          where: { userModelId_credentialId_upstreamModel: { userModelId: model.id, credentialId, upstreamModel: candidate.id } },
          update: { enabled: true, priority: credential.priority, weight: credential.weight, lastHealthStatus: 'healthy', lastHealthMessage: '模型发现成功', lastHealthAt: new Date(), cooldownUntil: null },
          create: { userModelId: model.id, credentialId, upstreamModel: candidate.id, enabled: true, priority: credential.priority, weight: credential.weight, lastHealthStatus: 'healthy', lastHealthMessage: '模型发现成功', lastHealthAt: new Date() },
        })
        imported.push({ id: model.id, key: model.key, modelId: candidate.id })
      }
      return imported
    })
    return { discovered: discovered.models.length, availableModels: discovered.models, selected: selected.size, imported: models.length, models }
  }

  listPrivateModels(userId: string) {
    return this.prisma.userModel.findMany({ where: { userId }, orderBy: [{ capability: 'asc' }, { isDefault: 'desc' }, { createdAt: 'asc' }], include: { vendor: true, routes: { include: { credential: { select: { id: true, name: true, apiKeyHint: true, enabled: true, lastHealthStatus: true } } } } } })
  }

  private privateModelKey(userId: string, displayName: string) {
    const slug = displayName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 36) || 'model'
    return `private:${userId.slice(-6)}:${slug}:${Date.now().toString(36)}`
  }

  private async validatePrivateRoutes(userId: string, routes: UserModelInput['routes']) {
    if (!routes.length) throw new BadRequestException('私有模型至少需要绑定一个 API 密钥')
    const normalized = routes.map((route) => ({ ...route, credentialId: route.credentialId.trim(), upstreamModel: route.upstreamModel.trim(), priority: route.priority ?? 0, weight: Math.max(1, route.weight ?? 100), enabled: route.enabled ?? true }))
    if (normalized.some((route) => !route.credentialId || !route.upstreamModel)) throw new BadRequestException('密钥和上游模型 ID 不能为空')
    const ids = [...new Set(normalized.map((route) => route.credentialId))]
    if (await this.prisma.userApiCredential.count({ where: { userId, id: { in: ids } } }) !== ids.length) throw new ForbiddenException('包含不属于当前用户的 API 密钥')
    return [...new Map(normalized.map((route) => [`${route.credentialId}:${route.upstreamModel}`, route])).values()]
  }

  async createPrivateModel(userId: string, input: UserModelInput) {
    if (!(await this.userPolicy(userId)).allowUserByok) throw new ForbiddenException('当前用户分组或套餐不允许使用个人 API 密钥')
    const routes = await this.validatePrivateRoutes(userId, input.routes)
    if (input.isDefault) await this.prisma.userModel.updateMany({ where: { userId, capability: input.capability }, data: { isDefault: false } })
    return this.prisma.userModel.create({ data: {
      userId, key: this.privateModelKey(userId, input.displayName), displayName: input.displayName.trim(), description: input.description?.trim() || '', vendorId: input.vendorId || null, capability: input.capability, apiProtocol: input.apiProtocol || 'openai', routingStrategy: input.routingStrategy || 'PRIORITY', enabled: input.enabled ?? true, isDefault: input.isDefault ?? false, options: input.options as Prisma.InputJsonValue,
      routes: { create: routes },
    }, include: { vendor: true, routes: { include: { credential: { select: { id: true, name: true, apiKeyHint: true, enabled: true, lastHealthStatus: true } } } } } })
  }

  async updatePrivateModel(userId: string, id: string, input: Partial<Omit<UserModelInput, 'routes'>>) {
    const existing = await this.prisma.userModel.findFirst({ where: { id, userId } })
    if (!existing) throw new NotFoundException('私有模型不存在')
    const capability = input.capability || existing.capability
    if (input.isDefault) await this.prisma.userModel.updateMany({ where: { userId, capability, id: { not: id } }, data: { isDefault: false } })
    return this.prisma.userModel.update({ where: { id }, data: {
      ...(input.displayName !== undefined ? { displayName: input.displayName.trim() } : {}),
      ...(input.description !== undefined ? { description: input.description.trim() } : {}),
      ...(input.vendorId !== undefined ? { vendorId: input.vendorId || null } : {}),
      ...(input.capability !== undefined ? { capability: input.capability } : {}),
      ...(input.apiProtocol !== undefined ? { apiProtocol: input.apiProtocol } : {}),
      ...(input.routingStrategy !== undefined ? { routingStrategy: input.routingStrategy } : {}),
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      ...(input.isDefault !== undefined ? { isDefault: input.isDefault } : {}),
      ...(input.options !== undefined ? { options: input.options as Prisma.InputJsonValue } : {}),
    }, include: { vendor: true, routes: { include: { credential: { select: { id: true, name: true, apiKeyHint: true, enabled: true, lastHealthStatus: true } } } } } })
  }

  async replacePrivateModelRoutes(userId: string, id: string, routesInput: UserModelInput['routes']) {
    if (!await this.prisma.userModel.count({ where: { id, userId } })) throw new NotFoundException('私有模型不存在')
    const routes = await this.validatePrivateRoutes(userId, routesInput)
    await this.prisma.$transaction(async (tx) => {
      await tx.userModelRoute.deleteMany({ where: { userModelId: id } })
      await tx.userModelRoute.createMany({ data: routes.map((route) => ({ userModelId: id, ...route })) })
    })
    return this.prisma.userModel.findUniqueOrThrow({ where: { id }, include: { vendor: true, routes: { include: { credential: { select: { id: true, name: true, apiKeyHint: true, enabled: true, lastHealthStatus: true } } } } } })
  }

  async deletePrivateModel(userId: string, id: string) {
    const result = await this.prisma.userModel.deleteMany({ where: { id, userId } })
    if (!result.count) throw new NotFoundException('私有模型不存在')
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

  private async resolvePrivateCandidates(userId: string, requestedModel: string | undefined, capability: ModelCapability): Promise<ResolvedProvider[] | null> {
    const [settings, policy] = await Promise.all([this.prisma.systemSetting.findUnique({ where: { id: 'global' } }), this.userPolicy(userId)])
    if (!settings?.userByokEnabled || !policy.allowUserByok) return null
    const requested = requestedModel?.trim()
    if (this.isByokDirectRequest(requested)) {
      return this.resolveCredentialPassthrough(userId, undefined, capability)
    }
    const model = await this.prisma.userModel.findFirst({
      where: { userId, capability, enabled: true, ...(requested ? { OR: [{ key: requested }, { displayName: requested }, { routes: { some: { upstreamModel: requested } } }] } : { isDefault: true }) },
      include: { routes: { where: { enabled: true }, include: { credential: true } } },
    })
    if (!model) return null
    const pricePreset = await this.prisma.modelPreset.findFirst({
      where: {
        capability,
        enabled: true,
        OR: [
          { key: model.key },
          ...model.routes.map((route) => ({ upstreamModel: route.upstreamModel })),
        ],
      },
      orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }],
    })
    const now = Date.now()
    const available = model.routes.filter((route) => route.credential.enabled && (!route.credential.expiresAt || route.credential.expiresAt.getTime() > now) && (!route.cooldownUntil || route.cooldownUntil.getTime() <= now) && (!route.credential.cooldownUntil || route.credential.cooldownUntil.getTime() <= now))
    const publicRoutes = []
    for (const route of available) {
      try { await this.assertUserProviderUrl(route.credential.baseUrl); publicRoutes.push(route) } catch { /* Ignore unsafe legacy BYOK routes at execution time. */ }
    }
    if (!publicRoutes.length) throw new BadRequestException('私有模型没有安全可用的公网密钥地址，请检测密钥或调整路由')
    const orderedRoutes = this.routing.orderPrivate(
      publicRoutes.map((route) => ({
        value: route,
        priority: route.priority || route.credential.priority,
        weight: route.weight || route.credential.weight,
        createdAt: route.createdAt
      })),
      model.routingStrategy
    )
    const apiProtocol: ResolvedProvider['apiProtocol'] = model.apiProtocol === 'anthropic' || model.apiProtocol === 'gemini' ? model.apiProtocol : 'openai'
    const modelOptions = model.options && typeof model.options === 'object' && !Array.isArray(model.options) ? model.options as Record<string, unknown> : {}
    return orderedRoutes.map((route) => ({
      source: 'user', credentialId: route.credentialId, routeId: route.id, label: `${model.displayName} · ${route.credential.name}`, type: route.credential.providerType, baseUrl: route.credential.baseUrl, apiKey: this.crypto.decrypt(route.credential.encryptedApiKey), authType: route.credential.authType, headers: this.headers(route.credential.customHeaders), timeoutMs: 120_000, model: route.upstreamModel, presetKey: model.key, creditCost: 0, settlementCurrency: settings.currency, creditValueMicros: settings.creditValueMicros, pricingUsdExchangeRateMicros: settings.pricingUsdExchangeRateMicros, inputCostMicrosPerMillion: 0, outputCostMicrosPerMillion: 0, imageCostMicros: 0, videoCostMicros: 0, inputCreditsPerMillion: Math.ceil((pricePreset?.inputCreditsPerMillion ?? 0) * policy.creditRatePercent / 100), outputCreditsPerMillion: Math.ceil((pricePreset?.outputCreditsPerMillion ?? 0) * policy.creditRatePercent / 100), baseInputCreditsPerMillion: pricePreset?.inputCreditsPerMillion ?? 0, baseOutputCreditsPerMillion: pricePreset?.outputCreditsPerMillion ?? 0, creditRatePercent: policy.creditRatePercent, apiProtocol, nativeSearchProvider: this.nativeSearchProvider(route.credential.baseUrl, apiProtocol, model.options),
      options: modelOptions,
      imageCapabilities: modelOptions.imageCapabilities && typeof modelOptions.imageCapabilities === 'object' ? modelOptions.imageCapabilities as Record<string, unknown> : undefined,
      videoCapabilities: modelOptions.videoCapabilities && typeof modelOptions.videoCapabilities === 'object' ? modelOptions.videoCapabilities as Record<string, unknown> : undefined,
    }))
  }

  async resolveCandidates(userId: string, requestedModel: string | undefined, capability: ModelCapability, requirements: Record<string, unknown> = {}): Promise<ResolvedProvider[]> {
    const requiredSource = this.routing.sourceRequirement(requirements.providerSource)
    const privateCandidates = requiredSource === 'platform' ? null : await this.resolvePrivateCandidates(userId, requiredSource === 'user' ? undefined : requestedModel, capability)
    if (privateCandidates?.length) return privateCandidates
    try {
      return await this.resolvePlatformCandidates(userId, requestedModel, capability, requirements, requiredSource)
    } catch (error) {
      if (requiredSource === 'platform') throw error
      const passthrough = await this.resolveCredentialPassthrough(userId, requestedModel, capability)
      if (passthrough?.length) return passthrough
      throw error
    }
  }

  private async resolveCredentialPassthrough(userId: string, requestedModel: string | undefined, capability: ModelCapability): Promise<ResolvedProvider[] | null> {
    const [settings, policy] = await Promise.all([this.prisma.systemSetting.findUnique({ where: { id: 'global' } }), this.userPolicy(userId)])
    if (!settings?.userByokEnabled || !policy.allowUserByok) return null
    const credentials = await this.prisma.userApiCredential.findMany({ where: { userId, enabled: true, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] })
    const publicCredentials = []
    for (const credential of credentials) {
      try { await this.assertUserProviderUrl(credential.baseUrl); publicCredentials.push(credential) } catch { /* skip unsafe */ }
    }
    if (!publicCredentials.length) return null
    const model = requestedModel?.trim() && !this.isByokDirectRequest(requestedModel)
      ? requestedModel.trim()
      : capability === ModelCapability.CHAT ? 'gpt-4o' : capability === ModelCapability.VIDEO ? 'sora-2' : 'gpt-image-2'
    return publicCredentials.map((credential) => ({
      source: 'user' as const,
      credentialId: credential.id,
      label: credential.name,
      type: credential.providerType,
      baseUrl: credential.baseUrl,
      apiKey: this.crypto.decrypt(credential.encryptedApiKey),
      authType: credential.authType,
      headers: this.headers(credential.customHeaders),
      timeoutMs: 120_000,
      model,
      presetKey: 'byok-direct',
      creditCost: 0,
      settlementCurrency: settings.currency,
      creditValueMicros: settings.creditValueMicros,
      pricingUsdExchangeRateMicros: settings.pricingUsdExchangeRateMicros,
      inputCostMicrosPerMillion: 0,
      outputCostMicrosPerMillion: 0,
      imageCostMicros: 0,
      videoCostMicros: 0,
      inputCreditsPerMillion: 0,
      outputCreditsPerMillion: 0,
      baseInputCreditsPerMillion: 0,
      baseOutputCreditsPerMillion: 0,
      creditRatePercent: policy.creditRatePercent,
      apiProtocol: 'openai' as const,
      options: {},
      nativeSearchProvider: this.nativeSearchProvider(credential.baseUrl, 'openai', {}),
    }))
  }

  private async resolvePlatformCandidates(userId: string, requestedModel: string | undefined, capability: ModelCapability, requirements: Record<string, unknown>, requiredSource: ReturnType<ProviderRoutingService['sourceRequirement']>): Promise<ResolvedProvider[]> {
    const { preset, model, creditCost, policy, settings } = await this.resolvePreset(userId, requestedModel, capability)
    const candidates: ResolvedProvider[] = []
    const presetOptions = preset?.options && typeof preset.options === 'object' && !Array.isArray(preset.options) ? preset.options as Record<string, unknown> : {}
    const configuredProtocol = String(presetOptions.apiProtocol || 'openai').toLowerCase()
    const apiProtocol: ResolvedProvider['apiProtocol'] = configuredProtocol === 'anthropic' || configuredProtocol === 'gemini' ? configuredProtocol : 'openai'
    const basePricing = {
      settlementCurrency: settings?.currency ?? 'CNY',
      creditValueMicros: settings?.creditValueMicros ?? 10000,
      pricingUsdExchangeRateMicros: settings?.pricingUsdExchangeRateMicros ?? 1_000_000,
      inputCostMicrosPerMillion: preset?.inputCostMicrosPerMillion ?? 0,
      outputCostMicrosPerMillion: preset?.outputCostMicrosPerMillion ?? 0,
      imageCostMicros: preset?.imageCostMicros ?? 0,
      videoCostMicros: preset?.videoCostMicros ?? 0,
      baseInputCreditsPerMillion: preset?.inputCreditsPerMillion ?? 0,
      baseOutputCreditsPerMillion: preset?.outputCreditsPerMillion ?? 0,
      inputCreditsPerMillion: Math.ceil((preset?.inputCreditsPerMillion ?? 0) * policy.creditRatePercent / 100),
      outputCreditsPerMillion: Math.ceil((preset?.outputCreditsPerMillion ?? 0) * policy.creditRatePercent / 100),
      imageCapabilities: presetOptions.imageCapabilities && typeof presetOptions.imageCapabilities === 'object' && !Array.isArray(presetOptions.imageCapabilities) ? presetOptions.imageCapabilities as Record<string, unknown> : undefined,
      videoCapabilities: presetOptions.videoCapabilities && typeof presetOptions.videoCapabilities === 'object' && !Array.isArray(presetOptions.videoCapabilities) ? presetOptions.videoCapabilities as Record<string, unknown> : undefined,
      creditRatePercent: policy.creditRatePercent,
      apiProtocol,
    }

    if (requiredSource !== 'platform' && settings?.userByokEnabled && policy.allowUserByok && preset?.allowUserKey !== false && (preset?.provider?.allowUserKeys ?? true)) {
      const credentials = await this.prisma.userApiCredential.findMany({ where: { userId, enabled: true, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] })
      const compatibleTypes = new Set([preset?.provider?.type, ...(preset?.providerRoutes || []).map((route) => route.provider.type)].filter(Boolean))
      const ordered = [...credentials].sort((a, b) => Number(compatibleTypes.has(b.providerType)) - Number(compatibleTypes.has(a.providerType)))
      for (const credential of ordered) {
        try { await this.assertUserProviderUrl(credential.baseUrl) } catch { continue }
        candidates.push({ source: 'user', credentialId: credential.id, label: credential.name, type: credential.providerType, baseUrl: credential.baseUrl, apiKey: this.crypto.decrypt(credential.encryptedApiKey), authType: credential.authType, headers: this.headers(credential.customHeaders), timeoutMs: 120_000, model, presetKey: preset?.key, creditCost: this.routing.credentialCreditCost(requiredSource, creditCost), ...basePricing, options: presetOptions, nativeSearchProvider: this.nativeSearchProvider(credential.baseUrl, apiProtocol, presetOptions), inputCostMicrosPerMillion: 0, outputCostMicrosPerMillion: 0, imageCostMicros: 0, videoCostMicros: 0, ...(requiredSource === 'user' ? { inputCreditsPerMillion: 0, outputCreditsPerMillion: 0 } : {}) })
      }
    }

    const now = Date.now()
    const allConfiguredRoutes = (preset?.providerRoutes || []).filter((route) => route.enabled && route.provider.enabled && this.providerReady(route.provider))
    const configuredRoutes = allConfiguredRoutes.filter((route) => capability !== ModelCapability.VIDEO || this.routeSupportsVideo(route.options, requirements))
    const readyRoutes = configuredRoutes.filter((route) => !route.provider.cooldownUntil || route.provider.cooldownUntil.getTime() <= now)
    // Cooldown keeps an unhealthy route behind healthy alternatives. It must not make the only
    // configured route look unbound, otherwise admins cannot verify a corrected upstream.
    const routes = this.routing.orderPlatform(
      (readyRoutes.length ? readyRoutes : configuredRoutes).map((route) => ({
        value: route,
        priority: route.priority ?? route.provider.priority,
        weight: route.weight ?? route.provider.weight
      }))
    )
    if (requiredSource !== 'user') for (const route of routes) {
      if (!await this.providerEndpointAllowed(route.provider.baseUrl, route.provider.type)) continue
      candidates.push({ source: 'admin', providerId: route.provider.id, routeId: route.id, label: route.provider.name, type: route.provider.type, baseUrl: route.provider.baseUrl, apiKey: this.crypto.decrypt(route.provider.encryptedApiKey), authType: route.provider.authType, headers: this.headers(route.provider.customHeaders), timeoutMs: route.provider.timeoutMs, model: route.upstreamModelOverride || model, presetKey: preset?.key, creditCost, ...basePricing, options: { ...presetOptions, ...asJsonRecord(route.options) }, nativeSearchProvider: this.nativeSearchProvider(route.provider.baseUrl, apiProtocol, route.options, presetOptions, route.provider.metadata), videoCapabilities: this.routeVideoCapabilities(route.options, basePricing.videoCapabilities), inputCostMicrosPerMillion: route.inputCostMicrosPerMillion ?? basePricing.inputCostMicrosPerMillion, outputCostMicrosPerMillion: route.outputCostMicrosPerMillion ?? basePricing.outputCostMicrosPerMillion, imageCostMicros: route.imageCostMicros ?? basePricing.imageCostMicros, videoCostMicros: route.videoCostMicros ?? basePricing.videoCostMicros })
    }

    if (requiredSource !== 'user' && !allConfiguredRoutes.length && preset?.provider?.enabled && this.providerReady(preset.provider)) {
      if (await this.providerEndpointAllowed(preset.provider.baseUrl, preset.provider.type)) candidates.push({ source: 'admin', providerId: preset.provider.id, label: preset.provider.name, type: preset.provider.type, baseUrl: preset.provider.baseUrl, apiKey: this.crypto.decrypt(preset.provider.encryptedApiKey), authType: preset.provider.authType, headers: this.headers(preset.provider.customHeaders), timeoutMs: preset.provider.timeoutMs, model, presetKey: preset.key, creditCost, ...basePricing, options: presetOptions, nativeSearchProvider: this.nativeSearchProvider(preset.provider.baseUrl, apiProtocol, presetOptions, preset.provider.metadata) })
    }

    const envKey = this.config.get<string>('AI_PROVIDER_API_KEY') || ''
    const envBase = this.config.get<string>('AI_PROVIDER_BASE_URL') || 'https://api.openai.com/v1'
    if (requiredSource !== 'user' && envKey) {
      const baseUrl = await this.assertProviderEndpoint(envBase, ProviderType.OPENAI_COMPATIBLE)
      candidates.push({ source: 'environment', label: '环境变量渠道', type: ProviderType.OPENAI_COMPATIBLE, baseUrl, apiKey: envKey, authType: ProviderAuthType.BEARER, headers: {}, timeoutMs: 120_000, model, presetKey: preset?.key, creditCost, ...basePricing, options: presetOptions, nativeSearchProvider: this.nativeSearchProvider(baseUrl, apiProtocol, presetOptions) })
    }
    if (!candidates.length && capability === ModelCapability.VIDEO && allConfiguredRoutes.length && !configuredRoutes.length) throw new BadRequestException('当前视频规格没有可用上游渠道，请调整分辨率、时长或画面比例')
    if (!candidates.length && requiredSource === 'user') throw new ServiceUnavailableException('图片反推当前由用户 BYOK 承担费用，请先在设置中添加可用的个人 API 密钥和聊天模型')
    if (!candidates.length && requiredSource === 'platform') throw new ServiceUnavailableException('图片反推尚未绑定可用的平台视觉模型渠道')
    if (!candidates.length) throw new ServiceUnavailableException('模型未绑定可用渠道，请在管理端配置并通过渠道检测，或在设置中添加可用的个人 API 密钥')
    return candidates
  }

  async resolve(userId: string, requestedModel: string | undefined, capability: ModelCapability, requirements: Record<string, unknown> = {}): Promise<ResolvedProvider> {
    return (await this.resolveCandidates(userId, requestedModel, capability, requirements))[0]
  }

  async recordProviderResult(providerId: string | undefined, success: boolean, message = '') {
    return this.health.recordProviderResult(providerId, success, message)
  }

  async recordCandidateResult(candidate: Pick<ResolvedProvider, 'providerId' | 'credentialId' | 'routeId'>, success: boolean, message = '') {
    return this.health.recordCandidateResult(candidate, success, message)
  }

  recordCredentialUsage(credentialId: string | undefined, inputTokens: number, outputTokens: number) {
    if (!credentialId || (!inputTokens && !outputTokens)) return Promise.resolve()
    return this.prisma.userApiCredential.updateMany({ where: { id: credentialId }, data: { inputTokens: { increment: BigInt(Math.max(0, inputTokens)) }, outputTokens: { increment: BigInt(Math.max(0, outputTokens)) }, lastUsedAt: new Date() } }).then(() => undefined)
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

  private isByokDirectRequest(value?: string) {
    const requested = value?.trim()
    if (!requested) return false
    return requested === '我的 API 密钥' || requested === '我的图片密钥' || requested === '我的视频密钥' || requested.startsWith('byok-direct')
  }

  private virtualByokCatalogModel(userId: string, capability: ModelCapability, credentialCount: number) {
    const labels: Partial<Record<ModelCapability, { key: string; displayName: string }>> = {
      [ModelCapability.CHAT]: { key: 'byok-direct', displayName: '我的 API 密钥' },
      [ModelCapability.IMAGE]: { key: 'byok-direct-image', displayName: '我的图片密钥' },
      [ModelCapability.VIDEO]: { key: 'byok-direct-video', displayName: '我的视频密钥' },
    }
    const identity = labels[capability] || { key: `byok-direct-${capability.toLowerCase()}`, displayName: '我的 API 密钥' }
    return {
      id: identity.key,
      key: identity.key,
      displayName: identity.displayName,
      description: '使用已保存的个人密钥直连上游，导入模型后可按厂商细分',
      vendorId: null,
      capability,
      apiProtocol: 'openai',
      routingStrategy: 'PRIORITY',
      enabled: true,
      isDefault: true,
      options: {},
      createdAt: new Date(0),
      updatedAt: new Date(0),
      userId,
      source: 'USER',
      upstreamModel: '',
      flatCreditCost: 0,
      effectiveCreditCost: 0,
      inputCreditsPerMillion: 0,
      outputCreditsPerMillion: 0,
      baseInputCreditsPerMillion: 0,
      baseOutputCreditsPerMillion: 0,
      badge: 'BYOK',
      healthyRouteCount: credentialCount,
      routeCount: credentialCount,
      availability: 'AVAILABLE',
      provider: null,
      providerRoutes: [],
      vendor: { id: 'mine', key: 'mine', name: '我的密钥', sortOrder: 0, createdAt: new Date(0), updatedAt: new Date(0) },
    }
  }
}
