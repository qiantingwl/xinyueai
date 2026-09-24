<template>
  <nav v-if="items.length" class="workspace-section-tabs" aria-label="工作空间内容">
    <RouterLink
      v-for="item in items"
      :key="item.key"
      :to="item.to"
      custom
      v-slot="{ href, navigate }"
    >
      <a
        :href="href"
        :class="{ 'is-active': active === item.key }"
        :aria-current="active === item.key ? 'page' : undefined"
        @click="navigate"
      >
        <component :is="iconFor(item.key)" :size="17" />
        <span>{{ item.label }}</span>
      </a>
    </RouterLink>
  </nav>
</template>

<script setup lang="ts">
import { computed, type Component } from 'vue'
import { Files, FolderKanban, Images, ScanText, Spline } from 'lucide-vue-next'
import { RouterLink } from 'vue-router'
import { useCatalogStore } from '../stores/catalog'
import { visibleWorkspaceNav, type WorkspaceNavKey } from '../utils/sidebar-nav'

defineProps<{ active: WorkspaceNavKey }>()

const catalog = useCatalogStore()
const icons: Record<WorkspaceNavKey, Component> = {
  projects: FolderKanban,
  files: Files,
  works: Images,
  canvases: Spline,
  'image-prompts': ScanText,
}
function iconFor(key: string) {
  return key in icons ? icons[key as WorkspaceNavKey] : FolderKanban
}
const items = computed(() => visibleWorkspaceNav(catalog.settings))
</script>

<style scoped>
.workspace-section-tabs {
  align-items: center;
  background: var(--studio-control);
  border: 1px solid var(--studio-border);
  border-radius: 8px;
  display: inline-flex;
  gap: 3px;
  margin-bottom: 30px;
  padding: 3px;
}

.workspace-section-tabs a {
  align-items: center;
  border-radius: 6px;
  color: var(--studio-muted);
  display: inline-flex;
  font-size: 13px;
  font-weight: 600;
  gap: 7px;
  height: 36px;
  justify-content: center;
  min-width: 88px;
  padding: 0 16px;
  text-decoration: none;
}

.workspace-section-tabs a:hover {
  color: var(--studio-text);
}

.workspace-section-tabs a.is-active {
  background: var(--studio-elevated);
  box-shadow: 0 1px 3px rgba(0, 0, 0, .18);
  color: var(--studio-text);
}

@media (max-width: 640px) {
  .workspace-section-tabs {
    display: flex;
    margin-bottom: 24px;
    width: 100%;
  }

  .workspace-section-tabs a {
    flex: 1;
    font-size: 11px;
    gap: 5px;
    min-width: 0;
    padding: 0 5px;
    white-space: nowrap;
  }
}
</style>

