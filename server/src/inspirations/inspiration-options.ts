import { asJsonRecord } from '../common/json-record'

export function inspirationPreviewAssetIds(value: unknown) {
  const options = asJsonRecord(value)
  return Array.isArray(options.previewAssetIds)
    ? options.previewAssetIds.filter((item): item is string => typeof item === 'string').slice(0, 30)
    : []
}

export function inspirationPreviewVideoAssetId(value: unknown) {
  const id = asJsonRecord(value).previewVideoAssetId
  return typeof id === 'string' && id ? id : undefined
}

export function inspirationPreviewVideoUrl(value: unknown) {
  const url = asJsonRecord(value).previewVideoUrl
  return typeof url === 'string' && /^(?:https?:\/\/|\/)/.test(url) ? url : ''
}

export function inspirationMedia(id: string, coverAssetId: string | null | undefined, coverUrl: string | null | undefined, options: unknown) {
  const videoAssetId = inspirationPreviewVideoAssetId(options)
  return {
    imageUrl: coverAssetId ? `/v1/inspirations/${id}/cover` : coverUrl || '',
    videoUrl: videoAssetId ? `/v1/inspirations/${id}/video` : inspirationPreviewVideoUrl(options),
    videoAssetId,
    previewAssetIds: inspirationPreviewAssetIds(options),
  }
}

export function inspirationPublicListFields(id: string, coverAssetId: string | null | undefined, coverUrl: string | null | undefined, options: unknown) {
  const record = asJsonRecord(options)
  const externalImages = Array.isArray(record.previewImages) ? record.previewImages.filter((value): value is string => typeof value === 'string') : []
  const media = inspirationMedia(id, coverAssetId, coverUrl, record)
  return {
    imageUrl: media.imageUrl,
    videoUrl: media.videoUrl,
    options: {
      ...record,
      previewImages: [...media.previewAssetIds.map((assetId) => `/v1/inspirations/${id}/previews/${assetId}`), ...externalImages],
    },
  }
}

export function inspirationAdminMedia(id: string, coverAssetId: string | null | undefined, coverUrl: string | null | undefined, options: unknown) {
  const media = inspirationMedia(id, coverAssetId, coverUrl, options)
  return {
    imageUrl: media.imageUrl,
    videoUrl: media.videoUrl,
    uploadedPreviewVideo: media.videoAssetId ? { assetId: media.videoAssetId, url: `/v1/inspirations/${id}/video` } : null,
    uploadedPreviewImages: media.previewAssetIds.map((assetId) => ({ assetId, url: `/v1/inspirations/${id}/previews/${assetId}` })),
  }
}

export function inspirationStoredAssetIds(coverAssetId: string | null | undefined, options: unknown) {
  const videoAssetId = inspirationPreviewVideoAssetId(options)
  return [...inspirationPreviewAssetIds(options), ...(videoAssetId ? [videoAssetId] : []), ...(coverAssetId ? [coverAssetId] : [])]
}
