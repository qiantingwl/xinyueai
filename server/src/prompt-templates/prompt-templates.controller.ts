import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common'
import { ArrayMaxSize, IsArray, IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator'
import { Prisma } from '@prisma/client'
import type { FastifyRequest } from 'fastify'
import { AuthGuard } from '../auth/auth.guard'
import { CurrentUser, AuthenticatedUser } from '../common/request-user'
import { AdminGuard } from '../admin/admin.guard'
import { PrismaService } from '../prisma/prisma.service'
import { DEFAULT_PROMPT_TEMPLATES } from './default-prompt-templates'
import { Public } from '../auth/public.decorator'

class PromptTemplateDto {
  @IsString() @MinLength(1) @MaxLength(100) title!: string
  @IsOptional() @IsString() @MaxLength(1000) description?: string
  @IsString() @MinLength(1) @MaxLength(20000) prompt!: string
  @IsOptional() @IsString() @MaxLength(50) category?: string
  @IsOptional() @IsArray() @ArrayMaxSize(30) @IsString({ each: true }) variables?: string[]
  @IsOptional() @IsBoolean() enabled?: boolean
  @IsOptional() @IsInt() @Min(0) @Max(100000) sortOrder?: number
}

class PromptTemplateUpdateDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) title?: string
  @IsOptional() @IsString() @MaxLength(1000) description?: string
  @IsOptional() @IsString() @MinLength(1) @MaxLength(20000) prompt?: string
  @IsOptional() @IsString() @MaxLength(50) category?: string
  @IsOptional() @IsArray() @ArrayMaxSize(30) @IsString({ each: true }) variables?: string[]
  @IsOptional() @IsBoolean() enabled?: boolean
  @IsOptional() @IsInt() @Min(0) @Max(100000) sortOrder?: number
}

class ReorderPromptTemplatesDto { @IsArray() ids!: string[] }

@Public()
@Controller('prompt-templates')
export class PromptTemplatesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list(@Query('q') query?: string, @Query('category') category?: string) {
    return this.prisma.promptTemplate.findMany({ where: { enabled: true, category: category || undefined, OR: query ? [{ title: { contains: query, mode: 'insensitive' } }, { description: { contains: query, mode: 'insensitive' } }, { prompt: { contains: query, mode: 'insensitive' } }] : undefined }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }], take: 100 })
  }

  @Get('categories')
  async categories() {
    const rows = await this.prisma.promptTemplate.findMany({ where: { enabled: true }, distinct: ['category'], select: { category: true }, orderBy: { category: 'asc' } })
    return rows.map((row) => row.category)
  }
}

@Controller('admin/prompt-templates')
@UseGuards(AuthGuard, AdminGuard)
export class AdminPromptTemplatesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list() { return this.prisma.promptTemplate.findMany({ orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'desc' }] }) }

  @Post('restore-defaults')
  async restoreDefaults(@CurrentUser() admin: AuthenticatedUser, @Req() request: FastifyRequest) {
    const result = await this.prisma.promptTemplate.createMany({
      data: DEFAULT_PROMPT_TEMPLATES.map((item) => ({ ...item, variables: [...item.variables] })),
      skipDuplicates: true,
    })
    await this.audit(admin.id, request, 'prompt_template.defaults.restore', undefined, { added: result.count, available: DEFAULT_PROMPT_TEMPLATES.length })
    return { added: result.count, available: DEFAULT_PROMPT_TEMPLATES.length }
  }

  @Post()
  async create(@CurrentUser() admin: AuthenticatedUser, @Req() request: FastifyRequest, @Body() body: PromptTemplateDto) {
    const row = await this.prisma.promptTemplate.create({ data: { title: body.title.trim(), description: body.description?.trim() || '', prompt: body.prompt.trim(), category: body.category?.trim() || '通用', variables: (body.variables ?? []) as Prisma.InputJsonValue, enabled: body.enabled ?? true, sortOrder: body.sortOrder ?? 0 } })
    await this.audit(admin.id, request, 'prompt_template.create', row.id, { title: row.title, category: row.category })
    return row
  }

  @Patch(':id')
  async update(@CurrentUser() admin: AuthenticatedUser, @Req() request: FastifyRequest, @Param('id') id: string, @Body() body: PromptTemplateUpdateDto) {
    const row = await this.prisma.promptTemplate.update({ where: { id }, data: { ...(body.title !== undefined ? { title: body.title.trim() } : {}), ...(body.description !== undefined ? { description: body.description.trim() } : {}), ...(body.prompt !== undefined ? { prompt: body.prompt.trim() } : {}), ...(body.category !== undefined ? { category: body.category.trim() || '通用' } : {}), ...(body.variables !== undefined ? { variables: body.variables as Prisma.InputJsonValue } : {}), ...(body.enabled !== undefined ? { enabled: body.enabled } : {}), ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}) } })
    await this.audit(admin.id, request, 'prompt_template.update', id, { title: row.title, category: row.category, enabled: row.enabled })
    return row
  }

  @Post('reorder/list')
  async reorder(@CurrentUser() admin: AuthenticatedUser, @Req() request: FastifyRequest, @Body() body: ReorderPromptTemplatesDto) {
    await this.prisma.$transaction(body.ids.map((id, index) => this.prisma.promptTemplate.update({ where: { id }, data: { sortOrder: (index + 1) * 10 } })))
    await this.audit(admin.id, request, 'prompt_template.reorder', undefined, { ids: body.ids })
    return { reordered: body.ids.length }
  }

  @Delete(':id')
  async remove(@CurrentUser() admin: AuthenticatedUser, @Req() request: FastifyRequest, @Param('id') id: string) {
    const row = await this.prisma.promptTemplate.delete({ where: { id } })
    await this.audit(admin.id, request, 'prompt_template.delete', id, { title: row.title })
    return { deleted: true }
  }

  private audit(actorId: string, request: FastifyRequest, action: string, targetId: string | undefined, after: Record<string, unknown>) {
    return this.prisma.auditLog.create({ data: { actorId, action, targetType: 'prompt_template', targetId, ipAddress: request.ip, userAgent: request.headers['user-agent'], after: after as Prisma.InputJsonValue } })
  }
}
