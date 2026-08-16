<template>
  <div class="health-page">
    <header class="page-heading">
      <div>
        <span class="eyebrow">{{ xt('运维中心') }}</span>
        <h1>{{ xt('系统健康') }}</h1>
        <p>{{ xt('实时查看 Xinyue AI API、数据库、队列、文件存储和模型渠道状态。') }}</p>
      </div>
      <ElSpace>
        <ElButton :loading="checkingProviders" @click="checkProviders">
          <ArtSvgIcon icon="ri:pulse-line" />
          {{ xt('检测渠道') }}
        </ElButton>
        <ElButton :loading="loading" @click="load">
          <ArtSvgIcon icon="ri:refresh-line" />
          {{ xt('刷新状态') }}
        </ElButton>
      </ElSpace>
    </header>

    <ElAlert
      v-if="errorMessage"
      :title="errorMessage"
      type="error"
      show-icon
      closable
      @close="errorMessage = ''"
    />

    <section class="summary-grid">
      <article v-for="item in summaryItems" :key="item.label" class="summary-card">
        <div class="summary-icon" :class="`is-${item.tone}`">
          <ArtSvgIcon :icon="item.icon" />
        </div>
        <div>
          <span>{{ item.label }}</span>
          <strong>{{ item.value }}</strong>
          <small>{{ item.note }}</small>
        </div>
      </article>
    </section>

    <section class="health-layout">
      <ElCard shadow="never" class="art-table-card">
        <template #header>
          <div class="card-heading">
            <div>
              <strong>{{ xt('核心服务') }}</strong>
              <span>{{ xt('来自当前管理服务的真实探针结果') }}</span>
            </div>
            <ElTag :type="overallHealthy ? 'success' : 'danger'" effect="light">
              {{ overallHealthy ? xt('运行正常') : xt('存在异常') }}
            </ElTag>
          </div>
        </template>

        <div class="service-list">
          <div v-for="service in services" :key="service.key" class="service-row">
            <div class="service-name">
              <span class="status-dot" :class="`is-${service.status}`" />
              <div>
                <strong>{{ service.name }}</strong>
                <small>{{ service.description }}</small>
              </div>
            </div>
            <ElTag :type="statusType(service.status)" effect="light">
              {{ statusText(service.status) }}
            </ElTag>
            <span class="service-detail">{{ service.detail }}</span>
          </div>
        </div>
      </ElCard>

      <ElCard shadow="never" class="art-table-card">
        <template #header>
          <div class="card-heading">
            <div>
              <strong>{{ xt('上游渠道') }}</strong>
              <span>{{ xt('模型渠道最近一次健康检查') }}</span>
            </div>
            <ElButton size="small" @click="goProviders">{{ xt('管理渠道') }}</ElButton>
          </div>
        </template>

        <div v-if="providers.length" class="provider-list">
          <div v-for="provider in providers" :key="provider.id" class="provider-row">
            <div>
              <strong>{{ provider.name }}</strong>
              <small>{{ provider.type }} · {{ provider.modelCount }} {{ xt('个模型') }}</small>
            </div>
            <div class="provider-meta">
              <ElTag
                :type="!provider.checked ? 'info' : provider.healthy ? 'success' : 'danger'"
                effect="light"
              >
                {{ !provider.checked ? xt('未检测') : provider.healthy ? xt('正常') : xt('异常') }}
              </ElTag>
              <span v-if="provider.latencyMs !== null">{{ provider.latencyMs }}ms</span>
            </div>
          </div>
        </div>
        <ElEmpty v-else :description="xt('暂无渠道检查结果')" :image-size="70" />
      </ElCard>
    </section>

    <footer class="health-footer">
      <span>{{ xt('最后检查') }}: {{ checkedAt ? formatDate(checkedAt) : xt('尚未检查') }}</span>
      <span>{{ xt('环境') }}: {{ system?.environment || xt('未知') }}</span>
    </footer>
  </div>
</template>

<script setup lang="ts">
  import { useRouter } from 'vue-router'
  import request from '@/utils/http'
  import { xinyueLocale, xinyueText as xt } from '@/locales/xinyue'

  defineOptions({ name: 'SafeguardServer' })

  type HealthStatus = 'healthy' | 'unhealthy' | 'unknown'
  type Probe = { status: HealthStatus; latencyMs: number; message?: string }
  type SystemHealth = {
    api: Probe
    database: Probe
    queue: Probe
    storage: Probe & { driver?: string; directory?: string; writable?: boolean }
    runtime?: {
      uptimeSeconds: number
      memoryRssBytes: number
      heapUsedBytes: number
      nodeVersion: string
      platform: string
    }
    environment?: string
    checkedAt?: string
  }
  type ProviderHealth = {
    id: string
    name: string
    type: string
    checked: boolean
    healthy: boolean
    latencyMs: number | null
    modelCount: number
  }
  type ProviderRecord = {
    id: string
    name: string
    type: string
    enabled: boolean
    lastHealthStatus?: string
    lastHealthMessage?: string
    _count?: { modelPresets?: number }
  }

  const router = useRouter()
  const loading = ref(false)
  const checkingProviders = ref(false)
  const errorMessage = ref('')
  const system = ref<SystemHealth | null>(null)
  const providers = ref<ProviderHealth[]>([])
  const checkedAt = ref('')

  const services = computed(() => [
    {
      key: 'api',
      name: 'Xinyue AI API',
      description: xt('管理服务与业务接口'),
      status: system.value?.api.status || ('unknown' as HealthStatus),
      detail: probeDetail(system.value?.api, xt('当前页面已连接'))
    },
    {
      key: 'database',
      name: xt('数据库'),
      description: xt('用户、订单和业务数据'),
      status: system.value?.database.status || ('unknown' as HealthStatus),
      detail: probeDetail(system.value?.database)
    },
    {
      key: 'queue',
      name: xt('任务队列'),
      description: xt('异步生成和后台任务'),
      status: system.value?.queue.status || ('unknown' as HealthStatus),
      detail: probeDetail(system.value?.queue)
    },
    {
      key: 'storage',
      name: xt('文件存储'),
      description: xt('上传文件与生成资产'),
      status: system.value?.storage.status || ('unknown' as HealthStatus),
      detail: probeDetail(system.value?.storage, system.value?.storage.driver)
    }
  ])

  const overallHealthy = computed(() =>
    services.value.every((service) => service.status !== 'unhealthy')
  )
  const summaryItems = computed(() => [
    {
      label: xt('核心服务'),
      value: `${services.value.filter((item) => item.status === 'healthy').length}/${services.value.length}`,
      note: xt('正常服务数'),
      icon: 'ri:server-line',
      tone: 'blue'
    },
    {
      label: xt('模型渠道'),
      value: providers.value.length,
      note: xt('已完成最近检查'),
      icon: 'ri:route-line',
      tone: 'green'
    },
    {
      label: xt('异常渠道'),
      value: providers.value.filter((item) => item.checked && !item.healthy).length,
      note: xt('需要运营处理'),
      icon: 'ri:alarm-warning-line',
      tone: 'orange'
    },
    {
      label: xt('服务进程'),
      value: formatDuration(system.value?.runtime?.uptimeSeconds),
      note: system.value?.runtime
        ? `${formatBytes(system.value.runtime.memoryRssBytes)} ${xt('内存')}`
        : xt('等待检查'),
      icon: 'ri:cloud-line',
      tone: 'purple'
    }
  ])

  const statusText = (status: HealthStatus) =>
    ({ healthy: xt('正常'), unhealthy: xt('异常'), unknown: xt('未知') })[status]
  const statusType = (status: HealthStatus): 'success' | 'danger' | 'info' => {
    if (status === 'healthy') return 'success'
    if (status === 'unhealthy') return 'danger'
    return 'info'
  }
  const formatDate = (value: string) =>
    new Date(value).toLocaleString(xinyueLocale(), { hour12: false })
  const formatBytes = (value = 0) =>
    value >= 1024 ** 3
      ? `${(value / 1024 ** 3).toFixed(1)} GB`
      : `${(value / 1024 ** 2).toFixed(0)} MB`
  const formatDuration = (seconds = 0) =>
    seconds
      ? seconds >= 86_400
        ? `${Math.floor(seconds / 86_400)} ${xt('天')}`
        : `${Math.floor(seconds / 3_600)} ${xt('小时')}`
      : xt('等待检查')
  const probeDetail = (probe?: Probe, fallback = xt('等待检查')) =>
    probe ? probe.message || `${probe.latencyMs}ms` : fallback

  const load = async () => {
    loading.value = true
    errorMessage.value = ''
    try {
      const [health, items] = await Promise.all([
        request.get<SystemHealth>({ url: '/v1/admin/system' }),
        request.get<ProviderRecord[]>({ url: '/v1/admin/providers' })
      ])
      system.value = health
      providers.value = items
        .filter((item) => item.enabled)
        .map((item) => ({
          id: item.id,
          name: item.name,
          type: item.type,
          checked: Boolean(item.lastHealthStatus),
          healthy: item.lastHealthStatus === 'healthy',
          latencyMs: null,
          modelCount: item._count?.modelPresets || 0
        }))
      checkedAt.value = health.checkedAt || new Date().toISOString()
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : xt('系统健康检查失败')
    } finally {
      loading.value = false
    }
  }

  const checkProviders = async () => {
    checkingProviders.value = true
    try {
      const result = await request.post<{
        results: Array<Omit<ProviderHealth, 'checked' | 'type'>>
      }>({ url: '/v1/admin/providers/check-all', params: {}, showSuccessMessage: true })
      const current = new Map(providers.value.map((item) => [item.id, item]))
      providers.value = result.results.map((item) => ({
        ...item,
        checked: true,
        type: current.get(item.id)?.type || 'OPENAI_COMPATIBLE'
      }))
      checkedAt.value = new Date().toISOString()
    } finally {
      checkingProviders.value = false
    }
  }

  const goProviders = () => router.push('/enterprise/ai/providers')

  onMounted(load)
</script>

<style scoped>
  .health-page {
    display: flex;
    flex-direction: column;
    gap: 16px;
    min-height: 100%;
  }

  .page-heading,
  .card-heading,
  .service-row,
  .provider-row,
  .health-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .page-heading {
    padding: 4px 2px 0;
  }

  .page-heading h1 {
    margin: 6px 0 4px;
    font-size: 24px;
  }

  .page-heading p,
  .eyebrow,
  .card-heading span,
  .service-name small,
  .provider-row small,
  .health-footer {
    font-size: 12px;
    color: var(--art-gray-500);
  }

  .page-heading p {
    margin: 0;
  }

  .eyebrow {
    font-weight: 700;
    color: var(--main-color);
  }

  .summary-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 14px;
  }

  .summary-card {
    display: flex;
    gap: 13px;
    align-items: center;
    min-width: 0;
    padding: 18px;
    background: var(--default-box-color);
    border: 1px solid var(--art-gray-200);
    border-radius: 7px;
  }

  .summary-icon {
    display: grid;
    flex: 0 0 auto;
    place-items: center;
    width: 38px;
    height: 38px;
    font-size: 18px;
    border-radius: 7px;
  }

  .summary-icon.is-blue {
    color: #2563eb;
    background: #eff6ff;
  }

  .summary-icon.is-green {
    color: #16a34a;
    background: #f0fdf4;
  }

  .summary-icon.is-orange {
    color: #ea580c;
    background: #fff7ed;
  }

  .summary-icon.is-purple {
    color: #7c3aed;
    background: #f5f3ff;
  }

  .summary-card > div:last-child {
    display: grid;
    gap: 3px;
    min-width: 0;
  }

  .summary-card span {
    font-size: 12px;
    color: var(--art-gray-500);
  }

  .summary-card strong {
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 22px;
    white-space: nowrap;
  }

  .summary-card small {
    font-size: 11px;
    color: var(--art-gray-500);
  }

  .health-layout {
    display: grid;
    grid-template-columns: minmax(0, 1.1fr) minmax(320px, 0.9fr);
    gap: 14px;
  }

  .art-table-card {
    min-width: 0;
    border-radius: 7px;
  }

  .card-heading > div {
    display: grid;
    gap: 3px;
  }

  .card-heading strong {
    font-size: 15px;
  }

  .service-list,
  .provider-list {
    display: grid;
    gap: 1px;
    overflow: hidden;
    background: var(--art-gray-200);
    border: 1px solid var(--art-gray-200);
    border-radius: 6px;
  }

  .service-row,
  .provider-row {
    gap: 14px;
    min-width: 0;
    padding: 14px;
    background: var(--default-box-color);
  }

  .service-name,
  .provider-row > div:first-child {
    display: flex;
    gap: 10px;
    align-items: center;
    min-width: 0;
  }

  .service-name > div,
  .provider-row > div:first-child {
    display: grid;
    gap: 3px;
    min-width: 0;
  }

  .service-name strong,
  .provider-row strong {
    font-size: 13px;
  }

  .service-name small,
  .provider-row small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .status-dot {
    flex: 0 0 auto;
    width: 8px;
    height: 8px;
    background: var(--art-gray-400);
    border-radius: 50%;
  }

  .status-dot.is-healthy {
    background: #22c55e;
    box-shadow: 0 0 0 4px #dcfce7;
  }

  .status-dot.is-unhealthy {
    background: #ef4444;
    box-shadow: 0 0 0 4px #fee2e2;
  }

  .service-detail {
    min-width: 72px;
    font-size: 12px;
    color: var(--art-gray-500);
    text-align: right;
  }

  .provider-meta {
    display: flex;
    flex: 0 0 auto;
    gap: 10px;
    align-items: center;
    font-size: 12px;
    color: var(--art-gray-500);
  }

  .health-footer {
    padding: 0 2px 4px;
  }

  @media (width <= 900px) {
    .summary-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .health-layout {
      grid-template-columns: 1fr;
    }
  }

  @media (width <= 560px) {
    .page-heading {
      flex-direction: column;
      gap: 12px;
      align-items: flex-start;
    }

    .summary-grid {
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }

    .summary-card {
      padding: 12px;
    }

    .summary-icon {
      width: 32px;
      height: 32px;
    }

    .service-row,
    .provider-row {
      flex-wrap: wrap;
      align-items: flex-start;
    }

    .service-detail {
      width: 100%;
      padding-left: 18px;
      text-align: left;
    }

    .health-footer {
      flex-direction: column;
      gap: 4px;
      align-items: flex-start;
    }
  }
</style>
