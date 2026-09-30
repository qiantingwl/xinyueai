import assert from 'node:assert/strict'
import test from 'node:test'
import { adaptWorkflowRequest, isWorkflowToolKey, workflowTaskText } from '../../server/src/agent-tasks/workflow-adapters'

test('识别四类外部工作流工具', () => {
  assert.equal(isWorkflowToolKey('n8n_workflow'), true)
  assert.equal(isWorkflowToolKey('dify_workflow'), true)
  assert.equal(isWorkflowToolKey('fastgpt_workflow'), true)
  assert.equal(isWorkflowToolKey('langflow_workflow'), true)
  assert.equal(isWorkflowToolKey('file_read'), false)
})

test('从 query/task/messages 提取工作流任务文本', () => {
  assert.equal(workflowTaskText({ query: '写周报' }), '写周报')
  assert.equal(workflowTaskText({ task: '汇总表格' }), '汇总表格')
  assert.equal(workflowTaskText({ messages: [{ role: 'user', content: '生成海报文案' }] }), '生成海报文案')
})

test('按厂商映射 n8n/Dify/FastGPT/Langflow 请求体', () => {
  const n8n = adaptWorkflowRequest('n8n_workflow', { query: '同步订单' }, { userId: 'u1' })
  assert.equal(n8n.query, '同步订单')
  assert.equal(n8n.task, '同步订单')
  assert.equal(n8n.userId, 'u1')

  const dify = adaptWorkflowRequest('dify_workflow', { query: '审核合同' }, { userId: 'u1' })
  assert.deepEqual(dify.inputs, { query: '审核合同' })
  assert.equal(dify.response_mode, 'blocking')
  assert.equal(dify.user, 'u1')

  const fastgpt = adaptWorkflowRequest('fastgpt_workflow', { query: '回答知识库问题' }, { userId: 'u1' })
  assert.deepEqual(fastgpt.messages, [{ role: 'user', content: '回答知识库问题' }])
  assert.equal(fastgpt.stream, false)

  const langflow = adaptWorkflowRequest('langflow_workflow', { query: '拆解需求' }, { userId: 'u1' })
  assert.equal(langflow.input_value, '拆解需求')
  assert.equal(langflow.input_type, 'chat')
  assert.equal(langflow.output_type, 'chat')
})
