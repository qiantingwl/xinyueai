<template>
  <div class="plugin-selector">
    <button ref="trigger" type="button" :class="{ 'is-open': open }" :aria-expanded="open" aria-label="选择能力" @click="toggle"><Blocks :size="15" /><span>{{ label }}</span><ChevronDown class="plugin-selector__chevron" :size="13" /></button>
    <Teleport to="body"><div v-if="open" ref="popover" class="plugin-selector__popover plugin-selector__popover--floating capability-selector-popover" :style="popoverStyle">
      <header><span><strong>选择能力</strong><small>为本次对话选择助手和技能</small></span><RouterLink to="/capabilities" @click="close">管理</RouterLink></header>
      <nav><button type="button" :class="{ active: tab === 'assistant' }" @click="tab = 'assistant'">助手</button><button type="button" :class="{ active: tab === 'skill' }" @click="tab = 'skill'">技能</button></nav>
      <template v-if="tab === 'assistant'"><button type="button" :class="{ 'is-active': !assistantId }" @click="selectAssistant('')"><span><strong>默认助手</strong><small>使用当前模型直接对话</small></span><Check v-if="!assistantId" :size="15" /></button><button v-for="item in assistants" :key="item.id" type="button" :class="{ 'is-active': assistantId === item.id }" @click="selectAssistant(item.id)"><span><strong>{{ item.name }}</strong><small>{{ item.description || item.defaultModel || '专业助手' }}</small></span><Check v-if="assistantId === item.id" :size="15" /></button></template>
      <template v-else><button type="button" :class="{ 'is-active': !skillId }" @click="selectSkill('')"><span><strong>不使用技能</strong><small>按助手和模型直接回答</small></span><Check v-if="!skillId" :size="15" /></button><button v-for="item in skills" :key="item.id" type="button" :class="{ 'is-active': skillId === item.id }" @click="selectSkill(item.id)"><span><strong>{{ item.name }}<em v-if="item.owned">私有</em></strong><small>{{ item.description || '已安装技能' }}</small></span><Check v-if="skillId === item.id" :size="15" /></button></template>
      <p v-if="loading">正在读取能力</p>
    </div></Teleport>
  </div>
</template>
<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { Blocks, Check, ChevronDown } from 'lucide-vue-next'
import { api } from '../services/api'
import type { AssistantProfile, Plugin, PluginCapability } from '../types'
const props = withDefaults(defineProps<{ assistantId?: string; skillId?: string; capability?: PluginCapability }>(), { assistantId: '', skillId: '', capability: 'CHAT' })
const emit = defineEmits<{ 'update:assistantId': [value: string]; 'update:skillId': [value: string] }>()
const open = ref(false); const tab = ref<'assistant' | 'skill'>('assistant'); const loading = ref(false); const assistants = ref<AssistantProfile[]>([]); const skills = ref<Plugin[]>([])
const trigger = ref<HTMLButtonElement | null>(null); const popover = ref<HTMLElement | null>(null); const popoverStyle = ref<Record<string, string>>({ visibility: 'hidden' })
const label = computed(() => skills.value.find((item) => item.id === props.skillId)?.name || assistants.value.find((item) => item.id === props.assistantId)?.name || '能力')
async function load() { loading.value = true; try { [assistants.value, skills.value] = await Promise.all([api<AssistantProfile[]>('/assistants'), api<Plugin[]>(`/plugins/available?capability=${props.capability}`)]) } finally { loading.value = false; if (open.value) void nextTick(position) } }
function selectAssistant(id: string) { emit('update:assistantId', id); close() } function selectSkill(id: string) { emit('update:skillId', id); close() }
function toggle() { if (open.value) return close(); document.dispatchEvent(new Event('xinyue:close-popovers')); open.value = true; void load(); void nextTick(position) }
function position() { if (!trigger.value || !popover.value) return; const anchor = trigger.value.getBoundingClientRect(); const menu = popover.value.getBoundingClientRect(); const left = Math.min(window.innerWidth - menu.width - 12, Math.max(12, anchor.left)); const top = window.innerHeight - anchor.bottom >= Math.min(menu.height, 420) ? anchor.bottom + 8 : Math.max(12, anchor.top - menu.height - 8); popoverStyle.value = { left: `${left}px`, top: `${top}px`, visibility: 'visible' } }
function close() { open.value = false; popoverStyle.value = { visibility: 'hidden' } } function outside(event: PointerEvent) { const target = event.target as Node; if (!trigger.value?.contains(target) && !popover.value?.contains(target)) close() }
onMounted(() => { void load(); document.addEventListener('xinyue:close-popovers', close); document.addEventListener('pointerdown', outside); window.addEventListener('resize', position); window.addEventListener('scroll', position, true) })
onUnmounted(() => { document.removeEventListener('xinyue:close-popovers', close); document.removeEventListener('pointerdown', outside); window.removeEventListener('resize', position); window.removeEventListener('scroll', position, true) })
</script>
