<template>
  <NConfigProvider :theme="naiveTheme" :theme-overrides="themeOverrides">
    <NMessageProvider>
      <RouterView />
    </NMessageProvider>
  </NConfigProvider>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { NConfigProvider, NMessageProvider, darkTheme, type GlobalThemeOverrides } from 'naive-ui'
import { readStoredSettings } from './utils/settings-storage'

const systemThemeQuery = window.matchMedia('(prefers-color-scheme: light)')

function resolveStudioTheme(): 'light' | 'dark' {
  const appearance = readStoredSettings().appearance
  if (appearance === '浅色' || appearance === 'light') return 'light'
  if (appearance === '深色' || appearance === 'dark') return 'dark'
  return systemThemeQuery.matches ? 'light' : 'dark'
}

function applyStudioTheme() {
  const theme = resolveStudioTheme()
  if (document.documentElement.dataset.studioTheme !== theme) {
    document.documentElement.dataset.studioTheme = theme
  }
}

applyStudioTheme()

const themeName = ref(document.documentElement.dataset.studioTheme)
let themeObserver: MutationObserver | undefined
onMounted(() => {
  themeObserver = new MutationObserver(() => {
    themeName.value = document.documentElement.dataset.studioTheme ?? 'dark'
  })
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-studio-theme'] })
  systemThemeQuery.addEventListener('change', applyStudioTheme)
})
onBeforeUnmount(() => {
  themeObserver?.disconnect()
  systemThemeQuery.removeEventListener('change', applyStudioTheme)
})
const naiveTheme = computed(() => (themeName.value === 'light' ? null : darkTheme))

const themeOverrides = computed<GlobalThemeOverrides>(() => ({
  common: {
    primaryColor: '#4d6bfe',
    primaryColorHover: '#3d5bee',
    primaryColorPressed: '#2f4bdb',
    borderRadius: '8px',
    fontFamily:
      'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
}))
</script>
