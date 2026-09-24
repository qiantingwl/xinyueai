import assert from 'node:assert/strict'
import test from 'node:test'
import { ModelDiscoveryService } from '../../server/src/providers/model-discovery.service'

const endpointPolicy = { assertPublicHttpUrl: async (value: string) => new URL(value) }

test('模型价格目录刷新失败时保留上一次成功结果', async () => {
  const originalFetch = globalThis.fetch
  const service = new ModelDiscoveryService(endpointPolicy as never)
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({
      'example-chat': {
        mode: 'chat',
        litellm_provider: 'openai',
        input_cost_per_token: 0.000002,
        output_cost_per_token: 0.000008,
      },
    }), { status: 200 })
    const first = await service.discover(['example-chat'], { creditValueMicros: 10_000, markupPercent: 130, forceRefresh: true })
    assert.equal(first[0]?.pricingSource, 'litellm')
    assert.equal(first[0]?.inputCreditsPerMillion, 260)

    globalThis.fetch = async () => { throw new Error('catalog unavailable') }
    const retained = await service.discover(['example-chat'], { creditValueMicros: 10_000, markupPercent: 130, forceRefresh: true })
    assert.equal(retained[0]?.pricingSource, 'litellm')
    assert.equal(retained[0]?.inputCreditsPerMillion, 260)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('模型售价会按 USD 汇率换算为结算币种额度', async () => {
  const originalFetch = globalThis.fetch
  const service = new ModelDiscoveryService(endpointPolicy as never)
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({
      'exchange-chat': {
        mode: 'chat',
        input_cost_per_token: 0.000001,
        output_cost_per_token: 0.000002,
      },
    }), { status: 200 })
    const result = await service.discover(['exchange-chat'], {
      creditValueMicros: 10_000,
      pricingUsdExchangeRateMicros: 7_200_000,
      markupPercent: 130,
      forceRefresh: true,
    })
    assert.equal(result[0]?.inputCreditsPerMillion, 936)
    assert.equal(result[0]?.outputCreditsPerMillion, 1872)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('发现目录会把 glm / kimi / qiniu 前缀模型归到正确厂商', async () => {
  const originalFetch = globalThis.fetch
  const service = new ModelDiscoveryService(endpointPolicy as never)
  try {
    globalThis.fetch = async () => { throw new Error('catalog unavailable') }
    const result = await service.discover([
      'glm-4.5',
      'z-ai/glm-5.3',
      'kimi-k2',
      'moonshotai/kimi-k3',
      'deepseek/deepseek-v4.1-flash',
    ], { creditValueMicros: 10_000, markupPercent: 130, forceRefresh: true })
    const byId = Object.fromEntries(result.map((item) => [item.id, item.vendorKey]))
    assert.equal(byId['glm-4.5'], 'zhipu')
    assert.equal(byId['z-ai/glm-5.3'], 'zhipu')
    assert.equal(byId['kimi-k2'], 'kimi')
    assert.equal(byId['moonshotai/kimi-k3'], 'kimi')
    assert.equal(byId['deepseek/deepseek-v4.1-flash'], 'deepseek')
  } finally {
    globalThis.fetch = originalFetch
  }
})
