import assert from 'node:assert/strict'
import test from 'node:test'
import { canvasDocumentFromStudioAssets } from '../../src/types/canvas.ts'

test('生成结果写入画布时按素材建成图片节点', () => {
  const document = canvasDocumentFromStudioAssets([
    { id: 'asset-1', title: '主图', contentUrl: 'https://cdn.example/a.png', mimeType: 'image/png', prompt: '洗发水主图' },
    { id: 'asset-2', kind: 'video', title: '成片', contentUrl: 'https://cdn.example/b.mp4', mimeType: 'video/mp4' },
  ], '为洗护产品制作一套电商素材包')

  assert.equal(document.nodes.length, 2)
  assert.equal(document.nodes[0]?.type, 'IMAGE')
  assert.equal(document.nodes[0]?.data.assetId, 'asset-1')
  assert.equal(document.nodes[0]?.data.url, 'https://cdn.example/a.png')
  assert.equal(document.nodes[0]?.data.status, 'SUCCEEDED')
  assert.equal(document.nodes[1]?.type, 'VIDEO')
  assert.equal(document.edges.length, 0)
})

test('没有文件地址的素材不会建成空节点', () => {
  const document = canvasDocumentFromStudioAssets([{ id: 'asset-1', title: '未完成' }], '海报')
  assert.equal(document.nodes.length, 0)
})
