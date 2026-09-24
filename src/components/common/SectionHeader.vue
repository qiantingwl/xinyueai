<template>
  <header class="section-header" :class="{ 'section-header--compact': compact }">
    <div class="section-header__copy">
      <component :is="headingTag" class="section-header__title">{{ title }}</component>
      <p v-if="description" class="section-header__description">{{ description }}</p>
    </div>
    <div v-if="$slots.actions" class="section-header__actions">
      <slot name="actions" />
    </div>
  </header>
</template>

<script setup lang="ts">
/** 页面与分区标题的统一结构：标题 + 说明 + 右侧操作区。 */
withDefaults(defineProps<{
  title: string
  description?: string
  /** 页面级标题用 h1，分区标题用 h2/h3，保证每页只有一个 h1。 */
  headingTag?: 'h1' | 'h2' | 'h3'
  compact?: boolean
}>(), { description: '', headingTag: 'h2', compact: false })
</script>
