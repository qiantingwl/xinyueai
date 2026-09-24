<template>
        <div v-if="hasChatThread" ref="thread" class="chat-thread" @scroll="syncMessageNavigator">
          <template v-for="entry in chatTimeline" :key="`${entry.kind}-${entry.id}`">
            <ChatMessageItem v-if="entry.message" v-model:editing-content="editingMessageContent" :message="entry.message" :highlight="jumpHighlightId === entry.message.id" :editing="editingMessageId === entry.message.id" :follow-ups="followUpsForMessage(entry.message)" :show-follow-ups="shouldShowFollowUps(entry.message)" :avatar-live="entry.message.id === latestAssistantMessageId" :avatar-motion="avatarMotion" :avatar-enabled="avatarEnabled" :avatar-style="avatarStyle" :avatar-color="avatarColor" @start-edit="startMessageEdit(entry.message)" @save-edit="saveMessageEdit(entry.message.id)" @cancel-edit="cancelMessageEdit" @retry="retryAssistantMessage(entry.message.id)" @switch-branch="switchMessageBranch" @follow-up="useFollowUpSuggestion" @preview-artifact="openCodeArtifact" />
            <section v-else-if="entry.generation" class="image-generation-response" :class="[`is-${entry.generation.status.toLowerCase()}`, { 'is-video-generation': entry.generation.mode === 'videos' }]" aria-live="polite">
              <template v-if="generationState(entry.generation).isActive">
                <header>
                  <LoaderCircle :size="16" />
                  <strong>正在创建{{ entry.generation.mode === 'videos' ? '视频' : '图片' }}<small v-if="generationElapsedSeconds(entry.generation)" class="image-generation-elapsed">{{ generationElapsedSeconds(entry.generation) }}秒</small></strong>
                  <button type="button" class="image-generation-stop" :disabled="store.cancelingJobId === entry.generation.id" :aria-label="`停止${entry.generation.mode === 'videos' ? '视频' : '图片'}生成`" :title="`停止${entry.generation.mode === 'videos' ? '视频' : '图片'}生成`" @click="stopGeneration(entry.generation)"><LoaderCircle v-if="store.cancelingJobId === entry.generation.id" class="generation-stop-spin" :size="14" /><Square v-else :size="14" fill="currentColor" />{{ store.cancelingJobId === entry.generation.id ? '停止中' : '停止' }}</button>
                </header>
                <div class="image-generation-stage" aria-hidden="true">
                  <span class="image-generation-stage__orb" />
                  <span class="image-generation-stage__ring" />
                </div>
              </template>
              <template v-else-if="generationState(entry.generation).isSucceeded">
                <header><Check :size="18" /><strong>{{ entry.generation.mode === 'videos' ? '视频' : '图片' }}已生成</strong></header>
                <div class="image-generation-results">
                  <article v-for="asset in entry.generation.assets" :key="asset.id" class="image-generation-result" :class="{ 'image-generation-result--video': entry.generation.mode === 'videos' }">
                    <button v-if="entry.generation.mode === 'videos'" class="video-generation-preview" type="button" :title="`站内查看：${asset.title}`" @click="$emit('preview-asset', asset)">
                      <video class="image-generation-result__video" :src="asset.contentUrl" muted preload="metadata" playsinline />
                      <span aria-hidden="true"><Play :size="17" fill="currentColor" /></span>
                    </button>
                    <button v-else class="image-generation-result__preview" type="button" :title="`站内查看：${asset.title}`" @click="$emit('preview-asset', asset)"><img :src="asset.contentUrl" :alt="asset.title" /></button>
                    <nav v-if="entry.generation.mode === 'videos'" class="video-result-actions" aria-label="视频操作">
                      <button type="button" title="站内查看视频" @click="$emit('preview-asset', asset)"><Maximize2 :size="16" /><span>查看</span></button>
                      <button type="button" title="下载视频" @click="$emit('download-asset', asset)"><Download :size="16" /><span>下载</span></button>
                      <button type="button" title="发布到作品中心" @click="$emit('publish-work', asset, entry.generation)"><Images :size="15" /><span>发布作品</span></button>
                      <button type="button" title="在画布中编辑" :disabled="openingCanvas" @click="$emit('open-canvas', asset, entry.generation)"><PenLine :size="15" /><span>在画布中编辑</span></button>
                      <button type="button" title="重新生成视频" :disabled="store.isGenerating" @click="$emit('retry-video', entry.generation)"><RefreshCw :size="15" /><span>重新生成</span></button>
                    </nav>
                    <nav v-else class="image-result-actions" aria-label="图片操作">
                      <button type="button" title="下载图片" aria-label="下载图片" @click="$emit('download-asset', asset)"><Download :size="18" /></button>
                      <button type="button" title="用作参考" aria-label="用作参考" @click="$emit('use-reference', asset, entry.generation)"><ImagePlus :size="18" /></button>
                    </nav>
                  </article>
                </div>
                <nav v-if="entry.generation.mode !== 'videos'" class="image-generation-actions" aria-label="生成结果操作">
                  <button type="button" :disabled="store.isGenerating" @click="$emit('retry-image', entry.generation)"><RefreshCw :size="15" /><span>重新生成</span></button>
                  <button v-if="entry.generation.assets[0]" type="button" @click="$emit('use-reference', entry.generation.assets[0], entry.generation)"><ImagePlus :size="15" /><span>用作参考</span></button>
                  <button v-if="entry.generation.assets[0]" type="button" @click="$emit('publish-work', entry.generation.assets[0], entry.generation)"><Images :size="15" /><span>发布作品</span></button>
                  <button v-if="entry.generation.assets[0]" type="button" :disabled="openingCanvas" @click="$emit('open-canvas', entry.generation.assets[0], entry.generation)"><PenLine :size="15" /><span>{{ openingCanvas ? '正在打开画布' : '在画布中编辑' }}</span></button>
                </nav>
              </template>
              <template v-else>
                <div class="image-generation-failure">
                  <strong>{{ generationState(entry.generation).isCancelled ? `${entry.generation.mode === 'videos' ? '视频' : '图片'}生成已停止` : '生成失败，请调整内容后重试' }}</strong>
                  <p>{{ entry.generation.error || '任务未能完成，创作点已按规则退回。' }}</p>
                  <button type="button" :disabled="store.isGenerating" @click="retryGenerationEntry(entry.generation)"><RefreshCw :size="15" />重新生成</button>
                </div>
              </template>
            </section>
          </template>
          <article v-if="showChatThinking" class="message message--assistant message--thinking"><AssistantAvatar state="thinking" :size="24" /><span>{{ t('studio.thinking') }}</span></article>
        </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Check, Download, ImagePlus, Images, LoaderCircle, Maximize2, PenLine, Play, RefreshCw, Square } from 'lucide-vue-next'
import ChatMessageItem from './ChatMessageItem.vue'
import AssistantAvatar from './AssistantAvatar.vue'
import { useStudioStore } from '../../stores/studio'
import { createFollowUpSuggestions } from '../../utils/follow-up-suggestions'
import { isGenerationActive, resolveGenerationRunState } from '../../utils/generation-run-state'
import type { CodeArtifact, GenerationRun, Message, StudioAsset } from '../../types'

type ChatTimelineEntry = { id: string; kind: 'message' | 'generation'; createdAt: number; message?: Message; generation?: GenerationRun }

const props = defineProps<{
  hasChatThread: boolean
  jumpHighlightId: string
  model: string
  webSearchEnabled: boolean
  activeChatResponseMode: 'fast' | 'expert'
  openingCanvas?: boolean
  /** 头像动效模式（后台可配）：ambient 常驻轮动 / active 仅生成时 / off 静态 */
  avatarMotion?: 'ambient' | 'active' | 'off'
  /** 是否显示助手头像小球（后台可配） */
  avatarEnabled?: boolean
  /** 头像形态风格（后台可配）：classic/lively/calm/geometric/faces/orbit/comet/thinker/sleepy */
  avatarStyle?: 'classic' | 'lively' | 'calm' | 'geometric' | 'faces' | 'orbit' | 'comet' | 'thinker' | 'sleepy'
  /** 头像配色（后台可配）：auto 跟随主题 / brand 品牌蓝 / 自定义 hex */
  avatarColor?: string
  syncMessageNavigator: () => void
}>()
const emit = defineEmits<{
  (e: 'open-artifact', artifact: CodeArtifact): void
  (e: 'preview-asset', asset: StudioAsset): void
  (e: 'use-reference', asset: StudioAsset, generation?: GenerationRun): void
  (e: 'retry-image', generation?: GenerationRun): void
  (e: 'retry-video', generation: GenerationRun): void
  (e: 'download-asset', asset: StudioAsset): void
  (e: 'open-canvas', asset: StudioAsset, generation?: GenerationRun): void
  (e: 'publish-work', asset: StudioAsset, generation?: GenerationRun): void
  (e: 'follow-up', value: string): void
}>()

const store = useStudioStore()
const { t } = useI18n()
const thread = ref<HTMLElement | null>(null)
const editingMessageId = ref('')
const editingMessageContent = ref('')

const chatMessages = computed(() => {
  const rows = props.hasChatThread ? store.messages.filter((message) => message.id !== 'welcome') : store.messages
  return rows.filter((message, index) => !(message.role === 'user' && rows[index + 1]?.role === 'user'))
})
const latestAssistantMessageId = computed(() => [...chatMessages.value].reverse().find((message) => message.role === 'assistant' && !message.id.startsWith('stream:'))?.id || '')
const showChatThinking = computed(() => {
  if (!store.isGenerating || (store.activeGeneration && isGenerationActive(store.activeGeneration.status))) return false
  const latestAssistant = [...store.messages].reverse().find((message) => message.role === 'assistant')
  const latest = store.messages.at(-1)
  return !latestAssistant || latestAssistant.id === 'welcome' || latest?.role !== 'assistant'
})
const chatTimeline = computed<ChatTimelineEntry[]>(() => [
  ...chatMessages.value.map((message) => ({ id: message.id, kind: 'message' as const, createdAt: message.createdAt, message })),
  ...store.generations.map((generation) => ({ id: generation.id, kind: 'generation' as const, createdAt: generation.createdAt, generation })),
].sort((left, right) => left.createdAt - right.createdAt || (left.kind === right.kind ? 0 : left.kind === 'message' ? -1 : 1)))

async function scrollThreadToBottom(behavior: ScrollBehavior = 'smooth') { await nextTick(); thread.value?.scrollTo({ top: thread.value.scrollHeight, behavior }) }
function startMessageEdit(message: { id: string; content: string }) { editingMessageId.value = message.id; editingMessageContent.value = message.content }
function cancelMessageEdit() { editingMessageId.value = ''; editingMessageContent.value = '' }
async function saveMessageEdit(messageId: string) {
  if (!editingMessageContent.value.trim()) return
  try { await store.branchMessage(messageId, editingMessageContent.value, props.model, props.webSearchEnabled, props.activeChatResponseMode); cancelMessageEdit(); await scrollThreadToBottom() }
  catch { /* Store exposes the server error in-page. */ }
}
async function retryAssistantMessage(assistantMessageId: string) {
  const assistantIndex = store.messages.findIndex((message) => message.id === assistantMessageId)
  if (assistantIndex < 0) return
  const source = store.messages.slice(0, assistantIndex).reverse().find((message) => message.role === 'user')
  if (!source) return
  try { await store.branchMessage(source.id, source.content, props.model, props.webSearchEnabled, props.activeChatResponseMode); await scrollThreadToBottom() }
  catch { /* Store exposes the server error in-page. */ }
}
function followUpsForMessage(message: Message) {
  const index = store.messages.findIndex((item) => item.id === message.id)
  const prompt = store.messages.slice(0, index).reverse().find((item) => item.role === 'user')?.content || ''
  return createFollowUpSuggestions(prompt, message.content, message.suggestions)
}
function shouldShowFollowUps(message: Message) {
  return message.role === 'assistant' && message.id === latestAssistantMessageId.value && !store.isGenerating && Boolean(followUpsForMessage(message).length)
}
function useFollowUpSuggestion(value: string) { emit('follow-up', value) }
async function switchMessageBranch(messageId: string) {
  try { await store.switchMessageBranch(messageId); await scrollThreadToBottom('auto') }
  catch { /* Store and global request handling expose the server error. */ }
}
function openCodeArtifact(artifact: CodeArtifact) { emit('open-artifact', artifact) }
function generationState(generation: GenerationRun) { return resolveGenerationRunState(generation.status) }
const generationClock = ref(Date.now())
let generationClockTimer = 0
watch(() => chatTimeline.value.some((entry) => entry.generation && generationState(entry.generation).isActive), (active) => {
  window.clearInterval(generationClockTimer)
  generationClockTimer = 0
  if (!active) return
  generationClock.value = Date.now()
  generationClockTimer = window.setInterval(() => { generationClock.value = Date.now() }, 1000)
}, { immediate: true })
onUnmounted(() => { window.clearInterval(generationClockTimer) })
function generationElapsedSeconds(generation: GenerationRun) {
  return Math.max(0, Math.floor((generationClock.value - generation.createdAt) / 1000))
}
async function stopGeneration(generation: GenerationRun) {
  if (!generationState(generation).canCancel) return
  await store.cancelGeneration(generation.id)
}
function retryGenerationEntry(generation: GenerationRun) {
  if (generation.mode === 'videos') emit('retry-video', generation)
  else emit('retry-image', generation)
}

defineExpose({ threadEl: () => thread.value })
</script>
