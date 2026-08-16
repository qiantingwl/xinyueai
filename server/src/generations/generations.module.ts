import { BullModule } from '@nestjs/bullmq'
import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { AssetsModule } from '../assets/assets.module'
import { CreditsModule } from '../credits/credits.module'
import { GenerationsController } from './generations.controller'
import { GenerationsProcessor } from './generations.processor'
import { GenerationsService } from './generations.service'
import { ProvidersModule } from '../providers/providers.module'
import { ModerationModule } from '../moderation/moderation.module'
import { PluginsModule } from '../plugins/plugins.module'
import { AgentToolsService } from '../agent-tasks/agent-tools.service'
import { WebSearchModule } from '../agent-tasks/web-search.module'

@Module({
  imports: [BullModule.registerQueue({ name: 'generation' }), CreditsModule, AssetsModule, ProvidersModule, ModerationModule, PluginsModule, WebSearchModule],
  controllers: [GenerationsController],
  providers: [GenerationsService, GenerationsProcessor, AgentToolsService],
  exports: [GenerationsService],
})
export class GenerationsModule {}
