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

const emptySettings: PublicCatalogSettings = {
  siteName: 'Xinyue AI',
  sidebarCreationEnabled: true,
  sidebarCommerceEnabled: true,
  sidebarOfficeEnabled: true,
  sidebarPromptsEnabled: true,
  sidebarPluginsEnabled: true,
  sidebarProjectsEnabled: true,
  sidebarAssetsEnabled: true,
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
        this.settings = { ...emptySettings, ...settings }
      } catch {
        this.settings = { ...emptySettings }
      } finally {
        pendingLoad = null
        this.loaded = true
        this.loading = false
      }
      return this.settings
    },
  },
})
