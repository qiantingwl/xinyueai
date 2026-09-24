import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { ReconciliationRequiredError, TerminalSettlementError } from './generation-provider-errors'
import { currentOutboundExecutionLease } from '../common/outbound-http'
import { asJsonRecord } from '../common/json-record'

type AttemptStartInput = {
  generationId: string
  provider: string
  model: string
  metadata?: Prisma.InputJsonValue
}

type AttemptFinishInput = {
  id: string
  generationId: string
  metadata?: Prisma.InputJsonValue
  errorCode?: string
  errorMessage?: string
}

@Injectable()
export class ProviderAttemptAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async withActiveLease<T>(
    generationId: string,
    operation: (client: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.fenced(generationId, operation)
    } catch (error) {
      if (error instanceof ReconciliationRequiredError) throw error
      const reason = error instanceof Error ? error.message : '未知错误'
      throw new ReconciliationRequiredError(`Provider 成功后的本地写入被拒绝：${reason}`)
    }
  }

  async assertActiveLease(generationId: string): Promise<void> {
    await this.withActiveLease(generationId, async () => undefined)
  }

  async start(input: AttemptStartInput) {
    try {
      return await this.fenced(input.generationId, async (client) => {
        const candidates = await client.providerAttempt.findMany({
          where: {
            generationId: input.generationId,
            status: { in: ['RUNNING', 'SUCCEEDED'] },
          },
          select: { id: true, status: true, metadata: true },
        })
        const auxiliary = asJsonRecord(input.metadata).auxiliary === true
        const unresolved = candidates.find((candidate) => asJsonRecord(candidate.metadata).auxiliary === true === auxiliary)
        if (unresolved) {
          throw new ReconciliationRequiredError(`任务已有 ${unresolved.status} ProviderAttempt ${unresolved.id}，必须先对账`)
        }
        return client.providerAttempt.create({
          data: {
            generationId: input.generationId,
            provider: input.provider,
            model: input.model,
            status: 'RUNNING',
            metadata: input.metadata,
          },
        })
      })
    } catch (error) {
      if (error instanceof ReconciliationRequiredError) throw error
      throw this.persistenceError('创建', error)
    }
  }

  succeed(input: AttemptFinishInput) {
    return this.finish('SUCCEEDED', input)
  }

  fail(input: AttemptFinishInput) {
    return this.finish('FAILED', input)
  }

  private async finish(status: 'SUCCEEDED' | 'FAILED', input: AttemptFinishInput) {
    try {
      await this.fenced(input.generationId, async (client) => {
        const updated = await client.providerAttempt.updateMany({
          where: {
            id: input.id,
            generationId: input.generationId,
            status: 'RUNNING',
          },
          data: {
            status,
            endedAt: new Date(),
            metadata: input.metadata,
            errorCode: input.errorCode,
            errorMessage: input.errorMessage?.slice(0, 500),
          },
        })
        if (updated.count !== 1) throw new Error('ProviderAttempt 状态发生并发变化')
      })
    } catch (error) {
      if (status === 'SUCCEEDED') {
        throw new ReconciliationRequiredError(`ProviderAttempt 完成记录失败：${error instanceof Error ? error.message : '未知错误'}`)
      }
      throw this.persistenceError('失败', error)
    }
  }

  private async fenced<T>(generationId: string, operation: (client: Prisma.TransactionClient) => Promise<T>) {
    const lease = currentOutboundExecutionLease()
    if (!lease) throw new Error('Generation worker lease context is missing')
    return this.prisma.$transaction(async (tx) => {
      const active = await tx.generationJob.updateMany({
        where: {
          id: generationId,
          status: 'RUNNING',
          lockedBy: lease.workerId,
          leaseVersion: lease.leaseVersion,
          leaseExpiresAt: { gt: new Date() },
        },
        data: { updatedAt: new Date() },
      })
      if (active.count !== 1) throw new Error('Generation worker lease was lost')
      return operation(tx)
    })
  }

  private persistenceError(action: string, error: unknown) {
    const reason = error instanceof Error ? error.message : '未知错误'
    return new TerminalSettlementError(`ProviderAttempt ${action}记录失败：${reason}`)
  }

}
