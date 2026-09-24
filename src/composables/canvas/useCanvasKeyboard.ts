import { ref, type Ref } from 'vue'
import type { FlowEdge, FlowNode } from './useCanvasHistory'
import type { CanvasNodeData } from '../../types/canvas'

type Point = { x: number; y: number }

type Options = {
  nodes: Ref<FlowNode[]>
  edges: Ref<FlowEdge[]>
  save: () => Promise<unknown>
  undo: () => void
  redo: () => void
  copySelected: () => void
  pasteNodes: () => void
  duplicateSelected: () => void
  fitView: () => Promise<unknown> | void
  focusSelected: () => Promise<unknown> | void
  zoom: (delta: number) => void
  nudgeSelected: (event: KeyboardEvent) => void
  closeTransientUi: () => void
  deselectAll: () => void
  deleteSelected: () => void
  wrapSelectedInGroup: () => void
  ungroupSelected: () => void
  screenToFlowCoordinate: (point: Point) => Point
  uploadFiles: (files: File[], origin: Point) => Promise<unknown>
  addTextNode: (position: Point) => string
  updateNodeData: (id: string, patch: Partial<CanvasNodeData>) => void
}

export function useCanvasKeyboard(options: Options) {
  const temporaryPanActive = ref(false)

  function handleKeyboard(event: KeyboardEvent) {
    const target = event.target as HTMLElement | null
    const editing = Boolean(target?.closest('input, textarea, select, [contenteditable="true"]'))
    if (!editing && (event.code === 'Space' || event.key === 'Control')) {
      event.preventDefault()
      temporaryPanActive.value = true
      return
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault()
      void options.save()
      return
    }
    if (editing) return
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault()
      event.shiftKey ? options.redo() : options.undo()
      return
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
      event.preventDefault()
      options.redo()
      return
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') {
      event.preventDefault()
      options.copySelected()
      return
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') {
      event.preventDefault()
      options.pasteNodes()
      return
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') {
      event.preventDefault()
      options.duplicateSelected()
      return
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'g') {
      event.preventDefault()
      event.shiftKey ? options.ungroupSelected() : options.wrapSelectedInGroup()
      return
    }
    if ((event.ctrlKey || event.metaKey) && event.key === '0') {
      event.preventDefault()
      void options.fitView()
      return
    }
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'f') {
      event.preventDefault()
      void options.focusSelected()
      return
    }
    if ((event.ctrlKey || event.metaKey) && (event.key === '=' || event.key === '+')) {
      event.preventDefault()
      options.zoom(0.2)
      return
    }
    if ((event.ctrlKey || event.metaKey) && event.key === '-') {
      event.preventDefault()
      options.zoom(-0.2)
      return
    }
    if (event.key.startsWith('Arrow')) {
      options.nudgeSelected(event)
      return
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
      event.preventDefault()
      options.nodes.value.forEach((node) => { node.selected = true })
      options.edges.value.forEach((edge) => { edge.selected = false })
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      options.closeTransientUi()
      options.deselectAll()
      return
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault()
      options.deleteSelected()
    }
  }

  function handleKeyboardUp(event: KeyboardEvent) {
    if (event.code !== 'Space' && event.key !== 'Control') return
    temporaryPanActive.value = false
    if (event.code === 'Space') event.preventDefault()
  }

  function resetTemporaryPan() {
    temporaryPanActive.value = false
  }

  function handleClipboardPaste(event: ClipboardEvent) {
    const target = event.target as HTMLElement | null
    if (target?.matches('input, textarea, select, [contenteditable="true"]')) return
    const image = Array.from(event.clipboardData?.items || [])
      .find((item) => item.type.startsWith('image/'))
      ?.getAsFile()
    const text = event.clipboardData?.getData('text/plain').trim()
    const center = () => options.screenToFlowCoordinate({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2
    })
    if (image) {
      event.preventDefault()
      void options.uploadFiles([image], center())
      return
    }
    if (text) {
      event.preventDefault()
      const id = options.addTextNode(center())
      options.updateNodeData(id, { title: '粘贴文本', content: text.slice(0, 20_000) })
    }
  }

  return { temporaryPanActive, handleKeyboard, handleKeyboardUp, resetTemporaryPan, handleClipboardPaste }
}
