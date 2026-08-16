import request from '@/utils/http'

export type Overview = {
  users: number
  newUsers: number
  activeUsers: number
  groups: number
  jobs: number
  runningJobs: number
  failedJobs: number
  assets: number
  storageBytes: number
  creditsSpent: number
  providers: number
  healthyProviders: number
  activeSubscriptions: number
  revenueCents: number
  pendingOrders: number
  trend: Array<{ date: string; newUsers: number; jobs: number; revenueCents: number }>
  today: { newUsers: number; jobs: number; revenueCents: number }
  alerts: {
    paymentFailures: number
    paidPending: number
    unhealthyChannels: number
    suspendedUsers: number
    moderationOpen: number
    supportOpen: number
    supportUrgent: number
  }
}
export type UsageReport = {
  days: number
  summary: {
    jobs: number
    credits: number
    revenueMicros: number
    costMicros: number
    marginMicros: number
    marginRate: number | null
    inputTokens: number
    outputTokens: number
    outputs: number
  }
  daily: Array<{
    date: string
    jobs: number
    credits: number
    revenueMicros: number
    costMicros: number
  }>
  models: Array<{
    key: string
    label: string
    jobs: number
    credits: number
    outputs: number
    revenueMicros: number
    costMicros: number
    marginRate: number | null
  }>
  providers: Array<{
    key: string
    label: string
    jobs: number
    credits: number
    outputs: number
    revenueMicros: number
    costMicros: number
    marginRate: number | null
  }>
}
export type PaymentSummary = {
  channels: number
  enabledChannels: number
  completed: number
  pending: number
  failed: number
  revenueCents: number
  refundedCents: number
  netRevenueCents: number
  recent: PaymentTransaction[]
}
export type PaymentReconciliation = {
  paidPending: number
  expiredPending: number
  failedRecent: number
  unprocessedWebhooks: number
  refundReviews: number
  total: number
}

export type AdminUser = {
  id: string
  username?: string | null
  email: string | null
  displayName: string
  avatarUrl?: string | null
  company?: string | null
  phone?: string | null
  tags?: string[]
  adminNote?: string | null
  status: 'ACTIVE' | 'SUSPENDED'
  createdAt: string
  lastLoginAt?: string | null
  creditAccount?: { balance: number } | null
  groupMemberships: Array<{ group: { id: string; name: string; color: string } }>
  subscriptions: Array<{ status: string; plan: { id: string; name: string; code: string } }>
  _count: { assets: number; jobs: number; projects: number }
}

export type ModelProviderRoute = {
  id?: string
  providerId: string
  upstreamModelOverride?: string | null
  enabled: boolean
  priority?: number | null
  weight?: number | null
  inputCostMicrosPerMillion?: number | null
  outputCostMicrosPerMillion?: number | null
  imageCostMicros?: number | null
  videoCostMicros?: number | null
  options?: {
    videoCapabilities?: { resolutions?: string[]; durations?: number[]; aspectRatios?: string[] }
  } | null
  provider?: Pick<Provider, 'id' | 'name' | 'type' | 'enabled' | 'priority' | 'weight'>
}

export type UserGroup = {
  id: string
  name: string
  description: string
  color: string
  enabled: boolean
  isDefault?: boolean
  restrictModels: boolean
  creditRatePercent: number
  allowUserByok: boolean
  modelAccess: Array<{ modelPresetId: string }>
  members: Array<{
    user: { id: string; email: string | null; displayName: string; status: string }
  }>
  _count: { members: number; campaigns: number; modelAccess: number }
}
export type ProviderType =
  | 'OPENAI'
  | 'NEW_API'
  | 'SUB2API'
  | 'OPENAI_COMPATIBLE'
  | 'POLLINATIONS'
export type Provider = {
  id: string
  name: string
  type: ProviderType
  baseUrl: string
  apiKeyHint: string
  authType: 'BEARER' | 'X_API_KEY' | 'BOTH'
  enabled: boolean
  priority: number
  weight: number
  timeoutMs: number
  allowUserKeys: boolean
  lastHealthStatus?: string
  lastHealthMessage?: string
  consecutiveFailures?: number
  _count: { modelPresets: number; modelRoutes: number }
}

export type ModelPreset = {
  id: string
  key: string
  displayName: string
  description: string
  providerId?: string | null
  upstreamModel: string
  capability: 'CHAT' | 'IMAGE' | 'VIDEO' | 'COMMERCE'
  enabled: boolean
  isDefault: boolean
  allowUserKey: boolean
  sortOrder: number
  flatCreditCost: number
  inputCreditsPerMillion: number
  outputCreditsPerMillion: number
  badge: string
  options?: {
    apiProtocol?: 'openai' | 'anthropic' | 'gemini'
    imageCapabilities?: {
      sizes?: string[]
      qualities?: string[]
      outputFormats?: string[]
      backgrounds?: string[]
      maxCount?: number
      defaultSize?: string
      defaultQuality?: string
      supportsReference?: boolean
      supportsMask?: boolean
      resolutionPricing?: Record<string, number>
    }
    videoCapabilities?: {
      resolutions?: string[]
      durations?: number[]
      aspectRatios?: string[]
      defaultResolution?: string
      defaultDuration?: number
      defaultAspectRatio?: string
      pricing?: Record<string, number>
      createPath?: string
      statusPath?: string
      contentPath?: string
      pollIntervalMs?: number
      maxPollSeconds?: number
    }
  } | null
  provider?: { id: string; name: string } | null
  providerRoutes?: ModelProviderRoute[]
}

export type SubscriptionPlan = {
  id: string
  code: string
  name: string
  description: string
  billingCycle: 'MONTHLY' | 'QUARTERLY' | 'YEARLY' | 'ONE_TIME'
  priceCents: number
  originalPriceCents?: number | null
  currency: string
  includedCredits: number
  trialDays: number
  concurrency: number
  allowByok: boolean
  apiAccess: boolean
  imageAccess: boolean
  videoAccess: boolean
  commerceAccess: boolean
  batchAccess: boolean
  enabled: boolean
  recommended: boolean
  sortOrder: number
}
export type UserSubscription = {
  id: string
  status: string
  currentPeriodEnd?: string | null
  trialEndsAt?: string | null
  user: Pick<AdminUser, 'id' | 'email' | 'displayName'>
  plan: SubscriptionPlan
}
export type SubscriptionOrder = {
  id: string
  status: string
  amountCents: number
  currency: string
  paymentMethod: string
  createdAt: string
  paidAt?: string | null
  user: Pick<AdminUser, 'id' | 'email' | 'displayName'>
  plan: SubscriptionPlan
}
export type RechargePackage = {
  id: string
  name: string
  description: string
  credits: number
  priceCents: number
  originalPriceCents?: number | null
  enabled: boolean
  recommended: boolean
  sortOrder: number
}
export type PaymentChannel = {
  id: string
  name: string
  providerKey: string
  enabled: boolean
  isDefault: boolean
  supportedMethods: string[]
  minAmountCents: number
  maxAmountCents?: number | null
  dailyLimitCents?: number | null
  feeRateBps: number
  sortOrder: number
  publicConfig?: Record<string, unknown>
  secretHints?: Record<string, string>
  lastHealthStatus: string
  lastError: string
  lastCheckedAt?: string | null
  _count?: { transactions: number }
}
export type PaymentTransaction = {
  id: string
  outTradeNo: string
  providerTradeNo?: string | null
  orderType: string
  status: string
  amountCents: number
  currency: string
  paymentMethod: string
  createdAt: string
  failureReason?: string
  user?: Pick<AdminUser, 'id' | 'email' | 'displayName'>
  channel?: { id: string; name: string; providerKey: string }
}
export type RedemptionCode = {
  id: string
  name: string
  codePrefix: string
  credits: number
  maxUses: number
  usedCount: number
  expiresAt?: string | null
  disabledAt?: string | null
  createdAt: string
}
export type ContentPage = {
  id: string
  slug: string
  title: string
  category: string
  summary: string
  contentHtml: string
  coverUrl: string
  published: boolean
  sortOrder: number
  views: number
  publishedAt?: string | null
  createdAt: string
  updatedAt: string
}
export type SystemSettings = {
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
  linuxDoRedirectUrl: string
  linuxDoScopes: string
  linuxDoAuthorizeUrl: string
  linuxDoTokenUrl: string
  linuxDoUserInfoUrl: string
  hasLinuxDoClientSecret: boolean
  linuxDoClientSecretHint: string
  allowedEmailDomains: string[]
  otpTtlMinutes: number
  otpResendSeconds: number
  defaultUserCredits: number
  defaultTheme: string
  defaultLanguage: string
  chatUiPreset: 'gpt' | 'doubao' | 'qianwen' | 'kimi'
  chatHomeContent: ChatHomeContent
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
  smtpFromName: string
  smtpFromEmail: string
  hasSmtpPassword: boolean
  smtpPasswordHint: string
}
export type ChatHomeContent = {
  doubaoRecommendations: Array<{ title: string; prompt: string; targetUrl?: string }>
  qianwenBanners: Array<{
    title: string
    description: string
    buttonText: string
    imageUrl: string
    targetUrl: string
  }>
  kimiProject: { label: string; targetUrl: string }
}

export const xinyueApi = {
  overview: () => request.get<Overview>({ url: '/v1/admin/overview' }),
  usageReport: (days = 30) =>
    request.get<UsageReport>({ url: '/v1/admin/usage-report', params: { days } }),
  users: (params?: Record<string, string>) =>
    request.get<AdminUser[]>({ url: '/v1/admin/users', params }),
  user: (id: string) => request.get<AdminUser>({ url: `/v1/admin/users/${id}` }),
  updateUserProfile: (id: string, body: Record<string, unknown>) =>
    request.request<AdminUser>({
      url: `/v1/admin/users/${id}/profile`,
      method: 'PATCH',
      data: body
    }),
  updateUserGroups: (id: string, groupIds: string[]) =>
    request.request<{ groupIds: string[] }>({
      url: `/v1/admin/users/${id}/groups`,
      method: 'PATCH',
      data: { groupIds }
    }),
  revokeUserSessions: (id: string) =>
    request.post<{ revoked: number }>({
      url: `/v1/admin/users/${id}/revoke-sessions`,
      params: {},
      showSuccessMessage: true
    }),
  groups: () => request.get<UserGroup[]>({ url: '/v1/admin/groups' }),
  saveGroup: (body: Record<string, unknown>, id?: string) =>
    request.request<UserGroup>({
      url: id ? `/v1/admin/groups/${id}` : '/v1/admin/groups',
      method: id ? 'PATCH' : 'POST',
      data: body,
      showSuccessMessage: true
    }),
  deleteGroup: (id: string) =>
    request.del({ url: `/v1/admin/groups/${id}`, showSuccessMessage: true }),
  setDefaultGroup: (id: string) =>
    request.post({ url: `/v1/admin/groups/${id}/default`, params: {}, showSuccessMessage: true }),
  saveGroupPolicy: (id: string, body: Record<string, unknown>) =>
    request.request({
      url: `/v1/admin/groups/${id}/policy`,
      method: 'PATCH',
      data: body,
      showSuccessMessage: true
    }),
  groupMembers: (id: string) =>
    request.get<Array<{ user: AdminUser }>>({ url: `/v1/admin/groups/${id}/members` }),
  addGroupMembers: (id: string, userIds: string[]) =>
    request.post({
      url: `/v1/admin/groups/${id}/members`,
      data: { userIds },
      showSuccessMessage: true
    }),
  removeGroupMember: (id: string, userId: string) =>
    request.del({ url: `/v1/admin/groups/${id}/members/${userId}`, showSuccessMessage: true }),
  setUserStatus: (id: string, status: AdminUser['status']) =>
    request.request({
      url: `/v1/admin/users/${id}/status`,
      method: 'PATCH',
      data: { status },
      showSuccessMessage: true
    }),
  adjustCredits: (id: string, amount: number, reason: string) =>
    request.post({
      url: `/v1/admin/users/${id}/credits`,
      params: { amount, reason },
      showSuccessMessage: true
    }),
  providers: () => request.get<Provider[]>({ url: '/v1/admin/providers' }),
  saveProvider: (body: Record<string, unknown>, id?: string) =>
    request.request<Provider>({
      url: id ? `/v1/admin/providers/${id}` : '/v1/admin/providers',
      method: id ? 'PATCH' : 'POST',
      data: body,
      showSuccessMessage: true
    }),
  deleteProvider: (id: string) =>
    request.del({ url: `/v1/admin/providers/${id}`, showSuccessMessage: true }),
  discoverProvider: (id: string) =>
    request.post<{ models: string[]; latencyMs: number }>({
      url: `/v1/admin/providers/${id}/discover-models`,
      params: {}
    }),
  checkProviders: () =>
    request.post<{ checked: number; healthy: number; unhealthy: number }>({
      url: '/v1/admin/providers/check-all',
      params: {}
    }),
  models: () => request.get<ModelPreset[]>({ url: '/v1/admin/model-presets' }),
  saveModel: (body: Record<string, unknown>, id?: string) =>
    request.request<ModelPreset>({
      url: id ? `/v1/admin/model-presets/${id}` : '/v1/admin/model-presets',
      method: id ? 'PATCH' : 'POST',
      data: body,
      showSuccessMessage: true
    }),
  saveModelRoutes: (id: string, routes: Array<Omit<ModelProviderRoute, 'id' | 'provider'>>) =>
    request.request<ModelPreset>({
      url: `/v1/admin/model-presets/${id}/routes`,
      method: 'PUT',
      data: { routes },
      showSuccessMessage: true
    }),
  deleteModel: (id: string) =>
    request.del({ url: `/v1/admin/model-presets/${id}`, showSuccessMessage: true }),
  plans: () => request.get<SubscriptionPlan[]>({ url: '/v1/admin/subscriptions/plans' }),
  savePlan: (body: Record<string, unknown>, id?: string) =>
    request.request<SubscriptionPlan>({
      url: id ? `/v1/admin/subscriptions/plans/${id}` : '/v1/admin/subscriptions/plans',
      method: id ? 'PATCH' : 'POST',
      data: body,
      showSuccessMessage: true
    }),
  deletePlan: (id: string) =>
    request.del({ url: `/v1/admin/subscriptions/plans/${id}`, showSuccessMessage: true }),
  subscriptions: () => request.get<UserSubscription[]>({ url: '/v1/admin/subscriptions/active' }),
  subscriptionOrders: () =>
    request.get<SubscriptionOrder[]>({ url: '/v1/admin/subscriptions/orders' }),
  grantSubscription: (body: { userId: string; planId: string; days?: number }) =>
    request.post({ url: '/v1/admin/subscriptions/grant', data: body, showSuccessMessage: true }),
  terminateSubscription: (id: string) =>
    request.post({
      url: `/v1/admin/subscriptions/${id}/terminate`,
      params: {},
      showSuccessMessage: true
    }),
  markSubscriptionPaid: (id: string) =>
    request.post({
      url: `/v1/admin/subscriptions/orders/${id}/mark-paid`,
      params: {},
      showSuccessMessage: true
    }),
  cancelSubscriptionOrder: (id: string) =>
    request.post({
      url: `/v1/admin/subscriptions/orders/${id}/cancel`,
      params: {},
      showSuccessMessage: true
    }),
  rechargePackages: () => request.get<RechargePackage[]>({ url: '/v1/admin/recharge-packages' }),
  saveRechargePackage: (body: Record<string, unknown>, id?: string) =>
    request.request<RechargePackage>({
      url: id ? `/v1/admin/recharge-packages/${id}` : '/v1/admin/recharge-packages',
      method: id ? 'PATCH' : 'POST',
      data: body,
      showSuccessMessage: true
    }),
  deleteRechargePackage: (id: string) =>
    request.del({ url: `/v1/admin/recharge-packages/${id}`, showSuccessMessage: true }),
  paymentChannels: () => request.get<PaymentChannel[]>({ url: '/v1/admin/payments/channels' }),
  paymentSummary: () => request.get<PaymentSummary>({ url: '/v1/admin/payments/summary' }),
  paymentReconciliation: () =>
    request.get<PaymentReconciliation>({ url: '/v1/admin/payments/reconciliation' }),
  savePaymentChannel: (body: Record<string, unknown>, id?: string) =>
    request.request<PaymentChannel>({
      url: id ? `/v1/admin/payments/channels/${id}` : '/v1/admin/payments/channels',
      method: id ? 'PATCH' : 'POST',
      data: body,
      showSuccessMessage: true
    }),
  deletePaymentChannel: (id: string) =>
    request.del({ url: `/v1/admin/payments/channels/${id}`, showSuccessMessage: true }),
  checkPaymentChannel: (id: string) =>
    request.post<PaymentChannel>({
      url: `/v1/admin/payments/channels/${id}/check`,
      params: {},
      showSuccessMessage: true
    }),
  paymentTransactions: (params?: Record<string, string>) =>
    request.get<PaymentTransaction[]>({ url: '/v1/admin/payments/transactions', params }),
  completePayment: (id: string) =>
    request.post({
      url: `/v1/admin/payments/transactions/${id}/complete`,
      params: {},
      showSuccessMessage: true
    }),
  redemptionCodes: () => request.get<RedemptionCode[]>({ url: '/v1/admin/redemption-codes' }),
  createRedemptionCode: (body: Record<string, unknown>) =>
    request.post<RedemptionCode & { plainCode: string }>({
      url: '/v1/admin/redemption-codes',
      data: body
    }),
  setRedemptionCodeStatus: (id: string, enabled: boolean) =>
    request.request({
      url: `/v1/admin/redemption-codes/${id}/status`,
      method: 'PATCH',
      data: { enabled },
      showSuccessMessage: true
    }),
  contentPages: (params?: Record<string, string | number>) =>
    request.get<{ items: ContentPage[]; total: number; page: number; pageSize: number }>({
      url: '/v1/admin/content-pages',
      params
    }),
  contentPage: (id: string) => request.get<ContentPage>({ url: `/v1/admin/content-pages/${id}` }),
  saveContentPage: (body: Record<string, unknown>, id?: string) =>
    request.request<ContentPage>({
      url: id ? `/v1/admin/content-pages/${id}` : '/v1/admin/content-pages',
      method: id ? 'PATCH' : 'POST',
      data: body,
      showSuccessMessage: true
    }),
  deleteContentPage: (id: string) =>
    request.del({ url: `/v1/admin/content-pages/${id}`, showSuccessMessage: true }),
  systemSettings: () => request.get<SystemSettings>({ url: '/v1/admin/system-settings' }),
  uploadChatHomeImage: (data: FormData) =>
    request.post<{ assetId: string; imageUrl: string }>({
      url: '/v1/admin/system-settings/chat-home-image',
      data,
      showSuccessMessage: true
    }),
  saveSystemSettings: (body: Record<string, unknown>) =>
    request.request<SystemSettings>({
      url: '/v1/admin/system-settings',
      method: 'PATCH',
      data: body,
      showSuccessMessage: true
    })
}
