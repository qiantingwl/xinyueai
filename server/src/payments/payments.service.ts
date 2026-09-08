import { BadGatewayException, BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { NotificationType, Prisma } from '@prisma/client'
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { CreditsService } from '../credits/credits.service'
import { PrismaService } from '../prisma/prisma.service'
import { CredentialCryptoService } from '../providers/credential-crypto.service'
import { SubscriptionsService } from '../subscriptions/subscriptions.service'
import { ReferralService } from '../commercial/referral.service'
import { PAYMENT_METHODS, PAYMENT_METHODS_BY_PROVIDER, PAYMENT_PROVIDERS, type PaymentMethod, type PaymentProvider } from './payment.constants'
import { PublicEndpointPolicyService } from '../common/public-endpoint-policy.service'
import { fetchPublicNoRedirect } from '../common/outbound-http'

type ChannelInput = {
  name: string
  providerKey: PaymentProvider
  enabled?: boolean
  isDefault?: boolean
  supportedMethods: PaymentMethod[]
  minAmountCents?: number
  maxAmountCents?: number | null
  dailyLimitCents?: number | null
  feeRateBps?: number
  sortOrder?: number
  publicConfig?: Record<string, unknown>
  secrets?: Record<string, string>
}
type CheckoutInput = { orderType: 'SUBSCRIPTION' | 'RECHARGE'; orderId: string; channelId?: string; paymentMethod: PaymentMethod }
type GatewayChannel = Prisma.PaymentChannelGetPayload<Record<string, never>>
type GatewayTransaction = Prisma.PaymentTransactionGetPayload<Record<string, never>>
type GatewayCheckout = { checkoutUrl: string; qrCodeUrl?: string; providerTradeNo?: string; instructions?: string }
type RefundInput = { amountCents: number; reason: string; manualConfirmed?: boolean }
type RefundGatewayResult = { providerRefundId?: string; payload?: Record<string, unknown> }
type StripeCheckoutResponse = { id?: string; url?: string; error?: { message?: string } }
type StripeCheckoutEvent = { id?: string; type?: string; data?: { object?: { payment_status?: string; metadata?: { out_trade_no?: string }; client_reference_id?: string; payment_intent?: string; id?: string; amount_total?: number } } }

@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService, private readonly crypto: CredentialCryptoService, private readonly subscriptions: SubscriptionsService, private readonly credits: CreditsService, private readonly referrals: ReferralService, private readonly endpointPolicy: PublicEndpointPolicyService) {}

  async methods() {
    const rows = await this.prisma.paymentChannel.findMany({ where: { enabled: true }, orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }] })
    return rows.map((channel) => ({ id: channel.id, name: channel.name, providerKey: channel.providerKey, isDefault: channel.isDefault, supportedMethods: channel.supportedMethods, minAmountCents: channel.minAmountCents, maxAmountCents: channel.maxAmountCents, publicConfig: this.safePublicConfig(channel.publicConfig) }))
  }

  async listChannels() {
    const rows = await this.prisma.paymentChannel.findMany({ orderBy: [{ enabled: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }], include: { _count: { select: { transactions: true } } } })
    return rows.map((channel) => this.publicChannel(channel))
  }

  async createChannel(input: ChannelInput) {
    await this.validateChannel(input, input.enabled ?? false)
    if (input.isDefault) await this.prisma.paymentChannel.updateMany({ data: { isDefault: false } })
    const secrets = this.cleanSecrets(input.secrets || {})
    const row = await this.prisma.paymentChannel.create({ data: { name: input.name.trim(), providerKey: input.providerKey, enabled: input.enabled ?? false, isDefault: input.isDefault ?? false, supportedMethods: [...new Set(input.supportedMethods)], minAmountCents: input.minAmountCents ?? 100, maxAmountCents: input.maxAmountCents, dailyLimitCents: input.dailyLimitCents, feeRateBps: input.feeRateBps ?? 0, sortOrder: input.sortOrder ?? 0, publicConfig: (input.publicConfig || {}) as Prisma.InputJsonValue, encryptedSecrets: this.crypto.encrypt(JSON.stringify(secrets)), secretHints: this.secretHints(secrets) as Prisma.InputJsonValue } })
    return this.publicChannel(row)
  }

  async updateChannel(id: string, input: Partial<ChannelInput>) {
    const before = await this.prisma.paymentChannel.findUnique({ where: { id } })
    if (!before) throw new NotFoundException('支付渠道不存在')
    const merged = { name: input.name ?? before.name, providerKey: (input.providerKey ?? before.providerKey) as PaymentProvider, supportedMethods: input.supportedMethods ?? this.paymentMethods(before.supportedMethods), publicConfig: (input.publicConfig ?? before.publicConfig ?? {}) as Record<string, unknown>, secrets: { ...this.channelSecrets(before.encryptedSecrets), ...this.cleanSecrets(input.secrets || {}) } }
    await this.validateChannel(merged, input.enabled ?? before.enabled)
    if (input.isDefault) await this.prisma.paymentChannel.updateMany({ where: { id: { not: id } }, data: { isDefault: false } })
    const encryptedSecrets = input.secrets ? this.crypto.encrypt(JSON.stringify(merged.secrets)) : before.encryptedSecrets
    const row = await this.prisma.paymentChannel.update({ where: { id }, data: { ...(input.name === undefined ? {} : { name: input.name.trim() }), ...(input.providerKey === undefined ? {} : { providerKey: input.providerKey }), ...(input.enabled === undefined ? {} : { enabled: input.enabled }), ...(input.isDefault === undefined ? {} : { isDefault: input.isDefault }), ...(input.supportedMethods === undefined ? {} : { supportedMethods: [...new Set(input.supportedMethods)] }), ...(input.minAmountCents === undefined ? {} : { minAmountCents: input.minAmountCents }), ...(input.maxAmountCents === undefined ? {} : { maxAmountCents: input.maxAmountCents }), ...(input.dailyLimitCents === undefined ? {} : { dailyLimitCents: input.dailyLimitCents }), ...(input.feeRateBps === undefined ? {} : { feeRateBps: input.feeRateBps }), ...(input.sortOrder === undefined ? {} : { sortOrder: input.sortOrder }), ...(input.publicConfig === undefined ? {} : { publicConfig: input.publicConfig as Prisma.InputJsonValue }), ...(input.secrets === undefined ? {} : { encryptedSecrets, secretHints: this.secretHints(merged.secrets) as Prisma.InputJsonValue }), lastHealthStatus: 'unchecked', lastError: '' } })
    return this.publicChannel(row)
  }

  async deleteChannel(id: string) {
    const used = await this.prisma.paymentTransaction.count({ where: { channelId: id } })
    if (used) return this.publicChannel(await this.prisma.paymentChannel.update({ where: { id }, data: { enabled: false, isDefault: false } }))
    await this.prisma.paymentChannel.delete({ where: { id } }).catch(() => { throw new NotFoundException('支付渠道不存在') })
    return { deleted: true }
  }

  async checkChannel(id: string) {
    const channel = await this.prisma.paymentChannel.findUnique({ where: { id } })
    if (!channel) throw new NotFoundException('支付渠道不存在')
    let status = 'healthy', error = ''
    try { await this.validateChannel({ name: channel.name, providerKey: channel.providerKey as PaymentProvider, supportedMethods: this.paymentMethods(channel.supportedMethods), publicConfig: (channel.publicConfig || {}) as Record<string, unknown>, secrets: this.channelSecrets(channel.encryptedSecrets) }, true) } catch (reason) { status = 'invalid'; error = reason instanceof Error ? reason.message : '配置无效' }
    const updated = await this.prisma.paymentChannel.update({ where: { id }, data: { lastHealthStatus: status, lastError: error, lastCheckedAt: new Date() } })
    return this.publicChannel(updated)
  }

  async checkout(userId: string, input: CheckoutInput, origin: string) {
    const order = await this.resolveOrder(userId, input)
    const existing = await this.prisma.paymentTransaction.findFirst({ where: { userId, status: { in: ['PENDING', 'PAID', 'COMPLETED'] }, ...(input.orderType === 'SUBSCRIPTION' ? { subscriptionOrderId: input.orderId } : { rechargeOrderId: input.orderId }) }, orderBy: { createdAt: 'desc' }, include: { channel: true } })
    if (existing && existing.expiresAt > new Date()) return this.publicTransaction(existing)
    const channel = await this.pickChannel(input.channelId, input.paymentMethod, order.amountCents)
    await this.checkLimits(userId, channel.id, order.amountCents, channel.dailyLimitCents)
    const outTradeNo = `XY${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}${randomBytes(5).toString('hex').toUpperCase()}`
    const expiresAt = new Date(Date.now() + 30 * 60_000)
    let transaction = await this.prisma.paymentTransaction.create({ data: { userId, channelId: channel.id, orderType: input.orderType, subscriptionOrderId: input.orderType === 'SUBSCRIPTION' ? input.orderId : undefined, rechargeOrderId: input.orderType === 'RECHARGE' ? input.orderId : undefined, outTradeNo, amountCents: order.amountCents, currency: order.currency, paymentMethod: input.paymentMethod, expiresAt, metadata: { productName: order.productName } } })
    try {
      const checkout = await this.createGatewayCheckout(channel, transaction, order.productName, origin)
      transaction = await this.prisma.paymentTransaction.update({ where: { id: transaction.id }, data: { checkoutUrl: checkout.checkoutUrl || '', qrCodeUrl: checkout.qrCodeUrl || '', providerTradeNo: checkout.providerTradeNo, metadata: { productName: order.productName, instructions: checkout.instructions || '' } } })
      await this.attachOutTradeNo(input, outTradeNo)
      return this.publicTransaction(transaction)
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : '支付渠道创建订单失败'
      await this.prisma.paymentTransaction.update({ where: { id: transaction.id }, data: { status: 'FAILED', failedAt: new Date(), failureReason: message } })
      throw reason instanceof BadRequestException ? reason : new BadGatewayException(message)
    }
  }

  async getTransaction(userId: string, id: string) {
    const row = await this.prisma.paymentTransaction.findFirst({ where: { id, userId }, include: { channel: true } })
    if (!row) throw new NotFoundException('支付交易不存在')
    return this.publicTransaction(row)
  }

  async listTransactions(filters: { status?: string; type?: string; query?: string; channelId?: string; method?: string }) {
    const query = filters.query?.trim().slice(0, 120)
    const rows = await this.prisma.paymentTransaction.findMany({ where: { status: filters.status || undefined, orderType: filters.type || undefined, channelId: filters.channelId || undefined, paymentMethod: filters.method || undefined, ...(query ? { OR: [{ outTradeNo: { contains: query, mode: 'insensitive' } }, { providerTradeNo: { contains: query, mode: 'insensitive' } }, { user: { OR: [{ email: { contains: query, mode: 'insensitive' } }, { displayName: { contains: query, mode: 'insensitive' } }] } }] } : {}) }, orderBy: { createdAt: 'desc' }, take: 500, include: { user: { select: { id: true, email: true, displayName: true } }, channel: { select: { id: true, name: true, providerKey: true } } } })
    return rows.map((row) => this.publicTransaction(row))
  }

  async getAdminTransaction(id: string) {
    const transaction = await this.prisma.paymentTransaction.findUnique({ where: { id }, include: { user: { select: { id: true, email: true, displayName: true, company: true, phone: true, status: true, creditAccount: { select: { balance: true } } } }, channel: { select: { id: true, name: true, providerKey: true, supportedMethods: true, lastHealthStatus: true } }, webhookEvents: { orderBy: { createdAt: 'desc' }, take: 50, select: { id: true, externalId: true, eventType: true, signatureValid: true, processed: true, errorMessage: true, payload: true, createdAt: true, processedAt: true } }, refunds: { orderBy: { createdAt: 'desc' }, select: { id: true, amountCents: true, reason: true, status: true, providerRefundId: true, failureReason: true, requestedById: true, approvedById: true, requestedAt: true, processedAt: true, metadata: true, createdAt: true } } } })
    if (!transaction) throw new NotFoundException('支付交易不存在')
    const businessOrder = transaction.subscriptionOrderId
      ? await this.prisma.subscriptionOrder.findUnique({ where: { id: transaction.subscriptionOrderId }, include: { plan: { select: { id: true, code: true, name: true, billingCycle: true, includedCredits: true } } } })
      : transaction.rechargeOrderId
        ? await this.prisma.rechargeOrder.findUnique({ where: { id: transaction.rechargeOrderId }, include: { package: { select: { id: true, name: true, credits: true } } } })
        : null
    const refundedAmountCents = transaction.refunds.filter((item) => item.status === 'SUCCEEDED').reduce((sum, item) => sum + item.amountCents, 0)
    return { ...this.publicTransaction(transaction), businessOrder, refundedAmountCents, refundableAmountCents: Math.max(0, transaction.amountCents - refundedAmountCents) }
  }

  async summary() {
    const since = new Date(Date.now() - 30 * 86_400_000)
    const [channels, enabledChannels, completed, pending, failed, revenue, refunded, recent] = await Promise.all([
      this.prisma.paymentChannel.count(), this.prisma.paymentChannel.count({ where: { enabled: true } }), this.prisma.paymentTransaction.count({ where: { status: 'COMPLETED', completedAt: { gte: since } } }), this.prisma.paymentTransaction.count({ where: { status: { in: ['PENDING', 'PAID'] } } }), this.prisma.paymentTransaction.count({ where: { status: 'FAILED', createdAt: { gte: since } } }), this.prisma.paymentTransaction.aggregate({ where: { status: { in: ['COMPLETED', 'REFUNDED'] }, completedAt: { gte: since } }, _sum: { amountCents: true } }),
      this.prisma.paymentRefund.aggregate({ where: { status: 'SUCCEEDED', processedAt: { gte: since } }, _sum: { amountCents: true } }),
      this.prisma.paymentTransaction.findMany({ orderBy: { createdAt: 'desc' }, take: 8, include: { user: { select: { email: true, displayName: true } }, channel: { select: { name: true, providerKey: true } } } }),
    ])
    return { channels, enabledChannels, completed, pending, failed, revenueCents: revenue._sum.amountCents || 0, refundedCents: refunded._sum.amountCents || 0, netRevenueCents: (revenue._sum.amountCents || 0) - (refunded._sum.amountCents || 0), recent: recent.map((row) => this.publicTransaction(row)) }
  }

  async reconciliation() {
    const now = new Date()
    const since = new Date(Date.now() - 30 * 86_400_000)
    const [paidPending, expiredPending, failedRecent, unprocessedWebhooks, refundReviews, recentWebhooks] = await Promise.all([
      this.prisma.paymentTransaction.count({ where: { status: 'PAID' } }),
      this.prisma.paymentTransaction.count({ where: { status: 'PENDING', expiresAt: { lt: now } } }),
      this.prisma.paymentTransaction.count({ where: { status: 'FAILED', createdAt: { gte: since } } }),
      this.prisma.paymentWebhookEvent.count({ where: { signatureValid: true, processed: false } }),
      this.prisma.paymentRefund.count({ where: { status: { in: ['REQUESTED', 'REVIEW_REQUIRED'] } } }),
      this.prisma.paymentWebhookEvent.findMany({ where: { signatureValid: true, processed: false }, orderBy: { createdAt: 'desc' }, take: 20, include: { transaction: { select: { id: true, outTradeNo: true, status: true, amountCents: true, currency: true } }, channel: { select: { id: true, name: true, providerKey: true } } } }),
    ])
    return { paidPending, expiredPending, failedRecent, unprocessedWebhooks, refundReviews, total: paidPending + expiredPending + unprocessedWebhooks + refundReviews, webhooks: recentWebhooks }
  }

  async createRefund(transactionId: string, actorId: string, input: RefundInput) {
    if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) throw new BadRequestException('退款金额必须为正整数分')
    if (!input.reason?.trim()) throw new BadRequestException('请填写退款原因')
    const refund = await this.prisma.$transaction(async (tx) => {
      const transaction = await tx.paymentTransaction.findUnique({ where: { id: transactionId }, include: { refunds: true } })
      if (!transaction) throw new NotFoundException('支付交易不存在')
      if (!['COMPLETED', 'REFUNDED'].includes(transaction.status)) throw new BadRequestException('只有已完成交易可以退款')
      const reserved = transaction.refunds.filter((item) => !['FAILED', 'REJECTED'].includes(item.status)).reduce((sum, item) => sum + item.amountCents, 0)
      if (reserved + input.amountCents > transaction.amountCents) throw new BadRequestException(`最多还可退款 ${(transaction.amountCents - reserved) / 100} 元`)
      return tx.paymentRefund.create({ data: { transactionId, userId: transaction.userId, channelId: transaction.channelId, amountCents: input.amountCents, reason: input.reason.trim(), requestedById: actorId } })
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
    return this.processRefund(refund.id, actorId, Boolean(input.manualConfirmed))
  }

  async processRefund(refundId: string, actorId: string, manualConfirmed = false) {
    const refund = await this.prisma.paymentRefund.findUnique({ where: { id: refundId }, include: { transaction: true, channel: true } })
    if (!refund) throw new NotFoundException('退款记录不存在')
    if (refund.status === 'SUCCEEDED') return refund
    if (refund.status === 'PROCESSING') throw new BadRequestException('退款正在处理中，请勿重复操作')
    if (!['REQUESTED', 'REVIEW_REQUIRED', 'FAILED', 'GATEWAY_SUCCEEDED'].includes(refund.status)) throw new BadRequestException('当前退款状态不能处理')
    const successful = await this.prisma.paymentRefund.findMany({ where: { transactionId: refund.transactionId, status: 'SUCCEEDED' } })
    const alreadyRefunded = successful.reduce((sum, item) => sum + item.amountCents, 0)
    const creditsToReclaim = await this.refundCredits(refund.transaction, alreadyRefunded, refund.amountCents)
    const account = await this.prisma.creditAccount.findUnique({ where: { userId: refund.userId }, select: { balance: true } })
    if (refund.status !== 'GATEWAY_SUCCEEDED' && creditsToReclaim > (account?.balance || 0)) {
      return this.prisma.paymentRefund.update({ where: { id: refund.id }, data: { status: 'REVIEW_REQUIRED', failureReason: `用户仅剩 ${account?.balance || 0} 创作点，本次需回收 ${creditsToReclaim} 创作点` } })
    }
    if (refund.status !== 'GATEWAY_SUCCEEDED' && refund.channel.providerKey === 'MANUAL' && !manualConfirmed) {
      return this.prisma.paymentRefund.update({ where: { id: refund.id }, data: { status: 'REVIEW_REQUIRED', failureReason: '线下支付需确认已原路退款后再完成处理' } })
    }
    const gatewayAlreadySucceeded = refund.status === 'GATEWAY_SUCCEEDED'
    if (!gatewayAlreadySucceeded) {
      const locked = await this.prisma.paymentRefund.updateMany({ where: { id: refund.id, status: { in: ['REQUESTED', 'REVIEW_REQUIRED', 'FAILED'] } }, data: { status: 'PROCESSING', approvedById: actorId, failureReason: '' } })
      if (locked.count !== 1) throw new BadRequestException('退款状态已变化，请刷新后重试')
    }
    const attempt = Date.now().toString(36)
    let gateway: RefundGatewayResult = gatewayAlreadySucceeded ? { providerRefundId: refund.providerRefundId || undefined, payload: this.record(refund.metadata).gateway as Record<string, unknown> | undefined } : {}
    let gatewayCompleted = gatewayAlreadySucceeded
    try {
      if (!gatewayAlreadySucceeded) {
        if (creditsToReclaim > 0) await this.credits.mutate(refund.userId, -creditsToReclaim, 'ADJUST', '支付退款回收权益', `payment-refund:${refund.id}:reclaim:${attempt}`, { type: 'payment_refund', id: refund.id })
        try {
          gateway = await this.createGatewayRefund(refund.channel, refund.transaction, refund, manualConfirmed)
          gatewayCompleted = true
        } catch (reason) {
          if (creditsToReclaim > 0) await this.credits.mutate(refund.userId, creditsToReclaim, 'REFUND', '退款渠道失败返还权益', `payment-refund:${refund.id}:restore:${attempt}`, { type: 'payment_refund', id: refund.id }).catch(() => undefined)
          throw reason
        }
        await this.prisma.paymentRefund.update({ where: { id: refund.id }, data: { status: 'GATEWAY_SUCCEEDED', providerRefundId: gateway.providerRefundId, failureReason: '', metadata: { creditsReclaimed: creditsToReclaim, gateway: gateway.payload || {}, attempt } as Prisma.InputJsonValue } })
      }
      const totalRefunded = alreadyRefunded + refund.amountCents
      const fullRefund = totalRefunded === refund.transaction.amountCents
      await this.prisma.$transaction(async (tx) => {
        await tx.paymentRefund.update({ where: { id: refund.id }, data: { status: 'SUCCEEDED', providerRefundId: gateway.providerRefundId, approvedById: actorId, processedAt: new Date(), failureReason: '', metadata: { creditsReclaimed: creditsToReclaim, gateway: gateway.payload || {}, fullRefund } as Prisma.InputJsonValue } })
        if (fullRefund) {
          await tx.paymentTransaction.update({ where: { id: refund.transactionId }, data: { status: 'REFUNDED' } })
          if (refund.transaction.subscriptionOrderId) {
            await tx.subscriptionOrder.update({ where: { id: refund.transaction.subscriptionOrderId }, data: { status: 'REFUNDED' } })
            await tx.couponRedemption.updateMany({ where: { orderId: refund.transaction.subscriptionOrderId, status: 'REDEEMED' }, data: { status: 'REFUNDED', refundedAt: new Date() } })
            await tx.userSubscription.updateMany({ where: { userId: refund.userId, metadata: { path: ['orderId'], equals: refund.transaction.subscriptionOrderId }, status: { in: ['ACTIVE', 'TRIALING'] } }, data: { status: 'CANCELLED', cancelledAt: new Date(), endedAt: new Date() } })
          }
          if (refund.transaction.rechargeOrderId) await tx.rechargeOrder.update({ where: { id: refund.transaction.rechargeOrderId }, data: { status: 'REFUNDED' } })
        }
        await tx.notification.create({ data: { userId: refund.userId, type: NotificationType.CREDIT, title: '退款处理完成', body: `退款 ¥${(refund.amountCents / 100).toFixed(2)} 已处理${creditsToReclaim ? `，回收 ${creditsToReclaim} 创作点` : ''}`, metadata: { refundId: refund.id, transactionId: refund.transactionId } as Prisma.InputJsonValue } })
      })
      await this.referrals.handleRefund(refund.transactionId, totalRefunded).catch(() => undefined)
      return this.prisma.paymentRefund.findUniqueOrThrow({ where: { id: refund.id } })
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : '退款处理失败'
      const current = await this.prisma.paymentRefund.findUnique({ where: { id: refund.id }, select: { status: true } })
      const recoverable = gatewayCompleted || current?.status === 'GATEWAY_SUCCEEDED'
      await this.prisma.paymentRefund.update({ where: { id: refund.id }, data: { status: recoverable ? 'GATEWAY_SUCCEEDED' : 'FAILED', providerRefundId: gateway.providerRefundId, failureReason: message, processedAt: new Date(), ...(recoverable ? { metadata: { creditsReclaimed: creditsToReclaim, gateway: gateway.payload || {}, attempt } as Prisma.InputJsonValue } : {}) } })
      throw reason instanceof BadRequestException ? reason : new BadGatewayException(message)
    }
  }

  async rejectRefund(refundId: string, actorId: string, reason: string) {
    if (!reason?.trim()) throw new BadRequestException('请填写拒绝原因')
    const refund = await this.prisma.paymentRefund.findUnique({ where: { id: refundId } })
    if (!refund) throw new NotFoundException('退款记录不存在')
    if (!['REQUESTED', 'REVIEW_REQUIRED', 'FAILED'].includes(refund.status)) throw new BadRequestException('当前退款状态不能拒绝')
    return this.prisma.paymentRefund.update({ where: { id: refundId }, data: { status: 'REJECTED', approvedById: actorId, failureReason: reason.trim(), processedAt: new Date() } })
  }

  async expirePendingTransactions() {
    const result = await this.prisma.paymentTransaction.updateMany({ where: { status: 'PENDING', expiresAt: { lt: new Date() } }, data: { status: 'EXPIRED', failureReason: '支付有效期已结束' } })
    return { expired: result.count }
  }

  async replayWebhookEvent(eventId: string) {
    const event = await this.prisma.paymentWebhookEvent.findUnique({ where: { id: eventId }, include: { transaction: true } })
    if (!event) throw new NotFoundException('支付回调事件不存在')
    if (!event.signatureValid) throw new BadRequestException('签名无效的回调不能重放')
    if (!event.transaction) throw new BadRequestException('回调未关联到平台交易，不能重放')
    if (event.transaction.status === 'COMPLETED') {
      await this.prisma.paymentWebhookEvent.update({ where: { id: event.id }, data: { processed: true, processedAt: event.processedAt || new Date(), errorMessage: '' } })
      return this.publicTransaction(event.transaction)
    }
    if (!['PAID', 'FAILED'].includes(event.transaction.status)) throw new BadRequestException('原回调未进入权益发放阶段，不能安全重放')
    try {
      const result = await this.complete(event.transaction.id, event.transaction.providerTradeNo || undefined)
      await this.prisma.paymentWebhookEvent.update({ where: { id: event.id }, data: { processed: true, processedAt: new Date(), errorMessage: '' } })
      return result
    } catch (reason) {
      await this.prisma.paymentWebhookEvent.update({ where: { id: event.id }, data: { errorMessage: reason instanceof Error ? reason.message : '回调重放失败' } })
      throw reason
    }
  }

  async webhook(channelId: string, payload: Record<string, unknown>, headers: Record<string, string | string[] | undefined>, rawBody: Buffer) {
    const channel = await this.prisma.paymentChannel.findFirst({ where: { id: channelId, enabled: true } })
    if (!channel) throw new NotFoundException('支付渠道不存在或已停用')
    const secrets = this.channelSecrets(channel.encryptedSecrets)
    let verified: { valid: boolean; outTradeNo?: string; providerTradeNo?: string; amountCents?: number; eventId?: string; eventType?: string }
    if (channel.providerKey === 'EASYPAY') verified = this.verifyEasyPay(payload, secrets)
    else if (channel.providerKey === 'STRIPE') verified = this.verifyStripe(rawBody, String(headers['stripe-signature'] || ''), secrets)
    else if (channel.providerKey === 'EXTERNAL') verified = this.verifyExternal(rawBody, String(headers['x-payment-signature'] || ''), payload, secrets)
    else throw new BadRequestException('该渠道不接受自动回调')
    const transaction = verified.outTradeNo ? await this.prisma.paymentTransaction.findUnique({ where: { outTradeNo: verified.outTradeNo } }) : null
    const event = await this.prisma.paymentWebhookEvent.create({ data: { channelId, transactionId: transaction?.id, externalId: verified.eventId, eventType: verified.eventType || '', signatureValid: verified.valid, payload: this.sanitizePayload(payload) as Prisma.InputJsonValue } })
    if (!verified.valid) throw new BadRequestException('支付回调签名无效')
    if (!transaction) throw new NotFoundException('支付交易不存在')
    if (verified.amountCents !== undefined && verified.amountCents !== transaction.amountCents) throw new BadRequestException('支付回调金额不一致')
    try {
      const result = await this.complete(transaction.id, verified.providerTradeNo)
      await this.prisma.paymentWebhookEvent.update({ where: { id: event.id }, data: { processed: true, processedAt: new Date() } })
      return result
    } catch (reason) {
      await this.prisma.paymentWebhookEvent.update({ where: { id: event.id }, data: { errorMessage: reason instanceof Error ? reason.message : '权益发放失败' } })
      throw reason
    }
  }

  async complete(transactionId: string, providerTradeNo?: string) {
    let transaction = await this.prisma.paymentTransaction.findUnique({ where: { id: transactionId } })
    if (!transaction) throw new NotFoundException('支付交易不存在')
    if (transaction.status === 'COMPLETED') return this.publicTransaction(transaction)
    if (!['PENDING', 'PAID', 'FAILED'].includes(transaction.status)) throw new BadRequestException('当前交易状态不能入账')
    transaction = await this.prisma.paymentTransaction.update({ where: { id: transaction.id }, data: { status: 'PAID', paidAt: transaction.paidAt || new Date(), providerTradeNo: providerTradeNo || transaction.providerTradeNo, failureReason: '' } })
    try {
      if (transaction.orderType === 'SUBSCRIPTION' && transaction.subscriptionOrderId) await this.subscriptions.markPaid(transaction.subscriptionOrderId)
      else if (transaction.orderType === 'RECHARGE' && transaction.rechargeOrderId) await this.completeRecharge(transaction.rechargeOrderId)
      else throw new BadRequestException('支付交易没有关联业务订单')
      transaction = await this.prisma.paymentTransaction.update({ where: { id: transaction.id }, data: { status: 'COMPLETED', completedAt: new Date() } })
      await this.referrals.onPaymentCompleted(transaction.id).catch(() => undefined)
      return this.publicTransaction(transaction)
    } catch (reason) {
      await this.prisma.paymentTransaction.update({ where: { id: transaction.id }, data: { status: 'PAID', failureReason: reason instanceof Error ? reason.message : '权益发放失败' } })
      throw reason
    }
  }

  private async completeRecharge(orderId: string) {
    const order = await this.prisma.rechargeOrder.findUnique({ where: { id: orderId } })
    if (!order) throw new NotFoundException('充值订单不存在')
    if (order.status === 'CANCELLED' || order.status === 'REFUNDED') throw new BadRequestException('充值订单状态不能入账')
    await this.credits.mutate(order.userId, order.credits, 'PURCHASE', '在线充值到账', `recharge:${order.id}:paid`, { type: 'recharge_order', id: order.id })
    await this.prisma.rechargeOrder.update({ where: { id: order.id }, data: { status: 'PAID', paidAt: order.paidAt || new Date() } })
  }

  private async resolveOrder(userId: string, input: CheckoutInput) {
    if (input.orderType === 'SUBSCRIPTION') {
      const row = await this.prisma.subscriptionOrder.findFirst({ where: { id: input.orderId, userId, status: 'PENDING' }, include: { plan: { select: { name: true } } } })
      if (!row) throw new NotFoundException('待支付订阅订单不存在')
      return { amountCents: row.amountCents, currency: row.currency, productName: `Xinyue AI ${row.plan.name}` }
    }
    const row = await this.prisma.rechargeOrder.findFirst({ where: { id: input.orderId, userId, status: 'PENDING' }, include: { package: { select: { name: true } } } })
    if (!row) throw new NotFoundException('待支付充值订单不存在')
    return { amountCents: row.amountCents, currency: row.currency, productName: row.package?.name || 'Xinyue AI 创作点充值' }
  }

  private async pickChannel(channelId: string | undefined, method: PaymentMethod, amount: number) {
    if (!PAYMENT_METHODS.includes(method)) throw new BadRequestException('支付方式无效')
    const channel = await this.prisma.paymentChannel.findFirst({ where: { id: channelId || undefined, enabled: true, supportedMethods: { has: method }, minAmountCents: { lte: amount }, OR: [{ maxAmountCents: null }, { maxAmountCents: { gte: amount } }] }, orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }] })
    if (!channel) throw new BadRequestException('没有可用于该金额和支付方式的渠道')
    return channel
  }

  private async checkLimits(userId: string, channelId: string, amount: number, dailyLimit: number | null) {
    const pending = await this.prisma.paymentTransaction.count({ where: { userId, status: 'PENDING', expiresAt: { gt: new Date() } } })
    if (pending >= 3) throw new BadRequestException('最多同时保留 3 笔待支付订单')
    if (dailyLimit) {
      const start = new Date(); start.setHours(0, 0, 0, 0)
      const total = await this.prisma.paymentTransaction.aggregate({ where: { channelId, status: 'COMPLETED', completedAt: { gte: start } }, _sum: { amountCents: true } })
      if ((total._sum.amountCents || 0) + amount > dailyLimit) throw new BadRequestException('该支付渠道今日额度已用完')
    }
  }

  private async createGatewayCheckout(channel: GatewayChannel, transaction: GatewayTransaction, productName: string, origin: string): Promise<GatewayCheckout> {
    const config = this.safePublicConfig(channel.publicConfig)
    const secrets = this.channelSecrets(channel.encryptedSecrets)
    const configuredWebOrigin = String(process.env.WEB_ORIGIN || '').split(',')[0].trim()
    const baseUrl = String(config.publicBaseUrl || process.env.PUBLIC_BASE_URL || configuredWebOrigin || origin).replace(/\/$/, '')
    const webOrigin = String(config.webOrigin || process.env.WEB_ORIGIN || 'http://localhost:6001').split(',')[0].replace(/\/$/, '')
    if (channel.providerKey === 'MANUAL') return { checkoutUrl: String(config.paymentUrl || ''), qrCodeUrl: String(config.qrCodeUrl || ''), instructions: String(config.instructions || '请按页面说明完成付款，到账后由管理员确认。') }
    if (channel.providerKey === 'EXTERNAL') {
      const target = await this.endpointPolicy.assertPublicHttpUrl(String(config.checkoutUrl))
      target.searchParams.set('out_trade_no', transaction.outTradeNo); target.searchParams.set('amount', (transaction.amountCents / 100).toFixed(2)); target.searchParams.set('currency', transaction.currency); target.searchParams.set('notify_url', `${baseUrl}/v1/payments/webhooks/${channel.id}`); target.searchParams.set('return_url', `${webOrigin}/?payment=success&trade=${transaction.outTradeNo}`)
      return { checkoutUrl: target.toString() }
    }
    if (channel.providerKey === 'EASYPAY') {
      const params: Record<string, string> = { pid: String(config.merchantId), type: transaction.paymentMethod === 'wechat' ? 'wxpay' : 'alipay', out_trade_no: transaction.outTradeNo, notify_url: `${baseUrl}/v1/payments/webhooks/${channel.id}`, return_url: `${webOrigin}/?payment=success&trade=${transaction.outTradeNo}`, name: productName.slice(0, 100), money: (transaction.amountCents / 100).toFixed(2), sign_type: 'MD5' }
      params.sign = this.easyPaySign(params, secrets.merchantKey)
      const endpoint = (await this.endpointPolicy.assertPublicHttpUrl(String(config.apiUrl))).toString().replace(/\/$/, '')
      return { checkoutUrl: `${endpoint}/submit.php?${new URLSearchParams(params)}` }
    }
    if (channel.providerKey === 'STRIPE') {
      const form = new URLSearchParams({ mode: 'payment', success_url: `${webOrigin}/?payment=success&trade=${transaction.outTradeNo}`, cancel_url: `${webOrigin}/?payment=cancelled&trade=${transaction.outTradeNo}`, client_reference_id: transaction.outTradeNo, 'metadata[out_trade_no]': transaction.outTradeNo, 'line_items[0][price_data][currency]': transaction.currency.toLowerCase(), 'line_items[0][price_data][unit_amount]': String(transaction.amountCents), 'line_items[0][price_data][product_data][name]': productName, 'line_items[0][quantity]': '1' })
      const response = await fetchPublicNoRedirect('https://api.stripe.com/v1/checkout/sessions', { method: 'POST', headers: { Authorization: `Bearer ${secrets.secretKey}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: form })
      const result = await response.json() as StripeCheckoutResponse
      if (!response.ok || !result.url) throw new BadGatewayException(result.error?.message || 'Stripe Checkout 创建失败')
      return { checkoutUrl: result.url, providerTradeNo: result.id }
    }
    throw new BadRequestException('暂不支持该支付渠道')
  }

  private async refundCredits(transaction: GatewayTransaction, alreadyRefundedCents: number, amountCents: number) {
    let grantedCredits = 0
    if (transaction.subscriptionOrderId) {
      const order = await this.prisma.subscriptionOrder.findUnique({ where: { id: transaction.subscriptionOrderId }, include: { plan: { select: { includedCredits: true } } } })
      grantedCredits = order?.plan.includedCredits || 0
    } else if (transaction.rechargeOrderId) {
      const order = await this.prisma.rechargeOrder.findUnique({ where: { id: transaction.rechargeOrderId }, select: { credits: true } })
      grantedCredits = order?.credits || 0
    }
    if (!grantedCredits || transaction.amountCents <= 0) return 0
    const before = Math.floor(grantedCredits * alreadyRefundedCents / transaction.amountCents)
    const after = Math.floor(grantedCredits * Math.min(transaction.amountCents, alreadyRefundedCents + amountCents) / transaction.amountCents)
    return Math.max(0, after - before)
  }

  private async createGatewayRefund(channel: GatewayChannel, transaction: GatewayTransaction, refund: { id: string; amountCents: number }, manualConfirmed: boolean): Promise<RefundGatewayResult> {
    const config = this.safePublicConfig(channel.publicConfig)
    const secrets = this.channelSecrets(channel.encryptedSecrets)
    if (channel.providerKey === 'MANUAL') {
      if (!manualConfirmed) throw new BadRequestException('请先确认线下款项已经退回')
      return { providerRefundId: `MANUAL-${refund.id}`, payload: { manuallyConfirmed: true } }
    }
    if (!transaction.providerTradeNo) throw new BadRequestException('交易缺少上游单号，无法自动原路退款')
    if (channel.providerKey === 'STRIPE') {
      const form = new URLSearchParams({ payment_intent: transaction.providerTradeNo, amount: String(refund.amountCents), 'metadata[payment_refund_id]': refund.id })
      const response = await fetchPublicNoRedirect('https://api.stripe.com/v1/refunds', { method: 'POST', headers: { Authorization: `Bearer ${secrets.secretKey}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Idempotency-Key': refund.id }, body: form })
      const result = await response.json() as { id?: string; status?: string; error?: { message?: string } }
      if (!response.ok || !result.id || !['pending', 'succeeded'].includes(String(result.status))) throw new BadGatewayException(result.error?.message || 'Stripe 退款创建失败')
      return { providerRefundId: result.id, payload: { status: result.status } }
    }
    if (channel.providerKey === 'EASYPAY') {
      const baseEndpoint = (await this.endpointPolicy.assertPublicHttpUrl(String(config.apiUrl))).toString().replace(/\/$/, '')
      const endpoint = `${baseEndpoint}/api.php`
      const form = new URLSearchParams({ act: 'refund', pid: String(config.merchantId), key: secrets.merchantKey || '', trade_no: transaction.providerTradeNo, money: (refund.amountCents / 100).toFixed(2) })
      const response = await fetchPublicNoRedirect(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form })
      const result = await response.json().catch(() => ({})) as { code?: number | string; msg?: string; trade_no?: string; refund_no?: string }
      if (!response.ok || !['0', '1', '200'].includes(String(result.code))) throw new BadGatewayException(result.msg || '易支付退款请求失败')
      return { providerRefundId: result.refund_no || result.trade_no || `EASYPAY-${refund.id}`, payload: { code: result.code, message: result.msg || '' } }
    }
    if (channel.providerKey === 'EXTERNAL') {
      if (!config.refundUrl) throw new BadRequestException('外部收银台未配置退款接口地址')
      const refundUrl = await this.endpointPolicy.assertPublicHttpUrl(String(config.refundUrl))
      const payload = JSON.stringify({ refund_id: refund.id, trade_no: transaction.providerTradeNo, out_trade_no: transaction.outTradeNo, amount: (refund.amountCents / 100).toFixed(2), currency: transaction.currency })
      const signature = createHmac('sha256', secrets.webhookSecret || '').update(payload).digest('hex')
      const response = await fetchPublicNoRedirect(refundUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Payment-Signature': signature, 'Idempotency-Key': refund.id }, body: payload })
      const result = await response.json().catch(() => ({})) as { success?: boolean; status?: string; refund_id?: string; message?: string }
      if (!response.ok || !(result.success || ['pending', 'succeeded', 'success'].includes(String(result.status).toLowerCase()))) throw new BadGatewayException(result.message || '外部收银台退款失败')
      return { providerRefundId: result.refund_id || refund.id, payload: { status: result.status || 'success' } }
    }
    throw new BadRequestException('当前支付渠道不支持退款')
  }

  private verifyEasyPay(payload: Record<string, unknown>, secrets: Record<string, string>) {
    const params = Object.fromEntries(Object.entries(payload).map(([key, value]) => [key, String(value)]))
    const valid = Boolean(params.sign) && this.safeEqual(params.sign.toLowerCase(), this.easyPaySign(params, secrets.merchantKey).toLowerCase()) && ['TRADE_SUCCESS', 'TRADE_FINISHED'].includes(params.trade_status)
    return { valid, outTradeNo: params.out_trade_no, providerTradeNo: params.trade_no, amountCents: Math.round(Number(params.money) * 100), eventId: params.trade_no, eventType: params.trade_status }
  }

  private verifyStripe(raw: Buffer, signature: string, secrets: Record<string, string>) {
    const parts = Object.fromEntries(signature.split(',').map((part) => part.split('=', 2)))
    const expected = createHmac('sha256', secrets.webhookSecret || '').update(`${parts.t}.${raw.toString('utf8')}`).digest('hex')
    const valid = Boolean(parts.t && parts.v1) && Math.abs(Date.now() / 1000 - Number(parts.t)) < 300 && this.safeEqual(parts.v1, expected)
    let event: StripeCheckoutEvent = {}
    try { const parsed: unknown = JSON.parse(raw.toString('utf8')); if (this.isRecord(parsed)) event = parsed as StripeCheckoutEvent } catch { /* invalid JSON remains unverified */ }
    const object = event.data?.object || {}, paid = event.type === 'checkout.session.completed' && object.payment_status === 'paid'
    return { valid: valid && paid, outTradeNo: object.metadata?.out_trade_no || object.client_reference_id, providerTradeNo: object.payment_intent || object.id, amountCents: Number(object.amount_total), eventId: event.id, eventType: event.type }
  }

  private verifyExternal(raw: Buffer, signature: string, payload: Record<string, unknown>, secrets: Record<string, string>) {
    const expected = createHmac('sha256', secrets.webhookSecret || '').update(raw).digest('hex')
    return { valid: this.safeEqual(signature, expected) && ['paid', 'success', 'completed'].includes(String(payload.status).toLowerCase()), outTradeNo: String(payload.out_trade_no || ''), providerTradeNo: String(payload.trade_no || ''), amountCents: Math.round(Number(payload.amount) * 100), eventId: String(payload.event_id || payload.trade_no || ''), eventType: String(payload.status || '') }
  }

  private easyPaySign(params: Record<string, string>, key: string) { const canonical = Object.keys(params).filter((name) => !['sign', 'sign_type'].includes(name) && params[name] !== '').sort().map((name) => `${name}=${params[name]}`).join('&'); return createHash('md5').update(`${canonical}${key}`).digest('hex') }
  private safeEqual(left: string, right: string) { const a = Buffer.from(left || ''), b = Buffer.from(right || ''); return a.length === b.length && a.length > 0 && timingSafeEqual(a, b) }
  private cleanSecrets(input: Record<string, string>) { return Object.fromEntries(Object.entries(input).map(([key, value]) => [key, String(value || '').trim()]).filter(([, value]) => value)) }
  private paymentMethods(methods: string[]): PaymentMethod[] { return methods.filter((method): method is PaymentMethod => PAYMENT_METHODS.includes(method as PaymentMethod)) }
  private channelSecrets(payload: string) { if (!payload) return {}; try { const parsed: unknown = JSON.parse(this.crypto.decrypt(payload)); if (!this.isRecord(parsed)) throw new Error('invalid credentials'); return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === 'string')) } catch { throw new BadRequestException('支付渠道凭据无法解密') } }
  private secretHints(secrets: Record<string, string>) { return Object.fromEntries(Object.entries(secrets).map(([key, value]) => [key, this.crypto.hint(value)])) }
  private isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === 'object' && !Array.isArray(value) }
  private record(value: unknown): Record<string, unknown> { return this.isRecord(value) ? value : {} }
  private safePublicConfig(value: unknown): Record<string, unknown> { return this.isRecord(value) ? value : {} }
  private publicChannel<T extends { encryptedSecrets: string; publicConfig: unknown }>(channel: T) { const { encryptedSecrets: _secret, ...safe } = channel; return { ...safe, publicConfig: this.safePublicConfig(safe.publicConfig), hasSecrets: Boolean(_secret) } }
  private publicTransaction<T extends { amountCents: number; channel?: { id?: string; name: string; providerKey: string } | null }>(row: T) {
    const channel = row.channel ? { id: row.channel.id, name: row.channel.name, providerKey: row.channel.providerKey } : row.channel
    return { ...row, amountCents: Number(row.amountCents), ...(row.channel === undefined ? {} : { channel }) }
  }
  private sanitizePayload(payload: Record<string, unknown>) { const blocked = new Set(['sign', 'signature', 'client_secret']); return Object.fromEntries(Object.entries(payload).filter(([key]) => !blocked.has(key)).slice(0, 100)) }
  private async attachOutTradeNo(input: CheckoutInput, value: string) { if (input.orderType === 'SUBSCRIPTION') await this.prisma.subscriptionOrder.update({ where: { id: input.orderId }, data: { externalOrderId: value, paymentMethod: input.paymentMethod } }); else await this.prisma.rechargeOrder.update({ where: { id: input.orderId }, data: { externalOrderId: value, paymentMethod: input.paymentMethod } }) }
  private async validateChannel(input: Pick<ChannelInput, 'name' | 'providerKey' | 'supportedMethods' | 'publicConfig' | 'secrets'>, strict = false) {
    if (!input.name?.trim()) throw new BadRequestException('请输入渠道名称')
    if (!PAYMENT_PROVIDERS.includes(input.providerKey)) throw new BadRequestException('支付服务商无效')
    const providerMethods = PAYMENT_METHODS_BY_PROVIDER[input.providerKey]
    if (!input.supportedMethods?.length) throw new BadRequestException('至少选择一种支付方式')
    if (input.supportedMethods.some((item) => !PAYMENT_METHODS.includes(item as PaymentMethod))) throw new BadRequestException('支付方式无效')
    if (input.supportedMethods.some((item) => !providerMethods.includes(item as PaymentMethod))) throw new BadRequestException('所选支付方式不适用于当前服务商')
    if (!strict) return
    const config = input.publicConfig || {}, secrets = input.secrets || {}
    if (input.providerKey === 'EASYPAY' && (!config.apiUrl || !config.merchantId || !secrets.merchantKey)) throw new BadRequestException('易支付需要 API 地址、商户 ID 和商户密钥')
    if (input.providerKey === 'EASYPAY' && !/^\d+$/.test(String(config.merchantId))) throw new BadRequestException('易支付商户 ID（PID）必须为数字')
    if (input.providerKey === 'EASYPAY') await this.endpointPolicy.assertPublicHttpUrl(String(config.apiUrl))
    if (input.providerKey === 'STRIPE' && (!secrets.secretKey || !secrets.webhookSecret)) throw new BadRequestException('Stripe 需要 Secret Key 和 Webhook Secret')
    if (input.providerKey === 'EXTERNAL' && (!config.checkoutUrl || !secrets.webhookSecret)) throw new BadRequestException('外部收银台需要结账地址和回调密钥')
    if (input.providerKey === 'EXTERNAL') {
      await this.endpointPolicy.assertPublicHttpUrl(String(config.checkoutUrl))
      if (config.refundUrl) await this.endpointPolicy.assertPublicHttpUrl(String(config.refundUrl))
    }
  }
}
