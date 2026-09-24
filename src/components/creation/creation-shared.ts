import type { StudioAsset } from '../../types'
import type { ImageToolOptions } from '../../utils/image-tools'
import { formatFileSize } from '../../utils/format-bytes'

export interface Inspiration {
  id: string
  title: string
  prompt: string
  badge: string
  imageUrl: string
  videoUrl?: string
  model?: string | null
  options?: Record<string, unknown> | null
}
export interface ImageTool extends Inspiration { enabled?: boolean; options?: ImageToolOptions | null }

export type CreationMenu = 'model' | 'type' | 'size' | 'style' | 'resolution' | 'duration' | 'aspect' | 'platform' | 'quality' | 'modules' | 'count' | 'format' | 'background' | 'videoSettings' | null

export function hasImagePreview(asset: StudioAsset) {
  return Boolean(asset.contentUrl) && (asset.kind === 'image' || asset.mimeType?.startsWith('image/'))
}

export function attachmentMeta(asset: StudioAsset) {
  const extension = asset.title.includes('.') ? asset.title.split('.').pop()?.toUpperCase() : undefined
  const type = extension || asset.mimeType?.split('/').pop()?.toUpperCase() || '文件'
  return asset.size ? `${type} · ${formatFileSize(asset.size)}` : type
}
