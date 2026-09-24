import assert from 'node:assert/strict'
import test from 'node:test'
import { GenerationsProcessor } from '../../server/src/generations/generations.processor'
import { GenerationLifecycleService } from '../../server/src/generations/generation-lifecycle.service'
import { TerminalSettlementError } from '../../server/src/generations/generation-provider-errors'
import { GenerationsService } from '../../server/src/generations/generations.service'

type SettlementStatus = 'RESERVED' | 'RECONCILING' | 'SETTLED'

type HarnessOptions = {
  settlementFailures?: number
  captureFailures?: number
  usageFailures?: number
}

function processorHarness(initialSettlementStatus: SettlementStatus, options: HarnessOptions = {}) {
  const counters = {
    runner: 0,
    settlement: 0,
    capture: 0,
    usage: 0,
    refund: 0,
    quotaRelease: 0,
    lifecycleFail: 0,
    releaseForRetry: 0,
    succeed: 0,
  }
  const state: Record<string, unknown> = {
    id: 'job-recovery',
    userId: 'user-1',
    kind: 'IMAGE',
    status: 'QUEUED',
    settlementStatus: initialSettlementStatus,
    model: 'image-model',
    provider: 'admin:OPENAI_COMPATIBLE',
    prompt: 'test prompt',
    options: {},
    pricingSnapshot: {},
    creditCost: 5,
    inputTokens: 0,
    outputTokens: 0,
    cachedInputTokens: 0,
    reasoningTokens: 0,
    upstreamCostMicros: 10,
    providerChannelId: 'provider-1',
    billingTeamId: null,
    conversationId: null,
    lockedBy: null,
    leaseVersion: 0,
    leaseExpiresAt: null,
    createdAt: new Date(0),
  }
  let settlementFailures = options.settlementFailures || 0
  let captureFailures = options.captureFailures || 0
  let usageFailures = options.usageFailures || 0

  const prisma = {
    generationJob: {
      findUniqueOrThrow: async () => ({ ...state }),
      findUnique: async () => ({ ...state }),
      updateMany: async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(state, data)
        return { count: 1 }
      },
    },
    providerAttempt: {
      findMany: async () => [],
      updateMany: async () => ({ count: 0 }),
    },
    jobOutput: {
      count: async () => 1,
    },
  }
  const lifecycle = {
    claim: async (_id: string, workerId: string) => {
      state.status = 'RUNNING'
      state.lockedBy = workerId
      state.leaseVersion = Number(state.leaseVersion) + 1
      state.leaseExpiresAt = new Date(Date.now() + 60_000)
      return true
    },
    heartbeat: async () => ({ count: 1 }),
    releaseForRetry: async () => {
      counters.releaseForRetry += 1
      state.status = 'QUEUED'
      state.lockedBy = null
      state.leaseExpiresAt = null
      return true
    },
    succeed: async () => {
      counters.succeed += 1
      state.status = 'SUCCEEDED'
      state.lockedBy = null
      state.leaseExpiresAt = null
      return true
    },
    fail: async () => {
      counters.lifecycleFail += 1
      return true
    },
  }
  const runner = {
    kind: 'IMAGE' as const,
    run: async () => { counters.runner += 1 },
  }
  const settlement = {
    settleNonChat: async () => {
      counters.settlement += 1
      if (settlementFailures > 0) {
        settlementFailures -= 1
        throw new TerminalSettlementError('ledger temporarily unavailable')
      }
      state.settlementStatus = 'SETTLED'
    },
  }
  const billingTransactions = {
    recordCapture: async () => {
      counters.capture += 1
      if (captureFailures > 0) {
        captureFailures -= 1
        throw new Error('capture audit unavailable')
      }
    },
    recordRefund: async () => undefined,
    safely: async (operation: Promise<unknown>) => operation,
  }
  const usageRecords = {
    record: async () => {
      counters.usage += 1
      if (usageFailures > 0) {
        usageFailures -= 1
        throw new Error('usage audit unavailable')
      }
    },
  }
  const credits = {
    refundOutstandingGeneration: async () => {
      counters.refund += 1
      return null
    },
  }
  const tokenQuota = {
    release: async () => {
      counters.quotaRelease += 1
      return { releasedUnits: 0n }
    },
    reservationsForGeneration: async () => [],
  }
  const noopRunner = (kind: 'CHAT' | 'VIDEO') => ({ kind, run: async () => { counters.runner += 1 } })
  const processor = new GenerationsProcessor(
    prisma as never,
    credits as never,
    billingTransactions as never,
    lifecycle as never,
    noopRunner('CHAT') as never,
    runner as never,
    noopRunner('VIDEO') as never,
    {} as never,
    usageRecords as never,
    tokenQuota as never,
    settlement as never,
    {} as never,
    {} as never,
  )

  return { processor, state, counters }
}

function queueJob(attemptsMade = 0) {
  return {
    data: { jobId: 'job-recovery' },
    attemptsMade,
    opts: { attempts: 3 },
  } as never
}

test('non-chat RECONCILING recovery settles bookkeeping without invoking a runner', async () => {
  const { processor, state, counters } = processorHarness('RECONCILING')

  await processor.process(queueJob())

  assert.equal(counters.settlement, 1)
  assert.equal(counters.runner, 0)
  assert.equal(counters.capture, 1)
  assert.equal(counters.usage, 1)
  assert.equal(counters.succeed, 1)
  assert.equal(state.status, 'SUCCEEDED')
  assert.equal(state.settlementStatus, 'SETTLED')
})

test('ledger retry never refunds, releases quota, or invokes the Provider again', async () => {
  const { processor, state, counters } = processorHarness('RECONCILING', { settlementFailures: 1 })

  await assert.rejects(processor.process(queueJob()), /ledger temporarily unavailable/)
  assert.equal(state.status, 'QUEUED')
  assert.equal(state.settlementStatus, 'RECONCILING')
  assert.equal(counters.releaseForRetry, 1)
  assert.equal(counters.runner, 0)
  assert.equal(counters.refund, 0)
  assert.equal(counters.quotaRelease, 0)
  assert.equal(counters.lifecycleFail, 0)

  await processor.process(queueJob(1))
  assert.equal(counters.settlement, 2)
  assert.equal(counters.runner, 0)
  assert.equal(counters.refund, 0)
  assert.equal(counters.quotaRelease, 0)
  assert.equal(counters.succeed, 1)
  assert.equal(state.status, 'SUCCEEDED')
})

for (const audit of ['capture', 'usage'] as const) {
  test(`SETTLED ${audit} audit failure retries bookkeeping without invoking a runner`, async () => {
    const { processor, state, counters } = processorHarness('SETTLED', {
      captureFailures: audit === 'capture' ? 1 : 0,
      usageFailures: audit === 'usage' ? 1 : 0,
    })

    await assert.rejects(processor.process(queueJob()), new RegExp(`${audit} audit unavailable`))
    assert.equal(state.status, 'QUEUED')
    assert.equal(state.settlementStatus, 'SETTLED')
    assert.equal(counters.releaseForRetry, 1)
    assert.equal(counters.runner, 0)
    assert.equal(counters.settlement, 0)
    assert.equal(counters.refund, 0)
    assert.equal(counters.quotaRelease, 0)
    assert.equal(counters.lifecycleFail, 0)

    await processor.process(queueJob(1))
    assert.equal(counters.runner, 0)
    assert.equal(counters.settlement, 0)
    assert.equal(counters.capture, 2)
    assert.equal(counters.usage, audit === 'usage' ? 2 : 1)
    assert.equal(counters.succeed, 1)
    assert.equal(state.status, 'SUCCEEDED')
  })
}

test('SETTLED recovery completes audit without invoking settlement or a runner', async () => {
  const { processor, state, counters } = processorHarness('SETTLED')

  await processor.process(queueJob())

  assert.equal(counters.runner, 0)
  assert.equal(counters.settlement, 0)
  assert.equal(counters.capture, 1)
  assert.equal(counters.usage, 1)
  assert.equal(counters.succeed, 1)
  assert.equal(state.status, 'SUCCEEDED')
})

test('lifecycle cancellation excludes RECONCILING jobs before refund handling can run', async () => {
  let update: Record<string, unknown> | undefined
  const prisma = {
    generationJob: {
      updateMany: async (input: Record<string, unknown>) => {
        update = input
        return { count: 0 }
      },
    },
    providerAttempt: { findFirst: async () => null },
  }
  Object.assign(prisma, { $transaction: async (callback: (tx: typeof prisma) => Promise<unknown>) => callback(prisma) })
  const lifecycle = new GenerationLifecycleService(prisma as never, { append: async () => undefined } as never)

  assert.equal(await lifecycle.cancel('job-recovery', 'user-1'), false)
  const where = update?.where as Record<string, unknown>
  assert.deepEqual(where.settlementStatus, { in: ['PENDING', 'RESERVED'] })
})

test('rejected RECONCILING cancellation does not refund credits or release quota', async () => {
  const calls = { creditRefund: 0, billingRefund: 0, quotaRelease: 0, queueRemove: 0 }
  const job = {
    id: 'job-recovery',
    userId: 'user-1',
    kind: 'IMAGE',
    status: 'QUEUED',
    settlementStatus: 'RECONCILING',
    errorMessage: null,
    conversationId: 'conversation-1',
    outputs: [],
    events: [],
    providerAttempts: [],
    billingTransactions: [],
    usageRecords: [],
  }
  const prisma = {
    generationJob: {
      findFirst: async () => job,
    },
  }
  const credits = {
    refundOutstandingGeneration: async () => {
      calls.creditRefund += 1
      return { amount: 1 }
    },
  }
  const billingTransactions = {
    recordRefund: async () => { calls.billingRefund += 1 },
    safely: async (operation: Promise<unknown>) => operation,
  }
  const providers = { cancelLocalWorkerTask: async () => undefined }
  const lifecycle = { cancel: async () => false }
  const tokenQuota = {
    reservationsForGeneration: async () => [],
    release: async () => { calls.quotaRelease += 1 },
  }
  const queue = {
    getJob: async () => ({
      isActive: async () => false,
      remove: async () => { calls.queueRemove += 1 },
    }),
  }
  const service = new GenerationsService(
    prisma as never,
    credits as never,
    billingTransactions as never,
    {} as never,
    providers as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    lifecycle as never,
    {} as never,
    {} as never,
    tokenQuota as never,
    {} as never,
    {} as never,
    queue as never,
  )

  const result = await service.cancel('user-1', 'job-recovery')

  assert.equal(result.status, 'QUEUED')
  assert.equal('settlementStatus' in result, false)
  assert.deepEqual(calls, { creditRefund: 0, billingRefund: 0, quotaRelease: 0, queueRemove: 0 })
})
