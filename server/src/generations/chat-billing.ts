import { Prisma } from '@prisma/client'
import { PricingResolverService } from '../billing/pricing-resolver.service'

export type ChatBillingOptions = {
  maxOutputTokens?: number
  reservedTokenUnits?: number
  reservedTokenCredits?: number
  baseInputCreditsPerMillion?: number
  baseOutputCreditsPerMillion?: number
  inputCreditsPerMillion?: number
  outputCreditsPerMillion?: number
  groupRatePercent?: number
  overageRatePercent?: number
  billingSource?: string
  subscriptionId?: string
  baseCreditCost?: number
  creditValueMicros?: number
  quotaEnabled?: boolean
  quotaId?: string
  quotaReservations?: Array<{ reservationId?: string; quotaId: string; reservedUnits: string | number }>
}

export function isUserOwnedChatFree(
  source: string | undefined,
  byokMode: string | undefined,
  inputCreditsPerMillion: number,
  outputCreditsPerMillion: number,
) {
  if (source !== 'user') return false
  if (byokMode === 'FREE') return true
  return !(inputCreditsPerMillion > 0 || outputCreditsPerMillion > 0)
}

export function parseChatBillingOptions(options: Prisma.JsonValue): ChatBillingOptions {
  if (!options || typeof options !== 'object' || Array.isArray(options)) return {}
  const billing = options.billing
  return billing && typeof billing === 'object' && !Array.isArray(billing)
    ? billing as ChatBillingOptions
    : {}
}

export type QuotaReservationRef = { reservationId?: string; quotaId: string }

/**
 * 从 job.options.billing 解析配额预留引用。各调用方对「列表缺失或为空」的兜底要求
 * 不同，用显式参数区分，避免在合并重复代码时悄悄改掉计费语义：
 * - 默认：列表存在即以列表为准，列表不存在才回退 billing.quotaId
 * - fallbackOnEmptyList：列表为空数组时也回退 billing.quotaId（结算路径）
 * - includeQuotaIdAlways：无论列表如何都并入 billing.quotaId（释放/对账路径）
 */
export function parseQuotaReservationRefs(
  billing: ChatBillingOptions | Record<string, unknown>,
  options: { fallbackOnEmptyList?: boolean; includeQuotaIdAlways?: boolean } = {},
): QuotaReservationRef[] {
  const source = billing as Record<string, unknown>
  const list = source.quotaReservations
  const quotaId = typeof source.quotaId === 'string' ? source.quotaId : undefined
  const refs: QuotaReservationRef[] = Array.isArray(list)
    ? list.flatMap((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return []
      const row = item as Record<string, unknown>
      if (typeof row.quotaId !== 'string') return []
      return [{ reservationId: typeof row.reservationId === 'string' ? row.reservationId : undefined, quotaId: row.quotaId }]
    })
    : []
  if (!quotaId) return refs
  const listMissing = !Array.isArray(list) || (options.fallbackOnEmptyList === true && list.length === 0)
  const shouldAppend = options.includeQuotaIdAlways === true
    ? !refs.some((ref) => ref.quotaId === quotaId)
    : listMissing && !refs.length
  if (shouldAppend) refs.push({ reservationId: undefined, quotaId })
  return refs
}

export function calculateChatTokenSettlement(
  pricing: PricingResolverService,
  billing: ChatBillingOptions,
  inputTokens: number,
  outputTokens: number,
) {
  const snapshot = pricing.snapshot({
    model: 'settlement',
    inputRate: billing.inputCreditsPerMillion,
    outputRate: billing.outputCreditsPerMillion,
    billingSource: billing.billingSource,
    overageRatePercent: billing.overageRatePercent,
  })
  const settled = pricing.settlement(snapshot, { inputTokens, outputTokens })
  return {
    chargedUnits: Number(settled.chargedUnits),
    chargedCredits: Number(settled.chargedCredits),
  }
}
