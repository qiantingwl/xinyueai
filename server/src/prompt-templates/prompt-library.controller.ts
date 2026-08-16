import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common'
import { ArrayMaxSize, IsArray, IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator'
import type { FastifyRequest } from 'fastify'
import { Prisma } from '@prisma/client'
import { AdminGuard } from '../admin/admin.guard'
import { AuthGuard } from '../auth/auth.guard'
import { AuthenticatedUser, CurrentUser } from '../common/request-user'
import { PrismaService } from '../prisma/prisma.service'
import { PromptLibraryService } from './prompt-library.service'

class PromptLibrarySourceUpdateDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) displayName?: string
  @IsOptional() @IsBoolean() enabled?: boolean
  @IsOptional() @IsInt() @Min(0) @Max(100000) sortOrder?: number
}

class PromptLibraryItemUpdateDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(300) title?: string
  @IsOptional() @IsString() @MinLength(1) @MaxLength(30000) prompt?: string
  @IsOptional() @IsString() @MaxLength(2000) description?: string
  @IsOptional() @IsArray() @ArrayMaxSize(30) @IsString({ each: true }) tags?: string[]
  @IsOptional() @IsString() @MaxLength(2000) coverUrl?: string
  @IsOptional() @IsString() @MaxLength(2000) previewVideoUrl?: string
  @IsOptional() @IsBoolean() enabled?: boolean
}

@Controller('prompt-library')
export class PromptLibraryController {
  constructor(private readonly library: PromptLibraryService) {}

  @Get()
  list(@Query('type') promptType?: string, @Query('q') query?: string, @Query('source') sourceId?: string, @Query('tag') tag?: string, @Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    return this.library.list({ promptType, query, sourceId, tag, page: Number(page) || 1, pageSize: Number(pageSize) || 24 })
  }

  @Get('items/:itemId')
  item(@Param('itemId') itemId: string) { return this.library.publicItemById(itemId) }
}

@Controller('admin/prompt-library')
@UseGuards(AuthGuard, AdminGuard)
export class AdminPromptLibraryController {
  constructor(private readonly library: PromptLibraryService, private readonly prisma: PrismaService) {}

  @Get('sources')
  sources() { return this.library.adminSources() }

  @Patch('sources/:id')
  async updateSource(@CurrentUser() admin: AuthenticatedUser, @Req() request: FastifyRequest, @Param('id') id: string, @Body() body: PromptLibrarySourceUpdateDto) {
    const result = await this.library.updateSource(id, body)
    await this.audit(admin.id, request, 'prompt_library.source.update', id, { ...body })
    return result
  }

  @Get('items')
  items(@Query('type') promptType?: string, @Query('q') query?: string, @Query('source') sourceId?: string, @Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    return this.library.adminItems({ promptType, query, sourceId, page: Number(page) || 1, pageSize: Number(pageSize) || 20 })
  }

  @Patch('items/:itemId')
  async updateItem(@CurrentUser() admin: AuthenticatedUser, @Req() request: FastifyRequest, @Param('itemId') itemId: string, @Body() body: PromptLibraryItemUpdateDto) {
    const result = await this.library.updateItem(itemId, body)
    await this.audit(admin.id, request, 'prompt_library.item.update', itemId, { ...body, prompt: body.prompt ? `[${body.prompt.length} chars]` : undefined })
    return result
  }

  @Delete('items/:itemId')
  async resetItem(@CurrentUser() admin: AuthenticatedUser, @Req() request: FastifyRequest, @Param('itemId') itemId: string) {
    const result = await this.library.resetItem(itemId)
    await this.audit(admin.id, request, 'prompt_library.item.reset', itemId, result)
    return result
  }

  @Post('refresh')
  async refresh(@CurrentUser() admin: AuthenticatedUser, @Req() request: FastifyRequest) {
    const result = await this.library.refreshAll()
    await this.audit(admin.id, request, 'prompt_library.refresh', 'all', { total: result.total })
    return result
  }

  @Post('sources/:id/refresh')
  async refreshSource(@CurrentUser() admin: AuthenticatedUser, @Req() request: FastifyRequest, @Param('id') id: string) {
    const result = await this.library.refreshSource(id)
    await this.audit(admin.id, request, 'prompt_library.source.refresh', id, { count: result.count, complete: result.complete })
    return result
  }

  private audit(actorId: string, request: FastifyRequest, action: string, targetId: string, after: Record<string, unknown>) {
    return this.prisma.auditLog.create({ data: { actorId, action, targetType: 'prompt_library', targetId, ipAddress: request.ip, userAgent: request.headers['user-agent'], after: after as Prisma.InputJsonValue } })
  }
}
