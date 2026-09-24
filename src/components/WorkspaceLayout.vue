<template>
  <WorkspaceShell :active-mode="activeMode" :canvas-route="canvasRoute">
    <RouterView />
  </WorkspaceShell>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue'
import { RouterView, useRoute, useRouter } from 'vue-router'
import WorkspaceShell from './WorkspaceShell.vue'
import { useCatalogStore } from '../stores/catalog'
import { closedPageRedirect } from '../utils/sidebar-nav'
import type { StudioMode } from '../types'

const route = useRoute()
const router = useRouter()
const catalog = useCatalogStore()
const activeMode = computed<StudioMode>(() => {
  const modes: Record<string, StudioMode> = {
    chat: 'chat',
    images: 'images',
    videos: 'videos',
    commerce: 'commerce',
    office: 'office',
    prompts: 'prompts',
    plugins: 'plugins',
    capabilities: 'plugins',
    workspace: 'workspace',
    canvases: 'workspace',
    works: 'workspace',
    'image-prompt': 'workspace',
    canvas: 'workspace',
  }
  return modes[String(route.name)] || 'workspace'
})
const canvasRoute = computed(() => route.name === 'canvas')

watch(
  () => [route.fullPath, catalog.loaded, catalog.settings] as const,
  () => {
    if (!catalog.loaded) return
    const next = closedPageRedirect(route.path, String(route.name || ''), route.query, catalog.settings)
    if (next && next !== route.fullPath) void router.replace(next)
  },
  { immediate: true },
)
</script>
