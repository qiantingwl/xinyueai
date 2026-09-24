import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'

type DailyCount = { day: Date; count: bigint }
type DailyRevenue = { day: Date; revenue: bigint }
type DailyTokens = { day: Date; tokens: bigint }
type TrendItem = { date: string; newUsers: number; jobs: number; revenueCents: number; tokens: number }

@Injectable()
export class AdminOverviewService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview() {
    const since = new Date(Date.now() - 30 * 86_400_000)
    const trendSince = new Date()
    trendSince.setUTCHours(0, 0, 0, 0)
    trendSince.setUTCDate(trendSince.getUTCDate() - 13)

    const [
      users,
      newUsers,
      activeUsers,
      groups,
      jobs,
      runningJobs,
      failed,
      assets,
      bytes,
      credit,
      providers,
      healthyProviders,
      activeSubscriptions,
      subscriptionRevenue,
      rechargeRevenue,
      pendingSubscriptionOrders,
      pendingRechargeOrders,
      externalLinks,
      trendUsers,
      trendJobs,
      trendPayments,
      trendTokens,
      paymentFailures,
      paidPending,
      unhealthyPaymentChannels,
      suspendedUsers,
      moderationOpen,
      supportOpen,
      supportUrgent
    ] = await Promise.all([
      this.prisma.user.count({ where: { role: 'USER' } }),
      this.prisma.user.count({ where: { role: 'USER', createdAt: { gte: since } } }),
      this.prisma.user.count({ where: { role: 'USER', status: 'ACTIVE' } }),
      this.prisma.userGroup.count({ where: { enabled: true } }),
      this.prisma.generationJob.count(),
      this.prisma.generationJob.count({ where: { status: { in: ['QUEUED', 'RUNNING'] } } }),
      this.prisma.generationJob.count({ where: { status: 'FAILED' } }),
      this.prisma.asset.count({ where: { deletedAt: null } }),
      this.prisma.asset.aggregate({ where: { deletedAt: null }, _sum: { size: true } }),
      this.prisma.creditLedger.aggregate({ where: { type: 'SPEND' }, _sum: { amount: true } }),
      this.prisma.providerChannel.count({ where: { enabled: true } }),
      this.prisma.providerChannel.count({ where: { enabled: true, lastHealthStatus: 'healthy' } }),
      this.prisma.userSubscription.count({
        where: {
          status: { in: ['ACTIVE', 'TRIALING'] },
          OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { gt: new Date() } }]
        }
      }),
      this.prisma.subscriptionOrder.aggregate({
        where: { status: 'PAID', paidAt: { gte: since } },
        _sum: { amountCents: true }
      }),
      this.prisma.rechargeOrder.aggregate({
        where: { status: 'PAID', paidAt: { gte: since } },
        _sum: { amountCents: true }
      }),
      this.prisma.subscriptionOrder.count({ where: { status: 'PENDING' } }),
      this.prisma.rechargeOrder.count({ where: { status: 'PENDING' } }),
      this.prisma.externalNavLink.count({ where: { enabled: true } }),
      this.prisma.$queryRaw<DailyCount[]>(Prisma.sql`
        SELECT date_trunc('day', "createdAt") AS day, COUNT(*)::bigint AS count
        FROM "User"
        WHERE role = 'USER' AND "createdAt" >= ${trendSince}
        GROUP BY 1
      `),
      this.prisma.$queryRaw<DailyCount[]>(Prisma.sql`
        SELECT date_trunc('day', "createdAt") AS day, COUNT(*)::bigint AS count
        FROM "GenerationJob"
        WHERE "createdAt" >= ${trendSince}
        GROUP BY 1
      `),
      this.prisma.$queryRaw<DailyRevenue[]>(Prisma.sql`
        SELECT date_trunc('day', "completedAt") AS day,
               COALESCE(SUM("amountCents"), 0)::bigint AS revenue
        FROM "PaymentTransaction"
        WHERE status = 'COMPLETED' AND "completedAt" >= ${trendSince}
        GROUP BY 1
      `),
      this.prisma.$queryRaw<DailyTokens[]>(Prisma.sql`
        SELECT date_trunc('day', "completedAt") AS day,
               COALESCE(SUM("inputTokens" + "cachedInputTokens" + "outputTokens" + "reasoningTokens"), 0)::bigint AS tokens
        FROM "GenerationJob"
        WHERE "completedAt" >= ${trendSince}
        GROUP BY 1
      `),
      this.prisma.paymentTransaction.count({ where: { status: 'FAILED', createdAt: { gte: since } } }),
      this.prisma.paymentTransaction.count({ where: { status: 'PAID' } }),
      this.prisma.paymentChannel.count({ where: { enabled: true, lastHealthStatus: 'invalid' } }),
      this.prisma.user.count({ where: { role: 'USER', status: 'SUSPENDED' } }),
      this.prisma.moderationEvent.count({ where: { status: 'OPEN' } }),
      this.prisma.supportTicket.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
      this.prisma.supportTicket.count({
        where: { priority: 'URGENT', status: { notIn: ['RESOLVED', 'CLOSED'] } }
      })
    ])

    const trend = this.createTrend(trendUsers, trendJobs, trendPayments, trendTokens)
    const today = trend.at(-1) || { date: '', newUsers: 0, jobs: 0, revenueCents: 0, tokens: 0 }

    return {
      users,
      newUsers,
      activeUsers,
      groups,
      jobs,
      runningJobs,
      failedJobs: failed,
      assets,
      storageBytes: Number(bytes._sum.size || 0),
      creditsSpent: Math.abs(credit._sum.amount || 0),
      providers,
      healthyProviders,
      activeSubscriptions,
      revenueCents: (subscriptionRevenue._sum.amountCents || 0) + (rechargeRevenue._sum.amountCents || 0),
      pendingOrders: pendingSubscriptionOrders + pendingRechargeOrders,
      externalLinks,
      trend,
      today,
      alerts: {
        paymentFailures,
        paidPending,
        unhealthyChannels: providers - healthyProviders + unhealthyPaymentChannels,
        unhealthyProviderChannels: providers - healthyProviders,
        unhealthyPaymentChannels,
        suspendedUsers,
        moderationOpen,
        supportOpen,
        supportUrgent
      }
    }
  }

  private createTrend(users: DailyCount[], jobs: DailyCount[], payments: DailyRevenue[], tokens: DailyTokens[]) {
    const trend: TrendItem[] = Array.from({ length: 14 }, (_, offset) => {
      const date = new Date()
      date.setUTCHours(0, 0, 0, 0)
      date.setUTCDate(date.getUTCDate() - (13 - offset))
      return { date: date.toISOString().slice(0, 10), newUsers: 0, jobs: 0, revenueCents: 0, tokens: 0 }
    })
    const byDate = new Map(trend.map((item) => [item.date, item]))
    for (const row of users) {
      const item = byDate.get(new Date(row.day).toISOString().slice(0, 10))
      if (item) item.newUsers = Number(row.count)
    }
    for (const row of jobs) {
      const item = byDate.get(new Date(row.day).toISOString().slice(0, 10))
      if (item) item.jobs = Number(row.count)
    }
    for (const row of payments) {
      const item = byDate.get(new Date(row.day).toISOString().slice(0, 10))
      if (item) item.revenueCents = Number(row.revenue)
    }
    for (const row of tokens) {
      const item = byDate.get(new Date(row.day).toISOString().slice(0, 10))
      if (item) item.tokens = Number(row.tokens)
    }
    return trend
  }
}
