import assert from 'node:assert/strict'
import test from 'node:test'
import { inferVendor } from '../../src/utils/vendor.ts'

test('Other 厂商不会盖住模型名里的真实品牌', () => {
  assert.equal(inferVendor({ displayName: 'Glm 4.5', upstreamModel: 'glm-4.5', vendor: { key: 'other', name: 'Other' } }).key, 'zhipu')
  assert.equal(inferVendor({ displayName: 'Kimi K2', upstreamModel: 'kimi-k2', vendor: { key: 'other', name: 'Other' } }).key, 'kimi')
  assert.equal(inferVendor({ displayName: 'Kimi K2', vendor: { key: 'other', name: 'Other' } }).label, 'Kimi')
})

test('已知厂商仍按名称识别', () => {
  assert.equal(inferVendor({ displayName: 'DeepSeek V3.1', upstreamModel: 'deepseek-v3.1' }).key, 'deepseek')
  assert.equal(inferVendor({ displayName: 'Qwen3 Max', upstreamModel: 'qwen3-max' }).key, 'qwen')
  assert.equal(inferVendor({ displayName: 'MiniMax M2', upstreamModel: 'MiniMax-M2' }).key, 'minimax')
  assert.equal(inferVendor({ displayName: '混元 Turbo', upstreamModel: 'hunyuan-turbo' }).key, 'hunyuan')
  assert.equal(inferVendor({ displayName: '阶跃星辰', upstreamModel: 'step-2-16k' }).key, 'stepfun')
  assert.equal(inferVendor({ displayName: 'LongCat Flash', upstreamModel: 'LongCat-Flash-Chat' }).key, 'longcat')
})
