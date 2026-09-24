import assert from 'node:assert/strict'
import test from 'node:test'
import { AuthService } from '../../server/src/auth/auth.service'

function createService(env: Record<string, unknown>) {
  const prisma = {
    systemSetting: { upsert: async () => ({ emailLoginEnabled: true, registrationEnabled: true, emailVerifyEnabled: true, allowedEmailDomains: [], otpTtlMinutes: 10 }) },
    user: { findUnique: async () => ({ id: 'user-1', status: 'ACTIVE' }) },
    otpCode: { count: async () => 0, create: async () => ({}) },
  }
  const defaults: Record<string, unknown> = { SESSION_SECRET: 'x'.repeat(32), OTP_TTL_MINUTES: 10, ...env }
  const config = {
    get: (key: string, fallback?: unknown) => (key in defaults ? defaults[key] : fallback),
    getOrThrow: (key: string) => defaults[key],
  }
  const emailService = { sendLoginCode: async () => true }
  return new AuthService(prisma as never, config as never, emailService as never, {} as never, {} as never, {} as never)
}

test('生产环境即使显式开启也不会回显验证码', async () => {
  const result = await createService({ NODE_ENV: 'production', DEV_OTP_EXPOSE: true }).requestCode('user@example.com')
  assert.equal('developmentCode' in result, false)
})

test('开发环境默认不回显验证码', async () => {
  const result = await createService({ NODE_ENV: 'development' }).requestCode('user@example.com')
  assert.equal('developmentCode' in result, false)
})

test('开发环境显式设置 DEV_OTP_EXPOSE 后才回显验证码', async () => {
  const fromBoolean = await createService({ NODE_ENV: 'development', DEV_OTP_EXPOSE: true }).requestCode('user@example.com')
  assert.match(String((fromBoolean as { developmentCode?: string }).developmentCode), /^\d{6}$/)

  const fromString = await createService({ NODE_ENV: 'development', DEV_OTP_EXPOSE: 'true' }).requestCode('user@example.com')
  assert.match(String((fromString as { developmentCode?: string }).developmentCode), /^\d{6}$/)
})

test('无法识别的 DEV_OTP_EXPOSE 取值按关闭处理', async () => {
  for (const value of ['false', '0', 'maybe', '', undefined]) {
    const result = await createService({ NODE_ENV: 'development', DEV_OTP_EXPOSE: value }).requestCode('user@example.com')
    assert.equal('developmentCode' in result, false, `DEV_OTP_EXPOSE=${String(value)} 不应回显验证码`)
  }
})
