import { BadRequestException, Body, Controller, Get, MessageEvent, Param, Post, Query, Sse, UseGuards } from '@nestjs/common'
import { JobKind } from '@prisma/client'
import { IsEnum, IsObject, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator'
import { Observable, distinctUntilChanged, from, interval, map, startWith, switchMap, takeWhile } from 'rxjs'
import { AuthGuard } from '../auth/auth.guard'
import { CurrentUser, AuthenticatedUser } from '../common/request-user'
import { GenerationsService } from './generations.service'

class CreateJobDto {
  @IsEnum(JobKind) kind!: JobKind
  @IsString() @Matches(/\S/) @MinLength(1) @MaxLength(20_000) prompt!: string
  @IsOptional() @IsString() @Matches(/\S/) @MaxLength(160) model?: string
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) projectId?: string
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) conversationId?: string
  @IsObject() options!: Record<string, unknown>
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200) idempotencyKey?: string
}

@Controller('generations')
@UseGuards(AuthGuard)
export class GenerationsController {
  constructor(private readonly generations: GenerationsService) {}
  @Post() create(@CurrentUser() user: AuthenticatedUser, @Body() body: CreateJobDto) { return this.generations.create(user.id, body) }
  @Get() list(@CurrentUser() user: AuthenticatedUser, @Query('kind') kind?: JobKind) {
    if (kind && !Object.values(JobKind).includes(kind)) throw new BadRequestException('任务类型无效')
    return this.generations.list(user.id, kind)
  }
  @Get(':id') get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.generations.get(user.id, id) }
  @Post(':id/cancel') cancel(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.generations.cancel(user.id, id) }
  @Sse(':id/events') events(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Observable<MessageEvent> {
    return interval(200).pipe(
      startWith(0),
      switchMap(() => from(this.generations.get(user.id, id))),
      distinctUntilChanged((a, b) => a.status === b.status && a.stream?.content === b.stream?.content),
      map((job) => ({ type: 'job', id: job.id, data: job })),
      takeWhile((event) => !['SUCCEEDED', 'FAILED', 'CANCELLED'].includes(event.data.status), true),
    )
  }
}
