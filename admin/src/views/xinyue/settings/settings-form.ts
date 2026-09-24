import type { ChatHomeContent, SiteContent, SystemSettings } from '@/api/xinyue/settings'

const editableSettingKeys = [
  'siteName',
  'siteLogoUrl',
  'supportUrl',
  'sidebarCreationEnabled',
  'sidebarCommerceEnabled',
  'sidebarOfficeEnabled',
  'sidebarPromptsEnabled',
  'sidebarPluginsEnabled',
  'sidebarProjectsEnabled',
  'sidebarAssetsEnabled',
  'sidebarNav',
  'workspaceNav',
  'sectionNav',
  'registrationEnabled',
  'emailLoginEnabled',
  'emailVerifyEnabled',
  'passwordLoginEnabled',
  'passwordRegistrationEnabled',
  'linuxDoLoginEnabled',
  'linuxDoClientId',
  'linuxDoRedirectUrl',
  'linuxDoScopes',
  'linuxDoAuthorizeUrl',
  'linuxDoTokenUrl',
  'linuxDoUserInfoUrl',
  'otpTtlMinutes',
  'otpResendSeconds',
  'defaultUserCredits',
  'defaultTheme',
  'defaultLanguage',
  'chatUiPreset',
  'chatAvatarMotion',
  'chatAvatarEnabled',
  'chatAvatarStyle',
  'chatAvatarColor',
  'chatHomeContent',
  'siteContent',
  'defaultChatModelKey',
  'defaultImageModelKey',
  'imagePromptEnabled',
  'imagePromptModelKey',
  'imagePromptBillingMode',
  'userByokEnabled',
  'inviteRewardCredits',
  'referralEnabled',
  'referralCoolingDays',
  'referralMinimumPaidCents',
  'referralMonthlyRewardLimit',
  'referralAutoApprove',
  'rechargeEnabled',
  'minRechargeCents',
  'currency',
  'creditValueMicros',
  'pricingUsdExchangeRateMicros',
  'modelImportMarkupPercent',
  'modelPriceCatalogUrl',
  'modelPriceCatalogRefreshHours',
  'subscriptionsEnabled',
  'trialEnabled',
  'defaultTrialPlanId',
  'trialCredits',
  'defaultUserGroupId',
  'temporaryChatRetentionHours',
  'defaultChatHistoryEnabled',
  'defaultTrainingOptOut',
  'defaultShareUsageAnalytics',
  'smtpEnabled',
  'smtpHost',
  'smtpPort',
  'smtpSecure',
  'smtpUsername',
  'smtpFromName',
  'smtpFromEmail'
] as const satisfies readonly (keyof SystemSettings)[]

const defaultChatHomeContent: ChatHomeContent = {
  doubaoRecommendations: [
    {
      title: '热点：北语教授刘宗迪称《山海经》并非怪物图鉴',
      prompt: '请介绍这个热点，并说明相关观点和背景。',
      targetUrl: ''
    },
    {
      title: '语言模型的训练数据如何影响 AI 回答的准确性和多样性？',
      prompt: '语言模型的训练数据如何影响 AI 回答的准确性和多样性？',
      targetUrl: ''
    }
  ],
  qianwenBanners: [
    {
      title: 'Xinyue 办公助理上线',
      description: '解锁本地任务能力，多格式交付',
      buttonText: '立即体验',
      imageUrl: '',
      targetUrl: '/office'
    }
  ],
  kimiProject: { label: '选择项目', targetUrl: '/workspace?tab=projects' },
  composerControls: {
    gpt: {
      modeEnabled: false,
      webSearchEnabled: true,
      modelSelectorEnabled: true,
      moreEnabled: false
    },
    doubao: {
      modeEnabled: true,
      webSearchEnabled: true,
      modelSelectorEnabled: true,
      moreEnabled: true
    },
    qianwen: {
      modeEnabled: true,
      webSearchEnabled: true,
      modelSelectorEnabled: true,
      moreEnabled: true
    },
    kimi: {
      modeEnabled: true,
      webSearchEnabled: true,
      modelSelectorEnabled: true,
      moreEnabled: true
    },
    jixing: {
      modeEnabled: false,
      webSearchEnabled: true,
      modelSelectorEnabled: true,
      moreEnabled: false
    }
  },
  quickActions: { gpt: [], doubao: [], qianwen: [], kimi: [], jixing: [] }
}

export function normalizeChatHomeContent(value: unknown): ChatHomeContent {
  const source =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Partial<ChatHomeContent>)
      : {}
  return {
    doubaoRecommendations: Array.isArray(source.doubaoRecommendations)
      ? source.doubaoRecommendations
      : structuredClone(defaultChatHomeContent.doubaoRecommendations),
    qianwenBanners: Array.isArray(source.qianwenBanners)
      ? source.qianwenBanners
      : structuredClone(defaultChatHomeContent.qianwenBanners),
    kimiProject:
      source.kimiProject && typeof source.kimiProject === 'object'
        ? {
            label: source.kimiProject.label || defaultChatHomeContent.kimiProject.label,
            targetUrl: source.kimiProject.targetUrl || defaultChatHomeContent.kimiProject.targetUrl
          }
        : { ...defaultChatHomeContent.kimiProject },
    composerControls: {
      ...structuredClone(defaultChatHomeContent.composerControls),
      ...(source.composerControls || {})
    },
    quickActions: {
      ...structuredClone(defaultChatHomeContent.quickActions),
      ...(source.quickActions || {})
    }
  }
}

export function normalizeSiteContent(value: SiteContent | null | undefined): SiteContent {
  const landing = value?.landing
  return {
    landing: {
      heroLead: landing?.heroLead || '在一个平台，完成',
      modes: Array.isArray(landing?.modes) ? landing.modes : [],
      navGroups: Array.isArray(landing?.navGroups) ? landing.navGroups : [],
      previewNav: Array.isArray(landing?.previewNav) ? landing.previewNav : [],
      trustTitle: landing?.trustTitle || '',
      trustDescription: landing?.trustDescription || '',
      trustItems: Array.isArray(landing?.trustItems) ? landing.trustItems : [],
      linksTitle: landing?.linksTitle || '',
      linksDescription: landing?.linksDescription || '',
      capabilityLinks: Array.isArray(landing?.capabilityLinks) ? landing.capabilityLinks : [],
      faqTitle: landing?.faqTitle || '',
      faqs: Array.isArray(landing?.faqs) ? landing.faqs : [],
      finalTitle: landing?.finalTitle || '',
      finalDescription: landing?.finalDescription || '',
      footerDescription: landing?.footerDescription || '',
      copyright: landing?.copyright || ''
    }
  }
}

export function buildSystemSettingsPayload(
  settings: SystemSettings,
  domainsText: string,
  smtpPassword: string,
  linuxSecret: string
) {
  return {
    ...Object.fromEntries(editableSettingKeys.map((key) => [key, settings[key]])),
    allowedEmailDomains: domainsText
      .split(/[\n,，;；]+/)
      .map((item) => item.trim().replace(/^@/, ''))
      .filter(Boolean),
    ...(smtpPassword ? { smtpPassword } : {}),
    ...(linuxSecret ? { linuxDoClientSecret: linuxSecret } : {})
  }
}
