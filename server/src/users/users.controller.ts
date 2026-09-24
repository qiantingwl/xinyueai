import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common'
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator'
import { AuthGuard } from '../auth/auth.guard'
import { CurrentUser, AuthenticatedUser } from '../common/request-user'
import { PrismaService } from '../prisma/prisma.service'

class UpdateSettingsDto {
  @IsOptional() @IsIn(['dark', 'light', 'system']) appearance?: string
  @IsOptional() @IsIn(['zh-CN', 'zh-TW', 'en', 'ja', 'ko']) language?: string
  @IsOptional() @IsString() @MaxLength(30) responseStyle?: string
  @IsOptional() @IsString() @MaxLength(30) responseDetail?: string
  @IsOptional() @IsString() @MaxLength(30) replyLanguage?: string
  @IsOptional() @IsString() @MaxLength(1000) customInstructions?: string
  @IsOptional() @IsString() @MaxLength(80) nickname?: string
  @IsOptional() @IsString() @MaxLength(120) occupation?: string
  @IsOptional() @IsString() @MaxLength(1000) bio?: string
  @IsOptional() @IsBoolean() useMemory?: boolean
  @IsOptional() @IsBoolean() referenceChats?: boolean
  @IsOptional() @IsBoolean() notifications?: boolean
  @IsOptional() @IsBoolean() chatHistoryEnabled?: boolean
  @IsOptional() @IsBoolean() trainingOptOut?: boolean
  @IsOptional() @IsBoolean() temporaryChatDefault?: boolean
  @IsOptional() @IsInt() @Min(0) @Max(3650) dataRetentionDays?: number
  @IsOptional() @IsBoolean() shareUsageAnalytics?: boolean
  @IsOptional() @IsBoolean() onboarded?: boolean
}

const userSettingsSelect = {
  appearance: true,
  language: true,
  responseStyle: true,
  responseDetail: true,
  replyLanguage: true,
  customInstructions: true,
  nickname: true,
  occupation: true,
  bio: true,
  useMemory: true,
  referenceChats: true,
  notifications: true,
  chatHistoryEnabled: true,
  trainingOptOut: true,
  temporaryChatDefault: true,
  dataRetentionDays: true,
  shareUsageAnalytics: true,
  onboarded: true,
} as const

@Controller('users')
@UseGuards(AuthGuard)
export class UsersController {
  constructor(private readonly prisma: PrismaService) {}
  @Get('me') async me(@CurrentUser() user: AuthenticatedUser) {
    return this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: {
        id: true,
        email: true,
        displayName: true,
        avatarUrl: true,
        role: true,
        createdAt: true,
        settings: { select: userSettingsSelect },
        creditAccount: { select: { balance: true } },
        subscriptions: { where: { status: { in: ['ACTIVE', 'TRIALING'] } }, orderBy: { createdAt: 'desc' }, take: 1, include: { plan: true } },
        groupMemberships: { include: { group: { select: { id: true, name: true, color: true } } } },
      },
    })
  }
  @Patch('me/settings') async updateSettings(@CurrentUser() user: AuthenticatedUser, @Body() body: UpdateSettingsDto) {
    return this.prisma.userSettings.upsert({ where: { userId: user.id }, update: body, create: { userId: user.id, ...body } })
  }
}
