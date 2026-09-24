import type { CanvasNodeKind } from '../types/canvas'

export function canvasPromptComposerVisible(kind: CanvasNodeKind, selected: boolean) {
  return selected && (kind === 'IMAGE' || kind === 'VIDEO' || kind === 'TEXT')
}

export function canvasEmptyMediaCopy(kind: Exclude<CanvasNodeKind, 'TEXT' | 'GROUP' | 'CONFIG'>) {
  if (kind === 'VIDEO') return { title: '空视频节点', hint: '点击展开提示词生成' }
  if (kind === 'AUDIO') return { title: '空音频节点', hint: '点击选中节点，上传请用工具栏' }
  return { title: '空图片节点', hint: '点击展开提示词生成' }
}
