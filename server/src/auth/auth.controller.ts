import { BadRequestException, Body, ConflictException, Controller, Get, HttpCode, Patch, Post, Query, Req, Res, UseGuards } from '@nestjs/common'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { IsBoolean, IsEmail, IsOptional, IsString, Length, Matches, MaxLength, MinLength } from 'class-validator'
import { Throttle } from '@nestjs/throttler'
import { ConfigService } from '@nestjs/config'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { AuthService } from './auth.service'
import { AuthGuard } from './auth.guard'
import { CurrentUser, AuthenticatedUser, type AuthenticatedRequest } from '../common/request-user'
import { Public } from './public.decorator'

class RequestCodeDto { @IsEmail() email!: string }
class VerifyCodeDto { @IsEmail() email!: string; @IsString() @Length(6, 6) code!: string }
class CompleteEmailRegistrationDto {
  @IsString() @MinLength(20) @MaxLength(200) ticket!: string
  @IsString() @Matches(/^[a-zA-Z0-9][a-zA-Z0-9_.-]{2,31}$/) username!: string
  @IsOptional() @IsString() @MaxLength(100) displayName?: string
  @IsString() @MinLength(8) @MaxLength(200) password!: string
  @IsOptional() @IsString() @MaxLength(64) inviteCode?: string
}
class AdminLoginDto { @IsEmail() email!: string; @IsString() @MinLength(8) password!: string; @IsOptional() @IsBoolean() remember?: boolean }
class SetupAdminDto { @IsEmail() email!: string; @IsString() @MinLength(8) @MaxLength(200) password!: string; @IsOptional() @IsString() @MaxLength(100) displayName?: string }
class AdminAccountUpdateDto {
  @IsString() @MinLength(8) @MaxLength(200) currentPassword!: string
  @IsOptional() @IsEmail() @MaxLength(320) email?: string
  @IsOptional() @IsString() @MinLength(8) @MaxLength(200) newPassword?: string
}
class PasswordLoginDto { @IsString() @MinLength(3) @MaxLength(320) identifier!: string; @IsString() @MinLength(8) @MaxLength(200) password!: string }
class PasswordRegisterDto {
  @IsString() @Matches(/^[a-zA-Z0-9][a-zA-Z0-9_.-]{2,31}$/) username!: string
  @IsOptional() @IsEmail() @MaxLength(320) email?: string
  @IsOptional() @IsString() @MaxLength(100) displayName?: string
  @IsString() @MinLength(8) @MaxLength(200) password!: string
  @IsOptional() @IsString() @MaxLength(64) inviteCode?: string
}
class ExternalBindCodeDto { @IsString() @MinLength(20) @MaxLength(200) ticket!: string; @IsEmail() email!: string }
class ExternalBindCompleteDto {
  @IsString() @MinLength(20) @MaxLength(200) ticket!: string
  @IsEmail() email!: string
  @IsString() @Length(6, 6) code!: string
  @IsOptional() @IsString() @Matches(/^[a-zA-Z0-9][a-zA-Z0-9_.-]{2,31}$/) username?: string
  @IsOptional() @IsString() @MaxLength(100) displayName?: string
  @IsOptional() @IsString() @MinLength(8) @MaxLength(200) password?: string
}

@Public()
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService, private readonly config: ConfigService) {}
  private cookieSecure() {
    return this.config.get<boolean>('COOKIE_SECURE') ?? process.env.NODE_ENV === 'production'
  }
  private setSessionCookie(response: FastifyReply, result: { token: string; expiresAt: Date }, persistent = true) {
    response.setCookie('flux_session', result.token, { httpOnly: true, secure: this.cookieSecure(), sameSite: 'lax', path: '/', ...(persistent ? { expires: result.expiresAt } : {}) })
  }
  @Post('code/request') @Throttle({ default: { limit: 5, ttl: 60_000 } }) requestCode(@Body() body: RequestCodeDto) { return this.auth.requestCode(body.email) }
  @Post('code/verify') @Throttle({ default: { limit: 10, ttl: 60_000 } }) async verify(@Body() body: VerifyCodeDto, @Req() request: FastifyRequest, @Res({ passthrough: true }) response: FastifyReply) {
    const result = await this.auth.verifyCode(body.email, body.code, { ip: request.ip, userAgent: request.headers['user-agent'] })
    if ('token' in result) {
      this.setSessionCookie(response, result)
      return { user: result.user }
    }
    return result
  }
  @Post('code/register') @Throttle({ default: { limit: 6, ttl: 60_000 } }) async completeEmailRegistration(@Body() body: CompleteEmailRegistrationDto, @Req() request: FastifyRequest, @Res({ passthrough: true }) response: FastifyReply) {
    const result = await this.auth.completeEmailRegistration(body, { ip: request.ip, userAgent: request.headers['user-agent'] })
    this.setSessionCookie(response, result)
    return { user: result.user }
  }
  @Post('password/login') @Throttle({ default: { limit: 10, ttl: 60_000 } }) async passwordLogin(@Body() body: PasswordLoginDto, @Req() request: FastifyRequest, @Res({ passthrough: true }) response: FastifyReply) {
    const result = await this.auth.loginWithPassword(body.identifier, body.password, { ip: request.ip, userAgent: request.headers['user-agent'] })
    this.setSessionCookie(response, result)
    return { user: result.user }
  }
  @Post('password/register') @Throttle({ default: { limit: 6, ttl: 60_000 } }) async passwordRegister(@Body() body: PasswordRegisterDto, @Req() request: FastifyRequest, @Res({ passthrough: true }) response: FastifyReply) {
    const result = await this.auth.registerWithPassword(body, { ip: request.ip, userAgent: request.headers['user-agent'] })
    this.setSessionCookie(response, result)
    return { user: result.user }
  }
  @Post('external/bind/code') @Throttle({ default: { limit: 5, ttl: 60_000 } }) externalBindCode(@Body() body: ExternalBindCodeDto) { return this.auth.requestExternalBindCode(body.ticket, body.email) }
  @Post('external/bind/complete') @Throttle({ default: { limit: 8, ttl: 60_000 } }) async externalBindComplete(@Body() body: ExternalBindCompleteDto, @Req() request: FastifyRequest, @Res({ passthrough: true }) response: FastifyReply) {
    const result = await this.auth.completeExternalBind(body, { ip: request.ip, userAgent: request.headers['user-agent'] })
    this.setSessionCookie(response, result)
    return { user: result.user }
  }
  @Get('oauth/linuxdo/start') async linuxDoStart(@Query('redirect') redirect: string | undefined, @Query('invite') invite: string | undefined, @Res() response: FastifyReply) {
    const state = randomBytes(24).toString('base64url')
    const verifier = randomBytes(48).toString('base64url')
    const challenge = createHash('sha256').update(verifier).digest('base64url')
    const secure = this.cookieSecure()
    response.setCookie('xinyue_linuxdo_state', state, { httpOnly: true, secure, sameSite: 'lax', path: '/v1/auth/oauth/linuxdo', maxAge: 600 })
    response.setCookie('xinyue_linuxdo_verifier', verifier, { httpOnly: true, secure, sameSite: 'lax', path: '/v1/auth/oauth/linuxdo', maxAge: 600 })
    response.setCookie('xinyue_oauth_redirect', this.safeRedirect(redirect), { httpOnly: true, secure, sameSite: 'lax', path: '/v1/auth/oauth/linuxdo', maxAge: 600 })
    const inviteCode = typeof invite === 'string' && /^[A-Z0-9_-]{4,64}$/i.test(invite.trim()) ? invite.trim().toUpperCase() : ''
    if (inviteCode) response.setCookie('xinyue_referral_code', inviteCode, { httpOnly: true, secure, sameSite: 'lax', path: '/v1/auth/oauth/linuxdo', maxAge: 600 })
    response.redirect(await this.auth.getLinuxDoAuthorization(state, challenge))
  }
  @Get('oauth/linuxdo/callback') async linuxDoCallback(@Query('code') code: string | undefined, @Query('state') state: string | undefined, @Req() request: FastifyRequest, @Res() response: FastifyReply) {
    const expected = String(request.cookies?.xinyue_linuxdo_state || '')
    const verifier = String(request.cookies?.xinyue_linuxdo_verifier || '')
    if (!code || !state || !expected || !verifier || !this.safeEqual(state, expected)) throw new BadRequestException('Linux.do 登录状态无效或已过期')
    const result = await this.auth.loginWithLinuxDo(code, verifier, { ip: request.ip, userAgent: request.headers['user-agent'] }, String(request.cookies?.xinyue_referral_code || '')) as { user: { id: string; email: string | null; username: string | null; displayName: string; role: string }; token: string; expiresAt: Date } | { bindingRequired: true; provider: string; ticket: string; displayName?: string; email?: string }
    response.clearCookie('xinyue_linuxdo_state', { path: '/v1/auth/oauth/linuxdo' })
    response.clearCookie('xinyue_linuxdo_verifier', { path: '/v1/auth/oauth/linuxdo' })
    const redirect = this.safeRedirect(request.cookies?.xinyue_oauth_redirect)
    response.clearCookie('xinyue_oauth_redirect', { path: '/v1/auth/oauth/linuxdo' })
    response.clearCookie('xinyue_referral_code', { path: '/v1/auth/oauth/linuxdo' })
    const frontendOrigin = (this.config.get<string>('WEB_ORIGIN') || 'http://localhost:5173').split(',')[0].trim().replace(/\/$/, '')
    if ('bindingRequired' in result) return response.redirect(`${frontendOrigin}/login?bind=${encodeURIComponent(result.provider)}&ticket=${encodeURIComponent(result.ticket)}&redirect=${encodeURIComponent(redirect)}`)
    this.setSessionCookie(response, result)
    response.redirect(`${frontendOrigin}${redirect}`)
  }
  @Post('admin/login') @Throttle({ default: { limit: () => Number(process.env.ADMIN_LOGIN_RATE_LIMIT || (process.env.NODE_ENV === 'production' ? 8 : 30)), ttl: 60_000 } }) async adminLogin(@Body() body: AdminLoginDto, @Req() request: FastifyRequest, @Res({ passthrough: true }) response: FastifyReply) {
    const result = await this.auth.loginAdmin(body.email, body.password, { ip: request.ip, userAgent: request.headers['user-agent'] })
    this.setSessionCookie(response, result, body.remember !== false)
    return { user: result.user }
  }
  @Get('setup/status') async setupStatus() { return { required: await this.auth.isSetupRequired() } }
  @Post('setup') @Throttle({ default: { limit: 3, ttl: 60_000 } }) async setup(@Body() body: SetupAdminDto, @Req() request: FastifyRequest, @Res({ passthrough: true }) response: FastifyReply) {
    const installToken = request.headers['x-install-token']
    const result = await this.auth.setupAdmin(body, { ip: request.ip, userAgent: request.headers['user-agent'] }, Array.isArray(installToken) ? installToken[0] : installToken)
    this.setSessionCookie(response, result)
    return { user: result.user }
  }
  @Get('session') async session(@Req() request: FastifyRequest) { return { user: await this.auth.peekSession(request.cookies?.flux_session as string | undefined) } }
  @Patch('admin/account') @UseGuards(AuthGuard) async updateAdminAccount(@CurrentUser() user: AuthenticatedUser, @Req() request: AuthenticatedRequest, @Body() body: AdminAccountUpdateDto) {
    return this.auth.updateAdminAccount(user.id, request.sessionId, body, { ip: request.ip, userAgent: request.headers['user-agent'] })
  }
  @Get('me') @UseGuards(AuthGuard) me(@CurrentUser() user: AuthenticatedUser) { return user }
  @Post('logout') @HttpCode(204) @UseGuards(AuthGuard) async logout(@Req() request: AuthenticatedRequest, @Res({ passthrough: true }) response: FastifyReply) { await this.auth.revoke(request.sessionId); response.clearCookie('flux_session', { path: '/' }) }

  private safeRedirect(value?: string) { return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : '/chat' }
  private safeEqual(left: string, right: string) { const a = Buffer.from(left); const b = Buffer.from(right); return a.length === b.length && timingSafeEqual(a, b) }
}
