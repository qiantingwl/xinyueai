import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common'
import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator'
import { AuthGuard } from '../auth/auth.guard'
import { AuthenticatedUser, CurrentUser } from '../common/request-user'
import { ProjectSkillsService } from './project-skills.service'

class SkillContentDto {
  @IsString() @Matches(/\S/) @MinLength(1) @MaxLength(80) name!: string
  @IsString() @Matches(/\S/) @MinLength(1) @MaxLength(50_000) content!: string
  @IsOptional() @IsString() @MaxLength(500) changeSummary?: string
  @IsOptional() @IsString() @MaxLength(100) sourceConversationId?: string
}

class SkillSummaryDto {
  @IsString() @Matches(/\S/) @MaxLength(100) conversationId!: string
  @IsOptional() @IsString() @MaxLength(2000) request?: string
}

@Controller('projects/:projectId/skill')
@UseGuards(AuthGuard)
export class ProjectSkillsController {
  constructor(private readonly skills: ProjectSkillsService) {}

  @Get()
  status(@CurrentUser() user: AuthenticatedUser, @Param('projectId') projectId: string) {
    return this.skills.status(user.id, projectId)
  }

  @Post('manual')
  manual(@CurrentUser() user: AuthenticatedUser, @Param('projectId') projectId: string, @Body() body: SkillContentDto) {
    return this.skills.activate(user.id, projectId, body, true)
  }

  @Post('summarize')
  summarize(@CurrentUser() user: AuthenticatedUser, @Param('projectId') projectId: string, @Body() body: SkillSummaryDto) {
    return this.skills.summarize(user.id, projectId, body.conversationId, body.request)
  }

  @Post('activate-summary')
  activateSummary(@CurrentUser() user: AuthenticatedUser, @Param('projectId') projectId: string, @Body() body: SkillContentDto) {
    return this.skills.activate(user.id, projectId, { ...body, changeType: 'SUMMARY' })
  }

  @Post('versions/:version/restore')
  restore(@CurrentUser() user: AuthenticatedUser, @Param('projectId') projectId: string, @Param('version') version: string) {
    return this.skills.restore(user.id, projectId, Number.parseInt(version, 10))
  }

  @Delete()
  disable(@CurrentUser() user: AuthenticatedUser, @Param('projectId') projectId: string) {
    return this.skills.disable(user.id, projectId)
  }
}
