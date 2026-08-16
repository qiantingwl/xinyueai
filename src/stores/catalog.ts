import { defineStore } from 'pinia'
import { api } from '../services/api'

export interface PublicCatalogSettings {
  siteName: string
  sidebarCreationEnabled: boolean
  sidebarCommerceEnabled: boolean
  sidebarOfficeEnabled: boolean
  sidebarPromptsEnabled: boolean
  sidebarPluginsEnabled: boolean
  sidebarProjectsEnabled: boolean
  sidebarAssetsEnabled: boolean
  chatUiPreset: 'gpt' | 'doubao' | 'qianwen' | 'kimi'
  chatHomeContent: ChatHomeContent
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

export interface ChatHomeContent {
  doubaoRecommendations: Array<{ title: string; prompt: string; targetUrl?: string }>
  qianwenBanners: Array<{ title: string; description: string; buttonText: string; imageUrl: string; targetUrl: string }>
  kimiProject: { label: string; targetUrl: string }
}
type RecommendationResponse = { enabled?: boolean; items?: Array<{ title: string; prompt: string; targetUrl?: string }> }

const defaultChatHomeContent: ChatHomeContent = {
  doubaoRecommendations: [
    { title: '热点：北语教授刘宗迪称《山海经》并非怪物图鉴', prompt: '请介绍这个热点，并说明相关观点和背景。', targetUrl: '' },
    { title: '语言模型的训练数据如何影响 AI 回答的准确性和多样性？', prompt: '语言模型的训练数据如何影响 AI 回答的准确性和多样性？', targetUrl: '' },
    { title: '长期喝全糖饮品对身体有哪些影响？', prompt: '长期喝全糖饮品对身体有哪些影响？', targetUrl: '' },
    { title: '有哪些训练方法能让猫听懂指令？', prompt: '有哪些训练方法能让猫听懂指令？', targetUrl: '' },
  ],
  qianwenBanners: [
    { title: 'Xinyue 办公助理上线', description: '解锁本地任务能力，多格式交付', buttonText: '立即体验', imageUrl: '', targetUrl: '/office' },
    { title: 'Xinyue 输入法 App 全新上线', description: '说话即成稿，支持多种语言', buttonText: '立即下载体验', imageUrl: '', targetUrl: '/office' },
  ],
  kimiProject: { label: '选择项目', targetUrl: '/projects' },
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
  chatUiPreset: 'gpt',
  chatHomeContent: defaultChatHomeContent,
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

export const useCatalogStore = defineStore('catalog', {
  state: () => ({ settings: { ...emptySettings } as PublicCatalogSettings, loaded: false, loading: false }),
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
    async load() {
      if (this.loaded) return this.settings
      this.loading = true
      try {
        pendingLoad ||= api<Partial<PublicCatalogSettings>>('/catalog/settings')
        const settings = await pendingLoad
        const content: Partial<ChatHomeContent> = settings.chatHomeContent || {}
        const rawKimiProject = content.kimiProject
        this.settings = {
          ...emptySettings,
          ...settings,
          chatHomeContent: {
            ...defaultChatHomeContent,
            ...content,
            doubaoRecommendations: Array.isArray(content.doubaoRecommendations) ? content.doubaoRecommendations : defaultChatHomeContent.doubaoRecommendations,
            qianwenBanners: Array.isArray(content.qianwenBanners) ? content.qianwenBanners : defaultChatHomeContent.qianwenBanners,
            kimiProject: rawKimiProject && typeof rawKimiProject === 'object' ? { ...defaultChatHomeContent.kimiProject, ...rawKimiProject } : defaultChatHomeContent.kimiProject,
          }
        }
        void this.refreshRecommendations()
      } catch {
        this.settings = { ...emptySettings }
      } finally {
        pendingLoad = null
        this.loaded = true
        this.loading = false
      }
      return this.settings
    },
    async refreshRecommendations() {
      const result = await api<RecommendationResponse>('/catalog/recommendations').catch(() => ({ items: [] }))
      const items = Array.isArray(result.items) ? result.items.filter((item) => item && typeof item.title === 'string' && item.title.trim()) : []
      if (items.length) this.settings.chatHomeContent.doubaoRecommendations = items
    },
  },
})
