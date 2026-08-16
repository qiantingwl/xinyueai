<template>
  <div class="xinyue-page">
    <header class="page-title"
      ><div
        ><h1>{{ xt('商业化中心') }}</h1
        ><p>{{ xt('充值商品、支付渠道、交易订单和兑换码集中管理') }}</p></div
      ><ElButton :loading="loading" @click="load"
        ><ArtSvgIcon icon="ri:refresh-line" />{{ xt('刷新') }}</ElButton
      ></header
    >
    <ElTabs v-model="tab" class="business-tabs">
      <ElTabPane :label="xt('充值商品')" name="packages">
        <div class="pane-action"
          ><span>{{ packages.length }} {{ xt('个充值档位') }}</span
          ><ElButton type="primary" @click="openPackage()"
            ><ArtSvgIcon icon="ri:add-line" />{{ xt('新增商品') }}</ElButton
          ></div
        >
        <ElCard shadow="never" class="art-table-card"
          ><ElTable v-loading="loading" :data="packages" height="100%"
            ><ElTableColumn :label="xt('商品')" min-width="220"
              ><template #default="{ row }"
                ><strong>{{ row.name }}</strong
                ><ElTag v-if="row.recommended" size="small" type="warning" class="inline-tag">{{
                  xt('推荐')
                }}</ElTag
                ><small class="note">{{ row.description || xt('暂无商品说明') }}</small></template
              ></ElTableColumn
            ><ElTableColumn :label="xt('创作点')" width="120"
              ><template #default="{ row }"
                ><strong>{{ row.credits }} {{ xt('点') }}</strong></template
              ></ElTableColumn
            ><ElTableColumn :label="xt('价格')" width="140"
              ><template #default="{ row }"
                ><strong>{{ money(row.priceCents) }}</strong
                ><small v-if="row.originalPriceCents" class="note line-through">{{
                  money(row.originalPriceCents)
                }}</small></template
              ></ElTableColumn
            ><ElTableColumn :label="xt('排序')" width="80" prop="sortOrder" /><ElTableColumn
              :label="xt('状态')"
              width="100"
              ><template #default="{ row }"
                ><ElTag :type="row.enabled ? 'success' : 'info'">{{
                  row.enabled ? xt('出售中') : xt('已下架')
                }}</ElTag></template
              ></ElTableColumn
            ><ElTableColumn :label="xt('操作')" width="140"
              ><template #default="{ row }"
                ><ElButton link type="primary" @click="openPackage(row)">{{ xt('编辑') }}</ElButton
                ><ElButton link type="danger" @click="removePackage(row)">{{
                  xt('删除')
                }}</ElButton></template
              ></ElTableColumn
            ></ElTable
          ></ElCard
        >
      </ElTabPane>

      <ElTabPane :label="xt('支付渠道')" name="channels">
        <div class="pane-action"
          ><span>{{ xt('支持人工收款、易支付、Stripe 和外部收银台') }}</span
          ><ElButton type="primary" @click="openChannel()"
            ><ArtSvgIcon icon="ri:add-line" />{{ xt('新增渠道') }}</ElButton
          ></div
        >
        <ElCard shadow="never" class="art-table-card"
          ><ElTable v-loading="loading" :data="channels" height="100%"
            ><ElTableColumn :label="xt('渠道')" min-width="210"
              ><template #default="{ row }"
                ><strong>{{ row.name }}</strong
                ><ElTag v-if="row.isDefault" size="small" type="success" class="inline-tag">{{
                  xt('默认')
                }}</ElTag
                ><small class="note"
                  >{{ xt(providerText[row.providerKey] || row.providerKey) }} ·
                  {{ row._count?.transactions || 0 }} {{ xt('笔交易') }}</small
                ></template
              ></ElTableColumn
            ><ElTableColumn :label="xt('支付方式')" min-width="180"
              ><template #default="{ row }"
                ><ElSpace wrap
                  ><ElTag
                    v-for="method in row.supportedMethods"
                    :key="method"
                    size="small"
                    effect="plain"
                    >{{ xt(methodText[method] || method) }}</ElTag
                  ></ElSpace
                ></template
              ></ElTableColumn
            ><ElTableColumn :label="xt('费率 / 限额')" min-width="170"
              ><template #default="{ row }"
                >{{ (row.feeRateBps / 100).toFixed(2) }}%<small class="note"
                  >{{ xt('最低') }} {{ money(row.minAmountCents) }}</small
                ></template
              ></ElTableColumn
            ><ElTableColumn :label="xt('健康状态')" width="115"
              ><template #default="{ row }"
                ><ElTooltip :content="row.lastError || xt('配置检测结果')"
                  ><ElTag
                    :type="
                      row.lastHealthStatus === 'healthy'
                        ? 'success'
                        : row.lastHealthStatus === 'invalid'
                          ? 'danger'
                          : 'info'
                    "
                    >{{ xt(healthText[row.lastHealthStatus] || '未检测') }}</ElTag
                  ></ElTooltip
                ></template
              ></ElTableColumn
            ><ElTableColumn :label="xt('状态')" width="90"
              ><template #default="{ row }"
                ><ElTag :type="row.enabled ? 'success' : 'info'">{{
                  row.enabled ? xt('启用') : xt('停用')
                }}</ElTag></template
              ></ElTableColumn
            ><ElTableColumn :label="xt('操作')" width="190"
              ><template #default="{ row }"
                ><ElButton link type="primary" @click="checkChannel(row)">{{ xt('检测') }}</ElButton
                ><ElButton link @click="openChannel(row)">{{ xt('编辑') }}</ElButton
                ><ElButton link type="danger" @click="removeChannel(row)">{{
                  xt('删除')
                }}</ElButton></template
              ></ElTableColumn
            ></ElTable
          ></ElCard
        >
      </ElTabPane>

      <ElTabPane :label="`${xt('支付交易')} ${transactions.length}`" name="transactions">
        <ElCard shadow="never" class="filter-card"
          ><ElForm :inline="true"
            ><ElFormItem
              ><ElInput
                v-model.trim="filters.q"
                clearable
                :placeholder="xt('订单号、用户或平台流水')" /></ElFormItem
            ><ElFormItem
              ><ElSelect v-model="filters.status" clearable :placeholder="xt('交易状态')"
                ><ElOption
                  v-for="status in transactionStatuses"
                  :key="status"
                  :label="xt(transactionStatusText[status])"
                  :value="status" /></ElSelect></ElFormItem
            ><ElFormItem
              ><ElSelect v-model="filters.channelId" clearable :placeholder="xt('支付渠道')"
                ><ElOption
                  v-for="channel in channels"
                  :key="channel.id"
                  :label="channel.name"
                  :value="channel.id" /></ElSelect></ElFormItem
            ><ElFormItem
              ><ElButton type="primary" @click="loadTransactions">{{ xt('查询') }}</ElButton
              ><ElButton @click="resetTransactions">{{ xt('重置') }}</ElButton></ElFormItem
            ></ElForm
          ></ElCard
        >
        <ElCard shadow="never" class="art-table-card"
          ><ElTable v-loading="loadingTransactions" :data="transactions" height="100%"
            ><ElTableColumn :label="xt('商户订单号')" min-width="220"
              ><template #default="{ row }"
                ><strong>{{ row.outTradeNo }}</strong
                ><small class="note">{{ date(row.createdAt) }}</small></template
              ></ElTableColumn
            ><ElTableColumn :label="xt('用户')" min-width="180"
              ><template #default="{ row }"
                ><strong>{{ row.user?.displayName || xt('未知用户') }}</strong
                ><small class="note">{{ row.user?.email || xt('未绑定邮箱') }}</small></template
              ></ElTableColumn
            ><ElTableColumn :label="xt('业务 / 渠道')" min-width="170"
              ><template #default="{ row }"
                >{{ row.orderType === 'SUBSCRIPTION' ? xt('订阅') : xt('充值')
                }}<small class="note"
                  >{{ row.channel?.name }} ·
                  {{ xt(methodText[row.paymentMethod] || row.paymentMethod) }}</small
                ></template
              ></ElTableColumn
            ><ElTableColumn :label="xt('金额')" width="120"
              ><template #default="{ row }"
                ><strong>{{ money(row.amountCents, row.currency) }}</strong></template
              ></ElTableColumn
            ><ElTableColumn :label="xt('状态')" width="105"
              ><template #default="{ row }"
                ><ElTooltip :content="row.failureReason || ''" :disabled="!row.failureReason"
                  ><ElTag :type="transactionType(row.status)">{{
                    xt(transactionStatusText[row.status] || row.status)
                  }}</ElTag></ElTooltip
                ></template
              ></ElTableColumn
            ><ElTableColumn :label="xt('操作')" width="110"
              ><template #default="{ row }"
                ><ElButton
                  v-if="row.status === 'PAID'"
                  link
                  type="primary"
                  @click="complete(row)"
                  >{{ xt('完成入账') }}</ElButton
                ><span v-else class="note">{{ xt('无需处理') }}</span></template
              ></ElTableColumn
            ></ElTable
          ></ElCard
        >
      </ElTabPane>

      <ElTabPane :label="xt('兑换码')" name="codes">
        <div class="pane-action"
          ><span>{{ xt('兑换码明文只在创建成功时展示一次') }}</span
          ><ElButton type="primary" @click="codeDialog = true"
            ><ArtSvgIcon icon="ri:add-line" />{{ xt('生成兑换码') }}</ElButton
          ></div
        >
        <ElCard shadow="never" class="art-table-card"
          ><ElTable v-loading="loading" :data="codes" height="100%"
            ><ElTableColumn :label="xt('批次名称')" min-width="200"
              ><template #default="{ row }"
                ><strong>{{ row.name }}</strong
                ><small class="note">{{ xt('前缀') }} {{ row.codePrefix }}</small></template
              ></ElTableColumn
            ><ElTableColumn :label="xt('面值')" width="110"
              ><template #default="{ row }"
                >{{ row.credits }} {{ xt('点') }}</template
              ></ElTableColumn
            ><ElTableColumn :label="xt('使用进度')" min-width="180"
              ><template #default="{ row }"
                ><ElProgress
                  :percentage="Math.round((row.usedCount / row.maxUses) * 100)"
                  :format="() => `${row.usedCount}/${row.maxUses}`" /></template></ElTableColumn
            ><ElTableColumn :label="xt('到期时间')" width="180"
              ><template #default="{ row }">{{
                row.expiresAt ? date(row.expiresAt) : xt('永久有效')
              }}</template></ElTableColumn
            ><ElTableColumn :label="xt('状态')" width="100"
              ><template #default="{ row }"
                ><ElTag :type="codeEnabled(row) ? 'success' : 'info'">{{
                  codeEnabled(row) ? xt('可使用') : xt('已停用')
                }}</ElTag></template
              ></ElTableColumn
            ><ElTableColumn :label="xt('操作')" width="100"
              ><template #default="{ row }"
                ><ElButton
                  link
                  :type="codeEnabled(row) ? 'danger' : 'primary'"
                  @click="toggleCode(row)"
                  >{{ codeEnabled(row) ? xt('停用') : xt('启用') }}</ElButton
                ></template
              ></ElTableColumn
            ></ElTable
          ></ElCard
        >
      </ElTabPane>
    </ElTabs>

    <ElDialog
      v-model="packageDialog"
      :title="xt(packageForm.id ? '编辑充值商品' : '新增充值商品')"
      width="600px"
      ><ElForm label-position="top"
        ><ElFormItem :label="xt('商品名称')"><ElInput v-model.trim="packageForm.name" /></ElFormItem
        ><ElFormItem :label="xt('商品说明')"
          ><ElInput v-model.trim="packageForm.description" type="textarea" :rows="2" /></ElFormItem
        ><ElRow :gutter="14"
          ><ElCol :span="8"
            ><ElFormItem :label="xt('创作点')"
              ><ElInputNumber
                v-model="packageForm.credits"
                :min="1"
                class="wide" /></ElFormItem></ElCol
          ><ElCol :span="8"
            ><ElFormItem :label="xt('售价（分）')"
              ><ElInputNumber
                v-model="packageForm.priceCents"
                :min="1"
                class="wide" /></ElFormItem></ElCol
          ><ElCol :span="8"
            ><ElFormItem :label="xt('划线价（分）')"
              ><ElInputNumber
                v-model="packageForm.originalPriceCents"
                :min="0"
                class="wide" /></ElFormItem></ElCol></ElRow
        ><ElSpace
          ><ElCheckbox v-model="packageForm.enabled">{{ xt('上架') }}</ElCheckbox
          ><ElCheckbox v-model="packageForm.recommended">{{ xt('推荐') }}</ElCheckbox></ElSpace
        ></ElForm
      ><template #footer
        ><ElButton @click="packageDialog = false">{{ xt('取消') }}</ElButton
        ><ElButton type="primary" :loading="saving" @click="savePackage">{{
          xt('保存商品')
        }}</ElButton></template
      ></ElDialog
    >

    <ElDrawer
      v-model="channelDrawer"
      :title="xt(channelForm.id ? '编辑支付渠道' : '新增支付渠道')"
      size="620px"
      ><ElForm label-position="top"
        ><ElRow :gutter="14"
          ><ElCol :span="12"
            ><ElFormItem :label="xt('渠道名称')"
              ><ElInput v-model.trim="channelForm.name" /></ElFormItem></ElCol
          ><ElCol :span="12"
            ><ElFormItem :label="xt('服务商')"
              ><ElSelect v-model="channelForm.providerKey" class="wide" @change="syncMethods"
                ><ElOption
                  v-for="(label, value) in providerText"
                  :key="value"
                  :value="value"
                  :label="xt(label)" /></ElSelect></ElFormItem></ElCol></ElRow
        ><ElFormItem :label="xt('支付方式')"
          ><ElCheckboxGroup v-model="channelForm.supportedMethods"
            ><ElCheckbox
              v-for="method in providerMethods[channelForm.providerKey]"
              :key="method"
              :value="method"
              >{{ xt(methodText[method]) }}</ElCheckbox
            ></ElCheckboxGroup
          ></ElFormItem
        ><template v-if="channelForm.providerKey === 'EASYPAY'"
          ><ElFormItem :label="xt('易支付 API 地址')"
            ><ElInput
              v-model.trim="channelForm.apiUrl"
              placeholder="https://pay.example.com" /></ElFormItem
          ><ElRow :gutter="14"
            ><ElCol :span="12"
              ><ElFormItem :label="xt('商户 ID（PID）')"
                ><ElInput v-model.trim="channelForm.merchantId" /></ElFormItem></ElCol
            ><ElCol :span="12"
              ><ElFormItem :label="xt('商户密钥')"
                ><ElInput
                  v-model="channelForm.merchantKey"
                  type="password"
                  show-password
                  :placeholder="
                    channelForm.id ? xt('留空保留现有密钥') : ''
                  " /></ElFormItem></ElCol></ElRow></template
        ><template v-else-if="channelForm.providerKey === 'STRIPE'"
          ><ElFormItem label="Stripe Secret Key"
            ><ElInput
              v-model="channelForm.secretKey"
              type="password"
              show-password
              :placeholder="channelForm.id ? xt('留空保留现有密钥') : 'sk_live_...'" /></ElFormItem
          ><ElFormItem label="Webhook Secret"
            ><ElInput
              v-model="channelForm.webhookSecret"
              type="password"
              show-password
              :placeholder="
                channelForm.id ? xt('留空保留现有密钥') : 'whsec_...'
              " /></ElFormItem></template
        ><template v-else-if="channelForm.providerKey === 'EXTERNAL'"
          ><ElFormItem :label="xt('外部收银台地址')"
            ><ElInput v-model.trim="channelForm.checkoutUrl" /></ElFormItem
          ><ElFormItem :label="xt('回调密钥')"
            ><ElInput
              v-model="channelForm.webhookSecret"
              type="password"
              show-password
              :placeholder="channelForm.id ? xt('留空保留现有密钥') : ''" /></ElFormItem></template
        ><ElRow :gutter="14"
          ><ElCol :span="8"
            ><ElFormItem :label="xt('最低金额（分）')"
              ><ElInputNumber
                v-model="channelForm.minAmountCents"
                :min="1"
                class="wide" /></ElFormItem></ElCol
          ><ElCol :span="8"
            ><ElFormItem :label="xt('费率（基点）')"
              ><ElInputNumber
                v-model="channelForm.feeRateBps"
                :min="0"
                :max="10000"
                class="wide" /></ElFormItem></ElCol
          ><ElCol :span="8"
            ><ElFormItem :label="xt('排序')"
              ><ElInputNumber
                v-model="channelForm.sortOrder"
                class="wide" /></ElFormItem></ElCol></ElRow
        ><ElSpace
          ><ElCheckbox v-model="channelForm.enabled">{{ xt('启用渠道') }}</ElCheckbox
          ><ElCheckbox v-model="channelForm.isDefault">{{ xt('设为默认') }}</ElCheckbox></ElSpace
        ></ElForm
      ><template #footer
        ><ElButton @click="channelDrawer = false">{{ xt('取消') }}</ElButton
        ><ElButton type="primary" :loading="saving" @click="saveChannel">{{
          xt('保存渠道')
        }}</ElButton></template
      ></ElDrawer
    >

    <ElDialog v-model="codeDialog" :title="xt('生成兑换码')" width="520px"
      ><ElForm label-position="top"
        ><ElFormItem :label="xt('批次名称')"
          ><ElInput
            v-model.trim="codeForm.name"
            :placeholder="xt('例如：八月新客活动')" /></ElFormItem
        ><ElFormItem :label="xt('自定义兑换码（留空自动生成）')"
          ><ElInput v-model.trim="codeForm.code" maxlength="64" /></ElFormItem
        ><ElRow :gutter="14"
          ><ElCol :span="12"
            ><ElFormItem :label="xt('面值')"
              ><ElInputNumber
                v-model="codeForm.credits"
                :min="1"
                class="wide" /></ElFormItem></ElCol
          ><ElCol :span="12"
            ><ElFormItem :label="xt('可用次数')"
              ><ElInputNumber
                v-model="codeForm.maxUses"
                :min="1"
                class="wide" /></ElFormItem></ElCol></ElRow
        ><ElFormItem :label="xt('到期时间')"
          ><ElDatePicker
            v-model="codeForm.expiresAt"
            type="datetime"
            class="wide" /></ElFormItem></ElForm
      ><template #footer
        ><ElButton @click="codeDialog = false">{{ xt('取消') }}</ElButton
        ><ElButton type="primary" :loading="saving" @click="createCode">{{
          xt('生成兑换码')
        }}</ElButton></template
      ></ElDialog
    >
    <ElDialog v-model="plainCodeDialog" :title="xt('兑换码已生成')" width="500px"
      ><ElAlert type="warning" :title="xt('关闭后无法再次查看完整兑换码')" :closable="false" /><div
        class="plain-code"
        ><code>{{ plainCode }}</code
        ><ElButton @click="copyCode">{{ xt('复制') }}</ElButton></div
      ></ElDialog
    >
  </div>
</template>

<script setup lang="ts">
  import { ElMessage, ElMessageBox } from 'element-plus'
  import {
    xinyueApi,
    type PaymentChannel,
    type PaymentTransaction,
    type RechargePackage,
    type RedemptionCode
  } from '@/api/xinyue'
  import { xinyueLocale, xinyueText as xt } from '@/locales/xinyue'
  defineOptions({ name: 'XinyueCommerce' })
  const providerText: Record<string, string> = {
    MANUAL: '人工收款',
    EASYPAY: '易支付',
    STRIPE: 'Stripe',
    EXTERNAL: '外部收银台'
  }
  const methodText: Record<string, string> = {
    manual: '人工',
    alipay: '支付宝',
    wechat: '微信',
    card: '银行卡'
  }
  const providerMethods: Record<string, string[]> = {
    MANUAL: ['manual'],
    EASYPAY: ['alipay', 'wechat'],
    STRIPE: ['card', 'alipay', 'wechat'],
    EXTERNAL: ['alipay', 'wechat', 'card']
  }
  const healthText: Record<string, string> = {
    healthy: '正常',
    invalid: '配置异常',
    unchecked: '未检测'
  }
  const transactionStatuses = ['PENDING', 'PAID', 'COMPLETED', 'FAILED', 'REFUNDED']
  const transactionStatusText: Record<string, string> = {
    PENDING: '待支付',
    PAID: '待入账',
    COMPLETED: '已完成',
    FAILED: '失败',
    REFUNDED: '已退款'
  }
  const emptyPackage = () => ({
    id: '',
    name: '',
    description: '',
    credits: 100,
    priceCents: 1000,
    originalPriceCents: 0,
    enabled: true,
    recommended: false,
    sortOrder: 0
  })
  const emptyChannel = () => ({
    id: '',
    name: '',
    providerKey: 'EASYPAY',
    supportedMethods: ['alipay', 'wechat'] as string[],
    minAmountCents: 100,
    feeRateBps: 0,
    sortOrder: 0,
    enabled: false,
    isDefault: false,
    apiUrl: '',
    merchantId: '',
    merchantKey: '',
    secretKey: '',
    webhookSecret: '',
    checkoutUrl: ''
  })
  const tab = ref('packages')
  const loading = ref(false)
  const loadingTransactions = ref(false)
  const saving = ref(false)
  const packages = ref<RechargePackage[]>([])
  const channels = ref<PaymentChannel[]>([])
  const transactions = ref<PaymentTransaction[]>([])
  const codes = ref<RedemptionCode[]>([])
  const filters = reactive({ q: '', status: '', channelId: '' })
  const packageDialog = ref(false)
  const packageForm = reactive(emptyPackage())
  const channelDrawer = ref(false)
  const channelForm = reactive(emptyChannel())
  const codeDialog = ref(false)
  const plainCodeDialog = ref(false)
  const plainCode = ref('')
  const codeForm = reactive<{
    name: string
    code: string
    credits: number
    maxUses: number
    expiresAt?: Date
  }>({ name: '', code: '', credits: 10, maxUses: 1, expiresAt: undefined })
  const money = (cents: number, currency = 'CNY') =>
    new Intl.NumberFormat(xinyueLocale(), { style: 'currency', currency }).format(cents / 100)
  const date = (value: string) =>
    new Intl.DateTimeFormat(xinyueLocale(), { dateStyle: 'medium', timeStyle: 'short' }).format(
      new Date(value)
    )
  const codeEnabled = (row: RedemptionCode) =>
    !row.disabledAt &&
    (!row.expiresAt || new Date(row.expiresAt) > new Date()) &&
    row.usedCount < row.maxUses
  const transactionType = (status: string) =>
    status === 'COMPLETED'
      ? 'success'
      : status === 'PENDING' || status === 'PAID'
        ? 'warning'
        : status === 'FAILED'
          ? 'danger'
          : 'info'
  async function load() {
    loading.value = true
    try {
      ;[packages.value, channels.value, codes.value] = await Promise.all([
        xinyueApi.rechargePackages(),
        xinyueApi.paymentChannels(),
        xinyueApi.redemptionCodes()
      ])
      await loadTransactions()
    } finally {
      loading.value = false
    }
  }
  async function loadTransactions() {
    loadingTransactions.value = true
    try {
      transactions.value = await xinyueApi.paymentTransactions(
        Object.fromEntries(Object.entries(filters).filter(([, value]) => value))
      )
    } finally {
      loadingTransactions.value = false
    }
  }
  function resetTransactions() {
    Object.assign(filters, { q: '', status: '', channelId: '' })
    void loadTransactions()
  }
  function openPackage(row?: RechargePackage) {
    Object.assign(
      packageForm,
      emptyPackage(),
      row
        ? {
            id: row.id,
            name: row.name,
            description: row.description,
            credits: row.credits,
            priceCents: row.priceCents,
            originalPriceCents: row.originalPriceCents || 0,
            enabled: row.enabled,
            recommended: row.recommended,
            sortOrder: row.sortOrder
          }
        : {}
    )
    packageDialog.value = true
  }
  async function savePackage() {
    if (!packageForm.name) return ElMessage.warning(xt('请填写商品名称'))
    saving.value = true
    try {
      const body = {
        name: packageForm.name,
        description: packageForm.description,
        credits: packageForm.credits,
        priceCents: packageForm.priceCents,
        originalPriceCents: packageForm.originalPriceCents || undefined,
        enabled: packageForm.enabled,
        recommended: packageForm.recommended,
        sortOrder: packageForm.sortOrder
      }
      await xinyueApi.saveRechargePackage(body, packageForm.id || undefined)
      packageDialog.value = false
      await load()
    } finally {
      saving.value = false
    }
  }
  async function removePackage(row: RechargePackage) {
    await ElMessageBox.confirm(`${xt('确认删除或下架')} "${row.name}"?`, xt('充值商品'), {
      type: 'warning'
    })
    await xinyueApi.deleteRechargePackage(row.id)
    await load()
  }
  function openChannel(row?: PaymentChannel) {
    const publicConfig = row?.publicConfig || {}
    Object.assign(
      channelForm,
      emptyChannel(),
      row
        ? {
            id: row.id,
            name: row.name,
            providerKey: row.providerKey,
            supportedMethods: [...row.supportedMethods],
            minAmountCents: row.minAmountCents,
            feeRateBps: row.feeRateBps,
            sortOrder: row.sortOrder,
            enabled: row.enabled,
            isDefault: row.isDefault
          }
        : {},
      {
        apiUrl: String(publicConfig.apiUrl || ''),
        merchantId: String(publicConfig.merchantId || ''),
        checkoutUrl: String(publicConfig.checkoutUrl || ''),
        merchantKey: '',
        secretKey: '',
        webhookSecret: ''
      }
    )
    channelDrawer.value = true
  }
  function syncMethods() {
    channelForm.supportedMethods = [...(providerMethods[channelForm.providerKey] || [])]
  }
  async function saveChannel() {
    if (!channelForm.name || !channelForm.supportedMethods.length)
      return ElMessage.warning(xt('请填写渠道名称并选择支付方式'))
    const publicConfig =
      channelForm.providerKey === 'EASYPAY'
        ? { apiUrl: channelForm.apiUrl, merchantId: channelForm.merchantId }
        : channelForm.providerKey === 'EXTERNAL'
          ? { checkoutUrl: channelForm.checkoutUrl }
          : {}
    const secrets = Object.fromEntries(
      Object.entries({
        merchantKey: channelForm.merchantKey,
        secretKey: channelForm.secretKey,
        webhookSecret: channelForm.webhookSecret
      }).filter(([, value]) => value)
    )
    const body = {
      name: channelForm.name,
      providerKey: channelForm.providerKey,
      enabled: channelForm.enabled,
      isDefault: channelForm.isDefault,
      supportedMethods: [...channelForm.supportedMethods],
      minAmountCents: channelForm.minAmountCents,
      feeRateBps: channelForm.feeRateBps,
      sortOrder: channelForm.sortOrder,
      publicConfig,
      ...(Object.keys(secrets).length ? { secrets } : {})
    }
    saving.value = true
    try {
      await xinyueApi.savePaymentChannel(body, channelForm.id || undefined)
      channelDrawer.value = false
      await load()
    } finally {
      saving.value = false
    }
  }
  async function checkChannel(row: PaymentChannel) {
    await xinyueApi.checkPaymentChannel(row.id)
    await load()
  }
  async function removeChannel(row: PaymentChannel) {
    await ElMessageBox.confirm(`${xt('确认删除或停用')} "${row.name}"?`, xt('支付渠道'), {
      type: 'warning'
    })
    await xinyueApi.deletePaymentChannel(row.id)
    await load()
  }
  async function complete(row: PaymentTransaction) {
    await ElMessageBox.confirm(
      `${xt('确认交易')} ${row.outTradeNo} ${xt('已完成并执行入账？')}`,
      xt('完成支付')
    )
    await xinyueApi.completePayment(row.id)
    await loadTransactions()
  }
  async function createCode() {
    if (!codeForm.name) return ElMessage.warning(xt('请填写批次名称'))
    saving.value = true
    try {
      const result = await xinyueApi.createRedemptionCode({
        ...codeForm,
        code: codeForm.code || undefined,
        expiresAt: codeForm.expiresAt?.toISOString()
      })
      plainCode.value = result.plainCode
      codeDialog.value = false
      plainCodeDialog.value = true
      Object.assign(codeForm, { name: '', code: '', credits: 10, maxUses: 1, expiresAt: undefined })
      await load()
    } finally {
      saving.value = false
    }
  }
  async function toggleCode(row: RedemptionCode) {
    await xinyueApi.setRedemptionCodeStatus(row.id, !codeEnabled(row))
    await load()
  }
  async function copyCode() {
    await navigator.clipboard.writeText(plainCode.value)
    ElMessage.success(xt('兑换码已复制'))
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

  .page-title,
  .pane-action {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .page-title h1 {
    margin: 0 0 4px;
    font-size: 22px;
  }

  .page-title p,
  .pane-action span,
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

  .business-tabs :deep(.el-tab-pane) {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .pane-action {
    min-height: 34px;
  }

  .inline-tag {
    margin-left: 8px;
  }

  .line-through {
    text-decoration: line-through;
  }

  .filter-card :deep(.el-card__body) {
    padding-bottom: 2px;
  }

  .filter-card :deep(.el-form-item) {
    margin-bottom: 14px;
  }

  .wide {
    width: 100%;
  }

  .plain-code {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 10px;
    align-items: center;
    padding: 14px;
    margin-top: 16px;
    border: 1px solid var(--art-gray-200);
    border-radius: 6px;
  }

  .plain-code code {
    font-size: 18px;
    font-weight: 700;
    word-break: break-all;
  }
</style>
