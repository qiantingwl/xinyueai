<template>
  <div class="agent-ops">
    <header class="page-title">
      <div><h1>Agent 运营中心</h1><p>监控自主任务、运行轮次、审批中断和定时计划</p></div>
      <ElButton :loading="loading" @click="load"
        ><ArtSvgIcon icon="ri:refresh-line" />刷新</ElButton
      >
    </header>

    <section class="metric-grid">
      <ElCard v-for="item in metrics" :key="item.label" shadow="never" class="metric-card">
        <span :class="item.tone"><ArtSvgIcon :icon="item.icon" /></span>
        <div
          ><small>{{ item.label }}</small
          ><strong>{{ item.value }}</strong
          ><em>{{ item.note }}</em></div
        >
      </ElCard>
    </section>

    <ElCard shadow="never" class="agent-table-card">
      <ElTabs v-model="tab">
        <ElTabPane label="任务运行" name="tasks">
          <div class="filters">
            <ElInput
              v-model="filters.query"
              clearable
              placeholder="任务、用户或邮箱"
              @keyup.enter="loadTasks"
              ><template #prefix><ArtSvgIcon icon="ri:search-line" /></template
            ></ElInput>
            <ElSelect v-model="filters.status" clearable placeholder="全部状态"
              ><ElOption
                v-for="item in statuses"
                :key="item.value"
                :label="item.label"
                :value="item.value"
            /></ElSelect>
            <ElButton type="primary" @click="loadTasks">查询</ElButton>
          </div>
          <ElTable v-loading="loading" :data="tasks" height="100%" @row-click="openDetail">
            <ElTableColumn label="任务" min-width="280"
              ><template #default="{ row }"
                ><div class="primary-cell"
                  ><strong>{{ row.title }}</strong
                  ><small>{{ row.goal }}</small></div
                ></template
              ></ElTableColumn
            >
            <ElTableColumn label="用户" min-width="180"
              ><template #default="{ row }"
                ><div class="primary-cell"
                  ><strong>{{ row.user.displayName }}</strong
                  ><small>{{ row.user.email || '未绑定邮箱' }}</small></div
                ></template
              ></ElTableColumn
            >
            <ElTableColumn label="状态" width="110"
              ><template #default="{ row }"
                ><ElTag :type="statusType(row.status)">{{
                  statusText(row.status)
                }}</ElTag></template
              ></ElTableColumn
            >
            <ElTableColumn label="当前节点" min-width="130"
              ><template #default="{ row }"
                >{{ row.runs[0]?.currentNode || '-'
                }}<small class="inline-note"
                  >第 {{ (row.runs[0]?.iteration || 0) + 1 }} 轮</small
                ></template
              ></ElTableColumn
            >
            <ElTableColumn label="运行" width="85"
              ><template #default="{ row }">{{ row._count.runs }}</template></ElTableColumn
            >
            <ElTableColumn label="工具" width="85"
              ><template #default="{ row }">{{ row._count.toolCalls }}</template></ElTableColumn
            >
            <ElTableColumn label="更新时间" width="175"
              ><template #default="{ row }">{{ date(row.updatedAt) }}</template></ElTableColumn
            >
            <ElTableColumn label="操作" width="150" fixed="right"
              ><template #default="{ row }"
                ><ElButton v-if="active(row.status)" link type="danger" @click.stop="cancel(row)"
                  >停止</ElButton
                ><ElButton
                  v-else-if="retryable(row.status)"
                  link
                  type="primary"
                  @click.stop="retry(row)"
                  >重试</ElButton
                ><ElButton link @click.stop="openDetail(row)">详情</ElButton></template
              ></ElTableColumn
            >
          </ElTable>
          <footer class="pagination"
            ><ElPagination
              v-model:current-page="page"
              v-model:page-size="pageSize"
              layout="total, sizes, prev, pager, next"
              :total="total"
              @change="loadTasks"
          /></footer>
        </ElTabPane>
        <ElTabPane label="定时计划" name="schedules">
          <ElTable v-loading="loading" :data="schedules" height="100%">
            <ElTableColumn label="计划" min-width="230"
              ><template #default="{ row }"
                ><div class="primary-cell"
                  ><strong>{{ row.title }}</strong
                  ><small>{{ row.goal }}</small></div
                ></template
              ></ElTableColumn
            >
            <ElTableColumn label="用户" min-width="170"
              ><template #default="{ row }"
                >{{ row.user.displayName
                }}<small class="inline-note">{{ row.user.email || '' }}</small></template
              ></ElTableColumn
            >
            <ElTableColumn prop="cronExpression" label="Cron" width="150" />
            <ElTableColumn prop="timezone" label="时区" width="140" />
            <ElTableColumn label="下次执行" width="175"
              ><template #default="{ row }">{{
                row.nextRunAt ? date(row.nextRunAt) : '-'
              }}</template></ElTableColumn
            >
            <ElTableColumn label="执行次数" width="100"
              ><template #default="{ row }">{{ row._count.tasks }}</template></ElTableColumn
            >
            <ElTableColumn label="状态" width="95"
              ><template #default="{ row }"
                ><ElTag :type="row.enabled ? 'success' : 'info'">{{
                  row.enabled ? '启用' : '停用'
                }}</ElTag></template
              ></ElTableColumn
            >
          </ElTable>
        </ElTabPane>
        <ElTabPane label="工具调用" name="tools">
          <ElTable v-loading="loading" :data="toolCalls" height="100%">
            <ElTableColumn label="工具" min-width="180"
              ><template #default="{ row }"
                ><div class="primary-cell"
                  ><strong>{{ row.name }}</strong
                  ><small>{{ row.key }}</small></div
                ></template
              ></ElTableColumn
            >
            <ElTableColumn label="任务" min-width="240"
              ><template #default="{ row }"
                ><div class="primary-cell"
                  ><strong>{{ row.agentTask.title }}</strong
                  ><small
                    >{{ row.agentTask.user.displayName }} · 第 {{ row.run.iteration + 1 }} 轮</small
                  ></div
                ></template
              ></ElTableColumn
            >
            <ElTableColumn label="审批" width="105"
              ><template #default="{ row }"
                ><ElTag effect="plain">{{ row.approvalStatus }}</ElTag></template
              ></ElTableColumn
            >
            <ElTableColumn label="状态" width="105"
              ><template #default="{ row }"
                ><ElTag :type="statusType(row.status)">{{ row.status }}</ElTag></template
              ></ElTableColumn
            >
            <ElTableColumn label="耗时" width="100"
              ><template #default="{ row }">{{
                duration(row.startedAt, row.completedAt)
              }}</template></ElTableColumn
            >
            <ElTableColumn label="时间" width="175"
              ><template #default="{ row }">{{ date(row.createdAt) }}</template></ElTableColumn
            >
          </ElTable>
        </ElTabPane>
      </ElTabs>
    </ElCard>

    <ElDrawer v-model="detailVisible" title="任务运行详情" size="min(760px, 92vw)">
      <div v-if="detail" class="detail-body">
        <header
          ><div
            ><h2>{{ detail.title }}</h2
            ><p>{{ detail.goal }}</p></div
          ><ElTag :type="statusType(detail.status)">{{ statusText(detail.status) }}</ElTag></header
        >
        <ElDescriptions :column="2" border
          ><ElDescriptionsItem label="用户">{{ detail.user.displayName }}</ElDescriptionsItem
          ><ElDescriptionsItem label="模型">{{ detail.model }}</ElDescriptionsItem
          ><ElDescriptionsItem label="助手">{{ detail.assistant?.name || '-' }}</ElDescriptionsItem
          ><ElDescriptionsItem label="项目">{{
            detail.project?.name || '-'
          }}</ElDescriptionsItem></ElDescriptions
        >
        <section
          ><h3>执行步骤</h3
          ><ElSteps direction="vertical" :active="stepActive" finish-status="success"
            ><ElStep
              v-for="step in detail.steps"
              :key="step.id"
              :title="step.title"
              :description="step.detail || step.status"
              :status="stepType(step.status)" /></ElSteps
        ></section>
        <section v-for="run in detail.runs" :key="run.id" class="run-card"
          ><header
            ><strong>运行 #{{ run.runKey }}</strong
            ><span>第 {{ run.iteration + 1 }} / {{ run.maxIterations }} 轮</span></header
          ><p v-if="run.verifierFeedback">校验反馈：{{ run.verifierFeedback }}</p
          ><ElTimeline
            ><ElTimelineItem
              v-for="event in run.events"
              :key="event.id"
              :timestamp="date(event.createdAt)"
              ><strong>{{ event.title }}</strong
              ><p>{{ event.detail }}</p></ElTimelineItem
            ></ElTimeline
          ></section
        >
      </div>
    </ElDrawer>
  </div>
</template>

<script setup lang="ts">
  import { ElMessageBox } from 'element-plus'
  import request from '@/utils/http'
  defineOptions({ name: 'XinyueAgentOperations' })
  type Row = Record<string, any>
  const loading = ref(false),
    tab = ref('tasks'),
    tasks = ref<Row[]>([]),
    schedules = ref<Row[]>([]),
    toolCalls = ref<Row[]>([])
  const overview = ref<Row>({}),
    page = ref(1),
    pageSize = ref(20),
    total = ref(0),
    detailVisible = ref(false),
    detail = ref<Row | null>(null)
  const filters = reactive({ query: '', status: '' })
  const statuses = [
    { label: '草稿', value: 'DRAFT' },
    { label: '排队中', value: 'QUEUED' },
    { label: '执行中', value: 'RUNNING' },
    { label: '待审批', value: 'WAITING_APPROVAL' },
    { label: '已完成', value: 'SUCCEEDED' },
    { label: '失败', value: 'FAILED' },
    { label: '已停止', value: 'CANCELLED' }
  ]
  const metrics = computed(() => [
    {
      label: '运行中',
      value: overview.value.active || 0,
      note: `${overview.value.waitingApproval || 0} 个等待审批`,
      icon: 'ri:loader-4-line',
      tone: 'blue'
    },
    {
      label: '24h 成功率',
      value: `${overview.value.successRate24h || 0}%`,
      note: `${overview.value.succeeded24h || 0} 个已交付`,
      icon: 'ri:checkbox-circle-line',
      tone: 'green'
    },
    {
      label: '24h 失败',
      value: overview.value.failed24h || 0,
      note: '需要排查或重试',
      icon: 'ri:error-warning-line',
      tone: 'red'
    },
    {
      label: '定时计划',
      value: overview.value.schedules || 0,
      note: `${overview.value.toolCalls24h || 0} 次工具调用`,
      icon: 'ri:calendar-schedule-line',
      tone: 'amber'
    }
  ])
  const stepActive = computed(
    () => detail.value?.steps?.findIndex((item: Row) => !['SUCCEEDED'].includes(item.status)) ?? 0
  )
  function statusText(value: string) {
    return statuses.find((item) => item.value === value)?.label || value
  }
  function statusType(value: string) {
    return value === 'SUCCEEDED'
      ? 'success'
      : value === 'FAILED'
        ? 'danger'
        : value === 'WAITING_APPROVAL'
          ? 'warning'
          : ['RUNNING', 'QUEUED'].includes(value)
            ? 'primary'
            : 'info'
  }
  function stepType(value: string) {
    return value === 'SUCCEEDED'
      ? 'success'
      : value === 'FAILED'
        ? 'error'
        : value === 'RUNNING'
          ? 'process'
          : 'wait'
  }
  function active(value: string) {
    return ['QUEUED', 'RUNNING', 'WAITING_APPROVAL'].includes(value)
  }
  function retryable(value: string) {
    return ['FAILED', 'CANCELLED', 'SUCCEEDED'].includes(value)
  }
  function date(value: string) {
    return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'medium' }).format(
      new Date(value)
    )
  }
  function duration(start?: string, end?: string) {
    if (!start) return '-'
    const ms = new Date(end || Date.now()).getTime() - new Date(start).getTime()
    return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`
  }
  async function loadTasks() {
    const data = await request.get<Row>({
      url: '/v1/admin/agent/tasks',
      params: {
        page: page.value,
        pageSize: pageSize.value,
        query: filters.query || undefined,
        status: filters.status || undefined
      }
    })
    tasks.value = data.items
    total.value = data.total
  }
  async function load() {
    loading.value = true
    try {
      const [summary, scheduleRows, calls] = await Promise.all([
        request.get<Row>({ url: '/v1/admin/agent/overview' }),
        request.get<Row[]>({ url: '/v1/admin/agent/schedules' }),
        request.get<Row[]>({ url: '/v1/admin/agent/tool-calls' }),
        loadTasks()
      ])
      overview.value = summary
      schedules.value = scheduleRows
      toolCalls.value = calls
    } finally {
      loading.value = false
    }
  }
  async function openDetail(row: Row) {
    detailVisible.value = true
    detail.value = await request.get<Row>({ url: `/v1/admin/agent/tasks/${row.id}` })
  }
  async function cancel(row: Row) {
    await ElMessageBox.confirm(`确认停止“${row.title}”？`, '停止任务', { type: 'warning' })
    await request.post({
      url: `/v1/admin/agent/tasks/${row.id}/cancel`,
      params: {},
      showSuccessMessage: true
    })
    await load()
  }
  async function retry(row: Row) {
    await request.post({
      url: `/v1/admin/agent/tasks/${row.id}/retry`,
      params: {},
      showSuccessMessage: true
    })
    await load()
  }
  onMounted(load)
</script>

<style scoped>
  .agent-ops {
    display: flex;
    flex-direction: column;
    gap: 14px;
    min-height: 0;
  }

  .page-title {
    display: flex;
    gap: 16px;
    align-items: center;
    justify-content: space-between;
  }

  .page-title h1 {
    margin: 0;
    font-size: 20px;
  }

  .page-title p {
    margin: 4px 0 0;
    font-size: 12px;
    color: var(--art-gray-500);
  }

  .metric-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
  }

  .metric-card :deep(.el-card__body) {
    display: flex;
    gap: 14px;
    align-items: center;
    padding: 16px;
  }

  .metric-card > :deep(.el-card__body) > span {
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    font-size: 20px;
    border-radius: 6px;
  }

  .metric-card .blue {
    color: #2563eb;
    background: #eff6ff;
  }

  .metric-card .green {
    color: #059669;
    background: #ecfdf5;
  }

  .metric-card .red {
    color: #dc2626;
    background: #fef2f2;
  }

  .metric-card .amber {
    color: #d97706;
    background: #fffbeb;
  }

  .metric-card div {
    display: grid;
    min-width: 0;
  }

  .metric-card small,
  .metric-card em {
    font-size: 11px;
    font-style: normal;
    color: var(--art-gray-500);
  }

  .metric-card strong {
    margin: 2px 0;
    font-size: 22px;
    font-variant-numeric: tabular-nums;
  }

  .agent-table-card {
    min-height: 560px;
    overflow: hidden;
  }

  .agent-table-card :deep(.el-card__body),
  .agent-table-card :deep(.el-tabs),
  .agent-table-card :deep(.el-tabs__content),
  .agent-table-card :deep(.el-tab-pane) {
    height: 100%;
    min-height: 0;
  }

  .agent-table-card :deep(.el-tab-pane) {
    display: flex;
    flex-direction: column;
  }

  .filters {
    display: flex;
    gap: 8px;
    margin-bottom: 12px;
  }

  .filters .el-input {
    max-width: 280px;
  }

  .filters .el-select {
    width: 160px;
  }

  .primary-cell {
    display: grid;
    min-width: 0;
  }

  .primary-cell strong,
  .primary-cell small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .primary-cell small,
  .inline-note {
    font-size: 11px;
    color: var(--art-gray-500);
  }

  .inline-note {
    display: block;
    margin-top: 3px;
  }

  .pagination {
    display: flex;
    justify-content: flex-end;
    padding-top: 14px;
  }

  .detail-body {
    display: grid;
    gap: 24px;
  }

  .detail-body > header,
  .run-card > header {
    display: flex;
    gap: 16px;
    align-items: flex-start;
    justify-content: space-between;
  }

  .detail-body h2 {
    margin: 0;
    font-size: 19px;
  }

  .detail-body > header p {
    margin: 6px 0 0;
    line-height: 1.6;
    color: var(--art-gray-500);
  }

  .detail-body h3 {
    margin: 0 0 14px;
    font-size: 15px;
  }

  .run-card {
    padding: 16px;
    border: 1px solid var(--art-gray-200);
    border-radius: 6px;
  }

  .run-card > header span,
  .run-card > p,
  .run-card :deep(.el-timeline-item__timestamp),
  .run-card :deep(.el-timeline-item__content p) {
    font-size: 11px;
    color: var(--art-gray-500);
  }

  .run-card :deep(.el-timeline) {
    padding-left: 4px;
    margin-top: 16px;
  }

  @media (width <= 1000px) {
    .metric-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (width <= 640px) {
    .metric-grid {
      grid-template-columns: 1fr;
    }

    .filters {
      flex-wrap: wrap;
    }
  }
</style>
