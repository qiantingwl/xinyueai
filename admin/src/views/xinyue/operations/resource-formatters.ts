import { formatDateTime } from '@/utils/xinyue/formatters'
import type { ResourceRow } from './resource-types'

type Translate = (value: string) => string
export type ResourceStatusType = 'success' | 'warning' | 'danger' | 'info' | 'primary'

const statusLabels: Record<string, string> = {
  true: '启用',
  false: '停用',
  ACTIVE: '正常',
  SUSPENDED: '已停用',
  QUEUED: '排队中',
  RUNNING: '运行中',
  SUCCEEDED: '已完成',
  FAILED: '失败',
  CANCELLED: '已取消',
  DRAFT: '草稿',
  PUBLISHED: '已发布',
  DISABLED: '已停用',
  OPEN: '待处理',
  IN_PROGRESS: '处理中',
  IN_REVIEW: '复核中',
  WAITING_USER: '等待用户',
  ACKNOWLEDGED: '已确认',
  APPROVED: '已批准',
  PENDING: '待审批',
  REJECTED: '已拒绝',
  DISMISSED: '已驳回',
  RESOLVED: '已解决',
  CLOSED: '已关闭',
  URGENT: '紧急',
  NORMAL: '普通',
  CRITICAL: '严重',
  WARNING: '警告',
  HIGH: '高',
  MEDIUM: '中',
  LOW: '低',
  LOG: '仅记录',
  REVIEW: '人工审核',
  BLOCK: '阻断',
  PLANNING: '规划中',
  TODO: '待开始',
  DONE: '已完成',
  CHAT: '对话',
  IMAGE: '图片生成',
  VIDEO: '视频生成',
  COMMERCE: '商品视觉',
  OFFICE: '办公中心',
  SUPPORT: '客服'
}

export function createResourceFormatters(translate: Translate, locale: () => string) {
  function valueAt(row: ResourceRow, path: string) {
    return path.split('.').reduce<any>((value, key) => value?.[key], row)
  }

  function adminMediaUrl(value: unknown) {
    if (typeof value !== 'string' || !value) return ''
    if (!value.startsWith('/assets/')) return value
    const base = import.meta.env.BASE_URL.endsWith('/')
      ? import.meta.env.BASE_URL.slice(0, -1)
      : import.meta.env.BASE_URL
    return `${base}${value}`
  }

  function rowPreviewList(row: ResourceRow) {
    return [
      row.coverUrl,
      row.imageUrl,
      typeof row.icon === 'string' && /^(?:https?:\/\/|\/)/.test(row.icon) ? row.icon : '',
      ...(Array.isArray(row.uploadedPreviewImages)
        ? row.uploadedPreviewImages.map((item: ResourceRow) => item.url || item.contentUrl)
        : []),
      ...(Array.isArray(row.referenceImageUrls) ? row.referenceImageUrls : []),
      ...(Array.isArray(row.options?.previewImages) ? row.options.previewImages : [])
    ]
      .filter((value): value is string => typeof value === 'string' && Boolean(value))
      .map(adminMediaUrl)
  }

  function displayValue(value: unknown) {
    if (value === null || value === undefined || value === '') return '-'
    if (Array.isArray(value))
      return (
        value.map((item) => (typeof item === 'object' ? JSON.stringify(item) : item)).join('、') ||
        '-'
      )
    if (typeof value === 'boolean') return value ? translate('是') : translate('否')
    if (typeof value === 'object') return JSON.stringify(value)
    return String(value)
  }

  function formatDate(value: unknown) {
    if (value instanceof Date) return formatDateTime(value, '-')
    if (typeof value === 'string' || typeof value === 'number') return formatDateTime(value, '-')
    return value ? formatDateTime(String(value), '-') : '-'
  }

  function formatBytes(value: number) {
    if (!value) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1)
    return `${(value / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`
  }

  function formatNumber(value: number) {
    return new Intl.NumberFormat(locale()).format(value)
  }

  function statusText(value: unknown) {
    return translate(statusLabels[String(value)] || displayValue(value))
  }

  function statusType(value: unknown): ResourceStatusType {
    const key = String(value)
    if (['true', 'ACTIVE', 'SUCCEEDED', 'RESOLVED', 'COMPLETED', 'APPROVED', 'DONE'].includes(key))
      return 'success'
    if (
      [
        'RUNNING',
        'QUEUED',
        'OPEN',
        'IN_PROGRESS',
        'WAITING_USER',
        'ACKNOWLEDGED',
        'WARNING',
        'MEDIUM',
        'REVIEW'
      ].includes(key)
    )
      return 'warning'
    if (['FAILED', 'SUSPENDED', 'URGENT', 'CRITICAL', 'HIGH', 'BLOCK', 'DISMISSED'].includes(key))
      return 'danger'
    return 'info'
  }

  return {
    valueAt,
    adminMediaUrl,
    rowPreviewList,
    rowCover: (row: ResourceRow) => rowPreviewList(row)[0] || '',
    displayValue,
    formatDate,
    formatBytes,
    formatNumber,
    statusText,
    statusType
  }
}
