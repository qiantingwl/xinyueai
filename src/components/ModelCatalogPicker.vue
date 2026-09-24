<template>
  <section class="model-catalog-picker" role="dialog" :aria-label="title" :style="{ '--picker-content-height': `${pickerHeight}px` }">
    <header class="model-catalog-picker__header">
      <span class="model-catalog-picker__heading">
        <strong>{{ title }}</strong>
        <small>{{ capabilities.length ? '按能力和厂商筛选' : '按厂商筛选' }}</small>
      </span>
      <label>
        <Search :size="16" />
        <input v-model.trim="query" type="search" placeholder="搜索模型名称、厂商或模型 ID" aria-label="搜索模型" />
      </label>
    </header>

    <div v-if="models.length || capabilities.length" class="model-catalog-picker__body" :class="{ 'has-capabilities': capabilities.length }">
      <nav v-if="capabilities.length" class="model-catalog-picker__capabilities" aria-label="模型能力">
        <span class="model-catalog-picker__column-title">能力</span>
        <button v-for="item in capabilities" :key="item.key" type="button" :class="{ 'is-active': item.key === activeCapability }" :aria-pressed="item.key === activeCapability" @click="emit('capability-change', item.key)">{{ item.label }}</button>
      </nav>
      <nav class="model-catalog-picker__vendors" aria-label="模型厂商">
        <span class="model-catalog-picker__column-title">厂商</span>
        <button v-for="vendor in vendorGroups" :key="vendor.key" type="button" :class="{ 'is-active': activeVendor === vendor.key }" @click="activeVendor = vendor.key">
          <ModelBadge :model="{ vendor: { key: vendor.key, name: vendor.label } }" />
          <strong>{{ vendor.label }}</strong>
          <small>{{ vendor.count }}</small>
        </button>
        <p v-if="!vendorGroups.length">暂无厂商</p>
      </nav>

      <div class="model-catalog-picker__models" :class="{ 'model-catalog-picker__models--empty': !matchingModels.length }" role="listbox" :aria-label="`${activeVendorLabel}模型`">
        <template v-if="matchingModels.length">
          <div class="model-catalog-picker__models-heading">
            <span><strong>{{ activeVendorLabel }}</strong><small>{{ visibleModels.length }} 个模型</small></span>
          </div>
          <div ref="modelList" class="model-catalog-picker__model-list">
            <button v-for="item in visibleModels" :key="item.key" type="button" role="option" :aria-selected="isSelectedModel(item)" :class="{ 'is-active': isSelectedModel(item) }" @click="choose(item.key)">
              <ModelBadge :model="item" class="model-catalog-picker__model-badge" />
              <span class="model-catalog-picker__model-copy">
                <span><strong>{{ item.displayName }}</strong><em v-if="visibleBadge(item)">{{ visibleBadge(item) }}</em></span>
                <small>{{ modelDescription(item) }}</small>
              </span>
              <span class="model-catalog-picker__model-meta">
                <span v-if="availabilityTip(item)" class="model-catalog-picker__status" :class="`is-${item.availability?.toLowerCase()}`" :title="availabilityTip(item)" :aria-label="availabilityTip(item)" role="img" />
                <span class="model-catalog-picker__check" :class="{ 'is-visible': isSelectedModel(item) }" aria-hidden="true"><Check :size="15" /></span>
              </span>
            </button>
            <p v-if="!visibleModels.length">{{ emptyModelMessage }}</p>
          </div>
        </template>
        <div v-else class="model-catalog-picker__capability-empty">
          <AssistantAvatar state="idle" motion="off" :size="42" />
          <strong>当前能力暂无可用模型</strong>
          <small>切换到「对话」能力，或联系管理员配置健康渠道</small>
        </div>
      </div>
    </div>

    <div v-else class="model-catalog-picker__empty">
      <AssistantAvatar state="idle" motion="off" :size="42" />
      <strong>{{ models.length ? '没有找到匹配模型' : '暂无可用模型' }}</strong>
      <small>{{ models.length ? '换一个名称、厂商或模型 ID 试试' : '请联系管理员配置健康渠道，或添加个人 API 密钥' }}</small>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { Check, Search } from 'lucide-vue-next'
import { agentModelDescription, catalogModelMatches, isAgentModelEligible, resolveCatalogModel, type CatalogModel } from '../utils/model-catalog'
import { inferVendor } from '../utils/vendor'
import AssistantAvatar from './chat/AssistantAvatar.vue'
import ModelBadge from './common/ModelBadge.vue'

const props = withDefaults(defineProps<{ models: CatalogModel[]; modelValue: string; title?: string; descriptionMode?: 'default' | 'agent'; capabilities?: Array<{ key: string; label: string }>; activeCapability?: string }>(), { title: '选择模型', descriptionMode: 'default', capabilities: () => [], activeCapability: '' })
const emit = defineEmits<{ 'update:modelValue': [value: string]; select: [value: string]; 'capability-change': [value: string] }>()
const capabilities = computed(() => props.capabilities || [])

const query = ref('')
const activeVendor = ref('')
const modelList = ref<HTMLElement | null>(null)

const inferredVendor = inferVendor

const capabilityModels = computed(() => {
  if (!props.activeCapability) return props.models
  if (props.activeCapability === 'AGENT') return props.models.filter((item) => item.capability === 'CHAT' && isAgentModelEligible(item))
  return props.models.filter((item) => item.capability === props.activeCapability)
})
const matchingModels = computed(() => {
  const keyword = query.value.toLowerCase()
  if (!keyword) return capabilityModels.value
  return capabilityModels.value.filter((item) => {
    const vendor = inferredVendor(item).label
    return `${item.displayName} ${item.upstreamModel || ''} ${item.description || ''} ${vendor}`.toLowerCase().includes(keyword)
  })
})
const activeCapabilityLabel = computed(() => capabilities.value.find((item) => item.key === props.activeCapability)?.label || '')
const emptyModelMessage = computed(() => query.value ? '当前分类没有匹配的模型' : activeCapabilityLabel.value ? `没有可用的${activeCapabilityLabel.value}` : '当前分类没有匹配的模型')
const vendorGroups = computed(() => {
  const groups = new Map<string, { key: string; label: string; count: number }>()
  for (const item of matchingModels.value) {
    const vendor = inferredVendor(item)
    const current = groups.get(vendor.key)
    if (current) current.count += 1
    else groups.set(vendor.key, { ...vendor, count: 1 })
  }
  return [...groups.values()]
})
const visibleModels = computed(() => matchingModels.value.filter((item) => inferredVendor(item).key === activeVendor.value))
const activeVendorLabel = computed(() => vendorGroups.value.find((item) => item.key === activeVendor.value)?.label || '当前')
const pickerHeight = computed(() => {
  const groups = new Map<string, number>()
  for (const item of props.models) {
    const key = inferredVendor(item).key
    groups.set(key, (groups.get(key) || 0) + 1)
  }
  const largestGroup = Math.max(0, ...groups.values())
  return Math.min(460, Math.max(420, 116 + largestGroup * 62))
})

const selectedModel = computed(() => {
  return matchingModels.value.find((item) => catalogModelMatches(item, props.modelValue))
    || resolveCatalogModel(capabilityModels.value, props.modelValue)
    || resolveCatalogModel(props.models, props.modelValue)
})

watch([matchingModels, () => props.modelValue], () => {
  const selected = matchingModels.value.find((item) => catalogModelMatches(item, props.modelValue) || item.key === selectedModel.value?.key)
  activeVendor.value = (selected && inferredVendor(selected).key) || vendorGroups.value.find((item) => item.key === activeVendor.value)?.key || vendorGroups.value[0]?.key || ''
  void nextTick(scrollSelectedModelIntoView)
}, { immediate: true })

function isSelectedModel(item: CatalogModel) {
  return catalogModelMatches(item, props.modelValue) || item.key === selectedModel.value?.key
}
function visibleBadge(item: CatalogModel) {
  const badge = (item.badge || '').trim()
  if (!badge || badge === '待定价' || badge === '自动定价') return ''
  return badge
}
function modelDescription(item: CatalogModel) { return props.descriptionMode === 'agent' ? agentModelDescription(item) : item.description || item.upstreamModel || `${inferredVendor(item).label} 模型` }
function availabilityTip(item: CatalogModel) {
  return item.availability === 'DEGRADED' ? '渠道不稳定，生成可能失败' : item.availability === 'UNCONFIGURED' ? '未配置健康渠道' : ''
}
function choose(value: string) {
  emit('update:modelValue', value)
  emit('select', value)
}
function scrollSelectedModelIntoView() {
  const selected = modelList.value?.querySelector('[aria-selected="true"]')
  if (selected instanceof HTMLElement) selected.scrollIntoView({ block: 'nearest' })
}
</script>

<style scoped>
.model-catalog-picker { --picker-accent: var(--studio-focus, #4d6bfe); --picker-border: var(--studio-border, #d9dce2); background: var(--studio-elevated, #fff); border: 1px solid var(--picker-border); border-radius: var(--studio-radius-md, 10px); box-shadow: var(--studio-shadow, 0 16px 42px rgba(21, 28, 38, .16)); box-sizing: border-box; color: var(--studio-text, #1d2026); display: flex; flex-direction: column; height: min(var(--picker-content-height), calc(100dvh - 48px)); overflow: hidden; width: min(704px, calc(100vw - 24px)); }
.model-catalog-picker__header { align-items: center; border-bottom: 1px solid var(--picker-border); display: grid; gap: 20px; grid-template-columns: 164px minmax(240px, 1fr); min-height: 64px; padding: 10px 14px; }
.model-catalog-picker__heading { display: grid; gap: 2px; min-width: 0; }
.model-catalog-picker__heading strong { font-size: 14px; font-weight: 650; line-height: 20px; white-space: nowrap; }
.model-catalog-picker__heading small { color: var(--studio-muted, #878d98); font-size: 11px; line-height: 16px; white-space: nowrap; }
.model-catalog-picker__header label { align-items: center; background: var(--studio-control, #f5f6f8); border: 1px solid transparent; border-radius: 8px; color: var(--studio-muted, #878d98); display: flex; gap: 8px; height: 38px; padding: 0 11px; transition: background-color 140ms ease, border-color 140ms ease, box-shadow 140ms ease; }
.model-catalog-picker__header label:focus-within { background: var(--studio-panel, #fff); border-color: color-mix(in srgb, var(--picker-accent) 62%, var(--picker-border)); box-shadow: 0 0 0 3px color-mix(in srgb, var(--picker-accent) 12%, transparent); }
.model-catalog-picker__header input { background: transparent; border: 0; color: var(--studio-text, #1d2026); font: inherit; font-size: 13px; min-width: 0; outline: 0; width: 100%; }
.model-catalog-picker__header input::placeholder { color: var(--studio-muted, #9297a0); opacity: 1; }
.model-catalog-picker__body { display: grid; flex: 1 1 auto; grid-template-columns: 190px minmax(0, 1fr); min-height: 0; }
.model-catalog-picker__body.has-capabilities { grid-template-columns: 190px 190px minmax(0, 1fr); }
.model-catalog-picker__capabilities,
.model-catalog-picker__vendors { border-right: 1px solid var(--picker-border); display: flex; flex-direction: column; gap: 3px; min-width: 0; overflow-y: auto; padding: 9px 8px 10px; scrollbar-width: none; }
.model-catalog-picker__capabilities::-webkit-scrollbar,
.model-catalog-picker__vendors::-webkit-scrollbar { display: none; }
.model-catalog-picker button { color: inherit; font: inherit; }
.model-catalog-picker__column-title { color: var(--studio-muted, #8b9099); font-size: 10px; font-weight: 600; line-height: 18px; padding: 0 9px 4px; }
.model-catalog-picker__capabilities button { align-items: center; background: transparent; border: 1px solid transparent; border-radius: 7px; color: var(--studio-muted, #8b9099); cursor: pointer; display: flex; font-size: 13px; min-height: 42px; padding: 5px 10px; position: relative; text-align: left; transition: background-color 120ms ease, border-color 120ms ease, color 120ms ease; width: 100%; }
.model-catalog-picker__capabilities button:hover { background: var(--studio-control, #f3f4f6); color: var(--studio-text, #1d2026); }
.model-catalog-picker__capabilities button.is-active { background: color-mix(in srgb, var(--picker-accent) 8%, var(--studio-control, #f3f5f8)); border-color: color-mix(in srgb, var(--picker-accent) 16%, transparent); color: var(--picker-accent); font-weight: 650; }
.model-catalog-picker__capabilities button.is-active::before { background: var(--picker-accent); border-radius: 2px; content: ""; height: 18px; left: -1px; position: absolute; width: 2px; }
.model-catalog-picker__vendors button { align-items: center; background: transparent; border: 1px solid transparent; border-radius: 7px; cursor: pointer; display: grid; gap: 8px; grid-template-columns: 28px minmax(0, 1fr) auto; min-height: 42px; padding: 5px 8px; position: relative; text-align: left; transition: background-color 120ms ease, border-color 120ms ease; width: 100%; }
.model-catalog-picker__vendors button:hover { background: var(--studio-control, #f3f4f6); }
.model-catalog-picker__vendors button.is-active { background: color-mix(in srgb, var(--picker-accent) 8%, var(--studio-control, #f3f5f8)); border-color: color-mix(in srgb, var(--picker-accent) 16%, transparent); }
.model-catalog-picker__vendors button.is-active::before { background: var(--picker-accent); border-radius: 2px; content: ""; height: 18px; left: -1px; position: absolute; width: 2px; }
.model-catalog-picker__vendors strong { font-size: 13px; font-weight: 570; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.model-catalog-picker__vendors > p { color: var(--studio-muted, #8b9099); font-size: 12px; padding: 18px 10px; }
.model-catalog-picker__vendors small { color: var(--studio-muted, #8b9099); font-size: 10px; font-variant-numeric: tabular-nums; }
.model-catalog-picker__vendors button > span { align-items: center; background: var(--studio-panel, #fff); border: 1px solid var(--picker-border); border-radius: 7px; color: var(--studio-muted, #777d87); display: flex; height: 28px; justify-content: center; width: 28px; }
/* 厂商列里的品牌徽标保持白色磁贴底（官方彩色图标在深色面板上对比度不足） */
.model-catalog-picker__vendors button > span.model-badge--tile { background: #fff; }
.model-catalog-picker__vendors button.is-active > span { border-color: color-mix(in srgb, var(--picker-accent) 28%, var(--picker-border)); color: var(--picker-accent); }
.model-catalog-picker__vendors button > span { font-size: 11px; font-weight: 700; }
.model-catalog-picker__models { display: grid; grid-template-rows: 40px minmax(0, 1fr); min-width: 0; overflow: hidden; }
.model-catalog-picker__models--empty { align-items: center; display: flex; grid-template-rows: none; justify-content: center; }
.model-catalog-picker__capability-empty { align-items: center; color: var(--studio-muted, #858b95); display: flex; flex-direction: column; gap: 7px; max-width: 240px; padding: 24px; text-align: center; }
.model-catalog-picker__capability-empty strong { color: var(--studio-text, #23262c); font-size: 13px; }
.model-catalog-picker__capability-empty small { font-size: 11px; line-height: 1.7; }
.model-catalog-picker__models-heading { align-items: center; border-bottom: 1px solid color-mix(in srgb, var(--picker-border) 68%, transparent); display: flex; padding: 0 12px; }
.model-catalog-picker__models-heading > span { align-items: baseline; display: flex; gap: 7px; min-width: 0; }
.model-catalog-picker__models-heading strong { font-size: 12px; font-weight: 630; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.model-catalog-picker__models-heading small { color: var(--studio-muted, #8a9099); font-size: 10px; white-space: nowrap; }
.model-catalog-picker__model-list { min-height: 0; overflow-y: auto; padding: 8px; scrollbar-color: color-mix(in srgb, var(--studio-muted, #8a9099) 36%, transparent) transparent; scrollbar-width: thin; }
.model-catalog-picker__model-list > button { align-items: center; background: transparent; border: 1px solid transparent; border-radius: 8px; cursor: pointer; display: grid; gap: 10px; grid-template-columns: 34px minmax(0, 1fr) auto; min-height: 60px; padding: 7px 9px; text-align: left; transition: background-color 120ms ease, border-color 120ms ease; width: 100%; }
.model-catalog-picker__model-list > button:hover { background: var(--studio-control, #f5f6f8); }
.model-catalog-picker__model-list > button.is-active { background: color-mix(in srgb, var(--picker-accent) 8%, var(--studio-control, #f5f7fb)); border-color: color-mix(in srgb, var(--picker-accent) 20%, transparent); }
.model-catalog-picker__model-icon { align-items: center; background: var(--studio-panel, #fff); border: 1px solid var(--picker-border); border-radius: 8px; color: var(--studio-muted, #757b85); display: flex; height: 34px; justify-content: center; width: 34px; }
.model-catalog-picker__model-list .model-badge { align-items: center; border-radius: 8px; display: flex; flex: 0 0 34px; font-size: 15px; height: 34px; justify-content: center; width: 34px; }
.model-catalog-picker__model-list > button.is-active .model-catalog-picker__model-icon { border-color: color-mix(in srgb, var(--picker-accent) 26%, var(--picker-border)); color: var(--picker-accent); }
.model-catalog-picker__model-copy { display: grid; gap: 4px; min-width: 0; }
.model-catalog-picker__model-copy > span { align-items: center; display: flex; gap: 7px; min-width: 0; }
.model-catalog-picker__model-copy strong { font-size: 13px; font-weight: 630; line-height: 18px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.model-catalog-picker__model-copy em { background: color-mix(in srgb, #e39122 11%, transparent); border-radius: 4px; color: #b66a06; flex: 0 0 auto; font-size: 9px; font-style: normal; line-height: 16px; padding: 0 5px; }
.model-catalog-picker__model-copy small { color: var(--studio-muted, #8a9099); font-size: 10px; line-height: 15px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.model-catalog-picker__model-meta { align-items: center; display: flex; gap: 7px; }
.model-catalog-picker__model-meta b { align-items: center; color: var(--studio-muted, #777d87); display: flex; font-size: 11px; font-weight: 500; gap: 3px; }
.model-catalog-picker__status { border-radius: 50%; flex: 0 0 auto; height: 8px; width: 8px; }
.model-catalog-picker__status.is-degraded { background: #e39122; box-shadow: 0 0 0 3px color-mix(in srgb, #e39122 16%, transparent); }
.model-catalog-picker__status.is-unconfigured { background: #d05252; box-shadow: 0 0 0 3px color-mix(in srgb, #d05252 14%, transparent); }
.model-catalog-picker__check { align-items: center; background: var(--picker-accent); border-radius: 50%; color: #fff; display: flex; height: 20px; justify-content: center; opacity: 0; transform: scale(.82); transition: opacity 120ms ease, transform 120ms ease; width: 20px; }
.model-catalog-picker__check.is-visible { opacity: 1; transform: scale(1); }
.model-catalog-picker__model-list > p, .model-catalog-picker__empty { color: var(--studio-muted, #858b95); }
.model-catalog-picker__model-list > p { font-size: 12px; padding: 28px 12px; text-align: center; }
.model-catalog-picker__empty { align-items: center; display: flex; flex-direction: column; gap: 7px; height: calc(100% - 58px); justify-content: center; padding: 24px; text-align: center; }
.model-catalog-picker__empty strong { color: var(--studio-text, #23262c); font-size: 14px; }
.model-catalog-picker__empty small { font-size: 12px; }
.model-catalog-picker button:focus-visible { outline: 2px solid color-mix(in srgb, var(--picker-accent) 68%, transparent); outline-offset: -2px; }
@media (max-width: 680px) {
  .model-catalog-picker { height: min(calc(var(--picker-content-height) + 100px), calc(100dvh - 24px)); }
  .model-catalog-picker__header { align-items: stretch; gap: 8px; grid-template-columns: 1fr; padding: 11px 12px; }
  .model-catalog-picker__heading small { display: none; }
  .model-catalog-picker__header label { height: 38px; }
  .model-catalog-picker__body { grid-template-columns: 1fr; grid-template-rows: auto minmax(0, 1fr); }
  .model-catalog-picker__body.has-capabilities { grid-template-columns: 1fr; grid-template-rows: auto auto minmax(0, 1fr); }
  .model-catalog-picker__capabilities,
  .model-catalog-picker__vendors { border-bottom: 1px solid var(--picker-border); border-right: 0; flex-direction: row; overflow-x: auto; overflow-y: hidden; padding: 7px 8px; }
  .model-catalog-picker__column-title { align-items: center; display: flex; flex: 0 0 auto; padding: 0 4px; }
  .model-catalog-picker__capabilities button,
  .model-catalog-picker__vendors button { flex: 0 0 auto; min-width: 132px; }
  .model-catalog-picker__models { grid-template-rows: 38px minmax(0, 1fr); }
  .model-catalog-picker__model-list > button { min-height: 64px; padding-inline: 8px; }
  .model-catalog-picker__model-meta { gap: 5px; }
  .model-catalog-picker__model-meta b { display: none; }
}
@media (prefers-reduced-motion: reduce) { .model-catalog-picker * { scroll-behavior: auto !important; } }
</style>
