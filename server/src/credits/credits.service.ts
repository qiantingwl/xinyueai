import { ConflictException, HttpException, HttpStatus, Injectable } from '@nestjs/common'
import { LedgerType, Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { currentOutboundExecutionLease } from '../common/outbound-http'

@Injectable()
export class CreditsService {
  constructor(private readonly prisma: PrismaService) {}
  async balance(userId: string) { return this.prisma.creditAccount.findUniqueOrThrow({ where: { userId }, select: { balance: true, updatedAt: true } }) }
  async entries(userId: string, take = 50) { return this.prisma.creditLedger.findMany({ where: { account: { userId } }, orderBy: { createdAt: 'desc' }, take: Math.min(take, 100) }) }
  async mutate(userId: string, amount: number, type: LedgerType, description: string, idempotencyKey?: string, reference?: { type: string; id: string }) {
    if (!Number.isInteger(amount) || amount === 0) throw new ConflictException('无效的创作点变更')
    return this.prisma.$transaction(async (tx) => {
      return this.mutateInTransaction(tx, userId, amount, type, description, idempotencyKey, reference)
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
  }

  /**
   * The body of {@link mutate}, callable from an existing serializable
   * transaction so a caller can bind the grant to its own atomic gate (for
   * example a redemption code's use counter) instead of crediting first and
   * hoping the follow-up write lands.
   */
  async mutateInTransaction(
    tx: Prisma.TransactionClient,
    userId: string,
    amount: number,
    type: LedgerType,
    description: string,
    idempotencyKey?: string,
    reference?: { type: string; id: string },
  ) {
    if (!Number.isInteger(amount) || amount === 0) throw new ConflictException('无效的创作点变更')
    if (idempotencyKey) {
      const existing = await tx.creditLedger.findUnique({ where: { idempotencyKey } })
      if (existing) return existing
    }
    await this.assertGenerationChargeable(tx, userId, reference, undefined, type === LedgerType.REFUND)
    const account = await tx.creditAccount.findUniqueOrThrow({ where: { userId } })
    const next = account.balance + amount
    if (next < 0) throw new HttpException('创作点不足', HttpStatus.PAYMENT_REQUIRED)
    const updated = await tx.creditAccount.updateMany({ where: { id: account.id, version: account.version }, data: { balance: next, version: { increment: 1 } } })
    if (updated.count !== 1) throw new ConflictException('创作点账户发生并发更新，请重试')
    return tx.creditLedger.create({ data: { accountId: account.id, type, amount, balanceAfter: next, description, idempotencyKey, referenceType: reference?.type, referenceId: reference?.id } })
  }

  /**
   * Refund only the still-uncompensated debit for one generation.  The sum,
   * account update and refund ledger entry are kept in one serializable
   * transaction so concurrent failure/cancel handlers cannot over-refund.
   */
  async refundOutstandingGeneration(
    userId: string,
    generationId: string,
    description: string,
    idempotencyKey: string,
    teamId?: string | null,
  ): Promise<{ amount: number; entry: unknown } | null> {
    return this.prisma.$transaction(async (tx) => {
      if (teamId) {
        const existing = await tx.teamCreditLedger.findUnique({ where: { idempotencyKey } })
        if (existing) return { amount: Math.max(0, existing.amount), entry: existing }
        const account = await tx.teamCreditAccount.findUnique({ where: { teamId } })
        if (!account) return null
        const aggregate = await tx.teamCreditLedger.aggregate({
          where: { accountId: account.id, referenceType: 'generation_job', referenceId: generationId },
          _sum: { amount: true },
        })
        const amount = Math.max(0, Math.trunc(-(aggregate._sum.amount || 0)))
        if (!amount) return null
        const next = account.balance + amount
        const updated = await tx.teamCreditAccount.updateMany({
          where: { id: account.id, version: account.version },
          data: { balance: next, version: { increment: 1 } },
        })
        if (updated.count !== 1) throw new ConflictException('团队创作点账户发生并发更新，请重试')
        const entry = await tx.teamCreditLedger.create({
          data: {
            accountId: account.id,
            userId,
            type: 'REFUND',
            amount,
            balanceAfter: next,
            idempotencyKey,
            referenceType: 'generation_job',
            referenceId: generationId,
            description,
          },
        })
        return { amount, entry }
      }

      const existing = await tx.creditLedger.findUnique({ where: { idempotencyKey } })
      if (existing) return { amount: Math.max(0, existing.amount), entry: existing }
      const account = await tx.creditAccount.findUnique({ where: { userId } })
      if (!account) return null
      const aggregate = await tx.creditLedger.aggregate({
        where: { accountId: account.id, referenceType: 'generation_job', referenceId: generationId },
        _sum: { amount: true },
      })
      const amount = Math.max(0, Math.trunc(-(aggregate._sum.amount || 0)))
      if (!amount) return null
      const next = account.balance + amount
      const updated = await tx.creditAccount.updateMany({
        where: { id: account.id, version: account.version },
        data: { balance: next, version: { increment: 1 } },
      })
      if (updated.count !== 1) throw new ConflictException('创作点账户发生并发更新，请重试')
      const entry = await tx.creditLedger.create({
        data: {
          accountId: account.id,
          type: 'REFUND',
          amount,
          balanceAfter: next,
          idempotencyKey,
          referenceType: 'generation_job',
          referenceId: generationId,
          description,
        },
      })
      return { amount, entry }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
  }

  async spend(userId: string, amount: number, description: string, idempotencyKey: string, reference: { type: string; id: string }, teamId?: string | null) {
    if (!Number.isInteger(amount) || amount < 0) throw new ConflictException('无效的创作点消费')
    if (!amount) return null
    return teamId
      ? this.mutateTeam(teamId, userId, -amount, 'SPEND', description, idempotencyKey, reference, amount)
      : this.mutate(userId, -amount, 'SPEND', description, idempotencyKey, reference)
  }

  async refund(userId: string, amount: number, description: string, idempotencyKey: string, reference: { type: string; id: string }, teamId?: string | null) {
    if (!Number.isInteger(amount) || amount < 0) throw new ConflictException('无效的创作点退款')
    if (!amount) return null
    return teamId
      ? this.mutateTeam(teamId, userId, amount, 'REFUND', description, idempotencyKey, reference, -amount)
      : this.mutate(userId, amount, 'REFUND', description, idempotencyKey, reference)
  }

  async mutateTeam(teamId: string, userId: string | null, amount: number, type: LedgerType, description: string, idempotencyKey?: string, reference?: { type: string; id: string }, usageDelta = 0) {
    if (!Number.isInteger(amount) || amount === 0) throw new ConflictException('无效的团队创作点变更')
    return this.prisma.$transaction(async (tx) => {
      if (idempotencyKey) {
        const existing = await tx.teamCreditLedger.findUnique({ where: { idempotencyKey } })
        if (existing) return existing
      }
      await this.assertGenerationChargeable(tx, userId, reference, teamId, type === LedgerType.REFUND)
      const account = await tx.teamCreditAccount.findUnique({ where: { teamId }, include: { team: { select: { status: true, billingEnabled: true } } } })
      if (!account || account.team.status !== 'ACTIVE') throw new HttpException('团队额度账户不可用', HttpStatus.PAYMENT_REQUIRED)
      if (usageDelta > 0 && !account.team.billingEnabled) throw new HttpException('团队未启用共享额度', HttpStatus.PAYMENT_REQUIRED)
      const next = account.balance + amount
      if (next < 0) throw new HttpException('团队创作点不足', HttpStatus.PAYMENT_REQUIRED)
      if (userId && usageDelta) {
        const member = await tx.teamMember.findUnique({ where: { teamId_userId: { teamId, userId } } })
        if (!member && usageDelta > 0) throw new HttpException('你不是该团队成员', HttpStatus.FORBIDDEN)
        if (member) {
          const periodStart = this.periodStart()
          const samePeriod = member.creditPeriodStart >= periodStart
          const used = samePeriod ? member.creditsUsed : 0
          const nextUsed = Math.max(0, used + usageDelta)
          if (usageDelta > 0 && member.monthlyCreditLimit !== null && nextUsed > member.monthlyCreditLimit) throw new HttpException(`本月团队额度上限为 ${member.monthlyCreditLimit} 点`, HttpStatus.PAYMENT_REQUIRED)
          await tx.teamMember.update({ where: { teamId_userId: { teamId, userId } }, data: { creditsUsed: nextUsed, creditPeriodStart: samePeriod ? member.creditPeriodStart : periodStart } })
        }
      }
      const updated = await tx.teamCreditAccount.updateMany({ where: { id: account.id, version: account.version }, data: { balance: next, version: { increment: 1 } } })
      if (updated.count !== 1) throw new ConflictException('团队创作点账户发生并发更新，请重试')
      return tx.teamCreditLedger.create({ data: { accountId: account.id, userId, type, amount, balanceAfter: next, description, idempotencyKey, referenceType: reference?.type, referenceId: reference?.id } })
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
  }

  async teamAccount(teamId: string, userId: string) {
    const member = await this.prisma.teamMember.findUnique({ where: { teamId_userId: { teamId, userId } }, include: { team: { select: { id: true, name: true, billingEnabled: true, status: true, creditAccount: { select: { balance: true, updatedAt: true } } } } } })
    if (!member || member.team.status !== 'ACTIVE') throw new HttpException('你不是该团队成员', HttpStatus.FORBIDDEN)
    const periodStart = this.periodStart()
    return { team: member.team, member: { role: member.role, monthlyCreditLimit: member.monthlyCreditLimit, creditsUsed: member.creditPeriodStart >= periodStart ? member.creditsUsed : 0, creditPeriodStart: member.creditPeriodStart } }
  }

  async teamEntries(teamId: string, userId: string, take = 50) {
    await this.teamAccount(teamId, userId)
    return this.prisma.teamCreditLedger.findMany({ where: { account: { teamId } }, orderBy: { createdAt: 'desc' }, take: Math.min(Math.max(1, take), 100), include: { user: { select: { id: true, displayName: true, email: true } } } })
  }

  private periodStart() {
    const now = new Date()
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  }

  private async assertGenerationChargeable(
    tx: Prisma.TransactionClient,
    userId: string | null | undefined,
    reference?: { type: string; id: string },
    teamId?: string,
    allowTerminalRefund = false,
  ) {
    if (!userId || reference?.type !== 'generation_job') return
    const job = await tx.generationJob.findUnique({
      where: { id: reference.id },
      select: { userId: true, billingTeamId: true, status: true, settlementStatus: true, lockedBy: true, leaseVersion: true, leaseExpiresAt: true },
    })
    if (!job || job.userId !== userId || (teamId !== undefined && job.billingTeamId !== teamId) || (teamId === undefined && job.billingTeamId !== null)) {
      throw new ConflictException('生成任务与创作点账户归属不一致')
    }
    const lease = currentOutboundExecutionLease()
    if (lease && (job.lockedBy !== lease.workerId
      || job.leaseVersion !== lease.leaseVersion
      || !job.leaseExpiresAt
      || job.leaseExpiresAt.getTime() <= Date.now())) {
      throw new ConflictException('生成任务执行租约已失效，创作点操作已拒绝')
    }
    if (allowTerminalRefund) {
      if (job.settlementStatus === 'SETTLED' || job.settlementStatus === 'RELEASED' || job.settlementStatus === 'REFUNDED') {
        throw new ConflictException('生成任务已完成结算，不能重复退款')
      }
      return
    }
    if (job.status !== 'QUEUED' && job.status !== 'RUNNING') {
      throw new ConflictException('生成任务已结束，不能继续扣除创作点')
    }
    if (job.settlementStatus === 'SETTLED' || job.settlementStatus === 'RELEASED' || job.settlementStatus === 'REFUNDED') {
      throw new ConflictException('生成任务已完成结算，不能继续扣除创作点')
    }
  }
}
