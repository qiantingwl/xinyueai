import { ConflictException, Injectable } from '@nestjs/common'
import { JobKind, Prisma, TokenLedgerType, TokenSettlementStatus, TokenUsageSource } from '@prisma/client'
import { TokenQuotaService } from '../billing/token-quota.service'
import { PrismaService } from '../prisma/prisma.service'
import { TerminalSettlementError } from './generation-provider-errors'
import { currentOutboundExecutionLease } from '../common/outbound-http'
import { asJsonRecord } from '../common/json-record'

const NON_CHAT_KINDS = new Set<JobKind>([JobKind.IMAGE, JobKind.VIDEO, JobKind.COMMERCE])

@Injectable()
export class GenerationSettlementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenQuota: TokenQuotaService,
  ) {}

  async settleNonChat(generationId: string, providerAttemptId?: string) {
    const executionLease = currentOutboundExecutionLease()
    const job = await this.prisma.generationJob.findUnique({
      where: { id: generationId },
      select: {
        id: true,
        userId: true,
        kind: true,
        status: true,
        settlementStatus: true,
        provider: true,
        model: true,
        conversationId: true,
        options: true,
        pricingSnapshot: true,
        creditCost: true,
        revenueMicros: true,
        upstreamCostMicros: true,
        lockedBy: true,
        leaseVersion: true,
        leaseExpiresAt: true,
      },
    })
    if (!job) throw new TerminalSettlementError('生成任务不存在，无法完成结算')
    if (!NON_CHAT_KINDS.has(job.kind)) throw new ConflictException('该结算入口仅用于非聊天生成任务')
    if (executionLease && (job.status !== 'RUNNING'
      || job.lockedBy !== executionLease.workerId
      || job.leaseVersion !== executionLease.leaseVersion
      || !job.leaseExpiresAt
      || job.leaseExpiresAt.getTime() <= Date.now())) {
      throw new TerminalSettlementError('生成任务执行租约已失效，结算已拒绝')
    }

    const options = asJsonRecord(job.options)
    const expectedOutputs = job.kind === JobKind.COMMERCE
      ? Math.max(1, Math.min(12, Math.trunc(Number(options.modules || 8))))
      : job.kind === JobKind.IMAGE
        ? Math.max(1, Math.min(10, Math.trunc(Number(options.count || 1))))
        : 1
    const outputCount = await this.prisma.jobOutput.count({ where: { jobId: generationId } })
    if (outputCount !== expectedOutputs) {
      throw new TerminalSettlementError(`任务结果未完整持久化：期望 ${expectedOutputs} 项，实际 ${outputCount} 项`)
    }

    const attempt = providerAttemptId
      ? await this.prisma.providerAttempt.findFirst({
          where: { id: providerAttemptId, generationId, status: 'SUCCEEDED' },
          select: { id: true, metadata: true },
        })
      : await this.prisma.providerAttempt.findFirst({
          where: { generationId, status: 'SUCCEEDED' },
          orderBy: { endedAt: 'desc' },
          select: { id: true, metadata: true },
        })
    if (!attempt) throw new TerminalSettlementError('任务缺少已成功的 ProviderAttempt，已阻止结算')

    if (job.settlementStatus !== 'SETTLED') {
      if (job.status !== 'RUNNING' || !['PENDING', 'RESERVED', 'RECONCILING'].includes(job.settlementStatus)) {
        throw new TerminalSettlementError('任务状态不允许完成结算')
      }
      const marked = await this.prisma.generationJob.updateMany({
        where: {
          id: generationId,
          userId: job.userId,
          status: 'RUNNING',
          settlementStatus: { in: ['PENDING', 'RESERVED', 'RECONCILING'] },
          ...(executionLease ? {
            lockedBy: executionLease.workerId,
            leaseVersion: executionLease.leaseVersion,
            leaseExpiresAt: { gt: new Date() },
          } : {}),
        },
        data: { settlementStatus: 'RECONCILING' },
      })
      if (marked.count !== 1) throw new TerminalSettlementError('任务结算状态发生并发变化')
    }

    const billing = asJsonRecord(options.billing)
    const attemptMetadata = asJsonRecord(attempt.metadata)
    const providerRequestId = this.firstString(
      attemptMetadata.providerRequestId,
      attemptMetadata.requestId,
      attemptMetadata.request_id,
    )
    const baseSnapshot = asJsonRecord(job.pricingSnapshot)
    const pricingSnapshot = {
      ...baseSnapshot,
      kind: job.kind,
      ledgerUnit: 'CREATION_CREDIT',
      creditCost: job.creditCost,
      revenueMicros: job.revenueMicros,
      upstreamCostMicros: job.upstreamCostMicros,
    } as Prisma.InputJsonValue

    try {
      const settled = await this.tokenQuota.settleGeneration({
        userId: job.userId,
        generationId,
        reservations: [],
        ledger: {
          userId: job.userId,
          generationId,
          quotaId: null,
          subscriptionId: this.firstString(billing.subscriptionId) || null,
          model: job.model,
          provider: job.provider,
          providerRequestId: providerRequestId || null,
          providerAttemptId: attempt.id,
          inputTokens: 0,
          outputTokens: 0,
          cachedInputTokens: 0,
          reasoningTokens: 0,
          reservedUnits: BigInt(Math.max(0, job.creditCost)),
          chargedUnits: BigInt(Math.max(0, job.creditCost)),
          inputRate: 0,
          outputRate: 0,
          pricingSnapshot,
          usageSource: TokenUsageSource.MANUAL,
          settlementStatus: TokenSettlementStatus.SETTLED,
          type: TokenLedgerType.CHARGE,
          idempotencyKey: `job:${generationId}:creation-ledger`,
        },
      })
      if (job.conversationId) {
        await this.prisma.conversation.update({ where: { id: job.conversationId }, data: { updatedAt: new Date() } }).catch(() => undefined)
      }
      return settled
    } catch (error) {
      if (error instanceof TerminalSettlementError) throw error
      throw new TerminalSettlementError(`非聊天任务结算失败：${error instanceof Error ? error.message : '未知错误'}`)
    }
  }


  private firstString(...values: unknown[]) {
    return values.find((value): value is string => typeof value === 'string' && value.length > 0)
  }
}
