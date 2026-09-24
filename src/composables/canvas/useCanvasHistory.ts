import { nextTick, ref, type Ref } from 'vue'
import type { MarkerType, ViewportTransform } from '@vue-flow/core'
import type { CanvasBackground, CanvasNodeData } from '../../types/canvas'
import { clone } from '../../utils/clone'
import { createClientId } from '../../utils/client-id'

export type FlowNode = {
  id: string
  type: string
  position: { x: number; y: number }
  data: CanvasNodeData
  style?: Record<string, string | number>
  selected?: boolean
  dimensions?: { width: number; height: number }
}

export type FlowEdge = {
  id: string
  source: string
  target: string
  type?: string
  markerEnd?: MarkerType
  label?: string
  selected?: boolean
  animated?: boolean
}

type CanvasSaveState = 'saved' | 'dirty' | 'saving' | 'error'
type LocalSnapshot = {
  nodes: FlowNode[]
  edges: FlowEdge[]
  viewport: ViewportTransform
  background: CanvasBackground
}
type CanvasClipboard = { nodes: FlowNode[]; edges: FlowEdge[] }

interface CanvasHistoryOptions {
  nodes: Ref<FlowNode[]>
  edges: Ref<FlowEdge[]>
  viewport: Ref<ViewportTransform>
  background: Ref<CanvasBackground>
  hydrated: Ref<boolean>
  dirty: Ref<boolean>
  saveState: Ref<CanvasSaveState>
  setViewport: (viewport: ViewportTransform) => void | Promise<unknown>
  scheduleSave: () => void
}

const HISTORY_LIMIT = 60
const PASTE_OFFSET = 36

export function useCanvasHistory(options: CanvasHistoryOptions) {
  const history = ref<LocalSnapshot[]>([])
  const future = ref<LocalSnapshot[]>([])
  const clipboard = ref<CanvasClipboard>({ nodes: [], edges: [] })
  const applyingHistory = ref(false)
  let lastSnapshotJson = ''

  function currentSnapshot(): LocalSnapshot {
    return {
      nodes: clone(options.nodes.value),
      edges: clone(options.edges.value),
      viewport: { ...options.viewport.value },
      background: options.background.value,
    }
  }

  function checkpoint(_event?: unknown) {
    if (!options.hydrated.value || applyingHistory.value) return
    const snapshot = currentSnapshot()
    // 只序列化一次并与上次的缓存串比较：此前每次 checkpoint 都把全文档 stringify 两遍，
    // 而它会在每次输入框 focus、拖拽 start、快捷键时触发。
    const json = JSON.stringify(snapshot)
    if (json !== lastSnapshotJson) history.value.push(snapshot)
    lastSnapshotJson = json
    if (history.value.length > HISTORY_LIMIT) history.value.shift()
    future.value = []
  }

  function applySnapshot(snapshot: LocalSnapshot) {
    applyingHistory.value = true
    options.nodes.value = clone(snapshot.nodes)
    options.edges.value = clone(snapshot.edges)
    options.viewport.value = { ...snapshot.viewport }
    options.background.value = snapshot.background
    void options.setViewport(snapshot.viewport)
    lastSnapshotJson = JSON.stringify(snapshot)
    nextTick(() => {
      applyingHistory.value = false
      options.dirty.value = true
      options.saveState.value = 'dirty'
      options.scheduleSave()
    })
  }

  function undo() {
    const snapshot = history.value.pop()
    if (!snapshot) return
    future.value.push(currentSnapshot())
    applySnapshot(snapshot)
  }

  function redo() {
    const snapshot = future.value.pop()
    if (!snapshot) return
    history.value.push(currentSnapshot())
    applySnapshot(snapshot)
  }

  function copySelected() {
    const selectedIds = new Set(options.nodes.value.filter((node) => node.selected).map((node) => node.id))
    if (!selectedIds.size) return
    clipboard.value = {
      nodes: clone(options.nodes.value.filter((node) => selectedIds.has(node.id))),
      edges: clone(options.edges.value.filter((edge) => selectedIds.has(edge.source) && selectedIds.has(edge.target))),
    }
  }

  function pasteNodes() {
    if (!clipboard.value.nodes.length) return
    checkpoint()
    const ids = new Map<string, string>()
    options.nodes.value.forEach((node) => { node.selected = false })
    const pasted = clipboard.value.nodes.map((node) => {
      const id = createClientId()
      ids.set(node.id, id)
      return {
        ...clone(node),
        id,
        position: { x: node.position.x + PASTE_OFFSET, y: node.position.y + PASTE_OFFSET },
        selected: true,
      }
    })
    const pastedEdges = clipboard.value.edges.flatMap((edge) => {
      const source = ids.get(edge.source)
      const target = ids.get(edge.target)
      return source && target ? [{ ...clone(edge), id: createClientId(), source, target, selected: false }] : []
    })
    options.nodes.value.push(...pasted)
    options.edges.value.push(...pastedEdges)
    clipboard.value = { nodes: clone(pasted), edges: clone(pastedEdges) }
  }

  function deleteSelected() {
    const nodeIds = new Set(options.nodes.value.filter((node) => node.selected).map((node) => node.id))
    const edgeIds = new Set(options.edges.value.filter((edge) => edge.selected).map((edge) => edge.id))
    if (!nodeIds.size && !edgeIds.size) return
    checkpoint()
    options.nodes.value = options.nodes.value.filter((node) => !nodeIds.has(node.id))
    options.edges.value = options.edges.value.filter((edge) => !edgeIds.has(edge.id) && !nodeIds.has(edge.source) && !nodeIds.has(edge.target))
  }

  function resetHistory() {
    history.value = []
    future.value = []
    clipboard.value = { nodes: [], edges: [] }
    lastSnapshotJson = ''
  }

  return {
    applyingHistory,
    checkpoint,
    copySelected,
    deleteSelected,
    future,
    history,
    pasteNodes,
    redo,
    resetHistory,
    undo,
  }
}
