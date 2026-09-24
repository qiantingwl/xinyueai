<template>
  <div class="art-full-height xinyue-page">
    <div class="page-title"
      ><div
        ><h1>{{ xt('模型与定价') }}</h1
        ><p>{{ xt('统一维护模型成本、平台倍率、用户价格和历史价格版本') }}</p></div
      ><ElSpace
        ><ElButton :loading="pricingLoading" @click="openPricingSync"
          ><ArtSvgIcon icon="ri:refresh-line" />{{ xt('同步价格目录') }}</ElButton
        ><ElButton type="primary" @click="openCreate"
          ><ArtSvgIcon icon="ri:add-line" />{{ xt('新增模型') }}</ElButton
        ></ElSpace
      ></div
    >
    <ElCard shadow="never" class="filter-card"
      ><ElSegmented v-model="capability" :options="capabilities" />
      <ElSelect v-model="vendorFilter" clearable placeholder="全部厂商" class="vendor-filter">
        <ElOption label="全部厂商" value="" />
        <ElOption
          v-for="item in vendorOptions"
          :key="item.id"
          :label="item.name"
          :value="item.id"
        />
      </ElSelect>
      <ElSegmented v-model="sourceFilter" :options="sourceFilters" />
      <span class="model-count">{{ filtered.length }} {{ xt('个模型') }}</span></ElCard
    >
    <ElCard shadow="never" class="art-table-card"
      ><ArtTableHeader :loading="loading" @refresh="load"
        ><template #left
          ><strong>{{ capabilityLabel }}</strong></template
        ></ArtTableHeader
      >
      <ElTable
        v-loading="loading"
        :data="groupedRows"
        height="100%"
        row-key="id"
        :span-method="spanMethod"
        :row-class-name="rowClassName"
      >
        <ElTableColumn :label="xt('前端模型')" min-width="220"
          ><template #default="{ row }"
            ><template v-if="row.isGroup"
              ><strong>{{ row.groupLabel }}</strong
              ><small class="block-note">{{ row.groupCount }} {{ xt('个模型') }}</small></template
            ><template v-else
              ><strong>{{ row.displayName }}</strong
              ><ElTag v-if="row.badge" size="small" class="badge">{{ row.badge }}</ElTag
              ><small class="block-note"
                >{{ row.vendor?.name || xt('未分组') }} · {{ row.key
                }}<template v-if="row.isDefault"> · {{ xt('默认模型') }}</template></small
              ></template
            ></template
          ></ElTableColumn
        >
        <ElTableColumn :label="xt('上游模型')" min-width="190"
          ><template #default="{ row }"
            ><template v-if="!row.isGroup"
              ><strong>{{ row.upstreamModel }}</strong
              ><small class="block-note">{{ xt('默认上游标识') }}</small></template
            ></template
          ></ElTableColumn
        >
        <ElTableColumn :label="xt('故障切换渠道')" min-width="260"
          ><template #default="{ row }"
            ><div v-if="routeChannels(row as ModelPreset).length" class="channel-tags"
              ><ElTag
                v-for="channel in routeChannels(row as ModelPreset)"
                :key="channel.key"
                size="small"
                :type="channel.enabled ? (channel.fallback ? 'info' : 'success') : 'info'"
                :effect="channel.enabled ? 'light' : 'plain'"
                >{{ channel.name }} ·
                {{ channel.fallback ? xt('最终兜底') : `P${channel.priority}` }}</ElTag
              ></div
            ><span v-else class="block-note">{{ xt('未绑定渠道') }}</span
            ><small class="block-note">{{ routeSummary(row as ModelPreset) }}</small></template
          ></ElTableColumn
        >
        <ElTableColumn :label="xt('计费')" min-width="180"
          ><template #default="{ row }"
            ><strong>{{ pricingSummary(row as ModelPreset) }}</strong
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
            ><ElTag :type="modelStatus(row as ModelPreset).type">{{
              modelStatus(row as ModelPreset).label
            }}</ElTag></template
          ></ElTableColumn
        >
        <ElTableColumn :label="xt('操作')" width="125" fixed="right"
          ><template #default="{ row }"
            ><template v-if="!row.isGroup"
              ><ElButton link type="primary" @click="openEdit(row as ModelPreset)">{{
                xt('编辑')
              }}</ElButton
              ><ElButton link type="danger" @click="remove(row as ModelPreset)">{{
                xt('删除')
              }}</ElButton></template
            ></template
          ></ElTableColumn
        >
      </ElTable>
    </ElCard>
    <ElDialog
      v-model="pricingDialog"
      :title="xt('模型价格同步与倍率对比')"
      width="min(1180px, 96vw)"
      class="pricing-sync-dialog"
      destroy-on-close
    >
      <ElAlert
        type="info"
        :closable="false"
        show-icon
        :title="
          xt(
            '价格目录提供 USD 参考成本；用户售价按汇率、目标倍率和每计费额度价值换算。应用后会生成新价格版本，历史账单不受影响。'
          )
        "
      />
      <div class="pricing-sync-toolbar">
        <ElCheckbox v-model="selectAllPriced" @change="toggleAllPriced">{{
          xt('选择全部已命中模型')
        }}</ElCheckbox>
        <ElSpace wrap>
          <span>{{ xt('目标倍率') }}</span>
          <ElInputNumber v-model="pricingMarkupPercent" :min="100" :max="1000" :step="10" />
          <span class="block-note">{{ pricingMarkupPercent / 100 }}x</span>
          <ElButton :loading="pricingLoading" @click="refreshPricingComparison(false)">{{
            xt('重新计算')
          }}</ElButton>
        </ElSpace>
      </div>
      <ElTable
        v-loading="pricingLoading"
        :data="pricingComparison?.models || []"
        height="500"
        row-key="id"
      >
        <ElTableColumn width="48">
          <template #default="{ row }"
            ><ElCheckbox
              :model-value="selectedPricingIds.includes(row.id)"
              :disabled="!row.available || !row.changed"
              @change="togglePricingModel(row.id, $event)"
              ><span /></ElCheckbox
          ></template>
        </ElTableColumn>
        <ElTableColumn :label="xt('模型')" min-width="200">
          <template #default="{ row }"
            ><strong>{{ row.displayName }}</strong
            ><small class="block-note">{{ row.upstreamModel }}</small></template
          >
        </ElTableColumn>
        <ElTableColumn :label="xt('目录参考成本')" min-width="185">
          <template #default="{ row }"
            ><template v-if="row.suggested"
              ><span>{{ costSummary(row.suggested) }}</span
              ><small class="block-note">{{ sourceLabel(row.pricingSource) }}</small></template
            ><ElTag v-else type="warning">{{
              row.pricingSource === 'none' ? xt('目录未命中') : xt('计价单位不匹配')
            }}</ElTag></template
          >
        </ElTableColumn>
        <ElTableColumn :label="xt('当前用户价格')" min-width="175">
          <template #default="{ row }"
            ><span>{{ userPriceSummary(row.current, row.capability) }}</span
            ><small class="block-note">{{
              currentMarkupSummary(row as ModelPricingComparison['models'][number])
            }}</small></template
          >
        </ElTableColumn>
        <ElTableColumn :label="xt('建议用户价格')" min-width="175">
          <template #default="{ row }"
            ><template v-if="row.suggested"
              ><strong>{{ userPriceSummary(row.suggested, row.capability) }}</strong
              ><small class="block-note"
                >{{ xt('目标') }} {{ pricingMarkupPercent / 100 }}x</small
              ></template
            ><span v-else class="block-note">{{ xt('保留人工定价') }}</span></template
          >
        </ElTableColumn>
        <ElTableColumn :label="xt('变化')" width="105">
          <template #default="{ row }"
            ><ElTag v-if="row.suggested" :type="row.changed ? 'warning' : 'success'">{{
              row.changed ? xt('待更新') : xt('已一致')
            }}</ElTag
            ><ElTag v-else type="info">{{ xt('跳过') }}</ElTag></template
          >
        </ElTableColumn>
      </ElTable>
      <div v-if="pricingComparison" class="pricing-sync-source"
        >{{ xt('目录') }}：{{ pricingComparison.catalogUrl }} · 1 USD =
        {{ pricingComparison.pricingUsdExchangeRateMicros / 1_000_000 }}
        {{ pricingComparison.currency }} · {{ xt('每计费额度价值') }}
        {{
          settlementMoneyMicros(pricingComparison.creditValueMicros, pricingComparison.currency)
        }}</div
      >
      <template #footer
        ><ElButton @click="pricingDialog = false">{{ xt('取消') }}</ElButton
        ><ElButton
          type="primary"
          :loading="pricingApplying"
          :disabled="!selectedPricingIds.length"
          @click="applyPricingComparison"
          >{{ xt('应用所选价格') }}</ElButton
        ></template
      >
    </ElDialog>
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
          ><ElCol :span="6"
            ><ElFormItem :label="xt('模型厂商')"
              ><ElSelect v-model="editor.vendorId" clearable class="w-full"
                ><ElOption
                  v-for="item in vendors"
                  :key="item.id"
                  :label="item.name"
                  :value="item.id" /></ElSelect></ElFormItem></ElCol
          ><ElCol :span="6"
            ><ElFormItem :label="xt('能力类型')"
              ><ElSelect v-model="editor.capability" class="w-full"
                ><ElOption
                  v-for="item in capabilities"
                  :key="item.value"
                  :label="item.label"
                  :value="item.value" /></ElSelect></ElFormItem></ElCol
          ><ElCol :span="6"
            ><ElFormItem :label="xt('角标')"
              ><ElInput v-model.trim="editor.badge" :placeholder="xt('推荐')" /></ElFormItem></ElCol
          ><ElCol :span="6"
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
            ><ElFormItem :label="xt('模型原生联网')"
              ><ElSelect v-model="editor.nativeSearchProvider" class="w-full"
                ><ElOption :label="xt('自动继承渠道配置')" value="auto" />
                <ElOption :label="xt('强制关闭，仅使用外部搜索')" value="disabled" />
                <ElOption label="OpenAI Web Search" value="openai" />
                <ElOption label="Anthropic Web Search" value="anthropic" />
                <ElOption label="Gemini Google Search" value="gemini" />
                <ElOption label="xAI Web Search" value="xai" />
                <ElOption label="Qwen 联网搜索" value="qwen" />
                <ElOption
                  label="豆包 / 方舟联网"
                  value="doubao" /></ElSelect></ElFormItem></ElCol></ElRow
        ><ElAlert
          v-if="editor.capability === 'CHAT'"
          type="info"
          :closable="false"
          :title="
            xt(
              '自动继承会按模型路由选择渠道配置；原生搜索失败或没有真实来源时自动进入外部搜索保底。'
            )
          "
          class="protocol-note"
        />
        <ElAlert
          v-if="editor.capability === 'CHAT'"
          type="success"
          :closable="false"
          :title="agentCapabilitySummary"
          class="protocol-note"
        />
        <template v-if="editor.capability === 'IMAGE' || editor.capability === 'COMMERCE'"
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
        ><ElAlert
          v-if="editor.capability === 'CHAT'"
          type="info"
          :closable="false"
          :title="
            xt(
              '上游成本用于利润与对账；用户售价用于扣套餐计费额度。用户分组倍率会在请求时叠加，历史任务使用当时的价格快照。'
            )
          "
          class="protocol-note"
        />
        <ElRow v-if="editor.capability === 'CHAT'" :gutter="14"
          ><ElCol :span="12"
            ><ElFormItem :label="xt('上游输入成本（微美元 / M token）')"
              ><ElInputNumber
                v-model="editor.inputCostMicrosPerMillion"
                :min="0"
                :max="2_000_000_000"
                class="w-full" /></ElFormItem></ElCol
          ><ElCol :span="12"
            ><ElFormItem :label="xt('上游输出成本（微美元 / M token）')"
              ><ElInputNumber
                v-model="editor.outputCostMicrosPerMillion"
                :min="0"
                :max="2_000_000_000"
                class="w-full" /></ElFormItem></ElCol></ElRow
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
          ><ElCheckbox v-model="editor.allowUserKey">{{ xt('允许用户 BYOK') }}</ElCheckbox
          ><ElCheckbox v-if="editor.capability === 'CHAT'" v-model="editor.agentEnabled">{{
            xt('允许 Agent 任务')
          }}</ElCheckbox></ElSpace
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
  import {
    modelApi as xinyueApi,
    type ModelPricingComparison,
    type ModelPricingValues,
    type ModelPreset,
    type ModelProviderRoute,
    type ModelVendor,
    type NativeSearchProvider,
    type Provider
  } from '@/api/xinyue/models'
  import { useXinyueAsync } from '@/hooks'
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
    vendorId: '',
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
    inputCostMicrosPerMillion: 0,
    outputCostMicrosPerMillion: 0,
    badge: '',
    apiProtocol: 'openai' as 'openai' | 'anthropic' | 'gemini',
    nativeSearchProvider: 'auto' as NativeSearchProvider | 'auto',
    agentEnabled: true,
    discovery: null as NonNullable<ModelPreset['options']>['discovery'] | null,
    agentCapabilities: null as NonNullable<ModelPreset['options']>['agentCapabilities'] | null,
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
  const vendors = ref<ModelVendor[]>([])
  const capability = ref<Capability>('CHAT')
  const vendorFilter = ref('')
  const sourceFilter = ref<'all' | 'platform' | 'byok'>('all')
  const sourceFilters = computed(() => [
    { label: xt('全部来源'), value: 'all' },
    { label: xt('管理员渠道'), value: 'platform' },
    { label: xt('允许 BYOK'), value: 'byok' }
  ])
  const { loading, saving, withLoading, withSaving } = useXinyueAsync()
  const dialog = ref(false)
  const pricingDialog = ref(false)
  const pricingLoading = ref(false)
  const pricingApplying = ref(false)
  const pricingMarkupPercent = ref(130)
  const pricingComparison = ref<ModelPricingComparison | null>(null)
  const selectedPricingIds = ref<string[]>([])
  const selectAllPriced = ref(true)
  const editor = reactive(emptyEditor())
  const routeEditors = ref<RouteEditor[]>([])
  const filtered = computed(() =>
    rows.value
      .filter((item) => item.capability === capability.value)
      .filter((item) => !vendorFilter.value || item.vendorId === vendorFilter.value)
      .filter(
        (item) =>
          sourceFilter.value === 'all' ||
          (sourceFilter.value === 'byok' ? item.allowUserKey : !item.allowUserKey)
      )
      .sort((a, b) => a.sortOrder - b.sortOrder)
  )
  const vendorOptions = computed(() => {
    const ids = new Set(
      rows.value
        .filter((item) => item.capability === capability.value)
        .map((item) => item.vendorId)
        .filter(Boolean)
    )
    return vendors.value.filter((item) => ids.has(item.id))
  })
  type GroupRow = ModelPreset & { isGroup?: boolean; groupLabel?: string; groupCount?: number }
  const groupedRows = computed<GroupRow[]>(() => {
    const groups = new Map<string, ModelPreset[]>()
    for (const row of filtered.value) {
      const label = row.vendor?.name || xt('未分组')
      const list = groups.get(label) || []
      list.push(row)
      groups.set(label, list)
    }
    return [...groups.entries()].flatMap(([label, items]) => [
      {
        id: `group:${label}`,
        isGroup: true,
        groupLabel: label,
        groupCount: items.length
      } as GroupRow,
      ...items
    ])
  })
  const spanMethod = ({ row, columnIndex }: { row: GroupRow; columnIndex: number }) => {
    if (!row.isGroup) return [1, 1]
    return columnIndex === 0 ? [1, 8] : [0, 0]
  }
  const rowClassName = ({ row }: { row: GroupRow }) => (row.isGroup ? 'is-vendor-group' : '')
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
  const agentCapabilitySummary = computed(() => {
    const detected = editor.agentCapabilities
    const context = detected?.contextWindow || editor.discovery?.contextWindow
    const features = [
      detected?.supportsReasoning ? xt('推理') : '',
      detected?.supportsTools ? xt('工具调用') : '',
      detected?.supportsStructuredOutput ? xt('结构化输出') : ''
    ].filter(Boolean)
    const detail = [context ? `${Math.round(context / 1000)}K context` : '', ...features]
      .filter(Boolean)
      .join(' · ')
    return `${editor.agentEnabled ? xt('已开放 Agent 任务') : xt('未开放 Agent 任务')}${detail ? ` · ${detail}` : ` · ${xt('工具由 Xinyue 服务端编排')}`}`
  })
  const moneyMicros = (value: number) =>
    value ? `$${(value / 1_000_000).toFixed(value < 10_000 ? 4 : 2)}` : '-'
  const settlementMoneyMicros = (value: number, currency: string) => {
    const amount = value / 1_000_000
    return `${currency === 'CNY' ? '¥' : '$'}${amount.toFixed(value < 10_000 ? 6 : 4)}`
  }
  const sourceLabel = (source: ModelPricingComparison['models'][number]['pricingSource']) =>
    source === 'litellm' ? xt('价格目录') : source === 'fallback' ? xt('内置基线') : xt('未命中')
  const costSummary = (value: ModelPricingValues) =>
    value.inputCostMicrosPerMillion || value.outputCostMicrosPerMillion
      ? `${xt('输入')} ${moneyMicros(value.inputCostMicrosPerMillion)} · ${xt('输出')} ${moneyMicros(value.outputCostMicrosPerMillion)} / M`
      : value.imageCostMicros
        ? `${moneyMicros(value.imageCostMicros)} / ${xt('张')}`
        : value.videoCostMicros
          ? `${moneyMicros(value.videoCostMicros)} / ${xt('秒')}`
          : '-'
  const userPriceSummary = (value: ModelPricingValues, modelCapability: Capability) =>
    modelCapability === 'CHAT'
      ? `${xt('输入')} ${value.inputCreditsPerMillion} · ${xt('输出')} ${value.outputCreditsPerMillion} ${xt('额度 / M')}`
      : `${value.flatCreditCost} ${xt('创作点')}`
  const currentMarkupSummary = (row: ModelPricingComparison['models'][number]) => {
    const ratios = [row.currentInputMarkupPercent, row.currentOutputMarkupPercent].filter(
      (value): value is number => value !== null
    )
    return ratios.length
      ? `${xt('当前倍率')} ${ratios.map((value) => `${(value / 100).toFixed(2)}x`).join(' / ')}`
      : xt('暂无可比倍率')
  }
  async function openPricingSync() {
    pricingDialog.value = true
    await refreshPricingComparison(true, true)
  }
  async function refreshPricingComparison(forceRefresh = false, useConfiguredMarkup = false) {
    pricingLoading.value = true
    try {
      pricingComparison.value = await xinyueApi.previewModelPricing({
        ...(useConfiguredMarkup ? {} : { markupPercent: pricingMarkupPercent.value }),
        forceRefresh
      })
      pricingMarkupPercent.value = pricingComparison.value.markupPercent
      selectedPricingIds.value = pricingComparison.value.models
        .filter((item) => item.available && item.changed)
        .map((item) => item.id)
      selectAllPriced.value = Boolean(selectedPricingIds.value.length)
    } finally {
      pricingLoading.value = false
    }
  }
  function toggleAllPriced(value: boolean | string | number) {
    selectedPricingIds.value = value
      ? pricingComparison.value?.models
          .filter((item) => item.available && item.changed)
          .map((item) => item.id) || []
      : []
  }
  function togglePricingModel(id: string, value: boolean | string | number) {
    selectedPricingIds.value = value
      ? [...new Set([...selectedPricingIds.value, id])]
      : selectedPricingIds.value.filter((item) => item !== id)
    selectAllPriced.value =
      selectedPricingIds.value.length ===
      (pricingComparison.value?.models.filter((item) => item.available && item.changed).length || 0)
  }
  async function applyPricingComparison() {
    pricingApplying.value = true
    try {
      const result = await xinyueApi.applyModelPricing({
        modelIds: selectedPricingIds.value,
        markupPercent: pricingMarkupPercent.value
      })
      ElMessage.success(
        `${xt('已更新')} ${result.updated} ${xt('个模型')}，${xt('跳过')} ${result.skipped} ${xt('个')}`
      )
      await Promise.all([load(), refreshPricingComparison(false)])
    } finally {
      pricingApplying.value = false
    }
  }
  async function load() {
    await withLoading(async () => {
      ;[rows.value, providers.value, vendors.value] = await Promise.all([
        xinyueApi.models(),
        xinyueApi.providers(),
        xinyueApi.modelVendors()
      ])
    })
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
      enabled: route.enabled && providerCanPublish(route.provider),
      fallback: false,
      priority: route.priority ?? route.provider?.priority ?? 0
    }))
    if (row.provider && !channels.some((item) => item.name === row.provider?.name))
      channels.push({
        key: `fallback:${row.provider.id}`,
        name: row.provider.name,
        enabled: providerCanPublish(row.provider),
        fallback: true,
        priority: 0
      })
    return channels
  }
  const providerCanPublish = (
    provider?: ModelProviderRoute['provider'] | ModelPreset['provider']
  ) => {
    if (!provider?.enabled) return false
    if (provider.cooldownUntil && new Date(provider.cooldownUntil).getTime() > Date.now())
      return false
    return (
      provider.hasApiKey === true ||
      provider.type === 'POLLINATIONS' ||
      provider.type === 'LOCAL_WORKER'
    )
  }
  const modelStatus = (row: ModelPreset) => {
    if (!row.enabled) return { type: 'info' as const, label: xt('已停用') }
    if (row.availability === 'AVAILABLE') return { type: 'success' as const, label: xt('前端可见') }
    if (row.availability === 'DEGRADED')
      return { type: 'warning' as const, label: xt('渠道待检测') }
    if (row.availabilityReason === 'API_KEY_MISSING')
      return { type: 'warning' as const, label: xt('未配置密钥') }
    if (row.availabilityReason === 'CHANNEL_COOLDOWN')
      return { type: 'warning' as const, label: xt('渠道冷却中') }
    if (row.availabilityReason === 'HEALTH_CHECK_REQUIRED')
      return { type: 'warning' as const, label: xt('渠道待检测') }
    return { type: 'danger' as const, label: xt('未配置渠道') }
  }
  const pricingSummary = (row: ModelPreset) => {
    if (row.capability === 'CHAT' && (row.inputCreditsPerMillion || row.outputCreditsPerMillion))
      return xt('按 Token 折算')
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
      vendorId: row.vendorId || '',
      apiProtocol: row.options?.apiProtocol || 'openai',
      nativeSearchProvider: row.options?.nativeSearchProvider || 'auto',
      agentEnabled: row.options?.agentEnabled !== false,
      discovery: row.options?.discovery || null,
      agentCapabilities: row.options?.agentCapabilities || null,
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
    await withSaving(async () => {
      const body = {
        key: editor.key,
        displayName: editor.displayName,
        description: editor.description,
        vendorId: editor.vendorId || null,
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
        inputCostMicrosPerMillion: editor.inputCostMicrosPerMillion,
        outputCostMicrosPerMillion: editor.outputCostMicrosPerMillion,
        badge: editor.badge,
        options:
          editor.capability === 'CHAT'
            ? {
                apiProtocol: editor.apiProtocol,
                agentEnabled: editor.agentEnabled,
                ...(editor.discovery ? { discovery: editor.discovery } : {}),
                ...(editor.agentCapabilities
                  ? {
                      agentCapabilities: {
                        ...editor.agentCapabilities,
                        eligible: editor.agentEnabled
                      }
                    }
                  : {}),
                ...(editor.nativeSearchProvider === 'auto'
                  ? {}
                  : { nativeSearchProvider: editor.nativeSearchProvider })
              }
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
    })
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

<style scoped src="./models.css"></style>
