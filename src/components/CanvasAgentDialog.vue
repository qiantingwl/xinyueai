<template>
  <div class="canvas-modal-backdrop canvas-agent-backdrop" @click.self="close">
    <section class="canvas-agent-dialog" role="dialog" aria-modal="true" aria-labelledby="canvas-agent-title">
      <header>
        <div><span>CANVAS AGENT</span><h2 id="canvas-agent-title">让 Agent 整理当前画布</h2><p>Agent 只生成操作计划，确认后才会修改节点。</p></div>
        <button type="button" aria-label="关闭画布 Agent" @click="close"><X :size="19" /></button>
      </header>

      <div v-if="!result" class="canvas-agent-form">
        <label>任务目标
          <div class="canvas-agent-goal-wrap" @dragover.prevent="dragActive = true" @dragleave="dragActive = false" @drop.prevent="handleDrop" :class="{ 'is-dragging': dragActive }">
            <textarea v-model="goal" maxlength="4000" rows="6" placeholder="描述你想让 Agent 如何操作画布，输入 @ 可引用节点。" @input="handleGoalInput" @keydown="handleGoalKeydown" @paste="handlePaste" />
            <div v-if="mentionOpen" class="canvas-agent-mention-picker" role="listbox">
              <button v-for="node in mentionCandidates" :key="node.id" type="button" role="option" @mousedown.prevent="selectMention(node)"><span class="canvas-agent-mention-icon">{{ node.type === 'IMAGE' ? '▧' : node.type === 'VIDEO' ? '▶' : 'T' }}</span><span><strong>{{ node.title || '未命名节点' }}</strong><small>{{ node.type === 'CONFIG' ? '生成设置' : node.type === 'TEXT' ? '文本' : node.type === 'IMAGE' ? '图片' : node.type === 'VIDEO' ? '视频' : node.type }}</small></span></button>
            </div>
            <span v-if="dragActive" class="canvas-agent-drop-hint">松开以上传图片或视频</span>
          </div>
        </label>
        <div class="canvas-agent-attachments">
          <div class="canvas-agent-attachments-heading"><span><Paperclip :size="13" />参考素材 <em>{{ attachments.length }}/20</em></span><button type="button" :disabled="uploading || attachments.length >= 20" @click="attachmentInput?.click()"><LoaderCircle v-if="uploading" class="canvas-spin" :size="13" /><span v-else>上传素材</span></button><input ref="attachmentInput" hidden type="file" accept="image/*,video/*" multiple @change="handleFileInput" /></div>
          <div v-if="attachments.length" class="canvas-agent-attachment-list"><div v-for="attachment in attachments" :key="attachment.id" class="canvas-agent-attachment"><img v-if="attachment.kind === 'IMAGE' && attachment.contentUrl" :src="attachment.contentUrl" :alt="attachment.name" /><span v-else class="canvas-agent-attachment-fallback">{{ attachment.kind === 'VIDEO' ? 'VID' : 'FILE' }}</span><span>{{ attachment.name }}</span><button type="button" :aria-label="`移除${attachment.name}`" @click="removeAttachment(attachment.id)"><X :size="12" /></button></div></div>
          <p v-else class="canvas-agent-attachment-empty">可拖入或粘贴图片、视频作为参考素材</p>
        </div>
        <div class="canvas-agent-options">
          <div class="canvas-agent-model-field">
            <span>Agent 模型</span>
            <button ref="modelTrigger" type="button" class="canvas-agent-model-trigger" :aria-expanded="modelPickerOpen" @click="toggleModelPicker">
              <Bot :size="15" /><span class="canvas-agent-model-trigger-copy"><strong>{{ selectedModel?.displayName || '选择可用模型' }}</strong><small v-if="selectedModel">{{ agentModelDescription(selectedModel) }}</small></span><ChevronDown :size="14" />
            </button>
          </div>
          <label class="canvas-agent-web-toggle"><input v-model="webSearchEnabled" type="checkbox" /><span><Globe2 :size="16" /><strong>联网搜索</strong><small>需要外部资料时允许检索网页</small></span></label>
        </div>
        <div class="canvas-agent-context"><span><Network :size="15" />{{ document.nodes.length }} 个节点 · {{ document.edges.length }} 条连接</span><span><Paperclip :size="15" />{{ attachmentIds.length }} 个素材附件</span><span v-if="mentionedNodeIds.length">已引用 {{ mentionedNodeIds.length }} 个节点</span></div>
        <p v-if="error" class="canvas-agent-error" role="alert">{{ error }}</p>
      </div>

      <div v-else class="canvas-agent-result">
        <div class="canvas-agent-summary"><CheckCircle2 :size="20" /><div><strong>{{ result.summary || '操作计划已生成' }}</strong><span>{{ result.operations.length }} 项变更等待确认</span></div></div>
        <ol v-if="result.operations.length" class="canvas-agent-operation-list">
          <li v-for="(operation, index) in result.operations" :key="`${operation.type}-${index}`"><span>{{ index + 1 }}</span><div><strong>{{ operationLabel(operation) }}</strong><small>{{ operationDetail(operation) }}</small></div></li>
        </ol>
        <div v-else class="canvas-agent-empty"><CircleAlert :size="22" /><strong>Agent 没有返回可执行变更</strong><span>可以返回修改目标后重新运行。</span></div>
        <p v-if="error" class="canvas-agent-error" role="alert">{{ error }}</p>
      </div>

      <section v-if="task" class="canvas-agent-runtime" :data-status="task.status" aria-live="polite">
        <div class="canvas-agent-runtime-heading">
          <div class="canvas-agent-runtime-status"><LoaderCircle v-if="running" class="canvas-spin" :size="16" /><CheckCircle2 v-else-if="task.status === 'SUCCEEDED'" :size="16" /><CircleAlert v-else-if="terminalFailure" :size="16" /><Bot v-else :size="16" /><strong>{{ statusLabel }}</strong></div>
          <span v-if="task.agentRun" class="canvas-agent-runtime-meta">第 {{ task.agentRun.iteration + 1 }} 轮 · {{ task.agentRun.creditCost }} 点</span>
        </div>
        <p v-if="activeStep" class="canvas-agent-runtime-detail"><LoaderCircle class="canvas-spin" :size="13" />{{ activeStep.detail || activeStep.title }}</p>
        <div v-if="task.agentRun?.finalAnswer && !result" class="canvas-agent-draft"><div class="canvas-agent-draft-title"><Sparkles :size="13" />当前交付草稿</div><pre>{{ task.agentRun.finalAnswer }}</pre></div>
        <ol v-if="task.steps?.length" class="canvas-agent-step-list"><li v-for="step in task.steps" :key="step.id" :data-status="step.status"><i /><span><strong>{{ step.title }}</strong><small v-if="step.detail">{{ step.detail }}</small></span></li></ol>
        <div v-if="timelineEvents.length" class="canvas-agent-event-log">
          <div class="canvas-agent-event-log-title"><Clock3 :size="13" />执行记录</div>
          <article v-for="event in timelineEvents" :key="event.id" class="canvas-agent-event" :data-type="event.type"><span class="canvas-agent-event-dot" /><div><strong>{{ event.title }}</strong><small v-if="event.detail">{{ event.detail }}</small></div></article>
        </div>
        <div v-if="pendingToolCalls.length" class="canvas-agent-approval-list">
          <div class="canvas-agent-approval-title"><ShieldCheck :size="14" />需要你的确认</div>
          <article v-for="call in pendingToolCalls" :key="call.id" class="canvas-agent-approval-card"><div><strong>{{ call.name }}</strong><small>{{ toolCallDetail(call) }}</small></div><div class="canvas-agent-approval-actions"><button type="button" @click="reviewToolCall(call.id, 'REJECTED')">拒绝</button><button type="button" class="is-primary" @click="reviewToolCall(call.id, 'APPROVED')">批准继续</button></div></article>
        </div>
        <div v-if="terminalFailure" class="canvas-agent-runtime-error"><CircleAlert :size="15" /><span>{{ task.errorMessage || '任务未能完成，请重试。' }}</span><button type="button" @click="retryTask"><RotateCcw :size="14" />重新执行</button></div>
      </section>

      <footer>
        <button v-if="running" type="button" @click="cancelTask">停止</button>
        <button v-else type="button" @click="result ? reset() : close()">{{ result ? '重新设置' : '取消' }}</button>
        <button v-if="!result" class="is-primary" type="button" :disabled="running || !goal.trim() || !model" @click="runAgent"><Sparkles :size="16" />{{ running ? 'Agent 执行中' : '生成操作计划' }}</button>
        <button v-else class="is-primary" type="button" :disabled="!result.operations.length" @click="apply"><Check :size="16" />应用 {{ result.operations.length }} 项变更</button>
      </footer>
    </section>
    <Teleport to="body">
      <div v-if="modelPickerOpen" class="canvas-agent-model-picker canvas-agent-model-picker--floating" :style="modelPickerStyle" @click.stop>
        <ModelCatalogPicker v-model="model" :models="agentModels" title="选择 Agent 模型" description-mode="agent" @select="modelPickerOpen = false" @close="modelPickerOpen = false" />
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { Bot, Check, CheckCircle2, ChevronDown, CircleAlert, Clock3, Globe2, LoaderCircle, Network, Paperclip, RotateCcw, ShieldCheck, Sparkles, X } from 'lucide-vue-next'
import { api, streamApiEvents } from '../services/api'
import { uploadAsset } from '../utils/asset-upload'
import type { CanvasAgentOperation, CanvasAgentOperationType, CanvasDocumentPayload } from '../types/canvas'
import { agentModelDescription, isAgentModelEligible, type CatalogModel } from '../utils/model-catalog'
import { agentTaskStatusText, withOverrides } from '../utils/status-labels'
import ModelCatalogPicker from './ModelCatalogPicker.vue'
import { useEscapeClose } from '../composables/useEscapeClose'

type AgentStep = { id: string; title: string; detail?: string | null; status: string }
type AgentEvent = { id: string; type: string; title: string; detail?: string | null; createdAt?: string }
type AgentToolCall = { id: string; name: string; key: string; input?: unknown; status: string; requiresApproval: boolean; approvalStatus: string; error?: string | null }
type AgentTask = { id: string; status: string; model?: string; errorMessage?: string | null; steps: AgentStep[]; agentRun?: { iteration: number; creditCost: number; finalAnswer?: string; events?: AgentEvent[]; toolCalls?: AgentToolCall[] } | null }
type AgentAttachment = { id: string; name: string; kind: 'IMAGE' | 'VIDEO'; contentUrl?: string }
type AgentResult = { summary: string; operations: CanvasAgentOperation[] }

const props = withDefaults(defineProps<{ canvasId: string; canvasTitle: string; projectId?: string; document: CanvasDocumentPayload; models: CatalogModel[]; initialGoal?: string; initialModel?: string; initialPluginId?: string; initialTaskId?: string; smartPlanning?: boolean; generationCount?: number }>(), { initialGoal: '', initialModel: '', initialPluginId: '', initialTaskId: '', smartPlanning: true, generationCount: 1 })
const emit = defineEmits<{ close: []; apply: [operations: CanvasAgentOperation[]] }>()
const allowedTypes = new Set<CanvasAgentOperationType>(['add_text', 'add_image', 'add_video', 'update_node', 'connect_nodes', 'move_node', 'delete_node', 'run_generation'])
const agentModels = computed(() => props.models.filter(isAgentModelEligible))
const goal = ref(props.initialGoal)
const model = ref(props.initialModel && agentModels.value.some((item) => item.key === props.initialModel) ? props.initialModel : agentModels.value.find((item) => item.isDefault)?.key || agentModels.value[0]?.key || '')
const modelPickerOpen = ref(false)
// 模型选择器浮在对话框之上，Esc 先关它，再关对话框。
useEscapeClose(close, { enabled: () => !modelPickerOpen.value })
const modelTrigger = ref<HTMLButtonElement | null>(null)
const modelPickerStyle = ref({ top: '12px', left: '12px' })
const selectedModel = computed(() => agentModels.value.find((item) => item.key === model.value))
const webSearchEnabled = ref(false)
const running = ref(false)
const error = ref('')
const task = ref<AgentTask | null>(null)
const result = ref<AgentResult | null>(null)
const attachments = ref<AgentAttachment[]>(props.document.nodes.filter((node) => node.data.assetId && (node.data.kind === 'IMAGE' || node.data.kind === 'VIDEO')).map((node) => ({ id: node.data.assetId!, name: node.data.title || '画布素材', kind: node.data.kind as 'IMAGE' | 'VIDEO', contentUrl: node.data.url })).slice(0, 20))
const attachmentInput = ref<HTMLInputElement | null>(null)
const uploading = ref(false)
const dragActive = ref(false)
const attachmentIds = computed(() => [...new Set([...attachments.value.map((item) => item.id), ...props.document.nodes.flatMap((node) => node.data.assetId ? [node.data.assetId] : [])])].slice(0, 20))
const mentionedNodeIds = ref<string[]>([])
const mentionOpen = ref(false)
const mentionQuery = ref('')
const mentionStart = ref(-1)
const mentionCursor = ref(0)
const mentionCandidates = computed(() => {
  const query = mentionQuery.value.trim().toLowerCase()
  return props.document.nodes.filter((node) => !query || `${node.title} ${node.type} ${node.data.content || ''}`.toLowerCase().includes(query)).slice(0, 8)
})
// 画布 Agent 的文案刻意比通用任务更具体（如「正在分析画布」），其余状态沿用统一文案。
const canvasAgentStatusText = withOverrides(agentTaskStatusText, {
  DRAFT: '准备任务',
  QUEUED: '等待执行',
  RUNNING: '正在分析画布',
  WAITING_APPROVAL: '等待审批',
  SUCCEEDED: '计划已完成',
  PARTIAL: '计划部分完成',
  FAILED: '执行失败',
})
const statusLabel = computed(() => canvasAgentStatusText[task.value?.status || 'DRAFT'] || '处理中')
const terminalFailure = computed(() => Boolean(task.value && ['FAILED', 'CANCELLED'].includes(task.value.status)))
const activeStep = computed(() => task.value?.steps?.find((step) => step.status === 'RUNNING') || task.value?.steps?.find((step) => step.status === 'PENDING') || null)
const timelineEvents = computed(() => (task.value?.agentRun?.events || []).slice().sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || ''))).slice(-14))
const pendingToolCalls = computed(() => (task.value?.agentRun?.toolCalls || []).filter((call) => call.requiresApproval && call.approvalStatus === 'PENDING'))

onMounted(() => {
  document.addEventListener('pointerdown', closeModelPickerOnOutside)
  if (props.initialTaskId) void loadExistingTask(props.initialTaskId)
})
onBeforeUnmount(() => { document.removeEventListener('pointerdown', closeModelPickerOnOutside) })

function closeModelPickerOnOutside(event: PointerEvent) {
  const target = event.target as HTMLElement | null
  if (target?.closest('.canvas-agent-model-trigger, .canvas-agent-model-picker')) return
  modelPickerOpen.value = false
}

async function loadExistingTask(taskId: string) {
  try {
    task.value = await api<AgentTask>(`/agent-tasks/${taskId}`)
    if (task.value.model && agentModels.value.some((item) => item.key === task.value?.model)) model.value = task.value.model
    if (['SUCCEEDED', 'PARTIAL'].includes(task.value.status)) result.value = parseResult(task.value.agentRun?.finalAnswer || '')
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '无法读取历史 Agent 任务'
  }
}

async function toggleModelPicker() {
  modelPickerOpen.value = !modelPickerOpen.value
  if (!modelPickerOpen.value) return
  await nextTick()
  const trigger = modelTrigger.value?.getBoundingClientRect()
  if (!trigger) return
  const width = Math.min(704, Math.max(280, window.innerWidth - 24))
  const estimatedHeight = Math.min(560, Math.max(320, window.innerHeight - 24))
  const left = Math.max(12, Math.min(trigger.right - width, window.innerWidth - width - 12))
  const below = trigger.bottom + 8
  const top = below + estimatedHeight <= window.innerHeight - 12
    ? below
    : Math.max(12, trigger.top - estimatedHeight - 8)
  modelPickerStyle.value = { top: `${Math.round(top)}px`, left: `${Math.round(left)}px` }
}

function handleGoalInput(event: Event) {
  const input = event.target as HTMLTextAreaElement
  const cursor = input.selectionStart ?? goal.value.length
  const before = goal.value.slice(0, cursor)
  const match = before.match(/(^|\s)@([^\s@]*)$/)
  if (!match) { mentionOpen.value = false; mentionStart.value = -1; return }
  mentionQuery.value = match[2] || ''
  mentionOpen.value = mentionCandidates.value.length > 0
  mentionStart.value = cursor - (match[2]?.length || 0) - 1
  mentionCursor.value = cursor
}

function handleGoalKeydown(event: KeyboardEvent) {
  if (!mentionOpen.value || event.isComposing) return
  if (event.key === 'Escape') { event.preventDefault(); mentionOpen.value = false; return }
  if (event.key === 'Enter' || event.key === 'Tab') {
    const first = mentionCandidates.value[0]
    if (first) { event.preventDefault(); selectMention(first) }
  }
}

function selectMention(node: CanvasDocumentPayload['nodes'][number]) {
  const start = mentionStart.value >= 0 ? mentionStart.value : goal.value.length
  const before = goal.value.slice(0, start)
  const cursor = mentionCursor.value || goal.value.length
  const after = goal.value.slice(cursor)
  goal.value = `${before}@${node.title || node.id} ${after}`
  if (!mentionedNodeIds.value.includes(node.id)) mentionedNodeIds.value.push(node.id)
  mentionOpen.value = false
  mentionQuery.value = ''
  mentionStart.value = -1
}

function handlePaste(event: ClipboardEvent) {
  const files = [...(event.clipboardData?.files || [])]
  if (!files.length) return
  event.preventDefault()
  void uploadFiles(files)
}

function handleDrop(event: DragEvent) {
  dragActive.value = false
  const files = [...(event.dataTransfer?.files || [])]
  if (files.length) void uploadFiles(files)
}

function handleFileInput(event: Event) {
  const input = event.target as HTMLInputElement
  const files = [...(input.files || [])]
  input.value = ''
  if (files.length) void uploadFiles(files)
}

async function uploadFiles(files: File[]) {
  if (uploading.value || attachments.value.length >= 20) return
  const available = 20 - attachments.value.length
  const accepted = files.filter((file) => file.type.startsWith('image/') || file.type.startsWith('video/')).slice(0, available)
  if (!accepted.length) { error.value = '只支持上传图片或视频作为参考素材'; return }
  uploading.value = true
  error.value = ''
  try {
    for (const file of accepted) {
      const kind = file.type.startsWith('video/') ? 'VIDEO' : 'IMAGE'
      const asset = await uploadAsset<{ id: string; name?: string; contentUrl?: string }>(file, { kind, purpose: 'attachment', projectId: props.projectId })
      attachments.value.push({ id: asset.id, name: asset.name || file.name, kind, contentUrl: asset.contentUrl || `/v1/assets/${asset.id}/content` })
    }
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '参考素材上传失败'
  } finally { uploading.value = false }
}

function removeAttachment(id: string) {
  attachments.value = attachments.value.filter((item) => item.id !== id)
}

async function runAgent() {
  if (!goal.value.trim() || !model.value || running.value) return
  modelPickerOpen.value = false
  running.value = true
  error.value = ''
  result.value = null
  try {
    const created = await api<AgentTask>('/agent-tasks', {
      method: 'POST',
      body: JSON.stringify({
        title: `画布 Agent · ${props.canvasTitle}`.slice(0, 120),
        goal: goal.value.trim(),
        model: model.value,
        projectId: props.projectId || undefined,
        attachmentIds: attachmentIds.value,
        webSearchEnabled: webSearchEnabled.value,
        pluginId: props.initialPluginId || undefined,
        instructions: agentInstructions(),
      }),
    })
    task.value = created
    task.value = await api<AgentTask>(`/agent-tasks/${created.id}/run`, { method: 'POST' })
    const completed = await followTask(created.id)
    if (completed.status === 'RUNNING') throw new Error('Agent 仍在执行，已超出前端等待时间；可稍后在「历史」中查看结果')
    if (!['SUCCEEDED', 'PARTIAL'].includes(completed.status)) throw new Error(completed.errorMessage || 'Agent 未能完成画布分析')
    result.value = parseResult(completed.agentRun?.finalAnswer || '')
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '画布 Agent 执行失败'
  } finally { running.value = false }
}

async function followTask(taskId: string) {
  let latest = task.value
  let lastError: unknown
  // Agent 编排含多轮 LLM 调用，常需 1-3 分钟：轮询放宽到 ~5 分钟，避免前端过早误报失败
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const streamed = await streamApiEvents<AgentTask>(`/agent-tasks/${taskId}/events`, (current) => { task.value = current; latest = current })
      latest = streamed
      task.value = streamed
    } catch (reason) {
      lastError = reason
    }
    if (latest && ['SUCCEEDED', 'PARTIAL', 'FAILED', 'CANCELLED'].includes(latest.status)) return latest
    try {
      const snapshot = await api<AgentTask>(`/agent-tasks/${taskId}`)
      latest = snapshot
      task.value = snapshot
      if (['SUCCEEDED', 'PARTIAL', 'FAILED', 'CANCELLED'].includes(snapshot.status)) return snapshot
    } catch (reason) {
      lastError = reason
    }
    await new Promise<void>((resolve) => window.setTimeout(resolve, Math.min(1500 + attempt * 250, 5000)))
  }
  if (latest) return latest
  throw (lastError instanceof Error ? lastError : new Error('无法读取 Agent 任务状态'))
}

function agentInstructions() {
  const compact = {
    canvasId: props.canvasId,
    kind: props.document.nodes.some((node) => node.data.dramaStage) ? 'SHORT_DRAMA' : 'FREEFORM',
    nodes: props.document.nodes.slice(0, 100).map((node) => ({ id: node.id, type: node.type, title: node.title, content: node.data.content?.slice(0, 1200) || '', prompt: node.data.prompt?.slice(0, 800) || '', x: Math.round(node.position.x), y: Math.round(node.position.y), dramaRole: node.data.dramaRole, shotId: node.data.shotId })),
    edges: props.document.edges.slice(0, 200).map(({ source, target, label }) => ({ source, target, label })),
  }
  const references = mentionedNodeIds.value.length ? `\n用户明确引用的画布节点 ID：${mentionedNodeIds.value.join(', ')}` : ''
  return `你正在为 Xinyue AI 无限画布制定变更计划。只在最终答案输出一个 JSON 对象，不要 Markdown、解释或代码围栏。\n格式：{"summary":"一句话摘要","operations":[{"type":"add_text|add_image|add_video|update_node|connect_nodes|move_node|delete_node|run_generation","tempId":"新增节点临时 ID","nodeId":"已有节点或临时 ID","source":"源节点 ID","target":"目标节点 ID","title":"标题","content":"文本内容","prompt":"生成提示词","x":0,"y":0}]}。\n规则：最多 20 项；不得引用不存在的已有节点；新增节点必须有唯一 tempId；生成媒体应先创建或更新提示词并正确连接；只有用户明确要求时才能 delete_node 或 run_generation；不要编造已生成的图片或视频。\n执行偏好：${props.smartPlanning ? '先分析画布关系，再给出最小可执行计划。' : '直接按用户目标生成可执行计划。'} 本轮生成数量偏好：${props.generationCount}。${references}\n当前画布：${JSON.stringify(compact).slice(0, 15000)}`
}

function parseResult(answer: string): AgentResult {
  const source = answer.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  const start = source.indexOf('{')
  const end = source.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('Agent 返回的操作计划格式不正确，请调整目标后重试')
  const parsed = JSON.parse(source.slice(start, end + 1)) as { summary?: unknown; operations?: unknown }
  const operations = Array.isArray(parsed.operations) ? parsed.operations.slice(0, 20).flatMap((value) => normalizeOperation(value)) : []
  return { summary: typeof parsed.summary === 'string' ? parsed.summary.slice(0, 500) : '', operations }
}

function normalizeOperation(value: unknown): CanvasAgentOperation[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return []
  const raw = value as Record<string, unknown>
  const type = String(raw.type || '') as CanvasAgentOperationType
  if (!allowedTypes.has(type)) return []
  const text = (key: string, max = 4000) => typeof raw[key] === 'string' ? String(raw[key]).trim().slice(0, max) || undefined : undefined
  const number = (key: string) => typeof raw[key] === 'number' && Number.isFinite(raw[key]) ? Math.max(-1_000_000, Math.min(1_000_000, raw[key])) : undefined
  return [{ type, tempId: text('tempId', 100), nodeId: text('nodeId', 100), source: text('source', 100), target: text('target', 100), title: text('title', 120), content: text('content'), prompt: text('prompt'), x: number('x'), y: number('y') }]
}

async function cancelTask() {
  if (!task.value || !running.value) return
  try { task.value = await api<AgentTask>(`/agent-tasks/${task.value.id}/cancel`, { method: 'POST' }) }
  finally { running.value = false }
}

async function retryTask() {
  if (!task.value || running.value) return
  running.value = true
  error.value = ''
  result.value = null
  try {
    task.value = await api<AgentTask>(`/agent-tasks/${task.value.id}/retry`, { method: 'POST' })
    const completed = await followTask(task.value.id)
    if (completed.status === 'RUNNING') throw new Error('Agent 仍在执行，已超出前端等待时间；可稍后在「历史」中查看结果')
    if (!['SUCCEEDED', 'PARTIAL'].includes(completed.status)) throw new Error(completed.errorMessage || 'Agent 未能完成画布分析')
    result.value = parseResult(completed.agentRun?.finalAnswer || '')
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '画布 Agent 重试失败'
  } finally { running.value = false }
}

async function reviewToolCall(callId: string, decision: 'APPROVED' | 'REJECTED') {
  if (!task.value) return
  try {
    task.value = await api<AgentTask>(`/agent-tasks/${task.value.id}/tool-calls/${callId}/review`, { method: 'POST', body: JSON.stringify({ decision }) })
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '无法更新工具审批状态'
  }
}

function apply() { if (result.value?.operations.length) emit('apply', result.value.operations) }
function close() { if (!running.value) { modelPickerOpen.value = false; emit('close') } }
function reset() { modelPickerOpen.value = false; result.value = null; task.value = null; error.value = '' }
function operationLabel(operation: CanvasAgentOperation) { return ({ add_text: '新增文本节点', add_image: '新增图片节点', add_video: '新增视频节点', update_node: '更新节点', connect_nodes: '连接节点', move_node: '移动节点', delete_node: '删除节点', run_generation: '执行生成' } as Record<CanvasAgentOperationType, string>)[operation.type] }
function operationDetail(operation: CanvasAgentOperation) { return operation.title || operation.content?.slice(0, 90) || operation.prompt?.slice(0, 90) || [operation.source, operation.target].filter(Boolean).join(' → ') || operation.nodeId || operation.tempId || '按当前画布上下文执行' }
function toolCallDetail(call: AgentToolCall) {
  if (call.input && typeof call.input === 'object' && !Array.isArray(call.input)) {
    const input = call.input as Record<string, unknown>
    const query = typeof input.query === 'string' ? input.query : typeof input.q === 'string' ? input.q : ''
    if (query) return query.slice(0, 180)
  }
  return '该工具将读取当前任务所需的外部资料或素材。'
}
</script>
