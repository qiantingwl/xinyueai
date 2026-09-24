import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { buildJobLedgers, reconcileJobLedger } from './billing-reconciliation'
import { asJsonRecord } from '../common/json-record'

@Injectable()
export class BillingReconciliationService {
  constructor(private readonly prisma: PrismaService) {}

  async report(rawDays?: string) {
    const days = Math.min(365, Math.max(1, Number(rawDays || 30) || 30))
    const since = new Date(Date.now() - days * 86_400_000)
    const jobs = await this.prisma.generationJob.findMany({
      where: { createdAt: { gte: since }, status: { in: ['SUCCEEDED', 'FAILED', 'CANCELLED'] } },
      orderBy: { createdAt: 'desc' },
      take: 10_000,
      select: {
        id: true, kind: true, status: true, model: true, provider: true, billingTeamId: true,
        creditCost: true, revenueMicros: true, upstreamCostMicros: true, pricingSnapshot: true,
        inputTokens: true, outputTokens: true, cachedInputTokens: true, reasoningTokens: true,
        createdAt: true, completedAt: true,
        user: { select: { id: true, displayName: true, email: true } },
        billingTeam: { select: { id: true, name: true } },
      },
    })
    const jobIds = jobs.map((job) => job.id)
    const [personalEntries, teamEntries] = jobIds.length ? await Promise.all([
      this.prisma.creditLedger.findMany({ where: { referenceType: 'generation_job', referenceId: { in: jobIds }, type: { in: ['SPEND', 'REFUND'] } }, select: { type: true, amount: true, referenceId: true } }),
      this.prisma.teamCreditLedger.findMany({ where: { referenceType: 'generation_job', referenceId: { in: jobIds }, type: { in: ['SPEND', 'REFUND'] } }, select: { type: true, amount: true, referenceId: true } }),
    ]) : [[], []]
    const ledgers = buildJobLedgers([...personalEntries, ...teamEntries])

    const items = jobs.flatMap((job) => {
      const ledger = reconcileJobLedger(job.status, job.creditCost, ledgers.get(job.id))
      const netLedgerCharge = ledger.netLedgerCharge
      const issues: Array<{ code: string; severity: 'CRITICAL' | 'WARNING'; message: string }> = []
      issues.push(...ledger.issues)
      const totalTokens = job.inputTokens + job.outputTokens
      if (job.kind === 'CHAT' && job.status === 'SUCCEEDED' && totalTokens === 0 && !job.provider.startsWith('demo:')) {
        issues.push({ code: 'MISSING_PROVIDER_USAGE', severity: 'WARNING', message: '供应商未返回 Token 用量，无法核验上游成本' })
      }
      const pricing = asJsonRecord(job.pricingSnapshot)
      const expectedUpstreamCost = job.kind === 'CHAT'
        ? Math.min(2_000_000_000, Math.ceil(job.inputTokens * this.number(pricing.inputCostMicrosPerMillion) / 1_000_000) + Math.ceil(job.outputTokens * this.number(pricing.outputCostMicrosPerMillion) / 1_000_000))
        : null
      if (expectedUpstreamCost !== null && expectedUpstreamCost !== job.upstreamCostMicros) {
        issues.push({ code: 'UPSTREAM_COST_MISMATCH', severity: 'WARNING', message: `按价格快照应计成本 ${expectedUpstreamCost} 微元，任务记录为 ${job.upstreamCostMicros} 微元` })
      }
      if (!issues.length) return []
      const severity = issues.some((issue) => issue.severity === 'CRITICAL') ? 'CRITICAL' : 'WARNING'
      return [{
        id: job.id,
        status: severity,
        issueCount: issues.length,
        issueCodes: issues.map((issue) => issue.code).join(', '),
        issueSummary: issues.map((issue) => issue.message).join('；'),
        jobStatus: job.status,
        kind: job.kind,
        model: job.model,
        provider: job.provider,
        user: job.user,
        billingAccount: job.billingTeam ? `团队：${job.billingTeam.name}` : '个人账户',
        inputTokens: job.inputTokens,
        outputTokens: job.outputTokens,
        cachedInputTokens: job.cachedInputTokens,
        reasoningTokens: job.reasoningTokens,
        taskCreditCost: job.creditCost,
        ledgerSpent: ledger.spent,
        ledgerRefunded: ledger.refunded,
        netLedgerCharge,
        upstreamCostMicros: job.upstreamCostMicros,
        expectedUpstreamCost,
        revenueMicros: job.revenueMicros,
        issues,
        createdAt: job.createdAt,
        completedAt: job.completedAt,
      }]
    })
    return {
      days,
      since,
      truncated: jobs.length === 10_000,
      summary: {
        checkedJobs: jobs.length,
        abnormalJobs: items.length,
        criticalJobs: items.filter((item) => item.status === 'CRITICAL').length,
        warningJobs: items.filter((item) => item.status === 'WARNING').length,
      },
      items,
    }
  }

  private number(value: unknown) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0
  }
}
