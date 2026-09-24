<template>
  <div class="settings-credential-layer" @mousedown.self="emit('close')"><form class="settings-credential-editor settings-private-model-editor" @submit.prevent="savePrivateModel"><header><div><h3>{{ editor.id ? '编辑私有模型' : '添加私有模型' }}</h3><p>模型只对当前账户可见，不会失败后静默使用平台付费线路。</p></div><button type="button" aria-label="关闭" @click="emit('close')"><X :size="18" /></button></header><label><span>显示名称</span><input v-model.trim="editor.displayName" required maxlength="100" /></label><div class="settings-credential-routing"><label><span>能力</span><select v-model="editor.capability"><option value="CHAT">对话</option><option value="IMAGE">图片</option><option value="VIDEO">视频</option><option value="COMMERCE">电商</option></select></label><label><span>路由策略</span><select v-model="editor.routingStrategy"><option value="PRIORITY">优先级故障切换</option><option value="WEIGHTED">按权重分流</option><option value="ROUND_ROBIN">轮询</option></select></label></div><label><span>接口协议</span><select v-model="editor.apiProtocol"><option value="openai">OpenAI Compatible</option><option value="anthropic">Anthropic Messages</option><option value="gemini">Gemini GenerateContent</option></select></label><section class="settings-private-routes"><header><strong>密钥路由</strong><button type="button" @click="addPrivateModelRoute"><CirclePlus :size="14" />增加</button></header><article v-for="(route, index) in editor.routes" :key="index"><select v-model="route.credentialId" required><option value="" disabled>选择密钥</option><option v-for="credential in apiCredentials" :key="credential.id" :value="credential.id">{{ credential.name }}</option></select><input v-model.trim="route.upstreamModel" required list="discovered-model-options" placeholder="上游模型 ID" /><input v-model.number="route.priority" type="number" title="优先级" placeholder="优先级" /><input v-model.number="route.weight" type="number" min="1" title="权重" placeholder="权重" /><button type="button" aria-label="删除路由" @click="editor.routes.splice(index, 1)"><Trash2 :size="15" /></button></article><datalist id="discovered-model-options"><option v-for="name in discoveredCredentialModels" :key="name" :value="name" /></datalist></section><div class="settings-credential-toggles"><label><input v-model="editor.enabled" type="checkbox" />启用</label><label><input v-model="editor.isDefault" type="checkbox" />设为该能力默认模型</label></div><p v-if="privateModelError" class="settings-feedback is-error">{{ privateModelError }}</p><footer><button type="button" @click="emit('close')">取消</button><button type="submit" :disabled="privateModelSaving || !editor.routes.length">{{ privateModelSaving ? '保存中' : '保存模型' }}</button></footer></form></div>
</template>

<script setup lang="ts">
import { CirclePlus, Trash2, X } from 'lucide-vue-next'
import { useEscapeClose } from '../../composables/useEscapeClose'
import type { ApiCredential, PrivateModelEditor } from './types'

const props = defineProps<{
  editor: PrivateModelEditor
  apiCredentials: ApiCredential[]
  discoveredCredentialModels: string[]
  privateModelSaving: boolean
  privateModelError: string
  savePrivateModel: () => Promise<void>
}>()

const emit = defineEmits<{
  close: []
}>()

useEscapeClose(() => emit('close'))

function addPrivateModelRoute() {
  props.editor.routes.push({ credentialId: props.apiCredentials[0]?.id || '', upstreamModel: '', enabled: true, priority: 0, weight: 100 })
}
</script>
