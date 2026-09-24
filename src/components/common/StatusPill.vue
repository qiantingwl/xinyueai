<template>
  <span class="status-pill" :class="[`status-pill--${tone}`, { 'status-pill--plain': plain }]">
    <i v-if="!plain" class="status-pill__dot" aria-hidden="true" />
    <slot>{{ label }}</slot>
  </span>
</template>

<script setup lang="ts">
/**
 * 状态标记的统一呈现。业务状态先映射成 tone，再由样式统一决定颜色，
 * 避免各页面各自写 `.is-approved` 之类的一次性色值。
 */
export type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger'

withDefaults(defineProps<{
  /** 状态文案，也可以用默认插槽自定义内容。 */
  label?: string
  tone?: StatusTone
  /** 只显示文字，不显示色点，用于嵌在标题行内的轻量场景。 */
  plain?: boolean
}>(), { label: '', tone: 'neutral', plain: false })
</script>
