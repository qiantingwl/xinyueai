import assert from 'node:assert/strict'
import test from 'node:test'
import { cookieMutationAllowed } from '../../server/src/config/http-security'
import { ExportsService } from '../../server/src/exports/exports.service'

test('带 session cookie 的跨站变更即使携带 requestMarker 也被拦截', () => {
  const allowedOrigins = ['https://app.xinyue.com']
  const result = cookieMutationAllowed({
    method: 'POST',
    hasSessionCookie: true,
    requestMarker: '1',
    origin: 'https://attacker.com',
  }, allowedOrigins)
  assert.equal(result, false)
})

test('带 session cookie 的合法 Origin 变更正常允许', () => {
  const allowedOrigins = ['https://app.xinyue.com']
  const result = cookieMutationAllowed({
    method: 'POST',
    hasSessionCookie: true,
    requestMarker: '1',
    origin: 'https://app.xinyue.com',
  }, allowedOrigins)
  assert.equal(result, true)
})

test('普通团队成员发起 TEAM 范围导出直接抛出 ForbiddenException', async () => {
  const mockPrisma = {
    teamMember: {
      findUnique: async () => ({
        role: 'MEMBER',
        team: { status: 'ACTIVE' },
      }),
    },
    exportJob: {
      create: async () => ({ id: 'job-1' }),
    },
  }
  const mockQueue = {
    add: async () => {},
  }
  const service = new ExportsService(mockPrisma as never, mockQueue as never)

  await assert.rejects(
    () => service.create('user-1', 'TEAM', 'team-1'),
    /只有团队所有者或管理员可以导出团队数据/,
  )
})

test('团队管理员或所有者可以成功发起 TEAM 导出', async () => {
  const mockPrisma = {
    teamMember: {
      findUnique: async () => ({
        role: 'ADMIN',
        team: { status: 'ACTIVE' },
      }),
    },
    exportJob: {
      create: async (data: { data: Record<string, unknown> }) => ({
        id: 'job-team-ok',
        ...data.data,
        status: 'QUEUED',
        fileName: 'export.json',
        error: '',
        createdAt: new Date(),
        startedAt: null,
        completedAt: null,
      }),
    },
  }
  let addedJob = false
  const mockQueue = {
    add: async () => { addedJob = true },
  }
  const service = new ExportsService(mockPrisma as never, mockQueue as never)
  const result = await service.create('user-admin', 'TEAM', 'team-1')
  assert.equal(result.id, 'job-team-ok')
  assert.equal(addedJob, true)
})
