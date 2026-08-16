<template>
  <div class="plugin-selector" :class="{ 'plugin-selector--compact': compact }">
    <button ref="trigger" type="button" :class="{ 'is-open': isOpen }" :aria-expanded="isOpen" :aria-label="`选择技能，当前为${selected?.name || '未启用'}`" @click="toggle">
      <Blocks :size="15" /><span>{{ selected?.name || '技能' }}</span><ChevronDown class="plugin-selector__chevron" :size="13" />
    </button>
    <Teleport to="body">
      <div v-if="isOpen" ref="popover" class="plugin-selector__popover plugin-selector__popover--floating" :style="popoverStyle">
        <header><span><strong>选择技能</strong><small>只显示支持当前任务的已安装或私有技能</small></span><RouterLink to="/capabilities" @click="setOpen(false)">管理</RouterLink></header>
        <button type="button" :class="{ 'is-active': !modelValue }" @click="select('')"><span><strong>不使用插件</strong><small>按当前模型和设置直接生成</small></span><Check v-if="!modelValue" :size="15" /></button>
        <button v-for="plugin in plugins" :key="plugin.id" type="button" :class="{ 'is-active': modelValue === plugin.id }" @click="select(plugin.id)">
          <span><strong>{{ plugin.name }}<em v-if="plugin.owned">私有</em></strong><small>{{ plugin.description || capabilityLabel }}</small></span><Check v-if="modelValue === plugin.id" :size="15" />
        </button>
        <p v-if="loading">正在读取可用插件</p>
        <p v-else-if="!plugins.length">暂无可用技能，可前往能力中心安装</p>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { Blocks, Check, ChevronDown } from 'lucide-vue-next'
import { api } from '../services/api'
import type { Plugin, PluginCapability } from '../types'

const props = withDefaults(defineProps<{ modelValue?: string; capability: PluginCapability; compact?: boolean; open?: boolean | null }>(), { modelValue: '', compact: false, open: null })
const emit = defineEmits<{ 'update:modelValue': [value: string]; 'update:open': [value: boolean] }>()
const plugins = ref<Plugin[]>([])
const loading = ref(false)
const internalOpen = ref(false)
const isOpen = computed(() => props.open === null ? internalOpen.value : props.open)
const trigger = ref<HTMLButtonElement | null>(null)
const popover = ref<HTMLElement | null>(null)
const popoverStyle = ref<Record<string, string>>({ visibility: 'hidden' })
const selected = computed(() => plugins.value.find((plugin) => plugin.id === props.modelValue))
const capabilityLabel = computed(() => ({ CHAT: '对话插件', IMAGE: '图片插件', VIDEO: '视频插件', COMMERCE: '电商插件', OFFICE: '办公插件' }[props.capability]))

async function load() {
  loading.value = true
  try {
    plugins.value = await api<Plugin[]>(`/plugins/available?capability=${props.capability}`)
    if (props.modelValue && !plugins.value.some((plugin) => plugin.id === props.modelValue)) emit('update:modelValue', '')
  } catch { plugins.value = []; if (props.modelValue) emit('update:modelValue', '') }
  finally { loading.value = false; if (isOpen.value) void nextTick(positionPopover) }
}
function setOpen(value: boolean) { internalOpen.value = value; emit('update:open', value) }
function select(id: string) { emit('update:modelValue', id); setOpen(false) }
function toggle() {
  const shouldOpen = !isOpen.value
  if (shouldOpen) document.dispatchEvent(new Event('xinyue:close-popovers'))
  setOpen(shouldOpen)
  if (shouldOpen) { void load(); void nextTick(positionPopover) }
}
function positionPopover() {
  if (!isOpen.value || !trigger.value || !popover.value) return
  const anchor = trigger.value.getBoundingClientRect()
  const menu = popover.value.getBoundingClientRect()
  const gap = 8
  const left = Math.min(window.innerWidth - menu.width - 12, Math.max(12, anchor.left))
  const roomBelow = window.innerHeight - anchor.bottom - gap
  const top = roomBelow >= Math.min(menu.height, 390) ? anchor.bottom + gap : Math.max(12, anchor.top - menu.height - gap)
  popoverStyle.value = { left: `${left}px`, top: `${top}px`, visibility: 'visible' }
}
function closeOnOutside(event: PointerEvent) {
  const target = event.target as Node
  if (trigger.value?.contains(target) || popover.value?.contains(target)) return
  close()
}
function close() { setOpen(false); popoverStyle.value = { visibility: 'hidden' } }
watch(() => props.capability, () => { void load() })
watch(() => plugins.value.length, () => { if (isOpen.value) void nextTick(positionPopover) })
onMounted(() => { void load(); document.addEventListener('xinyue:close-popovers', close); document.addEventListener('pointerdown', closeOnOutside); window.addEventListener('resize', positionPopover); window.addEventListener('scroll', positionPopover, true) })
onUnmounted(() => { document.removeEventListener('xinyue:close-popovers', close); document.removeEventListener('pointerdown', closeOnOutside); window.removeEventListener('resize', positionPopover); window.removeEventListener('scroll', positionPopover, true) })
</script>
