import assert from 'node:assert/strict'
import test from 'node:test'
import { computed, ref } from 'vue'
import {
  inferChatSubmissionCapability,
  unavailableChatCapabilityMessage,
  useChatSubmission,
} from '../../src/composables/chat/useChatSubmission.ts'
import type { GenerationOptions, StudioAsset } from '../../src/types.ts'

test('聊天提交只在聊天模式下识别明确的图片或视频意图', () => {
  assert.equal(inferChatSubmissionCapability('帮我生成一张商品海报图片', 'CHAT'), 'IMAGE')
  assert.equal(inferChatSubmissionCapability('帮我制作一个十秒视频', 'CHAT'), 'VIDEO')
  assert.equal(inferChatSubmissionCapability('分析这张图片的内容', 'CHAT'), 'CHAT')
  assert.equal(inferChatSubmissionCapability('生成一张图片', 'AGENT'), 'AGENT')
  assert.equal(inferChatSubmissionCapability('你好', 'CHAT', 'IMAGE'), 'IMAGE')
})

test('模型不可用提示保持各能力原有文案', () => {
  assert.equal(unavailableChatCapabilityMessage('CHAT'), '暂无可用聊天模型，请联系管理员配置健康渠道')
  assert.equal(unavailableChatCapabilityMessage('AGENT'), '暂无可用 Agent模型，请联系管理员配置健康渠道')
})

test('图片意图提交为生成任务并清空草稿和附件', async () => {
  const draft = ref('生成一张图片')
  const attachments = ref([{ id: 'asset-1' }] as StudioAsset[])
  const activeCapability = ref<'CHAT' | 'IMAGE' | 'VIDEO' | 'AGENT'>('CHAT')
  let submitted: GenerationOptions | null = null
  let scrolled = false
  const { submitMessage } = useChatSubmission({
    draft,
    attachments,
    activeCapability,
    activeCapabilityModel: computed(() => 'image-model'),
    capabilityModelAvailable: computed(() => true),
    model: computed(() => 'chat-model'),
    assistantId: computed(() => ''),
    pluginId: computed(() => ''),
    webSearchEnabled: computed(() => false),
    responseMode: computed(() => 'fast' as const),
    pendingRecommendationSource: ref(null),
  }, {
    isGenerating: () => false,
    requireAuth: () => true,
    loadModels: async () => undefined,
    setError: () => undefined,
    closePopovers: () => undefined,
    resizeComposer: () => undefined,
    scrollThreadToBottom: async () => { scrolled = true },
    currentConversationId: () => 'conversation-1',
    buildGenerationOptions: ({ content, assetIds }) => ({ mode: 'images', prompt: content, model: 'image-model', ratio: '1024x1024', count: 1, referenceAssetIds: assetIds }),
    startGeneration: async (options) => { submitted = options },
    sendChat: async () => assert.fail('不应发送聊天任务'),
    shouldRestoreDraft: () => false,
  })

  await submitMessage()

  assert.equal(activeCapability.value, 'IMAGE')
  assert.equal(submitted?.prompt, '生成一张图片')
  assert.deepEqual(submitted?.referenceAssetIds, ['asset-1'])
  assert.equal(draft.value, '')
  assert.deepEqual(attachments.value, [])
  assert.equal(scrolled, true)
})

test('消息持久化前失败时恢复草稿、附件和推荐来源', async () => {
  const source = { title: '来源', url: 'https://example.com' }
  const draft = ref('解释这个来源')
  const attachment = { id: 'asset-1' } as StudioAsset
  const attachments = ref([attachment])
  const pendingRecommendationSource = ref({ prompt: draft.value, source })
  const { submitMessage } = useChatSubmission({
    draft,
    attachments,
    activeCapability: ref('CHAT'),
    activeCapabilityModel: computed(() => 'chat-model'),
    capabilityModelAvailable: computed(() => true),
    model: computed(() => 'chat-model'),
    assistantId: computed(() => ''),
    pluginId: computed(() => ''),
    webSearchEnabled: computed(() => true),
    responseMode: computed(() => 'expert' as const),
    pendingRecommendationSource,
  }, {
    isGenerating: () => false,
    requireAuth: () => true,
    loadModels: async () => undefined,
    setError: () => undefined,
    closePopovers: () => undefined,
    resizeComposer: () => undefined,
    scrollThreadToBottom: async () => undefined,
    currentConversationId: () => '',
    buildGenerationOptions: () => assert.fail('不应构造生成任务'),
    startGeneration: async () => assert.fail('不应发送生成任务'),
    sendChat: async () => { throw new Error('发送失败') },
    shouldRestoreDraft: () => true,
  })

  await submitMessage()

  assert.equal(draft.value, '解释这个来源')
  assert.deepEqual(attachments.value, [attachment])
  assert.deepEqual(pendingRecommendationSource.value, { prompt: '解释这个来源', source })
})
