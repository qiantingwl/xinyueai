<template>
  <main class="capability-page">
    <div class="capability-shell">
      <header class="capability-header">
        <div><h1>能力中心</h1><p>集中管理助手、技能和知识库；工具权限由助手配置管理</p></div>
      </header>

      <div class="capability-chrome">
        <nav v-if="visibleSections.length > 1" class="capability-tabs" aria-label="能力类型">
          <button v-for="item in visibleSections" :key="item.id" type="button" :class="{ active: section === item.id }" @click="selectSection(item.id)">
            <span>{{ item.label }}</span><em>{{ item.count }}</em>
          </button>
        </nav>
        <div class="capability-chrome-tools">
          <label class="capability-chrome-search"><Search :size="15" /><input v-model="query" :placeholder="searchPlaceholder" /></label>
          <div v-if="section === 'skills'" class="plugin-header-actions">
            <button type="button" @click="importSkill"><Upload :size="16" />导入 Skill</button>
            <button class="plugin-primary-action" type="button" @click="createSkill"><Plus :size="16" />创建技能</button>
          </div>
          <button v-else-if="section === 'knowledge'" class="plugin-primary-action" type="button" @click="knowledgeEditor = true"><Plus :size="16" />新建知识库</button>
        </div>
      </div>

      <PluginMarketPage ref="marketPage" v-show="section === 'skills'" v-model:query="query" embedded />

      <section v-if="section !== 'skills'" class="capability-content">
        <div v-if="error" class="capability-feedback" role="alert"><CircleAlert :size="16" />{{ error }}<button type="button" @click="load">重试</button></div>
        <div v-if="loading" class="capability-empty"><LoaderCircle class="plugin-spin" :size="22" />正在加载</div>

        <template v-else-if="section === 'assistants'">
          <div class="capability-section-title">全部助手</div>
          <div v-if="filteredAssistants.length" class="capability-grid capability-directory-grid">
            <article v-for="item in filteredAssistants" :key="item.id" class="capability-card capability-directory-item">
              <div><header><strong>{{ item.name }}</strong><em>助手</em></header><p>{{ item.description || '由平台配置的专业 AI 助手' }}</p><small>{{ assistantMeta(item) }}</small></div>
              <button type="button" :aria-label="`查看${item.name}`" @click="selectedAssistant = item"><span>查看</span><ChevronRight :size="15" /></button>
            </article>
          </div>
          <EmptyState v-else class="capability-empty" :icon="Bot" title="暂无可用助手" description="管理员配置助手后，会显示在这里。" />
        </template>

        <template v-else>
          <div class="capability-section-title">我的知识库</div>
          <div v-if="filteredKnowledgeBases.length" class="capability-grid capability-directory-grid">
            <article v-for="item in filteredKnowledgeBases" :key="item.id" class="capability-card capability-directory-item">
              <div><header><strong>{{ item.name }}</strong><em>知识库</em></header><p>{{ item.description || '尚未填写知识库说明' }}</p><small>{{ item.documentCount }} 个文档 · {{ item.chunkCount }} 个内容片段</small></div>
              <button type="button" :aria-label="`查看${item.name}`" @click="openKnowledgeBase(item)"><span>查看</span><ChevronRight :size="15" /></button>
            </article>
          </div>
          <EmptyState v-else class="capability-empty" :icon="Database" title="还没有知识库" description="创建后可绑定到助手和 Agent 任务。">
            <button class="capability-primary" type="button" @click="knowledgeEditor = true"><Plus :size="16" />新建知识库</button>
          </EmptyState>
        </template>
      </section>
    </div>

    <Teleport to="body"><div v-if="knowledgeEditor" class="plugin-dialog-layer" @mousedown.self="knowledgeEditor = false"><form class="capability-dialog connector-dialog" @submit.prevent="createKnowledgeBase"><header><div><strong>新建知识库</strong><small>用于助手和任务检索专属资料</small></div><button type="button" aria-label="关闭" @click="knowledgeEditor = false"><X :size="18" /></button></header><div class="knowledge-template-picker" role="group" aria-label="知识库模板"><span>从模板开始</span><div><button v-for="item in knowledgeTemplates" :key="item.name" type="button" :class="{ active: knowledgeDraft.name === item.name }" @click="applyKnowledgeTemplate(item)">{{ item.name }}</button></div></div><label>名称<input v-model.trim="knowledgeDraft.name" required maxlength="100" /></label><label>说明<textarea v-model.trim="knowledgeDraft.description" rows="4" maxlength="2000" /></label><footer><button type="button" @click="knowledgeEditor = false">取消</button><button class="primary" type="submit" :disabled="saving">{{ saving ? '创建中' : '创建' }}</button></footer></form></div></Teleport>
    <Teleport to="body">
      <div v-if="selectedKnowledge" class="plugin-dialog-layer" @mousedown.self="selectedKnowledge = null">
        <form class="capability-dialog knowledge-detail-dialog" role="dialog" aria-modal="true" :aria-label="`管理知识库 ${selectedKnowledge.name}`" @submit.prevent="saveKnowledgeBase">
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
    <Teleport to="body"><div v-if="selectedAssistant" class="plugin-dialog-layer" @mousedown.self="selectedAssistant = null"><section class="capability-dialog"><header><div><strong>{{ selectedAssistant.name }}</strong><small>专业 AI 助手</small></div><button type="button" aria-label="关闭" @click="selectedAssistant = null"><X :size="18" /></button></header><p>{{ selectedAssistant.description || '由平台配置的专业 AI 助手' }}</p><div class="assistant-detail"><span>默认模型<strong>{{ selectedAssistant.defaultModel || '跟随当前模型' }}</strong></span><span>可用工具<strong>{{ assistantToolNames(selectedAssistant) }}</strong></span></div><footer><button type="button" @click="selectedAssistant = null">关闭</button><button class="primary" type="button" @click="useAssistant(selectedAssistant)">开始对话</button></footer></section></div></Teleport>
  </main>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Bot, ChevronRight, CircleAlert, Database, FileText, LoaderCircle, Plus, Search, Upload, X } from 'lucide-vue-next'
// 异步加载：插件市场整页不必打进能力中心 chunk，切到「技能」分区时才拉取
const PluginMarketPage = defineAsyncComponent(() => import('./PluginMarketPage.vue'))
import EmptyState from '../components/common/EmptyState.vue'
import { useEscapeClose } from '../composables/useEscapeClose'
import { api } from '../services/api'
import { useAuthStore } from '../stores/auth'
import { useCatalogStore } from '../stores/catalog'
import { visibleGroupTabs } from '../utils/sidebar-nav'
import type { AssistantProfile, KnowledgeBaseSummary, Plugin } from '../types'

type Section = 'assistants' | 'skills' | 'knowledge'
const route = useRoute()
const section = ref<Section>(route.query.tab === 'assistants' || route.query.tab === 'knowledge' ? route.query.tab : 'skills')
const auth = useAuthStore(); const router = useRouter(); const catalog = useCatalogStore()
const query = ref('')
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const assistants = ref<AssistantProfile[]>([])
const knowledgeBases = ref<KnowledgeBaseSummary[]>([])
const skillCount = ref(0)
const marketPage = ref<{ pickSkillFile: () => void; openEditor: () => void } | null>(null)
const selectedAssistant = ref<AssistantProfile | null>(null)
const knowledgeEditor = ref(false)
const knowledgeDraft = reactive({ name: '', description: '' })
const knowledgeTemplates = [
  { name: '产品资料库', description: '产品介绍、功能说明、规格参数、价格与版本记录。供商品视觉、文案和客服助手准确引用产品信息。' },
  { name: '品牌规范', description: '品牌定位、语气规范、禁用词、视觉规范和标准话术。用于保持文案和设计输出风格一致。' },
  { name: '客服 FAQ', description: '常见问题与标准答复、售后政策、退换货与物流说明。供知识服务助手回答用户咨询。' },
  { name: '团队 SOP', description: '工作流程、操作手册、审批规则和岗位职责。用于办公写作、会议纪要和新人答疑。' },
  { name: '行业研究', description: '行业报告、竞品资料、市场数据和调研笔记。供深度调研与数据分析助手检索引用。' },
  { name: '学习笔记', description: '课程讲义、读书笔记、论文摘要和知识卡片。供学习辅导助手讲解、出题和复习。' },
] as const
function applyKnowledgeTemplate(item: typeof knowledgeTemplates[number]) { knowledgeDraft.name = item.name; knowledgeDraft.description = item.description }
const selectedKnowledge = ref<KnowledgeBaseSummary | null>(null)
const knowledgeDetailDraft = reactive({ name: '', description: '' })
const selectedKnowledgeAssetId = ref('')
const knowledgeAssets = ref<Array<{ id: string; name: string; mimeType: string }>>([])

useEscapeClose(() => {
  if (selectedAssistant.value) { selectedAssistant.value = null; return }
  if (selectedKnowledge.value) { selectedKnowledge.value = null; return }
  knowledgeEditor.value = false
}, { enabled: () => Boolean(selectedAssistant.value || selectedKnowledge.value || knowledgeEditor.value) })
const sections = computed(() => [
  { id: 'assistants' as const, label: '助手', count: assistants.value.length },
  { id: 'skills' as const, label: '技能', count: skillCount.value },
  { id: 'knowledge' as const, label: '知识库', count: knowledgeBases.value.length },
])
function assistantToolNames(item: AssistantProfile) {
  const names = (item.tools || []).map((tool) => tool.name).filter((name): name is string => Boolean(name?.trim()))
  return names.length ? names.join('、') : `${item.tools?.length || 0} 个`
}
function assistantMeta(item: AssistantProfile) {
  const names = assistantToolNames(item)
  return `${item.defaultModel || '跟随当前模型'} · ${names}`
}
const searchPlaceholder = computed(() => section.value === 'assistants' ? '搜索助手' : section.value === 'knowledge' ? '搜索知识库' : '搜索技能')
const matches = (name: string, description = '') => `${name} ${description}`.toLowerCase().includes(query.value.trim().toLowerCase())
const filteredAssistants = computed(() => assistants.value.filter((item) => matches(item.name, item.description)))
const filteredKnowledgeBases = computed(() => knowledgeBases.value.filter((item) => matches(item.name, item.description)))
const knowledgeAssetOptions = computed(() => {
  const linked = new Set((selectedKnowledge.value?.assets || []).map((item) => item.assetId))
  return knowledgeAssets.value.filter((item) => !linked.has(item.id) && (item.mimeType.startsWith('text/') || item.mimeType === 'application/json'))
})

async function load() {
  loading.value = true; error.value = ''
  try { const [assistantRows, knowledgeRows, skillRows, assetRows] = await Promise.all([api<AssistantProfile[]>('/assistants'), api<KnowledgeBaseSummary[]>('/knowledge-bases'), api<Plugin[]>('/plugins/market'), api<Array<{ id: string; name: string; mimeType: string }>>('/assets')]); assistants.value = assistantRows; knowledgeBases.value = knowledgeRows; skillCount.value = skillRows.length; knowledgeAssets.value = assetRows; if (selectedKnowledge.value) selectedKnowledge.value = knowledgeRows.find((item) => item.id === selectedKnowledge.value?.id) || null }
  catch (reason) { error.value = reason instanceof Error ? reason.message : '能力中心加载失败' }
  finally { loading.value = false }
}
async function withMarketPage() {
  if (!marketPage.value) await nextTick()
  return marketPage.value
}
async function importSkill() { (await withMarketPage())?.pickSkillFile() }
async function createSkill() { (await withMarketPage())?.openEditor() }
function useAssistant(item: AssistantProfile) { selectedAssistant.value = null; void router.push({ path: '/chat', query: { assistant: item.id } }) }
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
function goToAssets() { selectedKnowledge.value = null; void router.push('/workspace?tab=files') }
const visibleSections = computed(() => {
  const ordered = visibleGroupTabs('plugins', catalog.settings)
  return ordered.map((item) => {
    const entry = sections.value.find((row) => row.id === item.key)
    return entry ? { ...entry, label: item.label } : null
  }).filter((item): item is typeof sections.value[number] => Boolean(item))
})
function selectSection(id: Section) {
  section.value = id
  query.value = ''
  void router.replace({ query: { ...route.query, tab: id } })
}
watch(() => route.query.tab, (value) => {
  if (value === 'assistants' || value === 'skills' || value === 'knowledge') section.value = value
})
watch(visibleSections, (rows) => {
  if (rows.length && !rows.some((item) => item.id === section.value)) selectSection(rows[0].id)
}, { immediate: true })
onMounted(() => { if (!auth.isAuthenticated) void router.replace('/login?redirect=/capabilities'); else void load() })
</script>
