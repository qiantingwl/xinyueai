import type { Ref } from 'vue'
import { defaultCatalogModel, findCatalogModel, resolveCatalogModel, type CatalogModel } from '../../utils/model-catalog'

type CapabilitySelection = Record<'CHAT' | 'IMAGE' | 'VIDEO' | 'AGENT', string>

interface StudioModelCatalogState {
  models: Ref<CatalogModel[]>
  error: Ref<string>
  chatModel: Ref<string>
  imageModel: Ref<string>
  videoModel: Ref<string>
  commerceModel: Ref<string>
  capabilitySelections: CapabilitySelection
}

interface StudioModelCatalogActions {
  requestModels: () => Promise<CatalogModel[]>
  currentConversationId: () => string
  syncImageSelection: () => void
  syncVideoSelection: () => void
}

interface LoadModelCatalogOptions {
  applyDefaults?: boolean
  force?: boolean
}

export function useStudioModelCatalog(state: StudioModelCatalogState, actions: StudioModelCatalogActions) {
  let request: Promise<CatalogModel[]> | null = null
  let loadedAt = 0

  async function loadModelCatalog(options: LoadModelCatalogOptions = {}) {
    if (!options.force && state.models.value.length && Date.now() - loadedAt < 15_000) return state.models.value
    try {
      state.error.value = ''
      request ||= actions.requestModels()
      state.models.value = await request
      loadedAt = Date.now()

      const defaultChat = defaultCatalogModel(state.models.value, 'CHAT')
      const defaultImage = defaultCatalogModel(state.models.value, 'IMAGE')
      const defaultVideo = defaultCatalogModel(state.models.value, 'VIDEO')
      const defaultCommerce = defaultCatalogModel(state.models.value, 'COMMERCE')
      const chatSelection = findCatalogModel(state.models.value, state.chatModel.value, 'CHAT')
      const imageSelection = findCatalogModel(state.models.value, state.imageModel.value, 'IMAGE')
      const videoSelection = findCatalogModel(state.models.value, state.videoModel.value, 'VIDEO')
      const commerceSelection = findCatalogModel(state.models.value, state.commerceModel.value, 'COMMERCE')
      const knownChat = chatSelection || resolveCatalogModel(state.models.value, state.chatModel.value)
      const knownImage = imageSelection || resolveCatalogModel(state.models.value, state.imageModel.value)
      const knownVideo = videoSelection || resolveCatalogModel(state.models.value, state.videoModel.value)
      const knownCommerce = commerceSelection || resolveCatalogModel(state.models.value, state.commerceModel.value)

      if (chatSelection) state.chatModel.value = chatSelection.key
      else if (!actions.currentConversationId() && defaultChat && (options.applyDefaults || !state.chatModel.value.trim()) && !knownChat) state.chatModel.value = defaultChat.key
      if (imageSelection) state.imageModel.value = imageSelection.key
      else if (defaultImage && (options.applyDefaults || !state.imageModel.value.trim()) && !knownImage) state.imageModel.value = defaultImage.key
      if (videoSelection) state.videoModel.value = videoSelection.key
      else if (defaultVideo && (options.applyDefaults || !state.videoModel.value.trim()) && !knownVideo) state.videoModel.value = defaultVideo.key
      if (commerceSelection) state.commerceModel.value = commerceSelection.key
      else if (defaultCommerce && (options.applyDefaults || !state.commerceModel.value.trim()) && !knownCommerce) state.commerceModel.value = defaultCommerce.key

      state.capabilitySelections.CHAT = state.chatModel.value || defaultChat?.key || ''
      state.capabilitySelections.IMAGE = state.imageModel.value || defaultImage?.key || ''
      state.capabilitySelections.VIDEO = state.videoModel.value || defaultVideo?.key || ''
      state.capabilitySelections.AGENT = state.capabilitySelections.CHAT
      actions.syncImageSelection()
      actions.syncVideoSelection()
    } catch (reason) {
      state.error.value = reason instanceof Error
        ? `模型目录加载失败：${reason.message}`
        : '模型目录加载失败，请重新加载。'
    } finally {
      request = null
    }
    return state.models.value
  }

  function refreshModelCatalogOnFocus() {
    if (Date.now() - loadedAt >= 2_000) void loadModelCatalog({ force: true })
  }

  function refreshModelCatalog() {
    void loadModelCatalog({ force: true })
  }

  return { loadModelCatalog, refreshModelCatalogOnFocus, refreshModelCatalog }
}
