import { ArrayMaxSize, IsArray, IsBoolean, IsEnum, IsIn, IsOptional, IsString, MaxLength } from 'class-validator'
import { Body, Controller, Delete, Get, Param, Patch, Post, Query, StreamableFile, UseGuards } from '@nestjs/common'
import { WorkAuthorDisplay, WorkModerationStatus, WorkReportStatus, WorkVisibility } from '@prisma/client'
import { AdminGuard } from '../admin/admin.guard'
import { AuthGuard } from '../auth/auth.guard'
import { assetDisposition } from '../assets/assets.service'
import { AuthenticatedUser, CurrentUser } from '../common/request-user'
import { WorkDraftInput, WorksService } from './works.service'
import { Public } from '../auth/public.decorator'

class WorkDraftDto implements WorkDraftInput {
  @IsOptional() @IsString() @MaxLength(120) title?: string
  @IsOptional() @IsString() @MaxLength(5000) description?: string
  @IsOptional() @IsString() @MaxLength(80) category?: string
  @IsOptional() @IsArray() @ArrayMaxSize(12) @IsString({ each: true }) tags?: string[]
  @IsOptional() @IsEnum(WorkVisibility) visibility?: WorkVisibility
  @IsOptional() @IsEnum(WorkAuthorDisplay) authorDisplay?: WorkAuthorDisplay
  @IsOptional() @IsString() @MaxLength(80) customAuthor?: string
  @IsOptional() @IsString() @MaxLength(10000) publicPrompt?: string
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) assetIds?: string[]
}
class ArchiveWorkDto { @IsBoolean() archived!: boolean }
class ReportWorkDto { @IsString() @MaxLength(80) reason!: string; @IsOptional() @IsString() @MaxLength(2000) details?: string }
class ReviewWorkDto { @IsIn(['APPROVED', 'REJECTED']) status!: 'APPROVED' | 'REJECTED'; @IsOptional() @IsString() @MaxLength(2000) reason?: string }
class FeatureWorkDto { @IsBoolean() featured!: boolean }
class TakeDownWorkDto { @IsString() @MaxLength(2000) reason!: string }
class ResolveReportDto { @IsIn(['RESOLVED', 'DISMISSED']) status!: 'RESOLVED' | 'DISMISSED'; @IsString() @MaxLength(2000) resolution!: string }

@Controller('works')
@UseGuards(AuthGuard)
export class WorksController {
  constructor(private readonly works: WorksService) {}
  @Get() list(@CurrentUser() user: AuthenticatedUser) { return this.works.listMine(user.id) }
  @Get(':id') get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.works.getMine(user.id, id) }
  @Post() create(@CurrentUser() user: AuthenticatedUser, @Body() body: WorkDraftDto) { return this.works.create(user.id, body) }
  @Patch(':id') update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: WorkDraftDto) { return this.works.update(user.id, id, body) }
  @Post(':id/submit') submit(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.works.submit(user.id, id) }
  @Patch(':id/archive') archive(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: ArchiveWorkDto) { return this.works.archive(user.id, id, body.archived) }
  @Delete(':id') remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.works.remove(user.id, id) }
  @Post(':id/like') like(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.works.toggleLike(user.id, id) }
  @Post(':id/report') report(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: ReportWorkDto) { return this.works.report(user.id, id, body.reason, body.details) }
  @Post('creators/:userId/follow') follow(@CurrentUser() user: AuthenticatedUser, @Param('userId') userId: string) { return this.works.toggleFollow(user.id, userId) }
}

@Public()
@Controller('gallery')
export class GalleryController {
  constructor(private readonly works: WorksService) {}
  @Get() list(@Query('q') q?: string, @Query('category') category?: string, @Query('sort') sort?: string, @Query('cursor') cursor?: string, @Query('limit') limit?: string) { return this.works.gallery({ q, category, sort, cursor, limit: Number(limit) || undefined }) }
  @Get(':slug') get(@Param('slug') slug: string) { return this.works.publicDetail(slug) }
  @Post(':slug/view') view(@Param('slug') slug: string) { return this.works.recordView(slug) }
  @Get(':slug/assets/:assetId') async asset(@Param('slug') slug: string, @Param('assetId') assetId: string) {
    const result = await this.works.publicAsset(slug, assetId)
    return new StreamableFile(result.file, { type: result.mimeType, disposition: assetDisposition(result.mimeType, result.name) })
  }
}

@Controller('admin/works')
@UseGuards(AuthGuard, AdminGuard)
export class AdminWorksController {
  constructor(private readonly works: WorksService) {}
  @Get() list(@Query('status') status?: WorkModerationStatus, @Query('q') query?: string) { return this.works.adminList(status, query) }
  @Post(':id/review') review(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: ReviewWorkDto) { return this.works.review(user.id, id, body.status, body.reason) }
  @Patch(':id/feature') feature(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: FeatureWorkDto) { return this.works.setFeatured(user.id, id, body.featured) }
  @Post(':id/take-down') takeDown(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: TakeDownWorkDto) { return this.works.takeDown(user.id, id, body.reason) }
  @Get('reports/list') reports(@Query('status') status?: WorkReportStatus) { return this.works.listReports(status) }
  @Post('reports/:id/resolve') resolveReport(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: ResolveReportDto) { return this.works.resolveReport(user.id, id, body.status, body.resolution) }
}
