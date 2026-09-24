<template>
  <section class="sidebar-nav-editor">
    <article v-for="(item, index) in items" :key="item.key">
      <ElInput
        :model-value="item.label"
        maxlength="24"
        :aria-label="`${item.defaultLabel}名称`"
        @change="rename(item.key, String($event || ''), item.defaultLabel)"
      />
      <small>{{ item.defaultLabel }}</small>
      <div class="sidebar-nav-editor__actions">
        <ElButton size="small" round :disabled="index === 0" @click="move(item.key, -1)">{{
          xt('上移')
        }}</ElButton>
        <ElButton
          size="small"
          round
          :disabled="index === items.length - 1"
          @click="move(item.key, 1)"
          >{{ xt('下移') }}</ElButton
        >
        <ElButton v-if="promoteable" size="small" round @click="promote(item.key)">{{
          xt('放到侧边栏')
        }}</ElButton>
        <ElButton
          v-else-if="nestedKeys.includes(item.key)"
          size="small"
          round
          @click="demote(item.key)"
          >{{ xt('移回二级') }}</ElButton
        >
        <ElButton size="small" round @click="hide(item.key)">{{ xt('关闭') }}</ElButton>
      </div>
    </article>
    <article v-for="item in promotedItems" :key="`promoted-${item.key}`" class="is-promoted">
      <strong>{{ item.label }}</strong>
      <small>{{ xt('已放到一级侧边栏') }}</small>
      <ElButton size="small" round @click="demote(item.key)">{{ xt('移回二级') }}</ElButton>
    </article>
    <article v-for="item in hiddenItems" :key="`hidden-${item.key}`" class="is-hidden">
      <strong>{{ item.label }}</strong>
      <small>{{ xt('已对用户关闭') }}</small>
      <ElButton size="small" round @click="show(item.key)">{{ xt('开启') }}</ElButton>
    </article>
    <p v-if="!items.length && !promotedItems.length">{{ xt('当前没有对用户开放的入口。') }}</p>
    <ElButton text type="primary" @click="reset">{{ xt('恢复默认名称、排序和开关') }}</ElButton>
  </section>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import { xinyueText as xt } from '@/locales/xinyue'
  import {
    applySidebarNav,
    emptySidebarNav,
    moveSidebarItem,
    NESTED_NAV_KEYS,
    parseSidebarNav,
    type SidebarNavPreference
  } from '@/utils/xinyue/sidebar-nav'

  const props = defineProps<{
    catalog: Array<{ key: string; label: string }>
    preference: SidebarNavPreference
    promoteable?: boolean
    promoted?: string[]
  }>()

  const emit = defineEmits<{
    'update:preference': [value: SidebarNavPreference]
    promote: [key: string]
    demote: [key: string]
  }>()

  const nestedKeys: readonly string[] = NESTED_NAV_KEYS
  const promotedSet = computed(() => new Set(props.promoted || props.preference.promoted || []))
  const items = computed(() =>
    applySidebarNav(
      props.catalog
        .filter((item) => !props.promoteable || !promotedSet.value.has(item.key))
        .map((item) => ({ ...item, defaultLabel: item.label })),
      props.preference
    )
  )
  const promotedItems = computed(() =>
    props.promoteable
      ? props.catalog
          .filter(
            (item) => promotedSet.value.has(item.key) && !props.preference.hidden.includes(item.key)
          )
          .map((item) => ({
            ...item,
            label: props.preference.labels[item.key]?.trim() || item.label
          }))
      : []
  )
  const hiddenItems = computed(() =>
    props.catalog
      .filter((item) => props.preference.hidden.includes(item.key))
      .map((item) => ({ ...item, label: props.preference.labels[item.key]?.trim() || item.label }))
  )

  function commit(next: SidebarNavPreference) {
    emit('update:preference', parseSidebarNav(next))
  }

  function rename(key: string, value: string, defaultLabel: string) {
    const labels = { ...props.preference.labels }
    const next = value.trim()
    if (!next || next === defaultLabel) delete labels[key]
    else labels[key] = next
    commit({ ...props.preference, labels })
  }

  function currentOrder() {
    return props.preference.order.length
      ? [...props.preference.order]
      : items.value.map((item) => item.key)
  }

  function move(key: string, direction: -1 | 1) {
    commit({ ...props.preference, order: moveSidebarItem(currentOrder(), key, direction) })
  }

  function hide(key: string) {
    if (promotedSet.value.has(key)) emit('demote', key)
    commit({
      ...props.preference,
      hidden: [...new Set([...props.preference.hidden, key])],
      order: currentOrder().filter((item) => item !== key)
    })
  }

  function show(key: string) {
    commit({
      ...props.preference,
      hidden: props.preference.hidden.filter((item) => item !== key),
      order: [...currentOrder(), key]
    })
  }

  function promote(key: string) {
    emit('promote', key)
  }

  function demote(key: string) {
    emit('demote', key)
  }

  function reset() {
    for (const item of props.catalog) {
      if (promotedSet.value.has(item.key)) emit('demote', item.key)
    }
    commit(emptySidebarNav())
  }
</script>

<style scoped>
  .sidebar-nav-editor {
    display: grid;
    gap: 8px;
  }

  .sidebar-nav-editor article {
    align-items: center;
    display: grid;
    grid-template-columns: minmax(160px, 240px) minmax(72px, 1fr) auto;
    gap: 12px;
    min-width: 0;
    padding: 8px 0;
    border-bottom: 1px solid var(--art-border-color);
  }

  .sidebar-nav-editor article:last-of-type {
    border-bottom: 0;
  }

  .sidebar-nav-editor article.is-hidden,
  .sidebar-nav-editor article.is-promoted {
    opacity: 0.72;
  }

  .sidebar-nav-editor :deep(.el-input) {
    width: 100%;
    max-width: 240px;
  }

  .sidebar-nav-editor small {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 12px;
    color: var(--art-gray-500);
    white-space: nowrap;
  }

  .sidebar-nav-editor__actions {
    display: flex;
    flex: 0 0 auto;
    flex-wrap: wrap;
    gap: 6px;
    justify-content: flex-end;
  }
</style>
