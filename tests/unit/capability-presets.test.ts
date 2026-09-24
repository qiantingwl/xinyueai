import assert from 'node:assert/strict'
import test from 'node:test'
import { defaultAssistantPresets, defaultToolPresets } from '../../server/src/workspace/default-capability-presets'
import { defaultWebSearchPresets } from '../../server/src/agent-tasks/default-web-search-presets'

test('默认助手只绑定内置可用工具', () => {
  const usableTools = defaultToolPresets.filter((item) => item.enabled)
  assert.ok(usableTools.length >= 4)
  for (const assistant of defaultAssistantPresets) {
    assert.ok(assistant.toolIds.every((id) => usableTools.some((tool) => tool.id === id)))
  }
})

test('默认助手 ID 唯一且具备完整的用途和系统指令', () => {
  assert.equal(new Set(defaultAssistantPresets.map((item) => item.id)).size, defaultAssistantPresets.length)
  for (const assistant of defaultAssistantPresets) {
    assert.ok(assistant.name.trim())
    assert.ok(assistant.description.length >= 20)
    assert.ok(assistant.systemPrompt.length >= 80)
    assert.ok(assistant.templateIds.length > 0)
    assert.ok(assistant.toolIds.length > 0)
    assert.ok(assistant.toolIds.every((id) => defaultToolPresets.some((tool) => tool.id === id)))
  }
})

test('联网搜索预设不携带密钥且默认关闭', () => {
  assert.equal(new Set(defaultWebSearchPresets.map((item) => item.id)).size, defaultWebSearchPresets.length)
  assert.deepEqual(defaultWebSearchPresets.map((item) => item.type).sort(), ['BRAVE', 'EXA', 'SEARXNG', 'SERPER', 'TAVILY'])
  for (const channel of defaultWebSearchPresets) {
    assert.equal(channel.enabled, false)
    assert.match(channel.documentationUrl, /^https:\/\//)
  }
})

test('商品视觉、商业文案和知识服务助手绑定知识库检索', () => {
  const required = ['xinyue_assistant_commerce', 'xinyue_assistant_copy', 'xinyue_assistant_support']
  assert.ok(defaultToolPresets.some((item) => item.id === 'xinyue_tool_search' && item.key === 'knowledge_search' && item.enabled))
  for (const id of required) {
    const assistant = defaultAssistantPresets.find((item) => item.id === id)
    assert.ok(assistant)
    assert.ok(assistant.toolIds.includes('xinyue_tool_search'))
    assert.ok(assistant.toolIds.length >= 3)
  }
})

test('第三方工具预设默认关闭且不内置部署地址或密钥', () => {
  assert.equal(new Set(defaultToolPresets.map((item) => item.key)).size, defaultToolPresets.length)
  const external = defaultToolPresets.filter((item) => item.documentationUrl)
  assert.deepEqual(external.map((item) => item.key).sort(), ['dify_workflow', 'fastgpt_workflow', 'n8n_workflow'])
  for (const tool of external) {
    assert.equal(tool.enabled, false)
    assert.equal(tool.endpoint, '')
    assert.match(tool.documentationUrl, /^https:\/\//)
    assert.equal(tool.requiresApproval, true)
  }
})
