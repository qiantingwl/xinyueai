import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common'
import { AssetKind, InspirationMode, Prisma } from '@prisma/client'
import type { FastifyRequest } from 'fastify'
import { ArrayMaxSize, IsArray, IsBoolean, IsEnum, IsInt, IsObject, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator'
import { AssetsService, resolveRasterImageMime, resolveVideoMime } from '../assets/assets.service'
import { AuthGuard } from '../auth/auth.guard'
import { CurrentUser, AuthenticatedUser } from '../common/request-user'
import { PrismaService } from '../prisma/prisma.service'
import { asJsonRecord } from '../common/json-record'
import { inspirationAdminMedia, inspirationPreviewAssetIds, inspirationPreviewVideoAssetId, inspirationStoredAssetIds } from '../inspirations/inspiration-options'
import { AdminGuard } from './admin.guard'

class CreateInspirationDto {
  @IsEnum(InspirationMode) mode!: InspirationMode
  @IsString() @MinLength(1) @MaxLength(80) title!: string
  @IsString() @MinLength(1) @MaxLength(5000) prompt!: string
  @IsOptional() @IsString() @MaxLength(20) badge?: string
  @IsOptional() @IsString() @MaxLength(1000) coverUrl?: string
  @IsOptional() @IsString() @MaxLength(80) model?: string
  @IsOptional() @IsObject() options?: Record<string, unknown>
  @IsOptional() @IsInt() @Min(0) @Max(100000) sortOrder?: number
  @IsOptional() @IsBoolean() enabled?: boolean
}
class UpdateInspirationDto {
  @IsOptional() @IsEnum(InspirationMode) mode?: InspirationMode
  @IsOptional() @IsString() @MinLength(1) @MaxLength(80) title?: string
  @IsOptional() @IsString() @MinLength(1) @MaxLength(5000) prompt?: string
  @IsOptional() @IsString() @MaxLength(20) badge?: string
  @IsOptional() @IsString() @MaxLength(1000) coverUrl?: string
  @IsOptional() @IsString() @MaxLength(80) model?: string
  @IsOptional() @IsObject() options?: Record<string, unknown>
  @IsOptional() @IsInt() @Min(0) @Max(100000) sortOrder?: number
  @IsOptional() @IsBoolean() enabled?: boolean
}
class ReorderDto { @IsArray() @ArrayMaxSize(200) @IsString({ each: true }) ids!: string[] }

@Controller('admin/inspirations')
@UseGuards(AuthGuard, AdminGuard)
export class AdminInspirationsController {
  constructor(private readonly prisma: PrismaService, private readonly assets: AssetsService) {}

  @Get()
  async list(@Query('mode') mode?: InspirationMode) {
    const rows = await this.prisma.inspiration.findMany({ where: mode ? { mode } : undefined, orderBy: [{ mode: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }] })
    return rows.map((item) => ({ ...item, ...inspirationAdminMedia(item.id, item.coverAssetId, item.coverUrl, item.options) }))
  }

  @Post()
  async create(@CurrentUser() admin: AuthenticatedUser, @Req() request: FastifyRequest, @Body() body: CreateInspirationDto) {
    const row = await this.prisma.inspiration.create({ data: { ...body, title: body.title.trim(), prompt: body.prompt.trim(), badge: body.badge?.trim() || '', coverUrl: body.coverUrl?.trim() || '', options: body.options as Prisma.InputJsonValue | undefined } })
    await this.audit(admin.id, request, 'inspiration.create', row.id, { title: row.title, mode: row.mode })
    return row
  }

  @Patch(':id')
  async update(@CurrentUser() admin: AuthenticatedUser, @Req() request: FastifyRequest, @Param('id') id: string, @Body() body: UpdateInspirationDto) {
    const before = await this.prisma.inspiration.findUniqueOrThrow({ where: { id } })
    const row = await this.prisma.inspiration.update({ where: { id }, data: { ...body, title: body.title?.trim(), prompt: body.prompt?.trim(), badge: body.badge?.trim(), coverUrl: body.coverUrl?.trim(), options: body.options as Prisma.InputJsonValue | undefined } })
    await this.audit(admin.id, request, 'inspiration.update', id, { before: { title: before.title, enabled: before.enabled }, after: { title: row.title, enabled: row.enabled } })
    return row
  }

  @Post(':id/cover')
  async uploadCover(@CurrentUser() admin: AuthenticatedUser, @Req() request: FastifyRequest, @Param('id') id: string) {
    const item = await this.prisma.inspiration.findUniqueOrThrow({ where: { id } })
    const part = await request.file()
    if (!part) throw new BadRequestException('请选择封面图片')
    const mimeType = resolveRasterImageMime(part.filename, part.mimetype)
    if (!mimeType) {
      part.file.resume()
      throw new BadRequestException('请选择 JPG、PNG、WebP、GIF 或 AVIF 图片')
    }
    const asset = await this.assets.storeUpload(admin.id, { stream: part.file, name: part.filename, mimeType, kind: AssetKind.IMAGE })
    const row = await this.prisma.inspiration.update({ where: { id }, data: { coverAssetId: asset.id, coverUrl: '' } })
    if (item.coverAssetId && item.coverAssetId !== asset.id) await this.assets.removeAsAdmin(item.coverAssetId).catch(() => undefined)
    await this.audit(admin.id, request, 'inspiration.cover', id, { assetId: asset.id })
    return { ...row, imageUrl: `/v1/inspirations/${id}/cover` }
  }

  @Delete(':id/cover')
  async removeCover(@CurrentUser() admin: AuthenticatedUser, @Req() request: FastifyRequest, @Param('id') id: string) {
    const item = await this.prisma.inspiration.findUniqueOrThrow({ where: { id } })
    await this.prisma.inspiration.update({ where: { id }, data: { coverAssetId: null } })
    if (item.coverAssetId) await this.assets.removeAsAdmin(item.coverAssetId).catch(() => undefined)
    await this.audit(admin.id, request, 'inspiration.cover.delete', id, { assetId: item.coverAssetId })
    return { removed: Boolean(item.coverAssetId) }
  }

  @Post(':id/preview-video')
  async uploadPreviewVideo(@CurrentUser() admin: AuthenticatedUser, @Req() request: FastifyRequest, @Param('id') id: string) {
    const item = await this.prisma.inspiration.findUniqueOrThrow({ where: { id } })
    if (item.mode !== InspirationMode.VIDEO) throw new BadRequestException('只有视频灵感可以上传演示视频')
    const part = await request.file()
    if (!part) throw new BadRequestException('请选择演示视频')
    const mimeType = resolveVideoMime(part.filename, part.mimetype)
    if (!mimeType) { part.file.resume(); throw new BadRequestException('演示视频仅支持 MP4、WebM 或 MOV') }
    const asset = await this.assets.storeUpload(admin.id, { stream: part.file, name: part.filename, mimeType, kind: AssetKind.VIDEO })
    const options = asJsonRecord(item.options)
    const previousAssetId = inspirationPreviewVideoAssetId(options)
    await this.prisma.inspiration.update({ where: { id }, data: { options: { ...options, previewVideoAssetId: asset.id } as Prisma.InputJsonValue } })
    if (previousAssetId && previousAssetId !== asset.id) await this.assets.removeAsAdmin(previousAssetId).catch(() => undefined)
    await this.audit(admin.id, request, 'inspiration.video.upload', id, { assetId: asset.id })
    return { assetId: asset.id, videoUrl: `/v1/inspirations/${id}/video` }
  }

  @Delete(':id/preview-video')
  async removePreviewVideo(@CurrentUser() admin: AuthenticatedUser, @Req() request: FastifyRequest, @Param('id') id: string) {
    const item = await this.prisma.inspiration.findUniqueOrThrow({ where: { id } })
    const options = asJsonRecord(item.options)
    const assetId = inspirationPreviewVideoAssetId(options)
    delete options.previewVideoAssetId
    await this.prisma.inspiration.update({ where: { id }, data: { options: options as Prisma.InputJsonValue } })
    if (assetId) await this.assets.removeAsAdmin(assetId).catch(() => undefined)
    await this.audit(admin.id, request, 'inspiration.video.delete', id, { assetId })
    return { removed: Boolean(assetId) }
  }

  @Post(':id/preview-images')
  async uploadPreviewImages(@CurrentUser() admin: AuthenticatedUser, @Req() request: FastifyRequest, @Param('id') id: string) {
    const item = await this.prisma.inspiration.findUniqueOrThrow({ where: { id } })
    const uploaded: string[] = []
    const existingAssetIds = inspirationPreviewAssetIds(item.options)
    try {
      for await (const part of request.files()) {
        if (existingAssetIds.length + uploaded.length >= 30) { part.file.resume(); throw new BadRequestException('每条灵感最多保存 30 张成组预览图片') }
        const mimeType = resolveRasterImageMime(part.filename, part.mimetype)
        if (!mimeType) { part.file.resume(); throw new BadRequestException('成组预览只支持 JPG、PNG、WebP、GIF 或 AVIF 图片') }
        const asset = await this.assets.storeUpload(admin.id, { stream: part.file, name: part.filename, mimeType, kind: AssetKind.IMAGE })
        uploaded.push(asset.id)
      }
      if (!uploaded.length) throw new BadRequestException('请选择至少一张成组预览图片')
      const options = asJsonRecord(item.options)
      const previewAssetIds = [...existingAssetIds, ...uploaded]
      await this.prisma.inspiration.update({ where: { id }, data: { options: { ...options, previewAssetIds } as Prisma.InputJsonValue } })
      await this.audit(admin.id, request, 'inspiration.previews.upload', id, { assetIds: uploaded })
      return { uploadedPreviewImages: previewAssetIds.map((assetId) => ({ assetId, url: `/v1/inspirations/${id}/previews/${assetId}` })) }
    } catch (error) {
      await Promise.all(uploaded.map((assetId) => this.assets.removeAsAdmin(assetId).catch(() => undefined)))
      throw error
    }
  }

  @Delete(':id/preview-images/:assetId')
  async removePreviewImage(@CurrentUser() admin: AuthenticatedUser, @Req() request: FastifyRequest, @Param('id') id: string, @Param('assetId') assetId: string) {
    const item = await this.prisma.inspiration.findUniqueOrThrow({ where: { id } })
    const options = asJsonRecord(item.options)
    const current = inspirationPreviewAssetIds(options)
    if (!current.includes(assetId)) throw new BadRequestException('该图片不属于当前灵感内容')
    const previewAssetIds = current.filter((value) => value !== assetId)
    await this.prisma.inspiration.update({ where: { id }, data: { options: { ...options, previewAssetIds } as Prisma.InputJsonValue } })
    await this.assets.removeAsAdmin(assetId).catch(() => undefined)
    await this.audit(admin.id, request, 'inspiration.previews.delete', id, { assetId })
    return { removed: true }
  }

  @Post('reorder/list')
  async reorder(@CurrentUser() admin: AuthenticatedUser, @Req() request: FastifyRequest, @Body() body: ReorderDto) {
    await this.prisma.$transaction(body.ids.map((id, index) => this.prisma.inspiration.update({ where: { id }, data: { sortOrder: (index + 1) * 10 } })))
    await this.audit(admin.id, request, 'inspiration.reorder', undefined, { ids: body.ids })
    return { reordered: body.ids.length }
  }

  @Delete(':id')
  async remove(@CurrentUser() admin: AuthenticatedUser, @Req() request: FastifyRequest, @Param('id') id: string) {
    const row = await this.prisma.inspiration.delete({ where: { id } })
    const assetIds = inspirationStoredAssetIds(row.coverAssetId, row.options)
    await Promise.all(assetIds.map((assetId) => this.assets.removeAsAdmin(assetId).catch(() => undefined)))
    await this.audit(admin.id, request, 'inspiration.delete', id, { title: row.title })
    return { deleted: true }
  }

  private async audit(actorId: string, request: FastifyRequest, action: string, targetId: string | undefined, after: Prisma.InputJsonValue) {
    await this.prisma.auditLog.create({ data: { actorId, action, targetType: 'inspiration', targetId, ipAddress: request.ip, userAgent: request.headers['user-agent'], after } })
  }
}
