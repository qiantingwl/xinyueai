<template>
    <section v-if="activeMode === 'chat'" :key="activeMode" class="studio-chat chat-page" :class="[`chat-ui--${chatUiPreset}`, `chat-layout--w-${chatLayout.contentWidth}`, `chat-layout--header-${chatLayout.header}`, `chat-layout--home-${chatLayout.homeLayout}`, `chat-layout--msg-${chatLayout.messageStyle}`, { 'has-messages': isConversationView, 'is-artifact-open': activeArtifact, 'is-temporary': store.temporaryChat }]">
      <div class="chat-dialog-pane">
      <header class="chat-page__header"><h1 v-if="hasChatThread" class="chat-page__title">Xinyue AI</h1><div class="chat-page__header-actions"><button v-if="auth.isAuthenticated" class="temporary-chat-toggle" :class="{ active: store.temporaryChat }" type="button" :aria-pressed="store.temporaryChat" :aria-label="store.temporaryChat ? '退出临时聊天' : '开启临时聊天'" :title="store.temporaryChat ? '退出临时聊天' : '临时聊天'" @click="toggleTemporaryChat"><MessageCircleDashed :size="19" /></button><div v-else-if="catalog.loginEnabled" class="chat-page__auth-actions"><RouterLink to="/login?redirect=/chat">登录</RouterLink><RouterLink v-if="catalog.registrationAvailable" class="is-primary" to="/login?redirect=/chat&amp;register=1">免费注册</RouterLink></div></div></header>
      <div v-if="store.lastError" class="studio-feedback" role="alert"><span>{{ store.lastError }}</span><button type="button" aria-label="关闭提示" @click="store.clearError"><X :size="15" /></button></div>

      <aside v-if="isJixingSkin && !isConversationView && !store.temporaryChat && !auth.isAuthenticated && catalog.loginEnabled && !jxPromoDismissed" class="jx-promo-toast">
        <button type="button" aria-label="关闭推广卡片" title="关闭" @click="dismissJxPromo"><X :size="13" /></button>
        <strong>免费生图，登录即送</strong>
        <p>登录即送，AI 创作大礼包<br />对新用户和会员用户限时免费！</p>
      </aside>

      <div class="chat-center" :class="{ 'chat-center--thread': hasChatThread }">
        <ChatHome :has-chat-thread="isConversationView" :chat-ui-preset="homeChatUiPreset" />
        <ChatThread ref="chatThread" :has-chat-thread="hasChatThread" :jump-highlight-id="jumpHighlightId" :model="model" :web-search-enabled="webSearchEnabled" :active-chat-response-mode="activeChatResponseMode" :opening-canvas="openingCanvas" :avatar-motion="catalog.settings.chatAvatarMotion || 'ambient'" :avatar-enabled="catalog.settings.chatAvatarEnabled !== false" :avatar-style="catalog.settings.chatAvatarStyle || 'classic'" :avatar-color="catalog.settings.chatAvatarColor || 'auto'" :sync-message-navigator="syncMessageNavigator" @open-artifact="openCodeArtifact" @preview-asset="previewAsset = $event" @use-reference="useGeneratedAssetAsReference" @open-canvas="openGenerationOnCanvas" @publish-work="publishGenerationAsWork" @retry-image="retryImageGeneration" @retry-video="retryVideoGeneration" @download-asset="downloadGeneratedAsset" @follow-up="useFollowUpSuggestion" />

        <button v-if="showBackToBottom" class="chat-back-to-bottom" type="button" aria-label="回到底部" title="回到底部" @click="resumeFollowing"><ChevronDown :size="18" /><i v-if="streamUnread" aria-hidden="true" /></button>

        <section v-if="!isConversationView && !store.temporaryChat && chatUiPreset === 'doubao' && doubaoRecommendations.length" class="chat-home-suggestions" aria-label="为你推荐">
          <span>为你推荐</span>
          <button v-for="suggestion in doubaoRecommendations" :key="suggestion.title" type="button" @click="useChatSuggestion(suggestion)">{{ suggestion.title }}</button>
        </section>

        <ChatComposer ref="chatComposer" v-model:draft="draft" v-model:attachments="attachments" v-model:active-chat-mode="activeChatMode" v-model:web-search-enabled="webSearchEnabled" v-model:assistant-id="assistantId" v-model:chat-plugin-id="chatPluginId" v-model:qianwen-banner-index="qianwenBannerIndex" v-model:active-capability="activeCapability" :capability-models="capabilityModels" :active-capability-model="activeCapabilityModel" :active-capability-model-label="activeCapabilityModelLabel" :capability-model-available="capabilityModelAvailable" :capability-model-unavailable-message="activeCapabilityModelUnavailableMessage" :select-capability-model="selectCapabilityModel" :has-chat-thread="isConversationView" :chat-ui-preset="chatUiPreset" :uploading="uploading" :voice-listening="voiceListening" :voice-target="voiceTarget" :submit-message="submitMessage" :toggle-voice="toggleVoice" :open-file-picker="openFilePicker" :upload-chat-files="uploadChatFiles" :collapse-workspace-popovers="collapseWorkspacePopovers" :apply-quick-action-model="applyQuickActionModel" @load-models="void loadModelCatalog({ force: true })" />

        <section v-if="isJixingSkin && !isConversationView && !store.temporaryChat && (jxHomeActions.length || jxBanners.length)" class="jx-home-extras" aria-label="快捷工具与热门推荐">
          <div v-if="jxBarActions.length" class="jx-chips">
            <button v-for="item in jxBarActions" :key="item.id" class="jx-chip" type="button" @click="executeJxAction(item)">
              <img v-if="jxChipThumb(item)" class="jx-chip__thumb" :src="jxChipThumb(item)" :alt="item.label" />
              <span v-else class="jx-chip__icon"><component :is="quickActionIcon(item.icon)" :size="17" /></span>
              <span>{{ item.label.replace('/', '\u200b/') }}</span>
            </button>
          </div>
          <div class="jx-home-lower">
            <section v-if="jxBanners.length" class="jx-banner" aria-label="推荐横幅">
              <button class="jx-banner__slide" :class="{ 'jx-banner__slide--fallback': !activeJxBanner.imageUrl }" :style="activeJxBanner.imageUrl ? undefined : jxBannerFallbackStyle" type="button" @click="openConfiguredDestination(activeJxBanner.targetUrl)">
                <img v-if="activeJxBanner.imageUrl" :src="activeJxBanner.imageUrl" :alt="activeJxBanner.title" loading="lazy" />
                <span v-else class="jx-banner__deco" aria-hidden="true"><WandSparkles :size="140" :stroke-width="1.1" /></span>
                <span class="jx-banner__copy"><strong>{{ activeJxBanner.title }}</strong><small>{{ activeJxBanner.description }}</small><em v-if="activeJxBanner.buttonText">{{ activeJxBanner.buttonText }}<ArrowUpRight v-if="!activeJxBanner.imageUrl" :size="13" /></em></span>
              </button>
              <nav v-if="jxBanners.length > 1" aria-label="切换横幅"><button v-for="(_, index) in jxBanners" :key="index" type="button" :class="{ 'is-active': qianwenBannerIndex === index }" :aria-label="`查看第 ${index + 1} 项`" @click="qianwenBannerIndex = index" /></nav>
            </section>
            <div v-if="jxCardActions.length" class="jx-recommend">
              <header class="jx-recommend__head"><h3 class="jx-recommend__title">热门推荐</h3><RouterLink class="jx-recommend__more" to="/capabilities">更多工具<ChevronRight :size="14" /></RouterLink></header>
              <div class="jx-recommend__grid">
                <button v-for="item in jxCardActions" :key="item.id" class="jx-recommend__card" :class="{ 'jx-recommend__card--media': item.imageUrl }" type="button" @click="executeJxAction(item)">
                  <img v-if="item.imageUrl" class="jx-recommend__thumb" :src="item.imageUrl" :alt="item.label" loading="lazy" />
                  <span v-else class="jx-recommend__icon"><component :is="quickActionIcon(item.icon)" :size="18" /></span>
                  <strong>{{ item.label.replace('/', '\u200b/') }}</strong>
                  <small>{{ jxActionHint(item) }}</small>
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>

      <button v-if="!isConversationView && !store.temporaryChat && chatUiPreset === 'kimi'" class="chat-home-explore" type="button" @click="router.push('/prompts')">
        <Lightbulb :size="16" /><span>探索灵感</span><small>浏览提示词</small><ChevronRight :size="15" />
      </button>

      <aside v-if="messageJumps.length > 1" class="chat-message-navigator" :class="{ 'is-open': messageNavigatorOpen }" aria-label="已发送消息导航" @mouseenter="openMessageNavigator" @mouseleave="scheduleMessageNavigatorClose" @focusin="openMessageNavigator" @focusout="closeMessageNavigatorOnBlur">
        <button type="button" :aria-expanded="messageNavigatorOpen" aria-label="浏览已发送消息" title="浏览已发送消息" @click="openMessageNavigator">
          <span v-for="message in messageJumps.slice(0, 8)" :key="message.id" :class="{ active: activeMessageJumpId === message.id }" />
        </button>
        <section v-if="messageNavigatorOpen" class="chat-message-navigator__panel">
          <div>
            <button v-for="(message, index) in messageJumps" :key="message.id" type="button" :class="{ 'is-active': activeMessageJumpId === message.id }" :title="message.content" @click="jumpToMessage(message.id)">
              <span>{{ index + 1 }}</span>
              <strong>{{ compactMessageJump(message.content) }}</strong>
            </button>
          </div>
        </section>
      </aside>

      <footer v-if="store.temporaryChat" class="temporary-chat-retention">为保护安全，临时聊天会按管理员设置的保留期限自动删除。</footer>
      <footer v-else-if="!auth.isAuthenticated" class="chat-legal">Xinyue AI 是 AI 服务。使用即表示你同意我们的<RouterLink to="/terms">条款</RouterLink>和<RouterLink to="/privacy">隐私政策</RouterLink>。请勿分享敏感信息。<RouterLink to="/about">了解更多</RouterLink></footer>
      </div>
      <CodeArtifactPanel v-if="activeArtifact" :artifact="activeArtifact" @close="activeArtifact = null" />
    </section>

    <CreationPanel v-else-if="activeMode === 'images' || activeMode === 'videos' || activeMode === 'commerce'" :key="activeMode" ref="creationPanel" v-model:generation-prompt="generationPrompt" v-model:mask-attachment="maskAttachment" v-model:first-frame-attachment="firstFrameAttachment" v-model:last-frame-attachment="lastFrameAttachment" v-model:creation-plugin-id="creationPluginId" v-model:creation-plugin-open="creationPluginOpen" v-model:mode-asset-limit="modeAssetLimit" v-model:selected-commerce-run="selectedCommerceRun" :active-mode="activeMode" :model-catalog-error="modelCatalogError" :active-creation-models="activeCreationModels" :active-creation-model="activeCreationModel" :active-creation-model-label="activeCreationModelLabel" :active-creation-model-available="activeCreationModelAvailable" :active-creation-model-unavailable-message="activeCreationModelUnavailableMessage" :active-image-capabilities="activeImageCapabilities" :active-video-capabilities="activeVideoCapabilities" :select-video-setting="selectVideoSetting" :creation-plugin-capability="creationPluginCapability" :current-generation-cost="currentGenerationCost" :can-submit-creation="canSubmitCreation" :has-creation-input="hasCreationInput" :creation-prompt-placeholder="creationPromptPlaceholder" :uploading="uploading" :voice-listening="voiceListening" :voice-target="voiceTarget" :creation-menu="creationMenu" :creation-menu-style="creationMenuStyle" :creation-menu-title="creationMenuTitle" :creation-menu-options="creationMenuOptions" :creation-options-open="creationOptionsOpen" :creation-more-panel-style="creationMorePanelStyle" :creation-type="creationType" :video-aspect-ratio="videoAspectRatio" :commerce-platform="commercePlatform" :auto-mode="autoMode" :image-style="imageStyle" :video-resolution="videoResolution" :video-duration="videoDuration" :commerce-modules="commerceModules" :quality="quality" :image-count="imageCount" :output-format="outputFormat" :image-background="imageBackground" :creation-attachments="creationAttachments" :image-tools="imageTools" :selected-image-tool-id="selectedImageToolId" :active-inspirations="activeInspirations" :inspiration-loading="activeInspirationLoading" :inspiration-error="activeInspirationError" :selected-inspiration-id="selectedInspirationId" :pending-video-runs="pendingVideoRuns" :current-video-credit="currentVideoCredit" :mode-assets="modeAssets" :visible-mode-assets="visibleModeAssets" :commerce-runs="commerceRuns" :submit-generation="submitGeneration" :resize-generation-input="resizeGenerationInput" :collapse-workspace-popovers="collapseWorkspacePopovers" :open-file-picker="openFilePicker" :switch-creation-mode="switchCreationMode" :toggle-creation-menu="toggleCreationMenu" :toggle-more-options="toggleMoreOptions" :toggle-voice="toggleVoice" :select-image-tool="selectImageTool" :open-prompt-library="openPromptLibrary" :open-inspiration="openInspiration" :play-inspiration-video="playInspirationVideo" :pause-inspiration-video="pauseInspirationVideo" :retry-inspirations="retryActiveInspirations" :stop-generation="stopGeneration" :delete-asset="deleteAsset" :use-asset-prompt="useAssetPrompt" :retry-asset-generation="retryAssetGeneration" :use-generated-asset-as-reference="useGeneratedAssetAsReference" :select-creation-option="selectCreationOption" :is-creation-option-active="isCreationOptionActive" :ratio-shape-class="ratioShapeClass" :style-thumbnail="styleThumbnail" :creation-option-label="creationOptionLabel" :creation-option-price="creationOptionPrice" :image-tool-icon="imageToolIcon" :refresh-model-catalog="refreshModelCatalog" :preview-frame-asset="previewFrameAsset" />

    <ProjectsPanel v-else-if="activeMode === 'projects'" :key="activeMode" v-model:project-notice="projectNotice" :open-project-details="openProjectDetails" />

    <section v-else-if="activeMode === 'assets'" :key="activeMode" class="studio-index-page library-page">
      <div class="index-page-inner">
        <WorkspaceSectionTabs active="files" />
        <div v-if="store.lastError" class="studio-feedback studio-feedback--inline" role="alert"><span>{{ store.lastError }}</span><button type="button" aria-label="关闭提示" @click="store.clearError"><X :size="15" /></button></div>
        <header class="index-page-header"><div class="index-page-title"><h1>文件库</h1><p>管理生成作品、参考素材和办公文件。</p></div><div><label class="workspace-search"><Search :size="16" /><input v-model="assetSearch" :placeholder="t('studio.search')" /></label><button class="index-new-button" type="button" @click="newMenuOpen = !newMenuOpen"><Plus :size="16" />{{ t('studio.create') }}<ChevronDown :size="15" /></button><div v-if="newMenuOpen" class="library-new-menu"><button type="button" @click="openFilePicker('library')"><Upload :size="16" />上传文件</button></div></div></header>
        <div class="library-toolbar">
          <nav><button v-for="tab in assetTabs" :key="tab.value" type="button" :class="{ 'is-active': assetTab === tab.value }" @click="assetTab = tab.value">{{ tab.label }}</button></nav>
          <div class="library-view-controls"><button type="button" aria-label="筛选" title="筛选" :class="{ 'is-active': assetFilter !== 'all' || filterMenuOpen }" @click="filterMenuOpen = !filterMenuOpen"><ListFilter :size="17" /></button><div v-if="filterMenuOpen" class="library-filter-menu"><strong>筛选</strong><button v-for="filter in assetFilters" :key="filter.value" type="button" :class="{ 'is-active': assetFilter === filter.value }" @click="assetFilter = filter.value; filterMenuOpen = false">{{ filter.label }}<Check v-if="assetFilter === filter.value" :size="15" /></button></div><i></i><button type="button" aria-label="网格视图" title="网格视图" :class="{ 'is-active': libraryGrid }" @click="libraryGrid = true"><LayoutGrid :size="18" /></button><button type="button" aria-label="列表视图" title="列表视图" :class="{ 'is-active': !libraryGrid }" @click="libraryGrid = false"><List :size="18" /></button></div>
        </div>
        <div v-if="auth.isAuthenticated && !store.workspaceHydrated" class="library-list-skeleton" aria-label="正在加载文件"><i v-for="index in 8" :key="index" /></div>
        <div v-else-if="filteredAssets.length" :class="libraryGrid ? 'library-assets-grid' : 'library-assets-list'">
          <div v-if="!libraryGrid" class="library-list-head"><span>名称</span><span>已修改</span><span>大小</span></div>
          <AssetGrid :assets="visibleLibraryAssets" :variant="libraryGrid ? 'cards' : 'list'" :deletable="auth.isAuthenticated" :shareable="auth.isAuthenticated" @delete="deleteAsset" @share="openAssetTeamDialog" />
          <button v-if="visibleLibraryAssets.length < filteredAssets.length" class="library-load-more" type="button" @click="libraryAssetLimit += 30">加载更多</button>
        </div>
        <EmptyState v-else :icon="Upload" :title="uploading ? '正在上传' : assetSearch ? '没有匹配的文件' : '上传你的第一个文件'" :description="assetSearch ? '换一个关键词，或调整上方分类和筛选条件。' : '支持图片、视频、文档和表格，上传后可在对话、创作与办公任务中使用。'"><button type="button" :disabled="uploading" @click="openFilePicker('library')"><Upload :size="15" />{{ uploading ? '上传中' : '上传文件' }}</button></EmptyState>
      </div>
    </section>

    <input :ref="setFileInput" class="visually-hidden" type="file" multiple :accept="fileAccept" @change="handleFiles" />
    <InspirationPreview v-if="inspirationPreview" :inspiration="inspirationPreview" :type-label="activeMode === 'commerce' ? '商品图灵感' : activeMode === 'videos' ? '视频灵感' : '图片灵感'" @close="inspirationPreview = null" @use="useInspiration(inspirationPreview)" />
    <CommerceGallery v-if="selectedCommerceRun" :run="selectedCommerceRun" @close="selectedCommerceRun = null" @reuse="useCommerceAsset" />
    <GeneratedImagePreview v-if="previewAsset" :asset="previewAsset" @close="previewAsset = null" @delete="deletePreviewAsset" @download="downloadGeneratedAsset(previewAsset)" @reuse="useGeneratedAssetAsReference(previewAsset)" @quote="useAssetPrompt(previewAsset)" @regenerate="retryAssetGeneration(previewAsset)" />

    <Teleport to="body">
      <ProjectDetailDialog v-if="projectDetailOpen" v-model:project-team-id="projectTeamId" v-model:project-version-preview="projectVersionPreview" v-model:project-skill-name="projectSkillName" v-model:project-skill-content="projectSkillContent" v-model:project-skill-conversation-id="projectSkillConversationId" v-model:project-skill-summary-request="projectSkillSummaryRequest" v-model:project-workflow-status="projectWorkflowStatus" v-model:project-default-model="projectDefaultModel" v-model:project-default-assistant-id="projectDefaultAssistantId" v-model:project-instructions="projectInstructions" v-model:project-default-prompt="projectDefaultPrompt" v-model:project-output-requirements="projectOutputRequirements" v-model:project-version-label="projectVersionLabel" v-model:project-member-email="projectMemberEmail" v-model:project-member-role="projectMemberRole" :project-detail="projectDetail" :project-versions="projectVersions" :project-detail-loading="projectDetailLoading" :project-detail-error="projectDetailError" :project-skill-status="projectSkillStatus" :project-skill-candidate="projectSkillCandidate" :project-member-busy="projectMemberBusy" :project-team-busy="projectTeamBusy" :project-skill-busy="projectSkillBusy" :project-saving="projectSaving" :project-restoring-version="projectRestoringVersion" :project-steps="projectSteps" :manageable-project-teams="manageableProjectTeams" :assistants="assistants" :close-project-details="closeProjectDetails" :format-date="formatDate" :open-project-conversation="openProjectConversation" :open-project-asset="openProjectAsset" :assign-project-team="assignProjectTeam" :add-project-member="addProjectMember" :update-project-member-role="updateProjectMemberRole" :remove-project-member="removeProjectMember" :save-project-skill="saveProjectSkill" :disable-project-skill="disableProjectSkill" :summarize-project-skill="summarizeProjectSkill" :activate-project-skill-candidate="activateProjectSkillCandidate" :restore-project-skill="restoreProjectSkill" :add-project-step="addProjectStep" :remove-project-step="removeProjectStep" :save-project-workflow="saveProjectWorkflow" :create-project-checkpoint="createProjectCheckpoint" :restore-project="restoreProject" :format-project-snapshot="formatProjectSnapshot" />
      <div v-if="assetTeamTarget" class="studio-modal-backdrop" @click.self="assetTeamTarget = null">
        <section class="asset-team-dialog" role="dialog" aria-modal="true" aria-labelledby="asset-team-title"><header><div><h2 id="asset-team-title">文件团队归属</h2><p>{{ assetTeamTarget.title }}</p></div><button type="button" aria-label="关闭" @click="assetTeamTarget = null"><X :size="20" /></button></header><label><span>可访问范围</span><select v-model="assetTeamId"><option value="">仅自己</option><option v-for="team in manageableProjectTeams" :key="team.id" :value="team.id">{{ team.name }}</option></select></label><p v-if="assetTeamTarget.teamId && !manageableProjectTeams.some((team) => team.id === assetTeamTarget?.teamId)" class="modal-error">该文件由团队管理员管理，你可以查看但不能调整归属。</p><footer><button type="button" @click="assetTeamTarget = null">取消</button><button type="button" :disabled="assetTeamBusy || !canManageAssetTeam" @click="saveAssetTeam">{{ assetTeamBusy ? '保存中' : '保存' }}</button></footer></section>
      </div>
    </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch, watchEffect } from 'vue'
import { catalogModelKey, catalogModelLabel, catalogModelUnavailableMessage, catalogSelectionForValue, findCatalogModel, isCatalogModelAvailable, resolveCatalogModel, type CatalogModel, type ModelCapability } from '../utils/model-catalog'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ArrowUpRight, Brush, Check, ChevronDown, ChevronRight, Eraser, LayoutGrid, Lightbulb, List, ListFilter, Maximize2, MessageCircleDashed, Plus, ScanSearch, Search, Upload, WandSparkles, X } from 'lucide-vue-next'
import AssetGrid from '../components/AssetGrid.vue'
import CommerceGallery from '../components/CommerceGallery.vue'
import CodeArtifactPanel from '../components/CodeArtifactPanel.vue'
import GeneratedImagePreview from '../components/GeneratedImagePreview.vue'
import InspirationPreview from '../components/InspirationPreview.vue'
import WorkspaceSectionTabs from '../components/WorkspaceSectionTabs.vue'
import ChatComposer from '../components/chat/ChatComposer.vue'
import ChatHome from '../components/chat/ChatHome.vue'
import ChatThread from '../components/chat/ChatThread.vue'
import CreationPanel from '../components/creation/CreationPanel.vue'
import ProjectDetailDialog from '../components/projects/ProjectDetailDialog.vue'
import ProjectsPanel from '../components/projects/ProjectsPanel.vue'
import EmptyState from '../components/common/EmptyState.vue'
import type { CreationMenu, ImageTool, Inspiration } from '../components/creation/creation-shared'
import { useAuthStore } from '../stores/auth'
import { useCatalogStore, defaultChatHomeContent, type ChatQuickAction, type ChatRecommendation, type ChatUiPreset } from '../stores/catalog'
import { quickActionIcon } from '../utils/quick-action-icons'
import { ChatSendError, useStudioStore } from '../stores/studio'
import type { CodeArtifact, GenerationRun, PluginCapability, StudioAsset, StudioMode, WebSearchSource } from '../types'
import { canvasDocumentFromStudioAssets, type CanvasRecord } from '../types/canvas'
import { api } from '../services/api'
import { composerMaxHeight, resizeTextarea } from '../composables/useAutoResizeTextarea'
import { useSpeechInput } from '../composables/useSpeechInput'
import { consumeCreationPrompt, stageCreationPrompt, type PendingCreationPrompt, type PromptTransferType } from '../utils/prompt-transfer'
import { getChatLayout, resolveChatUiPreset } from '../layouts/chat-presets'
import { isDedicatedImageTool, mergeImageTools, type ImageToolType } from '../utils/image-tools'
import { useChatMessageNavigator } from '../composables/chat/useChatMessageNavigator'
import { useChatConversationLifecycle } from '../composables/chat/useChatConversationLifecycle'
import { useChatSubmission, type ChatCapability } from '../composables/chat/useChatSubmission'
import { useStudioFileUpload } from '../composables/studio/useStudioFileUpload'
import { useStudioModelCatalog } from '../composables/studio/useStudioModelCatalog'
import { useStudioProjectWorkspace } from '../composables/studio/useStudioProjectWorkspace'
import { isGenerationActive } from '../utils/generation-run-state'
import { useEscapeClose } from '../composables/useEscapeClose'


interface AssistantOption { id: string; name: string; description: string; defaultModel?: string }

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const store = useStudioStore()
const auth = useAuthStore()
const catalog = useCatalogStore()
const homeChatUiPreset = computed<ChatUiPreset>(() => catalog.settings.chatUiPreset || 'gpt')
const hasChatThread = computed(() => store.messages.some((message) => message.id !== 'welcome') || store.generations.length > 0)
const isConversationView = computed(() => Boolean(store.currentConversationId || store.openingConversationId) || hasChatThread.value)
const chatUiPreset = computed<ChatUiPreset>(() => resolveChatUiPreset(homeChatUiPreset.value, isConversationView.value))
const chatLayout = computed(() => getChatLayout(chatUiPreset.value))
const doubaoRecommendations = computed(() => catalog.settings.chatHomeContent.doubaoRecommendations)
const qianwenBanners = computed(() => catalog.settings.chatHomeContent.qianwenBanners)
const isJixingSkin = computed(() => homeChatUiPreset.value === 'jixing')
const sortJxActions = (items: ChatQuickAction[]) => [...items]
  .filter((item) => item.enabled)
  .sort((left, right) => left.sortOrder - right.sortOrder || left.label.localeCompare(right.label, 'zh-CN'))
const jxConfiguredActions = computed(() => sortJxActions(catalog.settings.chatHomeContent.quickActions.jixing || catalog.settings.chatHomeContent.quickActions.doubao || []))
// 后台把快捷卡与横幅全部清空时（常见于未配置后台的首次部署），回退到 catalog
// 默认兜底数据，避免首页只剩 hero 与输入框；任一区块有真实配置时保持原样。
const jxHomeUseFallback = computed(() => !jxConfiguredActions.value.length && !qianwenBanners.value.length)
const jxHomeActions = computed(() => (jxHomeUseFallback.value ? sortJxActions(defaultChatHomeContent.quickActions.jixing || []) : jxConfiguredActions.value))
const jxBarActions = computed(() => jxHomeActions.value.filter((item) => item.placement === 'BAR'))
const jxChipThumbs: Record<string, string> = {
  'jixing-polish': '/assets/jx-tools/polish.jpg',
  'jixing-mainimage': '/assets/jx-tools/main-set.jpg',
  'jixing-detail': '/assets/jx-tools/detail.jpg',
  'jixing-scene': '/assets/jx-tools/scene.jpg',
  '一键商品精修': '/assets/jx-tools/polish.jpg',
  '电商主图直出': '/assets/jx-tools/main-set.jpg',
  '商品详情页/A+': '/assets/jx-tools/detail.jpg',
  '商品场景图': '/assets/jx-tools/scene.jpg',
}
function jxChipThumb(item: ChatQuickAction) {
  return item.imageUrl || jxChipThumbs[item.id] || jxChipThumbs[item.label] || ''
}
const jxPromptFallbacks: Record<string, string> = {
  'jixing-polish': '请对商品图做电商精修：清理杂乱背景，校正光影和色彩，突出材质与轮廓，输出适合主图的干净商品图。',
  '一键商品精修': '请对商品图做电商精修：清理杂乱背景，校正光影和色彩，突出材质与轮廓，输出适合主图的干净商品图。',
  'jixing-card-polish': '请对商品图做电商精修：清理杂乱背景，校正光影和色彩，突出材质与轮廓，输出适合主图的干净商品图。',
  '商品精修': '请对商品图做电商精修：清理杂乱背景，校正光影和色彩，突出材质与轮廓，输出适合主图的干净商品图。',
  'jixing-mainimage': '请生成电商白底主图：商品主体居中，光线均匀，背景干净，细节清晰，适合店铺主图。',
  '电商主图直出': '请生成电商白底主图：商品主体居中，光线均匀，背景干净，细节清晰，适合店铺主图。',
  'jixing-card-main-set': '请生成一套电商主图：白底主图、卖点图、细节特写和使用场景图，风格统一。',
  '电商主图套图': '请生成一套电商主图：白底主图、卖点图、细节特写和使用场景图，风格统一。',
  'jixing-detail': '请为这件商品生成详情页/A+ 方案：包含核心卖点、材质工艺、使用场景和版式说明。',
  'jixing-card-detail': '请为这件商品生成详情页/A+ 方案：包含核心卖点、材质工艺、使用场景和版式说明。',
  '商品详情页/A+': '请为这件商品生成详情页/A+ 方案：包含核心卖点、材质工艺、使用场景和版式说明。',
  'jixing-scene': '请把商品放入真实使用场景，保持商品外观、颜色和比例不变，光线和透视自然。',
  'jixing-card-scene': '请把商品放入真实使用场景，保持商品外观、颜色和比例不变，光线和透视自然。',
  '商品场景图': '请把商品放入真实使用场景，保持商品外观、颜色和比例不变，光线和透视自然。',
  'jixing-card-replica': '请参考爆款主图的构图和卖点排布，为这件商品重做主图，保持商品真实外观。',
  '爆款主图复刻': '请参考爆款主图的构图和卖点排布，为这件商品重做主图，保持商品真实外观。',
  'jixing-card-poster': '请为商品设计一张电商海报：主体突出，卖点和促销信息清楚，版式适合店铺投放。',
  '电商海报': '请为商品设计一张电商海报：主体突出，卖点和促销信息清楚，版式适合店铺投放。',
  'jixing-card-model': '请生成模特试穿或试戴该商品的图片，姿态自然，商品细节和版型保持清晰。',
  '模特试衣': '请生成模特试穿或试戴该商品的图片，姿态自然，商品细节和版型保持清晰。',
  'jixing-card-swap': '请更换画面中的模特，保持服装或商品不变，新模特的姿态、光线和比例自然。',
  '换模特': '请更换画面中的模特，保持服装或商品不变，新模特的姿态、光线和比例自然。',
}
function jxActionPrompt(item: ChatQuickAction) {
  return (item.prompt || '').trim() || jxPromptFallbacks[item.id] || jxPromptFallbacks[item.label] || ''
}
function jxRoutePromptType(target: string): PromptTransferType | null {
  const path = target.split('?')[0]
  if (path === '/image' || path.startsWith('/image/')) return 'IMAGE'
  if (path === '/video' || path.startsWith('/video/')) return 'VIDEO'
  if (path === '/commerce' || path.startsWith('/commerce/')) return 'COMMERCE'
  return null
}
const jxCardActions = computed(() => jxHomeActions.value.filter((item) => item.placement === 'MORE').slice(0, 8))
const jxActionHint = (item: ChatQuickAction) => item.actionType === 'ROUTE' ? (item.target === '/commerce' ? '成套电商素材' : item.target === '/video' ? 'AI 生成视频' : 'AI 生成商品图') : item.actionType === 'OFFICE' ? '办公助手' : item.webSearch ? '联网调研' : '即问即答'
function executeJxAction(item: ChatQuickAction) {
  store.clearError()
  const prompt = jxActionPrompt(item)
  if (item.actionType === 'ROUTE') {
    const target = item.target || '/chat'
    const promptType = jxRoutePromptType(target)
    if (prompt && promptType) {
      stageCreationPrompt({ type: promptType, prompt, title: item.label, sourceName: '季星快捷入口' })
      void router.push(target.startsWith('/') ? target : `/${target}`)
      return
    }
    openConfiguredDestination(target)
    return
  }
  if (item.actionType === 'OFFICE') { void router.push({ path: '/office', query: { tool: item.target || 'daily', ...(prompt ? { prompt } : {}) } }); return }
  draft.value = prompt
  void nextTick(() => { resizeComposer(); composerInput.value?.focus({ preventScroll: true }) })
}
const qianwenBannerIndex = ref(0)
let qianwenBannerTimer = 0
// 季星风首页横幅：复用千问轮播数据与索引；后台无配置时随整体兜底回退默认横幅
const jxBanners = computed(() => (jxHomeUseFallback.value ? defaultChatHomeContent.qianwenBanners : qianwenBanners.value))
const activeJxBanner = computed(() => jxBanners.value[qianwenBannerIndex.value % Math.max(jxBanners.value.length, 1)] || { title: '', description: '', buttonText: '', imageUrl: '', targetUrl: '/capabilities' })
// 无配图横幅的兜底渐变：按轮播序号轮换四套配色，保证相邻横幅有区分度（不随机）
const jxBannerFallbackGradients = [
  'linear-gradient(135deg, #4338ca 0%, #7c3aed 55%, #c026d3 100%)',
  'linear-gradient(135deg, #155e75 0%, #0284c7 55%, #2563eb 100%)',
  'linear-gradient(135deg, #9a3412 0%, #ea580c 52%, #e11d48 100%)',
  'linear-gradient(135deg, #065f46 0%, #0d9488 55%, #0891b2 100%)',
]
const jxBannerFallbackStyle = computed(() => ({ background: jxBannerFallbackGradients[qianwenBannerIndex.value % jxBannerFallbackGradients.length] }))
// 季星风游客促销浮卡（关闭后不再弹出）
const jxPromoDismissed = ref(window.localStorage.getItem('xinyue:jx-promo-dismissed') === '1')
function dismissJxPromo() {
  jxPromoDismissed.value = true
  window.localStorage.setItem('xinyue:jx-promo-dismissed', '1')
}
const activeChatMode = ref('快速')
const activeChatResponseMode = computed<'fast' | 'expert'>(() => ['专家', '进阶', '思考研究'].includes(activeChatMode.value) ? 'expert' : 'fast')
const webSearchPreferenceKey = 'xinyue:chat:web-search'
const webSearchEnabled = ref(window.localStorage.getItem(webSearchPreferenceKey) === 'true')
const pendingRecommendationSource = ref<{ prompt: string; source: WebSearchSource } | null>(null)
const draft = ref('')
const chatThread = ref<InstanceType<typeof ChatThread> | null>(null)
const thread = computed(() => chatThread.value?.threadEl() ?? null)
const chatComposer = ref<InstanceType<typeof ChatComposer> | null>(null)
const composerInput = computed(() => chatComposer.value?.composerInputEl() ?? null)
const creationPanel = ref<InstanceType<typeof CreationPanel> | null>(null)
const creationComposer = computed(() => creationPanel.value?.creationComposerEl() ?? null)
const generationInput = computed(() => creationPanel.value?.generationInputEl() ?? null)
const creationMoreTrigger = computed(() => creationPanel.value?.creationMoreTriggerEl() ?? null)
const creationMorePanel = computed(() => creationPanel.value?.creationMorePanelEl() ?? null)
const creationOptionsMenu = computed(() => creationPanel.value?.creationOptionsMenuEl() ?? null)
const activeArtifact = ref<CodeArtifact | null>(null)
const assistantMenuOpen = ref(false)
const assistants = ref<AssistantOption[]>([])
const assistantId = ref('')
const chatPluginId = ref('')
const creationPluginId = ref('')
const attachments = ref<StudioAsset[]>([])
const previewAsset = ref<StudioAsset | null>(null)
const openingCanvas = ref(false)
const model = ref('')
const voiceTarget = ref<'chat' | 'creation'>('chat')
const speech = useSpeechInput({
  onTranscript: (text) => {
    if (voiceTarget.value === 'creation') {
      generationPrompt.value = `${generationPrompt.value}${generationPrompt.value ? ' ' : ''}${text}`
      void nextTick(resizeGenerationInput)
    } else {
      draft.value = `${draft.value}${draft.value ? ' ' : ''}${text}`
      void nextTick(resizeComposer)
    }
  },
  onUnsupported: (message) => { store.lastError = message },
  onError: (message) => { store.lastError = message },
})
const voiceListening = speech.listening
watch(webSearchEnabled, (enabled) => window.localStorage.setItem(webSearchPreferenceKey, String(enabled)))
async function applyQuickActionModel(item: ChatQuickAction) {
  if (!item.modelKey) return true
  await loadModelCatalog()
  const configuredModel = catalogModels.value.find((candidate) => candidate.capability === 'CHAT' && candidate.key === item.modelKey)
  if (!configuredModel) {
    store.lastError = `快捷能力“${item.label}”绑定的模型当前不可用，请联系管理员调整模型或用户分组。`
    return false
  }
  selectModel(configuredModel.key)
  return true
}
function useChatSuggestion(suggestion: ChatRecommendation) {
  if (suggestion.targetUrl) { openConfiguredDestination(suggestion.targetUrl); return }
  draft.value = suggestion.prompt || suggestion.title
  pendingRecommendationSource.value = suggestion.sourceUrl
    ? { prompt: draft.value.trim(), source: { title: suggestion.source ? `${suggestion.title} - ${suggestion.source}` : suggestion.title, url: suggestion.sourceUrl, publishedAt: suggestion.publishedAt } }
    : null
  if (pendingRecommendationSource.value || /联网搜索/.test(draft.value)) webSearchEnabled.value = true
  void nextTick(() => { resizeComposer(); composerInput.value?.focus({ preventScroll: true }) })
}
function openConfiguredDestination(target: string) {
  if (!target) return
  if (/^https?:\/\//i.test(target)) { window.open(target, '_blank', 'noopener,noreferrer'); return }
  void router.push(target.startsWith('/') ? target : `/${target}`)
}
async function toggleTemporaryChat() {
  await store.toggleTemporaryChat()
}
const catalogModels = ref<CatalogModel[]>([])
const modelCatalogError = ref('')
const chatModels = computed<CatalogModel[]>(() => catalogModels.value.filter((item) => item.capability === 'CHAT'))
const activeCapability = ref<ChatCapability>('CHAT')
const capabilityModelSelections = reactive<Record<ChatCapability, string>>({ CHAT: '', IMAGE: '', VIDEO: '', AGENT: '' })
const capabilityModels = computed(() => catalogModels.value)
function currentCatalogCapability() {
  return activeCapability.value === 'AGENT' ? 'CHAT' : activeCapability.value as ModelCapability
}
function displayedCatalogModel(value = capabilityModelSelections[activeCapability.value] || (activeCapability.value === 'CHAT' ? model.value : activeCapability.value === 'IMAGE' ? imageModel.value : activeCapability.value === 'VIDEO' ? videoModel.value : model.value)) {
  return resolveCatalogModel(catalogModels.value, value, currentCatalogCapability())
}
const activeCapabilityModel = computed(() => displayedCatalogModel()?.key || capabilityModelSelections[activeCapability.value] || (activeCapability.value === 'CHAT' ? model.value : activeCapability.value === 'IMAGE' ? imageModel.value : activeCapability.value === 'VIDEO' ? videoModel.value : model.value))
const activeCapabilityModelLabel = computed(() => displayedCatalogModel(activeCapabilityModel.value)?.displayName || catalogModelLabel(catalogModels.value, activeCapabilityModel.value, currentCatalogCapability()) || '暂无可用模型')
const capabilityModelAvailable = computed(() => isCatalogModelAvailable(displayedCatalogModel(activeCapabilityModel.value)))
const activeCapabilityModelUnavailableMessage = computed(() => catalogModelUnavailableMessage(displayedCatalogModel(activeCapabilityModel.value)))
const creationPluginCapability = computed<PluginCapability>(() => activeMode.value === 'videos' ? 'VIDEO' : activeMode.value === 'commerce' ? 'COMMERCE' : 'IMAGE')
const generationPrompt = ref('')
const creationAttachments = ref<StudioAsset[]>([])
const maskAttachment = ref<StudioAsset | null>(null)
const firstFrameAttachment = ref<StudioAsset | null>(null)
const lastFrameAttachment = ref<StudioAsset | null>(null)
const imageModel = ref('')
const videoModel = ref('')
const commerceModel = ref('')
const videoResolution = ref('720p')
const videoDuration = ref(5)
const videoAspectRatio = ref('16:9')
const autoMode = ref('自动')
const quality = ref<string>('标准')
const imageStyle = ref('')
const imageCount = ref(1)
const outputFormat = ref<'PNG' | 'JPEG' | 'WebP'>('PNG')
const imageBackground = ref<'自动背景' | '透明背景' | '不透明背景'>('自动背景')
const creationType = ref('详情页')
const commercePlatform = ref('自动')
const commerceModules = ref(8)
const selectedCommerceRun = ref<GenerationRun | null>(null)
const activeImageCapabilities = computed(() => {
  const model = findCatalogModel(catalogModels.value, imageModel.value, 'IMAGE')
  const raw = model?.options?.imageCapabilities || {}
  return { sizes: raw.sizes?.length ? raw.sizes : ['1024x1024', '1536x1024', '1024x1536', '2048x2048', '4096x4096'], qualities: raw.qualities?.length ? raw.qualities : ['low', 'medium', 'high'], outputFormats: raw.outputFormats?.length ? raw.outputFormats : ['png', 'jpeg', 'webp'], backgrounds: raw.backgrounds?.length ? raw.backgrounds : ['auto', 'opaque', 'transparent'], maxCount: Math.max(1, Math.min(10, raw.maxCount || 4)), defaultSize: raw.defaultSize || '1024x1024', defaultQuality: raw.defaultQuality || 'medium', supportsReference: raw.supportsReference !== false, supportsMask: raw.supportsMask === true, resolutionPricing: raw.resolutionPricing || {} }
})
const activeVideoCapabilities = computed(() => {
  const model = findCatalogModel(catalogModels.value, videoModel.value, 'VIDEO')
  const raw = model?.options?.videoCapabilities || {}
  return { resolutions: raw.resolutions?.length ? raw.resolutions : ['480p', '720p', '1080p'], durations: raw.durations?.length ? raw.durations : [5, 10, 15], aspectRatios: raw.aspectRatios?.length ? raw.aspectRatios : ['自动', '1:1', '3:4', '4:3', '9:16', '16:9'], defaultResolution: raw.defaultResolution || raw.resolutions?.[0] || '720p', defaultDuration: raw.defaultDuration || raw.durations?.[0] || 5, defaultAspectRatio: raw.defaultAspectRatio || raw.aspectRatios?.[0] || '16:9', pricing: raw.pricing || {} }
})
function imageSizeLabel(value: string) {
  const [width, height] = value.split('x').map(Number)
  const tier = Math.max(width || 0, height || 0) >= 4096 ? '4K' : Math.max(width || 0, height || 0) >= 2048 ? '2K' : '1K'
  const shape = width === height ? '正方形' : width > height ? '横向' : '竖向'
  return `${tier} ${shape} ${value.replace('x', '×')}`
}
function qualityLabel(value: string): string { return value === 'low' ? '低' : value === 'high' ? '高' : '标准' }
function backgroundLabel(value: string) { return value === 'transparent' ? '透明背景' : value === 'opaque' ? '不透明背景' : '自动背景' }
function syncImageSelection() { const caps = activeImageCapabilities.value; if (!imageRatios.includes(autoMode.value)) autoMode.value = imageRatioForSize(autoMode.value); if (imageCount.value > caps.maxCount) imageCount.value = caps.maxCount; if (!caps.qualities.map(qualityLabel).includes(quality.value)) quality.value = qualityLabel(caps.defaultQuality); if (!caps.outputFormats.map((item) => item.toUpperCase()).includes(outputFormat.value)) outputFormat.value = caps.outputFormats[0].toUpperCase() as typeof outputFormat.value; if (!caps.backgrounds.map(backgroundLabel).includes(imageBackground.value)) imageBackground.value = backgroundLabel(caps.backgrounds[0]) }
function syncVideoSelection() { const caps = activeVideoCapabilities.value; if (!caps.resolutions.includes(videoResolution.value)) videoResolution.value = caps.defaultResolution; if (!caps.durations.includes(videoDuration.value)) videoDuration.value = caps.defaultDuration; if (!caps.aspectRatios.includes(videoAspectRatio.value)) videoAspectRatio.value = caps.defaultAspectRatio }
const selectedImageModel = computed(() => findCatalogModel(catalogModels.value, imageModel.value, 'IMAGE'))
const selectedVideoModel = computed(() => findCatalogModel(catalogModels.value, videoModel.value, 'VIDEO'))
const selectedCommerceModel = computed(() => findCatalogModel(catalogModels.value, commerceModel.value, 'COMMERCE') || catalogModels.value.find((item) => item.capability === 'COMMERCE' && item.isDefault) || catalogModels.value.find((item) => item.capability === 'COMMERCE'))
const activeCreationCapability = computed<ModelCapability>(() => activeMode.value === 'videos' ? 'VIDEO' : activeMode.value === 'commerce' ? 'COMMERCE' : 'IMAGE')
const activeCreationModel = computed(() => activeMode.value === 'videos' ? videoModel.value : activeMode.value === 'commerce' ? commerceModel.value || selectedCommerceModel.value?.key || '' : imageModel.value)
const activeCreationModels = computed(() => catalogModels.value.filter((item) => item.capability === activeCreationCapability.value))
const activeCreationModelAvailable = computed(() => isCatalogModelAvailable(findCatalogModel(activeCreationModels.value, activeCreationModel.value, activeCreationCapability.value)))
const activeCreationModelLabel = computed(() => catalogModelLabel(catalogModels.value, activeCreationModel.value, activeCreationCapability.value) || '暂无可用模型')
const activeCreationModelUnavailableMessage = computed(() => catalogModelUnavailableMessage(findCatalogModel(activeCreationModels.value, activeCreationModel.value, activeCreationCapability.value)))
const currentImageCredit = computed(() => { const size = imageSizeForRatio(autoMode.value); const tier = imageSizeLabel(size).split(' ')[0]; const base = selectedImageModel.value?.effectiveCreditCost ?? selectedImageModel.value?.flatCreditCost ?? 1; return activeImageCapabilities.value.resolutionPricing?.[tier] ?? base * (tier === '4K' ? 4 : tier === '2K' ? 2 : 1) })
const currentVideoCredit = computed(() => activeVideoCapabilities.value.pricing[`${videoResolution.value}:${videoDuration.value}`] ?? (selectedVideoModel.value?.effectiveCreditCost ?? selectedVideoModel.value?.flatCreditCost ?? 10) * (videoResolution.value === '1080p' ? 2 : videoResolution.value === '2160p' ? 4 : 1) * Math.max(1, Math.ceil(videoDuration.value / 5)))
const currentGenerationCost = computed(() => activeMode.value === 'images' ? currentImageCredit.value * imageCount.value : activeMode.value === 'videos' ? currentVideoCredit.value : (selectedCommerceModel.value?.effectiveCreditCost ?? selectedCommerceModel.value?.flatCreditCost ?? 1) * commerceModules.value)

const { loadModelCatalog, refreshModelCatalogOnFocus, refreshModelCatalog } = useStudioModelCatalog({
  models: catalogModels,
  error: modelCatalogError,
  chatModel: model,
  imageModel,
  videoModel,
  commerceModel,
  capabilitySelections: capabilityModelSelections,
}, {
  requestModels: () => api<CatalogModel[]>(auth.isAuthenticated ? '/users/me/models' : '/catalog/models', { cache: 'no-store' }),
  currentConversationId: () => store.currentConversationId,
  syncImageSelection,
  syncVideoSelection,
})

// WorkspaceShell resolves the cookie session asynchronously. If the page mounted
// during that probe, reload the user-scoped catalog instead of keeping the public one.
watch(() => auth.isAuthenticated, (authenticated, previous) => {
  if (authenticated !== previous) void loadModelCatalog({ applyDefaults: authenticated, force: true })
})

const { submitMessage } = useChatSubmission({
  draft,
  attachments,
  activeCapability,
  activeCapabilityModel,
  capabilityModelAvailable,
  activeCapabilityModelUnavailableMessage,
  model,
  assistantId,
  pluginId: chatPluginId,
  webSearchEnabled,
  responseMode: activeChatResponseMode,
  pendingRecommendationSource,
  displayedModelCapability: computed(() => displayedCatalogModel(activeCapabilityModel.value)?.capability),
}, {
  isGenerating: () => store.isGenerating,
  requireAuth: () => requireAuth('/chat'),
  loadModels: () => loadModelCatalog({ force: true }),
  setError: (message) => { store.lastError = message },
  closePopovers: () => chatComposer.value?.closePopovers(),
  resizeComposer,
  scrollThreadToBottom: () => scrollThreadToBottom(),
  currentConversationId: () => store.currentConversationId,
  buildGenerationOptions: ({ capability, content, assetIds }) => {
    const isVideo = capability === 'VIDEO'
    return {
      mode: isVideo ? 'videos' : 'images',
      prompt: content,
      model: activeCapabilityModel.value,
      ratio: imageSizeForRatio(autoMode.value),
      quality: isVideo ? undefined : providerQuality(quality.value),
      count: isVideo ? 1 : imageCount.value,
      referenceAssetIds: assetIds,
      outputFormat: isVideo ? undefined : providerOutputFormat(outputFormat.value),
      background: isVideo ? undefined : providerBackground(imageBackground.value),
      resolution: isVideo ? videoResolution.value : undefined,
      duration: isVideo ? videoDuration.value : undefined,
      aspectRatio: isVideo ? videoAspectRatio.value : undefined,
      creditCost: isVideo ? currentVideoCredit.value : currentImageCredit.value * imageCount.value,
    }
  },
  startGeneration: (...args) => store.startGeneration(...args),
  sendChat: (content, input) => store.sendMessage(content, input),
  shouldRestoreDraft: (reason) => reason instanceof ChatSendError && reason.restoreDraft,
})

const creationMenu = ref<CreationMenu>(null)
const creationMenuAnchor = ref<HTMLElement | null>(null)
const creationMenuAnchorRect = ref<{ left: number; right: number; top: number; bottom: number; width: number } | null>(null)
const creationMenuStyle = ref<Record<string, string>>({})
const creationOptionsOpen = ref(false)
const creationMorePanelStyle = ref<Record<string, string>>({ visibility: 'hidden' })
const creationPluginOpen = ref(false)
const projectNotice = ref('')
const {
  projectDetailOpen, projectDetailLoading, projectSaving, projectRestoringVersion,
  projectDetailError, projectDetail, projectVersions, projectVersionPreview,
  projectMemberEmail, projectMemberRole, projectMemberBusy, projectTeamId, projectTeamBusy,
  manageableProjectTeams, projectSkillStatus, projectSkillCandidate, projectSkillName,
  projectSkillContent, projectSkillConversationId, projectSkillSummaryRequest, projectSkillBusy,
  projectWorkflowStatus, projectDefaultModel, projectDefaultAssistantId, projectInstructions,
  projectDefaultPrompt, projectOutputRequirements, projectVersionLabel, projectSteps,
  assetTeamTarget, assetTeamId, assetTeamBusy, canManageAssetTeam, formatDate,
  closeProjectDetails, formatProjectSnapshot, openProjectDetails, assignProjectTeam,
  addProjectMember, updateProjectMemberRole, removeProjectMember, saveProjectSkill,
  disableProjectSkill, summarizeProjectSkill, activateProjectSkillCandidate,
  restoreProjectSkill, addProjectStep, removeProjectStep, saveProjectWorkflow,
  createProjectCheckpoint, restoreProject, openProjectConversation, openProjectAsset,
  openAssetTeamDialog, saveAssetTeam
} = useStudioProjectWorkspace({
  assistants,
  currentUserId: computed(() => auth.session?.id),
  projectNotice,
  previewAsset,
  loadAssistants,
  requireAuth,
  downloadAsset: downloadGeneratedAsset
})
// 文件归属弹层由项目详情抽屉唤起，两者的 Esc 需要分层处理。
useEscapeClose(() => { assetTeamTarget.value = null }, { enabled: () => Boolean(assetTeamTarget.value) })
const assetSearch = ref('')
const assetTab = ref('all')
const assetFilter = ref('all')
const filterMenuOpen = ref(false)
const libraryGrid = ref(false)
const modeAssetLimit = ref(12)
const libraryAssetLimit = ref(30)
const newMenuOpen = ref(false)
const assetTabs = [{ label: '全部', value: 'all' }, { label: '生成作品', value: 'generated' }, { label: '图片', value: 'image' }, { label: '视频', value: 'video' }, { label: '参考图', value: 'reference' }, { label: '商品素材', value: 'product-pack' }, { label: '文件', value: 'text' }]
const imageInspirations = ref<Inspiration[]>([])
const imageTools = ref<ImageTool[]>(mergeImageTools([]) as ImageTool[])
const selectedImageToolId = ref('')
const videoInspirations = ref<Inspiration[]>([])
const commerceInspirations = ref<Inspiration[]>([])
const inspirationErrors = reactive<Record<'IMAGE' | 'VIDEO' | 'COMMERCE', string>>({ IMAGE: '', VIDEO: '', COMMERCE: '' })
const inspirationLoading = reactive<Record<'IMAGE' | 'VIDEO' | 'COMMERCE', boolean>>({ IMAGE: false, VIDEO: false, COMMERCE: false })
const selectedInspirationId = ref('')
const inspirationPreview = ref<Inspiration | null>(null)
const assetFilters = [{ label: '全部来源', value: 'all' }, { label: 'AI 生成', value: 'generated' }, { label: '本地上传', value: 'uploaded' }]
const modes: StudioMode[] = ['chat', 'images', 'videos', 'commerce', 'projects', 'assets']
const routeModeMap: Record<string, StudioMode> = { chat: 'chat', images: 'images', image: 'images', videos: 'videos', video: 'videos', commerce: 'commerce', projects: 'projects', assets: 'assets', files: 'assets' }

const activeMode = computed<StudioMode>(() => {
  if (route.name === 'workspace') return route.query.tab === 'files' ? 'assets' : 'projects'
  const raw = String(route.params.mode || route.name || 'chat')
  if (routeModeMap[raw]) return routeModeMap[raw]
  return modes.includes(raw as StudioMode) ? raw as StudioMode : 'chat'
})
const { fileAccept, uploading, setFileInput, openFilePicker, handleFiles, uploadFilesForPurpose } = useStudioFileUpload({
  activeMode,
  chatAttachments: attachments,
  creationAttachments,
  maskAttachment,
  firstFrameAttachment,
  lastFrameAttachment,
}, {
  requireAuth,
  currentProjectId: () => store.currentProjectId,
  uploadFiles: (...args) => store.uploadFiles(...args),
  closeComposerPopovers: () => chatComposer.value?.closePopovers(),
  closeNewMenu: () => { newMenuOpen.value = false },
  clearError: store.clearError,
  setError: (message) => { store.lastError = message },
})
// 聊天输入区拖放/粘贴共用的附件入口：与「+」面板选文件走同一上传通道
const uploadChatFiles = (files: File[]) => uploadFilesForPurpose(files, 'chat-file')
const chatMessages = computed(() => hasChatThread.value ? store.messages.filter((message) => message.id !== 'welcome') : store.messages)
const {
  messageJumps,
  messageNavigatorOpen,
  activeMessageJumpId,
  jumpHighlightId,
  compactMessageJump,
  openMessageNavigator,
  scheduleMessageNavigatorClose,
  closeMessageNavigatorOnBlur,
  syncMessageNavigator,
  jumpToMessage,
  scrollThreadToBottom,
  stickThreadToBottom,
  resumeFollowing,
  threadFollowing,
  streamUnread,
  showBackToBottom,
} = useChatMessageNavigator({
  messages: chatMessages,
  thread,
  conversationId: () => store.currentConversationId,
})
useChatConversationLifecycle({
  activeMode,
  model,
  catalogModels,
  assistantId,
  assistants,
  currentConversationId: () => store.currentConversationId,
  openingConversationId: () => store.openingConversationId,
  conversations: () => store.conversations,
  generations: () => store.generations,
  messages: () => store.messages,
  isGenerating: () => store.isGenerating,
  clearArtifact: () => { activeArtifact.value = null },
  scrollThreadToBottom,
  stickThreadToBottom,
  isThreadFollowing: () => threadFollowing.value,
})
const activeInspirations = computed(() => activeMode.value === 'commerce' ? commerceInspirations.value : activeMode.value === 'videos' ? videoInspirations.value : imageInspirations.value)
const activeInspirationMode = computed<'IMAGE' | 'VIDEO' | 'COMMERCE'>(() => activeMode.value === 'commerce' ? 'COMMERCE' : activeMode.value === 'videos' ? 'VIDEO' : 'IMAGE')
const activeInspirationError = computed(() => inspirationErrors[activeInspirationMode.value])
const activeInspirationLoading = computed(() => inspirationLoading[activeInspirationMode.value])
const selectedImageTool = computed(() => activeMode.value === 'images' ? imageTools.value.find((tool) => tool.id === selectedImageToolId.value) || null : null)
const hasCreationInput = computed(() => Boolean(generationPrompt.value.trim()) || Boolean(selectedImageTool.value && creationAttachments.value.length))
const canSubmitCreation = computed(() => hasCreationInput.value && activeCreationModelAvailable.value)
const creationPromptPlaceholder = computed(() => selectedImageTool.value?.options?.placeholder || (activeMode.value === 'images' ? '描述你想要的图片' : activeMode.value === 'videos' ? '描述你的想法，或添加2⁠张图片作为首尾帧，生成视频' : '描述你想制作的商品素材包或详情页'))
const modeAssets = computed(() => store.recentAssets.filter((asset) => asset.source === 'generated' && (activeMode.value === 'images' ? asset.kind === 'image' : activeMode.value === 'videos' ? asset.kind === 'video' : asset.kind === 'product-pack')))
const visibleModeAssets = computed(() => modeAssets.value.slice(0, modeAssetLimit.value))
const commerceRuns = computed(() => {
  const runs = [...store.commerceRuns]
  if (store.activeGeneration?.mode === 'commerce' && !runs.some((run) => run.id === store.activeGeneration?.id)) runs.unshift(store.activeGeneration)
  return runs.sort((left, right) => right.createdAt - left.createdAt)
})
const pendingVideoRuns = computed(() => {
  const runs = [...store.videoRuns]
  if (store.activeGeneration?.mode === 'videos' && !runs.some((run) => run.id === store.activeGeneration?.id)) runs.unshift(store.activeGeneration)
  return runs
    .filter((run) => isGenerationActive(run.status))
    .sort((left, right) => right.createdAt - left.createdAt)
})
const filteredAssets = computed(() => store.recentAssets.filter((asset) => {
  const matchesTab = assetTab.value === 'all' || (assetTab.value === 'generated' ? asset.purpose === 'generated' : assetTab.value === 'reference' ? asset.purpose === 'reference' || asset.purpose === 'mask' : asset.kind === assetTab.value)
  const matchesSource = assetFilter.value === 'all' || (assetFilter.value === 'uploaded' ? asset.source === 'upload' : asset.source === 'generated')
  const matchesSearch = `${asset.title} ${asset.prompt}`.toLowerCase().includes(assetSearch.value.trim().toLowerCase())
  return matchesTab && matchesSource && matchesSearch
}))
const visibleLibraryAssets = computed(() => filteredAssets.value.slice(0, libraryAssetLimit.value))
const imageRatios = ['自动', '9:16', '2:3', '3:4', '1:1', '4:3', '3:2', '16:9']
const imageStyles = ['人像摄影', '电影写真', '中国风', '动漫', '3D渲染', '赛博朋克', 'CG 动画', '水墨画', '油画', '古典', '水彩画', '卡通', '儿童绘画', '抽象', '锐笔插画', '二次元', '油墨印刷', '版画', '莫奈', '毕加索', '伦勃朗', '马蒂斯', '巴洛克', '复古动漫', '绘本']
const styleThumbnails = ['/assets/inspiration-1.jpg', '/assets/inspiration-2.jpg', '/assets/inspiration-3.jpg', '/assets/inspiration-4.jpg', '/assets/inspirations/video/fashion-stage.jpg', '/assets/inspirations/video/sci-fi-iris.jpg', '/assets/inspirations/video/urban-transit.jpg', '/assets/inspirations/video/artisan-pottery.jpg', '/assets/inspirations/video/culinary-detail.jpg', '/assets/inspirations/video/epic-coast.jpg', '/assets/inspirations/video/liminal-corridor.jpg', '/assets/inspirations/video/mountain-road.jpg', '/assets/inspirations/video/urban-geometry.jpg']
const creationMenuTitle = computed(() => ({ model: activeMode.value === 'videos' ? '视频模型' : activeMode.value === 'commerce' ? '商品视觉模型' : '图片模型', type: '商品类型', size: '比例', style: '风格', resolution: '视频分辨率', duration: '视频时长', aspect: '画面比例', platform: '目标平台', quality: '图片质量', modules: '详情模块', count: '生成张数', format: '输出格式', background: '图片背景', videoSettings: '视频设置' }[creationMenu.value || 'model']))
const creationMenuOptions = computed(() => {
  if (creationMenu.value === 'model') {
    return activeCreationModels.value.map((item) => item.key)
  }
  if (creationMenu.value === 'type') return ['详情页', '素材包']
  if (creationMenu.value === 'size') return imageRatios
  if (creationMenu.value === 'style') return imageStyles
  if (creationMenu.value === 'resolution') return activeVideoCapabilities.value.resolutions
  if (creationMenu.value === 'duration') return activeVideoCapabilities.value.durations.map((item) => `${item} 秒`)
  if (creationMenu.value === 'aspect') return activeVideoCapabilities.value.aspectRatios
  if (creationMenu.value === 'platform') return ['自动', '淘宝/天猫', '京东', '拼多多', '抖音电商', '小红书', 'Amazon', 'TikTok Shop', 'Shopee']
  if (creationMenu.value === 'quality') return activeImageCapabilities.value.qualities.map(qualityLabel)
  if (creationMenu.value === 'modules') return ['6 个模块', '8 个模块', '10 个模块', '12 个模块']
  if (creationMenu.value === 'count') return Array.from({ length: activeImageCapabilities.value.maxCount }, (_, index) => `${index + 1} 张`)
  if (creationMenu.value === 'format') return (activeMode.value === 'commerce' ? ['png', 'jpeg', 'webp'] : activeImageCapabilities.value.outputFormats).map(outputFormatLabel)
  if (creationMenu.value === 'background') return activeMode.value === 'commerce' ? ['自动背景', '透明背景', '不透明背景'] : activeImageCapabilities.value.backgrounds.map(backgroundLabel)
  return []
})
function creationOptionLabel(option: string) {
  return creationMenu.value === 'model' ? catalogModelLabel(catalogModels.value, option, activeCreationCapability.value) : option
}
function creationOptionPrice(option: string) {
  if (creationMenu.value === 'size') {
    const size = imageSizeForRatio(option)
    const tier = imageSizeLabel(size).split(' ')[0]
    const base = selectedImageModel.value?.effectiveCreditCost ?? selectedImageModel.value?.flatCreditCost ?? 1
    return (activeImageCapabilities.value.resolutionPricing?.[tier] ?? base * (tier === '4K' ? 4 : tier === '2K' ? 2 : 1)) * imageCount.value
  }
  if (creationMenu.value === 'resolution') {
    const base = selectedVideoModel.value?.effectiveCreditCost ?? selectedVideoModel.value?.flatCreditCost ?? 10
    return activeVideoCapabilities.value.pricing[`${option}:${videoDuration.value}`] ?? base * (option === '2160p' ? 4 : option === '1080p' ? 2 : 1) * Math.max(1, Math.ceil(videoDuration.value / 5))
  }
  if (creationMenu.value === 'duration') {
    const duration = Number.parseInt(option, 10)
    const base = selectedVideoModel.value?.effectiveCreditCost ?? selectedVideoModel.value?.flatCreditCost ?? 10
    return activeVideoCapabilities.value.pricing[`${videoResolution.value}:${duration}`] ?? base * (videoResolution.value === '2160p' ? 4 : videoResolution.value === '1080p' ? 2 : 1) * Math.max(1, Math.ceil(duration / 5))
  }
  return 0
}

function ratioShapeClass(option: string) { return `is-${option === '自动' ? 'auto' : option.replace(':', '-')}` }
function selectVideoSetting(section: 'aspect' | 'resolution' | 'duration', value: string) {
  if (section === 'aspect') videoAspectRatio.value = value
  else if (section === 'resolution') videoResolution.value = value
  else videoDuration.value = Number.parseInt(value, 10)
}
function styleThumbnail(option: string) { return styleThumbnails[Math.max(0, imageStyles.indexOf(option)) % styleThumbnails.length] }
function outputFormatLabel(value: string): typeof outputFormat.value { return value.toLowerCase() === 'jpeg' || value.toLowerCase() === 'jpg' ? 'JPEG' : value.toLowerCase() === 'webp' ? 'WebP' : 'PNG' }

watchEffect(() => store.setMode(activeMode.value))
watch(activeMode, async (mode) => { closeCreationMenu(); creationOptionsOpen.value = false; creationPluginOpen.value = false; selectedInspirationId.value = ''; inspirationPreview.value = null; modeAssetLimit.value = 12; store.clearError(); if (mode === 'chat' && auth.isAuthenticated) void store.resumeCurrentChat(); if (mode === 'images' && !imageInspirations.value.length) await loadInspirations('IMAGE'); if ((mode === 'images' || mode === 'videos') && !imageTools.value.length) await loadImageTools(); if (mode === 'videos' && !videoInspirations.value.length) await loadInspirations('VIDEO'); if (mode === 'commerce' && !commerceInspirations.value.length) await loadInspirations('COMMERCE'); await nextTick(); syncInspirationNavigation() })
watch([assetSearch, assetTab, assetFilter], () => { libraryAssetLimit.value = 30 })
watch(() => route.query.conversation, () => { void syncConversationRoute() })
watch(() => route.query.generation, () => { void syncGenerationRoute() })
watch([activeMode, () => route.query.prompt], () => { void syncTransferredPrompt() })
watch(generationPrompt, () => { void nextTick().then(resizeGenerationInput) })

let promptTransferSequence = 0
async function syncTransferredPrompt() {
  const sequence = ++promptTransferSequence
  const transferType = activeMode.value === 'images' ? 'IMAGE' : activeMode.value === 'videos' ? 'VIDEO' : activeMode.value === 'commerce' ? 'COMMERCE' : activeMode.value === 'chat' ? 'TEXT' : null
  if (!transferType) return

  const promptId = typeof route.query.prompt === 'string' ? route.query.prompt : ''
  const statePrompt = window.history.state?.promptTransfer as PendingCreationPrompt | undefined
  let pendingPrompt: PendingCreationPrompt | null = null
  if (promptId) {
    try {
      const item = await api<{ promptType: 'IMAGE' | 'VIDEO' | 'TEXT'; prompt: string; title: string; sourceName: string }>(`/prompt-library/items/${encodeURIComponent(promptId)}`)
      if (item.promptType === transferType) pendingPrompt = { type: item.promptType, prompt: item.prompt, title: item.title, sourceName: item.sourceName }
    } catch { /* A removed prompt should not block opening the workspace. */ }
  }
  if (sequence !== promptTransferSequence) return
  if (!pendingPrompt) pendingPrompt = statePrompt?.type === transferType ? statePrompt : consumeCreationPrompt(transferType)
  if (pendingPrompt) {
    consumeCreationPrompt(transferType)
    if (transferType === 'TEXT') draft.value = pendingPrompt.prompt
    else generationPrompt.value = pendingPrompt.prompt
  }
  if (statePrompt?.type === transferType) {
    const nextState = { ...window.history.state }
    delete nextState.promptTransfer
    window.history.replaceState(nextState, '')
  }
  if (promptId) {
    const { prompt: _prompt, ...query } = route.query
    await router.replace({ query })
  }
  await nextTick()
  if (transferType === 'TEXT') {
    resizeComposer()
    // 只有真正带入了提示词才自动聚焦：裸进 /chat 抢焦点会让首页输入框常显聚焦态（还会弹起移动端键盘）
    if (pendingPrompt) composerInput.value?.focus({ preventScroll: true })
  }
  else {
    resizeGenerationInput()
    if (pendingPrompt) generationInput.value?.focus({ preventScroll: true })
  }
}

onMounted(async () => {
  document.addEventListener('xinyue:close-popovers', closeWorkspacePopovers)
  await syncTransferredPrompt()
  const inspirationLoad = activeMode.value === 'images' ? Promise.all([loadInspirations('IMAGE'), loadImageTools()]) : activeMode.value === 'videos' ? Promise.all([loadInspirations('VIDEO'), loadImageTools()]) : activeMode.value === 'commerce' ? loadInspirations('COMMERCE') : Promise.resolve()
  await Promise.all([catalog.load(), inspirationLoad, loadModelCatalog({ applyDefaults: true, force: true }), auth.isAuthenticated ? loadAssistants() : Promise.resolve()])
  if (auth.isAuthenticated) {
    await store.hydrateWorkspace().catch(() => undefined)
    if (activeMode.value === 'chat') void store.resumeCurrentChat()
  }
  await syncConversationRoute()
  await syncGenerationRoute()
  await nextTick()
  syncInspirationNavigation()
  window.addEventListener('resize', syncInspirationNavigation)
  window.addEventListener('resize', positionCreationMenu)
  window.addEventListener('scroll', positionCreationMenu, true)
  window.addEventListener('resize', positionCreationMorePanel)
  window.addEventListener('scroll', positionCreationMorePanel, true)
  window.addEventListener('resize', resizeGenerationInput)
  window.addEventListener('focus', refreshModelCatalogOnFocus)
  document.addEventListener('xinyue:model-catalog-changed', refreshModelCatalog)
  document.addEventListener('pointerdown', closeCreationMenuOnOutside)
  qianwenBannerTimer = window.setInterval(() => {
    if ((chatUiPreset.value === 'qianwen' || isJixingSkin.value) && !hasChatThread.value && qianwenBanners.value.length > 1) qianwenBannerIndex.value = (qianwenBannerIndex.value + 1) % qianwenBanners.value.length
  }, 5000)
})
onUnmounted(() => {
  document.removeEventListener('xinyue:close-popovers', closeWorkspacePopovers)
  speech.stop()
  window.removeEventListener('resize', syncInspirationNavigation)
  window.removeEventListener('resize', positionCreationMenu)
  window.removeEventListener('scroll', positionCreationMenu, true)
  window.removeEventListener('resize', positionCreationMorePanel)
  window.removeEventListener('scroll', positionCreationMorePanel, true)
  window.removeEventListener('resize', resizeGenerationInput)
  window.removeEventListener('focus', refreshModelCatalogOnFocus)
  document.removeEventListener('xinyue:model-catalog-changed', refreshModelCatalog)
  document.removeEventListener('pointerdown', closeCreationMenuOnOutside)
  window.clearInterval(qianwenBannerTimer)
})

async function loadAssistants() { try { assistants.value = await api<AssistantOption[]>('/assistants') } catch { assistants.value = [] } }

function closeWorkspacePopovers() {
  chatComposer.value?.closePopovers()
  assistantMenuOpen.value = false
  closeCreationMenu()
  creationOptionsOpen.value = false
  creationMorePanelStyle.value = { visibility: 'hidden' }
  creationPluginOpen.value = false
}
function collapseWorkspacePopovers() {
  closeWorkspacePopovers()
  document.dispatchEvent(new Event('xinyue:close-popovers'))
}

async function loadImageTools() {
  try { imageTools.value = mergeImageTools(await api<ImageTool[]>('/inspirations?mode=IMAGE_TOOL')) as ImageTool[] }
  catch { imageTools.value = mergeImageTools([]) as ImageTool[] }
}

function imageToolIcon(tool: ImageTool) {
  const type = tool.options?.toolType as ImageToolType | undefined
  return ({ BACKGROUND_REMOVAL: Eraser, INPAINT: Brush, OUTPAINT: Maximize2, UPSCALE: ScanSearch, CUSTOM: WandSparkles })[type || 'CUSTOM']
}

async function loadInspirations(mode: 'IMAGE' | 'VIDEO' | 'COMMERCE') {
  inspirationErrors[mode] = ''
  inspirationLoading[mode] = true
  try {
    const rows = await api<Inspiration[]>(`/inspirations?mode=${mode}`)
    if (mode === 'IMAGE') imageInspirations.value = rows
    else if (mode === 'VIDEO') videoInspirations.value = rows
    else commerceInspirations.value = rows
  } catch (reason) { inspirationErrors[mode] = reason instanceof Error ? reason.message : '灵感内容加载失败，请稍后重试' }
  finally { inspirationLoading[mode] = false }
}

function retryActiveInspirations() { void loadInspirations(activeInspirationMode.value) }

function openPromptLibrary(type?: 'IMAGE' | 'VIDEO' | 'TEXT') { void router.push(type ? { path: '/prompts', query: { type: type.toLowerCase() } } : '/prompts') }
function selectModel(value: string) { const key = catalogModelKey(chatModels.value, value, 'CHAT'); model.value = key; capabilityModelSelections.CHAT = key; if (auth.isAuthenticated) void store.setConversationModel(key).catch((reason) => { store.lastError = reason instanceof Error ? reason.message : '模型保存失败' }) }
function selectCapabilityModel(value: string) {
  const selection = catalogSelectionForValue(catalogModels.value, value, activeCapability.value)
  if (activeCapability.value !== 'AGENT') activeCapability.value = selection.capability
  const key = selection.key
  capabilityModelSelections[activeCapability.value] = key
  if (activeCapability.value === 'CHAT' || activeCapability.value === 'AGENT') selectModel(key)
  else if (activeCapability.value === 'IMAGE') { imageModel.value = key; syncImageSelection() }
  else if (activeCapability.value === 'VIDEO') { videoModel.value = key; syncVideoSelection() }
}
function resizeComposer() {
  resizeTextarea(composerInput.value, composerMaxHeight())
  const form = composerInput.value?.closest('.chat-composer')
  const host = form?.parentElement
  if (!form || !host) return
  const rect = form.getBoundingClientRect()
  const hostRect = host.getBoundingClientRect()
  host.style.setProperty('--composer-height', `${Math.round(rect.height)}px`)
  host.style.setProperty('--composer-top', `${Math.round(rect.top - hostRect.top - host.clientTop)}px`)
  host.style.setProperty('--composer-left', `${Math.round(rect.left - hostRect.left - host.clientLeft)}px`)
  host.style.setProperty('--composer-width', `${Math.round(rect.width)}px`)
  host.style.setProperty('--composer-space-above', `${Math.round(rect.top)}px`)
}
function resizeGenerationInput() {
  const viewportLimit = window.innerWidth <= 640
    ? Math.min(240, Math.floor(window.innerHeight * 0.36))
    : Math.min(320, Math.floor(window.innerHeight * 0.42))
  resizeTextarea(generationInput.value, viewportLimit, 38)
}
function toggleVoice(target: 'chat' | 'creation' = 'chat') {
  if (!speech.listening.value) voiceTarget.value = target
  speech.toggle()
}
async function useFollowUpSuggestion(value: string) {
  if (store.isGenerating) return
  draft.value = value
  await nextTick()
  resizeComposer()
  await submitMessage()
}
function openCodeArtifact(artifact: CodeArtifact) { activeArtifact.value = artifact }
function closeCreationMenu() {
  creationMenu.value = null
  creationMenuAnchor.value = null
  creationMenuAnchorRect.value = null
  creationMenuStyle.value = {}
}
function closeCreationMenuOnOutside(event: PointerEvent) {
  const target = event.target as Node
  const element = target as HTMLElement
  if (newMenuOpen.value && !element.closest?.('.index-page-header')) newMenuOpen.value = false
  if (filterMenuOpen.value && !element.closest?.('.library-view-controls')) filterMenuOpen.value = false
  if (creationComposer.value?.contains(target) || creationMorePanel.value?.contains(target) || creationOptionsMenu.value?.contains(target)) return
  closeCreationMenu()
  creationOptionsOpen.value = false
  creationMorePanelStyle.value = { visibility: 'hidden' }
}
async function toggleCreationMenu(menu: NonNullable<typeof creationMenu.value>, event: MouseEvent) {
  if (creationMenu.value === menu) { closeCreationMenu(); return }
  const anchor = event.currentTarget as HTMLElement
  const anchorRect = anchor.getBoundingClientRect()
  const openedFromMore = Boolean(anchor.closest('.creation-more-panel'))
  if (!openedFromMore) document.dispatchEvent(new Event('xinyue:close-popovers'))
  creationOptionsOpen.value = openedFromMore
  creationMenu.value = menu
  creationMenuAnchor.value = anchor
  creationMenuAnchorRect.value = { left: anchorRect.left, right: anchorRect.right, top: anchorRect.top, bottom: anchorRect.bottom, width: anchorRect.width }
  creationMenuStyle.value = { visibility: 'hidden' }
  await nextTick()
  positionCreationMenu()
}
function toggleMoreOptions() {
  const shouldOpen = !creationOptionsOpen.value
  if (shouldOpen) document.dispatchEvent(new Event('xinyue:close-popovers'))
  creationOptionsOpen.value = shouldOpen
  if (shouldOpen) creationPluginOpen.value = false
  if (shouldOpen) { creationMorePanelStyle.value = { visibility: 'hidden' }; void nextTick(positionCreationMorePanel) }
  else creationMorePanelStyle.value = { visibility: 'hidden' }
}
function positionCreationMorePanel() {
  if (!creationOptionsOpen.value || !creationMoreTrigger.value || !creationMorePanel.value) return
  const anchor = creationMoreTrigger.value.getBoundingClientRect()
  const panel = creationMorePanel.value.getBoundingClientRect()
  const gap = 8
  const left = Math.min(window.innerWidth - panel.width - 12, Math.max(12, anchor.left + anchor.width / 2 - panel.width / 2))
  const roomBelow = window.innerHeight - anchor.bottom - gap
  const top = roomBelow >= panel.height ? anchor.bottom + gap : Math.max(12, anchor.top - panel.height - gap)
  creationMorePanelStyle.value = { left: `${left}px`, top: `${top}px`, visibility: 'visible' }
}
function positionCreationMenu() {
  const anchor = creationMenuAnchor.value
  const menu = creationOptionsMenu.value
  if (!anchor || !menu || !creationMenu.value) return
  const liveAnchorRect = anchor.isConnected ? anchor.getBoundingClientRect() : null
  const anchorRect = liveAnchorRect?.width ? liveAnchorRect : creationMenuAnchorRect.value
  if (!anchorRect) return
  const viewportInset = 12
  const gap = 8
  const desiredHeight = menu.scrollHeight
  const spaceAbove = Math.max(0, anchorRect.top - viewportInset - gap)
  const spaceBelow = Math.max(0, window.innerHeight - anchorRect.bottom - viewportInset - gap)
  const placeAbove = desiredHeight <= spaceAbove || spaceAbove > spaceBelow
  const availableHeight = placeAbove ? spaceAbove : spaceBelow
  const renderedHeight = Math.max(72, Math.min(desiredHeight, availableHeight || 72))
  const menuWidth = menu.getBoundingClientRect().width
  const maximumLeft = Math.max(viewportInset, window.innerWidth - menuWidth - viewportInset)
  const anchoredLeft = creationMenu.value === 'size'
    ? anchorRect.left + (anchorRect.width - menuWidth) / 2
    : anchorRect.left
  const left = Math.min(maximumLeft, Math.max(viewportInset, anchoredLeft))
  const top = placeAbove
    ? Math.max(viewportInset, anchorRect.top - renderedHeight - gap)
    : Math.min(window.innerHeight - renderedHeight - viewportInset, anchorRect.bottom + gap)
  creationMenuStyle.value = {
    bottom: 'auto',
    left: `${left}px`,
    maxHeight: desiredHeight <= availableHeight ? 'none' : `${renderedHeight}px`,
    right: 'auto',
    top: `${top}px`,
    visibility: 'visible',
  }
}
function isCreationOptionActive(option: string) {
  if (creationMenu.value === 'model') return activeCreationModel.value === option
  if (creationMenu.value === 'type') return creationType.value === option
  if (creationMenu.value === 'size') return autoMode.value === option
  if (creationMenu.value === 'platform') return commercePlatform.value === option
  if (creationMenu.value === 'resolution') return videoResolution.value === option
  if (creationMenu.value === 'duration') return `${videoDuration.value} 秒` === option
  if (creationMenu.value === 'aspect') return videoAspectRatio.value === option
  if (creationMenu.value === 'style') return imageStyle.value === option
  if (creationMenu.value === 'quality') return quality.value === option
  if (creationMenu.value === 'modules') return `${commerceModules.value} 个模块` === option
  if (creationMenu.value === 'count') return `${imageCount.value} 张` === option
  if (creationMenu.value === 'format') return outputFormat.value === option
  if (creationMenu.value === 'background') return imageBackground.value === option
  return false
}
function selectCreationOption(option: string) {
  if (creationMenu.value === 'model') { if (activeMode.value === 'videos') { videoModel.value = option; syncVideoSelection() } else if (activeMode.value === 'commerce') commerceModel.value = option; else { imageModel.value = option; syncImageSelection() } }
  else if (creationMenu.value === 'type') creationType.value = option
  else if (creationMenu.value === 'size') autoMode.value = option
  else if (creationMenu.value === 'platform') commercePlatform.value = option
  else if (creationMenu.value === 'resolution') videoResolution.value = option
  else if (creationMenu.value === 'duration') videoDuration.value = Number.parseInt(option, 10)
  else if (creationMenu.value === 'aspect') videoAspectRatio.value = option
  else if (creationMenu.value === 'style') imageStyle.value = imageStyle.value === option ? '' : option
  else if (creationMenu.value === 'quality') quality.value = option
  else if (creationMenu.value === 'modules') commerceModules.value = Number.parseInt(option, 10)
  else if (creationMenu.value === 'count') imageCount.value = Number.parseInt(option, 10)
  else if (creationMenu.value === 'format') {
    outputFormat.value = option as typeof outputFormat.value
    if (outputFormat.value === 'JPEG' && imageBackground.value === '透明背景') imageBackground.value = '不透明背景'
  } else if (creationMenu.value === 'background') {
    imageBackground.value = option as typeof imageBackground.value
    if (imageBackground.value === '透明背景' && outputFormat.value === 'JPEG') outputFormat.value = 'PNG'
  }
  closeCreationMenu()
  if (window.innerWidth <= 640) creationOptionsOpen.value = false
}
async function switchCreationMode(mode: 'images' | 'videos') {
  if (activeMode.value === mode) return
  closeCreationMenu()
  creationOptionsOpen.value = false
  store.clearError()
  if (mode === 'videos') selectedImageToolId.value = ''
  await router.push(mode === 'videos' ? '/video' : '/image')
  await nextTick()
  generationInput.value?.focus({ preventScroll: true })
}
async function submitGeneration() {
  if (!requireAuth(activeMode.value === 'commerce' ? '/commerce' : activeMode.value === 'videos' ? '/video' : '/image')) return
  const submittedMode = activeMode.value
  const prompt = generationPrompt.value.trim() || (selectedImageTool.value ? `使用${selectedImageTool.value.title}处理这张图片` : '')
  if (!prompt) return
  await loadModelCatalog({ force: true })
  if (!activeCreationModelAvailable.value) { store.lastError = activeCreationModelUnavailableMessage.value; return }
  if (selectedImageTool.value && !creationAttachments.value.length) { store.lastError = '请先上传一张需要处理的参考图片'; openFilePicker('creation'); return }
  try {
    const job = await store.startGeneration({ mode: activeMode.value, prompt, model: activeCreationModel.value, ratio: imageSizeForRatio(autoMode.value), quality: providerQuality(quality.value), style: activeMode.value === 'images' && imageStyle.value ? imageStyle.value : undefined, count: activeMode.value === 'images' ? imageCount.value : 1, modules: commerceModules.value, creationType: creationType.value, platform: activeMode.value === 'commerce' ? commercePlatform.value : undefined, referenceAssetIds: creationAttachments.value.map((asset) => asset.id), maskAssetId: maskAttachment.value?.id, firstFrameAssetId: activeMode.value === 'videos' ? firstFrameAttachment.value?.id : undefined, lastFrameAssetId: activeMode.value === 'videos' ? lastFrameAttachment.value?.id : undefined, outputFormat: providerOutputFormat(outputFormat.value), background: providerBackground(imageBackground.value), outputCompression: outputFormat.value === 'PNG' ? undefined : 90, resolution: videoResolution.value, duration: videoDuration.value, aspectRatio: videoAspectRatio.value === '自动' ? undefined : videoAspectRatio.value, creditCost: currentGenerationCost.value, pluginId: creationPluginId.value || undefined, creationToolId: isDedicatedImageTool(selectedImageTool.value) ? selectedImageTool.value!.id : undefined }, undefined, false, activeCreationModel.value)
    generationPrompt.value = ''; creationAttachments.value = []; maskAttachment.value = null; firstFrameAttachment.value = null; lastFrameAttachment.value = null; selectedImageToolId.value = ''
    if (submittedMode === 'commerce') return
    await openGenerationConversation(job.id)
  } catch { /* Store exposes the server error in-page. */ }
}

async function selectImageTool(tool: ImageTool) {
  if (activeMode.value === 'videos') {
    await switchCreationMode('images')
    await nextTick()
  }
  selectedImageToolId.value = selectedImageToolId.value === tool.id ? '' : tool.id
  closeWorkspacePopovers()
  if (!selectedImageToolId.value) return
  store.clearError()
  generationPrompt.value = tool.prompt
  if (!creationAttachments.value.length) openFilePicker('creation')
  else void nextTick(() => generationInput.value?.focus({ preventScroll: true }))
}

function previewFrameAsset(asset: StudioAsset) {
  previewAsset.value = asset
}

async function retryVideoGeneration(generation: GenerationRun) {
  const job = await store.retryGeneration(generation.id).catch((reason) => { store.lastError = reason instanceof Error ? reason.message : '重新生成失败'; return null })
  if (!job) return
  await openGenerationConversation(job.id, true)
}

async function openGenerationConversation(jobId: string, replace = false) {
  const conversationId = store.currentConversationId
  const target = { path: '/chat', query: { ...(conversationId ? { conversation: conversationId } : {}), generation: jobId } }
  if (replace) await router.replace(target)
  else await router.push(target)
  await nextTick()
  await scrollThreadToBottom()
}

async function syncConversationRoute() {
  if (!auth.isAuthenticated || activeMode.value !== 'chat') return
  const conversationId = typeof route.query.conversation === 'string' ? route.query.conversation : ''
  if (!conversationId || store.currentConversationId === conversationId || store.openingConversationId === conversationId) return
  await store.openConversation(conversationId).catch((reason) => { store.lastError = reason instanceof Error ? reason.message : '对话加载失败' })
  if (store.currentConversationId === conversationId) void store.resumeCurrentChat()
  await scrollThreadToBottom()
}

async function syncGenerationRoute() {
  if (!auth.isAuthenticated || activeMode.value !== 'chat') return
  const conversationId = typeof route.query.conversation === 'string' ? route.query.conversation : ''
  if (conversationId) return
  const jobId = typeof route.query.generation === 'string' ? route.query.generation : ''
  if (!jobId || store.activeGeneration?.id === jobId) return
  await store.loadGeneration(jobId).catch((reason) => { store.lastError = reason instanceof Error ? reason.message : '生成任务加载失败' })
  await scrollThreadToBottom()
}

async function retryImageGeneration(generation?: GenerationRun) {
  const job = await store.retryGeneration(generation?.id).catch((reason) => { store.lastError = reason instanceof Error ? reason.message : '重新生成失败'; return null })
  if (!job) return
  await openGenerationConversation(job.id, true)
}

async function retryAssetGeneration(asset: StudioAsset) {
  if (!asset.jobId) return
  try {
    await store.loadGeneration(asset.jobId)
    const job = await store.retryGeneration(asset.jobId)
    if (!job) return
    await openGenerationConversation(job.id)
  } catch (reason) {
    store.lastError = reason instanceof Error ? reason.message : '重新生成失败'
  }
}

async function stopGeneration(generation: GenerationRun) {
  if (!isGenerationActive(generation.status)) return
  await store.cancelGeneration(generation.id)
}

async function downloadGeneratedAsset(asset: StudioAsset) {
  if (!asset.contentUrl) return
  try {
    const response = await fetch(asset.contentUrl, { credentials: 'include' })
    if (!response.ok) throw new Error(`文件下载失败 (${response.status})`)
    const blob = await response.blob()
    const objectUrl = URL.createObjectURL(blob)
    const link = document.createElement('a')
    const extension = blob.type.split('/')[1]?.replace('jpeg', 'jpg') || 'png'
    const rawName = asset.title || `generated-${asset.id.slice(-8)}`
    link.href = objectUrl
    link.download = /\.[a-z0-9]{2,5}$/i.test(rawName) ? rawName : `${rawName}.${extension}`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(objectUrl)
  } catch (reason) {
    store.lastError = reason instanceof Error ? reason.message : '文件下载失败'
  }
}

async function useGeneratedAssetAsReference(asset: StudioAsset, generation?: GenerationRun) {
  creationAttachments.value = [asset]
  generationPrompt.value = generation?.prompt || store.activeGeneration?.prompt || ''
  const options: Record<string, unknown> = asset.options || (generation ? { size: generation.request.ratio, quality: generation.request.quality, count: generation.request.count, outputFormat: generation.request.outputFormat, background: generation.request.background } : {})
  if (typeof options.size === 'string') autoMode.value = imageRatioForSize(options.size)
  if (typeof options.quality === 'string') quality.value = qualityLabel(options.quality)
  if (typeof options.style === 'string') imageStyle.value = options.style
  if (typeof options.outputFormat === 'string') outputFormat.value = options.outputFormat.toLowerCase() === 'jpeg' ? 'JPEG' : options.outputFormat.toLowerCase() === 'webp' ? 'WebP' : 'PNG'
  if (typeof options.background === 'string') imageBackground.value = backgroundLabel(options.background)
  if (typeof options.count === 'number') imageCount.value = Math.min(activeImageCapabilities.value.maxCount, Math.max(1, options.count))
  await router.push('/image')
  await nextTick()
  generationInput.value?.focus({ preventScroll: true })
}

function publishGenerationAsWork(asset: StudioAsset, generation?: GenerationRun) {
  if (!requireAuth('/works?view=mine')) return
  const title = (generation?.prompt || asset.prompt || asset.title || '').replace(/\s+/g, ' ').trim().slice(0, 80)
  void router.push({ path: '/works', query: { view: 'mine', asset: asset.id, ...(title ? { title } : {}) } })
}

async function openGenerationOnCanvas(asset: StudioAsset, generation?: GenerationRun) {
  if (openingCanvas.value || !requireAuth('/canvases')) return
  const assets = (generation?.assets?.length ? generation.assets : [asset]).filter((item) => item.contentUrl)
  if (!assets.length) {
    store.lastError = '这张图还没有可编辑的文件'
    return
  }
  const prompt = generation?.prompt || asset.prompt || ''
  openingCanvas.value = true
  try {
    const created = await api<CanvasRecord>('/canvases', {
      method: 'POST',
      body: JSON.stringify({
        title: (prompt || asset.title || '生成图片').replace(/\s+/g, ' ').trim().slice(0, 40),
        kind: 'FREEFORM',
        document: canvasDocumentFromStudioAssets(assets, prompt),
      }),
    })
    await router.push(`/canvas/${created.id}`)
  } catch (reason) {
    store.lastError = reason instanceof Error ? reason.message : '打开画布失败'
  } finally {
    openingCanvas.value = false
  }
}

async function useAssetPrompt(asset: StudioAsset) {
  generationPrompt.value = asset.prompt || ''
  if (asset.kind === 'video') {
    const options = asset.options || {}
    if (typeof options.resolution === 'string' && activeVideoCapabilities.value.resolutions.includes(options.resolution)) videoResolution.value = options.resolution
    if (typeof options.duration === 'number' && activeVideoCapabilities.value.durations.includes(options.duration)) videoDuration.value = options.duration
    if (typeof options.aspectRatio === 'string' && activeVideoCapabilities.value.aspectRatios.includes(options.aspectRatio)) videoAspectRatio.value = options.aspectRatio
  }
  await router.push(asset.kind === 'video' ? '/video' : '/image')
  await nextTick()
  generationInput.value?.focus({ preventScroll: true })
}
async function deletePreviewAsset() {
  const assetId = previewAsset.value?.id
  if (!assetId) return
  await deleteAsset(assetId)
}
async function useCommerceAsset(asset: StudioAsset | undefined, generation: GenerationRun) {
  if (!asset) return
  selectedCommerceRun.value = null
  creationAttachments.value = [asset]
  generationPrompt.value = generation.prompt
  creationType.value = generation.request.creationType || '详情页'
  await nextTick()
  creationComposer.value?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  generationInput.value?.focus({ preventScroll: true })
}
function syncInspirationNavigation() { creationPanel.value?.syncInspirationNavigation() }
function openInspiration(item: Inspiration) {
  selectedInspirationId.value = item.id
  inspirationPreview.value = item
}
function playInspirationVideo(event: Event) { void (event.currentTarget as HTMLVideoElement).play().catch(() => undefined) }
function pauseInspirationVideo(event: Event) { const video = event.currentTarget as HTMLVideoElement; video.pause(); video.currentTime = 0 }
async function useInspiration(item: Inspiration | null) {
  if (!item) return
  selectedInspirationId.value = item.id
  inspirationPreview.value = null
  generationPrompt.value = item.prompt
  if (item.model) {
    if (activeMode.value === 'videos') videoModel.value = catalogModelKey(catalogModels.value, item.model, 'VIDEO')
    else imageModel.value = catalogModelKey(catalogModels.value, item.model, 'IMAGE')
  }
  const options = item.options || {}
  if (activeMode.value === 'videos') {
    if (typeof options.resolution === 'string' && activeVideoCapabilities.value.resolutions.includes(options.resolution)) videoResolution.value = options.resolution
    if (typeof options.duration === 'number' && activeVideoCapabilities.value.durations.includes(options.duration)) videoDuration.value = options.duration
    if (typeof options.aspectRatio === 'string' && activeVideoCapabilities.value.aspectRatios.includes(options.aspectRatio)) videoAspectRatio.value = options.aspectRatio
  } else if (activeMode.value === 'commerce' && typeof options.platform === 'string') autoMode.value = options.platform
  else if (typeof options.ratio === 'string') autoMode.value = imageRatioForSize(options.ratio)
  if (typeof options.quality === 'string') quality.value = qualityLabel(options.quality)
  if (typeof options.outputFormat === 'string') outputFormat.value = options.outputFormat.toLowerCase() === 'jpeg' ? 'JPEG' : options.outputFormat.toLowerCase() === 'webp' ? 'WebP' : 'PNG'
  if (typeof options.background === 'string') imageBackground.value = backgroundLabel(options.background)
  if (typeof options.count === 'number') imageCount.value = Math.min(10, Math.max(1, options.count))
  if (typeof options.modules === 'number') commerceModules.value = options.modules
  if (typeof options.creationType === 'string') creationType.value = options.creationType
  await nextTick()
  creationComposer.value?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  generationInput.value?.focus({ preventScroll: true })
}
async function deleteAsset(assetId: string) { try { await store.deleteAsset(assetId) } catch (reason) { store.lastError = reason instanceof Error ? reason.message : '文件删除失败' } }
function requireAuth(redirect: string) { if (auth.isAuthenticated) return true; void router.push(`/login?redirect=${encodeURIComponent(redirect)}`); return false }
function imageRatioForSize(value: string) {
  if (imageRatios.includes(value)) return value
  const normalized = value.replace('×', 'x')
  const match = normalized.match(/(\d{1,4})x(\d{1,4})/)
  if (!match) return '自动'
  const ratio = Number(match[1]) / Number(match[2])
  return imageRatios.slice(1).sort((left, right) => {
    const [leftWidth, leftHeight] = left.split(':').map(Number)
    const [rightWidth, rightHeight] = right.split(':').map(Number)
    return Math.abs(leftWidth / leftHeight - ratio) - Math.abs(rightWidth / rightHeight - ratio)
  })[0] || '自动'
}
function imageSizeForRatio(ratio: string) {
  const sizes = activeImageCapabilities.value.sizes
  if (!sizes.length || ratio === '自动') return activeImageCapabilities.value.defaultSize
  const [targetWidth, targetHeight] = ratio.split(':').map(Number)
  if (!targetWidth || !targetHeight) return providerSize(ratio)
  const targetRatio = targetWidth / targetHeight
  return [...sizes].sort((left, right) => {
    const [leftWidth, leftHeight] = left.split('x').map(Number)
    const [rightWidth, rightHeight] = right.split('x').map(Number)
    return Math.abs(leftWidth / leftHeight - targetRatio) - Math.abs(rightWidth / rightHeight - targetRatio)
  })[0] || activeImageCapabilities.value.defaultSize
}
function providerSize(value: string) { const match = value.match(/(\d{3,4})×(\d{3,4})/); return match ? `${match[1]}x${match[2]}` : '1024x1024' }
function providerQuality(value: string) { return value === '高' ? 'high' : value === '低' ? 'low' : 'medium' }
function providerOutputFormat(value: typeof outputFormat.value) { return value === 'JPEG' ? 'jpeg' : value === 'WebP' ? 'webp' : 'png' as const }
function providerBackground(value: typeof imageBackground.value) { return value === '透明背景' ? 'transparent' : value === '不透明背景' ? 'opaque' : 'auto' as const }
</script>
