<template>
  <main ref="pageElement" class="prompt-library-page">
    <div class="prompt-library-inner">
      <header class="prompt-library-header">
        <div>
          <h1>提示词库</h1>
          <p>{{ loading && !items.length ? `正在加载${activeTypeMeta.label}提示词` : `${total.toLocaleString('zh-CN')} 条${activeTypeMeta.label}提示词` }}</p>
        </div>
        <label><Search :size="17" /><input v-model="query" :placeholder="`搜索${activeTypeMeta.label}提示词、标题或标签`" /></label>
      </header>

      <nav class="prompt-library-type-tabs" :class="{ 'is-video': activeType === 'VIDEO' }" aria-label="提示词类型">
        <button v-for="item in promptTypes" :key="item.value" type="button" :class="{ active: activeType === item.value }" :aria-pressed="activeType === item.value" @click="selectPromptType(item.value)">
          <span>{{ item.label }}</span><em>{{ item.description }}</em>
        </button>
      </nav>

      <div v-if="error" class="prompt-library-error" role="alert"><CircleAlert :size="17" /><span>{{ error }}</span><button type="button" @click="loadPage(page)">重试</button></div>

      <div class="prompt-library-layout">
        <aside class="prompt-library-filters">
          <section>
            <strong>分类</strong>
            <button type="button" :aria-pressed="!sourceId" :class="{ active: !sourceId }" @click="selectSource('')"><span>全部{{ activeTypeMeta.label }}提示词</span><em>{{ loading && !sources.length ? '...' : sourceTotal }}</em></button>
            <div v-if="loading && !sources.length" class="prompt-library-filter-skeleton"><i v-for="index in 5" :key="index" /></div>
            <button v-for="source in sources" :key="source.id" type="button" :aria-pressed="sourceId === source.id" :class="{ active: sourceId === source.id }" @click="selectSource(source.id)"><span>{{ source.name }}</span><em>{{ source.count }}</em></button>
          </section>
          <section v-if="tags.length">
            <strong>热门标签</strong>
            <button type="button" :aria-pressed="!tag" :class="{ active: !tag }" @click="tag = ''"><span>全部标签</span></button>
            <button v-for="item in tags.slice(0, 24)" :key="item.name" type="button" :aria-pressed="tag === item.name" :class="{ active: tag === item.name }" @click="tag = item.name"><span>{{ item.name }}</span><em>{{ item.count }}</em></button>
          </section>
        </aside>

        <section class="prompt-library-results" aria-live="polite" :aria-busy="loading">
          <div v-if="loading && !items.length" class="prompt-library-grid prompt-library-grid--skeleton" aria-label="正在加载提示词"><article v-for="index in 8" :key="index"><i /><span /><span /><span /></article></div>
          <div v-else-if="!items.length" class="prompt-library-empty"><FileText :size="28" /><strong>没有找到提示词</strong><button type="button" @click="clearFilters">清除筛选</button></div>
          <div v-else class="prompt-library-grid" :class="`is-${activeType.toLowerCase()}`">
            <article v-for="item in items" :key="item.id" class="prompt-library-card" :class="`is-${item.promptType.toLowerCase()}`">
              <button class="prompt-library-card__open" type="button" :aria-label="`查看 ${item.title}`" @click="selected = item">
                <span class="prompt-library-card__media">
                  <video v-if="item.promptType === 'VIDEO' && item.previewVideoUrl && !brokenMedia.has(item.id)" :src="item.previewVideoUrl" :poster="item.coverUrl" muted loop playsinline preload="metadata" :aria-label="`${item.title} 视频预览`" @mouseenter="playPreview" @mouseleave="pausePreview" @error="markMediaBroken(item.id)" />
                  <img v-else-if="item.coverUrl && !brokenMedia.has(item.id)" :src="item.coverUrl" :alt="item.title" loading="lazy" referrerpolicy="no-referrer" @error="markMediaBroken(item.id)" />
                  <Video v-else-if="item.promptType === 'VIDEO'" :size="28" />
                  <ImageIcon v-else :size="28" />
                  <i v-if="item.promptType === 'VIDEO'" class="prompt-library-card__play"><Play :size="17" fill="currentColor" /></i>
                </span>
                <span class="prompt-library-card__body">
                  <span class="prompt-library-card__heading"><strong>{{ item.title }}</strong><small>{{ item.sourceName }}</small></span>
                  <span class="prompt-library-card__prompt">{{ item.description || compactPrompt(item.prompt) }}</span>
                  <span v-if="item.tags.length" class="prompt-library-card__tags"><em v-for="itemTag in item.tags.slice(0, 3)" :key="itemTag">{{ itemTag }}</em></span>
                </span>
              </button>
              <footer>
                <button type="button" :title="copiedId === item.id ? '已复制' : '复制提示词'" @click="copyPrompt(item)"><Check v-if="copiedId === item.id" :size="15" /><Copy v-else :size="15" /><span>{{ copiedId === item.id ? '已复制' : '复制' }}</span></button>
                <button class="primary" type="button" :title="activeTypeMeta.useLabel" @click="usePrompt(item)"><component :is="activeTypeMeta.icon" :size="15" /><span>使用</span></button>
              </footer>
            </article>
          </div>
          <nav v-if="total > pageSize" class="prompt-library-pagination" aria-label="提示词分页">
            <button type="button" :disabled="loading || page <= 1" @click="loadPage(page - 1, true)"><ChevronLeft :size="16" />上一页</button>
            <span>第 {{ page }} / {{ pageCount }} 页</span>
            <button type="button" :disabled="loading || page >= pageCount" @click="loadPage(page + 1, true)">下一页<ChevronRight :size="16" /></button>
          </nav>
        </section>
      </div>
    </div>
  </main>

  <Teleport to="body">
    <div v-if="selected" class="prompt-library-modal-layer" @mousedown.self="selected = null">
      <article class="prompt-library-modal" :class="`is-${selected.promptType.toLowerCase()}`" role="dialog" aria-modal="true" :aria-label="selected.title">
        <header><div><strong>{{ selected.title }}</strong><span>{{ selected.sourceName }}<template v-if="selected.author"> · {{ selected.author }}</template></span></div><button type="button" title="关闭" aria-label="关闭" @click="selected = null"><X :size="18" /></button></header>
        <div class="prompt-library-modal__content">
          <video v-if="selected.promptType === 'VIDEO' && selected.previewVideoUrl && !brokenMedia.has(selected.id)" class="prompt-library-modal__image" :src="selected.previewVideoUrl" :poster="selected.coverUrl" controls playsinline preload="metadata" @error="markMediaBroken(selected.id)" />
          <img v-else-if="selected.coverUrl && !brokenMedia.has(selected.id)" class="prompt-library-modal__image" :src="selected.coverUrl" :alt="selected.title" referrerpolicy="no-referrer" @error="markMediaBroken(selected.id)" />
          <section><div class="prompt-library-modal__tags"><span v-for="itemTag in selected.tags" :key="itemTag">{{ itemTag }}</span></div><p>{{ selected.prompt }}</p></section>
        </div>
        <footer><button type="button" @click="copyPrompt(selected)"><Copy :size="15" />复制提示词</button><button class="primary" type="button" @click="usePrompt(selected)"><component :is="typeMeta(selected.promptType).icon" :size="15" />{{ typeMeta(selected.promptType).useLabel }}</button></footer>
      </article>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Check, ChevronLeft, ChevronRight, CircleAlert, Copy, FileText, Image as ImageIcon, Play, Search, Video, X } from 'lucide-vue-next'
import { api } from '../services/api'
import { useAuthStore } from '../stores/auth'
import { stageCreationPrompt, type PromptTransferType } from '../utils/prompt-transfer'

type PromptType = Exclude<PromptTransferType, 'TEXT'>
type PromptItem = { id: string; sourceId: string; sourceName: string; promptType: PromptType; title: string; prompt: string; description: string; tags: string[]; author: string; imageModel: string; coverUrl: string; previewVideoUrl: string }
type Source = { id: string; name: string; count: number }
type PromptResponse = { items: PromptItem[]; total: number; page: number; pageSize: number; sources: Source[]; tags: Array<{ name: string; count: number }>; partial: boolean; promptType: PromptType }

const promptTypes = [
  { value: 'IMAGE' as const, label: '图片', description: '视觉与设计', icon: ImageIcon, useLabel: '用于图片生成' },
  { value: 'VIDEO' as const, label: '视频', description: '短片与运镜', icon: Video, useLabel: '用于视频生成' },
]

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const normalizeType = (value: unknown): PromptType => String(value).toUpperCase() === 'VIDEO' ? 'VIDEO' : 'IMAGE'
const activeType = ref<PromptType>(normalizeType(route.query.type))
const activeTypeMeta = computed(() => typeMeta(activeType.value))
const pageElement = ref<HTMLElement | null>(null)
const items = ref<PromptItem[]>([])
const sources = ref<Source[]>([])
const tags = ref<Array<{ name: string; count: number }>>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(24)
const query = ref('')
const sourceId = ref('')
const tag = ref('')
const loading = ref(true)
const error = ref('')
const selected = ref<PromptItem | null>(null)
const copiedId = ref('')
const brokenMedia = ref(new Set<string>())
const sourceTotal = computed(() => sources.value.reduce((sum, source) => sum + source.count, 0))
const pageCount = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)))
let requestSequence = 0
let searchTimer = 0

function typeMeta(type: PromptType) { return promptTypes.find((item) => item.value === type) || promptTypes[0] }
function cacheKey(type: PromptType) { return `xinyue:prompt-library:${type.toLowerCase()}:v3` }
function readCache(type: PromptType): PromptResponse | null {
  try {
    const entry = JSON.parse(sessionStorage.getItem(cacheKey(type)) || 'null') as { savedAt: number; data: PromptResponse } | null
    return entry?.data && Date.now() - entry.savedAt < 5 * 60 * 1000 && entry.data.promptType === type ? entry.data : null
  } catch { return null }
}
function applyResult(result: PromptResponse) {
  items.value = result.items
  sources.value = result.sources
  tags.value = result.tags
  total.value = result.total
  page.value = result.page
  pageSize.value = result.pageSize
}

async function loadPage(nextPage = 1, scroll = false) {
  const sequence = ++requestSequence
  loading.value = true
  error.value = ''
  try {
    const params = new URLSearchParams({ type: activeType.value, page: String(nextPage), pageSize: String(pageSize.value) })
    if (query.value.trim()) params.set('q', query.value.trim())
    if (sourceId.value) params.set('source', sourceId.value)
    if (tag.value) params.set('tag', tag.value)
    const result = await api<PromptResponse>(`/prompt-library?${params}`)
    if (sequence !== requestSequence) return
    applyResult(result)
    if (result.partial && !result.items.length) error.value = '部分提示词分类暂时不可用'
    if (nextPage === 1 && !query.value.trim() && !sourceId.value && !tag.value) {
      try { sessionStorage.setItem(cacheKey(activeType.value), JSON.stringify({ savedAt: Date.now(), data: result })) } catch { /* Private browsing can disable storage. */ }
    }
    if (scroll) pageElement.value?.closest('.workspace-main')?.scrollTo({ top: 0, behavior: 'smooth' })
  } catch (reason) {
    if (sequence === requestSequence) error.value = reason instanceof Error ? reason.message : '提示词库加载失败'
  } finally {
    if (sequence === requestSequence) loading.value = false
  }
}

function selectPromptType(type: PromptType, syncRoute = true) {
  if (activeType.value === type && items.value.length) return
  activeType.value = type
  query.value = ''
  sourceId.value = ''
  tag.value = ''
  selected.value = null
  brokenMedia.value = new Set()
  const cached = readCache(type)
  if (cached) applyResult(cached)
  else { items.value = []; sources.value = []; tags.value = []; total.value = 0 }
  if (syncRoute) void router.replace({ query: { ...route.query, type: type.toLowerCase() } })
  void loadPage(1)
}

function selectSource(id: string) { sourceId.value = id; tag.value = '' }
function clearFilters() { query.value = ''; sourceId.value = ''; tag.value = '' }
function compactPrompt(prompt: string) { return prompt.replace(/\s+/g, ' ').slice(0, 210) }
function markMediaBroken(id: string) { brokenMedia.value = new Set(brokenMedia.value).add(id) }
function playPreview(event: MouseEvent) { void (event.currentTarget as HTMLVideoElement).play().catch(() => undefined) }
function pausePreview(event: MouseEvent) { const video = event.currentTarget as HTMLVideoElement; video.pause(); video.currentTime = 0 }
async function copyPrompt(item: PromptItem) { await navigator.clipboard.writeText(item.prompt); copiedId.value = item.id; window.setTimeout(() => { if (copiedId.value === item.id) copiedId.value = '' }, 1600) }
async function usePrompt(item: PromptItem) {
  const transfer = { type: item.promptType, prompt: item.prompt, title: item.title, sourceName: item.sourceName }
  stageCreationPrompt(transfer)
  selected.value = null
  const target = item.promptType === 'VIDEO' ? '/video' : '/image'
  if (auth.isAuthenticated) {
    await router.push({ path: target, query: { prompt: item.id }, state: { promptTransfer: transfer } })
    return
  }
  await router.push(`/login?redirect=${encodeURIComponent(`${target}?prompt=${item.id}`)}`)
}

watch(query, () => { window.clearTimeout(searchTimer); searchTimer = window.setTimeout(() => { void loadPage(1) }, 320) })
watch([sourceId, tag], () => { void loadPage(1) })
watch(() => route.query.type, (value) => { const type = normalizeType(value); if (type !== activeType.value) selectPromptType(type, false) })
onMounted(() => { const cached = readCache(activeType.value); if (cached) applyResult(cached); void loadPage(1) })
</script>
