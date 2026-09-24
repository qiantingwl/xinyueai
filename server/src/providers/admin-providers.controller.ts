import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Put, Req, UseGuards } from '@nestjs/common'
import { Type } from 'class-transformer'
import { IsArray, IsBoolean, IsEmail, IsEnum, IsIn, IsInt, IsObject, IsOptional, IsString, IsUrl, Matches, Max, MaxLength, Min, MinLength, ValidateIf, ValidateNested } from 'class-validator'
import { AssetKind, ModelCapability, Prisma, ProviderAuthType, ProviderType } from '@prisma/client'
import type { FastifyRequest } from 'fastify'
import { AssetsService, resolveRasterImageMime } from '../assets/assets.service'
import { AdminGuard } from '../admin/admin.guard'
import { AuthGuard } from '../auth/auth.guard'
import { CurrentUser, AuthenticatedUser } from '../common/request-user'
import { ProvidersService } from './providers.service'
import { CapabilityRegistryService } from './capability-registry.service'

class CreateProviderDto {
  @IsString() @MinLength(1) @MaxLength(100) name!: string
  @IsOptional() @IsString() templateId?: string | null
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
  @IsOptional() @IsString() templateId?: string | null
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

class CreateModelVendorDto {
  @IsString() @Matches(/^[a-z0-9][a-z0-9_-]*$/) @MaxLength(80) key!: string
  @IsString() @MinLength(1) @MaxLength(100) name!: string
  @IsOptional() @IsString() @MaxLength(100) icon?: string
  @IsOptional() @ValidateIf((_, value) => value !== '') @IsUrl({ require_protocol: true, protocols: ['http', 'https'] }) @MaxLength(500) websiteUrl?: string
  @IsOptional() @IsBoolean() enabled?: boolean
  @IsOptional() @IsInt() @Min(-10000) @Max(10000) sortOrder?: number
}

class UpdateModelVendorDto {
  @IsOptional() @IsString() @Matches(/^[a-z0-9][a-z0-9_-]*$/) @MaxLength(80) key?: string
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) name?: string
  @IsOptional() @IsString() @MaxLength(100) icon?: string
  @IsOptional() @ValidateIf((_, value) => value !== '') @IsUrl({ require_protocol: true, protocols: ['http', 'https'] }) @MaxLength(500) websiteUrl?: string
  @IsOptional() @IsBoolean() enabled?: boolean
  @IsOptional() @IsInt() @Min(-10000) @Max(10000) sortOrder?: number
}

class CreateProviderTemplateDto {
  @IsString() @Matches(/^[a-z0-9][a-z0-9_-]*$/) @MaxLength(80) key!: string
  @IsString() @MinLength(1) @MaxLength(100) name!: string
  @IsOptional() @IsString() @MaxLength(1000) description?: string
  @IsOptional() @IsString() vendorId?: string | null
  @IsEnum(ProviderType) type!: ProviderType
  @IsOptional() @IsString() @MaxLength(500) baseUrl?: string
  @IsOptional() @IsEnum(ProviderAuthType) authType?: ProviderAuthType
  @IsOptional() @IsIn(['openai', 'anthropic', 'gemini']) apiProtocol?: 'openai' | 'anthropic' | 'gemini'
  @IsOptional() @IsIn(['openai', 'anthropic', 'gemini', 'xai', 'qwen', 'doubao', 'disabled']) nativeSearchProvider?: 'openai' | 'anthropic' | 'gemini' | 'xai' | 'qwen' | 'doubao' | 'disabled'
  @IsOptional() @IsObject() customHeaders?: Record<string, string>
  @IsOptional() @IsBoolean() supportsDiscovery?: boolean
  @IsOptional() @IsBoolean() enabled?: boolean
  @IsOptional() @IsInt() @Min(-10000) @Max(10000) sortOrder?: number
}

class UpdateProviderTemplateDto {
  @IsOptional() @IsString() @Matches(/^[a-z0-9][a-z0-9_-]*$/) @MaxLength(80) key?: string
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) name?: string
  @IsOptional() @IsString() @MaxLength(1000) description?: string
  @IsOptional() @IsString() vendorId?: string | null
  @IsOptional() @IsEnum(ProviderType) type?: ProviderType
  @IsOptional() @IsString() @MaxLength(500) baseUrl?: string
  @IsOptional() @IsEnum(ProviderAuthType) authType?: ProviderAuthType
  @IsOptional() @IsIn(['openai', 'anthropic', 'gemini']) apiProtocol?: 'openai' | 'anthropic' | 'gemini'
  @IsOptional() @IsIn(['openai', 'anthropic', 'gemini', 'xai', 'qwen', 'doubao', 'disabled']) nativeSearchProvider?: 'openai' | 'anthropic' | 'gemini' | 'xai' | 'qwen' | 'doubao' | 'disabled'
  @IsOptional() @IsObject() customHeaders?: Record<string, string>
  @IsOptional() @IsBoolean() supportsDiscovery?: boolean
  @IsOptional() @IsBoolean() enabled?: boolean
  @IsOptional() @IsInt() @Min(-10000) @Max(10000) sortOrder?: number
}

class CreateModelDto {
  @IsString() @MinLength(1) @MaxLength(100) key!: string
  @IsString() @MinLength(1) @MaxLength(100) displayName!: string
  @IsOptional() @IsString() @MaxLength(1000) description?: string
  @IsOptional() @IsString() vendorId?: string
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
  @IsOptional() @IsString() vendorId?: string | null
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

class ImportProviderModelsDto {
  @IsOptional() @IsArray() @IsString({ each: true }) modelIds?: string[]
  @IsOptional() @IsBoolean() importAll?: boolean
  @IsOptional() @IsInt() @Min(100) @Max(1000) markupPercent?: number
  @IsOptional() @IsBoolean() overwritePricing?: boolean
}

class ModelPricingPreviewDto {
  @IsOptional() @IsInt() @Min(100) @Max(1000) markupPercent?: number
  @IsOptional() @IsBoolean() forceRefresh?: boolean
}

class ApplyModelPricingDto {
  @IsArray() @IsString({ each: true }) modelIds!: string[]
  @IsOptional() @IsInt() @Min(100) @Max(1000) markupPercent?: number
}

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
  @IsOptional() @IsObject() sidebarNav?: Record<string, unknown>
  @IsOptional() @IsObject() workspaceNav?: Record<string, unknown>
  @IsOptional() @IsObject() sectionNav?: Record<string, unknown>
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
  @IsOptional() @IsIn(['gpt', 'doubao', 'qianwen', 'kimi', 'jixing']) chatUiPreset?: string
  @IsOptional() @IsIn(['ambient', 'active', 'off']) chatAvatarMotion?: string
  @IsOptional() @IsBoolean() chatAvatarEnabled?: boolean
  @IsOptional() @IsIn(['classic', 'lively', 'calm', 'geometric', 'faces', 'orbit', 'comet', 'thinker', 'sleepy']) chatAvatarStyle?: string
  @IsOptional() @IsString() @MaxLength(20) @Matches(/^(auto|brand|#[0-9a-fA-F]{3,8})$/) chatAvatarColor?: string
  @IsOptional() @IsObject() chatHomeContent?: Record<string, unknown>
  @IsOptional() @IsObject() siteContent?: Record<string, unknown>
  @IsOptional() @IsString() @MaxLength(100) defaultChatModelKey?: string
  @IsOptional() @IsString() @MaxLength(100) defaultImageModelKey?: string
  @IsOptional() @IsBoolean() imagePromptEnabled?: boolean
  @IsOptional() @IsString() @MaxLength(100) imagePromptModelKey?: string
  @IsOptional() @IsIn(['PLATFORM', 'USER_CREDITS', 'USER_BYOK']) imagePromptBillingMode?: string
  @IsOptional() @IsBoolean() userByokEnabled?: boolean
  @IsOptional() @IsInt() @Min(0) @Max(1000000) inviteRewardCredits?: number
  @IsOptional() @IsBoolean() referralEnabled?: boolean
  @IsOptional() @IsInt() @Min(0) @Max(365) referralCoolingDays?: number
  @IsOptional() @IsInt() @Min(0) @Max(100000000) referralMinimumPaidCents?: number
  @IsOptional() @IsInt() @Min(0) @Max(100000) referralMonthlyRewardLimit?: number
  @IsOptional() @IsBoolean() referralAutoApprove?: boolean
  @IsOptional() @IsBoolean() rechargeEnabled?: boolean
  @IsOptional() @IsInt() @Min(1) @Max(100000000) minRechargeCents?: number
  @IsOptional() @IsString() @MaxLength(10) currency?: string
  @IsOptional() @IsInt() @Min(0) @Max(100000000) creditValueMicros?: number
  @IsOptional() @IsInt() @Min(1) @Max(100000000) pricingUsdExchangeRateMicros?: number
  @IsOptional() @IsInt() @Min(100) @Max(1000) modelImportMarkupPercent?: number
  @IsOptional() @IsUrl({ require_protocol: true, protocols: ['http', 'https'] }) @MaxLength(2000) modelPriceCatalogUrl?: string
  @IsOptional() @IsInt() @Min(1) @Max(168) modelPriceCatalogRefreshHours?: number
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
  constructor(private readonly providers: ProvidersService, private readonly assets: AssetsService, private readonly capabilities: CapabilityRegistryService) {}

  @Get('providers') providersList() { return this.providers.listProviders() }
  @Get('model-vendors') modelVendors() { return this.providers.listModelVendors(true) }
  @Post('model-vendors') modelVendorCreate(@Body() body: CreateModelVendorDto) { return this.providers.createModelVendor(body) }
  @Patch('model-vendors/:id') modelVendorUpdate(@Param('id') id: string, @Body() body: UpdateModelVendorDto) { return this.providers.updateModelVendor(id, body) }
  @Delete('model-vendors/:id') modelVendorDelete(@Param('id') id: string) { return this.providers.deleteModelVendor(id) }
  @Get('provider-templates') providerTemplates() { return this.providers.listProviderTemplates(true) }
  @Post('provider-templates') providerTemplateCreate(@Body() body: CreateProviderTemplateDto) { return this.providers.createProviderTemplate(body) }
  @Patch('provider-templates/:id') providerTemplateUpdate(@Param('id') id: string, @Body() body: UpdateProviderTemplateDto) { return this.providers.updateProviderTemplate(id, body) }
  @Delete('provider-templates/:id') providerTemplateDelete(@Param('id') id: string) { return this.providers.deleteProviderTemplate(id) }
  @Post('providers') providerCreate(@Body() body: CreateProviderDto) { return this.providers.createProvider(body) }
  @Patch('providers/:id') providerUpdate(@Param('id') id: string, @Body() body: UpdateProviderDto) { return this.providers.updateProvider(id, body) }
  @Delete('providers/:id') providerDelete(@Param('id') id: string) { return this.providers.deleteProvider(id) }
  @Post('providers/check-all') checkAllProviders() { return this.providers.checkAllProviders() }
  @Post('providers/:id/discover-models') discover(@Param('id') id: string) { return this.providers.fetchRemoteModels(id) }
  @Post('providers/:id/import-models') importModels(@Param('id') id: string, @Body() body: ImportProviderModelsDto) { return this.providers.importProviderModels(id, body) }
  @Post('providers/:id/reset-health') resetHealth(@Param('id') id: string) { return this.providers.resetProviderHealth(id) }
  @Get('byok/summary') byokSummary() { return this.providers.adminByokSummary() }

  @Get('model-presets') models() { return this.providers.listModels(undefined, true) }
  @Post('model-presets') modelCreate(@Body() body: CreateModelDto) { return this.providers.createModel(body as Prisma.ModelPresetUncheckedCreateInput) }
  @Patch('model-presets/:id') modelUpdate(@Param('id') id: string, @Body() body: UpdateModelDto) { return this.providers.updateModel(id, body as Prisma.ModelPresetUncheckedUpdateInput) }
  @Delete('model-presets/:id') modelDelete(@Param('id') id: string) { return this.providers.deleteModel(id) }
  @Put('model-presets/:id/routes') modelRoutes(@Param('id') id: string, @Body() body: ReplaceModelRoutesDto) { return this.providers.replaceModelRoutes(id, body.routes) }
  @Get('model-presets/:id/price-versions') modelPriceVersions(@Param('id') id: string) { return this.providers.modelPriceVersions(id) }
  @Post('model-pricing/preview') modelPricingPreview(@Body() body: ModelPricingPreviewDto) { return this.providers.modelPricingComparison(body.markupPercent, body.forceRefresh !== false) }
  @Post('model-pricing/apply') modelPricingApply(@Body() body: ApplyModelPricingDto) { return this.providers.applyModelPricing(body) }

  @Get('system-settings') settings() { return this.providers.getSystemSettings(true) }
  @Get('capability-registry') capabilityRegistry() { return this.capabilities.snapshot() }
  @Patch('system-settings') settingsUpdate(@Body() body: UpdateSystemDto) { return this.providers.updateSystemSettings(body) }

  @Post('system-settings/chat-home-image')
  async chatHomeImage(@CurrentUser() admin: AuthenticatedUser, @Req() request: FastifyRequest) {
    const part = await request.file()
    if (!part) throw new BadRequestException('请选择轮播封面图片')
    const mimeType = resolveRasterImageMime(part.filename, part.mimetype)
    if (!mimeType) {
      part.file.resume()
      throw new BadRequestException('轮播封面仅支持 JPG、PNG、WebP、GIF 或 AVIF')
    }
    const asset = await this.assets.storeUpload(admin.id, { stream: part.file, name: part.filename, mimeType, kind: AssetKind.IMAGE, metadata: { purpose: 'chat-home-banner' } })
    return { assetId: asset.id, imageUrl: `/v1/catalog/chat-home-images/${asset.id}` }
  }

  @Get('external-links') externalLinks() { return this.providers.listExternalLinks(true) }
  @Post('external-links') externalLinkCreate(@Body() body: CreateExternalLinkDto) { return this.providers.createExternalLink(body as Prisma.ExternalNavLinkUncheckedCreateInput) }
  @Patch('external-links/:id') externalLinkUpdate(@Param('id') id: string, @Body() body: UpdateExternalLinkDto) { return this.providers.updateExternalLink(id, body as Prisma.ExternalNavLinkUncheckedUpdateInput) }
  @Delete('external-links/:id') externalLinkDelete(@Param('id') id: string) { return this.providers.deleteExternalLink(id) }

  @Get('recharge-packages') packages() { return this.providers.listRechargePackages(true) }
  @Post('recharge-packages') packageCreate(@Body() body: RechargePackageDto) { return this.providers.createRechargePackage(body) }
  @Patch('recharge-packages/:id') packageUpdate(@Param('id') id: string, @Body() body: UpdateRechargePackageDto) { return this.providers.updateRechargePackage(id, body) }
  @Delete('recharge-packages/:id') packageDelete(@Param('id') id: string) { return this.providers.deleteRechargePackage(id) }
}
