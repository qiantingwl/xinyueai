<template>
  <div class="workspace-upgrade-layer" @mousedown.self="emit('close')">
    <section class="workspace-upgrade-dialog" role="dialog" aria-modal="true" aria-labelledby="workspace-upgrade-title">
      <button class="workspace-upgrade-close" type="button" aria-label="关闭升级套餐" @click="emit('close')"><X :size="21" /></button>
      <header><h2 id="workspace-upgrade-title">升级套餐</h2><p>选择适合你的使用方式</p></header>
      <div class="workspace-upgrade-tabs" role="tablist"><button type="button" :class="{ active: pricingMode === 'personal' }" @click="pricingMode = 'personal'">个人</button><button type="button" :class="{ active: pricingMode === 'team' }" @click="pricingMode = 'team'">团队</button></div>
      <div v-if="pricingMode === 'personal'" class="workspace-upgrade-plans">
        <article class="workspace-upgrade-plan workspace-upgrade-plan--free"><header><strong>免费版</strong><small>开始使用 Xinyue AI</small></header><h3>{{ formatMoney(0) }}<small>/ 月</small></h3><button type="button" disabled>{{ currentSubscription ? '基础方案' : '当前套餐' }}</button><ul><li><CheckCircle2 :size="17" />基础模型和日常对话</li><li><CheckCircle2 :size="17" />有限额度的图片生成</li><li><CheckCircle2 :size="17" />项目与文件管理</li></ul></article>
        <article v-for="plan in upgradeSubscriptionPlans" :key="plan.id" class="workspace-upgrade-plan" :class="{ recommended: plan.recommended, current: currentSubscription?.planId === plan.id }"><header><strong>{{ plan.name }}</strong><em v-if="plan.promotion">{{ plan.promotion.label || '限时优惠' }}</em><em v-else-if="plan.recommended">推荐</em><small>{{ plan.description }}</small></header><h3><del v-if="plan.effectivePriceCents !== undefined && plan.effectivePriceCents < plan.priceCents">{{ formatMoney(plan.priceCents) }}</del>{{ formatMoney(plan.effectivePriceCents ?? plan.priceCents) }}<small>/ {{ plan.billingCycle === 'YEARLY' ? '年' : plan.billingCycle === 'ONE_TIME' ? '一次性' : '月' }}</small></h3><button type="button" :disabled="planBusy || currentSubscription?.planId === plan.id || (plan.priceCents > 0 && !publicSettings.subscriptionsEnabled)" @click="purchaseUpgradePlan(plan)">{{ currentSubscription?.planId === plan.id ? '当前套餐' : plan.priceCents ? `升级至 ${plan.name}` : '开始免费试用' }}</button><ul><li v-if="plan.promotion"><CheckCircle2 :size="17" />{{ plan.promotion.name }}</li><li><CheckCircle2 :size="17" />{{ plan.includedCredits }} 创作点 / 周期</li><li><CheckCircle2 :size="17" />{{ plan.concurrency }} 路并发任务</li><li><CheckCircle2 :size="17" />{{ plan.allowByok ? '支持个人 API 密钥' : '统一模型渠道' }}</li><li v-if="plan.trialDays"><CheckCircle2 :size="17" />{{ plan.trialDays }} 天免费试用</li></ul></article>
        <section v-if="!upgradeSubscriptionPlans.length" class="workspace-upgrade-empty"><WalletCards :size="24" /><strong>套餐正在配置中</strong><span>管理员上架套餐后会显示在这里。</span></section>
      </div>
      <div v-else class="workspace-team-upgrade"><span><Users :size="26" /></span><h3>团队协作空间</h3><p>集中维护团队成员，让已注册用户加入同一个组织空间。</p><div class="workspace-team-stats"><span><strong>{{ teams.length }}</strong><small>已加入团队</small></span><span><strong>{{ teamMemberTotal }}</strong><small>团队成员</small></span></div><button type="button" @click="openTeamSettings">创建或管理团队</button></div>
      <small v-if="planMessage" class="settings-feedback" :class="{ 'is-error': planError }">{{ planMessage }}</small>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { CheckCircle2, Users, WalletCards, X } from 'lucide-vue-next'
import { useEscapeClose } from '../../../composables/useEscapeClose'
import type { PublicSettings, Subscription, SubscriptionPlan, Team } from '../types'

const props = defineProps<{
  currentSubscription: Subscription | null
  subscriptionPlans: SubscriptionPlan[]
  planBusy: boolean
  planMessage: string
  planError: boolean
  publicSettings: PublicSettings
  teams: Team[]
  formatMoney: (cents: number) => string
  purchaseUpgradePlan: (plan: SubscriptionPlan) => Promise<void>
  openTeamSettings: () => void
}>()

const emit = defineEmits<{
  close: []
}>()

useEscapeClose(() => emit('close'))

const pricingMode = defineModel<'personal' | 'team'>('pricingMode', { required: true })

const upgradeSubscriptionPlans = computed(() => props.subscriptionPlans.filter((plan) => plan.priceCents > 0 || plan.trialDays > 0))
const teamMemberTotal = computed(() => props.teams.reduce((total, team) => total + team.members.length, 0))
</script>
