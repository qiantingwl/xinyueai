import assert from 'node:assert/strict'
import test from 'node:test'
import { canvasTextRewritePlan, clampCanvasFontSize, nextCanvasFontSize } from '../../src/utils/canvas-text.ts'

test('空文本节点把生成结果写回当前节点', () => {
  const plan = canvasTextRewritePlan('  ', '写一段洗发水主图文案')
  assert.equal(plan.fillCurrent, true)
  assert.equal(plan.prompt, '写一段洗发水主图文案')
})

test('已有文本时改写到新节点，并带上原文', () => {
  const plan = canvasTextRewritePlan('原句', '更口语', ['参考图：瓶身'])
  assert.equal(plan.fillCurrent, false)
  assert.match(plan.prompt, /用户要求：\n更口语/)
  assert.match(plan.prompt, /原文：\n原句/)
  assert.match(plan.prompt, /参考图：瓶身/)
})

test('字号限制在 12 到 36', () => {
  assert.equal(clampCanvasFontSize(8), 12)
  assert.equal(clampCanvasFontSize(80), 36)
  assert.equal(nextCanvasFontSize(14, 2), 16)
  assert.equal(nextCanvasFontSize(12, -2), 12)
})
