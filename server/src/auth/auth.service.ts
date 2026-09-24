import { BadRequestException, ConflictException, ForbiddenException, HttpException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { LedgerType, Prisma, type User } from '@prisma/client'
import { createHash, randomBytes, randomInt } from 'node:crypto'
import { PrismaService } from '../prisma/prisma.service'
import { hashPassword, verifyPassword } from './password'
import { EmailService } from './email.service'
import { CredentialCryptoService } from '../providers/credential-crypto.service'
import { ReferralService } from '../commercial/referral.service'
import { isInstallTokenValid } from './install-token'
import { PublicEndpointPolicyService } from '../common/public-endpoint-policy.service'
import { fetchPublicNoRedirect } from '../common/outbound-http'

const hash = (value: string, secret: string) => createHash('sha256').update(`${secret}:${value}`).digest('hex')
export const ADMIN_LOGIN_FAILED = 'admin.login.failed'
export const ADMIN_LOGIN_SUCCEEDED = 'admin.login.succeeded'
type LoginMeta = { ip?: string; userAgent?: string }
type SessionResult = { user: { id: string; email: string | null; username: string | null; displayName: string; role: string }; token: string; expiresAt: Date }
type ExternalLoginResult = SessionResult | { bindingRequired: true; provider: string; ticket: string; displayName?: string; email?: string }
type ExternalProfile = Record<string, unknown>

function jsonInput(value: ExternalProfile | null | undefined) {
  if (value === null) return Prisma.JsonNull
  return value as Prisma.InputJsonValue | undefined
}

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService, private readonly emailService: EmailService, private readonly crypto: CredentialCryptoService, private readonly referrals: ReferralService, private readonly endpointPolicy: PublicEndpointPolicyService) {}

  /** Echoing the OTP back to the caller is a development convenience only, so it must be opted into
   *  explicitly and can never be reached outside `NODE_ENV=development`. */
  private shouldExposeDevCode() {
    if (this.config.get<string>('NODE_ENV') !== 'development') return false
    return String(this.config.get<string>('DEV_OTP_EXPOSE') ?? '').trim().toLowerCase() === 'true'
  }

  async isSetupRequired() {
    const admins = await this.prisma.user.findMany({ where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] } }, select: { email: true } })
    return !admins.some((admin) => Boolean(admin.email && /^[^@\s]+@[^@\s]+$/.test(admin.email)))
  }

  async setupAdmin(input: { email: string; password: string; displayName?: string }, meta: LoginMeta, installToken?: string) {
    if (!isInstallTokenValid(installToken, this.config.get<string>('INSTALL_TOKEN'))) {
      throw new ForbiddenException('安装令牌无效')
    }
    const email = input.email.trim().toLowerCase()
    const user = await this.prisma.$transaction(async (tx) => {
      const admins = await tx.user.findMany({ where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] } }, select: { id: true, email: true } })
      if (admins.some((admin) => Boolean(admin.email && /^[^@\s]+@[^@\s]+$/.test(admin.email)))) throw new ConflictException('管理员已经初始化')
      const malformedAdminIds = admins.filter((admin) => admin.email && admin.email.includes('admin_email=')).map((admin) => admin.id)
      if (malformedAdminIds.length) await tx.user.deleteMany({ where: { id: { in: malformedAdminIds } } })
      const settings = await tx.systemSetting.upsert({ where: { id: 'global' }, update: {}, create: { id: 'global' } })
      const defaultGroup = await tx.userGroup.upsert({ where: { name: '默认用户' }, update: { enabled: true }, create: { name: '默认用户', description: '所有新注册用户的基础权限与计费策略', color: '#397157', enabled: true } })
      const passwordHash = await hashPassword(input.password)
      return tx.user.create({ data: { email, displayName: input.displayName?.trim() || '超级管理员', emailVerifiedAt: new Date(), role: 'SUPER_ADMIN', status: 'ACTIVE', passwordHash, settings: { create: this.defaultUserSettings(settings) }, creditAccount: { create: this.defaultCreditAccount(settings) }, groupMemberships: { create: { group: { connect: { id: defaultGroup.id } } } } } })
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
    return this.createSession(user, meta, 'setup')
  }

  async requestCode(emailInput: string) {
    const email = emailInput.trim().toLowerCase()
    const settings = await this.prisma.systemSetting.upsert({ where: { id: 'global' }, update: {}, create: { id: 'global' } })
    const existingUser = await this.prisma.user.findUnique({ where: { email }, select: { id: true, status: true } })
    if (existingUser && !settings.emailLoginEnabled) throw new BadRequestException('邮箱登录当前未开放')
    if (!existingUser && !settings.registrationEnabled) throw new BadRequestException('新用户注册当前未开放')
    if (!existingUser && !settings.emailVerifyEnabled) throw new BadRequestException('邮箱验证码注册当前未开放')
    if (existingUser && existingUser.status !== 'ACTIVE') throw new UnauthorizedException('账号当前不可用')
    const domain = email.split('@')[1] || ''
    if (!existingUser && settings.allowedEmailDomains.length && !settings.allowedEmailDomains.some((item) => item.toLowerCase().replace(/^@/, '') === domain)) throw new BadRequestException('该邮箱域名不在注册白名单中')
    const { code, ttl } = await this.issueOtpCode(email, settings.otpTtlMinutes)
    return { sent: true, exists: Boolean(existingUser), registrationRequired: !existingUser, expiresIn: ttl * 60, ...(this.shouldExposeDevCode() ? { developmentCode: code } : {}) }
  }

  async registerWithPassword(input: { username: string; email?: string; password: string; displayName?: string; inviteCode?: string }, meta: { ip?: string; userAgent?: string }) {
    const settings = await this.prisma.systemSetting.upsert({ where: { id: 'global' }, update: {}, create: { id: 'global' } })
    if (!settings.registrationEnabled || !settings.passwordRegistrationEnabled) throw new BadRequestException('密码注册当前未开放')
    const username = input.username.trim().toLowerCase()
    const email = input.email?.trim().toLowerCase() || null
    if (email && settings.emailVerifyEnabled) throw new BadRequestException('请先使用邮箱验证码完成注册')
    const existing = await this.prisma.user.findFirst({ where: { OR: [{ username }, ...(email ? [{ email }] : [])] }, select: { id: true } })
    if (existing) throw new BadRequestException('用户名或邮箱已经注册')
    if (email && settings.allowedEmailDomains.length && !settings.allowedEmailDomains.some((item) => item.toLowerCase().replace(/^@/, '') === (email.split('@')[1] || ''))) {
      throw new BadRequestException('该邮箱域名不在注册白名单中')
    }
    const defaultGroup = await this.ensureDefaultGroup(settings.defaultUserGroupId)
    const passwordHash = await hashPassword(input.password)
    let user: User
    try {
      user = await this.prisma.user.create({ data: { username, email, displayName: input.displayName?.trim() || username, passwordHash, emailVerifiedAt: email ? null : undefined, lastLoginAt: new Date(), settings: { create: this.defaultUserSettings(settings) }, creditAccount: { create: this.defaultCreditAccount(settings) }, groupMemberships: defaultGroup ? { create: { group: { connect: { id: defaultGroup.id } } } } : undefined } })
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new BadRequestException('用户名或邮箱已经注册')
      throw error
    }
    await this.referrals.attributeRegistration(user.id, input.inviteCode, meta)
    return this.createSession(user, meta, 'password')
  }

  async loginWithPassword(identifierInput: string, password: string, meta: { ip?: string; userAgent?: string }) {
    const settings = await this.prisma.systemSetting.upsert({ where: { id: 'global' }, update: {}, create: { id: 'global' } })
    if (!settings.passwordLoginEnabled) throw new BadRequestException('密码登录当前未开放')
    const identifier = identifierInput.trim().toLowerCase()
    const user = await this.prisma.user.findFirst({ where: { OR: [{ username: identifier }, { email: identifier }] } })
    if (!user?.passwordHash || user.status !== 'ACTIVE' || !await verifyPassword(password, user.passwordHash)) throw new UnauthorizedException('用户名、邮箱或密码错误')
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
    return this.createSession(user, meta, 'password')
  }

  async loginExternal(provider: string, subject: string, input: { email?: string; displayName?: string; avatarUrl?: string; profile?: Record<string, unknown> | null; meta: LoginMeta; requireEmailBind?: boolean; inviteCode?: string }): Promise<ExternalLoginResult> {
    const cleanSubject = subject.trim()
    if (!cleanSubject) throw new UnauthorizedException('第三方用户标识无效')
    const existingIdentity = await this.prisma.externalIdentity.findUnique({ where: { provider_subject: { provider, subject: cleanSubject } }, include: { user: true } })
    if (existingIdentity) {
      if (existingIdentity.user.status !== 'ACTIVE') throw new UnauthorizedException('账号当前不可用')
      await this.prisma.$transaction([
        this.prisma.externalIdentity.update({ where: { id: existingIdentity.id }, data: { email: input.email?.trim().toLowerCase() || existingIdentity.email, displayName: input.displayName?.trim() || existingIdentity.displayName, avatarUrl: input.avatarUrl?.trim() || existingIdentity.avatarUrl, profile: jsonInput(input.profile), lastLoginAt: new Date() } }),
        this.prisma.user.update({ where: { id: existingIdentity.userId }, data: { lastLoginAt: new Date(), avatarUrl: input.avatarUrl?.trim() || existingIdentity.user.avatarUrl } }),
      ])
      return this.createSession(existingIdentity.user, input.meta, provider)
    }
    if (input.requireEmailBind) {
      const ticket = await this.createAuthTicket('external_binding', { provider, subject: cleanSubject, email: input.email?.trim().toLowerCase(), profile: { displayName: input.displayName, avatarUrl: input.avatarUrl, inviteCode: input.inviteCode, raw: input.profile || null } })
      return { bindingRequired: true, provider, ticket, displayName: input.displayName, email: input.email }
    }
    const settings = await this.prisma.systemSetting.upsert({ where: { id: 'global' }, update: {}, create: { id: 'global' } })
    if (!settings.registrationEnabled) throw new BadRequestException('新用户注册当前未开放')
    const email = input.email?.trim().toLowerCase() || null
    const usableEmail = email && !await this.prisma.user.findUnique({ where: { email }, select: { id: true } }) ? email : null
    const defaultGroup = await this.ensureDefaultGroup(settings.defaultUserGroupId)
    const displayName = input.displayName?.trim() || `${provider} 用户`
    const user = await this.prisma.user.create({
      data: {
        email: usableEmail,
        displayName,
        avatarUrl: input.avatarUrl?.trim() || undefined,
        emailVerifiedAt: usableEmail ? new Date() : undefined,
        lastLoginAt: new Date(),
        settings: { create: this.defaultUserSettings(settings) },
        creditAccount: { create: this.defaultCreditAccount(settings) },
        groupMemberships: defaultGroup ? { create: { group: { connect: { id: defaultGroup.id } } } } : undefined,
        externalIdentities: { create: { provider, subject: cleanSubject, email, displayName, avatarUrl: input.avatarUrl?.trim() || undefined, profile: jsonInput(input.profile), lastLoginAt: new Date() } },
      },
    })
    await this.referrals.attributeRegistration(user.id, input.inviteCode, input.meta)
    return this.createSession(user, input.meta, provider)
  }

  async getLinuxDoAuthorization(state: string, codeChallenge: string) {
    const settings = await this.prisma.systemSetting.upsert({ where: { id: 'global' }, update: {}, create: { id: 'global' } })
    if (!settings.linuxDoLoginEnabled || !settings.linuxDoClientId || !settings.encryptedLinuxDoClientSecret || !settings.linuxDoRedirectUrl) throw new BadRequestException('Linux.do 登录尚未完成配置')
    const url = await this.endpointPolicy.assertPublicHttpUrl(settings.linuxDoAuthorizeUrl)
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('client_id', settings.linuxDoClientId)
    url.searchParams.set('redirect_uri', settings.linuxDoRedirectUrl)
    url.searchParams.set('scope', settings.linuxDoScopes || 'user')
    url.searchParams.set('state', state)
    url.searchParams.set('code_challenge', codeChallenge)
    url.searchParams.set('code_challenge_method', 'S256')
    return url.toString()
  }

  async loginWithLinuxDo(code: string, verifier: string, meta: { ip?: string; userAgent?: string }, inviteCode?: string) {
    const settings = await this.prisma.systemSetting.upsert({ where: { id: 'global' }, update: {}, create: { id: 'global' } })
    if (!settings.linuxDoLoginEnabled || !settings.linuxDoClientId || !settings.encryptedLinuxDoClientSecret || !settings.linuxDoRedirectUrl) throw new BadRequestException('Linux.do 登录尚未完成配置')
    const secret = this.crypto.decrypt(settings.encryptedLinuxDoClientSecret)
    const tokenUrl = await this.endpointPolicy.assertPublicHttpUrl(settings.linuxDoTokenUrl)
    const tokenResponse = await fetchPublicNoRedirect(tokenUrl, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, body: new URLSearchParams({ grant_type: 'authorization_code', client_id: settings.linuxDoClientId, client_secret: secret, redirect_uri: settings.linuxDoRedirectUrl, code, code_verifier: verifier }), signal: AbortSignal.timeout(15_000) }).catch(() => null)
    if (!tokenResponse?.ok) throw new UnauthorizedException('Linux.do 授权交换失败')
    const tokenPayload = await tokenResponse.json().catch(() => null) as { access_token?: string } | null
    if (!tokenPayload?.access_token) throw new UnauthorizedException('Linux.do 未返回访问令牌')
    const userInfoUrl = await this.endpointPolicy.assertPublicHttpUrl(settings.linuxDoUserInfoUrl)
    const profileResponse = await fetchPublicNoRedirect(userInfoUrl, { headers: { authorization: `Bearer ${tokenPayload.access_token}`, accept: 'application/json' }, signal: AbortSignal.timeout(15_000) }).catch(() => null)
    if (!profileResponse?.ok) throw new UnauthorizedException('无法读取 Linux.do 用户信息')
    const raw = await profileResponse.json().catch(() => null) as Record<string, unknown> | null
    const profile = (raw?.data && typeof raw.data === 'object' ? raw.data : raw) as Record<string, unknown> | null
    const subject = String(profile?.id || profile?.sub || profile?.username || '')
    if (!subject) throw new UnauthorizedException('Linux.do 用户标识无效')
    if (profile?.active === false || profile?.silenced === true) throw new UnauthorizedException('Linux.do 账号当前不可用')
    const avatar = typeof profile?.avatar_url === 'string'
      ? profile.avatar_url
      : typeof profile?.avatar_template === 'string'
        ? profile.avatar_template.replace('{size}', '96')
        : undefined
    return this.loginExternal('linuxdo', subject, { email: typeof profile?.email === 'string' ? profile.email : undefined, displayName: String(profile?.name || profile?.display_name || profile?.username || 'Linux.do 用户'), avatarUrl: avatar, profile: profile as Record<string, unknown>, meta, requireEmailBind: true, inviteCode })
  }

  async requestExternalBindCode(ticketInput: string, emailInput: string) {
    const ticket = await this.readAuthTicket(ticketInput, 'external_binding')
    const email = emailInput.trim().toLowerCase()
    const settings = await this.prisma.systemSetting.upsert({ where: { id: 'global' }, update: {}, create: { id: 'global' } })
    const existingUser = await this.prisma.user.findUnique({ where: { email }, select: { id: true, status: true } })
    if (!existingUser && !settings.registrationEnabled) throw new BadRequestException('新用户注册当前未开放')
    if (existingUser && existingUser.status !== 'ACTIVE') throw new UnauthorizedException('账号当前不可用')
    if (!existingUser && settings.allowedEmailDomains.length && !settings.allowedEmailDomains.some((item) => item.toLowerCase().replace(/^@/, '') === (email.split('@')[1] || ''))) throw new BadRequestException('该邮箱域名不在注册白名单中')
    const { code, ttl } = await this.issueOtpCode(email, settings.otpTtlMinutes)
    return { sent: true, provider: ticket.provider, exists: Boolean(existingUser), expiresIn: ttl * 60, ...(this.shouldExposeDevCode() ? { developmentCode: code } : {}) }
  }

  async completeExternalBind(input: { ticket: string; email: string; code: string; username?: string; displayName?: string; password?: string }, meta: LoginMeta) {
    const email = input.email.trim().toLowerCase()
    const authTicket = await this.readAuthTicket(input.ticket, 'external_binding')
    const otp = await this.prisma.otpCode.findFirst({ where: { email, consumedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: 'desc' } })
    if (!otp || otp.attempts >= 5) throw new UnauthorizedException('验证码无效或已过期')
    if (otp.codeHash !== hash(input.code, this.config.getOrThrow('SESSION_SECRET'))) {
      await this.prisma.otpCode.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } })
      throw new BadRequestException('验证码错误')
    }
    const settings = await this.prisma.systemSetting.upsert({ where: { id: 'global' }, update: {}, create: { id: 'global' } })
    const profile = authTicket.profile && typeof authTicket.profile === 'object' && !Array.isArray(authTicket.profile)
      ? authTicket.profile as ExternalProfile
      : {}
    const rawProfile = profile.raw && typeof profile.raw === 'object' && !Array.isArray(profile.raw)
      ? profile.raw as ExternalProfile
      : profile
    const displayName = input.displayName?.trim() || String(profile.displayName || rawProfile.name || rawProfile.display_name || rawProfile.username || email.split('@')[0])
    const existingUser = await this.prisma.user.findUnique({ where: { email } })
    if (existingUser && existingUser.status !== 'ACTIVE') throw new UnauthorizedException('账号当前不可用')
    if (!existingUser) {
      if (!settings.registrationEnabled) throw new BadRequestException('新用户注册当前未开放')
      if (!input.password) throw new BadRequestException('新邮箱绑定需要设置登录密码')
    }
    const username = input.username?.trim().toLowerCase()
    if (!existingUser && username && await this.prisma.user.findUnique({ where: { username }, select: { id: true } })) throw new BadRequestException('用户名已经注册')
    const defaultGroup = !existingUser ? await this.ensureDefaultGroup(settings.defaultUserGroupId) : null
    const passwordHash = input.password ? await hashPassword(input.password) : undefined
    let user: User
    try {
      user = await this.prisma.$transaction(async (tx) => {
        await this.claimOtp(tx, otp.id)
        const claimedTicket = await tx.authTicket.updateMany({ where: { id: authTicket.id, consumedAt: null, expiresAt: { gt: new Date() } }, data: { consumedAt: new Date(), email } })
        if (!claimedTicket.count) throw new BadRequestException('登录票据无效或已过期')
        const currentUser = await tx.user.findUnique({ where: { email } })
        if (currentUser && currentUser.status !== 'ACTIVE') throw new UnauthorizedException('账号当前不可用')
        const savedUser = currentUser
          ? await tx.user.update({ where: { id: currentUser.id }, data: { lastLoginAt: new Date(), emailVerifiedAt: currentUser.emailVerifiedAt || new Date(), ...(!currentUser.passwordHash && passwordHash ? { passwordHash } : {}), ...(!currentUser.avatarUrl && typeof profile.avatarUrl === 'string' ? { avatarUrl: profile.avatarUrl } : {}) } })
          : await tx.user.create({ data: { email, username: username || undefined, displayName, avatarUrl: typeof profile.avatarUrl === 'string' ? profile.avatarUrl : undefined, passwordHash: passwordHash!, emailVerifiedAt: new Date(), lastLoginAt: new Date(), settings: { create: this.defaultUserSettings(settings) }, creditAccount: { create: this.defaultCreditAccount(settings) }, groupMemberships: defaultGroup ? { create: { group: { connect: { id: defaultGroup.id } } } } : undefined } })
        await tx.externalIdentity.create({ data: { userId: savedUser.id, provider: authTicket.provider, subject: authTicket.subject, email, displayName, avatarUrl: typeof profile.avatarUrl === 'string' ? profile.avatarUrl : undefined, profile: jsonInput(rawProfile), lastLoginAt: new Date() } })
        return savedUser
      })
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new BadRequestException('该 Linux.do 账号、邮箱或用户名已绑定')
      throw error
    }
    if (!existingUser) await this.referrals.attributeRegistration(user.id, typeof profile.inviteCode === 'string' ? profile.inviteCode : undefined, meta)
    return this.createSession(user, meta, authTicket.provider)
  }

  async verifyCode(emailInput: string, code: string, meta: { ip?: string; userAgent?: string }) {
    const email = emailInput.trim().toLowerCase()
    const settings = await this.prisma.systemSetting.upsert({ where: { id: 'global' }, update: {}, create: { id: 'global' } })
    const existingUser = await this.prisma.user.findUnique({ where: { email }, select: { id: true, status: true } })
    if (existingUser && !settings.emailLoginEnabled) throw new BadRequestException('邮箱登录当前未开放')
    if (!existingUser && !settings.registrationEnabled) throw new BadRequestException('新用户注册当前未开放')
    if (!existingUser && !settings.emailVerifyEnabled) throw new BadRequestException('邮箱验证码注册当前未开放')
    if (existingUser && existingUser.status !== 'ACTIVE') throw new UnauthorizedException('账号当前不可用')
    const otp = await this.prisma.otpCode.findFirst({ where: { email, consumedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: 'desc' } })
    if (!otp || otp.attempts >= 5) throw new UnauthorizedException('验证码无效或已过期')
    if (otp.codeHash !== hash(code, this.config.getOrThrow('SESSION_SECRET'))) {
      await this.prisma.otpCode.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } })
      throw new BadRequestException('验证码错误')
    }
    if (existingUser) {
      const user = await this.prisma.$transaction(async (tx) => {
        await this.claimOtp(tx, otp.id)
        return tx.user.update({ where: { id: existingUser.id }, data: { lastLoginAt: new Date(), emailVerifiedAt: new Date() } })
      })
      return this.createSession(user, meta)
    }
    const ticket = randomBytes(32).toString('base64url')
    await this.prisma.$transaction(async (tx) => {
      await this.claimOtp(tx, otp.id)
      await tx.authTicket.create({ data: { tokenHash: hash(ticket, this.config.getOrThrow('SESSION_SECRET')), kind: 'email_registration', email, expiresAt: new Date(Date.now() + 10 * 60_000) } })
    })
    return { registrationRequired: true, ticket, email }
  }

  async completeEmailRegistration(input: { ticket: string; username: string; displayName?: string; password: string; inviteCode?: string }, meta: LoginMeta) {
    const settings = await this.prisma.systemSetting.upsert({ where: { id: 'global' }, update: {}, create: { id: 'global' } })
    if (!settings.registrationEnabled) throw new BadRequestException('新用户注册当前未开放')
    const ticket = await this.readAuthTicket(input.ticket, 'email_registration')
    const email = ticket.email?.trim().toLowerCase()
    if (!email) throw new BadRequestException('注册票据无效')
    const username = input.username.trim().toLowerCase()
    const existing = await this.prisma.user.findFirst({ where: { OR: [{ email }, { username }] }, select: { id: true } })
    if (existing) throw new BadRequestException('邮箱或用户名已经注册')
    if (settings.allowedEmailDomains.length && !settings.allowedEmailDomains.some((item) => item.toLowerCase().replace(/^@/, '') === (email.split('@')[1] || ''))) throw new BadRequestException('该邮箱域名不在注册白名单中')
    const defaultGroup = await this.ensureDefaultGroup(settings.defaultUserGroupId)
    const passwordHash = await hashPassword(input.password)
    let user: User
    try {
      user = await this.prisma.$transaction(async (tx) => {
        const claimed = await tx.authTicket.updateMany({ where: { id: ticket.id, consumedAt: null, expiresAt: { gt: new Date() } }, data: { consumedAt: new Date() } })
        if (!claimed.count) throw new BadRequestException('注册票据无效或已过期')
        return tx.user.create({ data: { email, username, displayName: input.displayName?.trim() || username, passwordHash, emailVerifiedAt: new Date(), lastLoginAt: new Date(), settings: { create: this.defaultUserSettings(settings) }, creditAccount: { create: this.defaultCreditAccount(settings) }, groupMemberships: defaultGroup ? { create: { group: { connect: { id: defaultGroup.id } } } } : undefined } })
      })
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new BadRequestException('邮箱或用户名已经注册')
      throw error
    }
    await this.referrals.attributeRegistration(user.id, input.inviteCode, meta)
    return this.createSession(user, meta, 'email')
  }

  async loginAdmin(emailInput: string, password: string, meta: { ip?: string; userAgent?: string }) {
    const email = emailInput.trim().toLowerCase()
    const user = await this.prisma.user.findUnique({ where: { email } })
    if (!user?.passwordHash || !['ADMIN', 'SUPER_ADMIN'].includes(user.role) || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('管理员账号或密码错误')
    }
    // IP throttling alone lets a distributed attacker keep guessing one account, so the account
    // itself carries a failure budget as well.
    await this.assertAdminLoginAllowed(user.id)
    if (!await verifyPassword(password, user.passwordHash)) {
      await this.recordAdminLoginAttempt(user.id, ADMIN_LOGIN_FAILED, meta)
      throw new UnauthorizedException('管理员账号或密码错误')
    }
    await this.recordAdminLoginAttempt(user.id, ADMIN_LOGIN_SUCCEEDED, meta)
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
    return this.createSession(user, meta, 'admin-password')
  }

  private adminLoginPolicy() {
    const clamp = (key: string, fallback: number, min: number, max: number) => {
      const parsed = Number(this.config.get(key, fallback))
      return Math.max(min, Math.min(max, Number.isFinite(parsed) && parsed > 0 ? parsed : fallback))
    }
    const baseLockSeconds = clamp('ADMIN_LOGIN_LOCK_SECONDS', 60, 5, 3_600)
    return {
      maxFailures: clamp('ADMIN_LOGIN_MAX_FAILURES', 5, 3, 50),
      windowMs: clamp('ADMIN_LOGIN_FAILURE_WINDOW_MINUTES', 15, 1, 1_440) * 60_000,
      baseLockSeconds,
      maxLockSeconds: Math.max(baseLockSeconds, clamp('ADMIN_LOGIN_MAX_LOCK_SECONDS', 900, 5, 86_400)),
    }
  }

  /** Counts failures since the later of the sliding window start and the last successful login, so
   *  a genuine sign-in resets the budget without erasing audit history. */
  private async adminLoginFailures(userId: string, windowMs: number, limit: number) {
    const windowStart = new Date(Date.now() - windowMs)
    const lastSuccess = await this.prisma.auditLog.findFirst({
      where: { actorId: userId, action: ADMIN_LOGIN_SUCCEEDED, createdAt: { gte: windowStart } },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    })
    const since = lastSuccess ? lastSuccess.createdAt : windowStart
    const failures = await this.prisma.auditLog.findMany({
      where: { actorId: userId, action: ADMIN_LOGIN_FAILED, createdAt: { gt: since } },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { createdAt: true },
    })
    return { count: failures.length, lastFailureAt: failures[0]?.createdAt ?? null }
  }

  private async assertAdminLoginAllowed(userId: string) {
    const policy = this.adminLoginPolicy()
    const { count, lastFailureAt } = await this.adminLoginFailures(userId, policy.windowMs, policy.maxFailures + 16)
    if (count < policy.maxFailures || !lastFailureAt) return
    const lockSeconds = Math.min(policy.maxLockSeconds, policy.baseLockSeconds * 2 ** (count - policy.maxFailures))
    const retryAfterMs = lastFailureAt.getTime() + lockSeconds * 1_000 - Date.now()
    if (retryAfterMs <= 0) return
    throw new HttpException(`管理员账号已因连续登录失败被临时锁定，请在 ${Math.ceil(retryAfterMs / 1_000)} 秒后重试`, HttpStatus.TOO_MANY_REQUESTS)
  }

  private recordAdminLoginAttempt(userId: string, action: string, meta: LoginMeta) {
    return this.prisma.auditLog.create({ data: { actorId: userId, action, targetType: 'admin_security', targetId: userId, ipAddress: meta.ip, userAgent: meta.userAgent } })
  }

  async peekSession(token?: string) {
    if (!token) return null
    const tokenHash = createHash('sha256').update(token).digest('hex')
    const session = await this.prisma.session.findFirst({ where: { tokenHash, revokedAt: null, expiresAt: { gt: new Date() } }, include: { user: true } })
    if (!session || session.user.status !== 'ACTIVE') return null
    return { id: session.user.id, email: session.user.email, username: session.user.username, displayName: session.user.displayName, authMethod: session.authMethod, role: session.user.role, adminRoleId: session.user.adminRoleId }
  }

  async updateAdminAccount(userId: string, sessionId: string, input: { currentPassword: string; email?: string; newPassword?: string }, meta: LoginMeta) {
    const user = await this.adminUser(userId)
    if (!user.passwordHash || !await verifyPassword(input.currentPassword, user.passwordHash)) throw new UnauthorizedException('当前管理员密码错误')
    const email = input.email?.trim().toLowerCase() || undefined
    const newPassword = input.newPassword?.trim() || undefined
    if (!email && !newPassword) throw new BadRequestException('请至少填写新的邮箱或密码')
    if (email && email !== user.email) {
      const duplicate = await this.prisma.user.findUnique({ where: { email }, select: { id: true } })
      if (duplicate && duplicate.id !== user.id) throw new BadRequestException('该邮箱已经被其他账户使用')
    }
    const passwordHash = newPassword ? await hashPassword(newPassword) : undefined
    const updated = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.user.update({
        where: { id: user.id },
        data: {
          ...(email && email !== user.email ? { email, emailVerifiedAt: new Date() } : {}),
          ...(passwordHash ? { passwordHash } : {})
        },
        select: { id: true, email: true, username: true, displayName: true, role: true, avatarUrl: true }
      })
      await tx.session.updateMany({ where: { userId: user.id, id: { not: sessionId }, revokedAt: null }, data: { revokedAt: new Date() } })
      return saved
    })
    await this.securityAudit(user.id, 'admin.account.updated', meta)
    return { user: { id: updated.id, email: updated.email, username: updated.username, displayName: updated.displayName, role: updated.role, avatarUrl: updated.avatarUrl } }
  }

  private async adminUser(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user || !['ADMIN', 'SUPER_ADMIN'].includes(user.role) || user.status !== 'ACTIVE') throw new UnauthorizedException('需要管理员账户')
    return user
  }

  private securityAudit(actorId: string, action: string, meta: LoginMeta) {
    return this.prisma.auditLog.create({ data: { actorId, action, targetType: 'admin_security', targetId: actorId, ipAddress: meta.ip, userAgent: meta.userAgent } })
  }

  private async createSession(user: { id: string; email: string | null; username?: string | null; displayName: string; role: string }, meta: { ip?: string; userAgent?: string }, authMethod = 'email') {
    const rawToken = randomBytes(32).toString('base64url')
    const expiresAt = new Date(Date.now() + this.config.get<number>('SESSION_TTL_DAYS', 30) * 86_400_000)
    await this.prisma.session.create({ data: { userId: user.id, tokenHash: createHash('sha256').update(rawToken).digest('hex'), ipAddress: meta.ip, userAgent: meta.userAgent, authMethod, expiresAt } })
    return { user: { id: user.id, email: user.email, username: user.username || null, displayName: user.displayName, role: user.role }, token: rawToken, expiresAt }
  }

  async revoke(sessionId: string) { await this.prisma.session.update({ where: { id: sessionId }, data: { revokedAt: new Date() } }).catch(() => undefined) }

  private async issueOtpCode(email: string, configuredTtl: number) {
    const recent = await this.prisma.otpCode.count({ where: { email, createdAt: { gt: new Date(Date.now() - 10 * 60_000) } } })
    if (recent >= 5) throw new HttpException('验证码发送过于频繁', HttpStatus.TOO_MANY_REQUESTS)
    const code = randomInt(100000, 999999).toString()
    const ttl = configuredTtl || this.config.get<number>('OTP_TTL_MINUTES', 10)
    await this.prisma.otpCode.create({ data: { email, codeHash: hash(code, this.config.getOrThrow('SESSION_SECRET')), expiresAt: new Date(Date.now() + ttl * 60_000) } })
    await this.emailService.sendLoginCode(email, code, ttl)
    return { code, ttl }
  }

  private async claimOtp(tx: Prisma.TransactionClient, otpId: string) {
    const claimed = await tx.otpCode.updateMany({ where: { id: otpId, consumedAt: null, expiresAt: { gt: new Date() }, attempts: { lt: 5 } }, data: { consumedAt: new Date() } })
    if (!claimed.count) throw new UnauthorizedException('验证码无效或已过期')
  }

  private defaultUserSettings(settings: { defaultTheme: string; defaultLanguage: string; defaultChatHistoryEnabled: boolean; defaultTrainingOptOut: boolean; defaultShareUsageAnalytics: boolean }) {
    return {
      appearance: settings.defaultTheme,
      language: settings.defaultLanguage,
      chatHistoryEnabled: settings.defaultChatHistoryEnabled,
      trainingOptOut: settings.defaultTrainingOptOut,
      shareUsageAnalytics: settings.defaultShareUsageAnalytics,
      onboarded: false,
    }
  }

  private defaultCreditAccount(settings: { defaultUserCredits: number }) {
    return {
      balance: settings.defaultUserCredits,
      entries: { create: { type: LedgerType.GRANT, amount: settings.defaultUserCredits, balanceAfter: settings.defaultUserCredits, description: '新用户创作点' } },
    }
  }

  private async createAuthTicket(kind: string, input: { provider?: string; subject?: string; email?: string; profile?: Record<string, unknown> | null }) {
    const raw = randomBytes(32).toString('base64url')
    await this.prisma.authTicket.create({
      data: {
        tokenHash: hash(raw, this.config.getOrThrow('SESSION_SECRET')),
        kind,
        provider: input.provider || '',
        subject: input.subject || '',
        email: input.email || undefined,
        profile: jsonInput(input.profile),
        expiresAt: new Date(Date.now() + 10 * 60_000),
      },
    })
    return raw
  }

  private async readAuthTicket(raw: string, kind: string) {
    const ticket = await this.prisma.authTicket.findFirst({ where: { tokenHash: hash(raw, this.config.getOrThrow('SESSION_SECRET')), kind, consumedAt: null, expiresAt: { gt: new Date() } } })
    if (!ticket) throw new BadRequestException('登录票据无效或已过期')
    return ticket
  }

  private async ensureDefaultGroup(configuredId: string) {
    let group = configuredId ? await this.prisma.userGroup.findFirst({ where: { id: configuredId, enabled: true }, select: { id: true } }) : null
    if (!group) group = await this.prisma.userGroup.upsert({ where: { name: '默认用户' }, update: { enabled: true }, create: { name: '默认用户', description: '所有新注册用户的基础权限与计费策略', color: '#397157', enabled: true }, select: { id: true } })
    if (configuredId !== group.id) await this.prisma.systemSetting.update({ where: { id: 'global' }, data: { defaultUserGroupId: group.id } })
    return group
  }
}
