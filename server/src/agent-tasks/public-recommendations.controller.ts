import { Controller, Get } from '@nestjs/common'
import { WebSearchService } from './web-search.service'

@Controller('catalog')
export class PublicRecommendationsController {
  constructor(private readonly search: WebSearchService) {}

  @Get('recommendations')
  recommendations() { return this.search.recommendations() }
}
