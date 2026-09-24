<template>
  <div class="settings-credential-layer" @mousedown.self="emit('close')"><form class="settings-credential-editor" @submit.prevent="saveCredential"><header><div><h3>{{ editor.id ? '编辑 API 密钥' : '添加 API 密钥' }}</h3><p>密钥会加密保存在服务器，页面只显示末尾四位。</p></div><button type="button" aria-label="关闭" @click="emit('close')"><X :size="18" /></button></header><label><span>渠道模板</span><select v-model="editor.templateId" @change="applyCredentialTemplate"><option value="">自定义兼容渠道</option><option v-for="item in providerTemplates" :key="item.id" :value="item.id">{{ item.name }}</option></select></label><label><span>名称</span><input v-model.trim="editor.name" required maxlength="80" placeholder="我的 NewAPI" /></label><label><span>服务类型</span><select v-model="editor.providerType"><option value="NEW_API">NewAPI</option><option value="SUB2API">Sub2API</option><option value="OPENAI">OpenAI 官方</option><option value="OPENAI_COMPATIBLE">其他 OpenAI 兼容</option></select></label><label><span>API Base URL</span><input v-model.trim="editor.baseUrl" required type="url" placeholder="https://api.example.com/v1" /></label><label><span>API 密钥</span><input v-model.trim="editor.apiKey" :required="!editor.id" type="password" autocomplete="new-password" :placeholder="editor.id ? `留空保留 ${editor.apiKeyHint}` : 'sk-...'" /></label><label><span>认证方式</span><select v-model="editor.authType"><option value="BEARER">Authorization Bearer</option><option value="X_API_KEY">x-api-key</option><option value="BOTH">同时发送</option></select></label><div class="settings-credential-routing"><label><span>优先级</span><input v-model.number="editor.priority" type="number" min="-10000" max="10000" /></label><label><span>权重</span><input v-model.number="editor.weight" type="number" min="1" max="10000" /></label></div><div class="settings-credential-toggles"><label><input v-model="editor.enabled" type="checkbox" />启用</label><label><input v-model="editor.isDefault" type="checkbox" />设为默认密钥</label><label><input v-model="editor.autoImport" type="checkbox" />保存后自动识别并导入全部可用模型</label></div><p v-if="credentialError" class="settings-feedback is-error">{{ credentialError }}</p><footer><button type="button" @click="emit('close')">取消</button><button type="submit" :disabled="credentialSaving">{{ credentialSaving ? '保存中' : '保存' }}</button></footer></form></div>
</template>

<script setup lang="ts">
import { X } from 'lucide-vue-next'
import { useEscapeClose } from '../../composables/useEscapeClose'
import type { CredentialEditor, ProviderTemplate } from './types'

const props = defineProps<{
  editor: CredentialEditor
  providerTemplates: ProviderTemplate[]
  credentialSaving: boolean
  credentialError: string
  saveCredential: () => Promise<void>
}>()

const emit = defineEmits<{
  close: []
}>()

useEscapeClose(() => emit('close'))

function applyCredentialTemplate() {
  if (!props.editor.templateId) return
  const template = props.providerTemplates.find((item) => item.id === props.editor.templateId)
  if (!template) return
  props.editor.providerType = template.type
  props.editor.authType = template.authType
  if (template.baseUrl) props.editor.baseUrl = template.baseUrl
  if (!props.editor.name) props.editor.name = template.name
}
</script>
