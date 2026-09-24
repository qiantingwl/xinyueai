<template>
  <div class="asset-grid" :class="`asset-grid--${variant}`">
    <button v-for="asset in assets" :key="asset.id" class="asset-card" :class="{ 'asset-card--video': isVideoAsset(asset) }" type="button" :aria-label="`预览${asset.title}`" @mouseenter="playCardVideo" @mouseleave="resetCardVideo" @click="openPreview(asset)">
      <div class="asset-card__preview" :style="{ background: asset.preview }">
        <video v-if="isVideoAsset(asset) && asset.contentUrl" :src="asset.contentUrl" muted loop preload="metadata" playsinline />
        <img v-else-if="isVisualAsset(asset) && asset.contentUrl" :src="asset.contentUrl" :alt="asset.title" loading="lazy" />
        <FileText v-else :size="variant === 'list' ? 20 : 34" />
        <span v-if="asset.status !== 'done'" class="asset-card__status">生成中</span>
        <span v-if="isVideoAsset(asset) && asset.status === 'done'" class="asset-card__play" aria-hidden="true"><Play :size="16" fill="currentColor" /></span>
      </div>
      <div class="asset-card__body">
        <span class="asset-card__name"><strong>{{ asset.title }}</strong><small>{{ asset.mimeType || asset.tags[0] || '文件' }}</small></span>
        <p>{{ asset.prompt }}</p>
        <time>{{ formatDate(asset.createdAt) }}</time>
        <div class="asset-card__tags">
          <span v-for="tag in asset.tags" :key="tag">{{ tag }}</span>
        </div>
      </div>
    </button>
  </div>

  <Teleport to="body">
    <div v-if="selected" class="asset-preview-layer" :class="{ 'asset-preview-layer--video': isVideoAsset(selected) }" @mousedown.self="closePreview">
      <section class="asset-preview-dialog" :class="{ 'asset-preview-dialog--video': isVideoAsset(selected) }" role="dialog" aria-modal="true" :aria-label="`${selected.title}预览`">
        <header>
          <span><strong>{{ selected.title }}</strong><small v-if="isVisualAsset(selected)">{{ Math.round(view.scale * 100) }}%</small><small v-else-if="isVideoAsset(selected)">视频 · {{ Math.round(view.scale * 100) }}%</small></span>
          <button type="button" aria-label="关闭预览" title="关闭" @click="closePreview"><X :size="20" /></button>
        </header>
        <div
          :ref="setViewport"
          class="asset-preview-viewport"
          :class="{ 'is-panning': dragging, 'is-zoomed': view.scale > 1.001, 'asset-preview-viewport--video': isVideoAsset(selected) }"
          @wheel="handlePreviewWheel"
          @pointerdown="startPan"
          @pointermove="movePan"
          @pointerup="endPan"
          @pointercancel="endPan"
        >
          <div class="asset-preview-canvas" :class="{ 'asset-preview-canvas--image': isVisualAsset(selected) && selected.contentUrl, 'asset-preview-canvas--video': isVideoAsset(selected) }" :style="canvasStyle">
            <div v-if="isVideoAsset(selected) && selected.contentUrl" class="asset-preview-video-frame" :style="videoFrameStyle">
              <video :src="selected.contentUrl" controls autoplay preload="metadata" playsinline disablepictureinpicture disableremoteplayback controlslist="nodownload noplaybackrate" @loadedmetadata="syncVideoRatio" />
              <div v-if="dragMode" class="asset-preview-video-drag-surface" aria-label="拖拽移动视频" />
            </div>
            <img v-else-if="isVisualAsset(selected) && selected.contentUrl" :src="selected.contentUrl" :alt="selected.title" draggable="false" />
            <div v-else :style="{ background: selected.preview }" />
          </div>
        </div>
        <div class="asset-preview-toolbar" :class="{ 'asset-preview-toolbar--video': isVideoAsset(selected) }" aria-label="预览工具">
          <button v-if="isVideoAsset(selected)" type="button" :class="{ 'is-active': dragMode }" :aria-pressed="dragMode" :aria-label="dragMode ? '切换到视频操作模式' : '切换到拖动模式'" :title="dragMode ? '操作视频' : '拖动画面'" @click="toggleDragMode"><Hand v-if="dragMode" :size="18" /><MousePointer2 v-else :size="18" /></button>
          <template v-if="isVisualAsset(selected) || isVideoAsset(selected)">
            <button type="button" aria-label="缩小" title="缩小" @click="zoomBy(-0.2)"><ZoomOut :size="18" /></button>
            <button type="button" aria-label="适配画布" title="适配画布" @click="resetView"><Maximize2 :size="18" /></button>
            <button type="button" aria-label="放大" title="放大" @click="zoomBy(0.2)"><ZoomIn :size="18" /></button>
          </template>
          <button v-if="regeneratable && selected.jobId" type="button" aria-label="重新生成" title="重新生成" @click="emitAction('regenerate')"><RefreshCw :size="18" /></button>
          <button v-if="reusable && isVisualAsset(selected)" type="button" aria-label="用作参考" title="用作参考" @click="emitAction('reuse')"><ImagePlus :size="18" /></button>
          <button v-if="reusable && selected.prompt" type="button" aria-label="引用提示词" title="引用提示词" @click="emitAction('quote')"><Quote :size="18" /></button>
          <button v-if="shareable && selected.canManage !== false" type="button" aria-label="设置团队归属" title="设置团队归属" @click="shareAsset"><UsersRound :size="18" /></button>
          <button type="button" aria-label="下载素材" title="下载素材" @click="downloadAsset"><Download :size="18" /></button>
          <button v-if="deletable && selected.canManage !== false" class="danger" type="button" aria-label="删除素材" title="删除素材" @click="deleteAsset"><Trash2 :size="18" /></button>
        </div>
        <footer><p>{{ selected.prompt }}</p><div><span v-if="selected.team">团队 · {{ selected.team.name }}</span><span v-for="tag in selected.tags" :key="tag">{{ tag }}</span></div></footer>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { Download, FileText, Hand, ImagePlus, Maximize2, MousePointer2, Play, Quote, RefreshCw, Trash2, UsersRound, X, ZoomIn, ZoomOut } from 'lucide-vue-next'
import { useAssetPreviewTransform } from '../composables/useAssetPreviewTransform'
import { useEscapeClose } from '../composables/useEscapeClose'
import { formatFullDay as formatDate } from '../utils/datetime'
import type { StudioAsset } from '../types'

withDefaults(defineProps<{ assets: StudioAsset[]; deletable?: boolean; reusable?: boolean; regeneratable?: boolean; shareable?: boolean; variant?: 'cards' | 'gallery' | 'list' }>(), { deletable: false, reusable: false, regeneratable: false, shareable: false, variant: 'cards' })
const emit = defineEmits<{ delete: [assetId: string]; reuse: [asset: StudioAsset]; quote: [asset: StudioAsset]; regenerate: [asset: StudioAsset]; share: [asset: StudioAsset] }>()

const selected = ref<StudioAsset | null>(null)

const {
  canvasStyle,
  dragging,
  dragMode,
  endPan,
  handlePreviewWheel,
  movePan,
  resetView,
  setViewport,
  startPan,
  syncVideoRatio,
  toggleDragMode,
  videoFrameStyle,
  view,
  zoomBy,
} = useAssetPreviewTransform({
  isEnabled: () => Boolean(selected.value && (isVisualAsset(selected.value) || isVideoAsset(selected.value))),
  isVideo: () => Boolean(selected.value && isVideoAsset(selected.value)),
})

function openPreview(asset: StudioAsset) { selected.value = asset; dragMode.value = false; resetView() }
function isVisualAsset(asset: StudioAsset) { return asset.kind === 'image' || asset.kind === 'product-pack' || Boolean(asset.mimeType?.startsWith('image/')) }
function isVideoAsset(asset: StudioAsset) { return asset.kind === 'video' || Boolean(asset.mimeType?.startsWith('video/')) }
function closePreview() { selected.value = null; dragMode.value = false; resetView() }
useEscapeClose(() => { if (selected.value) closePreview() })
function emitAction(action: 'reuse' | 'quote' | 'regenerate') {
  if (!selected.value) return
  const asset = selected.value
  closePreview()
  if (action === 'reuse') emit('reuse', asset)
  else if (action === 'quote') emit('quote', asset)
  else emit('regenerate', asset)
}
function playCardVideo(event: MouseEvent) {
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return
  const video = (event.currentTarget as HTMLElement).querySelector('video')
  if (video) void video.play().catch(() => undefined)
}
function resetCardVideo(event: MouseEvent) {
  const video = (event.currentTarget as HTMLElement).querySelector('video')
  if (!video) return
  video.pause()
  try { video.currentTime = 0 } catch { /* Media metadata may not be ready yet. */ }
}
async function downloadAsset() {
  if (!selected.value) return
  const safeTitle = selected.value.title.replace(/[<>:"/\\|?*]/g, '-').trim() || 'flux-asset'
  if (selected.value.contentUrl) {
    const response = await fetch(selected.value.contentUrl, { credentials: 'include' })
    if (!response.ok) return
    const url = URL.createObjectURL(await response.blob())
    const link = document.createElement('a'); link.href = url; link.download = safeTitle; link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    return
  }
  const background = selected.value.preview.replace(/[<>&"]/g, (character) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[character] || character)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1111" viewBox="0 0 1200 1111"><foreignObject width="1200" height="1111"><div xmlns="http://www.w3.org/1999/xhtml" style="width:1200px;height:1111px;background:${background}"></div></foreignObject></svg>`
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url; link.download = `${safeTitle}.svg`; link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
function deleteAsset() {
  if (!selected.value || !window.confirm(`确认删除“${selected.value.title}”？`)) return
  const assetId = selected.value.id; closePreview(); emit('delete', assetId)
}
function shareAsset() {
  if (!selected.value) return
  const asset = selected.value
  closePreview()
  emit('share', asset)
}
function handleKeydown(event: KeyboardEvent) { if (event.key === 'Escape' && selected.value) closePreview() }
onMounted(() => window.addEventListener('keydown', handleKeydown))
onUnmounted(() => window.removeEventListener('keydown', handleKeydown))
</script>
