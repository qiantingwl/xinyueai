<template>
  <div class="art-full-height xinyue-page">
    <div class="page-title">
      <div>
        <h1>{{ xt('模型接入') }}</h1>
        <p>{{ xt('统一维护真实上游、接入模板与模型厂商，模板不保存任何密钥') }}</p>
      </div>
      <ElSpace>
        <ElButton v-if="activeTab === 'channels'" :loading="checkingAll" @click="checkAll">
          <ArtSvgIcon icon="ri:pulse-line" />{{ xt('批量检测') }}
        </ElButton>
        <ElButton type="primary" @click="openCurrentCreate">
          <ArtSvgIcon icon="ri:add-line" />{{ createButtonText }}
        </ElButton>
      </ElSpace>
    </div>

    <ElTabs v-model="activeTab" class="catalog-tabs">
      <ElTabPane :label="`${xt('上游渠道')} ${rows.length}`" name="channels" />
      <ElTabPane :label="`${xt('渠道模板')} ${templates.length}`" name="templates" />
      <ElTabPane :label="`${xt('模型厂商')} ${vendors.length}`" name="vendors" />
    </ElTabs>

    <ElAlert
      v-if="batchResult && activeTab === 'channels'"
      :title="`${xt('检测完成')}：${batchResult.healthy} ${xt('个正常')}，${batchResult.unhealthy} ${xt('个异常')}`"
      :type="batchResult.unhealthy ? 'warning' : 'success'"
      show-icon
      closable
      @close="batchResult = null"
    />

    <ElCard v-if="activeTab === 'channels'" shadow="never" class="art-table-card">
      <ArtTableHeader :loading="loading" @refresh="load">
        <template #left
          ><strong>{{ xt('渠道列表') }}</strong></template
        >
      </ArtTableHeader>
      <ElTable v-loading="loading" :data="rows" height="100%" row-key="id">
        <ElTableColumn :label="xt('渠道')" min-width="220">
          <template #default="{ row }">
            <strong>{{ row.name }}</strong>
            <small class="block-note"
              >{{ xt(typeText[row.type]) }} · {{ row.template?.name || xt('自定义配置') }}</small
            >
          </template>
        </ElTableColumn>
        <ElTableColumn
          :label="xt('API 地址')"
          min-width="260"
          prop="baseUrl"
          show-overflow-tooltip
        />
        <ElTableColumn :label="xt('协议 / 联网')" width="165">
          <template #default="{ row }">
            {{ protocolText(row.metadata?.apiProtocol || row.template?.apiProtocol || 'openai') }}
            <small class="block-note">{{
              nativeSearchText(
                row.metadata?.nativeSearchProvider ||
                  row.template?.nativeSearchProvider ||
                  'disabled'
              )
            }}</small>
          </template>
        </ElTableColumn>
        <ElTableColumn :label="xt('模型绑定')" width="110">
          <template #default="{ row }"
            >{{ row._count.modelPresets + row._count.modelRoutes }} {{ xt('项') }}</template
          >
        </ElTableColumn>
        <ElTableColumn :label="xt('调度')" width="120">
          <template #default="{ row }"
            >{{ xt('优先级') }} {{ row.priority
            }}<small class="block-note">{{ xt('权重') }} {{ row.weight }}</small></template
          >
        </ElTableColumn>
        <ElTableColumn :label="xt('健康状态')" width="110">
          <template #default="{ row }"
            ><ElTag :type="healthType(row)">{{ xt(healthText(row)) }}</ElTag></template
          >
        </ElTableColumn>
        <ElTableColumn :label="xt('状态')" width="82">
          <template #default="{ row }"
            ><ElTag :type="row.enabled ? 'success' : 'info'">{{
              row.enabled ? xt('启用') : xt('停用')
            }}</ElTag></template
          >
        </ElTableColumn>
        <ElTableColumn :label="xt('操作')" width="190" fixed="right">
          <template #default="{ row }">
            <ElButton link type="primary" :loading="checking === row.id" @click="discover(row)">{{
              xt('连接测试')
            }}</ElButton>
            <ElButton link @click="openChannelEdit(row)">{{ xt('编辑') }}</ElButton>
            <ElButton link type="danger" @click="removeChannel(row)">{{ xt('删除') }}</ElButton>
          </template>
        </ElTableColumn>
      </ElTable>
    </ElCard>

    <ElCard v-else-if="activeTab === 'templates'" shadow="never" class="art-table-card">
      <ArtTableHeader :loading="loading" @refresh="load">
        <template #left
          ><strong>{{ xt('渠道模板') }}</strong
          ><span class="header-note">{{
            xt('模板只保存协议和默认参数，不保存密钥')
          }}</span></template
        >
      </ArtTableHeader>
      <ElTable v-loading="loading" :data="templates" height="100%" row-key="id">
        <ElTableColumn :label="xt('模板')" min-width="220">
          <template #default="{ row }"
            ><strong>{{ row.name }}</strong
            ><small class="block-note"
              >{{ row.key }} · {{ row.vendor?.name || xt('未分组') }}</small
            ></template
          >
        </ElTableColumn>
        <ElTableColumn :label="xt('默认地址')" min-width="260">
          <template #default="{ row }"
            ><span>{{ row.baseUrl || xt('由管理员填写') }}</span
            ><small class="block-note">{{ xt(typeText[row.type]) }}</small></template
          >
        </ElTableColumn>
        <ElTableColumn :label="xt('协议 / 联网')" width="180">
          <template #default="{ row }"
            >{{ protocolText(row.apiProtocol)
            }}<small class="block-note">{{
              nativeSearchText(row.nativeSearchProvider)
            }}</small></template
          >
        </ElTableColumn>
        <ElTableColumn :label="xt('模型发现')" width="100">
          <template #default="{ row }"
            ><ElTag :type="row.supportsDiscovery ? 'success' : 'info'">{{
              row.supportsDiscovery ? xt('支持') : xt('手动配置')
            }}</ElTag></template
          >
        </ElTableColumn>
        <ElTableColumn :label="xt('引用')" width="90"
          ><template #default="{ row }">{{
            row._count.providerChannels + row._count.userCredentials
          }}</template></ElTableColumn
        >
        <ElTableColumn :label="xt('排序')" width="80" prop="sortOrder" />
        <ElTableColumn :label="xt('状态')" width="82"
          ><template #default="{ row }"
            ><ElTag :type="row.enabled ? 'success' : 'info'">{{
              row.enabled ? xt('启用') : xt('停用')
            }}</ElTag></template
          ></ElTableColumn
        >
        <ElTableColumn :label="xt('操作')" width="130" fixed="right">
          <template #default="{ row }"
            ><ElButton link @click="openTemplateEdit(row)">{{ xt('编辑') }}</ElButton
            ><ElButton link type="danger" @click="removeTemplate(row)">{{
              xt('删除')
            }}</ElButton></template
          >
        </ElTableColumn>
      </ElTable>
    </ElCard>

    <ElCard v-else shadow="never" class="art-table-card">
      <ArtTableHeader :loading="loading" @refresh="load">
        <template #left
          ><strong>{{ xt('模型厂商') }}</strong
          ><span class="header-note">{{
            xt('用于前端模型分组，不等于真实上游渠道')
          }}</span></template
        >
      </ArtTableHeader>
      <ElTable v-loading="loading" :data="vendors" height="100%" row-key="id">
        <ElTableColumn :label="xt('厂商')" min-width="230"
          ><template #default="{ row }"
            ><strong>{{ row.name }}</strong
            ><small class="block-note">{{ row.key }}</small></template
          ></ElTableColumn
        >
        <ElTableColumn
          :label="xt('官网')"
          min-width="300"
          prop="websiteUrl"
          show-overflow-tooltip
        />
        <ElTableColumn :label="xt('图标')" min-width="150"
          ><template #default="{ row }">{{
            row.icon || xt('使用默认图标')
          }}</template></ElTableColumn
        >
        <ElTableColumn :label="xt('排序')" width="90" prop="sortOrder" />
        <ElTableColumn :label="xt('状态')" width="90"
          ><template #default="{ row }"
            ><ElTag :type="row.enabled ? 'success' : 'info'">{{
              row.enabled ? xt('启用') : xt('停用')
            }}</ElTag></template
          ></ElTableColumn
        >
        <ElTableColumn :label="xt('操作')" width="130" fixed="right"
          ><template #default="{ row }"
            ><ElButton link @click="openVendorEdit(row)">{{ xt('编辑') }}</ElButton
            ><ElButton link type="danger" @click="removeVendor(row)">{{
              xt('删除')
            }}</ElButton></template
          ></ElTableColumn
        >
      </ElTable>
    </ElCard>

    <ElDialog
      v-model="channelDialog"
      :title="xt(channelEditor.id ? '编辑上游渠道' : '新增上游渠道')"
      width="720px"
    >
      <ElForm label-position="top">
        <ElFormItem :label="xt('渠道模板')">
          <ElSelect
            v-model="channelEditor.templateId"
            clearable
            class="w-full"
            :placeholder="xt('选择模板或使用自定义配置')"
            @change="applyTemplate"
          >
            <ElOption
              v-for="item in enabledTemplates"
              :key="item.id"
              :label="`${item.name} · ${item.vendor?.name || xt('其他')}`"
              :value="item.id"
            />
          </ElSelect>
        </ElFormItem>
        <ElRow :gutter="14">
          <ElCol :span="12"
            ><ElFormItem :label="xt('渠道名称')"
              ><ElInput v-model.trim="channelEditor.name" /></ElFormItem
          ></ElCol>
          <ElCol :span="12"
            ><ElFormItem :label="xt('渠道类型')"
              ><ElSelect v-model="channelEditor.type" class="w-full" @change="onProviderTypeChange"
                ><ElOption
                  v-for="(label, value) in typeText"
                  :key="value"
                  :label="xt(label)"
                  :value="value" /></ElSelect></ElFormItem
          ></ElCol>
        </ElRow>
        <ElFormItem label="API Base URL"
          ><ElInput v-model.trim="channelEditor.baseUrl" placeholder="https://api.example.com/v1"
        /></ElFormItem>
        <ElFormItem
          v-if="channelEditor.type !== 'POLLINATIONS'"
          :label="
            channelEditor.type === 'LOCAL_WORKER' ? xt('Worker 访问令牌（可选）') : xt('API 密钥')
          "
          ><ElInput
            v-model="channelEditor.apiKey"
            type="password"
            show-password
            :placeholder="
              channelEditor.id
                ? `${xt('留空保留')} ${channelEditor.apiKeyHint || xt('现有密钥')}`
                : channelEditor.type === 'LOCAL_WORKER'
                  ? xt('内网无令牌时可留空')
                  : 'sk-...'
            "
        /></ElFormItem>
        <ElRow :gutter="14">
          <ElCol :span="8"
            ><ElFormItem :label="xt('接口协议')"
              ><ElSelect v-model="channelEditor.apiProtocol" class="w-full"
                ><ElOption
                  v-for="item in protocolOptions"
                  :key="item.value"
                  :label="item.label"
                  :value="item.value" /></ElSelect></ElFormItem
          ></ElCol>
          <ElCol :span="8"
            ><ElFormItem :label="xt('原生联网')"
              ><ElSelect v-model="channelEditor.nativeSearchProvider" class="w-full"
                ><ElOption
                  v-for="item in nativeSearchOptions"
                  :key="item.value"
                  :label="item.label"
                  :value="item.value" /></ElSelect></ElFormItem
          ></ElCol>
          <ElCol :span="8"
            ><ElFormItem :label="xt('认证方式')"
              ><ElSelect v-model="channelEditor.authType" class="w-full"
                ><ElOption label="Bearer" value="BEARER" /><ElOption
                  label="x-api-key"
                  value="X_API_KEY" /><ElOption
                  :label="xt('两者同时')"
                  value="BOTH" /></ElSelect></ElFormItem
          ></ElCol>
        </ElRow>
        <ElRow :gutter="14">
          <ElCol :span="8"
            ><ElFormItem :label="xt('优先级')"
              ><ElInputNumber v-model="channelEditor.priority" class="w-full" /></ElFormItem
          ></ElCol>
          <ElCol :span="8"
            ><ElFormItem :label="xt('权重')"
              ><ElInputNumber v-model="channelEditor.weight" :min="0" class="w-full" /></ElFormItem
          ></ElCol>
          <ElCol :span="8"
            ><ElFormItem :label="xt('超时毫秒')"
              ><ElInputNumber
                v-model="channelEditor.timeoutMs"
                :min="1000"
                :max="600000"
                :step="1000"
                class="w-full" /></ElFormItem
          ></ElCol>
        </ElRow>
        <ElSpace
          ><ElCheckbox v-model="channelEditor.enabled">{{ xt('启用渠道') }}</ElCheckbox
          ><ElCheckbox
            v-if="!['POLLINATIONS', 'LOCAL_WORKER'].includes(channelEditor.type)"
            v-model="channelEditor.allowUserKeys"
            >{{ xt('允许用户密钥') }}</ElCheckbox
          ><ElCheckbox v-model="channelEditor.autoDiscover">{{
            xt('保存后识别并导入模型')
          }}</ElCheckbox></ElSpace
        >
      </ElForm>
      <template #footer
        ><ElButton @click="channelDialog = false">{{ xt('取消') }}</ElButton
        ><ElButton type="primary" :loading="saving" @click="saveChannel">{{
          xt('保存渠道')
        }}</ElButton></template
      >
    </ElDialog>

    <ElDialog
      v-model="discoveryDialog"
      :title="xt('识别并导入模型')"
      width="min(1120px, 94vw)"
      destroy-on-close
    >
      <ElAlert
        :title="`${xt('发现')} ${discoveredModels.length} ${xt('个模型')}，${selectedModelIds.length} ${xt('个待导入')}`"
        type="success"
        :closable="false"
        show-icon
      />
      <div class="discovery-toolbar">
        <ElCheckbox v-model="selectAllImportable" @change="toggleAllImportable">{{
          xt('选择全部可用模型')
        }}</ElCheckbox>
        <ElSpace>
          <span>{{ xt('售价加价率') }}</span
          ><ElInputNumber v-model="importMarkupPercent" :min="100" :max="1000" :step="10" />
          <ElCheckbox v-model="overwritePricing">{{ xt('覆盖已有模型定价') }}</ElCheckbox>
        </ElSpace>
      </div>
      <ElTable :data="discoveredModels" height="480" row-key="id">
        <ElTableColumn width="48"
          ><template #default="{ row }"
            ><ElCheckbox
              :model-value="selectedModelIds.includes(row.id)"
              :disabled="!row.importable"
              @change="toggleDiscoveredModel(row.id, $event)"
              ><span /></ElCheckbox></template
        ></ElTableColumn>
        <ElTableColumn :label="xt('模型')" min-width="230"
          ><template #default="{ row }"
            ><strong>{{ row.displayName }}</strong
            ><small class="block-note">{{ row.id }}</small></template
          ></ElTableColumn
        >
        <ElTableColumn :label="xt('厂商 / 能力')" width="150"
          ><template #default="{ row }"
            >{{ row.vendorName
            }}<small class="block-note">{{ capabilityText(row.capability) }}</small></template
          ></ElTableColumn
        >
        <ElTableColumn :label="xt('上游 Token 成本')" width="180"
          ><template #default="{ row }"
            ><span>{{ moneyMicros(row.inputCostMicrosPerMillion) }} / M</span
            ><small class="block-note"
              >{{ xt('输出') }} {{ moneyMicros(row.outputCostMicrosPerMillion) }} / M</small
            ></template
          ></ElTableColumn
        >
        <ElTableColumn :label="xt('默认用户售价')" width="165"
          ><template #default="{ row }"
            ><span>{{ row.inputCreditsPerMillion }} {{ xt('点 / M 输入') }}</span
            ><small class="block-note"
              >{{ row.outputCreditsPerMillion }} {{ xt('点 / M 输出') }}</small
            ></template
          ></ElTableColumn
        >
        <ElTableColumn :label="xt('识别状态')" width="135"
          ><template #default="{ row }"
            ><ElTag v-if="row.existingPreset" type="info">{{ xt('已绑定 / 可追加路由') }}</ElTag
            ><ElTag
              v-else-if="row.importable"
              :type="row.pricingSource === 'none' ? 'warning' : 'success'"
              >{{ row.pricingSource === 'none' ? xt('待补定价') : xt('可导入') }}</ElTag
            ><ElTag v-else type="info">{{ xt('暂不支持') }}</ElTag></template
          ></ElTableColumn
        >
      </ElTable>
      <template #footer
        ><ElButton @click="discoveryDialog = false">{{ xt('稍后处理') }}</ElButton
        ><ElButton
          type="primary"
          :loading="importing"
          :disabled="!selectedModelIds.length"
          @click="importDiscoveredModels"
          >{{ xt('导入所选模型') }}</ElButton
        ></template
      >
    </ElDialog>

    <ElDialog
      v-model="templateDialog"
      :title="xt(templateEditor.id ? '编辑渠道模板' : '新增渠道模板')"
      width="720px"
    >
      <ElForm label-position="top">
        <ElRow :gutter="14"
          ><ElCol :span="12"
            ><ElFormItem :label="xt('模板标识')"
              ><ElInput
                v-model.trim="templateEditor.key"
                placeholder="openrouter" /></ElFormItem></ElCol
          ><ElCol :span="12"
            ><ElFormItem :label="xt('模板名称')"
              ><ElInput
                v-model.trim="templateEditor.name"
                placeholder="OpenRouter" /></ElFormItem></ElCol
        ></ElRow>
        <ElFormItem :label="xt('说明')"
          ><ElInput v-model.trim="templateEditor.description" type="textarea" :rows="2"
        /></ElFormItem>
        <ElRow :gutter="14">
          <ElCol :span="8"
            ><ElFormItem :label="xt('模型厂商')"
              ><ElSelect v-model="templateEditor.vendorId" clearable class="w-full"
                ><ElOption
                  v-for="item in vendors"
                  :key="item.id"
                  :label="item.name"
                  :value="item.id" /></ElSelect></ElFormItem
          ></ElCol>
          <ElCol :span="8"
            ><ElFormItem :label="xt('渠道类型')"
              ><ElSelect v-model="templateEditor.type" class="w-full"
                ><ElOption
                  v-for="(label, value) in typeText"
                  :key="value"
                  :label="xt(label)"
                  :value="value" /></ElSelect></ElFormItem
          ></ElCol>
          <ElCol :span="8"
            ><ElFormItem :label="xt('认证方式')"
              ><ElSelect v-model="templateEditor.authType" class="w-full"
                ><ElOption label="Bearer" value="BEARER" /><ElOption
                  label="x-api-key"
                  value="X_API_KEY" /><ElOption
                  :label="xt('两者同时')"
                  value="BOTH" /></ElSelect></ElFormItem
          ></ElCol>
        </ElRow>
        <ElFormItem :label="xt('默认 API 地址')"
          ><ElInput
            v-model.trim="templateEditor.baseUrl"
            :placeholder="xt('可留空，由管理员接入渠道时填写')"
        /></ElFormItem>
        <ElRow :gutter="14">
          <ElCol :span="8"
            ><ElFormItem :label="xt('接口协议')"
              ><ElSelect v-model="templateEditor.apiProtocol" class="w-full"
                ><ElOption
                  v-for="item in protocolOptions"
                  :key="item.value"
                  :label="item.label"
                  :value="item.value" /></ElSelect></ElFormItem
          ></ElCol>
          <ElCol :span="8"
            ><ElFormItem :label="xt('原生联网')"
              ><ElSelect v-model="templateEditor.nativeSearchProvider" class="w-full"
                ><ElOption
                  v-for="item in nativeSearchOptions"
                  :key="item.value"
                  :label="item.label"
                  :value="item.value" /></ElSelect></ElFormItem
          ></ElCol>
          <ElCol :span="8"
            ><ElFormItem :label="xt('排序')"
              ><ElInputNumber v-model="templateEditor.sortOrder" class="w-full" /></ElFormItem
          ></ElCol>
        </ElRow>
        <ElSpace
          ><ElCheckbox v-model="templateEditor.enabled">{{ xt('启用模板') }}</ElCheckbox
          ><ElCheckbox v-model="templateEditor.supportsDiscovery">{{
            xt('支持模型发现')
          }}</ElCheckbox></ElSpace
        >
      </ElForm>
      <template #footer
        ><ElButton @click="templateDialog = false">{{ xt('取消') }}</ElButton
        ><ElButton type="primary" :loading="saving" @click="saveTemplate">{{
          xt('保存模板')
        }}</ElButton></template
      >
    </ElDialog>

    <ElDialog
      v-model="vendorDialog"
      :title="xt(vendorEditor.id ? '编辑模型厂商' : '新增模型厂商')"
      width="600px"
    >
      <ElForm label-position="top">
        <ElRow :gutter="14"
          ><ElCol :span="12"
            ><ElFormItem :label="xt('厂商标识')"
              ><ElInput
                v-model.trim="vendorEditor.key"
                placeholder="deepseek" /></ElFormItem></ElCol
          ><ElCol :span="12"
            ><ElFormItem :label="xt('厂商名称')"
              ><ElInput
                v-model.trim="vendorEditor.name"
                placeholder="DeepSeek" /></ElFormItem></ElCol
        ></ElRow>
        <ElFormItem :label="xt('官网地址')"
          ><ElInput v-model.trim="vendorEditor.websiteUrl" placeholder="https://example.com"
        /></ElFormItem>
        <ElRow :gutter="14"
          ><ElCol :span="16"
            ><ElFormItem :label="xt('图标标识')"
              ><ElInput
                v-model.trim="vendorEditor.icon"
                :placeholder="xt('可留空，前端使用默认图标')" /></ElFormItem></ElCol
          ><ElCol :span="8"
            ><ElFormItem :label="xt('排序')"
              ><ElInputNumber v-model="vendorEditor.sortOrder" class="w-full" /></ElFormItem></ElCol
        ></ElRow>
        <ElCheckbox v-model="vendorEditor.enabled">{{ xt('启用厂商') }}</ElCheckbox>
      </ElForm>
      <template #footer
        ><ElButton @click="vendorDialog = false">{{ xt('取消') }}</ElButton
        ><ElButton type="primary" :loading="saving" @click="saveVendor">{{
          xt('保存厂商')
        }}</ElButton></template
      >
    </ElDialog>
  </div>
</template>

<script setup lang="ts">
  import { ElMessage, ElMessageBox } from 'element-plus'
  import {
    modelApi as xinyueApi,
    type DiscoveredModel,
    type ModelVendor,
    type NativeSearchProvider,
    type Provider,
    type ProviderTemplate,
    type ProviderType
  } from '@/api/xinyue/models'
  import { xinyueText as xt } from '@/locales/xinyue'

  defineOptions({ name: 'XinyueProviders' })
  type AuthType = Provider['authType']
  type ApiProtocol = ProviderTemplate['apiProtocol']
  const typeText: Record<string, string> = {
    OPENAI: 'OpenAI 官方',
    NEW_API: 'NewAPI',
    SUB2API: 'Sub2API',
    OPENAI_COMPATIBLE: 'OpenAI 兼容',
    POLLINATIONS: 'Pollinations 图片',
    LOCAL_WORKER: '本地创作 Worker'
  }
  const protocolOptions: Array<{ value: ApiProtocol; label: string }> = [
    { value: 'openai', label: 'OpenAI Compatible' },
    { value: 'anthropic', label: 'Anthropic Messages' },
    { value: 'gemini', label: 'Google Gemini' }
  ]
  const nativeSearchOptions: Array<{ value: NativeSearchProvider; label: string }> = [
    { value: 'disabled', label: '关闭 / 外部搜索保底' },
    { value: 'openai', label: 'OpenAI Web Search' },
    { value: 'anthropic', label: 'Anthropic Web Search' },
    { value: 'gemini', label: 'Gemini Google Search' },
    { value: 'xai', label: 'xAI Web Search' },
    { value: 'qwen', label: 'Qwen 联网搜索' },
    { value: 'doubao', label: '豆包 / 方舟联网' }
  ]
  const activeTab = ref<'channels' | 'templates' | 'vendors'>('channels')
  const rows = ref<Provider[]>([])
  const templates = ref<ProviderTemplate[]>([])
  const vendors = ref<ModelVendor[]>([])
  const loading = ref(false)
  const saving = ref(false)
  const checking = ref('')
  const checkingAll = ref(false)
  const batchResult = ref<{ checked: number; healthy: number; unhealthy: number } | null>(null)
  const channelDialog = ref(false)
  const templateDialog = ref(false)
  const vendorDialog = ref(false)
  const discoveryDialog = ref(false)
  const discoveryProviderId = ref('')
  const discoveredModels = ref<DiscoveredModel[]>([])
  const selectedModelIds = ref<string[]>([])
  const selectAllImportable = ref(true)
  const importMarkupPercent = ref(130)
  const overwritePricing = ref(false)
  const importing = ref(false)
  const enabledTemplates = computed(() => templates.value.filter((item) => item.enabled))
  const createButtonText = computed(() =>
    activeTab.value === 'channels'
      ? xt('新增渠道')
      : activeTab.value === 'templates'
        ? xt('新增模板')
        : xt('新增厂商')
  )
  const emptyChannel = () => ({
    id: '',
    name: '',
    templateId: '',
    type: 'NEW_API' as ProviderType,
    baseUrl: '',
    apiKey: '',
    apiKeyHint: '',
    authType: 'BEARER' as AuthType,
    apiProtocol: 'openai' as ApiProtocol,
    nativeSearchProvider: 'disabled' as NativeSearchProvider,
    enabled: true,
    priority: 0,
    weight: 100,
    timeoutMs: 120000,
    allowUserKeys: true,
    autoDiscover: true
  })
  const emptyTemplate = () => ({
    id: '',
    key: '',
    name: '',
    description: '',
    vendorId: '',
    type: 'OPENAI_COMPATIBLE' as ProviderType,
    baseUrl: '',
    authType: 'BEARER' as AuthType,
    apiProtocol: 'openai' as ApiProtocol,
    nativeSearchProvider: 'disabled' as NativeSearchProvider,
    supportsDiscovery: true,
    enabled: true,
    sortOrder: 10
  })
  const emptyVendor = () => ({
    id: '',
    key: '',
    name: '',
    icon: '',
    websiteUrl: '',
    enabled: true,
    sortOrder: 10
  })
  const channelEditor = reactive(emptyChannel())
  const templateEditor = reactive(emptyTemplate())
  const vendorEditor = reactive(emptyVendor())
  const protocolText = (value: string) =>
    protocolOptions.find((item) => item.value === value)?.label || value
  const nativeSearchText = (value: string) =>
    nativeSearchOptions.find((item) => item.value === value)?.label || value
  const providerNeedsKey = (row: Provider) =>
    !row.hasApiKey && !['POLLINATIONS', 'LOCAL_WORKER'].includes(row.type)
  const healthText = (row: Provider) =>
    providerNeedsKey(row) ? '未配置密钥' : row.lastHealthStatus === 'healthy' ? '正常' : row.lastHealthStatus ? '异常' : '未检测'
  const healthType = (row: Provider) =>
    providerNeedsKey(row) ? 'warning' : row.lastHealthStatus === 'healthy' ? 'success' : row.lastHealthStatus ? 'danger' : 'info'
  const capabilityText = (value: DiscoveredModel['capability']) =>
    value === 'CHAT'
      ? xt('对话')
      : value === 'IMAGE'
        ? xt('图片')
        : value === 'VIDEO'
          ? xt('视频')
          : value === 'COMMERCE'
            ? xt('电商')
            : xt('不支持')
  const moneyMicros = (value: number) =>
    value ? `$${(value / 1_000_000).toFixed(value < 10_000 ? 4 : 2)}` : '-'

  async function load() {
    loading.value = true
    try {
      ;[rows.value, templates.value, vendors.value] = await Promise.all([
        xinyueApi.providers(),
        xinyueApi.providerTemplates(),
        xinyueApi.modelVendors()
      ])
    } finally {
      loading.value = false
    }
  }
  function openCurrentCreate() {
    if (activeTab.value === 'channels') openChannelCreate()
    else if (activeTab.value === 'templates') openTemplateCreate()
    else openVendorCreate()
  }
  function openChannelCreate() {
    Object.assign(channelEditor, emptyChannel())
    channelDialog.value = true
  }
  function openChannelEdit(row: Provider) {
    Object.assign(channelEditor, emptyChannel(), row, {
      templateId: row.templateId || '',
      apiKey: '',
      autoDiscover: false,
      apiProtocol: (row.metadata?.apiProtocol ||
        row.template?.apiProtocol ||
        'openai') as ApiProtocol,
      nativeSearchProvider: (row.metadata?.nativeSearchProvider ||
        row.template?.nativeSearchProvider ||
        'disabled') as NativeSearchProvider
    })
    channelDialog.value = true
  }
  function applyTemplate(templateId: string) {
    const item = templates.value.find((entry) => entry.id === templateId)
    if (!item) return
    Object.assign(channelEditor, {
      type: item.type,
      baseUrl: item.baseUrl,
      authType: item.authType,
      apiProtocol: item.apiProtocol,
      nativeSearchProvider: item.nativeSearchProvider,
      allowUserKeys: !['POLLINATIONS', 'LOCAL_WORKER'].includes(item.type)
    })
    if (!channelEditor.name) channelEditor.name = item.name
  }
  function onProviderTypeChange(value: ProviderType) {
    if (value === 'POLLINATIONS')
      Object.assign(channelEditor, {
        baseUrl: channelEditor.baseUrl || 'https://image.pollinations.ai',
        apiKey: '',
        allowUserKeys: false,
        nativeSearchProvider: 'disabled'
      })
    if (value === 'LOCAL_WORKER')
      Object.assign(channelEditor, {
        allowUserKeys: false,
        nativeSearchProvider: 'disabled',
        apiProtocol: 'openai'
      })
  }
  async function saveChannel() {
    if (!channelEditor.name || !channelEditor.baseUrl)
      return ElMessage.warning(xt('请填写渠道名称和 API 地址'))
    saving.value = true
    try {
      const saved = await xinyueApi.saveProvider(
        {
          name: channelEditor.name,
          templateId: channelEditor.templateId || null,
          type: channelEditor.type,
          baseUrl: channelEditor.baseUrl,
          authType: channelEditor.authType,
          enabled: channelEditor.enabled,
          priority: channelEditor.priority,
          weight: channelEditor.weight,
          timeoutMs: channelEditor.timeoutMs,
          allowUserKeys: ['POLLINATIONS', 'LOCAL_WORKER'].includes(channelEditor.type)
            ? false
            : channelEditor.allowUserKeys,
          metadata: {
            apiProtocol: channelEditor.apiProtocol,
            nativeSearchProvider: channelEditor.nativeSearchProvider
          },
          ...(channelEditor.apiKey ? { apiKey: channelEditor.apiKey } : {})
        },
        channelEditor.id || undefined
      )
      channelDialog.value = false
      await load()
      if (channelEditor.autoDiscover) await openDiscovery(saved)
    } finally {
      saving.value = false
    }
  }
  function openTemplateCreate() {
    Object.assign(templateEditor, emptyTemplate(), { sortOrder: (templates.value.length + 1) * 10 })
    templateDialog.value = true
  }
  function openTemplateEdit(row: ProviderTemplate) {
    Object.assign(templateEditor, emptyTemplate(), row, { vendorId: row.vendorId || '' })
    templateDialog.value = true
  }
  async function saveTemplate() {
    if (!templateEditor.key || !templateEditor.name)
      return ElMessage.warning(xt('请填写模板标识和名称'))
    saving.value = true
    try {
      await xinyueApi.saveProviderTemplate(
        {
          key: templateEditor.key,
          name: templateEditor.name,
          description: templateEditor.description,
          vendorId: templateEditor.vendorId || null,
          type: templateEditor.type,
          baseUrl: templateEditor.baseUrl,
          authType: templateEditor.authType,
          apiProtocol: templateEditor.apiProtocol,
          nativeSearchProvider: templateEditor.nativeSearchProvider,
          supportsDiscovery: templateEditor.supportsDiscovery,
          enabled: templateEditor.enabled,
          sortOrder: templateEditor.sortOrder
        },
        templateEditor.id || undefined
      )
      templateDialog.value = false
      await load()
    } finally {
      saving.value = false
    }
  }
  function openVendorCreate() {
    Object.assign(vendorEditor, emptyVendor(), { sortOrder: (vendors.value.length + 1) * 10 })
    vendorDialog.value = true
  }
  function openVendorEdit(row: ModelVendor) {
    Object.assign(vendorEditor, emptyVendor(), row)
    vendorDialog.value = true
  }
  async function saveVendor() {
    if (!vendorEditor.key || !vendorEditor.name)
      return ElMessage.warning(xt('请填写厂商标识和名称'))
    saving.value = true
    try {
      await xinyueApi.saveModelVendor(
        {
          key: vendorEditor.key,
          name: vendorEditor.name,
          icon: vendorEditor.icon,
          websiteUrl: vendorEditor.websiteUrl,
          enabled: vendorEditor.enabled,
          sortOrder: vendorEditor.sortOrder
        },
        vendorEditor.id || undefined
      )
      vendorDialog.value = false
      await load()
    } finally {
      saving.value = false
    }
  }
  function toggleAllImportable(value: boolean | string | number) {
    selectedModelIds.value = value
      ? discoveredModels.value.filter((item) => item.importable).map((item) => item.id)
      : []
  }
  function toggleDiscoveredModel(id: string, value: boolean | string | number) {
    selectedModelIds.value = value
      ? [...new Set([...selectedModelIds.value, id])]
      : selectedModelIds.value.filter((item) => item !== id)
    selectAllImportable.value =
      selectedModelIds.value.length ===
      discoveredModels.value.filter((item) => item.importable).length
  }
  async function openDiscovery(row: Provider) {
    checking.value = row.id
    try {
      const result = await xinyueApi.discoverProvider(row.id)
      discoveryProviderId.value = row.id
      discoveredModels.value = result.candidates || []
      selectedModelIds.value = discoveredModels.value
        .filter((item) => item.importable && !item.existingPreset)
        .map((item) => item.id)
      selectAllImportable.value =
        selectedModelIds.value.length ===
        discoveredModels.value.filter((item) => item.importable).length
      discoveryDialog.value = true
      ElMessage.success(
        `${xt('连接正常，发现')} ${result.models.length} ${xt('个模型')}，${xt('延迟')} ${result.latencyMs}ms`
      )
      await load()
    } finally {
      checking.value = ''
    }
  }
  async function importDiscoveredModels() {
    importing.value = true
    try {
      const result = await xinyueApi.importProviderModels(discoveryProviderId.value, {
        modelIds: selectedModelIds.value,
        markupPercent: importMarkupPercent.value,
        overwritePricing: overwritePricing.value
      })
      ElMessage.success(`${xt('已导入')} ${result.imported} ${xt('个模型')}`)
      discoveryDialog.value = false
      await load()
    } finally {
      importing.value = false
    }
  }
  async function discover(row: Provider) {
    await openDiscovery(row)
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
  async function removeChannel(row: Provider) {
    await ElMessageBox.confirm(`${xt('确认删除渠道')} "${row.name}"?`, xt('删除渠道'), {
      type: 'warning'
    })
    await xinyueApi.deleteProvider(row.id)
    await load()
  }
  async function removeTemplate(row: ProviderTemplate) {
    await ElMessageBox.confirm(`${xt('确认删除模板')} "${row.name}"?`, xt('删除模板'), {
      type: 'warning'
    })
    await xinyueApi.deleteProviderTemplate(row.id)
    await load()
  }
  async function removeVendor(row: ModelVendor) {
    await ElMessageBox.confirm(`${xt('确认删除厂商')} "${row.name}"?`, xt('删除厂商'), {
      type: 'warning'
    })
    await xinyueApi.deleteModelVendor(row.id)
    await load()
  }
  onMounted(load)
  onActivated(() => {
    if (rows.value.length || templates.value.length || vendors.value.length) void load()
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
    gap: 16px;
  }
  .page-title h1 {
    margin: 0 0 4px;
    font-size: 22px;
  }
  .page-title p {
    margin: 0;
    color: var(--art-gray-500);
  }
  .catalog-tabs {
    flex: none;
    padding: 0 4px;
  }
  .catalog-tabs :deep(.el-tabs__header) {
    margin: 0;
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
  .header-note {
    margin-left: 12px;
    color: var(--art-gray-500);
    font-size: 12px;
    font-weight: 400;
  }
  .w-full {
    width: 100%;
  }
  .discovery-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin: 14px 0;
  }
  @media (max-width: 768px) {
    .page-title {
      align-items: flex-start;
      flex-direction: column;
    }
  }
</style>
