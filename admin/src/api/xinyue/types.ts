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
  trend: Array<{
    date: string
    newUsers: number
    jobs: number
    revenueCents: number
    tokens: number
  }>
  today: { newUsers: number; jobs: number; revenueCents: number; tokens: number }
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
    cachedInputTokens: number
    reasoningTokens: number
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
    inputTokens: number
    outputTokens: number
    cachedInputTokens: number
    reasoningTokens: number
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
    inputTokens: number
    outputTokens: number
    cachedInputTokens: number
    reasoningTokens: number
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

export type AdminTeam = {
  id: string
  name: string
  slug: string
  description: string
  ownerId: string
  seatLimit: number
  status: 'ACTIVE' | 'SUSPENDED'
  billingEnabled: boolean
  createdAt: string
  updatedAt: string
  owner: { id: string; email: string | null; displayName: string }
  creditAccount?: { balance: number; updatedAt: string } | null
  members: Array<{
    userId: string
    role: string
    monthlyCreditLimit: number | null
    creditsUsed: number
    creditPeriodStart: string
    joinedAt: string
    user: { id: string; email: string | null; displayName: string }
  }>
  invitations: Array<{
    id: string
    email: string
    role: string
    expiresAt: string
    createdAt: string
  }>
  _count: {
    members: number
    invitations: number
    auditLogs: number
    projects: number
    assets: number
    knowledgeBases: number
  }
}

export type AdminTeamResources = {
  projects: Array<{
    id: string
    name: string
    workflowStatus: string
    updatedAt: string
    user: { displayName: string }
    _count: { assets: number; conversations: number }
  }>
  assets: Array<{
    id: string
    name: string
    kind: string
    mimeType: string
    size: number
    createdAt: string
    user: { displayName: string }
  }>
  knowledgeBases: Array<{
    id: string
    name: string
    status: string
    documentCount: number
    chunkCount: number
    updatedAt: string
    creator: { displayName: string }
  }>
}

export type TeamAuditLog = {
  id: string
  action: string
  targetType: string
  targetId: string
  metadata?: Record<string, unknown> | null
  createdAt: string
  actor?: { id: string; email: string | null; displayName: string } | null
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
  provider?: Pick<Provider, 'id' | 'name' | 'type' | 'enabled' | 'priority' | 'weight'> & {
    hasApiKey?: boolean
    lastHealthStatus?: string | null
    cooldownUntil?: string | null
  }
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
  'OPENAI' | 'NEW_API' | 'SUB2API' | 'OPENAI_COMPATIBLE' | 'POLLINATIONS' | 'LOCAL_WORKER'
export type NativeSearchProvider =
  'openai' | 'anthropic' | 'gemini' | 'xai' | 'qwen' | 'doubao' | 'disabled'
export type ModelVendor = {
  id: string
  key: string
  name: string
  icon: string
  websiteUrl: string
  enabled: boolean
  sortOrder: number
}
export type ProviderTemplate = {
  id: string
  key: string
  name: string
  description: string
  vendorId?: string | null
  type: ProviderType
  baseUrl: string
  authType: 'BEARER' | 'X_API_KEY' | 'BOTH'
  apiProtocol: 'openai' | 'anthropic' | 'gemini'
  nativeSearchProvider: NativeSearchProvider
  customHeaders?: Record<string, string> | null
  supportsDiscovery: boolean
  enabled: boolean
  sortOrder: number
  vendor?: ModelVendor | null
  _count: { providerChannels: number; userCredentials: number }
}
export type Provider = {
  id: string
  name: string
  templateId?: string | null
  type: ProviderType
  baseUrl: string
  apiKeyHint: string
  hasApiKey?: boolean
  authType: 'BEARER' | 'X_API_KEY' | 'BOTH'
  enabled: boolean
  priority: number
  weight: number
  timeoutMs: number
  allowUserKeys: boolean
  lastHealthStatus?: string
  lastHealthMessage?: string
  consecutiveFailures?: number
  metadata?: { apiProtocol?: string; nativeSearchProvider?: NativeSearchProvider } | null
  template?: Pick<ProviderTemplate, 'id' | 'name' | 'apiProtocol' | 'nativeSearchProvider'> | null
  _count: { modelPresets: number; modelRoutes: number }
}

export type DiscoveredModel = {
  id: string
  displayName: string
  vendorKey: string
  vendorName: string
  capability: 'CHAT' | 'IMAGE' | 'VIDEO' | 'COMMERCE' | null
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
  warnings: string[]
  existingPreset?: { id: string; key: string } | null
}

export type ModelPreset = {
  id: string
  key: string
  displayName: string
  description: string
  vendorId?: string | null
  providerId?: string | null
  upstreamModel: string
  capability: 'CHAT' | 'IMAGE' | 'VIDEO' | 'COMMERCE'
  enabled: boolean
  availability?: 'AVAILABLE' | 'DEGRADED' | 'UNCONFIGURED'
  availabilityReason?:
    'NO_CHANNEL' | 'API_KEY_MISSING' | 'CHANNEL_COOLDOWN' | 'HEALTH_CHECK_REQUIRED'
  healthyRouteCount?: number
  routeCount?: number
  isDefault: boolean
  allowUserKey: boolean
  sortOrder: number
  flatCreditCost: number
  inputCreditsPerMillion: number
  outputCreditsPerMillion: number
  inputCostMicrosPerMillion: number
  outputCostMicrosPerMillion: number
  imageCostMicros: number
  videoCostMicros: number
  badge: string
  options?: {
    apiProtocol?: 'openai' | 'anthropic' | 'gemini'
    nativeSearchProvider?: NativeSearchProvider
    agentEnabled?: boolean
    agentCapabilities?: {
      eligible?: boolean
      confidence?: 'confirmed' | 'compatible' | 'limited'
      supportsTools?: boolean
      supportsStructuredOutput?: boolean
      supportsReasoning?: boolean
      contextWindow?: number | null
      maxOutputTokens?: number | null
      reason?: string
    }
    discovery?: {
      source?: string
      confidence?: string
      contextWindow?: number | null
      maxOutputTokens?: number | null
      features?: string[]
      importedAt?: string
    }
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
  provider?: {
    id: string
    name: string
    type?: ProviderType
    enabled?: boolean
    hasApiKey?: boolean
    lastHealthStatus?: string | null
    cooldownUntil?: string | null
  } | null
  vendor?: ModelVendor | null
  providerRoutes?: ModelProviderRoute[]
}

export type ModelPricingValues = {
  flatCreditCost: number
  inputCreditsPerMillion: number
  outputCreditsPerMillion: number
  inputCostMicrosPerMillion: number
  outputCostMicrosPerMillion: number
  imageCostMicros: number
  videoCostMicros: number
}

export type ModelPricingComparison = {
  markupPercent: number
  currency: string
  creditValueMicros: number
  pricingUsdExchangeRateMicros: number
  catalogUrl: string
  refreshedAt: string
  models: Array<{
    id: string
    key: string
    displayName: string
    upstreamModel: string
    capability: ModelPreset['capability']
    available: boolean
    changed: boolean
    pricingSource: 'litellm' | 'fallback' | 'none'
    current: ModelPricingValues
    suggested: ModelPricingValues | null
    currentInputMarkupPercent: number | null
    currentOutputMarkupPercent: number | null
    warnings: string[]
  }>
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
  monthlyQuotaUnits: number
  dailyQuotaUnits: number
  tokenQuotaMode: 'BILLABLE_UNITS'
  tokenOverageMode: 'BLOCK' | 'OVERAGE_CREDITS'
  tokenOverageRate: number
  byokMode: 'QUOTA' | 'FREE'
  trialDays: number
  concurrency: number
  allowByok: boolean
  apiAccess: boolean
  imageAccess: boolean
  videoAccess: boolean
  commerceAccess: boolean
  batchAccess: boolean
  capabilities?: {
    canvasAccess?: boolean
    shortDramaAccess?: boolean
    maxCanvases?: number
    maxCanvasNodes?: number
    [key: string]: unknown
  } | null
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

export type AdminPermission = { code: string; name: string; group: string }
export type AdminRoleRecord = {
  id: string
  code: string
  name: string
  description: string
  permissions: string[]
  builtIn: boolean
  enabled: boolean
  _count: { users: number }
}
export type AdministratorRecord = {
  id: string
  email: string | null
  username: string | null
  displayName: string
  role: string
  status: string
  adminRoleId: string | null
  adminRole: AdminRoleRecord | null
  lastLoginAt: string | null
  createdAt: string
}
export type InvoiceRequestRecord = {
  id: string
  status: string
  amountCents: number
  currency: string
  invoiceType: string
  invoiceNumber: string
  invoiceUrl: string
  rejectionReason: string
  requestedAt: string
  issuedAt: string | null
  profileSnapshot: Record<string, string>
  user: { id: string; displayName: string; email: string | null; company: string }
  transaction: {
    outTradeNo: string
    orderType: string
    status: string
    paymentMethod: string
    completedAt: string | null
  }
}
export type AccountDeletionRecord = {
  id: string
  userId: string
  status: string
  reason: string
  requestedAt: string
  scheduledAt: string
  completedAt: string | null
  failureReason: string
  user: {
    id: string
    email: string | null
    username: string | null
    displayName: string
    status: string
    createdAt: string
  }
}
export type RenewalAttemptRecord = {
  id: string
  status: string
  attemptNumber: number
  orderId: string | null
  scheduledAt: string
  completedAt: string | null
  failureReason: string
  subscription: {
    id: string
    status: string
    currentPeriodEnd: string | null
    user: { id: string; displayName: string; email: string | null }
    plan: { name: string; priceCents: number; currency: string }
  }
}
export type ReferralRecord = {
  id: string
  code: string
  status:
    'REGISTERED' | 'COOLING' | 'REVIEW_REQUIRED' | 'APPROVED' | 'REWARDED' | 'REJECTED' | 'REVERSED'
  qualifiedAmountCents: number
  reward: number
  payableAt: string | null
  rewardedAt: string | null
  reversedAt: string | null
  reviewReason: string
  riskFlags: string[] | null
  createdAt: string
  inviter: {
    id: string
    displayName: string
    email: string | null
    username: string | null
    creditAccount: { balance: number } | null
  }
  invitee: {
    id: string
    displayName: string
    email: string | null
    username: string | null
    createdAt: string
  }
  qualifyingTransaction: {
    id: string
    outTradeNo: string
    orderType: string
    amountCents: number
    status: string
    completedAt: string | null
  } | null
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
export type PromotionCampaign = {
  id: string
  name: string
  label: string
  enabled: boolean
  startsAt: string
  endsAt: string
  products: Array<{
    campaignId: string
    planId: string
    promotionalPriceCents: number
    plan: Pick<SubscriptionPlan, 'id' | 'name' | 'code' | 'priceCents'>
  }>
  _count: { orders: number }
}
export type CouponTemplate = {
  id: string
  code: string
  name: string
  description: string
  discountType: 'FIXED' | 'PERCENT'
  discountValue: number
  minimumSpendCents: number
  maximumDiscountCents?: number | null
  stackWithPromotion: boolean
  claimEnabled: boolean
  enabled: boolean
  totalLimit?: number | null
  perUserLimit: number
  validDays?: number | null
  startsAt?: string | null
  endsAt?: string | null
  issuedCount: number
  redeemedCount: number
  products: Array<{
    templateId: string
    planId: string
    plan: Pick<SubscriptionPlan, 'id' | 'name' | 'code'>
  }>
  _count: { userCoupons: number }
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
  sidebarNav: {
    order: string[]
    hidden: string[]
    labels: Record<string, string>
    promoted: string[]
  }
  workspaceNav: {
    order: string[]
    hidden: string[]
    labels: Record<string, string>
    promoted: string[]
  }
  sectionNav: {
    creation: {
      order: string[]
      hidden: string[]
      labels: Record<string, string>
      promoted: string[]
    }
    plugins: {
      order: string[]
      hidden: string[]
      labels: Record<string, string>
      promoted: string[]
    }
    prompts: {
      order: string[]
      hidden: string[]
      labels: Record<string, string>
      promoted: string[]
    }
  }
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
  chatUiPreset: 'gpt' | 'doubao' | 'qianwen' | 'kimi' | 'jixing'
  chatAvatarMotion: 'ambient' | 'active' | 'off'
  chatAvatarEnabled: boolean
  chatAvatarStyle:
    'classic' | 'lively' | 'calm' | 'geometric' | 'faces' | 'orbit' | 'comet' | 'thinker' | 'sleepy'
  chatAvatarColor: string
  chatHomeContent: ChatHomeContent
  quickActionRegistry: CapabilityRegistrySnapshot
  siteContent: SiteContent
  defaultChatModelKey: string
  defaultImageModelKey: string
  imagePromptEnabled: boolean
  imagePromptModelKey: string
  imagePromptBillingMode: 'PLATFORM' | 'USER_CREDITS' | 'USER_BYOK'
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
  smtpFromName: string
  smtpFromEmail: string
  hasSmtpPassword: boolean
  smtpPasswordHint: string
}
export type SiteContent = {
  landing: {
    heroLead: string
    modes: Array<{
      key: string
      title: string
      path: string
      image: string
      imageAlt: string
      lead: string
      description: string
      actions: Array<{ label: string; to: string }>
    }>
    navGroups: Array<{
      key: string
      label: string
      items: Array<{ label: string; description: string; to: string }>
    }>
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
}
export type AdminAccountIdentity = {
  id: string
  email: string | null
  username: string | null
  displayName: string
  role: 'ADMIN' | 'SUPER_ADMIN'
  avatarUrl?: string | null
}
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
export type QuickActionStatus = {
  id: string
  preset: ChatUiPreset
  handler: string
  available: boolean
  published: boolean
  reason: string
}
export type CapabilityRegistrySnapshot = {
  handlers: Array<{ id: string; actionType: ChatQuickAction['actionType']; description: string }>
  dependencies: {
    modelCapabilities: string[]
    modelKeys: string[]
    webSearchAvailable: boolean
    externalSearchAvailable: boolean
    nativeSearchAvailable: boolean
  }
  actions: QuickActionStatus[]
}
export type ChatComposerControls = {
  modeEnabled: boolean
  webSearchEnabled: boolean
  modelSelectorEnabled: boolean
  moreEnabled: boolean
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
  composerControls: Record<ChatUiPreset, ChatComposerControls>
  quickActions: Record<ChatUiPreset, ChatQuickAction[]>
}

export type AdminWorkAsset = {
  id: string
  name: string
  kind: 'IMAGE' | 'VIDEO'
  contentUrl: string
}
export type AdminWorkVersion = {
  id: string
  versionNumber: number
  title: string
  description: string
  category: string
  tags: string[]
  publicPrompt: string
  visibility: 'PRIVATE' | 'UNLISTED' | 'PUBLIC'
  moderationStatus: 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'TAKEN_DOWN'
  rejectionReason: string
  submittedAt?: string | null
  reviewedAt?: string | null
  assets: AdminWorkAsset[]
}
export type AdminPublishedWork = {
  id: string
  slug: string
  lifecycleStatus: string
  isFeatured: boolean
  viewCount: number
  likeCount: number
  updatedAt: string
  user: { id: string; displayName: string; email: string | null }
  currentVersion: AdminWorkVersion
  publishedVersion?: AdminWorkVersion | null
  _count: { likes: number; reports: number; versions: number }
}
export type AdminWorkReport = {
  id: string
  reason: string
  details: string
  status: 'PENDING' | 'RESOLVED' | 'DISMISSED'
  resolution: string
  createdAt: string
  reporter: { id: string; displayName: string; email: string | null }
  work: { id: string; currentVersion?: { title: string } | null }
  resolvedBy?: { id: string; displayName: string } | null
}
