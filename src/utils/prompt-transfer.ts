const PENDING_CREATION_PROMPT_KEY = 'xinyue:pending-creation-prompt:v2'
const LEGACY_IMAGE_PROMPT_KEY = 'xinyue:pending-image-prompt'

export type PromptTransferType = 'IMAGE' | 'VIDEO' | 'TEXT'

export type PendingCreationPrompt = {
  type: PromptTransferType
  prompt: string
  title: string
  sourceName: string
}

let pendingCreationPrompt: PendingCreationPrompt | null = null

export function stageCreationPrompt(payload: PendingCreationPrompt): void {
  pendingCreationPrompt = payload
  try { sessionStorage.setItem(PENDING_CREATION_PROMPT_KEY, JSON.stringify(payload)) } catch { /* Use the library without transfer when storage is unavailable. */ }
}

export function consumeCreationPrompt(type: PromptTransferType): PendingCreationPrompt | null {
  try {
    if (pendingCreationPrompt?.type === type) {
      const value = pendingCreationPrompt
      pendingCreationPrompt = null
      sessionStorage.removeItem(PENDING_CREATION_PROMPT_KEY)
      sessionStorage.removeItem(LEGACY_IMAGE_PROMPT_KEY)
      return value
    }
    const prompt = sessionStorage.getItem(PENDING_CREATION_PROMPT_KEY) || (type === 'IMAGE' ? sessionStorage.getItem(LEGACY_IMAGE_PROMPT_KEY) : '') || ''
    if (!prompt) return null
    try {
      const value = JSON.parse(prompt) as Partial<PendingCreationPrompt>
      if (typeof value.prompt !== 'string' || !value.prompt.trim()) return null
      const promptType = value.type === 'VIDEO' || value.type === 'TEXT' ? value.type : 'IMAGE'
      if (promptType !== type) return null
      sessionStorage.removeItem(PENDING_CREATION_PROMPT_KEY)
      sessionStorage.removeItem(LEGACY_IMAGE_PROMPT_KEY)
      return {
        type: promptType,
        prompt: value.prompt,
        title: typeof value.title === 'string' ? value.title : '',
        sourceName: typeof value.sourceName === 'string' ? value.sourceName : '',
      }
    } catch {
      // Preserve prompts staged by versions that stored plain text.
      if (type !== 'IMAGE') return null
      sessionStorage.removeItem(LEGACY_IMAGE_PROMPT_KEY)
      return { type: 'IMAGE', prompt, title: '', sourceName: '' }
    }
  } catch {
    return null
  }
}
