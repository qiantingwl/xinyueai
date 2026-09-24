<template>
        <form ref="composerRoot" class="chat-composer" :class="{ 'chat-composer--jx': jxHomeMode }" @submit.prevent="submitMessage" @paste="handleComposerPaste">
          <div v-if="attachments.length" class="attachment-list" aria-label="待发送附件">
            <article v-for="(asset, index) in attachments" :key="asset.id" class="attachment-card" :class="hasImagePreview(asset) ? 'attachment-card--image' : 'attachment-card--file'">
              <img v-if="hasImagePreview(asset)" :src="asset.contentUrl" :alt="asset.title" />
              <div v-else class="attachment-file-copy">
                <span class="attachment-file-icon"><FileText :size="20" /></span>
                <span><strong :title="asset.title">{{ asset.title }}</strong><small>{{ attachmentMeta(asset) }}</small></span>
              </div>
              <button class="attachment-remove" type="button" :aria-label="`移除附件 ${asset.title}`" title="移除附件" @click="attachments.splice(index, 1)"><X :size="14" /></button>
            </article>
          </div>
          <template v-if="jxHomeMode">
            <button type="button" class="jx-composer__upload" aria-label="添加参考图或文件" title="添加参考图或文件" :class="{ 'is-open': attachmentOpen }" :disabled="uploading" @click="toggleAttachmentMenu"><Plus :size="22" /></button>
            <div class="jx-composer__body">
              <textarea ref="composerInput" v-model="draft" rows="3" aria-label="消息" :placeholder="chatComposerPlaceholder" @focus="collapseWorkspacePopovers" @input="resizeComposer" @keydown="handleComposerKeydown" />
            </div>
            <div class="jx-composer__toolbar">
                <nav ref="shortcutRail" class="chat-home-shortcuts chat-home-shortcuts--in-composer jx-composer__rail" :class="{ 'can-scroll-start': shortcutRailCanScrollStart, 'can-scroll-end': shortcutRailCanScrollEnd }" aria-label="快捷入口" @wheel="scrollShortcutRail" @scroll.passive="updateShortcutRailFade">
                  <button v-if="jxRailControls.modeEnabled" class="chat-home-mode-trigger" :class="{ 'is-open': chatModeMenuOpen }" type="button" :aria-expanded="chatModeMenuOpen" @click="toggleChatModeMenu"><component :is="activeChatModeIcon" :size="16" /><span>{{ activeChatMode }}</span><small v-if="activeChatMode === '快速'">新</small><ChevronDown :size="12" /></button>
                  <button v-if="jxRailControls.modelSelectorEnabled" ref="modelAnchor" class="chat-home-inline-model" :class="{ 'is-open': modelOpen }" type="button" :aria-expanded="modelOpen" :aria-label="`选择模型，当前为${activeCapabilityModelLabel}`" @click="toggleModelMenu"><ModelBadge v-if="activeCapabilityModelOption" :model="activeCapabilityModelOption" size="sm" /><span v-else aria-hidden="true">#</span><strong>{{ activeCapabilityModelLabel }}</strong><ChevronDown :size="12" /></button>
                  <button v-if="jxRailControls.webSearchEnabled" class="composer-web-search" :class="{ 'is-active': webSearchEnabled }" type="button" :aria-pressed="webSearchEnabled" :title="webSearchEnabled ? '关闭联网搜索' : '开启联网搜索'" @click="toggleWebSearch"><Globe2 :size="16" /><span>联网</span></button>
                  <button v-for="item in jxRailVisible" :key="item.id" type="button" @click="executeChatQuickAction(item)"><component :is="quickActionIcon(item.icon)" :size="16" /><span>{{ item.label }}</span></button>
                  <CapabilitySelector v-if="auth.isAuthenticated" v-model:assistant-id="assistantId" v-model:skill-id="chatPluginId" capability="CHAT" />
                  <button v-if="jxRailControls.moreEnabled && jxRailMore.length" class="chat-home-more-trigger" :class="{ 'is-open': chatMoreMenuOpen }" type="button" :aria-expanded="chatMoreMenuOpen" @click="toggleChatMoreMenu"><LayoutGrid :size="16" /><span>更多</span></button>
                </nav>
                <Teleport to="body">
                  <div v-if="modelOpen" ref="modelPopover" class="composer-popover model-popover model-popover--catalog model-popover--floating" :style="modelPopoverStyle">
                    <ModelCatalogPicker :models="capabilityModels" :model-value="activeCapabilityModel" title="选择模型" :capabilities="capabilityOptions.map(({ key, label }) => ({ key, label }))" :active-capability="activeCapability" @capability-change="selectCapabilityFromPicker" @select="handleSelectCapabilityModel" @close="modelOpen = false" />
                  </div>
                </Teleport>
                <button class="chat-composer-submit composer-send jx-composer__submit" :class="{ 'is-voice-entry': showChatVoiceEntry, 'is-listening': showChatVoiceEntry && voiceListening && voiceTarget === 'chat', 'is-generating': store.isGenerating }" :type="store.isGenerating || showChatVoiceEntry ? 'button' : 'submit'" :aria-label="store.isGenerating ? '停止生成' : showChatVoiceEntry ? (voiceListening && voiceTarget === 'chat' ? '停止语音输入' : '开始语音输入') : capabilityModelAvailable ? '生成' : '暂无可用模型'" :title="store.isGenerating ? '停止生成' : showChatVoiceEntry ? '语音输入' : capabilityModelAvailable ? '生成，Enter' : '暂无可用模型，请联系管理员或添加个人 API 密钥'" :disabled="!store.isGenerating && !showChatVoiceEntry && (!draft.trim() && !attachments.length || !capabilityModelAvailable)" @click="handleChatSubmitAction"><Square v-if="store.isGenerating" :size="14" fill="currentColor" /><AudioLines v-else-if="showChatVoiceEntry" :size="17" /><template v-else><Sparkles :size="15" /><span>生成</span></template></button>
            </div>
          </template>
          <template v-else>
          <button type="button" aria-label="添加文件等" title="添加文件等" :class="{ 'is-open': attachmentOpen }" :disabled="uploading" @click="toggleAttachmentMenu"><Plus :size="20" /></button>
          <textarea ref="composerInput" v-model="draft" rows="1" aria-label="消息" :placeholder="chatComposerPlaceholder" @focus="collapseWorkspacePopovers" @input="resizeComposer" @keydown="handleComposerKeydown" />
          <nav v-if="showChatComposerShortcutBar" ref="shortcutRail" class="chat-home-shortcuts chat-home-shortcuts--in-composer" :class="{ 'can-scroll-start': shortcutRailCanScrollStart, 'can-scroll-end': shortcutRailCanScrollEnd }" :aria-label="`${chatUiLabel}快捷入口`" @wheel="scrollShortcutRail" @scroll.passive="updateShortcutRailFade">
            <button v-if="chatComposerControls.modeEnabled" class="chat-home-mode-trigger" :class="{ 'is-open': chatModeMenuOpen }" type="button" :aria-expanded="chatModeMenuOpen" @click="toggleChatModeMenu"><component :is="activeChatModeIcon" :size="16" /><span>{{ activeChatMode }}</span><small v-if="chatUiPreset === 'doubao' && activeChatMode === '快速'">新</small><ChevronDown :size="12" /></button>
            <button v-if="['doubao', 'qianwen'].includes(chatUiPreset) && chatComposerControls.modelSelectorEnabled" ref="modelAnchor" class="chat-home-inline-model" :class="{ 'is-open': modelOpen }" type="button" :aria-expanded="modelOpen" :aria-label="`选择模型，当前为${activeCapabilityModelLabel}`" @click="toggleModelMenu"><ModelBadge v-if="activeCapabilityModelOption" :model="activeCapabilityModelOption" size="sm" /><span v-else aria-hidden="true">#</span><strong>{{ activeCapabilityModelLabel }}</strong><ChevronDown :size="12" /></button>
            <button v-if="chatComposerControls.webSearchEnabled" class="composer-web-search" :class="{ 'is-active': webSearchEnabled }" type="button" :aria-pressed="webSearchEnabled" :title="webSearchEnabled ? '关闭联网搜索' : '开启联网搜索'" @click="toggleWebSearch"><Globe2 :size="16" /><span>联网</span></button>
            <button v-for="item in visibleChatShortcuts" :key="item.id" type="button" @click="executeChatQuickAction(item)">
              <component :is="quickActionIcon(item.icon)" :size="16" /><span>{{ item.label }}</span>
            </button>
            <CapabilitySelector v-if="auth.isAuthenticated && ['doubao', 'qianwen'].includes(chatUiPreset)" v-model:assistant-id="assistantId" v-model:skill-id="chatPluginId" capability="CHAT" />
            <button v-if="chatComposerControls.moreEnabled && chatMoreShortcuts.length" class="chat-home-more-trigger" :class="{ 'is-open': chatMoreMenuOpen }" type="button" :aria-expanded="chatMoreMenuOpen" @click="toggleChatMoreMenu"><LayoutGrid :size="16" /><span>更多</span></button>
          </nav>
        <div v-if="!jxHomeMode && !hasChatThread && chatUiPreset === 'kimi' && chatComposerControls.modeEnabled" class="chat-kimi-modes" aria-label="回答模式"><button type="button" :class="{ 'is-active': activeChatMode === '快速' }" @click="activeChatMode = '快速'">快速</button><button type="button" :class="{ 'is-active': activeChatMode === '进阶' }" @click="activeChatMode = '进阶'">进阶</button></div>
          <CapabilitySelector v-if="auth.isAuthenticated && chatUiPreset !== 'kimi' && (!['doubao', 'qianwen'].includes(chatUiPreset) || !showChatComposerShortcutBar)" v-model:assistant-id="assistantId" v-model:skill-id="chatPluginId" capability="CHAT" />
          <button v-if="chatComposerControls.webSearchEnabled && chatUiPreset !== 'doubao' && (hasChatThread || chatUiPreset !== 'qianwen')" class="composer-web-search composer-web-search--standalone" :class="{ 'is-active': webSearchEnabled }" type="button" :aria-pressed="webSearchEnabled" :title="webSearchEnabled ? '关闭联网搜索' : '开启联网搜索'" @click="toggleWebSearch"><Globe2 :size="16" /><span>联网</span></button>
          <div v-if="chatComposerControls.modelSelectorEnabled" class="composer-control composer-model">
            <button v-if="!inlineModelShown" ref="modelAnchor" type="button" :aria-label="`选择模型，当前为${activeCapabilityModelLabel}`" :title="`模型：${activeCapabilityModelLabel}`" @click="toggleModelMenu">
              <ModelBadge v-if="activeCapabilityModelOption" :model="activeCapabilityModelOption" size="sm" /><span>{{ activeCapabilityModelLabel }}</span><ChevronDown :size="15" />
            </button>
            <Teleport to="body">
              <div v-if="modelOpen" ref="modelPopover" class="composer-popover model-popover model-popover--catalog model-popover--floating" :style="modelPopoverStyle">
                <ModelCatalogPicker :models="capabilityModels" :model-value="activeCapabilityModel" title="选择模型" :capabilities="capabilityOptions.map(({ key, label }) => ({ key, label }))" :active-capability="activeCapability" @capability-change="selectCapabilityFromPicker" @select="handleSelectCapabilityModel" @close="modelOpen = false" />
              </div>
            </Teleport>
          </div>
          <button class="chat-composer-submit composer-send" :class="{ 'is-voice-entry': showChatVoiceEntry, 'is-listening': showChatVoiceEntry && voiceListening && voiceTarget === 'chat', 'is-generating': store.isGenerating }" :type="store.isGenerating || showChatVoiceEntry ? 'button' : 'submit'" :aria-label="store.isGenerating ? '停止生成' : showChatVoiceEntry ? '开始语音输入' : capabilityModelAvailable ? '发送' : capabilityModelUnavailableMessage" :title="store.isGenerating ? '停止生成' : showChatVoiceEntry ? '开始语音输入' : capabilityModelAvailable ? '发送，Enter' : capabilityModelUnavailableMessage" :disabled="!store.isGenerating && !showChatVoiceEntry && (!draft.trim() && !attachments.length || !capabilityModelAvailable)" @click="handleChatSubmitAction"><Square v-if="store.isGenerating" :size="14" fill="currentColor" /><AudioLines v-else-if="showChatVoiceEntry" :size="18" /><ArrowUp v-else :size="20" /></button>
          </template>
          <Teleport to="body"><Transition name="composer-menu"><div v-if="chatModeMenuOpen" ref="chatModeMenuEl" class="chat-home-floating-menu chat-home-mode-menu" :class="`chat-ui--${chatUiPreset}`" role="menu" :style="chatModeMenuStyle"><button v-for="option in chatModeOptions" :key="option.label" type="button" role="menuitemradio" :aria-checked="activeChatMode === option.label" @click="selectChatMode(option.label)"><component :is="option.icon" :size="17" /><span><strong>{{ option.label }}</strong><small v-if="option.note">{{ option.note }}</small></span><em v-if="option.badge">{{ option.badge }}</em><Check v-if="activeChatMode === option.label" :size="15" /></button></div></Transition></Teleport>
          <Teleport to="body"><Transition name="composer-menu">
            <div v-if="chatMoreMenuOpen" ref="chatMoreMenuEl" class="chat-home-floating-menu chat-home-more-menu" :class="`chat-ui--${chatUiPreset}`" role="menu" :style="chatMoreMenuStyle">
              <button v-for="item in (jxHomeMode ? jxRailMore : chatMoreShortcuts)" :key="item.id" type="button" role="menuitem" @click="executeChatQuickAction(item)"><component :is="quickActionIcon(item.icon)" :size="17" /><span><strong>{{ item.label }}</strong></span></button>
            </div>
          </Transition></Teleport>
        </form>

        <!-- kimi 皮肤：输入框下方资源条对齐官网 = 选择项目 + 插件选择器；文件上传走输入框内"+"菜单 -->
        <div v-if="!store.temporaryChat && !jxHomeMode && !hasChatThread && chatUiPreset === 'kimi'" class="chat-kimi-resource-bar">
          <button type="button" @click="openConfiguredDestination(kimiProject.targetUrl)"><Folder :size="16" />{{ kimiProject.label }}<ChevronDown :size="14" class="chat-kimi-resource-caret" /></button>
          <CapabilitySelector v-if="auth.isAuthenticated" v-model:assistant-id="assistantId" v-model:skill-id="chatPluginId" capability="CHAT" icon-stack />
        </div>

        <nav v-if="!jxHomeMode && !hasChatThread && !showChatComposerShortcutBar && ['kimi', 'gpt'].includes(chatUiPreset) && (visibleChatShortcuts.length || (chatComposerControls.moreEnabled && chatMoreShortcuts.length))" class="chat-home-shortcuts" :aria-label="`${chatUiLabel}快捷入口`">
          <button v-for="item in visibleChatShortcuts" :key="item.id" type="button" @click="executeChatQuickAction(item)">
            <component :is="quickActionIcon(item.icon)" :size="16" /><span>{{ item.label }}</span>
          </button>
          <button v-if="chatComposerControls.moreEnabled && chatMoreShortcuts.length" class="chat-home-more-trigger" :class="{ 'is-open': chatMoreMenuOpen }" type="button" :aria-expanded="chatMoreMenuOpen" @click="toggleChatMoreMenu"><LayoutGrid :size="16" /><span>更多</span></button>
        </nav>
        <section v-if="!store.temporaryChat && !jxHomeMode && !hasChatThread && chatUiPreset === 'qianwen' && qianwenBanners.length" class="chat-home-qianwen-carousel" aria-label="推荐服务">
          <nav v-if="qianwenBanners.length > 1" aria-label="切换推荐服务"><button v-for="(_, index) in qianwenBanners" :key="index" type="button" :class="{ 'is-active': qianwenBannerIndex === index }" :aria-label="`查看第 ${index + 1} 项`" @click="qianwenBannerIndex = index" /></nav>
          <button class="chat-home-qianwen-banner" type="button" @click="openConfiguredDestination(activeQianwenBanner.targetUrl)">
            <span class="chat-home-qianwen-banner__visual" :style="activeQianwenBanner.imageUrl ? { backgroundImage: `url(${activeQianwenBanner.imageUrl})` } : undefined"><Presentation v-if="!activeQianwenBanner.imageUrl" :size="23" /></span><span><strong>{{ activeQianwenBanner.title }}</strong><small>{{ activeQianwenBanner.description }}</small></span><em>{{ activeQianwenBanner.buttonText }}</em>
          </button>
        </section>
        <Transition name="composer-menu">
          <div v-if="attachmentOpen" class="composer-attachment-panel" :class="{ 'is-library-panel': promptTemplatesOpen }">
            <section v-if="promptTemplatesOpen" class="prompt-template-picker" aria-label="提示词模板">
              <header><div class="prompt-template-heading"><span><FileText :size="17" /></span><div><strong>提示词模板</strong><small>{{ filteredPromptTemplates.length }} 个可用模板</small></div></div><button type="button" aria-label="关闭提示词模板" title="关闭" @click="promptTemplatesOpen = false; attachmentOpen = false"><X :size="16" /></button></header>
              <label class="prompt-template-search"><Search :size="15" /><input v-model.trim="promptTemplateQuery" placeholder="搜索模板" /></label>
              <nav v-if="promptTemplateCategories.length" class="prompt-template-categories" aria-label="模板分类"><button type="button" :class="{ 'is-active': !promptTemplateCategory }" @click="promptTemplateCategory = ''">全部</button><button v-for="item in promptTemplateCategories" :key="item" type="button" :class="{ 'is-active': promptTemplateCategory === item }" @click="promptTemplateCategory = item">{{ item }}</button></nav>
              <div class="prompt-template-list"><button v-for="item in filteredPromptTemplates" :key="item.id" type="button" class="prompt-template-option" @click="usePromptTemplate(item)"><span><strong>{{ item.title }}</strong><small>{{ item.description || item.prompt }}</small></span><span class="prompt-template-option-meta"><em>{{ item.category }}</em><ChevronRight :size="15" /></span></button><p v-if="!filteredPromptTemplates.length" class="prompt-template-empty"><FileText :size="22" /><strong>没有匹配的模板</strong></p></div>
            </section>
            <template v-else>
              <button type="button" @click="openFilePicker('chat-file')"><Paperclip :size="19" /><span><strong>添加照片和文件</strong></span></button>
              <button type="button" @click="attachmentOpen = false; router.push('/image')"><ImageIcon :size="20" /><span><strong>创建图片</strong><small>可视化呈现任何内容</small></span></button>
              <button type="button" @click="openPromptLibrary()"><LibraryBig :size="19" /><span><strong>提示词库</strong><small>浏览图片、视频和文字提示词</small></span></button>
              <button type="button" @click="togglePromptTemplates"><FileText :size="19" /><span><strong>提示词模板</strong><small>使用后台预设内容</small></span><LoaderCircle v-if="promptTemplatesLoading" class="admin-spin" :size="15" /></button>
            </template>
          </div>
        </Transition>

        <Teleport to="body">
          <div v-if="dragOverlayVisible" class="chat-drop-overlay" aria-hidden="true">
            <div class="chat-drop-overlay__frame"><Paperclip :size="30" /><strong>松开上传文件</strong><small>文件将作为附件添加到当前对话</small></div>
          </div>
        </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  ArrowUp, AudioLines, Check, ChevronDown, ChevronRight, FileText, Folder, Globe2, Image as ImageIcon, LayoutGrid, LibraryBig, LoaderCircle, MousePointer2, Paperclip, Plus, Presentation, ScanSearch, Search, Sparkles, Square, Video, WandSparkles, X, Zap,
} from 'lucide-vue-next'
import CapabilitySelector from '../CapabilitySelector.vue'
import { quickActionIcon } from '../../utils/quick-action-icons'
import ModelCatalogPicker from '../ModelCatalogPicker.vue'
import { useAuthStore } from '../../stores/auth'
import { useCatalogStore, type ChatQuickAction, type ChatUiPreset } from '../../stores/catalog'
import { useStudioStore } from '../../stores/studio'
import { api } from '../../services/api'
import { resolveCatalogModel, type CatalogModel } from '../../utils/model-catalog'
import ModelBadge from '../common/ModelBadge.vue'
import type { StudioAsset } from '../../types'
import { attachmentMeta, hasImagePreview } from '../creation/creation-shared'
import { composerMaxHeight, resizeTextarea } from '../../composables/useAutoResizeTextarea'

interface PromptTemplate {
  id: string
  title: string
  description: string
  prompt: string
  category: string
  variables: string[] | null
}

const props = defineProps<{
  capabilityModels: CatalogModel[]
  activeCapability: 'CHAT' | 'IMAGE' | 'VIDEO' | 'AGENT'
  activeCapabilityModel: string
  activeCapabilityModelLabel: string
  capabilityModelAvailable: boolean
  capabilityModelUnavailableMessage: string
  selectCapabilityModel: (value: string) => void
  hasChatThread: boolean
  chatUiPreset: ChatUiPreset
  uploading: boolean
  voiceListening: boolean
  voiceTarget: 'chat' | 'creation'
  submitMessage: () => void
  toggleVoice: (target?: 'chat' | 'creation') => void
  openFilePicker: (purpose: 'chat-file' | 'creation' | 'mask' | 'first-frame' | 'last-frame' | 'library') => void
  uploadChatFiles: (files: File[]) => void
  collapseWorkspacePopovers: () => void
  applyQuickActionModel: (item: ChatQuickAction) => Promise<boolean>
}>()
const emit = defineEmits<{ (e: 'load-models'): void }>()
const draft = defineModel<string>('draft', { required: true })
const attachments = defineModel<StudioAsset[]>('attachments', { required: true })
const activeChatMode = defineModel<string>('activeChatMode', { required: true })
const webSearchEnabled = defineModel<boolean>('webSearchEnabled', { required: true })
const assistantId = defineModel<string>('assistantId', { required: true })
const chatPluginId = defineModel<string>('chatPluginId', { required: true })
const qianwenBannerIndex = defineModel<number>('qianwenBannerIndex', { required: true })
const activeCapability = defineModel<'CHAT' | 'IMAGE' | 'VIDEO' | 'AGENT'>('activeCapability', { required: true })

const router = useRouter()
const store = useStudioStore()
const auth = useAuthStore()
const catalog = useCatalogStore()
function displayedCapabilityModel() {
  const capability = activeCapability.value === 'AGENT' ? 'CHAT' : activeCapability.value
  return resolveCatalogModel(props.capabilityModels, props.activeCapabilityModel, capability)
    || resolveCatalogModel(props.capabilityModels, props.activeCapabilityModelLabel, capability)
}
const activeCapabilityModelOption = computed(() => displayedCapabilityModel())
const capabilityOptions = [
  { key: 'CHAT' as const, label: '对话模型', icon: Sparkles },
  { key: 'IMAGE' as const, label: '图片模型', icon: ImageIcon },
  { key: 'VIDEO' as const, label: '视频模型', icon: Video },
  { key: 'AGENT' as const, label: 'Agent模型', icon: WandSparkles },
]
const chatUiPreset = computed<ChatUiPreset>(() => props.chatUiPreset)
// 季星 preset + 首页空白态：大卡片双列 composer（左上传占位 + 底部工具栏）
const jxHomeMode = computed(() => props.chatUiPreset === 'jixing' && !props.hasChatThread)
const chatUiLabel = computed(() => ({ gpt: 'GPT', doubao: '豆包', qianwen: '千问', kimi: 'Kimi', jixing: '季星' })[chatUiPreset.value])
const chatComposerPlaceholder = computed(() => store.temporaryChat
  ? ({ gpt: '临时聊天，不会保存', doubao: '临时对话...', qianwen: '这次提问不会出现在历史中', kimi: '临时聊天，尽管问', jixing: '这次灵感不会保存' })[chatUiPreset.value]
  : ({ gpt: '有问题，随便问', doubao: '发消息...', qianwen: '向 Xinyue AI 提问', kimi: '尽管问，或做个 Agent 任务...', jixing: '描述你的灵感' })[chatUiPreset.value])
const showChatVoiceEntry = computed(() => !draft.value.trim() && !attachments.value.length)
const kimiProject = computed(() => catalog.settings.chatHomeContent.kimiProject)
const qianwenBanners = computed(() => catalog.settings.chatHomeContent.qianwenBanners)
const activeQianwenBanner = computed(() => qianwenBanners.value[qianwenBannerIndex.value] || qianwenBanners.value[0] || { title: '', description: '', buttonText: '', imageUrl: '', targetUrl: '/office' })
const chatComposerControls = computed(() => catalog.settings.chatHomeContent.composerControls[chatUiPreset.value])
const chatHomeShortcuts = computed(() => [...(catalog.settings.chatHomeContent.quickActions[chatUiPreset.value] || [])]
  .filter((item) => item.enabled)
  .sort((left, right) => left.sortOrder - right.sortOrder || left.label.localeCompare(right.label, 'zh-CN')))
// 输入框工具行直接展示的快捷入口：首页最多 4 个、kimi 官网同款 7 个，会话内收敛到 2 个（对照豆包/Kimi 的克制密度）；
// 放不下时按实测溢出继续把末尾 BAR chip 收进「更多」菜单，保证末端「对话能力」等控件始终完整可点
const maxBarShortcuts = computed(() => (props.hasChatThread ? 2 : chatUiPreset.value === 'kimi' ? 7 : 4))
const barShortcutLimit = ref(props.hasChatThread ? 2 : chatUiPreset.value === 'kimi' ? 7 : 4)
const visibleChatShortcuts = computed(() => chatHomeShortcuts.value.filter((item) => item.placement === 'BAR').slice(0, barShortcutLimit.value))
const chatMoreShortcuts = computed(() => [
  ...chatHomeShortcuts.value.filter((item) => item.placement === 'MORE'),
  ...chatHomeShortcuts.value.filter((item) => item.placement === 'BAR').slice(barShortcutLimit.value),
])
const jxRailActions = computed(() => [...(catalog.settings.chatHomeContent.quickActions.doubao || [])]
  .filter((item) => item.enabled)
  .sort((left, right) => left.sortOrder - right.sortOrder || left.label.localeCompare(right.label, 'zh-CN')))
const jxRailControls = computed(() => catalog.settings.chatHomeContent.composerControls.doubao)
const jxBarActions = computed(() => jxRailActions.value.filter((item) => item.placement === 'BAR'))
const jxRailVisible = computed(() => jxBarActions.value.slice(0, barShortcutLimit.value))
const jxRailMore = computed(() => [
  ...jxRailActions.value.filter((item) => item.placement === 'MORE'),
  ...jxBarActions.value.slice(barShortcutLimit.value),
])
const inlineModelShown = computed(() => ['doubao', 'qianwen'].includes(chatUiPreset.value) && chatComposerControls.value.modelSelectorEnabled && showChatComposerShortcutBar.value)
const showChatComposerShortcutBar = computed(() => {
  if (!['doubao', 'qianwen'].includes(chatUiPreset.value)) return false
  if (chatUiPreset.value === 'qianwen' && props.hasChatThread) return false
  const controls = chatComposerControls.value
  return Boolean(visibleChatShortcuts.value.length || controls.modeEnabled || controls.webSearchEnabled || (controls.moreEnabled && (chatMoreShortcuts.value.length || controls.modelSelectorEnabled)))
})
const chatModeOptions = computed<Array<{ label: string; icon: typeof Sparkles; note: string; badge?: string }>>(() => chatUiPreset.value === 'qianwen'
  ? [
      { label: '快速', icon: Sparkles, note: '快速直接地回答' },
      { label: '思考研究', icon: Search, note: '深度推理、多轮搜索' },
    ]
  : [
      { label: '快速', icon: Zap, note: '' },
      { label: '专家', icon: ScanSearch, note: '' },
      { label: '工作任务', icon: MousePointer2, note: '' },
    ])
const activeChatModeIcon = computed(() => chatModeOptions.value.find((item) => item.label === activeChatMode.value)?.icon || Sparkles)
const composerInput = ref<HTMLTextAreaElement | null>(null)
const composerRoot = ref<HTMLElement | null>(null)
const modelAnchor = ref<HTMLElement | null>(null)
const modelPopover = ref<HTMLElement | null>(null)
const modelPopoverStyle = ref<Record<string, string>>({})
const attachmentOpen = ref(false)
const modelOpen = ref(false)
const chatModeMenuOpen = ref(false)
const chatMoreMenuOpen = ref(false)
// 「快速/更多」菜单 Teleport 到 body 后按触发 chip 的实时 rect 定位；锚点元素取自点击事件，样式在测量前保持 hidden
const chatModeMenuEl = ref<HTMLElement | null>(null)
const chatMoreMenuEl = ref<HTMLElement | null>(null)
const chatModeAnchorEl = ref<HTMLElement | null>(null)
const chatMoreAnchorEl = ref<HTMLElement | null>(null)
const chatModeMenuStyle = ref<Record<string, string>>({ visibility: 'hidden' })
const chatMoreMenuStyle = ref<Record<string, string>>({ visibility: 'hidden' })
const promptTemplatesOpen = ref(false)
const promptTemplatesLoading = ref(false)
const promptTemplates = ref<PromptTemplate[]>([])
const promptTemplateQuery = ref('')
const promptTemplateCategory = ref('')
const promptTemplateCategories = computed(() => [...new Set(promptTemplates.value.map((item) => item.category).filter(Boolean))].sort())
const filteredPromptTemplates = computed(() => promptTemplates.value.filter((item) => {
  const haystack = `${item.title} ${item.description} ${item.prompt}`.toLowerCase()
  return (!promptTemplateCategory.value || item.category === promptTemplateCategory.value) && (!promptTemplateQuery.value || haystack.includes(promptTemplateQuery.value.toLowerCase()))
}))

function toggleWebSearch() {
  webSearchEnabled.value = !webSearchEnabled.value
  chatModeMenuOpen.value = false
  chatMoreMenuOpen.value = false
}
// 与模型弹层同一套机制：菜单向上弹出，底边对齐触发器顶边减间距，左边对齐触发器左边；
// 窄窗口 clamp 到视口内（8px 边距），上方空间不足时回落到触发器下方
function floatingChipMenuStyle(anchor: HTMLElement, menu: HTMLElement | null): Record<string, string> {
  const rect = anchor.getBoundingClientRect()
  const edge = 8
  const gap = 8
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const measured = menu?.getBoundingClientRect()
  const width = measured?.width || 0
  const height = measured?.height || 0
  const left = width
    ? Math.min(Math.max(edge, rect.left), Math.max(edge, viewportWidth - width - edge))
    : Math.max(edge, rect.left)
  const openAbove = !height || rect.top - gap - height >= edge
  const top = openAbove
    ? Math.max(edge, rect.top - gap - height)
    : Math.min(rect.bottom + gap, Math.max(edge, viewportHeight - edge - height))
  return { bottom: 'auto', left: `${Math.round(left)}px`, position: 'fixed', right: 'auto', top: `${Math.round(top)}px`, visibility: 'visible', zIndex: '1000' }
}
function updateChatModeMenuPosition() {
  if (!chatModeMenuOpen.value) return
  if (!chatModeAnchorEl.value?.isConnected) { chatModeMenuOpen.value = false; return }
  chatModeMenuStyle.value = floatingChipMenuStyle(chatModeAnchorEl.value, chatModeMenuEl.value)
}
function updateChatMoreMenuPosition() {
  if (!chatMoreMenuOpen.value) return
  if (!chatMoreAnchorEl.value?.isConnected) { chatMoreMenuOpen.value = false; return }
  chatMoreMenuStyle.value = floatingChipMenuStyle(chatMoreAnchorEl.value, chatMoreMenuEl.value)
}
function handleChipMenuRelayout() { updateChatModeMenuPosition(); updateChatMoreMenuPosition() }
function toggleChatModeMenu(event?: MouseEvent) {
  chatModeMenuOpen.value = !chatModeMenuOpen.value
  if (chatModeMenuOpen.value) {
    chatModeAnchorEl.value = (event?.currentTarget as HTMLElement | null) || chatModeAnchorEl.value
    chatModeMenuStyle.value = { visibility: 'hidden' }
    void nextTick(updateChatModeMenuPosition)
  }
  chatMoreMenuOpen.value = false
  attachmentOpen.value = false
  modelOpen.value = false
}
function toggleChatMoreMenu(event?: MouseEvent) {
  const willOpen = !chatMoreMenuOpen.value
  chatMoreMenuOpen.value = willOpen
  if (willOpen) {
    chatMoreAnchorEl.value = (event?.currentTarget as HTMLElement | null) || chatMoreAnchorEl.value
    chatMoreMenuStyle.value = { visibility: 'hidden' }
    void nextTick(updateChatMoreMenuPosition)
  }
  chatModeMenuOpen.value = false
  attachmentOpen.value = false
  modelOpen.value = false
}
function selectChatMode(label: string) {
  chatModeMenuOpen.value = false
  if (label === '工作任务') { void router.push('/office?mode=agent'); return }
  activeChatMode.value = label
}
function toggleAttachmentMenu() { attachmentOpen.value = !attachmentOpen.value; modelOpen.value = false; promptTemplatesOpen.value = false; chatModeMenuOpen.value = false; chatMoreMenuOpen.value = false }
function toggleModelMenu() {
  modelOpen.value = !modelOpen.value
  attachmentOpen.value = false
  chatModeMenuOpen.value = false
  chatMoreMenuOpen.value = false
  if (modelOpen.value) {
    syncCapabilityToSelectedModel()
    emit('load-models')
    modelPopoverStyle.value = { visibility: 'hidden' }
    void nextTick(() => { updateModelPopoverPosition(); requestAnimationFrame(updateModelPopoverPosition) })
  } else {
    modelPopoverStyle.value = { visibility: 'hidden' }
  }
}
function syncCapabilityToSelectedModel() {
  if (activeCapability.value === 'AGENT') return
  const selected = displayedCapabilityModel()
  if (selected?.capability !== 'IMAGE' && selected?.capability !== 'VIDEO' && selected?.capability !== 'CHAT') return
  if (activeCapability.value === selected.capability && props.activeCapabilityModel === selected.key) return
  activeCapability.value = selected.capability
  props.selectCapabilityModel(selected.key)
}
function shortcutCapability(item: ChatQuickAction) {
  const target = (item.target || '').trim().toLowerCase()
  if (item.icon === 'design' || target.startsWith('/canvas') || /设计|画布/.test(item.label)) return null
  if (item.icon === 'image' || target === '/image' || target.startsWith('/image?') || /图像|生图/.test(item.label)) return 'IMAGE' as const
  if (item.icon === 'video' || target === '/video' || target.startsWith('/video?') || /视频/.test(item.label)) return 'VIDEO' as const
  return null
}
function updateModelPopoverPosition() {
  if (!modelOpen.value || !modelAnchor.value) return
  const anchor = modelAnchor.value.getBoundingClientRect()
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const edge = 12
  const gap = 8
  const mobile = viewportWidth <= 680
  const width = Math.min(704, viewportWidth - edge * 2)
  const fallbackHeight = mobile ? Math.max(200, viewportHeight - edge * 2) : Math.max(200, Math.min(460, viewportHeight - edge * 2 - 24))
  const measuredHeight = modelPopover.value?.getBoundingClientRect().height || 0
  const height = Math.max(200, Math.min(measuredHeight || fallbackHeight, viewportHeight - edge * 2))
  // 向上打开时以输入框整体顶边为界：kimi 等预设的模型 chip 位于 composer 内部底部工具行，
  // 若按 chip 顶边定位，面板下缘会叠进输入框（压住 placeholder）
  const boundaryTop = composerRoot.value?.getBoundingClientRect().top ?? anchor.top
  const spaceAbove = boundaryTop - edge - gap
  const spaceBelow = viewportHeight - anchor.bottom - edge - gap
  const openAbove = spaceAbove >= height || spaceAbove >= spaceBelow
  const top = openAbove
    ? Math.max(edge, boundaryTop - gap - height)
    : Math.min(viewportHeight - edge - height, anchor.bottom + gap)
  const left = Math.min(Math.max(edge, anchor.left), Math.max(edge, viewportWidth - width - edge))
  modelPopoverStyle.value = {
    bottom: 'auto',
    left: `${Math.round(left)}px`,
    maxHeight: `${Math.round(viewportHeight - edge * 2)}px`,
    position: 'fixed',
    right: 'auto',
    top: `${top}px`,
    visibility: 'visible',
    width: `${Math.round(width)}px`,
    zIndex: '1000',
  }
}
function handleSelectCapabilityModel(value: string) {
  props.selectCapabilityModel(value)
  modelOpen.value = false
  chatMoreMenuOpen.value = false
}
function selectCapability(value: 'CHAT' | 'IMAGE' | 'VIDEO' | 'AGENT') {
  activeCapability.value = value
}
function selectCapabilityFromPicker(value: string) {
  if (value === 'CHAT' || value === 'IMAGE' || value === 'VIDEO' || value === 'AGENT') selectCapability(value)
}
function openPromptLibrary(type?: 'IMAGE' | 'VIDEO' | 'TEXT') { attachmentOpen.value = false; void router.push(type ? { path: '/prompts', query: { type: type.toLowerCase() } } : '/prompts') }
async function togglePromptTemplates() {
  promptTemplatesOpen.value = !promptTemplatesOpen.value
  if (!promptTemplatesOpen.value || promptTemplates.value.length) return
  promptTemplatesLoading.value = true
  try {
    const rows = await api<PromptTemplate[]>('/prompt-templates')
    promptTemplates.value = rows.map((item) => ({ ...item, variables: Array.isArray(item.variables) ? item.variables : [] }))
  } catch (reason) {
    store.lastError = reason instanceof Error ? reason.message : '提示词模板加载失败'
  } finally { promptTemplatesLoading.value = false }
}
function usePromptTemplate(item: PromptTemplate) {
  draft.value = draft.value.trim() ? `${draft.value.trim()}\n\n${item.prompt}` : item.prompt
  promptTemplatesOpen.value = false
  attachmentOpen.value = false
  void nextTick(() => { resizeComposer(); composerInput.value?.focus() })
}
function resizeComposer() {
  resizeTextarea(composerInput.value, composerMaxHeight())
  syncComposerHeightVar()
}
// 把 composer 实时几何暴露为 CSS 变量，附件面板/建议区据此跟随定位
// top/left 相对宿主（其 transform 会改变 fixed 包含块），space-above 为视口内上方可用空间
function syncComposerHeightVar() {
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
function handleComposerKeydown(event: KeyboardEvent) { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); props.submitMessage() } }
function handleChatSubmitAction() {
  if (store.isGenerating) { void store.cancelActiveJob(); return }
  if (showChatVoiceEntry.value) props.toggleVoice('chat')
}
function scrollShortcutRail(event: WheelEvent) {
  const rail = event.currentTarget as HTMLElement | null
  if (!rail || Math.abs(event.deltaX) > Math.abs(event.deltaY) || rail.scrollWidth <= rail.clientWidth) return
  rail.scrollLeft += event.deltaY
  event.preventDefault()
}
const shortcutRail = ref<HTMLElement | null>(null)
const shortcutRailCanScrollStart = ref(false)
const shortcutRailCanScrollEnd = ref(false)
// 折叠防抖动：同一窗口宽度下折过 chip 就不再尝试放回，避免「放入→溢出→移除」来回跳
const shortcutRailCollapsedAtWidth = ref(0)
function updateShortcutRailFade() {
  const rail = shortcutRail.value
  if (!rail) { shortcutRailCanScrollStart.value = false; shortcutRailCanScrollEnd.value = false; return }
  shortcutRailCanScrollStart.value = rail.scrollLeft > 2
  shortcutRailCanScrollEnd.value = rail.scrollLeft + rail.clientWidth < rail.scrollWidth - 2
}
// 工具行实测溢出时把 BAR chip 收进「更多」；宽度变大后按原上限逐个放回，直到再次溢出为止
function measureShortcutRail() {
  const rail = shortcutRail.value
  if (!rail) { shortcutRailCanScrollStart.value = false; shortcutRailCanScrollEnd.value = false; return }
  const overflowing = rail.scrollWidth - rail.clientWidth > 1
  if (overflowing && barShortcutLimit.value > 0) {
    barShortcutLimit.value -= 1
    shortcutRailCollapsedAtWidth.value = window.innerWidth
    return
  }
  const totalBarShortcuts = (jxHomeMode.value ? jxBarActions.value : chatHomeShortcuts.value.filter((item) => item.placement === 'BAR')).length
  const canRestore = shortcutRailCollapsedAtWidth.value !== window.innerWidth
    && barShortcutLimit.value < Math.min(maxBarShortcuts.value, totalBarShortcuts)
  if (!overflowing && canRestore) {
    barShortcutLimit.value += 1
    return
  }
  updateShortcutRailFade()
}
function openConfiguredDestination(target: string) {
  if (!target) return
  if (/^https?:\/\//i.test(target)) { window.open(target, '_blank', 'noopener,noreferrer'); return }
  void router.push(target.startsWith('/') ? target : `/${target}`)
}
async function executeChatQuickAction(item: ChatQuickAction) {
  chatModeMenuOpen.value = false
  chatMoreMenuOpen.value = false
  store.clearError()
  const capability = shortcutCapability(item)
  if (capability) {
    activeCapability.value = capability
    attachmentOpen.value = false
    modelOpen.value = true
    emit('load-models')
    modelPopoverStyle.value = { visibility: 'hidden' }
    void nextTick(() => { updateModelPopoverPosition(); requestAnimationFrame(updateModelPopoverPosition) })
    return
  }
  if (!await props.applyQuickActionModel(item)) return
  if (item.webSearch) webSearchEnabled.value = true
  if (item.actionType === 'OFFICE') {
    await router.push({
      path: '/office',
      query: {
        tool: item.target || 'daily',
        ...(item.modelKey ? { model: item.modelKey } : {}),
        ...(item.prompt ? { prompt: item.prompt } : {}),
        ...(item.webSearch ? { webSearch: 'true' } : {}),
      },
    })
    return
  }
  if (item.actionType === 'ROUTE') {
    if (/^https?:\/\//i.test(item.target)) {
      openConfiguredDestination(item.target)
      return
    }
    const resolved = router.resolve(item.target || '/chat')
    await router.push({
      path: resolved.path,
      hash: resolved.hash,
      query: {
        ...resolved.query,
        ...(item.prompt ? { prompt: item.prompt } : {}),
        ...(item.modelKey ? { model: item.modelKey } : {}),
      },
    })
    return
  }
  draft.value = item.prompt
  void nextTick(() => { resizeComposer(); composerInput.value?.focus({ preventScroll: true }) })
}
function closePopovers() {
  attachmentOpen.value = false
  modelOpen.value = false
  promptTemplatesOpen.value = false
  chatModeMenuOpen.value = false
  chatMoreMenuOpen.value = false
}
function closeChatComposerPopoversOnOutside(event: PointerEvent) {
  const target = event.target as HTMLElement | null
  if (target?.closest('.chat-home-floating-menu, .chat-home-mode-trigger, .chat-home-more-trigger, .chat-home-inline-model, .model-popover, .composer-model')) return
  chatModeMenuOpen.value = false
  chatMoreMenuOpen.value = false
  modelOpen.value = false
}
function closeChatComposerPopoversOnEscape(event: KeyboardEvent) {
  if (event.key !== 'Escape' || (!chatModeMenuOpen.value && !chatMoreMenuOpen.value && !modelOpen.value)) return
  chatModeMenuOpen.value = false
  chatMoreMenuOpen.value = false
  modelOpen.value = false
}
// 窗口级拖放上传（借鉴 Aivory composer）：dragDepth 平衡嵌套 dragenter/dragleave，
// 避免指针划过子元素时提示层闪烁；只在拖入内容为文件时响应并阻止浏览器默认导航。
// ChatComposer 仅在聊天模式挂载，创作页不受影响。
const dragOverlayVisible = ref(false)
const dragDepth = ref(0)
function dragEventHasFiles(event: DragEvent) {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files')
}
function handleWindowDragEnter(event: DragEvent) {
  if (!dragEventHasFiles(event)) return
  dragDepth.value += 1
  dragOverlayVisible.value = true
}
function handleWindowDragOver(event: DragEvent) {
  if (!dragEventHasFiles(event)) return
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
  if (dragDepth.value === 0) dragDepth.value = 1
  dragOverlayVisible.value = true
}
function handleWindowDragLeave(event: DragEvent) {
  if (!dragEventHasFiles(event)) return
  dragDepth.value = Math.max(0, dragDepth.value - 1)
  if (dragDepth.value === 0) dragOverlayVisible.value = false
}
function handleWindowDrop(event: DragEvent) {
  if (!dragEventHasFiles(event)) return
  event.preventDefault()
  dragDepth.value = 0
  dragOverlayVisible.value = false
  const files = Array.from(event.dataTransfer?.files ?? [])
  if (files.length) props.uploadChatFiles(files)
}
// 粘贴文件成附件：事件先经 textarea 默认处理，若已被消费（defaultPrevented）则跳过防双上传；
// 纯文本粘贴 files 为空，行为不变。
function handleComposerPaste(event: ClipboardEvent) {
  if (event.defaultPrevented) return
  const files = Array.from(event.clipboardData?.files ?? [])
  if (!files.length) return
  event.preventDefault()
  props.uploadChatFiles(files)
}
watch(draft, () => { void nextTick(resizeComposer) })
// 预设切换（目录设置异步下发）与视口变化后，需要重算高度变量，避免面板/建议区跟随错位
watch(chatUiPreset, () => {
  closePopovers()
  barShortcutLimit.value = maxBarShortcuts.value
  shortcutRailCollapsedAtWidth.value = 0
  void nextTick(() => { resizeComposer(); measureShortcutRail() })
})
watch(modelOpen, (open) => {
  if (open) void nextTick(() => { updateModelPopoverPosition(); requestAnimationFrame(updateModelPopoverPosition) })
})
watch([activeCapability, () => props.capabilityModels], () => {
  if (modelOpen.value) void nextTick(updateModelPopoverPosition)
})
watch([visibleChatShortcuts, jxRailVisible, chatMoreShortcuts, showChatComposerShortcutBar, chatUiPreset], () => {
  void nextTick(measureShortcutRail)
})
// 登录态就绪后「对话能力」chip 才会出现，会改变工具行宽度
watch(() => auth.isAuthenticated, () => { void nextTick(measureShortcutRail) })
watch(() => props.hasChatThread, () => {
  barShortcutLimit.value = maxBarShortcuts.value
  void nextTick(measureShortcutRail)
})
// 附件面板/建议区的 --composer-* 变量原本只在 mount/输入/resize 时同步；
// 横幅图片晚加载、容器内滚动会改变 composer 几何，这里补捕获阶段 scroll 监听 + ResizeObserver 跟随刷新
let composerVarObserver: ResizeObserver | null = null
onMounted(() => {
  document.addEventListener('pointerdown', closeChatComposerPopoversOnOutside)
  document.addEventListener('keydown', closeChatComposerPopoversOnEscape)
  window.addEventListener('dragenter', handleWindowDragEnter)
  window.addEventListener('dragover', handleWindowDragOver)
  window.addEventListener('dragleave', handleWindowDragLeave)
  window.addEventListener('drop', handleWindowDrop)
  window.addEventListener('resize', resizeComposer)
  window.addEventListener('resize', updateModelPopoverPosition)
  window.addEventListener('resize', measureShortcutRail)
  window.addEventListener('resize', handleChipMenuRelayout)
  window.addEventListener('scroll', updateModelPopoverPosition, true)
  window.addEventListener('scroll', handleChipMenuRelayout, true)
  window.addEventListener('scroll', syncComposerHeightVar, true)
  composerVarObserver = new ResizeObserver(syncComposerHeightVar)
  if (composerRoot.value) composerVarObserver.observe(composerRoot.value)
  if (composerRoot.value?.parentElement) composerVarObserver.observe(composerRoot.value.parentElement)
  void nextTick(() => { resizeComposer(); measureShortcutRail() })
})
onUnmounted(() => {
  document.removeEventListener('pointerdown', closeChatComposerPopoversOnOutside)
  document.removeEventListener('keydown', closeChatComposerPopoversOnEscape)
  window.removeEventListener('dragenter', handleWindowDragEnter)
  window.removeEventListener('dragover', handleWindowDragOver)
  window.removeEventListener('dragleave', handleWindowDragLeave)
  window.removeEventListener('drop', handleWindowDrop)
  window.removeEventListener('resize', resizeComposer)
  window.removeEventListener('resize', updateModelPopoverPosition)
  window.removeEventListener('resize', measureShortcutRail)
  window.removeEventListener('resize', handleChipMenuRelayout)
  window.removeEventListener('scroll', updateModelPopoverPosition, true)
  window.removeEventListener('scroll', handleChipMenuRelayout, true)
  window.removeEventListener('scroll', syncComposerHeightVar, true)
  composerVarObserver?.disconnect()
  composerVarObserver = null
})

defineExpose({ composerInputEl: () => composerInput.value, closePopovers })
</script>
