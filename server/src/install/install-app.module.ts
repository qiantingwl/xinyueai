import { Controller, Get, Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { ConfigModule } from '@nestjs/config'
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler'
import { InstallModule } from './install.module'

@Controller('health')
class InstallHealthController {
  @Get() health() { return { ok: true, service: 'xinyue-ai-api', mode: process.env.APP_BOOT_MODE || 'install', timestamp: new Date().toISOString() } }
}

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]), InstallModule],
  controllers: [InstallHealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class InstallAppModule {}
