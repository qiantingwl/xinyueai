import assert from 'node:assert/strict'
import test from 'node:test'
import { canvasEmptyMediaCopy, canvasPromptComposerVisible } from '../../src/utils/canvas-node-ui.ts'

test('图片和视频节点默认折叠输入框', () => {
  assert.equal(canvasPromptComposerVisible('IMAGE', false), false)
  assert.equal(canvasPromptComposerVisible('VIDEO', false), false)
  assert.equal(canvasPromptComposerVisible('TEXT', false), false)
})

test('第一次选中后才展开图片或视频输入框', () => {
  assert.equal(canvasPromptComposerVisible('IMAGE', true), true)
  assert.equal(canvasPromptComposerVisible('VIDEO', true), true)
  assert.equal(canvasPromptComposerVisible('TEXT', true), true)
  assert.equal(canvasPromptComposerVisible('AUDIO', true), false)
})

test('空媒体节点文案不引导直接上传', () => {
  assert.equal(canvasEmptyMediaCopy('IMAGE').hint.includes('点击展开'), true)
  assert.equal(canvasEmptyMediaCopy('VIDEO').hint.includes('点击展开'), true)
})
