<template>
  <article class="canvas-flow-node" :class="[`is-${data.kind.toLowerCase()}`, { 'is-selected': selected }]" @contextmenu.prevent="emit('context', $event)">
    <NodeResizer
      :is-visible="selected"
      :min-width="data.kind === 'GROUP' ? 280 : 180"
      :min-height="data.kind === 'GROUP' ? 220 : 120"
      :max-width="1600"
      :max-height="1200"
      color="#4d6bfe"
      @resize-start="emit('checkpoint')"
      @resize-end="handleResizeEnd"
    />
    <div class="canvas-node-hover-toolbar nodrag" @mousedown.stop @pointerdown.stop>
      <button type="button" title="查看节点信息与参数" aria-label="查看节点信息与参数" @click="emit('configure')"><Settings2 :size="14" /></button>
      <button v-if="data.kind === 'IMAGE' || data.kind === 'VIDEO' || data.kind === 'AUDIO'" type="button" title="选择或替换素材" aria-label="选择或替换素材" @click="emit('pick')"><Upload :size="14" /></button>
      <button v-if="data.kind === 'TEXT' || data.kind === 'CONFIG'" type="button" title="用文本生图" aria-label="用文本生图" @click="emit('derive', 'IMAGE')"><ImagePlus :size="14" /></button>
      <button v-if="data.kind === 'TEXT' || data.kind === 'CONFIG' || data.kind === 'IMAGE'" type="button" title="创建视频节点" aria-label="创建视频节点" @click="emit('derive', 'VIDEO')"><Clapperboard :size="14" /></button>
      <button v-if="data.kind === 'TEXT'" type="button" title="减小字号" aria-label="减小字号" @click="changeFontSize(-2)"><Minus :size="14" /></button>
      <button v-if="data.kind === 'TEXT'" type="button" title="增大字号" aria-label="增大字号" @click="changeFontSize(2)"><Plus :size="14" /></button>
      <button v-if="data.kind === 'IMAGE'" type="button" title="继续派生图片" aria-label="继续派生图片" @click="emit('derive', 'IMAGE')"><GitBranchPlus :size="14" /></button>
      <button v-if="data.kind === 'IMAGE' && data.assetId" type="button" title="裁剪与蒙版编辑" aria-label="裁剪与蒙版编辑" @click="emit('edit')"><Crop :size="14" /></button>
      <button type="button" title="复制节点" aria-label="复制节点" @click="emit('duplicate')"><Copy :size="14" /></button>
      <button v-if="data.url" type="button" title="下载素材" aria-label="下载素材" @click="emit('download')"><Download :size="14" /></button>
      <i aria-hidden="true" />
      <button type="button" class="is-danger" title="删除节点" aria-label="删除节点" @click="emit('remove')"><Trash2 :size="14" /></button>
    </div>
    <Handle type="target" :position="Position.Left" class="canvas-node-handle" />

    <header class="canvas-node-header">
      <div class="canvas-node-heading">
        <span class="canvas-node-kind"><component :is="nodeIcon" :size="15" />{{ kindLabel }}</span>
        <strong class="canvas-node-title">{{ data.title }}</strong>
      </div>
    </header>

    <div class="canvas-node-body nowheel">
      <textarea
        v-if="data.kind === 'TEXT'"
        :class="{ nodrag: textEditing }"
        :value="data.content"
        :style="{ fontSize: `${fontSize}px` }"
        aria-label="文本节点内容"
        placeholder="双击或直接输入提示词、脚本或说明..."
        @focus="textEditing = true; emit('checkpoint')"
        @blur="textEditing = false"
        @input="updateContent"
      />
      <template v-else-if="data.kind === 'IMAGE'">
        <img v-if="data.url" :src="data.url" :alt="data.title" draggable="false" />
        <div v-else class="canvas-node-empty"><ImageIcon :size="28" /><span>{{ emptyCopy.title }}</span><small>{{ emptyCopy.hint }}</small></div>
      </template>
      <template v-else-if="data.kind === 'VIDEO'">
        <video v-if="data.url" class="nodrag" :src="data.url" controls playsinline />
        <div v-else class="canvas-node-empty"><Video :size="28" /><span>{{ emptyCopy.title }}</span><small>{{ emptyCopy.hint }}</small></div>
      </template>
      <template v-else-if="data.kind === 'AUDIO'">
        <audio v-if="data.url" class="nodrag" :src="data.url" controls preload="metadata" />
        <div v-else class="canvas-node-empty"><Music2 :size="28" /><span>{{ emptyCopy.title }}</span><small>{{ emptyCopy.hint }}</small></div>
      </template>
      <div v-else-if="data.kind === 'CONFIG'" class="canvas-node-config">
        <Sparkles :size="20" />
        <span>{{ data.model || '跟随工作区模型' }}</span>
        <small>{{ data.prompt || '连接提示词和参考节点后开始生成' }}</small>
      </div>
      <div v-else class="canvas-node-group-label"><Layers3 :size="22" /><span>将相关节点放在这个区域内</span></div>

      <div v-if="data.status === 'QUEUED' || data.status === 'RUNNING'" class="canvas-node-job-state nodrag">
        <LoaderCircle class="canvas-spin" :size="20" />
        <strong>{{ data.status === 'QUEUED' ? '等待生成' : '正在生成' }}</strong>
        <button type="button" @click="emit('cancel')">取消任务</button>
      </div>
      <div v-else-if="data.status === 'FAILED' || data.status === 'CANCELLED'" class="canvas-node-job-state is-error nodrag">
        <CircleAlert :size="20" />
        <strong>{{ data.status === 'CANCELLED' ? '任务已取消' : '生成失败' }}</strong>
        <small>{{ data.error || '请检查模型与输入后重试' }}</small>
        <button type="button" @click="emit('retry')"><RefreshCw :size="13" />重新生成</button>
      </div>
    </div>

    <div v-if="composerVisible" class="canvas-node-prompt-composer nodrag nowheel" @mousedown.stop @pointerdown.stop>
      <textarea :value="data.prompt || ''" rows="3" :placeholder="composerPlaceholder" :aria-label="data.kind === 'TEXT' ? '文本生成说明' : '生成提示词'" @focus="emit('checkpoint')" @input="updatePrompt" />
      <div class="canvas-node-prompt-actions">
        <div class="canvas-node-prompt-meta">
          <div class="canvas-node-model-select" data-canvas-no-zoom>
            <button ref="modelTrigger" type="button" :disabled="!models.length" :aria-expanded="modelOpen" :aria-label="`选择模型，当前为${selectedModelLabel}`" :title="`模型：${selectedModelLabel}`" @click="toggleModelPicker">
              <ModelBadge v-if="selectedCatalogModel" :model="selectedCatalogModel" size="sm" />
              <span>{{ selectedModelLabel }}</span>
              <ChevronDown :size="13" />
            </button>
          </div>
          <button v-if="data.kind !== 'TEXT'" type="button" class="canvas-node-generation-summary" :title="generationSummary || '打开生成参数'" aria-label="打开生成参数" @click="emit('configure')">
            <SlidersHorizontal :size="13" />
            <span>{{ generationSummary || (data.kind === 'IMAGE' ? '1K · 正方形 · 标准' : '720p · 5 秒') }}</span>
            <ChevronDown :size="12" />
          </button>
        </div>
        <button type="button" class="canvas-node-run-button" :disabled="data.status === 'QUEUED' || data.status === 'RUNNING'" :title="data.kind === 'TEXT' ? '生成或改写文本' : '开始生成'" :aria-label="data.kind === 'TEXT' ? '生成或改写文本' : '开始生成'" @click="emit('run')"><Sparkles :size="14" /><span>生成</span></button>
      </div>
    </div>
    <Teleport to="body">
      <div v-if="modelOpen" class="canvas-agent-model-picker canvas-agent-model-picker--floating" :style="modelPopoverStyle" @click.stop>
        <ModelCatalogPicker :models="models" :model-value="selectedModel" title="选择模型" @select="chooseModel" @close="modelOpen = false" />
      </div>
    </Teleport>

    <Handle type="source" :position="Position.Right" class="canvas-node-handle canvas-node-handle--source" />
    <button
      v-if="data.kind !== 'GROUP'"
      type="button"
      class="canvas-node-extend nodrag nopan"
      title="从这里继续创建"
      aria-label="从这里继续创建节点"
      @mousedown.stop
      @pointerdown.stop
      @click.stop="emit('extend', $event)"
    >
      <Plus :size="14" />
    </button>
  </article>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import { NodeResizer, type OnResizeStart } from '@vue-flow/node-resizer'
import { ChevronDown, Clapperboard, CircleAlert, Copy, Crop, Download, FileText, GitBranchPlus, Image as ImageIcon, ImagePlus, Layers3, LoaderCircle, Minus, Music2, Plus, RefreshCw, Settings2, SlidersHorizontal, Sparkles, Trash2, Upload, Video } from 'lucide-vue-next'
import type { CanvasNodeData } from '../types/canvas'
import { nextCanvasFontSize } from '../utils/canvas-text'
import { canvasEmptyMediaCopy, canvasPromptComposerVisible } from '../utils/canvas-node-ui'
import { resolveCatalogModel, type CatalogModel } from '../utils/model-catalog'
import { useEscapeClose } from '../composables/useEscapeClose'
import ModelCatalogPicker from './ModelCatalogPicker.vue'
import ModelBadge from './common/ModelBadge.vue'

const props = defineProps<{ data: CanvasNodeData; selected?: boolean; models?: CatalogModel[]; activeModel?: string; generationSummary?: string }>()
const emit = defineEmits<{
  update: [patch: Partial<CanvasNodeData>]
  remove: []
  duplicate: []
  checkpoint: []
  resize: [size: { width: number; height: number }]
  pick: []
  cancel: []
  retry: []
  context: [event: MouseEvent]
  configure: []
  derive: [kind: 'IMAGE' | 'VIDEO']
  run: []
  download: []
  edit: []
  extend: [event: MouseEvent]
}>()

const kindLabel = computed(() => ({ TEXT: '文本', IMAGE: '图片', VIDEO: '视频', AUDIO: '音频', GROUP: '分组', CONFIG: '生成设置' })[props.data.kind])
const nodeIcon = computed(() => ({ TEXT: FileText, IMAGE: ImageIcon, VIDEO: Video, AUDIO: Music2, GROUP: Layers3, CONFIG: Settings2 })[props.data.kind])
const models = computed(() => props.models || [])
const generationSummary = computed(() => props.generationSummary || '')
const selectedCatalogModel = computed(() => resolveCatalogModel(models.value, props.activeModel || props.data.model || ''))
const selectedModel = computed(() => selectedCatalogModel.value?.key || props.activeModel || models.value[0]?.key || '')
const selectedModelLabel = computed(() => selectedCatalogModel.value?.displayName || models.value[0]?.displayName || '暂无可用模型')
const fontSize = computed(() => nextCanvasFontSize(props.data.fontSize, 0))
const composerVisible = computed(() => canvasPromptComposerVisible(props.data.kind, Boolean(props.selected)))
const emptyCopy = computed(() => canvasEmptyMediaCopy(props.data.kind === 'VIDEO' ? 'VIDEO' : props.data.kind === 'AUDIO' ? 'AUDIO' : 'IMAGE'))
const composerPlaceholder = computed(() => {
  if (props.data.kind === 'TEXT') return props.data.content.trim() ? '描述想把这段文本改写成什么' : '描述想生成的文本内容'
  return props.data.kind === 'IMAGE' ? '描述要生成的图片内容' : '描述要生成的视频内容'
})
const modelOpen = ref(false)
const textEditing = ref(false)
const modelTrigger = ref<HTMLButtonElement | null>(null)
const modelPopoverStyle = ref<Record<string, string>>({})

useEscapeClose(() => { modelOpen.value = false }, { enabled: () => modelOpen.value })

watch(() => props.selected, (selected) => {
  if (!selected) {
    modelOpen.value = false
    textEditing.value = false
  }
})

function toggleModelPicker() {
  modelOpen.value = !modelOpen.value
  if (modelOpen.value) void nextTick(placeModelPicker)
}

function placeModelPicker() {
  if (!modelOpen.value || !modelTrigger.value) return
  const anchor = modelTrigger.value.getBoundingClientRect()
  const edge = 12
  const width = Math.min(704, window.innerWidth - edge * 2)
  const height = Math.min(460, window.innerHeight - edge * 2)
  const openAbove = anchor.top - edge >= height || anchor.top >= window.innerHeight - anchor.bottom
  const top = openAbove
    ? Math.max(edge, anchor.top - 8 - height)
    : Math.min(window.innerHeight - edge - height, anchor.bottom + 8)
  const left = Math.min(Math.max(edge, anchor.left), Math.max(edge, window.innerWidth - width - edge))
  modelPopoverStyle.value = {
    left: `${Math.round(left)}px`,
    top: `${Math.round(top)}px`,
    width: `${Math.round(width)}px`,
  }
}

function chooseModel(value: string) {
  emit('checkpoint')
  emit('update', { model: value, generationOptions: {} })
  modelOpen.value = false
}

function closeModelPickerOnOutside(event: PointerEvent) {
  const target = event.target as HTMLElement | null
  if (target?.closest('.canvas-node-model-select, .canvas-agent-model-picker')) return
  modelOpen.value = false
}

onMounted(() => document.addEventListener('pointerdown', closeModelPickerOnOutside))
onBeforeUnmount(() => document.removeEventListener('pointerdown', closeModelPickerOnOutside))

function updateContent(event: Event) {
  emit('update', { content: (event.target as HTMLTextAreaElement).value })
}

function updatePrompt(event: Event) {
  emit('update', { prompt: (event.target as HTMLTextAreaElement).value })
}

function changeFontSize(delta: number) {
  emit('checkpoint')
  emit('update', { fontSize: nextCanvasFontSize(props.data.fontSize, delta) })
}

function handleResizeEnd(event: OnResizeStart) {
  emit('resize', { width: event.params.width, height: event.params.height })
}
</script>
