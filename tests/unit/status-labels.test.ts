import assert from 'node:assert/strict'
import test from 'node:test'
import {
  agentTaskLabel,
  agentTaskStatusText,
  agentTaskStatusTone,
  agentTaskTone,
  generationLabel,
  generationStatusText,
  generationStatusTone,
  moderationLabel,
  moderationStatusText,
  moderationStatusTone,
  moderationTone,
  withOverrides,
} from '../../src/utils/status-labels.ts'

// 状态码来自 Prisma schema；映射缺项会让原始枚举名直接暴露给用户。
const agentTaskStatuses = ['DRAFT', 'QUEUED', 'RUNNING', 'WAITING_APPROVAL', 'SUCCEEDED', 'PARTIAL', 'FAILED', 'CANCELLED']
const generationStatuses = ['QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED']
const moderationStatuses = ['DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'TAKEN_DOWN']

const suites = [
  { name: 'Agent 任务', statuses: agentTaskStatuses, text: agentTaskStatusText, tone: agentTaskStatusTone },
  { name: '生成任务', statuses: generationStatuses, text: generationStatusText, tone: generationStatusTone },
  { name: '作品审核', statuses: moderationStatuses, text: moderationStatusText, tone: moderationStatusTone },
]

for (const suite of suites) {
  test(`${suite.name}的每个状态都有文案与色调`, () => {
    for (const status of suite.statuses) {
      assert.ok(suite.text[status], `缺少文案：${status}`)
      assert.ok(suite.tone[status], `缺少色调：${status}`)
    }
  })

  test(`${suite.name}的文案与色调键集一致`, () => {
    assert.deepEqual(Object.keys(suite.text).sort(), Object.keys(suite.tone).sort())
  })

  test(`${suite.name}没有多余的未知状态`, () => {
    assert.deepEqual(Object.keys(suite.text).sort(), [...suite.statuses].sort())
  })
}

test('未知状态回落到传入的兜底值', () => {
  assert.equal(agentTaskLabel('NOT_A_STATUS', '未知'), '未知')
  assert.equal(generationLabel('NOT_A_STATUS', '未知'), '未知')
  assert.equal(moderationLabel('NOT_A_STATUS', '未知'), '未知')
  assert.equal(agentTaskTone('NOT_A_STATUS'), 'neutral')
  assert.equal(moderationTone(null), 'neutral')
})

test('缺省兜底时未知状态原样返回，不显示空白', () => {
  assert.equal(agentTaskLabel('NOT_A_STATUS'), 'NOT_A_STATUS')
  assert.equal(moderationLabel('NOT_A_STATUS'), 'NOT_A_STATUS')
})

test('空状态返回空串而不是枚举名', () => {
  assert.equal(agentTaskLabel(''), '')
  assert.equal(agentTaskLabel(null), '')
  assert.equal(agentTaskLabel(undefined), '')
})

test('场景覆盖只改指定状态，其余沿用统一文案', () => {
  const canvas = withOverrides(agentTaskStatusText, { RUNNING: '正在分析画布' })
  assert.equal(canvas.RUNNING, '正在分析画布')
  assert.equal(canvas.QUEUED, agentTaskStatusText.QUEUED)
  assert.equal(canvas.CANCELLED, agentTaskStatusText.CANCELLED)
  assert.deepEqual(Object.keys(canvas).sort(), Object.keys(agentTaskStatusText).sort())
  // 覆盖不得污染规范映射
  assert.equal(agentTaskStatusText.RUNNING, '执行中')
})

test('失败与驳回使用 danger，进行中使用 info，成功使用 success', () => {
  assert.equal(agentTaskTone('FAILED'), 'danger')
  assert.equal(agentTaskTone('RUNNING'), 'info')
  assert.equal(agentTaskTone('SUCCEEDED'), 'success')
  assert.equal(moderationTone('REJECTED'), 'danger')
  assert.equal(moderationTone('APPROVED'), 'success')
  assert.equal(moderationTone('PENDING'), 'warning')
})
