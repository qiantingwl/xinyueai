import { PluginCapability, PluginStatus } from '@prisma/client'
import { ArrayNotEmpty, IsArray, IsBoolean, IsEnum, IsInt, IsObject, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator'

export class PrivatePluginDto {
  @IsString() @Matches(/\S/) @MinLength(1) @MaxLength(80) name!: string
  @IsOptional() @IsString() @MaxLength(500) description?: string
  @IsString() @Matches(/\S/) @MinLength(1) @MaxLength(20_000) instruction!: string
  @IsOptional() @IsString() @MaxLength(80) icon?: string
  @IsOptional() @IsString() @MaxLength(100) categoryId?: string
  @IsOptional() @IsString() @Matches(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/) @MaxLength(40) version?: string
  @IsArray() @ArrayNotEmpty() @IsEnum(PluginCapability, { each: true }) capabilities!: PluginCapability[]
  @IsOptional() @IsString() @MaxLength(160) recommendedModel?: string
  @IsOptional() @IsString() @MaxLength(4_000) outputRequirements?: string
  @IsOptional() @IsObject() config?: Record<string, unknown>
}

export class UpdatePrivatePluginDto extends PrivatePluginDto {}

export class PluginCategoryDto {
  @IsString() @Matches(/\S/) @MinLength(1) @MaxLength(60) name!: string
  @IsString() @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) @MaxLength(80) slug!: string
  @IsOptional() @IsString() @MaxLength(500) description?: string
  @IsOptional() @IsString() @MaxLength(80) icon?: string
  @IsOptional() @IsInt() @Min(-10000) @Max(10000) sortOrder?: number
  @IsOptional() @IsBoolean() enabled?: boolean
}

export class AdminPluginDto extends PrivatePluginDto {
  @IsString() @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) @MaxLength(100) slug!: string
  @IsOptional() @IsEnum(PluginStatus) status?: PluginStatus
  @IsOptional() @IsBoolean() featured?: boolean
  @IsOptional() @IsBoolean() preinstalled?: boolean
  @IsOptional() @IsInt() @Min(0) @Max(10_000_000) priceCredits?: number
  @IsOptional() @IsInt() @Min(-10000) @Max(10000) sortOrder?: number
}
