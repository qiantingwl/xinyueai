import assert from 'node:assert/strict'
import test from 'node:test'
import { formatPluginInstruction } from '../../server/src/generations/plugin-prompt'

test('plugin instruction keeps name, body, and optional output requirements', () => {
  assert.equal(
    formatPluginInstruction({ name: '写作助手', instruction: '保持简洁', outputRequirements: '用中文' }),
    '当前启用插件：写作助手\n保持简洁\n输出要求：用中文',
  )
  assert.equal(
    formatPluginInstruction({ name: '写作助手', instruction: '保持简洁', outputRequirements: '  ' }),
    '当前启用插件：写作助手\n保持简洁',
  )
})
