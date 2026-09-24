import { asJsonRecord } from '../common/json-record'
import { looksLikeUpstreamDump, publicUpstreamHealthMessage } from '../providers/upstream-errors'

export type NotificationRow = {
  id: string
  title: string
  body: string
  readAt: Date | string | null
  createdAt: Date | string
  metadata?: unknown
}

export function notificationAlertKey(metadata: unknown) {
  const alertEventId = asJsonRecord(metadata).alertEventId
  return typeof alertEventId === 'string' && alertEventId.trim() ? alertEventId : ''
}

export function toPublicNotification<T extends NotificationRow>(row: T) {
  return {
    ...row,
    body: looksLikeUpstreamDump(row.body) ? publicUpstreamHealthMessage(row.body) : row.body,
  }
}

export function collapseNotifications<T extends NotificationRow>(rows: T[]) {
  const seen = new Set<string>()
  const unreadByAlert = new Set<string>()
  for (const row of rows) {
    const key = notificationAlertKey(row.metadata)
    if (key && !row.readAt) unreadByAlert.add(key)
  }
  const next: Array<ReturnType<typeof toPublicNotification<T>>> = []
  for (const row of rows) {
    const key = notificationAlertKey(row.metadata)
    if (key) {
      if (seen.has(key)) continue
      seen.add(key)
      next.push({ ...toPublicNotification(row), readAt: unreadByAlert.has(key) ? null : row.readAt })
      continue
    }
    next.push(toPublicNotification(row))
  }
  return next
}
