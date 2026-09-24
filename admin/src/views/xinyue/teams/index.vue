<template>
  <div class="art-full-height xinyue-page">
    <div class="page-title">
      <div
        ><h1>{{ xt('团队与成员') }}</h1
        ><p>{{ xt('查看企业团队、席位、邀请和关键操作记录') }}</p></div
      >
      <ElButton :loading="loading" @click="load"
        ><ArtSvgIcon icon="ri:refresh-line" />{{ xt('刷新') }}</ElButton
      >
    </div>
    <ElRow :gutter="12">
      <ElCol :xs="12" :md="6"
        ><ElCard shadow="never" class="metric"
          ><span>{{ xt('团队') }}</span
          ><strong>{{ rows.length }}</strong></ElCard
        ></ElCol
      >
      <ElCol :xs="12" :md="6"
        ><ElCard shadow="never" class="metric"
          ><span>{{ xt('有效团队') }}</span
          ><strong>{{ activeCount }}</strong></ElCard
        ></ElCol
      >
      <ElCol :xs="12" :md="6"
        ><ElCard shadow="never" class="metric"
          ><span>{{ xt('已用席位') }}</span
          ><strong>{{ memberCount }}</strong></ElCard
        ></ElCol
      >
      <ElCol :xs="12" :md="6"
        ><ElCard shadow="never" class="metric"
          ><span>{{ xt('团队创作点') }}</span
          ><strong>{{ totalCredits }}</strong
          ><small>{{ invitationCount }} {{ xt('条待接受邀请') }}</small></ElCard
        ></ElCol
      >
    </ElRow>
    <ElCard shadow="never" class="art-table-card">
      <ArtTableHeader :loading="loading" @refresh="load"
        ><template #left
          ><strong>{{ xt('团队列表') }}</strong></template
        ></ArtTableHeader
      >
      <ElTable v-loading="loading" :data="rows" height="100%" row-key="id">
        <ElTableColumn :label="xt('团队')" min-width="220"
          ><template #default="{ row }"
            ><strong>{{ row.name }}</strong
            ><small class="block-note">{{ row.slug }}</small></template
          ></ElTableColumn
        >
        <ElTableColumn :label="xt('所有者')" min-width="190"
          ><template #default="{ row }"
            ><span>{{ row.owner.displayName }}</span
            ><small class="block-note">{{ row.owner.email || xt('未绑定邮箱') }}</small></template
          ></ElTableColumn
        >
        <ElTableColumn :label="xt('席位')" width="130"
          ><template #default="{ row }"
            ><ElProgress
              :percentage="seatPercent(row as AdminTeam)"
              :stroke-width="6"
              :show-text="false"
            /><small class="block-note"
              >{{ row._count.members }} / {{ row.seatLimit }}</small
            ></template
          ></ElTableColumn
        >
        <ElTableColumn :label="xt('待邀请')" width="95"
          ><template #default="{ row }">{{ row.invitations.length }}</template></ElTableColumn
        >
        <ElTableColumn :label="xt('共享资源')" width="170"
          ><template #default="{ row }"
            >{{ row._count.projects }} / {{ row._count.assets }} / {{ row._count.knowledgeBases
            }}<small class="block-note">{{ xt('项目 / 文件 / 知识库') }}</small></template
          ></ElTableColumn
        >
        <ElTableColumn :label="xt('共享额度')" width="130"
          ><template #default="{ row }"
            ><strong>{{ row.creditAccount?.balance || 0 }}</strong
            ><small class="block-note">{{
              row.billingEnabled ? xt('项目扣团队额度') : xt('未启用')
            }}</small></template
          ></ElTableColumn
        >
        <ElTableColumn :label="xt('更新时间')" width="170"
          ><template #default="{ row }">{{ formatTime(row.updatedAt) }}</template></ElTableColumn
        >
        <ElTableColumn :label="xt('状态')" width="95"
          ><template #default="{ row }"
            ><ElTag :type="row.status === 'ACTIVE' ? 'success' : 'danger'">{{
              row.status === 'ACTIVE' ? xt('启用') : xt('已停用')
            }}</ElTag></template
          ></ElTableColumn
        >
        <ElTableColumn :label="xt('操作')" width="220" fixed="right"
          ><template #default="{ row }"
            ><ElButton link type="primary" @click="openDetail(row as AdminTeam)">{{
              xt('查看')
            }}</ElButton
            ><ElButton link @click="openEditor(row as AdminTeam)">{{ xt('编辑') }}</ElButton
            ><ElButton link @click="openCredits(row as AdminTeam)">{{
              xt('调账')
            }}</ElButton></template
          ></ElTableColumn
        >
      </ElTable>
    </ElCard>

    <ElDialog v-model="editorDialog" :title="xt('编辑团队')" width="560px">
      <ElForm label-position="top"
        ><ElFormItem :label="xt('团队名称')"
          ><ElInput v-model.trim="editor.name" maxlength="100" /></ElFormItem
        ><ElFormItem :label="xt('席位上限')"
          ><ElInputNumber
            v-model="editor.seatLimit"
            :min="editor.memberCount"
            :max="10000"
            class="w-full" /></ElFormItem
        ><ElFormItem :label="xt('团队状态')"
          ><ElSelect v-model="editor.status" class="w-full"
            ><ElOption :label="xt('启用')" value="ACTIVE" /><ElOption
              :label="xt('停用')"
              value="SUSPENDED" /></ElSelect></ElFormItem
        ><ElFormItem :label="xt('团队项目共享支付')"
          ><ElSwitch v-model="editor.billingEnabled" /><small class="form-note">{{
            xt('启用后，归属该团队的项目优先扣除团队创作点，并执行成员月度限额。')
          }}</small></ElFormItem
        ></ElForm
      >
      <template #footer
        ><ElButton @click="editorDialog = false">{{ xt('取消') }}</ElButton
        ><ElButton type="primary" :loading="saving" @click="save">{{
          xt('保存')
        }}</ElButton></template
      >
    </ElDialog>

    <ElDialog
      v-model="creditDialog"
      :title="`${creditEditor.name} · ${xt('团队额度调账')}`"
      width="520px"
    >
      <ElForm label-position="top"
        ><ElFormItem :label="xt('调整点数')"
          ><ElInputNumber
            v-model="creditEditor.amount"
            :min="-100000000"
            :max="100000000"
            class="w-full"
          /><small class="form-note">{{
            xt('正数增加，负数扣减；扣减后余额不能小于 0。')
          }}</small></ElFormItem
        ><ElFormItem :label="xt('调整原因')"
          ><ElInput
            v-model.trim="creditEditor.reason"
            type="textarea"
            :rows="3"
            maxlength="500"
            show-word-limit /></ElFormItem
      ></ElForm>
      <template #footer
        ><ElButton @click="creditDialog = false">{{ xt('取消') }}</ElButton
        ><ElButton type="primary" :loading="saving" @click="adjustCredits">{{
          xt('确认调账')
        }}</ElButton></template
      >
    </ElDialog>

    <ElDrawer
      v-model="detailDrawer"
      :title="detail?.name || xt('团队详情')"
      size="min(720px, 92vw)"
    >
      <template v-if="detail">
        <ElDescriptions :column="2" border
          ><ElDescriptionsItem :label="xt('所有者')">{{
            detail.owner.displayName
          }}</ElDescriptionsItem
          ><ElDescriptionsItem :label="xt('席位')"
            >{{ detail.members.length }} / {{ detail.seatLimit }}</ElDescriptionsItem
          ><ElDescriptionsItem :label="xt('状态')">{{ detail.status }}</ElDescriptionsItem
          ><ElDescriptionsItem :label="xt('创建时间')">{{
            formatTime(detail.createdAt)
          }}</ElDescriptionsItem
          ><ElDescriptionsItem :label="xt('团队创作点')">{{
            detail.creditAccount?.balance || 0
          }}</ElDescriptionsItem
          ><ElDescriptionsItem :label="xt('共享支付')">{{
            detail.billingEnabled ? xt('已启用') : xt('未启用')
          }}</ElDescriptionsItem
          ><ElDescriptionsItem :label="xt('共享项目')">{{
            detail._count.projects
          }}</ElDescriptionsItem
          ><ElDescriptionsItem :label="xt('共享文件与知识库')"
            >{{ detail._count.assets }} / {{ detail._count.knowledgeBases }}</ElDescriptionsItem
          ></ElDescriptions
        >
        <h3>{{ xt('成员与月度限额') }}</h3
        ><ElTable :data="detail.members" max-height="320"
          ><ElTableColumn :label="xt('用户')" min-width="180"
            ><template #default="{ row }"
              >{{ row.user.displayName
              }}<small class="block-note">{{ row.user.email || '-' }}</small></template
            ></ElTableColumn
          ><ElTableColumn :label="xt('角色')" width="90" prop="role" /><ElTableColumn
            :label="xt('本月已用')"
            width="100"
            prop="creditsUsed"
          /><ElTableColumn :label="xt('月限额')" min-width="180"
            ><template #default="{ row }"
              ><div class="quota-editor"
                ><ElInputNumber
                  v-model="row.monthlyCreditLimit"
                  :min="0"
                  :max="100000000"
                  :placeholder="xt('不限额')"
                  controls-position="right"
                /><ElButton
                  :loading="quotaSavingId === row.userId"
                  @click="saveQuota(row as AdminTeam['members'][number])"
                  >{{ xt('保存') }}</ElButton
                ></div
              ></template
            ></ElTableColumn
          ></ElTable
        >
        <h3>{{ xt('待接受邀请') }}</h3
        ><ElTable :data="detail.invitations" max-height="220"
          ><ElTableColumn label="Email" min-width="210" prop="email" /><ElTableColumn
            :label="xt('角色')"
            width="100"
            prop="role"
          /><ElTableColumn :label="xt('到期时间')" width="170"
            ><template #default="{ row }">{{ formatTime(row.expiresAt) }}</template></ElTableColumn
          ></ElTable
        >
        <h3>{{ xt('共享项目') }}</h3
        ><ElTable v-loading="resourceLoading" :data="resources?.projects || []" max-height="240"
          ><ElTableColumn :label="xt('项目')" min-width="180" prop="name" /><ElTableColumn
            :label="xt('创建者')"
            min-width="120"
            ><template #default="{ row }">{{ row.user.displayName }}</template></ElTableColumn
          ><ElTableColumn :label="xt('内容')" min-width="150"
            ><template #default="{ row }"
              >{{ row._count.conversations }} {{ xt('个对话') }} · {{ row._count.assets }}
              {{ xt('个文件') }}</template
            ></ElTableColumn
          ></ElTable
        >
        <h3>{{ xt('共享文件与知识库') }}</h3
        ><ElTabs
          ><ElTabPane :label="`${xt('文件')} ${resources?.assets.length || 0}`"
            ><ElTable v-loading="resourceLoading" :data="resources?.assets || []" max-height="220"
              ><ElTableColumn :label="xt('文件')" min-width="180" prop="name" /><ElTableColumn
                :label="xt('类型')"
                width="100"
                prop="kind"
              /><ElTableColumn :label="xt('创建者')" min-width="120"
                ><template #default="{ row }">{{ row.user.displayName }}</template></ElTableColumn
              ></ElTable
            ></ElTabPane
          ><ElTabPane :label="`${xt('知识库')} ${resources?.knowledgeBases.length || 0}`"
            ><ElTable
              v-loading="resourceLoading"
              :data="resources?.knowledgeBases || []"
              max-height="220"
              ><ElTableColumn :label="xt('知识库')" min-width="180" prop="name" /><ElTableColumn
                :label="xt('创建者')"
                min-width="120"
                ><template #default="{ row }">{{
                  row.creator.displayName
                }}</template></ElTableColumn
              ><ElTableColumn
                :label="xt('文件')"
                width="100"
                prop="documentCount" /></ElTable></ElTabPane
        ></ElTabs>
        <h3>{{ xt('团队审计') }}</h3
        ><ElTable v-loading="auditLoading" :data="auditRows" max-height="320"
          ><ElTableColumn :label="xt('操作')" min-width="180" prop="action" /><ElTableColumn
            :label="xt('操作者')"
            min-width="150"
            ><template #default="{ row }">{{
              row.actor?.displayName || xt('系统')
            }}</template></ElTableColumn
          ><ElTableColumn :label="xt('时间')" width="170"
            ><template #default="{ row }">{{ formatTime(row.createdAt) }}</template></ElTableColumn
          ></ElTable
        >
      </template>
    </ElDrawer>
  </div>
</template>

<script setup lang="ts">
  import { ElMessage } from 'element-plus'
  import {
    customerApi as xinyueApi,
    type AdminTeam,
    type AdminTeamResources,
    type TeamAuditLog
  } from '@/api/xinyue/customers'
  import { useXinyueAsync } from '@/hooks'
  import { xinyueText as xt } from '@/locales/xinyue'
  import { formatDateTime } from '@/utils/xinyue/formatters'
  defineOptions({ name: 'XinyueTeams' })
  const { loading, saving, withLoading, withSaving } = useXinyueAsync()
  const rows = ref<AdminTeam[]>([])
  const editorDialog = ref(false)
  const creditDialog = ref(false)
  const detailDrawer = ref(false)
  const detail = ref<AdminTeam | null>(null)
  const auditRows = ref<TeamAuditLog[]>([])
  const auditLoading = ref(false)
  const resourceLoading = ref(false)
  const resources = ref<AdminTeamResources | null>(null)
  const editor = reactive({
    id: '',
    name: '',
    seatLimit: 1,
    memberCount: 1,
    status: 'ACTIVE' as AdminTeam['status'],
    billingEnabled: false
  })
  const creditEditor = reactive({ id: '', name: '', amount: 0, reason: '' })
  const quotaSavingId = ref('')
  const activeCount = computed(() => rows.value.filter((item) => item.status === 'ACTIVE').length)
  const memberCount = computed(() => rows.value.reduce((sum, item) => sum + item._count.members, 0))
  const invitationCount = computed(() =>
    rows.value.reduce((sum, item) => sum + item.invitations.length, 0)
  )
  const totalCredits = computed(() =>
    rows.value.reduce((sum, item) => sum + (item.creditAccount?.balance || 0), 0)
  )
  const seatPercent = (row: AdminTeam) =>
    Math.min(100, Math.round((row._count.members / Math.max(1, row.seatLimit)) * 100))
  const formatTime = (value: string) => formatDateTime(value)
  async function load() {
    await withLoading(async () => {
      rows.value = await xinyueApi.teams()
    })
  }
  function openEditor(row: AdminTeam) {
    Object.assign(editor, {
      id: row.id,
      name: row.name,
      seatLimit: row.seatLimit,
      memberCount: row._count.members,
      status: row.status,
      billingEnabled: row.billingEnabled
    })
    editorDialog.value = true
  }
  async function save() {
    if (!editor.name) return ElMessage.warning(xt('请填写团队名称'))
    await withSaving(async () => {
      await xinyueApi.saveTeam(editor.id, {
        name: editor.name,
        seatLimit: editor.seatLimit,
        status: editor.status,
        billingEnabled: editor.billingEnabled
      })
      editorDialog.value = false
      await load()
    })
  }
  function openCredits(row: AdminTeam) {
    Object.assign(creditEditor, { id: row.id, name: row.name, amount: 0, reason: '' })
    creditDialog.value = true
  }
  async function adjustCredits() {
    if (!creditEditor.amount) return ElMessage.warning(xt('调整点数不能为 0'))
    if (creditEditor.reason.length < 2) return ElMessage.warning(xt('请填写调整原因'))
    await withSaving(async () => {
      await xinyueApi.adjustTeamCredits(creditEditor.id, {
        amount: creditEditor.amount,
        reason: creditEditor.reason
      })
      creditDialog.value = false
      await load()
    })
  }
  async function saveQuota(member: AdminTeam['members'][number]) {
    if (!detail.value) return
    quotaSavingId.value = member.userId
    try {
      await xinyueApi.saveTeamMemberQuota(detail.value.id, member.userId, member.monthlyCreditLimit)
      ElMessage.success(xt('成员月度限额已更新'))
      await load()
      detail.value = rows.value.find((item) => item.id === detail.value?.id) || detail.value
    } finally {
      quotaSavingId.value = ''
    }
  }
  async function openDetail(row: AdminTeam) {
    detail.value = row
    detailDrawer.value = true
    auditLoading.value = true
    resourceLoading.value = true
    resources.value = null
    try {
      const [audits, shared] = await Promise.all([
        xinyueApi.teamAuditLogs(row.id),
        xinyueApi.teamResources(row.id)
      ])
      auditRows.value = audits
      resources.value = shared
    } finally {
      auditLoading.value = false
      resourceLoading.value = false
    }
  }
  onMounted(load)
  onActivated(() => {
    if (rows.value.length) void load()
  })
</script>

<style scoped>
  .xinyue-page {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
  }
  .page-title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .page-title h1 {
    margin: 0 0 4px;
    font-size: 22px;
  }
  .page-title p {
    margin: 0;
    color: var(--art-gray-500);
  }
  .metric :deep(.el-card__body) {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .metric span {
    color: var(--art-gray-500);
  }
  .metric strong {
    font-size: 24px;
  }
  .art-table-card {
    flex: 1;
    min-height: 420px;
    overflow: hidden;
  }
  .block-note {
    display: block;
    margin-top: 3px;
    color: var(--art-gray-500);
    font-size: 12px;
  }
  .form-note {
    display: block;
    margin-top: 6px;
    color: var(--art-gray-500);
    font-size: 12px;
    line-height: 1.5;
  }
  .quota-editor {
    align-items: center;
    display: flex;
    gap: 8px;
  }
  .quota-editor :deep(.el-input-number) {
    min-width: 118px;
    width: 100%;
  }
  h3 {
    margin: 24px 0 10px;
    font-size: 15px;
  }
  .w-full {
    width: 100%;
  }
</style>
