import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, StreamableFile, UseGuards } from '@nestjs/common'
import { AssetKind } from '@prisma/client'
import { IsOptional, IsString } from 'class-validator'
import type { FastifyRequest } from 'fastify'
import { AuthGuard } from '../auth/auth.guard'
import { CurrentUser, AuthenticatedUser } from '../common/request-user'
import { PrismaService } from '../prisma/prisma.service'
import { assetDisposition, AssetsService, resolveRasterImageMime, resolveVideoMime } from './assets.service'
import { ResourceAccessService } from '../common/resource-access.service'
import { publicAssetSelect, toPublicAsset } from './public-asset.dto'

const kinds = new Set(Object.values(AssetKind))
const uploadPurposes = new Set(['library', 'reference', 'mask', 'attachment', 'image-prompt'])

class AssignAssetTeamDto { @IsOptional() @IsString() teamId?: string | null }

@Controller('assets')
@UseGuards(AuthGuard)
export class AssetsController {
  constructor(private readonly assets: AssetsService, private readonly prisma: PrismaService, private readonly access: ResourceAccessService) {}

  @Get()
  async list(@CurrentUser() user: AuthenticatedUser, @Query('kind') kind?: AssetKind, @Query('q') query?: string) {
    if (kind && !kinds.has(kind)) throw new BadRequestException('文件类型无效')
    const rows = await this.prisma.asset.findMany({ where: { ...this.access.assetWhere(user.id), deletedAt: null, kind, name: query ? { contains: query, mode: 'insensitive' } : undefined }, orderBy: { createdAt: 'desc' }, take: 100, select: { ...publicAssetSelect, userId: true, team: { select: { id: true, name: true, ownerId: true, members: { where: { userId: user.id }, select: { role: true } } } }, project: { select: { userId: true, members: { where: { userId: user.id }, select: { role: true } }, team: { select: { ownerId: true, members: { where: { userId: user.id }, select: { role: true } } } } } }, user: { select: { id: true, displayName: true } } } })
    return rows.map(({ project, ...asset }) => {
      const teamManager = asset.team?.ownerId === user.id || asset.team?.members.some((member) => member.role === 'ADMIN')
      const projectManager = project?.userId === user.id || project?.members.some((member) => member.role === 'ADMIN') || project?.team?.ownerId === user.id || project?.team?.members.some((member) => member.role === 'ADMIN')
      return toPublicAsset({ ...asset, team: asset.team ? { id: asset.team.id, name: asset.team.name } : null }, { canManage: asset.userId === user.id || Boolean(teamManager || projectManager) })
    })
  }

  @Post('uploads')
  async upload(@CurrentUser() user: AuthenticatedUser, @Req() request: FastifyRequest, @Query('kind') kind: AssetKind = AssetKind.FILE, @Query('projectId') projectId?: string, @Query('purpose') purpose = 'library') {
    if (!kinds.has(kind)) throw new BadRequestException('文件类型无效')
    if (!uploadPurposes.has(purpose)) throw new BadRequestException('文件用途无效')
    const part = await request.file()
    if (!part) throw new BadRequestException('请选择文件')
    const imageMimeType = kind === AssetKind.IMAGE ? resolveRasterImageMime(part.filename, part.mimetype) : null
    const videoMimeType = kind === AssetKind.VIDEO ? resolveVideoMime(part.filename, part.mimetype) : null
    if (kind === AssetKind.IMAGE && !imageMimeType) {
      part.file.resume()
      throw new BadRequestException('请选择 JPG、PNG、WebP、GIF 或 AVIF 图片')
    }
    if (kind === AssetKind.VIDEO && !videoMimeType) {
      part.file.resume()
      throw new BadRequestException('请选择 MP4、WebM 或 MOV 视频')
    }
    const asset = await this.assets.storeUpload(user.id, { stream: part.file, name: part.filename, mimeType: imageMimeType || videoMimeType || part.mimetype || 'application/octet-stream', kind, projectId, metadata: { purpose } })
    return toPublicAsset(asset)
  }

  @Get(':id/content')
  async content(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const result = await this.assets.streamForUser(user.id, id)
    return new StreamableFile(result.stream, { type: result.mimeType, disposition: assetDisposition(result.mimeType, result.name), length: result.size || undefined })
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.assets.remove(user.id, id) }

  @Patch(':id/team')
  async assignTeam(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: AssignAssetTeamDto) {
    return toPublicAsset(await this.assets.assignTeam(user.id, id, body.teamId || null))
  }
}
