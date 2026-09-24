import type { StatusTone } from '../components/common/StatusPill.vue'

/**
 * 状态码到中文文案与色调的统一映射。
 *
 * 此前同一套状态码在各页面各写一遍，出现了「排队中 / 等待中」「已停止 / 已取消」
 * 这类无意义的措辞漂移。确有场景差异时（例如画布里的「正在分析画布」），
 * 用 `withOverrides` 在规范文案上覆盖，而不是另抄一份完整映射。
 */

function lookup<T extends string>(map: Record<string, string>, value: T | string | null | undefined, fallback?: string) {
  if (!value) return fallback ?? ''
  return map[value] ?? fallback ?? value
}

/** Agent 任务：办公中心、画布编辑器与画布 Agent 对话共用。 */
export const agentTaskStatusText: Record<string, string> = {
  DRAFT: '草稿',
  QUEUED: '排队中',
  RUNNING: '执行中',
  WAITING_APPROVAL: '待审批',
  SUCCEEDED: '已完成',
  PARTIAL: '部分完成',
  FAILED: '失败',
  CANCELLED: '已取消',
}

export const agentTaskStatusTone: Record<string, StatusTone> = {
  DRAFT: 'neutral',
  QUEUED: 'neutral',
  RUNNING: 'info',
  WAITING_APPROVAL: 'warning',
  SUCCEEDED: 'success',
  PARTIAL: 'warning',
  FAILED: 'danger',
  CANCELLED: 'neutral',
}

/** 生成任务：任务中心与生成结果卡片共用。 */
export const generationStatusText: Record<string, string> = {
  QUEUED: '排队中',
  RUNNING: '处理中',
  SUCCEEDED: '已完成',
  FAILED: '失败',
  CANCELLED: '已取消',
}

export const generationStatusTone: Record<string, StatusTone> = {
  QUEUED: 'neutral',
  RUNNING: 'info',
  SUCCEEDED: 'success',
  FAILED: 'danger',
  CANCELLED: 'neutral',
}

/** 作品审核状态。 */
export const moderationStatusText: Record<string, string> = {
  DRAFT: '草稿',
  PENDING: '审核中',
  APPROVED: '已发布',
  REJECTED: '已驳回',
  TAKEN_DOWN: '已下架',
}

export const moderationStatusTone: Record<string, StatusTone> = {
  DRAFT: 'neutral',
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
  TAKEN_DOWN: 'danger',
}

export const agentTaskLabel = (status?: string | null, fallback?: string) => lookup(agentTaskStatusText, status, fallback)
export const agentTaskTone = (status?: string | null): StatusTone => agentTaskStatusTone[status || ''] ?? 'neutral'
export const generationLabel = (status?: string | null, fallback?: string) => lookup(generationStatusText, status, fallback)
export const generationTone = (status?: string | null): StatusTone => generationStatusTone[status || ''] ?? 'neutral'
export const moderationLabel = (status?: string | null, fallback?: string) => lookup(moderationStatusText, status, fallback)
export const moderationTone = (status?: string | null): StatusTone => moderationStatusTone[status || ''] ?? 'neutral'

/** 在规范文案上做场景化覆盖，未覆盖的状态仍走统一文案。 */
export function withOverrides(base: Record<string, string>, overrides: Record<string, string>) {
  return { ...base, ...overrides }
}
