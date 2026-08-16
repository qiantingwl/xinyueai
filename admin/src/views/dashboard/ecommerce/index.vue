<template>
  <div class="dashboard-page">
    <header class="dashboard-heading"
      ><div
        ><h1>{{ xt('电子商务') }}</h1
        ><p>{{ xt('订阅、充值、支付与订单经营看板') }}</p></div
      ><div class="heading-actions"
        ><ElButton :loading="loading" @click="load"
          ><ArtSvgIcon icon="ri:refresh-line" />{{ xt('刷新数据') }}</ElButton
        ><ElButton type="primary" @click="go('/enterprise/commerce/payments')"
          ><ArtSvgIcon icon="ri:secure-payment-line" />{{ xt('商业化中心') }}</ElButton
        ></div
      ></header
    >
    <div v-loading="loading" class="metric-grid">
      <div v-for="item in metrics" :key="item.label" class="metric-card"
        ><div class="metric-icon" :class="item.tone"><ArtSvgIcon :icon="item.icon" /></div
        ><div
          ><span>{{ item.label }}</span
          ><strong>{{ item.value }}</strong
          ><small>{{ item.note }}</small></div
        ></div
      >
    </div>
    <ElRow :gutter="20" class="equal-row">
      <ElCol :xs="24" :lg="14"
        ><section class="art-card chart-card"
          ><div class="card-heading"
            ><div
              ><h2>{{ xt('近 14 天收入趋势') }}</h2
              ><p>{{ xt('订阅和充值完成金额') }}</p></div
            ><ElTag type="success">{{ xt('实时汇总') }}</ElTag></div
          ><ArtLineChart
            height="280px"
            :data="revenueTrend"
            :x-axis-data="revenueLabels"
            :show-area-color="true"
            :show-axis-line="false" /></section
      ></ElCol>
      <ElCol :xs="24" :lg="10"
        ><section class="art-card chart-card"
          ><div class="card-heading"
            ><div
              ><h2>{{ xt('支付处理状态') }}</h2
              ><p>{{ xt('当前交易和渠道健康度') }}</p></div
            ></div
          ><div class="status-list"
            ><div v-for="item in statusItems" :key="item.label" class="status-row"
              ><div
                ><span>{{ item.label }}</span
                ><strong>{{ item.value }}</strong></div
              ><ElProgress
                :percentage="item.percent"
                :color="item.color"
                :show-text="false"
                :stroke-width="8" /></div></div
          ><div class="channel-health"
            ><span>{{ xt('启用渠道') }}</span
            ><strong>{{ summary?.enabledChannels || 0 }} / {{ summary?.channels || 0 }}</strong
            ><ElButton text type="primary" @click="go('/enterprise/commerce/payments')">{{
              xt('配置渠道')
            }}</ElButton></div
          ></section
        ></ElCol
      >
    </ElRow>
    <ElRow :gutter="20" class="equal-row">
      <ElCol :xs="24" :lg="10"
        ><section class="art-card table-card"
          ><div class="card-heading"
            ><div
              ><h2>{{ xt('订阅与充值商品') }}</h2
              ><p>{{ xt('当前可售商品') }}</p></div
            ><ElButton text type="primary" @click="go('/enterprise/commerce/subscriptions')">{{
              xt('管理套餐')
            }}</ElButton></div
          ><div class="product-list"
            ><div v-for="item in products" :key="item.name" class="product-row"
              ><div
                ><strong>{{ item.name }}</strong
                ><span>{{ xt(item.kind) }} · {{ item.credits }} {{ xt('点') }}</span></div
              ><ElTag :type="item.enabled ? 'success' : 'info'">{{
                item.enabled ? xt('销售中') : xt('已下架')
              }}</ElTag></div
            ><ElEmpty v-if="!products.length" :description="xt('暂无商品')" /></div></section
      ></ElCol>
      <ElCol :xs="24" :lg="14"
        ><section class="art-card table-card"
          ><div class="card-heading"
            ><div
              ><h2>{{ xt('最近交易') }}</h2
              ><p>{{ xt('最新支付状态和用户订单') }}</p></div
            ><ElButton text type="primary" @click="go('/enterprise/commerce/payments')">{{
              xt('查看全部')
            }}</ElButton></div
          ><ElTable v-if="transactions.length" :data="transactions" size="small"
            ><ElTableColumn :label="xt('订单号')" min-width="180"
              ><template #default="{ row }"
                ><strong>{{ row.outTradeNo }}</strong
                ><small class="note">{{ date(row.createdAt) }}</small></template
              ></ElTableColumn
            ><ElTableColumn :label="xt('用户')" min-width="130"
              ><template #default="{ row }">{{
                row.user?.displayName || xt('未知用户')
              }}</template></ElTableColumn
            ><ElTableColumn :label="xt('金额')" width="100"
              ><template #default="{ row }">{{ money(row.amountCents) }}</template></ElTableColumn
            ><ElTableColumn :label="xt('状态')" width="100"
              ><template #default="{ row }"
                ><ElTag :type="transactionType(row.status)">{{
                  xt(statusText[row.status] || row.status)
                }}</ElTag></template
              ></ElTableColumn
            ></ElTable
          ><ElEmpty
            v-else
            class="compact-empty"
            :description="xt('暂无交易')"
            :image-size="72" /></section
      ></ElCol>
    </ElRow>
    <section class="art-card reconciliation-card"
      ><div class="card-heading"
        ><div
          ><h2>{{ xt('对账提醒') }}</h2
          ><p>{{ xt('需要运营人员关注的支付事件') }}</p></div
        ><ElButton text type="primary" @click="go('/enterprise/operations/alerts')">{{
          xt('前往告警中心')
        }}</ElButton></div
      ><div class="reconciliation-grid"
        ><div
          v-for="item in reconciliationItems"
          :key="item.label"
          :class="{ warning: item.value > 0 }"
          ><ArtSvgIcon :icon="item.icon" /><span>{{ item.label }}</span
          ><strong>{{ item.value }}</strong></div
        ></div
      ></section
    >
  </div>
</template>

<script setup lang="ts">
  import {
    xinyueApi,
    type Overview,
    type PaymentReconciliation,
    type PaymentSummary,
    type PaymentTransaction,
    type RechargePackage,
    type SubscriptionPlan
  } from '@/api/xinyue'
  import { router } from '@/router'
  import { xinyueLocale, xinyueText as xt } from '@/locales/xinyue'
  defineOptions({ name: 'Ecommerce' })
  const loading = ref(false)
  const overview = ref<Overview | null>(null)
  const summary = ref<PaymentSummary | null>(null)
  const reconciliation = ref<PaymentReconciliation | null>(null)
  const transactions = ref<PaymentTransaction[]>([])
  const plans = ref<SubscriptionPlan[]>([])
  const packages = ref<RechargePackage[]>([])
  const revenueLabels = computed(
    () => overview.value?.trend.map((item) => item.date.slice(5)) || []
  )
  const revenueTrend = computed(
    () => overview.value?.trend.map((item) => Number((item.revenueCents / 100).toFixed(2))) || []
  )
  const money = (cents: number) => `¥${(cents / 100).toFixed(2)}`
  const date = (value: string) =>
    new Intl.DateTimeFormat(xinyueLocale(), { dateStyle: 'medium', timeStyle: 'short' }).format(
      new Date(value)
    )
  const go = (path: string) => router.push(path)
  const statusText: Record<string, string> = {
    PENDING: '待支付',
    PAID: '待入账',
    COMPLETED: '已完成',
    FAILED: '失败',
    REFUNDED: '已退款'
  }
  const transactionType = (status: string) =>
    status === 'COMPLETED'
      ? 'success'
      : status === 'FAILED'
        ? 'danger'
        : status === 'PENDING' || status === 'PAID'
          ? 'warning'
          : 'info'
  const metrics = computed(() => [
    {
      label: xt('近 30 天净收入'),
      value: money(summary.value?.netRevenueCents || 0),
      note: `${xt('退款')} ${money(summary.value?.refundedCents || 0)}`,
      icon: 'ri:money-cny-circle-line',
      tone: 'green'
    },
    {
      label: xt('已完成交易'),
      value: String(summary.value?.completed || 0),
      note: `${xt('失败')} ${summary.value?.failed || 0} ${xt('笔')}`,
      icon: 'ri:checkbox-circle-line',
      tone: 'blue'
    },
    {
      label: xt('待处理订单'),
      value: String(summary.value?.pending || 0),
      note: xt('待支付或待入账'),
      icon: 'ri:time-line',
      tone: 'orange'
    },
    {
      label: xt('活跃订阅'),
      value: String(overview.value?.activeSubscriptions || 0),
      note: `${plans.value.length} ${xt('个套餐已配置')}`,
      icon: 'ri:vip-crown-2-line',
      tone: 'purple'
    }
  ])
  const statusItems = computed(() => {
    const total = Math.max(
      (summary.value?.completed || 0) +
        (summary.value?.pending || 0) +
        (summary.value?.failed || 0),
      1
    )
    return [
      {
        label: xt('已完成'),
        value: summary.value?.completed || 0,
        percent: Math.round(((summary.value?.completed || 0) / total) * 100),
        color: '#397157'
      },
      {
        label: xt('待处理'),
        value: summary.value?.pending || 0,
        percent: Math.round(((summary.value?.pending || 0) / total) * 100),
        color: '#d97706'
      },
      {
        label: xt('失败'),
        value: summary.value?.failed || 0,
        percent: Math.round(((summary.value?.failed || 0) / total) * 100),
        color: '#dc2626'
      }
    ]
  })
  const products = computed(() =>
    [
      ...plans.value.map((item) => ({
        name: item.name,
        kind: xt('订阅套餐'),
        credits: item.includedCredits,
        enabled: item.enabled
      })),
      ...packages.value.map((item) => ({
        name: item.name,
        kind: xt('充值商品'),
        credits: item.credits,
        enabled: item.enabled
      }))
    ].slice(0, 8)
  )
  const reconciliationItems = computed(() => [
    {
      label: xt('待入账'),
      value: reconciliation.value?.paidPending || 0,
      icon: 'ri:hand-coin-line'
    },
    {
      label: xt('过期待支付'),
      value: reconciliation.value?.expiredPending || 0,
      icon: 'ri:timer-flash-line'
    },
    {
      label: xt('未处理回调'),
      value: reconciliation.value?.unprocessedWebhooks || 0,
      icon: 'ri:webhook-line'
    },
    {
      label: xt('退款审核'),
      value: reconciliation.value?.refundReviews || 0,
      icon: 'ri:refund-2-line'
    }
  ])
  async function load() {
    loading.value = true
    try {
      ;[overview.value, summary.value, reconciliation.value, plans.value, packages.value] =
        await Promise.all([
          xinyueApi.overview(),
          xinyueApi.paymentSummary(),
          xinyueApi.paymentReconciliation(),
          xinyueApi.plans(),
          xinyueApi.rechargePackages()
        ])
      transactions.value = summary.value?.recent || []
    } finally {
      loading.value = false
    }
  }
  onMounted(load)
</script>

<style scoped lang="scss">
  .dashboard-page {
    min-width: 0;
    max-width: 100%;
    min-height: calc(100vh - 130px);
    overflow: hidden;
  }

  .dashboard-heading,
  .card-heading {
    display: flex;
    gap: 16px;
    align-items: flex-start;
    justify-content: space-between;
    min-width: 0;
  }

  .dashboard-heading {
    margin-bottom: 22px;
  }

  .dashboard-heading h1 {
    margin: 0;
    font-size: 24px;
    font-weight: 600;
    color: var(--art-gray-900);
  }

  .dashboard-heading p,
  .card-heading p {
    margin: 6px 0 0;
    font-size: 13px;
    color: var(--art-gray-600);
  }

  .heading-actions {
    display: flex;
    gap: 10px;
  }

  .equal-row :deep(.el-col) {
    display: flex;
    min-width: 0;
  }

  .metric-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 16px;
    margin-bottom: 20px;
  }

  .metric-card {
    display: flex;
    gap: 13px;
    align-items: center;
    min-width: 0;
    min-height: 108px;
    padding: 19px;
    background: var(--art-main-bg-color);
    border: 1px solid var(--art-card-border);
    border-radius: 8px;
  }

  .metric-icon {
    display: flex;
    flex: 0 0 44px;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    font-size: 21px;
    border-radius: 8px;
  }

  .metric-icon.green {
    color: #16845a;
    background: #e5f6ef;
  }

  .metric-icon.blue {
    color: #2563eb;
    background: #e8efff;
  }

  .metric-icon.orange {
    color: #c36c0c;
    background: #fff1dc;
  }

  .metric-icon.purple {
    color: #7c3aed;
    background: #f1eaff;
  }

  .metric-card span,
  .metric-card small {
    display: block;
    font-size: 12px;
    color: var(--art-gray-500);
  }

  .metric-card strong {
    display: block;
    margin: 5px 0 3px;
    font-size: 23px;
    font-weight: 650;
    color: var(--art-gray-900);
  }

  .art-card {
    width: 100%;
    min-width: 0;
    padding: 20px;
    margin-bottom: 20px;
    border: 1px solid var(--art-card-border);
    border-radius: 8px;
  }

  .chart-card {
    min-height: 365px;
  }

  .card-heading h2 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: var(--art-gray-900);
  }

  .status-list {
    margin-top: 30px;
  }

  .status-row + .status-row {
    margin-top: 25px;
  }

  .status-row > div {
    display: flex;
    justify-content: space-between;
    margin-bottom: 8px;
    font-size: 13px;
  }

  .status-row span {
    color: var(--art-gray-600);
  }

  .status-row strong {
    color: var(--art-gray-900);
  }

  .channel-health {
    display: flex;
    gap: 10px;
    align-items: center;
    padding-top: 24px;
    margin-top: 28px;
    border-top: 1px solid var(--art-gray-200);
  }

  .channel-health span {
    font-size: 13px;
    color: var(--art-gray-600);
  }

  .channel-health strong {
    margin-right: auto;
    color: var(--art-gray-900);
  }

  .table-card {
    height: calc(100% - 20px);
    min-height: 350px;
    overflow: hidden;
  }

  .table-card :deep(.el-table) {
    max-width: 100%;
    margin-top: 18px;
  }

  .compact-empty {
    min-height: 230px;
  }

  .note {
    display: block;
    margin-top: 4px;
    font-size: 12px;
    color: var(--art-gray-500);
  }

  .product-list {
    margin-top: 20px;
  }

  .product-row {
    display: flex;
    gap: 10px;
    align-items: center;
    justify-content: space-between;
    padding: 13px 0;
    border-bottom: 1px solid var(--art-gray-200);
  }

  .product-row:last-child {
    border-bottom: 0;
  }

  .product-row strong,
  .product-row span {
    display: block;
  }

  .product-row span {
    margin-top: 4px;
    font-size: 12px;
    color: var(--art-gray-500);
  }

  .reconciliation-card {
    margin-bottom: 0;
  }

  .reconciliation-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
    margin-top: 20px;
  }

  .reconciliation-grid > div {
    display: grid;
    grid-template-columns: 22px minmax(0, 1fr) auto;
    gap: 8px;
    align-items: center;
    min-width: 0;
    padding: 14px;
    color: var(--art-gray-600);
    background: var(--art-gray-100);
    border-radius: 6px;
  }

  .reconciliation-grid svg {
    color: var(--el-color-primary);
  }

  .reconciliation-grid strong {
    color: var(--art-gray-900);
  }

  .reconciliation-grid .warning svg,
  .reconciliation-grid .warning strong {
    color: #d97706;
  }

  @media (width <= 900px) {
    .metric-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .reconciliation-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (width <= 600px) {
    .dashboard-heading {
      flex-direction: column;
    }

    .heading-actions {
      flex-wrap: wrap;
      width: 100%;
    }

    .metric-grid,
    .reconciliation-grid {
      grid-template-columns: 1fr;
    }
  }

  .card-heading > div,
  .product-row > div {
    min-width: 0;
  }

  .card-heading h2,
  .card-heading p,
  .product-row strong,
  .product-row span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .card-heading > .el-button,
  .product-row > .el-tag {
    flex: 0 0 auto;
  }

  .product-row > .el-tag {
    max-width: 80px;
    white-space: nowrap;
  }
</style>
