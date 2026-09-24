import assert from 'node:assert/strict'
import test from 'node:test'
import { TeamService } from '../../server/src/workspace/team.service'

const delay = () => new Promise((resolve) => setTimeout(resolve, 0))

/** Serializes transactions the same way `SELECT ... FOR UPDATE` does: the lock is taken inside the
 *  transaction and only released when it commits or rolls back. */
class RowLock {
  private tail: Promise<void> = Promise.resolve()

  async acquire() {
    let release!: () => void
    const held = new Promise<void>((resolve) => { release = resolve })
    const previous = this.tail
    this.tail = previous.then(() => held)
    await previous
    return release
  }
}

type Member = { teamId: string; userId: string; role: string }
type Invitation = { id: string; teamId: string; email: string; role: string; status: string; expiresAt: Date; tokenHash?: string }

function createFixture(seatLimit: number, members: Member[], invitations: Invitation[]) {
  const team = { id: 'team-1', name: '设计团队', slug: 'team-1', seatLimit, status: 'ACTIVE', ownerId: 'owner-1' }
  const lock = new RowLock()
  let lockedInTransaction = 0

  const models = {
    team: {
      findUnique: async ({ where, include }: any) => {
        if (where.id !== team.id) return null
        if (include?.members) return { ...team, members: members.filter((m) => m.userId === include.members.where.userId).map((m) => ({ role: m.role })) }
        return { ...team }
      },
    },
    teamMember: {
      count: async ({ where }: any) => {
        await delay()
        return members.filter((m) => m.teamId === where.teamId && (where.userId === undefined || m.userId === where.userId)).length
      },
      upsert: async ({ where, create, update }: any) => {
        const key = where.teamId_userId
        const existing = members.find((m) => m.teamId === key.teamId && m.userId === key.userId)
        if (existing) { Object.assign(existing, update); return existing }
        const created = { ...create }
        members.push(created)
        return created
      },
    },
    teamInvitation: {
      findUnique: async ({ where }: any) => {
        const row = invitations.find((i) => (where.id ? i.id === where.id : i.tokenHash === where.tokenHash))
        return row ? { ...row, team: { ...team } } : null
      },
      count: async ({ where }: any) => {
        await delay()
        return invitations.filter((i) => i.teamId === where.teamId && i.status === 'PENDING' && i.email !== where.email?.not).length
      },
      update: async ({ where, data }: any) => {
        const row = invitations.find((i) => i.id === where.id)
        if (row) Object.assign(row, data)
        return row
      },
      upsert: async ({ where, create, update }: any) => {
        const key = where.teamId_email
        const existing = invitations.find((i) => i.teamId === key.teamId && i.email === key.email)
        if (existing) { Object.assign(existing, update); return existing }
        const created = { id: `inv-${invitations.length + 1}`, status: 'PENDING', ...create }
        invitations.push(created)
        return created
      },
    },
    user: { findUnique: async () => null },
    notification: { create: async () => ({}) },
    teamAuditLog: { create: async () => ({}) },
  }

  const prisma = {
    ...models,
    $transaction: async (fn: any) => {
      let release: (() => void) | null = null
      const tx = {
        ...models,
        $queryRaw: async () => {
          release = await lock.acquire()
          lockedInTransaction += 1
          return [{ id: team.id }]
        },
      }
      try {
        return await fn(tx)
      } finally {
        release?.()
      }
    },
  }

  const email = { sendTeamInvitation: async () => true }
  const config = { get: () => 'https://app.example.com' }
  const service = new TeamService(prisma as never, email as never, config as never)
  return { service, team, members, invitations, lockCount: () => lockedInTransaction }
}

test('并发接受邀请不会突破 seatLimit', async () => {
  const { service, members, lockCount } = createFixture(
    2,
    [{ teamId: 'team-1', userId: 'owner-1', role: 'OWNER' }],
    [
      { id: 'inv-a', teamId: 'team-1', email: 'a@example.com', role: 'MEMBER', status: 'PENDING', expiresAt: new Date(Date.now() + 86_400_000) },
      { id: 'inv-b', teamId: 'team-1', email: 'b@example.com', role: 'MEMBER', status: 'PENDING', expiresAt: new Date(Date.now() + 86_400_000) },
    ],
  )

  const results = await Promise.allSettled([
    service.acceptPending('inv-a', { id: 'user-a', email: 'a@example.com' }),
    service.acceptPending('inv-b', { id: 'user-b', email: 'b@example.com' }),
  ])

  const accepted = results.filter((r) => r.status === 'fulfilled')
  const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
  assert.equal(accepted.length, 1)
  assert.equal(rejected.length, 1)
  assert.match(rejected[0].reason.message, /团队席位已满/)
  assert.equal(members.length, 2)
  assert.ok(lockCount() >= 2, '每个接受事务都必须先锁定团队行')
})

test('接受邀请已是成员时不占用新席位', async () => {
  const { service, members } = createFixture(
    1,
    [{ teamId: 'team-1', userId: 'owner-1', role: 'OWNER' }, { teamId: 'team-1', userId: 'user-a', role: 'MEMBER' }],
    [{ id: 'inv-a', teamId: 'team-1', email: 'a@example.com', role: 'ADMIN', status: 'PENDING', expiresAt: new Date(Date.now() + 86_400_000) }],
  )

  const result = await service.acceptPending('inv-a', { id: 'user-a', email: 'a@example.com' })
  assert.equal(result.accepted, true)
  assert.equal(members.length, 2)
  assert.equal(members.find((m) => m.userId === 'user-a')?.role, 'ADMIN')
})

test('并发邀请不会让待接受邀请超出席位', async () => {
  const { service, invitations, lockCount } = createFixture(
    2,
    [{ teamId: 'team-1', userId: 'owner-1', role: 'OWNER' }],
    [],
  )

  const results = await Promise.allSettled([
    service.invite('team-1', 'owner-1', { email: 'a@example.com' }),
    service.invite('team-1', 'owner-1', { email: 'b@example.com' }),
  ])

  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1)
  const rejected = results.find((r): r is PromiseRejectedResult => r.status === 'rejected')
  assert.match(rejected!.reason.message, /团队席位已满/)
  assert.equal(invitations.length, 1)
  assert.ok(lockCount() >= 2, '每个邀请事务都必须先锁定团队行')
})
