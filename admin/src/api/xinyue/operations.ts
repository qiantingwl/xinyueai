import request from '@/utils/http'

export type OperationRow = Record<string, any>

const lookupEndpoints: Record<string, string> = {
  groups: '/v1/admin/groups',
  models: '/v1/admin/model-presets',
  tools: '/v1/admin/tools',
  knowledgeBases: '/v1/admin/knowledge-bases',
  promptTemplates: '/v1/admin/prompt-templates',
  users: '/v1/admin/users',
  assistants: '/v1/admin/assistants',
  pluginCategories: '/v1/admin/plugin-categories'
}

export const operationsApi = {
  list: <T = unknown>(endpoint: string) => request.get<T>({ url: endpoint }),
  lookup: <T = unknown>(key: string) => request.get<T>({ url: lookupEndpoints[key] }),
  saveResource: <T>(url: string, editing: boolean, data: OperationRow) =>
    request.request<T>({
      url,
      method: editing ? 'PATCH' : 'POST',
      data,
      showSuccessMessage: true
    }),
  deleteResource: (url: string) => request.del({ url, showSuccessMessage: true }),
  reviewToolApproval: (
    id: string,
    data: { status: 'APPROVED' | 'REJECTED'; expiresInMinutes?: number; adminNote?: string }
  ) =>
    request.request({
      url: `/v1/admin/tool-approval-requests/${id}`,
      method: 'PATCH',
      data,
      showSuccessMessage: true
    }),
  uploadToolIcon: (id: string, data: FormData) =>
    request.post({ url: `/v1/admin/tools/${id}/icon`, data, showSuccessMessage: true }),
  removeToolIcon: (id: string) =>
    request.del({ url: `/v1/admin/tools/${id}/icon`, showSuccessMessage: true }),
  uploadInspirationCover: (id: string, data: FormData) =>
    request.post({ url: `/v1/admin/inspirations/${id}/cover`, data }),
  uploadInspirationVideo: (id: string, data: FormData) =>
    request.post({ url: `/v1/admin/inspirations/${id}/preview-video`, data }),
  uploadInspirationImages: (id: string, data: FormData) =>
    request.post({ url: `/v1/admin/inspirations/${id}/preview-images`, data }),
  removeInspirationCover: (id: string) =>
    request.del({ url: `/v1/admin/inspirations/${id}/cover`, showSuccessMessage: true }),
  removeInspirationPreview: (id: string, assetId: string) =>
    request.del({
      url: `/v1/admin/inspirations/${id}/preview-images/${assetId}`,
      showSuccessMessage: true
    }),
  removeInspirationVideo: (id: string) =>
    request.del({ url: `/v1/admin/inspirations/${id}/preview-video`, showSuccessMessage: true }),
  cancelJob: (id: string) =>
    request.post({ url: `/v1/admin/jobs/${id}/cancel`, params: {}, showSuccessMessage: true }),
  retryJob: (id: string) =>
    request.post({ url: `/v1/admin/jobs/${id}/retry`, params: {}, showSuccessMessage: true }),
  retryNotification: (id: string) =>
    request.post({
      url: `/v1/admin/notifications/deliveries/${id}/retry`,
      params: {},
      showSuccessMessage: true
    }),
  removeAsset: (id: string) =>
    request.del({ url: `/v1/admin/assets/${id}`, showSuccessMessage: true }),
  updateAlert: (id: string, action: 'acknowledge' | 'resolve') =>
    request.post({
      url: `/v1/admin/alerts/events/${id}/${action}`,
      params: {},
      showSuccessMessage: true
    }),
  evaluateAlerts: () =>
    request.post({ url: '/v1/admin/alerts/evaluate', params: {}, showSuccessMessage: true }),
  restorePromptTemplates: () =>
    request.post({
      url: '/v1/admin/prompt-templates/restore-defaults',
      params: {},
      showSuccessMessage: true
    }),
  restoreCapabilityPresets: (resource: 'assistants' | 'tools' | 'plugins') =>
    request.post<{ added: number; total: number }>({
      url: `/v1/admin/${resource}/restore-defaults`,
      params: {},
      showSuccessMessage: true
    }),
  refreshPromptLibrary: () =>
    request.post({
      url: '/v1/admin/prompt-library/refresh',
      params: {},
      timeout: 600000,
      showSuccessMessage: true
    }),
  promptSources: () => request.get<OperationRow[]>({ url: '/v1/admin/prompt-library/sources' }),
  savePromptSource: (row: OperationRow, reviewAccepted = false) =>
    request.request({
      url: `/v1/admin/prompt-library/sources/${row.id}`,
      method: 'PATCH',
      data: {
        displayName: row.displayName,
        enabled: row.enabled,
        sortOrder: row.sortOrder,
        ...(reviewAccepted ? { reviewAccepted: true } : {})
      },
      showSuccessMessage: true
    }),
  refreshPromptSource: (id: string) =>
    request.post({
      url: `/v1/admin/prompt-library/sources/${id}/refresh`,
      params: {},
      timeout: 600000,
      showSuccessMessage: true
    }),
  moderationPolicy: () => request.get<OperationRow>({ url: '/v1/admin/moderation/policy' }),
  saveModerationPolicy: (data: OperationRow) =>
    request.request<OperationRow>({
      url: '/v1/admin/moderation/policy',
      method: 'PATCH',
      data,
      showSuccessMessage: true
    }),
  muteAlertRule: (id: string, minutes: number) =>
    request.post({
      url: `/v1/admin/alerts/rules/${id}/mute`,
      data: { minutes },
      showSuccessMessage: true
    }),
  resolveModeration: (id: string, data: { status: string; note: string }) =>
    request.request({
      url: `/v1/admin/moderation/events/${id}`,
      method: 'PATCH',
      data,
      showSuccessMessage: true
    }),
  reviewModerationAppeal: (id: string, data: { status: string; note?: string }) =>
    request.request({
      url: `/v1/admin/moderation/events/${id}/appeal`,
      method: 'PATCH',
      data,
      showSuccessMessage: true
    }),
  supportTicket: (id: string) =>
    request.get<OperationRow>({ url: `/v1/admin/support/tickets/${id}` }),
  supportAgents: () => request.get<OperationRow[]>({ url: '/v1/admin/support/tickets/agents' }),
  updateSupportTicket: (id: string, data: OperationRow) =>
    request.request({
      url: `/v1/admin/support/tickets/${id}`,
      method: 'PATCH',
      data,
      showSuccessMessage: true
    }),
  replySupportTicket: (id: string, body: string) =>
    request.post({
      url: `/v1/admin/support/tickets/${id}/messages`,
      data: { body },
      showSuccessMessage: true
    }),
  project: (id: string) => request.get<OperationRow>({ url: `/v1/admin/projects/${id}` }),
  updateProject: (id: string, data: OperationRow) =>
    request.request<OperationRow>({
      url: `/v1/admin/projects/${id}`,
      method: 'PATCH',
      data,
      showSuccessMessage: true
    })
}
