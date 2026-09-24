import { api } from '../services/api'

export type AssetUploadKind = 'IMAGE' | 'VIDEO' | 'FILE' | 'PRODUCT_PACK'

export function inferAssetKind(file: File, forced?: AssetUploadKind): AssetUploadKind {
  if (forced) return forced
  if (file.type.startsWith('image/')) return 'IMAGE'
  if (file.type.startsWith('video/')) return 'VIDEO'
  return 'FILE'
}

export async function uploadAsset<T>(file: File, options: {
  kind?: AssetUploadKind | 'AUDIO'
  purpose?: string
  projectId?: string | null
} = {}) {
  const kind = options.kind === 'AUDIO' ? 'FILE' : inferAssetKind(file, options.kind)
  const form = new FormData()
  form.append('file', file)
  const query = new URLSearchParams({ kind, purpose: options.purpose || 'library' })
  if (options.projectId) query.set('projectId', options.projectId)
  return api<T>(`/assets/uploads?${query}`, { method: 'POST', body: form })
}
