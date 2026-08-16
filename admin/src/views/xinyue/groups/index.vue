<template>
  <div class="xinyue-page groups-page">
    <header class="page-title">
      <div
        ><span class="page-eyebrow">{{ xt('权限与计费') }}</span
        ><h1>{{ xt('用户分组与权限') }}</h1
        ><p>{{ xt('统一配置新用户归属、模型白名单、计费倍率和 BYOK 权限') }}</p></div
      >
      <ElButton type="primary" @click="openCreate"
        ><ArtSvgIcon icon="ri:add-line" />{{ xt('新增分组') }}</ElButton
      >
    </header>

    <div class="default-group-bar">
      <div
        ><ArtSvgIcon icon="ri:user-star-line" /><div
          ><span class="bar-kicker">{{ xt('默认归属') }}</span
          ><strong>{{ xt('新用户默认分组') }}</strong
          ><small>{{ xt('未指定分组的新注册用户会自动加入，可随时切换。') }}</small></div
        ></div
      >
      <ElSelect
        :model-value="defaultGroup?.id || ''"
        :loading="saving"
        class="default-group-select"
        :placeholder="xt('选择默认分组')"
        :aria-label="xt('选择新用户默认分组')"
        @change="changeDefaultGroup"
        ><template #prefix><ArtSvgIcon icon="ri:checkbox-circle-line" /></template
        ><ElOption
          v-for="group in enabledGroups"
          :key="group.id"
          :label="`${group.name} (${group._count.members} ${xt('人')})`"
          :value="group.id"
          ><div class="default-option"
            ><strong>{{ group.name }}</strong
            ><small>{{ group._count.members }} {{ xt('位成员') }}</small></div
          ></ElOption
        ></ElSelect
      >
    </div>

    <ElCard shadow="never" class="art-table-card compact-table-card">
      <ArtTableHeader :loading="loading" @refresh="load"
        ><template #left
          ><div class="table-heading"
            ><strong>{{ xt('分组列表') }}</strong
            ><span>{{ xt('策略、成员与可用能力') }}</span></div
          ></template
        ></ArtTableHeader
      >
      <div class="table-scroll"
        ><ElTable v-loading="loading" :data="groups" class="data-table" row-key="id">
          <ElTableColumn :label="xt('分组')" :min-width="isCompact ? 150 : 200"
            ><template #default="{ row }"
              ><div class="group-name"
                ><i :style="{ background: row.color }" /><div
                  ><strong>{{ row.name }}</strong
                  ><ElTag v-if="row.isDefault" size="small" type="success">{{ xt('默认') }}</ElTag
                  ><small>{{ row.description || xt('暂无说明') }}</small></div
                ></div
              ></template
            ></ElTableColumn
          >
          <ElTableColumn :label="xt('成员')" :width="isCompact ? 75 : 90"
            ><template #default="{ row }"
              ><ElButton link type="primary" @click="openMembers(row)"
                >{{ row._count.members }} {{ xt('人') }}</ElButton
              ></template
            ></ElTableColumn
          >
          <ElTableColumn v-if="!isCompact" :label="xt('模型范围')" min-width="130"
            ><template #default="{ row }"
              ><strong>{{
                row.restrictModels ? `${row._count.modelAccess} ${xt('个模型')}` : xt('全部模型')
              }}</strong
              ><small class="note">{{
                row.restrictModels ? xt('独立白名单') : xt('跟随模型目录')
              }}</small></template
            ></ElTableColumn
          >
          <ElTableColumn :label="xt('计费倍率')" :width="isCompact ? 85 : 100"
            ><template #default="{ row }">{{ row.creditRatePercent }}%</template></ElTableColumn
          >
          <ElTableColumn :label="xt('用户密钥')" :width="isCompact ? 82 : 95"
            ><template #default="{ row }"
              ><ElTag :type="row.allowUserByok ? 'success' : 'info'">{{
                row.allowUserByok ? xt('允许') : xt('禁用')
              }}</ElTag></template
            ></ElTableColumn
          >
          <ElTableColumn :label="xt('状态')" :width="isCompact ? 75 : 85"
            ><template #default="{ row }"
              ><ElTag :type="row.enabled ? 'success' : 'info'">{{
                row.enabled ? xt('启用') : xt('停用')
              }}</ElTag></template
            ></ElTableColumn
          >
          <ElTableColumn :label="xt('操作')" :width="isCompact ? 150 : 230" fixed="right"
            ><template #default="{ row }"
              ><ElButton v-if="!row.isDefault" link type="success" @click="setDefault(row)">{{
                xt('默认')
              }}</ElButton
              ><ElButton link type="primary" @click="openPolicy(row)">{{ xt('策略') }}</ElButton
              ><ElButton link @click="openEdit(row)">{{ xt('编辑') }}</ElButton
              ><ElDropdown @command="(command: string) => commandGroup(command, row)"
                ><ElButton link :aria-label="xt('更多分组操作')"
                  ><ArtSvgIcon icon="ri:more-2-fill" /></ElButton
                ><template #dropdown
                  ><ElDropdownMenu
                    ><ElDropdownItem command="members">{{ xt('管理成员') }}</ElDropdownItem
                    ><ElDropdownItem v-if="!row.isDefault" command="delete" divided>{{
                      xt('删除分组')
                    }}</ElDropdownItem></ElDropdownMenu
                  ></template
                ></ElDropdown
              ></template
            ></ElTableColumn
          >
        </ElTable></div
      >
    </ElCard>

    <ElDialog
      v-model="editDialog"
      :title="xt(groupForm.id ? '编辑用户分组' : '新增用户分组')"
      width="560px"
    >
      <ElForm label-position="top"
        ><ElFormItem :label="xt('分组名称')"
          ><ElInput v-model.trim="groupForm.name" maxlength="40" /></ElFormItem
        ><ElFormItem :label="xt('分组说明')"
          ><ElInput
            v-model.trim="groupForm.description"
            type="textarea"
            :rows="3"
            maxlength="500"
            show-word-limit /></ElFormItem
        ><ElRow :gutter="16"
          ><ElCol :span="12"
            ><ElFormItem :label="xt('标识颜色')"
              ><ElColorPicker v-model="groupForm.color" /></ElFormItem></ElCol
          ><ElCol v-if="groupForm.id" :span="12"
            ><ElFormItem :label="xt('启用状态')"
              ><ElSwitch v-model="groupForm.enabled" /></ElFormItem></ElCol></ElRow
        ><ElCheckbox
          v-model="makeDefault"
          :disabled="
            Boolean(groupForm.id && groups.find((item) => item.id === groupForm.id)?.isDefault)
          "
          >{{ xt('保存后设为新用户默认分组') }}</ElCheckbox
        ></ElForm
      >
      <template #footer
        ><ElButton @click="editDialog = false">{{ xt('取消') }}</ElButton
        ><ElButton type="primary" :loading="saving" @click="saveGroup">{{
          xt('保存分组')
        }}</ElButton></template
      >
    </ElDialog>

    <ElDrawer v-model="policyDrawer" :title="xt('分组权限策略')" size="560px">
      <template v-if="policyGroup"
        ><ElAlert
          :title="policyGroup.name"
          :description="policyGroup.description || xt('配置将立即应用到该组全部用户')"
          :closable="false"
        /><ElForm label-position="top" class="drawer-form"
          ><ElFormItem :label="xt('模型访问范围')"
            ><ElSwitch
              v-model="policy.restrictModels"
              :active-text="xt('仅允许白名单')"
              :inactive-text="xt('允许全部启用模型')" /></ElFormItem
          ><ElFormItem :label="xt('允许用户自带 API 密钥')"
            ><ElSwitch v-model="policy.allowUserByok" /></ElFormItem
          ><ElFormItem :label="xt('扣点倍率')"
            ><div class="rate"
              ><ElSlider
                v-model="policy.creditRatePercent"
                :min="0"
                :max="500"
                :step="5"
              /><ElInputNumber v-model="policy.creditRatePercent" :min="0" :max="1000" />%</div
            ></ElFormItem
          ><ElFormItem v-if="policy.restrictModels" :label="xt('模型白名单')"
            ><ElCheckboxGroup v-model="policy.modelPresetIds" class="model-list"
              ><ElCheckbox v-for="model in enabledModels" :key="model.id" :value="model.id"
                ><span>{{ model.displayName }}</span
                ><small
                  >{{ xt(capabilityText[model.capability]) }} · {{ model.flatCreditCost }}
                  {{ xt('点 / 次') }}</small
                ></ElCheckbox
              ></ElCheckboxGroup
            ></ElFormItem
          ></ElForm
        ></template
      >
      <template #footer
        ><ElButton @click="policyDrawer = false">{{ xt('取消') }}</ElButton
        ><ElButton type="primary" :loading="saving" @click="savePolicy">{{
          xt('保存策略')
        }}</ElButton></template
      >
    </ElDrawer>

    <ElDrawer
      v-model="memberDrawer"
      :title="`${memberGroup?.name || ''} · ${xt('成员管理')}`"
      size="620px"
    >
      <div class="member-toolbar"
        ><ElSelect
          v-model="selectedUsers"
          multiple
          filterable
          collapse-tags
          :placeholder="xt('选择要加入的用户')"
          ><ElOption
            v-for="user in availableUsers"
            :key="user.id"
            :label="`${user.displayName} · ${user.email || xt('无邮箱')}`"
            :value="user.id" /></ElSelect
        ><ElButton type="primary" :disabled="!selectedUsers.length" @click="addMembers">{{
          xt('添加')
        }}</ElButton></div
      >
      <ElTable v-loading="memberLoading" :data="members" row-key="user.id"
        ><ElTableColumn :label="xt('用户')"
          ><template #default="{ row }"
            ><strong>{{ row.user.displayName }}</strong
            ><small class="note">{{ row.user.email || xt('未绑定邮箱') }}</small></template
          ></ElTableColumn
        ><ElTableColumn :label="xt('状态')" width="90"
          ><template #default="{ row }"
            ><ElTag :type="row.user.status === 'ACTIVE' ? 'success' : 'danger'">{{
              row.user.status === 'ACTIVE' ? xt('正常') : xt('封禁')
            }}</ElTag></template
          ></ElTableColumn
        ><ElTableColumn :label="xt('操作')" width="80"
          ><template #default="{ row }"
            ><ElButton link type="danger" @click="removeMember(row.user.id)">{{
              xt('移出')
            }}</ElButton></template
          ></ElTableColumn
        ></ElTable
      >
    </ElDrawer>
  </div>
</template>

<script setup lang="ts">
  import { ElMessage, ElMessageBox } from 'element-plus'
  import { xinyueApi, type AdminUser, type ModelPreset, type UserGroup } from '@/api/xinyue'
  import { xinyueText as xt } from '@/locales/xinyue'
  defineOptions({ name: 'XinyueGroups' })
  const groups = ref<UserGroup[]>([])
  const users = ref<AdminUser[]>([])
  const models = ref<ModelPreset[]>([])
  const loading = ref(false)
  const saving = ref(false)
  const editDialog = ref(false)
  const policyDrawer = ref(false)
  const memberDrawer = ref(false)
  const memberLoading = ref(false)
  const groupForm = reactive({ id: '', name: '', description: '', color: '#397157', enabled: true })
  const makeDefault = ref(false)
  const isCompact = ref(false)
  const policyGroup = ref<UserGroup | null>(null)
  const policy = reactive({
    restrictModels: false,
    creditRatePercent: 100,
    allowUserByok: true,
    modelPresetIds: [] as string[]
  })
  const memberGroup = ref<UserGroup | null>(null)
  const members = ref<Array<{ user: AdminUser }>>([])
  const selectedUsers = ref<string[]>([])
  const defaultGroup = computed(() => groups.value.find((item) => item.isDefault))
  const enabledGroups = computed(() => groups.value.filter((item) => item.enabled))
  const enabledModels = computed(() => models.value.filter((item) => item.enabled))
  const availableUsers = computed(() => {
    const ids = new Set(members.value.map((item) => item.user.id))
    return users.value.filter((item) => !ids.has(item.id))
  })
  const capabilityText = {
    CHAT: '对话',
    IMAGE: '图片',
    VIDEO: '视频',
    COMMERCE: '商品视觉'
  } as const
  async function load() {
    loading.value = true
    try {
      ;[groups.value, users.value, models.value] = await Promise.all([
        xinyueApi.groups(),
        xinyueApi.users(),
        xinyueApi.models()
      ])
    } finally {
      loading.value = false
    }
  }
  function openCreate() {
    Object.assign(groupForm, { id: '', name: '', description: '', color: '#397157', enabled: true })
    makeDefault.value = false
    editDialog.value = true
  }
  function openEdit(row: UserGroup) {
    Object.assign(groupForm, {
      id: row.id,
      name: row.name,
      description: row.description,
      color: row.color,
      enabled: row.enabled
    })
    makeDefault.value = Boolean(row.isDefault)
    editDialog.value = true
  }
  async function saveGroup() {
    if (!groupForm.name) return ElMessage.warning(xt('请填写分组名称'))
    saving.value = true
    try {
      const { id, ...body } = groupForm
      const payload = id
        ? body
        : { name: body.name, description: body.description, color: body.color }
      const saved = await xinyueApi.saveGroup(payload, id || undefined)
      if (makeDefault.value && !saved.isDefault) await xinyueApi.setDefaultGroup(saved.id)
      editDialog.value = false
      await load()
    } finally {
      saving.value = false
    }
  }
  function openPolicy(row: UserGroup) {
    policyGroup.value = row
    Object.assign(policy, {
      restrictModels: row.restrictModels,
      creditRatePercent: row.creditRatePercent,
      allowUserByok: row.allowUserByok,
      modelPresetIds: row.modelAccess.map((item) => item.modelPresetId)
    })
    policyDrawer.value = true
  }
  async function savePolicy() {
    if (!policyGroup.value) return
    saving.value = true
    try {
      await xinyueApi.saveGroupPolicy(policyGroup.value.id, { ...policy })
      policyDrawer.value = false
      await load()
    } finally {
      saving.value = false
    }
  }
  async function openMembers(row: UserGroup) {
    memberGroup.value = row
    selectedUsers.value = []
    memberDrawer.value = true
    memberLoading.value = true
    try {
      members.value = await xinyueApi.groupMembers(row.id)
    } finally {
      memberLoading.value = false
    }
  }
  async function addMembers() {
    if (!memberGroup.value) return
    await xinyueApi.addGroupMembers(memberGroup.value.id, selectedUsers.value)
    await openMembers(memberGroup.value)
    await load()
  }
  async function removeMember(userId: string) {
    if (!memberGroup.value) return
    await xinyueApi.removeGroupMember(memberGroup.value.id, userId)
    await openMembers(memberGroup.value)
    await load()
  }
  async function setDefault(row: UserGroup) {
    await ElMessageBox.confirm(
      `${xt('将')} "${row.name}" ${xt('设为新用户默认分组？')}`,
      xt('默认分组')
    )
    await xinyueApi.setDefaultGroup(row.id)
    await load()
  }
  async function changeDefaultGroup(groupId: string) {
    const row = groups.value.find((item) => item.id === groupId)
    if (!row || row.isDefault) return
    await setDefault(row)
  }
  async function commandGroup(command: string, row: UserGroup) {
    if (command === 'members') return openMembers(row)
    await ElMessageBox.confirm(`${xt('确认删除')} "${row.name}"?`, xt('删除分组'), {
      type: 'warning'
    })
    await xinyueApi.deleteGroup(row.id)
    await load()
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
    gap: 16px;
    min-width: 0;
    max-width: 100%;
  }

  .page-title {
    display: flex;
    gap: 16px;
    align-items: center;
    justify-content: space-between;
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

  .page-title p,
  .note {
    display: block;
    margin: 3px 0 0;
    font-size: 12px;
    color: var(--art-gray-500);
  }

  .default-group-bar {
    display: flex;
    gap: 20px;
    align-items: center;
    justify-content: space-between;
    padding: 16px 18px;
    background: color-mix(in srgb, var(--el-color-success) 5%, var(--default-box-color));
    border: 1px solid color-mix(in srgb, var(--el-color-success) 28%, var(--art-card-border));
    border-radius: 8px;
  }

  .default-group-bar > div {
    display: flex;
    gap: 12px;
    align-items: center;
    min-width: 0;
  }

  .default-group-bar > div > svg {
    flex: 0 0 auto;
    font-size: 25px;
    color: var(--el-color-success);
  }

  .bar-kicker {
    display: block;
    margin-bottom: 3px;
    font-size: 12px;
    font-weight: 600;
    color: var(--el-color-success);
  }

  .default-group-bar strong,
  .default-group-bar small {
    display: block;
  }

  .default-group-bar small {
    margin-top: 3px;
    font-size: 12px;
    color: var(--art-gray-500);
  }

  .default-group-select {
    flex: 0 0 280px;
    width: 280px;
  }

  .default-group-select :deep(.el-select__wrapper),
  .default-group-select :deep(.el-input__wrapper) {
    width: 100%;
    min-height: 44px;
    padding: 0 14px;
    background: var(--default-box-color);
    border: 1px solid color-mix(in srgb, var(--el-color-success) 45%, var(--art-card-border));
    border-radius: 8px;
    box-shadow: 0 1px 2px rgb(0 0 0 / 4%);
  }

  .default-group-select :deep(.el-input__wrapper:hover),
  .default-group-select :deep(.is-focus) {
    border-color: var(--el-color-success);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--el-color-success) 12%, transparent);
  }

  .default-group-select :deep(.el-select__prefix) {
    color: var(--el-color-success);
  }

  .default-option {
    display: flex;
    gap: 12px;
    align-items: center;
    justify-content: space-between;
  }

  .default-option small {
    color: var(--art-gray-500);
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
    overflow: hidden;
  }

  .data-table {
    width: 100%;
    min-width: 0 !important;
  }

  .group-name {
    display: flex;
    gap: 10px;
    align-items: center;
    min-width: 0;
  }

  .group-name > i {
    flex: 0 0 10px;
    width: 10px;
    height: 38px;
    border-radius: 3px;
  }

  .group-name > div {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 3px 7px;
    align-items: center;
    min-width: 0;
  }

  .group-name strong,
  .group-name small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .group-name small {
    grid-column: 1/-1;
    color: var(--art-gray-500);
  }

  .drawer-form {
    margin-top: 20px;
  }

  .rate {
    display: grid;
    grid-template-columns: 1fr 130px auto;
    gap: 14px;
    align-items: center;
    width: 100%;
  }

  .model-list {
    display: grid;
    gap: 8px;
    width: 100%;
  }

  .model-list :deep(.el-checkbox) {
    height: auto;
    padding: 10px;
    margin: 0;
    border: 1px solid var(--art-gray-200);
    border-radius: 6px;
  }

  .model-list small {
    display: block;
    color: var(--art-gray-500);
  }

  .member-toolbar {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 10px;
    margin-bottom: 16px;
  }

  @media (width <= 700px) {
    .page-title,
    .default-group-bar {
      flex-direction: column;
      align-items: flex-start;
    }

    .page-title h1 {
      font-size: 21px;
    }

    .default-group-select {
      flex-basis: auto;
      width: 100%;
    }

    .rate {
      grid-template-columns: 1fr 110px auto;
    }
  }
</style>
