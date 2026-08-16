<template>
  <div class="art-full-height xinyue-page">
    <div class="page-title"
      ><div
        ><h1>{{ xt('模型与定价') }}</h1
        ><p>{{ xt('前端显示模型、上游标识、能力和创作点定价') }}</p></div
      ><ElButton type="primary" @click="openCreate"
        ><ArtSvgIcon icon="ri:add-line" />{{ xt('新增模型') }}</ElButton
      ></div
    >
    <ElCard shadow="never" class="filter-card"
      ><ElSegmented v-model="capability" :options="capabilities" /><span class="model-count"
        >{{ filtered.length }} {{ xt('个模型') }}</span
      ></ElCard
    >
    <ElCard shadow="never" class="art-table-card"
      ><ArtTableHeader :loading="loading" @refresh="load"
        ><template #left
          ><strong>{{ capabilityLabel }}</strong></template
        ></ArtTableHeader
      >
      <ElTable v-loading="loading" :data="filtered" height="100%" row-key="id">
        <ElTableColumn :label="xt('前端模型')" min-width="220"
          ><template #default="{ row }"
            ><strong>{{ row.displayName }}</strong
            ><ElTag v-if="row.badge" size="small" class="badge">{{ row.badge }}</ElTag
            ><small class="block-note"
              >{{ row.key }}<template v-if="row.isDefault"> · {{ xt('默认模型') }}</template></small
            ></template
          ></ElTableColumn
        >
        <ElTableColumn :label="xt('上游模型')" min-width="190"
          ><template #default="{ row }"
            ><strong>{{ row.upstreamModel }}</strong
            ><small class="block-note">{{ xt('默认上游标识') }}</small></template
          ></ElTableColumn
        >
        <ElTableColumn :label="xt('故障切换渠道')" min-width="260"
          ><template #default="{ row }"
            ><div v-if="routeChannels(row).length" class="channel-tags"
              ><ElTag
                v-for="channel in routeChannels(row)"
                :key="channel.key"
                size="small"
                :type="channel.enabled ? (channel.fallback ? 'info' : 'success') : 'info'"
                :effect="channel.enabled ? 'light' : 'plain'"
                >{{ channel.name }} ·
                {{ channel.fallback ? xt('最终兜底') : `P${channel.priority}` }}</ElTag
              ></div
            ><span v-else class="block-note">{{ xt('未绑定渠道') }}</span
            ><small class="block-note">{{ routeSummary(row) }}</small></template
          ></ElTableColumn
        >
        <ElTableColumn :label="xt('计费')" min-width="180"
          ><template #default="{ row }"
            ><strong>{{ pricingSummary(row) }}</strong
            ><small
              class="block-note"
              v-if="row.inputCreditsPerMillion || row.outputCreditsPerMillion"
              >{{ xt('输入') }} {{ row.inputCreditsPerMillion }} · {{ xt('输出') }}
              {{ row.outputCreditsPerMillion }} / M</small
            ><small v-else class="block-note">{{ xt('固定计费') }}</small></template
          ></ElTableColumn
        >
        <ElTableColumn :label="xt('用户密钥')" width="115"
          ><template #default="{ row }"
            ><ElTag :type="row.allowUserKey ? 'success' : 'info'" effect="light">{{
              row.allowUserKey ? xt('允许 BYOK') : xt('管理员渠道')
            }}</ElTag></template
          ></ElTableColumn
        >
        <ElTableColumn :label="xt('排序')" prop="sortOrder" width="75" />
        <ElTableColumn :label="xt('状态')" width="95"
          ><template #default="{ row }"
            ><ElTag :type="row.enabled ? 'success' : 'info'">{{
              row.enabled ? xt('前端可见') : xt('已停用')
            }}</ElTag></template
          ></ElTableColumn
        >
        <ElTableColumn :label="xt('操作')" width="125" fixed="right"
          ><template #default="{ row }"
            ><ElButton link type="primary" @click="openEdit(row)">{{ xt('编辑') }}</ElButton
            ><ElButton link type="danger" @click="remove(row)">{{ xt('删除') }}</ElButton></template
          ></ElTableColumn
        >
      </ElTable>
    </ElCard>
    <ElDialog
      v-model="dialog"
      :title="xt(editor.id ? '编辑模型预设' : '新增模型预设')"
      width="min(900px, calc(100vw - 32px))"
      class="model-dialog"
    >
      <ElForm label-position="top"
        ><ElRow :gutter="14"
          ><ElCol :span="12"
            ><ElFormItem :label="xt('模型标识')"
              ><ElInput v-model.trim="editor.key" placeholder="gpt-4.1" /></ElFormItem></ElCol
          ><ElCol :span="12"
            ><ElFormItem :label="xt('前端显示名')"
              ><ElInput
                v-model.trim="editor.displayName"
                placeholder="GPT-4.1" /></ElFormItem></ElCol></ElRow
        ><ElRow :gutter="14"
          ><ElCol :span="8"
            ><ElFormItem :label="xt('能力类型')"
              ><ElSelect v-model="editor.capability" class="w-full"
                ><ElOption
                  v-for="item in capabilities"
                  :key="item.value"
                  :label="item.label"
                  :value="item.value" /></ElSelect></ElFormItem></ElCol
          ><ElCol :span="8"
            ><ElFormItem :label="xt('角标')"
              ><ElInput v-model.trim="editor.badge" :placeholder="xt('推荐')" /></ElFormItem></ElCol
          ><ElCol :span="8"
            ><ElFormItem :label="xt('排序')"
              ><ElInputNumber
                v-model="editor.sortOrder"
                class="w-full" /></ElFormItem></ElCol></ElRow
        ><ElRow :gutter="14"
          ><ElCol :span="12"
            ><ElFormItem :label="xt('默认上游模型')"
              ><ElInput
                v-model.trim="editor.upstreamModel"
                placeholder="gpt-4.1" /></ElFormItem></ElCol
          ><ElCol :span="12"
            ><ElFormItem :label="xt('最终兜底渠道')"
              ><ElSelect v-model="editor.providerId" clearable class="w-full"
                ><ElOption
                  v-for="provider in providers"
                  :key="provider.id"
                  :label="provider.name"
                  :value="provider.id" /></ElSelect></ElFormItem></ElCol></ElRow
        ><ElRow v-if="editor.capability === 'CHAT'" :gutter="14"
          ><ElCol :span="12"
            ><ElFormItem :label="xt('上游接口协议')"
              ><ElSelect v-model="editor.apiProtocol" class="w-full"
                ><ElOption label="OpenAI Compatible" value="openai" /><ElOption
                  label="Anthropic Messages"
                  value="anthropic" /><ElOption
                  label="Google Gemini"
                  value="gemini" /></ElSelect></ElFormItem></ElCol
          ><ElCol :span="12"
            ><ElAlert
              type="info"
              :closable="false"
              :title="
                xt('NewAPI、Sub2API、DeepSeek、Qwen、Grok 通常选择 OpenAI Compatible。')
              " /></ElCol></ElRow
        ><template v-if="editor.capability === 'IMAGE' || editor.capability === 'COMMERCE'"
          ><ElDivider content-position="left">{{ xt('图片模型能力') }}</ElDivider
          ><ElRow :gutter="14"
            ><ElCol :span="16"
              ><ElFormItem :label="xt('支持尺寸（逗号分隔）')"
                ><ElInput
                  v-model.trim="editor.imageSizes"
                  placeholder="1024x1024, 2048x2048, 4096x4096" /></ElFormItem></ElCol
            ><ElCol :span="8"
              ><ElFormItem :label="xt('单次最多生成')"
                ><ElInputNumber
                  v-model="editor.imageMaxCount"
                  :min="1"
                  :max="10"
                  class="w-full" /></ElFormItem></ElCol></ElRow
          ><ElSpace wrap
            ><ElCheckbox v-model="editor.supportsReference">{{
              xt('支持参考图 / 图生图')
            }}</ElCheckbox
            ><ElCheckbox v-model="editor.supportsMask">{{
              xt('支持蒙版编辑')
            }}</ElCheckbox></ElSpace
          ><ElDivider content-position="left">{{ xt('分辨率价格（创作点 / 张）') }}</ElDivider
          ><ElRow :gutter="14"
            ><ElCol :span="8"
              ><ElFormItem label="1K"
                ><ElInputNumber
                  v-model="editor.imagePrice1K"
                  :min="0"
                  class="w-full" /></ElFormItem></ElCol
            ><ElCol :span="8"
              ><ElFormItem label="2K"
                ><ElInputNumber
                  v-model="editor.imagePrice2K"
                  :min="0"
                  class="w-full" /></ElFormItem></ElCol
            ><ElCol :span="8"
              ><ElFormItem label="4K"
                ><ElInputNumber
                  v-model="editor.imagePrice4K"
                  :min="0"
                  class="w-full" /></ElFormItem></ElCol></ElRow></template
        ><template v-if="editor.capability === 'VIDEO'"
          ><ElDivider content-position="left">{{ xt('视频模型能力与定价') }}</ElDivider
          ><ElAlert
            type="info"
            :closable="false"
            :title="
              xt(
                '这里配置对用户开放的规格；下方每个调度渠道再配置其真实能力，前端只展示两者都支持的选项。'
              )
            " />
          ><ElRow :gutter="14"
            ><ElCol :span="8"
              ><ElFormItem :label="xt('支持分辨率')"
                ><ElInput
                  v-model.trim="editor.videoResolutions"
                  placeholder="720p, 1080p" /></ElFormItem></ElCol
            ><ElCol :span="8"
              ><ElFormItem :label="xt('支持时长（秒）')"
                ><ElInput
                  v-model.trim="editor.videoDurations"
                  placeholder="5, 10" /></ElFormItem></ElCol
            ><ElCol :span="8"
              ><ElFormItem :label="xt('画面比例')"
                ><ElInput
                  v-model.trim="editor.videoAspectRatios"
                  placeholder="16:9, 9:16, 1:1" /></ElFormItem></ElCol></ElRow
          ><div class="video-pricing-grid"
            ><label v-for="item in videoPricingOptions" :key="item.key"
              ><span
                ><strong>{{ item.resolution }}</strong
                ><small>{{ item.duration }} 秒</small></span
              ><ElInputNumber
                :model-value="editor.videoPricing[item.key] ?? 0"
                :min="0"
                @update:model-value="setVideoPrice(item.key, $event)" /></label></div
          ><ElDivider content-position="left">{{ xt('OpenAI Compatible 视频接口') }}</ElDivider
          ><ElRow :gutter="14"
            ><ElCol :span="8"
              ><ElFormItem :label="xt('创建路径')"
                ><ElInput
                  v-model.trim="editor.videoCreatePath"
                  placeholder="/videos" /></ElFormItem></ElCol
            ><ElCol :span="8"
              ><ElFormItem :label="xt('状态路径')"
                ><ElInput
                  v-model.trim="editor.videoStatusPath"
                  placeholder="/videos/{id}" /></ElFormItem></ElCol
            ><ElCol :span="8"
              ><ElFormItem :label="xt('内容路径')"
                ><ElInput
                  v-model.trim="editor.videoContentPath"
                  placeholder="/videos/{id}/content" /></ElFormItem></ElCol></ElRow></template
        ><ElFormItem :label="xt('模型说明')"
          ><ElInput v-model.trim="editor.description" type="textarea" :rows="3" maxlength="1000"
        /></ElFormItem>
        <ElDivider content-position="left">{{ xt('渠道与故障切换') }}</ElDivider>
        <div class="route-heading"
          ><div
            ><strong>{{ xt('调度渠道') }}</strong
            ><small>{{
              xt('优先级数值越大越先尝试；同优先级按权重分流，请求失败后自动切换下一渠道。')
            }}</small></div
          ><ElButton :disabled="!canAddRoute" @click="addRoute"
            ><ArtSvgIcon icon="ri:add-line" />{{ xt('添加渠道') }}</ElButton
          ></div
        >
        <ElAlert
          v-if="schedulableProviders.length < 2"
          type="warning"
          :closable="false"
          :title="
            xt('当前只有一个已启用上游渠道，请先在渠道接入新增渠道，才能形成真正的故障切换。')
          "
        />
        <div v-if="routeEditors.length" class="route-list"
          ><div class="route-labels"
            ><span>{{ xt('渠道') }}</span
            ><span>{{ xt('上游模型覆盖') }}</span
            ><span>{{ xt('优先级（越大越先）') }}</span
            ><span>{{ xt('权重') }}</span
            ><span>{{ xt('启用') }}</span
            ><span /></div
          ><div
            v-for="(route, index) in routeEditors"
            :key="`${route.providerId}-${index}`"
            class="route-entry"
            ><div class="route-row"
              ><ElSelect
                v-model="route.providerId"
                filterable
                :placeholder="xt('选择渠道')"
                @change="syncRouteVideoProfile(route)"
                ><ElOption
                  v-for="provider in providers"
                  :key="provider.id"
                  :label="`${provider.name}${provider.enabled ? '' : ` (${xt('已停用')})`}`"
                  :value="provider.id"
                  :disabled="!provider.enabled && provider.id !== route.providerId" /></ElSelect
              ><ElInput
                v-model.trim="route.upstreamModelOverride"
                :placeholder="xt('留空继承默认上游模型')" /><ElInputNumber
                v-model="route.priority"
                :min="-10000"
                :max="10000"
                controls-position="right" /><ElInputNumber
                v-model="route.weight"
                :min="0"
                :max="10000"
                controls-position="right" /><ElSwitch v-model="route.enabled" /><ElButton
                circle
                text
                type="danger"
                :title="xt('移除渠道')"
                @click="removeRoute(index)"
                ><ArtSvgIcon icon="ri:delete-bin-line" /></ElButton></div
            ><div v-if="editor.capability === 'VIDEO'" class="route-video-config"
              ><label class="route-video-field"
                ><span>{{ xt('视频能力分组') }}</span
                ><ElSelect v-model="route.videoProfile" @change="applyRouteVideoProfile(route)"
                  ><ElOption :label="xt('Grok 视频组（最高 720p）')" value="GROK" /><ElOption
                    :label="xt('Full HD 视频组（最高 1080p）')"
                    value="FULL_HD" /><ElOption
                    :label="xt('自定义能力')"
                    value="CUSTOM" /></ElSelect></label
              ><label class="route-video-field"
                ><span>{{ xt('支持分辨率') }}</span
                ><ElInput
                  v-model.trim="route.videoResolutions"
                  :placeholder="xt('480p, 720p, 1080p')"
              /></label>
              <label class="route-video-field"
                ><span>{{ xt('支持时长（秒）') }}</span
                ><ElInput v-model.trim="route.videoDurations" :placeholder="xt('5, 10')"
              /></label>
              <label class="route-video-field"
                ><span>{{ xt('画面比例') }}</span
                ><ElInput
                  v-model.trim="route.videoAspectRatios"
                  :placeholder="xt('16:9, 9:16, 1:1')" /></label></div></div
        ></div>
        <ElEmpty
          v-else
          :description="xt('尚未配置调度渠道，将只使用最终兜底渠道')"
          :image-size="56"
        />
        <ElDivider content-position="left">{{ xt('计费与前端权限') }}</ElDivider
        ><ElRow :gutter="14"
          ><ElCol :span="8"
            ><ElFormItem :label="xt('固定点数 / 次')"
              ><ElInputNumber
                v-model="editor.flatCreditCost"
                :min="0"
                class="w-full" /></ElFormItem></ElCol
          ><ElCol :span="8"
            ><ElFormItem :label="xt('输入点数 / M token')"
              ><ElInputNumber
                v-model="editor.inputCreditsPerMillion"
                :min="0"
                class="w-full" /></ElFormItem></ElCol
          ><ElCol :span="8"
            ><ElFormItem :label="xt('输出点数 / M token')"
              ><ElInputNumber
                v-model="editor.outputCreditsPerMillion"
                :min="0"
                class="w-full" /></ElFormItem></ElCol></ElRow
        ><ElSpace wrap
          ><ElCheckbox v-model="editor.enabled">{{ xt('前端启用') }}</ElCheckbox
          ><ElCheckbox v-model="editor.isDefault">{{ xt('设为默认模型') }}</ElCheckbox
          ><ElCheckbox v-model="editor.allowUserKey">{{ xt('允许用户 BYOK') }}</ElCheckbox></ElSpace
        ></ElForm
      >
      <template #footer
        ><ElButton @click="dialog = false">{{ xt('取消') }}</ElButton
        ><ElButton type="primary" :loading="saving" @click="save">{{
          xt('保存模型')
        }}</ElButton></template
      >
    </ElDialog>
  </div>
</template>

<script setup lang="ts">
  import { ElMessage, ElMessageBox } from 'element-plus'
  import { xinyueApi, type ModelPreset, type ModelProviderRoute, type Provider } from '@/api/xinyue'
  import { xinyueText as xt } from '@/locales/xinyue'
  defineOptions({ name: 'XinyueModels' })
  type Capability = ModelPreset['capability']
  type RouteEditor = {
    providerId: string
    upstreamModelOverride: string
    enabled: boolean
    priority: number
    weight: number
    videoProfile: 'GROK' | 'FULL_HD' | 'CUSTOM'
    videoResolutions: string
    videoDurations: string
    videoAspectRatios: string
  }
  const capabilities = computed(() => [
    { label: xt('AI 对话'), value: 'CHAT' as Capability },
    { label: xt('图片生成'), value: 'IMAGE' as Capability },
    { label: xt('视频生成'), value: 'VIDEO' as Capability },
    { label: xt('商品视觉'), value: 'COMMERCE' as Capability }
  ])
  const emptyEditor = () => ({
    id: '',
    key: '',
    displayName: '',
    description: '',
    providerId: '',
    upstreamModel: '',
    capability: 'CHAT' as Capability,
    enabled: true,
    isDefault: false,
    allowUserKey: true,
    sortOrder: 10,
    flatCreditCost: 1,
    inputCreditsPerMillion: 0,
    outputCreditsPerMillion: 0,
    badge: '',
    apiProtocol: 'openai' as 'openai' | 'anthropic' | 'gemini',
    imageSizes: '1024x1024, 1536x1024, 1024x1536, 2048x2048, 4096x4096',
    imageMaxCount: 4,
    supportsReference: true,
    supportsMask: false,
    imagePrice1K: 1,
    imagePrice2K: 2,
    imagePrice4K: 4,
    videoResolutions: '720p, 1080p',
    videoDurations: '5, 10',
    videoAspectRatios: '16:9, 9:16, 1:1',
    videoPricing: {
      '720p:5': 10,
      '720p:10': 20,
      '1080p:5': 20,
      '1080p:10': 40
    } as Record<string, number>,
    videoCreatePath: '/videos',
    videoStatusPath: '/videos/{id}',
    videoContentPath: '/videos/{id}/content'
  })
  const rows = ref<ModelPreset[]>([])
  const providers = ref<Provider[]>([])
  const capability = ref<Capability>('CHAT')
  const loading = ref(false)
  const saving = ref(false)
  const dialog = ref(false)
  const editor = reactive(emptyEditor())
  const routeEditors = ref<RouteEditor[]>([])
  const filtered = computed(() =>
    rows.value
      .filter((item) => item.capability === capability.value)
      .sort((a, b) => a.sortOrder - b.sortOrder)
  )
  const schedulableProviders = computed(() => providers.value.filter((item) => item.enabled))
  const canAddRoute = computed(() => routeEditors.value.length < schedulableProviders.value.length)
  const videoPricingOptions = computed(() => {
    const resolutions = editor.videoResolutions
      .split(/[,，\s]+/)
      .map((item) => item.trim().toLowerCase())
      .filter((item) => /^\d{3,4}p$/.test(item))
    const durations = editor.videoDurations
      .split(/[,，\s]+/)
      .map(Number)
      .filter((item) => Number.isInteger(item) && item > 0 && item <= 300)
    return [...new Set(resolutions)].flatMap((resolution) =>
      [...new Set(durations)].map((duration) => ({
        key: `${resolution}:${duration}`,
        resolution,
        duration
      }))
    )
  })
  const capabilityLabel = computed(
    () =>
      `${capabilities.value.find((item) => item.value === capability.value)?.label || ''}${xt('模型')}`
  )
  async function load() {
    loading.value = true
    try {
      ;[rows.value, providers.value] = await Promise.all([
        xinyueApi.models(),
        xinyueApi.providers()
      ])
    } finally {
      loading.value = false
    }
  }
  const routeSummary = (row: ModelPreset) => {
    const names = [
      ...(row.providerRoutes || [])
        .filter((item) => item.enabled)
        .map((item) => item.provider?.name || item.providerId),
      ...(row.provider ? [row.provider.name] : [])
    ]
    const unique = [...new Set(names)]
    return unique.length > 1
      ? `${unique.length} ${xt('个渠道')} · ${xt('自动故障切换')}`
      : unique.length === 1
        ? `${xt('单渠道')} · ${unique[0]}`
        : xt('未绑定渠道')
  }
  const routeChannels = (row: ModelPreset) => {
    const channels = (row.providerRoutes || []).map((route) => ({
      key: `route:${route.providerId}`,
      name: route.provider?.name || route.providerId,
      enabled: route.enabled && (route.provider?.enabled ?? true),
      fallback: false,
      priority: route.priority ?? route.provider?.priority ?? 0
    }))
    if (row.provider && !channels.some((item) => item.name === row.provider?.name))
      channels.push({
        key: `fallback:${row.provider.id}`,
        name: row.provider.name,
        enabled: true,
        fallback: true,
        priority: 0
      })
    return channels
  }
  const pricingSummary = (row: ModelPreset) => {
    if (row.capability === 'IMAGE') {
      const pricing = row.options?.imageCapabilities?.resolutionPricing
      return pricing
        ? `1K ${pricing['1K'] ?? row.flatCreditCost} · 2K ${pricing['2K'] ?? row.flatCreditCost * 2} · 4K ${pricing['4K'] ?? row.flatCreditCost * 4} 点`
        : `${row.flatCreditCost} ${xt('点 / 次')}`
    }
    if (row.capability === 'VIDEO') {
      const values = Object.values(row.options?.videoCapabilities?.pricing || {})
      return values.length
        ? `${Math.min(...values)} - ${Math.max(...values)} 点 / 条`
        : `${row.flatCreditCost} ${xt('点 / 次')}`
    }
    return `${row.flatCreditCost} ${xt('点 / 次')}`
  }
  function setVideoPrice(key: string, value: number | undefined) {
    editor.videoPricing[key] = Math.max(0, Number(value || 0))
  }
  const routeVideoDefaults = (profile: RouteEditor['videoProfile']) =>
    profile === 'GROK'
      ? {
          videoResolutions: '480p, 720p',
          videoDurations: '5, 10',
          videoAspectRatios: '16:9, 9:16, 1:1'
        }
      : {
          videoResolutions: '720p, 1080p',
          videoDurations: '5, 10',
          videoAspectRatios: '16:9, 9:16, 1:1'
        }
  function inferRouteVideoProfile(resolutions: string[]): RouteEditor['videoProfile'] {
    const key = [...resolutions]
      .map((item) => item.toLowerCase())
      .sort()
      .join(',')
    if (key === '480p,720p') return 'GROK'
    if (key === '1080p,720p') return 'FULL_HD'
    return 'CUSTOM'
  }
  function applyRouteVideoProfile(route: RouteEditor) {
    if (route.videoProfile !== 'CUSTOM')
      Object.assign(route, routeVideoDefaults(route.videoProfile))
  }
  function syncRouteVideoProfile(route: RouteEditor) {
    const provider = providers.value.find((item) => item.id === route.providerId)
    route.videoProfile = provider?.type === 'SUB2API' ? 'GROK' : 'FULL_HD'
    applyRouteVideoProfile(route)
  }
  function routeVideoFields(providerId: string, capabilities?: ModelProviderRoute['options']) {
    const video = capabilities?.videoCapabilities
    const provider = providers.value.find((item) => item.id === providerId)
    const profile = video?.resolutions?.length
      ? inferRouteVideoProfile(video.resolutions)
      : provider?.type === 'SUB2API'
        ? 'GROK'
        : 'FULL_HD'
    const defaults = routeVideoDefaults(profile)
    return {
      videoProfile: profile,
      videoResolutions: video?.resolutions?.join(', ') || defaults.videoResolutions,
      videoDurations: video?.durations?.join(', ') || defaults.videoDurations,
      videoAspectRatios: video?.aspectRatios?.join(', ') || defaults.videoAspectRatios
    }
  }
  function parseRouteVideoCapabilities(route: RouteEditor) {
    return {
      resolutions: [
        ...new Set(
          route.videoResolutions
            .split(/[,，\s]+/)
            .map((value) => value.trim().toLowerCase())
            .filter(
              (value) =>
                /^(\d{3,4})p$/.test(value) &&
                Number(value.slice(0, -1)) >= 144 &&
                Number(value.slice(0, -1)) <= 4320
            )
        )
      ],
      durations: [
        ...new Set(
          route.videoDurations
            .split(/[,，\s]+/)
            .map(Number)
            .filter((value) => Number.isInteger(value) && value > 0 && value <= 300)
        )
      ],
      aspectRatios: [
        ...new Set(
          route.videoAspectRatios
            .split(/[,，\s]+/)
            .map((value) => value.trim())
            .filter((value) => /^[1-9]\d?:[1-9]\d?$/.test(value))
        )
      ]
    }
  }
  function openCreate() {
    Object.assign(editor, emptyEditor(), {
      capability: capability.value,
      sortOrder: (filtered.value.length + 1) * 10
    })
    routeEditors.value = []
    dialog.value = true
  }
  function openEdit(row: ModelPreset) {
    const imageCapabilities = row.options?.imageCapabilities
    const videoCapabilities = row.options?.videoCapabilities
    Object.assign(editor, emptyEditor(), row, {
      providerId: row.providerId || '',
      apiProtocol: row.options?.apiProtocol || 'openai',
      imageSizes: imageCapabilities?.sizes?.join(', ') || emptyEditor().imageSizes,
      imageMaxCount: imageCapabilities?.maxCount || 4,
      supportsReference: imageCapabilities?.supportsReference !== false,
      supportsMask: imageCapabilities?.supportsMask === true,
      imagePrice1K: imageCapabilities?.resolutionPricing?.['1K'] ?? row.flatCreditCost,
      imagePrice2K: imageCapabilities?.resolutionPricing?.['2K'] ?? row.flatCreditCost * 2,
      imagePrice4K: imageCapabilities?.resolutionPricing?.['4K'] ?? row.flatCreditCost * 4,
      videoResolutions:
        videoCapabilities?.resolutions?.join(', ') || emptyEditor().videoResolutions,
      videoDurations: videoCapabilities?.durations?.join(', ') || emptyEditor().videoDurations,
      videoAspectRatios:
        videoCapabilities?.aspectRatios?.join(', ') || emptyEditor().videoAspectRatios,
      videoPricing: {
        ...emptyEditor().videoPricing,
        ...(videoCapabilities?.pricing || {})
      },
      videoCreatePath: videoCapabilities?.createPath || '/videos',
      videoStatusPath: videoCapabilities?.statusPath || '/videos/{id}',
      videoContentPath: videoCapabilities?.contentPath || '/videos/{id}/content'
    })
    routeEditors.value = (row.providerRoutes || []).map((route: ModelProviderRoute) => ({
      providerId: route.providerId,
      upstreamModelOverride: route.upstreamModelOverride || '',
      enabled: route.enabled,
      priority: route.priority ?? route.provider?.priority ?? 0,
      weight: route.weight ?? route.provider?.weight ?? 100,
      ...routeVideoFields(route.providerId, route.options)
    }))
    capability.value = row.capability
    dialog.value = true
  }
  function addRoute() {
    const used = new Set(routeEditors.value.map((item) => item.providerId))
    const provider = schedulableProviders.value.find((item) => !used.has(item.id))
    if (!provider) return ElMessage.warning(xt('没有其他可用渠道，请先新增或启用渠道'))
    routeEditors.value.push({
      providerId: provider.id,
      upstreamModelOverride: '',
      enabled: true,
      priority: provider.priority ?? 0,
      weight: provider.weight ?? 100,
      ...routeVideoFields(provider.id)
    })
  }
  function removeRoute(index: number) {
    routeEditors.value.splice(index, 1)
  }
  async function save() {
    if (!editor.key || !editor.displayName || !editor.upstreamModel)
      return ElMessage.warning(xt('请完整填写模型标识、显示名和上游模型'))
    if (routeEditors.value.some((item) => !item.providerId))
      return ElMessage.warning(xt('请选择全部调度渠道'))
    if (
      new Set(routeEditors.value.map((item) => item.providerId)).size !== routeEditors.value.length
    )
      return ElMessage.warning(xt('同一个渠道不能重复添加'))
    if (editor.capability === 'VIDEO') {
      const invalidRouteIndex = routeEditors.value.findIndex((route) => {
        if (!route.enabled) return false
        const capabilities = parseRouteVideoCapabilities(route)
        return (
          !capabilities.resolutions.length ||
          !capabilities.durations.length ||
          !capabilities.aspectRatios.length
        )
      })
      if (invalidRouteIndex >= 0)
        return ElMessage.warning(
          `${xt('第')} ${invalidRouteIndex + 1} ${xt('个视频渠道必须完整配置分辨率、时长和画面比例')}`
        )
    }
    saving.value = true
    try {
      const body = {
        key: editor.key,
        displayName: editor.displayName,
        description: editor.description,
        providerId: editor.providerId || null,
        upstreamModel: editor.upstreamModel,
        capability: editor.capability,
        enabled: editor.enabled,
        isDefault: editor.isDefault,
        allowUserKey: editor.allowUserKey,
        sortOrder: editor.sortOrder,
        flatCreditCost: editor.flatCreditCost,
        inputCreditsPerMillion: editor.inputCreditsPerMillion,
        outputCreditsPerMillion: editor.outputCreditsPerMillion,
        badge: editor.badge,
        options:
          editor.capability === 'CHAT'
            ? { apiProtocol: editor.apiProtocol }
            : editor.capability === 'VIDEO'
              ? {
                  videoCapabilities: {
                    resolutions: videoPricingOptions.value
                      .map((item) => item.resolution)
                      .filter((item, index, values) => values.indexOf(item) === index),
                    durations: videoPricingOptions.value
                      .map((item) => item.duration)
                      .filter((item, index, values) => values.indexOf(item) === index),
                    aspectRatios: editor.videoAspectRatios
                      .split(/[,，\s]+/)
                      .filter((item) => /^\d{1,2}:\d{1,2}$/.test(item)),
                    defaultResolution: videoPricingOptions.value[0]?.resolution || '720p',
                    defaultDuration: videoPricingOptions.value[0]?.duration || 5,
                    defaultAspectRatio:
                      editor.videoAspectRatios
                        .split(/[,，\s]+/)
                        .find((item) => /^\d{1,2}:\d{1,2}$/.test(item)) || '16:9',
                    pricing: Object.fromEntries(
                      videoPricingOptions.value.map((item) => [
                        item.key,
                        editor.videoPricing[item.key] ?? 0
                      ])
                    ),
                    createPath: editor.videoCreatePath,
                    statusPath: editor.videoStatusPath,
                    contentPath: editor.videoContentPath,
                    pollIntervalMs: 3000,
                    maxPollSeconds: 600
                  }
                }
              : {
                  imageCapabilities: {
                    sizes: editor.imageSizes
                      .split(/[,，\s]+/)
                      .filter((item) => /^\d{3,5}x\d{3,5}$/.test(item)),
                    qualities: ['low', 'medium', 'high'],
                    outputFormats: ['png', 'jpeg', 'webp'],
                    backgrounds: ['auto', 'opaque', 'transparent'],
                    maxCount: editor.imageMaxCount,
                    defaultSize:
                      editor.imageSizes
                        .split(/[,，\s]+/)
                        .find((item) => /^\d{3,5}x\d{3,5}$/.test(item)) || '1024x1024',
                    defaultQuality: 'medium',
                    supportsReference: editor.supportsReference,
                    supportsMask: editor.supportsMask,
                    resolutionPricing: {
                      '1K': editor.imagePrice1K,
                      '2K': editor.imagePrice2K,
                      '4K': editor.imagePrice4K
                    }
                  }
                }
      }
      const saved = await xinyueApi.saveModel(body, editor.id || undefined)
      await xinyueApi.saveModelRoutes(
        saved.id,
        routeEditors.value.map((item) => ({
          providerId: item.providerId,
          upstreamModelOverride: item.upstreamModelOverride || null,
          enabled: item.enabled,
          priority: item.priority,
          weight: item.weight,
          options:
            editor.capability === 'VIDEO'
              ? {
                  videoCapabilities: parseRouteVideoCapabilities(item)
                }
              : null
        }))
      )
      capability.value = editor.capability
      dialog.value = false
      await load()
    } finally {
      saving.value = false
    }
  }
  async function remove(row: ModelPreset) {
    await ElMessageBox.confirm(`${xt('确认删除模型')} "${row.displayName}"?`, xt('删除模型'), {
      type: 'warning'
    })
    await xinyueApi.deleteModel(row.id)
    await load()
  }
  onMounted(load)
  onActivated(() => {
    if (rows.value.length || providers.value.length) void load()
  })
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
  }

  .page-title h1 {
    margin: 0 0 4px;
    font-size: 22px;
  }

  .page-title p {
    margin: 0;
    color: var(--art-gray-500);
  }

  .filter-card,
  .art-table-card {
    min-width: 0;
    max-width: 100%;
    overflow: hidden;
  }

  .filter-card :deep(.el-card__body) {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-width: 0;
  }

  .art-table-card :deep(.el-card__body),
  .art-table-card :deep(.el-table) {
    min-width: 0;
    max-width: 100%;
  }

  .model-count,
  .block-note {
    font-size: 12px;
    color: var(--art-gray-500);
  }

  .block-note {
    display: block;
    margin-top: 3px;
  }

  .badge {
    margin-left: 7px;
  }

  .channel-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    max-width: 100%;
  }

  .w-full {
    width: 100%;
  }

  .route-heading {
    display: flex;
    gap: 16px;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
  }

  .route-heading > div {
    display: grid;
    gap: 4px;
    min-width: 0;
  }

  .route-heading small {
    font-size: 12px;
    color: var(--art-gray-500);
  }

  .route-list {
    display: grid;
    gap: 8px;
    max-width: 100%;
    margin: 12px 0 4px;
    overflow-x: auto;
  }

  .route-entry {
    display: grid;
    gap: 8px;
    min-width: 720px;
    padding: 10px;
    border: 1px solid var(--art-gray-200);
    border-radius: 6px;
  }

  .route-row,
  .route-labels {
    display: grid;
    grid-template-columns: minmax(150px, 1.2fr) minmax(190px, 1.5fr) 130px 110px 48px 32px;
    gap: 8px;
    align-items: center;
    min-width: 720px;
  }

  .route-row {
    min-width: 0;
  }

  .route-row > * {
    min-width: 0;
    max-width: 100%;
  }

  .route-row :deep(.el-select),
  .route-row :deep(.el-input),
  .route-row :deep(.el-input-number) {
    width: 100%;
    min-width: 0;
  }

  .route-row :deep(.el-switch) {
    justify-self: center;
  }

  .route-row > :last-child {
    justify-self: center;
  }

  .route-labels {
    padding: 0 10px;
    font-size: 12px;
    color: var(--art-gray-500);
  }

  .route-video-config {
    display: grid;
    grid-template-columns: minmax(190px, 1.2fr) repeat(3, minmax(145px, 1fr));
    gap: 8px;
    padding-top: 8px;
    border-top: 1px dashed var(--art-gray-200);
  }

  .route-video-config > * {
    width: 100%;
    min-width: 0;
  }

  .route-video-field {
    display: grid;
    gap: 5px;
    min-width: 0;
  }

  .route-video-field > span {
    font-size: 12px;
    line-height: 18px;
    color: var(--art-gray-500);
  }

  .model-dialog :deep(.el-dialog__body) {
    max-width: 100%;
    max-height: 70vh;
    overflow: auto;
  }

  .video-pricing-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    margin-bottom: 14px;
  }

  .video-pricing-grid label {
    display: flex;
    gap: 12px;
    align-items: center;
    justify-content: space-between;
    min-width: 0;
    padding: 9px 10px;
    border: 1px solid var(--art-gray-200);
    border-radius: 6px;
  }

  .video-pricing-grid label > span {
    display: grid;
    min-width: 0;
  }

  .video-pricing-grid small {
    font-size: 12px;
    color: var(--art-gray-500);
  }

  .video-pricing-grid :deep(.el-input-number) {
    width: 132px;
  }

  @media (width <= 800px) {
    .page-title {
      flex-wrap: wrap;
      align-items: flex-start;
    }

    .route-heading {
      flex-direction: column;
      align-items: flex-start;
    }

    .model-dialog :deep(.el-dialog) {
      width: calc(100% - 24px) !important;
    }

    .video-pricing-grid {
      grid-template-columns: 1fr;
    }

    .route-row,
    .route-labels,
    .route-video-config {
      grid-template-columns: 1fr;
    }

    .route-labels {
      display: none;
    }
  }
</style>
