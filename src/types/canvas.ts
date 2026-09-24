export type CanvasKind = 'FREEFORM' | 'SHORT_DRAMA'
export type CanvasNodeKind = 'TEXT' | 'IMAGE' | 'VIDEO' | 'AUDIO' | 'GROUP' | 'CONFIG'
export type CanvasBackground = 'dots' | 'lines' | 'none'
export type CanvasGenerationKind = 'IMAGE' | 'VIDEO'
export type CanvasGenerationStatus = 'IDLE' | 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED'

export interface CanvasGenerationOptions {
  size?: string
  quality?: string
  count?: number
  outputFormat?: 'png' | 'jpeg' | 'webp'
  background?: 'auto' | 'opaque' | 'transparent'
  resolution?: string
  duration?: number
  aspectRatio?: string
}

export type CanvasImageToolType = 'BACKGROUND_REMOVAL' | 'INPAINT' | 'OUTPAINT' | 'UPSCALE' | 'CUSTOM'
export type CanvasDramaStage = 'SCRIPT' | 'ASSETS' | 'STORYBOARD' | 'PRODUCTION'
export type CanvasDramaRole = 'STAGE' | 'SCRIPT' | 'EPISODE' | 'CHARACTER' | 'SCENE' | 'PROP' | 'SHOT_PROMPT' | 'STORYBOARD' | 'SHOT_VIDEO'

export interface CanvasShotContinuity {
  shotSize?: string
  cameraAngle?: string
  composition?: string
  characterBlocking?: string
  gazeDirection?: string
  actionStart?: string
  actionEnd?: string
  axisRule?: string
  notes?: string
}

export interface CanvasImageToolOptions {
  outpaintLeft?: number
  outpaintRight?: number
  outpaintTop?: number
  outpaintBottom?: number
  steps?: number
  strength?: number
}

export interface CanvasNodeData {
  kind: CanvasNodeKind
  title: string
  content: string
  url?: string
  assetId?: string
  mimeType?: string
  prompt?: string
  model?: string
  generationKind?: CanvasGenerationKind
  generationOptions?: CanvasGenerationOptions
  creationToolId?: string
  creationToolTitle?: string
  imageToolOptions?: CanvasImageToolOptions
  maskAssetId?: string
  jobId?: string
  status?: CanvasGenerationStatus
  error?: string
  creditCost?: number
  fontSize?: number
  dramaStage?: CanvasDramaStage
  dramaRole?: CanvasDramaRole
  episodeId?: string
  episodeOrder?: number
  shotId?: string
  shotOrder?: number
  dialogue?: string
  narration?: string
  cameraMotion?: string
  duration?: number
  characterNames?: string[]
  sceneName?: string
  continuity?: CanvasShotContinuity
}

export interface CanvasDocumentNode {
  id: string
  type: CanvasNodeKind
  title: string
  position: { x: number; y: number }
  size: { width: number; height: number }
  data: CanvasNodeData
}

export interface CanvasDocumentEdge {
  id: string
  source: string
  target: string
  label?: string
}

export interface CanvasDocumentPayload {
  version: 1
  viewport: { x: number; y: number; zoom: number }
  background: CanvasBackground
  nodes: CanvasDocumentNode[]
  edges: CanvasDocumentEdge[]
}

export type CanvasAgentOperationType = 'add_text' | 'add_image' | 'add_video' | 'update_node' | 'connect_nodes' | 'move_node' | 'delete_node' | 'run_generation'

export interface CanvasAgentOperation {
  type: CanvasAgentOperationType
  tempId?: string
  nodeId?: string
  source?: string
  target?: string
  title?: string
  content?: string
  prompt?: string
  x?: number
  y?: number
}

export interface CanvasProjectSummary {
  id: string
  name: string
  teamId?: string | null
}

export interface CanvasCapabilities {
  canvasAccess: boolean
  shortDramaAccess: boolean
  maxCanvases: number
  maxCanvasNodes: number
  usedCanvases: number
}

export interface CanvasSummary {
  id: string
  userId: string
  projectId?: string | null
  title: string
  kind: CanvasKind
  revision: number
  archivedAt?: string | null
  createdAt: string
  updatedAt: string
  nodeCount: number
  edgeCount: number
  accessRole: 'OWNER' | 'ADMIN' | 'MEMBER'
  project?: CanvasProjectSummary | null
}

export interface CanvasRecord extends Omit<CanvasSummary, 'nodeCount' | 'edgeCount'> {
  document: CanvasDocumentPayload
}

export function emptyCanvasDocument(): CanvasDocumentPayload {
  return { version: 1, viewport: { x: 0, y: 0, zoom: 1 }, background: 'lines', nodes: [], edges: [] }
}

export function canvasDocumentFromStudioAssets(
  assets: Array<{ id: string; title?: string; contentUrl?: string; mimeType?: string; prompt?: string; kind?: string }>,
  prompt = '',
): CanvasDocumentPayload {
  const nodes = assets.filter((asset) => asset.contentUrl).map((asset, index) => {
    const isVideo = asset.kind === 'video' || asset.kind === 'VIDEO'
    const type: CanvasNodeKind = isVideo ? 'VIDEO' : 'IMAGE'
    const title = (asset.title || prompt || (isVideo ? '生成视频' : '生成图片')).replace(/\s+/g, ' ').trim().slice(0, 120)
    return {
      id: `gen-${index + 1}`,
      type,
      title,
      position: { x: 80 + index * 360, y: 80 },
      size: { width: 320, height: isVideo ? 240 : 320 },
      data: {
        kind: type,
        title,
        content: '',
        url: asset.contentUrl,
        assetId: asset.id,
        mimeType: asset.mimeType,
        prompt: (asset.prompt || prompt || '').slice(0, 20_000),
        generationKind: type,
        status: 'SUCCEEDED' as const,
      },
    }
  })
  return { version: 1, viewport: { x: 0, y: 0, zoom: 1 }, background: 'lines', nodes, edges: [] }
}
