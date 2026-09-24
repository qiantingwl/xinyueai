<template>
  <div class="art-full-height xinyue-page operation-page">
    <ArtSearchBar
      v-model="filters"
      :items="searchItems"
      :show-expand="false"
      @search="applySearch"
      @reset="resetSearch"
    />

    <ElCard class="art-table-card" shadow="never">
      <ArtTableHeader :loading="loading" @refresh="load">
        <template #left>
          <div class="resource-heading">
            <span class="resource-icon"><ArtSvgIcon :icon="config.icon" /></span>
            <div>
              <strong>{{ xt(config.title) }}</strong>
              <p>{{ xt(config.description) }}</p>
            </div>
          </div>
        </template>
        <template #right>
          <div class="resource-actions">
            <ElTag effect="plain">{{ filteredRows.length }}{{ xt('条记录') }}</ElTag>
            <ElButton v-if="resourceKey === 'promptTemplates'" @click="restorePromptTemplates">{{
              xt('恢复默认模板')
            }}</ElButton>
            <ElButton v-if="capabilityPresetResource" @click="restoreCapabilityPresets">{{
              xt(capabilityPresetLabels[capabilityPresetResource])
            }}</ElButton>
            <ElButton v-if="resourceKey === 'promptLibrary'" @click="openPromptSources">{{
              xt('来源配置')
            }}</ElButton>
            <ElButton v-if="resourceKey === 'promptLibrary'" @click="refreshPromptLibrary">{{
              xt('刷新提示词源')
            }}</ElButton>
            <ElButton v-if="resourceKey === 'moderationRules'" @click="openModerationPolicy">{{
              xt('审核策略')
            }}</ElButton>
            <ElButton v-if="resourceKey === 'alerts'" @click="evaluateAlerts">{{
              xt('立即检测')
            }}</ElButton>
            <ElButton v-if="editorConfig?.canCreate" type="primary" @click="openEditor()">
              <ArtSvgIcon icon="ri:add-line" />
              {{ xt(editorConfig.createLabel || '新增') }}
            </ElButton>
          </div>
        </template>
      </ArtTableHeader>

      <ElTable
        v-loading="loading"
        :data="pagedRows"
        height="100%"
        row-key="id"
        :table-layout="isCompact ? 'fixed' : 'auto'"
      >
        <ElTableColumn
          v-for="column in config.columns"
          :key="column.key"
          :label="xt(column.label)"
          :min-width="isCompact ? undefined : column.minWidth"
          :width="isCompact ? undefined : column.width"
          show-overflow-tooltip
        >
          <template #default="{ row }">
            <div v-if="column.type === 'image'" class="table-image-cell">
              <ElImage
                v-if="rowCover(row)"
                :src="rowCover(row)"
                fit="cover"
                class="table-cover"
                :preview-src-list="rowPreviewList(row)"
                :initial-index="0"
                preview-teleported
              />
              <span v-else class="image-placeholder">
                <ArtSvgIcon icon="ri:image-line" />
              </span>
              <small v-if="row.uploadedPreviewImages?.length">
                +{{ row.uploadedPreviewImages.length }} {{ xt('张预览') }}
              </small>
            </div>
            <ElTag
              v-else-if="column.type === 'status'"
              :type="statusType(valueAt(row, column.key))"
              effect="light"
            >
              {{ statusText(valueAt(row, column.key)) }}
            </ElTag>
            <span v-else-if="column.type === 'date'">{{
              formatDate(valueAt(row, column.key))
            }}</span>
            <span v-else-if="column.type === 'bytes'">{{
              formatBytes(Number(valueAt(row, column.key) || 0))
            }}</span>
            <span v-else-if="column.type === 'number'">{{
              formatNumber(Number(valueAt(row, column.key) || 0))
            }}</span>
            <span v-else>{{ displayValue(valueAt(row, column.key)) }}</span>
          </template>
        </ElTableColumn>
        <ElTableColumn
          :label="xt('操作')"
          :width="isCompact ? 150 : 230"
          fixed="right"
          align="right"
        >
          <template #default="{ row }">
            <ElButton link type="primary" @click="showDetail(row)">{{ xt('查看') }}</ElButton>
            <ElButton v-if="editorConfig?.canEdit" link type="primary" @click="openEditor(row)">{{
              xt('编辑')
            }}</ElButton>
            <ElButton
              v-if="resourceKey === 'projects'"
              link
              type="primary"
              @click="openProject(row)"
              >{{ xt('工作流') }}</ElButton
            >
            <ElButton
              v-if="resourceKey === 'toolApprovals' && row.status === 'PENDING'"
              link
              type="success"
              @click="reviewToolApproval(row, 'APPROVED')"
              >{{ xt('批准') }}</ElButton
            >
            <ElButton
              v-if="resourceKey === 'toolApprovals' && row.status === 'PENDING'"
              link
              type="danger"
              @click="reviewToolApproval(row, 'REJECTED')"
              >{{ xt('拒绝') }}</ElButton
            >
            <ElButton
              v-if="resourceKey === 'support'"
              link
              type="primary"
              @click="openTicket(row)"
              >{{ xt('处理') }}</ElButton
            >
            <ElButton v-if="canCancel(row)" link type="warning" @click="cancelJob(row)">{{
              xt('取消')
            }}</ElButton>
            <ElButton v-if="canRetry(row)" link type="primary" @click="retryJob(row)">{{
              xt('重试')
            }}</ElButton>
            <ElButton
              v-if="
                resourceKey === 'notificationDeliveries' &&
                row.status === 'FAILED' &&
                Number(row.attempts || 0) < 5
              "
              link
              type="primary"
              @click="retryNotification(row)"
              >{{ xt('重试') }}</ElButton
            >
            <ElButton
              v-if="resourceKey === 'assets'"
              link
              type="danger"
              @click="removeAsset(row)"
              >{{ xt('删除') }}</ElButton
            >
            <ElButton
              v-if="canAcknowledge(row)"
              link
              type="warning"
              @click="updateAlert(row, 'acknowledge')"
              >{{ xt('确认') }}</ElButton
            >
            <ElButton
              v-if="canResolve(row)"
              link
              type="success"
              @click="updateAlert(row, 'resolve')"
              >{{ xt('解决') }}</ElButton
            >
            <ElButton
              v-if="resourceKey === 'alertRules'"
              link
              type="warning"
              @click="muteAlertRule(row)"
              >{{ xt('静默') }}</ElButton
            >
            <ElDropdown
              v-if="resourceKey === 'moderation' && row.status === 'OPEN' && !row.appeal"
              @command="(command: string) => resolveModeration(row, command)"
            >
              <ElButton link type="warning"
                >{{ xt('处置') }}<ArtSvgIcon icon="ri:arrow-down-s-line"
              /></ElButton>
              <template #dropdown
                ><ElDropdownMenu
                  ><ElDropdownItem command="APPROVED">{{ xt('批准') }}</ElDropdownItem
                  ><ElDropdownItem command="DISMISSED">{{
                    xt('驳回')
                  }}</ElDropdownItem></ElDropdownMenu
                ></template
              >
            </ElDropdown>
            <ElDropdown
              v-if="
                resourceKey === 'moderation' &&
                ['PENDING', 'IN_REVIEW'].includes(row.appeal?.status)
              "
              @command="(command: string) => reviewModerationAppeal(row, command)"
            >
              <ElButton link type="primary"
                >{{ xt('复核申诉') }}<ArtSvgIcon icon="ri:arrow-down-s-line"
              /></ElButton>
              <template #dropdown
                ><ElDropdownMenu
                  ><ElDropdownItem v-if="row.appeal.status === 'PENDING'" command="IN_REVIEW">{{
                    xt('开始复核')
                  }}</ElDropdownItem
                  ><ElDropdownItem command="APPROVED">{{ xt('通过申诉') }}</ElDropdownItem
                  ><ElDropdownItem command="REJECTED">{{
                    xt('驳回申诉')
                  }}</ElDropdownItem></ElDropdownMenu
                ></template
              >
            </ElDropdown>
            <ElButton
              v-if="editorConfig?.canDelete"
              link
              type="danger"
              @click="removeResource(row)"
              >{{ xt(resourceKey === 'promptLibrary' ? '重置' : '删除') }}</ElButton
            >
          </template>
        </ElTableColumn>
      </ElTable>

      <div class="table-footer">
        <ElPagination
          v-model:current-page="page"
          v-model:page-size="pageSize"
          :page-sizes="[20, 50, 100]"
          :total="paginationTotal"
          layout="total, sizes, prev, pager, next, jumper"
        />
      </div>
    </ElCard>

    <OperationDetailDrawer
      v-model="detailVisible"
      :title="config.title"
      :resource-key="resourceKey"
      :row="detailRow"
      :items="detailItems"
      :status-text="statusText"
      :status-type="statusType"
    />

    <ResourceEditorDrawer
      v-model="editorVisible"
      :config-title="config.title"
      :resource-key="resourceKey"
      :editor-config="editorConfig"
      :editing-row="editingRow"
      :form="editorForm"
      :fields="visibleEditorFields"
      :saving="saving"
      :tool-icon-preview-url="toolIconPreviewUrl"
      :tool-icon-file="toolIconFile"
      :cover-file="coverFile"
      :preview-video-file="previewVideoFile"
      :field-options="fieldOptions"
      :admin-media-url="adminMediaUrl"
      @save="saveResource"
      @select-tool-icon="selectToolIcon"
      @remove-tool-icon="removeToolIcon"
      @select-cover="selectCover"
      @remove-cover="removeInspirationCover"
      @select-video="selectPreviewVideo"
      @remove-video="removeInspirationVideo"
      @select-preview="selectPreviewFiles"
      @remove-selected-preview="removeSelectedPreview"
      @remove-preview="removeInspirationPreview"
    />
    <SupportTicketDrawer
      v-model="ticketVisible"
      :ticket="ticketDetail"
      :agents="supportAgents"
      :form="ticketForm"
      :status-options="ticketStatusOptions"
      :priority-options="ticketPriorityOptions"
      :saving="saving"
      :status-text="statusText"
      :status-type="statusType"
      :format-date="formatDate"
      @update-ticket="updateTicket"
      @reply="replyTicket"
    />

    <ModerationPolicyDrawer
      v-model="policyVisible"
      v-model:policy="moderationPolicy"
      :saving="saving"
      @save="saveModerationPolicy"
    />

    <PromptSourcesDrawer
      v-model="sourceVisible"
      :loading="sourceLoading"
      :sources="promptSources"
      :format-date="formatDate"
      @save="savePromptSource"
      @refresh="refreshPromptSource"
    />

    <ProjectWorkflowDrawer
      v-model="projectVisible"
      :detail="projectDetail"
      :form="projectWorkflowForm"
      :lookups="lookups"
      :saving="projectWorkflowSaving"
      :status-text="statusText"
      :status-type="statusType"
      :format-date="formatDate"
      @add-step="addProjectWorkflowStep"
      @remove-step="removeProjectWorkflowStep"
      @save="saveProjectWorkflowAdmin"
    />
  </div>
</template>

<script setup lang="ts">
  import type { UploadFile } from 'element-plus'
  import { ElMessage, ElMessageBox } from 'element-plus'
  import { useRoute } from 'vue-router'
  import { operationsApi } from '@/api/xinyue/operations'
  import { useCompactLayout, useXinyueAsync } from '@/hooks'
  import { xinyueLocale, xinyueText as xt } from '@/locales/xinyue'
  import { createResourceFormatters } from './resource-formatters'
  import { buildResourceEditorPayload, resourceEditorValue } from './resource-editor'
  import { operationEditorConfigs } from './resource-editor-registry'
  import { operationResources } from './resource-registry'
  import ModerationPolicyDrawer from './ModerationPolicyDrawer.vue'
  import OperationDetailDrawer from './OperationDetailDrawer.vue'
  import PromptSourcesDrawer from './PromptSourcesDrawer.vue'
  import ProjectWorkflowDrawer from './ProjectWorkflowDrawer.vue'
  import ResourceEditorDrawer from './ResourceEditorDrawer.vue'
  import SupportTicketDrawer from './SupportTicketDrawer.vue'
  import type {
    ResourceEditorField as EditorField,
    ResourceRow as Row,
    ResourceSelectOption as SelectOption
  } from './resource-types'

  defineOptions({ name: 'XinyueOperations' })

  const ticketStatusOptions: SelectOption[] = [
    { label: '待处理', value: 'OPEN' },
    { label: '处理中', value: 'IN_PROGRESS' },
    { label: '等待用户', value: 'WAITING_USER' },
    { label: '已解决', value: 'RESOLVED' },
    { label: '已关闭', value: 'CLOSED' }
  ]
  const ticketPriorityOptions: SelectOption[] = [
    { label: '低', value: 'LOW' },
    { label: '普通', value: 'NORMAL' },
    { label: '高', value: 'HIGH' },
    { label: '紧急', value: 'URGENT' }
  ]

  const route = useRoute()
  const { loading, saving, withLoading, withSaving } = useXinyueAsync()
  const rows = ref<Row[]>([])
  const pendingLoads = new Map<string, Promise<Row[]>>()
  const filters = reactive({ keyword: '' })
  const appliedKeyword = ref('')
  const page = ref(1)
  const pageSize = ref(20)
  const serverTotal = ref(0)
  const detailVisible = ref(false)
  const detailRow = ref<Row | null>(null)
  const editorVisible = ref(false)
  const editorForm = reactive<Row>({})
  const editingRow = ref<Row | null>(null)
  const toolIconFile = ref<File | null>(null)
  const toolIconPreviewUrl = ref('')
  const coverFile = ref<File | null>(null)
  const previewVideoFile = ref<File | null>(null)
  const previewFiles = ref<File[]>([])
  const lookups = reactive<Record<string, Row[]>>({
    groups: [],
    models: [],
    tools: [],
    knowledgeBases: [],
    promptTemplates: [],
    users: [],
    assistants: [],
    pluginCategories: []
  })
  const ticketVisible = ref(false)
  const ticketDetail = ref<Row | null>(null)
  const supportAgents = ref<Row[]>([])
  const ticketForm = reactive({ status: 'OPEN', priority: 'NORMAL', assignedToId: '', reply: '' })
  const policyVisible = ref(false)
  const moderationPolicy = ref<Row | null>(null)
  const sourceVisible = ref(false)
  const sourceLoading = ref(false)
  const promptSources = ref<Row[]>([])
  const projectVisible = ref(false)
  const projectDetail = ref<Row | null>(null)
  const projectWorkflowSaving = ref(false)
  const projectWorkflowForm = reactive<{
    workflowStatus: string
    defaultModel: string
    defaultAssistantId: string
    instructions: string
    defaultPrompt: string
    outputRequirements: string
    steps: Row[]
  }>({
    workflowStatus: 'PLANNING',
    defaultModel: '',
    defaultAssistantId: '',
    instructions: '',
    defaultPrompt: '',
    outputRequirements: '',
    steps: []
  })
  const isCompact = useCompactLayout()

  const resourceKey = computed(() => String(route.meta.resource || 'jobs'))
  const config = computed(() => operationResources[resourceKey.value] || operationResources.jobs)
  const editorConfig = computed(() => operationEditorConfigs[resourceKey.value])
  const capabilityPresetLabels = {
    assistants: '恢复预设助手',
    tools: '恢复工具模板',
    plugins: '恢复预设技能'
  } as const
  const capabilityPresetResource = computed(() =>
    resourceKey.value in capabilityPresetLabels
      ? (resourceKey.value as keyof typeof capabilityPresetLabels)
      : null
  )
  const visibleEditorFields = computed(() =>
    (editorConfig.value?.fields || []).filter(
      (item) =>
        (!item.createOnly || !editingRow.value) &&
        (!item.editOnly || editingRow.value) &&
        (!item.when || editorForm[item.when.key] === item.when.value)
    )
  )
  const searchItems = computed(() => [
    {
      label: xt('关键词'),
      key: 'keyword',
      type: 'input',
      props: { clearable: true, placeholder: `${xt('搜索')}${xt(config.value.title)}` }
    }
  ])
  const filteredRows = computed(() => {
    if (config.value.serverPagination) return rows.value
    const keyword = appliedKeyword.value.trim().toLowerCase()
    return keyword
      ? rows.value.filter((row) => JSON.stringify(row).toLowerCase().includes(keyword))
      : rows.value
  })
  const pagedRows = computed(() =>
    config.value.serverPagination
      ? filteredRows.value
      : filteredRows.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value)
  )
  const paginationTotal = computed(() =>
    config.value.serverPagination ? serverTotal.value : filteredRows.value.length
  )
  const detailItems = computed(() =>
    Object.entries(detailRow.value || {}).map(([key, value]) => ({
      key,
      label: key,
      complex: value !== null && typeof value === 'object',
      value:
        value !== null && typeof value === 'object'
          ? JSON.stringify(value, null, 2)
          : displayValue(value)
    }))
  )

  function unwrap(payload: any): Row[] {
    if (Array.isArray(payload)) return payload
    for (const key of [
      'items',
      'rows',
      'data',
      'tickets',
      'events',
      'entries',
      'credentials',
      'groups'
    ])
      if (Array.isArray(payload?.[key])) return payload[key]
    return []
  }
  async function load() {
    const baseEndpoint = config.value.endpoint
    const query = config.value.serverPagination
      ? new URLSearchParams({
          page: String(page.value),
          pageSize: String(pageSize.value),
          ...(appliedKeyword.value.trim() ? { q: appliedKeyword.value.trim() } : {})
        }).toString()
      : ''
    const endpoint = query ? `${baseEndpoint}?${query}` : baseEndpoint
    await withLoading(async () => {
      let pending = pendingLoads.get(endpoint)
      try {
        if (!pending) {
          pending = operationsApi.list(endpoint).then((payload) => {
            if (config.value.serverPagination && payload && typeof payload === 'object') {
              serverTotal.value = Number((payload as Row).total || 0)
            }
            return unwrap(payload)
          })
          pendingLoads.set(endpoint, pending)
        }
        const nextRows = await pending
        if (config.value.endpoint === baseEndpoint) rows.value = nextRows
      } catch {
        if (config.value.endpoint === baseEndpoint) rows.value = []
      } finally {
        if (pendingLoads.get(endpoint) === pending) pendingLoads.delete(endpoint)
      }
    })
  }
  function applySearch() {
    appliedKeyword.value = filters.keyword
    page.value = 1
    if (config.value.serverPagination) load()
  }
  function resetSearch() {
    filters.keyword = ''
    appliedKeyword.value = ''
    page.value = 1
    if (config.value.serverPagination) load()
  }
  const {
    valueAt,
    adminMediaUrl,
    rowPreviewList,
    rowCover,
    displayValue,
    formatDate,
    formatBytes,
    formatNumber,
    statusText,
    statusType
  } = createResourceFormatters(xt, xinyueLocale)
  function showDetail(row: Row) {
    detailRow.value = row
    detailVisible.value = true
  }
  function fieldOptions(field: EditorField): SelectOption[] {
    if (field.options) return field.options
    const rows = field.optionsFrom ? lookups[field.optionsFrom] || [] : []
    return rows.map((row) => ({
      label: row.displayName || row.name || row.title || row.email || row.key || row.id,
      value: field.optionsFrom === 'models' ? row.key : row.id
    }))
  }
  async function loadEditorLookups() {
    const needed = new Set(
      editorConfig.value?.fields.map((field) => field.optionsFrom).filter(Boolean) || []
    )
    await Promise.all(
      [...needed].map(async (key) => {
        if (!key || lookups[key].length) return
        lookups[key] = unwrapLookup(await operationsApi.lookup(key))
      })
    )
  }
  function unwrapLookup(payload: any): Row[] {
    if (Array.isArray(payload)) return payload
    for (const key of ['items', 'rows', 'data'])
      if (Array.isArray(payload?.[key])) return payload[key]
    return []
  }
  async function openEditor(row?: Row) {
    if (!editorConfig.value) return
    editingRow.value = row ? { ...row } : null
    if (toolIconPreviewUrl.value) URL.revokeObjectURL(toolIconPreviewUrl.value)
    toolIconFile.value = null
    toolIconPreviewUrl.value = ''
    coverFile.value = null
    previewVideoFile.value = null
    previewFiles.value = []
    Object.keys(editorForm).forEach((key) => delete editorForm[key])
    const source: Row = row || editorConfig.value.defaults
    for (const field of editorConfig.value.fields) {
      const value = resourceEditorValue(
        resourceKey.value,
        field.key,
        source,
        editorConfig.value.defaults,
        Boolean(row)
      )
      editorForm[field.key] = Array.isArray(value) ? [...value] : value
    }
    editorVisible.value = true
    await loadEditorLookups()
  }
  function editorPayload() {
    return buildResourceEditorPayload(
      resourceKey.value,
      visibleEditorFields.value,
      editorForm,
      editingRow.value
    )
  }
  async function saveResource() {
    const editor = editorConfig.value
    if (!editor) return
    const url = editingRow.value ? editor.updateUrl?.(editingRow.value) : editor.createUrl
    if (!url) return
    await withSaving(async () => {
      const saved = await operationsApi.saveResource<Row>(
        url,
        Boolean(editingRow.value),
        editorPayload()
      )
      if (resourceKey.value === 'inspirations' || resourceKey.value === 'imageTools')
        await uploadInspirationMedia(saved.id || editingRow.value?.id)
      if (resourceKey.value === 'tools') await uploadToolIcon(saved.id || editingRow.value?.id)
      editorVisible.value = false
      await load()
    })
  }
  async function removeResource(row: Row) {
    const editor = editorConfig.value
    const url = editor?.deleteUrl?.(row)
    if (!url) return
    const action =
      resourceKey.value === 'promptLibrary'
        ? '重置该提示词的后台覆盖内容'
        : `删除“${row.title || row.name || row.key || row.id}”`
    await ElMessageBox.confirm(`确认${action}？此操作不可撤销。`, '确认操作', { type: 'warning' })
    await operationsApi.deleteResource(url)
    await load()
  }
  async function restoreCapabilityPresets() {
    if (!capabilityPresetResource.value) return
    const result = await operationsApi.restoreCapabilityPresets(capabilityPresetResource.value)
    ElMessage.success(
      result.added ? `已补充 ${result.added} 条缺失预设` : '默认预设已完整，现有配置未被覆盖'
    )
    await load()
  }
  async function reviewToolApproval(row: Row, status: 'APPROVED' | 'REJECTED') {
    let adminNote = ''
    if (status === 'REJECTED') {
      const result = await ElMessageBox.prompt('请输入拒绝原因（可选）', '拒绝审批申请', {
        inputPlaceholder: '例如：该工具尚未完成安全配置',
        inputValidator: (value) => value.length <= 2000 || '最多 2000 个字符'
      }).catch(() => null)
      if (!result) return
      adminNote = result.value
    } else {
      const result = await ElMessageBox.prompt('设置本次批准的有效期（分钟）', '批准审批申请', {
        inputValue: '1440',
        inputPlaceholder: '5 - 10080',
        inputValidator: (value) =>
          /^(?:[5-9]|[1-9][0-9]{1,3}|10080)$/.test(value) || '请输入 5 至 10080 的分钟数'
      }).catch(() => null)
      if (!result) return
      await operationsApi.reviewToolApproval(row.id, {
        status,
        expiresInMinutes: Number(result.value)
      })
      await load()
      return
    }
    await operationsApi.reviewToolApproval(row.id, { status, adminNote })
    await load()
  }
  function selectCover(file: UploadFile) {
    coverFile.value = file.raw || null
  }
  function selectToolIcon(file: UploadFile) {
    if (!file.raw) return
    if (toolIconPreviewUrl.value) URL.revokeObjectURL(toolIconPreviewUrl.value)
    toolIconFile.value = file.raw
    toolIconPreviewUrl.value = URL.createObjectURL(file.raw)
  }
  async function uploadToolIcon(id?: string) {
    if (!id || !toolIconFile.value) return
    const data = new FormData()
    data.append('file', toolIconFile.value)
    await operationsApi.uploadToolIcon(id, data)
  }
  async function removeToolIcon() {
    if (!editingRow.value) return
    await ElMessageBox.confirm('确认移除当前上传图标？', '移除图标', { type: 'warning' })
    await operationsApi.removeToolIcon(editingRow.value.id)
    editingRow.value.iconAssetId = null
    editingRow.value.icon = 'wrench'
    editorForm.icon = 'wrench'
  }
  function selectPreviewVideo(file: UploadFile) {
    previewVideoFile.value = file.raw || null
  }
  function selectPreviewFiles(file: UploadFile) {
    if (file.raw && !previewFiles.value.some((item) => item === file.raw))
      previewFiles.value.push(file.raw)
  }
  function removeSelectedPreview(file: UploadFile) {
    if (file.raw) previewFiles.value = previewFiles.value.filter((item) => item !== file.raw)
  }
  async function uploadInspirationMedia(id?: string) {
    if (!id) return
    if (coverFile.value) {
      const data = new FormData()
      data.append('file', coverFile.value)
      await operationsApi.uploadInspirationCover(id, data)
    }
    if (editorForm.mode === 'VIDEO' && previewVideoFile.value) {
      const data = new FormData()
      data.append('file', previewVideoFile.value)
      await operationsApi.uploadInspirationVideo(id, data)
    }
    if (editorForm.mode !== 'VIDEO' && previewFiles.value.length) {
      const data = new FormData()
      previewFiles.value.forEach((file) => data.append('files', file))
      await operationsApi.uploadInspirationImages(id, data)
    }
  }
  async function removeInspirationCover() {
    if (!editingRow.value) return
    await ElMessageBox.confirm('确认移除当前封面？', '移除封面', { type: 'warning' })
    await operationsApi.removeInspirationCover(editingRow.value.id)
    editingRow.value.coverAssetId = null
    editingRow.value.imageUrl = ''
  }
  async function removeInspirationPreview(assetId: string) {
    if (!editingRow.value) return
    await operationsApi.removeInspirationPreview(editingRow.value.id, assetId)
    editingRow.value.uploadedPreviewImages = (editingRow.value.uploadedPreviewImages || []).filter(
      (item: Row) => item.assetId !== assetId
    )
  }
  async function removeInspirationVideo() {
    if (!editingRow.value) return
    await ElMessageBox.confirm(xt('确认移除当前演示视频？'), xt('移除演示视频'), {
      type: 'warning'
    })
    await operationsApi.removeInspirationVideo(editingRow.value.id)
    editingRow.value.uploadedPreviewVideo = null
    editingRow.value.videoUrl = editingRow.value.options?.previewVideoUrl || ''
  }
  function canCancel(row: Row) {
    return resourceKey.value === 'jobs' && ['QUEUED', 'RUNNING'].includes(row.status)
  }
  function canRetry(row: Row) {
    return resourceKey.value === 'jobs' && ['FAILED', 'CANCELLED'].includes(row.status)
  }
  function canAcknowledge(row: Row) {
    return resourceKey.value === 'alerts' && row.status === 'OPEN'
  }
  function canResolve(row: Row) {
    return resourceKey.value === 'alerts' && !['RESOLVED', 'CLOSED'].includes(row.status)
  }
  async function cancelJob(row: Row) {
    await ElMessageBox.confirm('确认取消该生成任务？', '取消任务', { type: 'warning' })
    await operationsApi.cancelJob(row.id)
    await load()
  }
  async function retryJob(row: Row) {
    await operationsApi.retryJob(row.id)
    await load()
  }
  async function retryNotification(row: Row) {
    await operationsApi.retryNotification(row.id)
    await load()
  }
  async function removeAsset(row: Row) {
    await ElMessageBox.confirm(`确认删除“${row.name}”？`, '删除资产', { type: 'warning' })
    await operationsApi.removeAsset(row.id)
    await load()
  }
  async function updateAlert(row: Row, action: 'acknowledge' | 'resolve') {
    await operationsApi.updateAlert(row.id, action)
    await load()
  }
  async function evaluateAlerts() {
    await operationsApi.evaluateAlerts()
    await load()
  }
  async function restorePromptTemplates() {
    await operationsApi.restorePromptTemplates()
    await load()
  }
  async function refreshPromptLibrary() {
    await operationsApi.refreshPromptLibrary()
    await load()
  }
  async function openPromptSources() {
    sourceVisible.value = true
    sourceLoading.value = true
    try {
      promptSources.value = await operationsApi.promptSources()
    } finally {
      sourceLoading.value = false
    }
  }
  async function savePromptSource(row: Row) {
    const requiresReview =
      row.external === true &&
      row.enabled === true &&
      (!row.reviewAcceptedAt || row.configuredEnabled === false)
    if (requiresReview) {
      try {
        await ElMessageBox.confirm(
          xt(
            '外部提示词内容可能有单独的版权或商业使用限制。请确认你已核验该来源的授权范围，并愿意承担启用后的使用责任。'
          ),
          xt('确认启用外部来源'),
          {
            confirmButtonText: xt('已核验并启用'),
            cancelButtonText: xt('取消'),
            type: 'warning'
          }
        )
      } catch {
        await openPromptSources()
        return
      }
    }
    await operationsApi.savePromptSource(row, requiresReview)
    await openPromptSources()
    await load()
  }
  async function refreshPromptSource(row: Row) {
    row._refreshing = true
    try {
      await operationsApi.refreshPromptSource(row.id)
      await openPromptSources()
      await load()
    } finally {
      row._refreshing = false
    }
  }
  async function openModerationPolicy() {
    policyVisible.value = true
    moderationPolicy.value = await operationsApi.moderationPolicy()
  }
  async function saveModerationPolicy() {
    const policy = moderationPolicy.value
    if (!policy) return
    await withSaving(async () => {
      const {
        enabled,
        scanChat,
        scanImage,
        scanCommerce,
        failClosed,
        retainContent,
        blockMessage,
        excerptLength
      } = policy
      moderationPolicy.value = await operationsApi.saveModerationPolicy({
        enabled,
        scanChat,
        scanImage,
        scanCommerce,
        failClosed,
        retainContent,
        blockMessage,
        excerptLength
      })
      policyVisible.value = false
    })
  }
  async function muteAlertRule(row: Row) {
    const { value } = await ElMessageBox.prompt(
      '请输入静默分钟数（1-43200）',
      `静默：${row.name}`,
      {
        inputValue: '60',
        inputPattern: /^([1-9]\d{0,3}|[1-3]\d{4}|4[0-2]\d{3}|43[01]\d{2}|43200)$/,
        inputErrorMessage: '请输入 1 到 43200 的整数'
      }
    )
    await operationsApi.muteAlertRule(row.id, Number(value))
    await load()
  }
  async function resolveModeration(row: Row, status: string) {
    const { value } = await ElMessageBox.prompt(
      '可填写本次处置说明',
      status === 'APPROVED' ? '批准内容' : '驳回事件',
      { inputType: 'textarea', inputPlaceholder: '处置说明（可选）', confirmButtonText: '确认处置' }
    )
    await operationsApi.resolveModeration(row.id, { status, note: value || '' })
    await load()
  }
  async function reviewModerationAppeal(row: Row, status: string) {
    if (status === 'IN_REVIEW') {
      await operationsApi.reviewModerationAppeal(row.id, { status })
      await load()
      return
    }
    const { value } = await ElMessageBox.prompt(
      status === 'APPROVED' ? '请说明通过理由和后续处理建议' : '请说明申诉未通过的依据',
      status === 'APPROVED' ? '通过内容申诉' : '驳回内容申诉',
      {
        inputType: 'textarea',
        inputPlaceholder: '处置说明将通过站内通知发送给用户',
        inputValidator: (value: string) => value.trim().length > 0 || '必须填写处置说明',
        confirmButtonText: '确认处置'
      }
    )
    await operationsApi.reviewModerationAppeal(row.id, { status, note: value.trim() })
    await load()
  }
  async function openTicket(row: Row) {
    ticketVisible.value = true
    const [detail, agents] = await Promise.all([
      operationsApi.supportTicket(row.id),
      supportAgents.value.length
        ? Promise.resolve(supportAgents.value)
        : operationsApi.supportAgents()
    ])
    ticketDetail.value = detail
    supportAgents.value = agents
    ticketForm.status = detail.status
    ticketForm.priority = detail.priority
    ticketForm.assignedToId = detail.assignedToId || ''
    ticketForm.reply = ''
  }
  async function openProject(row: Row) {
    projectVisible.value = true
    const [detail] = await Promise.all([operationsApi.project(row.id), loadEditorLookups()])
    projectDetail.value = detail
    const workflow = (detail.workflowConfig || {}) as Row
    projectWorkflowForm.workflowStatus = String(detail.workflowStatus || 'PLANNING')
    projectWorkflowForm.defaultModel = String(detail.defaultModel || '')
    projectWorkflowForm.defaultAssistantId = String(detail.defaultAssistantId || '')
    projectWorkflowForm.instructions = String(detail.instructions || '')
    projectWorkflowForm.defaultPrompt = String(workflow.defaultPrompt || '')
    projectWorkflowForm.outputRequirements = String(workflow.outputRequirements || '')
    projectWorkflowForm.steps = Array.isArray(workflow.steps)
      ? workflow.steps.map((step: Row, index: number) => ({
          id: String(step.id || `step-${index + 1}`),
          title: String(step.title || ''),
          description: String(step.description || ''),
          status: ['TODO', 'IN_PROGRESS', 'DONE'].includes(String(step.status))
            ? step.status
            : 'TODO'
        }))
      : []
  }
  function addProjectWorkflowStep() {
    projectWorkflowForm.steps.push({
      id: `step-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      title: '',
      description: '',
      status: 'TODO'
    })
  }
  function removeProjectWorkflowStep(index: number) {
    projectWorkflowForm.steps.splice(index, 1)
  }
  async function saveProjectWorkflowAdmin() {
    if (!projectDetail.value) return
    if (projectWorkflowForm.steps.some((step) => !String(step.title || '').trim())) {
      ElMessage.warning('请填写每个步骤的名称')
      return
    }
    projectWorkflowSaving.value = true
    try {
      await operationsApi.updateProject(projectDetail.value.id, {
        workflowStatus: projectWorkflowForm.workflowStatus,
        workflowConfig: {
          steps: projectWorkflowForm.steps.map((step) => ({
            id: step.id,
            title: String(step.title).trim(),
            description: String(step.description || '').trim(),
            status: step.status
          })),
          defaultPrompt: projectWorkflowForm.defaultPrompt.trim(),
          outputRequirements: projectWorkflowForm.outputRequirements.trim()
        },
        defaultModel: projectWorkflowForm.defaultModel.trim(),
        defaultAssistantId: projectWorkflowForm.defaultAssistantId || null,
        instructions: projectWorkflowForm.instructions.trim(),
        changeSummary: '管理员保存项目工作流'
      })
      await load()
      projectDetail.value = await operationsApi.project(projectDetail.value.id)
    } finally {
      projectWorkflowSaving.value = false
    }
  }
  async function updateTicket() {
    const ticket = ticketDetail.value
    if (!ticket) return
    await withSaving(async () => {
      await operationsApi.updateSupportTicket(ticket.id, {
        status: ticketForm.status,
        priority: ticketForm.priority,
        assignedToId: ticketForm.assignedToId || null
      })
      await openTicket(ticket)
      await load()
    })
  }
  async function replyTicket() {
    const ticket = ticketDetail.value
    if (!ticket || !ticketForm.reply.trim()) return ElMessage.warning('请输入回复内容')
    await withSaving(async () => {
      await operationsApi.replySupportTicket(ticket.id, ticketForm.reply)
      await openTicket(ticket)
      await load()
    })
  }

  watch(
    resourceKey,
    () => {
      rows.value = []
      serverTotal.value = 0
      editorVisible.value = false
      ticketVisible.value = false
      projectVisible.value = false
      resetSearch()
      load()
    },
    { immediate: true }
  )

  watch([page, pageSize], () => {
    if (config.value.serverPagination) load()
  })
</script>

<style scoped>
  .operation-page {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-height: 0;
  }

  .art-table-card {
    display: flex;
    flex: 1;
    flex-direction: column;
    width: 100%;
    min-width: 0;
    max-width: 100%;
    min-height: 0;
    overflow: hidden;
  }

  .art-table-card :deep(.el-card__body) {
    display: flex;
    flex: 1;
    flex-direction: column;
    width: 100%;
    min-width: 0;
    max-width: 100%;
    min-height: 0;
    overflow: hidden;
  }

  .art-table-card :deep(.el-table) {
    width: 100%;
    min-width: 0 !important;
    max-width: 100%;
  }

  .art-table-card :deep(.el-table__inner-wrapper),
  .art-table-card :deep(.el-table__body-wrapper),
  .art-table-card :deep(.el-scrollbar__wrap) {
    max-width: 100%;
  }

  .resource-heading {
    display: flex;
    gap: 12px;
    align-items: center;
  }

  .resource-heading p {
    margin: 3px 0 0;
    font-size: 12px;
    font-weight: 400;
    color: var(--art-gray-500);
  }

  .resource-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    justify-content: flex-end;
    max-width: 100%;
  }

  .resource-actions :deep(.el-button) {
    height: 32px;
    padding: 0 12px;
  }

  .resource-icon {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    font-size: 18px;
    color: var(--main-color);
    background: var(--art-gray-100);
    border-radius: 6px;
  }

  .table-footer {
    display: flex;
    justify-content: flex-end;
    max-width: 100%;
    padding-top: 16px;
    overflow-x: auto;
  }

  .table-image-cell {
    display: flex;
    gap: 7px;
    align-items: center;
    min-width: 0;
  }

  .table-image-cell small {
    font-size: 11px;
    color: var(--art-gray-500);
    white-space: nowrap;
  }

  .table-cover,
  .image-placeholder {
    flex: 0 0 58px;
    width: 58px;
    height: 44px;
    overflow: hidden;
    border: 1px solid var(--art-gray-200);
    border-radius: 6px;
  }

  .table-cover {
    cursor: zoom-in;
  }

  .table-image-cell :deep(.el-image__inner) {
    display: block;
  }

  .image-placeholder {
    display: grid;
    place-items: center;
    font-size: 18px;
    color: var(--art-gray-400);
    background: var(--art-gray-100);
  }

  @media (width <= 768px) {
    .resource-heading p {
      display: none;
    }

    .table-footer :deep(.el-pagination__sizes),
    .table-footer :deep(.el-pagination__jump) {
      display: none;
    }
  }
</style>
