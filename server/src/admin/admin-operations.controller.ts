import { BadRequestException, Body, ConflictException, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common'
import { LedgerType, NotificationChannel, Prisma, TokenLedgerType } from '@prisma/client'
import { ArrayMaxSize, IsArray, IsBoolean, IsHexColor, IsIn, IsInt, IsISO8601, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator'
import { createHash, randomBytes } from 'node:crypto'
import type { FastifyRequest } from 'fastify'
import { AuthGuard } from '../auth/auth.guard'
import { CurrentUser, AuthenticatedUser } from '../common/request-user'
import { CreditsService } from '../credits/credits.service'
import { GenerationsService } from '../generations/generations.service'
import { PrismaService } from '../prisma/prisma.service'
import { NotificationsService } from '../notifications/notifications.service'
import { AdminGuard } from './admin.guard'
import { BillingReconciliationService } from './billing-reconciliation.service'

class CreateGroupDto {
  @IsString() @MinLength(1) @MaxLength(40) name!: string
  @IsOptional() @IsString() @MaxLength(500) description?: string
  @IsOptional() @IsHexColor() color?: string
}
class UpdateGroupDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(40) name?: string
  @IsOptional() @IsString() @MaxLength(500) description?: string
  @IsOptional() @IsHexColor() color?: string
  @IsOptional() @IsBoolean() enabled?: boolean
}
class GroupPolicyDto {
  @IsBoolean() restrictModels!: boolean
  @IsInt() @Min(0) @Max(1000) creditRatePercent!: number
  @IsBoolean() allowUserByok!: boolean
  @IsArray() @ArrayMaxSize(500) @IsString({ each: true }) modelPresetIds!: string[]
}
class MemberIdsDto { @IsArray() @ArrayMaxSize(200) @IsString({ each: true }) userIds!: string[] }
class BulkStatusDto extends MemberIdsDto { @IsIn(['ACTIVE', 'SUSPENDED']) status!: 'ACTIVE' | 'SUSPENDED' }
class BulkCreditsDto extends MemberIdsDto { @IsInt() @Min(-100000) @Max(100000) amount!: number; @IsString() @MinLength(2) @MaxLength(200) reason!: string }
class CreateCodeDto {
  @IsString() @MinLength(1) @MaxLength(80) name!: string
  @IsOptional() @IsString() @MinLength(4) @MaxLength(64) code?: string
  @IsInt() @Min(1) @Max(100000) credits!: number
  @IsInt() @Min(1) @Max(100000) maxUses!: number
  @IsOptional() @IsISO8601() expiresAt?: string
}
class CodeStatusDto { @IsBoolean() enabled!: boolean }
class AnnouncementDto {
  @IsString() @MinLength(1) @MaxLength(100) title!: string
  @IsString() @MinLength(1) @MaxLength(2000) body!: string
  @IsOptional() @IsString() groupId?: string
  @IsOptional() @IsArray() @ArrayMaxSize(3) @IsIn(Object.values(NotificationChannel), { each: true }) channels?: NotificationChannel[]
}

@Controller('admin')
@UseGuards(AuthGuard, AdminGuard)
export class AdminOperationsController {
  constructor(private readonly prisma: PrismaService, private readonly credits: CreditsService, private readonly generations: GenerationsService, private readonly notifications: NotificationsService, private readonly billingReconciliation: BillingReconciliationService) {}

  @Get('groups')
  async groups() {
    const defaultGroup = await this.ensureDefaultGroup(true)
    const groups = await this.prisma.userGroup.findMany({ orderBy: [{ createdAt: 'asc' }, { name: 'asc' }], include: { _count: { select: { members: true, campaigns: true, modelAccess: true } }, modelAccess: { select: { modelPresetId: true, flatCreditCostOverride: true } }, members: { take: 5, orderBy: { assignedAt: 'desc' }, include: { user: { select: { id: true, email: true, displayName: true, status: true } } } } } })
    return groups.map((group) => ({ ...group, isDefault: group.id === defaultGroup.id }))
  }

  @Post('groups')
  async createGroup(@CurrentUser() admin: AuthenticatedUser, @Req() request: FastifyRequest, @Body() body: CreateGroupDto) {
    try {
      const group = await this.prisma.userGroup.create({ data: { name: body.name.trim(), description: body.description?.trim() || '', color: body.color || '#2563eb' } })
      await this.audit(admin.id, request, 'group.create', 'group', group.id, undefined, { name: group.name })
      return group
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('分组名称已存在')
      throw error
    }
  }

  @Patch('groups/:id')
  async updateGroup(@CurrentUser() admin: AuthenticatedUser, @Req() request: FastifyRequest, @Param('id') id: string, @Body() body: UpdateGroupDto) {
    const before = await this.prisma.userGroup.findUniqueOrThrow({ where: { id } })
    const settings = await this.prisma.systemSetting.upsert({ where: { id: 'global' }, update: {}, create: { id: 'global' } })
    if (settings.defaultUserGroupId === id && body.enabled === false) throw new BadRequestException('默认用户分组不能停用，请先设置其他默认分组')
    try {
      const group = await this.prisma.userGroup.update({ where: { id }, data: { ...body, name: body.name?.trim(), description: body.description?.trim() } })
      await this.audit(admin.id, request, 'group.update', 'group', id, before, group)
      return group
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('分组名称已存在')
      throw error
    }
  }

  @Delete('groups/:id')
  async deleteGroup(@CurrentUser() admin: AuthenticatedUser, @Req() request: FastifyRequest, @Param('id') id: string) {
    const settings = await this.prisma.systemSetting.upsert({ where: { id: 'global' }, update: {}, create: { id: 'global' } })
    if (settings.defaultUserGroupId === id) throw new BadRequestException('默认用户分组不能删除，请先设置其他默认分组')
    const group = await this.prisma.userGroup.delete({ where: { id } })
    await this.audit(admin.id, request, 'group.delete', 'group', id, group, { deleted: true })
    return { deleted: true }
  }

  @Post('groups/:id/default')
  async setDefaultGroup(@CurrentUser() admin: AuthenticatedUser, @Req() request: FastifyRequest, @Param('id') id: string) {
    const group = await this.prisma.userGroup.findFirst({ where: { id, enabled: true } })
    if (!group) throw new BadRequestException('只能将已启用的分组设为默认分组')
    const before = await this.prisma.systemSetting.upsert({ where: { id: 'global' }, update: {}, create: { id: 'global' } })
    const users = await this.prisma.user.findMany({ where: { role: 'USER', groupMemberships: { none: {} } }, select: { id: true } })
    // 切换默认分组和回填存量用户必须同生共死，否则会出现「默认分组已切换但存量用户无分组」
    await this.prisma.$transaction(async (tx) => {
      await tx.systemSetting.update({ where: { id: 'global' }, data: { defaultUserGroupId: group.id } })
      if (users.length) await tx.userGroupMember.createMany({ data: users.map((user) => ({ groupId: group.id, userId: user.id })), skipDuplicates: true })
    })
    await this.audit(admin.id, request, 'group.default.update', 'group', group.id, { defaultUserGroupId: before.defaultUserGroupId }, { defaultUserGroupId: group.id, assignedUsers: users.length })
    return { id: group.id, name: group.name, assignedUsers: users.length }
  }

  @Get('groups/:id/policy')
  async groupPolicy(@Param('id') id: string) {
    const group = await this.prisma.userGroup.findUnique({ where: { id }, include: { modelAccess: { include: { modelPreset: { select: { id: true, key: true, displayName: true, capability: true, enabled: true } } } } } })
    if (!group) throw new BadRequestException('用户分组不存在')
    return group
  }

  @Patch('groups/:id/policy')
  async updateGroupPolicy(@CurrentUser() admin: AuthenticatedUser, @Req() request: FastifyRequest, @Param('id') id: string, @Body() body: GroupPolicyDto) {
    const before = await this.prisma.userGroup.findUnique({ where: { id }, include: { modelAccess: true } })
    if (!before) throw new BadRequestException('用户分组不存在')
    const validModels = await this.prisma.modelPreset.findMany({ where: { id: { in: body.modelPresetIds } }, select: { id: true } })
    const modelPresetIds = [...new Set(validModels.map((item) => item.id))]
    await this.prisma.$transaction(async (tx) => {
      await tx.userGroup.update({ where: { id }, data: { restrictModels: body.restrictModels, creditRatePercent: body.creditRatePercent, allowUserByok: body.allowUserByok } })
      await tx.userGroupModelAccess.deleteMany({ where: { groupId: id } })
      if (modelPresetIds.length) await tx.userGroupModelAccess.createMany({ data: modelPresetIds.map((modelPresetId) => ({ groupId: id, modelPresetId })) })
    })
    const after = await this.prisma.userGroup.findUniqueOrThrow({ where: { id }, include: { modelAccess: true } })
    await this.audit(admin.id, request, 'group.policy.update', 'group', id, before, after)
    return after
  }

  @Get('groups/:id/members')
  async groupMembers(@Param('id') id: string, @Query('q') query?: string) {
    return this.prisma.userGroupMember.findMany({ where: { groupId: id, user: query ? { OR: [{ email: { contains: query, mode: 'insensitive' } }, { displayName: { contains: query, mode: 'insensitive' } }] } : undefined }, orderBy: { assignedAt: 'desc' }, include: { user: { select: { id: true, email: true, displayName: true, status: true, createdAt: true, creditAccount: { select: { balance: true } } } } } })
  }

  @Post('groups/:id/members')
  async addMembers(@CurrentUser() admin: AuthenticatedUser, @Req() request: FastifyRequest, @Param('id') groupId: string, @Body() body: MemberIdsDto) {
    await this.prisma.userGroup.findUniqueOrThrow({ where: { id: groupId } })
    const users = await this.prisma.user.findMany({ where: { id: { in: body.userIds }, role: 'USER' }, select: { id: true } })
    const result = await this.prisma.userGroupMember.createMany({ data: users.map((user) => ({ groupId, userId: user.id })), skipDuplicates: true })
    await this.audit(admin.id, request, 'group.members.add', 'group', groupId, undefined, { userIds: users.map((user) => user.id), count: result.count })
    return { added: result.count }
  }

  @Delete('groups/:id/members/:userId')
  async removeMember(@CurrentUser() admin: AuthenticatedUser, @Req() request: FastifyRequest, @Param('id') groupId: string, @Param('userId') userId: string) {
    const [settings, membershipCount] = await Promise.all([
      this.prisma.systemSetting.upsert({ where: { id: 'global' }, update: {}, create: { id: 'global' } }),
      this.prisma.userGroupMember.count({ where: { userId } }),
    ])
    if (settings.defaultUserGroupId === groupId && membershipCount <= 1) throw new BadRequestException('用户至少需要保留一个分组，不能移出默认分组')
    await this.prisma.userGroupMember.deleteMany({ where: { groupId, userId } })
    await this.audit(admin.id, request, 'group.members.remove', 'group', groupId, undefined, { userId })
    return { removed: true }
  }

  @Post('users/bulk/status')
  async bulkStatus(@CurrentUser() admin: AuthenticatedUser, @Req() request: FastifyRequest, @Body() body: BulkStatusDto) {
    const result = await this.prisma.user.updateMany({ where: { id: { in: body.userIds }, role: 'USER' }, data: { status: body.status } })
    if (body.status === 'SUSPENDED') await this.prisma.session.updateMany({ where: { userId: { in: body.userIds }, revokedAt: null }, data: { revokedAt: new Date() } })
    await this.audit(admin.id, request, 'users.bulk.status', 'user', undefined, undefined, { userIds: body.userIds, status: body.status, count: result.count })
    return { updated: result.count }
  }

  private async ensureDefaultGroup(assignExistingUsers = false) {
    const settings = await this.prisma.systemSetting.upsert({ where: { id: 'global' }, update: {}, create: { id: 'global' } })
    // 分组兜底、启用、写默认设置、回填成员是一套半初始化敏感操作，整体包进事务
    return this.prisma.$transaction(async (tx) => {
      let group = settings.defaultUserGroupId ? await tx.userGroup.findUnique({ where: { id: settings.defaultUserGroupId } }) : null
      if (!group) group = await tx.userGroup.upsert({ where: { name: '默认用户' }, update: { enabled: true }, create: { name: '默认用户', description: '所有新注册用户的基础权限与计费策略', color: '#397157', enabled: true } })
      if (!group.enabled) group = await tx.userGroup.update({ where: { id: group.id }, data: { enabled: true } })
      if (settings.defaultUserGroupId !== group.id) await tx.systemSetting.update({ where: { id: 'global' }, data: { defaultUserGroupId: group.id } })
      if (assignExistingUsers) {
        const users = await tx.user.findMany({ where: { role: 'USER', groupMemberships: { none: {} } }, select: { id: true } })
        if (users.length) {
          const groupId = group.id
          await tx.userGroupMember.createMany({ data: users.map((user) => ({ groupId, userId: user.id })), skipDuplicates: true })
        }
      }
      return group
    })
  }

  @Post('users/bulk/credits')
  async bulkCredits(@CurrentUser() admin: AuthenticatedUser, @Req() request: FastifyRequest, @Body() body: BulkCreditsDto) {
    const users = await this.prisma.user.findMany({ where: { id: { in: body.userIds }, role: 'USER' }, select: { id: true } })
    // 每人一次 Serializable 事务，量级必须有上限；逐人失败不再中断其余用户
    if (users.length > 1000) throw new BadRequestException('单次批量调整最多 1000 个用户，请分批操作')
    let updated = 0
    const failed: Array<{ userId: string; reason: string }> = []
    for (const user of users) {
      try {
        await this.credits.mutate(user.id, body.amount, 'ADJUST', body.reason, `admin-bulk:${admin.id}:${user.id}:${Date.now()}`)
        updated += 1
      } catch (reason) {
        failed.push({ userId: user.id, reason: reason instanceof Error ? reason.message : '调整失败' })
      }
    }
    await this.audit(admin.id, request, 'users.bulk.credits', 'user', undefined, undefined, { userIds: users.map((user) => user.id), amount: body.amount, reason: body.reason, count: updated, failedCount: failed.length })
    return { updated, failed }
  }

  @Get('credits/ledger')
  ledger(@Query('type') type?: LedgerType, @Query('q') query?: string) {
    if (type && !Object.values(LedgerType).includes(type)) throw new BadRequestException('流水类型无效')
    return this.prisma.creditLedger.findMany({ where: { type, account: { user: query ? { OR: [{ email: { contains: query, mode: 'insensitive' } }, { displayName: { contains: query, mode: 'insensitive' } }] } : undefined } }, orderBy: { createdAt: 'desc' }, take: 300, include: { account: { select: { user: { select: { id: true, email: true, displayName: true } } } } } })
  }

  @Get('finance/margins')
  async margins(@Query('days') rawDays?: string) {
    const days = Math.min(365, Math.max(1, Number(rawDays || 30) || 30))
    const since = new Date(Date.now() - days * 86_400_000)
    const [totals, groups] = await Promise.all([
      this.prisma.generationJob.aggregate({ where: { status: 'SUCCEEDED', completedAt: { gte: since } }, _count: { _all: true }, _sum: { revenueMicros: true, upstreamCostMicros: true, creditCost: true, inputTokens: true, outputTokens: true, cachedInputTokens: true, reasoningTokens: true } }),
      this.prisma.generationJob.groupBy({ by: ['kind', 'model', 'provider'], where: { status: 'SUCCEEDED', completedAt: { gte: since } }, _count: { _all: true }, _sum: { revenueMicros: true, upstreamCostMicros: true, creditCost: true, inputTokens: true, outputTokens: true, cachedInputTokens: true, reasoningTokens: true }, orderBy: { _sum: { revenueMicros: 'desc' } }, take: 200 }),
    ])
    const summarize = (row: { _count: { _all: number }; _sum: { revenueMicros: number | null; upstreamCostMicros: number | null; creditCost: number | null; inputTokens: number | null; outputTokens: number | null; cachedInputTokens: number | null; reasoningTokens: number | null } }) => {
      const revenueMicros = Number(row._sum.revenueMicros || 0), upstreamCostMicros = Number(row._sum.upstreamCostMicros || 0)
      const marginMicros = revenueMicros - upstreamCostMicros
      return { jobs: row._count._all, revenueMicros, upstreamCostMicros, marginMicros, marginPercent: revenueMicros > 0 ? Number((marginMicros * 100 / revenueMicros).toFixed(2)) : null, creditCost: Number(row._sum.creditCost || 0), inputTokens: Number(row._sum.inputTokens || 0), outputTokens: Number(row._sum.outputTokens || 0), cachedInputTokens: Number(row._sum.cachedInputTokens || 0), reasoningTokens: Number(row._sum.reasoningTokens || 0) }
    }
    return { days, since, totals: summarize(totals), groups: groups.map((row) => ({ kind: row.kind, model: row.model, provider: row.provider, ...summarize(row) })) }
  }

  @Get('finance/reconciliation')
  reconciliation(@Query('days') rawDays?: string) {
    return this.billingReconciliation.report(rawDays)
  }

  @Get('token-billing/quotas')
  tokenQuotas(@Query('q') query?: string, @Query('scope') scope?: string) {
    const limit = Math.min(500, Math.max(1, Number(query && /^\d+$/.test(query) ? query : 200)))
    const search = query && !/^\d+$/.test(query) ? query.trim() : undefined
    return this.prisma.userTokenQuota.findMany({
      where: { scopeKey: scope ? { startsWith: scope } : undefined, user: search ? { OR: [{ email: { contains: search, mode: 'insensitive' } }, { displayName: { contains: search, mode: 'insensitive' } }] } : undefined },
      orderBy: { updatedAt: 'desc' }, take: limit,
      include: { user: { select: { id: true, email: true, displayName: true } }, subscription: { select: { id: true, plan: { select: { code: true, name: true } } } } },
    })
  }

  @Get('token-billing/ledger')
  tokenLedger(@Query('q') query?: string, @Query('type') type?: string) {
    const limit = Math.min(500, Math.max(1, Number(query && /^\d+$/.test(query) ? query : 200)))
    const search = query && !/^\d+$/.test(query) ? query.trim() : undefined
    const validTypes = ['RESERVE', 'CHARGE', 'RELEASE', 'REFUND', 'ADJUST']
    return this.prisma.tokenUsageLedger.findMany({
      where: { type: type && validTypes.includes(type) ? type as TokenLedgerType : undefined, user: search ? { OR: [{ email: { contains: search, mode: 'insensitive' } }, { displayName: { contains: search, mode: 'insensitive' } }] } : undefined },
      orderBy: { createdAt: 'desc' }, take: limit,
      include: { user: { select: { id: true, email: true, displayName: true } }, generation: { select: { id: true, kind: true, status: true, settlementStatus: true, requestId: true, traceId: true } } },
    })
  }

  @Get('redemption-codes')
  redemptionCodes() {
    return this.prisma.redemptionCode.findMany({ orderBy: { createdAt: 'desc' }, take: 200, select: { id: true, name: true, codePrefix: true, credits: true, maxUses: true, usedCount: true, expiresAt: true, disabledAt: true, createdAt: true } })
  }

  @Post('redemption-codes')
  async createRedemptionCode(@CurrentUser() admin: AuthenticatedUser, @Req() request: FastifyRequest, @Body() body: CreateCodeDto) {
    const plainCode = (body.code?.trim() || `FLUX-${randomBytes(6).toString('hex')}`).toUpperCase()
    const codeHash = createHash('sha256').update(plainCode).digest('hex')
    try {
      const code = await this.prisma.redemptionCode.create({ data: { name: body.name.trim(), codePrefix: plainCode.slice(0, 8), codeHash, credits: body.credits, maxUses: body.maxUses, expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined } })
      await this.audit(admin.id, request, 'redemption.create', 'redemption', code.id, undefined, { name: code.name, credits: code.credits, maxUses: code.maxUses })
      return { ...code, codeHash: undefined, plainCode }
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('兑换码已存在')
      throw error
    }
  }

  @Patch('redemption-codes/:id/status')
  async redemptionStatus(@CurrentUser() admin: AuthenticatedUser, @Req() request: FastifyRequest, @Param('id') id: string, @Body() body: CodeStatusDto) {
    const code = await this.prisma.redemptionCode.update({ where: { id }, data: { disabledAt: body.enabled ? null : new Date() } })
    await this.audit(admin.id, request, 'redemption.status', 'redemption', id, undefined, { enabled: body.enabled })
    return code
  }

  @Get('announcements')
  announcements() {
    return this.prisma.announcementCampaign.findMany({ orderBy: { createdAt: 'desc' }, take: 100, include: { targetGroup: { select: { id: true, name: true, color: true } } } })
  }

  @Post('announcements')
  async createAnnouncement(@CurrentUser() admin: AuthenticatedUser, @Req() request: FastifyRequest, @Body() body: AnnouncementDto) {
    if (body.groupId) await this.prisma.userGroup.findUniqueOrThrow({ where: { id: body.groupId } })
    const users = await this.prisma.user.findMany({ where: { role: 'USER', status: 'ACTIVE', groupMemberships: body.groupId ? { some: { groupId: body.groupId } } : undefined }, select: { id: true } })
    const campaign = await this.prisma.announcementCampaign.create({ data: { title: body.title.trim(), body: body.body.trim(), targetGroupId: body.groupId, recipientCount: users.length, createdById: admin.id } })
    const delivery = await this.notifications.sendCustomToUsers(users.map((user) => user.id), body.title.trim(), body.body.trim(), body.channels?.length ? body.channels : [NotificationChannel.IN_APP], { campaignId: campaign.id, templateKey: 'announcement' })
    await this.audit(admin.id, request, 'announcement.send', 'announcement', campaign.id, undefined, { groupId: body.groupId || null, recipients: users.length })
    return { ...campaign, delivery }
  }

  @Post('jobs/:id/cancel')
  async cancelJob(@CurrentUser() admin: AuthenticatedUser, @Req() request: FastifyRequest, @Param('id') id: string) {
    const job = await this.prisma.generationJob.findUniqueOrThrow({ where: { id } })
    const result = await this.generations.cancel(job.userId, id)
    await this.audit(admin.id, request, 'job.cancel', 'job', id, { status: job.status }, { status: result.status })
    return result
  }

  @Post('jobs/:id/retry')
  async retryJob(@CurrentUser() admin: AuthenticatedUser, @Req() request: FastifyRequest, @Param('id') id: string) {
    const job = await this.prisma.generationJob.findUniqueOrThrow({ where: { id } })
    if (!['FAILED', 'CANCELLED'].includes(job.status)) throw new BadRequestException('只有失败或已取消任务可以重试')
    const result = await this.generations.create(job.userId, { kind: job.kind, prompt: job.prompt, model: job.model, projectId: job.projectId || undefined, conversationId: job.conversationId || undefined, options: job.options as Record<string, unknown> })
    await this.audit(admin.id, request, 'job.retry', 'job', id, { status: job.status }, { newJobId: result.id })
    return result
  }

  private async audit(actorId: string, request: FastifyRequest, action: string, targetType: string, targetId?: string, before?: unknown, after?: unknown) {
    await this.prisma.auditLog.create({ data: { actorId, action, targetType, targetId, ipAddress: request.ip, userAgent: request.headers['user-agent'], before: before as Prisma.InputJsonValue | undefined, after: after as Prisma.InputJsonValue | undefined } })
  }
}
