<template>
  <div class="search-channel-page">
    <header class="page-title"
      ><div><h1>联网搜索</h1><p>为 Agent 配置实时检索渠道、优先级和自动故障切换</p></div
      ><ElSpace
        ><ElButton :loading="checkingAll" @click="checkAll"
          ><ArtSvgIcon icon="ri:pulse-line" />批量检测</ElButton
        ><ElButton type="primary" @click="openEditor()"
          ><ArtSvgIcon icon="ri:add-line" />新增渠道</ElButton
        ></ElSpace
      ></header
    >
    <ElCard shadow="never" class="tgmeng-card">
      <template #header
        ><div class="tgmeng-card__header"
          ><div class="channel-name"
            ><span class="provider-icon tgmeng"><ArtSvgIcon icon="ri:fire-line" /></span
            ><div
              ><strong>糖果梦实时热榜</strong><small>首页推荐数据源与通用搜索最终保底</small></div
            ></div
          ><ElSpace
            ><ElTag
              :type="
                tgmeng.lastHealthStatus === 'healthy'
                  ? 'success'
                  : tgmeng.lastHealthStatus === 'unhealthy'
                    ? 'danger'
                    : 'info'
              "
              >{{
                tgmeng.lastHealthStatus === 'healthy'
                  ? '连接正常'
                  : tgmeng.lastHealthStatus === 'unhealthy'
                    ? '连接异常'
                    : '尚未检测'
              }}</ElTag
            ><ElButton :loading="tgmengChecking" @click="checkTgmeng">检测</ElButton
            ><ElButton :loading="tgmengRefreshing" @click="refreshTgmeng">立即刷新</ElButton
            ><ElButton type="primary" :loading="tgmengSaving" @click="saveTgmeng"
              >保存配置</ElButton
            ></ElSpace
          ></div
        ></template
      >
      <ElRow :gutter="16">
        <ElCol :xs="24" :md="8"
          ><ElFormItem label="通用密钥"
            ><ElInput
              v-model="tgmengLicense"
              type="password"
              show-password
              :placeholder="
                tgmeng.hasLicense ? `留空保留 ${tgmeng.licenseHint}` : '输入糖果梦通用密钥'
              " /></ElFormItem
        ></ElCol>
        <ElCol :xs="12" :md="4"
          ><ElFormItem label="推荐数量"
            ><ElInputNumber
              v-model="tgmeng.recommendationLimit"
              :min="3"
              :max="12"
              class="wide" /></ElFormItem
        ></ElCol>
        <ElCol :xs="12" :md="4"
          ><ElFormItem label="缓存分钟"
            ><ElInputNumber
              v-model="tgmeng.cacheMinutes"
              :min="1"
              :max="1440"
              class="wide" /></ElFormItem
        ></ElCol>
        <ElCol :xs="12" :md="4"
          ><ElFormItem label="首页推荐"
            ><ElSwitch v-model="tgmeng.recommendationEnabled" active-text="启用" /></ElFormItem
        ></ElCol>
        <ElCol :xs="12" :md="4"
          ><ElFormItem label="搜索保底"
            ><ElSwitch v-model="tgmeng.fallbackEnabled" active-text="启用" /></ElFormItem
        ></ElCol>
      </ElRow>
      <ElFormItem label="首页推荐根分类">
        <ElCheckboxGroup v-model="tgmeng.rootCategories" class="category-options"
          ><ElCheckbox v-for="category in tgmeng.categories" :key="category" :value="category">{{
            category
          }}</ElCheckbox></ElCheckboxGroup
        >
        <small class="help"
          >分类之间为 OR；不选择表示读取全部实时热点。普通搜索保底不受这里的分类限制。</small
        >
      </ElFormItem>
    </ElCard>
    <ElAlert
      v-if="summary"
      :title="`检测完成：${summary.healthy}/${summary.checked} 个渠道正常`"
      :type="summary.unhealthy ? 'warning' : 'success'"
      show-icon
      closable
    />
    <ElCard shadow="never" class="table-card">
      <ElTable v-loading="loading" :data="rows" height="100%">
        <ElTableColumn label="渠道" min-width="220"
          ><template #default="{ row }"
            ><div class="channel-name"
              ><span :class="providerTone(row.type)"><ArtSvgIcon icon="ri:search-eye-line" /></span
              ><div
                ><strong>{{ row.name }}</strong
                ><small
                  >{{ providerText[row.type] || row.type }} · 优先级 {{ row.priority }}</small
                ></div
              ></div
            ></template
          ></ElTableColumn
        >
        <ElTableColumn label="接口地址" min-width="250"
          ><template #default="{ row }"
            ><span class="endpoint">{{ row.endpoint }}</span
            ><small class="note"
              >密钥 {{ row.hasApiKey ? row.apiKeyHint : '未配置' }}</small
            ></template
          ></ElTableColumn
        >
        <ElTableColumn label="运行参数" min-width="150"
          ><template #default="{ row }"
            >{{ row.maxResults }} 条结果<small class="note"
              >超时 {{ row.timeoutMs / 1000 }} 秒</small
            ></template
          ></ElTableColumn
        >
        <ElTableColumn label="健康状态" width="125"
          ><template #default="{ row }"
            ><ElTooltip :content="row.lastHealthMessage || '尚未检测'"
              ><ElTag :type="healthType(row)">{{ healthText(row) }}</ElTag></ElTooltip
            ><small v-if="row.consecutiveFailures" class="note danger"
              >连续失败 {{ row.consecutiveFailures }}</small
            ></template
          ></ElTableColumn
        >
        <ElTableColumn label="请求 / 失败" width="120"
          ><template #default="{ row }"
            >{{ row.totalRequests }} / {{ row.totalFailures }}</template
          ></ElTableColumn
        >
        <ElTableColumn label="状态" width="90"
          ><template #default="{ row }"
            ><ElTag :type="row.enabled ? 'success' : 'info'">{{
              row.enabled ? '启用' : '停用'
            }}</ElTag></template
          ></ElTableColumn
        >
        <ElTableColumn label="操作" width="190" fixed="right"
          ><template #default="{ row }"
            ><ElButton link type="primary" :loading="checking === row.id" @click="check(row)"
              >检测</ElButton
            ><ElButton link @click="openEditor(row)">编辑</ElButton
            ><ElButton link type="danger" @click="remove(row)">删除</ElButton></template
          ></ElTableColumn
        >
      </ElTable>
    </ElCard>

    <ElDialog
      v-model="dialog"
      :title="form.id ? '编辑搜索渠道' : '新增搜索渠道'"
      width="660px"
      destroy-on-close
    >
      <ElForm label-position="top">
        <ElRow :gutter="14"
          ><ElCol :span="12"
            ><ElFormItem label="渠道名称"
              ><ElInput v-model.trim="form.name" maxlength="100" /></ElFormItem></ElCol
          ><ElCol :span="12"
            ><ElFormItem label="服务类型"
              ><ElSelect v-model="form.type" class="wide" @change="applyEndpoint"
                ><ElOption
                  v-for="item in providers"
                  :key="item.value"
                  :label="item.label"
                  :value="item.value" /></ElSelect></ElFormItem></ElCol
        ></ElRow>
        <ElFormItem label="接口地址"
          ><ElInput v-model.trim="form.endpoint" placeholder="https://..."
        /></ElFormItem>
        <ElFormItem label="API 密钥"
          ><ElInput
            v-model="form.apiKey"
            type="password"
            show-password
            :placeholder="
              form.id && form.hasApiKey ? `留空保留 ${form.apiKeyHint}` : '输入服务密钥'
            "
        /></ElFormItem>
        <ElCheckbox v-if="form.id && form.hasApiKey" v-model="form.clearApiKey"
          >清除已保存密钥</ElCheckbox
        >
        <ElRow :gutter="14"
          ><ElCol :span="8"
            ><ElFormItem label="优先级"
              ><ElInputNumber
                v-model="form.priority"
                :min="-10000"
                :max="10000"
                class="wide" /></ElFormItem></ElCol
          ><ElCol :span="8"
            ><ElFormItem label="超时毫秒"
              ><ElInputNumber
                v-model="form.timeoutMs"
                :min="1000"
                :max="60000"
                :step="1000"
                class="wide" /></ElFormItem></ElCol
          ><ElCol :span="8"
            ><ElFormItem label="最大结果数"
              ><ElInputNumber
                v-model="form.maxResults"
                :min="1"
                :max="20"
                class="wide" /></ElFormItem></ElCol
        ></ElRow>
        <ElFormItem label="高级配置（JSON）"
          ><ElInput
            v-model="form.configText"
            type="textarea"
            :rows="6"
            placeholder='{"searchDepth":"advanced"}'
          /><small class="help"
            >Tavily 可设置 searchDepth；Serper 可传 gl、hl。自定义渠道支持
            method、headers、body、queryParam、maxResultsParam，以及
            resultPath、titleField、urlField、contentField、publishedAtField、answerPath
            响应映射。</small
          ></ElFormItem
        >
        <ElSwitch v-model="form.enabled" active-text="启用渠道" />
      </ElForm>
      <template #footer
        ><ElButton @click="dialog = false">取消</ElButton
        ><ElButton type="primary" :loading="saving" @click="save">保存渠道</ElButton></template
      >
    </ElDialog>
  </div>
</template>

<script setup lang="ts">
  import { ElMessage, ElMessageBox } from 'element-plus'
  import request from '@/utils/http'
  defineOptions({ name: 'XinyueWebSearchChannels' })
  type Row = Record<string, any>
  const defaults: Record<string, string> = {
    TAVILY: 'https://api.tavily.com/search',
    SERPER: 'https://google.serper.dev/search',
    BRAVE: 'https://api.search.brave.com/res/v1/web/search',
    EXA: 'https://api.exa.ai/search',
    CUSTOM: ''
  }
  const providerText: Record<string, string> = {
    TAVILY: 'Tavily',
    SERPER: 'Google Serper',
    BRAVE: 'Brave Search',
    EXA: 'Exa',
    CUSTOM: '自定义兼容接口'
  }
  const providers = Object.entries(providerText).map(([value, label]) => ({ value, label }))
  const emptyForm = () => ({
    id: '',
    name: '',
    type: 'TAVILY',
    endpoint: defaults.TAVILY,
    apiKey: '',
    apiKeyHint: '',
    hasApiKey: false,
    clearApiKey: false,
    enabled: true,
    priority: 0,
    timeoutMs: 30000,
    maxResults: 8,
    configText: '{}'
  })
  const rows = ref<Row[]>([]),
    loading = ref(false),
    saving = ref(false),
    dialog = ref(false),
    checking = ref(''),
    checkingAll = ref(false),
    summary = ref<Row | null>(null)
  const tgmeng = reactive<Row>({
    categories: [],
    rootCategories: [],
    recommendationEnabled: false,
    fallbackEnabled: false,
    recommendationLimit: 6,
    cacheMinutes: 10,
    hasLicense: false,
    licenseHint: '',
    lastHealthStatus: null
  })
  const tgmengLicense = ref('')
  const tgmengSaving = ref(false)
  const tgmengChecking = ref(false)
  const tgmengRefreshing = ref(false)
  const form = reactive(emptyForm())
  function providerTone(type: string) {
    return `provider-icon ${type.toLowerCase()}`
  }
  function healthText(row: Row) {
    return row.lastHealthStatus === 'healthy'
      ? '正常'
      : row.lastHealthStatus === 'unhealthy'
        ? '异常'
        : '未检测'
  }
  function healthType(row: Row) {
    return row.lastHealthStatus === 'healthy'
      ? 'success'
      : row.lastHealthStatus === 'unhealthy'
        ? 'danger'
        : 'info'
  }
  async function load() {
    loading.value = true
    try {
      const [channels, tgmengSettings] = await Promise.all([
        request.get<Row[]>({ url: '/v1/admin/web-search-channels' }),
        request.get<Row>({ url: '/v1/admin/web-search-channels/tgmeng' })
      ])
      rows.value = channels
      Object.assign(tgmeng, tgmengSettings)
      tgmengLicense.value = ''
    } finally {
      loading.value = false
    }
  }
  async function saveTgmeng() {
    if (!tgmeng.hasLicense && !tgmengLicense.value.trim())
      return ElMessage.warning('请填写糖果梦通用密钥')
    tgmengSaving.value = true
    try {
      const value = await request.request<Row>({
        url: '/v1/admin/web-search-channels/tgmeng',
        method: 'PUT',
        showSuccessMessage: true,
        data: {
          license: tgmengLicense.value || undefined,
          recommendationEnabled: tgmeng.recommendationEnabled,
          fallbackEnabled: tgmeng.fallbackEnabled,
          rootCategories: tgmeng.rootCategories,
          recommendationLimit: tgmeng.recommendationLimit,
          cacheMinutes: tgmeng.cacheMinutes
        }
      })
      Object.assign(tgmeng, value)
      tgmengLicense.value = ''
    } finally {
      tgmengSaving.value = false
    }
  }
  async function checkTgmeng() {
    tgmengChecking.value = true
    try {
      await request.post({
        url: '/v1/admin/web-search-channels/tgmeng/check',
        params: {},
        showSuccessMessage: true
      })
      Object.assign(tgmeng, await request.get<Row>({ url: '/v1/admin/web-search-channels/tgmeng' }))
    } finally {
      tgmengChecking.value = false
    }
  }
  async function refreshTgmeng() {
    tgmengRefreshing.value = true
    try {
      await request.post({
        url: '/v1/admin/web-search-channels/tgmeng/refresh',
        params: {},
        showSuccessMessage: true
      })
    } finally {
      tgmengRefreshing.value = false
    }
  }
  function openEditor(row?: Row) {
    Object.assign(form, emptyForm(), row || {}, {
      apiKey: '',
      clearApiKey: false,
      configText: JSON.stringify(row?.config || {}, null, 2)
    })
    dialog.value = true
  }
  function applyEndpoint() {
    if (!form.id || !form.endpoint || Object.values(defaults).includes(form.endpoint))
      form.endpoint = defaults[form.type]
  }
  async function save() {
    if (!form.name || !form.endpoint) return ElMessage.warning('请填写渠道名称和接口地址')
    let config: Row
    try {
      config = JSON.parse(form.configText || '{}')
    } catch {
      return ElMessage.warning('高级配置不是有效 JSON')
    }
    saving.value = true
    try {
      const body = {
        name: form.name,
        type: form.type,
        endpoint: form.endpoint,
        apiKey: form.apiKey || undefined,
        clearApiKey: form.clearApiKey,
        enabled: form.enabled,
        priority: form.priority,
        timeoutMs: form.timeoutMs,
        maxResults: form.maxResults,
        config
      }
      await request.request({
        url: form.id ? `/v1/admin/web-search-channels/${form.id}` : '/v1/admin/web-search-channels',
        method: form.id ? 'PATCH' : 'POST',
        data: body,
        showSuccessMessage: true
      })
      dialog.value = false
      await load()
    } finally {
      saving.value = false
    }
  }
  async function check(row: Row) {
    checking.value = row.id
    try {
      await request.post({
        url: `/v1/admin/web-search-channels/${row.id}/check`,
        params: {},
        showSuccessMessage: true
      })
      await load()
    } finally {
      checking.value = ''
    }
  }
  async function checkAll() {
    checkingAll.value = true
    try {
      summary.value = await request.post<Row>({
        url: '/v1/admin/web-search-channels/check-all',
        params: {}
      })
      await load()
    } finally {
      checkingAll.value = false
    }
  }
  async function remove(row: Row) {
    await ElMessageBox.confirm(`确认删除“${row.name}”？`, '删除搜索渠道', { type: 'warning' })
    await request.del({ url: `/v1/admin/web-search-channels/${row.id}`, showSuccessMessage: true })
    await load()
  }
  onMounted(load)
</script>

<style scoped>
  .search-channel-page {
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

  .table-card {
    min-height: 560px;
    overflow: hidden;
  }

  .tgmeng-card__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }
  .provider-icon.tgmeng {
    color: #b45309;
    background: #fff7ed;
  }
  .category-options {
    display: flex;
    flex-wrap: wrap;
    gap: 2px 14px;
  }
  .category-options :deep(.el-checkbox) {
    margin-right: 0;
  }

  .table-card :deep(.el-card__body) {
    height: 100%;
    min-height: 0;
    padding: 0;
  }

  .channel-name {
    display: flex;
    gap: 11px;
    align-items: center;
  }

  .channel-name > span {
    display: grid;
    flex: 0 0 auto;
    place-items: center;
    width: 36px;
    height: 36px;
    font-size: 18px;
    color: #2563eb;
    background: #eff6ff;
    border-radius: 6px;
  }

  .channel-name > div {
    display: grid;
    min-width: 0;
  }

  .channel-name small,
  .note,
  .help {
    display: block;
    font-size: 11px;
    line-height: 1.5;
    color: var(--art-gray-500);
  }

  .danger {
    color: var(--el-color-danger);
  }

  .endpoint {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    font-family: Consolas, monospace;
    font-size: 11px;
    white-space: nowrap;
  }

  .wide {
    width: 100%;
  }

  .help {
    margin-top: 6px;
  }

  @media (width <= 720px) {
    .page-title {
      flex-direction: column;
      align-items: flex-start;
    }
    .tgmeng-card__header {
      align-items: flex-start;
      flex-direction: column;
    }
  }
</style>
