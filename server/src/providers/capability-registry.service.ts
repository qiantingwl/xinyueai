import { Injectable } from '@nestjs/common'
import { ModelCapability, ProviderType } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { asJsonRecord } from '../common/json-record'

type QuickAction = {
  id: string
  actionType: string
  prompt: string
  target: string
  modelKey: string
  webSearch: boolean
  enabled: boolean
}

export type QuickActionStatus = {
  id: string
  preset: string
  handler: string
  available: boolean
  published: boolean
  reason: string
}

const OFFICE_TARGETS = new Set(['daily', 'writing', 'analysis', 'development', 'ppt', 'report', 'meeting', 'spreadsheet', 'excel'])
const INTERNAL_ROUTES = new Map<string, ModelCapability | null>([
  ['/chat', ModelCapability.CHAT],
  ['/image', ModelCapability.IMAGE],
  ['/video', ModelCapability.VIDEO],
  ['/commerce', ModelCapability.COMMERCE],
  ['/office', ModelCapability.CHAT],
  ['/workspace', null],
  ['/canvases', null],
  ['/prompts', null],
  ['/capabilities', null],
  ['/works', null],
  ['/image-prompt', null],
  ['/about', null],
  ['/copyright', null],
  ['/privacy', null],
  ['/terms', null],
])

@Injectable()
export class CapabilityRegistryService {
  constructor(private readonly prisma: PrismaService) {}

  async snapshot(actions: Record<string, QuickAction[]> = {}) {
    const now = new Date()
    const [models, searchChannels, nativeChannels] = await Promise.all([
      this.prisma.modelPreset.findMany({
        where: { enabled: true },
        select: {
          key: true,
          capability: true,
          provider: { select: { type: true, enabled: true, encryptedApiKey: true, lastHealthStatus: true, cooldownUntil: true } },
          providerRoutes: {
            where: { enabled: true },
            select: { provider: { select: { type: true, enabled: true, encryptedApiKey: true, lastHealthStatus: true, cooldownUntil: true } } },
          },
        },
      }),
      this.prisma.webSearchChannel.findMany({
        where: { enabled: true },
        select: { lastHealthStatus: true, cooldownUntil: true },
      }),
      this.prisma.providerChannel.findMany({
        where: { enabled: true },
        select: {
          type: true,
          enabled: true,
          encryptedApiKey: true,
          lastHealthStatus: true,
          cooldownUntil: true,
          metadata: true,
          template: { select: { nativeSearchProvider: true } },
        },
      }),
    ])

    // A configured route remains a real selectable capability while its health is
    // being checked. Calls still use the normal resolver and surface upstream
    // failures; hiding the action here made the home composer look incomplete.
    const availableModels = models.filter((model) =>
      this.providerConfigured(model.provider, now) || model.providerRoutes.some((route) => this.providerConfigured(route.provider, now)),
    )
    const modelKeys = new Set(availableModels.map((model) => model.key))
    const modelCapabilities = new Set(availableModels.map((model) => model.capability))
    const externalSearchAvailable = searchChannels.some((channel) => this.healthAvailable(channel, now))
    const nativeSearchAvailable = nativeChannels.some((channel) => {
      if (!this.providerAvailable(channel, now)) return false
      const metadata = asJsonRecord(channel.metadata)
      const provider = String(metadata.nativeSearchProvider || channel.template?.nativeSearchProvider || 'disabled')
      return provider !== 'disabled'
    })
    const webSearchAvailable = externalSearchAvailable || nativeSearchAvailable

    const statuses = Object.entries(actions).flatMap(([preset, rows]) =>
      rows.map((action) => this.actionStatus(preset, action, modelKeys, modelCapabilities, webSearchAvailable)),
    )

    return {
      handlers: [
        { id: 'prompt.compose', actionType: 'PROMPT', description: '填入提示词并通过聊天模型执行' },
        { id: 'office.task', actionType: 'OFFICE', description: '进入办公中心并交付真实办公文件' },
        { id: 'route.open', actionType: 'ROUTE', description: '打开已登记的站内功能或 HTTPS 地址' },
      ],
      dependencies: {
        modelCapabilities: [...modelCapabilities],
        modelKeys: [...modelKeys],
        webSearchAvailable,
        externalSearchAvailable,
        nativeSearchAvailable,
      },
      actions: statuses,
    }
  }

  async filterPublished(actions: Record<string, QuickAction[]>) {
    const snapshot = await this.snapshot(actions)
    const published = new Set(snapshot.actions.filter((item) => item.published).map((item) => `${item.preset}:${item.id}`))
    return Object.fromEntries(Object.entries(actions).map(([preset, rows]) => [
      preset,
      rows.filter((action) => published.has(`${preset}:${action.id}`)),
    ]))
  }

  private actionStatus(preset: string, action: QuickAction, modelKeys: Set<string>, capabilities: Set<ModelCapability>, webSearchAvailable: boolean): QuickActionStatus {
    const unavailable = (handler: string, reason: string): QuickActionStatus => ({ id: action.id, preset, handler, available: false, published: false, reason })
    const handler = action.actionType === 'OFFICE' ? 'office.task' : action.actionType === 'ROUTE' ? 'route.open' : 'prompt.compose'
    if (!action.enabled) return unavailable(handler, '管理员已停用')
    if (action.modelKey && !modelKeys.has(action.modelKey)) return unavailable(handler, `绑定模型 ${action.modelKey} 当前没有可用渠道`)
    if (action.webSearch && !webSearchAvailable) return unavailable(handler, '未配置可用的联网搜索渠道')

    if (action.actionType === 'PROMPT') {
      if (!action.prompt.trim()) return unavailable(handler, '提示词为空')
      if (!capabilities.has(ModelCapability.CHAT)) return unavailable(handler, '没有可用的聊天模型')
    } else if (action.actionType === 'OFFICE') {
      if (!OFFICE_TARGETS.has(action.target)) return unavailable(handler, '办公能力未注册')
      if (!capabilities.has(ModelCapability.CHAT)) return unavailable(handler, '没有可用的聊天模型')
    } else if (action.actionType === 'ROUTE') {
      if (/^https:\/\//i.test(action.target)) return { id: action.id, preset, handler, available: true, published: true, reason: '' }
      const route = this.routePath(action.target)
      if (!INTERNAL_ROUTES.has(route)) return unavailable(handler, '站内路由未注册')
      const required = INTERNAL_ROUTES.get(route)
      if (required && !capabilities.has(required)) return unavailable(handler, `没有可用的 ${required} 模型`)
    } else {
      return unavailable(handler, '动作处理器未注册')
    }

    return { id: action.id, preset, handler, available: true, published: true, reason: '' }
  }

  private routePath(target: string) {
    const path = target.trim().split(/[?#]/, 1)[0].replace(/\/+$/, '')
    return path || '/'
  }

  private providerAvailable(provider: { type: ProviderType; enabled: boolean; encryptedApiKey: string; lastHealthStatus: string | null; cooldownUntil: Date | null } | null, now: Date) {
    if (!provider || !this.healthAvailable(provider, now)) return false
    return provider.type === ProviderType.POLLINATIONS || provider.type === ProviderType.LOCAL_WORKER || Boolean(provider.encryptedApiKey.trim())
  }

  private providerConfigured(provider: { type: ProviderType; enabled: boolean; encryptedApiKey: string; cooldownUntil: Date | null } | null, now: Date) {
    if (!provider || provider.enabled === false || (provider.cooldownUntil && provider.cooldownUntil > now)) return false
    return provider.type === ProviderType.POLLINATIONS || provider.type === ProviderType.LOCAL_WORKER || Boolean(provider.encryptedApiKey.trim())
  }

  private healthAvailable(value: { enabled?: boolean; lastHealthStatus: string | null; cooldownUntil: Date | null }, now: Date) {
    return value.enabled !== false && value.lastHealthStatus === 'healthy' && (!value.cooldownUntil || value.cooldownUntil <= now)
  }

}
