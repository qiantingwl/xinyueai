import { Module } from '@nestjs/common'
import { ProvidersModule } from '../providers/providers.module'
import { WebSearchService } from './web-search.service'

@Module({
  imports: [ProvidersModule],
  providers: [WebSearchService],
  exports: [WebSearchService],
})
export class WebSearchModule {}
