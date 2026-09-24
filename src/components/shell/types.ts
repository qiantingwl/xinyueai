import type { Component } from 'vue'
import type { PaymentMethodKey, PaymentProviderKey } from '../../constants/payment'
import type { StudioMode } from '../../types'
import type { SectionNavPreference, SidebarNavPreference } from '../../utils/sidebar-nav'

export type SettingsSection = 'general' | 'personalization' | 'notifications' | 'data' | 'plan' | 'api' | 'credits' | 'redeem' | 'invite' | 'workspace' | 'teams' | 'support' | 'account'

export interface WorkspaceSettings {
  notifications: boolean
  rememberModel: boolean
  language: string
  appearance: string
  style: string
  detail: string
  replyLanguage: string
  customInstructions: string
  nickname: string
  occupation: string
  bio: string
  useMemory: boolean
  referenceChats: boolean
  chatHistoryEnabled: boolean
  trainingOptOut: boolean
  temporaryChatDefault: boolean
  dataRetentionDays: number
  shareUsageAnalytics: boolean
  redeemCode: string
  onboarded: boolean
}

export interface PublicSettings {
  userByokEnabled: boolean
  rechargeEnabled: boolean
  subscriptionsEnabled: boolean
  trialEnabled: boolean
  currency: string
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
}

export interface UserSettingsResponse { appearance?: string; language?: string; responseStyle?: string; responseDetail?: string; replyLanguage?: string; customInstructions?: string; nickname?: string; occupation?: string; bio?: string; useMemory?: boolean; referenceChats?: boolean; notifications?: boolean; chatHistoryEnabled?: boolean; trainingOptOut?: boolean; temporaryChatDefault?: boolean; dataRetentionDays?: number; shareUsageAnalytics?: boolean; onboarded?: boolean }
export interface UserResponse { settings?: UserSettingsResponse | null; creditAccount?: { balance: number } | null }
export interface NotificationItem { id: string; title?: string; body?: string; content?: string; readAt?: string | null; createdAt: string }
export interface ModerationAppeal { id: string; status: 'PENDING' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED' | 'CANCELLED'; reason: string; reviewNote: string; createdAt: string; reviewedAt?: string | null }
export interface ModerationCase { id: string; source: string; action: string; status: 'OPEN' | 'APPROVED' | 'DISMISSED'; contentExcerpt: string; createdAt: string; appeal?: ModerationAppeal | null }
export interface CreditEntry { id: string; amount: number; description: string; createdAt: string }
export interface InviteInfo { code: string; url: string; invited: number; reward: number; pending: number; reviewRequired: number }
export type ProviderType = 'OPENAI' | 'NEW_API' | 'SUB2API' | 'OPENAI_COMPATIBLE'
export type AuthType = 'BEARER' | 'X_API_KEY' | 'BOTH'
export interface ProviderTemplate { id: string; name: string; type: ProviderType; baseUrl: string; authType: AuthType; apiProtocol: 'openai' | 'anthropic' | 'gemini'; supportsDiscovery: boolean }
export interface ApiCredential { id: string; name: string; templateId?: string | null; providerType: ProviderType; baseUrl: string; apiKeyHint: string; authType: AuthType; enabled: boolean; isDefault: boolean; priority: number; weight: number; lastHealthStatus?: string | null; lastRotatedAt?: string | null; expiresAt?: string | null; totalRequests?: number; totalFailures?: number; inputTokens?: string; outputTokens?: string }
export interface CredentialEditor extends Partial<ApiCredential> { name: string; templateId: string; providerType: ProviderType; baseUrl: string; apiKey: string; apiKeyHint: string; authType: AuthType; enabled: boolean; isDefault: boolean; priority: number; weight: number; expiresAt: string; autoImport: boolean }
export interface PrivateModelRoute { id?: string; credentialId: string; upstreamModel: string; enabled: boolean; priority: number; weight: number; credential: Pick<ApiCredential, 'id' | 'name' | 'apiKeyHint' | 'enabled' | 'lastHealthStatus'> }
export interface AvailableModel { key: string; displayName: string; capability: 'CHAT' | 'IMAGE' | 'VIDEO' | 'COMMERCE' }
export interface PrivateModel { id: string; displayName: string; description: string; capability: AvailableModel['capability']; apiProtocol: 'openai' | 'anthropic' | 'gemini'; routingStrategy: 'PRIORITY' | 'WEIGHTED' | 'ROUND_ROBIN'; enabled: boolean; isDefault: boolean; routes: PrivateModelRoute[] }
export interface PrivateModelEditor extends Omit<PrivateModel, 'routes'> { routes: Array<Omit<PrivateModelRoute, 'credential'>> }
export interface RechargePackage { id: string; name: string; credits: number; priceCents: number; recommended: boolean }
export interface RechargeOrder { id: string; status: string; amountCents: number; createdAt: string; package?: { name: string } | null }
export interface SubscriptionPlan { id: string; code: string; name: string; description: string; billingCycle: 'MONTHLY' | 'YEARLY' | 'ONE_TIME'; priceCents: number; effectivePriceCents?: number; promotion?: { id: string; name: string; label: string; endsAt: string } | null; includedCredits: number; trialDays: number; concurrency: number; allowByok: boolean; imageAccess: boolean; videoAccess: boolean; commerceAccess: boolean; recommended: boolean }
export interface Subscription { id: string; planId: string; status: 'TRIALING' | 'ACTIVE' | 'PAST_DUE'; currentPeriodEnd?: string | null; trialEndsAt?: string | null; cancelAtPeriodEnd: boolean; autoRenewEnabled?: boolean; renewalChannelId?: string | null; graceEndsAt?: string | null; plan: SubscriptionPlan }
export interface SubscriptionOrder { id: string; status: string; amountCents: number; originalAmountCents?: number; promotionDiscountCents?: number; couponDiscountCents?: number; userCouponId?: string | null; paymentMethod: PaymentMethodKey; createdAt: string; plan: { id: string; name: string } }
export interface TokenQuotaSummary { quotaId: string | null; scopeKey: string | null; periodStart: string | null; periodEnd: string | null; grantedUnits: string; reservedUnits: string; usedUnits: string; remainingUnits: string; inputTokens: string; outputTokens: string; cachedInputTokens: string; reasoningTokens: string }
export interface CouponTemplate { id: string; code: string; name: string; description: string; discountType: 'FIXED' | 'PERCENT'; discountValue: number; minimumSpendCents: number; stackWithPromotion: boolean; products: Array<{ planId: string }> }
export interface UserCoupon { id: string; status: 'AVAILABLE' | 'LOCKED' | 'REDEEMED' | 'EXPIRED' | 'REVOKED'; expiresAt?: string | null; template: CouponTemplate }
export interface CouponWallet { coupons: UserCoupon[]; templates: Array<CouponTemplate & { claimedCount: number; perUserLimit: number; totalLimit?: number | null; issuedCount: number; validDays?: number | null }> }
export interface CommerceQuote { originalAmountCents: number; promotionDiscountCents: number; couponDiscountCents: number; amountCents: number; promotion?: { id: string; name: string; label: string; endsAt: string } | null; coupon?: { id: string; name: string; code: string } | null; couponMessage?: string }
export interface RenewalOptions { subscription: Subscription | null; channels: Array<{ id: string; name: string; providerKey: string; supportedMethods: string[] }>; mode: 'PAYMENT_LINK'; automaticChargeSupported: false; graceDays: number; reminderDays: number }
export interface RenewalAttempt { id: string; status: string; attemptNumber: number; orderId?: string | null; failureReason: string; createdAt: string }
export interface BillingProfile { profileType: 'PERSONAL' | 'COMPANY'; title: string; taxId: string; invoiceEmail: string; phone: string; address: string; bankName: string; bankAccount: string }
export interface InvoiceTransaction { id: string; outTradeNo: string; orderType: string; status: string; amountCents: number; currency: string; paymentMethod: string; completedAt?: string | null }
export interface InvoiceRequest { id: string; status: string; amountCents: number; currency: string; invoiceType: string; invoiceNumber: string; invoiceUrl: string; rejectionReason: string; requestedAt: string; transaction: { outTradeNo: string } }
export interface DeletionRequest { id: string; status: 'REQUESTED' | 'PROCESSING' | 'FAILED'; requestedAt: string; scheduledAt: string; failureReason: string }
export interface PaymentChannel { id: string; name: string; providerKey: PaymentProviderKey; isDefault: boolean; supportedMethods: PaymentMethodKey[]; minAmountCents: number; maxAmountCents?: number | null }
export interface PaymentIntent { orderType: 'SUBSCRIPTION' | 'RECHARGE'; productId: string; productName: string; amountCents: number; existingOrderId?: string }
export interface PaymentTransaction { id: string; outTradeNo: string; amountCents: number; currency: string; status: string; checkoutUrl?: string; qrCodeUrl?: string; failureReason?: string; metadata?: { instructions?: string } }
export interface ExternalNavLinkItem { id: string; key: string; name: string; description: string; url: string; icon: string; enabled: boolean; openNewTab: boolean; sortOrder: number }
export interface TeamMember { userId: string; role: string; monthlyCreditLimit: number | null; creditsUsed: number; creditPeriodStart: string; user: { displayName: string; email: string | null } }
export interface TeamInvitation { id: string; email: string; role: string; expiresAt: string }
export interface PendingTeamInvitation { id: string; role: string; expiresAt: string; team: { id: string; name: string; owner: { displayName: string } } }
export interface Team { id: string; name: string; slug: string; description: string; ownerId: string; seatLimit: number; billingEnabled: boolean; creditAccount?: { balance: number; updatedAt: string } | null; members: TeamMember[]; invitations: TeamInvitation[]; _count?: { projects: number; assets: number; knowledgeBases: number } }
export interface TeamCreditEntry extends CreditEntry { balanceAfter: number; user?: { displayName: string; email: string | null } | null }
export interface WorkspaceAsset { id: string; name: string; teamId?: string | null }
export interface KnowledgeBaseAsset { assetId: string; chunkCount: number; asset: WorkspaceAsset }
export interface KnowledgeBase { id: string; name: string; description: string; status: string; documentCount: number; chunkCount: number; teamId?: string | null; team?: { id: string; name: string } | null; creator?: { id: string; displayName: string }; assets: KnowledgeBaseAsset[] }
export interface TeamResources { projects: Array<{ id: string; name: string; workflowStatus: string; _count: { assets: number; conversations: number } }>; assets: Array<{ id: string; name: string; kind: string }>; knowledgeBases: Array<{ id: string; name: string; documentCount: number }> }
export interface AssistantToolBinding { key: string; assistant: { id: string; name: string }; tool: { id: string; key: string; name: string; description: string; requiresApproval: boolean }; approval?: { id: string; status: string; expiresAt?: string | null } }
export interface WorkspaceNavItem { key: string; mode: StudioMode; activeModes?: StudioMode[]; label: string; icon: Component; to: string; external: boolean; openNewTab: boolean }
export interface ToolApproval { id: string; assistant?: { id: string; name: string } | null; tool: { id: string; key: string; name: string; description: string; requiresApproval: boolean }; status: string; expiresAt?: string | null }
export interface WorkspaceAssistant { id: string; name: string; tools: { toolId: string }[] }
export interface TeamDraft { name: string; description: string }
export interface KnowledgeDraft { name: string; description: string; teamId: string }
