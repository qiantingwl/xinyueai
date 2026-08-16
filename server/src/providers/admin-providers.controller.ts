import { Body, Controller, Delete, Get, Param, Patch, Post, Put, UseGuards } from '@nestjs/common'
import { Type } from 'class-transformer'
import { IsArray, IsBoolean, IsEmail, IsEnum, IsInt, IsObject, IsOptional, IsString, IsUrl, Matches, Max, MaxLength, Min, MinLength, ValidateIf, ValidateNested } from 'class-validator'
import { ModelCapability, Prisma, ProviderAuthType, ProviderType } from '@prisma/client'
import { AdminGuard } from '../admin/admin.guard'
import { AuthGuard } from '../auth/auth.guard'
import { ProvidersService } from './providers.service'

class CreateProviderDto {
  @IsString() @MinLength(1) @MaxLength(100) name!: string
  @IsEnum(ProviderType) type!: ProviderType
  @IsString() @MinLength(8) @MaxLength(500) baseUrl!: string
  @IsOptional() @IsString() @MaxLength(1000) apiKey?: string
  @IsOptional() @IsEnum(ProviderAuthType) authType?: ProviderAuthType
  @IsOptional() @IsBoolean() enabled?: boolean
  @IsOptional() @IsInt() @Min(-10000) @Max(10000) priority?: number
  @IsOptional() @IsInt() @Min(0) @Max(10000) weight?: number
  @IsOptional() @IsInt() @Min(1000) @Max(600000) timeoutMs?: number
  @IsOptional() @IsBoolean() allowUserKeys?: boolean
  @IsOptional() @IsObject() customHeaders?: Record<string, string>
  @IsOptional() @IsObject() metadata?: Record<string, unknown>
}

class UpdateProviderDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) name?: string
  @IsOptional() @IsEnum(ProviderType) type?: ProviderType
  @IsOptional() @IsString() @MinLength(8) @MaxLength(500) baseUrl?: string
  @IsOptional() @IsString() @MaxLength(1000) apiKey?: string
  @IsOptional() @IsEnum(ProviderAuthType) authType?: ProviderAuthType
  @IsOptional() @IsBoolean() enabled?: boolean
  @IsOptional() @IsInt() @Min(-10000) @Max(10000) priority?: number
  @IsOptional() @IsInt() @Min(0) @Max(10000) weight?: number
  @IsOptional() @IsInt() @Min(1000) @Max(600000) timeoutMs?: number
  @IsOptional() @IsBoolean() allowUserKeys?: boolean
  @IsOptional() @IsObject() customHeaders?: Record<string, string>
  @IsOptional() @IsObject() metadata?: Record<string, unknown>
}

class CreateModelDto {
  @IsString() @MinLength(1) @MaxLength(100) key!: string
  @IsString() @MinLength(1) @MaxLength(100) displayName!: string
  @IsOptional() @IsString() @MaxLength(1000) description?: string
  @IsOptional() @IsString() providerId?: string
  @IsString() @MinLength(1) @MaxLength(160) upstreamModel!: string
  @IsEnum(ModelCapability) capability!: ModelCapability
  @IsOptional() @IsBoolean() enabled?: boolean
  @IsOptional() @IsBoolean() isDefault?: boolean
  @IsOptional() @IsBoolean() allowUserKey?: boolean
  @IsOptional() @IsInt() @Min(-10000) @Max(10000) sortOrder?: number
  @IsOptional() @IsInt() @Min(0) @Max(100000) flatCreditCost?: number
  @IsOptional() @IsInt() @Min(0) @Max(1000000) inputCreditsPerMillion?: number
  @IsOptional() @IsInt() @Min(0) @Max(1000000) outputCreditsPerMillion?: number
  @IsOptional() @IsInt() @Min(0) @Max(2000000000) inputCostMicrosPerMillion?: number
  @IsOptional() @IsInt() @Min(0) @Max(2000000000) outputCostMicrosPerMillion?: number
  @IsOptional() @IsInt() @Min(0) @Max(2000000000) imageCostMicros?: number
  @IsOptional() @IsInt() @Min(0) @Max(2000000000) videoCostMicros?: number
  @IsOptional() @IsString() @MaxLength(30) badge?: string
  @IsOptional() @IsObject() options?: Record<string, unknown>
}

class UpdateModelDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) key?: string
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) displayName?: string
  @IsOptional() @IsString() @MaxLength(1000) description?: string
  @IsOptional() @IsString() providerId?: string | null
  @IsOptional() @IsString() @MinLength(1) @MaxLength(160) upstreamModel?: string
  @IsOptional() @IsEnum(ModelCapability) capability?: ModelCapability
  @IsOptional() @IsBoolean() enabled?: boolean
  @IsOptional() @IsBoolean() isDefault?: boolean
  @IsOptional() @IsBoolean() allowUserKey?: boolean
  @IsOptional() @IsInt() @Min(-10000) @Max(10000) sortOrder?: number
  @IsOptional() @IsInt() @Min(0) @Max(100000) flatCreditCost?: number
  @IsOptional() @IsInt() @Min(0) @Max(1000000) inputCreditsPerMillion?: number
  @IsOptional() @IsInt() @Min(0) @Max(1000000) outputCreditsPerMillion?: number
  @IsOptional() @IsInt() @Min(0) @Max(2000000000) inputCostMicrosPerMillion?: number
  @IsOptional() @IsInt() @Min(0) @Max(2000000000) outputCostMicrosPerMillion?: number
  @IsOptional() @IsInt() @Min(0) @Max(2000000000) imageCostMicros?: number
  @IsOptional() @IsInt() @Min(0) @Max(2000000000) videoCostMicros?: number
  @IsOptional() @IsString() @MaxLength(30) badge?: string
  @IsOptional() @IsObject() options?: Record<string, unknown>
}

class ModelRouteDto {
  @IsString() @MinLength(1) providerId!: string
  @IsOptional() @IsString() @MaxLength(160) upstreamModelOverride?: string
  @IsOptional() @IsBoolean() enabled?: boolean
  @IsOptional() @IsInt() @Min(-10000) @Max(10000) priority?: number | null
  @IsOptional() @IsInt() @Min(0) @Max(10000) weight?: number | null
  @IsOptional() @IsInt() @Min(0) @Max(2000000000) inputCostMicrosPerMillion?: number | null
  @IsOptional() @IsInt() @Min(0) @Max(2000000000) outputCostMicrosPerMillion?: number | null
  @IsOptional() @IsInt() @Min(0) @Max(2000000000) imageCostMicros?: number | null
  @IsOptional() @IsInt() @Min(0) @Max(2000000000) videoCostMicros?: number | null
  @IsOptional() @IsObject() options?: Record<string, unknown> | null
}
class ReplaceModelRoutesDto { @IsArray() @ValidateNested({ each: true }) @Type(() => ModelRouteDto) routes!: ModelRouteDto[] }

class UpdateSystemDto {
  @IsOptional() @IsString() @MaxLength(100) siteName?: string
  @IsOptional() @IsString() @MaxLength(500) siteLogoUrl?: string
  @IsOptional() @IsString() @MaxLength(500) supportUrl?: string
  @IsOptional() @IsBoolean() sidebarCreationEnabled?: boolean
  @IsOptional() @IsBoolean() sidebarCommerceEnabled?: boolean
  @IsOptional() @IsBoolean() sidebarOfficeEnabled?: boolean
  @IsOptional() @IsBoolean() sidebarPromptsEnabled?: boolean
  @IsOptional() @IsBoolean() sidebarPluginsEnabled?: boolean
  @IsOptional() @IsBoolean() sidebarProjectsEnabled?: boolean
  @IsOptional() @IsBoolean() sidebarAssetsEnabled?: boolean
  @IsOptional() @IsBoolean() registrationEnabled?: boolean
  @IsOptional() @IsBoolean() emailLoginEnabled?: boolean
  @IsOptional() @IsBoolean() emailVerifyEnabled?: boolean
  @IsOptional() @IsBoolean() passwordLoginEnabled?: boolean
  @IsOptional() @IsBoolean() passwordRegistrationEnabled?: boolean
  @IsOptional() @IsBoolean() linuxDoLoginEnabled?: boolean
  @IsOptional() @IsString() @MaxLength(200) linuxDoClientId?: string
  @IsOptional() @IsString() @MaxLength(1000) linuxDoClientSecret?: string
  @IsOptional() @IsString() @MaxLength(1000) linuxDoRedirectUrl?: string
  @IsOptional() @IsString() @MaxLength(200) linuxDoScopes?: string
  @IsOptional() @ValidateIf((_, value) => value !== '') @IsUrl({ require_protocol: true }) @MaxLength(1000) linuxDoAuthorizeUrl?: string
  @IsOptional() @ValidateIf((_, value) => value !== '') @IsUrl({ require_protocol: true }) @MaxLength(1000) linuxDoTokenUrl?: string
  @IsOptional() @ValidateIf((_, value) => value !== '') @IsUrl({ require_protocol: true }) @MaxLength(1000) linuxDoUserInfoUrl?: string
  @IsOptional() @IsArray() @IsString({ each: true }) allowedEmailDomains?: string[]
  @IsOptional() @IsInt() @Min(1) @Max(60) otpTtlMinutes?: number
  @IsOptional() @IsInt() @Min(10) @Max(3600) otpResendSeconds?: number
  @IsOptional() @IsInt() @Min(0) @Max(1000000) defaultUserCredits?: number
  @IsOptional() @IsString() @MaxLength(20) defaultTheme?: string
  @IsOptional() @IsString() @MaxLength(20) defaultLanguage?: string
  @IsOptional() @IsString() @MaxLength(100) defaultChatModelKey?: string
  @IsOptional() @IsString() @MaxLength(100) defaultImageModelKey?: string
  @IsOptional() @IsBoolean() userByokEnabled?: boolean
  @IsOptional() @IsInt() @Min(0) @Max(1000000) inviteRewardCredits?: number
  @IsOptional() @IsBoolean() rechargeEnabled?: boolean
  @IsOptional() @IsInt() @Min(1) @Max(100000000) minRechargeCents?: number
  @IsOptional() @IsString() @MaxLength(10) currency?: string
  @IsOptional() @IsInt() @Min(0) @Max(100000000) creditValueMicros?: number
  @IsOptional() @IsBoolean() subscriptionsEnabled?: boolean
  @IsOptional() @IsBoolean() trialEnabled?: boolean
  @IsOptional() @IsString() defaultTrialPlanId?: string
  @IsOptional() @IsInt() @Min(0) @Max(1000000) trialCredits?: number
  @IsOptional() @IsString() defaultUserGroupId?: string
  @IsOptional() @IsInt() @Min(1) @Max(8760) temporaryChatRetentionHours?: number
  @IsOptional() @IsBoolean() defaultChatHistoryEnabled?: boolean
  @IsOptional() @IsBoolean() defaultTrainingOptOut?: boolean
  @IsOptional() @IsBoolean() defaultShareUsageAnalytics?: boolean
  @IsOptional() @IsBoolean() smtpEnabled?: boolean
  @IsOptional() @IsString() @MaxLength(300) smtpHost?: string
  @IsOptional() @IsInt() @Min(1) @Max(65535) smtpPort?: number
  @IsOptional() @IsBoolean() smtpSecure?: boolean
  @IsOptional() @IsString() @MaxLength(200) smtpUsername?: string
  @IsOptional() @IsString() @MaxLength(1000) smtpPassword?: string
  @IsOptional() @IsString() @MaxLength(100) smtpFromName?: string
  @IsOptional() @ValidateIf((_, value) => value !== '') @IsEmail() smtpFromEmail?: string
}

class RechargePackageDto {
  @IsString() @MinLength(1) @MaxLength(100) name!: string
  @IsOptional() @IsString() @MaxLength(1000) description?: string
  @IsInt() @Min(1) @Max(100000000) credits!: number
  @IsInt() @Min(1) @Max(100000000) priceCents!: number
  @IsOptional() @IsInt() @Min(1) @Max(100000000) originalPriceCents?: number
  @IsOptional() @IsBoolean() enabled?: boolean
  @IsOptional() @IsBoolean() recommended?: boolean
  @IsOptional() @IsInt() @Min(-10000) @Max(10000) sortOrder?: number
}

class UpdateRechargePackageDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) name?: string
  @IsOptional() @IsString() @MaxLength(1000) description?: string
  @IsOptional() @IsInt() @Min(1) @Max(100000000) credits?: number
  @IsOptional() @IsInt() @Min(1) @Max(100000000) priceCents?: number
  @IsOptional() @IsInt() @Min(1) @Max(100000000) originalPriceCents?: number
  @IsOptional() @IsBoolean() enabled?: boolean
  @IsOptional() @IsBoolean() recommended?: boolean
  @IsOptional() @IsInt() @Min(-10000) @Max(10000) sortOrder?: number
}

class CreateExternalLinkDto {
  @IsString() @Matches(/^[a-zA-Z0-9_-]+$/) @MaxLength(80) key!: string
  @IsString() @MinLength(1) @MaxLength(100) name!: string
  @IsOptional() @IsString() @MaxLength(1000) description?: string
  @IsString() @IsUrl({ require_protocol: true, protocols: ['http', 'https'] }) @MaxLength(1000) url!: string
  @IsOptional() @IsString() @MaxLength(40) icon?: string
  @IsOptional() @IsBoolean() enabled?: boolean
  @IsOptional() @IsBoolean() openNewTab?: boolean
  @IsOptional() @IsInt() @Min(-10000) @Max(10000) sortOrder?: number
}

class UpdateExternalLinkDto {
  @IsOptional() @IsString() @Matches(/^[a-zA-Z0-9_-]+$/) @MaxLength(80) key?: string
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) name?: string
  @IsOptional() @IsString() @MaxLength(1000) description?: string
  @IsOptional() @IsString() @IsUrl({ require_protocol: true, protocols: ['http', 'https'] }) @MaxLength(1000) url?: string
  @IsOptional() @IsString() @MaxLength(40) icon?: string
  @IsOptional() @IsBoolean() enabled?: boolean
  @IsOptional() @IsBoolean() openNewTab?: boolean
  @IsOptional() @IsInt() @Min(-10000) @Max(10000) sortOrder?: number
}

@Controller('admin')
@UseGuards(AuthGuard, AdminGuard)
export class AdminProvidersController {
  constructor(private readonly providers: ProvidersService) {}

  @Get('providers') providersList() { return this.providers.listProviders() }
  @Post('providers') providerCreate(@Body() body: CreateProviderDto) { return this.providers.createProvider(body) }
  @Patch('providers/:id') providerUpdate(@Param('id') id: string, @Body() body: UpdateProviderDto) { return this.providers.updateProvider(id, body) }
  @Delete('providers/:id') providerDelete(@Param('id') id: string) { return this.providers.deleteProvider(id) }
  @Post('providers/check-all') checkAllProviders() { return this.providers.checkAllProviders() }
  @Post('providers/:id/discover-models') discover(@Param('id') id: string) { return this.providers.fetchRemoteModels(id) }
  @Post('providers/:id/reset-health') resetHealth(@Param('id') id: string) { return this.providers.resetProviderHealth(id) }

  @Get('model-presets') models() { return this.providers.listModels(undefined, true) }
  @Post('model-presets') modelCreate(@Body() body: CreateModelDto) { return this.providers.createModel(body as Prisma.ModelPresetUncheckedCreateInput) }
  @Patch('model-presets/:id') modelUpdate(@Param('id') id: string, @Body() body: UpdateModelDto) { return this.providers.updateModel(id, body as Prisma.ModelPresetUncheckedUpdateInput) }
  @Delete('model-presets/:id') modelDelete(@Param('id') id: string) { return this.providers.deleteModel(id) }
  @Put('model-presets/:id/routes') modelRoutes(@Param('id') id: string, @Body() body: ReplaceModelRoutesDto) { return this.providers.replaceModelRoutes(id, body.routes) }

  @Get('system-settings') settings() { return this.providers.getSystemSettings(true) }
  @Patch('system-settings') settingsUpdate(@Body() body: UpdateSystemDto) { return this.providers.updateSystemSettings(body) }

  @Get('external-links') externalLinks() { return this.providers.listExternalLinks(true) }
  @Post('external-links') externalLinkCreate(@Body() body: CreateExternalLinkDto) { return this.providers.createExternalLink(body as Prisma.ExternalNavLinkUncheckedCreateInput) }
  @Patch('external-links/:id') externalLinkUpdate(@Param('id') id: string, @Body() body: UpdateExternalLinkDto) { return this.providers.updateExternalLink(id, body as Prisma.ExternalNavLinkUncheckedUpdateInput) }
  @Delete('external-links/:id') externalLinkDelete(@Param('id') id: string) { return this.providers.deleteExternalLink(id) }

  @Get('recharge-packages') packages() { return this.providers.listRechargePackages(true) }
  @Post('recharge-packages') packageCreate(@Body() body: RechargePackageDto) { return this.providers.createRechargePackage(body) }
  @Patch('recharge-packages/:id') packageUpdate(@Param('id') id: string, @Body() body: UpdateRechargePackageDto) { return this.providers.updateRechargePackage(id, body) }
  @Delete('recharge-packages/:id') packageDelete(@Param('id') id: string) { return this.providers.deleteRechargePackage(id) }
}
