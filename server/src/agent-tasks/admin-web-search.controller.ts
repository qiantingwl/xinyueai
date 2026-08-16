import { Body, Controller, Delete, Get, Param, Patch, Post, Put, UseGuards } from '@nestjs/common'
import { WebSearchProviderType } from '@prisma/client'
import { IsArray, IsBoolean, IsEnum, IsIn, IsInt, IsObject, IsOptional, IsString, IsUrl, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator'
import { AdminGuard } from '../admin/admin.guard'
import { AuthGuard } from '../auth/auth.guard'
import { WebSearchService } from './web-search.service'

class CreateWebSearchChannelDto {
  @IsString() @MinLength(1) @MaxLength(100) name!: string
  @IsEnum(WebSearchProviderType) type!: WebSearchProviderType
  @IsOptional() @ValidateIf((_, value) => value !== '') @IsUrl({ require_protocol: true, protocols: ['http', 'https'] }) @MaxLength(1000) endpoint?: string
  @IsOptional() @IsString() @MaxLength(2000) apiKey?: string
  @IsOptional() @IsBoolean() enabled?: boolean
  @IsOptional() @IsInt() @Min(-10000) @Max(10000) priority?: number
  @IsOptional() @IsInt() @Min(1000) @Max(60000) timeoutMs?: number
  @IsOptional() @IsInt() @Min(1) @Max(20) maxResults?: number
  @IsOptional() @IsObject() config?: Record<string, unknown>
}
class UpdateWebSearchChannelDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) name?: string
  @IsOptional() @IsEnum(WebSearchProviderType) type?: WebSearchProviderType
  @IsOptional() @ValidateIf((_, value) => value !== '') @IsUrl({ require_protocol: true, protocols: ['http', 'https'] }) @MaxLength(1000) endpoint?: string
  @IsOptional() @IsString() @MaxLength(2000) apiKey?: string
  @IsOptional() @IsBoolean() clearApiKey?: boolean
  @IsOptional() @IsBoolean() enabled?: boolean
  @IsOptional() @IsInt() @Min(-10000) @Max(10000) priority?: number
  @IsOptional() @IsInt() @Min(1000) @Max(60000) timeoutMs?: number
  @IsOptional() @IsInt() @Min(1) @Max(20) maxResults?: number
  @IsOptional() @IsObject() config?: Record<string, unknown>
}
class UpdateTgmengDto {
  @IsOptional() @IsString() @MaxLength(200) license?: string
  @IsOptional() @IsBoolean() recommendationEnabled?: boolean
  @IsOptional() @IsBoolean() fallbackEnabled?: boolean
  @IsOptional() @IsArray() @IsIn(['新闻', '羊毛', '媒体', '电视', '生活', '社区', '财经', '股讯', '体育', '科技', '设计', '影音', '游戏', '健康', '教育', '期货', 'AI', '副业'], { each: true }) rootCategories?: string[]
  @IsOptional() @IsInt() @Min(3) @Max(12) recommendationLimit?: number
  @IsOptional() @IsInt() @Min(1) @Max(1440) cacheMinutes?: number
}

@Controller('admin/web-search-channels')
@UseGuards(AuthGuard, AdminGuard)
export class AdminWebSearchController {
  constructor(private readonly search: WebSearchService) {}
  @Get('tgmeng') tgmeng() { return this.search.tgmengSettings() }
  @Put('tgmeng') saveTgmeng(@Body() body: UpdateTgmengDto) { return this.search.saveTgmeng(body) }
  @Post('tgmeng/check') checkTgmeng() { return this.search.checkTgmeng() }
  @Post('tgmeng/refresh') refreshTgmeng() { return this.search.recommendations(true) }
  @Get() list() { return this.search.list() }
  @Post() create(@Body() body: CreateWebSearchChannelDto) { return this.search.create(body) }
  @Patch(':id') update(@Param('id') id: string, @Body() body: UpdateWebSearchChannelDto) { return this.search.update(id, body) }
  @Delete(':id') remove(@Param('id') id: string) { return this.search.remove(id) }
  @Post('check-all') checkAll() { return this.search.checkAll() }
  @Post(':id/check') check(@Param('id') id: string) { return this.search.check(id) }
}
