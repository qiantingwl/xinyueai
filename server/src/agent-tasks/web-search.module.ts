import { Module } from '@nestjs/common'
import { ProvidersModule } from '../providers/providers.module'
import { AssetsModule } from '../assets/assets.module'
import { AgentToolsService } from './agent-tools.service'
import { WebSearchService } from './web-search.service'

@Module({
  imports: [ProvidersModule, AssetsModule],
  providers: [WebSearchService, AgentToolsService],
  exports: [WebSearchService, AgentToolsService],
})
export class WebSearchModule {}
