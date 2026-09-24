<template>
  <section class="studio-index-page canvas-page canvas-library-page">
    <div class="index-page-inner">
      <WorkspaceSectionTabs active="canvases" />

      <header class="index-page-header canvas-library-header">
        <div class="index-page-title"><h1>画布</h1><p>组织提示词、素材、生成结果和完整创作流程。</p></div>
        <div class="canvas-library-actions">
          <label class="canvas-secondary-button" :class="{ 'is-disabled': !canCreateCanvas }" :title="createLimitMessage"><Upload :size="16" />导入<input ref="importInput" type="file" accept="application/json,.json" :disabled="!canCreateCanvas" @change="importCanvas" /></label>
          <button class="canvas-primary-button" type="button" :disabled="!canCreateCanvas" :title="createLimitMessage" @click="createOpen = true"><Plus :size="17" />新建画布</button>
        </div>
      </header>

      <div v-if="error" class="canvas-feedback" role="alert"><span>{{ error }}</span><button type="button" aria-label="关闭提示" @click="error = ''"><X :size="15" /></button></div>

      <div class="canvas-library-toolbar">
        <label><Search :size="16" /><input v-model="query" placeholder="搜索画布" aria-label="搜索画布" /></label>
        <button type="button" :class="{ 'is-active': showArchived }" @click="showArchived = !showArchived; void load()"><Archive :size="16" />{{ showArchived ? '返回使用中' : '已归档' }}</button>
      </div>

      <div v-if="loading" class="canvas-library-grid" aria-label="正在加载画布"><i v-for="index in 6" :key="index" class="canvas-card-skeleton" /></div>
      <div v-else-if="filteredCanvases.length" class="canvas-library-grid">
      <article v-for="canvas in filteredCanvases" :key="canvas.id" class="canvas-card">
        <button class="canvas-card-preview" type="button" :aria-label="`打开${canvas.title}`" @click="openCanvas(canvas.id)">
          <span class="canvas-card-grid" />
          <span class="canvas-card-node canvas-card-node--one" />
          <span class="canvas-card-node canvas-card-node--two" />
          <span class="canvas-card-link" />
          <span class="canvas-card-kind">{{ canvas.kind === 'SHORT_DRAMA' ? '短剧工作流' : '自由画布' }}</span>
          <span class="canvas-card-count">{{ canvas.nodeCount }} 个节点</span>
        </button>
        <div class="canvas-card-copy">
          <button type="button" @click="openCanvas(canvas.id)"><strong>{{ canvas.title }}</strong><small>{{ canvas.project?.name || '个人工作区' }} · {{ formatDate(canvas.updatedAt) }}</small></button>
          <div class="canvas-card-menu">
            <button type="button" aria-label="画布操作" title="画布操作" @click="menuId = menuId === canvas.id ? '' : canvas.id"><MoreHorizontal :size="18" /></button>
            <div v-if="menuId === canvas.id">
              <button type="button" @click="duplicateCanvas(canvas)"><Copy :size="15" />创建副本</button>
              <button type="button" @click="toggleArchive(canvas)"><ArchiveRestore v-if="canvas.archivedAt" :size="15" /><Archive v-else :size="15" />{{ canvas.archivedAt ? '恢复' : '归档' }}</button>
              <button v-if="canvas.accessRole !== 'MEMBER'" class="is-danger" type="button" @click="removeCanvas(canvas)"><Trash2 :size="15" />删除</button>
            </div>
          </div>
        </div>
      </article>
    </div>
      <EmptyState v-else class="canvas-library-empty" :icon="MousePointer2" :title="query ? '没有匹配的画布' : showArchived ? '没有已归档画布' : '创建第一张画布'" description="把想法、参考素材和生成结果放在同一个可持续编辑的空间。">
        <button v-if="!query && !showArchived" class="canvas-primary-button" type="button" :disabled="!canCreateCanvas" :title="createLimitMessage" @click="createOpen = true"><Plus :size="17" />新建画布</button>
      </EmptyState>
    </div>

    <div v-if="createOpen" class="canvas-modal-backdrop" @click.self="createOpen = false">
      <form class="canvas-create-dialog" @submit.prevent="createCanvas">
        <header><div><h2>新建画布</h2><p>画布可以独立使用，也可以关联到项目。</p></div><button type="button" aria-label="关闭" @click="createOpen = false"><X :size="19" /></button></header>
        <label>名称<input v-model="createTitle" maxlength="100" autofocus placeholder="例如：秋季发布会视觉方案" /></label>
        <fieldset class="canvas-kind-picker">
          <legend>画布类型</legend>
          <label :class="{ 'is-active': createKind === 'FREEFORM' }">
            <input v-model="createKind" type="radio" value="FREEFORM" />
            <MousePointer2 :size="19" />
            <span><strong>自由画布</strong><small>自由组合提示词、图片、视频和生成节点</small></span>
          </label>
          <label :class="{ 'is-active': createKind === 'SHORT_DRAMA', 'is-disabled': !capabilities.shortDramaAccess }">
            <input v-model="createKind" type="radio" value="SHORT_DRAMA" :disabled="!capabilities.shortDramaAccess" />
            <Clapperboard :size="19" />
            <span><strong>短剧创作</strong><small>{{ capabilities.shortDramaAccess ? '按剧本、资产、分镜和成片组织镜头' : '当前套餐未开放短剧工作流' }}</small></span>
          </label>
        </fieldset>
        <label>所属项目<select v-model="createProjectId"><option value="">个人工作区</option><option v-for="project in projects" :key="project.id" :value="project.id">{{ project.name }}</option></select></label>
        <footer><button type="button" @click="createOpen = false">取消</button><button class="canvas-primary-button" type="submit" :disabled="creating || !createTitle.trim()"><LoaderCircle v-if="creating" class="canvas-spin" :size="16" /><Plus v-else :size="16" />创建</button></footer>
      </form>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Archive, ArchiveRestore, Clapperboard, Copy, LoaderCircle, MoreHorizontal, MousePointer2, Plus, Search, Trash2, Upload, X } from 'lucide-vue-next'
import WorkspaceSectionTabs from '../components/WorkspaceSectionTabs.vue'
import { api } from '../services/api'
import { useEscapeClose } from '../composables/useEscapeClose'
import { formatShortDayTime as formatDate } from '../utils/datetime'
import EmptyState from '../components/common/EmptyState.vue'
import type { CanvasCapabilities, CanvasDocumentPayload, CanvasKind, CanvasProjectSummary, CanvasRecord, CanvasSummary } from '../types/canvas'

const router = useRouter()
const canvases = ref<CanvasSummary[]>([])
const projects = ref<CanvasProjectSummary[]>([])
const loading = ref(true)
const creating = ref(false)
const error = ref('')
const query = ref('')
const showArchived = ref(false)
const menuId = ref('')
const createOpen = ref(false)
const createTitle = ref('未命名画布')
const createKind = ref<CanvasKind>('FREEFORM')
const createProjectId = ref('')
const capabilities = ref<CanvasCapabilities>({ canvasAccess: true, shortDramaAccess: true, maxCanvases: 100, maxCanvasNodes: 500, usedCanvases: 0 })
const importInput = ref<HTMLInputElement | null>(null)
let searchTimer = 0

// 卡片操作菜单先于新建弹层响应 Esc。
useEscapeClose(() => { menuId.value = '' }, { enabled: () => Boolean(menuId.value) })
useEscapeClose(() => { createOpen.value = false }, { enabled: () => !menuId.value && createOpen.value })

const filteredCanvases = computed(() => {
  const needle = query.value.trim().toLowerCase()
  return needle ? canvases.value.filter((item) => item.title.toLowerCase().includes(needle) || item.project?.name.toLowerCase().includes(needle)) : canvases.value
})
const canCreateCanvas = computed(() => capabilities.value.canvasAccess && capabilities.value.usedCanvases < capabilities.value.maxCanvases)
const createLimitMessage = computed(() => !capabilities.value.canvasAccess ? '当前套餐未开放无限画布' : capabilities.value.usedCanvases >= capabilities.value.maxCanvases ? `当前套餐最多创建 ${capabilities.value.maxCanvases} 个画布` : '新建画布')

watch(query, () => {
  window.clearTimeout(searchTimer)
  searchTimer = window.setTimeout(() => void load(), 300)
})

onMounted(async () => {
  await Promise.all([load(), loadProjects(), loadCapabilities()])
})

async function loadCapabilities() {
  try {
    capabilities.value = await api<CanvasCapabilities>('/canvases/capabilities')
    if (!capabilities.value.shortDramaAccess && createKind.value === 'SHORT_DRAMA') createKind.value = 'FREEFORM'
  } catch { /* 服务端仍会在创建时执行套餐校验 */ }
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const params = new URLSearchParams({ archived: String(showArchived.value) })
    if (query.value.trim()) params.set('q', query.value.trim())
    canvases.value = await api<CanvasSummary[]>(`/canvases?${params}`)
  } catch (reason) { error.value = reason instanceof Error ? reason.message : '画布加载失败' }
  finally { loading.value = false }
}

async function loadProjects() {
  try { projects.value = (await api<Array<{ id: string; name: string; teamId?: string | null }>>('/projects')).map(({ id, name, teamId }) => ({ id, name, teamId })) }
  catch { projects.value = [] }
}

async function createCanvas() {
  creating.value = true
  error.value = ''
  try {
    const created = await api<CanvasRecord>('/canvases', { method: 'POST', body: JSON.stringify({ title: createTitle.value.trim(), kind: createKind.value, projectId: createProjectId.value || undefined }) })
    createOpen.value = false
    await router.push(`/canvas/${created.id}`)
  } catch (reason) { error.value = reason instanceof Error ? reason.message : '画布创建失败' }
  finally { creating.value = false }
}

async function duplicateCanvas(canvas: CanvasSummary) {
  menuId.value = ''
  try { const created = await api<CanvasRecord>(`/canvases/${canvas.id}/duplicate`, { method: 'POST', body: JSON.stringify({}) }); await router.push(`/canvas/${created.id}`) }
  catch (reason) { error.value = reason instanceof Error ? reason.message : '复制失败' }
}

async function toggleArchive(canvas: CanvasSummary) {
  menuId.value = ''
  try { await api(`/canvases/${canvas.id}`, { method: 'PATCH', body: JSON.stringify({ expectedRevision: canvas.revision, archived: !canvas.archivedAt }) }); await load() }
  catch (reason) { error.value = reason instanceof Error ? reason.message : '归档操作失败' }
}

async function removeCanvas(canvas: CanvasSummary) {
  menuId.value = ''
  if (!window.confirm(`永久删除“${canvas.title}”？此操作无法撤销。`)) return
  try { await api(`/canvases/${canvas.id}`, { method: 'DELETE' }); await Promise.all([load(), loadCapabilities()]) }
  catch (reason) { error.value = reason instanceof Error ? reason.message : '删除失败' }
}

async function importCanvas(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  error.value = ''
  try {
    const payload = JSON.parse(await file.text()) as CanvasDocumentPayload
    const created = await api<CanvasRecord>('/canvases', { method: 'POST', body: JSON.stringify({ title: file.name.replace(/\.json$/i, '') || '导入画布', document: payload }) })
    await router.push(`/canvas/${created.id}`)
  } catch (reason) { error.value = reason instanceof Error ? reason.message : '画布文件无法导入' }
  finally { if (importInput.value) importInput.value.value = '' }
}

function openCanvas(id: string) { void router.push(`/canvas/${id}`) }
</script>
