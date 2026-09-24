import assert from 'node:assert/strict'
import test from 'node:test'
import { ADMIN_LOGIN_FAILED, ADMIN_LOGIN_SUCCEEDED, AuthService } from '../../server/src/auth/auth.service'
import { hashPassword } from '../../server/src/auth/password'

type AuditRow = { actorId: string | null; action: string; createdAt: Date; ipAddress?: string; userAgent?: string }

function createHarness(passwordHash: string, options: { config?: Record<string, unknown>; audit?: AuditRow[] } = {}) {
  const audit: AuditRow[] = options.audit ?? []
  const sessions: Array<{ userId: string; authMethod: string }> = []
  const user = { id: 'admin-1', email: 'admin@example.com', username: null, displayName: '管理员', role: 'SUPER_ADMIN', status: 'ACTIVE', passwordHash }

  const prisma = {
    user: {
      findUnique: async ({ where }: { where: { email?: string; id?: string } }) => (where.email === user.email || where.id === user.id ? { ...user } : null),
      update: async () => ({ ...user }),
    },
    auditLog: {
      create: async ({ data }: { data: AuditRow }) => { const row = { ...data, createdAt: data.createdAt ?? new Date() }; audit.push(row); return row },
      findFirst: async ({ where }: { where: { actorId: string; action: string; createdAt?: { gte?: Date } } }) => {
        const matches = audit
          .filter((row) => row.actorId === where.actorId && row.action === where.action && (!where.createdAt?.gte || row.createdAt >= where.createdAt.gte))
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        return matches[0] ?? null
      },
      findMany: async ({ where, take }: { where: { actorId: string; action: string; createdAt?: { gt?: Date } }; take?: number }) => {
        const matches = audit
          .filter((row) => row.actorId === where.actorId && row.action === where.action && (!where.createdAt?.gt || row.createdAt > where.createdAt.gt))
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        return take ? matches.slice(0, take) : matches
      },
    },
    session: { create: async ({ data }: { data: { userId: string; authMethod: string } }) => { sessions.push(data); return data } },
  }

  const defaults: Record<string, unknown> = { ADMIN_LOGIN_MAX_FAILURES: 3, ADMIN_LOGIN_FAILURE_WINDOW_MINUTES: 15, ADMIN_LOGIN_LOCK_SECONDS: 60, ADMIN_LOGIN_MAX_LOCK_SECONDS: 900, SESSION_TTL_DAYS: 30, ...options.config }
  const config = { get: (key: string, fallback?: unknown) => (key in defaults ? defaults[key] : fallback) }
  const service = new AuthService(prisma as never, config as never, {} as never, {} as never, {} as never, {} as never)
  return { service, audit, sessions }
}

const meta = { ip: '203.0.113.9', userAgent: 'vitest' }

test('管理员登录失败会写入安全审计记录', async () => {
  const { service, audit } = createHarness(await hashPassword('correct-horse'))

  await assert.rejects(() => service.loginAdmin('admin@example.com', 'wrong', meta), /管理员账号或密码错误/)

  assert.equal(audit.length, 1)
  assert.equal(audit[0].action, ADMIN_LOGIN_FAILED)
  assert.equal(audit[0].actorId, 'admin-1')
  assert.equal(audit[0].ipAddress, '203.0.113.9')
})

test('同一账号连续失败达到阈值后被临时锁定，正确密码也要等退避结束', async () => {
  const { service } = createHarness(await hashPassword('correct-horse'))

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await assert.rejects(() => service.loginAdmin('admin@example.com', 'wrong', meta), /管理员账号或密码错误/)
  }

  await assert.rejects(
    () => service.loginAdmin('admin@example.com', 'correct-horse', meta),
    (error: { status?: number; message: string }) => {
      assert.equal(error.status, 429)
      assert.match(error.message, /连续登录失败被临时锁定/)
      return true
    },
  )
})

test('退避时间随失败次数指数增长并受上限约束', async () => {
  const now = Date.now()
  // 6 failures with a 3-failure budget means the lock has doubled three times: 60s -> 480s.
  const audit = Array.from({ length: 6 }, (_, index) => ({ actorId: 'admin-1', action: ADMIN_LOGIN_FAILED, createdAt: new Date(now - 1_000 * (6 - index)) }))
  const { service } = createHarness(await hashPassword('correct-horse'), { audit })

  await assert.rejects(
    () => service.loginAdmin('admin@example.com', 'correct-horse', meta),
    (error: { message: string }) => {
      const seconds = Number(error.message.match(/(\d+) 秒后重试/)?.[1])
      assert.ok(seconds > 400 && seconds <= 480, `退避秒数应接近 480，实际 ${seconds}`)
      return true
    },
  )
})

test('退避窗口过期后允许重新尝试', async () => {
  const stale = Date.now() - 20 * 60_000
  const audit = Array.from({ length: 5 }, (_, index) => ({ actorId: 'admin-1', action: ADMIN_LOGIN_FAILED, createdAt: new Date(stale + index * 1_000) }))
  const { service, sessions } = createHarness(await hashPassword('correct-horse'), { audit })

  const result = await service.loginAdmin('admin@example.com', 'correct-horse', meta)
  assert.equal(result.user.id, 'admin-1')
  assert.equal(sessions[0].authMethod, 'admin-password')
})

test('成功登录会重置失败预算', async () => {
  const { service, audit } = createHarness(await hashPassword('correct-horse'))

  await assert.rejects(() => service.loginAdmin('admin@example.com', 'wrong', meta), /密码错误/)
  await assert.rejects(() => service.loginAdmin('admin@example.com', 'wrong', meta), /密码错误/)
  await service.loginAdmin('admin@example.com', 'correct-horse', meta)
  assert.equal(audit.filter((row) => row.action === ADMIN_LOGIN_SUCCEEDED).length, 1)

  // Two more failures would have crossed the 3-failure budget without the reset.
  await assert.rejects(() => service.loginAdmin('admin@example.com', 'wrong', meta), /密码错误/)
  await assert.rejects(() => service.loginAdmin('admin@example.com', 'wrong', meta), /密码错误/)
  await assert.rejects(() => service.loginAdmin('admin@example.com', 'wrong', meta), /密码错误/)
})

test('非管理员账号不会写入管理员审计记录', async () => {
  const { service, audit } = createHarness(await hashPassword('correct-horse'))
  await assert.rejects(() => service.loginAdmin('nobody@example.com', 'whatever', meta), /管理员账号或密码错误/)
  assert.equal(audit.length, 0)
})
