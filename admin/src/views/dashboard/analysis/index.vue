<template>
  <div class="dashboard-page">
    <header class="dashboard-heading">
      <div
        ><h1>{{ xt('分析页') }}</h1
        ><p>{{ xt('用量、成本和渠道表现的经营分析') }}</p></div
      >
      <div class="heading-actions">
        <ElSelect v-model="days" size="default" @change="load"
          ><ElOption :label="xt('近 7 天')" :value="7" /><ElOption
            :label="xt('近 30 天')"
            :value="30" /><ElOption :label="xt('近 90 天')" :value="90"
        /></ElSelect>
        <ElButton :loading="loading" @click="load"
          ><ArtSvgIcon icon="ri:refresh-line" />{{ xt('刷新') }}</ElButton
        >
        <ElButton @click="exportCsv"
          ><ArtSvgIcon icon="ri:download-2-line" />{{ xt('导出') }}</ElButton
        >
      </div>
    </header>

    <div v-loading="loading" class="metric-grid">
      <div v-for="item in metrics" :key="item.label" class="metric-card">
        <div class="metric-icon" :class="item.tone"><ArtSvgIcon :icon="item.icon" /></div>
        <div
          ><span>{{ item.label }}</span
          ><strong>{{ item.value }}</strong
          ><small>{{ item.note }}</small></div
        >
      </div>
    </div>

    <ElRow :gutter="20">
      <ElCol :xs="24" :lg="14"
        ><section class="art-card chart-card"
          ><div class="card-heading"
            ><div
              ><h2>{{ xt('调用趋势') }}</h2
              ><p>{{ xt('成功任务与创作点消耗') }}</p></div
            ><ElTag type="success">{{ report?.days || days }} {{ xt('天') }}</ElTag></div
          ><ArtLineChart
            height="280px"
            :data="jobTrend"
            :x-axis-data="dateLabels"
            :show-area-color="true"
            :show-axis-line="false" /></section
      ></ElCol>
      <ElCol :xs="24" :lg="10"
        ><section class="art-card chart-card"
          ><div class="card-heading"
            ><div
              ><h2>{{ xt('收入与成本') }}</h2
              ><p>{{ xt('按日统计，单位：元') }}</p></div
            ></div
          ><ArtBarChart
            height="280px"
            :data="financialTrend"
            :x-axis-data="dateLabels"
            :show-legend="true"
            :show-axis-line="false" /></section
      ></ElCol>
    </ElRow>

    <ElRow :gutter="20">
      <ElCol :xs="24" :lg="12"
        ><section class="art-card table-card"
          ><div class="card-heading"
            ><div
              ><h2>{{ xt('模型表现') }}</h2
              ><p>{{ xt('按成功任务量排序') }}</p></div
            ><ElButton text type="primary" @click="go('/enterprise/ai/models')">{{
              xt('管理模型')
            }}</ElButton></div
          ><ElTable :data="report?.models || []" size="small"
            ><ElTableColumn
              prop="label"
              :label="xt('模型')"
              min-width="160"
              show-overflow-tooltip
            /><ElTableColumn prop="jobs" :label="xt('任务')" width="80" sortable /><ElTableColumn
              prop="outputs"
              :label="xt('输出')"
              width="80"
            /><ElTableColumn :label="xt('收入')" width="100"
              ><template #default="{ row }">{{
                moneyMicros(row.revenueMicros)
              }}</template></ElTableColumn
            ><ElTableColumn :label="xt('毛利率')" width="100"
              ><template #default="{ row }">{{ percent(row.marginRate) }}</template></ElTableColumn
            ></ElTable
          ></section
        ></ElCol
      >
      <ElCol :xs="24" :lg="12"
        ><section class="art-card table-card"
          ><div class="card-heading"
            ><div
              ><h2>{{ xt('渠道表现') }}</h2
              ><p>{{ xt('观察上游渠道负载和成本') }}</p></div
            ><ElButton text type="primary" @click="go('/enterprise/ai/providers')">{{
              xt('管理渠道')
            }}</ElButton></div
          ><div class="provider-list"
            ><div v-for="row in report?.providers || []" :key="row.key" class="provider-row"
              ><div class="provider-line"
                ><strong>{{ row.label }}</strong
                ><span
                  >{{ row.jobs }} {{ xt('个任务') }} · {{ moneyMicros(row.costMicros) }}</span
                ></div
              ><ElProgress
                :percentage="providerPercent(row.jobs)"
                :show-text="false"
                :stroke-width="7" /></div
            ><ElEmpty
              v-if="!report?.providers?.length"
              :description="xt('暂无渠道用量')" /></div></section
      ></ElCol>
    </ElRow>

    <section class="art-card recent-card"
      ><div class="card-heading"
        ><div
          ><h2>{{ xt('经营提示') }}</h2
          ><p>{{ xt('来自平台实时汇总的重点指标') }}</p></div
        ><ElButton text type="primary" @click="go('/enterprise/operations/alerts')">{{
          xt('查看告警')
        }}</ElButton></div
      ><div class="notice-grid"
        ><div
          ><ArtSvgIcon icon="ri:checkbox-circle-line" /><span>{{ xt('健康渠道') }}</span
          ><strong
            >{{ overview?.healthyProviders || 0 }}/{{ overview?.providers || 0 }}</strong
          ></div
        ><div
          ><ArtSvgIcon icon="ri:time-line" /><span>{{ xt('运行中任务') }}</span
          ><strong>{{ overview?.runningJobs || 0 }}</strong></div
        ><div
          ><ArtSvgIcon icon="ri:shield-check-line" /><span>{{ xt('待审核内容') }}</span
          ><strong>{{ overview?.alerts.moderationOpen || 0 }}</strong></div
        ><div
          ><ArtSvgIcon icon="ri:customer-service-2-line" /><span>{{ xt('待处理工单') }}</span
          ><strong>{{ overview?.alerts.supportOpen || 0 }}</strong></div
        ></div
      ></section
    >
  </div>
</template>

<script setup lang="ts">
  import { xinyueApi, type Overview, type UsageReport } from '@/api/xinyue'
  import { xinyueText as xt } from '@/locales/xinyue'
  import { router } from '@/router'

  defineOptions({ name: 'Analysis' })
  const days = ref(30)
  const loading = ref(false)
  const report = ref<UsageReport | null>(null)
  const overview = ref<Overview | null>(null)
  const dateLabels = computed(() => report.value?.daily.map((item) => item.date.slice(5)) || [])
  const jobTrend = computed(() => report.value?.daily.map((item) => item.jobs) || [])
  const financialTrend = computed(() => [
    {
      name: xt('收入'),
      data:
        report.value?.daily.map((item) => Number((item.revenueMicros / 1_000_000).toFixed(2))) || []
    },
    {
      name: xt('成本'),
      data:
        report.value?.daily.map((item) => Number((item.costMicros / 1_000_000).toFixed(2))) || []
    }
  ])
  const moneyMicros = (value: number) => `¥${(value / 1_000_000).toFixed(2)}`
  const percent = (value: number | null) => (value === null ? '-' : `${value.toFixed(1)}%`)
  const providerPercent = (value: number) => {
    const max = Math.max(...(report.value?.providers || []).map((row) => row.jobs), 1)
    return Math.round((value / max) * 100)
  }
  const metrics = computed(() => [
    {
      label: xt('成功任务'),
      value: String(report.value?.summary.jobs || 0),
      note: `${xt('近')} ${days.value} ${xt('天')}`,
      icon: 'ri:task-line',
      tone: 'green'
    },
    {
      label: xt('平台收入'),
      value: moneyMicros(report.value?.summary.revenueMicros || 0),
      note: `${xt('毛利率')} ${percent(report.value?.summary.marginRate ?? null)}`,
      icon: 'ri:money-cny-circle-line',
      tone: 'blue'
    },
    {
      label: xt('上游成本'),
      value: moneyMicros(report.value?.summary.costMicros || 0),
      note: `${report.value?.summary.credits || 0} ${xt('点消耗')}`,
      icon: 'ri:wallet-3-line',
      tone: 'orange'
    },
    {
      label: xt('输出内容'),
      value: String(report.value?.summary.outputs || 0),
      note: `${xt('新增用户')} ${overview.value?.newUsers || 0}`,
      icon: 'ri:image-2-line',
      tone: 'purple'
    }
  ])

  async function load() {
    loading.value = true
    try {
      ;[report.value, overview.value] = await Promise.all([
        xinyueApi.usageReport(days.value),
        xinyueApi.overview()
      ])
    } finally {
      loading.value = false
    }
  }
  const go = (path: string) => router.push(path)
  function exportCsv() {
    const rows = [
      [xt('日期'), xt('任务数'), xt('创作点'), xt('收入（微单位）'), xt('成本（微单位）')],
      ...(report.value?.daily || []).map((item) => [
        item.date,
        item.jobs,
        item.credits,
        item.revenueMicros,
        item.costMicros
      ])
    ]
    const blob = new Blob([rows.map((row) => row.join(',')).join('\n')], {
      type: 'text/csv;charset=utf-8'
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `xinyue-analysis-${days.value}d.csv`
    link.click()
    URL.revokeObjectURL(url)
  }
  onMounted(load)
</script>

<style scoped lang="scss">
  .dashboard-page {
    min-height: calc(100vh - 130px);
  }

  .dashboard-heading,
  .card-heading {
    display: flex;
    gap: 16px;
    align-items: flex-start;
    justify-content: space-between;
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
    display: grid;
    grid-template-columns: minmax(150px, 210px) auto auto;
    gap: 10px;
    align-items: center;
    white-space: nowrap;
  }

  .heading-actions :deep(.el-button) {
    height: 32px;
    padding: 0 12px;
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

  .table-card {
    min-height: 350px;
  }

  .table-card :deep(.el-table) {
    margin-top: 18px;
  }

  .provider-list {
    margin-top: 24px;
  }

  .provider-row + .provider-row {
    margin-top: 22px;
  }

  .provider-line {
    display: flex;
    gap: 14px;
    justify-content: space-between;
    margin-bottom: 8px;
    font-size: 13px;
  }

  .provider-line span {
    font-size: 12px;
    color: var(--art-gray-500);
  }

  .recent-card {
    margin-bottom: 0;
  }

  .notice-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
    margin-top: 20px;
  }

  .notice-grid > div {
    display: grid;
    grid-template-columns: 22px 1fr auto;
    gap: 8px;
    align-items: center;
    padding: 14px;
    background: var(--art-gray-100);
    border-radius: 6px;
  }

  .notice-grid svg {
    color: var(--el-color-primary);
  }

  .notice-grid span {
    font-size: 13px;
    color: var(--art-gray-600);
  }

  .notice-grid strong {
    color: var(--art-gray-900);
  }

  @media (width <= 900px) {
    .metric-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .notice-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  @media (width <= 600px) {
    .dashboard-heading {
      flex-direction: column;
    }

    .heading-actions {
      grid-template-columns: minmax(0, 1fr) auto auto;
      gap: 6px;
      width: 100%;
    }

    .heading-actions .el-select {
      min-width: 0;
    }

    .metric-grid,
    .notice-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
