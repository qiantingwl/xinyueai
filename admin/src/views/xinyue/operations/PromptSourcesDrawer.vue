<template>
  <ElDrawer
    :model-value="modelValue"
    :title="xt('提示词库来源')"
    size="min(960px, 96vw)"
    destroy-on-close
    @update:model-value="emit('update:modelValue', $event)"
  >
    <ElAlert
      class="source-cache-notice"
      type="info"
      :closable="false"
      :title="xt('内部来源按计划刷新；外部来源默认关闭，管理员核验授权范围并明确启用后才会同步。')"
    />
    <ElTable v-loading="loading" :data="sources" row-key="id">
      <ElTableColumn :label="xt('类型')" prop="promptTypeLabel" width="72" />
      <ElTableColumn :label="xt('来源')" min-width="180">
        <template #default="{ row }">
          <ElInput v-model.trim="row.displayName" maxlength="100" />
          <small class="source-meta">{{ row.upstreamName || row.id }}</small>
          <small v-if="row.external" class="source-review">
            {{ row.reviewStatus === 'restricted' ? xt('存在商业使用限制') : xt('授权范围待核验')
            }}<template v-if="row.reviewNote"> · {{ row.reviewNote }}</template>
          </small>
        </template>
      </ElTableColumn>
      <ElTableColumn :label="xt('内容数')" prop="count" width="90" />
      <ElTableColumn :label="xt('排序')" width="120">
        <template #default="{ row }"
          ><ElInputNumber v-model="row.sortOrder" :min="0" :max="100000" controls-position="right"
        /></template>
      </ElTableColumn>
      <ElTableColumn :label="xt('启用')" width="90">
        <template #default="{ row }"><ElSwitch v-model="row.enabled" /></template>
      </ElTableColumn>
      <ElTableColumn :label="xt('缓存状态')" min-width="180">
        <template #default="{ row }">
          <ElTag
            :type="
              !row.enabled
                ? 'info'
                : row.refreshing
                  ? 'warning'
                  : row.lastError
                    ? 'danger'
                    : 'success'
            "
          >
            {{
              !row.enabled
                ? xt('已停用')
                : row.refreshing
                  ? xt('同步中')
                  : row.lastError
                    ? xt('同步异常')
                    : xt('缓存完整')
            }}
          </ElTag>
          <small v-if="row.fetchedAt" class="source-meta"
            >{{ xt('更新于') }} {{ formatDate(row.fetchedAt) }}</small
          >
          <small v-if="row.lastError && !row.refreshing" class="source-error">{{
            row.lastError
          }}</small>
        </template>
      </ElTableColumn>
      <ElTableColumn :label="xt('操作')" width="138" align="right">
        <template #default="{ row }">
          <ElButton
            link
            :disabled="!row.enabled"
            :loading="row._refreshing"
            @click="emit('refresh', row)"
            >{{ xt('更新缓存') }}</ElButton
          >
          <ElButton link type="primary" @click="emit('save', row)">{{ xt('保存') }}</ElButton>
        </template>
      </ElTableColumn>
    </ElTable>
  </ElDrawer>
</template>

<script setup lang="ts">
  import { xinyueText as xt } from '@/locales/xinyue'
  import type { ResourceRow as Row } from './resource-types'

  defineProps<{
    modelValue: boolean
    loading: boolean
    sources: Row[]
    formatDate: (value: unknown) => string
  }>()
  const emit = defineEmits<{
    'update:modelValue': [value: boolean]
    save: [row: Row]
    refresh: [row: Row]
  }>()
</script>

<style scoped>
  .source-cache-notice {
    margin-bottom: 16px;
  }
  .source-meta,
  .source-review,
  .source-error {
    display: block;
    font-size: 12px;
    line-height: 1.5;
    color: var(--art-gray-500);
  }
  .source-meta {
    margin-top: 5px;
  }
  .source-error {
    margin-top: 4px;
    color: var(--el-color-danger);
  }
  .source-review {
    color: var(--el-color-warning);
    margin-top: 4px;
  }
</style>
