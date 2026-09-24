import assert from 'node:assert/strict'
import test from 'node:test'
import { PricingResolverService } from '../../server/src/billing/pricing-resolver.service'
import { calculateChatTokenSettlement, parseChatBillingOptions, parseQuotaReservationRefs } from '../../server/src/generations/chat-billing'

test('chat billing parser ignores malformed options', () => {
  assert.deepEqual(parseChatBillingOptions(null), {})
  assert.deepEqual(parseChatBillingOptions([]), {})
  assert.deepEqual(parseChatBillingOptions({ billing: [] }), {})
  assert.deepEqual(parseChatBillingOptions({ billing: { inputCreditsPerMillion: 120, outputCreditsPerMillion: 480 } }), {
    inputCreditsPerMillion: 120,
    outputCreditsPerMillion: 480,
  })
})

test('quota reservation refs keep the original fallback rules', () => {
  assert.deepEqual(parseQuotaReservationRefs({ quotaReservations: [{ quotaId: 'q1', reservationId: 'r1' }] }), [{ reservationId: 'r1', quotaId: 'q1' }])
  assert.deepEqual(parseQuotaReservationRefs({ quotaId: 'legacy' }), [{ reservationId: undefined, quotaId: 'legacy' }])
  assert.deepEqual(parseQuotaReservationRefs({ quotaId: 'legacy', quotaReservations: [] }), [])
  assert.deepEqual(parseQuotaReservationRefs({ quotaId: 'legacy', quotaReservations: [] }, { fallbackOnEmptyList: true }), [{ reservationId: undefined, quotaId: 'legacy' }])
  assert.deepEqual(parseQuotaReservationRefs({ quotaId: 'legacy', quotaReservations: [{ quotaId: 'q1' }] }, { includeQuotaIdAlways: true }), [
    { reservationId: undefined, quotaId: 'q1' },
    { reservationId: undefined, quotaId: 'legacy' },
  ])
})

test('chat token settlement delegates to the shared pricing resolver', () => {
  const pricing = new PricingResolverService()
  const result = calculateChatTokenSettlement(pricing, {
    inputCreditsPerMillion: 100,
    outputCreditsPerMillion: 400,
    overageRatePercent: 50,
    billingSource: 'OVERAGE_CREDITS',
  }, 1_000_000, 500_000)

  assert.deepEqual(result, { chargedUnits: 300, chargedCredits: 150 })
})
