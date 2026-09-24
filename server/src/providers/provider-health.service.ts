import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { publicUpstreamHealthMessage } from './upstream-errors'

export type ProviderHealthCandidate = { providerId?: string; credentialId?: string; routeId?: string }

@Injectable()
export class ProviderHealthService {
  constructor(private readonly prisma: PrismaService) {}

  async recordProviderResult(providerId: string | undefined, success: boolean, message = '') {
    if (!providerId) return
    const now = new Date()
    if (success) {
      await this.prisma.providerChannel.updateMany({ where: { id: providerId }, data: { consecutiveFailures: 0, cooldownUntil: null, lastSuccessAt: now, lastHealthAt: now, lastHealthStatus: 'healthy', lastHealthMessage: message || '最近调用成功' } })
      return
    }
    const provider = await this.prisma.providerChannel.findUnique({ where: { id: providerId }, select: { consecutiveFailures: true } })
    if (!provider) return
    const failures = provider.consecutiveFailures + 1
    const cooldownSeconds = failures >= 3 ? Math.min(300, 15 * 2 ** Math.min(failures - 3, 5)) : 0
      await this.prisma.providerChannel.update({ where: { id: providerId }, data: { consecutiveFailures: failures, lastFailureAt: now, lastHealthAt: now, lastHealthStatus: 'unhealthy', lastHealthMessage: publicUpstreamHealthMessage(message), cooldownUntil: cooldownSeconds ? new Date(now.getTime() + cooldownSeconds * 1000) : null } })
  }

  async recordCandidateResult(candidate: ProviderHealthCandidate, success: boolean, message = '') {
    await this.recordProviderResult(candidate.providerId, success, message)
    if (!candidate.credentialId) return
    const now = new Date()
    if (success) {
      await Promise.all([
        this.prisma.userApiCredential.updateMany({ where: { id: candidate.credentialId }, data: { lastHealthStatus: 'healthy', lastHealthMessage: message || '最近调用成功', lastHealthAt: now, lastSuccessAt: now, lastUsedAt: now, cooldownUntil: null, totalRequests: { increment: 1 } } }),
        candidate.routeId ? this.prisma.userModelRoute.updateMany({ where: { id: candidate.routeId }, data: { lastHealthStatus: 'healthy', lastHealthMessage: message || '最近调用成功', lastHealthAt: now, consecutiveFailures: 0, cooldownUntil: null } }) : Promise.resolve(),
      ])
      return
    }
    const route = candidate.routeId ? await this.prisma.userModelRoute.findUnique({ where: { id: candidate.routeId }, select: { consecutiveFailures: true } }) : null
    const failures = (route?.consecutiveFailures || 0) + 1
    const cooldownSeconds = Math.min(300, 15 * 2 ** Math.min(4, Math.max(0, failures - 1)))
    await Promise.all([
      this.prisma.userApiCredential.updateMany({ where: { id: candidate.credentialId }, data: { lastHealthStatus: 'unhealthy', lastHealthMessage: publicUpstreamHealthMessage(message), lastHealthAt: now, lastFailureAt: now, lastUsedAt: now, cooldownUntil: new Date(now.getTime() + cooldownSeconds * 1000), totalRequests: { increment: 1 }, totalFailures: { increment: 1 } } }),
      candidate.routeId ? this.prisma.userModelRoute.updateMany({ where: { id: candidate.routeId }, data: { lastHealthStatus: 'unhealthy', lastHealthMessage: publicUpstreamHealthMessage(message), lastHealthAt: now, consecutiveFailures: failures, cooldownUntil: new Date(now.getTime() + cooldownSeconds * 1000) } }) : Promise.resolve(),
    ])
  }
}
