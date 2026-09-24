import { defineStore } from 'pinia'
import { api } from '../services/api'
import { emptySectionNav, emptySidebarNav, parseSectionNav, parseSidebarNav, type SectionNavPreference, type SidebarNavPreference } from '../utils/sidebar-nav'

export interface PublicCatalogSettings {
  siteName: string
  sidebarCreationEnabled: boolean
  sidebarCommerceEnabled: boolean
  sidebarOfficeEnabled: boolean
  sidebarPromptsEnabled: boolean
  sidebarPluginsEnabled: boolean
  sidebarProjectsEnabled: boolean
  sidebarAssetsEnabled: boolean
  sidebarNav: SidebarNavPreference
  workspaceNav: SidebarNavPreference
  sectionNav: SectionNavPreference
  imagePromptEnabled: boolean
  chatUiPreset: 'gpt' | 'doubao' | 'qianwen' | 'kimi' | 'jixing'
  chatAvatarMotion: 'ambient' | 'active' | 'off'
  chatAvatarEnabled: boolean
  chatAvatarStyle: 'classic' | 'lively' | 'calm' | 'geometric' | 'faces' | 'orbit' | 'comet' | 'thinker' | 'sleepy'
  chatAvatarColor: string
  chatHomeContent: ChatHomeContent
  siteContent: SiteContent
  registrationEnabled: boolean
  emailLoginEnabled: boolean
  emailVerifyEnabled: boolean
  passwordLoginEnabled: boolean
  passwordRegistrationEnabled: boolean
  linuxDoLoginEnabled: boolean
  linuxDoLoginReady: boolean
  smtpReady: boolean
  otpResendSeconds: number
  userByokEnabled: boolean
  rechargeEnabled: boolean
  subscriptionsEnabled: boolean
  trialEnabled: boolean
  currency: string
}

export type LandingContent = {
  heroLead: string
  modes: Array<{ key: string; title: string; path: string; image: string; imageAlt: string; lead: string; description: string; actions: Array<{ label: string; to: string }> }>
  navGroups: Array<{ key: string; label: string; items: Array<{ label: string; description: string; to: string }> }>
  previewNav: string[]
  trustTitle: string
  trustDescription: string
  trustItems: Array<{ title: string; description: string }>
  linksTitle: string
  linksDescription: string
  capabilityLinks: Array<{ title: string; description: string; to: string }>
  faqTitle: string
  faqs: Array<{ question: string; answer: string }>
  finalTitle: string
  finalDescription: string
  footerDescription: string
  copyright: string
}
export type SiteContent = { landing?: Partial<LandingContent> }

export type ChatUiPreset = 'gpt' | 'doubao' | 'qianwen' | 'kimi' | 'jixing'
export type ChatQuickAction = {
  id: string
  label: string
  icon: string
  placement: 'BAR' | 'MORE'
  actionType: 'PROMPT' | 'OFFICE' | 'ROUTE'
  prompt: string
  target: string
  modelKey: string
  imageUrl: string
  webSearch: boolean
  enabled: boolean
  sortOrder: number
}
export type ChatComposerControls = {
  modeEnabled: boolean
  webSearchEnabled: boolean
  modelSelectorEnabled: boolean
  moreEnabled: boolean
}

export interface ChatHomeContent {
  doubaoRecommendations: ChatRecommendation[]
  qianwenBanners: Array<{ title: string; description: string; buttonText: string; imageUrl: string; targetUrl: string }>
  kimiProject: { label: string; targetUrl: string }
  composerControls: Record<ChatUiPreset, ChatComposerControls>
  quickActions: Record<ChatUiPreset, ChatQuickAction[]>
}
export type ChatRecommendation = { title: string; prompt: string; targetUrl?: string; source?: string; sourceUrl?: string; publishedAt?: string }
type RecommendationResponse = { enabled?: boolean; items?: ChatRecommendation[]; pool?: ChatRecommendation[]; limit?: number; updatedAt?: string }

const recommendationCacheKey = 'xinyue:chat:recommendations:v2'
const catalogPresetCacheKey = 'xinyue:catalog:preset:v1'

function readCachedPreset(): Pick<PublicCatalogSettings, 'chatUiPreset'> {
  if (typeof window === 'undefined') return { chatUiPreset: 'gpt' }
  try {
    const cached = JSON.parse(window.localStorage.getItem(catalogPresetCacheKey) || '{}') as Record<string, unknown>
    const chatUiPreset = ['gpt', 'doubao', 'qianwen', 'kimi', 'jixing'].includes(String(cached.chatUiPreset))
      ? cached.chatUiPreset as PublicCatalogSettings['chatUiPreset']
      : 'gpt'
    return { chatUiPreset }
  } catch {
    return { chatUiPreset: 'gpt' }
  }
}

function validRecommendations(value: unknown): ChatRecommendation[] {
  return Array.isArray(value)
    ? value.filter((item): item is ChatRecommendation => Boolean(item && typeof item === 'object' && typeof (item as ChatRecommendation).title === 'string' && (item as ChatRecommendation).title.trim()))
    : []
}

function readRecommendationCache() {
  if (typeof window === 'undefined') return { pool: [] as ChatRecommendation[], shown: [] as string[], limit: 8, updatedAt: '' }
  try {
    const cached = JSON.parse(window.localStorage.getItem(recommendationCacheKey) || '{}') as { pool?: unknown; shown?: unknown; limit?: unknown; updatedAt?: unknown }
    return {
      pool: validRecommendations(cached.pool),
      shown: Array.isArray(cached.shown) ? cached.shown.filter((title): title is string => typeof title === 'string') : [],
      limit: Math.min(12, Math.max(3, Number(cached.limit) || 8)),
      updatedAt: typeof cached.updatedAt === 'string' ? cached.updatedAt : '',
    }
  } catch {
    return { pool: [] as ChatRecommendation[], shown: [] as string[], limit: 8, updatedAt: '' }
  }
}

function selectRecommendations(pool: ChatRecommendation[], limit: number, previous: string[] = []) {
  const previousSet = new Set(previous.map((title) => title.trim().toLocaleLowerCase()))
  const shuffle = (items: ChatRecommendation[]) => {
    const output = [...items]
    for (let index = output.length - 1; index > 0; index -= 1) {
      const next = Math.floor(Math.random() * (index + 1))
      ;[output[index], output[next]] = [output[next], output[index]]
    }
    return output
  }
  const fresh = shuffle(pool.filter((item) => !previousSet.has(item.title.trim().toLocaleLowerCase())))
  const repeated = shuffle(pool.filter((item) => previousSet.has(item.title.trim().toLocaleLowerCase())))
  return [...fresh, ...repeated].slice(0, Math.min(limit, pool.length))
}

function initialRecommendations() {
  const cached = readRecommendationCache()
  const items = selectRecommendations(cached.pool, cached.limit, cached.shown)
  if (typeof window !== 'undefined' && cached.pool.length) {
    window.localStorage.setItem(recommendationCacheKey, JSON.stringify({ pool: cached.pool, shown: items.map((item) => item.title), limit: cached.limit, updatedAt: cached.updatedAt }))
  }
  return items
}

function remapLegacyQuickActions(actions: ChatHomeContent['quickActions']): ChatHomeContent['quickActions'] {
  return {
    ...actions,
    kimi: (actions.kimi || []).map((item) => (
      item.id === 'kimi-design' && (item.target === '/image' || item.target.startsWith('/image?'))
        ? { ...item, target: '/canvases' }
        : item
    )),
  }
}

// Exported so the studio home page can fall back to these defaults when the
// backend has cleared every home content block (see StudioPage.vue).
export const defaultChatHomeContent: ChatHomeContent = {
  // 时效热点由 live recommendations 接口填充（见 initialRecommendations）；
  // 这里只放不会过期的常青引导问题，首页绝不把旧数据伪装成"当前热点"。
  doubaoRecommendations: [
    { title: '哪些行业将在未来五年内快速崛起？', prompt: '哪些行业将在未来五年内快速崛起？请结合技术趋势分点分析。' },
    { title: '用大白话解释一下什么是"多模态"', prompt: '用大白话解释一下什么是"多模态"，举两个生活中的例子。' },
    { title: '帮我想 10 个短视频开头钩子', prompt: '帮我想 10 个短视频开头钩子，要求 3 秒内抓住注意力，主题不限。' },
    { title: '帮我梳理一份新品的营销思路', prompt: '帮我梳理一份新品发布的营销思路：定位、渠道、内容节奏各一节。' },
  ],
  qianwenBanners: [
    { title: 'Xinyue 办公助理上线', description: '解锁本地任务能力，多格式交付', buttonText: '立即体验', imageUrl: '', targetUrl: '/office' },
    { title: '多格式办公文件交付', description: '生成可继续编辑的 PPTX、DOCX 与 XLSX 文件', buttonText: '开始办公任务', imageUrl: '', targetUrl: '/office' },
    { title: '会议材料整理', description: '根据会议文字或文档提炼议题、结论与待办', buttonText: '整理会议材料', imageUrl: '', targetUrl: '/office?tool=meeting' },
  ],
  kimiProject: { label: '选择项目', targetUrl: '/workspace?tab=projects' },
  composerControls: {
    gpt: { modeEnabled: false, webSearchEnabled: true, modelSelectorEnabled: true, moreEnabled: false },
    doubao: { modeEnabled: true, webSearchEnabled: true, modelSelectorEnabled: true, moreEnabled: true },
    qianwen: { modeEnabled: true, webSearchEnabled: true, modelSelectorEnabled: true, moreEnabled: true },
    kimi: { modeEnabled: true, webSearchEnabled: true, modelSelectorEnabled: true, moreEnabled: true },
    jixing: { modeEnabled: false, webSearchEnabled: true, modelSelectorEnabled: true, moreEnabled: false },
  },
  quickActions: {
    gpt: [],
    doubao: [
      { id: 'doubao-video', label: '视频生成', icon: 'video', placement: 'BAR', actionType: 'ROUTE', prompt: '', target: '/video', modelKey: '', imageUrl: '', webSearch: false, enabled: true, sortOrder: 10 },
      { id: 'doubao-music', label: '音乐创作方案', icon: 'music', placement: 'BAR', actionType: 'PROMPT', prompt: '请根据以下描述策划音乐风格、结构、歌词方向与制作方案：', target: '', modelKey: '', imageUrl: '', webSearch: false, enabled: true, sortOrder: 20 },
      { id: 'doubao-image', label: '图像生成', icon: 'image', placement: 'BAR', actionType: 'ROUTE', prompt: '', target: '/image', modelKey: '', imageUrl: '', webSearch: false, enabled: true, sortOrder: 30 },
      { id: 'doubao-podcast', label: 'AI 播客', icon: 'podcast', placement: 'BAR', actionType: 'PROMPT', prompt: '请策划一份 AI 播客脚本：', target: '', modelKey: '', imageUrl: '', webSearch: false, enabled: true, sortOrder: 40 },
      { id: 'doubao-table', label: 'AI 表格', icon: 'table', placement: 'BAR', actionType: 'OFFICE', prompt: '', target: 'spreadsheet', modelKey: '', imageUrl: '', webSearch: false, enabled: true, sortOrder: 50 },
      { id: 'doubao-writing', label: '帮我写作', icon: 'writing', placement: 'BAR', actionType: 'OFFICE', prompt: '请帮我撰写：', target: 'writing', modelKey: '', imageUrl: '', webSearch: false, enabled: true, sortOrder: 60 },
      { id: 'doubao-transcribe', label: '会议纪要', icon: 'transcribe', placement: 'BAR', actionType: 'OFFICE', prompt: '请根据我提供的会议文字或文档整理会议纪要：', target: 'meeting', modelKey: '', imageUrl: '', webSearch: false, enabled: true, sortOrder: 70 },
      { id: 'doubao-ppt', label: 'PPT 生成', icon: 'ppt', placement: 'MORE', actionType: 'OFFICE', prompt: '', target: 'ppt', modelKey: '', imageUrl: '', webSearch: false, enabled: true, sortOrder: 10 },
      { id: 'doubao-translate', label: '翻译', icon: 'translate', placement: 'MORE', actionType: 'PROMPT', prompt: '请准确翻译以下内容：', target: '', modelKey: '', imageUrl: '', webSearch: false, enabled: true, sortOrder: 20 },
      { id: 'doubao-research', label: '深入研究', icon: 'research', placement: 'MORE', actionType: 'PROMPT', prompt: '请深入研究并给出可核验的资料来源：', target: '', modelKey: '', imageUrl: '', webSearch: true, enabled: true, sortOrder: 30 },
      { id: 'doubao-answer', label: '解题答疑', icon: 'answer', placement: 'MORE', actionType: 'PROMPT', prompt: '请分步解答以下问题：', target: '', modelKey: '', imageUrl: '', webSearch: false, enabled: true, sortOrder: 40 },
      { id: 'doubao-analysis', label: '数据分析', icon: 'table', placement: 'MORE', actionType: 'OFFICE', prompt: '', target: 'analysis', modelKey: '', imageUrl: '', webSearch: false, enabled: true, sortOrder: 50 },
    ],
    qianwen: [
      { id: 'qianwen-office', label: '办公助理', icon: 'office', placement: 'BAR', actionType: 'OFFICE', prompt: '', target: 'daily', modelKey: '', imageUrl: '', webSearch: false, enabled: true, sortOrder: 10 },
      { id: 'qianwen-ppt', label: 'PPT 创作', icon: 'ppt', placement: 'BAR', actionType: 'OFFICE', prompt: '', target: 'ppt', modelKey: '', imageUrl: '', webSearch: false, enabled: true, sortOrder: 20 },
      { id: 'qianwen-video', label: 'AI 生视频', icon: 'video', placement: 'BAR', actionType: 'ROUTE', prompt: '', target: '/video', modelKey: '', imageUrl: '', webSearch: false, enabled: true, sortOrder: 30 },
      { id: 'qianwen-image', label: 'AI 生图', icon: 'image', placement: 'BAR', actionType: 'ROUTE', prompt: '', target: '/image', modelKey: '', imageUrl: '', webSearch: false, enabled: true, sortOrder: 40 },
      { id: 'qianwen-code', label: '代码', icon: 'code', placement: 'MORE', actionType: 'OFFICE', prompt: '', target: 'development', modelKey: '', imageUrl: '', webSearch: false, enabled: true, sortOrder: 10 },
      { id: 'qianwen-translate', label: '翻译', icon: 'translate', placement: 'MORE', actionType: 'PROMPT', prompt: '请准确翻译以下内容：', target: '', modelKey: '', imageUrl: '', webSearch: false, enabled: true, sortOrder: 20 },
      { id: 'qianwen-writing', label: 'AI 写作', icon: 'writing', placement: 'MORE', actionType: 'OFFICE', prompt: '', target: 'writing', modelKey: '', imageUrl: '', webSearch: false, enabled: true, sortOrder: 30 },
      { id: 'qianwen-research', label: '研究', icon: 'research', placement: 'MORE', actionType: 'PROMPT', prompt: '请深入研究并给出可核验的资料来源：', target: '', modelKey: '', imageUrl: '', webSearch: true, enabled: true, sortOrder: 40 },
      { id: 'qianwen-meeting', label: '会议纪要', icon: 'transcribe', placement: 'MORE', actionType: 'OFFICE', prompt: '请根据我提供的会议文字或文档整理会议纪要：', target: 'meeting', modelKey: '', imageUrl: '', webSearch: false, enabled: true, sortOrder: 50 },
    ],
    kimi: [
      { id: 'kimi-ppt', label: 'PPT', icon: 'ppt', placement: 'BAR', actionType: 'OFFICE', prompt: '', target: 'ppt', modelKey: '', imageUrl: '', webSearch: false, enabled: true, sortOrder: 10 },
      { id: 'kimi-agent', label: '集群', icon: 'office', placement: 'BAR', actionType: 'OFFICE', prompt: '', target: 'daily', modelKey: '', imageUrl: '', webSearch: false, enabled: true, sortOrder: 20 },
      { id: 'kimi-research', label: '深度研究', icon: 'research', placement: 'BAR', actionType: 'PROMPT', prompt: '请深入研究并给出可核验的资料来源：', target: '', modelKey: '', imageUrl: '', webSearch: true, enabled: true, sortOrder: 30 },
      { id: 'kimi-document', label: '文档', icon: 'document', placement: 'BAR', actionType: 'OFFICE', prompt: '', target: 'report', modelKey: '', imageUrl: '', webSearch: false, enabled: true, sortOrder: 40 },
      { id: 'kimi-website', label: '网站', icon: 'website', placement: 'BAR', actionType: 'OFFICE', prompt: '', target: 'development', modelKey: '', imageUrl: '', webSearch: false, enabled: true, sortOrder: 50 },
      { id: 'kimi-table', label: '表格', icon: 'table', placement: 'BAR', actionType: 'OFFICE', prompt: '', target: 'spreadsheet', modelKey: '', imageUrl: '', webSearch: false, enabled: true, sortOrder: 60 },
      { id: 'kimi-design', label: '设计', icon: 'design', placement: 'BAR', actionType: 'ROUTE', prompt: '', target: '/canvases', modelKey: '', imageUrl: '', webSearch: false, enabled: true, sortOrder: 70 },
    ],
    jixing: [
      { id: 'jixing-polish', label: '一键商品精修', icon: 'image', placement: 'BAR', actionType: 'ROUTE', prompt: '', target: '/image', modelKey: '', imageUrl: '', webSearch: false, enabled: true, sortOrder: 10 },
      { id: 'jixing-mainimage', label: '电商主图直出', icon: 'design', placement: 'BAR', actionType: 'ROUTE', prompt: '', target: '/image', modelKey: '', imageUrl: '', webSearch: false, enabled: true, sortOrder: 20 },
      { id: 'jixing-detail', label: '商品详情页/A+', icon: 'ppt', placement: 'BAR', actionType: 'PROMPT', prompt: '请为以下商品生成详情页/A+ 文案与版面方案：', target: '', modelKey: '', imageUrl: '', webSearch: false, enabled: true, sortOrder: 30 },
      { id: 'jixing-scene', label: '商品场景图', icon: 'image', placement: 'BAR', actionType: 'ROUTE', prompt: '', target: '/image', modelKey: '', imageUrl: '', webSearch: false, enabled: true, sortOrder: 40 },
      { id: 'jixing-ppt', label: 'PPT 生成', icon: 'ppt', placement: 'MORE', actionType: 'OFFICE', prompt: '', target: 'ppt', modelKey: '', imageUrl: '', webSearch: false, enabled: true, sortOrder: 10 },
      { id: 'jixing-translate', label: '翻译', icon: 'translate', placement: 'MORE', actionType: 'PROMPT', prompt: '请准确翻译以下内容：', target: '', modelKey: '', imageUrl: '', webSearch: false, enabled: true, sortOrder: 20 },
      { id: 'jixing-research', label: '深入研究', icon: 'research', placement: 'MORE', actionType: 'PROMPT', prompt: '请深入研究并给出可核验的资料来源：', target: '', modelKey: '', imageUrl: '', webSearch: true, enabled: true, sortOrder: 30 },
      { id: 'jixing-answer', label: '解题答疑', icon: 'answer', placement: 'MORE', actionType: 'PROMPT', prompt: '请分步解答以下问题：', target: '', modelKey: '', imageUrl: '', webSearch: false, enabled: true, sortOrder: 40 },
      { id: 'jixing-analysis', label: '数据分析', icon: 'table', placement: 'MORE', actionType: 'OFFICE', prompt: '', target: 'analysis', modelKey: '', imageUrl: '', webSearch: false, enabled: true, sortOrder: 50 },
    ],
  },
}

const emptySettings: PublicCatalogSettings = {
  siteName: 'Xinyue AI',
  sidebarCreationEnabled: true,
  sidebarCommerceEnabled: true,
  sidebarOfficeEnabled: true,
  sidebarPromptsEnabled: true,
  sidebarPluginsEnabled: true,
  sidebarProjectsEnabled: true,
  sidebarAssetsEnabled: true,
  sidebarNav: emptySidebarNav(),
  workspaceNav: emptySidebarNav(),
  sectionNav: emptySectionNav(),
  imagePromptEnabled: true,
  chatUiPreset: 'gpt',
  chatAvatarMotion: 'ambient',
  chatAvatarEnabled: true,
  chatAvatarStyle: 'classic',
  chatAvatarColor: 'auto',
  chatHomeContent: defaultChatHomeContent,
  siteContent: {},
  registrationEnabled: false,
  emailLoginEnabled: false,
  emailVerifyEnabled: false,
  passwordLoginEnabled: false,
  passwordRegistrationEnabled: false,
  linuxDoLoginEnabled: false,
  linuxDoLoginReady: false,
  smtpReady: false,
  otpResendSeconds: 60,
  userByokEnabled: false,
  rechargeEnabled: false,
  subscriptionsEnabled: false,
  trialEnabled: false,
  currency: 'CNY',
}

let pendingLoad: Promise<Partial<PublicCatalogSettings>> | null = null
let refreshTimer = 0

export const useCatalogStore = defineStore('catalog', {
  state: () => ({
    settings: {
      ...emptySettings,
      ...readCachedPreset(),
      chatHomeContent: {
        ...defaultChatHomeContent,
        // 实时热点优先；没有热点数据时回落到常青引导问题，保证豆包首页"为你推荐"不空
        doubaoRecommendations: (() => { const recs = initialRecommendations(); return recs.length ? recs : defaultChatHomeContent.doubaoRecommendations })(),
      },
    } as PublicCatalogSettings,
    loaded: false,
    loading: false,
    loadError: '',
  }),
  getters: {
    registrationEnabled: (state) => state.loaded && state.settings.registrationEnabled,
    emailLoginEnabled: (state) => state.loaded && state.settings.emailLoginEnabled,
    emailVerifyEnabled: (state) => state.loaded && state.settings.emailVerifyEnabled,
    passwordLoginEnabled: (state) => state.loaded && state.settings.passwordLoginEnabled,
    passwordRegistrationEnabled: (state) => state.loaded && state.settings.passwordRegistrationEnabled,
    linuxDoLoginEnabled: (state) => state.loaded && state.settings.linuxDoLoginEnabled,
    linuxDoLoginReady: (state) => state.loaded && state.settings.linuxDoLoginReady,
    loginEnabled: (state) => state.loaded && (state.settings.passwordLoginEnabled || state.settings.emailLoginEnabled || state.settings.emailVerifyEnabled || state.settings.linuxDoLoginReady),
    registrationAvailable: (state) => state.loaded && state.settings.registrationEnabled && (state.settings.passwordRegistrationEnabled || state.settings.emailVerifyEnabled || state.settings.linuxDoLoginReady),
  },
  actions: {
    async load(force = false) {
      if (this.loaded && !force) return this.settings
      const hadUsableSettings = this.loaded && !this.loadError
      this.loading = true
      try {
        pendingLoad ||= api<Partial<PublicCatalogSettings>>('/catalog/settings')
        const settings = await pendingLoad
        const content: Partial<ChatHomeContent> = settings.chatHomeContent || {}
        const quickActions = remapLegacyQuickActions({
          ...defaultChatHomeContent.quickActions,
          ...(content.quickActions || {}),
        })
        this.settings = {
          ...emptySettings,
          ...settings,
          sidebarNav: parseSidebarNav(settings.sidebarNav),
          workspaceNav: parseSidebarNav(settings.workspaceNav),
          sectionNav: parseSectionNav(settings.sectionNav),
          chatHomeContent: {
            ...defaultChatHomeContent,
            ...content,
            doubaoRecommendations: this.settings.chatHomeContent.doubaoRecommendations,
            quickActions,
          }
        }
        this.loadError = ''
        try {
          window.localStorage.setItem(catalogPresetCacheKey, JSON.stringify({
            chatUiPreset: this.settings.chatUiPreset,
          }))
        } catch { /* Private browsing can disable local storage. */ }
        void this.refreshRecommendations()
      } catch {
        if (!hadUsableSettings) {
          this.settings = { ...emptySettings }
          this.loadError = '暂时无法连接 Xinyue AI 服务，请确认服务已启动后重试。'
        }
      } finally {
        pendingLoad = null
        this.loaded = true
        this.loading = false
        if (typeof window !== 'undefined') {
          window.clearTimeout(refreshTimer)
          refreshTimer = window.setTimeout(() => void this.load(true), document.hidden ? 300_000 : 60_000)
        }
      }
      return this.settings
    },
    async refreshRecommendations() {
      const result = await api<RecommendationResponse>('/catalog/recommendations').catch(() => null)
      if (!result) return
      const pool = validRecommendations(result.pool?.length ? result.pool : result.items)
      if (!pool.length) return
      const cached = readRecommendationCache()
      const limit = Math.min(12, Math.max(3, Number(result.limit) || cached.limit || 8))
      if (result.updatedAt && result.updatedAt === cached.updatedAt && this.settings.chatHomeContent.doubaoRecommendations.length) {
        window.localStorage.setItem(recommendationCacheKey, JSON.stringify({ pool, shown: this.settings.chatHomeContent.doubaoRecommendations.map((item) => item.title), limit, updatedAt: result.updatedAt }))
        return
      }
      const items = selectRecommendations(pool, limit, this.settings.chatHomeContent.doubaoRecommendations.map((item) => item.title))
      this.settings.chatHomeContent.doubaoRecommendations = items
      window.localStorage.setItem(recommendationCacheKey, JSON.stringify({ pool, shown: items.map((item) => item.title), limit, updatedAt: result.updatedAt || '' }))
    },
  },
})
