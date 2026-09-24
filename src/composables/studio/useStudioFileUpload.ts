import { computed, ref, type Ref } from 'vue'
import type { StudioAsset, StudioMode } from '../../types'

export type StudioFilePurpose = 'chat-file' | 'creation' | 'mask' | 'first-frame' | 'last-frame' | 'library'
type StudioUploadPurpose = 'attachment' | 'reference' | 'mask' | 'library'

interface StudioFileUploadState {
  activeMode: Readonly<Ref<StudioMode>>
  chatAttachments: Ref<StudioAsset[]>
  creationAttachments: Ref<StudioAsset[]>
  maskAttachment: Ref<StudioAsset | null>
  firstFrameAttachment: Ref<StudioAsset | null>
  lastFrameAttachment: Ref<StudioAsset | null>
}

interface StudioFileUploadActions {
  requireAuth: (redirect: string) => boolean
  currentProjectId: () => string
  uploadFiles: (files: File[], kind: 'IMAGE' | undefined, projectId: string | undefined, purpose: StudioUploadPurpose) => Promise<StudioAsset[]>
  closeComposerPopovers: () => void
  closeNewMenu: () => void
  clearError: () => void
  setError: (message: string) => void
}

export function studioFileRedirect(mode: StudioMode) {
  if (mode === 'assets') return '/workspace?tab=files'
  if (mode === 'commerce') return '/commerce'
  if (mode === 'images') return '/image'
  if (mode === 'videos') return '/video'
  return '/chat'
}

export function studioFileRequest(purpose: StudioFilePurpose): { kind: 'IMAGE' | undefined; purpose: StudioUploadPurpose } {
  if (purpose === 'creation') return { kind: 'IMAGE' as const, purpose: 'reference' }
  if (purpose === 'mask') return { kind: 'IMAGE' as const, purpose: 'mask' }
  if (purpose === 'first-frame' || purpose === 'last-frame') return { kind: 'IMAGE' as const, purpose: 'reference' }
  if (purpose === 'chat-file') return { kind: undefined, purpose: 'attachment' }
  return { kind: undefined, purpose: 'library' }
}

export function useStudioFileUpload(state: StudioFileUploadState, actions: StudioFileUploadActions) {
  const fileInput = ref<HTMLInputElement | null>(null)
  const filePurpose = ref<StudioFilePurpose>('chat-file')
  const uploading = ref(false)
  const fileAccept = computed(() => filePurpose.value !== 'chat-file' && filePurpose.value !== 'library' ? 'image/*' : '*/*')

  function setFileInput(element: unknown) {
    fileInput.value = element instanceof HTMLInputElement ? element : null
  }

  function openFilePicker(purpose: StudioFilePurpose) {
    if (!actions.requireAuth(studioFileRedirect(state.activeMode.value))) return
    filePurpose.value = purpose
    actions.closeComposerPopovers()
    actions.closeNewMenu()
    if (!fileInput.value) return
    fileInput.value.value = ''
    fileInput.value.click()
  }

  async function uploadFilesForPurpose(files: File[], purpose: StudioFilePurpose) {
    if (!files.length) return
    if (!actions.requireAuth(studioFileRedirect(state.activeMode.value))) return
    filePurpose.value = purpose
    uploading.value = true
    actions.clearError()
    try {
      const request = studioFileRequest(purpose)
      const uploaded = await actions.uploadFiles(
        files,
        request.kind,
        actions.currentProjectId() || undefined,
        request.purpose,
      )
      if (purpose === 'chat-file') state.chatAttachments.value.push(...uploaded)
      else if (purpose === 'creation') state.creationAttachments.value.push(...uploaded)
      else if (purpose === 'mask') state.maskAttachment.value = uploaded[0] || null
      else if (purpose === 'first-frame') state.firstFrameAttachment.value = uploaded[0] || null
      else if (purpose === 'last-frame') state.lastFrameAttachment.value = uploaded[0] || null
    } catch (reason) {
      actions.setError(reason instanceof Error ? reason.message : '文件上传失败')
    } finally {
      uploading.value = false
    }
  }

  async function handleFiles(event: Event) {
    const files = Array.from((event.target as HTMLInputElement).files || [])
    await uploadFilesForPurpose(files, filePurpose.value)
  }

  return { fileAccept, uploading, setFileInput, openFilePicker, handleFiles, uploadFilesForPurpose }
}
