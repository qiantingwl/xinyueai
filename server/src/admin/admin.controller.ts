import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, StreamableFile, UseGuards } from '@nestjs/common'
import { AssetKind, JobKind, JobStatus, Prisma } from '@prisma/client'
import type { FastifyRequest } from 'fastify'
import { ArrayMaxSize, IsArray, IsEmail, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator'
import { assetDisposition, AssetsService } from '../assets/assets.service'
import { AuthGuard } from '../auth/auth.guard'
import { CurrentUser, AuthenticatedUser } from '../common/request-user'
import { CreditsService } from '../credits/credits.service'
import { PrismaService } from '../prisma/prisma.service'
import { AdminGuard } from './admin.guard'
import { AdminOverviewService } from './admin-overview.service'
import { AdminHealthService } from './admin-health.service'

class AdjustCreditsDto { @IsInt() @Min(-100000) @Max(100000) amount!: number; @IsString() @MinLength(2) reason!: string }
class StatusDto { @IsIn(['ACTIVE', 'SUSPENDED']) status!: 'ACTIVE' | 'SUSPENDED' }
class UpdateUserProfileDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) displayName?: string
  @IsOptional() @IsEmail() @MaxLength(320) email?: string
  @IsOptional() @IsString() @MaxLength(120) company?: string
  @IsOptional() @IsString() @MaxLength(40) phone?: string
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) tags?: string[]
  @IsOptional() @IsString() @MaxLength(4000) adminNote?: string
}
class ReplaceUserGroupsDto { @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) groupIds!: string[] }
class MigrateAssetsDto { @IsOptional() @IsInt() @Min(1) @Max(100) limit?: number }

@Controller('admin')
@UseGuards(AuthGuard, AdminGuard)
export class AdminController {
  constructor(private readonly prisma: PrismaService, private readonly credits: CreditsService, private readonly assets: AssetsService, private readonly overviewService: AdminOverviewService, private readonly healthService: AdminHealthService) {}

  @Get('overview')
  overview() {
    return this.overviewService.getOverview()
  }

  @Get('health/summary')
  healthSummary() { return this.healthService.summary() }

  @Get('users')
  async users(@Query('q') query?: string, @Query('status') status?: 'ACTIVE' | 'SUSPENDED', @Query('groupId') groupId?: string) {
    return this.prisma.user.findMany({
      where: {
        role: 'USER',
        status: status || undefined,
        groupMemberships: groupId ? { some: { groupId } } : undefined,
        ...(query ? { OR: [{ username: { contains: query, mode: 'insensitive' as const } }, { email: { contains: query, mode: 'insensitive' as const } }, { displayName: { contains: query, mode: 'insensitive' as const } }, { company: { contains: query, mode: 'insensitive' as const } }] } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: { id: true, username: true, email: true, displayName: true, avatarUrl: true, company: true, phone: true, tags: true, status: true, createdAt: true, lastLoginAt: true, creditAccount: { select: { balance: true } }, groupMemberships: { include: { group: { select: { id: true, name: true, color: true } } } }, subscriptions: { where: { status: { in: ['ACTIVE', 'TRIALING'] } }, orderBy: { createdAt: 'desc' }, take: 1, include: { plan: { select: { id: true, code: true, name: true } } } }, _count: { select: { assets: true, jobs: true, projects: true } } },
    })
  }

  @Get('usage-report')
  async usageReport(@Query('days') rawDays?: string, @Query('kind') rawKind?: JobKind) {
    const days = [7, 30, 90].includes(Number(rawDays)) ? Number(rawDays) : 30
    const kind = rawKind && Object.values(JobKind).includes(rawKind) ? rawKind : undefined
    const since = new Date(Date.now() - days * 86_400_000)
    const jobs = await this.prisma.generationJob.findMany({
      where: { status: 'SUCCEEDED', completedAt: { gte: since }, kind },
      orderBy: { completedAt: 'desc' },
      take: 10000,
      select: { id: true, kind: true, model: true, provider: true, creditCost: true, revenueMicros: true, upstreamCostMicros: true, inputTokens: true, outputTokens: true, cachedInputTokens: true, reasoningTokens: true, completedAt: true, providerChannel: { select: { id: true, name: true } }, user: { select: { id: true, displayName: true, email: true } }, _count: { select: { outputs: true } } },
    })
    type Aggregate = { key: string; label: string; jobs: number; credits: number; revenueMicros: number; costMicros: number; inputTokens: number; outputTokens: number; cachedInputTokens: number; reasoningTokens: number; outputs: number }
    const modelMap = new Map<string, Aggregate>()
    const providerMap = new Map<string, Aggregate>()
    const daily = Array.from({ length: days }, (_, index) => {
      const date = new Date(); date.setUTCHours(0, 0, 0, 0); date.setUTCDate(date.getUTCDate() - (days - 1 - index))
      return { date: date.toISOString().slice(0, 10), jobs: 0, credits: 0, revenueMicros: 0, costMicros: 0 }
    })
    const dailyMap = new Map(daily.map((item) => [item.date, item]))
    const add = (map: Map<string, Aggregate>, key: string, label: string, job: typeof jobs[number]) => {
      const row = map.get(key) || { key, label, jobs: 0, credits: 0, revenueMicros: 0, costMicros: 0, inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, reasoningTokens: 0, outputs: 0 }
      row.jobs += 1; row.credits += job.creditCost; row.revenueMicros += job.revenueMicros; row.costMicros += job.upstreamCostMicros; row.inputTokens += job.inputTokens; row.outputTokens += job.outputTokens; row.cachedInputTokens += job.cachedInputTokens; row.reasoningTokens += job.reasoningTokens; row.outputs += job._count.outputs
      map.set(key, row)
    }
    for (const job of jobs) {
      add(modelMap, `${job.kind}:${job.model}`, job.model, job)
      const providerKey = job.providerChannel?.id || job.provider
      add(providerMap, providerKey, job.providerChannel?.name || (job.provider.startsWith('user:') ? '用户 BYOK' : job.provider.startsWith('demo:') ? '演示模式' : '环境变量渠道'), job)
      const day = job.completedAt ? dailyMap.get(job.completedAt.toISOString().slice(0, 10)) : null
      if (day) { day.jobs += 1; day.credits += job.creditCost; day.revenueMicros += job.revenueMicros; day.costMicros += job.upstreamCostMicros }
    }
    const revenueMicros = jobs.reduce((total, job) => total + job.revenueMicros, 0)
    const costMicros = jobs.reduce((total, job) => total + job.upstreamCostMicros, 0)
    const withMargin = (row: Aggregate) => ({ ...row, marginMicros: row.revenueMicros - row.costMicros, marginRate: row.revenueMicros ? Math.round((row.revenueMicros - row.costMicros) / row.revenueMicros * 10000) / 100 : null })
    return {
      days,
      truncated: jobs.length === 10000,
      summary: { jobs: jobs.length, credits: jobs.reduce((total, job) => total + job.creditCost, 0), revenueMicros, costMicros, marginMicros: revenueMicros - costMicros, marginRate: revenueMicros ? Math.round((revenueMicros - costMicros) / revenueMicros * 10000) / 100 : null, inputTokens: jobs.reduce((total, job) => total + job.inputTokens, 0), outputTokens: jobs.reduce((total, job) => total + job.outputTokens, 0), cachedInputTokens: jobs.reduce((total, job) => total + job.cachedInputTokens, 0), reasoningTokens: jobs.reduce((total, job) => total + job.reasoningTokens, 0), outputs: jobs.reduce((total, job) => total + job._count.outputs, 0) },
      daily,
      models: [...modelMap.values()].map(withMargin).sort((a, b) => b.revenueMicros - a.revenueMicros),
      providers: [...providerMap.values()].map(withMargin).sort((a, b) => b.costMicros - a.costMicros),
      recent: jobs.slice(0, 100).map((job) => ({ ...job, outputs: job._count.outputs, _count: undefined })),
    }
  }

  @Get('users/:id')
  async userDetail(@Param('id') userId: string) {
    const [user, spent, storage, jobKinds] = await Promise.all([
      this.prisma.user.findFirst({
        where: { id: userId, role: 'USER' },
        include: {
          settings: true,
          creditAccount: { include: { entries: { orderBy: { createdAt: 'desc' }, take: 30 } } },
          groupMemberships: { include: { group: true }, orderBy: { assignedAt: 'desc' } },
          subscriptions: { include: { plan: true }, orderBy: { createdAt: 'desc' }, take: 20 },
          subscriptionOrders: { include: { plan: { select: { id: true, name: true } } }, orderBy: { createdAt: 'desc' }, take: 20 },
          rechargeOrders: { include: { package: { select: { id: true, name: true } } }, orderBy: { createdAt: 'desc' }, take: 20 },
          jobs: { orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, kind: true, status: true, model: true, prompt: true, creditCost: true, errorMessage: true, createdAt: true } },
          sessions: { orderBy: { createdAt: 'desc' }, take: 12, select: { id: true, ipAddress: true, userAgent: true, createdAt: true, expiresAt: true, revokedAt: true } },
          _count: { select: { assets: true, jobs: true, projects: true, conversations: true, apiCredentials: true } },
        },
      }),
      this.prisma.creditLedger.aggregate({ where: { account: { userId }, type: 'SPEND' }, _sum: { amount: true } }),
      this.prisma.asset.aggregate({ where: { userId, deletedAt: null }, _sum: { size: true } }),
      this.prisma.generationJob.groupBy({ by: ['kind'], where: { userId }, _count: { _all: true }, _sum: { creditCost: true } }),
    ])
    if (!user) throw new BadRequestException('用户不存在')
    return { ...user, usage: { creditsSpent: Math.abs(spent._sum.amount || 0), storageBytes: Number(storage._sum.size || 0), jobsByKind: jobKinds.map((row) => ({ kind: row.kind, count: row._count._all, credits: row._sum.creditCost || 0 })) } }
  }

  @Patch('users/:id/profile')
  async updateUserProfile(@CurrentUser() admin: AuthenticatedUser, @Req() request: FastifyRequest, @Param('id') userId: string, @Body() body: UpdateUserProfileDto) {
    const before = await this.prisma.user.findFirst({ where: { id: userId, role: 'USER' }, select: { displayName: true, email: true, company: true, phone: true, tags: true, adminNote: true } })
    if (!before) throw new BadRequestException('用户不存在')
    const data = {
      ...(body.displayName === undefined ? {} : { displayName: body.displayName.trim() }),
      ...(body.email === undefined ? {} : { email: body.email.trim().toLowerCase() }),
      ...(body.company === undefined ? {} : { company: body.company.trim() }),
      ...(body.phone === undefined ? {} : { phone: body.phone.trim() }),
      ...(body.tags === undefined ? {} : { tags: [...new Set(body.tags.map((tag) => tag.trim()).filter(Boolean))] }),
      ...(body.adminNote === undefined ? {} : { adminNote: body.adminNote.trim() }),
    }
    try {
      const after = await this.prisma.user.update({ where: { id: userId }, data, select: { id: true, displayName: true, email: true, company: true, phone: true, tags: true, adminNote: true } })
      await this.audit(admin.id, request, 'user.profile.update', 'user', userId, before, after)
      return after
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new BadRequestException('该邮箱已绑定其他账户')
      throw error
    }
  }

  @Patch('users/:id/groups')
  async replaceUserGroups(@CurrentUser() admin: AuthenticatedUser, @Req() request: FastifyRequest, @Param('id') userId: string, @Body() body: ReplaceUserGroupsDto) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, role: 'USER' }, select: { id: true } })
    if (!user) throw new BadRequestException('用户不存在')
    const before = await this.prisma.userGroupMember.findMany({ where: { userId }, select: { groupId: true } })
    let groups = await this.prisma.userGroup.findMany({ where: { id: { in: [...new Set(body.groupIds)] }, enabled: true }, select: { id: true } })
    if (!groups.length) {
      const settings = await this.prisma.systemSetting.upsert({ where: { id: 'global' }, update: {}, create: { id: 'global' } })
      const fallback = settings.defaultUserGroupId ? await this.prisma.userGroup.findFirst({ where: { id: settings.defaultUserGroupId, enabled: true }, select: { id: true } }) : null
      if (fallback) groups = [fallback]
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.userGroupMember.deleteMany({ where: { userId } })
      if (groups.length) await tx.userGroupMember.createMany({ data: groups.map((group) => ({ userId, groupId: group.id })) })
    })
    await this.audit(admin.id, request, 'user.groups.update', 'user', userId, before, { groupIds: groups.map((group) => group.id) })
    return { groupIds: groups.map((group) => group.id) }
  }

  @Post('users/:id/revoke-sessions')
  async revokeUserSessions(@CurrentUser() admin: AuthenticatedUser, @Req() request: FastifyRequest, @Param('id') userId: string) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, role: 'USER' }, select: { id: true } })
    if (!user) throw new BadRequestException('用户不存在')
    const result = await this.prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } })
    await this.audit(admin.id, request, 'user.sessions.revoke', 'user', userId, undefined, { count: result.count })
    return { revoked: result.count }
  }

  @Get('jobs')
  jobs(@Query('status') status?: JobStatus) {
    if (status && !Object.values(JobStatus).includes(status)) throw new BadRequestException('任务状态无效')
    return this.prisma.generationJob.findMany({ where: { status }, orderBy: { createdAt: 'desc' }, take: 200, include: { user: { select: { email: true, displayName: true } }, outputs: { select: { assetId: true } }, usageRecords: true, providerAttempts: { orderBy: { startedAt: 'asc' }, take: 20 }, billingTransactions: { orderBy: { createdAt: 'asc' }, take: 20 } } })
  }

  @Get('assets')
  async listAssets(@Query('q') query?: string, @Query('kind') kind?: AssetKind) {
    if (kind && !Object.values(AssetKind).includes(kind)) throw new BadRequestException('文件类型无效')
    const rows = await this.prisma.asset.findMany({
      where: { deletedAt: null, kind, name: query ? { contains: query, mode: 'insensitive' } : undefined },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { user: { select: { email: true, displayName: true } }, project: { select: { name: true } } },
    })
    return rows.map((asset) => ({ ...asset, size: Number(asset.size), contentUrl: `/v1/admin/assets/${asset.id}/content` }))
  }

  @Get('assets/:id/content')
  async assetContent(@Param('id') id: string) {
    const result = await this.assets.streamForAdmin(id)
    return new StreamableFile(result.stream, { type: result.mimeType, disposition: assetDisposition(result.mimeType, result.name), length: result.size || undefined })
  }

  @Delete('assets/:id')
  async removeAsset(@CurrentUser() admin: AuthenticatedUser, @Req() request: FastifyRequest, @Param('id') id: string) {
    const before = await this.prisma.asset.findUnique({ where: { id }, select: { name: true, objectKey: true, userId: true } })
    const result = await this.assets.removeAsAdmin(id)
    await this.audit(admin.id, request, 'asset.delete', 'asset', id, before, { deleted: true })
    return result
  }

  @Get('logins')
  logins() {
    return this.prisma.session.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: { id: true, ipAddress: true, userAgent: true, createdAt: true, expiresAt: true, revokedAt: true, user: { select: { id: true, email: true, displayName: true, role: true } } },
    })
  }

  @Get('audits')
  audits() {
    return this.prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 200, include: { actor: { select: { email: true, displayName: true } } } })
  }

  @Get('system')
  system() { return this.healthService.summary() }

  @Get('storage/migration')
  storageMigration() { return this.assets.migrationStatus() }

  @Post('storage/migration')
  async migrateStorage(@CurrentUser() admin: AuthenticatedUser, @Req() request: FastifyRequest, @Body() body: MigrateAssetsDto) {
    const result = await this.assets.migrateToActive(body.limit || 25)
    await this.audit(admin.id, request, 'storage.migrate.batch', 'storage', `${result.target.driver}:${result.target.bucket}`, undefined, { attempted: result.attempted, migrated: result.migrated, failed: result.failed.length, warnings: result.warnings.length })
    return result
  }

  @Get('storage/lifecycle')
  storageLifecycle() { return this.assets.lifecycleStatus() }

  @Post('storage/lifecycle')
  async applyStorageLifecycle(@CurrentUser() admin: AuthenticatedUser, @Req() request: FastifyRequest) {
    const result = await this.assets.applyLifecycle()
    await this.audit(admin.id, request, 'storage.lifecycle.apply', 'storage', result.driver === 's3' ? result.bucket : result.driver, undefined, result)
    return result
  }

  @Post('users/:id/credits')
  async adjust(@CurrentUser() admin: AuthenticatedUser, @Req() request: FastifyRequest, @Param('id') userId: string, @Body() body: AdjustCreditsDto) {
    const entry = await this.credits.mutate(userId, body.amount, 'ADJUST', body.reason, `admin:${admin.id}:${Date.now()}`)
    await this.audit(admin.id, request, 'credits.adjust', 'user', userId, undefined, { amount: body.amount, reason: body.reason, ledgerId: entry.id })
    return entry
  }

  @Patch('users/:id/status')
  async status(@CurrentUser() admin: AuthenticatedUser, @Req() request: FastifyRequest, @Param('id') userId: string, @Body() body: StatusDto) {
    const before = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { status: true, role: true } })
    if (before.role !== 'USER') throw new BadRequestException('不能在此修改管理员状态')
    const user = await this.prisma.user.update({ where: { id: userId }, data: { status: body.status } })
    if (body.status === 'SUSPENDED') await this.prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } })
    await this.audit(admin.id, request, 'user.status', 'user', userId, before, { status: body.status })
    return user
  }

  private async audit(actorId: string, request: FastifyRequest, action: string, targetType: string, targetId?: string, before?: unknown, after?: unknown) {
    await this.prisma.auditLog.create({ data: { actorId, action, targetType, targetId, ipAddress: request.ip, userAgent: request.headers['user-agent'], before: before as Prisma.InputJsonValue | undefined, after: after as Prisma.InputJsonValue | undefined } })
  }
}
