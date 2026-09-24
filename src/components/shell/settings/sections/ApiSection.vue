<template>
  <h2 id="settings-api">API 与模型</h2>
  <section v-if="!publicSettings.userByokEnabled" class="settings-empty-section"><h3>用户 API 密钥未开放</h3><p>当前工作区统一使用管理员配置的模型渠道。</p></section>
  <template v-else>
    <section class="settings-routing-overview">
      <header><div><strong>模型路由</strong><small>已导入的个人模型只走你的密钥；平台模型失败时可回退到个人密钥。未导入时也可使用「我的 API 密钥」直连。</small></div><span>{{ availableModels.length }} 个模型</span></header>
      <div class="settings-routing-grid">
        <article><span><ServerCog :size="18" /></span><div><strong>平台模型渠道</strong><small>{{ availableModels.length ? `${availableModels.length} 个可用模型，支持自动路由与故障切换` : '管理员暂未发布可用模型' }}</small></div><em :class="{ inactive: !availableModels.length }">{{ availableModels.length ? '可用' : '待配置' }}</em></article>
        <article><span><KeyRound :size="18" /></span><div><strong>个人 API 密钥</strong><small>{{ apiCredentials.length ? `${apiCredentials.filter((item) => item.enabled).length} 个已启用，任务可按策略使用` : '添加 NewAPI、Sub2API 或 OpenAI 兼容密钥' }}</small></div><em :class="{ inactive: !apiCredentials.some((item) => item.enabled) }">{{ apiCredentials.some((item) => item.enabled) ? '已接入' : '未接入' }}</em></article>
      </div>
      <div v-if="availableModels.length" class="settings-model-tags"><span v-for="item in availableModels.slice(0, 8)" :key="item.key">{{ item.displayName }}<small>{{ modelCapabilityLabel[item.capability] || item.capability }}</small></span><em v-if="availableModels.length > 8">+{{ availableModels.length - 8 }}</em></div>
    </section>
    <div class="settings-action-row"><span><strong>我的上游密钥</strong><small>密钥加密保存，可分别启用、停用并设置默认项。</small></span><button type="button" @click="openCredentialEditor()"><CirclePlus :size="15" />添加密钥</button></div>
    <section class="settings-api-list"><article v-for="item in apiCredentials" :key="item.id"><div><strong>{{ item.name }}<em v-if="item.isDefault">默认</em></strong><small>{{ providerTypeLabel[item.providerType] }} · {{ item.apiKeyHint }} · {{ item.totalRequests || 0 }} 次调用<span v-if="item.expiresAt"> · {{ formatServerDate(item.expiresAt) }} 到期</span></small><p>{{ item.baseUrl }}</p></div><span class="settings-api-state" :class="{ disabled: !item.enabled || item.lastHealthStatus === 'unhealthy' }">{{ item.lastHealthStatus === 'healthy' ? '连接正常' : item.lastHealthStatus === 'unhealthy' ? '连接异常' : item.enabled ? '待检测' : '已停用' }}</span><footer><button type="button" :disabled="credentialCheckingId === item.id" @click="discoverCredential(item)">{{ credentialCheckingId === item.id ? '检测中' : '检测并导入模型' }}</button><button type="button" @click="openCredentialEditor(item)">编辑/轮换</button><button type="button" class="danger-button" @click="deleteCredential(item)">删除</button></footer></article><p v-if="!apiCredentials.length">尚未添加个人 API 密钥。保存后可自动识别 Sub2API / NewAPI 模型；即使目录导入失败，也可使用「我的 API 密钥」直连上游。</p></section>
    <div class="settings-action-row"><span><strong>我的模型</strong><small>一个模型可以绑定多个密钥，并按优先级、权重或轮询策略切换。</small></span><button type="button" :disabled="!apiCredentials.length" @click="openPrivateModelEditor()"><CirclePlus :size="15" />添加模型</button></div>
    <section class="settings-api-list settings-private-models"><article v-for="item in privateModels" :key="item.id"><div><strong>{{ item.displayName }}<em v-if="item.isDefault">默认</em></strong><small>{{ modelCapabilityLabel[item.capability] }} · {{ routingStrategyLabel[item.routingStrategy] || item.routingStrategy }}</small><p>{{ item.routes.length }} 条密钥路由 · {{ item.routes.filter((route) => route.enabled && route.credential.enabled).length }} 条已启用</p></div><span class="settings-api-state" :class="{ disabled: !item.enabled || !item.routes.some((route) => route.enabled && route.credential.enabled) }">{{ item.enabled ? '已启用' : '已停用' }}</span><footer><button type="button" @click="openPrivateModelEditor(item)">编辑路由</button><button type="button" class="danger-button" @click="deletePrivateModel(item)">删除</button></footer></article><p v-if="!privateModels.length">尚未配置私有模型。检测密钥后可导入上游模型；未导入时仍可选择「我的 API 密钥」直连。</p></section>
  </template>
</template>

<script setup lang="ts">
import { CirclePlus, KeyRound, ServerCog } from 'lucide-vue-next'
import { formatServerDate } from '../../format'
import { modelCapabilityLabel, providerTypeLabel, routingStrategyLabel } from '../../labels'
import type { ApiCredential, AvailableModel, PrivateModel, PublicSettings } from '../../types'

defineProps<{
  publicSettings: PublicSettings
  availableModels: AvailableModel[]
  apiCredentials: ApiCredential[]
  credentialCheckingId: string
  privateModels: PrivateModel[]
  openCredentialEditor: (item?: ApiCredential) => void
  discoverCredential: (item: ApiCredential) => Promise<void>
  deleteCredential: (item: ApiCredential) => Promise<void>
  openPrivateModelEditor: (item?: PrivateModel, credentialId?: string, upstreamModel?: string) => void
  deletePrivateModel: (item: PrivateModel) => Promise<void>
}>()
</script>
