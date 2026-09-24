import { Controller, Get, Header } from '@nestjs/common'
import { WebSearchService } from './web-search.service'
import { Public } from '../auth/public.decorator'

@Public()
@Controller('catalog')
export class PublicRecommendationsController {
  constructor(private readonly search: WebSearchService) {}

  @Get('recommendations')
  @Header('Cache-Control', 'no-store')
  recommendations() { return this.search.recommendations() }
}
