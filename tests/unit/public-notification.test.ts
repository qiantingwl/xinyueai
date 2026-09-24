import assert from 'node:assert/strict'
import test from 'node:test'
import { collapseNotifications } from '../../server/src/notifications/public-notification'

test('同一条运营告警在通知列表里只保留最新一条', () => {
  const rows = [
    { id: 'n3', title: '模型渠道异常：deepseek', body: '上游账户余额不足，请检查渠道充值', readAt: null, createdAt: '2026-09-20T12:21:00.000Z', metadata: { alertEventId: 'evt-1' } },
    { id: 'n2', title: '模型渠道异常：deepseek', body: 'Provider returned 402: {"error":{"message":"Insufficient Balance"}}', readAt: null, createdAt: '2026-09-19T21:47:00.000Z', metadata: { alertEventId: 'evt-1' } },
    { id: 'n1', title: '退款处理完成', body: '退款 ¥10.00 已处理', readAt: '2026-09-18T00:00:00.000Z', createdAt: '2026-09-18T00:00:00.000Z', metadata: {} },
  ]
  const list = collapseNotifications(rows)
  assert.equal(list.length, 2)
  assert.equal(list[0].id, 'n3')
  assert.equal(list[0].readAt, null)
  assert.equal(list[0].body, '上游账户余额不足，请检查渠道充值')
  assert.equal(list[1].id, 'n1')
  assert.doesNotMatch(list[0].body, /Provider returned/)
})
