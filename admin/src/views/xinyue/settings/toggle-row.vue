<template>
  <label class="toggle-row"
    ><span
      ><strong>{{ xt(title) }}</strong
      ><small>{{ xt(note) }}</small></span
    ><ElSwitch :model-value="modelValue" @update:model-value="update"
  /></label>
</template>
<script setup lang="ts">
  import { xinyueText as xt } from '@/locales/xinyue'
  defineProps<{ modelValue: boolean; title: string; note: string }>()
  const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
  const update = (value: string | number | boolean) => emit('update:modelValue', Boolean(value))
</script>
<style scoped>
  .toggle-row {
    display: flex;
    gap: 16px;
    align-items: center;
    justify-content: space-between;
    min-height: 68px;
    padding: 12px 14px;
    border: 1px solid var(--art-gray-200);
    border-radius: 6px;
  }

  .toggle-row span {
    display: grid;
    gap: 4px;
  }

  .toggle-row small {
    font-size: 12px;
    line-height: 1.4;
    color: var(--art-gray-500);
  }
</style>
