import assert from 'node:assert/strict'
import test from 'node:test'
import { catalogModelUnavailableMessage, catalogSelectionForValue, defaultCatalogModel, isCatalogModelAvailable, resolveCatalogModel, type CatalogModel } from '../../src/utils/model-catalog.ts'

const model = (key: string, capability: CatalogModel['capability'], isDefault = false, extra: Partial<CatalogModel> = {}) => ({
  key,
  displayName: extra.displayName || key,
  capability,
  isDefault,
  ...extra,
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

test('展示中的图片模型即使当前在对话能力也能被找回', () => {
  const models = [
    model('deepseek-v4', 'CHAT'),
    model('gpt-image-2', 'IMAGE', false, { displayName: 'GPT Image 2', upstreamModel: 'gpt-image-2' }),
  ]
  assert.equal(resolveCatalogModel(models, 'GPT Image 2', 'CHAT')?.key, 'gpt-image-2')
  assert.equal(resolveCatalogModel(models, 'gpt-image-2', 'CHAT')?.capability, 'IMAGE')
})

test('选择展示中的模型时按模型自身能力落槽，不会写进对话模型', () => {
  const models = [
    model('deepseek-v4', 'CHAT'),
    model('gpt-image-2', 'IMAGE', false, { displayName: 'GPT Image 2' }),
  ]
  const selection = catalogSelectionForValue(models, 'GPT Image 2', 'CHAT')
  assert.equal(selection.capability, 'IMAGE')
  assert.equal(selection.key, 'gpt-image-2')
  assert.equal(catalogSelectionForValue(models, 'gpt-image-2', 'AGENT').capability, 'AGENT')
})

test('刷新目录时不会把已选的图片模型名改成默认对话模型', async () => {
  const { reactive, ref } = await import('vue')
  const { useStudioModelCatalog } = await import('../../src/composables/studio/useStudioModelCatalog.ts')
  const models = [
    model('chat-a', 'CHAT', true),
    model('image-default', 'IMAGE', true, { displayName: 'Default Image' }),
    model('gpt-image-2', 'IMAGE', false, { displayName: 'GPT Image 2' }),
  ]
  const chatModel = ref('GPT Image 2')
  const imageModel = ref('GPT Image 2')
  const { loadModelCatalog } = useStudioModelCatalog({
    models: ref([]),
    error: ref(''),
    chatModel,
    imageModel,
    videoModel: ref(''),
    commerceModel: ref(''),
    capabilitySelections: reactive({ CHAT: 'GPT Image 2', IMAGE: 'GPT Image 2', VIDEO: '', AGENT: 'GPT Image 2' }),
  }, {
    requestModels: async () => models,
    currentConversationId: () => '',
    syncImageSelection: () => undefined,
    syncVideoSelection: () => undefined,
  })
  await loadModelCatalog({ force: true })
  assert.equal(chatModel.value, 'GPT Image 2')
  assert.equal(imageModel.value, 'gpt-image-2')
})
