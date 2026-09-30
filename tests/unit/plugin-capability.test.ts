import assert from 'node:assert/strict'
import test from 'node:test'
import { chatPluginCapabilityFallbacks, matchPluginCapability } from '../../server/src/plugins/plugin-capability'

test('画布 Agent 绑定 CHAT/IMAGE 技能时，办公 capability 会回落到插件真实能力', () => {
  const matched = matchPluginCapability('OFFICE', ['IMAGE', 'CHAT'], chatPluginCapabilityFallbacks('OFFICE'))
  assert.equal(matched, 'CHAT')
})

test('办公技能仍优先匹配 OFFICE', () => {
  const matched = matchPluginCapability('OFFICE', ['OFFICE', 'CHAT'], chatPluginCapabilityFallbacks('OFFICE'))
  assert.equal(matched, 'OFFICE')
})

test('插件完全不支持时返回空', () => {
  const matched = matchPluginCapability('VIDEO', ['IMAGE'], [])
  assert.equal(matched, undefined)
})
