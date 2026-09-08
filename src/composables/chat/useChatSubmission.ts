import { nextTick, type Ref } from 'vue'
import type { GenerationOptions, StudioAsset, WebSearchSource } from '../../types'

export type ChatCapability = 'CHAT' | 'IMAGE' | 'VIDEO' | 'AGENT'

interface PendingRecommendationSource {
  prompt: string
  source: WebSearchSource
}

interface ChatSubmissionState {
  draft: Ref<string>
  attachments: Ref<StudioAsset[]>
  activeCapability: Ref<ChatCapability>
  activeCapabilityModel: Readonly<Ref<string>>
  capabilityModelAvailable: Readonly<Ref<boolean>>
  activeCapabilityModelUnavailableMessage: Readonly<Ref<string>>
  model: Readonly<Ref<string>>
  assistantId: Readonly<Ref<string>>
  pluginId: Readonly<Ref<string>>
  webSearchEnabled: Readonly<Ref<boolean>>
  responseMode: Readonly<Ref<'fast' | 'expert'>>
  pendingRecommendationSource: Ref<PendingRecommendationSource | null>
}

interface ChatSendInput {
  model: string
  assistantId?: string
  pluginId?: string
  assetIds: string[]
  webSearchEnabled: boolean
  webSearchSources?: WebSearchSource[]
  responseMode: 'fast' | 'expert'
  officeMode?: 'agent'
}

interface ChatGenerationInput {
  capability: 'IMAGE' | 'VIDEO'
  content: string
  assetIds: string[]
}

interface ChatSubmissionActions {
  isGenerating: () => boolean
  requireAuth: () => boolean
  loadModels: () => Promise<unknown>
  setError: (message: string) => void
  closePopovers: () => void
  resizeComposer: () => void
  scrollThreadToBottom: () => Promise<void>
  currentConversationId: () => string
  buildGenerationOptions: (input: ChatGenerationInput) => GenerationOptions
  startGeneration: (options: GenerationOptions, conversationId: string | undefined, retry: boolean, conversationModel: string) => Promise<unknown>
  sendChat: (content: string, input: ChatSendInput) => Promise<unknown>
  shouldRestoreDraft: (reason: unknown) => boolean
}

export function inferChatSubmissionCapability(content: string, current: ChatCapability): ChatCapability {
  if (current !== 'CHAT') return current
  if (/(生成|画|绘制|制作|设计|创建).{0,12}(图片|图像|海报|插画|头像)/i.test(content)) return 'IMAGE'
  if (/(生成|制作|创建|拍|剪).{0,12}(视频|短片|动画)/i.test(content)) return 'VIDEO'
  return current
}

export function unavailableChatCapabilityMessage(capability: ChatCapability) {
  const label = capability === 'AGENT'
    ? ' Agent'
    : capability === 'IMAGE'
      ? '图片'
      : capability === 'VIDEO'
        ? '视频'
        : '聊天'
  return `暂无可用${label}模型，请联系管理员配置健康渠道`
}

export function useChatSubmission(state: ChatSubmissionState, actions: ChatSubmissionActions) {
  async function submitMessage() {
    if (actions.isGenerating() || !actions.requireAuth()) return
    const content = state.draft.value.trim() || (state.attachments.value.length ? '请分析我上传的文件。' : '')
    if (!content) return

    await actions.loadModels()
    state.activeCapability.value = inferChatSubmissionCapability(content, state.activeCapability.value)
    if (!state.capabilityModelAvailable.value) {
      actions.setError(state.activeCapabilityModelUnavailableMessage.value || unavailableChatCapabilityMessage(state.activeCapability.value))
      return
    }

    const pendingAttachments = [...state.attachments.value]
    const pendingSource = state.pendingRecommendationSource.value
    const recommendationSource = pendingSource?.prompt === content ? pendingSource.source : undefined
    state.pendingRecommendationSource.value = null
    state.draft.value = ''
    state.attachments.value = []
    actions.closePopovers()
    await nextTick()
    actions.resizeComposer()

    try {
      if (state.activeCapability.value === 'IMAGE' || state.activeCapability.value === 'VIDEO') {
        const options = actions.buildGenerationOptions({
          capability: state.activeCapability.value,
          content,
          assetIds: pendingAttachments.map((asset) => asset.id),
        })
        await actions.startGeneration(
          options,
          actions.currentConversationId() || undefined,
          false,
          state.activeCapabilityModel.value,
        )
      } else {
        await actions.sendChat(content, {
          model: state.activeCapability.value === 'AGENT' ? state.activeCapabilityModel.value : state.model.value,
          assistantId: state.assistantId.value || undefined,
          pluginId: state.pluginId.value || undefined,
          assetIds: pendingAttachments.map((asset) => asset.id),
          webSearchEnabled: state.webSearchEnabled.value,
          webSearchSources: recommendationSource ? [recommendationSource] : undefined,
          responseMode: state.responseMode.value,
          officeMode: state.activeCapability.value === 'AGENT' ? 'agent' : undefined,
        })
      }
      await actions.scrollThreadToBottom()
    } catch (reason) {
      if (actions.shouldRestoreDraft(reason)) {
        if (!state.draft.value.trim()) state.draft.value = content
        if (!state.attachments.value.length) state.attachments.value = pendingAttachments
        if (recommendationSource) {
          state.pendingRecommendationSource.value = { prompt: content, source: recommendationSource }
        }
      }
      await nextTick()
      actions.resizeComposer()
    }
  }

  return { submitMessage }
}
