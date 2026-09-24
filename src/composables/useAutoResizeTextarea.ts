import type { Ref } from 'vue'

export function resizeTextarea(input: HTMLTextAreaElement | null | undefined, maxHeight: number, minHeight = 0) {
  if (!input) return
  input.style.height = 'auto'
  input.style.height = `${Math.max(minHeight, Math.min(input.scrollHeight, maxHeight))}px`
  input.style.overflowY = input.scrollHeight > maxHeight ? 'auto' : 'hidden'
}

export function composerMaxHeight() {
  const viewportLimit = Math.floor(window.innerHeight * 0.36)
  return window.innerWidth <= 640 ? Math.min(180, viewportLimit) : Math.min(240, viewportLimit)
}

export function useAutoResizeTextarea(input: Ref<HTMLTextAreaElement | null | undefined>, maxHeight: () => number) {
  return () => resizeTextarea(input.value, maxHeight())
}
