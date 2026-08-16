<template>
  <main class="capability-page">
    <div class="capability-shell">
      <header class="capability-header">
        <div><h1>能力中心</h1><p>集中管理助手、技能、工具授权和知识库</p></div>
      </header>

      <nav class="capability-tabs" aria-label="能力类型">
        <button v-for="item in sections" :key="item.id" type="button" :class="{ active: section === item.id }" @click="section = item.id">
          <component :is="item.icon" :size="17" /><span>{{ item.label }}</span><em>{{ item.count }}</em>
        </button>
      </nav>

      <PluginMarketPage v-if="section === 'skills'" embedded />

      <section v-else class="capability-content">
        <div v-if="error" class="capability-feedback" role="alert"><CircleAlert :size="16" />{{ error }}<button type="button" @click="load">重试</button></div>
        <div v-if="loading" class="capability-empty"><LoaderCircle class="plugin-spin" :size="22" />正在加载</div>

        <template v-else-if="section === 'assistants'">
          <div class="capability-toolbar"><label><Search :size="16" /><input v-model="query" placeholder="搜索助手" /></label></div>
          <div class="connector-section-title">全部助手</div>
          <div v-if="filteredAssistants.length" class="connector-grid capability-directory-grid">
            <article v-for="item in filteredAssistants" :key="item.id" class="connector-card capability-directory-item">
              <span class="connector-card__brand"><Bot :size="19" /></span>
              <div><header><strong>{{ item.name }}</strong><em>助手</em></header><p>{{ item.description || '由平台配置的专业 AI 助手' }}</p><small>{{ item.defaultModel || '跟随当前模型' }} · {{ item.tools?.length || 0 }} 个工具</small></div>
              <button type="button" :aria-label="`查看${item.name}`" @click="selectedAssistant = item"><span>查看</span><ChevronRight :size="15" /></button>
            </article>
          </div>
          <div v-else class="capability-empty"><Bot :size="28" /><strong>暂无可用助手</strong></div>
        </template>

        <template v-else-if="section === 'tools'">
          <div class="capability-toolbar"><label><Search :size="16" /><input v-model="query" placeholder="搜索工具或连接器" /></label><span><ShieldCheck :size="14" />授权信息仅保存在你的账户中</span></div>
          <div class="tool-sections" role="tablist" aria-label="工具类型">
            <button type="button" role="tab" :aria-selected="toolSection === 'connectors'" :class="{ active: toolSection === 'connectors' }" @click="toolSection = 'connectors'"><Link2 :size="16" />连接器<em>{{ connectorTools.length }}</em></button>
            <button type="button" role="tab" :aria-selected="toolSection === 'built-in'" :class="{ active: toolSection === 'built-in' }" @click="toolSection = 'built-in'"><Wrench :size="16" />内置工具<em>{{ builtInTools.length }}</em></button>
          </div>
          <div v-if="toolSection === 'connectors'" class="connector-categories" aria-label="连接器分类">
            <button v-for="category in connectorCategories" :key="category" type="button" :class="{ active: connectorCategory === category }" @click="connectorCategory = category">{{ category }}</button>
          </div>
          <div v-if="toolSection === 'connectors' && !query" class="connector-section-title">{{ connectorCategory === '全部' ? '特别推荐' : connectorCategory }}</div>
          <div v-if="filteredTools.length" class="connector-grid">
            <article v-for="item in filteredTools" :key="item.id" class="connector-card">
              <span class="connector-card__brand"><img v-if="connectorIconUrl(item)" :src="connectorIconUrl(item)" alt="" @error="markIconFailed(item)" /><template v-else>{{ connectorMark(item.name) }}</template></span>
              <div><header><strong>{{ item.name }}</strong><em v-if="item.kind === 'CONNECTOR'">连接器</em><em v-if="item.connection" class="connected-dot"><Check :size="11" />已连接</em></header><p>{{ item.description || '平台工具能力' }}</p><small v-if="item.connection">连接于 {{ formatConnectedAt(item.connection.connectedAt) }}</small><small v-else-if="item.kind === 'CONNECTOR' && !item.enabled">等待管理员完成接口配置</small><small v-else-if="item.kind === 'CONNECTOR'">由你授权账户后使用</small><small v-else>{{ item.requiresApproval ? '每次调用前需要你的确认' : '可直接用于任务和技能流程' }}</small></div>
              <button v-if="item.kind === 'CONNECTOR'" type="button" :class="{ connected: item.connection, unavailable: !item.enabled }" :aria-label="item.connection ? `管理${item.name}` : `连接${item.name}`" @click="openTool(item)"><Settings2 v-if="item.connection" :size="15" /><Plus v-else :size="16" /><span>{{ item.connection ? '管理' : '连接' }}</span></button>
              <button v-else type="button" :aria-label="`查看${item.name}`" @click="openTool(item)"><span>查看</span><ChevronRight :size="15" /></button>
            </article>
          </div>
          <div v-else class="capability-empty"><Link2 v-if="toolSection === 'connectors'" :size="28" /><Wrench v-else :size="28" /><strong>{{ toolSection === 'connectors' ? '暂无可授权连接器' : '暂无可用内置工具' }}</strong></div>
        </template>

        <template v-else>
          <div class="capability-toolbar"><label><Search :size="16" /><input v-model="query" placeholder="搜索知识库" /></label><button class="capability-primary" type="button" @click="knowledgeEditor = true"><Plus :size="16" />新建知识库</button></div>
          <div class="connector-section-title">我的知识库</div>
          <div v-if="filteredKnowledgeBases.length" class="connector-grid capability-directory-grid">
            <article v-for="item in filteredKnowledgeBases" :key="item.id" class="connector-card capability-directory-item">
              <span class="connector-card__brand"><Database :size="19" /></span>
              <div><header><strong>{{ item.name }}</strong><em>知识库</em></header><p>{{ item.description || '尚未填写知识库说明' }}</p><small>{{ item.documentCount }} 个文档 · {{ item.chunkCount }} 个内容片段</small></div>
              <button type="button" :aria-label="`查看${item.name}`" @click="openKnowledgeBase(item)"><span>查看</span><ChevronRight :size="15" /></button>
            </article>
          </div>
          <div v-else class="capability-empty"><Database :size="28" /><strong>还没有知识库</strong><p>创建后可绑定到助手和 Agent 任务。</p></div>
        </template>
      </section>
    </div>

    <Teleport to="body">
      <div v-if="selectedTool" class="plugin-dialog-layer" @mousedown.self="closeTool">
        <section class="connector-dialog connector-detail-dialog" role="dialog" aria-modal="true" :aria-label="`${selectedTool.name} 连接器详情`">
          <header>
            <span class="connector-card__brand connector-detail-logo"><img v-if="connectorIconUrl(selectedTool)" :src="connectorIconUrl(selectedTool)" alt="" @error="markIconFailed(selectedTool)" /><template v-else>{{ connectorMark(selectedTool.name) }}</template></span>
            <button type="button" aria-label="关闭" @click="closeTool"><X :size="19" /></button>
          </header>
          <div class="connector-detail-body">
            <div class="connector-detail-intro">
              <h2>{{ selectedTool.name }}</h2>
              <p>{{ selectedTool.description || '为 Agent、技能和办公任务提供平台能力。' }}</p>
            </div>
            <section class="connector-related">
              <div class="connector-section-heading"><h3>关联技能</h3><em>1</em></div>
              <article><span><Blocks :size="18" /></span><div><strong>{{ selectedTool.name }}</strong><p>在 Agent 和办公任务中使用 {{ selectedTool.name }} 完成资料处理与自动化操作。</p></div><ChevronRight :size="17" /></article>
            </section>
            <section class="connector-operations-panel">
              <h3>包含的操作</h3>
              <div v-if="selectedTool.connection || selectedTool.kind !== 'CONNECTOR'" class="connector-operation-list"><span v-for="operation in connectorOperations(selectedTool)" :key="operation"><Check :size="15" />{{ operation }}</span></div>
              <div v-else class="connector-operation-empty"><FolderOpen :size="34" /><span>连接后可查看操作详情</span></div>
            </section>
          </div>
          <footer>
            <button v-if="selectedTool.kind !== 'CONNECTOR'" type="button" class="primary" @click="closeTool">完成</button>
            <button v-else type="button" class="primary" @click="openConnectorAuth">{{ selectedTool.connection ? '管理连接' : '安装' }}</button>
          </footer>
        </section>
      </div>
    </Teleport>

    <Teleport to="body">
      <div v-if="selectedTool && connectorAuthOpen" class="plugin-dialog-layer connector-auth-layer" @mousedown.self="connectorAuthOpen = false">
        <form class="connector-dialog connector-auth-dialog" role="dialog" aria-modal="true" :aria-label="`连接 ${selectedTool.name}`" @submit.prevent="connectTool">
          <header class="connector-auth-header">
            <div>
              <h2>授权配置</h2>
              <p>进入 {{ selectedTool.name }} 的账户或开发者设置，创建 {{ primaryCredentialLabel(selectedTool) }}。<template v-if="selectedTool.documentationUrl">详情见<a :href="selectedTool.documentationUrl" target="_blank" rel="noreferrer">{{ selectedTool.name }} 开发者文档</a>。</template></p>
            </div>
            <button class="connector-auth-close" type="button" aria-label="关闭" @click="connectorAuthOpen = false"><X :size="19" /></button>
          </header>
          <div v-if="!selectedTool.enabled" class="connector-unavailable"><CircleAlert :size="18" /><div><strong>连接器尚未启用</strong><span>你可以先保存个人授权；管理员配置执行接口后即可使用。</span></div></div>
          <div v-if="selectedTool.connection" class="connector-connected"><Check :size="18" /><div><strong>{{ selectedTool.enabled ? '账户已连接' : '授权信息已保存' }}</strong><small v-for="(hint, key) in selectedTool.connection.credentialHints" :key="key">{{ credentialLabel(selectedTool, key) }}：{{ hint }}</small></div></div>
          <div v-else class="connector-auth-fields"><label v-for="field in selectedTool.credentialFields || []" :key="field.key"><span>{{ field.label }}</span><input v-model="credentialDraft[field.key]" :type="field.type === 'password' ? 'password' : 'text'" :placeholder="field.placeholder || `请输入${field.label}`" :required="field.required !== false" autocomplete="off" /></label></div>
          <footer>
            <button v-if="selectedTool.connection" class="danger" type="button" :disabled="saving" @click="disconnectTool">断开连接</button>
            <button v-else type="button" @click="connectorAuthOpen = false">取消</button>
            <button v-if="selectedTool.connection" class="primary connector-auth-primary" type="button" @click="connectorAuthOpen = false">完成</button>
            <button v-else class="primary connector-auth-primary" type="submit" :disabled="saving">{{ saving ? '保存中' : selectedTool.enabled ? '保存并连接' : '保存授权信息' }}</button>
          </footer>
        </form>
      </div>
    </Teleport>
    <Teleport to="body"><div v-if="knowledgeEditor" class="plugin-dialog-layer" @mousedown.self="knowledgeEditor = false"><form class="connector-dialog" @submit.prevent="createKnowledgeBase"><header><div><strong>新建知识库</strong><small>用于助手和任务检索专属资料</small></div><button type="button" aria-label="关闭" @click="knowledgeEditor = false"><X :size="18" /></button></header><label>名称<input v-model.trim="knowledgeDraft.name" required maxlength="100" /></label><label>说明<textarea v-model.trim="knowledgeDraft.description" rows="4" maxlength="2000" /></label><footer><button type="button" @click="knowledgeEditor = false">取消</button><button class="primary" type="submit" :disabled="saving">{{ saving ? '创建中' : '创建' }}</button></footer></form></div></Teleport>
    <Teleport to="body">
      <div v-if="selectedKnowledge" class="plugin-dialog-layer" @mousedown.self="selectedKnowledge = null">
        <form class="connector-dialog knowledge-detail-dialog" role="dialog" aria-modal="true" :aria-label="`管理知识库 ${selectedKnowledge.name}`" @submit.prevent="saveKnowledgeBase">
          <header><div><strong>知识库设置</strong><small>维护说明和可检索资料</small></div><button type="button" aria-label="关闭知识库设置" @click="selectedKnowledge = null"><X :size="18" /></button></header>
          <div class="knowledge-detail-stats"><span><strong>{{ selectedKnowledge.documentCount }}</strong><small>文档</small></span><span><strong>{{ selectedKnowledge.chunkCount }}</strong><small>内容片段</small></span><span><strong>{{ selectedKnowledge._count?.assistants || 0 }}</strong><small>已绑定助手</small></span></div>
          <label>名称<input v-model.trim="knowledgeDetailDraft.name" required maxlength="100" /></label>
          <label>说明<textarea v-model.trim="knowledgeDetailDraft.description" rows="3" maxlength="2000" /></label>
          <section class="knowledge-assets-section">
            <div class="knowledge-assets-heading"><div><strong>检索资料</strong><small>当前支持文本与 JSON 文件</small></div><button v-if="!knowledgeAssetOptions.length" type="button" @click="goToAssets">前往文件库</button></div>
            <div v-if="selectedKnowledge.assets?.length" class="knowledge-assets-list">
              <article v-for="link in selectedKnowledge.assets" :key="link.assetId"><FileText :size="17" /><div><strong>{{ link.asset.name }}</strong><small>{{ link.asset.mimeType }} · {{ link.chunkCount }} 个片段</small></div><button type="button" :aria-label="`从知识库移除${link.asset.name}`" :disabled="saving" @click="detachKnowledgeAsset(link.assetId)"><X :size="15" /></button></article>
            </div>
            <div v-else class="knowledge-assets-empty">尚未绑定资料</div>
            <div v-if="knowledgeAssetOptions.length" class="knowledge-asset-picker"><select v-model="selectedKnowledgeAssetId" aria-label="选择知识库文件"><option value="">选择文件库中的资料</option><option v-for="asset in knowledgeAssetOptions" :key="asset.id" :value="asset.id">{{ asset.name }}</option></select><button type="button" :disabled="saving || !selectedKnowledgeAssetId" @click="attachKnowledgeAsset"><Plus :size="15" />添加</button></div>
          </section>
          <footer class="knowledge-detail-footer"><button class="danger" type="button" :disabled="saving" @click="deleteKnowledgeBase">删除知识库</button><span></span><button type="button" @click="selectedKnowledge = null">关闭</button><button class="primary" type="submit" :disabled="saving || !knowledgeDetailDraft.name">{{ saving ? '保存中' : '保存修改' }}</button></footer>
        </form>
      </div>
    </Teleport>
    <Teleport to="body"><div v-if="selectedAssistant" class="plugin-dialog-layer" @mousedown.self="selectedAssistant = null"><section class="connector-dialog"><header><span class="connector-card__brand"><Bot :size="20" /></span><div><strong>{{ selectedAssistant.name }}</strong><small>专业 AI 助手</small></div><button type="button" aria-label="关闭" @click="selectedAssistant = null"><X :size="18" /></button></header><p>{{ selectedAssistant.description || '由平台配置的专业 AI 助手' }}</p><div class="assistant-detail"><span>默认模型<strong>{{ selectedAssistant.defaultModel || '跟随当前模型' }}</strong></span><span>可用工具<strong>{{ selectedAssistant.tools?.length || 0 }} 个</strong></span></div><footer><button type="button" @click="selectedAssistant = null">关闭</button><button class="primary" type="button" @click="useAssistant(selectedAssistant)">开始对话</button></footer></section></div></Teleport>
  </main>
</template>

<script setup lang="ts">
import { computed, markRaw, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Bot, Blocks, Check, ChevronRight, CircleAlert, Database, FileText, FolderOpen, Link2, LoaderCircle, Plus, Search, Settings2, ShieldCheck, Wrench, X } from 'lucide-vue-next'
import PluginMarketPage from './PluginMarketPage.vue'
import { api } from '../services/api'
import { useAuthStore } from '../stores/auth'
import type { AssistantProfile, CapabilityTool, KnowledgeBaseSummary, Plugin } from '../types'

type Section = 'assistants' | 'skills' | 'tools' | 'knowledge'
const section = ref<Section>('skills')
const auth = useAuthStore(); const router = useRouter()
const query = ref('')
const toolSection = ref<'connectors' | 'built-in'>('connectors')
const connectorCategory = ref('全部')
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const assistants = ref<AssistantProfile[]>([])
const tools = ref<CapabilityTool[]>([])
const knowledgeBases = ref<KnowledgeBaseSummary[]>([])
const skillCount = ref(0)
const selectedTool = ref<CapabilityTool | null>(null)
const connectorAuthOpen = ref(false)
const failedConnectorIcons = reactive(new Set<string>())
const selectedAssistant = ref<AssistantProfile | null>(null)
const credentialDraft = reactive<Record<string, string>>({})
const knowledgeEditor = ref(false)
const knowledgeDraft = reactive({ name: '', description: '' })
const selectedKnowledge = ref<KnowledgeBaseSummary | null>(null)
const knowledgeDetailDraft = reactive({ name: '', description: '' })
const selectedKnowledgeAssetId = ref('')
const knowledgeAssets = ref<Array<{ id: string; name: string; mimeType: string }>>([])
const sections = computed(() => [
  { id: 'assistants' as const, label: '助手', icon: markRaw(Bot), count: assistants.value.length },
  { id: 'skills' as const, label: '技能', icon: markRaw(Blocks), count: skillCount.value },
  { id: 'tools' as const, label: '工具', icon: markRaw(Wrench), count: tools.value.length },
  { id: 'knowledge' as const, label: '知识库', icon: markRaw(Database), count: knowledgeBases.value.length },
])
const matches = (name: string, description = '') => `${name} ${description}`.toLowerCase().includes(query.value.trim().toLowerCase())
const filteredAssistants = computed(() => assistants.value.filter((item) => matches(item.name, item.description)))
const connectorTools = computed(() => tools.value.filter((item) => item.kind === 'CONNECTOR'))
const builtInTools = computed(() => tools.value.filter((item) => item.kind !== 'CONNECTOR'))
const connectorCategoryMap: Record<string, string> = { stripe: '电商营销', hubspot: '电商营销', amap: '出行生活', 'tencent-map': '出行生活', gamma: '内容创作', github: '开发工具', gitee: '开发工具', supabase: '开发工具', neon: '开发工具', wolfram: '搜索与数据', tavily: '搜索与数据', bocha: '搜索与数据' }
const connectorCategories = ['全部', '电商营销', '出行生活', '内容创作', '开发工具', '搜索与数据']
const filteredTools = computed(() => (toolSection.value === 'connectors' ? connectorTools.value.filter((item) => connectorCategory.value === '全部' || connectorCategoryMap[item.key] === connectorCategory.value) : builtInTools.value).filter((item) => matches(item.name, item.description)))
const filteredKnowledgeBases = computed(() => knowledgeBases.value.filter((item) => matches(item.name, item.description)))
const knowledgeAssetOptions = computed(() => {
  const linked = new Set((selectedKnowledge.value?.assets || []).map((item) => item.assetId))
  return knowledgeAssets.value.filter((item) => !linked.has(item.id) && (item.mimeType.startsWith('text/') || item.mimeType === 'application/json'))
})

async function load() {
  loading.value = true; error.value = ''
  try { const [assistantRows, toolRows, knowledgeRows, skillRows, assetRows] = await Promise.all([api<AssistantProfile[]>('/assistants'), api<CapabilityTool[]>('/assistants/tools'), api<KnowledgeBaseSummary[]>('/knowledge-bases'), api<Plugin[]>('/plugins/market'), api<Array<{ id: string; name: string; mimeType: string }>>('/assets')]); assistants.value = assistantRows; tools.value = toolRows; knowledgeBases.value = knowledgeRows; skillCount.value = skillRows.length; knowledgeAssets.value = assetRows; if (selectedKnowledge.value) selectedKnowledge.value = knowledgeRows.find((item) => item.id === selectedKnowledge.value?.id) || null }
  catch (reason) { error.value = reason instanceof Error ? reason.message : '能力中心加载失败' }
  finally { loading.value = false }
}
function openTool(item: CapabilityTool) { Object.keys(credentialDraft).forEach((key) => delete credentialDraft[key]); connectorAuthOpen.value = false; selectedTool.value = item }
function closeTool() { connectorAuthOpen.value = false; selectedTool.value = null }
function openConnectorAuth() { connectorAuthOpen.value = true }
function connectorMark(name: string) { return Array.from(name.trim()).slice(0, 2).join('').toUpperCase() || 'AI' }
function connectorIconUrl(tool: CapabilityTool) { return !failedConnectorIcons.has(tool.key) && tool.icon && /^(https?:\/\/|data:image\/|\/)/.test(tool.icon) ? tool.icon : '' }
function markIconFailed(tool: CapabilityTool) { failedConnectorIcons.add(tool.key) }
function credentialLabel(tool: CapabilityTool, key: string) { return tool.credentialFields?.find((field) => field.key === key)?.label || key }
function primaryCredentialLabel(tool: CapabilityTool) { return tool.credentialFields?.[0]?.label || 'API Key' }
function connectorOperations(tool: CapabilityTool) {
  const operations: Record<string, string[]> = {
    stripe: ['查看账户余额', '读取可用与待结算金额', '按币种汇总资金'], hubspot: ['搜索 CRM 联系人', '读取客户属性', '辅助整理客户资料'], amap: ['地点关键词搜索', '按城市筛选地点', '返回地址和坐标'], 'tencent-map': ['地点与周边搜索', '按区域检索位置', '返回地址和坐标'], gamma: ['创建演示文稿', '生成视觉文档', '获取交付链接'], github: ['搜索 Issue 与 PR', '检索代码协作记录', '获取仓库问题摘要'], gitee: ['搜索开源仓库', '读取仓库基础资料', '辅助国内代码调研'], supabase: ['列出项目', '读取项目基础状态', '辅助整理后端资源'], neon: ['列出 Postgres 项目', '读取区域和分支信息', '辅助检查数据库资源'], wolfram: ['数学与科学计算', '单位和事实查询', '返回精确短答案'], tavily: ['搜索公开网页', '返回结构化来源', '生成检索摘要'], bocha: ['搜索网页和新闻', '返回中文互联网来源', '辅助事实核验'],
  }
  return operations[tool.key] || ['按授权范围读取数据', '在 Agent 任务中调用', '调用前执行权限检查']
}
function useAssistant(item: AssistantProfile) { selectedAssistant.value = null; void router.push({ path: '/chat', query: { assistant: item.id } }) }
function formatConnectedAt(value: string) { return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit' }).format(new Date(value)) }
async function connectTool() {
  if (!selectedTool.value) return
  saving.value = true; error.value = ''
  try { await api(`/assistants/tools/${selectedTool.value.id}/credentials`, { method: 'POST', body: JSON.stringify({ credentials: credentialDraft }) }); closeTool(); await load() }
  catch (reason) { error.value = reason instanceof Error ? reason.message : '连接器授权保存失败' }
  finally { saving.value = false }
}
async function disconnectTool() {
  if (!selectedTool.value || !window.confirm(`断开“${selectedTool.value.name}”连接？`)) return
  saving.value = true; error.value = ''
  try { await api(`/assistants/tools/${selectedTool.value.id}/credentials`, { method: 'DELETE' }); closeTool(); await load() }
  catch (reason) { error.value = reason instanceof Error ? reason.message : '断开连接失败' }
  finally { saving.value = false }
}
async function createKnowledgeBase() {
  saving.value = true; error.value = ''
  try { await api('/knowledge-bases', { method: 'POST', body: JSON.stringify(knowledgeDraft) }); knowledgeDraft.name = ''; knowledgeDraft.description = ''; knowledgeEditor.value = false; await load() }
  catch (reason) { error.value = reason instanceof Error ? reason.message : '知识库创建失败' }
  finally { saving.value = false }
}
function openKnowledgeBase(item: KnowledgeBaseSummary) { selectedKnowledge.value = item; knowledgeDetailDraft.name = item.name; knowledgeDetailDraft.description = item.description || ''; selectedKnowledgeAssetId.value = '' }
async function saveKnowledgeBase() {
  if (!selectedKnowledge.value) return
  saving.value = true; error.value = ''
  try { await api(`/knowledge-bases/${selectedKnowledge.value.id}`, { method: 'PATCH', body: JSON.stringify(knowledgeDetailDraft) }); await load(); if (selectedKnowledge.value) openKnowledgeBase(selectedKnowledge.value) }
  catch (reason) { error.value = reason instanceof Error ? reason.message : '知识库保存失败' }
  finally { saving.value = false }
}
async function attachKnowledgeAsset() {
  if (!selectedKnowledge.value || !selectedKnowledgeAssetId.value) return
  saving.value = true; error.value = ''
  try { await api(`/knowledge-bases/${selectedKnowledge.value.id}/assets`, { method: 'POST', body: JSON.stringify({ assetId: selectedKnowledgeAssetId.value }) }); selectedKnowledgeAssetId.value = ''; await load() }
  catch (reason) { error.value = reason instanceof Error ? reason.message : '知识库文件添加失败' }
  finally { saving.value = false }
}
async function detachKnowledgeAsset(assetId: string) {
  if (!selectedKnowledge.value) return
  saving.value = true; error.value = ''
  try { await api(`/knowledge-bases/${selectedKnowledge.value.id}/assets/${assetId}`, { method: 'DELETE' }); await load() }
  catch (reason) { error.value = reason instanceof Error ? reason.message : '知识库文件移除失败' }
  finally { saving.value = false }
}
async function deleteKnowledgeBase() {
  if (!selectedKnowledge.value || !window.confirm(`删除知识库“${selectedKnowledge.value.name}”？`)) return
  saving.value = true; error.value = ''
  try { await api(`/knowledge-bases/${selectedKnowledge.value.id}`, { method: 'DELETE' }); selectedKnowledge.value = null; await load() }
  catch (reason) { error.value = reason instanceof Error ? reason.message : '知识库删除失败' }
  finally { saving.value = false }
}
function goToAssets() { selectedKnowledge.value = null; void router.push('/assets') }
watch(section, () => { query.value = '' })
onMounted(() => { if (!auth.isAuthenticated) void router.replace('/login?redirect=/capabilities'); else void load() })
</script>
