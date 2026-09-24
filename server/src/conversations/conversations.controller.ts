import { Body, Controller, Delete, ForbiddenException, Get, NotFoundException, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator'
import { randomBytes } from 'node:crypto'
import { AuthGuard } from '../auth/auth.guard'
import { CurrentUser, AuthenticatedUser } from '../common/request-user'
import { ModerationService } from '../moderation/moderation.service'
import { PrismaService } from '../prisma/prisma.service'
import { publicGenerationListSelect, toPublicGeneration } from '../generations/public-generation.dto'
import { ResourceAccessService } from '../common/resource-access.service'
import { publicAssetSelect } from '../assets/public-asset.dto'
import { toPublicMessage } from './public-message.dto'
import { Public } from '../auth/public.decorator'

class CreateConversationDto { @IsOptional() @IsString() @MinLength(1) @MaxLength(100) projectId?: string; @IsOptional() @IsString() @Matches(/\S/) @MaxLength(160) model?: string; @IsOptional() @IsString() @Matches(/\S/) @MaxLength(120) title?: string; @IsOptional() @IsBoolean() temporary?: boolean }
class AddMessageDto { @IsString() @Matches(/\S/) @MinLength(1) @MaxLength(50_000) content!: string; @IsOptional() @IsString() @MaxLength(100) parentId?: string; @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @IsNotEmpty({ each: true }) assetIds?: string[] }
class BranchMessageDto { @IsOptional() @IsString() @Matches(/\S/) @MinLength(1) @MaxLength(50_000) content?: string }
class MessageFeedbackDto { @IsOptional() @IsIn(['UP', 'DOWN']) value?: 'UP' | 'DOWN' | null }
class UpdateConversationDto {
  @IsOptional() @IsString() @Matches(/\S/) @MinLength(1) @MaxLength(120) title?: string
  @IsOptional() @IsString() @Matches(/\S/) @MinLength(1) @MaxLength(80) model?: string
  @IsOptional() @IsBoolean() pinned?: boolean
  @IsOptional() @IsBoolean() archived?: boolean
}

@Controller('conversations')
@UseGuards(AuthGuard)
export class ConversationsController {
  constructor(private readonly prisma: PrismaService, private readonly moderation: ModerationService, private readonly access: ResourceAccessService) {}
  @Get() async list(@CurrentUser() user: AuthenticatedUser, @Query('archived') archived?: string) {
    const settings = await this.prisma.userSettings.findUnique({ where: { userId: user.id }, select: { dataRetentionDays: true } })
    await this.prisma.conversation.deleteMany({ where: { userId: user.id, temporary: true, expiresAt: { lt: new Date() } } })
    if (settings?.dataRetentionDays) await this.prisma.conversation.deleteMany({ where: { userId: user.id, temporary: false, updatedAt: { lt: new Date(Date.now() - settings.dataRetentionDays * 86_400_000) } } })
    return this.prisma.conversation.findMany({ where: { userId: user.id, archivedAt: archived === 'true' ? { not: null } : null, temporary: false }, orderBy: [{ pinnedAt: { sort: 'desc', nulls: 'last' } }, { updatedAt: 'desc' }], take: 100, select: { id: true, title: true, model: true, projectId: true, temporary: true, pinnedAt: true, sharedAt: true, archivedAt: true, createdAt: true, updatedAt: true } })
  }
  @Delete() async clear(@CurrentUser() user: AuthenticatedUser) {
    const result = await this.prisma.conversation.deleteMany({ where: { userId: user.id } })
    return { deleted: result.count }
  }
  @Post() async create(@CurrentUser() user: AuthenticatedUser, @Body() body: CreateConversationDto) {
    if (body.projectId) {
      const project = await this.prisma.project.findFirst({ where: { id: body.projectId, archivedAt: null, ...this.access.projectWhere(user.id) }, select: { id: true } })
      if (!project) throw new NotFoundException('项目不存在')
    }
    const [settings, userSettings] = await Promise.all([
      this.prisma.systemSetting.findUnique({ where: { id: 'global' } }),
      this.prisma.userSettings.findUnique({ where: { userId: user.id } }),
    ])
    const temporary = body.temporary ?? userSettings?.temporaryChatDefault ?? (userSettings ? !userSettings.chatHistoryEnabled : false)
    const retentionHours = Math.max(1, settings?.temporaryChatRetentionHours || 24)
    return this.prisma.conversation.create({
      data: { userId: user.id, projectId: body.projectId, title: body.title?.trim() || '新对话', model: body.model?.trim() || process.env.AI_CHAT_MODEL || 'gpt-4.1', temporary, expiresAt: temporary ? new Date(Date.now() + retentionHours * 3_600_000) : null },
      select: { id: true, title: true, model: true, projectId: true, temporary: true, pinnedAt: true, sharedAt: true, archivedAt: true, createdAt: true, updatedAt: true },
    })
  }
  @Get(':id') async get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const conversation = await this.prisma.conversation.findFirst({ where: this.readableConversationWhere(user.id, id), include: { project: { select: { userId: true } }, messages: { where: { deletedAt: null }, orderBy: { createdAt: 'asc' }, include: { author: { select: { id: true, displayName: true } }, attachments: { include: { asset: { select: publicAssetSelect } } } } }, jobs: { where: { kind: { in: ['IMAGE', 'VIDEO', 'COMMERCE', 'CHAT'] } }, orderBy: { createdAt: 'desc' }, take: 100, select: publicGenerationListSelect } } })
    if (!conversation) throw new NotFoundException('对话不存在')
    const auditReadOnly = conversation.userId !== user.id
    const { jobs } = conversation
    const visibleMessages = conversation.activeLeafId
      ? (() => {
          const byId = new Map(conversation.messages.map((message) => [message.id, message]))
          const ids = new Set<string>()
          let cursor = byId.get(conversation.activeLeafId)
          while (cursor && !ids.has(cursor.id)) { ids.add(cursor.id); cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined }
          return ids.size ? conversation.messages.filter((message) => ids.has(message.id)) : conversation.messages
        })()
      : conversation.messages
    const branchGroups = new Map<string, Array<{ id: string; branchIndex: number }>>()
    for (const message of conversation.messages) {
      const key = message.parentId || '__root__'
      const group = branchGroups.get(key) || []
      group.push({ id: message.id, branchIndex: message.branchIndex })
      branchGroups.set(key, group)
    }
    for (const group of branchGroups.values()) group.sort((left, right) => left.branchIndex - right.branchIndex)
    return {
      id: conversation.id,
      projectId: conversation.projectId,
      title: conversation.title,
      model: conversation.model,
      temporary: conversation.temporary,
      pinnedAt: conversation.pinnedAt,
      sharedAt: conversation.sharedAt,
      archivedAt: conversation.archivedAt,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      auditReadOnly,
      messages: visibleMessages.map((message) => toPublicMessage(message, { branches: branchGroups.get(message.parentId || '__root__') })),
      generationJobs: jobs.map((job) => toPublicGeneration(job)),
    }
  }
  @Post(':id/messages') async message(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: AddMessageDto) {
    await this.moderation.inspect(user.id, 'CHAT', body.content, { conversationId: id, entry: 'message' })
    const conversation = await this.prisma.conversation.findFirst({ where: { id, userId: user.id } })
    if (!conversation) throw new NotFoundException('对话不存在')
    if (body.assetIds?.length) {
      const count = await this.prisma.asset.count({ where: { id: { in: body.assetIds }, deletedAt: null, ...this.access.assetWhere(user.id) } })
      if (count !== body.assetIds.length) throw new NotFoundException('附件不存在')
    }
    return this.prisma.$transaction(async (tx) => {
      const parentId = body.parentId || conversation.activeLeafId || undefined
      if (parentId) {
        const parent = await tx.message.findFirst({ where: { id: parentId, conversationId: id, deletedAt: null }, select: { id: true } })
        if (!parent) throw new NotFoundException('消息分支父节点不存在')
      }
      const branchIndex = parentId ? await tx.message.count({ where: { conversationId: id, parentId, deletedAt: null } }) : await tx.message.count({ where: { conversationId: id, parentId: null, deletedAt: null } })
      const message = await tx.message.create({ data: { conversationId: id, authorId: user.id, role: 'USER', content: body.content, parentId, branchIndex, attachments: body.assetIds?.length ? { create: body.assetIds.map((assetId) => ({ assetId })) } : undefined }, include: { attachments: true } })
      await tx.conversation.update({ where: { id }, data: { activeLeafId: message.id, updatedAt: new Date() } })
      return toPublicMessage(message)
    })
  }
  @Post(':id/messages/:messageId/branch')
  async branchMessage(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Param('messageId') messageId: string, @Body() body: BranchMessageDto) {
    const conversation = await this.prisma.conversation.findFirst({ where: { id, userId: user.id }, select: { id: true } })
    if (!conversation) throw new NotFoundException('对话不存在')
    const messages = await this.prisma.message.findMany({ where: { conversationId: id, deletedAt: null }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: { id: true, role: true, content: true, authorId: true, parentId: true, branchIndex: true, attachments: { select: { assetId: true } } } })
    const messageIndex = messages.findIndex((message) => message.id === messageId)
    const target = messages[messageIndex]
    if (!target || target.role !== 'USER' || (target.authorId && target.authorId !== user.id)) throw new NotFoundException('用户消息不存在')
    const content = body.content?.trim() || target.content
    await this.moderation.inspect(user.id, 'CHAT', content, { conversationId: id, messageId, entry: 'branch' })
    return this.prisma.$transaction(async (tx) => {
      const branchIndex = await tx.message.count({ where: { conversationId: id, parentId: target.parentId, deletedAt: null } })
      const updated = await tx.message.create({ data: { conversationId: id, authorId: user.id, role: 'USER', content, parentId: target.parentId, branchIndex, attachments: target.attachments.length ? { create: target.attachments.map((attachment) => ({ assetId: attachment.assetId })) } : undefined } })
      await tx.conversation.update({ where: { id }, data: { activeLeafId: updated.id, updatedAt: new Date() } })
      return toPublicMessage(updated, { branchCount: branchIndex + 1 })
    })
  }
  @Post(':id/messages/:messageId/activate')
  async activateBranch(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Param('messageId') messageId: string) {
    const conversation = await this.prisma.conversation.findFirst({ where: { id, userId: user.id }, select: { id: true } })
    if (!conversation) throw new NotFoundException('对话不存在')
    const messages = await this.prisma.message.findMany({ where: { conversationId: id, deletedAt: null }, orderBy: [{ branchIndex: 'asc' }, { createdAt: 'asc' }], select: { id: true, parentId: true, branchIndex: true, createdAt: true } })
    const target = messages.find((message) => message.id === messageId)
    if (!target) throw new NotFoundException('消息分支不存在')
    const children = new Map<string, typeof messages>()
    for (const message of messages) {
      if (!message.parentId) continue
      const rows = children.get(message.parentId) || []
      rows.push(message)
      children.set(message.parentId, rows)
    }
    let leaf = target
    const visited = new Set<string>()
    while (!visited.has(leaf.id)) {
      visited.add(leaf.id)
      const next = children.get(leaf.id)?.at(-1)
      if (!next) break
      leaf = next
    }
    await this.prisma.conversation.update({ where: { id }, data: { activeLeafId: leaf.id, updatedAt: new Date() } })
    return { activeLeafId: leaf.id }
  }
  @Delete(':id/messages/:messageId')
  async softDeleteMessage(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Param('messageId') messageId: string) {
    const conversation = await this.prisma.conversation.findFirst({ where: { id, userId: user.id, projectId: { not: null }, project: { is: this.access.projectWhere(user.id) } }, select: { id: true } })
    if (!conversation) throw new ForbiddenException('只有项目成员可以删除自己的提问')
    const messages = await this.prisma.message.findMany({ where: { conversationId: id, deletedAt: null }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: { id: true, role: true, authorId: true } })
    const index = messages.findIndex((message) => message.id === messageId && message.role === 'USER' && (!message.authorId || message.authorId === user.id))
    if (index < 0) throw new NotFoundException('提问不存在或已删除')
    const relatedIds = [messages[index].id]
    for (const message of messages.slice(index + 1)) {
      if (message.role === 'USER') break
      relatedIds.push(message.id)
    }
    await this.prisma.message.updateMany({ where: { id: { in: relatedIds }, conversationId: id, deletedAt: null }, data: { deletedAt: new Date(), deletedById: user.id } })
    return { id: messageId, deleted: true, deletedCount: relatedIds.length }
  }
  @Patch(':id/messages/:messageId/feedback')
  async feedback(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Param('messageId') messageId: string, @Body() body: MessageFeedbackDto) {
    const message = await this.prisma.message.findFirst({ where: { id: messageId, conversationId: id, role: 'ASSISTANT', deletedAt: null, conversation: { userId: user.id } }, select: { id: true, metadata: true } })
    if (!message) throw new NotFoundException('助手消息不存在')
    const metadata = message.metadata && typeof message.metadata === 'object' && !Array.isArray(message.metadata) ? message.metadata as Record<string, unknown> : {}
    await this.prisma.message.update({ where: { id: message.id }, data: { metadata: { ...metadata, feedback: body.value || null } } })
    return { id: message.id, feedback: body.value || null }
  }
  @Patch(':id') async update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: UpdateConversationDto) {
    const result = await this.prisma.conversation.updateMany({ where: { id, userId: user.id }, data: { title: body.title?.trim(), model: body.model, pinnedAt: body.pinned === undefined ? undefined : body.pinned ? new Date() : null, archivedAt: body.archived === undefined ? undefined : body.archived ? new Date() : null } })
    if (!result.count) throw new NotFoundException('对话不存在')
    return { updated: true }
  }
  @Post(':id/share') async share(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const conversation = await this.prisma.conversation.findFirst({ where: { id, userId: user.id, temporary: false }, select: { id: true, shareToken: true } })
    if (!conversation) throw new NotFoundException('对话不存在或临时聊天不可分享')
    const shareToken = conversation.shareToken || randomBytes(24).toString('base64url')
    const sharedAt = new Date()
    await this.prisma.conversation.update({ where: { id }, data: { shareToken, sharedAt } })
    return { token: shareToken, sharedAt }
  }
  @Delete(':id/share') async revokeShare(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const result = await this.prisma.conversation.updateMany({ where: { id, userId: user.id }, data: { shareToken: null, sharedAt: null } })
    if (!result.count) throw new NotFoundException('对话不存在')
    return { revoked: true }
  }
  @Delete(':id') async archive(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { const result = await this.prisma.conversation.updateMany({ where: { id, userId: user.id }, data: { archivedAt: new Date() } }); if (!result.count) throw new NotFoundException('对话不存在'); return { archived: true } }
  @Delete(':id/permanent') async remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const result = await this.prisma.conversation.deleteMany({ where: { id, userId: user.id } })
    if (!result.count) throw new NotFoundException('对话不存在')
    return { deleted: true }
  }

  private readableConversationWhere(userId: string, id: string): Prisma.ConversationWhereInput {
    return { id, OR: [{ userId }, { project: { is: this.access.projectWhere(userId) } }] }
  }
}

@Public()
@Controller('shares')
export class ConversationSharesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(':token') async get(@Param('token') token: string) {
    const conversation = await this.prisma.conversation.findFirst({
      where: { shareToken: token, sharedAt: { not: null }, archivedAt: null, temporary: false },
      select: {
        title: true,
        model: true,
        createdAt: true,
        sharedAt: true,
        messages: { where: { deletedAt: null }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: { id: true, role: true, content: true, model: true, createdAt: true } },
      },
    })
    if (!conversation) throw new NotFoundException('共享对话不存在或已停止共享')
    return conversation
  }
}
