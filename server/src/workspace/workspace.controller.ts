import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, NotFoundException, Param, Patch, Post, Req, StreamableFile, UseGuards } from '@nestjs/common'
import { ArrayMaxSize, IsArray, IsBoolean, IsEmail, IsIn, IsInt, IsObject, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator'
import { AssetKind, Prisma } from '@prisma/client'
import type { FastifyRequest } from 'fastify'
import { AuthGuard } from '../auth/auth.guard'
import { AdminGuard } from '../admin/admin.guard'
import { AuthenticatedUser, CurrentUser } from '../common/request-user'
import { PrismaService } from '../prisma/prisma.service'
import { assetDisposition, AssetsService, resolveRasterImageMime } from '../assets/assets.service'
import { OfficeExportService } from './office-export.service'
import { CredentialCryptoService } from '../providers/credential-crypto.service'
import { TeamService } from './team.service'
import { ResourceAccessService } from '../common/resource-access.service'
import { CreditsService } from '../credits/credits.service'
import { PublicEndpointPolicyService } from '../common/public-endpoint-policy.service'
import { defaultAssistantPresets, defaultToolPresets, ensureDefaultCapabilityPresets, toolCreateData } from './default-capability-presets'
import { AgentToolsService } from '../agent-tasks/agent-tools.service'

class AssistantDto {
  @IsString() @MinLength(1) @MaxLength(100) name!: string
  @IsOptional() @IsString() @MaxLength(2000) description?: string
  @IsOptional() @IsString() @MaxLength(30000) systemPrompt?: string
  @IsOptional() @IsString() @MaxLength(100) defaultModel?: string
  @IsOptional() @IsArray() @ArrayMaxSize(100) @IsString({ each: true }) templateIds?: string[]
  @IsOptional() @IsArray() @ArrayMaxSize(100) @IsString({ each: true }) toolIds?: string[]
  @IsOptional() @IsArray() @ArrayMaxSize(100) @IsString({ each: true }) knowledgeBaseIds?: string[]
  @IsOptional() @IsBoolean() enabled?: boolean
  @IsOptional() @IsInt() @Min(0) @Max(100000) sortOrder?: number
}

class KnowledgeBaseDto { @IsString() @MinLength(1) @MaxLength(100) name!: string; @IsOptional() @IsString() @MaxLength(2000) description?: string; @IsOptional() @IsString() @MaxLength(100) teamId?: string | null }
class KnowledgeBaseAssetDto { @IsString() @MinLength(1) @MaxLength(100) assetId!: string }
class ToolCallDto { @IsOptional() @IsObject() input?: Record<string, unknown>; @IsOptional() @IsString() approvalRequestId?: string }
class ToolApprovalRequestDto { @IsOptional() @IsString() @MaxLength(1000) reason?: string }
class TeamDto { @IsString() @MinLength(1) @MaxLength(100) name!: string; @IsOptional() @IsString() @MaxLength(2000) description?: string; @IsOptional() @IsInt() @Min(1) @Max(10000) seatLimit?: number }
class TeamMemberDto { @IsEmail() email!: string; @IsOptional() @IsIn(['ADMIN', 'MEMBER']) role?: string }
class TeamRoleDto { @IsIn(['ADMIN', 'MEMBER']) role!: string }
class TeamTransferDto { @IsString() @MinLength(1) targetUserId!: string }
class TeamBillingDto { @IsBoolean() enabled!: boolean }
class TeamQuotaDto { @IsOptional() @IsInt() @Min(0) @Max(100000000) monthlyCreditLimit?: number | null }
class TeamCreditAdjustmentDto { @IsInt() @Min(-100000000) @Max(100000000) amount!: number; @IsString() @MinLength(2) @MaxLength(500) reason!: string }
class AdminTeamDto { @IsOptional() @IsString() @MinLength(1) @MaxLength(100) name?: string; @IsOptional() @IsInt() @Min(1) @Max(10000) seatLimit?: number; @IsOptional() @IsIn(['ACTIVE', 'SUSPENDED']) status?: string; @IsOptional() @IsBoolean() billingEnabled?: boolean }
class ToolDto {
  @IsString() @MinLength(2) @MaxLength(80) key!: string
  @IsString() @MinLength(1) @MaxLength(100) name!: string
  @IsOptional() @IsString() @MaxLength(2000) description?: string
  @IsOptional() @IsString() @MaxLength(80) icon?: string
  @IsOptional() @IsIn(['BUILT_IN']) kind?: string
  @IsOptional() @IsIn(['NONE', 'API_KEY']) authType?: string
  @IsOptional() @IsString() @MaxLength(2000) documentationUrl?: string
  @IsOptional() @IsArray() @ArrayMaxSize(20) credentialFields?: Array<Record<string, unknown>>
  @IsOptional() @IsString() @MaxLength(500) endpoint?: string
  @IsOptional() @IsIn(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) httpMethod?: string
  @IsOptional() @IsInt() @Min(1000) @Max(120000) timeoutMs?: number
  @IsOptional() @IsObject() headers?: Record<string, string>
  @IsOptional() @IsObject() secretHeaders?: Record<string, string>
  @IsOptional() @IsBoolean() clearSecretHeaders?: boolean
  @IsOptional() @IsObject() inputSchema?: Record<string, unknown>
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) scopes?: string[]
  @IsOptional() @IsBoolean() enabled?: boolean
  @IsOptional() @IsBoolean() requiresApproval?: boolean
}
class ReviewToolApprovalDto {
  @IsIn(['APPROVED', 'REJECTED']) status!: string
  @IsOptional() @IsString() @MaxLength(2000) adminNote?: string
  @IsOptional() @IsInt() @Min(5) @Max(10080) expiresInMinutes?: number
}
class OfficeExportDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) conversationId?: string
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) agentTaskId?: string
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) messageId?: string
  @IsOptional() @IsIn(['docx', 'xlsx', 'pptx', 'md']) format?: 'docx' | 'xlsx' | 'pptx' | 'md'
}

@Controller()
@UseGuards(AuthGuard)
export class WorkspaceController {
  constructor(private readonly prisma: PrismaService, private readonly assets: AssetsService, private readonly officeExports: OfficeExportService, private readonly teamService: TeamService, private readonly access: ResourceAccessService, private readonly agentTools: AgentToolsService) {}

  @Post('office/exports')
  exportOffice(@CurrentUser() user: AuthenticatedUser, @Body() body: OfficeExportDto) { return this.officeExports.create(user.id, body) }

  @Get('assistants')
  assistants() {
    return this.prisma.assistant.findMany({
      where: { enabled: true, visibility: 'PUBLIC' },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      select: { id: true, name: true, description: true, defaultModel: true, templateIds: true, tools: { select: { toolId: true, tool: { select: { name: true } } } } },
    }).then((rows) => rows.map((row) => ({ ...row, tools: row.tools.map((item) => ({ toolId: item.toolId, name: item.tool.name })) })))
  }

  @Get('assistants/tools')
  tools() {
    return this.prisma.toolDefinition.findMany({
      where: { enabled: true, kind: 'BUILT_IN' },
      orderBy: { name: 'asc' },
      select: { id: true, key: true, name: true, description: true, icon: true, kind: true, authType: true, documentationUrl: true, credentialFields: true, requiresApproval: true, scopes: true, enabled: true },
    })
  }

  @Get('assistants/tools/:toolId/icon')
  async toolIcon(@Param('toolId') toolId: string) {
    const tool = await this.prisma.toolDefinition.findFirst({ where: { id: toolId, enabled: true, kind: 'BUILT_IN' }, select: { iconAssetId: true } })
    if (!tool?.iconAssetId) throw new NotFoundException('工具图标不存在')
    const result = await this.assets.streamForAdmin(tool.iconAssetId)
    return new StreamableFile(result.stream, { type: result.mimeType, disposition: assetDisposition(result.mimeType, result.name), length: result.size || undefined })
  }


  @Get('knowledge-bases')
  knowledgeBases(@CurrentUser() user: AuthenticatedUser) { return this.prisma.knowledgeBase.findMany({ where: this.access.knowledgeBaseWhere(user.id), orderBy: { updatedAt: 'desc' }, include: { creator: { select: { id: true, displayName: true } }, team: { select: { id: true, name: true } }, assets: { orderBy: { createdAt: 'desc' }, include: { asset: { select: { id: true, name: true, mimeType: true, createdAt: true } } } }, _count: { select: { assets: true, assistants: true } } } }) }

  @Post('knowledge-bases')
  async createKnowledgeBase(@CurrentUser() user: AuthenticatedUser, @Body() body: KnowledgeBaseDto) {
    const teamId = body.teamId || null
    if (teamId) await this.access.assertTeamManager(teamId, user.id)
    const row = await this.prisma.knowledgeBase.create({ data: { creatorId: user.id, teamId, name: body.name.trim(), description: body.description?.trim() || '' }, include: { team: { select: { id: true, name: true } } } })
    if (teamId) await this.access.auditTeamResource(teamId, user.id, 'knowledge_base.created', 'knowledge_base', row.id, { name: row.name })
    return row
  }

  @Patch('knowledge-bases/:id')
  async updateKnowledgeBase(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: KnowledgeBaseDto) {
    const current = await this.access.assertKnowledgeBaseManager(user.id, id)
    const teamId = body.teamId === undefined ? current.teamId : body.teamId || null
    if (teamId) await this.access.assertTeamManager(teamId, user.id)
    const row = await this.prisma.knowledgeBase.update({ where: { id }, data: { name: body.name.trim(), description: body.description?.trim() || '', teamId }, include: { team: { select: { id: true, name: true } } } })
    if (current.teamId && current.teamId !== teamId) await this.access.auditTeamResource(current.teamId, user.id, 'knowledge_base.unassigned', 'knowledge_base', id, { nextTeamId: teamId })
    if (teamId && current.teamId !== teamId) await this.access.auditTeamResource(teamId, user.id, 'knowledge_base.assigned', 'knowledge_base', id, { previousTeamId: current.teamId })
    return row
  }

  @Delete('knowledge-bases/:id')
  async deleteKnowledgeBase(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const current = await this.access.assertKnowledgeBaseManager(user.id, id)
    await this.prisma.knowledgeBase.delete({ where: { id } })
    if (current.teamId) await this.access.auditTeamResource(current.teamId, user.id, 'knowledge_base.deleted', 'knowledge_base', id)
    return { deleted: true }
  }

  @Post('knowledge-bases/:id/assets')
  async attachAsset(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: KnowledgeBaseAssetDto) {
    const [knowledgeBase, asset] = await Promise.all([
      this.access.assertKnowledgeBaseManager(user.id, id),
      this.access.assertAssetReadable(user.id, body.assetId),
    ])
    if (knowledgeBase.teamId && asset.teamId !== knowledgeBase.teamId) throw new BadRequestException('团队知识库只能加入同一团队的共享文件')
    if (!knowledgeBase.teamId && asset.userId !== user.id) throw new BadRequestException('个人知识库只能加入自己的文件')
    const existing = await this.prisma.knowledgeBaseAsset.findUnique({ where: { knowledgeBaseId_assetId: { knowledgeBaseId: id, assetId: body.assetId } } })
    if (existing) return { attached: true, alreadyAttached: true }
    let extractedText = ''
    if (asset) {
      const excerpt = await this.assets.readTextExcerptForUser(user.id, asset.id, 2_000_000)
      extractedText = excerpt.text
    }
    const chunkCount = extractedText ? Math.max(1, Math.ceil(extractedText.length / 1200)) : 0
    await this.prisma.$transaction([
      this.prisma.knowledgeBaseAsset.create({ data: { knowledgeBaseId: id, assetId: body.assetId, extractedText, chunkCount } }),
      this.prisma.knowledgeBase.update({ where: { id }, data: { documentCount: { increment: 1 }, chunkCount: { increment: chunkCount } } }),
    ])
    return { attached: true, chunkCount }
  }

  @Delete('knowledge-bases/:id/assets/:assetId')
  async detachAsset(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Param('assetId') assetId: string) {
    await this.access.assertKnowledgeBaseManager(user.id, id)
    const asset = await this.prisma.knowledgeBaseAsset.findUnique({ where: { knowledgeBaseId_assetId: { knowledgeBaseId: id, assetId } }, select: { chunkCount: true } })
    // 删除关联记录和递减计数必须原子，否则计数会永久漂移
    const result = await this.prisma.$transaction([
      this.prisma.knowledgeBaseAsset.deleteMany({ where: { knowledgeBaseId: id, assetId } }),
      this.prisma.knowledgeBase.update({ where: { id }, data: { documentCount: { decrement: 1 }, chunkCount: { decrement: asset?.chunkCount || 0 } } }),
    ])
    return { detached: result[0].count > 0 }
  }

  @Get('teams')
  teams(@CurrentUser() user: AuthenticatedUser) { return this.teamService.list(user.id) }

  @Get('team-invitations')
  teamInvitations(@CurrentUser() user: AuthenticatedUser) { return this.teamService.pendingInvitations(user.email) }

  @Post('team-invitations/:token/accept')
  acceptTeamInvitation(@CurrentUser() user: AuthenticatedUser, @Param('token') token: string) { return this.teamService.accept(token, user) }

  @Post('team-invitations/:id/accept-pending')
  acceptPendingTeamInvitation(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.teamService.acceptPending(id, user) }

  @Post('teams')
  async createTeam(@CurrentUser() user: AuthenticatedUser, @Body() body: TeamDto) {
    return this.teamService.create(user.id, body)
  }

  @Post('teams/:id/invitations')
  inviteMember(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: TeamMemberDto) { return this.teamService.invite(id, user.id, body) }

  @Delete('teams/:id/invitations/:invitationId')
  cancelInvitation(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Param('invitationId') invitationId: string) { return this.teamService.cancelInvitation(id, invitationId, user.id) }

  @Post('teams/:id/members')
  async addMember(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: TeamMemberDto) {
    return this.teamService.invite(id, user.id, body)
  }

  @Patch('teams/:id')
  async updateTeam(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: TeamDto) {
    return this.teamService.update(id, user.id, body)
  }

  @Delete('teams/:id')
  async deleteTeam(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.teamService.remove(id, user.id)
  }

  @Patch('teams/:id/members/:userId')
  async updateMemberRole(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Param('userId') userId: string, @Body() body: TeamRoleDto) {
    return this.teamService.updateRole(id, userId, user.id, body.role)
  }

  @Patch('teams/:id/billing')
  updateTeamBilling(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: TeamBillingDto) { return this.teamService.updateBilling(id, user.id, body.enabled) }

  @Patch('teams/:id/members/:userId/quota')
  updateTeamMemberQuota(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Param('userId') targetUserId: string, @Body() body: TeamQuotaDto) { return this.teamService.updateMemberQuota(id, targetUserId, user.id, body.monthlyCreditLimit ?? null) }

  @Delete('teams/:id/members/:userId')
  async removeMember(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Param('userId') userId: string) {
    return this.teamService.removeMember(id, userId, user.id)
  }

  @Post('teams/:id/leave')
  async leaveTeam(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.teamService.leave(id, user.id)
  }

  @Post('teams/:id/transfer-ownership')
  transferTeam(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: TeamTransferDto) { return this.teamService.transfer(id, body.targetUserId, user.id) }

  @Get('teams/:id/audit-logs')
  teamAuditLogs(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.teamService.auditLogs(id, user.id) }

  @Get('teams/:id/resources')
  teamResources(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.teamService.resources(id, user.id) }

  @Get('tool-approvals')
  toolApprovals(@CurrentUser() user: AuthenticatedUser) {
    return this.prisma.toolApprovalRequest.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 100, include: { tool: { select: { id: true, key: true, name: true, description: true } }, assistant: { select: { id: true, name: true } } } })
  }

  @Delete('tool-approvals/:id')
  async cancelToolApproval(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const result = await this.prisma.toolApprovalRequest.deleteMany({ where: { id, userId: user.id, status: 'PENDING' } })
    if (!result.count) throw new NotFoundException('待审批申请不存在或已处理')
    return { cancelled: true }
  }

  @Post('assistants/:assistantId/tools/:toolId/approval-requests')
  async requestToolApproval(@CurrentUser() user: AuthenticatedUser, @Param('assistantId') assistantId: string, @Param('toolId') toolId: string, @Body() body: ToolApprovalRequestDto) {
    const binding = await this.prisma.assistantTool.findUnique({ where: { assistantId_toolId: { assistantId, toolId } }, include: { assistant: { select: { id: true, enabled: true } }, tool: { select: { id: true, enabled: true, requiresApproval: true } } } })
    if (!binding?.assistant.enabled || !binding.tool.enabled) throw new ForbiddenException('助手或工具未启用')
    if (!binding.tool.requiresApproval) throw new BadRequestException('该工具无需审批')
    const existing = await this.prisma.toolApprovalRequest.findFirst({ where: { userId: user.id, assistantId, toolId, status: 'PENDING' }, orderBy: { createdAt: 'desc' } })
    if (existing) return existing
    return this.prisma.toolApprovalRequest.create({ data: { userId: user.id, assistantId, toolId, reason: body.reason?.trim() || '' }, include: { tool: { select: { id: true, key: true, name: true, description: true } }, assistant: { select: { id: true, name: true } } } })
  }

  @Post('assistants/:assistantId/tools/:toolId/call')
  async callTool(@CurrentUser() user: AuthenticatedUser, @Param('assistantId') assistantId: string, @Param('toolId') toolId: string, @Body() body: ToolCallDto) {
    const binding = await this.prisma.assistantTool.findUnique({ where: { assistantId_toolId: { assistantId, toolId } }, include: { assistant: { select: { id: true, enabled: true } }, tool: true } })
    if (!binding?.assistant.enabled || !binding.tool.enabled) throw new ForbiddenException('助手或工具未启用')
    if (binding.tool.requiresApproval) {
      if (!body.approvalRequestId) throw new ForbiddenException('该工具需要先提交审批申请')
      const approval = await this.prisma.toolApprovalRequest.findFirst({ where: { id: body.approvalRequestId, userId: user.id, assistantId, toolId, status: 'APPROVED', consumedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } })
      if (!approval) throw new ForbiddenException('审批不存在、已过期或尚未批准')
      await this.prisma.toolApprovalRequest.update({ where: { id: approval.id }, data: { consumedAt: new Date() } })
    }
    try {
      const output = await this.agentTools.execute(
        { id: `manual:${assistantId}:${toolId}`, userId: user.id, assistantId, projectId: null, webSearchEnabled: false },
        { id: binding.tool.id, key: binding.tool.key, name: binding.tool.name, description: binding.tool.description, requiresApproval: binding.tool.requiresApproval, kind: 'external', inputSchema: binding.tool.inputSchema },
        body.input || {},
      )
      return { status: 'SUCCEEDED', output }
    } catch (reason) {
      throw new ForbiddenException(reason instanceof Error ? reason.message : '工具调用失败')
    }
  }
}

@Controller('admin')
@UseGuards(AuthGuard, AdminGuard)
export class AdminWorkspaceController {
  constructor(private readonly prisma: PrismaService, private readonly crypto: CredentialCryptoService, private readonly assets: AssetsService, private readonly credits: CreditsService, private readonly endpointPolicy: PublicEndpointPolicyService) {}

  @Get('teams')
  teams() { return this.prisma.team.findMany({ orderBy: { updatedAt: 'desc' }, include: { owner: { select: { id: true, email: true, displayName: true } }, creditAccount: { select: { balance: true, updatedAt: true } }, members: { orderBy: { joinedAt: 'asc' }, include: { user: { select: { id: true, email: true, displayName: true } } } }, invitations: { where: { status: 'PENDING' }, orderBy: { createdAt: 'desc' }, select: { id: true, email: true, role: true, expiresAt: true, createdAt: true } }, _count: { select: { members: true, invitations: true, auditLogs: true, projects: true, assets: true, knowledgeBases: true } } } }) }

  @Patch('teams/:id')
  async updateTeam(@CurrentUser() admin: AuthenticatedUser, @Req() request: FastifyRequest, @Param('id') id: string, @Body() body: AdminTeamDto) {
    const current = await this.prisma.team.findUnique({ where: { id }, include: { _count: { select: { members: true } } } })
    if (!current) throw new NotFoundException('团队不存在')
    if (body.seatLimit !== undefined && body.seatLimit < current._count.members) throw new BadRequestException(`席位数不能少于当前成员数 ${current._count.members}`)
    const row = await this.prisma.team.update({ where: { id }, data: { ...(body.name !== undefined ? { name: body.name.trim() } : {}), ...(body.seatLimit !== undefined ? { seatLimit: body.seatLimit } : {}), ...(body.status !== undefined ? { status: body.status } : {}), ...(body.billingEnabled !== undefined ? { billingEnabled: body.billingEnabled } : {}) }, include: { owner: { select: { id: true, email: true, displayName: true } }, creditAccount: { select: { balance: true, updatedAt: true } }, _count: { select: { members: true, invitations: true, auditLogs: true, projects: true, assets: true, knowledgeBases: true } } } })
    await Promise.all([
      this.audit(admin.id, request, 'team.admin_update', id, { name: row.name, seatLimit: row.seatLimit, status: row.status }),
      this.prisma.teamAuditLog.create({ data: { teamId: id, actorId: admin.id, action: 'team.admin_updated', targetType: 'team', targetId: id, metadata: { name: row.name, seatLimit: row.seatLimit, status: row.status } as Prisma.InputJsonValue } }),
    ])
    return row
  }

  @Post('teams/:id/credits')
  async adjustTeamCredits(@CurrentUser() admin: AuthenticatedUser, @Req() request: FastifyRequest, @Param('id') id: string, @Body() body: TeamCreditAdjustmentDto) {
    if (!body.amount) throw new BadRequestException('调整点数不能为 0')
    const entry = await this.credits.mutateTeam(id, admin.id, body.amount, 'ADJUST', body.reason.trim(), `admin-team:${admin.id}:${id}:${Date.now()}`, { type: 'admin_team_adjustment', id })
    await this.audit(admin.id, request, 'team.credits_adjust', id, { amount: body.amount, reason: body.reason.trim() })
    return entry
  }

  @Patch('teams/:id/members/:userId/quota')
  async updateTeamMemberQuota(@CurrentUser() admin: AuthenticatedUser, @Req() request: FastifyRequest, @Param('id') id: string, @Param('userId') userId: string, @Body() body: TeamQuotaDto) {
    const member = await this.prisma.teamMember.findUnique({ where: { teamId_userId: { teamId: id, userId } }, select: { monthlyCreditLimit: true } })
    if (!member) throw new NotFoundException('团队成员不存在')
    const monthlyCreditLimit = body.monthlyCreditLimit ?? null
    const row = await this.prisma.teamMember.update({ where: { teamId_userId: { teamId: id, userId } }, data: { monthlyCreditLimit } })
    await Promise.all([
      this.audit(admin.id, request, 'team.member_quota_update', id, { userId, before: member.monthlyCreditLimit, after: monthlyCreditLimit }),
      this.prisma.teamAuditLog.create({ data: { teamId: id, actorId: admin.id, action: 'member.quota_updated_by_admin', targetType: 'user', targetId: userId, metadata: { before: member.monthlyCreditLimit, after: monthlyCreditLimit } as Prisma.InputJsonValue } }),
    ])
    return row
  }

  @Get('teams/:id/audit-logs')
  teamAuditLogs(@Param('id') id: string) { return this.prisma.teamAuditLog.findMany({ where: { teamId: id }, orderBy: { createdAt: 'desc' }, take: 500, include: { actor: { select: { id: true, displayName: true, email: true } } } }) }

  @Get('teams/:id/resources')
  async teamResources(@Param('id') id: string) {
    const team = await this.prisma.team.findUnique({ where: { id }, select: { id: true } })
    if (!team) throw new NotFoundException('团队不存在')
    const [projects, assets, knowledgeBases] = await Promise.all([
      this.prisma.project.findMany({ where: { teamId: id }, orderBy: { updatedAt: 'desc' }, take: 200, select: { id: true, name: true, workflowStatus: true, archivedAt: true, updatedAt: true, user: { select: { id: true, displayName: true, email: true } }, _count: { select: { assets: true, conversations: true } } } }),
      this.prisma.asset.findMany({ where: { teamId: id, deletedAt: null }, orderBy: { createdAt: 'desc' }, take: 200, select: { id: true, name: true, kind: true, mimeType: true, size: true, createdAt: true, user: { select: { id: true, displayName: true, email: true } } } }),
      this.prisma.knowledgeBase.findMany({ where: { teamId: id }, orderBy: { updatedAt: 'desc' }, take: 200, select: { id: true, name: true, status: true, documentCount: true, chunkCount: true, updatedAt: true, creator: { select: { id: true, displayName: true, email: true } } } }),
    ])
    return { projects, assets: assets.map((asset) => ({ ...asset, size: Number(asset.size) })), knowledgeBases }
  }

  @Get('assistants')
  assistants() { return this.prisma.assistant.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }], include: { tools: { select: { toolId: true } }, knowledgeBases: { select: { knowledgeBaseId: true } }, _count: { select: { knowledgeBases: true, tools: true } } } }) }

  @Post('assistants/restore-defaults')
  async restoreAssistants(@CurrentUser() admin: AuthenticatedUser, @Req() request: FastifyRequest) {
    const before = await this.prisma.assistant.count({ where: { id: { in: defaultAssistantPresets.map((item) => item.id) } } })
    await ensureDefaultCapabilityPresets(this.prisma)
    const added = defaultAssistantPresets.length - before
    await this.audit(admin.id, request, 'assistant.restore_defaults', 'assistant-presets', { added, total: defaultAssistantPresets.length })
    return { added, total: defaultAssistantPresets.length }
  }

  @Post('assistants')
  async createAssistant(@CurrentUser() admin: AuthenticatedUser, @Req() request: FastifyRequest, @Body() body: AssistantDto) {
    const row = await this.prisma.assistant.create({ data: { name: body.name.trim(), description: body.description?.trim() || '', systemPrompt: body.systemPrompt?.trim() || '', defaultModel: body.defaultModel?.trim() || '', templateIds: (body.templateIds || []) as Prisma.InputJsonValue, enabled: body.enabled ?? true, sortOrder: body.sortOrder ?? 0, tools: body.toolIds?.length ? { create: body.toolIds.map((toolId) => ({ toolId })) } : undefined, knowledgeBases: body.knowledgeBaseIds?.length ? { create: body.knowledgeBaseIds.map((knowledgeBaseId) => ({ knowledgeBaseId })) } : undefined } })
    await this.audit(admin.id, request, 'assistant.create', row.id, { name: row.name })
    return this.prisma.assistant.findUniqueOrThrow({ where: { id: row.id }, include: { _count: { select: { knowledgeBases: true, tools: true } } } })
  }

  @Patch('assistants/:id')
  async updateAssistant(@CurrentUser() admin: AuthenticatedUser, @Req() request: FastifyRequest, @Param('id') id: string, @Body() body: AssistantDto) {
    const exists = await this.prisma.assistant.findUnique({ where: { id }, select: { id: true } }); if (!exists) throw new NotFoundException('助手不存在')
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.assistantTool.deleteMany({ where: { assistantId: id } })
      await tx.assistantKnowledgeBase.deleteMany({ where: { assistantId: id } })
      return tx.assistant.update({ where: { id }, data: { name: body.name.trim(), description: body.description?.trim() || '', systemPrompt: body.systemPrompt?.trim() || '', defaultModel: body.defaultModel?.trim() || '', templateIds: (body.templateIds || []) as Prisma.InputJsonValue, enabled: body.enabled ?? true, sortOrder: body.sortOrder ?? 0, tools: body.toolIds?.length ? { create: body.toolIds.map((toolId) => ({ toolId })) } : undefined, knowledgeBases: body.knowledgeBaseIds?.length ? { create: body.knowledgeBaseIds.map((knowledgeBaseId) => ({ knowledgeBaseId })) } : undefined } })
    })
    await this.audit(admin.id, request, 'assistant.update', id, { name: row.name, enabled: row.enabled }); return this.prisma.assistant.findUniqueOrThrow({ where: { id }, include: { tools: { select: { toolId: true } }, knowledgeBases: { select: { knowledgeBaseId: true } }, _count: { select: { knowledgeBases: true, tools: true } } } })
  }

  @Delete('assistants/:id')
  async deleteAssistant(@CurrentUser() admin: AuthenticatedUser, @Req() request: FastifyRequest, @Param('id') id: string) { const row = await this.prisma.assistant.delete({ where: { id } }); await this.audit(admin.id, request, 'assistant.delete', id, { name: row.name }); return { deleted: true } }

  @Get('tools')
  tools() { return this.prisma.toolDefinition.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { assistants: true, calls: true } } } }).then((rows) => rows.map((row) => ({ ...row, encryptedHeaders: undefined, hasSecretHeaders: Boolean(row.encryptedHeaders) }))) }

  @Post('tools/restore-defaults')
  async restoreTools(@CurrentUser() admin: AuthenticatedUser, @Req() request: FastifyRequest) {
    const before = await this.prisma.toolDefinition.count({ where: { key: { in: defaultToolPresets.map((item) => item.key) } } })
    await ensureDefaultCapabilityPresets(this.prisma)
    const added = defaultToolPresets.length - before
    await this.audit(admin.id, request, 'tool.restore_defaults', 'tool-presets', { added, total: defaultToolPresets.length })
    return { added, total: defaultToolPresets.length }
  }

  @Post('tools/:id/icon')
  async uploadToolIcon(@CurrentUser() admin: AuthenticatedUser, @Req() request: FastifyRequest, @Param('id') id: string) {
    const tool = await this.prisma.toolDefinition.findUnique({ where: { id }, select: { id: true, iconAssetId: true } })
    if (!tool) throw new NotFoundException('工具不存在')
    const part = await request.file()
    if (!part) throw new BadRequestException('请选择图标文件')
    const mimeType = resolveRasterImageMime(part.filename, part.mimetype)
    if (!mimeType) { part.file.resume(); throw new BadRequestException('图标仅支持 JPG、PNG、WebP、GIF 或 AVIF') }
    const asset = await this.assets.storeUpload(admin.id, { stream: part.file, name: part.filename, mimeType, kind: AssetKind.IMAGE, metadata: { purpose: 'tool-icon', toolId: id } })
    const icon = `/v1/assistants/tools/${id}/icon?v=${Date.now()}`
    await this.prisma.toolDefinition.update({ where: { id }, data: { iconAssetId: asset.id, icon } })
    if (tool.iconAssetId && tool.iconAssetId !== asset.id) await this.assets.removeAsAdmin(tool.iconAssetId).catch(() => undefined)
    await this.audit(admin.id, request, 'tool.icon.upload', id, { assetId: asset.id })
    return { assetId: asset.id, icon }
  }

  @Delete('tools/:id/icon')
  async removeToolIcon(@CurrentUser() admin: AuthenticatedUser, @Req() request: FastifyRequest, @Param('id') id: string) {
    const tool = await this.prisma.toolDefinition.findUnique({ where: { id }, select: { iconAssetId: true } })
    if (!tool) throw new NotFoundException('工具不存在')
    await this.prisma.toolDefinition.update({ where: { id }, data: { iconAssetId: null, icon: 'wrench' } })
    if (tool.iconAssetId) await this.assets.removeAsAdmin(tool.iconAssetId).catch(() => undefined)
    await this.audit(admin.id, request, 'tool.icon.delete', id, { assetId: tool.iconAssetId || null })
    return { removed: Boolean(tool.iconAssetId) }
  }

  @Post('tools')
  async createTool(@CurrentUser() admin: AuthenticatedUser, @Req() request: FastifyRequest, @Body() body: ToolDto) { const endpoint = body.endpoint?.trim() || ''; if (endpoint) await this.endpointPolicy.assertPublicHttpUrl(endpoint); const secrets = this.cleanHeaders(body.secretHeaders); const row = await this.prisma.toolDefinition.create({ data: { key: body.key.trim(), name: body.name.trim(), description: body.description?.trim() || '', icon: body.icon?.trim() || 'wrench', kind: body.kind || 'BUILT_IN', authType: body.authType || 'NONE', documentationUrl: body.documentationUrl?.trim() || '', credentialFields: (body.credentialFields || []) as Prisma.InputJsonValue, endpoint, httpMethod: body.httpMethod || 'POST', timeoutMs: body.timeoutMs ?? 45000, headers: this.cleanHeaders(body.headers) as Prisma.InputJsonValue, encryptedHeaders: Object.keys(secrets).length ? this.crypto.encrypt(JSON.stringify(secrets)) : '', secretHeaderHints: this.headerHints(secrets) as Prisma.InputJsonValue, inputSchema: body.inputSchema as Prisma.InputJsonValue, scopes: (body.scopes || []) as Prisma.InputJsonValue, enabled: body.enabled ?? false, requiresApproval: body.requiresApproval ?? true } }); await this.audit(admin.id, request, 'tool.create', row.id, { key: row.key }); return { ...await this.prisma.toolDefinition.findUniqueOrThrow({ where: { id: row.id }, include: { _count: { select: { assistants: true, calls: true } } } }), encryptedHeaders: undefined, hasSecretHeaders: Boolean(row.encryptedHeaders) } }

  @Patch('tools/:id')
  async updateTool(@CurrentUser() admin: AuthenticatedUser, @Req() request: FastifyRequest, @Param('id') id: string, @Body() body: ToolDto) { const current = await this.prisma.toolDefinition.findUnique({ where: { id } }); if (!current) throw new NotFoundException('工具不存在'); const endpoint = body.endpoint?.trim() || ''; if (endpoint) await this.endpointPolicy.assertPublicHttpUrl(endpoint); const supplied = this.cleanHeaders(body.secretHeaders); const merged = body.clearSecretHeaders ? {} : body.secretHeaders === undefined ? null : { ...this.readHeaders(current.encryptedHeaders), ...supplied }; const row = await this.prisma.toolDefinition.update({ where: { id }, data: { key: body.key.trim(), name: body.name.trim(), description: body.description?.trim() || '', icon: body.icon?.trim() || 'wrench', kind: body.kind || 'BUILT_IN', authType: body.authType || 'NONE', documentationUrl: body.documentationUrl?.trim() || '', credentialFields: (body.credentialFields || []) as Prisma.InputJsonValue, endpoint, httpMethod: body.httpMethod || 'POST', timeoutMs: body.timeoutMs ?? 45000, headers: this.cleanHeaders(body.headers) as Prisma.InputJsonValue, ...(merged ? { encryptedHeaders: Object.keys(merged).length ? this.crypto.encrypt(JSON.stringify(merged)) : '', secretHeaderHints: this.headerHints(merged) as Prisma.InputJsonValue } : {}), inputSchema: body.inputSchema as Prisma.InputJsonValue, scopes: (body.scopes || []) as Prisma.InputJsonValue, enabled: body.enabled ?? false, requiresApproval: body.requiresApproval ?? true } }); await this.audit(admin.id, request, 'tool.update', id, { key: row.key, enabled: row.enabled }); return { ...await this.prisma.toolDefinition.findUniqueOrThrow({ where: { id }, include: { _count: { select: { assistants: true, calls: true } } } }), encryptedHeaders: undefined, hasSecretHeaders: Boolean(row.encryptedHeaders) } }

  @Delete('tools/:id')
  async deleteTool(@CurrentUser() admin: AuthenticatedUser, @Req() request: FastifyRequest, @Param('id') id: string) { const row = await this.prisma.toolDefinition.delete({ where: { id } }); if (row.iconAssetId) await this.assets.removeAsAdmin(row.iconAssetId).catch(() => undefined); await this.audit(admin.id, request, 'tool.delete', id, { key: row.key }); return { deleted: true } }

  @Get('tool-approval-requests')
  toolApprovalRequests() {
    return this.prisma.toolApprovalRequest.findMany({ orderBy: [{ status: 'desc' }, { createdAt: 'desc' }], take: 500, include: { user: { select: { id: true, email: true, displayName: true } }, tool: { select: { id: true, key: true, name: true } }, assistant: { select: { id: true, name: true } }, reviewedBy: { select: { id: true, displayName: true } } } })
  }

  @Patch('tool-approval-requests/:id')
  async reviewToolApproval(@CurrentUser() admin: AuthenticatedUser, @Req() request: FastifyRequest, @Param('id') id: string, @Body() body: ReviewToolApprovalDto) {
    const current = await this.prisma.toolApprovalRequest.findUnique({ where: { id }, select: { id: true, status: true } })
    if (!current) throw new NotFoundException('审批申请不存在')
    if (current.status !== 'PENDING') throw new BadRequestException('该审批申请已经处理')
    const expiresAt = body.status === 'APPROVED' ? new Date(Date.now() + (body.expiresInMinutes || 1440) * 60_000) : null
    const row = await this.prisma.toolApprovalRequest.update({ where: { id }, data: { status: body.status, adminNote: body.adminNote?.trim() || '', reviewedById: admin.id, reviewedAt: new Date(), expiresAt }, include: { user: { select: { id: true, email: true, displayName: true } }, tool: { select: { id: true, key: true, name: true } }, assistant: { select: { id: true, name: true } }, reviewedBy: { select: { id: true, displayName: true } } } })
    await this.audit(admin.id, request, `tool-approval.${body.status.toLowerCase()}`, id, { status: body.status, expiresAt: expiresAt?.toISOString() || null })
    return row
  }

  @Get('knowledge-bases')
  knowledgeBases() { return this.prisma.knowledgeBase.findMany({ orderBy: { updatedAt: 'desc' }, include: { creator: { select: { id: true, email: true, displayName: true } }, team: { select: { id: true, name: true } }, assets: { orderBy: { createdAt: 'desc' }, include: { asset: { select: { id: true, name: true, mimeType: true, createdAt: true } } } }, assistants: { include: { assistant: { select: { id: true, name: true, enabled: true } } } }, _count: { select: { assets: true, assistants: true } } } }) }

  @Get('tool-calls')
  toolCalls() { return this.prisma.toolCallAudit.findMany({ orderBy: { createdAt: 'desc' }, take: 200, include: { user: { select: { email: true, displayName: true } }, tool: { select: { key: true, name: true } }, assistant: { select: { name: true } } } }) }

  private audit(actorId: string, request: FastifyRequest, action: string, targetId: string, after: Record<string, unknown>) { return this.prisma.auditLog.create({ data: { actorId, action, targetType: 'workspace', targetId, ipAddress: request.ip, userAgent: request.headers['user-agent'], after: after as Prisma.InputJsonValue } }) }
  private cleanHeaders(value?: Record<string, string>) { return Object.fromEntries(Object.entries(value || {}).map(([key, item]) => [key.trim(), String(item).trim()]).filter(([key, item]) => key && item && !/[\r\n]/.test(key + item))) }
  private readHeaders(value: string) { if (!value) return {}; try { return this.cleanHeaders(JSON.parse(this.crypto.decrypt(value))) } catch { return {} } }
  private headerHints(value: Record<string, string>) { return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, this.crypto.hint(item)])) }
}
