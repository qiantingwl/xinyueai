export type StudioMode = 'chat' | 'images' | 'videos' | 'commerce' | 'office' | 'prompts' | 'plugins' | 'projects' | 'assets' | 'api'
export type PluginCapability = 'CHAT' | 'IMAGE' | 'VIDEO' | 'COMMERCE' | 'OFFICE'
export interface PluginCategory { id: string; name: string; slug: string; description: string; icon: string; sortOrder: number; enabled: boolean; _count?: { plugins: number } }
export interface Plugin { id: string; name: string; slug: string; description: string; instruction: string; icon: string; version: string; categoryId?: string | null; capabilities: PluginCapability[]; recommendedModel: string; outputRequirements: string; visibility: 'OFFICIAL' | 'PRIVATE'; status: 'DRAFT' | 'PUBLISHED' | 'DISABLED'; featured: boolean; priceCredits: number; installCount: number; usageCount: number; errorCount: number; installed?: boolean; owned?: boolean; category?: PluginCategory | null }

export type AssetKind = 'image' | 'video' | 'text' | 'product-pack'

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: number
  attachmentIds?: string[]
  model?: string
  feedback?: 'UP' | 'DOWN' | null
  author?: { id: string; displayName: string; email?: string | null } | null
  deletedAt?: number | null
  canDelete?: boolean
  canEdit?: boolean
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
  author?: { id: string; displayName: string; email?: string | null } | null
  deletedMessageCount?: number
  auditProtected?: boolean
}

export interface ProjectMember {
  userId: string
  joinedAt: number
  user: { id: string; displayName: string; email: string | null; avatarUrl?: string | null }
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
  purpose?: 'generated' | 'reference' | 'mask' | 'attachment' | 'library'
  contentUrl?: string
  mimeType?: string
  size?: number
  jobId?: string
  position?: number
  moduleLabel?: string
  creationType?: string
  platform?: string
  options?: Record<string, unknown>
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
  accessRole: 'OWNER' | 'MEMBER'
  owner?: { id: string; displayName: string; email: string | null }
  members: ProjectMember[]
}

export type ProjectSkillChangeType = 'MANUAL' | 'SUMMARY' | 'RESTORE' | 'DISABLE'

export interface ProjectSkillVersion {
  id: string
  projectId: string
  version: number
  name: string
  content: string
  enabled: boolean
  changeType: ProjectSkillChangeType
  changeSummary: string
  previousVersionId?: string | null
  sourceConversationId?: string | null
  sourceConversation?: { id: string; title: string } | null
  createdBy: { id: string; displayName: string; email: string | null }
  createdAt: number
  active: boolean
}

export interface ProjectSkillStatus {
  activeVersionId: string | null
  active: ProjectSkillVersion | null
  versions: ProjectSkillVersion[]
}

export interface ProjectSkillCandidate {
  name: string
  content: string
  changeSummary: string
  basedOnVersion: number | null
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
