import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { NotificationType, Prisma } from '@prisma/client'
import { createHash, randomBytes } from 'node:crypto'
import { PrismaService } from '../prisma/prisma.service'
import { EmailService } from '../auth/email.service'

const memberUser = { id: true, email: true, displayName: true, avatarUrl: true } as const
const teamInclude = {
  members: { orderBy: { joinedAt: 'asc' as const }, include: { user: { select: memberUser } } },
  invitations: { where: { status: 'PENDING' }, orderBy: { createdAt: 'desc' as const }, select: { id: true, email: true, role: true, status: true, expiresAt: true, createdAt: true } },
  creditAccount: { select: { balance: true, updatedAt: true } },
  _count: { select: { members: true, projects: true, assets: true, knowledgeBases: true } },
} as const

type TeamInput = { name: string; description?: string; seatLimit?: number }
type InvitationInput = { email: string; role?: string }

@Injectable()
export class TeamService {
  constructor(private readonly prisma: PrismaService, private readonly email: EmailService, private readonly config: ConfigService) {}

  private hashToken(token: string) { return createHash('sha256').update(token).digest('hex') }

  // Seat capacity is derived from a COUNT, so every decision that consumes or frees a seat must
  // hold this row lock for the whole transaction. Concurrent callers block here instead of reading
  // a stale count and oversubscribing `seatLimit`.
  private lockTeamSeats(tx: Prisma.TransactionClient, teamId: string) {
    return tx.$queryRaw`SELECT id FROM "Team" WHERE id = ${teamId} FOR UPDATE`
  }

  private audit(teamId: string, actorId: string | null, action: string, targetType = '', targetId = '', metadata?: Record<string, unknown>) {
    return this.prisma.teamAuditLog.create({ data: { teamId, actorId, action, targetType, targetId, metadata: metadata as Prisma.InputJsonValue | undefined } })
  }

  private async manager(teamId: string, userId: string, ownerOnly = false) {
    const team = await this.prisma.team.findUnique({ where: { id: teamId }, include: { members: { where: { userId }, select: { role: true } } } })
    if (!team || team.status !== 'ACTIVE') throw new NotFoundException('团队不存在或已停用')
    const role = team.ownerId === userId ? 'OWNER' : team.members[0]?.role
    if (!role || (ownerOnly ? role !== 'OWNER' : !['OWNER', 'ADMIN'].includes(role))) throw new ForbiddenException(ownerOnly ? '只有团队所有者可以执行此操作' : '只有团队管理员可以执行此操作')
    return { team, role }
  }

  async list(userId: string) {
    const rows = await this.prisma.team.findMany({ where: { status: 'ACTIVE', members: { some: { userId } } }, orderBy: { updatedAt: 'desc' }, include: teamInclude })
    const periodStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1))
    return rows.map((team) => ({ ...team, members: team.members.map((member) => ({ ...member, creditsUsed: member.creditPeriodStart >= periodStart ? member.creditsUsed : 0 })) }))
  }

  async create(userId: string, input: TeamInput) {
    const slug = `${input.name.trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-').replace(/^-|-$/g, '').slice(0, 54) || 'team'}-${randomBytes(4).toString('hex')}`
    const team = await this.prisma.team.create({ data: { ownerId: userId, name: input.name.trim(), slug, description: input.description?.trim() || '', seatLimit: input.seatLimit ?? 5, members: { create: { userId, role: 'OWNER' } }, creditAccount: { create: {} } }, include: teamInclude })
    await this.audit(team.id, userId, 'team.created', 'team', team.id, { name: team.name, seatLimit: team.seatLimit })
    return team
  }

  async update(teamId: string, userId: string, input: TeamInput) {
    const { team } = await this.manager(teamId, userId, true)
    const seatLimit = input.seatLimit ?? team.seatLimit
    const updated = await this.prisma.$transaction(async (tx) => {
      await this.lockTeamSeats(tx, teamId)
      const occupied = await tx.teamMember.count({ where: { teamId } })
      if (seatLimit < occupied) throw new BadRequestException(`席位数不能少于当前成员数 ${occupied}`)
      return tx.team.update({ where: { id: teamId }, data: { name: input.name.trim(), description: input.description?.trim() || '', seatLimit }, include: teamInclude })
    })
    await this.audit(teamId, userId, 'team.updated', 'team', teamId, { name: updated.name, seatLimit: updated.seatLimit })
    return updated
  }

  async invite(teamId: string, userId: string, input: InvitationInput) {
    const { team, role: actorRole } = await this.manager(teamId, userId)
    const email = input.email.trim().toLowerCase()
    const role = input.role === 'ADMIN' ? 'ADMIN' : 'MEMBER'
    if (role === 'ADMIN' && actorRole !== 'OWNER') throw new ForbiddenException('只有团队所有者可以邀请管理员')
    const existingUser = await this.prisma.user.findUnique({ where: { email }, select: { id: true } })
    const token = randomBytes(32).toString('base64url')
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    const invitation = await this.prisma.$transaction(async (tx) => {
      await this.lockTeamSeats(tx, teamId)
      const current = await tx.team.findUnique({ where: { id: teamId }, select: { seatLimit: true, status: true } })
      if (!current || current.status !== 'ACTIVE') throw new NotFoundException('团队不存在或已停用')
      if (existingUser && await tx.teamMember.count({ where: { teamId, userId: existingUser.id } })) throw new BadRequestException('该用户已是团队成员')
      const members = await tx.teamMember.count({ where: { teamId } })
      const pendingOthers = await tx.teamInvitation.count({ where: { teamId, status: 'PENDING', expiresAt: { gt: new Date() }, email: { not: email } } })
      if (members + pendingOthers >= current.seatLimit) throw new BadRequestException(`团队席位已满（${current.seatLimit} 席）`)
      return tx.teamInvitation.upsert({
        where: { teamId_email: { teamId, email } },
        create: { teamId, email, role, tokenHash: this.hashToken(token), invitedById: userId, expiresAt },
        update: { role, tokenHash: this.hashToken(token), status: 'PENDING', invitedById: userId, acceptedById: null, acceptedAt: null, expiresAt },
        select: { id: true, email: true, role: true, status: true, expiresAt: true },
      })
    })
    const acceptPath = `/chat?teamInviteToken=${encodeURIComponent(token)}&settings=teams`
    const acceptUrl = new URL(acceptPath, this.config.get<string>('WEB_ORIGIN') || 'http://localhost:5173').toString()
    if (existingUser) await this.prisma.notification.create({ data: { userId: existingUser.id, type: NotificationType.SYSTEM, title: `团队邀请：${team.name}`, body: `你被邀请以${role === 'ADMIN' ? '管理员' : '成员'}身份加入团队`, metadata: { teamId, invitationId: invitation.id, acceptPath } as Prisma.InputJsonValue } })
    const inviter = await this.prisma.user.findUnique({ where: { id: userId }, select: { displayName: true } })
    const emailSent = await this.email.sendTeamInvitation(email, team.name, inviter?.displayName || '团队管理员', acceptUrl).catch(() => false)
    await this.audit(teamId, userId, 'invitation.created', 'invitation', invitation.id, { email, role, expiresAt: expiresAt.toISOString() })
    return { ...invitation, acceptPath, acceptUrl, emailSent }
  }

  pendingInvitations(email: string | null) {
    if (!email) return []
    return this.prisma.teamInvitation.findMany({ where: { email: email.toLowerCase(), status: 'PENDING', expiresAt: { gt: new Date() }, team: { status: 'ACTIVE' } }, orderBy: { createdAt: 'desc' }, select: { id: true, role: true, expiresAt: true, createdAt: true, team: { select: { id: true, name: true, slug: true, owner: { select: { displayName: true } } } } } })
  }

  async accept(token: string, user: { id: string; email: string | null }) {
    if (!user.email) throw new BadRequestException('请先绑定邮箱后再接受团队邀请')
    const invitation = await this.prisma.teamInvitation.findUnique({ where: { tokenHash: this.hashToken(token) }, include: { team: true } })
    return this.completeAcceptance(invitation, user)
  }

  async acceptPending(id: string, user: { id: string; email: string | null }) {
    if (!user.email) throw new BadRequestException('请先绑定邮箱后再接受团队邀请')
    const invitation = await this.prisma.teamInvitation.findUnique({ where: { id }, include: { team: true } })
    return this.completeAcceptance(invitation, user)
  }

  private async completeAcceptance(invitation: Prisma.TeamInvitationGetPayload<{ include: { team: true } }> | null, user: { id: string; email: string | null }) {
    if (!user.email) throw new BadRequestException('请先绑定邮箱后再接受团队邀请')
    if (!invitation || invitation.status !== 'PENDING') throw new NotFoundException('邀请不存在或已处理')
    if (invitation.expiresAt.getTime() <= Date.now()) {
      await this.prisma.teamInvitation.update({ where: { id: invitation.id }, data: { status: 'EXPIRED' } })
      throw new BadRequestException('邀请已过期，请联系团队管理员重新邀请')
    }
    if (invitation.email !== user.email.toLowerCase()) throw new ForbiddenException('当前登录邮箱与受邀邮箱不一致')

    await this.prisma.$transaction(async (tx) => {
      await this.lockTeamSeats(tx, invitation.teamId)
      const currentInvite = await tx.teamInvitation.findUnique({ where: { id: invitation.id }, include: { team: true } })
      if (!currentInvite || currentInvite.status !== 'PENDING') throw new ConflictException('邀请已被处理或已失效')
      if (currentInvite.expiresAt.getTime() <= Date.now()) {
        await tx.teamInvitation.update({ where: { id: currentInvite.id }, data: { status: 'EXPIRED' } })
        throw new BadRequestException('邀请已过期，请联系团队管理员重新邀请')
      }
      const isAlreadyMember = await tx.teamMember.count({ where: { teamId: currentInvite.teamId, userId: user.id } })
      const currentMembers = await tx.teamMember.count({ where: { teamId: currentInvite.teamId } })
      if (!isAlreadyMember && currentMembers >= currentInvite.team.seatLimit) {
        throw new BadRequestException('团队席位已满，请联系团队所有者扩容')
      }
      await tx.teamMember.upsert({
        where: { teamId_userId: { teamId: currentInvite.teamId, userId: user.id } },
        create: { teamId: currentInvite.teamId, userId: user.id, role: currentInvite.role },
        update: { role: currentInvite.role },
      })
      await tx.teamInvitation.update({
        where: { id: currentInvite.id },
        data: { status: 'ACCEPTED', acceptedById: user.id, acceptedAt: new Date() },
      })
    })

    await this.audit(invitation.teamId, user.id, 'invitation.accepted', 'invitation', invitation.id, { role: invitation.role })
    return { accepted: true, teamId: invitation.teamId, teamName: invitation.team.name }
  }

  async cancelInvitation(teamId: string, invitationId: string, userId: string) {
    await this.manager(teamId, userId)
    const result = await this.prisma.teamInvitation.updateMany({ where: { id: invitationId, teamId, status: 'PENDING' }, data: { status: 'CANCELLED' } })
    if (!result.count) throw new NotFoundException('待接受邀请不存在')
    await this.audit(teamId, userId, 'invitation.cancelled', 'invitation', invitationId)
    return { cancelled: true }
  }

  async updateRole(teamId: string, targetUserId: string, userId: string, role: string) {
    const { role: actorRole } = await this.manager(teamId, userId)
    const member = await this.prisma.teamMember.findUnique({ where: { teamId_userId: { teamId, userId: targetUserId } } })
    if (!member) throw new NotFoundException('团队成员不存在')
    if (member.role === 'OWNER') throw new BadRequestException('不能修改所有者角色')
    if (actorRole !== 'OWNER' && (member.role === 'ADMIN' || role === 'ADMIN')) throw new ForbiddenException('只有所有者可以管理管理员角色')
    const updated = await this.prisma.teamMember.update({ where: { teamId_userId: { teamId, userId: targetUserId } }, data: { role } })
    await this.audit(teamId, userId, 'member.role_updated', 'user', targetUserId, { before: member.role, after: role })
    return updated
  }

  async updateBilling(teamId: string, userId: string, enabled: boolean) {
    await this.manager(teamId, userId, true)
    const team = await this.prisma.team.update({ where: { id: teamId }, data: { billingEnabled: enabled }, include: teamInclude })
    await this.audit(teamId, userId, enabled ? 'billing.enabled' : 'billing.disabled', 'team', teamId)
    return team
  }

  async updateMemberQuota(teamId: string, targetUserId: string, userId: string, monthlyCreditLimit: number | null) {
    const { role: actorRole } = await this.manager(teamId, userId)
    const member = await this.prisma.teamMember.findUnique({ where: { teamId_userId: { teamId, userId: targetUserId } } })
    if (!member) throw new NotFoundException('团队成员不存在')
    if (member.role === 'OWNER' && actorRole !== 'OWNER') throw new ForbiddenException('只有团队所有者可以修改所有者额度')
    const updated = await this.prisma.teamMember.update({ where: { teamId_userId: { teamId, userId: targetUserId } }, data: { monthlyCreditLimit } })
    await this.audit(teamId, userId, 'member.quota_updated', 'user', targetUserId, { before: member.monthlyCreditLimit, after: monthlyCreditLimit })
    return updated
  }

  async removeMember(teamId: string, targetUserId: string, userId: string) {
    const { role: actorRole } = await this.manager(teamId, userId)
    const member = await this.prisma.teamMember.findUnique({ where: { teamId_userId: { teamId, userId: targetUserId } } })
    if (!member) throw new NotFoundException('团队成员不存在')
    if (member.role === 'OWNER') throw new BadRequestException('不能移除团队所有者')
    if (actorRole !== 'OWNER' && member.role === 'ADMIN') throw new ForbiddenException('只有所有者可以移除管理员')
    await this.prisma.teamMember.delete({ where: { teamId_userId: { teamId, userId: targetUserId } } })
    await this.audit(teamId, userId, 'member.removed', 'user', targetUserId, { role: member.role })
    return { removed: true }
  }

  async leave(teamId: string, userId: string) {
    const team = await this.prisma.team.findUnique({ where: { id: teamId }, select: { ownerId: true } })
    if (!team) throw new NotFoundException('团队不存在')
    if (team.ownerId === userId) throw new BadRequestException('所有者不能退出团队，请先转移所有权')
    const result = await this.prisma.teamMember.deleteMany({ where: { teamId, userId } })
    if (!result.count) throw new NotFoundException('你不是该团队成员')
    await this.audit(teamId, userId, 'member.left', 'user', userId)
    return { left: true }
  }

  async transfer(teamId: string, targetUserId: string, userId: string) {
    await this.manager(teamId, userId, true)
    const target = await this.prisma.teamMember.findUnique({ where: { teamId_userId: { teamId, userId: targetUserId } } })
    if (!target) throw new NotFoundException('新所有者必须先加入团队')
    await this.prisma.$transaction([
      this.prisma.team.update({ where: { id: teamId }, data: { ownerId: targetUserId } }),
      this.prisma.teamMember.update({ where: { teamId_userId: { teamId, userId } }, data: { role: 'ADMIN' } }),
      this.prisma.teamMember.update({ where: { teamId_userId: { teamId, userId: targetUserId } }, data: { role: 'OWNER' } }),
    ])
    await this.audit(teamId, userId, 'ownership.transferred', 'user', targetUserId, { previousOwnerId: userId })
    return { transferred: true, ownerId: targetUserId }
  }

  async remove(teamId: string, userId: string) {
    await this.manager(teamId, userId, true)
    const [activeJobs, account] = await Promise.all([
      this.prisma.generationJob.count({ where: { billingTeamId: teamId, status: { in: ['QUEUED', 'RUNNING'] } } }),
      this.prisma.teamCreditAccount.findUnique({ where: { teamId }, select: { balance: true } }),
    ])
    if (activeJobs) throw new BadRequestException(`团队仍有 ${activeJobs} 个任务执行中，完成或取消后才能删除`)
    if ((account?.balance || 0) > 0) throw new BadRequestException('团队共享额度仍有余额，请联系管理员处理后再删除')
    await this.audit(teamId, userId, 'team.deleted', 'team', teamId)
    await this.prisma.team.delete({ where: { id: teamId } })
    return { deleted: true }
  }

  async auditLogs(teamId: string, userId: string) {
    const member = await this.prisma.teamMember.findUnique({ where: { teamId_userId: { teamId, userId } } })
    if (!member) throw new ForbiddenException('你不是该团队成员')
    return this.prisma.teamAuditLog.findMany({ where: { teamId }, orderBy: { createdAt: 'desc' }, take: 200, include: { actor: { select: { id: true, displayName: true, email: true } } } })
  }

  async resources(teamId: string, userId: string) {
    await this.assertMember(teamId, userId)
    const [projects, assets, knowledgeBases] = await Promise.all([
      this.prisma.project.findMany({
        where: { teamId },
        orderBy: { updatedAt: 'desc' },
        take: 200,
        select: { id: true, name: true, description: true, workflowStatus: true, archivedAt: true, updatedAt: true, user: { select: memberUser }, _count: { select: { assets: true, conversations: true } } },
      }),
      this.prisma.asset.findMany({
        where: { teamId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 200,
        select: { id: true, projectId: true, kind: true, name: true, mimeType: true, size: true, createdAt: true, user: { select: memberUser } },
      }),
      this.prisma.knowledgeBase.findMany({
        where: { teamId },
        orderBy: { updatedAt: 'desc' },
        take: 200,
        select: { id: true, name: true, description: true, status: true, documentCount: true, chunkCount: true, updatedAt: true, creator: { select: memberUser } },
      }),
    ])
    return { projects, assets: assets.map((asset) => ({ ...asset, size: Number(asset.size), contentUrl: `/v1/assets/${asset.id}/content` })), knowledgeBases }
  }

  private async assertMember(teamId: string, userId: string) {
    const member = await this.prisma.teamMember.findUnique({ where: { teamId_userId: { teamId, userId } }, select: { role: true, team: { select: { status: true } } } })
    if (!member || member.team.status !== 'ACTIVE') throw new ForbiddenException('你不是该团队成员')
    return member
  }
}
