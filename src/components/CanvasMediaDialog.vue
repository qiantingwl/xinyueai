<template>
  <Teleport to="body">
    <div class="canvas-modal-backdrop canvas-media-backdrop" @click.self="emit('close')">
      <section class="canvas-media-dialog" role="dialog" aria-modal="true" :aria-label="dialogTitle">
        <header>
          <div>
            <span>{{ kind === 'IMAGE' ? '图片素材' : kind === 'VIDEO' ? '视频素材' : '音频素材' }}</span>
            <h2>{{ dialogTitle }}</h2>
          </div>
          <button type="button" aria-label="关闭素材库" @click="emit('close')"><X :size="19" /></button>
        </header>

        <div class="canvas-media-toolbar">
          <label><Search :size="16" /><input v-model.trim="query" type="search" :placeholder="`搜索${kindLabel}`" :aria-label="`搜索${kindLabel}`" /></label>
          <button type="button" class="canvas-primary-button" :disabled="uploading" @click="fileInput?.click()">
            <LoaderCircle v-if="uploading" class="canvas-spin" :size="16" />
            <Upload v-else :size="16" />
            {{ uploading ? '上传中' : `上传${kindLabel}` }}
          </button>
          <input ref="fileInput" hidden type="file" :accept="accept" @change="uploadFile" />
        </div>

        <div v-if="error" class="canvas-feedback" role="alert"><span>{{ error }}</span><button type="button" aria-label="关闭错误提示" @click="error = ''"><X :size="15" /></button></div>

        <div v-if="loading" class="canvas-media-grid" aria-label="正在加载素材">
          <i v-for="index in 8" :key="index" class="canvas-media-skeleton" />
        </div>
        <div v-else-if="filteredAssets.length" class="canvas-media-grid">
          <button v-for="asset in filteredAssets" :key="asset.id" type="button" class="canvas-media-item" @click="choose(asset)">
            <span class="canvas-media-preview">
              <img v-if="kind === 'IMAGE'" :src="asset.contentUrl" :alt="asset.name" />
              <video v-else-if="kind === 'VIDEO'" :src="asset.contentUrl" muted preload="metadata" playsinline />
              <Music2 v-else :size="28" />
              <span v-if="kind === 'VIDEO'" class="canvas-media-play"><Play :size="17" fill="currentColor" /></span>
            </span>
            <span class="canvas-media-copy"><strong>{{ asset.name }}</strong><small>{{ formatSize(asset.size) }} · {{ formatDate(asset.createdAt) }}</small></span>
          </button>
        </div>
        <div v-else class="canvas-media-empty">
          <ImageIcon v-if="kind === 'IMAGE'" :size="30" />
          <Video v-else-if="kind === 'VIDEO'" :size="30" />
          <Music2 v-else :size="30" />
          <strong>{{ query ? `没有匹配的${kindLabel}` : `还没有${kindLabel}` }}</strong>
          <small>{{ query ? '换一个关键词试试' : `上传后会同时保存到文件库，并可在其他画布继续使用。` }}</small>
          <button v-if="!query" type="button" class="canvas-primary-button" @click="fileInput?.click()"><Upload :size="16" />上传{{ kindLabel }}</button>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Image as ImageIcon, LoaderCircle, Music2, Play, Search, Upload, Video, X } from 'lucide-vue-next'
import { api } from '../services/api'
import { uploadAsset } from '../utils/asset-upload'
import { formatFileSize } from '../utils/format-bytes'
import { formatShortDay as formatDate } from '../utils/datetime'
import { useEscapeClose } from '../composables/useEscapeClose'

export type CanvasMediaKind = 'IMAGE' | 'VIDEO' | 'AUDIO'

export interface CanvasMediaAsset {
  id: string
  kind: CanvasMediaKind | 'FILE'
  name: string
  mimeType: string
  size: number
  contentUrl: string
  createdAt: string
}

const props = defineProps<{ kind: CanvasMediaKind; projectId?: string }>()
const emit = defineEmits<{ close: []; select: [asset: CanvasMediaAsset] }>()
useEscapeClose(() => emit('close'))
const assets = ref<CanvasMediaAsset[]>([])
const loading = ref(true)
const uploading = ref(false)
const error = ref('')
const query = ref('')
const fileInput = ref<HTMLInputElement | null>(null)

const kindLabel = computed(() => props.kind === 'IMAGE' ? '图片' : props.kind === 'VIDEO' ? '视频' : '音频')
const dialogTitle = computed(() => `选择${kindLabel.value}`)
const accept = computed(() => props.kind === 'IMAGE' ? 'image/png,image/jpeg,image/webp,image/gif,image/avif' : props.kind === 'VIDEO' ? 'video/mp4,video/webm,video/quicktime,.mov' : 'audio/mpeg,audio/wav,audio/ogg,audio/mp4,audio/aac,.mp3,.wav,.ogg,.m4a,.aac')
const assetKind = computed(() => props.kind === 'AUDIO' ? 'FILE' : props.kind)
const filteredAssets = computed(() => {
  const keyword = query.value.toLowerCase()
  return keyword ? assets.value.filter((asset) => asset.name.toLowerCase().includes(keyword)) : assets.value
})

onMounted(load)

async function load() {
  loading.value = true
  error.value = ''
  try { assets.value = await api<CanvasMediaAsset[]>(`/assets?kind=${assetKind.value}`) }
  catch (reason) { error.value = reason instanceof Error ? reason.message : '素材加载失败' }
  finally { loading.value = false }
}

async function uploadFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  uploading.value = true
  error.value = ''
  try {
    const asset = await uploadAsset<CanvasMediaAsset>(file, { kind: assetKind.value, purpose: 'library', projectId: props.projectId })
    emit('select', asset)
  } catch (reason) { error.value = reason instanceof Error ? reason.message : '上传失败' }
  finally { uploading.value = false; input.value = '' }
}

function choose(asset: CanvasMediaAsset) { emit('select', asset) }
function formatSize(value: number) { return formatFileSize(value) }
</script>
