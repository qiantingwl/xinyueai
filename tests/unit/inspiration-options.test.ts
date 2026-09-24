import assert from 'node:assert/strict'
import test from 'node:test'
import { inspirationAdminMedia, inspirationMedia, inspirationPreviewAssetIds, inspirationPreviewVideoAssetId, inspirationPreviewVideoUrl, inspirationPublicListFields, inspirationStoredAssetIds } from '../../server/src/inspirations/inspiration-options'

test('灵感预览只接受字符串资源 ID，最多 30 个', () => {
  assert.deepEqual(inspirationPreviewAssetIds({ previewAssetIds: ['a', 1, 'b'] }), ['a', 'b'])
  assert.equal(inspirationPreviewAssetIds({ previewAssetIds: Array.from({ length: 40 }, (_, index) => `id-${index}`) }).length, 30)
  assert.deepEqual(inspirationPreviewAssetIds({}), [])
})

test('灵感演示视频只认本站或 http(s) 地址', () => {
  assert.equal(inspirationPreviewVideoAssetId({ previewVideoAssetId: 'vid' }), 'vid')
  assert.equal(inspirationPreviewVideoAssetId({ previewVideoAssetId: '' }), undefined)
  assert.equal(inspirationPreviewVideoUrl({ previewVideoUrl: 'https://cdn.example/v.mp4' }), 'https://cdn.example/v.mp4')
  assert.equal(inspirationPreviewVideoUrl({ previewVideoUrl: '/v1/assets/1' }), '/v1/assets/1')
  assert.equal(inspirationPreviewVideoUrl({ previewVideoUrl: 'javascript:alert(1)' }), '')
})

test('灵感封面和预览地址规则前后台共用', () => {
  const uploaded = inspirationMedia('row-1', 'cover-1', 'https://ignored.example/cover.jpg', { previewVideoAssetId: 'vid-1', previewAssetIds: ['a'] })
  assert.equal(uploaded.imageUrl, '/v1/inspirations/row-1/cover')
  assert.equal(uploaded.videoUrl, '/v1/inspirations/row-1/video')
  assert.deepEqual(uploaded.previewAssetIds, ['a'])

  const remote = inspirationMedia('row-2', null, 'https://cdn.example/cover.jpg', { previewVideoUrl: 'https://cdn.example/v.mp4' })
  assert.equal(remote.imageUrl, 'https://cdn.example/cover.jpg')
  assert.equal(remote.videoUrl, 'https://cdn.example/v.mp4')
})

test('灵感公开列表合并本站预览和外部图片', () => {
  const row = inspirationPublicListFields('row-3', 'cover-1', '', { previewAssetIds: ['a'], previewImages: ['https://cdn.example/b.jpg', 1] })
  assert.equal(row.imageUrl, '/v1/inspirations/row-3/cover')
  assert.deepEqual(row.options.previewImages, ['/v1/inspirations/row-3/previews/a', 'https://cdn.example/b.jpg'])
})

test('灵感后台列表和删除共用同一套资源 ID', () => {
  const admin = inspirationAdminMedia('row-4', 'cover-1', '', { previewVideoAssetId: 'vid-1', previewAssetIds: ['a'] })
  assert.deepEqual(admin.uploadedPreviewVideo, { assetId: 'vid-1', url: '/v1/inspirations/row-4/video' })
  assert.deepEqual(admin.uploadedPreviewImages, [{ assetId: 'a', url: '/v1/inspirations/row-4/previews/a' }])
  assert.deepEqual(inspirationStoredAssetIds('cover-1', { previewVideoAssetId: 'vid-1', previewAssetIds: ['a'] }), ['a', 'vid-1', 'cover-1'])
})
