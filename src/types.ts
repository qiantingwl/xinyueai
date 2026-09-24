export type StudioMode = 'chat' | 'images' | 'videos' | 'commerce' | 'office' | 'prompts' | 'plugins' | 'workspace' | 'projects' | 'assets'
export type PluginCapability = 'CHAT' | 'IMAGE' | 'VIDEO' | 'COMMERCE' | 'OFFICE'
export interface PluginCategory { id: string; name: string; slug: string; description: string; icon: string; sortOrder: number; enabled: boolean; _count?: { plugins: number } }
export interface Plugin { id: string; name: string; slug: string; description: string; instruction: string; icon: string; version: string; categoryId?: string | null; capabilities: PluginCapability[]; recommendedModel: string; outputRequirements: string; visibility: 'OFFICIAL' | 'PRIVATE'; status: 'DRAFT' | 'PUBLISHED' | 'DISABLED'; featured: boolean; priceCredits: number; installCount: number; usageCount: number; errorCount: number; installed?: boolean; owned?: boolean; preinstalled?: boolean; category?: PluginCategory | null }
export type ExternalMarketSource = 'skillsmp' | 'lobehub' | 'cocoloop' | 'skillhub'
export type ExternalSkillCategory = '开发编程' | '办公效率' | '研究分析' | '内容创作' | '设计创意' | '营销运营' | 'Agent 自动化' | '通用技能'
export interface ExternalSkill { id: string; source: ExternalMarketSource; sourceName: string; name: string; description: string; author: string; version: string; sourceUrl: string; githubUrl?: string; downloadUrl?: string; skillUrl?: string; installable: boolean; risk: 'unreviewed' | 'reviewed'; stars?: number; installs?: number; updatedAt?: string; category?: ExternalSkillCategory; installed?: boolean; licenseStatus?: 'unverified' | 'restricted'; licenseNote?: string }
export interface AssistantProfile { id: string; name: string; description: string; defaultModel: string; templateIds?: string[]; tools?: Array<{ toolId: string; name?: string }> }
export interface KnowledgeBaseAssetLink { assetId: string; chunkCount: number; asset: { id: string; name: string; mimeType: string; createdAt: string } }
export interface KnowledgeBaseSummary { id: string; name: string; description: string; status: string; documentCount: number; chunkCount: number; assets?: KnowledgeBaseAssetLink[]; _count?: { assets: number; assistants: number } }

export type AssetKind = 'image' | 'video' | 'text' | 'product-pack'

export interface WebSearchSource {
  title: string
  url: string
  content?: string
  publishedAt?: string
}

export interface MessageWebSearch {
  enabled: boolean
  status: 'searching' | 'completed' | 'failed'
  queries: string[]
  sources: WebSearchSource[]
  error?: string
}

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  /** Model-visible chain of thought when the provider exposes it. */
  reasoning?: string
  /** Hidden/internal reasoning tokens, used to keep the thinking row after the stream ends. */
  reasoningTokens?: number
  /** Wall-clock seconds spent thinking/searching before the answer started. */
  thinkingSeconds?: number
  createdAt: number
  generationJobId?: string
  attachmentIds?: string[]
  model?: string
  feedback?: 'UP' | 'DOWN' | null
  suggestions?: string[]
  webSearch?: MessageWebSearch
  parentId?: string | null
  branchIndex?: number
  branchCount?: number
  branches?: Array<{ id: string; branchIndex: number }>
  /** 生成失败的助手占位（本地合成，服务器不会持久化失败回复） */
  failed?: boolean
}

export interface CodeArtifact {
  code: string
  language: string
  title: string
}

export interface ConversationSummary {
  id: string
  title: string
  model: string
  projectId?: string | null
  pinnedAt?: number | null
  sharedAt?: number | null
  createdAt: number
  updatedAt: number
  archivedAt?: number | null
}

export interface StudioAsset {
  id: string
  kind: AssetKind
  title: string
  prompt: string
  preview: string
  status: 'queued' | 'running' | 'done'
  createdAt: number
  tags: string[]
  source?: 'generated' | 'upload'
  purpose?: 'generated' | 'reference' | 'mask' | 'attachment' | 'library' | 'image-prompt'
  contentUrl?: string
  mimeType?: string
  size?: number
  jobId?: string
  position?: number
  moduleLabel?: string
  creationType?: string
  platform?: string
  options?: Record<string, unknown>
  teamId?: string | null
  team?: { id: string; name: string } | null
  owner?: { id: string; displayName: string } | null
  projectId?: string | null
  canManage?: boolean
}

export interface Project {
  id: string
  name: string
  brief: string
  updatedAt: number
  assetIds: string[]
  assets: StudioAsset[]
  conversations: ConversationSummary[]
  assetCount: number
  conversationCount: number
  versionCount: number
  archived?: boolean
  description?: string
  instructions?: string
  workflowStatus: ProjectWorkflowStatus
  workflowConfig: ProjectWorkflowConfig
  defaultModel: string
  defaultAssistantId?: string | null
  revision: number
  accessRole: 'OWNER' | 'ADMIN' | 'MEMBER'
  owner?: { id: string; displayName: string; email?: string | null }
  members: ProjectMember[]
  activeSkillVersion?: ProjectSkillVersion | null
  teamId?: string | null
  team?: { id: string; name: string } | null
}

export interface ProjectMember {
  projectId: string
  userId: string
  role: 'ADMIN' | 'MEMBER'
  joinedAt: string
  user: { id: string; displayName: string; email?: string | null; avatarUrl?: string | null }
}

export interface ProjectSkillVersion {
  id: string
  projectId: string
  version: number
  name: string
  content: string
  enabled: boolean
  changeType: 'MANUAL' | 'SUMMARY' | 'RESTORE' | 'DISABLE'
  changeSummary: string
  sourceConversationId?: string | null
  createdAt: string
  active?: boolean
  createdBy?: { id: string; displayName: string; email?: string | null }
  sourceConversation?: { id: string; title: string } | null
}

export interface ProjectSkillStatus {
  canManage: boolean
  activeVersionId?: string | null
  active?: ProjectSkillVersion | null
  versions: ProjectSkillVersion[]
}

export interface ProjectSkillCandidate {
  name: string
  content: string
  changeSummary: string
  basedOnVersion?: number | null
  sourceConversation: { id: string; title: string }
}

export type ProjectWorkflowStatus = 'PLANNING' | 'IN_PROGRESS' | 'REVIEW' | 'COMPLETED' | 'ARCHIVED'
export type ProjectStepStatus = 'TODO' | 'IN_PROGRESS' | 'DONE'

export interface ProjectWorkflowStep {
  id: string
  title: string
  description: string
  status: ProjectStepStatus
  sortOrder: number
}

export interface ProjectWorkflowConfig {
  steps: ProjectWorkflowStep[]
  defaultPrompt: string
  outputRequirements: string
}

export interface ProjectVersion {
  id: string
  projectId: string
  version: number
  label: string
  changeSummary: string
  snapshot: {
    name: string
    description: string
    instructions: string
    workflowStatus: ProjectWorkflowStatus
    workflowConfig: ProjectWorkflowConfig
    defaultModel: string
    defaultAssistantId: string | null
    revision: number
  }
  createdAt: number
}

export interface GenerationOptions {
  mode: StudioMode
  prompt: string
  model: string
  ratio: string
  count: number
  quality?: string
  style?: string
  modules?: number
  referenceAssetIds?: string[]
  maskAssetId?: string
  firstFrameAssetId?: string
  lastFrameAssetId?: string
  creationType?: string
  platform?: string
  outputFormat?: 'png' | 'jpeg' | 'webp'
  background?: 'auto' | 'opaque' | 'transparent'
  outputCompression?: number
  resolution?: string
  duration?: number
  aspectRatio?: string
  creditCost?: number
  pluginId?: string
  creationToolId?: string
}

export type GenerationRunStatus = 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED'

export interface GenerationRun {
  id: string
  conversationId?: string
  prompt: string
  model: string
  mode: 'images' | 'videos' | 'commerce'
  status: GenerationRunStatus
  error: string
  assets: StudioAsset[]
  request: GenerationOptions
  createdAt: number
}
