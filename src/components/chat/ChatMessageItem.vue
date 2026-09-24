<template>
            <div v-if="message" class="message-row" :class="[`message-row--${message.role}`, { 'is-jump-highlight': highlight }]" :data-message-id="message.id" :data-user-message="message.role === 'user' ? 'true' : undefined" :data-response-phase="message.role === 'assistant' ? responseState.phase : undefined">
              <form v-if="editing" class="message-editor" @submit.prevent="$emit('save-edit')">
                <textarea v-model="editingMessageContent" rows="3" maxlength="50000" aria-label="编辑消息" @keydown.esc="$emit('cancel-edit')" />
                <footer><button type="button" @click="$emit('cancel-edit')">取消</button><button type="submit" :disabled="!editingMessageContent.trim() || store.isGenerating">保存并提交</button></footer>
              </form>
              <template v-else>
                <div v-if="message.role === 'assistant' && avatarEnabled !== false" class="message-avatar-col" aria-hidden="true">
                  <AssistantAvatar :state="avatarState" :motion="avatarMotion ?? 'ambient'" :variant="avatarStyle ?? 'classic'" :tone="avatarColor ?? 'auto'" :frozen="avatarFrozen" :size="30" />
                </div>
                <div class="message-body-col">
                <header v-if="message.role === 'assistant' && message.model" class="message-model-line">
                  <ModelBadge :model="{ displayName: message.model }" size="sm" /><span>{{ message.model }}</span>
                </header>
                <details v-if="message.role === 'assistant' && responseState.hasProcess && hasProcessBody" class="message-process" :class="[message.webSearch ? `is-${message.webSearch.status}` : '', `is-phase-${responseState.phase}`]">
                  <summary>
                    <LoaderCircle v-if="responseState.isProcessRunning" class="message-process__spinner" :size="14" aria-hidden="true" />
                    <span>{{ processHeadline }}</span>
                    <ChevronDown :size="14" aria-hidden="true" />
                  </summary>
                  <div class="message-process__body">
                    <div v-if="message.reasoning?.trim()" class="message-process__reasoning"><p>{{ message.reasoning }}</p></div>
                    <p v-if="quotedSearchQueries" class="message-process__queries">{{ quotedSearchQueries }}</p>
                    <ol v-if="message.webSearch?.sources.length" class="message-process__source-list">
                      <li v-for="source in message.webSearch.sources" :key="source.url">
                        <a :href="source.url" target="_blank" rel="noopener noreferrer">{{ source.title }}</a>
                      </li>
                    </ol>
                    <p v-if="message.webSearch?.status === 'failed'" class="message-process__hint">{{ message.webSearch.error || '当前搜索渠道暂时不可用' }}</p>
                  </div>
                </details>
                <p v-else-if="message.role === 'assistant' && responseState.hasProcess" class="message-process-label">
                  <LoaderCircle v-if="responseState.isProcessRunning" class="message-process__spinner" :size="14" aria-hidden="true" />
                  <span>{{ processHeadline }}</span>
                </p>
                <div v-if="responseState.isProcessRunning && message.reasoning?.trim()" class="message-live-reasoning" aria-live="polite"><p>{{ message.reasoning }}</p></div>
                <article v-if="responseState.shouldRender" :class="`message message--${message.role}${responseState.isStreaming ? ' message--streaming' : ''}`">
                  <div v-if="message.failed" class="message-error-box" role="alert">
                    <CircleAlert :size="16" />
                    <div class="message-error-box__body"><strong>回复生成失败</strong><p>{{ message.content }}</p></div>
                    <button type="button" :disabled="store.isGenerating" @click="$emit('retry')"><RefreshCw :size="14" />重新生成</button>
                  </div>
                  <ChatMessageContent v-else-if="message.role === 'assistant'" :content="message.content" @preview="$emit('preview-artifact', $event)" />
                  <template v-else>{{ message.content }}</template>
                  <span v-if="responseState.isStreaming && message.role === 'assistant' && message.content" class="chat-stream-cursor" aria-hidden="true" />
                </article>
                <nav v-if="message.id !== 'welcome' && responseState.shouldRender" class="message-actions" :aria-label="`${message.role === 'user' ? '用户' : '助手'}消息操作`">
                  <button type="button" :title="copied ? '已复制' : '复制'" @click="copyMessage(message)"><Check v-if="copied" :size="15" /><Copy v-else :size="15" /></button>
                  <span v-if="orderedBranches.length > 1" class="message-branch-nav" aria-label="消息分支">
                    <button type="button" title="上一个分支" :disabled="store.isGenerating || currentBranchPosition <= 0" @click="switchBranch(-1)"><ChevronLeft :size="14" /></button>
                    <small>{{ currentBranchPosition + 1 }}/{{ orderedBranches.length }}</small>
                    <button type="button" title="下一个分支" :disabled="store.isGenerating || currentBranchPosition >= orderedBranches.length - 1" @click="switchBranch(1)"><ChevronRight :size="14" /></button>
                  </span>
                  <button v-if="message.role === 'user'" type="button" title="编辑消息" :disabled="store.isGenerating" @click="$emit('start-edit')"><Pencil :size="15" /></button>
                  <template v-else>
                    <button type="button" title="重新生成" :disabled="store.isGenerating" @click="$emit('retry')"><RefreshCw :size="15" /></button>
                    <button type="button" title="有帮助" :class="{ 'is-active': message.feedback === 'UP' }" :aria-pressed="message.feedback === 'UP'" @click="setMessageFeedback('UP')"><ThumbsUp :size="15" /></button>
                    <button type="button" title="没有帮助" :class="{ 'is-active': message.feedback === 'DOWN' }" :aria-pressed="message.feedback === 'DOWN'" @click="setMessageFeedback('DOWN')"><ThumbsDown :size="15" /></button>
                  </template>
                </nav>
                <nav v-if="showFollowUps" class="message-follow-ups" aria-label="你可能还想问">
                  <button v-for="suggestion in followUps" :key="suggestion" type="button" :disabled="store.isGenerating" @click="$emit('follow-up', suggestion)">
                    <span>{{ suggestion }}</span><ArrowRight :size="15" />
                  </button>
                </nav>
                </div>
              </template>
            </div>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { ArrowRight, Check, ChevronDown, ChevronLeft, ChevronRight, CircleAlert, Copy, LoaderCircle, Pencil, RefreshCw, ThumbsDown, ThumbsUp } from 'lucide-vue-next'
import ChatMessageContent from '../ChatMessageContent.vue'
import ModelBadge from '../common/ModelBadge.vue'
import AssistantAvatar, { type AssistantAvatarVariant } from './AssistantAvatar.vue'
import { useStudioStore } from '../../stores/studio'
import { chatProcessHeadline, resolveChatResponseState } from '../../utils/chat-response-state'
import { useCopyFeedback } from '../../composables/useCopyFeedback'
import type { CodeArtifact, Message } from '../../types'

const props = defineProps<{
  message: Message
  highlight: boolean
  editing: boolean
  followUps: string[]
  showFollowUps: boolean
  /** 是否最新一条助手消息：只有它的头像常驻动效，历史消息定格 */
  avatarLive: boolean
  /** 头像动效模式（后台可配）：ambient 常驻轮动 / active 仅生成时 / off 静态 */
  avatarMotion?: 'ambient' | 'active' | 'off'
  /** 是否显示助手头像小球（后台可配） */
  avatarEnabled?: boolean
  /** 头像形态风格（后台可配）：classic/lively/calm/geometric/faces/orbit/comet/thinker/sleepy */
  avatarStyle?: AssistantAvatarVariant
  /** 头像配色（后台可配）：auto 跟随主题 / brand 品牌蓝 / 自定义 hex */
  avatarColor?: string
}>()
const emit = defineEmits<{
  (e: 'start-edit'): void
  (e: 'save-edit'): void
  (e: 'cancel-edit'): void
  (e: 'retry'): void
  (e: 'switch-branch', messageId: string): void
  (e: 'follow-up', value: string): void
  (e: 'preview-artifact', artifact: CodeArtifact): void
}>()
const editingMessageContent = defineModel<string>('editingContent', { required: true })

const store = useStudioStore()
const { copied, copy } = useCopyFeedback()
const responseState = computed(() => resolveChatResponseState(props.message, {
  isGenerating: store.isGenerating,
  activeJobId: store.activeJobId,
}))
// 助手头像状态：检索/思考中 → thinking（球体坍缩聚合），回答输出中 → responding（轨道环绕），其余进入氛围轮动
const avatarState = computed<'idle' | 'thinking' | 'responding'>(() => {
  if (!responseState.value.isProcessRunning) return 'idle'
  return responseState.value.phase === 'answer' ? 'responding' : 'thinking'
})
const avatarFrozen = computed(() => {
  if (props.avatarMotion === 'off') return true
  if (props.avatarMotion === 'active') return !responseState.value.isProcessRunning
  return false
})
const orderedBranches = computed(() => [...(props.message.branches || [])].sort((left, right) => left.branchIndex - right.branchIndex))
const currentBranchPosition = computed(() => Math.max(0, orderedBranches.value.findIndex((branch) => branch.id === props.message.id)))

const thinkingSeconds = ref(0)
const thinkingFinalSeconds = ref(0)
let thinkingTimer = 0
const processHeadline = computed(() => chatProcessHeadline(props.message, {
  isStreaming: responseState.value.isProcessRunning,
  elapsedSeconds: responseState.value.isProcessRunning
    ? thinkingSeconds.value || undefined
    : props.message.thinkingSeconds || thinkingFinalSeconds.value || undefined,
}))
const quotedSearchQueries = computed(() => (props.message.webSearch?.queries || []).map((query) => `“${query}”`).join('、'))
const hasProcessBody = computed(() => Boolean(
  props.message.reasoning?.trim()
  || props.message.webSearch?.queries.length
  || props.message.webSearch?.sources.length
  || props.message.webSearch?.status === 'failed',
))
watch(() => responseState.value.isProcessRunning, (running, wasRunning) => {
  if (running && !wasRunning) {
    const startedAt = props.message.createdAt || Date.now()
    thinkingSeconds.value = Math.max(0, Math.floor((Date.now() - startedAt) / 1000))
    thinkingFinalSeconds.value = 0
    window.clearInterval(thinkingTimer)
    thinkingTimer = window.setInterval(() => {
      thinkingSeconds.value = Math.max(0, Math.floor((Date.now() - startedAt) / 1000))
    }, 400)
  } else if (!running && wasRunning) {
    window.clearInterval(thinkingTimer)
    thinkingFinalSeconds.value = Math.max(1, props.message.thinkingSeconds || thinkingSeconds.value || (props.message.createdAt ? Math.round((Date.now() - props.message.createdAt) / 1000) : 0))
  }
}, { immediate: true })
onUnmounted(() => window.clearInterval(thinkingTimer))
function copyMessage(message: { id: string; content: string }) {
  void copy(message.content)
}
async function setMessageFeedback(value: 'UP' | 'DOWN') {
  const nextValue = props.message.feedback === value ? null : value
  try { await store.setMessageFeedback(props.message.id, nextValue) }
  catch (reason) { store.lastError = reason instanceof Error ? reason.message : '反馈提交失败' }
}
function switchBranch(offset: -1 | 1) {
  const target = orderedBranches.value[currentBranchPosition.value + offset]
  if (target) emit('switch-branch', target.id)
}
</script>
