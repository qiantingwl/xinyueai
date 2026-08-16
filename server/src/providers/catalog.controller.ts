import { Controller, Get, Param, Query, Res, StreamableFile } from '@nestjs/common'
import { ModelCapability } from '@prisma/client'
import type { FastifyReply } from 'fastify'
import { assetDisposition, AssetsService } from '../assets/assets.service'
import { ProvidersService } from './providers.service'

@Controller('catalog')
export class CatalogController {
  constructor(private readonly providers: ProvidersService, private readonly assets: AssetsService) {}

  @Get('models')
  models(@Query('capability') capability?: string) {
    const normalized = capability?.toUpperCase()
    const value = normalized && Object.values(ModelCapability).includes(normalized as ModelCapability) ? normalized as ModelCapability : undefined
    return this.providers.listModels(value)
  }

  @Get('settings')
  settings() { return this.providers.getSystemSettings() }

  @Get('external-links')
  externalLinks() { return this.providers.listExternalLinks() }

  @Get('recharge-packages')
  packages() { return this.providers.listRechargePackages() }

  @Get('chat-home-images/:id')
  async chatHomeImage(@Param('id') id: string, @Res({ passthrough: true }) response: FastifyReply) {
    const result = await this.assets.readForAdmin(id)
    response.header('Cache-Control', 'public, max-age=3600')
    return new StreamableFile(result.file, { type: result.mimeType, disposition: assetDisposition(result.mimeType, result.name) })
  }
}
