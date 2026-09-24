import { Controller, Get, NotFoundException, Param, Query, StreamableFile } from '@nestjs/common'
import { AssetKind, InspirationMode } from '@prisma/client'
import { assetDisposition, AssetsService } from '../assets/assets.service'
import { PrismaService } from '../prisma/prisma.service'
import { inspirationPreviewAssetIds, inspirationPreviewVideoAssetId, inspirationPublicListFields } from './inspiration-options'
import { Public } from '../auth/public.decorator'

@Public()
@Controller('inspirations')
export class InspirationsController {
  constructor(private readonly prisma: PrismaService, private readonly assets: AssetsService) {}

  @Get()
  async list(@Query('mode') mode: InspirationMode = InspirationMode.IMAGE) {
    // The client needs disabled IMAGE_TOOL records to suppress a matching system fallback card.
    // Other inspiration categories remain public-only when enabled.
    const rows = await this.prisma.inspiration.findMany({ where: mode === InspirationMode.IMAGE_TOOL ? { mode } : { mode, enabled: true }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] })
    return rows.map((item) => ({ ...item, ...inspirationPublicListFields(item.id, item.coverAssetId, item.coverUrl, item.options) }))
  }

  @Get(':id/cover')
  async cover(@Param('id') id: string) {
    const item = await this.prisma.inspiration.findFirst({ where: { id, enabled: true }, select: { coverAssetId: true } })
    if (!item) throw new NotFoundException('灵感不存在或未公开')
    if (!item.coverAssetId) return new StreamableFile(Buffer.alloc(0), { type: 'image/png' })
    const result = await this.assets.streamPublicInspirationAsset(item.coverAssetId, AssetKind.IMAGE)
    return new StreamableFile(result.stream, { type: result.mimeType, disposition: assetDisposition(result.mimeType, result.name), length: result.size || undefined })
  }

  @Get(':id/previews/:assetId')
  async preview(@Param('id') id: string, @Param('assetId') assetId: string) {
    const item = await this.prisma.inspiration.findFirst({ where: { id, enabled: true }, select: { options: true } })
    if (!item) throw new NotFoundException('灵感不存在或未公开')
    if (!inspirationPreviewAssetIds(item.options).includes(assetId)) throw new NotFoundException('预览图片不存在')
    const result = await this.assets.streamPublicInspirationAsset(assetId, AssetKind.IMAGE)
    return new StreamableFile(result.stream, { type: result.mimeType, disposition: assetDisposition(result.mimeType, result.name), length: result.size || undefined })
  }

  @Get(':id/video')
  async video(@Param('id') id: string) {
    const item = await this.prisma.inspiration.findFirst({ where: { id, enabled: true }, select: { options: true } })
    if (!item) throw new NotFoundException('灵感不存在或未公开')
    const assetId = inspirationPreviewVideoAssetId(item.options)
    if (!assetId) throw new NotFoundException('演示视频不存在')
    const result = await this.assets.streamPublicInspirationAsset(assetId, AssetKind.VIDEO)
    return new StreamableFile(result.stream, { type: result.mimeType, disposition: assetDisposition(result.mimeType, result.name), length: result.size || undefined })
  }
}
