<template>
  <div class="art-full-height xinyue-page users-page">
    <div class="page-title"
      ><div
        ><span class="page-eyebrow">{{ xt('客户目录') }}</span
        ><h1>{{ xt('用户管理') }}</h1
        ><p>{{ xt('客户账户、权益、分组和访问状态') }}</p></div
      ><ElTag effect="plain" class="user-count">{{ users.length }} {{ xt('位用户') }}</ElTag></div
    >
    <ElCard shadow="never" class="filter-card">
      <ElForm :inline="true" class="filter-form" @submit.prevent="loadUsers">
        <ElFormItem
          ><ElInput
            v-model.trim="filters.q"
            clearable
            class="search-field"
            :placeholder="xt('搜索用户名、邮箱、昵称或组织')"
            @keyup.enter="loadUsers"
            ><template #prefix><ArtSvgIcon icon="ri:search-line" /></template></ElInput
        ></ElFormItem>
        <ElFormItem
          ><ElSelect
            v-model="filters.status"
            clearable
            class="filter-select"
            :placeholder="xt('全部状态')"
            ><ElOption :label="xt('正常')" value="ACTIVE" /><ElOption
              :label="xt('已封禁')"
              value="SUSPENDED" /></ElSelect
        ></ElFormItem>
        <ElFormItem
          ><ElSelect
            v-model="filters.groupId"
            clearable
            class="filter-select"
            :placeholder="xt('全部用户分组')"
            ><ElOption
              v-for="group in groups"
              :key="group.id"
              :label="group.name"
              :value="group.id" /></ElSelect
        ></ElFormItem>
        <ElFormItem class="filter-actions"
          ><ElButton type="primary" :loading="loading" @click="loadUsers"
            ><ArtSvgIcon icon="ri:search-line" />{{ xt('查询') }}</ElButton
          ><ElButton @click="reset">{{ xt('重置') }}</ElButton></ElFormItem
        >
      </ElForm>
    </ElCard>
    <ElCard shadow="never" class="art-table-card compact-table-card">
      <ArtTableHeader :loading="loading" @refresh="loadUsers"
        ><template #left
          ><div class="table-heading"
            ><strong>{{ xt('客户列表') }}</strong
            ><span>{{ xt('账户与权益总览') }}</span></div
          ></template
        ></ArtTableHeader
      >
      <div class="table-scroll">
        <ElTable v-loading="loading" :data="users" class="data-table" row-key="id">
          <ElTableColumn :label="xt('客户')" :min-width="isCompact ? 150 : 220">
            <template #default="{ row }"
              ><div class="customer"
                ><span class="customer-marker" /><div
                  ><strong>{{ row.displayName || xt('未命名用户') }}</strong
                  ><small
                    >{{ row.email || (row.username ? `@${row.username}` : xt('未绑定邮箱'))
                    }}<template v-if="row.company"> · {{ row.company }}</template></small
                  ></div
                ></div
              ></template
            >
          </ElTableColumn>
          <ElTableColumn :label="xt('分组')" :min-width="isCompact ? 105 : 160"
            ><template #default="{ row }"
              ><ElSpace wrap
                ><ElTag
                  v-for="membership in row.groupMemberships"
                  :key="membership.group.id"
                  size="small"
                  effect="plain"
                  :type="membership.group.id === defaultGroup?.id ? 'success' : 'info'"
                  :color="
                    membership.group.id === defaultGroup?.id
                      ? undefined
                      : `${membership.group.color}12`
                  "
                  >{{ membership.group.name
                  }}<template v-if="membership.group.id === defaultGroup?.id">
                    · {{ xt('默认') }}</template
                  ></ElTag
                ><span v-if="!row.groupMemberships.length">{{ xt('未分组') }}</span></ElSpace
              ></template
            ></ElTableColumn
          >
          <ElTableColumn :label="xt('套餐')" :min-width="isCompact ? 88 : 115"
            ><template #default="{ row }"
              ><strong>{{ row.subscriptions[0]?.plan.name || xt('免费用户') }}</strong></template
            ></ElTableColumn
          >
          <ElTableColumn :label="xt('余额 / 用量')" :min-width="isCompact ? 105 : 135"
            ><template #default="{ row }"
              ><strong>{{ row.creditAccount?.balance || 0 }} {{ xt('点') }}</strong
              ><small class="block-note"
                >{{ row._count.jobs }} {{ xt('次任务') }} · {{ row._count.assets }}
                {{ xt('项资产') }}</small
              ></template
            ></ElTableColumn
          >
          <ElTableColumn v-if="!isCompact" :label="xt('最近登录')" width="155"
            ><template #default="{ row }">{{ date(row.lastLoginAt) }}</template></ElTableColumn
          >
          <ElTableColumn :label="xt('状态')" :width="isCompact ? 78 : 90"
            ><template #default="{ row }"
              ><ElTag :type="row.status === 'ACTIVE' ? 'success' : 'danger'" effect="light">{{
                row.status === 'ACTIVE' ? xt('正常') : xt('已封禁')
              }}</ElTag></template
            ></ElTableColumn
          >
          <ElTableColumn :label="xt('操作')" :width="isCompact ? 145 : 200" fixed="right"
            ><template #default="{ row }"
              ><ElButton link type="primary" @click="openUserEditor(row)">{{ xt('编辑') }}</ElButton
              ><ElButton link type="primary" @click="openCredits(row)">{{ xt('调余额') }}</ElButton
              ><ElDropdown @command="(command: string) => handleCommand(command, row)"
                ><ElButton link :aria-label="xt('更多用户操作')"
                  ><ArtSvgIcon icon="ri:more-2-fill" /></ElButton
                ><template #dropdown
                  ><ElDropdownMenu
                    ><ElDropdownItem command="sessions">{{ xt('撤销登录会话') }}</ElDropdownItem
                    ><ElDropdownItem
                      :command="row.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE'"
                      divided
                      >{{
                        row.status === 'ACTIVE' ? xt('封禁账户') : xt('解除封禁')
                      }}</ElDropdownItem
                    ></ElDropdownMenu
                  ></template
                ></ElDropdown
              ></template
            ></ElTableColumn
          >
        </ElTable>
      </div>
    </ElCard>

    <ElDialog v-model="creditDialog" :title="xt('调整用户余额')" width="460px">
      <ElForm label-position="top"
        ><ElFormItem :label="xt('用户')"
          ><ElInput
            :model-value="creditTarget?.displayName || creditTarget?.email || ''"
            disabled /></ElFormItem
        ><ElFormItem :label="xt('调整点数')"
          ><ElInputNumber
            v-model="creditForm.amount"
            :min="-100000"
            :max="100000"
            controls-position="right" /></ElFormItem
        ><ElFormItem :label="xt('调整原因')"
          ><ElInput
            v-model.trim="creditForm.reason"
            maxlength="200"
            show-word-limit
            :placeholder="xt('例如：套餐补偿、活动赠送')" /></ElFormItem
      ></ElForm>
      <template #footer
        ><ElButton @click="creditDialog = false">{{ xt('取消') }}</ElButton
        ><ElButton type="primary" :loading="saving" @click="saveCredits">{{
          xt('确认调整')
        }}</ElButton></template
      >
    </ElDialog>

    <ElDrawer v-model="editDrawer" :title="xt('编辑用户')" size="580px" destroy-on-close>
      <div v-loading="editLoading">
        <ElForm label-position="top" class="user-form">
          <ElRow :gutter="16"
            ><ElCol :span="12"
              ><ElFormItem :label="xt('用户名称')" required
                ><ElInput v-model.trim="userForm.displayName" maxlength="100" /></ElFormItem></ElCol
            ><ElCol :span="12"
              ><ElFormItem :label="xt('邮箱（可选）')"
                ><ElInput
                  v-model.trim="userForm.email"
                  type="email"
                  maxlength="320" /></ElFormItem></ElCol
          ></ElRow>
          <ElRow :gutter="16"
            ><ElCol :span="12"
              ><ElFormItem :label="xt('企业 / 组织')"
                ><ElInput v-model.trim="userForm.company" maxlength="120" /></ElFormItem></ElCol
            ><ElCol :span="12"
              ><ElFormItem :label="xt('联系电话')"
                ><ElInput v-model.trim="userForm.phone" maxlength="40" /></ElFormItem></ElCol
          ></ElRow>
          <ElAlert
            v-if="defaultGroup"
            type="info"
            :closable="false"
            show-icon
            class="group-hint"
            :title="`系统默认分组：${defaultGroup.name}`"
            :description="xt('这里可以单独调整该用户所属分组；新注册用户会自动进入系统默认分组。')"
          />
          <ElFormItem :label="xt('所属分组')" required
            ><ElSelect
              v-model="userForm.groupIds"
              multiple
              filterable
              collapse-tags
              collapse-tags-tooltip
              class="w-full"
              :placeholder="xt('至少选择一个用户分组')"
              ><ElOption
                v-for="group in groups"
                :key="group.id"
                :label="`${group.name}${group.isDefault ? ` (${xt('系统默认')})` : ''}${group.enabled ? '' : ` (${xt('已停用')})`}`"
                :value="group.id"
                :disabled="!group.enabled && !userForm.groupIds.includes(group.id)" /></ElSelect
            ><small class="field-help">{{
              xt('保存后立即应用该分组的模型权限、扣点倍率和 BYOK 策略。')
            }}</small></ElFormItem
          >
          <ElFormItem :label="xt('用户标签')"
            ><ElSelect
              v-model="userForm.tags"
              multiple
              filterable
              allow-create
              default-first-option
              class="w-full"
              :placeholder="xt('输入标签后回车')"
          /></ElFormItem>
          <ElFormItem :label="xt('管理员备注')"
            ><ElInput
              v-model.trim="userForm.adminNote"
              type="textarea"
              :rows="4"
              maxlength="4000"
              show-word-limit
          /></ElFormItem>
        </ElForm>
      </div>
      <template #footer
        ><div class="drawer-footer"
          ><ElButton type="danger" plain :disabled="!editTarget" @click="revokeSessions">{{
            xt('撤销全部会话')
          }}</ElButton
          ><span /><ElButton @click="editDrawer = false">{{ xt('取消') }}</ElButton
          ><ElButton type="primary" :loading="saving" :disabled="editLoading" @click="saveUser">{{
            xt('保存用户')
          }}</ElButton></div
        ></template
      >
    </ElDrawer>
  </div>
</template>

<script setup lang="ts">
  import { ElMessage, ElMessageBox } from 'element-plus'
  import { xinyueApi, type AdminUser, type UserGroup } from '@/api/xinyue'
  import { xinyueLocale, xinyueText as xt } from '@/locales/xinyue'
  defineOptions({ name: 'XinyueUsers' })
  const users = ref<AdminUser[]>([])
  const groups = ref<UserGroup[]>([])
  const loading = ref(false)
  const saving = ref(false)
  const filters = reactive({ q: '', status: '', groupId: '' })
  const creditDialog = ref(false)
  const creditTarget = ref<AdminUser | null>(null)
  const creditForm = reactive({ amount: 0, reason: '' })
  const editDrawer = ref(false)
  const editLoading = ref(false)
  const editTarget = ref<AdminUser | null>(null)
  const userForm = reactive({
    displayName: '',
    email: '',
    company: '',
    phone: '',
    tags: [] as string[],
    adminNote: '',
    groupIds: [] as string[]
  })
  const defaultGroup = computed(() => groups.value.find((group) => group.isDefault))
  const isCompact = ref(false)
  const date = (value?: string | null) =>
    value
      ? new Intl.DateTimeFormat(xinyueLocale(), { dateStyle: 'medium', timeStyle: 'short' }).format(
          new Date(value)
        )
      : xt('从未登录')
  async function loadUsers() {
    loading.value = true
    try {
      const params = Object.fromEntries(Object.entries(filters).filter(([, value]) => value))
      users.value = await xinyueApi.users(params)
    } finally {
      loading.value = false
    }
  }
  async function load() {
    groups.value = await xinyueApi.groups()
    await loadUsers()
  }
  function reset() {
    Object.assign(filters, { q: '', status: '', groupId: '' })
    void loadUsers()
  }
  function openCredits(user: AdminUser) {
    creditTarget.value = user
    Object.assign(creditForm, { amount: 0, reason: '' })
    creditDialog.value = true
  }
  async function openUserEditor(user: AdminUser) {
    editTarget.value = user
    editDrawer.value = true
    editLoading.value = true
    try {
      const detail = await xinyueApi.user(user.id)
      Object.assign(userForm, {
        displayName: detail.displayName || '',
        email: detail.email || '',
        company: detail.company || '',
        phone: detail.phone || '',
        tags: [...(detail.tags || [])],
        adminNote: detail.adminNote || '',
        groupIds: detail.groupMemberships.map((item) => item.group.id)
      })
    } finally {
      editLoading.value = false
    }
  }
  async function saveUser() {
    if (!editTarget.value || !userForm.displayName) return ElMessage.warning(xt('请填写用户名称'))
    if (!userForm.groupIds.length) return ElMessage.warning(xt('请至少选择一个用户分组'))
    saving.value = true
    try {
      const profile = {
        displayName: userForm.displayName,
        ...(userForm.email ? { email: userForm.email } : {}),
        company: userForm.company,
        phone: userForm.phone,
        tags: userForm.tags,
        adminNote: userForm.adminNote
      }
      await xinyueApi.updateUserProfile(editTarget.value.id, profile)
      await xinyueApi.updateUserGroups(editTarget.value.id, userForm.groupIds)
      editDrawer.value = false
      ElMessage.success(xt('用户资料和分组已更新'))
      await loadUsers()
    } finally {
      saving.value = false
    }
  }
  async function revokeSessions() {
    if (!editTarget.value) return
    await ElMessageBox.confirm(
      `${xt('确认撤销')} "${editTarget.value.displayName}" ${xt('的全部登录会话？')}`,
      xt('撤销登录会话'),
      { type: 'warning' }
    )
    await xinyueApi.revokeUserSessions(editTarget.value.id)
  }
  async function saveCredits() {
    if (!creditTarget.value || !creditForm.amount || creditForm.reason.length < 2)
      return ElMessage.warning(xt('请填写调整点数和原因'))
    saving.value = true
    try {
      await xinyueApi.adjustCredits(creditTarget.value.id, creditForm.amount, creditForm.reason)
      creditDialog.value = false
      await loadUsers()
    } finally {
      saving.value = false
    }
  }
  async function handleCommand(status: string, user: AdminUser) {
    if (status === 'sessions') {
      editTarget.value = user
      return revokeSessions()
    }
    await ElMessageBox.confirm(
      `${xt('确认')}${status === 'SUSPENDED' ? xt('封禁') : xt('解除封禁')} "${user.displayName || user.email}"?`,
      xt('账户状态'),
      { type: 'warning' }
    )
    await xinyueApi.setUserStatus(user.id, status as AdminUser['status'])
    await loadUsers()
  }
  function updateCompact() {
    isCompact.value = window.innerWidth <= 1200
  }
  onMounted(() => {
    updateCompact()
    window.addEventListener('resize', updateCompact)
    void load()
  })
  onBeforeUnmount(() => window.removeEventListener('resize', updateCompact))
</script>

<style scoped>
  .xinyue-page {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
    max-width: 100%;
    overflow: hidden;
  }

  .page-title {
    display: flex;
    gap: 12px;
    align-items: center;
    justify-content: space-between;
    min-width: 0;
  }

  .page-title > div {
    min-width: 0;
  }

  .page-eyebrow {
    display: block;
    margin-bottom: 5px;
    font-size: 12px;
    font-weight: 600;
    line-height: 1;
    color: var(--theme-color);
  }

  .page-title h1 {
    margin: 0 0 4px;
    font-size: 24px;
  }

  .page-title p {
    margin: 0;
    color: var(--art-gray-500);
  }

  .user-count {
    flex: 0 0 auto;
    padding: 0 10px;
    font-weight: 600;
  }

  .filter-card {
    min-width: 0;
    max-width: 100%;
  }

  .filter-card :deep(.el-card__body) {
    padding: 16px 20px 2px;
  }

  .filter-card :deep(.el-form-item) {
    margin-right: 10px;
    margin-bottom: 14px;
  }

  .search-field {
    width: 270px;
  }

  .filter-select {
    width: 150px;
  }

  .filter-actions {
    margin-right: 0 !important;
  }

  .compact-table-card {
    flex: 0 0 auto;
    min-width: 0;
    max-width: 100%;
    overflow: hidden;
  }

  .compact-table-card :deep(.el-card__body) {
    min-width: 0;
    max-width: 100%;
    height: auto;
    overflow: hidden;
  }

  .table-heading {
    display: grid;
    gap: 3px;
  }

  .table-heading strong {
    font-size: 16px;
    color: var(--art-gray-900);
  }

  .table-heading span {
    font-size: 12px;
    color: var(--art-gray-500);
  }

  .table-scroll {
    width: 100%;
    min-width: 0;
    max-width: 100%;
    overflow: hidden;
  }

  .data-table {
    width: 100%;
    min-width: 0 !important;
  }

  .customer {
    display: flex;
    gap: 10px;
    align-items: center;
    min-width: 0;
  }

  .customer-marker {
    flex: 0 0 8px;
    width: 8px;
    height: 8px;
    background: var(--theme-color);
    border-radius: 50%;
    opacity: 0.72;
  }

  .customer div {
    display: grid;
    gap: 3px;
    min-width: 0;
  }

  .customer strong,
  .customer small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .customer small,
  .block-note {
    font-size: 12px;
    color: var(--art-gray-500);
  }

  .block-note {
    display: block;
    margin-top: 3px;
  }

  .w-full {
    width: 100%;
  }

  .group-hint {
    margin-bottom: 18px;
  }

  .field-help {
    display: block;
    width: 100%;
    margin-top: 7px;
    font-size: 12px;
    line-height: 1.5;
    color: var(--art-gray-500);
  }

  .drawer-footer {
    display: grid;
    grid-template-columns: auto 1fr auto auto;
    gap: 10px;
    align-items: center;
    width: 100%;
  }

  @media (width <= 800px) {
    .page-title {
      flex-wrap: wrap;
      align-items: flex-start;
    }

    .page-title h1 {
      font-size: 21px;
    }

    .page-title :deep(.el-tag) {
      margin-left: auto;
    }

    .search-field,
    .filter-select {
      width: min(100%, 300px);
    }
  }
</style>
