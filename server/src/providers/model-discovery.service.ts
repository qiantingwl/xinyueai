import { Injectable } from '@nestjs/common'
import { ModelCapability } from '@prisma/client'
import { PublicEndpointPolicyService } from '../common/public-endpoint-policy.service'
import { fetchPublicNoRedirect } from '../common/outbound-http'

type RemoteModel = string | Record<string, unknown>

type CatalogEntry = {
  input_cost_per_token?: number
  output_cost_per_token?: number
  input_cost_per_image?: number
  output_cost_per_image?: number
  input_cost_per_video_per_second?: number
  output_cost_per_video_per_second?: number
  max_input_tokens?: number
  max_output_tokens?: number
  litellm_provider?: string
  mode?: string
  supports_vision?: boolean
  supports_function_calling?: boolean
  supports_response_schema?: boolean
  supports_reasoning?: boolean
  supports_web_search?: boolean
}

export type DiscoveredModel = {
  id: string
  displayName: string
  vendorKey: string
  vendorName: string
  capability: ModelCapability | null
  importable: boolean
  confidence: 'exact' | 'inferred' | 'unknown'
  pricingSource: 'litellm' | 'fallback' | 'none'
  inputCostMicrosPerMillion: number
  outputCostMicrosPerMillion: number
  imageCostMicros: number
  videoCostMicros: number
  inputCreditsPerMillion: number
  outputCreditsPerMillion: number
  flatCreditCost: number
  contextWindow: number | null
  maxOutputTokens: number | null
  features: string[]
  agentCapabilities: {
    eligible: boolean
    confidence: 'confirmed' | 'compatible' | 'limited'
    supportsTools: boolean
    supportsStructuredOutput: boolean
    supportsReasoning: boolean
    supportsWebSearch: boolean
    supportsVision: boolean
    contextWindow: number | null
    maxOutputTokens: number | null
    reason: string
  } | null
  warnings: string[]
  raw: Record<string, unknown>
}

const DEFAULT_CATALOG_URL = 'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json'
const DEFAULT_CATALOG_MIRROR_URL = 'https://cdn.jsdelivr.net/gh/BerriAI/litellm@main/model_prices_and_context_window.json'
const MAX_CATALOG_BYTES = 20 * 1024 * 1024

const FALLBACK_PRICING: Record<string, CatalogEntry> = {
  'gpt-4o': { input_cost_per_token: 0.0000025, output_cost_per_token: 0.00001, litellm_provider: 'openai', mode: 'chat' },
  'gpt-4o-mini': { input_cost_per_token: 0.00000015, output_cost_per_token: 0.0000006, litellm_provider: 'openai', mode: 'chat' },
  'gpt-4.1': { input_cost_per_token: 0.000002, output_cost_per_token: 0.000008, litellm_provider: 'openai', mode: 'chat' },
  'gpt-4.1-mini': { input_cost_per_token: 0.0000004, output_cost_per_token: 0.0000016, litellm_provider: 'openai', mode: 'chat' },
  'gpt-4.1-nano': { input_cost_per_token: 0.0000001, output_cost_per_token: 0.0000004, litellm_provider: 'openai', mode: 'chat' },
  'o3': { input_cost_per_token: 0.000002, output_cost_per_token: 0.000008, litellm_provider: 'openai', mode: 'chat', supports_reasoning: true },
  'o3-mini': { input_cost_per_token: 0.0000011, output_cost_per_token: 0.0000044, litellm_provider: 'openai', mode: 'chat', supports_reasoning: true },
  'o4-mini': { input_cost_per_token: 0.0000011, output_cost_per_token: 0.0000044, litellm_provider: 'openai', mode: 'chat', supports_reasoning: true },
  'claude-3-5-sonnet': { input_cost_per_token: 0.000003, output_cost_per_token: 0.000015, litellm_provider: 'anthropic', mode: 'chat' },
  'claude-sonnet-4': { input_cost_per_token: 0.000003, output_cost_per_token: 0.000015, litellm_provider: 'anthropic', mode: 'chat' },
  'claude-3-5-haiku': { input_cost_per_token: 0.0000008, output_cost_per_token: 0.000004, litellm_provider: 'anthropic', mode: 'chat' },
  'gemini-2.5-pro': { input_cost_per_token: 0.00000125, output_cost_per_token: 0.00001, litellm_provider: 'gemini', mode: 'chat' },
  'gemini-2.5-flash': { input_cost_per_token: 0.0000003, output_cost_per_token: 0.0000025, litellm_provider: 'gemini', mode: 'chat' },
  'deepseek-chat': { input_cost_per_token: 0.00000027, output_cost_per_token: 0.0000011, litellm_provider: 'deepseek', mode: 'chat' },
  'deepseek-reasoner': { input_cost_per_token: 0.00000055, output_cost_per_token: 0.00000219, litellm_provider: 'deepseek', mode: 'chat', supports_reasoning: true },
}

const VENDORS = [
  { key: 'openai', name: 'OpenAI', test: /(^|[\/:_-])(gpt|chatgpt|o[134](?:-|$)|dall-e|sora)([\/:_-]|$)/i },
  { key: 'anthropic', name: 'Anthropic', test: /anthropic|claude/i },
  { key: 'google', name: 'Google Gemini', test: /google|gemini|imagen|veo|nano[-_ ]?banana/i },
  { key: 'xai', name: 'xAI', test: /(^|[\/:_-])(xai|grok)([\/:_-]|$)/i },
  { key: 'deepseek', name: 'DeepSeek', test: /deepseek/i },
  { key: 'qwen', name: 'Qwen', test: /qwen|qwq|tongyi/i },
  { key: 'doubao', name: 'Doubao', test: /doubao|seedream|seedance|ark-|bytedance|seed-\d/i },
  { key: 'kimi', name: 'Kimi', test: /kimi|moonshot/i },
  { key: 'zhipu', name: '智谱 GLM', test: /zhipu|z-ai|glm[-_.]|\bglm\b/i },
  { key: 'minimax', name: 'MiniMax', test: /minimax/i },
  { key: 'hunyuan', name: '腾讯混元', test: /hunyuan|(^|[\/:_-])hy[34]([\/:_-]|$)|tencent/i },
  { key: 'stepfun', name: '阶跃星辰', test: /stepfun|(^|[\/:_-])step[-_.]/i },
  { key: 'longcat', name: 'LongCat', test: /longcat|meituan/i },
  { key: 'meta', name: 'Meta', test: /meta|llama/i },
  { key: 'mistral', name: 'Mistral AI', test: /mistral|mixtral|codestral|pixtral/i },
  { key: 'cohere', name: 'Cohere', test: /cohere|command-r/i },
  { key: 'black-forest-labs', name: 'Black Forest Labs', test: /(^|[\/:_-])flux([\/:_-]|$)/i },
]

const UNSUPPORTED_PATTERN = /embedding|embed-|rerank|moderation|guard|classifier|whisper|transcri|speech|tts|audio|realtime|search-query|reward|ocr/i
const VIDEO_PATTERN = /video|sora|veo(?:-|$)|kling|hailuo|minimax.*video|wan(?:\d|[-_]).*video|seedance|vidu|luma.*ray/i
const IMAGE_PATTERN = /image|imagine|dall-e|gpt-image|flux|recraft|ideogram|imagen|seedream|nano[-_ ]?banana|stable[-_ ]?diffusion|sdxl/i

@Injectable()
export class ModelDiscoveryService {
  private catalog = new Map<string, CatalogEntry>()
  private catalogSource: 'litellm' | 'fallback' = 'fallback'
  private catalogLoadedAt = 0

  constructor(private readonly endpointPolicy: PublicEndpointPolicyService) {}

  normalizeResponse(payload: unknown): RemoteModel[] {
    if (Array.isArray(payload)) return payload.filter((item): item is RemoteModel => typeof item === 'string' || Boolean(item && typeof item === 'object'))
    if (!payload || typeof payload !== 'object') return []
    const row = payload as Record<string, unknown>
    for (const value of [row.data, row.models, row.items, row.results]) {
      if (Array.isArray(value)) return value.filter((item): item is RemoteModel => typeof item === 'string' || Boolean(item && typeof item === 'object'))
    }
    return []
  }

  async discover(payload: unknown, options: { creditValueMicros: number; pricingUsdExchangeRateMicros?: number; markupPercent: number; catalogUrl?: string; refreshHours?: number; forceRefresh?: boolean }) {
    await this.ensureCatalog(options.catalogUrl, options.refreshHours, options.forceRefresh)
    const seen = new Set<string>()
    return this.normalizeResponse(payload).map((item) => this.normalizeModel(item, options)).filter((item): item is DiscoveredModel => {
      if (!item || seen.has(item.id)) return false
      seen.add(item.id)
      return true
    }).sort((left, right) => Number(right.importable) - Number(left.importable) || left.vendorName.localeCompare(right.vendorName) || left.id.localeCompare(right.id))
  }

  private async ensureCatalog(url = DEFAULT_CATALOG_URL, refreshHours = 12, forceRefresh = false) {
    const ttl = Math.max(1, Math.min(refreshHours || 12, 168)) * 3_600_000
    if (!forceRefresh && this.catalog.size && Date.now() - this.catalogLoadedAt < ttl) return
    const primaryUrl = url || DEFAULT_CATALOG_URL
    const catalogUrls = primaryUrl === DEFAULT_CATALOG_URL ? [primaryUrl, DEFAULT_CATALOG_MIRROR_URL] : [primaryUrl]
    for (const catalogUrl of catalogUrls) {
      try {
        const parsedUrl = await this.endpointPolicy.assertPublicHttpUrl(catalogUrl)
        const response = await fetchPublicNoRedirect(parsedUrl, { signal: AbortSignal.timeout(12_000) })
        if (!response.ok) throw new Error(`价格目录返回 HTTP ${response.status}`)
        const declaredSize = Number(response.headers.get('content-length') || 0)
        if (declaredSize > MAX_CATALOG_BYTES) throw new Error('价格目录超过 20 MB')
        const raw = await response.text()
        if (Buffer.byteLength(raw, 'utf8') > MAX_CATALOG_BYTES) throw new Error('价格目录超过 20 MB')
        const payload = JSON.parse(raw) as Record<string, CatalogEntry>
        const nextCatalog = new Map(Object.entries(FALLBACK_PRICING).map(([key, value]) => [this.catalogKey(key), value]))
        for (const [key, value] of Object.entries(payload)) {
          if (!value || typeof value !== 'object') continue
          nextCatalog.set(this.catalogKey(key), value)
          const unprefixed = key.includes('/') ? key.slice(key.lastIndexOf('/') + 1) : key
          if (!nextCatalog.has(this.catalogKey(unprefixed))) nextCatalog.set(this.catalogKey(unprefixed), value)
        }
        this.catalog = nextCatalog
        this.catalogSource = 'litellm'
        this.catalogLoadedAt = Date.now()
        return
      } catch {
        // Try the next source while preserving the last successful cache.
      }
    }
    if (!this.catalog.size) {
      this.catalog = new Map(Object.entries(FALLBACK_PRICING).map(([key, value]) => [this.catalogKey(key), value]))
      this.catalogSource = 'fallback'
      this.catalogLoadedAt = Date.now()
    }
  }

  private normalizeModel(item: RemoteModel, options: { creditValueMicros: number; pricingUsdExchangeRateMicros?: number; markupPercent: number }): DiscoveredModel | null {
    const raw = typeof item === 'string' ? {} : item
    const id = String(typeof item === 'string' ? item : raw.id ?? raw.name ?? raw.model ?? '').trim()
    if (!id || id.length > 200) return null
    const ownedBy = String(raw.owned_by ?? raw.provider ?? raw.vendor ?? '')
    const pricingMatch = this.pricingFor(id)
    const pricing = pricingMatch?.entry
    const mode = String(pricing?.mode || raw.mode || raw.type || '').toLowerCase()
    const vendor = this.vendorFor(`${ownedBy}/${pricing?.litellm_provider || ''}/${id}`)
    const unsupported = UNSUPPORTED_PATTERN.test(`${id} ${mode}`) || ['embedding', 'rerank', 'moderation', 'audio', 'speech', 'transcription'].includes(mode)
    const capability = unsupported ? null : VIDEO_PATTERN.test(`${id} ${mode}`) || mode.includes('video')
      ? ModelCapability.VIDEO
      : IMAGE_PATTERN.test(`${id} ${mode}`) || ['image_generation', 'image'].includes(mode)
        ? ModelCapability.IMAGE
        : ModelCapability.CHAT
    const inputCost = this.microsPerMillion(pricing?.input_cost_per_token)
    const outputCost = this.microsPerMillion(pricing?.output_cost_per_token)
    const imageCost = this.micros(pricing?.output_cost_per_image ?? pricing?.input_cost_per_image)
    const videoCost = this.micros(pricing?.output_cost_per_video_per_second ?? pricing?.input_cost_per_video_per_second)
    const creditValue = Math.max(1, options.creditValueMicros || 10_000)
    const exchangeRate = Math.max(1, Math.min(options.pricingUsdExchangeRateMicros || 1_000_000, 100_000_000))
    const localizedCost = (costMicros: number) => Math.min(2_000_000_000, Math.ceil(costMicros * exchangeRate / 1_000_000))
    const markup = Math.max(100, Math.min(options.markupPercent || 130, 1000)) / 100
    const inputCredits = inputCost ? Math.max(1, Math.ceil(localizedCost(inputCost) * markup / creditValue)) : 0
    const outputCredits = outputCost ? Math.max(1, Math.ceil(localizedCost(outputCost) * markup / creditValue)) : 0
    const mediaCost = capability === ModelCapability.VIDEO ? videoCost : capability === ModelCapability.IMAGE ? imageCost : 0
    const flatCreditCost = mediaCost ? Math.max(1, Math.ceil(localizedCost(mediaCost) * markup / creditValue)) : 0
    const supportedParameters = Array.isArray(raw.supported_parameters) ? raw.supported_parameters.map(String) : []
    const supportsTools = Boolean(pricing?.supports_function_calling || raw.supports_function_calling || supportedParameters.some((item) => ['tools', 'tool_choice', 'function_call'].includes(item)))
    const supportsStructuredOutput = Boolean(pricing?.supports_response_schema || raw.supports_response_schema || supportedParameters.some((item) => ['response_format', 'json_schema'].includes(item)))
    const supportsReasoning = Boolean(pricing?.supports_reasoning || raw.supports_reasoning)
    const supportsWebSearch = Boolean(pricing?.supports_web_search || raw.supports_web_search)
    const supportsVision = Boolean(pricing?.supports_vision || raw.supports_vision)
    const contextWindow = this.positiveInteger(pricing?.max_input_tokens ?? raw.context_window ?? raw.context_length)
    const maxOutputTokens = this.positiveInteger(pricing?.max_output_tokens ?? raw.max_output_tokens)
    const agentEligible = capability === ModelCapability.CHAT && (!contextWindow || contextWindow >= 8192)
    const agentCapabilities = capability === ModelCapability.CHAT ? {
      eligible: agentEligible,
      confidence: !agentEligible ? 'limited' as const : supportsTools || supportsStructuredOutput ? 'confirmed' as const : 'compatible' as const,
      supportsTools,
      supportsStructuredOutput,
      supportsReasoning,
      supportsWebSearch,
      supportsVision,
      contextWindow,
      maxOutputTokens,
      reason: !agentEligible ? '上下文窗口小于 8K，不适合多步骤任务' : supportsTools || supportsStructuredOutput ? '已识别结构化输出或工具调用能力' : '可用于文本规划，工具由 Xinyue 服务端编排',
    } : null
    const features = [
      supportsVision ? 'vision' : '',
      supportsTools ? 'tools' : '',
      supportsStructuredOutput ? 'structured-output' : '',
      supportsReasoning ? 'reasoning' : '',
      supportsWebSearch ? 'web-search' : '',
    ].filter(Boolean)
    const warnings = unsupported
      ? ['当前系统尚未提供该模型类型的生成入口']
      : pricing ? [] : ['价格目录未命中，导入后请在模型定价中补充上游成本和用户售价']
    return {
      id,
      displayName: this.displayName(id),
      vendorKey: vendor.key,
      vendorName: vendor.name,
      capability,
      importable: Boolean(capability),
      confidence: pricingMatch?.exact ? 'exact' : capability ? 'inferred' : 'unknown',
      pricingSource: pricing ? this.catalogSource : 'none',
      inputCostMicrosPerMillion: inputCost,
      outputCostMicrosPerMillion: outputCost,
      imageCostMicros: imageCost,
      videoCostMicros: videoCost,
      inputCreditsPerMillion: inputCredits,
      outputCreditsPerMillion: outputCredits,
      flatCreditCost,
      contextWindow,
      maxOutputTokens,
      features,
      agentCapabilities,
      warnings,
      raw,
    }
  }

  private pricingFor(modelId: string) {
    const exactKeys = [modelId, modelId.replace(/^models\//i, ''), modelId.slice(modelId.lastIndexOf('/') + 1)].map((item) => this.catalogKey(item))
    for (const key of exactKeys) {
      const entry = this.catalog.get(key)
      if (entry) return { entry, exact: true }
    }
    const normalized = this.catalogKey(modelId)
    let best: { key: string; entry: CatalogEntry } | undefined
    for (const [key, entry] of this.catalog) {
      if (normalized.startsWith(`${key}-`) || normalized.startsWith(`${key}:`)) {
        if (!best || key.length > best.key.length) best = { key, entry }
      }
    }
    return best ? { entry: best.entry, exact: false } : undefined
  }

  private vendorFor(value: string) {
    return VENDORS.find((vendor) => vendor.test.test(value)) || { key: 'other', name: 'Other' }
  }

  private displayName(id: string) {
    const value = id.includes('/') ? id.slice(id.lastIndexOf('/') + 1) : id
    return value.replace(/^models\//i, '').replace(/[-_]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()).slice(0, 100)
  }

  private catalogKey(value: string) {
    return value.trim().toLowerCase().replace(/^models\//, '').replace(/@[^/]+$/, '')
  }

  private microsPerMillion(value: unknown) {
    const number = Number(value)
    return Number.isFinite(number) && number > 0 ? Math.min(2_000_000_000, Math.ceil(number * 1_000_000_000_000)) : 0
  }

  private micros(value: unknown) {
    const number = Number(value)
    return Number.isFinite(number) && number > 0 ? Math.min(2_000_000_000, Math.ceil(number * 1_000_000)) : 0
  }

  private positiveInteger(value: unknown) {
    const number = Number(value)
    return Number.isInteger(number) && number > 0 ? number : null
  }
}
