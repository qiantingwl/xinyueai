<template>
  <div class="workspace-task-center">
    <button type="button" aria-label="任务中心" title="任务中心" :aria-expanded="open" @click="toggle">
      <ListChecks :size="18" />
      <span v-if="activeCount" class="workspace-task-count">{{ activeCount > 9 ? '9+' : activeCount }}</span>
    </button>
    <section v-if="open" class="workspace-task-panel" aria-label="任务中心">
      <header>
        <div><strong>任务中心</strong><small>{{ activeCount ? `${activeCount} 个任务正在处理` : '最近的生成任务' }}</small></div>
        <button type="button" aria-label="刷新任务" title="刷新" :disabled="loading" @click="load"><RefreshCw :size="16" :class="{ 'is-spinning': loading }" /></button>
      </header>
      <div v-if="loading && !jobs.length" class="workspace-task-empty">正在读取任务...</div>
      <div v-else-if="!jobs.length" class="workspace-task-empty">暂无生成任务</div>
      <div v-else class="workspace-task-list">
        <article v-for="job in jobs" :key="job.id">
          <button class="workspace-task-open" type="button" @click="openJob(job)">
            <span class="workspace-task-icon"><MessageSquare v-if="job.kind === 'CHAT'" :size="16" /><Video v-else-if="job.kind === 'VIDEO'" :size="16" /><Image v-else :size="16" /></span>
            <div>
              <strong>{{ jobTitle(job) }}</strong>
              <small>{{ kindLabel[job.kind] }} · {{ statusLabel[job.status] }} · {{ formatTime(job.createdAt) }}</small>
            </div>
          </button>
          <nav @click.stop @pointerdown.stop>
            <button v-if="activeStatuses.has(job.status)" type="button" aria-label="停止任务" title="停止" :disabled="busyId === job.id" @click="cancel(job)"><Square :size="15" /></button>
            <button v-else-if="retryStatuses.has(job.status)" type="button" aria-label="重试任务" title="重试" :disabled="busyId === job.id" @click="retry(job)"><RotateCcw :size="15" /></button>
          </nav>
        </article>
      </div>
      <p v-if="error" class="workspace-task-error">{{ error }}</p>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Image, ListChecks, MessageSquare, RefreshCw, RotateCcw, Square, Video } from 'lucide-vue-next'
import { api } from '../../services/api'
import { useStudioStore } from '../../stores/studio'
import { generationStatusText } from '../../utils/status-labels'
import { formatDayTime } from '../../utils/datetime'

type TaskJob = {
  id: string
  kind: 'CHAT' | 'IMAGE' | 'VIDEO' | 'COMMERCE'
  status: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED'
  prompt: string
  conversationId?: string | null
  createdAt: string
}

const router = useRouter()
const route = useRoute()
const studio = useStudioStore()

const open = ref(false)
const loading = ref(false)
const busyId = ref('')
const error = ref('')
const jobs = ref<TaskJob[]>([])
const activeStatuses = new Set<TaskJob['status']>(['QUEUED', 'RUNNING'])
const retryStatuses = new Set<TaskJob['status']>(['FAILED', 'CANCELLED'])
const kindLabel: Record<TaskJob['kind'], string> = { CHAT: '对话', IMAGE: '图片生成', VIDEO: '视频生成', COMMERCE: '商品视觉' }
const statusLabel = generationStatusText
const activeCount = computed(() => jobs.value.filter((job) => activeStatuses.has(job.status)).length)
let timer: number | undefined

async function load() {
  loading.value = true
  error.value = ''
  try {
    jobs.value = (await api<TaskJob[]>('/generations')).slice(0, 30)
    await studio.refreshConversations().catch(() => undefined)
  }
  catch (reason) { error.value = reason instanceof Error ? reason.message : '任务读取失败' }
  finally { loading.value = false }
}

async function toggle() {
  open.value = !open.value
  if (open.value) await load()
}

async function cancel(job: TaskJob) {
  busyId.value = job.id
  try { await api(`/generations/${job.id}/cancel`, { method: 'POST' }); await load() }
  catch (reason) { error.value = reason instanceof Error ? reason.message : '停止任务失败' }
  finally { busyId.value = '' }
}

async function retry(job: TaskJob) {
  busyId.value = job.id
  try { await api(`/generations/${job.id}/retry`, { method: 'POST' }); await load() }
  catch (reason) { error.value = reason instanceof Error ? reason.message : '重试任务失败' }
  finally { busyId.value = '' }
}

function jobTitle(job: TaskJob) {
  if (job.conversationId) {
    const conversation = [...studio.conversations, ...studio.archivedConversations].find((item) => item.id === job.conversationId)
    if (conversation?.title.trim()) return conversation.title
  }
  return job.prompt.trim() || kindLabel[job.kind]
}

async function openJob(job: TaskJob) {
  open.value = false
  error.value = ''
  try {
    const loaded = await studio.loadGeneration(job.id)
    const conversationId = loaded?.conversationId || job.conversationId || ''
    const path = '/chat'
    const nextQuery = conversationId
      ? { conversation: conversationId, generation: job.id }
      : { generation: job.id }
    const sameRoute = route.path === path && route.query.conversation === (conversationId || undefined) && route.query.generation === job.id
    if (!sameRoute) await router.push({ path, query: nextQuery })
    if (conversationId) {
      await studio.openConversation(conversationId)
      if (studio.currentConversationId === conversationId) void studio.resumeCurrentChat()
    }
    await studio.refreshConversations().catch(() => undefined)
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '打开任务失败'
    open.value = true
  }
}

const formatTime = (value: string) => formatDayTime(value)

function closeOnOutside(event: PointerEvent) {
  const target = event.target as HTMLElement | null
  if (target?.closest('.workspace-task-center')) return
  open.value = false
}
function closeOnEscape(event: KeyboardEvent) {
  if (event.key === 'Escape') open.value = false
}
function close() { open.value = false }

onMounted(() => {
  void load()
  timer = window.setInterval(() => { if (open.value || activeCount.value) void load() }, 5000)
  document.addEventListener('pointerdown', closeOnOutside)
  document.addEventListener('keydown', closeOnEscape)
  document.addEventListener('xinyue:close-popovers', close)
})
onBeforeUnmount(() => {
  if (timer) window.clearInterval(timer)
  document.removeEventListener('pointerdown', closeOnOutside)
  document.removeEventListener('keydown', closeOnEscape)
  document.removeEventListener('xinyue:close-popovers', close)
})
</script>
