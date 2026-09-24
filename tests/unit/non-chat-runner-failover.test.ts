import assert from 'node:assert/strict'
import test from 'node:test'
import { ReconciliationRequiredError, TerminalSettlementError } from '../../server/src/generations/generation-provider-errors'
import { ImageGenerationRunner } from '../../server/src/generations/runners/image-generation.runner'
import { VideoGenerationRunner } from '../../server/src/generations/runners/video-generation.runner'
import type { ResolvedProvider } from '../../server/src/providers/providers.service'

type AttemptInput = { id?: string; provider?: string }
type RunnerTask = Record<string, unknown>
type AttemptBehavior = {
  startError?: Error
  succeedError?: Error
}

type RunnerHarness = {
  name: 'image' | 'commerce' | 'video'
  task: RunnerTask
  candidates: ResolvedProvider[]
  starts: string[]
  successes: string[]
  failures: string[]
  failover<T>(execute: (provider: ResolvedProvider) => Promise<T>): Promise<{
    result: T
    provider: ResolvedProvider
    providerAttemptId: string
  }>
  request(provider: ResolvedProvider): Promise<unknown>
}

function provider(id: string): ResolvedProvider {
  return {
    source: 'admin',
    providerId: `provider-${id}`,
    credentialId: `credential-${id}`,
    routeId: `route-${id}`,
    label: `Provider ${id.toUpperCase()}`,
    type: 'OPENAI_COMPATIBLE' as ResolvedProvider['type'],
    baseUrl: `https://provider-${id}.test/v1`,
    apiKey: 'test-key',
    authType: 'BEARER' as ResolvedProvider['authType'],
    headers: {},
    timeoutMs: 1_000,
    model: `model-${id}`,
    presetKey: '',
    creditCost: 1,
    settlementCurrency: 'USD',
    creditValueMicros: 1_000_000,
    pricingUsdExchangeRateMicros: 1_000_000,
    inputCostMicrosPerMillion: 0,
    outputCostMicrosPerMillion: 0,
    imageCostMicros: 10,
    videoCostMicros: 20,
    inputCreditsPerMillion: 0,
    outputCreditsPerMillion: 0,
    baseInputCreditsPerMillion: 0,
    baseOutputCreditsPerMillion: 0,
    creditRatePercent: 100,
    apiProtocol: 'openai',
  }
}

function generationTask(kind: 'IMAGE' | 'COMMERCE' | 'VIDEO'): RunnerTask {
  return {
    id: `job-${kind.toLowerCase()}`,
    userId: 'user-1',
    kind,
    model: 'requested-model',
    prompt: 'test prompt',
    options: {},
    pricingSnapshot: {},
    status: 'RUNNING',
    lockedBy: 'worker-1',
    leaseVersion: 1,
    leaseExpiresAt: new Date(Date.now() + 60_000),
  }
}

function harness(name: 'image' | 'commerce' | 'video', behavior: AttemptBehavior = {}): RunnerHarness {
  const candidates = [provider('a'), provider('b')]
  const starts: string[] = []
  const successes: string[] = []
  const failures: string[] = []
  const providers = {
    resolveCandidates: async () => candidates,
    recordCandidateResult: async () => undefined,
    buildRequestHeaders: () => ({ 'Content-Type': 'application/json' }),
  }
  const attemptAudit = {
    start: async (input: AttemptInput) => {
      starts.push(String(input.provider))
      if (behavior.startError) throw behavior.startError
      return { id: `attempt-${starts.length}` }
    },
    succeed: async (input: AttemptInput) => {
      successes.push(String(input.id))
      if (behavior.succeedError) throw behavior.succeedError
    },
    fail: async (input: AttemptInput) => {
      failures.push(String(input.id))
    },
  }
  const prisma = {
    generationJob: {
      updateMany: async () => ({ count: 1 }),
    },
  }
  const runner = name !== 'video'
    ? new ImageGenerationRunner(prisma as never, {} as never, providers as never, {} as never, attemptAudit as never, {} as never)
    : new VideoGenerationRunner(prisma as never, {} as never, providers as never, {} as never, attemptAudit as never, {} as never)

  if (name !== 'video') {
    const internals = runner as unknown as {
      withProviderFailover<T>(task: RunnerTask, execute: (candidate: ResolvedProvider) => Promise<T>): Promise<{
        result: T
        provider: ResolvedProvider
        providerAttemptId: string
      }>
      provider(candidate: ResolvedProvider, path: string, body: unknown): Promise<unknown>
    }
    return {
      name,
      task: generationTask(name === 'commerce' ? 'COMMERCE' : 'IMAGE'),
      candidates,
      starts,
      successes,
      failures,
      failover: (execute) => internals.withProviderFailover(generationTask(name === 'commerce' ? 'COMMERCE' : 'IMAGE'), execute),
      request: (candidate) => internals.provider(candidate, '/images/generations', { prompt: 'test' }),
    }
  }

  const internals = runner as unknown as {
    withProviderFailover<T>(task: RunnerTask, capability: 'VIDEO', execute: (candidate: ResolvedProvider) => Promise<T>): Promise<{
      result: T
      provider: ResolvedProvider
      providerAttemptId: string
    }>
    provider(candidate: ResolvedProvider, path: string, body: unknown): Promise<unknown>
  }
  return {
    name,
    task: generationTask('VIDEO'),
    candidates,
    starts,
    successes,
    failures,
    failover: (execute) => internals.withProviderFailover(generationTask('VIDEO'), 'VIDEO', execute),
    request: (candidate) => internals.provider(candidate, '/videos', { prompt: 'test' }),
  }
}

for (const runnerName of ['image', 'commerce', 'video'] as const) {
  test(`${runnerName}: ProviderAttempt creation failure prevents the Provider call`, async () => {
    const runner = harness(runnerName, { startError: new TerminalSettlementError('attempt unavailable') })
    let providerCalls = 0

    await assert.rejects(
      runner.failover(async () => {
        providerCalls += 1
        return 'unexpected'
      }),
      (error: unknown) => error instanceof TerminalSettlementError && /attempt unavailable/.test(error.message),
    )

    assert.equal(providerCalls, 0)
    assert.equal(runner.starts.length, 1)
    assert.equal(runner.failures.length, 0)
  })

  test(`${runnerName}: Provider success persistence failure never fails over`, async () => {
    const runner = harness(runnerName, {
      succeedError: new ReconciliationRequiredError('attempt success persistence failed'),
    })
    let providerCalls = 0

    await assert.rejects(
      runner.failover(async () => {
        providerCalls += 1
        return 'provider-result'
      }),
      (error: unknown) => error instanceof ReconciliationRequiredError
        && /success persistence failed/.test(error.message),
    )

    assert.equal(providerCalls, 1)
    assert.equal(runner.starts.length, 1)
    assert.equal(runner.successes.length, 1)
    assert.equal(runner.failures.length, 0)
  })
}

const retryableFailures = [
  { label: '429', response: () => new Response('{"error":"rate limited"}', { status: 429 }) },
  { label: '500', response: () => new Response('{"error":"internal"}', { status: 500 }) },
  { label: '502', response: () => new Response('{"error":"gateway"}', { status: 502 }) },
  { label: 'timeout', response: () => Promise.reject(new DOMException('request timed out', 'TimeoutError')) },
  { label: 'network error', response: () => Promise.reject(new TypeError('fetch failed')) },
] as const

test('image, commerce, and video runners fail over for retryable Provider failures', async () => {
  const originalFetch = globalThis.fetch
  try {
    for (const runnerName of ['image', 'commerce', 'video'] as const) {
      for (const failure of retryableFailures) {
        const runner = harness(runnerName)
        let requestCount = 0
        globalThis.fetch = (async () => {
          requestCount += 1
          if (requestCount === 1) return failure.response()
          return new Response('{"data":[{"url":"https://result.test/output"}]}', {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        }) as typeof fetch

        const execution = await runner.failover((candidate) => runner.request(candidate))

        assert.equal(execution.provider.providerId, 'provider-b', `${runnerName} ${failure.label}`)
        assert.equal(requestCount, 2, `${runnerName} ${failure.label}`)
        assert.equal(runner.starts.length, 2, `${runnerName} ${failure.label}`)
        assert.equal(runner.failures.length, 1, `${runnerName} ${failure.label}`)
        assert.equal(runner.successes.length, 1, `${runnerName} ${failure.label}`)
      }
    }
  } finally {
    globalThis.fetch = originalFetch
  }
})
