import { Controller, Get, Res, UseGuards } from '@nestjs/common'
import type { FastifyReply } from 'fastify'
import { RequireAdminPermission } from './admin/admin-permission.decorator'
import { AdminGuard } from './admin/admin.guard'
import { AuthGuard } from './auth/auth.guard'
import { PrismaService } from './prisma/prisma.service'
import { RuntimeMetricsService } from './common/runtime-metrics.service'
import { ReadinessService } from './common/readiness.service'
import { Public } from './auth/public.decorator'

@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService, private readonly metrics: RuntimeMetricsService, private readonly readiness: ReadinessService) {}

  @Get()
  async health() {
    await this.prisma.$queryRaw`SELECT 1`
    return { ok: true, service: 'flux-studio-api', timestamp: new Date().toISOString() }
  }

  @Get('live')
  live() {
    return { ok: true, service: 'flux-studio-api', timestamp: new Date().toISOString() }
  }

  @Get('ready')
  async ready(@Res({ passthrough: true }) response: FastifyReply) {
    const result = await this.readiness.check()
    if (!result.ok) response.status(503)
    return result
  }

  @Get('metrics')
  @UseGuards(AuthGuard, AdminGuard)
  @RequireAdminPermission('dashboard.read')
  metricsSnapshot() {
    return this.metrics.snapshot()
  }
}
