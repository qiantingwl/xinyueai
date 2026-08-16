<template>
  <div class="xinyue-page">
    <header class="page-title"
      ><div
        ><h1>{{ xt('订阅与套餐') }}</h1
        ><p>{{ xt('配置试用、周期权益、客户订阅和订阅订单') }}</p></div
      ><ElSpace
        ><ElButton @click="grantDialog = true"
          ><ArtSvgIcon icon="ri:user-add-line" />{{ xt('手动开通') }}</ElButton
        ><ElButton type="primary" @click="openCreate"
          ><ArtSvgIcon icon="ri:add-line" />{{ xt('新增套餐') }}</ElButton
        ></ElSpace
      ></header
    >
    <ElTabs v-model="tab" class="business-tabs">
      <ElTabPane :label="xt('套餐配置')" name="plans">
        <div class="plan-grid"
          ><article
            v-for="plan in plans"
            :key="plan.id"
            :class="{ disabled: !plan.enabled, recommended: plan.recommended }"
            ><header
              ><div
                ><strong>{{ plan.name }}</strong
                ><small>{{ plan.code }} · {{ xt(cycleText[plan.billingCycle]) }}</small></div
              ><ElTag v-if="plan.recommended" type="warning">{{ xt('推荐') }}</ElTag></header
            ><h2
              >{{ money(plan.priceCents, plan.currency)
              }}<small>/{{ xt(cycleShort[plan.billingCycle]) }}</small></h2
            ><p>{{ plan.description || xt('暂无套餐说明') }}</p
            ><dl
              ><div
                ><dt>{{ xt('包含额度') }}</dt
                ><dd>{{ plan.includedCredits }} {{ xt('点') }}</dd></div
              ><div
                ><dt>{{ xt('并发任务') }}</dt
                ><dd>{{ plan.concurrency }} {{ xt('路') }}</dd></div
              ><div
                ><dt>{{ xt('免费试用') }}</dt
                ><dd>{{ plan.trialDays ? `${plan.trialDays} ${xt('天')}` : xt('关闭') }}</dd></div
              ><div
                ><dt>API / BYOK</dt
                ><dd
                  >{{ plan.apiAccess ? xt('开放') : xt('关闭') }} /
                  {{ plan.allowByok ? xt('允许') : xt('关闭') }}</dd
                ></div
              ></dl
            ><footer
              ><ElTag :type="plan.enabled ? 'success' : 'info'">{{
                plan.enabled ? xt('出售中') : xt('已下架')
              }}</ElTag
              ><div
                ><ElButton link type="primary" @click="openEdit(plan)">{{ xt('编辑') }}</ElButton
                ><ElButton link type="danger" @click="removePlan(plan)">{{
                  xt('删除')
                }}</ElButton></div
              ></footer
            ></article
          ></div
        >
      </ElTabPane>
      <ElTabPane :label="`${xt('有效订阅')} ${subscriptions.length}`" name="active">
        <ElCard shadow="never" class="art-table-card"
          ><ArtTableHeader :loading="loading" @refresh="load" /><ElTable
            v-loading="loading"
            :data="subscriptions"
            height="100%"
            ><ElTableColumn :label="xt('用户')" min-width="210"
              ><template #default="{ row }"
                ><strong>{{ row.user.displayName }}</strong
                ><small class="note">{{ row.user.email || xt('未绑定邮箱') }}</small></template
              ></ElTableColumn
            ><ElTableColumn :label="xt('套餐')" min-width="160"
              ><template #default="{ row }"
                ><strong>{{ row.plan.name }}</strong
                ><small class="note">{{ row.plan.code }}</small></template
              ></ElTableColumn
            ><ElTableColumn :label="xt('状态')" width="100"
              ><template #default="{ row }"
                ><ElTag :type="row.status === 'TRIALING' ? 'warning' : 'success'">{{
                  row.status === 'TRIALING' ? xt('试用中') : xt('生效中')
                }}</ElTag></template
              ></ElTableColumn
            ><ElTableColumn :label="xt('到期时间')" width="180"
              ><template #default="{ row }">{{
                date(row.currentPeriodEnd)
              }}</template></ElTableColumn
            ><ElTableColumn :label="xt('操作')" width="100"
              ><template #default="{ row }"
                ><ElButton link type="danger" @click="terminate(row)">{{
                  xt('终止')
                }}</ElButton></template
              ></ElTableColumn
            ></ElTable
          ></ElCard
        >
      </ElTabPane>
      <ElTabPane :label="`${xt('订阅订单')} ${orders.length}`" name="orders">
        <ElCard shadow="never" class="art-table-card"
          ><ArtTableHeader :loading="loading" @refresh="load" /><ElTable
            v-loading="loading"
            :data="orders"
            height="100%"
            ><ElTableColumn :label="xt('订单')" min-width="210"
              ><template #default="{ row }"
                ><strong>{{ row.id }}</strong
                ><small class="note">{{ date(row.createdAt) }}</small></template
              ></ElTableColumn
            ><ElTableColumn :label="xt('客户 / 套餐')" min-width="210"
              ><template #default="{ row }"
                ><strong>{{ row.user.displayName }} · {{ row.plan.name }}</strong
                ><small class="note">{{ row.user.email || xt('未绑定邮箱') }}</small></template
              ></ElTableColumn
            ><ElTableColumn :label="xt('金额')" width="120"
              ><template #default="{ row }">{{
                money(row.amountCents, row.currency)
              }}</template></ElTableColumn
            ><ElTableColumn
              :label="xt('支付方式')"
              width="110"
              prop="paymentMethod"
            /><ElTableColumn :label="xt('状态')" width="100"
              ><template #default="{ row }"
                ><ElTag :type="statusType(row.status)">{{
                  xt(statusText[row.status] || row.status)
                }}</ElTag></template
              ></ElTableColumn
            ><ElTableColumn :label="xt('操作')" width="160"
              ><template #default="{ row }"
                ><template v-if="row.status === 'PENDING'"
                  ><ElButton link type="primary" @click="markPaid(row)">{{
                    xt('确认到账')
                  }}</ElButton
                  ><ElButton link type="danger" @click="cancelOrder(row)">{{
                    xt('取消')
                  }}</ElButton></template
                ><span v-else class="note">{{ xt('无需处理') }}</span></template
              ></ElTableColumn
            ></ElTable
          ></ElCard
        >
      </ElTabPane>
    </ElTabs>

    <ElDialog
      v-model="planDialog"
      :title="xt(planForm.id ? '编辑订阅套餐' : '新增订阅套餐')"
      width="760px"
    >
      <ElForm label-position="top"
        ><ElRow :gutter="14"
          ><ElCol :span="12"
            ><ElFormItem :label="xt('套餐代码')"
              ><ElInput
                v-model.trim="planForm.code"
                placeholder="pro-monthly" /></ElFormItem></ElCol
          ><ElCol :span="12"
            ><ElFormItem :label="xt('套餐名称')"
              ><ElInput
                v-model.trim="planForm.name"
                :placeholder="xt('专业版')" /></ElFormItem></ElCol></ElRow
        ><ElFormItem :label="xt('套餐说明')"
          ><ElInput v-model.trim="planForm.description" type="textarea" :rows="2" /></ElFormItem
        ><ElRow :gutter="14"
          ><ElCol :span="8"
            ><ElFormItem :label="xt('计费周期')"
              ><ElSelect v-model="planForm.billingCycle" class="wide"
                ><ElOption
                  v-for="(label, value) in cycleText"
                  :key="value"
                  :value="value"
                  :label="xt(label)" /></ElSelect></ElFormItem></ElCol
          ><ElCol :span="8"
            ><ElFormItem :label="xt('销售价格（分）')"
              ><ElInputNumber
                v-model="planForm.priceCents"
                :min="0"
                class="wide" /></ElFormItem></ElCol
          ><ElCol :span="8"
            ><ElFormItem :label="xt('划线价格（分）')"
              ><ElInputNumber
                v-model="planForm.originalPriceCents"
                :min="0"
                class="wide" /></ElFormItem></ElCol></ElRow
        ><ElRow :gutter="14"
          ><ElCol :span="8"
            ><ElFormItem :label="xt('包含创作点')"
              ><ElInputNumber
                v-model="planForm.includedCredits"
                :min="0"
                class="wide" /></ElFormItem></ElCol
          ><ElCol :span="8"
            ><ElFormItem :label="xt('并发任务数')"
              ><ElInputNumber
                v-model="planForm.concurrency"
                :min="1"
                :max="100"
                class="wide" /></ElFormItem></ElCol
          ><ElCol :span="8"
            ><ElFormItem :label="xt('试用天数')"
              ><ElInputNumber
                v-model="planForm.trialDays"
                :min="0"
                :max="365"
                class="wide" /></ElFormItem></ElCol></ElRow
        ><ElSpace wrap
          ><ElCheckbox v-model="planForm.imageAccess">{{ xt('图片生成') }}</ElCheckbox
          ><ElCheckbox v-model="planForm.videoAccess">{{ xt('视频生成') }}</ElCheckbox
          ><ElCheckbox v-model="planForm.commerceAccess">{{ xt('商品视觉') }}</ElCheckbox
          ><ElCheckbox v-model="planForm.apiAccess">{{ xt('API 访问') }}</ElCheckbox
          ><ElCheckbox v-model="planForm.batchAccess">{{ xt('批量任务') }}</ElCheckbox
          ><ElCheckbox v-model="planForm.allowByok">{{ xt('允许 BYOK') }}</ElCheckbox
          ><ElCheckbox v-model="planForm.recommended">{{ xt('推荐套餐') }}</ElCheckbox
          ><ElCheckbox v-model="planForm.enabled">{{ xt('上架销售') }}</ElCheckbox></ElSpace
        ></ElForm
      >
      <template #footer
        ><ElButton @click="planDialog = false">{{ xt('取消') }}</ElButton
        ><ElButton type="primary" :loading="saving" @click="savePlan">{{
          xt('保存套餐')
        }}</ElButton></template
      >
    </ElDialog>

    <ElDialog v-model="grantDialog" :title="xt('手动开通订阅')" width="520px"
      ><ElForm label-position="top"
        ><ElFormItem :label="xt('选择用户')"
          ><ElSelect v-model="grantForm.userId" filterable class="wide"
            ><ElOption
              v-for="user in users"
              :key="user.id"
              :value="user.id"
              :label="`${user.displayName} · ${user.email || xt('无邮箱')}`" /></ElSelect></ElFormItem
        ><ElFormItem :label="xt('订阅套餐')"
          ><ElSelect v-model="grantForm.planId" class="wide"
            ><ElOption
              v-for="plan in plans"
              :key="plan.id"
              :value="plan.id"
              :label="plan.name" /></ElSelect></ElFormItem
        ><ElFormItem :label="xt('有效天数（留空按套餐周期）')"
          ><ElInputNumber
            v-model="grantForm.days"
            :min="1"
            :max="3650"
            class="wide" /></ElFormItem></ElForm
      ><template #footer
        ><ElButton @click="grantDialog = false">{{ xt('取消') }}</ElButton
        ><ElButton type="primary" :loading="saving" @click="grant">{{
          xt('确认开通')
        }}</ElButton></template
      ></ElDialog
    >
  </div>
</template>

<script setup lang="ts">
  import { ElMessage, ElMessageBox } from 'element-plus'
  import {
    xinyueApi,
    type AdminUser,
    type SubscriptionOrder,
    type SubscriptionPlan,
    type UserSubscription
  } from '@/api/xinyue'
  import { xinyueLocale, xinyueText as xt } from '@/locales/xinyue'
  defineOptions({ name: 'XinyueSubscriptions' })
  type Cycle = SubscriptionPlan['billingCycle']
  const cycleText: Record<Cycle, string> = {
    MONTHLY: '月付',
    QUARTERLY: '季付',
    YEARLY: '年付',
    ONE_TIME: '一次性'
  }
  const cycleShort: Record<Cycle, string> = {
    MONTHLY: '月',
    QUARTERLY: '季',
    YEARLY: '年',
    ONE_TIME: '次'
  }
  const statusText: Record<string, string> = {
    PENDING: '待支付',
    PAID: '已支付',
    CANCELLED: '已取消',
    REFUNDED: '已退款'
  }
  const emptyPlan = () => ({
    id: '',
    code: '',
    name: '',
    description: '',
    billingCycle: 'MONTHLY' as Cycle,
    priceCents: 0,
    originalPriceCents: 0,
    currency: 'CNY',
    includedCredits: 0,
    trialDays: 0,
    concurrency: 1,
    allowByok: true,
    apiAccess: false,
    imageAccess: true,
    videoAccess: false,
    commerceAccess: false,
    batchAccess: false,
    enabled: true,
    recommended: false,
    sortOrder: 0
  })
  const plans = ref<SubscriptionPlan[]>([])
  const subscriptions = ref<UserSubscription[]>([])
  const orders = ref<SubscriptionOrder[]>([])
  const users = ref<AdminUser[]>([])
  const loading = ref(false)
  const saving = ref(false)
  const tab = ref('plans')
  const planDialog = ref(false)
  const grantDialog = ref(false)
  const planForm = reactive(emptyPlan())
  const grantForm = reactive<{ userId: string; planId: string; days?: number }>({
    userId: '',
    planId: '',
    days: undefined
  })
  const money = (cents: number, currency = 'CNY') =>
    new Intl.NumberFormat(xinyueLocale(), { style: 'currency', currency }).format(cents / 100)
  const date = (value?: string | null) =>
    value
      ? new Intl.DateTimeFormat(xinyueLocale(), { dateStyle: 'medium', timeStyle: 'short' }).format(
          new Date(value)
        )
      : xt('长期有效')
  const statusType = (status: string) =>
    status === 'PAID'
      ? 'success'
      : status === 'PENDING'
        ? 'warning'
        : status === 'CANCELLED'
          ? 'info'
          : 'danger'
  async function load() {
    loading.value = true
    try {
      ;[plans.value, subscriptions.value, orders.value, users.value] = await Promise.all([
        xinyueApi.plans(),
        xinyueApi.subscriptions(),
        xinyueApi.subscriptionOrders(),
        xinyueApi.users()
      ])
    } finally {
      loading.value = false
    }
  }
  function openCreate() {
    Object.assign(planForm, emptyPlan(), { sortOrder: plans.value.length * 10 })
    planDialog.value = true
  }
  function openEdit(row: SubscriptionPlan) {
    Object.assign(planForm, emptyPlan(), row, { originalPriceCents: row.originalPriceCents || 0 })
    planDialog.value = true
  }
  async function savePlan() {
    if (!planForm.code || !planForm.name) return ElMessage.warning(xt('请填写套餐代码和名称'))
    saving.value = true
    try {
      const body = {
        code: planForm.code,
        name: planForm.name,
        description: planForm.description,
        billingCycle: planForm.billingCycle,
        priceCents: planForm.priceCents,
        originalPriceCents: planForm.originalPriceCents || undefined,
        currency: planForm.currency,
        includedCredits: planForm.includedCredits,
        trialDays: planForm.trialDays,
        concurrency: planForm.concurrency,
        allowByok: planForm.allowByok,
        apiAccess: planForm.apiAccess,
        imageAccess: planForm.imageAccess,
        videoAccess: planForm.videoAccess,
        commerceAccess: planForm.commerceAccess,
        batchAccess: planForm.batchAccess,
        enabled: planForm.enabled,
        recommended: planForm.recommended,
        sortOrder: planForm.sortOrder
      }
      await xinyueApi.savePlan(body, planForm.id || undefined)
      planDialog.value = false
      await load()
    } finally {
      saving.value = false
    }
  }
  async function removePlan(row: SubscriptionPlan) {
    await ElMessageBox.confirm(`${xt('确认删除或下架')} "${row.name}"?`, xt('套餐操作'), {
      type: 'warning'
    })
    await xinyueApi.deletePlan(row.id)
    await load()
  }
  async function grant() {
    if (!grantForm.userId || !grantForm.planId) return ElMessage.warning(xt('请选择用户和套餐'))
    saving.value = true
    try {
      await xinyueApi.grantSubscription({ ...grantForm, days: grantForm.days || undefined })
      grantDialog.value = false
      tab.value = 'active'
      await load()
    } finally {
      saving.value = false
    }
  }
  async function terminate(row: UserSubscription) {
    await ElMessageBox.confirm(
      `${xt('确认终止')} ${row.user.displayName} / ${row.plan.name}?`,
      xt('终止订阅'),
      { type: 'warning' }
    )
    await xinyueApi.terminateSubscription(row.id)
    await load()
  }
  async function markPaid(row: SubscriptionOrder) {
    await ElMessageBox.confirm(`${xt('确认订单')} ${row.id} ${xt('已到账？')}`, xt('人工确认到账'))
    await xinyueApi.markSubscriptionPaid(row.id)
    await load()
  }
  async function cancelOrder(row: SubscriptionOrder) {
    await ElMessageBox.confirm(`${xt('确认取消订单')} ${row.id}?`, xt('取消订单'), {
      type: 'warning'
    })
    await xinyueApi.cancelSubscriptionOrder(row.id)
    await load()
  }
  onMounted(load)
</script>

<style scoped>
  .xinyue-page {
    display: flex;
    flex-direction: column;
    gap: 12px;
    height: 100%;
  }

  .page-title {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .page-title h1 {
    margin: 0 0 4px;
    font-size: 22px;
  }

  .page-title p,
  .note {
    display: block;
    margin: 3px 0 0;
    font-size: 12px;
    color: var(--art-gray-500);
  }

  .business-tabs {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: 0;
  }

  .business-tabs :deep(.el-tabs__content),
  .business-tabs :deep(.el-tab-pane) {
    height: 100%;
    min-height: 0;
  }

  .plan-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(270px, 1fr));
    gap: 14px;
  }

  .plan-grid article {
    display: grid;
    gap: 13px;
    padding: 18px;
    background: var(--art-main-bg-color);
    border: 1px solid var(--art-gray-200);
    border-radius: 7px;
  }

  .plan-grid article.recommended {
    border-color: var(--main-color);
  }

  .plan-grid article.disabled {
    opacity: 0.62;
  }

  .plan-grid header,
  .plan-grid footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .plan-grid header > div {
    display: grid;
    gap: 3px;
  }

  .plan-grid header small,
  .plan-grid h2 small,
  .plan-grid p,
  .plan-grid dt {
    font-size: 12px;
    color: var(--art-gray-500);
  }

  .plan-grid h2 {
    margin: 0;
    font-size: 24px;
  }

  .plan-grid p {
    min-height: 34px;
    margin: 0;
  }

  .plan-grid dl {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin: 0;
  }

  .plan-grid dl div {
    display: grid;
    gap: 2px;
  }

  .plan-grid dd {
    margin: 0;
    font-weight: 600;
  }

  .wide {
    width: 100%;
  }
</style>
