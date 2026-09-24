<template>
  <div class="xinyue-page governance-page">
    <header class="page-title"
      ><div
        ><h1>{{ xt('商业治理') }}</h1
        ><p>{{ xt('集中管理后台权限、发票、账户注销与订阅续费') }}</p></div
      ><ElButton :loading="loading" @click="load"
        ><ArtSvgIcon icon="ri:refresh-line" />{{ xt('刷新') }}</ElButton
      ></header
    >
    <ElTabs v-model="tab" class="business-tabs">
      <ElTabPane :label="xt('角色与权限')" name="roles">
        <ElRow :gutter="16"
          ><ElCol :xs="24" :lg="14"
            ><ElCard shadow="never"
              ><template #header
                ><div class="card-heading"
                  ><strong>{{ xt('后台角色') }}</strong
                  ><ElButton type="primary" @click="openRole()"
                    ><ArtSvgIcon icon="ri:add-line" />{{ xt('新增角色') }}</ElButton
                  ></div
                ></template
              >
              <ElTable :data="roles"
                ><ElTableColumn prop="name" :label="xt('角色')" min-width="160"
                  ><template #default="{ row }"
                    ><strong>{{ row.name }}</strong
                    ><small class="note">{{ row.code }}</small></template
                  ></ElTableColumn
                ><ElTableColumn :label="xt('权限')" min-width="160"
                  ><template #default="{ row }">{{
                    row.permissions.includes('*')
                      ? xt('全部权限')
                      : `${row.permissions.length} ${xt('项')}`
                  }}</template></ElTableColumn
                ><ElTableColumn :label="xt('管理员')" width="90"
                  ><template #default="{ row }">{{ row._count.users }}</template></ElTableColumn
                ><ElTableColumn :label="xt('操作')" width="140"
                  ><template #default="{ row }"
                    ><ElButton link type="primary" @click="openRole(row as AdminRoleRecord)">{{
                      xt('编辑')
                    }}</ElButton
                    ><ElButton
                      v-if="!row.builtIn"
                      link
                      type="danger"
                      @click="removeRole(row as AdminRoleRecord)"
                      >{{ xt('删除') }}</ElButton
                    ></template
                  ></ElTableColumn
                ></ElTable
              >
            </ElCard></ElCol
          ><ElCol :xs="24" :lg="10"
            ><ElCard shadow="never"
              ><template #header
                ><strong>{{ xt('管理员分配') }}</strong></template
              ><div class="admin-assignment" v-for="item in administrators" :key="item.id"
                ><span
                  ><strong>{{ item.displayName }}</strong
                  ><small>{{ item.email || item.username || '-' }}</small></span
                ><ElTag v-if="item.role === 'SUPER_ADMIN'" type="danger">{{
                  xt('超级管理员')
                }}</ElTag
                ><ElSelect
                  v-else
                  :model-value="item.adminRoleId || ''"
                  :placeholder="xt('选择角色')"
                  @change="assignRole(item.id, $event)"
                  ><ElOption
                    v-for="role in roles.filter((r) => r.enabled)"
                    :key="role.id"
                    :label="role.name"
                    :value="role.id" /></ElSelect></div></ElCard></ElCol
        ></ElRow>
      </ElTabPane>
      <ElTabPane :label="`${xt('发票申请')} ${invoices.length}`" name="invoices"
        ><ElCard shadow="never" class="art-table-card"
          ><ElTable :data="invoices" height="100%"
            ><ElTableColumn :label="xt('客户 / 交易')" min-width="220"
              ><template #default="{ row }"
                ><strong>{{ row.user.displayName }}</strong
                ><small class="note">{{ row.transaction.outTradeNo }}</small></template
              ></ElTableColumn
            ><ElTableColumn :label="xt('开票抬头')" min-width="190"
              ><template #default="{ row }"
                >{{ row.profileSnapshot.title
                }}<small class="note">{{
                  row.profileSnapshot.taxId || xt('个人')
                }}</small></template
              ></ElTableColumn
            ><ElTableColumn :label="xt('金额')" width="120"
              ><template #default="{ row }">{{
                money(row.amountCents, row.currency)
              }}</template></ElTableColumn
            ><ElTableColumn :label="xt('状态')" width="110"
              ><template #default="{ row }"
                ><ElTag :type="statusType(row.status)">{{
                  invoiceStatus[row.status] || row.status
                }}</ElTag></template
              ></ElTableColumn
            ><ElTableColumn :label="xt('操作')" width="190"
              ><template #default="{ row }"
                ><ElButton
                  v-if="row.status === 'REQUESTED'"
                  link
                  type="primary"
                  @click="reviewInvoice(row as InvoiceRequestRecord)"
                  >{{ xt('开始审核') }}</ElButton
                ><ElButton
                  v-if="['REQUESTED', 'REVIEWING'].includes(row.status)"
                  link
                  type="success"
                  @click="openIssue(row as InvoiceRequestRecord)"
                  >{{ xt('开具') }}</ElButton
                ><ElButton
                  v-if="['REQUESTED', 'REVIEWING'].includes(row.status)"
                  link
                  type="danger"
                  @click="rejectInvoice(row as InvoiceRequestRecord)"
                  >{{ xt('拒绝') }}</ElButton
                ></template
              ></ElTableColumn
            ></ElTable
          ></ElCard
        ></ElTabPane
      >
      <ElTabPane :label="`${xt('账户注销')} ${deletions.length}`" name="deletions"
        ><ElCard shadow="never" class="art-table-card"
          ><ElTable :data="deletions" height="100%"
            ><ElTableColumn :label="xt('用户')" min-width="210"
              ><template #default="{ row }"
                ><strong>{{ row.user.displayName }}</strong
                ><small class="note">{{
                  row.user.email || row.user.username || row.userId
                }}</small></template
              ></ElTableColumn
            ><ElTableColumn
              prop="reason"
              :label="xt('原因')"
              min-width="220"
              show-overflow-tooltip
            /><ElTableColumn :label="xt('计划执行')" width="180"
              ><template #default="{ row }">{{ date(row.scheduledAt) }}</template></ElTableColumn
            ><ElTableColumn :label="xt('状态')" width="110"
              ><template #default="{ row }"
                ><ElTag :type="statusType(row.status)">{{
                  deletionStatus[row.status] || row.status
                }}</ElTag></template
              ></ElTableColumn
            ><ElTableColumn :label="xt('操作')" width="120"
              ><template #default="{ row }"
                ><ElButton
                  v-if="['REQUESTED', 'FAILED'].includes(row.status)"
                  link
                  type="danger"
                  @click="processDeletion(row as AccountDeletionRecord)"
                  >{{ xt('立即处理') }}</ElButton
                ></template
              ></ElTableColumn
            ></ElTable
          ></ElCard
        ></ElTabPane
      >
      <ElTabPane :label="`${xt('续费与催缴')} ${renewals.length}`" name="renewals"
        ><ElCard shadow="never" class="art-table-card"
          ><ElTable :data="renewals" height="100%"
            ><ElTableColumn :label="xt('客户 / 套餐')" min-width="220"
              ><template #default="{ row }"
                ><strong
                  >{{ row.subscription.user.displayName }} ·
                  {{ row.subscription.plan.name }}</strong
                ><small class="note">{{ row.subscription.user.email || '-' }}</small></template
              ></ElTableColumn
            ><ElTableColumn :label="xt('尝试')" width="90"
              ><template #default="{ row }">#{{ row.attemptNumber }}</template></ElTableColumn
            ><ElTableColumn :label="xt('状态')" width="140"
              ><template #default="{ row }"
                ><ElTag :type="statusType(row.status)">{{
                  renewalStatus[row.status] || row.status
                }}</ElTag></template
              ></ElTableColumn
            ><ElTableColumn
              prop="failureReason"
              :label="xt('说明')"
              min-width="200"
              show-overflow-tooltip
            /><ElTableColumn :label="xt('操作')" width="110"
              ><template #default="{ row }"
                ><ElButton
                  v-if="['FAILED', 'PAYMENT_REQUIRED'].includes(row.status)"
                  link
                  type="primary"
                  @click="retryRenewal(row as RenewalAttemptRecord)"
                  >{{ xt('重试') }}</ElButton
                ></template
              ></ElTableColumn
            ></ElTable
          ></ElCard
        ></ElTabPane
      >
      <ElTabPane :label="`${xt('邀请返佣')} ${referrals.length}`" name="referrals"
        ><ElCard shadow="never" class="art-table-card"
          ><ElTable :data="referrals" height="100%">
            <ElTableColumn :label="xt('邀请人 / 新用户')" min-width="220"
              ><template #default="{ row }"
                ><strong>{{ row.inviter.displayName }} → {{ row.invitee.displayName }}</strong
                ><small class="note"
                  >{{ row.inviter.email || row.inviter.username || '-' }} ·
                  {{ row.invitee.email || row.invitee.username || '-' }}</small
                ></template
              ></ElTableColumn
            >
            <ElTableColumn :label="xt('首笔支付')" min-width="170"
              ><template #default="{ row }"
                ><template v-if="row.qualifyingTransaction"
                  >{{ money(row.qualifyingTransaction.amountCents)
                  }}<small class="note">{{ row.qualifyingTransaction.outTradeNo }}</small></template
                ><span v-else>-</span></template
              ></ElTableColumn
            >
            <ElTableColumn :label="xt('奖励')" width="100"
              ><template #default="{ row }"
                >{{ row.reward }} {{ xt('点') }}</template
              ></ElTableColumn
            >
            <ElTableColumn :label="xt('状态')" width="120"
              ><template #default="{ row }"
                ><ElTag :type="statusType(row.status)">{{
                  referralStatus[row.status] || row.status
                }}</ElTag></template
              ></ElTableColumn
            >
            <ElTableColumn :label="xt('风控 / 说明')" min-width="190" show-overflow-tooltip
              ><template #default="{ row }">{{
                row.reviewReason || (row.riskFlags || []).join('、') || '-'
              }}</template></ElTableColumn
            >
            <ElTableColumn :label="xt('预计发放')" width="180"
              ><template #default="{ row }">{{ date(row.payableAt) }}</template></ElTableColumn
            >
            <ElTableColumn :label="xt('操作')" width="190" fixed="right"
              ><template #default="{ row }"
                ><ElButton
                  v-if="['REVIEW_REQUIRED', 'COOLING', 'APPROVED'].includes(row.status)"
                  link
                  type="success"
                  @click="approveReferral(row as ReferralRecord)"
                  >{{ xt('审核通过') }}</ElButton
                ><ElButton
                  v-if="
                    ['REGISTERED', 'REVIEW_REQUIRED', 'COOLING', 'APPROVED'].includes(row.status)
                  "
                  link
                  type="danger"
                  @click="rejectReferral(row as ReferralRecord)"
                  >{{ xt('拒绝') }}</ElButton
                ></template
              ></ElTableColumn
            >
          </ElTable></ElCard
        ></ElTabPane
      >
    </ElTabs>

    <ElDialog
      v-model="roleDialog"
      :title="roleForm.id ? xt('编辑角色') : xt('新增角色')"
      width="720px"
      ><ElForm label-position="top"
        ><ElRow :gutter="14"
          ><ElCol :span="12"
            ><ElFormItem :label="xt('角色名称')"
              ><ElInput v-model.trim="roleForm.name" /></ElFormItem></ElCol
          ><ElCol :span="12"
            ><ElFormItem :label="xt('角色标识')"
              ><ElInput
                v-model.trim="roleForm.code"
                :disabled="roleForm.builtIn" /></ElFormItem></ElCol></ElRow
        ><ElFormItem :label="xt('说明')"><ElInput v-model.trim="roleForm.description" /></ElFormItem
        ><ElFormItem :label="xt('权限')"
          ><ElCheckboxGroup v-model="roleForm.permissions" class="permission-grid"
            ><ElCheckbox v-for="item in permissions" :key="item.code" :value="item.code">{{
              item.name
            }}</ElCheckbox></ElCheckboxGroup
          ></ElFormItem
        ></ElForm
      ><template #footer
        ><ElButton @click="roleDialog = false">{{ xt('取消') }}</ElButton
        ><ElButton type="primary" :loading="saving" @click="saveRole">{{
          xt('保存')
        }}</ElButton></template
      >
      ></ElDialog
    >
    <ElDialog v-model="issueDialog" :title="xt('开具发票')" width="520px"
      ><ElForm label-position="top"
        ><ElFormItem :label="xt('发票号码')"
          ><ElInput v-model.trim="issueForm.invoiceNumber" /></ElFormItem
        ><ElFormItem :label="xt('电子发票地址')"
          ><ElInput
            v-model.trim="issueForm.invoiceUrl"
            placeholder="https://..." /></ElFormItem></ElForm
      ><template #footer
        ><ElButton @click="issueDialog = false">{{ xt('取消') }}</ElButton
        ><ElButton type="primary" :loading="saving" @click="issueInvoice">{{
          xt('确认开具')
        }}</ElButton></template
      >
      ></ElDialog
    >
  </div>
</template>

<script setup lang="ts">
  import { onMounted, reactive, ref } from 'vue'
  import { ElMessageBox } from 'element-plus'
  import {
    governanceApi as xinyueApi,
    type AccountDeletionRecord,
    type AdministratorRecord,
    type AdminPermission,
    type AdminRoleRecord,
    type InvoiceRequestRecord,
    type ReferralRecord,
    type RenewalAttemptRecord
  } from '@/api/xinyue/governance'
  import { xinyueText as xt } from '@/locales/xinyue'
  import { useXinyueAsync } from '@/hooks'
  import { formatDateTime, formatMoneyCents } from '@/utils/xinyue/formatters'
  const tab = ref('roles'),
    { loading, saving, withLoading, withSaving } = useXinyueAsync(),
    roles = ref<AdminRoleRecord[]>([]),
    permissions = ref<AdminPermission[]>([]),
    administrators = ref<AdministratorRecord[]>([]),
    invoices = ref<InvoiceRequestRecord[]>([]),
    deletions = ref<AccountDeletionRecord[]>([]),
    renewals = ref<RenewalAttemptRecord[]>([]),
    referrals = ref<ReferralRecord[]>([])
  const roleDialog = ref(false),
    issueDialog = ref(false)
  const roleForm = reactive({
    id: '',
    code: '',
    name: '',
    description: '',
    permissions: [] as string[],
    builtIn: false
  })
  const issueForm = reactive({ id: '', invoiceNumber: '', invoiceUrl: '' })
  const invoiceStatus: Record<string, string> = {
    REQUESTED: '待审核',
    REVIEWING: '审核中',
    ISSUED: '已开具',
    REJECTED: '已拒绝',
    CANCELLED: '已撤销'
  }
  const deletionStatus: Record<string, string> = {
    REQUESTED: '冷静期',
    PROCESSING: '处理中',
    COMPLETED: '已完成',
    CANCELLED: '已撤销',
    FAILED: '失败'
  }
  const renewalStatus: Record<string, string> = {
    SCHEDULED: '已计划',
    PROCESSING: '处理中',
    PAYMENT_REQUIRED: '待支付',
    SUCCEEDED: '成功',
    FAILED: '失败',
    CANCELLED: '已取消'
  }
  const referralStatus: Record<string, string> = {
    REGISTERED: '已注册',
    COOLING: '冷静期',
    REVIEW_REQUIRED: '待审核',
    APPROVED: '已通过',
    REWARDED: '已发放',
    REJECTED: '已拒绝',
    REVERSED: '已冲正'
  }
  const date = (v?: string | null) => formatDateTime(v, '-')
  const money = (v: number, c = 'CNY') => formatMoneyCents(v, c)
  const statusType = (s: string) =>
    ['ISSUED', 'SUCCEEDED', 'COMPLETED'].includes(s)
      ? 'success'
      : ['FAILED', 'REJECTED'].includes(s)
        ? 'danger'
        : ['REQUESTED', 'PAYMENT_REQUIRED', 'PROCESSING', 'REVIEWING'].includes(s)
          ? 'warning'
          : 'info'
  async function load() {
    await withLoading(async () => {
      ;[
        roles.value,
        permissions.value,
        administrators.value,
        invoices.value,
        deletions.value,
        renewals.value,
        referrals.value
      ] = await Promise.all([
        xinyueApi.adminRoles(),
        xinyueApi.adminPermissions(),
        xinyueApi.administrators(),
        xinyueApi.invoiceRequests(),
        xinyueApi.accountDeletions(),
        xinyueApi.renewalAttempts(),
        xinyueApi.referrals()
      ])
    })
  }
  function openRole(row?: AdminRoleRecord) {
    Object.assign(
      roleForm,
      row
        ? { ...row, permissions: [...row.permissions] }
        : { id: '', code: '', name: '', description: '', permissions: [], builtIn: false }
    )
    roleDialog.value = true
  }
  async function saveRole() {
    await withSaving(async () => {
      await xinyueApi.saveAdminRole(
        {
          code: roleForm.code,
          name: roleForm.name,
          description: roleForm.description,
          permissions: roleForm.permissions,
          enabled: true
        },
        roleForm.id || undefined
      )
      roleDialog.value = false
      await load()
    })
  }
  async function removeRole(row: AdminRoleRecord) {
    await ElMessageBox.confirm(`确认删除角色“${row.name}”？`, '删除角色', { type: 'warning' })
    await withSaving(async () => {
      await xinyueApi.deleteAdminRole(row.id)
      await load()
    })
  }
  async function assignRole(userId: string, value: unknown) {
    await withSaving(async () => {
      await xinyueApi.assignAdminRole(userId, String(value) || null)
      await load()
    })
  }
  async function reviewInvoice(row: InvoiceRequestRecord) {
    await withSaving(async () => {
      await xinyueApi.reviewInvoice(row.id)
      await load()
    })
  }
  function openIssue(row: InvoiceRequestRecord) {
    Object.assign(issueForm, { id: row.id, invoiceNumber: '', invoiceUrl: '' })
    issueDialog.value = true
  }
  async function issueInvoice() {
    await withSaving(async () => {
      await xinyueApi.issueInvoice(issueForm.id, {
        invoiceNumber: issueForm.invoiceNumber,
        invoiceUrl: issueForm.invoiceUrl
      })
      issueDialog.value = false
      await load()
    })
  }
  async function rejectInvoice(row: InvoiceRequestRecord) {
    const { value } = await ElMessageBox.prompt('请输入拒绝原因', '拒绝发票申请', {
      inputValidator: (v) => v.trim().length >= 2 || '至少填写 2 个字'
    })
    await withSaving(async () => {
      await xinyueApi.rejectInvoice(row.id, value)
      await load()
    })
  }
  async function processDeletion(row: AccountDeletionRecord) {
    await ElMessageBox.confirm(
      '该操作会立即清除用户个人数据且不可恢复，确认继续？',
      '处理账户注销',
      { type: 'error', confirmButtonText: '确认删除' }
    )
    await withSaving(async () => {
      await xinyueApi.processAccountDeletion(row.id)
      await load()
    })
  }
  async function retryRenewal(row: RenewalAttemptRecord) {
    await withSaving(async () => {
      await xinyueApi.retryRenewal(row.id)
      await load()
    })
  }
  async function approveReferral(row: ReferralRecord) {
    const { value } = await ElMessageBox.confirm(
      '是否立即发放奖励？选择取消将保留冷静期。',
      '审核邀请奖励',
      {
        distinguishCancelAndClose: true,
        confirmButtonText: '立即发放',
        cancelButtonText: '保留冷静期',
        type: 'warning'
      }
    )
      .then(() => ({ value: true }))
      .catch((action) => (action === 'cancel' ? { value: false } : Promise.reject(action)))
    await withSaving(async () => {
      await xinyueApi.approveReferral(row.id, value)
      await load()
    })
  }
  async function rejectReferral(row: ReferralRecord) {
    const { value } = await ElMessageBox.prompt('请输入拒绝原因', '拒绝邀请奖励', {
      inputValidator: (v) => v.trim().length >= 2 || '至少填写 2 个字'
    })
    await withSaving(async () => {
      await xinyueApi.rejectReferral(row.id, value)
      await load()
    })
  }
  onMounted(load)
</script>

<style scoped>
  .governance-page {
    min-width: 0;
  }
  .card-heading,
  .admin-assignment {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }
  .admin-assignment {
    min-height: 64px;
    border-bottom: 1px solid var(--el-border-color-lighter);
  }
  .admin-assignment:last-child {
    border-bottom: 0;
  }
  .admin-assignment span {
    min-width: 0;
  }
  .admin-assignment strong,
  .admin-assignment small {
    display: block;
  }
  .admin-assignment small,
  .note {
    color: var(--el-text-color-secondary);
    font-size: 12px;
  }
  .admin-assignment .el-select {
    width: 170px;
  }
  .permission-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    width: 100%;
    gap: 4px 12px;
  }
  .art-table-card {
    height: calc(100vh - 240px);
    min-height: 420px;
  }
  @media (max-width: 760px) {
    .permission-grid {
      grid-template-columns: 1fr;
    }
    .art-table-card {
      height: 520px;
    }
  }
</style>
