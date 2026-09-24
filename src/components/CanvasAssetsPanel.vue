<template>
  <aside class="canvas-assets-panel" aria-label="画布资产">
    <header>
      <div><LibraryBig :size="17" /><strong>{{ tab === 'canvas' ? '画布元素' : tab === 'prompts' ? '提示词库' : '资产' }}</strong></div>
      <button type="button" aria-label="关闭资产面板" title="关闭资产面板" @click="emit('close')"><X :size="17" /></button>
    </header>

    <nav aria-label="资产分类">
      <button type="button" :class="{ 'is-active': tab === 'canvas' }" @click="tab = 'canvas'">画布 <span>{{ nodes.length }}</span></button>
      <button type="button" :class="{ 'is-active': tab === 'library' }" @click="tab = 'library'">资产 <span>{{ assets.length }}</span></button>
      <button type="button" :class="{ 'is-active': tab === 'prompts' }" @click="tab = 'prompts'">提示词库 <span>{{ prompts.length }}</span></button>
    </nav>

    <template v-if="tab === 'canvas'">
      <div class="canvas-assets-panel-toolbar canvas-node-panel-toolbar"><button type="button" class="canvas-node-select-toggle" :class="{ 'is-active': selectionMode }" :aria-pressed="selectionMode" @click="selectionMode = !selectionMode"><Check v-if="selectionMode" :size="14" /><MousePointer2 v-else :size="14" />选择</button><label><Search :size="15" /><input v-model.trim="nodeQuery" type="search" placeholder="搜索节点" aria-label="搜索节点" /></label><select v-model="nodeKind" aria-label="节点类型"><option value="ALL">全部</option><option value="TEXT">文本</option><option value="IMAGE">图片</option><option value="VIDEO">视频</option><option value="AUDIO">音频</option><option value="CONFIG">设置</option><option value="GROUP">分组</option></select></div>
      <p class="canvas-assets-panel-hint">选择节点可定位到画布，双击节点可打开设置</p>
      <div v-if="filteredNodes.length" class="canvas-node-panel-list"><button v-for="node in filteredNodes" :key="node.id" type="button" :class="{ 'is-selected': node.selected }" @click="selectionMode ? toggleNodeSelection(node) : emit('locate', node.id)" @dblclick.stop="emit('open', node.id)"><span class="canvas-node-panel-icon"><ImageIcon v-if="node.data.kind === 'IMAGE'" :size="14" /><FileText v-else-if="node.data.kind === 'TEXT'" :size="14" /><VideoIcon v-else-if="node.data.kind === 'VIDEO'" :size="14" /><Boxes v-else :size="14" /></span><span><strong>{{ node.data.title || nodeKindLabel(node.data.kind) }}</strong><small>{{ nodeKindLabel(node.data.kind) }}<template v-if="node.data.status"> · {{ node.data.status }}</template></small></span><Check v-if="selectionMode && node.selected" :size="14" class="canvas-node-panel-check" /><ChevronDown v-else :size="13" /></button></div>
      <div v-else class="canvas-assets-panel-empty"><Boxes :size="22" /><span>{{ nodeQuery ? '没有匹配的节点' : '画布中还没有节点' }}</span></div>
    </template>

    <template v-else-if="tab === 'library'">
      <div class="canvas-assets-panel-toolbar">
        <label><Search :size="15" /><input v-model.trim="query" type="search" placeholder="搜索素材" aria-label="搜索素材" /></label>
        <button type="button" :disabled="uploading" title="上传素材" aria-label="上传素材" @click="fileInput?.click()"><LoaderCircle v-if="uploading" class="canvas-spin" :size="15" /><Upload v-else :size="15" /></button>
        <input ref="fileInput" hidden type="file" accept="image/*,video/*" @change="upload" />
      </div>
      <p v-if="error" class="canvas-assets-panel-error"><span>{{ error }}</span><button type="button" aria-label="重新加载画布资源" title="重新加载" @click="load"><RefreshCw :size="14" /></button></p>
      <div v-if="loading" class="canvas-assets-panel-empty"><LoaderCircle class="canvas-spin" :size="19" /><span>正在加载素材</span></div>
      <div v-else-if="filteredAssets.length" class="canvas-assets-panel-grid">
        <button v-for="asset in filteredAssets" :key="asset.id" draggable="true" type="button" @click="emit('insert', asset)" @dragstart="startAssetDrag($event, asset)">
          <img v-if="asset.kind === 'IMAGE'" :src="asset.contentUrl" :alt="asset.name" />
          <video v-else :src="asset.contentUrl" muted preload="metadata" playsinline />
          <span>{{ asset.name }}</span>
        </button>
      </div>
      <div v-else class="canvas-assets-panel-empty"><FolderOpen :size="22" /><span>{{ query ? '没有匹配的素材' : '文件库还没有素材' }}</span></div>
    </template>

    <template v-else>
      <p class="canvas-assets-panel-hint">从已发布灵感中插入一张可编辑的提示词节点</p>
      <div v-if="loadingPrompts" class="canvas-assets-panel-empty"><LoaderCircle class="canvas-spin" :size="19" /><span>正在加载提示词</span></div>
      <div v-else-if="prompts.length" class="canvas-assets-panel-prompt-list">
        <button v-for="prompt in prompts" :key="prompt.id" type="button" @click="emit('insertPrompt', prompt)">
          <span class="canvas-assets-panel-prompt-heading"><strong>{{ prompt.title }}</strong><small v-if="prompt.sourceName">{{ prompt.sourceName }}</small></span>
          <span>{{ prompt.prompt || prompt.description || '点击插入提示词节点' }}</span>
        </button>
      </div>
      <div v-else class="canvas-assets-panel-empty"><FileText :size="22" /><span>尚未发布可用提示词</span></div>
    </template>
  </aside>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Boxes, Check, ChevronDown, FileText, FolderOpen, Image as ImageIcon, LibraryBig, LoaderCircle, MousePointer2, RefreshCw, Search, Upload, Video as VideoIcon, X } from 'lucide-vue-next'
import { api } from '../services/api'
import { uploadAsset } from '../utils/asset-upload'
import type { CanvasGenerationKind, CanvasNodeData } from '../types/canvas'

export type CanvasAssetPanelItem = { id: string; kind: CanvasGenerationKind; name: string; mimeType: string; size: number; contentUrl: string; createdAt: string }
type CanvasNodeMedia = { id: string; kind: CanvasGenerationKind; title: string; url: string }
type CanvasNodePanelItem = { id: string; data: CanvasNodeData; selected?: boolean }
export type CanvasPromptPanelItem = { id: string; title: string; prompt?: string; description?: string | null; mode?: 'IMAGE' | 'VIDEO'; sourceName?: string }

const props = withDefaults(defineProps<{ projectId?: string; currentAssets: CanvasNodeMedia[]; nodes?: CanvasNodePanelItem[] }>(), { nodes: () => [] })
const emit = defineEmits<{ close: []; insert: [asset: CanvasAssetPanelItem]; dragAsset: [asset: CanvasAssetPanelItem]; insertPrompt: [prompt: CanvasPromptPanelItem]; locate: [nodeId: string]; open: [nodeId: string] }>()
const tab = ref<'canvas' | 'library' | 'prompts'>('canvas')
const assets = ref<CanvasAssetPanelItem[]>([])
const prompts = ref<CanvasPromptPanelItem[]>([])
const query = ref('')
const nodeQuery = ref('')
const nodeKind = ref('ALL')
const selectionMode = ref(false)
const loading = ref(true)
const loadingPrompts = ref(true)
const uploading = ref(false)
const error = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
const currentAssets = computed<CanvasAssetPanelItem[]>(() => props.currentAssets.map((asset) => ({
  id: asset.id,
  kind: asset.kind,
  name: asset.title,
  mimeType: '',
  size: 0,
  contentUrl: asset.url,
  createdAt: '',
})))
const filteredAssets = computed(() => {
  const keyword = query.value.toLowerCase()
  return keyword ? assets.value.filter((asset) => asset.name.toLowerCase().includes(keyword)) : assets.value
})
const filteredNodes = computed(() => {
  const keyword = nodeQuery.value.toLowerCase()
  return props.nodes.filter((node) => {
    const matchesKind = nodeKind.value === 'ALL' || node.data.kind === nodeKind.value
    const matchesText = !keyword || `${node.data.title} ${node.data.content || ''} ${node.data.prompt || ''}`.toLowerCase().includes(keyword)
    return matchesKind && matchesText
  })
})

function nodeKindLabel(kind: CanvasNodeData['kind']) {
  return ({ TEXT: '文本', IMAGE: '图片', VIDEO: '视频', AUDIO: '音频', CONFIG: '生成设置', GROUP: '分组' } as Record<string, string>)[kind] || kind
}

function toggleNodeSelection(node: CanvasNodePanelItem) {
  node.selected = !node.selected
}

onMounted(load)

async function load() {
  loading.value = true
  error.value = ''
  try {
    const results = await Promise.allSettled([
      api<CanvasAssetPanelItem[]>('/assets?kind=IMAGE'),
      api<CanvasAssetPanelItem[]>('/assets?kind=VIDEO'),
      api<{ items?: Array<{ id: string; title: string; prompt?: string; description?: string; promptType?: 'IMAGE' | 'VIDEO'; sourceName?: string }> }>('/prompt-library?type=IMAGE&page=1&pageSize=60'),
      api<{ items?: Array<{ id: string; title: string; prompt?: string; description?: string; promptType?: 'IMAGE' | 'VIDEO'; sourceName?: string }> }>('/prompt-library?type=VIDEO&page=1&pageSize=60'),
    ])
    const [imagesResult, videosResult, imagePromptsResult, videoPromptsResult] = results
    const images = imagesResult.status === 'fulfilled' ? imagesResult.value : []
    const videos = videosResult.status === 'fulfilled' ? videosResult.value : []
    const imagePrompts = imagePromptsResult.status === 'fulfilled' ? (imagePromptsResult.value.items || []) : []
    const videoPrompts = videoPromptsResult.status === 'fulfilled' ? (videoPromptsResult.value.items || []) : []
    if (results.some((result) => result.status === 'rejected')) error.value = '部分画布资源加载失败，请重试。'
    const assetById = new Map([...currentAssets.value, ...images, ...videos].map((asset) => [asset.id, asset]))
    assets.value = [...assetById.values()].sort((left, right) => +new Date(right.createdAt) - +new Date(left.createdAt))
    prompts.value = [...imagePrompts, ...videoPrompts].map((item) => ({ id: item.id, title: item.title, prompt: item.prompt, description: item.description, mode: item.promptType, sourceName: item.sourceName })).filter((item, index, rows) => Boolean(item.prompt || item.description) && rows.findIndex((candidate) => candidate.id === item.id) === index)
  } catch (reason) { error.value = reason instanceof Error ? reason.message : '素材加载失败' }
  finally { loading.value = false; loadingPrompts.value = false }
}

async function upload(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  const kind: CanvasGenerationKind = file.type.startsWith('video/') ? 'VIDEO' : 'IMAGE'
  uploading.value = true
  error.value = ''
  try {
    const asset = await uploadAsset<CanvasAssetPanelItem>(file, { kind, purpose: 'library', projectId: props.projectId })
    assets.value = [asset, ...assets.value.filter((item) => item.id !== asset.id)]
    emit('insert', asset)
  } catch (reason) { error.value = reason instanceof Error ? reason.message : '上传失败' }
  finally { uploading.value = false }
}

function startAssetDrag(event: DragEvent, asset: CanvasAssetPanelItem) {
  event.dataTransfer?.setData('application/x-xinyue-canvas-asset', JSON.stringify(asset))
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy'
  emit('dragAsset', asset)
}
</script>
