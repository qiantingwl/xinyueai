<template>
  <span
    class="model-badge"
    :class="[`model-badge--${size}`, { 'model-badge--tile': logoFile }]"
    :style="{ '--model-badge-color': color, ...tileStyle }"
    :title="vendor.label"
    aria-hidden="true"
  >
    <img v-if="logoFile && !logoError" class="model-badge__logo" :src="logoFile" alt="" draggable="false" @error="logoError = true" />
    <span v-else class="model-badge__initial">{{ initial }}</span>
  </span>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { inferVendor, vendorColor, vendorInitial, type VendorLike } from '../../utils/vendor'

const props = withDefaults(defineProps<{ model: VendorLike; size?: 'sm' | 'md' }>(), { size: 'md' })

// 官方品牌图标（public/assets/model-logos，来自 lobe-icons 收录的各厂商官方 Logo）
// 有彩色官方版的用彩色版，否则用单色版；统一放在白色磁贴上展示
// tileBg：个别官方图标本体为白色（如 Kimi），需用深色磁贴底
const LOGO_MAP: Array<[RegExp, string, boolean, string?]> = [
  [/deepseek/, 'deepseek', true],
  [/openai|gpt/, 'openai', false],
  [/kimi|moonshot/, 'kimi', true, '#0d0d0d'],
  [/qwen|通义|千问/, 'qwen', true],
  [/doubao|豆包/, 'doubao', true],
  [/anthropic|claude/, 'claude', true],
  [/google|gemini/, 'gemini', true],
  [/xai|grok/, 'grok', false],
  [/zhipu|智谱|\bglm\b/, 'zhipu', true],
  [/minimax/, 'minimax', true],
  [/hunyuan|混元|tencent/, 'hunyuan', true],
  [/stepfun|阶跃/, 'stepfun', true],
  [/longcat/, 'longcat', true],
]

const vendor = computed(() => inferVendor(props.model))
const color = computed(() => vendorColor(vendor.value.key))
const logoMatch = computed(() => {
  const hay = `${vendor.value.key} ${vendor.value.label} ${props.model.displayName || ''} ${props.model.upstreamModel || ''}`.toLowerCase()
  return LOGO_MAP.find(([re]) => re.test(hay))
})
const logoFile = computed(() => {
  const match = logoMatch.value
  if (!match) return ''
  return `${import.meta.env.BASE_URL}assets/model-logos/${match[1]}${match[2] ? '-color' : ''}.svg`
})
const tileStyle = computed(() => {
  const tileBg = logoMatch.value?.[3]
  return tileBg ? { background: tileBg, borderColor: 'transparent' } : undefined
})
const logoError = ref(false)
const initial = computed(() => vendorInitial(vendor.value))
</script>
