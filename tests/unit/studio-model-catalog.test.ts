import assert from 'node:assert/strict'
import test from 'node:test'
import { catalogModelUnavailableMessage, defaultCatalogModel, isCatalogModelAvailable, type CatalogModel } from '../../src/utils/model-catalog.ts'

const model = (key: string, capability: CatalogModel['capability'], isDefault = false) => ({
  key,
  displayName: key,
  capability,
  isDefault,
}) as CatalogModel

test('模型目录优先使用能力内的默认模型', () => {
  const models = [model('chat-a', 'CHAT'), model('chat-b', 'CHAT', true), model('image-a', 'IMAGE')]
  assert.equal(defaultCatalogModel(models, 'CHAT')?.key, 'chat-b')
  assert.equal(defaultCatalogModel(models, 'IMAGE')?.key, 'image-a')
})

test('没有对应能力时不伪造默认模型', () => {
  assert.equal(defaultCatalogModel([model('chat-a', 'CHAT')], 'VIDEO'), undefined)
})

test('未配置模型不会被当成可提交模型', () => {
  assert.equal(isCatalogModelAvailable(model('chat-a', 'CHAT')), true)
  assert.equal(isCatalogModelAvailable({ ...model('chat-b', 'CHAT'), availability: 'DEGRADED', routeCount: 1 }), true)
  assert.equal(isCatalogModelAvailable({ ...model('chat-c', 'CHAT'), availability: 'UNCONFIGURED', routeCount: 0 }), false)
  assert.equal(catalogModelUnavailableMessage({ ...model('chat-c', 'CHAT'), displayName: '聊天模型', availability: 'UNCONFIGURED', availabilityReason: 'API_KEY_MISSING', routeCount: 0 }), '聊天模型 未配置渠道 API key')
})

test('默认模型优先选择有渠道的模型', () => {
  const models = [
    { ...model('chat-default', 'CHAT', true), availability: 'UNCONFIGURED', routeCount: 0 },
    { ...model('chat-ready', 'CHAT'), availability: 'DEGRADED', routeCount: 1 },
  ] as CatalogModel[]
  assert.equal(defaultCatalogModel(models, 'CHAT')?.key, 'chat-ready')
})
