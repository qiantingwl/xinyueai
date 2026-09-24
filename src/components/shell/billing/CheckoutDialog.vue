<template>
  <div class="settings-payment-layer" @mousedown.self="closePayment">
    <section class="settings-payment-dialog" role="dialog" aria-modal="true" aria-labelledby="payment-dialog-title">
      <header><div><span>安全收银台</span><h3 id="payment-dialog-title">{{ paymentTransaction ? '等待支付结果' : '选择支付方式' }}</h3><p>{{ paymentIntent.productName }}</p></div><button type="button" aria-label="关闭收银台" @click="closePayment"><X :size="18" /></button></header>
      <template v-if="!paymentTransaction">
        <div class="settings-payment-total"><span>应付金额</span><strong>{{ formatMoney(paymentQuote?.amountCents ?? paymentIntent.amountCents) }}</strong></div>
        <div v-if="paymentIntent.orderType === 'SUBSCRIPTION' && !paymentIntent.existingOrderId" class="settings-checkout-discounts">
          <label><span>优惠券</span><select v-model="selectedCouponId" :disabled="paymentBusy" @change="refreshPaymentQuote"><option value="">不使用优惠券</option><option v-for="coupon in availablePaymentCoupons" :key="coupon.id" :value="coupon.id">{{ coupon.template.name }} · {{ coupon.template.discountType === 'FIXED' ? `立减 ${formatMoney(coupon.template.discountValue)}` : `优惠 ${coupon.template.discountValue / 100}%` }}</option></select></label>
          <dl v-if="paymentQuote"><div><dt>日常价</dt><dd>{{ formatMoney(paymentQuote.originalAmountCents) }}</dd></div><div v-if="paymentQuote.promotionDiscountCents"><dt>{{ paymentQuote.promotion?.label || '活动优惠' }}</dt><dd>-{{ formatMoney(paymentQuote.promotionDiscountCents) }}</dd></div><div v-if="paymentQuote.couponDiscountCents"><dt>优惠券</dt><dd>-{{ formatMoney(paymentQuote.couponDiscountCents) }}</dd></div></dl>
          <small v-if="paymentQuote?.couponMessage">{{ paymentQuote.couponMessage }}</small>
        </div>
        <div v-if="eligiblePaymentChannels.length" class="settings-payment-channels">
          <button v-for="channel in eligiblePaymentChannels" :key="channel.id" type="button" :class="{ active: selectedPaymentChannelId === channel.id }" @click="selectPaymentChannel(channel)">
            <span class="settings-payment-channel-icon"><CreditCard v-if="channel.providerKey === 'STRIPE'" :size="18" /><Banknote v-else-if="channel.providerKey === 'MANUAL'" :size="18" /><QrCode v-else :size="18" /></span><span><strong>{{ channel.name }}</strong><small>{{ paymentProviderText[channel.providerKey] || channel.providerKey }}</small></span><i><CheckCircle2 v-if="selectedPaymentChannelId === channel.id" :size="17" /></i>
          </button>
        </div>
        <div v-if="selectedPaymentChannel" class="settings-payment-methods"><span>付款方式</span><div><button v-for="method in selectedPaymentChannel.supportedMethods" :key="method" type="button" :class="{ active: selectedPaymentMethod === method }" @click="selectedPaymentMethod = method">{{ paymentMethodText[method] || method }}</button></div></div>
        <p v-if="!eligiblePaymentChannels.length" class="settings-payment-empty">当前金额暂无可用支付渠道，请联系管理员或稍后再试。</p>
        <p v-if="paymentError" class="settings-feedback is-error">{{ paymentError }}</p>
        <footer><button type="button" @click="closePayment">取消</button><button type="button" :disabled="paymentBusy || !selectedPaymentChannel || !selectedPaymentMethod" @click="confirmCheckout"><LoaderCircle v-if="paymentBusy" class="settings-payment-spin" :size="15" />{{ paymentBusy ? '正在创建订单' : `确认支付 ${formatMoney(paymentQuote?.amountCents ?? paymentIntent.amountCents)}` }}</button></footer>
      </template>
      <template v-else>
        <div class="settings-payment-state" :class="paymentTransaction.status.toLowerCase()"><span><LoaderCircle v-if="['PENDING', 'PAID'].includes(paymentTransaction.status)" class="settings-payment-spin" :size="24" /><CheckCircle2 v-else-if="paymentTransaction.status === 'COMPLETED'" :size="24" /><CircleGauge v-else :size="24" /></span><div><strong>{{ paymentStatusTitle }}</strong><small>交易号 {{ paymentTransaction.outTradeNo }}</small></div><b>{{ formatMoney(paymentTransaction.amountCents) }}</b></div>
        <img v-if="paymentTransaction.qrCodeUrl" class="settings-payment-qr" :src="paymentTransaction.qrCodeUrl" alt="付款二维码" />
        <p v-if="paymentInstructions" class="settings-payment-instructions">{{ paymentInstructions }}</p>
        <p v-if="paymentError" class="settings-feedback is-error">{{ paymentError }}</p>
        <footer><button type="button" @click="closePayment">稍后查看</button><a v-if="safeCheckoutUrl" :href="safeCheckoutUrl" target="_blank" rel="noopener noreferrer">前往支付</a><button v-if="!['COMPLETED', 'FAILED', 'CANCELLED', 'EXPIRED'].includes(paymentTransaction.status)" type="button" :disabled="paymentBusy" @click="refreshPaymentStatus">我已完成支付</button></footer>
      </template>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Banknote, CheckCircle2, CircleGauge, CreditCard, LoaderCircle, QrCode, X } from 'lucide-vue-next'
import { useEscapeClose } from '../../../composables/useEscapeClose'
import { paymentMethodText, paymentProviderText, type PaymentMethodKey } from '../../../constants/payment'
import { safeHttpNavigationUrl } from '../../../utils/safe-url'
import type { CommerceQuote, PaymentChannel, PaymentIntent, PaymentTransaction, UserCoupon } from '../types'

const props = defineProps<{
  paymentIntent: PaymentIntent
  paymentTransaction: PaymentTransaction | null
  paymentQuote: CommerceQuote | null
  availablePaymentCoupons: UserCoupon[]
  eligiblePaymentChannels: PaymentChannel[]
  selectedPaymentChannelId: string
  selectedPaymentChannel: PaymentChannel | null
  paymentBusy: boolean
  paymentError: string
  paymentStatusTitle: string
  paymentInstructions: string
  formatMoney: (cents: number) => string
  selectPaymentChannel: (channel: PaymentChannel) => void
  refreshPaymentQuote: () => Promise<void>
  confirmCheckout: () => Promise<void>
  closePayment: () => void
  refreshPaymentStatus: () => Promise<void>
}>()

const safeCheckoutUrl = computed(() => safeHttpNavigationUrl(props.paymentTransaction?.checkoutUrl, window.location.origin))

useEscapeClose(() => props.closePayment())

const selectedCouponId = defineModel<string>('selectedCouponId', { required: true })
const selectedPaymentMethod = defineModel<PaymentMethodKey | ''>('selectedPaymentMethod', { required: true })
</script>
