<template>
  <main class="office-center" :class="{ 'has-result': conversationId }">
    <header class="office-header">
      <div><BriefcaseBusiness :size="18" /><strong>办公中心</strong></div>
      <div class="office-header__actions">
        <button v-if="auth.isAuthenticated && taskMode === 'agent'" type="button" :class="{ active: schedulePanelOpen }" @click="toggleSchedules"><CalendarClock :size="16" />定时任务</button>
        <button v-if="auth.isAuthenticated" type="button" :class="{ active: historyOpen }" @click="toggleHistory"><History :size="16" />任务记录</button>
        <button v-if="conversationId" type="button" :disabled="generating" @click="startNewTask"><SquarePen :size="17" />新工作任务</button>
      </div>
    </header>

    <aside v-if="historyOpen" class="office-history" aria-label="任务记录">
      <header><div><strong>{{ archivedTasksVisible ? '已归档任务' : '任务记录' }}</strong><small>{{ archivedTasksVisible ? '可恢复到当前任务列表' : '关闭页面后，任务仍会继续执行' }}</small></div><span><button type="button" :title="archivedTasksVisible ? '查看当前任务' : '查看归档'" @click="toggleArchivedTasks"><ArchiveRestore v-if="archivedTasksVisible" :size="16" /><Archive v-else :size="16" /></button><button type="button" aria-label="关闭任务记录" @click="historyOpen = false"><X :size="17" /></button></span></header>
      <div v-if="historyLoading" class="office-history__empty"><LoaderCircle class="office-spin" :size="18" />正在加载</div>
      <div v-else-if="!agentTasks.length" class="office-history__empty">暂无任务记录</div>
      <div v-else class="office-history__list">
        <article v-for="task in agentTasks" :key="task.id" :class="{ active: activeAgentTaskId === task.id }">
          <button type="button" @click="openAgentTask(task.id)"><span><strong>{{ task.title }}</strong><small>{{ formatTaskTime(task.updatedAt) }}</small></span><em :data-status="task.status">{{ agentStatusLabel(task.status) }}</em></button>
          <button type="button" aria-label="任务操作" @click="toggleTaskMenu(task.id)"><MoreHorizontal :size="16" /></button>
          <div v-if="taskMenuId === task.id" class="office-task-menu">
            <button v-if="!archivedTasksVisible" type="button" @click="duplicateTask(task)"><Copy :size="14" />创建副本</button>
            <button v-if="!archivedTasksVisible && ['FAILED', 'CANCELLED', 'SUCCEEDED'].includes(task.status)" type="button" @click="retryTask(task)"><RotateCcw :size="14" />重新执行</button>
            <button type="button" @click="setTaskArchived(task, !archivedTasksVisible)"><ArchiveRestore v-if="archivedTasksVisible" :size="14" /><Archive v-else :size="14" />{{ archivedTasksVisible ? '恢复' : '归档' }}</button>
            <button type="button" class="danger" @click="deleteTask(task)"><Trash2 :size="14" />删除</button>
          </div>
        </article>
      </div>
    </aside>

    <aside v-if="schedulePanelOpen" class="office-history office-schedules" aria-label="定时任务">
      <header><div><strong>定时任务</strong><small>由服务端可靠调度，关闭页面仍会执行</small></div><button type="button" aria-label="关闭定时任务" @click="schedulePanelOpen = false"><X :size="17" /></button></header>
      <div class="office-schedule-body">
        <form class="office-schedule-form" @submit.prevent="saveSchedule">
          <input v-model.trim="scheduleForm.title" maxlength="120" placeholder="计划名称" required />
          <textarea v-model.trim="scheduleForm.goal" maxlength="20000" rows="3" placeholder="每次执行的任务目标" required />
          <select v-model="scheduleForm.preset" @change="applySchedulePreset"><option value="daily">每天 09:00</option><option value="weekday">工作日 09:00</option><option value="weekly">每周一 09:00</option><option value="monthly">每月 1 日 09:00</option><option value="custom">自定义 Cron</option></select>
          <input v-if="scheduleForm.preset === 'custom'" v-model.trim="scheduleForm.cronExpression" placeholder="0 9 * * *" required />
          <button type="submit" :disabled="scheduleSaving || !model"><LoaderCircle v-if="scheduleSaving" class="office-spin" :size="15" /><CalendarPlus v-else :size="15" />创建计划</button>
        </form>
        <div v-if="scheduleLoading" class="office-history__empty"><LoaderCircle class="office-spin" :size="17" />正在加载</div>
        <div v-else-if="!agentSchedules.length" class="office-history__empty">暂无定时任务</div>
        <div v-else class="office-schedule-list"><article v-for="schedule in agentSchedules" :key="schedule.id"><div><strong>{{ schedule.title }}</strong><small>{{ schedule.cronExpression }} · {{ schedule.timezone }}</small><small>下次 {{ schedule.nextRunAt ? formatTaskTime(schedule.nextRunAt) : '未安排' }}</small></div><span><button type="button" title="立即执行" @click="runSchedule(schedule)"><Play :size="14" /></button><button type="button" title="启用或停用" @click="toggleSchedule(schedule)"><Pause v-if="schedule.enabled" :size="14" /><Play v-else :size="14" /></button><button type="button" title="删除" @click="deleteSchedule(schedule)"><Trash2 :size="14" /></button></span></article></div>
      </div>
    </aside>

    <section v-if="!conversationId" class="office-welcome">
      <div class="office-welcome__copy">
        <span>WORKSPACE</span>
        <h1>今天要处理什么工作？</h1>
        <p>选择一项办公能力，或直接描述需要交付的结果。</p>
      </div>
      <div class="office-recommendations" aria-label="推荐办公能力">
        <span>为你推荐</span>
        <button v-for="skill in recommendedSkills" :key="skill.id" type="button" @click="selectSkill(skill)">
          <component :is="skill.icon" :size="17" :style="{ color: skill.color }" />
          <strong>{{ skill.name }}</strong>
          <small>{{ skill.shortDescription }}</small>
          <ChevronRight :size="16" />
        </button>
      </div>
    </section>

    <section v-else ref="resultThread" class="office-result" aria-live="polite">
      <div class="office-result__inner">
        <article v-if="submittedPrompt" class="office-user-message">{{ submittedPrompt }}</article>
        <article class="office-assistant-message">
          <header><span><component :is="selectedSkill.icon" :size="17" :style="{ color: selectedSkill.color }" /></span><strong>{{ selectedSkill.name }}</strong><small>{{ modeLabel }}</small></header>
          <nav v-if="activeAgentTask && !generating" class="office-result-actions"><button v-if="['FAILED', 'CANCELLED', 'SUCCEEDED'].includes(activeAgentTask.status)" type="button" @click="retryTask(activeAgentTask)"><RotateCcw :size="14" />重新执行</button><button type="button" @click="duplicateTask(activeAgentTask)"><Copy :size="14" />创建副本</button><button type="button" @click="setTaskArchived(activeAgentTask, true)"><Archive :size="14" />归档</button></nav>
          <ol v-if="taskMode === 'agent' && activeAgentTask?.steps.length" class="office-agent-steps">
            <li v-for="step in activeAgentTask.steps" :key="step.id" :data-status="step.status">
              <span><Check v-if="step.status === 'SUCCEEDED'" :size="13" /><X v-else-if="step.status === 'FAILED'" :size="13" /><LoaderCircle v-else-if="step.status === 'RUNNING'" class="office-spin" :size="13" /><span v-else /></span>
              <div><strong>{{ step.title }}</strong><small v-if="step.detail">{{ step.detail }}</small></div>
            </li>
          </ol>
          <section v-if="pendingToolCalls.length" class="office-approvals">
            <header><ShieldCheck :size="16" /><div><strong>需要你的确认</strong><small>批准后任务会从当前步骤继续执行</small></div></header>
            <article v-for="call in pendingToolCalls" :key="call.id">
              <div><strong>{{ call.name }}</strong><small>{{ toolCallSummary(call) }}</small></div>
              <span><button type="button" :disabled="reviewingCallId === call.id" @click="reviewToolCall(call.id, 'REJECTED')">拒绝</button><button class="primary" type="button" :disabled="reviewingCallId === call.id" @click="reviewToolCall(call.id, 'APPROVED')">允许</button></span>
            </article>
          </section>
          <details v-if="agentEvents.length" class="office-agent-events">
            <summary>执行记录 · {{ agentEvents.length }}</summary>
            <ol><li v-for="event in agentEvents" :key="event.id"><span /><div><strong>{{ event.title }}</strong><small v-if="event.detail">{{ event.detail }}</small></div></li></ol>
          </details>
          <section v-if="agentSources.length" class="office-agent-sources"><header><Globe2 :size="15" /><strong>参考来源</strong><small>{{ agentSources.length }}</small></header><div><a v-for="(source, index) in agentSources" :key="source.url" :href="source.url" target="_blank" rel="noopener noreferrer"><span>{{ index + 1 }}</span><strong>{{ source.title || source.url }}</strong><ExternalLink :size="13" /></a></div></section>
          <ChatMessageContent v-if="answer" :content="answer" />
          <div v-else class="office-thinking"><LoaderCircle :size="18" /><span>{{ taskMode === 'agent' ? '正在自主规划并执行任务' : '正在整理任务并生成结果' }}</span></div>
          <div v-if="answer && (exporting || deliverable)" class="office-deliverable">
            <span><component :is="deliverableIcon" :size="19" /></span>
            <div><strong>{{ deliverable?.name || '正在制作交付文件' }}</strong><small>{{ deliverable ? `${deliverableFormat} · 已保存到文件库` : '正在生成可编辑的 Office 文件' }}</small></div>
            <button v-if="deliverable" type="button" :disabled="downloading" @click="downloadDeliverable"><LoaderCircle v-if="downloading" class="office-spin" :size="15" /><Download v-else :size="16" />下载</button>
            <LoaderCircle v-else class="office-spin" :size="17" />
          </div>
          <footer v-if="answer">
            <button type="button" @click="copyAnswer"><Check v-if="copied" :size="15" /><Copy v-else :size="15" />{{ copied ? '已复制' : '复制' }}</button>
            <button v-if="!deliverable && !exporting" type="button" @click="createDeliverable"><Download :size="15" />生成交付文件</button>
          </footer>
        </article>
      </div>
    </section>

    <section class="office-composer-wrap">
      <div v-if="skillPanelOpen" class="office-skill-panel">
        <header><div><strong>办公技能</strong><small>{{ filteredSkills.length }} 项能力</small></div><button type="button" aria-label="关闭技能选择" @click="skillPanelOpen = false"><X :size="17" /></button></header>
        <label><Search :size="15" /><input v-model="skillQuery" placeholder="搜索办公技能" /></label>
        <nav aria-label="技能分类">
          <button v-for="category in categories" :key="category" type="button" :class="{ active: selectedCategory === category }" @click="selectedCategory = category">{{ category }}</button>
        </nav>
        <div class="office-skill-list">
          <button v-for="skill in filteredSkills" :key="skill.id" type="button" :class="{ active: selectedSkill.id === skill.id }" @click="selectSkill(skill)">
            <span><component :is="skill.icon" :size="17" :style="{ color: skill.color }" /></span>
            <span><strong>{{ skill.name }}</strong><small>{{ skill.description }}</small></span>
            <Check v-if="selectedSkill.id === skill.id" :size="16" />
          </button>
        </div>
      </div>

      <form class="office-composer" @submit.prevent="submitTask">
        <div v-if="attachments.length" class="office-attachments">
          <article v-for="(asset, index) in attachments" :key="asset.id" :class="officeHasImagePreview(asset) ? 'is-image' : 'is-file'">
            <img v-if="officeHasImagePreview(asset)" :src="asset.contentUrl" :alt="asset.title" />
            <template v-else><span><FileText :size="18" /></span><div><strong :title="asset.title">{{ asset.title }}</strong><small>{{ officeAttachmentMeta(asset) }}</small></div></template>
            <button type="button" :aria-label="`移除${asset.title}`" @click="attachments.splice(index, 1)"><X :size="13" /></button>
          </article>
        </div>
        <textarea ref="taskInput" v-model="prompt" rows="2" :placeholder="selectedSkill.placeholder" @focus="collapseOfficePopovers" @keydown="handleKeydown" />
        <footer>
          <div>
            <button type="button" aria-label="添加文件" title="添加文件" :disabled="uploading" @click="openFilePicker"><LoaderCircle v-if="uploading" class="office-spin" :size="18" /><Plus v-else :size="20" /></button>
            <span class="office-control-anchor">
              <button class="office-mode-button" type="button" :aria-expanded="modeMenuOpen" @click="toggleModeMenu"><Zap v-if="taskMode === 'fast'" :size="15" /><BrainCircuit v-else-if="taskMode === 'expert'" :size="15" /><Bot v-else :size="15" />{{ modeLabel }}<ChevronDown :size="13" /></button>
              <div v-if="modeMenuOpen" class="office-mode-menu">
                <button type="button" :class="{ active: taskMode === 'fast' }" @click="taskMode = 'fast'; modeMenuOpen = false"><Zap :size="16" /><span><strong>快速</strong><small>直接输出可用结果</small></span><Check v-if="taskMode === 'fast'" :size="15" /></button>
                <button type="button" :class="{ active: taskMode === 'expert' }" @click="taskMode = 'expert'; modeMenuOpen = false"><BrainCircuit :size="16" /><span><strong>专家</strong><small>先分析再交付完整方案</small></span><Check v-if="taskMode === 'expert'" :size="15" /></button>
                <button type="button" :class="{ active: taskMode === 'agent' }" @click="taskMode = 'agent'; modeMenuOpen = false"><Bot :size="16" /><span><strong>任务</strong><small>自主规划、执行并交付成品</small></span><Check v-if="taskMode === 'agent'" :size="15" /></button>
              </div>
            </span>
            <span class="office-control-anchor">
              <button class="office-model-button" type="button" :aria-expanded="modelMenuOpen" :disabled="!chatModels.length" @click="toggleModelMenu"><Sparkles :size="15" />{{ model || '暂无可用模型' }}<ChevronDown :size="13" /></button>
              <div v-if="modelMenuOpen" class="office-model-menu">
                <button v-for="item in chatModels" :key="item.key" type="button" :class="{ active: model === item.displayName }" @click="model = item.displayName; modelMenuOpen = false"><span><strong>{{ item.displayName }}</strong><small>{{ item.description || '办公任务模型' }}</small></span><Check v-if="model === item.displayName" :size="15" /></button>
              </div>
            </span>
            <span class="office-control-anchor">
              <button class="office-format-button" type="button" :aria-expanded="formatMenuOpen" title="选择交付文件格式" @click="toggleFormatMenu"><FileSpreadsheet v-if="exportFormat === 'xlsx'" :size="15" /><FileText v-else :size="15" />{{ exportFormatLabel }}<ChevronDown :size="13" /></button>
              <div v-if="formatMenuOpen" class="office-format-menu">
                <button type="button" :class="{ active: exportFormat === 'auto' }" @click="exportFormat = 'auto'; formatMenuOpen = false"><span><strong>自动格式</strong><small>根据办公技能选择文件类型</small></span><Check v-if="exportFormat === 'auto'" :size="15" /></button>
                <button type="button" :class="{ active: exportFormat === 'docx' }" @click="exportFormat = 'docx'; formatMenuOpen = false"><FileText :size="16" /><span><strong>Word</strong><small>生成可编辑的 DOCX 文档</small></span><Check v-if="exportFormat === 'docx'" :size="15" /></button>
                <button type="button" :class="{ active: exportFormat === 'xlsx' }" @click="exportFormat = 'xlsx'; formatMenuOpen = false"><FileSpreadsheet :size="16" /><span><strong>Excel</strong><small>生成可编辑的 XLSX 工作簿</small></span><Check v-if="exportFormat === 'xlsx'" :size="15" /></button>
              </div>
            </span>
            <button class="office-skill-button" :class="{ active: skillPanelOpen }" type="button" :aria-expanded="skillPanelOpen" @click="toggleSkillPanel"><Layers3 :size="16" />{{ selectedSkill.name }}<ChevronDown :size="13" /></button>
            <button v-if="taskMode === 'agent'" class="office-web-button" :class="{ active: webSearchEnabled }" type="button" :aria-pressed="webSearchEnabled" title="联网搜索" @click="webSearchEnabled = !webSearchEnabled"><Globe2 :size="16" />联网</button>
            <PluginSelector v-if="auth.isAuthenticated" v-model="pluginId" capability="OFFICE" compact />
          </div>
          <button class="office-submit" :type="generating ? 'button' : 'submit'" :disabled="canceling || (!generating && (!prompt.trim() || (auth.isAuthenticated && !model)))" :aria-label="generating ? '停止生成' : '提交任务'" @click="generating && cancelTask()"><LoaderCircle v-if="canceling" class="office-spin" :size="16" /><Square v-else-if="generating" :size="13" fill="currentColor" /><ArrowUp v-else :size="19" /></button>
        </footer>
      </form>
      <input ref="fileInput" type="file" accept="image/*,.docx,.xlsx,.xlsm,.txt,.md,.markdown,.csv,.json,.xml,.html,.css,.js,.jsx,.ts,.tsx,.py,.java,.go,.rs,.sql,.log,text/*,application/json,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" multiple hidden @change="handleFiles" />
      <p v-if="error" class="office-error" role="alert">{{ error }}</p>
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  ArrowUp, BarChart3, Bot, BrainCircuit, BriefcaseBusiness, Check, ChevronDown, ChevronRight, Code2, Copy, Download,
  FileSpreadsheet, FileText, Layers3, Lightbulb, ListChecks, LoaderCircle, Mail, MessageSquareText,
  PenLine, Plus, Presentation, Search, ShieldCheck, Sparkles, Square, SquarePen, Table2, X, Zap, History,
  Archive, ArchiveRestore, CalendarClock, CalendarPlus, ExternalLink, Globe2, MoreHorizontal, Pause, Play, RotateCcw, Trash2,
  type LucideIcon,
} from 'lucide-vue-next'
import ChatMessageContent from '../components/ChatMessageContent.vue'
import PluginSelector from '../components/PluginSelector.vue'
import { api, apiUrl, streamApiEvents } from '../services/api'
import { useAuthStore } from '../stores/auth'
import { useStudioStore } from '../stores/studio'
import type { StudioAsset } from '../types'
import { createClientId } from '../utils/client-id'

type TaskMode = 'fast' | 'expert' | 'agent'
type OfficeExportFormat = 'auto' | 'docx' | 'xlsx'
type OfficeSkill = { id: string; name: string; category: string; description: string; shortDescription: string; placeholder: string; color: string; icon: LucideIcon; assistantId?: string }
type CatalogModel = { key: string; displayName: string; description?: string; capability: 'CHAT' | 'IMAGE' | 'VIDEO' | 'COMMERCE'; enabled?: boolean; isDefault: boolean }
type ServerConversation = { id: string }
type ServerMessage = { id: string; createdAt: string }
type ServerJob = { id: string; status: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED'; errorMessage?: string | null; stream?: { messageId: string; content: string; model?: string | null } | null }
type AssistantOption = { id: string; name: string; description?: string; defaultModel?: string }
type OfficeDeliverable = { id: string; name: string; mimeType: string; size: number; contentUrl: string }
type AgentTaskStatus = 'DRAFT' | 'QUEUED' | 'RUNNING' | 'WAITING_APPROVAL' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED'
type AgentTaskStep = { id: string; position: number; title: string; detail: string; status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED' }
type AgentToolCall = { id: string; key: string; name: string; input: Record<string, unknown>; status: string; approvalStatus: string; requiresApproval: boolean; iteration: number }
type AgentSource = { title: string; url: string }
type AgentEvent = { id: string; type: string; title: string; detail: string; createdAt: string; payload?: { sources?: AgentSource[] } | null }
type AgentRun = { id: string; status: AgentTaskStatus; iteration: number; maxIterations: number; currentNode: string; finalAnswer: string; toolCalls: AgentToolCall[]; events: AgentEvent[] }
type AgentTask = { id: string; title: string; goal: string; skillId: string; webSearchEnabled: boolean; status: AgentTaskStatus; conversationId?: string | null; updatedAt: string; errorMessage?: string | null; steps: AgentTaskStep[]; run?: ServerJob | null; agentRun?: AgentRun | null; conversation?: { id: string; messages: Array<{ content: string }> } | null; artifacts?: OfficeDeliverable[] }
type AgentSchedule = { id: string; title: string; goal: string; cronExpression: string; timezone: string; enabled: boolean; nextRunAt?: string | null }

const builtInSkills: OfficeSkill[] = [
  { id: 'daily', name: '日常办公', category: '推荐', description: '整理任务、撰写通知、制定计划和处理通用办公事项', shortDescription: '通知、计划与工作整理', placeholder: '描述需要处理的办公任务', color: '#4f8cff', icon: FileText },
  { id: 'writing', name: '内容创作', category: '推荐', description: '撰写文章、方案、活动文案和新媒体内容', shortDescription: '文章、方案与宣传文案', placeholder: '描述主题、受众和期望风格', color: '#31b66b', icon: PenLine },
  { id: 'analysis', name: '数据分析', category: '推荐', description: '分析表格、提炼指标、解释趋势并形成业务结论', shortDescription: '指标、趋势与业务结论', placeholder: '粘贴数据或上传表格并说明分析目标', color: '#8a6cff', icon: BarChart3 },
  { id: 'development', name: '代码开发', category: '推荐', description: '编写、解释、检查和重构代码，输出可运行方案', shortDescription: '开发、调试与代码审查', placeholder: '描述功能、技术栈或粘贴报错信息', color: '#f29b38', icon: Code2 },
  { id: 'ppt', name: 'PPT 大纲', category: '文档', description: '生成演示文稿结构、逐页内容与演讲备注', shortDescription: '逐页结构与演讲备注', placeholder: '输入汇报主题、听众和预计页数', color: '#32b8cf', icon: Presentation },
  { id: 'report', name: '报告撰写', category: '文档', description: '生成周报、月报、复盘和正式业务报告', shortDescription: '周报、月报与项目复盘', placeholder: '输入原始事项、数据和报告用途', color: '#4f8cff', icon: MessageSquareText },
  { id: 'meeting', name: '会议纪要', category: '文档', description: '提取议题、结论、待办、负责人和截止时间', shortDescription: '结论、待办与责任人', placeholder: '粘贴会议记录或上传会议文档', color: '#36b86b', icon: ListChecks },
  { id: 'spreadsheet', name: '多维表格', category: '数据', description: '设计字段、公式、视图和自动化规则', shortDescription: '字段、公式与自动化', placeholder: '描述需要管理的数据和使用流程', color: '#5c79ff', icon: Table2 },
  { id: 'excel', name: 'Excel 助手', category: '数据', description: '生成公式、清洗步骤、透视表和图表方案', shortDescription: '公式、清洗与透视分析', placeholder: '描述表格结构、目标或上传文件', color: '#1fa766', icon: FileSpreadsheet },
  { id: 'email', name: '邮件写作', category: '沟通', description: '撰写正式邮件、跟进邮件和客户回复', shortDescription: '正式邮件与客户沟通', placeholder: '说明收件人、背景和邮件目的', color: '#ed725d', icon: Mail },
  { id: 'brainstorm', name: '方案脑暴', category: '创意', description: '围绕目标给出可筛选、可执行的创意方向', shortDescription: '创意方向与落地路径', placeholder: '描述目标、限制和已有想法', color: '#e5a824', icon: Lightbulb },
]

const auth = useAuthStore()
const studio = useStudioStore()
const router = useRouter()
const prompt = ref('')
const submittedPrompt = ref('')
const answer = ref('')
const conversationId = ref('')
const activeJobId = ref('')
const activeAgentTaskId = ref('')
const activeAgentTask = ref<AgentTask | null>(null)
const agentTasks = ref<AgentTask[]>([])
const historyOpen = ref(false)
const historyLoading = ref(false)
const archivedTasksVisible = ref(false)
const taskMenuId = ref('')
const schedulePanelOpen = ref(false)
const scheduleLoading = ref(false)
const scheduleSaving = ref(false)
const agentSchedules = ref<AgentSchedule[]>([])
const scheduleForm = reactive({ title: '', goal: '', preset: 'daily', cronExpression: '0 9 * * *' })
const reviewingCallId = ref('')
const generating = ref(false)
const canceling = ref(false)
const exporting = ref(false)
const downloading = ref(false)
const error = ref('')
const copied = ref(false)
const uploading = ref(false)
const attachments = ref<StudioAsset[]>([])
const fileInput = ref<HTMLInputElement | null>(null)
const taskInput = ref<HTMLTextAreaElement | null>(null)
const resultThread = ref<HTMLElement | null>(null)
const taskMode = ref<TaskMode>('fast')
const exportFormat = ref<OfficeExportFormat>('auto')
const webSearchEnabled = ref(true)
const selectedSkill = ref<OfficeSkill>(builtInSkills[0])
const skillPanelOpen = ref(false)
const modeMenuOpen = ref(false)
const modelMenuOpen = ref(false)
const formatMenuOpen = ref(false)
const skillQuery = ref('')
const selectedCategory = ref('全部')
const model = ref('')
const pluginId = ref('')
const chatModels = ref<CatalogModel[]>([])
const organizationSkills = ref<OfficeSkill[]>([])
const deliverable = ref<OfficeDeliverable | null>(null)
const organizationAssistantModels = new Map<string, string>()

const allSkills = computed(() => [...builtInSkills, ...organizationSkills.value])
const categories = computed(() => ['全部', '推荐', '文档', '数据', '沟通', '创意', ...(organizationSkills.value.length ? ['组织技能'] : [])])
const recommendedSkills = computed(() => builtInSkills.filter((skill) => skill.category === '推荐'))
const filteredSkills = computed(() => allSkills.value.filter((skill) => {
  const categoryMatches = selectedCategory.value === '全部' || skill.category === selectedCategory.value
  const query = skillQuery.value.trim().toLowerCase()
  return categoryMatches && (!query || `${skill.name} ${skill.description}`.toLowerCase().includes(query))
}))
const modeLabel = computed(() => taskMode.value === 'fast' ? '快速' : taskMode.value === 'expert' ? '专家' : '任务')
const exportFormatLabel = computed(() => exportFormat.value === 'docx' ? 'Word' : exportFormat.value === 'xlsx' ? 'Excel' : '自动格式')
const deliverableFormat = computed(() => deliverable.value?.name.split('.').pop()?.toUpperCase() || 'OFFICE')
const deliverableIcon = computed(() => deliverable.value?.name.toLowerCase().endsWith('.pptx') ? Presentation : deliverable.value?.name.toLowerCase().endsWith('.xlsx') ? FileSpreadsheet : FileText)
const pendingToolCalls = computed(() => activeAgentTask.value?.agentRun?.toolCalls.filter((call) => call.requiresApproval && call.approvalStatus === 'PENDING') || [])
const agentEvents = computed(() => [...(activeAgentTask.value?.agentRun?.events || [])].reverse())
const agentSources = computed(() => {
  const sources = (activeAgentTask.value?.agentRun?.events || []).flatMap((event) => Array.isArray(event.payload?.sources) ? event.payload.sources : [])
  const safeSources = sources.filter((source) => {
    try { return ['http:', 'https:'].includes(new URL(source?.url || '').protocol) } catch { return false }
  })
  return [...new Map(safeSources.map((source) => [source.url, source])).values()].slice(0, 20)
})

function officeHasImagePreview(asset: StudioAsset) {
  return Boolean(asset.contentUrl) && (asset.kind === 'image' || asset.mimeType?.startsWith('image/'))
}
function officeAttachmentMeta(asset: StudioAsset) {
  const extension = asset.title.includes('.') ? asset.title.split('.').pop()?.toUpperCase() : undefined
  const type = extension || asset.mimeType?.split('/').pop()?.toUpperCase() || '文件'
  if (!asset.size) return type
  return asset.size < 1024 * 1024 ? `${type} · ${Math.max(1, Math.round(asset.size / 1024))} KB` : `${type} · ${(asset.size / (1024 * 1024)).toFixed(1)} MB`
}

function selectSkill(skill: OfficeSkill) {
  const wasGeneratedPrefix = allSkills.value.some((item) => prompt.value.trim() === `${item.name}：` || prompt.value.trim() === `${item.name}:`)
  selectedSkill.value = skill
  const assistantModel = organizationAssistantModels.get(skill.id)
  if (assistantModel) model.value = assistantModel
  skillPanelOpen.value = false
  if (wasGeneratedPrefix) prompt.value = ''
  void nextTick(() => taskInput.value?.focus())
}
function toggleModeMenu() {
  document.dispatchEvent(new Event('xinyue:close-popovers'))
  modeMenuOpen.value = !modeMenuOpen.value
  modelMenuOpen.value = false
  formatMenuOpen.value = false
  skillPanelOpen.value = false
}
function toggleModelMenu() {
  document.dispatchEvent(new Event('xinyue:close-popovers'))
  modelMenuOpen.value = !modelMenuOpen.value
  modeMenuOpen.value = false
  formatMenuOpen.value = false
  skillPanelOpen.value = false
}
function toggleFormatMenu() {
  document.dispatchEvent(new Event('xinyue:close-popovers'))
  formatMenuOpen.value = !formatMenuOpen.value
  modeMenuOpen.value = false
  modelMenuOpen.value = false
  skillPanelOpen.value = false
}
function toggleSkillPanel() {
  document.dispatchEvent(new Event('xinyue:close-popovers'))
  skillPanelOpen.value = !skillPanelOpen.value
  modeMenuOpen.value = false
  modelMenuOpen.value = false
  formatMenuOpen.value = false
}
function closeOfficePopovers() {
  modeMenuOpen.value = false
  modelMenuOpen.value = false
  formatMenuOpen.value = false
  skillPanelOpen.value = false
}
function collapseOfficePopovers() {
  document.dispatchEvent(new Event('xinyue:close-popovers'))
}
function startNewTask() {
  conversationId.value = ''
  activeJobId.value = ''
  activeAgentTaskId.value = ''
  activeAgentTask.value = null
  submittedPrompt.value = ''
  answer.value = ''
  prompt.value = ''
  attachments.value = []
  deliverable.value = null
  exporting.value = false
  error.value = ''
  void nextTick(() => taskInput.value?.focus())
}
function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void submitTask() }
}
function openFilePicker() {
  if (!auth.isAuthenticated) { void router.push('/login?redirect=/office'); return }
  fileInput.value?.click()
}
async function handleFiles(event: Event) {
  const files = Array.from((event.target as HTMLInputElement).files || [])
  if (!files.length) return
  const availableSlots = Math.max(0, 12 - attachments.value.length)
  if (!availableSlots) { error.value = '每个办公任务最多添加 12 个附件'; return }
  uploading.value = true; error.value = ''
  try {
    attachments.value.push(...await studio.uploadFiles(files.slice(0, availableSlots), undefined, undefined, 'attachment'))
    if (files.length > availableSlots) error.value = '每个办公任务最多添加 12 个附件，超出部分未上传'
  }
  catch (reason) { error.value = reason instanceof Error ? reason.message : '文件上传失败' }
  finally { uploading.value = false; if (fileInput.value) fileInput.value.value = '' }
}
async function submitTask() {
  const raw = prompt.value.trim()
  if (!raw || generating.value) return
  if (!auth.isAuthenticated) { await router.push('/login?redirect=/office'); return }
  if (!model.value) { error.value = '当前账户没有可用的对话模型，请联系管理员配置模型权限'; return }
  error.value = ''; answer.value = ''; submittedPrompt.value = raw; generating.value = true
  deliverable.value = null
  canceling.value = false
  skillPanelOpen.value = false; modeMenuOpen.value = false; modelMenuOpen.value = false
  try {
    if (taskMode.value === 'agent') {
      const draft = activeAgentTask.value?.status === 'DRAFT' ? activeAgentTask.value : null
      const created = await api<AgentTask>(draft ? `/agent-tasks/${draft.id}` : '/agent-tasks', {
        method: draft ? 'PATCH' : 'POST',
        body: JSON.stringify({
          title: `${selectedSkill.value.name} · ${raw.slice(0, 32)}`,
          goal: raw,
          model: model.value,
          skillId: selectedSkill.value.id,
          assistantId: selectedSkill.value.assistantId,
          pluginId: pluginId.value || undefined,
          attachmentIds: attachments.value.map((asset) => asset.id),
          webSearchEnabled: webSearchEnabled.value,
        }),
      })
      activeAgentTaskId.value = created.id
      activeAgentTask.value = created
      conversationId.value = `agent:${created.id}`
      const started = await api<AgentTask>(`/agent-tasks/${created.id}/run`, { method: 'POST' })
      activeAgentTask.value = started
      const completed = await watchAgentTask(created.id)
      if (completed.status !== 'SUCCEEDED') throw new Error(completed.errorMessage || (completed.status === 'CANCELLED' ? '任务已停止' : 'Agent 任务执行失败'))
      prompt.value = ''
      void createDeliverable()
      await Promise.all([loadAgentTasks(), studio.refreshConversations(), studio.refreshCredits()])
      return
    }
    const conversation = await api<ServerConversation>('/conversations', { method: 'POST', body: JSON.stringify({ model: model.value, title: `${selectedSkill.value.name} · ${raw.slice(0, 32)}` }) })
    conversationId.value = conversation.id
    await api<ServerMessage>(`/conversations/${conversation.id}/messages`, { method: 'POST', body: JSON.stringify({ content: raw, assetIds: attachments.value.map((asset) => asset.id) }) })
    const options = { officeMode: taskMode.value, officeSkill: selectedSkill.value.id, ...(selectedSkill.value.assistantId ? { assistantId: selectedSkill.value.assistantId } : {}), ...(pluginId.value ? { pluginId: pluginId.value } : {}) }
    const job = await api<ServerJob>('/generations', { method: 'POST', body: JSON.stringify({ kind: 'CHAT', prompt: raw, model: model.value, conversationId: conversation.id, options, idempotencyKey: `office:${createClientId()}` }) })
    activeJobId.value = job.id
    const completed = await streamApiEvents<ServerJob>(`/generations/${job.id}/events`, (current) => { if (current.stream) answer.value = current.stream.content })
    if (completed.stream) answer.value = completed.stream.content
    if (completed.status !== 'SUCCEEDED') throw new Error(completed.errorMessage || (completed.status === 'CANCELLED' ? '任务已停止' : '办公任务生成失败'))
    prompt.value = ''
    void createDeliverable()
    await Promise.all([studio.refreshConversations(), studio.refreshCredits()])
  } catch (reason) { error.value = reason instanceof Error ? reason.message : '办公任务提交失败' }
  finally { generating.value = false; canceling.value = false; activeJobId.value = ''; void nextTick(() => resultThread.value?.scrollTo({ top: resultThread.value.scrollHeight, behavior: 'smooth' })) }
}
async function cancelTask() {
  if (canceling.value || (!activeJobId.value && !activeAgentTaskId.value)) return
  canceling.value = true
  try {
    if (activeAgentTaskId.value) await api(`/agent-tasks/${activeAgentTaskId.value}/cancel`, { method: 'POST' })
    else await api(`/generations/${activeJobId.value}/cancel`, { method: 'POST' })
  }
  catch (reason) { canceling.value = false; error.value = reason instanceof Error ? reason.message : '停止任务失败' }
}

async function loadAgentTasks() {
  if (!auth.isAuthenticated) return
  historyLoading.value = true
  try { agentTasks.value = await api<AgentTask[]>(`/agent-tasks${archivedTasksVisible.value ? '?archived=true' : ''}`, { cache: 'no-store' }) }
  finally { historyLoading.value = false }
}
async function toggleHistory() {
  historyOpen.value = !historyOpen.value
  if (historyOpen.value) await loadAgentTasks()
}
async function toggleArchivedTasks() { archivedTasksVisible.value = !archivedTasksVisible.value; taskMenuId.value = ''; await loadAgentTasks() }
function toggleTaskMenu(id: string) { taskMenuId.value = taskMenuId.value === id ? '' : id }
async function duplicateTask(task: AgentTask) {
  taskMenuId.value = ''
  try { const copy = await api<AgentTask>(`/agent-tasks/${task.id}/duplicate`, { method: 'POST' }); startNewTask(); activeAgentTaskId.value = copy.id; activeAgentTask.value = copy; taskMode.value = 'agent'; webSearchEnabled.value = copy.webSearchEnabled; prompt.value = copy.goal; const matchingSkill = allSkills.value.find((skill) => skill.id === copy.skillId); if (matchingSkill) selectedSkill.value = matchingSkill; historyOpen.value = false; await loadAgentTasks() }
  catch (reason) { error.value = reason instanceof Error ? reason.message : '创建副本失败' }
}
async function retryTask(task: AgentTask) {
  taskMenuId.value = ''; error.value = ''; generating.value = true
  try { const started = await api<AgentTask>(`/agent-tasks/${task.id}/retry`, { method: 'POST' }); activeAgentTaskId.value = task.id; activeAgentTask.value = started; submittedPrompt.value = started.goal; answer.value = ''; conversationId.value = `agent:${task.id}`; const completed = await watchAgentTask(task.id); if (completed.status !== 'SUCCEEDED') throw new Error(completed.errorMessage || '任务执行失败'); void createDeliverable(); await loadAgentTasks() }
  catch (reason) { error.value = reason instanceof Error ? reason.message : '重新执行失败' }
  finally { generating.value = false }
}
async function setTaskArchived(task: AgentTask, archived: boolean) {
  taskMenuId.value = ''
  try { await api(`/agent-tasks/${task.id}/${archived ? 'archive' : 'unarchive'}`, { method: 'POST' }); if (activeAgentTaskId.value === task.id) startNewTask(); await loadAgentTasks() }
  catch (reason) { error.value = reason instanceof Error ? reason.message : archived ? '归档失败' : '恢复失败' }
}
async function deleteTask(task: AgentTask) {
  taskMenuId.value = ''
  if (!window.confirm(`确认永久删除“${task.title}”？`)) return
  try { await api(`/agent-tasks/${task.id}`, { method: 'DELETE' }); if (activeAgentTaskId.value === task.id) startNewTask(); await loadAgentTasks() }
  catch (reason) { error.value = reason instanceof Error ? reason.message : '删除任务失败' }
}
async function toggleSchedules() { schedulePanelOpen.value = !schedulePanelOpen.value; historyOpen.value = false; if (schedulePanelOpen.value) await loadSchedules() }
async function loadSchedules() { scheduleLoading.value = true; try { agentSchedules.value = await api<AgentSchedule[]>('/agent-tasks/schedules/list/all', { cache: 'no-store' }) } finally { scheduleLoading.value = false } }
function applySchedulePreset() { const values: Record<string, string> = { daily: '0 9 * * *', weekday: '0 9 * * 1-5', weekly: '0 9 * * 1', monthly: '0 9 1 * *' }; if (values[scheduleForm.preset]) scheduleForm.cronExpression = values[scheduleForm.preset] }
async function saveSchedule() {
  if (!scheduleForm.title.trim() || !scheduleForm.goal.trim() || !model.value) return
  scheduleSaving.value = true; error.value = ''
  try { await api('/agent-tasks/schedules/create', { method: 'POST', body: JSON.stringify({ title: scheduleForm.title, goal: scheduleForm.goal, model: model.value, skillId: selectedSkill.value.id, assistantId: selectedSkill.value.assistantId, pluginId: pluginId.value || undefined, attachmentIds: attachments.value.map((asset) => asset.id), webSearchEnabled: webSearchEnabled.value, cronExpression: scheduleForm.cronExpression, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai', enabled: true }) }); scheduleForm.title = ''; scheduleForm.goal = ''; await loadSchedules() }
  catch (reason) { error.value = reason instanceof Error ? reason.message : '创建定时任务失败' }
  finally { scheduleSaving.value = false }
}
async function runSchedule(schedule: AgentSchedule) { try { const task = await api<AgentTask>(`/agent-tasks/schedules/${schedule.id}/run`, { method: 'POST' }); schedulePanelOpen.value = false; await openAgentTask(task.id); void resumeAgentTask(task.id) } catch (reason) { error.value = reason instanceof Error ? reason.message : '启动计划失败' } }
async function toggleSchedule(schedule: AgentSchedule) { try { await api(`/agent-tasks/schedules/${schedule.id}`, { method: 'PATCH', body: JSON.stringify({ enabled: !schedule.enabled }) }); await loadSchedules() } catch (reason) { error.value = reason instanceof Error ? reason.message : '更新计划失败' } }
async function deleteSchedule(schedule: AgentSchedule) { if (!window.confirm(`确认删除计划“${schedule.title}”？`)) return; try { await api(`/agent-tasks/schedules/${schedule.id}`, { method: 'DELETE' }); await loadSchedules() } catch (reason) { error.value = reason instanceof Error ? reason.message : '删除计划失败' } }
async function openAgentTask(id: string) {
  const task = await api<AgentTask>(`/agent-tasks/${id}`, { cache: 'no-store' })
  activeAgentTaskId.value = task.id
  activeAgentTask.value = task
  taskMode.value = 'agent'
  webSearchEnabled.value = task.webSearchEnabled
  if (task.status === 'DRAFT') {
    conversationId.value = ''; submittedPrompt.value = ''; answer.value = ''; prompt.value = task.goal; deliverable.value = null; historyOpen.value = false
    const draftSkill = allSkills.value.find((skill) => skill.id === task.skillId); if (draftSkill) selectedSkill.value = draftSkill
    return
  }
  submittedPrompt.value = task.goal
  answer.value = task.agentRun?.finalAnswer || task.run?.stream?.content || task.conversation?.messages[0]?.content || ''
  deliverable.value = task.artifacts?.[0] || null
  conversationId.value = task.conversationId || `agent:${task.id}`
  const matchingSkill = allSkills.value.find((skill) => skill.id === task.skillId)
  if (matchingSkill) selectedSkill.value = matchingSkill
  historyOpen.value = false
  if (task.status === 'QUEUED' || task.status === 'RUNNING') void resumeAgentTask(task.id)
}
async function watchAgentTask(id: string) {
  const completed = await streamApiEvents<AgentTask>(`/agent-tasks/${id}/events`, (current) => {
    activeAgentTask.value = current
    if (current.conversationId) conversationId.value = current.conversationId
    const content = current.agentRun?.finalAnswer || current.run?.stream?.content
    if (content) answer.value = content
  })
  activeAgentTask.value = completed
  if (completed.conversationId) conversationId.value = completed.conversationId
  const content = completed.agentRun?.finalAnswer || completed.run?.stream?.content
  if (content) answer.value = content
  return completed
}
async function reviewToolCall(callId: string, decision: 'APPROVED' | 'REJECTED') {
  if (!activeAgentTaskId.value || reviewingCallId.value) return
  reviewingCallId.value = callId
  error.value = ''
  try {
    const task = await api<AgentTask>(`/agent-tasks/${activeAgentTaskId.value}/tool-calls/${callId}/review`, { method: 'POST', body: JSON.stringify({ decision }) })
    activeAgentTask.value = task
    if (task.status === 'QUEUED' && !generating.value) void resumeAgentTask(task.id)
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '处理工具确认失败'
  } finally { reviewingCallId.value = '' }
}
function toolCallSummary(call: AgentToolCall) {
  const query = typeof call.input.query === 'string' ? call.input.query : ''
  return query || `Agent 请求调用 ${call.name}`
}
async function resumeAgentTask(id: string) {
  generating.value = true
  error.value = ''
  try {
    const completed = await watchAgentTask(id)
    if (completed.status === 'SUCCEEDED') {
      if (!deliverable.value) void createDeliverable()
      await Promise.all([loadAgentTasks(), studio.refreshConversations(), studio.refreshCredits()])
    } else if (completed.status === 'FAILED') error.value = completed.errorMessage || 'Agent 任务执行失败'
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '无法恢复任务进度'
  } finally {
    generating.value = false
    canceling.value = false
  }
}
function agentStatusLabel(status: AgentTaskStatus) {
  return ({ DRAFT: '草稿', QUEUED: '排队中', RUNNING: '执行中', WAITING_APPROVAL: '待审批', SUCCEEDED: '已完成', FAILED: '失败', CANCELLED: '已停止' } as Record<AgentTaskStatus, string>)[status]
}
function formatTaskTime(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}
async function copyAnswer() {
  await navigator.clipboard.writeText(answer.value)
  copied.value = true
  window.setTimeout(() => { copied.value = false }, 1500)
}
async function createDeliverable() {
  if (!conversationId.value || exporting.value || deliverable.value) return
  exporting.value = true
  try {
    deliverable.value = await api<OfficeDeliverable>('/office/exports', { method: 'POST', body: JSON.stringify({ conversationId: conversationId.value, ...(exportFormat.value === 'auto' ? {} : { format: exportFormat.value }) }) })
    await studio.refreshAssets()
  } catch (reason) {
    error.value = `内容已生成，但交付文件制作失败：${reason instanceof Error ? reason.message : '请稍后重试'}`
  } finally {
    exporting.value = false
  }
}
async function downloadDeliverable() {
  if (!deliverable.value || downloading.value) return
  downloading.value = true
  try {
    const response = await fetch(apiUrl(deliverable.value.contentUrl), { credentials: 'include' })
    if (!response.ok) throw new Error(`文件下载失败 (${response.status})`)
    const url = URL.createObjectURL(await response.blob())
    const link = document.createElement('a')
    link.href = url
    link.download = deliverable.value.name
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '文件下载失败'
  } finally {
    downloading.value = false
  }
}

onMounted(async () => {
  studio.setMode('office')
  document.addEventListener('xinyue:close-popovers', closeOfficePopovers)
  const [models, assistants] = await Promise.all([
    api<CatalogModel[]>(auth.isAuthenticated ? '/users/me/models' : '/catalog/models', { cache: 'no-store' }).catch(() => []),
    api<AssistantOption[]>('/assistants').catch(() => []),
  ])
  chatModels.value = models.filter((item) => item.capability === 'CHAT' && item.enabled !== false)
  const defaultModel = chatModels.value.find((item) => item.isDefault) || chatModels.value[0]
  if (defaultModel) model.value = defaultModel.displayName
  organizationSkills.value = assistants.map((assistant, index) => {
    const id = `assistant:${assistant.id}`
    if (assistant.defaultModel) organizationAssistantModels.set(id, assistant.defaultModel)
    return { id, name: assistant.name, category: '组织技能', description: assistant.description || '由管理员配置的办公助手', shortDescription: assistant.description || '组织专属办公能力', placeholder: `描述需要交给${assistant.name}处理的任务`, color: ['#4f8cff', '#31b66b', '#8a6cff', '#f29b38'][index % 4], icon: Sparkles, assistantId: assistant.id }
  })
  if (auth.isAuthenticated) void loadAgentTasks()
})
onUnmounted(() => document.removeEventListener('xinyue:close-popovers', closeOfficePopovers))
</script>
