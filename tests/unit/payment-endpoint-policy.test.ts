import assert from 'node:assert/strict'
import test from 'node:test'
import { PublicEndpointPolicyService } from '../../server/src/common/public-endpoint-policy.service'
import { PaymentsService } from '../../server/src/payments/payments.service'

const cryptoStub = {
  encrypt: (value: string) => value,
  hint: (value: string) => value.slice(0, 4),
  decrypt: (value: string) => value,
}

function createService(endpointPolicy: PublicEndpointPolicyService = new PublicEndpointPolicyService()) {
  return new PaymentsService(
    {} as never,
    cryptoStub as never,
    {} as never,
    {} as never,
    {} as never,
    endpointPolicy,
  )
}

test('enabled EasyPay channels reject private API endpoints before persistence', async () => {
  const service = createService()
  const validateChannel = (service as unknown as {
    validateChannel(input: unknown, strict: boolean): Promise<void>
  }).validateChannel.bind(service)

  await assert.rejects(
    () => validateChannel({
      name: 'Private EasyPay',
      providerKey: 'EASYPAY',
      supportedMethods: ['alipay'],
      publicConfig: { apiUrl: 'http://127.0.0.1:8080', merchantId: '1001' },
      secrets: { merchantKey: 'easypay-merchant-key-0123456789' },
    }, true),
    /非公网地址/,
  )
})

test('enabled EasyPay channels reject short merchant keys before persistence', async () => {
  const service = createService()
  const validateChannel = (service as unknown as {
    validateChannel(input: unknown, strict: boolean): Promise<void>
  }).validateChannel.bind(service)

  await assert.rejects(
    () => validateChannel({
      name: 'Weak Key EasyPay',
      providerKey: 'EASYPAY',
      supportedMethods: ['alipay'],
      publicConfig: { apiUrl: 'https://pay.example.com', merchantId: '1001' },
      secrets: { merchantKey: 'short-key' },
    }, true),
    /商户密钥过短/,
  )
})

test('checkout revalidates legacy EasyPay and external channel endpoints', async () => {
  const service = createService()
  const createCheckout = (service as unknown as {
    createGatewayCheckout(channel: unknown, transaction: unknown, productName: string, origin: string): Promise<unknown>
  }).createGatewayCheckout.bind(service)
  const transaction = {
    id: 'transaction-1',
    outTradeNo: 'XY-1',
    amountCents: 100,
    currency: 'CNY',
    paymentMethod: 'alipay',
  }

  await assert.rejects(
    () => createCheckout({
      id: 'easypay-private',
      providerKey: 'EASYPAY',
      publicConfig: { apiUrl: 'http://169.254.169.254/latest/meta-data', merchantId: '1001' },
      encryptedSecrets: JSON.stringify({ merchantKey: 'secret' }),
    }, transaction, 'Test', 'https://app.example.com'),
    /非公网地址/,
  )
  await assert.rejects(
    () => createCheckout({
      id: 'external-private',
      providerKey: 'EXTERNAL',
      publicConfig: { checkoutUrl: 'http://127.0.0.1:8080/pay' },
      encryptedSecrets: JSON.stringify({ webhookSecret: 'secret' }),
    }, transaction, 'Test', 'https://app.example.com'),
    /非公网地址/,
  )
})

test('payment webhook URLs prefer the configured HTTPS public origin', async (t) => {
  const previousPublicBaseUrl = process.env.PUBLIC_BASE_URL
  const previousWebOrigin = process.env.WEB_ORIGIN
  delete process.env.PUBLIC_BASE_URL
  process.env.WEB_ORIGIN = 'https://app.example.com,http://localhost:5173'
  t.after(() => {
    if (previousPublicBaseUrl === undefined) delete process.env.PUBLIC_BASE_URL
    else process.env.PUBLIC_BASE_URL = previousPublicBaseUrl
    if (previousWebOrigin === undefined) delete process.env.WEB_ORIGIN
    else process.env.WEB_ORIGIN = previousWebOrigin
  })

  const service = createService({ assertPublicHttpUrl: async (value: string) => new URL(value) } as PublicEndpointPolicyService)
  const createCheckout = (service as unknown as {
    createGatewayCheckout(channel: unknown, transaction: unknown, productName: string, origin: string): Promise<{ checkoutUrl: string }>
  }).createGatewayCheckout.bind(service)
  const result = await createCheckout({
    id: 'external-public',
    providerKey: 'EXTERNAL',
    publicConfig: { checkoutUrl: 'https://example.com/pay' },
    encryptedSecrets: JSON.stringify({ webhookSecret: 'secret' }),
  }, {
    id: 'transaction-public',
    outTradeNo: 'XY-PUBLIC',
    amountCents: 100,
    currency: 'CNY',
    paymentMethod: 'alipay',
  }, 'Test', 'http://internal-proxy')

  assert.equal(new URL(result.checkoutUrl).searchParams.get('notify_url'), 'https://app.example.com/v1/payments/webhooks/external-public')
})

test('EasyPay refunds revalidate legacy endpoints before fetch', async (t) => {
  const originalFetch = globalThis.fetch
  let fetchCalled = false
  globalThis.fetch = (async () => {
    fetchCalled = true
    return new Response('{}', { status: 200 })
  }) as typeof fetch
  t.after(() => { globalThis.fetch = originalFetch })

  const service = createService()
  const createRefund = (service as unknown as {
    createGatewayRefund(channel: unknown, transaction: unknown, refund: unknown, manualConfirmed: boolean): Promise<unknown>
  }).createGatewayRefund.bind(service)

  await assert.rejects(
    () => createRefund({
      providerKey: 'EASYPAY',
      publicConfig: { apiUrl: 'http://127.0.0.1:8080', merchantId: '1001' },
      encryptedSecrets: JSON.stringify({ merchantKey: 'secret' }),
    }, {
      providerTradeNo: 'provider-1',
      outTradeNo: 'XY-1',
    }, { id: 'refund-1', amountCents: 100 }, false),
    /非公网地址/,
  )
  assert.equal(fetchCalled, false)
})
