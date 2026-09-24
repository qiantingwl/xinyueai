import request from '@/utils/http'

export type AgentRow = Record<string, any>

export const agentApi = {
  overview: () => request.get<AgentRow>({ url: '/v1/admin/agent/overview' }),
  schedules: () => request.get<AgentRow[]>({ url: '/v1/admin/agent/schedules' }),
  toolCalls: () => request.get<AgentRow[]>({ url: '/v1/admin/agent/tool-calls' }),
  tasks: (params: { page: number; pageSize: number; query?: string; status?: string }) =>
    request.get<{ items: AgentRow[]; total: number }>({ url: '/v1/admin/agent/tasks', params }),
  task: (id: string) => request.get<AgentRow>({ url: `/v1/admin/agent/tasks/${id}` }),
  cancel: (id: string) =>
    request.post({
      url: `/v1/admin/agent/tasks/${id}/cancel`,
      params: {},
      showSuccessMessage: true
    }),
  retry: (id: string) =>
    request.post({ url: `/v1/admin/agent/tasks/${id}/retry`, params: {}, showSuccessMessage: true })
}
