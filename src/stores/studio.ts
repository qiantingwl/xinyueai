import { defineStore } from 'pinia'
import { api, streamApiEvents, watchJobEvents } from '../services/api'
import { uploadAsset } from '../utils/asset-upload'
import { formatFileSize } from '../utils/format-bytes'
import type { ConversationSummary, GenerationOptions, GenerationRun, Message, MessageWebSearch, Project, ProjectVersion, ProjectWorkflowConfig, ProjectWorkflowStatus, StudioAsset, StudioMode, WebSearchSource } from '../types'
import { createClientId } from '../utils/client-id'
import { isGenerationActive, isGenerationTerminal } from '../utils/generation-run-state'

type ServerConversation = { id: string; title: string; model: string; projectId?: string | null; temporary?: boolean; pinnedAt?: string | null; sharedAt?: string | null; archivedAt?: string | null; createdAt: string; updatedAt: string; messages?: ServerMessage[]; generationJobs?: ServerJob[] }
type ServerMessageMetadata = { jobId?: string; feedback?: 'UP' | 'DOWN' | null; suggestionVersion?: number; suggestions?: string[]; reasoning?: unknown; reasoningTokens?: unknown; thinkingSeconds?: unknown; webSearch?: unknown }
type ServerMessage = { id: string; role: 'USER' | 'ASSISTANT' | 'SYSTEM' | 'TOOL'; content: string; model?: string | null; metadata?: ServerMessageMetadata | null; createdAt: string; parentId?: string | null; branchIndex?: number; branchCount?: number; branches?: Array<{ id: string; branchIndex: number }>; attachments?: { assetId?: string; asset?: { id: string } }[] }
type ServerProject = { id: string; name: string; description?: string; instructions?: string; workflowStatus?: ProjectWorkflowStatus; workflowConfig?: ProjectWorkflowConfig | null; defaultModel?: string; defaultAssistantId?: string | null; revision?: number; archivedAt?: string | null; updatedAt: string; teamId?: string | null; team?: { id: string; name: string } | null; assets?: ServerAsset[]; conversations?: ServerConversation[]; accessRole?: 'OWNER' | 'ADMIN' | 'MEMBER'; user?: { id: string; displayName: string; email?: string | null }; members?: Project['members']; activeSkillVersion?: Project['activeSkillVersion']; _count?: { assets?: number; conversations?: number; versions?: number } }
type ServerVersion = Omit<ProjectVersion, 'createdAt' | 'snapshot'> & { createdAt: string; snapshot: ProjectVersion['snapshot'] }
type ServerAsset = { id: string; projectId?: string | null; kind: 'IMAGE' | 'VIDEO' | 'FILE' | 'PRODUCT_PACK'; name: string; mimeType: string; size: number; contentUrl: string; createdAt: string; teamId?: string | null; team?: { id: string; name: string } | null; user?: { id: string; displayName: string } | null; canManage?: boolean; metadata?: Record<string, unknown> | null }
type ServerJob = { id: string; conversationId?: string | null; kind: 'CHAT' | 'IMAGE' | 'VIDEO' | 'COMMERCE'; status: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED'; model: string; prompt: string; options?: Record<string, unknown>; creditCost?: number; errorMessage?: string | null; inputTokens?: number; outputTokens?: number; reasoningTokens?: number; stream?: { messageId: string; content: string; model?: string | null; metadata?: ServerMessageMetadata | null } | null; outputs?: { asset: ServerAsset }[]; createdAt: string; startedAt?: string | null; completedAt?: string | null }
type ServerGenerationEvent = { id?: string; sequence?: number; type?: string; payload?: unknown }

const terminalJob = (job: ServerJob) => isGenerationTerminal(job.status)
async function waitForServerJob(jobId: string, onEvent?: (job: ServerJob) => void) {
  return watchJobEvents<ServerJob>(`/generations/${jobId}/events`, `/generations/${jobId}`, {
    isTerminal: (status) => isGenerationTerminal(status),
    onUpdate: onEvent,
    timeoutMessage: '任务处理超时，请稍后重新打开查看',
  })
}
const idempotencyKey = (prefix: string) => `${prefix}:${createClientId()}`
const welcomeMessage = (): Message => ({ id: 'welcome', role: 'assistant', content: '告诉我今天要做的商品、画面或文案目标。我会先拆任务，再把可交付的素材放进资料库。', createdAt: Date.now() })
let pendingWorkspaceHydration: Promise<void> | null = null
let conversationLoadSequence = 0
const pendingChatJobs = new Map<string, Promise<ServerJob>>()

function thinkingSecondsFrom(value: unknown, job?: Pick<ServerJob, 'startedAt' | 'completedAt' | 'createdAt'>): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.max(1, Math.round(value))
  if (!job) return undefined
  const start = Date.parse(job.startedAt || job.createdAt)
  const end = Date.parse(job.completedAt || '')
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return undefined
  return Math.max(1, Math.round((end - start) / 1000))
}

function mapWebSearch(value: unknown): MessageWebSearch | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const row = value as Record<string, unknown>
  if (row.enabled !== true) return undefined
  const status = row.status === 'completed' || row.status === 'failed' ? row.status : 'searching'
  const queries = Array.isArray(row.queries) ? row.queries.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).slice(0, 3) : []
  const sources = Array.isArray(row.sources) ? row.sources.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return []
    const source = item as Record<string, unknown>
    if (typeof source.url !== 'string' || !/^https?:\/\//i.test(source.url)) return []
    return [{ title: typeof source.title === 'string' && source.title.trim() ? source.title.trim() : source.url, url: source.url, content: typeof source.content === 'string' ? source.content : undefined, publishedAt: typeof source.publishedAt === 'string' ? source.publishedAt : undefined }]
  }).slice(0, 15) : []
  return { enabled: true, status, queries, sources, error: typeof row.error === 'string' ? row.error : undefined }
}

export class ChatSendError extends Error {
  constructor(message: string, public readonly restoreDraft: boolean) {
    super(message)
    this.name = 'ChatSendError'
  }
}

function mapConversation(item: ServerConversation): ConversationSummary {
  return { id: item.id, title: item.title, model: item.model, projectId: item.projectId, pinnedAt: item.pinnedAt ? Date.parse(item.pinnedAt) : null, sharedAt: item.sharedAt ? Date.parse(item.sharedAt) : null, archivedAt: item.archivedAt ? Date.parse(item.archivedAt) : null, createdAt: Date.parse(item.createdAt), updatedAt: Date.parse(item.updatedAt) }
}

function mapWorkflowConfig(input?: ProjectWorkflowConfig | null): ProjectWorkflowConfig {
  const value = input && typeof input === 'object' ? input : { steps: [], defaultPrompt: '', outputRequirements: '' }
  return {
    steps: Array.isArray(value.steps) ? value.steps.map((step, index) => ({ id: String(step.id || createClientId()), title: String(step.title || ''), description: String(step.description || ''), status: step.status === 'DONE' || step.status === 'IN_PROGRESS' ? step.status : 'TODO', sortOrder: Number.isFinite(step.sortOrder) ? step.sortOrder : index })) : [],
    defaultPrompt: String(value.defaultPrompt || ''),
    outputRequirements: String(value.outputRequirements || ''),
  }
}

function mapProject(item: ServerProject): Project {
  return { id: item.id, name: item.name, brief: item.description || '尚未添加项目说明。', description: item.description || '', instructions: item.instructions || '', updatedAt: Date.parse(item.updatedAt), assetIds: item.assets?.map((asset) => asset.id) || [], assets: item.assets?.map(mapAsset) || [], conversations: item.conversations?.map(mapConversation) || [], assetCount: item._count?.assets ?? item.assets?.length ?? 0, conversationCount: item._count?.conversations ?? item.conversations?.length ?? 0, versionCount: item._count?.versions ?? item.revision ?? 1, archived: Boolean(item.archivedAt), workflowStatus: item.workflowStatus || 'PLANNING', workflowConfig: mapWorkflowConfig(item.workflowConfig), defaultModel: item.defaultModel || '', defaultAssistantId: item.defaultAssistantId || null, revision: item.revision || 1, accessRole: item.accessRole || 'OWNER', owner: item.user, members: item.members || [], activeSkillVersion: item.activeSkillVersion || null, teamId: item.teamId || null, team: item.team || null }
}

function mapVersion(item: ServerVersion): ProjectVersion {
  const snapshot = item.snapshot || {} as ProjectVersion['snapshot']
  return { ...item, createdAt: Date.parse(item.createdAt) || Date.now(), snapshot: { ...snapshot, workflowStatus: snapshot.workflowStatus || 'PLANNING', workflowConfig: mapWorkflowConfig(snapshot.workflowConfig), defaultModel: snapshot.defaultModel || '', defaultAssistantId: snapshot.defaultAssistantId || null } }
}

function mapAsset(item: ServerAsset): StudioAsset {
  const kind = item.kind === 'IMAGE' ? 'image' : item.kind === 'VIDEO' ? 'video' : item.kind === 'PRODUCT_PACK' ? 'product-pack' : 'text'
  const isVisual = item.kind === 'IMAGE' || item.kind === 'PRODUCT_PACK' || item.mimeType.startsWith('image/')
  const sizeLabel = formatFileSize(item.size)
  const generated = item.metadata?.purpose === 'generated'
  return {
    id: item.id,
    kind,
    title: item.name,
    prompt: typeof item.metadata?.prompt === 'string' ? item.metadata.prompt : `${item.mimeType || '文件'} · ${sizeLabel}`,
    preview: isVisual ? `url("${item.contentUrl}") center / cover no-repeat` : 'linear-gradient(135deg, #20242a, #49515d)',
    contentUrl: item.contentUrl,
    mimeType: item.mimeType,
    size: Number(item.size || 0),
    status: 'done',
    createdAt: Date.parse(item.createdAt),
    tags: [item.kind === 'PRODUCT_PACK' ? '商品素材' : item.kind === 'IMAGE' ? '图片' : item.kind === 'VIDEO' ? '视频' : '文件', sizeLabel],
    source: generated ? 'generated' : 'upload',
    purpose: typeof item.metadata?.purpose === 'string' ? item.metadata.purpose as StudioAsset['purpose'] : generated ? 'generated' : 'library',
    jobId: typeof item.metadata?.jobId === 'string' ? item.metadata.jobId : undefined,
    position: typeof item.metadata?.position === 'number' ? item.metadata.position : undefined,
    moduleLabel: typeof item.metadata?.moduleLabel === 'string' ? item.metadata.moduleLabel : undefined,
    creationType: typeof item.metadata?.creationType === 'string' ? item.metadata.creationType : undefined,
    platform: typeof item.metadata?.platform === 'string' ? item.metadata.platform : undefined,
    options: item.metadata?.options && typeof item.metadata.options === 'object' && !Array.isArray(item.metadata.options) ? item.metadata.options as Record<string, unknown> : undefined,
    teamId: item.teamId || null,
    team: item.team || null,
    owner: item.user || null,
    projectId: item.projectId || null,
    canManage: item.canManage,
  }
}

/** 聊天失败原因转用户可读文案（截断技术细节，隐藏 JSON 噪声） */
function chatFailureText(errorMessage?: string | null) {
  const detail = (errorMessage || '').split('\n')[0].replace(/\s*\{[\s\S]*\}\s*$/, '').trim()
  return detail || '回复生成失败，请点击重新生成重试。'
}

function mapGeneration(job: ServerJob, fallback?: GenerationOptions): GenerationRun {
  const options = job.options || {}
  const mode = job.kind === 'COMMERCE' ? 'commerce' : job.kind === 'VIDEO' ? 'videos' : 'images'
  const request: GenerationOptions = fallback || {
    mode,
    prompt: job.prompt,
    model: String(options.requestedModel || job.model),
    ratio: String(options.size || '1024x1024'),
    count: Number(options.count || 1),
    quality: typeof options.quality === 'string' ? options.quality : undefined,
    style: typeof options.style === 'string' ? options.style : undefined,
    modules: Number(options.modules || 8),
    referenceAssetIds: Array.isArray(options.referenceAssetIds) ? options.referenceAssetIds.map(String) : [],
    maskAssetId: typeof options.maskAssetId === 'string' ? options.maskAssetId : undefined,
    firstFrameAssetId: typeof options.firstFrameAssetId === 'string' ? options.firstFrameAssetId : undefined,
    lastFrameAssetId: typeof options.lastFrameAssetId === 'string' ? options.lastFrameAssetId : undefined,
    creationType: typeof options.creationType === 'string' ? options.creationType : undefined,
    platform: typeof options.platform === 'string' ? options.platform : undefined,
    outputFormat: options.outputFormat as GenerationOptions['outputFormat'],
    background: options.background as GenerationOptions['background'],
    outputCompression: typeof options.outputCompression === 'number' ? options.outputCompression : undefined,
    resolution: typeof options.resolution === 'string' ? options.resolution : undefined,
    duration: typeof options.duration === 'number' ? options.duration : undefined,
    aspectRatio: typeof options.aspectRatio === 'string' ? options.aspectRatio : undefined,
    creditCost: job.creditCost,
  }
  return {
    id: job.id,
    conversationId: job.conversationId || undefined,
    prompt: job.prompt,
    model: job.model,
    mode,
    status: job.status,
    error: job.errorMessage || (job.status === 'CANCELLED' ? '任务已取消' : ''),
    assets: (job.outputs || []).map((output) => mapAsset(output.asset)),
    request,
    createdAt: Date.parse(job.createdAt) || Date.now(),
  }
}

export const useStudioStore = defineStore('studio', {
  state: () => ({
    activeMode: 'chat' as StudioMode,
    credits: 0,
    currentConversationId: '',
    openingConversationId: '',
    temporaryChat: false,
    currentProjectId: '',
    isGenerating: false,
    activeJobId: '',
    cancelingJobId: '',
    activeGeneration: null as GenerationRun | null,
    generations: [] as GenerationRun[],
    commerceRuns: [] as GenerationRun[],
    videoRuns: [] as GenerationRun[],
    isLoading: false,
    workspaceHydrated: false,
    workspaceHydrating: false,
    lastError: '',
    conversations: [] as ConversationSummary[],
    archivedConversations: [] as ConversationSummary[],
    messages: [welcomeMessage()] as Message[],
    assets: [] as StudioAsset[],
    projects: [] as Project[],
  }),
  getters: {
    currentProject(state) { return state.projects.find((project) => project.id === state.currentProjectId) },
    recentAssets(state) { return [...state.assets].sort((a, b) => b.createdAt - a.createdAt) },
  },
  actions: {
    setMode(mode: StudioMode) { this.activeMode = mode },
    clearError() { this.lastError = '' },
    async hydrateWorkspace(force = false) {
      if (pendingWorkspaceHydration) return pendingWorkspaceHydration
      if (!force && this.workspaceHydrated) return

      const hydration = (async () => {
        this.workspaceHydrating = true; this.isLoading = true; this.lastError = ''
        try {
          const results = await Promise.allSettled([
            api<ServerConversation[]>('/conversations'), api<ServerConversation[]>('/conversations?archived=true'), api<ServerProject[]>('/projects'), api<ServerProject[]>('/projects?archived=true'),
            api<ServerAsset[]>('/assets'), api<{ balance: number }>('/credits'), api<ServerJob[]>('/generations?kind=COMMERCE'), api<ServerJob[]>('/generations?kind=VIDEO'),
          ])
          const [conversations, archivedConversations, activeProjects, archivedProjects, assets, credit, commerceJobs, videoJobs] = results

          if (conversations.status === 'fulfilled') this.conversations = conversations.value.map(mapConversation)
          if (archivedConversations.status === 'fulfilled') this.archivedConversations = archivedConversations.value.map(mapConversation)
          if (activeProjects.status === 'fulfilled' || archivedProjects.status === 'fulfilled') {
            const active = activeProjects.status === 'fulfilled' ? activeProjects.value.map(mapProject) : this.projects.filter((project) => !project.archived)
            const archived = archivedProjects.status === 'fulfilled' ? archivedProjects.value.map(mapProject) : this.projects.filter((project) => project.archived)
            this.projects = [...active, ...archived]
          }
          if (assets.status === 'fulfilled') this.assets = assets.value.map(mapAsset)
          if (credit.status === 'fulfilled') this.credits = credit.value.balance
          if (commerceJobs.status === 'fulfilled') {
            this.commerceRuns = commerceJobs.value.map((job) => mapGeneration(job))
            for (const job of commerceJobs.value.filter((item) => isGenerationActive(item.status))) void this.monitorGeneration(job.id)
          }
          if (videoJobs.status === 'fulfilled') {
            this.videoRuns = videoJobs.value.map((job) => mapGeneration(job))
            for (const job of videoJobs.value.filter((item) => isGenerationActive(item.status))) void this.monitorGeneration(job.id)
          }

          // 只有会话列表失败才视为致命错误并提示；积分/素材/任务等非关键资源失败时静默降级（下次进工作区仍会重试）
          const criticalFailure = conversations.status === 'rejected' ? conversations.reason : null
          this.workspaceHydrated = results.every((result) => result.status === 'fulfilled')
          if (criticalFailure) throw criticalFailure
        } catch (reason) {
          this.lastError = reason instanceof Error ? reason.message : '工作台数据加载失败'
          throw reason
        } finally { this.workspaceHydrating = false; this.isLoading = false }
      })()

      pendingWorkspaceHydration = hydration
      try { await hydration }
      finally { if (pendingWorkspaceHydration === hydration) pendingWorkspaceHydration = null }
    },
    clearWorkspace() {
      this.newConversation()
      this.currentProjectId = ''
      this.conversations = []
      this.archivedConversations = []
      this.assets = []
      this.projects = []
      this.commerceRuns = []
      this.videoRuns = []
      this.credits = 0
      this.workspaceHydrated = false
      this.workspaceHydrating = false
    },
    newConversation(temporary = false) {
      conversationLoadSequence += 1
      this.currentConversationId = ''
      this.openingConversationId = ''
      this.temporaryChat = temporary
      this.messages = [welcomeMessage()]
      this.isGenerating = false
      this.activeJobId = ''
      this.activeGeneration = null
      this.generations = []
      this.lastError = ''
    },
    async toggleTemporaryChat() {
      if (!this.temporaryChat) {
        this.newConversation(true)
        return
      }
      const temporaryConversationId = this.currentConversationId
      if (temporaryConversationId) {
        try {
          await this.deleteConversation(temporaryConversationId)
        } catch (reason) {
          this.lastError = reason instanceof Error ? reason.message : '临时聊天删除失败'
        }
        return
      }
      this.newConversation(false)
    },
    async openConversation(conversationId: string) {
      const loadSequence = ++conversationLoadSequence
      this.openingConversationId = conversationId
      this.isLoading = true; this.lastError = ''
      try {
        const conversation = await api<ServerConversation>(`/conversations/${conversationId}`)
        if (loadSequence !== conversationLoadSequence || this.openingConversationId !== conversationId) return conversation
        this.currentConversationId = conversation.id
        this.temporaryChat = Boolean(conversation.temporary)
        this.messages = (conversation.messages || []).filter((message) => message.role === 'USER' || message.role === 'ASSISTANT').map((message) => ({
          id: message.id, role: message.role.toLowerCase() as 'user' | 'assistant', content: message.content,
          parentId: message.parentId || null, branchIndex: message.branchIndex || 0, branchCount: message.branchCount || 1, branches: message.branches || [{ id: message.id, branchIndex: message.branchIndex || 0 }],
          model: message.model || undefined, generationJobId: message.metadata?.jobId, createdAt: Date.parse(message.createdAt), attachmentIds: message.attachments?.map((attachment) => attachment.assetId || attachment.asset?.id || '').filter(Boolean),
          reasoning: typeof message.metadata?.reasoning === 'string' ? message.metadata.reasoning : undefined,
          reasoningTokens: typeof message.metadata?.reasoningTokens === 'number' && message.metadata.reasoningTokens > 0 ? message.metadata.reasoningTokens : undefined,
          thinkingSeconds: thinkingSecondsFrom(message.metadata?.thinkingSeconds),
          feedback: message.metadata?.feedback || null,
          suggestions: message.metadata?.suggestionVersion === 3 && Array.isArray(message.metadata.suggestions) ? message.metadata.suggestions.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).slice(0, 3) : [],
          webSearch: mapWebSearch(message.metadata?.webSearch),
        }))
        if (!this.messages.length) this.messages = [welcomeMessage()]
        const chatJobs = new Map((conversation.generationJobs || []).filter((job) => job.kind === 'CHAT').map((job) => [job.id, job]))
        if (chatJobs.size) {
          this.messages = this.messages.map((message) => {
            if (!message.generationJobId) return message
            const job = chatJobs.get(message.generationJobId)
            if (!job) return message
            const reasoningTokens = message.reasoningTokens || (Number(job.reasoningTokens) > 0 ? Number(job.reasoningTokens) : undefined)
            const thinkingSeconds = message.thinkingSeconds || thinkingSecondsFrom(undefined, job)
            if (reasoningTokens === message.reasoningTokens && thinkingSeconds === message.thinkingSeconds) return message
            return {
              ...message,
              ...(reasoningTokens ? { reasoningTokens } : {}),
              ...(thinkingSeconds ? { thinkingSeconds } : {}),
            }
          })
        }
        // Chat jobs are represented by assistant messages. Keep only visual/
        // commerce jobs in the creation timeline so a chat reply cannot be
        // rendered as an image-generation card or suppress chat thinking UI.
        this.generations = (conversation.generationJobs || [])
          .filter((generation) => generation.kind !== 'CHAT')
          .map((generation) => mapGeneration(generation))
        // 失败的聊天任务没有持久化回复：合成本地失败占位，让用户能看到失败原因并重试
        const hydrated = [...this.messages]
        for (const job of conversation.generationJobs || []) {
          if (job.kind !== 'CHAT' || !terminalJob(job) || job.status !== 'FAILED') continue
          if (hydrated.some((message) => message.generationJobId === job.id && message.role === 'assistant' && message.content)) continue
          const failedAt = Date.parse(job.createdAt) || Date.now()
          const insertAt = hydrated.findIndex((message) => message.createdAt > failedAt)
          const failedMessage: Message = { id: `error:${job.id}`, role: 'assistant', content: chatFailureText(job.errorMessage), model: job.model || '', createdAt: failedAt, generationJobId: job.id, failed: true }
          hydrated.splice(insertAt < 0 ? hydrated.length : insertAt, 0, failedMessage)
        }
        this.messages = hydrated
        // Rebuild the chat composer state from the conversation payload. This is
        // important after a refresh or when opening history while a reply is in
        // flight: the local store may still contain an activity marker from the
        // conversation that was open before it.
        const activeChatJob = (conversation.generationJobs || []).find((job) => job.kind === 'CHAT' && !terminalJob(job))
        if (activeChatJob) {
          this.isGenerating = true
          this.activeJobId = activeChatJob.id
        } else {
          this.isGenerating = false
          this.activeJobId = ''
        }
        const generation = this.generations.at(-1) || null
        this.activeGeneration = generation
        if (generation && isGenerationActive(generation.status)) {
          void this.monitorGeneration(generation.id)
        }
        if (activeChatJob) {
          void this.monitorChatJob(activeChatJob.id, conversation.id, activeChatJob.model).catch((reason) => {
            if (this.currentConversationId === conversation.id) this.lastError = reason instanceof Error ? reason.message : '回复状态读取失败'
          })
        }
        return conversation
      } catch (reason) {
        if (loadSequence !== conversationLoadSequence) throw reason
        this.lastError = reason instanceof Error ? reason.message : '对话加载失败'
        throw reason
      } finally {
        if (loadSequence === conversationLoadSequence) {
          this.openingConversationId = ''
          this.isLoading = false
        }
      }
    },
    async setConversationModel(model: string) {
      if (!this.currentConversationId) return
      await api(`/conversations/${this.currentConversationId}`, { method: 'PATCH', body: JSON.stringify({ model }) })
      const conversation = [...this.conversations, ...this.archivedConversations].find((item) => item.id === this.currentConversationId)
      if (conversation) conversation.model = model
    },
    async renameConversation(conversationId: string, title: string) {
      const value = title.trim()
      if (!value) return
      await api(`/conversations/${conversationId}`, { method: 'PATCH', body: JSON.stringify({ title: value }) })
      const conversation = [...this.conversations, ...this.archivedConversations].find((item) => item.id === conversationId)
      if (conversation) conversation.title = value
    },
    async setConversationPinned(conversationId: string, pinned: boolean) {
      await api(`/conversations/${conversationId}`, { method: 'PATCH', body: JSON.stringify({ pinned }) })
      const conversation = [...this.conversations, ...this.archivedConversations].find((item) => item.id === conversationId)
      if (conversation) conversation.pinnedAt = pinned ? Date.now() : null
      this.conversations.sort((left, right) => {
        if (Boolean(left.pinnedAt) !== Boolean(right.pinnedAt)) return left.pinnedAt ? -1 : 1
        return (right.pinnedAt || right.updatedAt) - (left.pinnedAt || left.updatedAt)
      })
    },
    async archiveConversation(conversationId: string) {
      await api(`/conversations/${conversationId}`, { method: 'DELETE' })
      const conversation = this.conversations.find((item) => item.id === conversationId)
      this.conversations = this.conversations.filter((item) => item.id !== conversationId)
      if (conversation) this.archivedConversations = [{ ...conversation, archivedAt: Date.now() }, ...this.archivedConversations.filter((item) => item.id !== conversationId)]
      if (this.currentConversationId === conversationId) this.newConversation()
    },
    async restoreConversation(conversationId: string) {
      await api(`/conversations/${conversationId}`, { method: 'PATCH', body: JSON.stringify({ archived: false }) })
      const conversation = this.archivedConversations.find((item) => item.id === conversationId)
      this.archivedConversations = this.archivedConversations.filter((item) => item.id !== conversationId)
      if (conversation) this.conversations = [{ ...conversation, archivedAt: null, updatedAt: Date.now() }, ...this.conversations.filter((item) => item.id !== conversationId)]
    },
    async deleteConversation(conversationId: string) {
      await api(`/conversations/${conversationId}/permanent`, { method: 'DELETE' })
      this.conversations = this.conversations.filter((item) => item.id !== conversationId)
      this.archivedConversations = this.archivedConversations.filter((item) => item.id !== conversationId)
      if (this.currentConversationId === conversationId) this.newConversation()
    },
    async clearConversations() {
      await api('/conversations', { method: 'DELETE' })
      this.conversations = []
      this.archivedConversations = []
      this.newConversation()
    },
    async setMessageFeedback(messageId: string, value: 'UP' | 'DOWN' | null) {
      if (!this.currentConversationId) return
      await api(`/conversations/${this.currentConversationId}/messages/${messageId}/feedback`, { method: 'PATCH', body: JSON.stringify({ value }) })
      const message = this.messages.find((item) => item.id === messageId)
      if (message) message.feedback = value
    },
    async sendMessage(content: string, input: { model: string; assetIds?: string[]; assistantId?: string; pluginId?: string; webSearchEnabled?: boolean; webSearchSources?: WebSearchSource[]; responseMode?: 'fast' | 'expert'; officeMode?: 'agent' | 'expert' | 'fast' }) {
      const trimmed = content.trim()
      if (!trimmed) return
      const safeModel = input.model.trim() || 'gpt-5.5'
      let messagePersisted = false
      let jobId = ''
      this.isGenerating = true; this.lastError = ''
      try {
        if (!this.currentConversationId) {
          const conversation = await api<ServerConversation>('/conversations', { method: 'POST', body: JSON.stringify({ model: safeModel, projectId: this.currentProjectId || undefined, title: trimmed.slice(0, 42), temporary: this.temporaryChat }) })
          this.currentConversationId = conversation.id
          if (!conversation.temporary) this.conversations.unshift(mapConversation(conversation))
          this.messages = []
        }
        const conversationId = this.currentConversationId
        const userMessage = await api<ServerMessage>(`/conversations/${conversationId}/messages`, { method: 'POST', body: JSON.stringify({ content: trimmed, assetIds: input.assetIds || [] }) })
        messagePersisted = true
        if (this.currentConversationId === conversationId) this.messages.push({ id: userMessage.id, role: 'user', content: trimmed, createdAt: Date.parse(userMessage.createdAt), attachmentIds: input.assetIds })
        const job = await api<ServerJob>('/generations', { method: 'POST', body: JSON.stringify({ kind: 'CHAT', prompt: trimmed, model: safeModel, projectId: this.currentProjectId || undefined, conversationId, options: { ...(input.assistantId ? { assistantId: input.assistantId } : {}), ...(input.pluginId ? { pluginId: input.pluginId } : {}), webSearchEnabled: input.webSearchEnabled === true, ...(input.webSearchSources?.length ? { webSearchSources: input.webSearchSources.slice(0, 3) } : {}), responseMode: input.responseMode || 'fast', ...(input.officeMode ? { officeMode: input.officeMode } : {}) }, idempotencyKey: idempotencyKey('chat') }) })
        jobId = job.id
        if (this.currentConversationId === conversationId) this.activeJobId = job.id
        const pendingId = `stream:${job.id}`
        if (this.currentConversationId === conversationId) this.messages.push({ id: pendingId, role: 'assistant', content: '', model: safeModel, generationJobId: job.id, createdAt: Date.now(), webSearch: input.webSearchEnabled ? { enabled: true, status: 'searching', queries: [], sources: [] } : undefined })
        const terminalChatJob = await this.monitorChatJob(job.id, conversationId, safeModel)
        if (this.currentConversationId === conversationId && terminalChatJob.status === 'FAILED') {
          const index = this.messages.findIndex((message) => message.id === `stream:${job.id}` || message.generationJobId === job.id)
          const failedMessage: Message = { id: `error:${job.id}`, role: 'assistant', content: chatFailureText(terminalChatJob.errorMessage), model: safeModel, createdAt: Date.now(), generationJobId: job.id, failed: true }
          if (index >= 0) this.messages.splice(index, 1, failedMessage)
          else this.messages.push(failedMessage)
        }
        await Promise.all([
          this.currentConversationId === conversationId && (!this.openingConversationId || this.openingConversationId === conversationId) ? this.openConversation(conversationId) : Promise.resolve(),
          this.refreshConversations().catch(() => undefined),
          this.refreshCredits().catch(() => undefined),
        ])
      } catch (reason) {
        const message = reason instanceof Error ? reason.message : '消息发送失败'
        this.lastError = message
        throw new ChatSendError(message, !messagePersisted)
      } finally {
        if (!jobId || this.activeJobId === jobId) {
          this.isGenerating = false
          this.activeJobId = ''
        }
      }
    },
    async branchMessage(messageId: string, content: string, model: string, webSearchEnabled = false, responseMode: 'fast' | 'expert' = 'fast') {
      if (!this.currentConversationId || this.isGenerating) return
      const trimmed = content.trim()
      if (!trimmed) return
      const conversationId = this.currentConversationId
      const safeModel = model.trim() || 'gpt-5.5'
      let jobId = ''
      this.isGenerating = true; this.lastError = ''
      try {
        const updated = await api<ServerMessage>(`/conversations/${conversationId}/messages/${messageId}/branch`, { method: 'POST', body: JSON.stringify({ content: trimmed }) })
        if (this.currentConversationId === conversationId) {
          const index = this.messages.findIndex((message) => message.id === messageId)
          if (index >= 0) this.messages = [...this.messages.slice(0, index), { ...this.messages[index], content: trimmed, createdAt: Date.parse(updated.createdAt) }]
        }
        const job = await api<ServerJob>('/generations', { method: 'POST', body: JSON.stringify({ kind: 'CHAT', prompt: trimmed, model: safeModel, conversationId, projectId: this.currentProjectId || undefined, options: { webSearchEnabled, responseMode }, idempotencyKey: idempotencyKey('chat-branch') }) })
        jobId = job.id
        if (this.currentConversationId === conversationId) this.activeJobId = job.id
        const pendingId = `stream:${job.id}`
        if (this.currentConversationId === conversationId) this.messages.push({ id: pendingId, role: 'assistant', content: '', model: safeModel, generationJobId: job.id, createdAt: Date.now(), webSearch: webSearchEnabled ? { enabled: true, status: 'searching', queries: [], sources: [] } : undefined })
        const terminalChatJob = await this.monitorChatJob(job.id, conversationId, safeModel)
        if (this.currentConversationId === conversationId && terminalChatJob.status === 'FAILED') {
          const index = this.messages.findIndex((message) => message.id === `stream:${job.id}` || message.generationJobId === job.id)
          const failedMessage: Message = { id: `error:${job.id}`, role: 'assistant', content: chatFailureText(terminalChatJob.errorMessage), model: safeModel, createdAt: Date.now(), generationJobId: job.id, failed: true }
          if (index >= 0) this.messages.splice(index, 1, failedMessage)
          else this.messages.push(failedMessage)
        }
        await Promise.all([
          this.currentConversationId === conversationId && (!this.openingConversationId || this.openingConversationId === conversationId) ? this.openConversation(conversationId) : Promise.resolve(),
          this.refreshConversations(),
          this.refreshCredits(),
        ])
      } catch (reason) {
        this.lastError = reason instanceof Error ? reason.message : '消息重新生成失败'
        throw reason
      } finally {
        if (!jobId || this.activeJobId === jobId) {
          this.isGenerating = false
          this.activeJobId = ''
        }
      }
    },
    async switchMessageBranch(messageId: string) {
      if (!this.currentConversationId || this.isGenerating) return
      const conversationId = this.currentConversationId
      await api(`/conversations/${conversationId}/messages/${messageId}/activate`, { method: 'POST' })
      if (this.currentConversationId === conversationId) await this.openConversation(conversationId)
    },
    async refreshConversations() {
      const [active, archived] = await Promise.all([api<ServerConversation[]>('/conversations'), api<ServerConversation[]>('/conversations?archived=true')])
      this.conversations = active.map(mapConversation)
      this.archivedConversations = archived.map(mapConversation)
    },
    async createProject(name: string, brief = '') {
      const row = await api<ServerProject>('/projects', { method: 'POST', body: JSON.stringify({ name: name.trim(), description: brief.trim() }) })
      const project = mapProject(row); this.projects.unshift(project); this.currentProjectId = project.id; return project
    },
    async loadProjectDetail(projectId: string) {
      const row = await api<ServerProject>(`/projects/${projectId}`)
      const project = mapProject(row)
      const index = this.projects.findIndex((item) => item.id === projectId)
      if (index >= 0) this.projects[index] = project; else this.projects.unshift(project)
      return project
    },
    async updateProjectWorkflow(projectId: string, payload: { workflowStatus: ProjectWorkflowStatus; workflowConfig: Omit<ProjectWorkflowConfig, 'steps'> & { steps: Omit<ProjectWorkflowConfig['steps'][number], 'sortOrder'>[] }; defaultModel?: string; defaultAssistantId?: string | null; instructions?: string; changeSummary?: string; versionLabel?: string }) {
      const row = await api<ServerProject>(`/projects/${projectId}/workflow`, { method: 'PATCH', body: JSON.stringify(payload) })
      const project = mapProject(row)
      const index = this.projects.findIndex((item) => item.id === projectId)
      if (index >= 0) this.projects[index] = { ...this.projects[index], ...project }
      return project
    },
    async loadProjectVersions(projectId: string) {
      return (await api<ServerVersion[]>(`/projects/${projectId}/versions`)).map(mapVersion)
    },
    async createProjectVersion(projectId: string, payload: { label?: string; changeSummary?: string }) {
      return mapVersion(await api<ServerVersion>(`/projects/${projectId}/versions`, { method: 'POST', body: JSON.stringify(payload) }))
    },
    async restoreProjectVersion(projectId: string, version: number) {
      const row = await api<ServerProject>(`/projects/${projectId}/versions/${version}/restore`, { method: 'POST' })
      const project = mapProject(row)
      const index = this.projects.findIndex((item) => item.id === projectId)
      if (index >= 0) this.projects[index] = project
      return project
    },
    selectProject(projectId: string) { if (this.projects.some((project) => project.id === projectId)) this.currentProjectId = projectId },
    async setProjectArchived(projectId: string, archived: boolean) {
      const row = await api<ServerProject>(`/projects/${projectId}`, { method: 'PATCH', body: JSON.stringify({ archived }) })
      const index = this.projects.findIndex((project) => project.id === projectId)
      if (index >= 0) this.projects[index] = { ...this.projects[index], ...mapProject(row) }
      if (archived && this.currentProjectId === projectId) this.currentProjectId = ''
      return this.projects[index]
    },
    async deleteProject(projectId: string) {
      await api(`/projects/${projectId}`, { method: 'DELETE' })
      this.projects = this.projects.filter((project) => project.id !== projectId)
      if (this.currentProjectId === projectId) this.currentProjectId = ''
    },
    async uploadFiles(files: File[], forcedKind?: 'IMAGE' | 'FILE', projectId?: string, purpose: 'library' | 'reference' | 'mask' | 'attachment' = 'library') {
      const uploaded: StudioAsset[] = []
      for (const file of files) {
        const row = await uploadAsset<ServerAsset>(file, { kind: forcedKind, purpose, projectId })
        uploaded.push(mapAsset(row))
      }
      this.assets.unshift(...uploaded)
      return uploaded
    },
    async refreshAssets() { this.assets = (await api<ServerAsset[]>('/assets')).map(mapAsset) },
    async refreshCommerceJobs() { this.commerceRuns = (await api<ServerJob[]>('/generations?kind=COMMERCE')).map((job) => mapGeneration(job)) },
    async refreshVideoJobs() { this.videoRuns = (await api<ServerJob[]>('/generations?kind=VIDEO')).map((job) => mapGeneration(job)) },
    async deleteAsset(assetId: string) { await api(`/assets/${assetId}`, { method: 'DELETE' }); this.assets = this.assets.filter((asset) => asset.id !== assetId) },
    async generateAsset(options: GenerationOptions) {
      const job = await this.startGeneration(options)
      const completed = await this.pollGenerationJob(job.id)
      const result = mapGeneration(completed, options)
      if (result?.status === 'FAILED' || result?.status === 'CANCELLED') throw new Error(result.error || '生成任务失败')
      return result
    },
    async startGeneration(options: GenerationOptions, conversationId?: string, retry = false, conversationModel = 'gpt-5.5') {
      this.lastError = ''
      try {
        const kind = options.mode === 'commerce' ? 'COMMERCE' : options.mode === 'videos' ? 'VIDEO' : 'IMAGE'
        const safeConversationModel = conversationModel.trim() || options.model.trim() || 'gpt-5.5'
        let targetConversationId = conversationId
        if (!targetConversationId) {
          const conversation = await api<ServerConversation>('/conversations', { method: 'POST', body: JSON.stringify({ model: safeConversationModel, projectId: this.currentProjectId || undefined, title: options.prompt.slice(0, 42), temporary: this.temporaryChat }) })
          targetConversationId = conversation.id
          this.currentConversationId = conversation.id
          this.messages = []
          this.generations = []
          if (!conversation.temporary) this.conversations.unshift(mapConversation(conversation))
        } else {
          this.currentConversationId = targetConversationId
        }
        const messageContent = retry ? `按原方案重试「${options.mode === 'videos' ? '视频生成' : '图片生成'}」` : options.prompt
        const frameAssetIds = [options.firstFrameAssetId, options.lastFrameAssetId].filter((id): id is string => Boolean(id))
        const messageAssetIds = [...(options.referenceAssetIds || []), ...frameAssetIds]
        const userMessage = await api<ServerMessage>(`/conversations/${targetConversationId}/messages`, { method: 'POST', body: JSON.stringify({ content: messageContent, assetIds: messageAssetIds }) })
        this.messages.push({ id: userMessage.id, role: 'user', content: messageContent, createdAt: Date.parse(userMessage.createdAt), attachmentIds: messageAssetIds })
        const job = await api<ServerJob>('/generations', { method: 'POST', body: JSON.stringify({
          kind, prompt: options.prompt, model: options.model.trim() || safeConversationModel, projectId: this.currentProjectId || undefined, conversationId: targetConversationId,
          options: { size: options.ratio, quality: options.quality || 'medium', style: options.style, count: options.count, modules: options.modules, creationType: options.creationType, platform: options.platform, referenceAssetIds: options.referenceAssetIds || [], maskAssetId: options.maskAssetId, firstFrameAssetId: options.firstFrameAssetId, lastFrameAssetId: options.lastFrameAssetId, outputFormat: options.outputFormat, background: options.background, outputCompression: options.outputCompression, resolution: options.resolution, duration: options.duration, aspectRatio: options.aspectRatio, pluginId: options.pluginId, creationToolId: options.creationToolId },
          idempotencyKey: idempotencyKey(kind.toLowerCase()),
        }) })
        const generation = mapGeneration(job, options)
        this.activeGeneration = generation
        this.generations = [...this.generations.filter((item) => item.id !== job.id), generation]
        if (generation.mode === 'videos') this.videoRuns = [generation, ...this.videoRuns.filter((item) => item.id !== job.id)]
        if (generation.mode === 'commerce') this.commerceRuns = [generation, ...this.commerceRuns.filter((item) => item.id !== job.id)]
        void this.monitorGeneration(job.id)
        await this.refreshConversations()
        return job
      } catch (reason) {
        this.lastError = reason instanceof Error ? reason.message : '生成任务失败'
        this.cancelingJobId = ''
        throw reason
      }
    },
    async loadGeneration(jobId: string) {
      if (this.activeGeneration?.id === jobId) return this.activeGeneration
      const job = await api<ServerJob>(`/generations/${jobId}`)
      if (job.conversationId) {
        await this.openConversation(job.conversationId)
        const restored = this.generations.find((generation) => generation.id === jobId)
        if (restored) return restored
      }
      const generation = mapGeneration(job)
      this.activeGeneration = generation
      this.generations = [...this.generations.filter((item) => item.id !== job.id), generation]
      if (job.conversationId) this.currentConversationId = job.conversationId
      if (isGenerationActive(job.status)) {
        void this.monitorGeneration(job.id)
      }
      return this.activeGeneration
    },
    async retryGeneration(generationId?: string) {
      const current = generationId ? this.generations.find((generation) => generation.id === generationId) : this.activeGeneration
      if (!current) return null
      return this.startGeneration(current.request, current.conversationId, true)
    },
    async monitorGeneration(jobId: string, retries = 2) {
      try {
        const job = await this.pollGenerationJob(jobId)
        const current = this.generations.find((generation) => generation.id === jobId) || this.commerceRuns.find((generation) => generation.id === jobId) || this.videoRuns.find((generation) => generation.id === jobId) || (this.activeGeneration?.id === jobId ? this.activeGeneration : null)
        if (!current) return
        const updated = mapGeneration(job, current.request)
        this.generations = this.generations.map((generation) => generation.id === jobId ? updated : generation)
        this.commerceRuns = this.commerceRuns.map((generation) => generation.id === jobId ? updated : generation)
        this.videoRuns = this.videoRuns.map((generation) => generation.id === jobId ? updated : generation)
        if (this.activeGeneration?.id === jobId) this.activeGeneration = updated
        await Promise.all([this.refreshAssets(), this.refreshCredits(), this.refreshConversations(), updated.mode === 'commerce' ? this.refreshCommerceJobs() : updated.mode === 'videos' ? this.refreshVideoJobs() : Promise.resolve()])
      } catch {
        const job = await api<ServerJob>(`/generations/${jobId}`).catch(() => null)
        if (job && (job.status === 'FAILED' || job.status === 'CANCELLED')) {
          const current = this.generations.find((generation) => generation.id === jobId) || this.commerceRuns.find((generation) => generation.id === jobId) || this.videoRuns.find((generation) => generation.id === jobId) || (this.activeGeneration?.id === jobId ? this.activeGeneration : null)
          const updated = mapGeneration(job, current?.request)
          this.generations = this.generations.map((generation) => generation.id === jobId ? updated : generation)
          this.commerceRuns = this.commerceRuns.map((generation) => generation.id === jobId ? updated : generation)
          this.videoRuns = this.videoRuns.map((generation) => generation.id === jobId ? updated : generation)
          if (this.activeGeneration?.id === jobId) this.activeGeneration = updated
        } else if (retries > 0) {
          void this.monitorGeneration(jobId, retries - 1)
        }
      } finally { /* Each image task owns its own monitor and can run concurrently. */ }
    },
    async pollGenerationJob(jobId: string) {
      return waitForServerJob(jobId, (job) => {
        if (this.activeGeneration?.id === jobId && this.activeGeneration.status !== job.status) {
          this.activeGeneration = { ...this.activeGeneration, status: job.status }
          this.generations = this.generations.map((generation) => generation.id === jobId ? { ...generation, status: job.status } : generation)
        }
      })
    },
    async pollJob(jobId: string, onEvent?: (job: ServerJob) => void) {
      const job = await waitForServerJob(jobId, onEvent)
      if (job.status === 'SUCCEEDED') return job
      throw new Error(job.errorMessage || (job.status === 'CANCELLED' ? '任务已取消' : '生成任务失败'))
    },
    async monitorChatJob(jobId: string, conversationId: string, fallbackModel: string) {
      const existing = pendingChatJobs.get(jobId)
      if (existing) return existing

      const monitor = (async () => {
        let cursor = '0'
        const currentMessage = this.messages.find((message) => message.generationJobId === jobId || message.id === `stream:${jobId}`)
        // A reloaded conversation already contains the persisted prefix. Start
        // after its latest event; a brand-new optimistic row replays from zero.
        if (currentMessage?.content) {
          const history = await api<Array<{ sequence?: number }>>(`/generations/${jobId}/events/history`).catch(() => [])
          cursor = String(history.reduce((max, row) => Math.max(max, Number(row.sequence || 0)), 0))
        }
        const applyEvent = (event: ServerGenerationEvent) => {
          if (this.currentConversationId !== conversationId) return
          const payload = event.payload && typeof event.payload === 'object' && !Array.isArray(event.payload) ? event.payload as Record<string, unknown> : {}
          const textDelta = typeof payload.textDelta === 'string' ? payload.textDelta : ''
          const reasoningDelta = typeof payload.reasoningDelta === 'string' ? payload.reasoningDelta : ''
          const reasoningTokens = Math.max(0, Math.trunc(Number(payload.reasoningTokens || 0)))
          if (!textDelta && !reasoningDelta && !(event.type === 'usage' && reasoningTokens > 0)) return
          const pendingId = `stream:${jobId}`
          const index = this.messages.findIndex((message) => message.id === pendingId || message.generationJobId === jobId)
          const base = index >= 0 ? this.messages[index] : { id: pendingId, role: 'assistant' as const, content: '', model: fallbackModel, generationJobId: jobId, createdAt: Date.now() }
          const next = {
            ...base,
            content: `${base.content || ''}${textDelta}`,
            model: base.model || fallbackModel,
            generationJobId: jobId,
            reasoning: `${base.reasoning || ''}${reasoningDelta}`,
            ...(reasoningTokens > 0 ? { reasoningTokens } : {}),
          }
          if (index >= 0) this.messages.splice(index, 1, next)
          else this.messages.push(next)
        }
        for (let attempt = 0; attempt < 180; attempt += 1) {
          try {
            await streamApiEvents<ServerGenerationEvent>(`/generations/${jobId}/events/stream?after=${encodeURIComponent(cursor)}`, applyEvent, (meta) => {
              if (meta.id) cursor = meta.id
            })
          } catch {
            // The snapshot request below determines whether a reconnect is
            // still needed; transient stream failures are expected.
          }
          const current = await api<ServerJob>(`/generations/${jobId}`)
          if (current.stream && this.currentConversationId === conversationId) {
            const pendingId = `stream:${jobId}`
            const index = this.messages.findIndex((message) => message.id === pendingId || message.generationJobId === jobId)
            // The snapshot is authoritative after reconnect, but do not replace
            // a newer local delta with an older database read.
            if (index < 0 || current.stream.content.length >= this.messages[index].content.length) {
              const streamed = {
                id: current.stream.messageId,
                role: 'assistant' as const,
                content: current.stream.content,
                model: current.stream.model || fallbackModel,
                generationJobId: jobId,
                createdAt: index >= 0 ? this.messages[index].createdAt : Date.now(),
                reasoning: typeof current.stream.metadata?.reasoning === 'string' ? current.stream.metadata.reasoning : index >= 0 ? this.messages[index].reasoning : undefined,
                reasoningTokens: typeof current.stream.metadata?.reasoningTokens === 'number' && current.stream.metadata.reasoningTokens > 0
                  ? current.stream.metadata.reasoningTokens
                  : current.reasoningTokens && current.reasoningTokens > 0
                    ? current.reasoningTokens
                    : index >= 0 ? this.messages[index].reasoningTokens : undefined,
                thinkingSeconds: thinkingSecondsFrom(current.stream.metadata?.thinkingSeconds, current) || (index >= 0 ? this.messages[index].thinkingSeconds : undefined),
                webSearch: mapWebSearch(current.stream.metadata?.webSearch) || (index >= 0 ? this.messages[index].webSearch : undefined),
              }
              if (index >= 0) this.messages.splice(index, 1, streamed)
              else this.messages.push(streamed)
            }
          }
          if (terminalJob(current)) return current
          await new Promise((resolve) => window.setTimeout(resolve, 250))
        }
        throw new Error('任务处理超时，请稍后重新打开查看')
      })()
      pendingChatJobs.set(jobId, monitor)
      try { return await monitor }
      finally {
        if (pendingChatJobs.get(jobId) === monitor) pendingChatJobs.delete(jobId)
        // A terminal task can arrive through SSE/polling without going through
        // sendMessage's finally block (for example after a page refresh). Never
        // leave the composer in its stopping state in that case.
        if (this.activeJobId === jobId) {
          this.isGenerating = false
          this.activeJobId = ''
        }
      }
    },
    async resumeCurrentChat() {
      const conversationId = this.currentConversationId
      if (!conversationId || (this.openingConversationId && this.openingConversationId !== conversationId)) return
      let resumedJobId = ''
      try {
        await this.openConversation(conversationId)
        if (this.currentConversationId !== conversationId || (this.openingConversationId && this.openingConversationId !== conversationId)) return
        const jobs = await api<ServerJob[]>('/generations?kind=CHAT')
        if (this.currentConversationId !== conversationId || (this.openingConversationId && this.openingConversationId !== conversationId)) return
        const active = jobs.find((job) => job.conversationId === conversationId && isGenerationActive(job.status))
        if (!active) {
          this.isGenerating = false
          this.activeJobId = ''
          return
        }
        resumedJobId = active.id
        this.isGenerating = true
        this.activeJobId = active.id
        await this.monitorChatJob(active.id, conversationId, active.model)
        if (this.currentConversationId === conversationId && (!this.openingConversationId || this.openingConversationId === conversationId)) await this.openConversation(conversationId)
        await Promise.all([this.refreshConversations(), this.refreshCredits()])
      } catch (reason) {
        this.lastError = reason instanceof Error ? reason.message : '回复状态恢复失败'
      } finally {
        if (resumedJobId && this.currentConversationId === conversationId && this.activeJobId === resumedJobId) {
          this.isGenerating = false
          this.activeJobId = ''
        }
      }
    },
    async cancelGeneration(jobId: string) {
      if (!jobId || this.cancelingJobId === jobId) return
      this.cancelingJobId = jobId
      try {
        const job = await api<ServerJob>(`/generations/${jobId}/cancel`, { method: 'POST' })
        const current = this.generations.find((generation) => generation.id === jobId) || this.commerceRuns.find((generation) => generation.id === jobId) || this.videoRuns.find((generation) => generation.id === jobId) || undefined
        const updated = mapGeneration(job, current?.request)
        this.generations = this.generations.map((generation) => generation.id === jobId ? updated : generation)
        this.commerceRuns = this.commerceRuns.map((generation) => generation.id === jobId ? updated : generation)
        this.videoRuns = this.videoRuns.map((generation) => generation.id === jobId ? updated : generation)
        if (this.activeGeneration?.id === jobId) this.activeGeneration = updated
      } catch (reason) { this.lastError = reason instanceof Error ? reason.message : '停止任务失败' }
      finally {
        if (this.cancelingJobId === jobId) this.cancelingJobId = ''
        // Chat cancellation is also used by the composer stop button. Clear the
        // local activity marker even when the server reports the task as already
        // terminal or the cancel request races with the stream monitor.
        if (this.activeJobId === jobId) {
          this.isGenerating = false
          this.activeJobId = ''
        }
      }
    },
    async cancelActiveJob() { if (this.activeJobId) await this.cancelGeneration(this.activeJobId) },
    async refreshCredits() { const result = await api<{ balance: number }>('/credits'); this.credits = result.balance },
  },
})
