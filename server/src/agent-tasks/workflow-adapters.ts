import { Prisma } from '@prisma/client'

export const WORKFLOW_TOOL_KEYS = ['n8n_workflow', 'dify_workflow', 'fastgpt_workflow', 'langflow_workflow'] as const
export type WorkflowToolKey = (typeof WORKFLOW_TOOL_KEYS)[number]

export const workflowPlannerSchema: Prisma.JsonObject = {
  type: 'object',
  properties: {
    query: { type: 'string', minLength: 1, maxLength: 8000, description: '交给工作流的任务文本' },
    task: { type: 'string', minLength: 1, maxLength: 8000 },
    data: { type: 'object', description: '可选结构化参数' },
    inputs: { type: 'object' },
    messages: { type: 'array', items: { type: 'object' } },
    chatId: { type: 'string', maxLength: 100 },
    input_value: { type: 'string', maxLength: 8000 },
  },
  anyOf: [{ required: ['query'] }, { required: ['task'] }, { required: ['input_value'] }, { required: ['inputs'] }, { required: ['messages'] }, { required: ['data'] }],
  additionalProperties: true,
}

export function isWorkflowToolKey(key: string): key is WorkflowToolKey {
  return (WORKFLOW_TOOL_KEYS as readonly string[]).includes(key)
}

export function workflowTaskText(input: Record<string, unknown>): string {
  const direct = String(input.query || input.task || input.input_value || input.q || '').trim()
  if (direct) return direct.slice(0, 8000)
  if (Array.isArray(input.messages)) {
    const first = input.messages.find((item) => item && typeof item === 'object' && !Array.isArray(item)) as Record<string, unknown> | undefined
    const content = first && typeof first.content === 'string' ? first.content.trim() : ''
    if (content) return content.slice(0, 8000)
  }
  if (input.inputs && typeof input.inputs === 'object' && !Array.isArray(input.inputs)) {
    const query = (input.inputs as Record<string, unknown>).query
    if (typeof query === 'string' && query.trim()) return query.trim().slice(0, 8000)
  }
  return ''
}

export function adaptWorkflowRequest(key: string, input: Record<string, unknown>, context: { userId: string }): Record<string, unknown> {
  const query = workflowTaskText(input)
  const data = input.data && typeof input.data === 'object' && !Array.isArray(input.data) ? input.data as Record<string, unknown> : {}
  const extraInputs = input.inputs && typeof input.inputs === 'object' && !Array.isArray(input.inputs) ? input.inputs as Record<string, unknown> : {}
  if (key === 'dify_workflow') {
    return {
      inputs: { query, ...data, ...extraInputs },
      response_mode: input.response_mode === 'streaming' ? 'streaming' : 'blocking',
      user: typeof input.user === 'string' && input.user.trim() ? input.user.trim() : context.userId,
    }
  }
  if (key === 'fastgpt_workflow') {
    const messages = Array.isArray(input.messages) && input.messages.length
      ? input.messages
      : [{ role: 'user', content: query }]
    return {
      chatId: typeof input.chatId === 'string' ? input.chatId : undefined,
      stream: false,
      detail: input.detail === true,
      messages,
    }
  }
  if (key === 'langflow_workflow') {
    return {
      input_value: query || String(input.input_value || ''),
      output_type: typeof input.output_type === 'string' ? input.output_type : 'chat',
      input_type: typeof input.input_type === 'string' ? input.input_type : 'chat',
      tweaks: input.tweaks && typeof input.tweaks === 'object' && !Array.isArray(input.tweaks) ? input.tweaks : {},
    }
  }
  return {
    query,
    task: query,
    data,
    userId: context.userId,
    source: 'xinyue-agent',
  }
}
