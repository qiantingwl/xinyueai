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

class KnowledgeBaseDto { @IsString() @MinLength(1) @MaxLength(100) name!: string; @IsOptional() @IsString() @MaxLength(2000) description?: string }
class KnowledgeBaseAssetDto { @IsString() @MinLength(1) @MaxLength(100) assetId!: string }
class ToolCallDto { @IsOptional() @IsObject() input?: Record<string, unknown>; @IsOptional() @IsString() approvalRequestId?: string }
class ConnectorCredentialDto { @IsObject() credentials!: Record<string, string> }
class ToolApprovalRequestDto { @IsOptional() @IsString() @MaxLength(1000) reason?: string }
class TeamDto { @IsString() @MinLength(1) @MaxLength(100) name!: string; @IsOptional() @IsString() @MaxLength(2000) description?: string }
class TeamMemberDto { @IsEmail() email!: string; @IsOptional() @IsIn(['ADMIN', 'MEMBER']) role?: string }
class TeamRoleDto { @IsIn(['ADMIN', 'MEMBER']) role!: string }
class ToolDto {
  @IsString() @MinLength(2) @MaxLength(80) key!: string
  @IsString() @MinLength(1) @MaxLength(100) name!: string
  @IsOptional() @IsString() @MaxLength(2000) description?: string
  @IsOptional() @IsString() @MaxLength(80) icon?: string
  @IsOptional() @IsIn(['BUILT_IN', 'CONNECTOR']) kind?: string
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
  constructor(private readonly prisma: PrismaService, private readonly assets: AssetsService, private readonly officeExports: OfficeExportService, private readonly crypto: CredentialCryptoService) {}

  @Post('office/exports')
  exportOffice(@CurrentUser() user: AuthenticatedUser, @Body() body: OfficeExportDto) { return this.officeExports.create(user.id, body) }

  @Get('assistants')
  assistants() { return this.prisma.assistant.findMany({ where: { enabled: true, visibility: 'PUBLIC' }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }], select: { id: true, name: true, description: true, defaultModel: true, templateIds: true, tools: { select: { toolId: true } } } }) }

  @Get('assistants/tools')
  async tools(@CurrentUser() user: AuthenticatedUser) {
    const rows = await this.prisma.toolDefinition.findMany({ where: { authType: { not: 'OAUTH2' }, OR: [{ enabled: true }, { kind: 'CONNECTOR' }] }, orderBy: [{ enabled: 'desc' }, { name: 'asc' }], select: { id: true, key: true, name: true, description: true, icon: true, kind: true, authType: true, documentationUrl: true, credentialFields: true, requiresApproval: true, scopes: true, enabled: true, credentials: { where: { userId: user.id }, select: { status: true, credentialHints: true, connectedAt: true } } } })
    return rows.map(({ credentials, ...tool }) => ({ ...tool, connection: credentials[0] || null }))
  }

  @Get('assistants/tools/:toolId/icon')
  async toolIcon(@Param('toolId') toolId: string) {
    const tool = await this.prisma.toolDefinition.findFirst({ where: { id: toolId, OR: [{ enabled: true }, { kind: 'CONNECTOR' }] }, select: { iconAssetId: true } })
    if (!tool?.iconAssetId) throw new NotFoundException('连接器图标不存在')
    const result = await this.assets.readForAdmin(tool.iconAssetId)
    return new StreamableFile(result.file, { type: result.mimeType, disposition: assetDisposition(result.mimeType, result.name) })
  }

  @Post('assistants/tools/:toolId/credentials')
  async connectTool(@CurrentUser() user: AuthenticatedUser, @Param('toolId') toolId: string, @Body() body: ConnectorCredentialDto) {
    const tool = await this.prisma.toolDefinition.findFirst({ where: { id: toolId, kind: 'CONNECTOR', authType: 'API_KEY' }, select: { id: true, enabled: true, credentialFields: true } })
    if (!tool) throw new NotFoundException('连接器不存在或不支持 API Key 授权')
    const fields = Array.isArray(tool.credentialFields) ? tool.credentialFields as Array<Record<string, unknown>> : []
    const allowed = new Set(fields.map((field) => String(field.key || '')).filter(Boolean))
    const required = fields.filter((field) => field.required !== false).map((field) => String(field.key || '')).filter(Boolean)
    const credentials = Object.fromEntries(Object.entries(body.credentials).filter(([key, value]) => allowed.has(key) && typeof value === 'string' && value.trim()).map(([key, value]) => [key, value.trim()]))
    if (!Object.keys(credentials).length || required.some((key) => !credentials[key])) throw new BadRequestException('请完整填写连接器授权信息')
    const hints = Object.fromEntries(Object.entries(credentials).map(([key, value]) => [key, value.length > 4 ? `••••${value.slice(-4)}` : '••••']))
    await this.prisma.connectorCredential.upsert({ where: { userId_toolId: { userId: user.id, toolId } }, create: { userId: user.id, toolId, encryptedCredentials: this.crypto.encrypt(JSON.stringify(credentials)), credentialHints: hints as Prisma.InputJsonValue }, update: { encryptedCredentials: this.crypto.encrypt(JSON.stringify(credentials)), credentialHints: hints as Prisma.InputJsonValue, status: 'CONNECTED', connectedAt: new Date() } })
    return { connected: true, configured: tool.enabled, status: 'CONNECTED', credentialHints: hints }
  }

  @Delete('assistants/tools/:toolId/credentials')
  async disconnectTool(@CurrentUser() user: AuthenticatedUser, @Param('toolId') toolId: string) {
    await this.prisma.connectorCredential.deleteMany({ where: { userId: user.id, toolId } })
    return { disconnected: true }
  }

  @Get('knowledge-bases')
  knowledgeBases(@CurrentUser() user: AuthenticatedUser) { return this.prisma.knowledgeBase.findMany({ where: { creatorId: user.id }, orderBy: { updatedAt: 'desc' }, include: { assets: { orderBy: { createdAt: 'desc' }, include: { asset: { select: { id: true, name: true, mimeType: true, createdAt: true } } } }, _count: { select: { assets: true, assistants: true } } } }) }

  @Post('knowledge-bases')
  createKnowledgeBase(@CurrentUser() user: AuthenticatedUser, @Body() body: KnowledgeBaseDto) { return this.prisma.knowledgeBase.create({ data: { creatorId: user.id, name: body.name.trim(), description: body.description?.trim() || '' } }) }

  @Patch('knowledge-bases/:id')
  async updateKnowledgeBase(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: KnowledgeBaseDto) {
    const result = await this.prisma.knowledgeBase.updateMany({ where: { id, creatorId: user.id }, data: { name: body.name.trim(), description: body.description?.trim() || '' } })
    if (!result.count) throw new NotFoundException('知识库不存在')
    return this.prisma.knowledgeBase.findUniqueOrThrow({ where: { id } })
  }

  @Delete('knowledge-bases/:id')
  async deleteKnowledgeBase(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const result = await this.prisma.knowledgeBase.deleteMany({ where: { id, creatorId: user.id } })
    if (!result.count) throw new NotFoundException('知识库不存在')
    return { deleted: true }
  }

  @Post('knowledge-bases/:id/assets')
  async attachAsset(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: KnowledgeBaseAssetDto) {
    const [knowledgeBase, asset] = await Promise.all([
      this.prisma.knowledgeBase.findFirst({ where: { id, creatorId: user.id }, select: { id: true } }),
      this.prisma.asset.findFirst({ where: { id: body.assetId, userId: user.id, deletedAt: null }, select: { id: true } }),
    ])
    if (!knowledgeBase || !asset) throw new NotFoundException('知识库或文件不存在')
    const existing = await this.prisma.knowledgeBaseAsset.findUnique({ where: { knowledgeBaseId_assetId: { knowledgeBaseId: id, assetId: body.assetId } } })
    if (existing) return { attached: true, alreadyAttached: true }
    let extractedText = ''
    if (asset) {
      const content = await this.assets.readForUser(user.id, asset.id)
      if (content.mimeType.startsWith('text/') || content.mimeType === 'application/json') extractedText = content.file.toString('utf8').slice(0, 2_000_000)
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
    const knowledgeBase = await this.prisma.knowledgeBase.findFirst({ where: { id, creatorId: user.id }, select: { id: true } })
    if (!knowledgeBase) throw new NotFoundException('知识库不存在')
    const asset = await this.prisma.knowledgeBaseAsset.findUnique({ where: { knowledgeBaseId_assetId: { knowledgeBaseId: id, assetId } }, select: { chunkCount: true } })
    const result = await this.prisma.knowledgeBaseAsset.deleteMany({ where: { knowledgeBaseId: id, assetId } })
    if (result.count) {
      await this.prisma.knowledgeBase.update({ where: { id }, data: { documentCount: { decrement: 1 }, chunkCount: { decrement: asset?.chunkCount || 0 } } })
    }
    return { detached: result.count > 0 }
  }

  @Get('teams')
  teams(@CurrentUser() user: AuthenticatedUser) { return this.prisma.team.findMany({ where: { OR: [{ ownerId: user.id }, { members: { some: { userId: user.id } } }] }, orderBy: { updatedAt: 'desc' }, include: { members: { include: { user: { select: { id: true, email: true, displayName: true, avatarUrl: true } } } } } }) }

  @Post('teams')
  async createTeam(@CurrentUser() user: AuthenticatedUser, @Body() body: TeamDto) {
    const slug = `${body.name.trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-').replace(/^-|-$/g, '').slice(0, 54) || 'team'}-${Math.random().toString(36).slice(2, 8)}`
    return this.prisma.team.create({ data: { ownerId: user.id, name: body.name.trim(), slug, description: body.description?.trim() || '', members: { create: { userId: user.id, role: 'OWNER' } } }, include: { members: true } })
  }

  @Post('teams/:id/members')
  async addMember(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: TeamMemberDto) {
    const team = await this.prisma.team.findFirst({ where: { id, ownerId: user.id }, select: { id: true } })
    if (!team) throw new ForbiddenException('只有团队所有者可以管理成员')
    const member = await this.prisma.user.findUnique({ where: { email: body.email.trim().toLowerCase() }, select: { id: true, email: true, displayName: true } })
    if (!member) throw new NotFoundException('该邮箱尚未注册')
    if (member.id === user.id) throw new BadRequestException('所有者已经在团队中')
    return this.prisma.teamMember.upsert({ where: { teamId_userId: { teamId: id, userId: member.id } }, update: { role: body.role || 'MEMBER' }, create: { teamId: id, userId: member.id, role: body.role || 'MEMBER' }, include: { user: { select: { id: true, email: true, displayName: true, avatarUrl: true } } } })
  }

  @Patch('teams/:id')
  async updateTeam(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: TeamDto) {
    const team = await this.prisma.team.findFirst({ where: { id, ownerId: user.id }, select: { id: true } })
    if (!team) throw new ForbiddenException('只有团队所有者可以编辑团队')
    return this.prisma.team.update({ where: { id }, data: { name: body.name.trim(), description: body.description?.trim() || '' }, include: { members: { include: { user: { select: { id: true, email: true, displayName: true, avatarUrl: true } } } } } })
  }

  @Delete('teams/:id')
  async deleteTeam(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const result = await this.prisma.team.deleteMany({ where: { id, ownerId: user.id } })
    if (!result.count) throw new NotFoundException('团队不存在')
    return { deleted: true }
  }

  @Patch('teams/:id/members/:userId')
  async updateMemberRole(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Param('userId') userId: string, @Body() body: TeamRoleDto) {
    const team = await this.prisma.team.findFirst({ where: { id, ownerId: user.id }, select: { id: true } })
    if (!team) throw new ForbiddenException('只有团队所有者可以管理成员')
    const member = await this.prisma.teamMember.findUnique({ where: { teamId_userId: { teamId: id, userId } } })
    if (!member) throw new NotFoundException('团队成员不存在')
    if (member.role === 'OWNER') throw new BadRequestException('不能修改所有者角色')
    return this.prisma.teamMember.update({ where: { teamId_userId: { teamId: id, userId } }, data: { role: body.role } })
  }

  @Delete('teams/:id/members/:userId')
  async removeMember(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Param('userId') userId: string) {
    const team = await this.prisma.team.findFirst({ where: { id, ownerId: user.id }, select: { id: true } })
    if (!team) throw new ForbiddenException('只有团队所有者可以管理成员')
    const result = await this.prisma.teamMember.deleteMany({ where: { teamId: id, userId, role: { not: 'OWNER' } } })
    return { removed: result.count > 0 }
  }

  @Post('teams/:id/leave')
  async leaveTeam(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const team = await this.prisma.team.findUnique({ where: { id }, select: { ownerId: true } })
    if (!team) throw new NotFoundException('团队不存在')
    if (team.ownerId === user.id) throw new BadRequestException('所有者不能退出团队，请先删除团队')
    const result = await this.prisma.teamMember.deleteMany({ where: { teamId: id, userId: user.id } })
    if (!result.count) throw new NotFoundException('你不是该团队成员')
    return { left: true }
  }

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
    if (!binding.tool.endpoint) throw new NotFoundException('工具尚未配置 Endpoint')
    const started = Date.now(); let status = 'FAILED'; let output: unknown = null; let error = ''
    try { const response = await fetch(binding.tool.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body.input || {}), signal: AbortSignal.timeout(30_000) }); const text = await response.text(); output = text.slice(0, 100_000); if (!response.ok) throw new Error(`工具返回 ${response.status}`); status = 'SUCCEEDED' } catch (reason) { error = reason instanceof Error ? reason.message : '工具调用失败' }
    const audit = await this.prisma.toolCallAudit.create({ data: { userId: user.id, toolId, assistantId, status, input: (body.input || {}) as Prisma.InputJsonValue, output: output as Prisma.InputJsonValue, error: error || null, durationMs: Date.now() - started } })
    if (status === 'FAILED') throw new ForbiddenException(error || '工具调用失败')
    return { id: audit.id, status, output }
  }
}

@Controller('admin')
@UseGuards(AuthGuard, AdminGuard)
export class AdminWorkspaceController {
  constructor(private readonly prisma: PrismaService, private readonly crypto: CredentialCryptoService, private readonly assets: AssetsService) {}

  @Get('assistants')
  assistants() { return this.prisma.assistant.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }], include: { tools: { select: { toolId: true } }, knowledgeBases: { select: { knowledgeBaseId: true } }, _count: { select: { knowledgeBases: true, tools: true } } } }) }

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
  async createTool(@CurrentUser() admin: AuthenticatedUser, @Req() request: FastifyRequest, @Body() body: ToolDto) { const secrets = this.cleanHeaders(body.secretHeaders); const row = await this.prisma.toolDefinition.create({ data: { key: body.key.trim(), name: body.name.trim(), description: body.description?.trim() || '', icon: body.icon?.trim() || 'wrench', kind: body.kind || 'BUILT_IN', authType: body.authType || 'NONE', documentationUrl: body.documentationUrl?.trim() || '', credentialFields: (body.credentialFields || []) as Prisma.InputJsonValue, endpoint: body.endpoint?.trim() || '', httpMethod: body.httpMethod || 'POST', timeoutMs: body.timeoutMs ?? 45000, headers: this.cleanHeaders(body.headers) as Prisma.InputJsonValue, encryptedHeaders: Object.keys(secrets).length ? this.crypto.encrypt(JSON.stringify(secrets)) : '', secretHeaderHints: this.headerHints(secrets) as Prisma.InputJsonValue, inputSchema: body.inputSchema as Prisma.InputJsonValue, scopes: (body.scopes || []) as Prisma.InputJsonValue, enabled: body.enabled ?? false, requiresApproval: body.requiresApproval ?? true } }); await this.audit(admin.id, request, 'tool.create', row.id, { key: row.key }); return { ...await this.prisma.toolDefinition.findUniqueOrThrow({ where: { id: row.id }, include: { _count: { select: { assistants: true, calls: true } } } }), encryptedHeaders: undefined, hasSecretHeaders: Boolean(row.encryptedHeaders) } }

  @Patch('tools/:id')
  async updateTool(@CurrentUser() admin: AuthenticatedUser, @Req() request: FastifyRequest, @Param('id') id: string, @Body() body: ToolDto) { const current = await this.prisma.toolDefinition.findUnique({ where: { id } }); if (!current) throw new NotFoundException('工具不存在'); const supplied = this.cleanHeaders(body.secretHeaders); const merged = body.clearSecretHeaders ? {} : body.secretHeaders === undefined ? null : { ...this.readHeaders(current.encryptedHeaders), ...supplied }; const row = await this.prisma.toolDefinition.update({ where: { id }, data: { key: body.key.trim(), name: body.name.trim(), description: body.description?.trim() || '', icon: body.icon?.trim() || 'wrench', kind: body.kind || 'BUILT_IN', authType: body.authType || 'NONE', documentationUrl: body.documentationUrl?.trim() || '', credentialFields: (body.credentialFields || []) as Prisma.InputJsonValue, endpoint: body.endpoint?.trim() || '', httpMethod: body.httpMethod || 'POST', timeoutMs: body.timeoutMs ?? 45000, headers: this.cleanHeaders(body.headers) as Prisma.InputJsonValue, ...(merged ? { encryptedHeaders: Object.keys(merged).length ? this.crypto.encrypt(JSON.stringify(merged)) : '', secretHeaderHints: this.headerHints(merged) as Prisma.InputJsonValue } : {}), inputSchema: body.inputSchema as Prisma.InputJsonValue, scopes: (body.scopes || []) as Prisma.InputJsonValue, enabled: body.enabled ?? false, requiresApproval: body.requiresApproval ?? true } }); await this.audit(admin.id, request, 'tool.update', id, { key: row.key, enabled: row.enabled }); return { ...await this.prisma.toolDefinition.findUniqueOrThrow({ where: { id }, include: { _count: { select: { assistants: true, calls: true } } } }), encryptedHeaders: undefined, hasSecretHeaders: Boolean(row.encryptedHeaders) } }

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
  knowledgeBases() { return this.prisma.knowledgeBase.findMany({ orderBy: { updatedAt: 'desc' }, include: { creator: { select: { id: true, email: true, displayName: true } }, assets: { orderBy: { createdAt: 'desc' }, include: { asset: { select: { id: true, name: true, mimeType: true, createdAt: true } } } }, assistants: { include: { assistant: { select: { id: true, name: true, enabled: true } } } }, _count: { select: { assets: true, assistants: true } } } }) }

  @Get('tool-calls')
  toolCalls() { return this.prisma.toolCallAudit.findMany({ orderBy: { createdAt: 'desc' }, take: 200, include: { user: { select: { email: true, displayName: true } }, tool: { select: { key: true, name: true } }, assistant: { select: { name: true } } } }) }

  private audit(actorId: string, request: FastifyRequest, action: string, targetId: string, after: Record<string, unknown>) { return this.prisma.auditLog.create({ data: { actorId, action, targetType: 'workspace', targetId, ipAddress: request.ip, userAgent: request.headers['user-agent'], after: after as Prisma.InputJsonValue } }) }
  private cleanHeaders(value?: Record<string, string>) { return Object.fromEntries(Object.entries(value || {}).map(([key, item]) => [key.trim(), String(item).trim()]).filter(([key, item]) => key && item && !/[\r\n]/.test(key + item))) }
  private readHeaders(value: string) { if (!value) return {}; try { return this.cleanHeaders(JSON.parse(this.crypto.decrypt(value))) } catch { return {} } }
  private headerHints(value: Record<string, string>) { return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, this.crypto.hint(item)])) }
}
