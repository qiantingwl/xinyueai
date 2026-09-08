<template>
        <form class="chat-composer" @submit.prevent="submitMessage">
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
          <button type="button" aria-label="添加文件等" title="添加文件等" :class="{ 'is-open': attachmentOpen }" :disabled="uploading" @click="toggleAttachmentMenu"><Plus :size="20" /></button>
          <textarea ref="composerInput" v-model="draft" rows="1" aria-label="消息" :placeholder="chatComposerPlaceholder" @focus="collapseWorkspacePopovers" @input="resizeComposer" @keydown="handleComposerKeydown" />
          <nav v-if="showChatComposerShortcutBar" class="chat-home-shortcuts chat-home-shortcuts--in-composer" :aria-label="`${chatUiLabel}快捷入口`" @wheel="scrollShortcutRail">
            <button v-if="chatComposerControls.modeEnabled" class="chat-home-mode-trigger" :class="{ 'is-open': chatModeMenuOpen }" type="button" :aria-expanded="chatModeMenuOpen" @click="toggleChatModeMenu"><component :is="activeChatModeIcon" :size="16" /><span>{{ activeChatMode }}</span><small v-if="chatUiPreset === 'doubao' && activeChatMode === '快速'">新</small><ChevronDown :size="12" /></button>
            <button v-if="chatUiPreset === 'doubao' && chatComposerControls.modelSelectorEnabled" ref="modelAnchor" class="chat-home-inline-model" :class="{ 'is-open': modelOpen }" type="button" :aria-expanded="modelOpen" :aria-label="`选择模型，当前为${activeCapabilityModelLabel}`" @click="toggleModelMenu"><ModelBadge v-if="activeCapabilityModelOption" :model="activeCapabilityModelOption" size="sm" /><span v-else aria-hidden="true">#</span><strong>{{ activeCapabilityModelLabel }}</strong><ChevronDown :size="12" /></button>
            <button v-if="chatComposerControls.webSearchEnabled" class="composer-web-search" :class="{ 'is-active': webSearchEnabled }" type="button" :aria-pressed="webSearchEnabled" :title="webSearchEnabled ? '关闭联网搜索' : '开启联网搜索'" @click="toggleWebSearch"><Globe2 :size="16" /><span>联网</span></button>
            <button v-for="item in visibleChatShortcuts" :key="item.id" type="button" @click="executeChatQuickAction(item)">
              <component :is="quickActionIcon(item.icon)" :size="16" /><span>{{ item.label }}</span>
            </button>
            <button v-if="chatComposerControls.moreEnabled && chatMoreShortcuts.length" class="chat-home-more-trigger" :class="{ 'is-open': chatMoreMenuOpen }" type="button" :aria-expanded="chatMoreMenuOpen" @click="toggleChatMoreMenu"><LayoutGrid :size="16" /><span>更多</span></button>
            <CapabilitySelector v-if="auth.isAuthenticated && ['doubao', 'qianwen'].includes(chatUiPreset)" v-model:assistant-id="assistantId" v-model:skill-id="chatPluginId" capability="CHAT" />
          </nav>
          <div v-if="!hasChatThread && chatUiPreset === 'kimi' && chatComposerControls.modeEnabled" class="chat-kimi-modes" aria-label="回答模式"><button type="button" :class="{ 'is-active': activeChatMode === '快速' }" @click="activeChatMode = '快速'">快速</button><button type="button" :class="{ 'is-active': activeChatMode === '进阶' }" @click="activeChatMode = '进阶'">进阶</button><ChevronDown :size="14" /></div>
          <CapabilitySelector v-if="auth.isAuthenticated && (!['doubao', 'qianwen'].includes(chatUiPreset) || !showChatComposerShortcutBar)" v-model:assistant-id="assistantId" v-model:skill-id="chatPluginId" capability="CHAT" />
          <button v-if="chatComposerControls.webSearchEnabled && chatUiPreset !== 'doubao' && (hasChatThread || chatUiPreset !== 'qianwen')" class="composer-web-search composer-web-search--standalone" :class="{ 'is-active': webSearchEnabled }" type="button" :aria-pressed="webSearchEnabled" :title="webSearchEnabled ? '关闭联网搜索' : '开启联网搜索'" @click="toggleWebSearch"><Globe2 :size="16" /><span>联网</span></button>
          <div v-if="chatComposerControls.modelSelectorEnabled" class="composer-control composer-model">
            <button v-if="chatUiPreset !== 'doubao'" ref="modelAnchor" type="button" :aria-label="`选择模型，当前为${activeCapabilityModelLabel}`" :title="`模型：${activeCapabilityModelLabel}`" @click="toggleModelMenu">
              <ModelBadge v-if="activeCapabilityModelOption" :model="activeCapabilityModelOption" size="sm" /><span>{{ activeCapabilityModelLabel }}</span><ChevronDown :size="15" />
            </button>
            <Teleport to="body">
              <div v-if="modelOpen" ref="modelPopover" class="composer-popover model-popover model-popover--catalog model-popover--floating" :style="modelPopoverStyle">
                <ModelCatalogPicker :models="capabilityModels" :model-value="activeCapabilityModel" title="选择模型" :capabilities="capabilityOptions.map(({ key, label }) => ({ key, label }))" :active-capability="activeCapability" @capability-change="selectCapabilityFromPicker" @select="handleSelectCapabilityModel" />
              </div>
            </Teleport>
          </div>
          <button class="composer-voice" :class="{ 'is-listening': voiceListening && voiceTarget === 'chat' }" type="button" :aria-label="voiceListening && voiceTarget === 'chat' ? '停止语音输入' : '开始语音输入'" :aria-pressed="voiceListening && voiceTarget === 'chat'" :title="voiceListening && voiceTarget === 'chat' ? '停止语音输入' : '语音输入'" @click="toggleVoice('chat')"><Mic :size="17" /></button>
          <button class="chat-composer-submit composer-send" :class="{ 'is-voice-entry': showChatVoiceEntry, 'is-generating': store.isGenerating }" :type="store.isGenerating || showChatVoiceEntry ? 'button' : 'submit'" :aria-label="store.isGenerating ? '停止生成' : showChatVoiceEntry ? '开始语音输入' : capabilityModelAvailable ? '发送' : capabilityModelUnavailableMessage" :title="store.isGenerating ? '停止生成' : showChatVoiceEntry ? '开始语音输入' : capabilityModelAvailable ? '发送，Enter' : capabilityModelUnavailableMessage" :disabled="!store.isGenerating && !showChatVoiceEntry && (!draft.trim() && !attachments.length || !capabilityModelAvailable)" @click="handleChatSubmitAction"><Square v-if="store.isGenerating" :size="14" fill="currentColor" /><AudioLines v-else-if="showChatVoiceEntry" :size="18" /><ArrowUp v-else :size="20" /></button>
          <Transition name="composer-menu"><div v-if="chatModeMenuOpen" class="chat-home-floating-menu chat-home-mode-menu" role="menu"><button v-for="option in chatModeOptions" :key="option.label" type="button" role="menuitemradio" :aria-checked="activeChatMode === option.label" @click="selectChatMode(option.label)"><component :is="option.icon" :size="17" /><span><strong>{{ option.label }}</strong><small v-if="option.note">{{ option.note }}</small></span><em v-if="option.badge">{{ option.badge }}</em><Check v-if="activeChatMode === option.label" :size="15" /></button></div></Transition>
          <Transition name="composer-menu">
            <div v-if="chatMoreMenuOpen" class="chat-home-floating-menu chat-home-more-menu" role="menu">
              <button v-for="item in chatMoreShortcuts" :key="item.id" type="button" role="menuitem" @click="executeChatQuickAction(item)"><component :is="quickActionIcon(item.icon)" :size="17" /><span><strong>{{ item.label }}</strong></span></button>
            </div>
          </Transition>
        </form>

        <div v-if="!hasChatThread && chatUiPreset === 'kimi'" class="chat-kimi-resource-bar"><button type="button" @click="openFilePicker('chat-file')"><Paperclip :size="16" />选择文件</button><button type="button" @click="openConfiguredDestination(kimiProject.targetUrl)"><Folder :size="16" />{{ kimiProject.label }}</button></div>

        <nav v-if="!hasChatThread && !showChatComposerShortcutBar && ['kimi', 'gpt'].includes(chatUiPreset) && (visibleChatShortcuts.length || (chatComposerControls.moreEnabled && chatMoreShortcuts.length))" class="chat-home-shortcuts" :aria-label="`${chatUiLabel}快捷入口`">
          <button v-for="item in visibleChatShortcuts" :key="item.id" type="button" @click="executeChatQuickAction(item)">
            <component :is="quickActionIcon(item.icon)" :size="16" /><span>{{ item.label }}</span>
          </button>
          <button v-if="chatComposerControls.moreEnabled && chatMoreShortcuts.length" class="chat-home-more-trigger" :class="{ 'is-open': chatMoreMenuOpen }" type="button" :aria-expanded="chatMoreMenuOpen" @click="toggleChatMoreMenu"><LayoutGrid :size="16" /><span>更多</span></button>
        </nav>
        <section v-if="!hasChatThread && chatUiPreset === 'qianwen' && qianwenBanners.length" class="chat-home-qianwen-carousel" aria-label="推荐服务">
          <nav aria-label="切换推荐服务"><button v-for="(_, index) in qianwenBanners" :key="index" type="button" :class="{ 'is-active': qianwenBannerIndex === index }" :aria-label="`查看第 ${index + 1} 项`" @click="qianwenBannerIndex = index" /></nav>
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
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  ArrowUp, AudioLines, BriefcaseBusiness, Check, ChevronDown, ChevronRight, Code2, FileText, Folder, Globe2, Image as ImageIcon, Languages, LayoutGrid, LibraryBig, LoaderCircle, Mic, MousePointer2, Music2, Paperclip, Plus, Presentation, ScanSearch, Search, Sparkles, Square, Table2, Video, WandSparkles, X, Zap,
} from 'lucide-vue-next'
import CapabilitySelector from '../CapabilitySelector.vue'
import ModelCatalogPicker from '../ModelCatalogPicker.vue'
import { useAuthStore } from '../../stores/auth'
import { useCatalogStore, type ChatQuickAction, type ChatUiPreset } from '../../stores/catalog'
import { useStudioStore } from '../../stores/studio'
import { api } from '../../services/api'
import { findCatalogModel, type CatalogModel } from '../../utils/model-catalog'
import ModelBadge from '../common/ModelBadge.vue'
import type { StudioAsset } from '../../types'
import { attachmentMeta, hasImagePreview } from '../creation/creation-shared'

interface PromptTemplate {
  id: string
  title: string
  description: string
  prompt: string
  category: string
  variables: string[] | null
}

const props = defineProps<{
  model: string
  chatModels: CatalogModel[]
  capabilityModels: CatalogModel[]
  activeCapability: 'CHAT' | 'IMAGE' | 'VIDEO' | 'AGENT'
  activeCapabilityModel: string
  activeCapabilityModelLabel: string
  capabilityModelAvailable: boolean
  capabilityModelUnavailableMessage: string
  selectCapabilityModel: (value: string) => void
  activeChatModelLabel: string
  chatModelAvailable: boolean
  hasChatThread: boolean
  chatUiPreset: ChatUiPreset
  uploading: boolean
  voiceListening: boolean
  voiceTarget: 'chat' | 'creation'
  submitMessage: () => void
  toggleVoice: (target?: 'chat' | 'creation') => void
  selectModel: (value: string) => void
  openFilePicker: (purpose: 'chat-file' | 'creation' | 'mask' | 'library') => void
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
const activeCapabilityModelOption = computed(() => findCatalogModel(props.capabilityModels, props.activeCapabilityModel, activeCapability.value === 'AGENT' ? 'CHAT' : activeCapability.value as 'CHAT' | 'IMAGE' | 'VIDEO'))
const capabilityOptions = [
  { key: 'CHAT' as const, label: '对话模型', icon: Sparkles },
  { key: 'IMAGE' as const, label: '图片模型', icon: ImageIcon },
  { key: 'VIDEO' as const, label: '视频模型', icon: Video },
  { key: 'AGENT' as const, label: 'Agent模型', icon: WandSparkles },
]
const chatUiPreset = computed<ChatUiPreset>(() => props.chatUiPreset)
const chatUiLabel = computed(() => ({ gpt: 'GPT', doubao: '豆包', qianwen: '千问', kimi: 'Kimi' })[chatUiPreset.value])
const chatComposerPlaceholder = computed(() => store.temporaryChat ? '临时聊天' : ({ gpt: '有问题，随便问', doubao: '发消息...', qianwen: '向 Xinyue AI 提问', kimi: '尽管问，或做个 Agent 任务...' })[chatUiPreset.value])
const showChatVoiceEntry = computed(() => ['gpt', 'doubao'].includes(chatUiPreset.value) && !draft.value.trim() && !attachments.value.length)
const kimiProject = computed(() => catalog.settings.chatHomeContent.kimiProject)
const qianwenBanners = computed(() => catalog.settings.chatHomeContent.qianwenBanners)
const activeQianwenBanner = computed(() => qianwenBanners.value[qianwenBannerIndex.value] || qianwenBanners.value[0] || { title: '', description: '', buttonText: '', imageUrl: '', targetUrl: '/office' })
const quickActionIcons: Record<string, typeof ImageIcon> = {
  sparkles: Sparkles,
  video: Video,
  music: Music2,
  image: ImageIcon,
  podcast: Mic,
  table: Table2,
  writing: FileText,
  transcribe: Mic,
  ppt: Presentation,
  translate: Languages,
  research: Search,
  answer: FileText,
  code: Code2,
  document: FileText,
  website: Globe2,
  design: WandSparkles,
  office: BriefcaseBusiness,
}
const quickActionIcon = (name: string) => quickActionIcons[name] || Sparkles
const chatComposerControls = computed(() => catalog.settings.chatHomeContent.composerControls[chatUiPreset.value])
const chatHomeShortcuts = computed(() => [...(catalog.settings.chatHomeContent.quickActions[chatUiPreset.value] || [])]
  .filter((item) => item.enabled)
  .sort((left, right) => left.sortOrder - right.sortOrder || left.label.localeCompare(right.label, 'zh-CN')))
const visibleChatShortcuts = computed(() => chatHomeShortcuts.value.filter((item) => item.placement === 'BAR'))
const chatMoreShortcuts = computed(() => chatHomeShortcuts.value.filter((item) => item.placement === 'MORE'))
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
const modelAnchor = ref<HTMLElement | null>(null)
const modelPopover = ref<HTMLElement | null>(null)
const modelPopoverStyle = ref<Record<string, string>>({})
const attachmentOpen = ref(false)
const modelOpen = ref(false)
const chatModeMenuOpen = ref(false)
const chatMoreMenuOpen = ref(false)
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
function toggleChatModeMenu() {
  chatModeMenuOpen.value = !chatModeMenuOpen.value
  chatMoreMenuOpen.value = false
  attachmentOpen.value = false
  modelOpen.value = false
}
function toggleChatMoreMenu() {
  const willOpen = !chatMoreMenuOpen.value
  chatMoreMenuOpen.value = willOpen
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
    emit('load-models')
    void nextTick(updateModelPopoverPosition)
  }
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
  const spaceAbove = anchor.top - edge - gap
  const spaceBelow = viewportHeight - anchor.bottom - edge - gap
  const openAbove = spaceAbove >= height || spaceAbove >= spaceBelow
  const top = openAbove
    ? Math.max(edge, anchor.top - gap - height)
    : Math.min(viewportHeight - edge - height, anchor.bottom + gap)
  const left = Math.min(Math.max(edge, anchor.left), Math.max(edge, viewportWidth - width - edge))
  modelPopoverStyle.value = {
    bottom: 'auto',
    left: `${Math.round(left)}px`,
    maxHeight: `${Math.round(viewportHeight - edge * 2)}px`,
    position: 'fixed',
    right: 'auto',
    top: `${Math.round(top)}px`,
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
  if (!composerInput.value) return
  composerInput.value.style.height = 'auto'
  // 各布局统一自适应：移动端最多 36vh，桌面最多 240px
  const viewportLimit = Math.floor(window.innerHeight * 0.36)
  const maxHeight = window.innerWidth <= 640 ? Math.min(180, viewportLimit) : Math.min(240, viewportLimit)
  const height = Math.min(composerInput.value.scrollHeight, maxHeight)
  composerInput.value.style.height = `${height}px`
  composerInput.value.style.overflowY = composerInput.value.scrollHeight > maxHeight ? 'auto' : 'hidden'
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
function handleComposerKeydown(event: KeyboardEvent) { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); props.submitMessage() } }
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
function openConfiguredDestination(target: string) {
  if (!target) return
  if (/^https?:\/\//i.test(target)) { window.open(target, '_blank', 'noopener,noreferrer'); return }
  void router.push(target.startsWith('/') ? target : `/${target}`)
}
async function executeChatQuickAction(item: ChatQuickAction) {
  chatModeMenuOpen.value = false
  chatMoreMenuOpen.value = false
  store.clearError()
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
watch(draft, () => { void nextTick(resizeComposer) })
// 预设切换（目录设置异步下发）与视口变化后，需要重算高度变量，避免面板/建议区跟随错位
watch(chatUiPreset, () => { void nextTick(resizeComposer) })
watch(modelOpen, (open) => {
  if (open) void nextTick(updateModelPopoverPosition)
})
watch([activeCapability, () => props.capabilityModels], () => {
  if (modelOpen.value) void nextTick(updateModelPopoverPosition)
})
onMounted(() => {
  document.addEventListener('pointerdown', closeChatComposerPopoversOnOutside)
  document.addEventListener('keydown', closeChatComposerPopoversOnEscape)
  window.addEventListener('resize', resizeComposer)
  window.addEventListener('resize', updateModelPopoverPosition)
  window.addEventListener('scroll', updateModelPopoverPosition, true)
  void nextTick(resizeComposer)
})
onUnmounted(() => {
  document.removeEventListener('pointerdown', closeChatComposerPopoversOnOutside)
  document.removeEventListener('keydown', closeChatComposerPopoversOnEscape)
  window.removeEventListener('resize', resizeComposer)
  window.removeEventListener('resize', updateModelPopoverPosition)
  window.removeEventListener('scroll', updateModelPopoverPosition, true)
})

defineExpose({ composerInputEl: () => composerInput.value, closePopovers })
</script>
