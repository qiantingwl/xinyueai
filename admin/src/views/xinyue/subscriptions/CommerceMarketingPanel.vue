<template>
  <section class="marketing-panel">
    <header class="marketing-toolbar">
      <div>
        <strong>{{ section === 'promotions' ? '限时促销' : '优惠券运营' }}</strong>
        <span>{{
          section === 'promotions'
            ? '活动价按时间自动生效，订单保存成交快照。'
            : '支持公开领取、定向发放、门槛、封顶和活动叠加规则。'
        }}</span>
      </div>
      <ElSpace>
        <ElButton :loading="loading" @click="load"
          ><ArtSvgIcon icon="ri:refresh-line" />刷新</ElButton
        >
        <ElButton v-if="section === 'coupons'" @click="grantDialog = true"
          ><ArtSvgIcon icon="ri:user-shared-line" />定向发券</ElButton
        >
        <ElButton type="primary" @click="openCreate"
          ><ArtSvgIcon icon="ri:add-line" />{{
            section === 'promotions' ? '新增活动' : '新增优惠券'
          }}</ElButton
        >
      </ElSpace>
    </header>

    <div v-loading="loading" class="marketing-grid">
      <article
        v-for="item in section === 'promotions' ? promotions : coupons"
        :key="item.id"
        :class="{ disabled: !item.enabled }"
      >
        <template v-if="section === 'promotions'">
          <header
            ><div
              ><strong>{{ (item as PromotionCampaign).name }}</strong
              ><small>{{ (item as PromotionCampaign).label || '未设置前台标签' }}</small></div
            ><ElTag :type="campaignState(item as PromotionCampaign).type">{{
              campaignState(item as PromotionCampaign).text
            }}</ElTag></header
          >
          <p
            ><ArtSvgIcon icon="ri:calendar-event-line" />{{
              date((item as PromotionCampaign).startsAt)
            }}
            至 {{ date((item as PromotionCampaign).endsAt) }}</p
          >
          <dl
            ><div v-for="product in (item as PromotionCampaign).products" :key="product.planId"
              ><dt>{{ product.plan.name }}</dt
              ><dd
                ><del>{{ money(product.plan.priceCents) }}</del
                >{{ money(product.promotionalPriceCents) }}</dd
              ></div
            ></dl
          >
          <footer
            ><span>成交 {{ (item as PromotionCampaign)._count.orders }} 单</span
            ><div
              ><ElButton link type="primary" @click="openPromotion(item as PromotionCampaign)"
                >编辑</ElButton
              ><ElButton link type="danger" @click="removePromotion(item as PromotionCampaign)"
                >删除</ElButton
              ></div
            ></footer
          >
        </template>
        <template v-else>
          <header
            ><div
              ><strong>{{ (item as CouponTemplate).name }}</strong
              ><small>{{ (item as CouponTemplate).code }}</small></div
            ><ElTag :type="(item as CouponTemplate).enabled ? 'success' : 'info'">{{
              (item as CouponTemplate).enabled ? '启用' : '停用'
            }}</ElTag></header
          >
          <h3>{{ couponValue(item as CouponTemplate) }}</h3
          ><p>{{ (item as CouponTemplate).description || '暂无使用说明' }}</p>
          <dl
            ><div
              ><dt>使用门槛</dt
              ><dd>{{
                (item as CouponTemplate).minimumSpendCents
                  ? `满 ${money((item as CouponTemplate).minimumSpendCents)}`
                  : '无门槛'
              }}</dd></div
            ><div
              ><dt>适用套餐</dt
              ><dd>{{
                (item as CouponTemplate).products.length
                  ? (item as CouponTemplate).products.map((row) => row.plan.name).join('、')
                  : '全部套餐'
              }}</dd></div
            ><div
              ><dt>领取 / 核销</dt
              ><dd
                >{{ (item as CouponTemplate).issuedCount }} /
                {{ (item as CouponTemplate).redeemedCount }}</dd
              ></div
            ><div
              ><dt>活动叠加</dt
              ><dd>{{ (item as CouponTemplate).stackWithPromotion ? '允许' : '择优使用' }}</dd></div
            ></dl
          >
          <footer
            ><span>{{ (item as CouponTemplate).claimEnabled ? '用户可领取' : '仅定向发放' }}</span
            ><div
              ><ElButton link type="primary" @click="openCoupon(item as CouponTemplate)"
                >编辑</ElButton
              ><ElButton link type="danger" @click="removeCoupon(item as CouponTemplate)"
                >删除</ElButton
              ></div
            ></footer
          >
        </template>
      </article>
      <ElEmpty
        v-if="!(section === 'promotions' ? promotions.length : coupons.length)"
        :description="section === 'promotions' ? '暂无促销活动' : '暂无优惠券模板'"
      />
    </div>

    <ElDialog
      v-model="promotionDialog"
      :title="promotionForm.id ? '编辑促销活动' : '新增促销活动'"
      width="680px"
    >
      <ElForm label-position="top">
        <ElRow :gutter="14"
          ><ElCol :span="14"
            ><ElFormItem label="活动名称"
              ><ElInput
                v-model.trim="promotionForm.name"
                placeholder="暑期会员特惠" /></ElFormItem></ElCol
          ><ElCol :span="10"
            ><ElFormItem label="前台标签"
              ><ElInput
                v-model.trim="promotionForm.label"
                placeholder="限时优惠" /></ElFormItem></ElCol
        ></ElRow>
        <ElFormItem label="有效时间"
          ><ElDatePicker
            v-model="promotionForm.range"
            type="datetimerange"
            start-placeholder="开始时间"
            end-placeholder="结束时间"
            class="wide"
        /></ElFormItem>
        <ElFormItem label="参与套餐"
          ><ElSelect
            v-model="promotionForm.planIds"
            multiple
            class="wide"
            placeholder="选择一个或多个套餐"
            ><ElOption
              v-for="plan in plans.filter((row) => row.priceCents > 0)"
              :key="plan.id"
              :label="`${plan.name} · ${money(plan.priceCents)}`"
              :value="plan.id" /></ElSelect
        ></ElFormItem>
        <div class="price-list"
          ><label v-for="planId in promotionForm.planIds" :key="planId"
            ><span
              >{{ planName(planId) }}<small>日常价 {{ money(planPrice(planId)) }}</small></span
            ><ElInputNumber
              v-model="promotionForm.prices[planId]"
              :min="1"
              :max="Math.max(1, planPrice(planId) - 1)"
            /><em>分</em></label
          ></div
        >
        <ElCheckbox v-model="promotionForm.enabled">立即启用</ElCheckbox>
      </ElForm>
      <template #footer
        ><ElButton @click="promotionDialog = false">取消</ElButton
        ><ElButton type="primary" :loading="saving" @click="savePromotion"
          >保存活动</ElButton
        ></template
      >
    </ElDialog>

    <ElDialog
      v-model="couponDialog"
      :title="couponForm.id ? '编辑优惠券' : '新增优惠券'"
      width="720px"
    >
      <ElForm label-position="top">
        <ElRow :gutter="14"
          ><ElCol :span="12"
            ><ElFormItem label="优惠券名称"
              ><ElInput
                v-model.trim="couponForm.name"
                placeholder="新用户立减券" /></ElFormItem></ElCol
          ><ElCol :span="12"
            ><ElFormItem label="券代码"
              ><ElInput
                v-model.trim="couponForm.code"
                placeholder="WELCOME20" /></ElFormItem></ElCol
        ></ElRow>
        <ElFormItem label="使用说明"
          ><ElInput v-model.trim="couponForm.description" type="textarea" :rows="2"
        /></ElFormItem>
        <ElRow :gutter="14"
          ><ElCol :span="8"
            ><ElFormItem label="优惠类型"
              ><ElSelect v-model="couponForm.discountType" class="wide"
                ><ElOption label="固定金额" value="FIXED" /><ElOption
                  label="折扣比例"
                  value="PERCENT" /></ElSelect></ElFormItem></ElCol
          ><ElCol :span="8"
            ><ElFormItem
              :label="couponForm.discountType === 'FIXED' ? '优惠金额（分）' : '折扣比例（%）'"
              ><ElInputNumber
                v-model="couponForm.discountValue"
                :min="couponForm.discountType === 'FIXED' ? 1 : 0.01"
                :max="couponForm.discountType === 'FIXED' ? 100000000 : 100"
                :precision="couponForm.discountType === 'PERCENT' ? 2 : 0"
                class="wide" /></ElFormItem></ElCol
          ><ElCol :span="8"
            ><ElFormItem label="最低消费（分）"
              ><ElInputNumber
                v-model="couponForm.minimumSpendCents"
                :min="0"
                class="wide" /></ElFormItem></ElCol
        ></ElRow>
        <ElRow :gutter="14"
          ><ElCol :span="8"
            ><ElFormItem label="发行总量"
              ><ElInputNumber
                v-model="couponForm.totalLimit"
                :min="1"
                class="wide"
                placeholder="不限制" /></ElFormItem></ElCol
          ><ElCol :span="8"
            ><ElFormItem label="每人限领"
              ><ElInputNumber
                v-model="couponForm.perUserLimit"
                :min="1"
                :max="1000"
                class="wide" /></ElFormItem></ElCol
          ><ElCol :span="8"
            ><ElFormItem label="领取后有效天数"
              ><ElInputNumber
                v-model="couponForm.validDays"
                :min="1"
                :max="3650"
                class="wide"
                placeholder="跟随活动期" /></ElFormItem></ElCol
        ></ElRow>
        <ElFormItem label="领取与使用期限"
          ><ElDatePicker
            v-model="couponForm.range"
            type="datetimerange"
            start-placeholder="可选开始时间"
            end-placeholder="可选结束时间"
            class="wide"
        /></ElFormItem>
        <ElFormItem label="适用套餐"
          ><ElSelect
            v-model="couponForm.planIds"
            multiple
            clearable
            class="wide"
            placeholder="留空表示全部套餐"
            ><ElOption
              v-for="plan in plans"
              :key="plan.id"
              :label="plan.name"
              :value="plan.id" /></ElSelect
        ></ElFormItem>
        <ElSpace wrap
          ><ElCheckbox v-model="couponForm.stackWithPromotion">可叠加活动价</ElCheckbox
          ><ElCheckbox v-model="couponForm.claimEnabled">允许用户领取</ElCheckbox
          ><ElCheckbox v-model="couponForm.enabled">启用模板</ElCheckbox></ElSpace
        >
      </ElForm>
      <template #footer
        ><ElButton @click="couponDialog = false">取消</ElButton
        ><ElButton type="primary" :loading="saving" @click="saveCoupon"
          >保存优惠券</ElButton
        ></template
      >
    </ElDialog>

    <ElDialog v-model="grantDialog" title="定向发放优惠券" width="500px"
      ><ElForm label-position="top"
        ><ElFormItem label="用户"
          ><ElSelect v-model="grantForm.userId" filterable class="wide"
            ><ElOption
              v-for="user in users"
              :key="user.id"
              :label="`${user.displayName} · ${user.email || '无邮箱'}`"
              :value="user.id" /></ElSelect></ElFormItem
        ><ElFormItem label="优惠券模板"
          ><ElSelect v-model="grantForm.templateId" class="wide"
            ><ElOption
              v-for="coupon in coupons.filter((row) => row.enabled)"
              :key="coupon.id"
              :label="`${coupon.name} · ${coupon.code}`"
              :value="coupon.id" /></ElSelect></ElFormItem></ElForm
      ><template #footer
        ><ElButton @click="grantDialog = false">取消</ElButton
        ><ElButton type="primary" :loading="saving" @click="grantCoupon"
          >确认发放</ElButton
        ></template
      ></ElDialog
    >
  </section>
</template>

<script setup lang="ts">
  import { ElMessage, ElMessageBox } from 'element-plus'
  import type { AdminUser } from '@/api/xinyue/customers'
  import {
    subscriptionApi as xinyueApi,
    type CouponTemplate,
    type PromotionCampaign,
    type SubscriptionPlan
  } from '@/api/xinyue/subscriptions'
  import { useXinyueAsync } from '@/hooks'
  import { formatDateTime, formatMoneyCents } from '@/utils/xinyue/formatters'

  const props = defineProps<{
    section: 'promotions' | 'coupons'
    plans: SubscriptionPlan[]
    users: AdminUser[]
  }>()
  const { loading, saving, withLoading, withSaving } = useXinyueAsync()
  const promotionDialog = ref(false),
    couponDialog = ref(false),
    grantDialog = ref(false)
  const promotions = ref<PromotionCampaign[]>([]),
    coupons = ref<CouponTemplate[]>([])
  const plans = computed(() => props.plans),
    users = computed(() => props.users)
  const emptyPromotion = () => ({
    id: '',
    name: '',
    label: '',
    enabled: true,
    range: [] as Date[],
    planIds: [] as string[],
    prices: {} as Record<string, number>
  })
  const emptyCoupon = () => ({
    id: '',
    code: '',
    name: '',
    description: '',
    discountType: 'FIXED' as 'FIXED' | 'PERCENT',
    discountValue: 100,
    minimumSpendCents: 0,
    maximumDiscountCents: undefined as number | undefined,
    stackWithPromotion: true,
    claimEnabled: true,
    enabled: true,
    totalLimit: undefined as number | undefined,
    perUserLimit: 1,
    validDays: undefined as number | undefined,
    range: [] as Date[],
    planIds: [] as string[]
  })
  const promotionForm = reactive(emptyPromotion()),
    couponForm = reactive(emptyCoupon()),
    grantForm = reactive({ userId: '', templateId: '' })
  const money = (cents: number) => formatMoneyCents(cents)
  const date = (value: string) => formatDateTime(value)
  const planName = (id: string) => plans.value.find((row) => row.id === id)?.name || id
  const planPrice = (id: string) => plans.value.find((row) => row.id === id)?.priceCents || 0
  const couponValue = (row: CouponTemplate) =>
    row.discountType === 'FIXED'
      ? `立减 ${money(row.discountValue)}`
      : `优惠 ${(row.discountValue / 100).toFixed(row.discountValue % 100 ? 2 : 0)}%`
  const campaignState = (row: PromotionCampaign) =>
    !row.enabled
      ? { text: '停用', type: 'info' as const }
      : new Date(row.startsAt) > new Date()
        ? { text: '未开始', type: 'warning' as const }
        : new Date(row.endsAt) <= new Date()
          ? { text: '已结束', type: 'info' as const }
          : { text: '进行中', type: 'success' as const }
  async function load() {
    await withLoading(async () => {
      if (props.section === 'promotions') promotions.value = await xinyueApi.promotions()
      else coupons.value = await xinyueApi.couponTemplates()
    })
  }
  function openCreate() {
    if (props.section === 'promotions') {
      Object.assign(promotionForm, emptyPromotion())
      promotionDialog.value = true
    } else {
      Object.assign(couponForm, emptyCoupon())
      couponDialog.value = true
    }
  }
  function openPromotion(row: PromotionCampaign) {
    Object.assign(promotionForm, emptyPromotion(), {
      id: row.id,
      name: row.name,
      label: row.label,
      enabled: row.enabled,
      range: [new Date(row.startsAt), new Date(row.endsAt)],
      planIds: row.products.map((item) => item.planId),
      prices: Object.fromEntries(
        row.products.map((item) => [item.planId, item.promotionalPriceCents])
      )
    })
    promotionDialog.value = true
  }
  function openCoupon(row: CouponTemplate) {
    Object.assign(couponForm, emptyCoupon(), {
      ...row,
      discountValue: row.discountType === 'PERCENT' ? row.discountValue / 100 : row.discountValue,
      range: row.startsAt && row.endsAt ? [new Date(row.startsAt), new Date(row.endsAt)] : [],
      planIds: row.products.map((item) => item.planId),
      totalLimit: row.totalLimit || undefined,
      validDays: row.validDays || undefined
    })
    couponDialog.value = true
  }
  async function savePromotion() {
    if (!promotionForm.name || promotionForm.range.length !== 2 || !promotionForm.planIds.length)
      return ElMessage.warning('请填写活动名称、时间和参与套餐')
    await withSaving(async () => {
      await xinyueApi.savePromotion(
        {
          name: promotionForm.name,
          label: promotionForm.label,
          enabled: promotionForm.enabled,
          startsAt: promotionForm.range[0].toISOString(),
          endsAt: promotionForm.range[1].toISOString(),
          products: promotionForm.planIds.map((planId) => ({
            planId,
            promotionalPriceCents: promotionForm.prices[planId] || 0
          }))
        },
        promotionForm.id || undefined
      )
      promotionDialog.value = false
      await load()
    })
  }
  async function saveCoupon() {
    if (!couponForm.name || !couponForm.code) return ElMessage.warning('请填写优惠券名称和代码')
    await withSaving(async () => {
      await xinyueApi.saveCouponTemplate(
        {
          code: couponForm.code,
          name: couponForm.name,
          description: couponForm.description,
          discountType: couponForm.discountType,
          discountValue:
            couponForm.discountType === 'PERCENT'
              ? Math.round(couponForm.discountValue * 100)
              : Math.round(couponForm.discountValue),
          minimumSpendCents: couponForm.minimumSpendCents,
          maximumDiscountCents: couponForm.maximumDiscountCents,
          stackWithPromotion: couponForm.stackWithPromotion,
          claimEnabled: couponForm.claimEnabled,
          enabled: couponForm.enabled,
          totalLimit: couponForm.totalLimit,
          perUserLimit: couponForm.perUserLimit,
          validDays: couponForm.validDays,
          startsAt: couponForm.range[0]?.toISOString(),
          endsAt: couponForm.range[1]?.toISOString(),
          planIds: couponForm.planIds
        },
        couponForm.id || undefined
      )
      couponDialog.value = false
      await load()
    })
  }
  async function removePromotion(row: PromotionCampaign) {
    await ElMessageBox.confirm(`确认删除或停用“${row.name}”？`, '促销活动', { type: 'warning' })
    await xinyueApi.deletePromotion(row.id)
    await load()
  }
  async function removeCoupon(row: CouponTemplate) {
    await ElMessageBox.confirm(`确认删除或停用“${row.name}”？已发放的券不会丢失。`, '优惠券模板', {
      type: 'warning'
    })
    await xinyueApi.deleteCouponTemplate(row.id)
    await load()
  }
  async function grantCoupon() {
    if (!grantForm.userId || !grantForm.templateId) return ElMessage.warning('请选择用户和优惠券')
    await withSaving(async () => {
      await xinyueApi.grantCoupon(grantForm)
      grantDialog.value = false
      Object.assign(grantForm, { userId: '', templateId: '' })
      await load()
    })
  }
  onMounted(load)
</script>

<style scoped>
  .marketing-panel {
    display: flex;
    flex-direction: column;
    gap: 14px;
    min-height: 0;
  }
  .marketing-toolbar {
    align-items: center;
    display: flex;
    justify-content: space-between;
  }
  .marketing-toolbar > div {
    display: grid;
    gap: 3px;
  }
  .marketing-toolbar strong {
    font-size: 15px;
  }
  .marketing-toolbar span,
  .marketing-grid small,
  .marketing-grid p,
  .marketing-grid footer {
    color: var(--art-gray-500);
    font-size: 12px;
  }
  .marketing-grid {
    display: grid;
    gap: 14px;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    overflow: auto;
    padding: 2px;
  }
  .marketing-grid article {
    background: var(--art-main-bg-color);
    border: 1px solid var(--art-gray-200);
    border-radius: 7px;
    display: grid;
    gap: 13px;
    padding: 17px;
  }
  .marketing-grid article.disabled {
    opacity: 0.64;
  }
  .marketing-grid article > header,
  .marketing-grid article > footer,
  .price-list label {
    align-items: center;
    display: flex;
    justify-content: space-between;
  }
  .marketing-grid article > header > div {
    display: grid;
    gap: 3px;
  }
  .marketing-grid article p {
    align-items: center;
    display: flex;
    gap: 6px;
    margin: 0;
  }
  .marketing-grid article h3 {
    font-size: 22px;
    margin: 0;
  }
  .marketing-grid dl {
    display: grid;
    gap: 8px;
    grid-template-columns: 1fr 1fr;
    margin: 0;
  }
  .marketing-grid dl div {
    display: grid;
    gap: 2px;
    min-width: 0;
  }
  .marketing-grid dt {
    color: var(--art-gray-500);
    font-size: 12px;
  }
  .marketing-grid dd {
    font-size: 13px;
    font-weight: 600;
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .marketing-grid dd del {
    color: var(--art-gray-400);
    font-weight: 400;
    margin-right: 7px;
  }
  .price-list {
    display: grid;
    gap: 8px;
    margin: -4px 0 14px;
  }
  .price-list label {
    background: var(--art-gray-100);
    border-radius: 6px;
    padding: 9px 10px;
  }
  .price-list label > span {
    display: grid;
    font-size: 13px;
  }
  .price-list small {
    color: var(--art-gray-500);
    font-size: 11px;
  }
  .price-list .el-input-number {
    margin-left: auto;
    width: 150px;
  }
  .price-list em {
    font-size: 12px;
    font-style: normal;
    margin-left: 6px;
  }
  .wide {
    width: 100%;
  }
  @media (max-width: 760px) {
    .marketing-toolbar {
      align-items: flex-start;
      flex-direction: column;
      gap: 10px;
    }
    .marketing-grid {
      grid-template-columns: 1fr;
    }
    .marketing-grid dl {
      grid-template-columns: 1fr;
    }
    .price-list label {
      align-items: flex-start;
      flex-wrap: wrap;
    }
    .price-list .el-input-number {
      margin: 7px 0 0;
      width: calc(100% - 24px);
    }
  }
</style>
