<template>
  <div class="art-full-height xinyue-page">
    <div class="page-title"
      ><div
        ><h1>{{ xt('上游渠道') }}</h1
        ><p>{{ xt('统一管理 OpenAI、NewAPI、Sub2API、兼容接口与无密钥图片渠道') }}</p></div
      ><ElSpace
        ><ElButton :loading="checkingAll" @click="checkAll"
          ><ArtSvgIcon icon="ri:pulse-line" />{{ xt('批量检测') }}</ElButton
        ><ElButton type="primary" @click="openCreate"
          ><ArtSvgIcon icon="ri:add-line" />{{ xt('新增渠道') }}</ElButton
        ></ElSpace
      ></div
    >
    <ElAlert
      v-if="batchResult"
      :title="`${xt('检测完成')}：${batchResult.healthy} ${xt('个正常')}，${batchResult.unhealthy} ${xt('个异常')}`"
      :type="batchResult.unhealthy ? 'warning' : 'success'"
      show-icon
      closable
      @close="batchResult = null"
    />
    <ElCard shadow="never" class="art-table-card"
      ><ArtTableHeader :loading="loading" @refresh="load"
        ><template #left
          ><strong>{{ xt('渠道列表') }}</strong></template
        ></ArtTableHeader
      >
      <ElTable v-loading="loading" :data="rows" height="100%" row-key="id">
        <ElTableColumn :label="xt('渠道')" min-width="210"
          ><template #default="{ row }"
            ><strong>{{ row.name }}</strong
            ><small class="block-note"
              >{{ xt(typeText[row.type]) }} ·
              {{ row.type === 'POLLINATIONS' ? xt('无需密钥') : row.apiKeyHint || xt('未配置密钥') }}</small
            ></template
          ></ElTableColumn
        >
        <ElTableColumn
          :label="xt('API 地址')"
          min-width="280"
          prop="baseUrl"
          show-overflow-tooltip
        />
        <ElTableColumn :label="xt('模型绑定')" width="125"
          ><template #default="{ row }"
            >{{ row._count.modelPresets + row._count.modelRoutes }} {{ xt('项') }}</template
          ></ElTableColumn
        >
        <ElTableColumn :label="xt('调度')" width="130"
          ><template #default="{ row }"
            >{{ xt('优先级') }} {{ row.priority
            }}<small class="block-note">{{ xt('权重') }} {{ row.weight }}</small></template
          ></ElTableColumn
        >
        <ElTableColumn :label="xt('健康状态')" width="125"
          ><template #default="{ row }"
            ><ElTag :type="healthType(row)" effect="light">{{
              xt(healthText(row))
            }}</ElTag></template
          ></ElTableColumn
        >
        <ElTableColumn :label="xt('状态')" width="90"
          ><template #default="{ row }"
            ><ElTag :type="row.enabled ? 'success' : 'info'">{{
              row.enabled ? xt('启用') : xt('停用')
            }}</ElTag></template
          ></ElTableColumn
        >
        <ElTableColumn :label="xt('操作')" width="190" fixed="right"
          ><template #default="{ row }"
            ><ElButton link type="primary" :loading="checking === row.id" @click="discover(row)">{{
              xt('连接测试')
            }}</ElButton
            ><ElButton link @click="openEdit(row)">{{ xt('编辑') }}</ElButton
            ><ElButton link type="danger" @click="remove(row)">{{ xt('删除') }}</ElButton></template
          ></ElTableColumn
        >
      </ElTable>
    </ElCard>
    <ElDialog
      v-model="dialog"
      :title="xt(editor.id ? '编辑上游渠道' : '新增上游渠道')"
      width="680px"
    >
      <ElForm label-position="top"
        ><ElRow :gutter="14"
          ><ElCol :span="12"
            ><ElFormItem :label="xt('渠道名称')"
              ><ElInput v-model.trim="editor.name" /></ElFormItem></ElCol
          ><ElCol :span="12"
            ><ElFormItem :label="xt('渠道类型')"
              ><ElSelect v-model="editor.type" class="w-full"
                @change="onProviderTypeChange"
                ><ElOption
                  v-for="(label, value) in typeText"
                  :key="value"
                  :label="xt(label)"
                  :value="value" /></ElSelect></ElFormItem></ElCol></ElRow
        ><ElFormItem label="API Base URL"
          ><ElInput
            v-model.trim="editor.baseUrl"
            :placeholder="
              editor.type === 'POLLINATIONS'
                ? 'https://image.pollinations.ai'
                : 'https://api.example.com/v1'
            " /></ElFormItem
        ><ElAlert
          v-if="editor.type === 'POLLINATIONS'"
          type="info"
          :closable="false"
          :title="xt('该渠道使用图片接口，无需 API 密钥；启用前请确认上游服务条款与可用性。')"
          class="provider-note" />
        <ElFormItem v-if="editor.type !== 'POLLINATIONS'" :label="xt('API 密钥')"
          ><ElInput
            v-model="editor.apiKey"
            type="password"
            show-password
            :placeholder="
              editor.id ? `${xt('留空保留')} ${editor.apiKeyHint || xt('现有密钥')}` : 'sk-...'
            " /></ElFormItem
        ><ElRow :gutter="14"
          ><ElCol v-if="editor.type !== 'POLLINATIONS'" :span="8"
            ><ElFormItem :label="xt('认证方式')"
              ><ElSelect v-model="editor.authType" class="w-full"
                ><ElOption label="Bearer" value="BEARER" /><ElOption
                  label="x-api-key"
                  value="X_API_KEY" /><ElOption
                  :label="xt('两者同时')"
                  value="BOTH" /></ElSelect></ElFormItem></ElCol
          ><ElCol :span="editor.type === 'POLLINATIONS' ? 12 : 8"
            ><ElFormItem :label="xt('优先级')"
              ><ElInputNumber v-model="editor.priority" class="w-full" /></ElFormItem></ElCol
          ><ElCol :span="editor.type === 'POLLINATIONS' ? 12 : 8"
            ><ElFormItem :label="xt('权重')"
              ><ElInputNumber
                v-model="editor.weight"
                :min="0"
                class="w-full" /></ElFormItem></ElCol></ElRow
        ><ElSpace
          ><ElCheckbox v-model="editor.enabled">{{ xt('启用渠道') }}</ElCheckbox
          ><ElCheckbox v-if="editor.type !== 'POLLINATIONS'" v-model="editor.allowUserKeys">{{ xt('允许用户密钥') }}</ElCheckbox></ElSpace
        ></ElForm
      >
      <template #footer
        ><ElButton @click="dialog = false">{{ xt('取消') }}</ElButton
        ><ElButton type="primary" :loading="saving" @click="save">{{
          xt('保存渠道')
        }}</ElButton></template
      >
    </ElDialog>
  </div>
</template>

<script setup lang="ts">
  import { ElMessage, ElMessageBox } from 'element-plus'
  import { xinyueApi, type Provider, type ProviderType } from '@/api/xinyue'
  import { xinyueText as xt } from '@/locales/xinyue'
  defineOptions({ name: 'XinyueProviders' })
  const typeText: Record<string, string> = {
    OPENAI: 'OpenAI 官方',
    NEW_API: 'NewAPI',
    SUB2API: 'Sub2API',
    OPENAI_COMPATIBLE: 'OpenAI 兼容',
    POLLINATIONS: 'Pollinations 图片'
  }
  const emptyEditor = () => ({
    id: '',
    name: '',
    type: 'NEW_API' as ProviderType,
    baseUrl: '',
    apiKey: '',
    apiKeyHint: '',
    authType: 'BEARER' as Provider['authType'],
    enabled: true,
    priority: 0,
    weight: 100,
    timeoutMs: 120000,
    allowUserKeys: true
  })
  const rows = ref<Provider[]>([])
  const loading = ref(false)
  const saving = ref(false)
  const checking = ref('')
  const checkingAll = ref(false)
  const dialog = ref(false)
  const editor = reactive(emptyEditor())
  const batchResult = ref<{ checked: number; healthy: number; unhealthy: number } | null>(null)
  const healthText = (row: Provider) =>
    row.lastHealthStatus === 'healthy'
      ? xt('正常')
      : row.lastHealthStatus
        ? xt('异常')
        : xt('未检测')
  const healthType = (row: Provider) =>
    row.lastHealthStatus === 'healthy' ? 'success' : row.lastHealthStatus ? 'danger' : 'info'
  async function load() {
    loading.value = true
    try {
      rows.value = await xinyueApi.providers()
    } finally {
      loading.value = false
    }
  }
  function openCreate() {
    Object.assign(editor, emptyEditor())
    dialog.value = true
  }
  function openEdit(row: Provider) {
    Object.assign(editor, emptyEditor(), row, { apiKey: '' })
    dialog.value = true
  }
  function onProviderTypeChange(value: ProviderType) {
    if (value === 'POLLINATIONS') {
      if (!editor.baseUrl) editor.baseUrl = 'https://image.pollinations.ai'
      editor.apiKey = ''
      editor.allowUserKeys = false
    }
  }
  async function save() {
    if (!editor.name || !editor.baseUrl) return ElMessage.warning(xt('请填写渠道名称和 API 地址'))
    saving.value = true
    try {
      const body = {
        name: editor.name,
        type: editor.type,
        baseUrl: editor.baseUrl,
        authType: editor.authType,
        enabled: editor.enabled,
        priority: editor.priority,
        weight: editor.weight,
        timeoutMs: editor.timeoutMs,
        allowUserKeys: editor.type === 'POLLINATIONS' ? false : editor.allowUserKeys,
        ...(editor.apiKey ? { apiKey: editor.apiKey } : {})
      }
      await xinyueApi.saveProvider(body, editor.id || undefined)
      dialog.value = false
      await load()
    } finally {
      saving.value = false
    }
  }
  async function discover(row: Provider) {
    checking.value = row.id
    try {
      const result = await xinyueApi.discoverProvider(row.id)
      ElMessage.success(
        `${xt('连接正常，发现')} ${result.models.length} ${xt('个模型')}，${xt('延迟')} ${result.latencyMs}ms`
      )
      await load()
    } finally {
      checking.value = ''
    }
  }
  async function checkAll() {
    checkingAll.value = true
    try {
      batchResult.value = await xinyueApi.checkProviders()
      await load()
    } finally {
      checkingAll.value = false
    }
  }
  async function remove(row: Provider) {
    await ElMessageBox.confirm(`${xt('确认删除渠道')} "${row.name}"?`, xt('删除渠道'), {
      type: 'warning'
    })
    await xinyueApi.deleteProvider(row.id)
    await load()
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
  }
  .provider-note {
    margin-bottom: 16px;
  }

  .page-title {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .page-title h1 {
    margin: 0 0 4px;
    font-size: 22px;
  }

  .page-title p {
    margin: 0;
    color: var(--art-gray-500);
  }

  .block-note {
    display: block;
    margin-top: 3px;
    font-size: 12px;
    color: var(--art-gray-500);
  }

  .w-full {
    width: 100%;
  }
</style>
