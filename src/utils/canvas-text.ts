export const CANVAS_FONT_SIZE_MIN = 12
export const CANVAS_FONT_SIZE_MAX = 36
export const CANVAS_FONT_SIZE_DEFAULT = 14

export function clampCanvasFontSize(value: number | undefined) {
  const next = Number(value)
  if (!Number.isFinite(next)) return CANVAS_FONT_SIZE_DEFAULT
  return Math.min(CANVAS_FONT_SIZE_MAX, Math.max(CANVAS_FONT_SIZE_MIN, Math.round(next)))
}

export function nextCanvasFontSize(current: number | undefined, delta: number) {
  return clampCanvasFontSize(clampCanvasFontSize(current) + delta)
}

export function canvasTextRewritePlan(content: string, instruction: string, references: string[] = []) {
  const filled = content.trim()
  const request = instruction.trim()
  const referenceBlock = references.map((item) => item.trim()).filter(Boolean).join('\n\n')
  const prompt = filled
    ? `请把下面这段文本改写成用户要求的样子，只输出改写后的正文，不要解释。\n\n用户要求：\n${request}\n\n原文：\n${filled}${referenceBlock ? `\n\n可参考的上下文：\n${referenceBlock}` : ''}`
    : referenceBlock
      ? `${request}\n\n可参考的上下文：\n${referenceBlock}`
      : request
  return { fillCurrent: !filled, prompt }
}
