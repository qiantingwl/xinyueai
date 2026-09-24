<template>
  <section class="studio-index-page image-prompt-page">
    <div class="index-page-inner image-prompt-inner">
      <WorkspaceSectionTabs active="image-prompts" />

      <header class="index-page-header image-prompt-header">
        <div class="index-page-title"><h1>图片反推</h1><p>从参考图片提取可直接用于生成的提示词。</p></div>
        <div class="image-prompt-guide-wrap">
          <button
            class="image-prompt-guide-button"
            type="button"
            aria-controls="image-prompt-guide"
            :aria-expanded="guideOpen"
            @click="guideOpen = !guideOpen"
          >
            <History :size="15" />使用历史与提示<ChevronDown :size="14" :class="{ 'is-open': guideOpen }" />
          </button>
          <aside v-if="guideOpen" id="image-prompt-guide" class="image-prompt-guide" @keydown.esc="guideOpen = false">
            <header><div><CircleHelp :size="17" /><strong>使用提示</strong></div><button type="button" aria-label="关闭使用提示" @click="guideOpen = false"><X :size="16" /></button></header>
            <ul><li>优先上传主体清晰、构图完整的原图。</li><li>不同提取方式会使用同一张图片重新分析。</li><li>生成后可复制结果，或直接带到图片生成页。</li></ul>
            <footer><WalletCards :size="14" /><span>{{ billingLabel }}</span></footer>
          </aside>
        </div>
      </header>

      <div v-if="settingsLoaded && !featureEnabled" class="image-prompt-disabled" role="status">
        <CircleAlert :size="20" /><div><strong>图片反推暂未开放</strong><span>管理员可以在业务系统配置中启用此能力。</span></div>
      </div>

      <div v-else class="image-prompt-workbench">
        <section class="image-prompt-input-panel">
          <header><div><span>01</span><strong>参考图片</strong></div><button type="button" @click="libraryOpen = true"><FolderOpen :size="15" />文件库</button></header>
          <button
            type="button"
            class="image-prompt-dropzone"
            :class="{ 'has-image': asset, 'is-dragging': dragging }"
            :aria-label="asset ? '更换参考图片' : '上传参考图片'"
            @click="fileInput?.click()"
            @dragenter.prevent="dragging = true"
            @dragover.prevent="dragging = true"
            @dragleave.prevent="dragging = false"
            @drop.prevent="dropFile"
          >
            <template v-if="asset">
              <img :src="asset.contentUrl" :alt="asset.name" />
              <span class="image-prompt-image-overlay"><RefreshCw :size="16" />更换图片</span>
              <span class="image-prompt-image-name">{{ asset.name }}</span>
            </template>
            <template v-else>
              <span class="image-prompt-upload-icon"><ImagePlus :size="28" /></span>
              <strong>{{ uploading ? '正在上传' : '拖入或选择一张图片' }}</strong>
              <small>JPG、PNG、WebP、GIF、AVIF，最大 20 MB</small>
              <span><Upload :size="15" />选择图片</span>
            </template>
          </button>
          <input ref="fileInput" hidden type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif" @change="selectFile" />

          <header class="image-prompt-section-heading"><div><span>02</span><strong>提取方式</strong></div></header>
          <div class="image-prompt-modes" role="radiogroup" aria-label="提示词提取方式">
            <button v-for="item in modes" :key="item.value" type="button" role="radio" :aria-checked="mode === item.value" :class="{ 'is-active': mode === item.value }" :disabled="running" @click="mode = item.value">
              <component :is="item.icon" :size="16" /><span><strong>{{ item.label }}</strong><small>{{ item.note }}</small></span>
            </button>
          </div>

          <div class="image-prompt-controls">
            <label><span>输出语言</span><select v-model="language" :disabled="running"><option value="zh-CN">简体中文</option><option value="en-US">English</option><option value="ja-JP">日本語</option></select></label>
            <button class="image-prompt-run" type="button" :disabled="!asset || uploading || running" @click="extractPrompt">
              <LoaderCircle v-if="running" class="image-prompt-spin" :size="17" /><ScanText v-else :size="17" />{{ running ? '正在分析图片' : '开始反推' }}
            </button>
          </div>
        </section>

        <section class="image-prompt-result-panel" aria-live="polite">
          <header>
            <div><span>03</span><strong>提示词结果</strong></div>
            <div v-if="result"><button type="button" title="复制提示词" @click="copyResult"><Check v-if="copied" :size="15" /><Copy v-else :size="15" />{{ copied ? '已复制' : '复制' }}</button></div>
          </header>

          <div v-if="running" class="image-prompt-progress">
            <span class="image-prompt-progress-visual"><ScanLine :size="30" /><i /></span>
            <strong>{{ status === 'QUEUED' ? '任务正在排队' : '视觉模型正在分析' }}</strong>
            <small>正在识别主体、构图、风格、光影与色彩</small>
            <button type="button" @click="cancelTask">取消任务</button>
          </div>
          <div v-else-if="error" class="image-prompt-error" role="alert">
            <CircleAlert :size="24" /><strong>{{ errorStage === 'upload' ? '上传失败' : '反推失败' }}</strong><p>{{ error }}</p><button type="button" :disabled="errorStage === 'extract' && !asset" @click="retryAfterError"><Upload v-if="errorStage === 'upload'" :size="15" /><RefreshCw v-else :size="15" />{{ errorStage === 'upload' ? '重新选择' : '重新提取' }}</button>
          </div>
          <div v-else-if="!result" class="image-prompt-empty">
            <ScanText :size="30" /><strong>等待提取</strong><span>选择图片和提取方式后，结果会显示在这里。</span>
          </div>
          <div v-else class="image-prompt-result">
            <div v-if="result.summary" class="image-prompt-summary"><Sparkles :size="15" /><span>{{ result.summary }}</span></div>
            <pre v-if="result.mode === 'JSON'">{{ jsonResult }}</pre>
            <template v-else>
              <section><span>正向提示词</span><p>{{ result.prompt }}</p></section>
              <section v-if="result.negativePrompt"><span>负向提示词</span><p>{{ result.negativePrompt }}</p></section>
              <dl v-if="structuredEntries.length" class="image-prompt-structured">
                <div v-for="entry in structuredEntries" :key="entry[0]"><dt>{{ structuredLabels[entry[0]] || entry[0] }}</dt><dd>{{ formatStructured(entry[1]) }}</dd></div>
              </dl>
              <div v-if="result.tags.length" class="image-prompt-tags"><span v-for="tag in result.tags" :key="tag">{{ tag }}</span></div>
            </template>
            <footer><span v-if="creditCost > 0">本次使用 {{ creditCost }} 创作点</span><span v-else>{{ billingLabel }}</span><button type="button" @click="useForGeneration"><WandSparkles :size="16" />用于图片生成<ArrowRight :size="15" /></button></footer>
          </div>
        </section>
      </div>
    </div>

    <CanvasMediaDialog v-if="libraryOpen" kind="IMAGE" @close="libraryOpen = false" @select="chooseAsset" />
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, type Component } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowRight, Braces, Check, ChevronDown, CircleAlert, CircleHelp, Copy, FileJson, FolderOpen, History, ImagePlus, Layers3, LoaderCircle, MessageSquareText, Palette, RefreshCw, ScanLine, ScanText, Sparkles, Upload, WalletCards, WandSparkles, X, Zap } from 'lucide-vue-next'
import CanvasMediaDialog, { type CanvasMediaAsset } from '../components/CanvasMediaDialog.vue'
import WorkspaceSectionTabs from '../components/WorkspaceSectionTabs.vue'
import { api, watchJobEvents } from '../services/api'
import { uploadAsset } from '../utils/asset-upload'
import { stageCreationPrompt } from '../utils/prompt-transfer'
import { useCopyFeedback } from '../composables/useCopyFeedback'

type ExtractionMode = 'GENERAL' | 'CONCISE' | 'STRUCTURED' | 'GRAPHIC_DESIGN' | 'JSON' | 'FLUX' | 'MIDJOURNEY' | 'STABLE_DIFFUSION'
type ExtractionResult = { prompt: string; negativePrompt: string; summary: string; tags: string[]; structured: Record<string, unknown>; raw: string; mode: ExtractionMode; language: string }
type ExtractionJob = { id: string; status: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED'; creditCost: number; errorMessage?: string | null; options: { imagePromptResult?: ExtractionResult } }
type PublicSettings = { imagePromptEnabled?: boolean; imagePromptBillingMode?: 'PLATFORM' | 'USER_CREDITS' | 'USER_BYOK' }

const router = useRouter()
const fileInput = ref<HTMLInputElement | null>(null)
const asset = ref<CanvasMediaAsset | null>(null)
const mode = ref<ExtractionMode>('GENERAL')
const language = ref('zh-CN')
const uploading = ref(false)
const dragging = ref(false)
const libraryOpen = ref(false)
const guideOpen = ref(false)
const settingsLoaded = ref(false)
const featureEnabled = ref(true)
const billingMode = ref<PublicSettings['imagePromptBillingMode']>('USER_CREDITS')
const jobId = ref('')
const status = ref<ExtractionJob['status'] | ''>('')
const result = ref<ExtractionResult | null>(null)
const error = ref('')
const errorStage = ref<'upload' | 'extract'>('extract')
const { copied, copy, reset: resetCopied } = useCopyFeedback(1800)
const creditCost = ref(0)

const modes: Array<{ value: ExtractionMode; label: string; note: string; icon: Component }> = [
  { value: 'GENERAL', label: '通用', note: '适用于大多数图片', icon: MessageSquareText },
  { value: 'CONCISE', label: '简洁', note: '提取核心关键词', icon: Zap },
  { value: 'STRUCTURED', label: '结构化', note: '提取结构与元素', icon: Layers3 },
  { value: 'GRAPHIC_DESIGN', label: '平面设计', note: '提取设计要素', icon: Palette },
  { value: 'JSON', label: 'JSON', note: '输出结构化数据', icon: FileJson },
  { value: 'FLUX', label: 'Flux', note: '适配 Flux 模型', icon: Sparkles },
  { value: 'MIDJOURNEY', label: 'Midjourney', note: '优化 MJ 提示词', icon: WandSparkles },
  { value: 'STABLE_DIFFUSION', label: 'Stable Diffusion', note: '适配 SD 模型', icon: Braces },
]
const structuredLabels: Record<string, string> = { subject: '主体', environment: '环境', visualStyle: '视觉风格', lighting: '光影', composition: '构图', camera: '镜头', colorPalette: '色彩', materials: '材质', details: '细节' }
const running = computed(() => status.value === 'QUEUED' || status.value === 'RUNNING')
const billingLabel = computed(() => billingMode.value === 'PLATFORM' ? '平台承担费用' : billingMode.value === 'USER_BYOK' ? '使用个人 API 密钥' : '使用用户创作点')
const structuredEntries = computed(() => Object.entries(result.value?.structured || {}).filter(([, value]) => value !== '' && (!Array.isArray(value) || value.length)))
const jsonResult = computed(() => result.value ? JSON.stringify({ prompt: result.value.prompt, negativePrompt: result.value.negativePrompt, summary: result.value.summary, tags: result.value.tags, structured: result.value.structured }, null, 2) : '')

onMounted(async () => {
  window.addEventListener('paste', pasteImage)
  try {
    const settings = await api<PublicSettings>('/catalog/settings')
    featureEnabled.value = settings.imagePromptEnabled !== false
    billingMode.value = settings.imagePromptBillingMode || 'USER_CREDITS'
  } catch { /* The protected task endpoint remains the final authority. */ }
  finally { settingsLoaded.value = true }
})
onUnmounted(() => window.removeEventListener('paste', pasteImage))

async function upload(file: File) {
  errorStage.value = 'upload'
  if (!file.type.startsWith('image/')) { error.value = '请选择图片文件'; return }
  if (file.size > 20 * 1024 * 1024) { error.value = '图片不能超过 20 MB'; return }
  uploading.value = true
  error.value = ''
  result.value = null
  try {
    asset.value = await uploadAsset<CanvasMediaAsset>(file, { kind: 'IMAGE', purpose: 'image-prompt' })
  } catch (reason) { error.value = reason instanceof Error ? reason.message : '图片上传失败' }
  finally { uploading.value = false }
}
function selectFile(event: Event) { const input = event.target as HTMLInputElement; const file = input.files?.[0]; if (file) void upload(file); input.value = '' }
function dropFile(event: DragEvent) { dragging.value = false; const file = event.dataTransfer?.files?.[0]; if (file) void upload(file) }
function pasteImage(event: ClipboardEvent) { const file = Array.from(event.clipboardData?.items || []).find((item) => item.type.startsWith('image/'))?.getAsFile(); if (file) { event.preventDefault(); void upload(file) } }
function chooseAsset(value: CanvasMediaAsset) { asset.value = value; libraryOpen.value = false; result.value = null; error.value = '' }

async function extractPrompt() {
  if (!asset.value || running.value) return
  errorStage.value = 'extract'
  error.value = ''; result.value = null; resetCopied(); creditCost.value = 0
  try {
    const created = await api<ExtractionJob>('/generations', { method: 'POST', body: JSON.stringify({ kind: 'CHAT', prompt: '分析图片并生成提示词', options: { taskType: 'IMAGE_PROMPT_EXTRACTION', assetId: asset.value.id, mode: mode.value, language: language.value }, idempotencyKey: `image-prompt:${asset.value.id}:${Date.now()}` }) })
    jobId.value = created.id; status.value = created.status
    let completed: ExtractionJob
    completed = await watchJobEvents<ExtractionJob>(`/generations/${created.id}/events`, `/generations/${created.id}`, {
      onUpdate: (job) => { status.value = job.status; creditCost.value = job.creditCost },
    })
    applyJob(completed)
  } catch (reason) { status.value = 'FAILED'; error.value = reason instanceof Error ? reason.message : '图片反推失败' }
}
function applyJob(job: ExtractionJob) { status.value = job.status; creditCost.value = job.creditCost; if (job.status === 'SUCCEEDED' && job.options.imagePromptResult) result.value = job.options.imagePromptResult; else error.value = job.errorMessage || (job.status === 'CANCELLED' ? '任务已取消' : '视觉模型没有返回可用结果') }
async function cancelTask() { if (!jobId.value) return; try { applyJob(await api<ExtractionJob>(`/generations/${jobId.value}/cancel`, { method: 'POST', body: '{}' })) } catch (reason) { error.value = reason instanceof Error ? reason.message : '取消任务失败' } }
function retryAfterError() { if (errorStage.value === 'upload') fileInput.value?.click(); else void extractPrompt() }
function copyResult() { if (!result.value) return; void copy(result.value.mode === 'JSON' ? jsonResult.value : result.value.prompt) }
function useForGeneration() { if (!result.value) return; stageCreationPrompt({ type: 'IMAGE', prompt: result.value.prompt, title: result.value.summary || '图片反推提示词', sourceName: '图片反推' }); void router.push('/image') }
function formatStructured(value: unknown) { return Array.isArray(value) ? value.join('、') : String(value || '') }
</script>
