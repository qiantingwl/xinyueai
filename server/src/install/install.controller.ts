import { Body, Controller, Get, Post } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { IsBoolean, IsEmail, IsOptional, IsString, IsUrl, Matches, MaxLength, MinLength } from 'class-validator'
import { InstallService } from './install.service'

class DatabaseInstallDto {
  @IsString() @MinLength(8) @MaxLength(200) installToken!: string
  @IsString() @Matches(/^postgres(?:ql)?:\/\//) @MaxLength(2000) databaseUrl!: string
  @IsString() @Matches(/^rediss?:\/\//) @MaxLength(2000) redisUrl!: string
}

class CompleteInstallDto {
  @IsString() @MinLength(8) @MaxLength(200) installToken!: string
  @IsString() @MinLength(1) @MaxLength(100) siteName!: string
  @IsUrl({ require_tld: false, protocols: ['http', 'https'] }) @MaxLength(500) siteUrl!: string
  @IsOptional() @IsUrl({ require_tld: false, protocols: ['http', 'https'] }) @MaxLength(1000) siteLogoUrl?: string
  @IsOptional() @IsUrl({ require_tld: false, protocols: ['http', 'https'] }) @MaxLength(1000) supportUrl?: string
  @IsOptional() @IsBoolean() registrationEnabled?: boolean
  @IsEmail() @MaxLength(320) adminEmail!: string
  @IsString() @MinLength(1) @MaxLength(100) adminDisplayName!: string
  @IsString() @MinLength(12) @MaxLength(200) adminPassword!: string
}

@Controller('install')
export class InstallController {
  constructor(private readonly install: InstallService) {}
  @Get('status') status() { return this.install.status() }
  @Post('database') @Throttle({ default: { limit: 5, ttl: 60_000 } }) database(@Body() body: DatabaseInstallDto) { return this.install.configureDatabase(body) }
  @Post('complete') @Throttle({ default: { limit: 5, ttl: 60_000 } }) complete(@Body() body: CompleteInstallDto) { return this.install.complete(body) }
}
