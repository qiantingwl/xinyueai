import { Controller, Get, Param, Query, Res, StreamableFile } from '@nestjs/common'
import { ModelCapability } from '@prisma/client'
import type { FastifyReply } from 'fastify'
import { assetDisposition, AssetsService } from '../assets/assets.service'
import { ProvidersService } from './providers.service'
import { CapabilityRegistryService } from './capability-registry.service'
import { Public } from '../auth/public.decorator'

@Public()
@Controller('catalog')
export class CatalogController {
  constructor(private readonly providers: ProvidersService, private readonly assets: AssetsService, private readonly capabilities: CapabilityRegistryService) {}

  @Get('models')
  models(@Query('capability') capability?: string) {
    const normalized = capability?.toUpperCase()
    const value = normalized && Object.values(ModelCapability).includes(normalized as ModelCapability) ? normalized as ModelCapability : undefined
    return this.providers.listModels(value)
  }

  @Get('settings')
  settings() { return this.providers.getSystemSettings() }

  @Get('model-vendors')
  modelVendors() { return this.providers.listModelVendors() }

  @Get('provider-templates')
  providerTemplates() { return this.providers.listProviderTemplates() }

  @Get('external-links')
  externalLinks() { return this.providers.listExternalLinks() }

  @Get('capabilities')
  capabilitiesList() { return this.capabilities.snapshot() }

  @Get('recharge-packages')
  packages() { return this.providers.listRechargePackages() }

  @Get('chat-home-images/:id')
  async chatHomeImage(@Param('id') id: string, @Res({ passthrough: true }) response: FastifyReply) {
    const result = await this.assets.streamPublicChatHomeImage(id)
    response.header('Cache-Control', 'public, max-age=3600')
    return new StreamableFile(result.stream, { type: result.mimeType, disposition: assetDisposition(result.mimeType, result.name), length: result.size || undefined })
  }
}
