<template>
  <div class="workspace-shell" :class="{ 'is-collapsed': !sidebarOpen, 'is-canvas-route': props.canvasRoute }">
    <ShellSidebar
      v-model:sidebar-open="sidebarOpen"
      v-model:mobile-open="mobileOpen"
      v-model:account-open="accountOpen"
      v-model:conversation-menu-id="conversationMenuId"
      v-model:conversation-rename="conversationRename"
      :active-mode="activeMode"
      :settings="settings"
      :public-settings="publicSettings"
      :external-links="externalLinks"
      :workspace-data-loaded="workspaceDataLoaded"
      :current-subscription="currentSubscription"
      :conversation-menu-position="conversationMenuPosition"
      :renaming-conversation-id="renamingConversationId"
      :conversation-rename-busy="conversationRenameBusy"
      :open-settings="openSettings"
      :show-settings="() => { settingsOpen = true }"
      :open-upgrade="openUpgrade"
      :logout="logout"
      :close-conversation-menu="closeConversationMenu"
      :start-conversation-rename="startConversationRename"
      :save-conversation-rename="saveConversationRename"
      :cancel-conversation-rename="cancelConversationRename"
    />

    <main ref="workspaceMain" class="workspace-main" :class="{ 'workspace-main--chat': activeMode === 'chat' || activeMode === 'office' }">
      <ShellHeader
        v-model:mobile-open="mobileOpen"
        v-model:chat-actions-open="chatActionsOpen"
        :active-mode="activeMode"
        :workspace-data-loaded="workspaceDataLoaded"
        :show-upgrade-entry="showUpgradeEntry"
        :conversation-action-busy="conversationActionBusy"
        :open-upgrade="openUpgrade"
        :share-conversation="shareConversation"
        :toggle-conversation-pinned="toggleConversationPinned"
        :archive-conversation="archiveConversation"
        :delete-conversation="deleteConversation"
      />
      <p v-if="studio.temporaryChat && activeMode !== 'chat'" class="temporary-chat-banner" role="status">临时会话进行中，这次内容不会进入历史记录。</p>
      <slot />
    </main>

    <Teleport to="body">
      <div
        v-if="activeConversationMenu"
        ref="conversationMenuElement"
        class="workspace-recent-menu"
        role="menu"
        :aria-label="`打开“${activeConversationMenu.title}”的对话选项`"
        :style="{ left: `${conversationMenuPosition.left}px`, top: `${conversationMenuPosition.top}px` }"
        @click.stop
      >
        <button role="menuitem" type="button" :disabled="conversationActionBusy" @click="shareConversation(activeConversationMenu)"><Share2 :size="16" />分享</button>
        <button role="menuitem" type="button" :disabled="conversationActionBusy" @click="startConversationRename(activeConversationMenu)"><Pencil :size="16" />重命名</button>
        <button role="menuitem" type="button" :disabled="conversationActionBusy" @click="toggleConversationPinned(activeConversationMenu)"><PinOff v-if="activeConversationMenu.pinnedAt" :size="16" /><Pin v-else :size="16" />{{ activeConversationMenu.pinnedAt ? '取消置顶' : '置顶聊天' }}</button>
        <button v-if="!activeConversationMenu.archivedAt" role="menuitem" type="button" :disabled="conversationActionBusy" @click="archiveConversation(activeConversationMenu.id)"><Archive :size="16" />归档</button>
        <button v-else role="menuitem" type="button" :disabled="conversationActionBusy" @click="restoreConversation(activeConversationMenu.id)"><ArchiveRestore :size="16" />恢复</button>
        <button class="is-danger" role="menuitem" type="button" :disabled="conversationActionBusy" @click="deleteConversation(activeConversationMenu)"><Trash2 :size="16" />删除</button>
      </div>
      <SettingsDialog
        v-if="settingsOpen"
        :settings-section="settingsSection"
        :settings-nav="settingsNav"
        :nav-ref="setSettingsNavElement"
        @close="settingsOpen = false"
        @select="selectSettingsSection"
      >
        <GeneralSection v-if="settingsSection === 'general'" :settings="settings" />
        <NotificationsSection
          v-if="settingsSection === 'general'"
          :settings="settings"
          :notifications="notifications"
          :unread-count="unreadCount"
          :mark-all-read="markAllRead"
        />
        <PersonalizationSection
          v-else-if="settingsSection === 'personalization'"
          :settings="settings"
          :settings-message="settingsMessage"
          :save-settings="saveSettings"
        />
        <DataSection
          v-else-if="settingsSection === 'data'"
          :settings="settings"
          :data-action-busy="dataActionBusy"
          :data-action-message="dataActionMessage"
          :data-action-error="dataActionError"
          :moderation-cases="moderationCases"
          :appeal-drafts="appealDrafts"
          :appeal-busy-id="appealBusyId"
          :appeal-message="appealMessage"
          :appeal-error="appealError"
          :export-account-data="exportAccountData"
          :clear-conversation-history="clearConversationHistory"
          :submit-moderation-appeal="submitModerationAppeal"
          :cancel-moderation-appeal="cancelModerationAppeal"
        />
        <PlanSection
          v-else-if="settingsSection === 'plan'"
          v-model:selected-renewal-channel-id="selectedRenewalChannelId"
          v-model:selected-invoice-transaction-id="selectedInvoiceTransactionId"
          :current-subscription="currentSubscription"
          :subscription-plans="subscriptionPlans"
          :plan-busy="planBusy"
          :plan-message="planMessage"
          :plan-error="planError"
          :public-settings="publicSettings"
          :coupon-wallet="couponWallet"
          :coupon-busy-id="couponBusyId"
          :subscription-orders="subscriptionOrders"
          :token-quota="tokenQuota"
          :token-quota-loading="tokenQuotaLoading"
          :renewal-options="renewalOptions"
          :renewal-attempts="renewalAttempts"
          :billing-profile="billingProfile"
          :billing-busy="billingBusy"
          :billing-message="billingMessage"
          :invoice-transactions="invoiceTransactions"
          :invoice-requests="invoiceRequests"
          :format-money="formatMoney"
          :cancel-subscription="cancelSubscription"
          :start-trial="startTrial"
          :purchase-plan="purchasePlan"
          :claim-coupon="claimCoupon"
          :continue-subscription-payment="continueSubscriptionPayment"
          :cancel-pending-subscription-order="cancelPendingSubscriptionOrder"
          :toggle-renewal="toggleRenewal"
          :save-renewal-channel="saveRenewalChannel"
          :save-billing-profile="saveBillingProfile"
          :request-invoice="requestInvoice"
          :cancel-invoice-request="cancelInvoiceRequest"
        />
        <ApiSection
          v-else-if="settingsSection === 'api'"
          :public-settings="publicSettings"
          :available-models="availableModels"
          :api-credentials="apiCredentials"
          :credential-checking-id="credentialCheckingId"
          :private-models="privateModels"
          :open-credential-editor="openCredentialEditor"
          :discover-credential="discoverCredential"
          :delete-credential="deleteCredential"
          :open-private-model-editor="openPrivateModelEditor"
          :delete-private-model="deletePrivateModel"
        />
        <CreditsSection
          v-if="settingsSection === 'plan'"
          :public-settings="publicSettings"
          :recharge-packages="rechargePackages"
          :creating-order="creatingOrder"
          :recharge-message="rechargeMessage"
          :recharge-orders="rechargeOrders"
          :credit-ledger="creditLedger"
          :create-recharge-order="createRechargeOrder"
          :format-money="formatMoney"
        />
        <RedeemSection
          v-if="settingsSection === 'plan'"
          :settings="settings"
          :redeeming="redeeming"
          :redeem-message="redeemMessage"
          :redeem-error="redeemError"
          :redeem-credits="redeemCredits"
        />
        <InviteSection
          v-if="settingsSection === 'plan'"
          :invite-info="inviteInfo"
          :invite-copied="inviteCopied"
          :copy-invite="copyInvite"
        />
        <WorkspaceSection
          v-else-if="settingsSection === 'workspace'"
          :knowledge-draft="knowledgeDraft"
          :teams="teams"
          :workspace-busy="workspaceBusy"
          :knowledge-bases="knowledgeBases"
          :workspace-assets="workspaceAssets"
          :knowledge-asset-selection="knowledgeAssetSelection"
          :knowledge-team-selection="knowledgeTeamSelection"
          :workspace-tools="workspaceTools"
          :workspace-assistants="workspaceAssistants"
          :tool-approvals="toolApprovals"
          :workspace-message="workspaceMessage"
          :workspace-error="workspaceError"
          :create-knowledge-base="createKnowledgeBase"
          :detach-knowledge-asset="detachKnowledgeAsset"
          :attach-knowledge-asset="attachKnowledgeAsset"
          :assign-knowledge-base-team="assignKnowledgeBaseTeam"
          :edit-knowledge-base="editKnowledgeBase"
          :delete-knowledge-base="deleteKnowledgeBase"
          :request-tool-approval="requestToolApproval"
          :cancel-tool-approval="cancelToolApproval"
        />
        <TeamsSection
          v-else-if="settingsSection === 'teams'"
          v-model:team-invite-id="teamInviteId"
          v-model:team-invite-email="teamInviteEmail"
          v-model:team-invite-role="teamInviteRole"
          :pending-team-invitations="pendingTeamInvitations"
          :teams="teams"
          :team-busy="teamBusy"
          :team-message="teamMessage"
          :team-error="teamError"
          :team-draft="teamDraft"
          :expanded-team-id="expandedTeamId"
          :team-ledger-open-id="teamLedgerOpenId"
          :team-resources="teamResources"
          :team-credit-ledgers="teamCreditLedgers"
          :team-quota-drafts="teamQuotaDrafts"
          :accept-team-invitation="acceptTeamInvitation"
          :create-team="createTeam"
          :edit-team="editTeam"
          :leave-team="leaveTeam"
          :delete-team="deleteTeam"
          :toggle-team-resources="toggleTeamResources"
          :toggle-team-billing="toggleTeamBilling"
          :toggle-team-ledger="toggleTeamLedger"
          :save-team-member-quota="saveTeamMemberQuota"
          :transfer-team-ownership="transferTeamOwnership"
          :update-team-member-role="updateTeamMemberRole"
          :remove-team-member="removeTeamMember"
          :cancel-team-invitation="cancelTeamInvitation"
          :invite-to-team="inviteToTeam"
        />
        <SupportCenter v-else-if="settingsSection === 'support'" />
        <AccountSection
          v-else-if="settingsSection === 'account'"
          v-model:deletion-reason="deletionReason"
          :account-deletion="accountDeletion"
          :deletion-busy="deletionBusy"
          :deletion-message="deletionMessage"
          :logout="logout"
          :request-account-deletion="requestAccountDeletion"
          :cancel-account-deletion="cancelAccountDeletion"
          :close-settings="() => { settingsOpen = false }"
        />
      </SettingsDialog>
      <UpgradeDialog
        v-if="upgradeOpen"
        v-model:pricing-mode="pricingMode"
        :current-subscription="currentSubscription"
        :subscription-plans="subscriptionPlans"
        :plan-busy="planBusy"
        :plan-message="planMessage"
        :plan-error="planError"
        :public-settings="publicSettings"
        :teams="teams"
        :format-money="formatMoney"
        :purchase-upgrade-plan="purchaseUpgradePlan"
        :open-team-settings="openTeamSettings"
        @close="upgradeOpen = false"
      />
      <CheckoutDialog
        v-if="paymentIntent"
        v-model:selected-coupon-id="selectedCouponId"
        v-model:selected-payment-method="selectedPaymentMethod"
        :payment-intent="paymentIntent"
        :payment-transaction="paymentTransaction"
        :payment-quote="paymentQuote"
        :available-payment-coupons="availablePaymentCoupons"
        :eligible-payment-channels="eligiblePaymentChannels"
        :selected-payment-channel-id="selectedPaymentChannelId"
        :selected-payment-channel="selectedPaymentChannel"
        :payment-busy="paymentBusy"
        :payment-error="paymentError"
        :payment-status-title="paymentStatusTitle"
        :payment-instructions="paymentInstructions"
        :format-money="formatMoney"
        :select-payment-channel="selectPaymentChannel"
        :refresh-payment-quote="refreshPaymentQuote"
        :confirm-checkout="confirmCheckout"
        :close-payment="closePayment"
        :refresh-payment-status="refreshPaymentStatus"
      />
      <ApiKeyDialog
        v-if="credentialEditor"
        :editor="credentialEditor"
        :provider-templates="providerTemplates"
        :credential-saving="credentialSaving"
        :credential-error="credentialError"
        :save-credential="saveCredential"
        @close="credentialEditor = null"
      />
      <PrivateModelDialog
        v-if="privateModelEditor"
        :editor="privateModelEditor"
        :api-credentials="apiCredentials"
        :discovered-credential-models="discoveredCredentialModels"
        :private-model-saving="privateModelSaving"
        :private-model-error="privateModelError"
        :save-private-model="savePrivateModel"
        @close="privateModelEditor = null"
      />
      <WelcomeOnboarding
        v-if="showOnboarding"
        :settings="settings"
        :site-name="catalog.settings.siteName || 'Xinyue AI'"
        :save-settings="saveSettings"
        @complete="showOnboarding = false"
      />
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch, type ComponentPublicInstance } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useMessage } from 'naive-ui'
import type { PaymentMethodKey } from '../constants/payment'
import {
  Archive,
  ArchiveRestore,
  BookOpen,
  KeyRound,
  LifeBuoy,
  Pencil,
  Pin,
  PinOff,
  Share2,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Trash2,
  Users,
  UserRound,
  WalletCards,
} from 'lucide-vue-next'
import SupportCenter from './SupportCenter.vue'
import { paymentStatusTitleText } from './shell/labels'
import ShellSidebar from './shell/ShellSidebar.vue'
import ShellHeader from './shell/ShellHeader.vue'
import SettingsDialog from './shell/settings/SettingsDialog.vue'
import GeneralSection from './shell/settings/sections/GeneralSection.vue'
import PersonalizationSection from './shell/settings/sections/PersonalizationSection.vue'
import NotificationsSection from './shell/settings/sections/NotificationsSection.vue'
import DataSection from './shell/settings/sections/DataSection.vue'
import PlanSection from './shell/settings/sections/PlanSection.vue'
import ApiSection from './shell/settings/sections/ApiSection.vue'
import CreditsSection from './shell/settings/sections/CreditsSection.vue'
import RedeemSection from './shell/settings/sections/RedeemSection.vue'
import InviteSection from './shell/settings/sections/InviteSection.vue'
import WorkspaceSection from './shell/settings/sections/WorkspaceSection.vue'
import TeamsSection from './shell/settings/sections/TeamsSection.vue'
import AccountSection from './shell/settings/sections/AccountSection.vue'
import WelcomeOnboarding from './shell/WelcomeOnboarding.vue'
import UpgradeDialog from './shell/billing/UpgradeDialog.vue'
import CheckoutDialog from './shell/billing/CheckoutDialog.vue'
import ApiKeyDialog from './shell/ApiKeyDialog.vue'
import PrivateModelDialog from './shell/PrivateModelDialog.vue'
import type { StudioMode } from '../types'
import { useAuthStore } from '../stores/auth'
import { useCatalogStore } from '../stores/catalog'
import { useStudioStore } from '../stores/studio'
import { api, apiUrl } from '../services/api'
import { safeHttpNavigationUrl } from '../utils/safe-url'
import { readStoredSettings, updateStoredSettings, writeStoredSettings } from '../utils/settings-storage'
import { emptySectionNav, emptySidebarNav, parseSectionNav, parseSidebarNav } from '../utils/sidebar-nav'
import { useTeamManagement } from '../composables/shell/useTeamManagement'
import { useKnowledgeBases } from '../composables/shell/useKnowledgeBases'
import { useConversationActions } from '../composables/shell/useConversationActions'
import { useCopyFeedback } from '../composables/useCopyFeedback'
import type {
  ApiCredential,
  AssistantToolBinding,
  AvailableModel,
  BillingProfile,
  CommerceQuote,
  CouponTemplate,
  CouponWallet,
  CredentialEditor,
  CreditEntry,
  DeletionRequest,
  ExternalNavLinkItem,
  InviteInfo,
  InvoiceRequest,
  InvoiceTransaction,
  KnowledgeBase,
  ModerationCase,
  NotificationItem,
  PaymentChannel,
  PaymentIntent,
  PaymentTransaction,
  PendingTeamInvitation,
  PrivateModel,
  PrivateModelEditor,
  ProviderTemplate,
  PublicSettings,
  RechargeOrder,
  RechargePackage,
  RenewalAttempt,
  RenewalOptions,
  SettingsSection,
  Subscription,
  SubscriptionOrder,
  SubscriptionPlan,
  Team,
  TokenQuotaSummary,
  ToolApproval,
  UserResponse,
  UserSettingsResponse,
  WorkspaceAsset,
  WorkspaceAssistant,
  WorkspaceSettings,
} from './shell/types'

const props = defineProps<{
  activeMode: StudioMode
  canvasRoute?: boolean
}>()

// 侧边栏折叠状态持久化到本地设置，刷新后保持。
const sidebarOpen = ref(readStoredSettings().sidebarCollapsed !== true)
watch(sidebarOpen, (open) => {
  updateStoredSettings((current) => ({ ...current, sidebarCollapsed: !open }))
})
const workspaceMain = ref<HTMLElement | null>(null)
const mobileOpen = ref(false)
const conversationMenuElement = ref<HTMLElement | null>(null)
const conversationMenuPosition = reactive({ left: 0, top: 0 })
const settingsOpen = ref(false)
const upgradeOpen = ref(false)
const pricingMode = ref<'personal' | 'team'>('personal')
const chatActionsOpen = ref(false)
const settingsSection = ref<SettingsSection>('general')
const settingsNavElement = ref<HTMLElement | null>(null)
const accountOpen = ref(false)
const auth = useAuthStore()
const catalog = useCatalogStore()
const studio = useStudioStore()
const router = useRouter()
const route = useRoute()
const { t, locale } = useI18n()
const message = useMessage()
const {
  conversationMenuId,
  conversationRename,
  conversationActionBusy,
  renamingConversationId,
  conversationRenameBusy,
  activeConversationMenu,
  closeConversationMenu,
  shareConversation,
  toggleConversationPinned,
  startConversationRename,
  cancelConversationRename,
  saveConversationRename,
  archiveConversation,
  restoreConversation,
  deleteConversation,
} = useConversationActions()
const notifications = ref<NotificationItem[]>([])
const moderationCases = ref<ModerationCase[]>([])
const appealDrafts = reactive<Record<string, string>>({})
const appealBusyId = ref('')
const appealMessage = ref('')
const appealError = ref(false)
const creditLedger = ref<CreditEntry[]>([])
const inviteInfo = reactive<InviteInfo>({ code: '', url: '', invited: 0, reward: 0, pending: 0, reviewRequired: 0 })
const settingsHydrated = ref(false)
const workspaceDataLoaded = ref(false)
const settingsMessage = ref('')
const redeemMessage = ref('')
const redeemError = ref(false)
const redeeming = ref(false)
const { copied: inviteCopied, copy: copyInviteLink } = useCopyFeedback()
const {
  teams, pendingTeamInvitations, teamDraft, teamInviteId, teamInviteEmail, teamInviteRole,
  teamBusy, teamMessage, teamError, expandedTeamId, teamResources, teamLedgerOpenId,
  teamCreditLedgers, teamQuotaDrafts, createTeam, inviteToTeam, acceptTeamInvitation,
  cancelTeamInvitation, transferTeamOwnership, removeTeamMember, updateTeamMemberRole,
  editTeam, leaveTeam, deleteTeam, toggleTeamResources, toggleTeamBilling,
  saveTeamMemberQuota, toggleTeamLedger
} = useTeamManagement()
const workspaceAssets = ref<WorkspaceAsset[]>([])
const toolApprovals = ref<ToolApproval[]>([])
const workspaceTools = ref<AssistantToolBinding['tool'][]>([])
const workspaceAssistants = ref<WorkspaceAssistant[]>([])
const workspaceBusy = ref(false)
const workspaceMessage = ref('')
const workspaceError = ref(false)
const {
  knowledgeBases, knowledgeDraft, knowledgeAssetSelection, knowledgeTeamSelection,
  createKnowledgeBase, editKnowledgeBase, deleteKnowledgeBase,
  assignKnowledgeBaseTeam, attachKnowledgeAsset, detachKnowledgeAsset
} = useKnowledgeBases({ busy: workspaceBusy, message: workspaceMessage, error: workspaceError })
const apiCredentials = ref<ApiCredential[]>([])
const providerTemplates = ref<ProviderTemplate[]>([])
const privateModels = ref<PrivateModel[]>([])
const credentialEditor = ref<CredentialEditor | null>(null)
const credentialSaving = ref(false)
const credentialError = ref('')
const credentialCheckingId = ref('')
const discoveredCredentialModels = ref<string[]>([])
const privateModelEditor = ref<PrivateModelEditor | null>(null)
const privateModelSaving = ref(false)
const privateModelError = ref('')
const publicSettings = reactive<PublicSettings>({
  userByokEnabled: true,
  rechargeEnabled: false,
  subscriptionsEnabled: true,
  trialEnabled: false,
  currency: 'CNY',
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
})
const rechargePackages = ref<RechargePackage[]>([])
const rechargeOrders = ref<RechargeOrder[]>([])
const rechargeMessage = ref('')
const creatingOrder = ref(false)
const subscriptionPlans = ref<SubscriptionPlan[]>([])
const currentSubscription = ref<Subscription | null>(null)
const subscriptionOrders = ref<SubscriptionOrder[]>([])
const tokenQuota = ref<TokenQuotaSummary[]>([])
const tokenQuotaLoading = ref(false)
const couponWallet = reactive<CouponWallet>({ coupons: [], templates: [] })
const selectedCouponId = ref('')
const paymentQuote = ref<CommerceQuote | null>(null)
const couponBusyId = ref('')
const externalLinks = ref<ExternalNavLinkItem[]>([])
const availableModels = ref<AvailableModel[]>([])
const planBusy = ref(false)
const planMessage = ref('')
const planError = ref(false)
const renewalOptions = ref<RenewalOptions | null>(null)
const renewalAttempts = ref<RenewalAttempt[]>([])
const selectedRenewalChannelId = ref('')
const billingProfile = reactive<BillingProfile>({ profileType: 'COMPANY', title: '', taxId: '', invoiceEmail: '', phone: '', address: '', bankName: '', bankAccount: '' })
const invoiceTransactions = ref<InvoiceTransaction[]>([])
const invoiceRequests = ref<InvoiceRequest[]>([])
const selectedInvoiceTransactionId = ref('')
const billingBusy = ref(false)
const billingMessage = ref('')
const accountDeletion = ref<DeletionRequest | null>(null)
const deletionReason = ref('')
const deletionBusy = ref(false)
const deletionMessage = ref('')
const paymentChannels = ref<PaymentChannel[]>([])
const paymentIntent = ref<PaymentIntent | null>(null)
const selectedPaymentChannelId = ref('')
const selectedPaymentMethod = ref<PaymentMethodKey | ''>('')
const paymentTransaction = ref<PaymentTransaction | null>(null)
const paymentBusy = ref(false)
const paymentError = ref('')
let paymentPollTimer = 0
const dataActionBusy = ref(false)
const dataActionMessage = ref('')
const dataActionError = ref(false)
const unreadCount = computed(() => notifications.value.filter((item) => !item.readAt).length)
const showUpgradeEntry = computed(() => publicSettings.subscriptionsEnabled || publicSettings.trialEnabled || subscriptionPlans.value.length > 0)
// 浅层监听且只补缺失的草稿：后台重新拉取团队列表时不能把用户正在输入的配额草稿冲掉
watch(teams, (rows) => rows.forEach((team) => team.members.forEach((member) => {
  const key = `${team.id}:${member.userId}`
  if (key in teamQuotaDrafts) return
  teamQuotaDrafts[key] = member.monthlyCreditLimit === null ? '' : String(member.monthlyCreditLimit)
})), { immediate: true })
const eligiblePaymentChannels = computed(() => paymentIntent.value ? paymentChannels.value.filter((item) => item.minAmountCents <= paymentIntent.value!.amountCents && (!item.maxAmountCents || item.maxAmountCents >= paymentIntent.value!.amountCents)) : [])
const availablePaymentCoupons = computed(() => {
  const planId = paymentIntent.value?.orderType === 'SUBSCRIPTION' ? paymentIntent.value.productId : ''
  return couponWallet.coupons.filter((coupon) => coupon.status === 'AVAILABLE' && (!coupon.expiresAt || new Date(coupon.expiresAt) > new Date()) && (!coupon.template.products.length || coupon.template.products.some((item) => item.planId === planId)))
})
const selectedPaymentChannel = computed(() => eligiblePaymentChannels.value.find((item) => item.id === selectedPaymentChannelId.value) || null)
const paymentInstructions = computed(() => String(paymentTransaction.value?.metadata?.instructions || ''))
const paymentStatusTitle = computed(() => paymentStatusTitleText[paymentTransaction.value?.status || ''] || '正在确认交易')
const storedSettings = readStoredSettings()
const storedLanguage = storedSettings.language === 'English' ? 'en' : storedSettings.language === '中文' ? 'zh-CN' : storedSettings.language
const storedAppearance = storedSettings.appearance === 'light' ? '浅色' : storedSettings.appearance === 'dark' ? '深色' : storedSettings.appearance === 'system' ? '跟随系统' : storedSettings.appearance
const settings = reactive<WorkspaceSettings>({
  notifications: storedSettings.notifications ?? true,
  rememberModel: storedSettings.rememberModel ?? true,
  language: storedLanguage || 'zh-CN',
  appearance: storedAppearance || '跟随系统',
  style: storedSettings.style || '默认',
  detail: storedSettings.detail || '自动判断',
  replyLanguage: storedSettings.replyLanguage || '跟随对话',
  customInstructions: storedSettings.customInstructions || '',
  nickname: storedSettings.nickname || '',
  occupation: storedSettings.occupation || '',
  bio: storedSettings.bio || '',
  useMemory: storedSettings.useMemory ?? true,
  referenceChats: storedSettings.referenceChats ?? true,
  chatHistoryEnabled: storedSettings.chatHistoryEnabled ?? true,
  trainingOptOut: storedSettings.trainingOptOut ?? true,
  temporaryChatDefault: storedSettings.temporaryChatDefault ?? false,
  dataRetentionDays: storedSettings.dataRetentionDays ?? 0,
  shareUsageAnalytics: storedSettings.shareUsageAnalytics ?? false,
  redeemCode: '',
  onboarded: storedSettings.onboarded !== false,
})
const showOnboarding = ref(false)
const settingsNav = computed(() => [
  { id: 'general' as const, label: t('settings.general'), icon: Sun },
  { id: 'personalization' as const, label: t('settings.personalization'), icon: Sparkles },
  { id: 'data' as const, label: t('settings.data'), icon: SlidersHorizontal },
  { id: 'plan' as const, label: '套餐与账单', icon: WalletCards },
  { id: 'api' as const, label: t('settings.api'), icon: KeyRound },
  { id: 'workspace' as const, label: '知识与工具', icon: BookOpen },
  { id: 'teams' as const, label: '团队空间', icon: Users },
  { id: 'support' as const, label: '帮助与客服', icon: LifeBuoy },
  { id: 'account' as const, label: t('settings.account'), icon: UserRound },
])
const settingsAliases: Record<string, SettingsSection> = {
  notifications: 'general',
  sidebar: 'general',
  credits: 'plan',
  redeem: 'plan',
  invite: 'plan',
}

function applyTheme() {
  document.documentElement.dataset.studioTheme = settings.appearance === '浅色' ? 'light' : settings.appearance === '深色' ? 'dark' : window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  locale.value = settings.language
  document.documentElement.lang = settings.language
}

watch(() => [settings.appearance, settings.language], applyTheme, { immediate: true })
let settingsTimer = 0
// 监听源剔除 redeemCode：它是兑换框的临时输入，每次按键都会触发本监听，
// 若不剔除则每个字符都会写一次 localStorage 并调度一次服务器保存。
watch(() => {
  const { redeemCode: _redeemCode, ...persisted } = settings
  return persisted
}, () => {
  writeStoredSettings({ ...settings, redeemCode: '' })
  if (!settingsHydrated.value) return
  window.clearTimeout(settingsTimer)
  settingsTimer = window.setTimeout(() => { void saveSettings(false) }, 450)
}, { deep: true })
watch(() => props.activeMode, async () => {
  closeConversationMenu()
  mobileOpen.value = false
  accountOpen.value = false
  chatActionsOpen.value = false
  await nextTick()
  workspaceMain.value?.scrollTo({ top: 0, left: 0, behavior: 'auto' })
})
watch(() => route.fullPath, closeConversationMenu)
onMounted(async () => {
  document.body.classList.add('has-workspace')
  document.addEventListener('pointerdown', handleConversationMenuOutside)
  document.addEventListener('keydown', handleConversationMenuKeydown)
  window.addEventListener('resize', closeConversationMenu)
  try {
    await auth.refresh()
    await loadWorkspaceData()
  } finally {
    workspaceDataLoaded.value = true
    settingsHydrated.value = true
  }
  const teamInviteToken = typeof route.query.teamInviteToken === 'string' ? route.query.teamInviteToken : ''
  if (teamInviteToken && auth.session?.id) {
    try {
      const result = await api<{ teamName: string }>(`/team-invitations/${encodeURIComponent(teamInviteToken)}/accept`, { method: 'POST' })
      await loadDeferredWorkspaceData()
      teams.value = await api<Team[]>('/teams')
      teamMessage.value = `已加入团队“${result.teamName}”`
      teamError.value = false
    } catch (reason) {
      teamMessage.value = reason instanceof Error ? reason.message : '接受团队邀请失败'
      teamError.value = true
    }
    const query = { ...route.query }
    delete query.teamInviteToken
    await router.replace({ query })
    openSettings('teams')
  }
  const requestedSection = (settingsAliases[String(route.query.settings || '')] || String(route.query.settings || '')) as SettingsSection
  if (settingsNav.value.some((item) => item.id === requestedSection)) {
    openSettings(requestedSection)
    // 深链参数消费后立即从 URL 移除：否则地址栏一直带着 ?settings=xxx，
    // 刷新、退出再登录（redirect 保留完整路径）都会重复自动打开设置抽屉
    const consumedQuery = { ...route.query }
    delete consumedQuery.settings
    void router.replace({ query: consumedQuery })
  }
})
onUnmounted(() => {
  document.body.classList.remove('has-workspace')
  document.removeEventListener('pointerdown', handleConversationMenuOutside)
  document.removeEventListener('keydown', handleConversationMenuKeydown)
  window.removeEventListener('resize', closeConversationMenu)
  window.clearTimeout(paymentPollTimer)
})

function openSettings(section: SettingsSection) {
  document.dispatchEvent(new Event('xinyue:close-popovers'))
  settingsSection.value = settingsAliases[section] || section
  settingsOpen.value = true
  accountOpen.value = false
  mobileOpen.value = false
  scrollActiveSetting('auto')
}

function openUpgrade() {
  document.dispatchEvent(new Event('xinyue:close-popovers'))
  upgradeOpen.value = true
  pricingMode.value = 'personal'
  settingsOpen.value = false
  accountOpen.value = false
  chatActionsOpen.value = false
}

function openTeamSettings() {
  upgradeOpen.value = false
  openSettings('teams')
}

function selectSettingsSection(section: SettingsSection) {
  settingsSection.value = settingsAliases[section] || section
  scrollActiveSetting('smooth')
}

function scrollActiveSetting(behavior: ScrollBehavior) {
  if (!window.matchMedia('(max-width: 640px)').matches) return
  void nextTick(() => settingsNavElement.value?.querySelector<HTMLElement>(`[data-section="${settingsSection.value}"]`)?.scrollIntoView({ behavior, block: 'nearest', inline: 'nearest' }))
}

function setSettingsNavElement(el: Element | ComponentPublicInstance | null) {
  settingsNavElement.value = el as HTMLElement | null
}

function settingsPayload() {
  return {
    appearance: settings.appearance === '浅色' ? 'light' : settings.appearance === '跟随系统' ? 'system' : 'dark', language: settings.language,
    responseStyle: settings.style, responseDetail: settings.detail, replyLanguage: settings.replyLanguage,
    customInstructions: settings.customInstructions, nickname: settings.nickname, occupation: settings.occupation,
    bio: settings.bio, useMemory: settings.useMemory, referenceChats: settings.referenceChats, notifications: settings.notifications,
    chatHistoryEnabled: settings.chatHistoryEnabled, trainingOptOut: settings.trainingOptOut, temporaryChatDefault: settings.temporaryChatDefault,
    dataRetentionDays: settings.dataRetentionDays, shareUsageAnalytics: settings.shareUsageAnalytics,
    onboarded: settings.onboarded !== false,
  }
}

async function saveSettings(showFeedback = false) {
  writeStoredSettings({ ...settings, redeemCode: '' })
  if (auth.session?.id) {
    try { await api('/users/me/settings', { method: 'PATCH', body: JSON.stringify(settingsPayload()) }); if (showFeedback) settingsMessage.value = '已保存' }
    catch { if (showFeedback) settingsMessage.value = '保存失败，请稍后重试' }
  } else if (showFeedback) settingsMessage.value = '已保存到此设备'
}

async function loadWorkspaceData() {
  const [catalogSettings, links] = await Promise.all([
    catalog.load(),
    api<ExternalNavLinkItem[]>('/catalog/external-links').catch(() => []),
  ])
  Object.assign(publicSettings, catalogSettings)
  publicSettings.sidebarNav = parseSidebarNav(catalogSettings.sidebarNav)
  publicSettings.workspaceNav = parseSidebarNav(catalogSettings.workspaceNav)
  publicSettings.sectionNav = parseSectionNav(catalogSettings.sectionNav)
  externalLinks.value = links
  if (!auth.session?.id) return
  const [, user, notices, cases, models, subscription] = await Promise.all([
    studio.hydrateWorkspace().catch(() => undefined),
    api<UserResponse>('/users/me').catch(() => null), api<NotificationItem[]>('/notifications').catch(() => []),
    api<ModerationCase[]>('/moderation/cases').catch(() => []),
    api<AvailableModel[]>(auth.session?.id ? '/users/me/models' : '/catalog/models').catch(() => []),
    api<Subscription | null>('/subscriptions/me').catch(() => null),
  ])
  if (user?.settings) {
    hydrateSettings(user.settings)
    showOnboarding.value = user.settings.onboarded === false
    const pending = storedSettings.pendingServerSync
    if (pending?.changedAt && Date.now() - pending.changedAt < 5 * 60 * 1000) {
      if (pending.appearance) settings.appearance = pending.appearance === 'light' ? '浅色' : pending.appearance === 'system' ? '跟随系统' : '深色'
      if (pending.language) settings.language = pending.language
      await api('/users/me/settings', { method: 'PATCH', body: JSON.stringify(settingsPayload()) }).then(() => {
        updateStoredSettings((current) => current.pendingServerSync?.changedAt === pending.changedAt
          ? { ...current, pendingServerSync: undefined }
          : current)
      }).catch(() => undefined)
    }
  }
  notifications.value = notices
  moderationCases.value = cases
  availableModels.value = models
  currentSubscription.value = subscription
  workspaceAssets.value = studio.assets.map((asset) => ({ id: asset.id, name: asset.title }))
  window.setTimeout(() => { void loadDeferredWorkspaceData() }, 200)
}

let deferredWorkspacePromise: Promise<void> | null = null
let deferredWorkspaceLoaded = false
function loadDeferredWorkspaceData() {
  if (deferredWorkspaceLoaded) return Promise.resolve()
  if (deferredWorkspacePromise) return deferredWorkspacePromise
  tokenQuotaLoading.value = true
  deferredWorkspacePromise = (async () => {
    const [ledger, invite, credentials, templates, userModels, packages, orders, modelPolicy, plans, planOrders, methods, teamRows, pendingInvites, knowledgeRows, tools, assistantRows, approvalRows, renewal, renewalHistory, profile, eligibleInvoices, invoices, deletion, wallet, quotaRows] = await Promise.all([
      api<CreditEntry[]>('/credits/ledger?take=30').catch(() => []),
      api<InviteInfo>('/invites/me').catch(() => null),
      api<ApiCredential[]>('/users/me/api-credentials').catch(() => []),
      api<ProviderTemplate[]>('/catalog/provider-templates').catch(() => []),
      api<PrivateModel[]>('/users/me/private-models').catch(() => []),
      api<RechargePackage[]>('/catalog/recharge-packages').catch(() => []),
      api<RechargeOrder[]>('/recharge/orders').catch(() => []),
      api<{ allowUserByok: boolean }>('/users/me/model-policy').catch(() => null),
      api<SubscriptionPlan[]>('/subscriptions/plans').catch(() => []),
      api<SubscriptionOrder[]>('/subscriptions/orders').catch(() => []),
      api<PaymentChannel[]>('/payments/methods').catch(() => []), api<Team[]>('/teams').catch(() => []),
      api<PendingTeamInvitation[]>('/team-invitations').catch(() => []),
      api<KnowledgeBase[]>('/knowledge-bases').catch(() => []),
      api<AssistantToolBinding['tool'][]>('/assistants/tools').catch(() => []), api<{ id: string; name: string; tools: { toolId: string }[] }[]>('/assistants').catch(() => []),
      api<typeof toolApprovals.value>('/tool-approvals').catch(() => []),
      api<RenewalOptions>('/subscriptions/renewal').catch(() => null),
      api<RenewalAttempt[]>('/subscriptions/renewal-attempts').catch(() => []),
      api<BillingProfile | null>('/billing/profile').catch(() => null),
      api<InvoiceTransaction[]>('/billing/invoice-transactions').catch(() => []),
      api<InvoiceRequest[]>('/billing/invoices').catch(() => []),
      api<DeletionRequest | null>('/users/me/deletion').catch(() => null),
      api<CouponWallet>('/commerce/coupons').catch(() => ({ coupons: [], templates: [] })),
      api<TokenQuotaSummary[]>('/billing/token-quota').catch(() => []),
    ])
  creditLedger.value = ledger
  if (invite) Object.assign(inviteInfo, invite)
  apiCredentials.value = credentials
  providerTemplates.value = templates
  privateModels.value = userModels
  rechargePackages.value = packages
  rechargeOrders.value = orders
  subscriptionPlans.value = plans
  subscriptionOrders.value = planOrders
  Object.assign(couponWallet, wallet)
  paymentChannels.value = methods
  teams.value = teamRows
  pendingTeamInvitations.value = pendingInvites
  knowledgeBases.value = knowledgeRows
  knowledgeRows.forEach((item) => { knowledgeTeamSelection[item.id] = item.teamId || '' })
  workspaceAssets.value = studio.assets.map((asset) => ({ id: asset.id, name: asset.title }))
  workspaceTools.value = tools
  workspaceAssistants.value = assistantRows
  toolApprovals.value = approvalRows
  renewalOptions.value = renewal
  renewalAttempts.value = renewalHistory
  if (renewal?.subscription) currentSubscription.value = renewal.subscription
  selectedRenewalChannelId.value = renewal?.subscription?.renewalChannelId || renewal?.channels[0]?.id || ''
  if (profile) Object.assign(billingProfile, profile)
  else if (auth.session?.email) billingProfile.invoiceEmail = auth.session.email
  invoiceTransactions.value = eligibleInvoices
  invoiceRequests.value = invoices
  accountDeletion.value = deletion
  tokenQuota.value = quotaRows
  tokenQuotaLoading.value = false
  if (modelPolicy) publicSettings.userByokEnabled = modelPolicy.allowUserByok
    deferredWorkspaceLoaded = true
  })().finally(() => { deferredWorkspacePromise = null })
  return deferredWorkspacePromise
}

function formatMoney(cents: number) { return new Intl.NumberFormat(settings.language, { style: 'currency', currency: publicSettings.currency }).format(cents / 100) }

async function requestToolApproval(binding: AssistantToolBinding) {
  const reason = window.prompt(`申请“${binding.tool.name}”权限的用途说明`, '')?.trim()
  if (reason === undefined) return
  workspaceBusy.value = true
  try { await api(`/assistants/${binding.assistant.id}/tools/${binding.tool.id}/approval-requests`, { method: 'POST', body: JSON.stringify({ reason }) }); toolApprovals.value = await api<typeof toolApprovals.value>('/tool-approvals'); workspaceMessage.value = '审批申请已提交'; workspaceError.value = false }
  catch (error) { workspaceError.value = true; workspaceMessage.value = error instanceof Error ? error.message : '审批申请提交失败' }
  finally { workspaceBusy.value = false }
}
async function cancelToolApproval(binding: AssistantToolBinding) {
  if (!binding.approval?.id || !window.confirm('撤回这条待审批申请？')) return
  workspaceBusy.value = true
  try { await api(`/tool-approvals/${binding.approval.id}`, { method: 'DELETE' }); toolApprovals.value = await api<typeof toolApprovals.value>('/tool-approvals'); workspaceMessage.value = '审批申请已撤回'; workspaceError.value = false }
  catch (error) { workspaceError.value = true; workspaceMessage.value = error instanceof Error ? error.message : '审批申请撤回失败' }
  finally { workspaceBusy.value = false }
}
async function startTrial(planId?: string) {
  planBusy.value = true; planMessage.value = ''; planError.value = false
  try { currentSubscription.value = await api<Subscription>('/subscriptions/trial', { method: 'POST', body: JSON.stringify(planId ? { planId } : {}) }); planMessage.value = '免费试用已生效'; await studio.refreshCredits() }
  catch (reason) { planError.value = true; planMessage.value = reason instanceof Error ? reason.message : '试用领取失败' }
  finally { planBusy.value = false }
}
async function purchasePlan(plan: SubscriptionPlan) {
  if (!plan.priceCents) { if (plan.trialDays) await startTrial(plan.id); return }
  await openPayment({ orderType: 'SUBSCRIPTION', productId: plan.id, productName: `${plan.name}套餐`, amountCents: plan.effectivePriceCents ?? plan.priceCents })
}
async function continueSubscriptionPayment(order: SubscriptionOrder) {
  await openPayment({ orderType: 'SUBSCRIPTION', productId: order.plan.id, productName: `${order.plan.name}套餐续费`, amountCents: order.amountCents, existingOrderId: order.id })
  const channel = eligiblePaymentChannels.value.find((item) => item.supportedMethods.includes(order.paymentMethod))
  if (channel) { selectedPaymentChannelId.value = channel.id; selectedPaymentMethod.value = order.paymentMethod }
}
async function cancelPendingSubscriptionOrder(order: SubscriptionOrder) {
  if (!window.confirm('取消这笔待支付套餐订单？')) return
  planBusy.value = true
  try { await api(`/subscriptions/orders/${order.id}`, { method: 'DELETE' }); subscriptionOrders.value = await api<SubscriptionOrder[]>('/subscriptions/orders'); renewalAttempts.value = await api<RenewalAttempt[]>('/subscriptions/renewal-attempts'); planMessage.value = '待支付订单已取消' }
  catch (reason) { planError.value = true; planMessage.value = reason instanceof Error ? reason.message : '订单取消失败' }
  finally { planBusy.value = false }
}
async function purchaseUpgradePlan(plan: SubscriptionPlan) {
  if (!plan.priceCents && plan.trialDays) {
    await startTrial(plan.id)
    if (!planError.value) upgradeOpen.value = false
    return
  }
  upgradeOpen.value = false
  await purchasePlan(plan)
}
async function cancelSubscription() {
  if (!currentSubscription.value || !window.confirm('确认取消当前套餐？')) return
  planBusy.value = true; planMessage.value = ''; planError.value = false
  try { const updated = await api<Subscription & { status: string }>('/subscriptions/cancel', { method: 'POST', body: '{}' }); currentSubscription.value = ['ACTIVE', 'TRIALING'].includes(updated.status) ? updated : null; planMessage.value = updated.cancelAtPeriodEnd ? '已关闭自动续订' : '套餐已取消' }
  catch (reason) { planError.value = true; planMessage.value = reason instanceof Error ? reason.message : '取消失败' }
  finally { planBusy.value = false }
}
async function toggleRenewal() {
  if (!currentSubscription.value) return
  planBusy.value = true; planMessage.value = ''; planError.value = false
  try {
    currentSubscription.value = await api<Subscription>('/subscriptions/renewal', { method: 'PATCH', body: JSON.stringify({ enabled: !currentSubscription.value.autoRenewEnabled, channelId: selectedRenewalChannelId.value || undefined }) })
    renewalOptions.value = await api<RenewalOptions>('/subscriptions/renewal')
    planMessage.value = currentSubscription.value.autoRenewEnabled ? '到期续费提醒已启用' : '到期续费提醒已关闭'
  } catch (reason) { planError.value = true; planMessage.value = reason instanceof Error ? reason.message : '续费设置保存失败' }
  finally { planBusy.value = false }
}
async function saveRenewalChannel() {
  if (!currentSubscription.value?.autoRenewEnabled || !selectedRenewalChannelId.value) return
  planBusy.value = true
  try { currentSubscription.value = await api<Subscription>('/subscriptions/renewal', { method: 'PATCH', body: JSON.stringify({ enabled: true, channelId: selectedRenewalChannelId.value }) }); planMessage.value = '续费渠道已更新' }
  catch (reason) { planError.value = true; planMessage.value = reason instanceof Error ? reason.message : '续费渠道保存失败' }
  finally { planBusy.value = false }
}
async function saveBillingProfile() {
  billingBusy.value = true; billingMessage.value = ''
  try { Object.assign(billingProfile, await api<BillingProfile>('/billing/profile', { method: 'PATCH', body: JSON.stringify(billingProfile) })); billingMessage.value = '开票资料已保存' }
  catch (reason) { billingMessage.value = reason instanceof Error ? reason.message : '开票资料保存失败' }
  finally { billingBusy.value = false }
}
async function requestInvoice() {
  if (!selectedInvoiceTransactionId.value) return
  billingBusy.value = true; billingMessage.value = ''
  try {
    await api('/billing/invoices', { method: 'POST', body: JSON.stringify({ transactionId: selectedInvoiceTransactionId.value, invoiceType: 'ELECTRONIC_NORMAL' }) })
    ;[invoiceTransactions.value, invoiceRequests.value] = await Promise.all([api<InvoiceTransaction[]>('/billing/invoice-transactions'), api<InvoiceRequest[]>('/billing/invoices')])
    selectedInvoiceTransactionId.value = ''; billingMessage.value = '发票申请已提交'
  } catch (reason) { billingMessage.value = reason instanceof Error ? reason.message : '发票申请失败' }
  finally { billingBusy.value = false }
}
async function cancelInvoiceRequest(item: InvoiceRequest) {
  if (!window.confirm('撤销这条发票申请？')) return
  billingBusy.value = true
  try { await api(`/billing/invoices/${item.id}`, { method: 'DELETE' }); invoiceRequests.value = await api<InvoiceRequest[]>('/billing/invoices'); billingMessage.value = '发票申请已撤销' }
  catch (reason) { billingMessage.value = reason instanceof Error ? reason.message : '撤销失败' }
  finally { billingBusy.value = false }
}
async function requestAccountDeletion() {
  if (!window.confirm('提交账户注销申请？7 天冷静期结束后，个人数据将被永久清除。')) return
  deletionBusy.value = true; deletionMessage.value = ''
  try { accountDeletion.value = await api<DeletionRequest>('/users/me/deletion', { method: 'POST', body: JSON.stringify({ reason: deletionReason.value }) }); deletionMessage.value = '注销申请已提交' }
  catch (reason) { deletionMessage.value = reason instanceof Error ? reason.message : '注销申请失败' }
  finally { deletionBusy.value = false }
}
async function cancelAccountDeletion() {
  deletionBusy.value = true; deletionMessage.value = ''
  try { await api('/users/me/deletion', { method: 'DELETE' }); accountDeletion.value = null; deletionMessage.value = '注销申请已撤销' }
  catch (reason) { deletionMessage.value = reason instanceof Error ? reason.message : '撤销失败' }
  finally { deletionBusy.value = false }
}
async function createRechargeOrder(item: RechargePackage) {
  await openPayment({ orderType: 'RECHARGE', productId: item.id, productName: item.name, amountCents: item.priceCents })
}

async function openPayment(intent: PaymentIntent) {
  paymentIntent.value = intent; paymentTransaction.value = null; paymentError.value = ''; paymentQuote.value = null; selectedCouponId.value = ''
  if (intent.orderType === 'SUBSCRIPTION' && !intent.existingOrderId) await refreshPaymentQuote()
  if (!paymentChannels.value.length) paymentChannels.value = await api<PaymentChannel[]>('/payments/methods').catch(() => [])
  const preferred = paymentChannels.value.find((item) => item.isDefault && item.minAmountCents <= intent.amountCents && (!item.maxAmountCents || item.maxAmountCents >= intent.amountCents)) || paymentChannels.value.find((item) => item.minAmountCents <= intent.amountCents && (!item.maxAmountCents || item.maxAmountCents >= intent.amountCents))
  selectedPaymentChannelId.value = preferred?.id || ''
  selectedPaymentMethod.value = preferred?.supportedMethods[0] || ''
}

function selectPaymentChannel(channel: PaymentChannel) { selectedPaymentChannelId.value = channel.id; if (!selectedPaymentMethod.value || !channel.supportedMethods.includes(selectedPaymentMethod.value)) selectedPaymentMethod.value = channel.supportedMethods[0] || '' }
function closePayment() { window.clearTimeout(paymentPollTimer); paymentIntent.value = null; paymentTransaction.value = null; paymentQuote.value = null; selectedCouponId.value = ''; paymentError.value = '' }

async function refreshPaymentQuote() {
  const intent = paymentIntent.value
  if (!intent || intent.orderType !== 'SUBSCRIPTION' || intent.existingOrderId) return
  paymentBusy.value = true; paymentError.value = ''
  try {
    paymentQuote.value = await api<CommerceQuote>('/commerce/quote', { method: 'POST', body: JSON.stringify({ planId: intent.productId, userCouponId: selectedCouponId.value || undefined }) })
    intent.amountCents = paymentQuote.value.amountCents
    if (!paymentQuote.value.coupon && selectedCouponId.value && paymentQuote.value.couponMessage) selectedCouponId.value = ''
  } catch (reason) { paymentError.value = reason instanceof Error ? reason.message : '优惠价格计算失败' }
  finally { paymentBusy.value = false }
}

async function claimCoupon(template: CouponTemplate) {
  couponBusyId.value = template.id
  try { await api('/commerce/coupons/claim', { method: 'POST', body: JSON.stringify({ templateId: template.id }) }); Object.assign(couponWallet, await api<CouponWallet>('/commerce/coupons')); planMessage.value = '优惠券已领取' }
  catch (reason) { planError.value = true; planMessage.value = reason instanceof Error ? reason.message : '优惠券领取失败' }
  finally { couponBusyId.value = '' }
}

async function confirmCheckout() {
  const intent = paymentIntent.value, channel = selectedPaymentChannel.value
  if (!intent || !channel || !selectedPaymentMethod.value) return
  paymentBusy.value = true; paymentError.value = ''
  const paymentWindow = channel.providerKey === 'MANUAL' ? null : window.open('', '_blank')
  if (paymentWindow) paymentWindow.opener = null
  try {
    const order = intent.existingOrderId ? { id: intent.existingOrderId } : intent.orderType === 'SUBSCRIPTION'
      ? await api<{ id: string }>('/subscriptions/orders', { method: 'POST', body: JSON.stringify({ planId: intent.productId, paymentMethod: selectedPaymentMethod.value, userCouponId: selectedCouponId.value || undefined }) })
      : await api<{ id: string }>('/recharge/orders', { method: 'POST', body: JSON.stringify({ packageId: intent.productId, paymentMethod: selectedPaymentMethod.value }) })
    paymentTransaction.value = await api<PaymentTransaction>('/payments/checkout', { method: 'POST', body: JSON.stringify({ orderType: intent.orderType, orderId: order.id, channelId: channel.id, paymentMethod: selectedPaymentMethod.value }) })
    const checkoutUrl = safeHttpNavigationUrl(paymentTransaction.value.checkoutUrl, window.location.origin)
    if (checkoutUrl && paymentWindow) paymentWindow.location.replace(checkoutUrl)
    else paymentWindow?.close()
    await refreshOrderHistory(intent.orderType)
    schedulePaymentPoll()
  } catch (reason) { paymentWindow?.close(); paymentError.value = reason instanceof Error ? reason.message : '支付订单创建失败' }
  finally { paymentBusy.value = false }
}

async function refreshPaymentStatus() {
  if (!paymentTransaction.value) return
  paymentBusy.value = true
  try {
    paymentTransaction.value = await api<PaymentTransaction>(`/payments/transactions/${paymentTransaction.value.id}`)
    if (paymentTransaction.value.status === 'COMPLETED' && paymentIntent.value) { await refreshOrderHistory(paymentIntent.value.orderType); await studio.refreshCredits(); currentSubscription.value = await api<Subscription | null>('/subscriptions/me').catch(() => currentSubscription.value); Object.assign(couponWallet, await api<CouponWallet>('/commerce/coupons').catch(() => couponWallet)) }
    if (paymentTransaction.value.status === 'FAILED') paymentError.value = paymentTransaction.value.failureReason || '交易处理失败，请联系管理员'
  } catch (reason) { paymentError.value = reason instanceof Error ? reason.message : '交易状态查询失败' }
  finally { paymentBusy.value = false }
}

function schedulePaymentPoll() {
  window.clearTimeout(paymentPollTimer)
  if (!paymentTransaction.value || ['COMPLETED', 'FAILED', 'CANCELLED', 'EXPIRED', 'REFUNDED'].includes(paymentTransaction.value.status)) return
  paymentPollTimer = window.setTimeout(async () => { await refreshPaymentStatus(); schedulePaymentPoll() }, 3000)
}

async function refreshOrderHistory(orderType: PaymentIntent['orderType']) {
  if (orderType === 'SUBSCRIPTION') subscriptionOrders.value = await api<SubscriptionOrder[]>('/subscriptions/orders').catch(() => subscriptionOrders.value)
  else rechargeOrders.value = await api<RechargeOrder[]>('/recharge/orders').catch(() => rechargeOrders.value)
}

function openCredentialEditor(item?: ApiCredential) {
  credentialError.value = ''
  credentialEditor.value = item ? { ...item, templateId: item.templateId || '', apiKey: '', expiresAt: item.expiresAt?.slice(0, 10) || '', autoImport: false } : { name: '', templateId: '', providerType: 'NEW_API', baseUrl: '', apiKey: '', apiKeyHint: '', authType: 'BEARER', enabled: true, isDefault: apiCredentials.value.length === 0, priority: 0, weight: 100, expiresAt: '', autoImport: true }
}

async function saveCredential() {
  if (!credentialEditor.value) return
  credentialSaving.value = true; credentialError.value = ''
  try {
    const { id, apiKeyHint: _hint, autoImport, ...payload } = credentialEditor.value
    if (!payload.apiKey) delete (payload as Partial<CredentialEditor>).apiKey
    const requestPayload = { ...payload, expiresAt: payload.expiresAt || null }
    const saved = await api<ApiCredential>(id ? `/users/me/api-credentials/${id}` : '/users/me/api-credentials', { method: id ? 'PATCH' : 'POST', body: JSON.stringify(requestPayload) })
    credentialEditor.value = null
    if (autoImport) {
      try {
        const imported = await api<{ imported: number }>(`/users/me/api-credentials/${saved.id}/import-models`, { method: 'POST', body: JSON.stringify({ importAll: true }) })
        message.success(`已自动导入 ${imported.imported} 个可用模型`)
      } catch (reason) {
        message.warning(`密钥已保存，自动识别失败：${reason instanceof Error ? reason.message : '请稍后手动检测'}`)
      }
    }
    const [credentials, models] = await Promise.all([api<ApiCredential[]>('/users/me/api-credentials'), api<PrivateModel[]>('/users/me/private-models')])
    apiCredentials.value = credentials
    privateModels.value = models
    document.dispatchEvent(new Event('xinyue:model-catalog-changed'))
  } catch (reason) { credentialError.value = reason instanceof Error ? reason.message : 'API 密钥保存失败' }
  finally { credentialSaving.value = false }
}

async function deleteCredential(item: ApiCredential) {
  if (!window.confirm(`确认删除“${item.name}”？`)) return
  try {
    await api(`/users/me/api-credentials/${item.id}`, { method: 'DELETE' })
    const [credentials, models] = await Promise.all([
      api<ApiCredential[]>('/users/me/api-credentials'),
      api<PrivateModel[]>('/users/me/private-models'),
    ])
    apiCredentials.value = credentials
    privateModels.value = models
    document.dispatchEvent(new Event('xinyue:model-catalog-changed'))
  } catch (reason) { message.error(reason instanceof Error ? reason.message : 'API 密钥删除失败') }
}

async function discoverCredential(item: ApiCredential) {
  credentialCheckingId.value = item.id
  try {
    const imported = await api<{ imported: number; availableModels: string[] }>(`/users/me/api-credentials/${item.id}/import-models`, { method: 'POST', body: JSON.stringify({ importAll: true }) })
    discoveredCredentialModels.value = imported.availableModels
    const [credentials, models] = await Promise.all([api<ApiCredential[]>('/users/me/api-credentials'), api<PrivateModel[]>('/users/me/private-models')])
    apiCredentials.value = credentials
    privateModels.value = models
    message.success(`检测完成，已同步 ${imported.imported} 个模型`)
    document.dispatchEvent(new Event('xinyue:model-catalog-changed'))
  } catch (reason) {
    const template = providerTemplates.value.find((entry) => entry.id === item.templateId)
    if (template && !template.supportsDiscovery) {
      discoveredCredentialModels.value = []
      openPrivateModelEditor(undefined, item.id)
      message.info('该渠道不提供模型列表，请手动填写模型 ID')
    } else message.error(reason instanceof Error ? reason.message : '密钥检测失败')
  } finally { credentialCheckingId.value = '' }
}

function openPrivateModelEditor(item?: PrivateModel, credentialId = '', upstreamModel = '') {
  privateModelError.value = ''
  privateModelEditor.value = item ? {
    id: item.id, displayName: item.displayName, description: item.description, capability: item.capability, apiProtocol: item.apiProtocol, routingStrategy: item.routingStrategy, enabled: item.enabled, isDefault: item.isDefault,
    routes: item.routes.map(({ credential: _credential, ...route }) => ({ ...route })),
  } : {
    id: '', displayName: upstreamModel, description: '', capability: 'CHAT', apiProtocol: 'openai', routingStrategy: 'PRIORITY', enabled: true, isDefault: false,
    routes: [{ credentialId: credentialId || apiCredentials.value[0]?.id || '', upstreamModel, enabled: true, priority: 0, weight: 100 }],
  }
}

async function savePrivateModel() {
  if (!privateModelEditor.value) return
  privateModelSaving.value = true
  privateModelError.value = ''
  try {
    const { id, routes, ...model } = privateModelEditor.value
    if (id) {
      await api(`/users/me/private-models/${id}`, { method: 'PATCH', body: JSON.stringify(model) })
      await api(`/users/me/private-models/${id}/routes`, { method: 'PUT', body: JSON.stringify({ routes }) })
    } else await api('/users/me/private-models', { method: 'POST', body: JSON.stringify({ ...model, routes }) })
    privateModels.value = await api<PrivateModel[]>('/users/me/private-models')
    document.dispatchEvent(new Event('xinyue:model-catalog-changed'))
    privateModelEditor.value = null
  } catch (reason) { privateModelError.value = reason instanceof Error ? reason.message : '私有模型保存失败' }
  finally { privateModelSaving.value = false }
}

async function deletePrivateModel(item: PrivateModel) {
  if (!window.confirm(`确认删除私有模型“${item.displayName}”？`)) return
  try {
    await api(`/users/me/private-models/${item.id}`, { method: 'DELETE' })
    privateModels.value = privateModels.value.filter((model) => model.id !== item.id)
    document.dispatchEvent(new Event('xinyue:model-catalog-changed'))
  } catch (reason) { message.error(reason instanceof Error ? reason.message : '私有模型删除失败') }
}

function hydrateSettings(value: UserSettingsResponse) {
  settings.appearance = value.appearance === 'light' ? '浅色' : value.appearance === 'system' ? '跟随系统' : '深色'
  settings.language = value.language || 'zh-CN'
  settings.style = value.responseStyle === 'default' ? '默认' : value.responseStyle || settings.style
  settings.detail = value.responseDetail === 'auto' ? '自动判断' : value.responseDetail || settings.detail
  settings.replyLanguage = value.replyLanguage === 'follow' ? '跟随对话' : value.replyLanguage || settings.replyLanguage
  settings.customInstructions = value.customInstructions || ''
  settings.nickname = value.nickname || ''
  settings.occupation = value.occupation || ''
  settings.bio = value.bio || ''
  settings.useMemory = value.useMemory ?? settings.useMemory
  settings.referenceChats = value.referenceChats ?? settings.referenceChats
  settings.notifications = value.notifications ?? settings.notifications
  settings.chatHistoryEnabled = value.chatHistoryEnabled ?? settings.chatHistoryEnabled
  settings.trainingOptOut = value.trainingOptOut ?? settings.trainingOptOut
  settings.temporaryChatDefault = value.temporaryChatDefault ?? settings.temporaryChatDefault
  settings.dataRetentionDays = value.dataRetentionDays ?? settings.dataRetentionDays
  settings.shareUsageAnalytics = value.shareUsageAnalytics ?? settings.shareUsageAnalytics
  settings.onboarded = value.onboarded !== false
  if (!studio.currentConversationId) studio.temporaryChat = settings.temporaryChatDefault || !settings.chatHistoryEnabled
}

async function markAllRead() {
  if (!unreadCount.value) return
  await api('/notifications/read-all', { method: 'POST' }).catch(() => undefined)
  const now = new Date().toISOString()
  notifications.value = notifications.value.map((item) => ({ ...item, readAt: item.readAt || now }))
}

async function submitModerationAppeal(item: ModerationCase) {
  const reason = (appealDrafts[item.id] || '').trim()
  if (reason.length < 10) return
  appealBusyId.value = item.id; appealMessage.value = ''; appealError.value = false
  try {
    await api(`/moderation/events/${item.id}/appeal`, { method: 'POST', body: JSON.stringify({ reason }) })
    moderationCases.value = await api<ModerationCase[]>('/moderation/cases')
    appealDrafts[item.id] = ''
    appealMessage.value = '申诉已提交，复核结果会通过站内通知发送。'
  } catch (error) {
    appealError.value = true; appealMessage.value = error instanceof Error ? error.message : '提交申诉失败'
  } finally { appealBusyId.value = '' }
}

async function cancelModerationAppeal(item: ModerationCase) {
  if (!item.appeal) return
  appealBusyId.value = item.id; appealMessage.value = ''; appealError.value = false
  try {
    await api(`/moderation/appeals/${item.appeal.id}/cancel`, { method: 'PATCH' })
    moderationCases.value = await api<ModerationCase[]>('/moderation/cases')
    appealMessage.value = '申诉已撤回。'
  } catch (error) {
    appealError.value = true; appealMessage.value = error instanceof Error ? error.message : '撤回申诉失败'
  } finally { appealBusyId.value = '' }
}

async function redeemCredits() {
  if (!settings.redeemCode.trim()) return
  redeeming.value = true; redeemMessage.value = ''; redeemError.value = false
  try {
    const result = await api<{ redeemed: boolean; credits?: number; reason?: string }>('/credits/redeem', { method: 'POST', body: JSON.stringify({ code: settings.redeemCode }) })
    if (!result.redeemed) {
      redeemError.value = true
      redeemMessage.value = result.reason === 'ALREADY_REDEEMED' ? '你已经兑换过该兑换码' : '兑换码无效或已失效'
      return
    }
    studio.credits += result.credits || 0; redeemMessage.value = `兑换成功，已增加 ${result.credits || 0} 创作点`; settings.redeemCode = ''
    await loadWorkspaceData()
  } catch { redeemError.value = true; redeemMessage.value = '兑换失败，请稍后重试' }
  finally { redeeming.value = false }
}

function copyInvite() {
  if (inviteInfo.url) void copyInviteLink(inviteInfo.url)
}

function handleConversationMenuOutside(event: PointerEvent) {
  const target = event.target as HTMLElement | null
  if (conversationMenuId.value && !conversationMenuElement.value?.contains(target as Node)) closeConversationMenu()
  if (accountOpen.value && !target?.closest('.workspace-account-wrap')) accountOpen.value = false
  if (chatActionsOpen.value && !target?.closest('.workspace-chat-more-wrap')) chatActionsOpen.value = false
}

function handleConversationMenuKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  closeConversationMenu()
  accountOpen.value = false
  chatActionsOpen.value = false
}

async function exportAccountData() {
  dataActionBusy.value = true; dataActionMessage.value = ''; dataActionError.value = false
  try {
    const created = await api<{ id: string }>('/exports', { method: 'POST', body: JSON.stringify({ scope: 'ACCOUNT' }) })
    let status: { status: string; downloadUrl: string | null; error?: string } | null = null
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const current = await api<{ status: string; downloadUrl: string | null; error?: string }>(`/exports/${created.id}`)
      status = current
      if (current.status === 'SUCCEEDED' || current.status === 'FAILED' || current.status === 'EXPIRED') break
      dataActionMessage.value = attempt ? '正在准备账户数据…' : '已提交导出任务…'
      await new Promise((resolve) => window.setTimeout(resolve, 1000))
    }
    const completed = status
    if (!completed || completed.status !== 'SUCCEEDED' || !completed.downloadUrl) throw new Error(completed?.error || '导出任务未完成，请稍后重试')
    const response = await fetch(apiUrl(completed.downloadUrl), { credentials: 'include' })
    if (!response.ok) throw new Error('导出文件下载失败')
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = completed.downloadUrl.split('/').pop() || `xinyue-export-${new Date().toISOString().slice(0, 10)}.json`
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
    dataActionMessage.value = '账户数据已导出'
  } catch (reason) { dataActionError.value = true; dataActionMessage.value = reason instanceof Error ? reason.message : '数据导出失败' }
  finally { dataActionBusy.value = false }
}
async function clearConversationHistory() {
  if (!window.confirm('永久删除全部聊天记录？此操作无法撤销。')) return
  dataActionBusy.value = true; dataActionMessage.value = ''; dataActionError.value = false
  try { await studio.clearConversations(); dataActionMessage.value = '全部聊天记录已删除' }
  catch (reason) { dataActionError.value = true; dataActionMessage.value = reason instanceof Error ? reason.message : '聊天记录删除失败' }
  finally { dataActionBusy.value = false }
}

async function logout() {
  await auth.signOut()
  studio.clearWorkspace()
  accountOpen.value = false
  await router.push('/')
}
</script>
