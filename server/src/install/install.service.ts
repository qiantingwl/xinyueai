import { BadRequestException, ConflictException, Injectable, Logger, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import Redis from 'ioredis'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { hashPassword } from '../auth/password'
import { writeRuntimeEnv } from '../config/runtime-env'
import { deployMigrations, testDatabase, withDatabase } from './install-bootstrap'

type CompleteInput = {
  installToken: string
  siteName: string
  siteUrl: string
  siteLogoUrl?: string
  supportUrl?: string
  registrationEnabled?: boolean
  adminEmail: string
  adminDisplayName: string
  adminPassword: string
}

@Injectable()
export class InstallService {
  private readonly logger = new Logger(InstallService.name)
  private readonly generatedToken = randomBytes(18).toString('base64url')
  private tokenLogged = false

  async status() {
    const databaseUrl = process.env.DATABASE_URL?.trim() || ''
    if (!databaseUrl) {
      if (this.installationLocked() || process.env.APP_BOOT_MODE === 'maintenance') return { installed: false, locked: true, phase: 'database', databaseConfigured: false, databaseReady: false, databaseError: '数据库配置不可用，请恢复服务端运行配置并重启 API', requiresInstallToken: false }
      this.logToken()
      return { installed: false, phase: 'database', databaseConfigured: false, databaseReady: false, requiresInstallToken: true }
    }
    try {
      await testDatabase(databaseUrl)
      const result = await withDatabase(databaseUrl, async (client) => {
        const adminCount = await client.user.count({ where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] }, status: 'ACTIVE' } })
        const settings = await client.systemSetting.findUnique({ where: { id: 'global' }, select: { siteName: true } })
        return { adminCount, siteName: settings?.siteName || 'Xinyue AI' }
      })
      if (result.adminCount > 0) return { installed: true, phase: 'complete', databaseConfigured: true, databaseReady: true, siteName: result.siteName, requiresInstallToken: false, restartRequired: process.env.APP_BOOT_MODE === 'install' }
      this.logToken()
      return { installed: false, phase: 'site', databaseConfigured: true, databaseReady: true, siteName: result.siteName, requiresInstallToken: true }
    } catch (error) {
      if (this.installationLocked() || process.env.APP_BOOT_MODE === 'maintenance') return { installed: false, locked: true, phase: 'database', databaseConfigured: true, databaseReady: false, databaseError: this.safeError(error), requiresInstallToken: false }
      this.logToken()
      return { installed: false, phase: 'database', databaseConfigured: true, databaseReady: false, databaseError: this.safeError(error), requiresInstallToken: true }
    }
  }

  async configureDatabase(input: { installToken: string; databaseUrl: string; redisUrl: string }) {
    this.assertUnlocked()
    this.assertToken(input.installToken)
    await this.assertNotInstalled(process.env.DATABASE_URL?.trim())
    try { await testDatabase(input.databaseUrl) } catch (error) { throw new BadRequestException(`PostgreSQL 连接失败：${this.safeError(error)}`) }
    await this.testRedis(input.redisUrl)
    try { await deployMigrations(input.databaseUrl) } catch (error) { throw new BadRequestException(this.safeError(error)) }
    const security = this.securityValues()
    writeRuntimeEnv({ DATABASE_URL: input.databaseUrl, REDIS_URL: input.redisUrl, INSTALL_TOKEN: this.installToken(), ...security })
    return { configured: true, migrated: true, nextPhase: 'site' }
  }

  async complete(input: CompleteInput) {
    this.assertUnlocked()
    this.assertToken(input.installToken)
    const databaseUrl = process.env.DATABASE_URL?.trim()
    if (!databaseUrl) throw new ServiceUnavailableException('请先配置数据库')
    const passwordHash = await hashPassword(input.adminPassword)
    try {
      await withDatabase(databaseUrl, (client) => client.$transaction(async (tx) => {
        const adminCount = await tx.user.count({ where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] }, status: 'ACTIVE' } })
        if (adminCount) throw new ConflictException('系统已经完成安装')
        await tx.systemSetting.upsert({
          where: { id: 'global' },
          update: { siteName: input.siteName.trim(), siteLogoUrl: input.siteLogoUrl?.trim() || '', supportUrl: input.supportUrl?.trim() || '', registrationEnabled: input.registrationEnabled ?? true, passwordLoginEnabled: true, passwordRegistrationEnabled: input.registrationEnabled ?? true, emailLoginEnabled: false, emailVerifyEnabled: false },
          create: { id: 'global', siteName: input.siteName.trim(), siteLogoUrl: input.siteLogoUrl?.trim() || '', supportUrl: input.supportUrl?.trim() || '', registrationEnabled: input.registrationEnabled ?? true, passwordLoginEnabled: true, passwordRegistrationEnabled: input.registrationEnabled ?? true, emailLoginEnabled: false, emailVerifyEnabled: false },
        })
        await tx.user.create({ data: { email: input.adminEmail.trim().toLowerCase(), displayName: input.adminDisplayName.trim(), passwordHash, emailVerifiedAt: new Date(), role: 'SUPER_ADMIN', status: 'ACTIVE', settings: { create: {} }, creditAccount: { create: { balance: 0 } } } })
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }))
    } catch (error) {
      if (error instanceof ConflictException) throw error
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('管理员邮箱已经存在')
      throw error
    }
    const siteUrl = new URL(input.siteUrl.trim()).origin
    writeRuntimeEnv({ WEB_ORIGIN: siteUrl, COOKIE_SECURE: String(siteUrl.startsWith('https://')), INSTALL_TOKEN: this.installToken(), INSTALL_COMPLETED: 'true', ...this.securityValues() })
    const autoRestart = process.env.INSTALL_AUTO_RESTART === 'true'
    if (autoRestart) setTimeout(() => process.exit(0), 1200).unref()
    return { installed: true, restartRequired: true, autoRestart, adminUrl: '/admin/' }
  }

  private async assertNotInstalled(databaseUrl?: string) {
    if (!databaseUrl) return
    try {
      const count = await withDatabase(databaseUrl, (client) => client.user.count({ where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] }, status: 'ACTIVE' } }))
      if (count) throw new ConflictException('系统已经完成安装，不能再次修改安装配置')
    } catch (error) {
      if (error instanceof ConflictException) throw error
    }
  }

  private async testRedis(redisUrl: string) {
    const redis = new Redis(redisUrl, { lazyConnect: true, connectTimeout: 5000, commandTimeout: 5000, maxRetriesPerRequest: 0, retryStrategy: () => null })
    try {
      await redis.connect()
      if (await redis.ping() !== 'PONG') throw new Error('Redis 未返回 PONG')
    } catch (error) {
      throw new BadRequestException(`Redis 连接失败：${this.safeError(error)}`)
    } finally {
      redis.disconnect()
    }
  }

  private securityValues() {
    return {
      SESSION_SECRET: process.env.SESSION_SECRET?.length && process.env.SESSION_SECRET.length >= 32 ? process.env.SESSION_SECRET : randomBytes(48).toString('base64url'),
      CREDENTIAL_ENCRYPTION_KEY: process.env.CREDENTIAL_ENCRYPTION_KEY?.length && process.env.CREDENTIAL_ENCRYPTION_KEY.length >= 32 ? process.env.CREDENTIAL_ENCRYPTION_KEY : randomBytes(48).toString('base64url'),
    }
  }

  private installToken() { return process.env.INSTALL_TOKEN?.trim() || this.generatedToken }
  private installationLocked() { return process.env.INSTALL_COMPLETED === 'true' }
  private assertUnlocked() { if (this.installationLocked() || process.env.APP_BOOT_MODE === 'maintenance') throw new ConflictException('站点已经完成安装，安装入口已锁定') }
  private logToken() { if (!this.tokenLogged) { this.tokenLogged = true; this.logger.warn(`首次安装密钥：${this.installToken()}`) } }
  private assertToken(value: string) {
    const expected = Buffer.from(this.installToken())
    const actual = Buffer.from(value.trim())
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new UnauthorizedException('安装密钥不正确')
  }
  private safeError(error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    return message.replace(/postgres(?:ql)?:\/\/[^\s@]+@/gi, 'postgresql://***@').replace(/redis(?:s)?:\/\/[^\s@]+@/gi, 'redis://***@').slice(0, 500)
  }
}
