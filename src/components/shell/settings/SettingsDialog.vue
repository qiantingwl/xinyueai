<template>
  <div class="studio-modal-backdrop" @click.self="emit('close')">
    <section class="studio-settings-dialog" role="dialog" aria-modal="true" :aria-labelledby="`settings-${settingsSection}`">
      <aside class="settings-sidebar">
        <button class="settings-close" type="button" aria-label="关闭" @click="emit('close')"><X :size="20" /></button>
        <nav :ref="navRef">
          <button v-for="item in settingsNav" :key="item.id" type="button" :data-section="item.id" :class="{ 'is-active': settingsSection === item.id }" @click="emit('select', item.id)">
            <component :is="item.icon" :size="17" />{{ item.label }}
          </button>
        </nav>
      </aside>
      <main class="settings-content">
        <slot />
      </main>
    </section>
  </div>
</template>

<script setup lang="ts">
import type { Component, ComponentPublicInstance } from 'vue'
import { X } from 'lucide-vue-next'
import { useEscapeClose } from '../../../composables/useEscapeClose'
import type { SettingsSection } from '../types'

defineProps<{
  settingsSection: SettingsSection
  settingsNav: Array<{ id: SettingsSection; label: string; icon: Component }>
  navRef: (el: Element | ComponentPublicInstance | null) => void
}>()

const emit = defineEmits<{
  close: []
  select: [section: SettingsSection]
}>()

useEscapeClose(() => emit('close'))
</script>
