<template>
  <div class="legal-page">
    <header class="legal-header">
      <RouterLink class="legal-brand" to="/" aria-label="Xinyue AI 首页"><span>X</span><strong>Xinyue AI</strong></RouterLink>
      <nav aria-label="公开信息导航">
        <RouterLink v-for="item in pages" :key="item.name" :to="item.path" :class="{ 'is-active': page?.slug === item.name }">{{ item.label }}</RouterLink>
      </nav>
      <RouterLink class="legal-workspace-link" to="/chat">进入工作台<ArrowRight :size="16" /></RouterLink>
    </header>

    <main class="legal-main">
      <aside class="legal-aside">
        <RouterLink class="legal-back" to="/"><ArrowLeft :size="15" />返回首页</RouterLink>
        <nav aria-label="本文目录">
          <a v-for="section in sections" :key="section.id" :href="`#${section.id}`">{{ section.title }}</a>
        </nav>
      </aside>

      <article v-if="page" class="legal-document">
        <header>
          <span>{{ page.category }}</span>
          <h1>{{ page.title }}</h1>
          <p>{{ page.summary }}</p>
          <time :datetime="page.updatedAt">更新日期：{{ formatDate(page.updatedAt) }}</time>
        </header>

        <section v-for="(section, index) in sections" :id="section.id" :key="section.id">
          <span>{{ String(index + 1).padStart(2, '0') }}</span>
          <div class="legal-cms-content">
            <h2>{{ section.title }}</h2>
            <div v-html="section.html" />
          </div>
        </section>
      </article>
      <article v-else class="legal-document legal-document--empty"><header><span>PUBLIC CONTENT</span><h1>{{ loading ? '正在加载' : '内容暂不可用' }}</h1><p>{{ error || '请稍后刷新页面。' }}</p></header></article>
    </main>

    <footer class="legal-footer">
      <span>© 2026 Xinyue AI. 保留所有权利。</span>
      <nav><RouterLink to="/about">关于我们</RouterLink><RouterLink to="/copyright">版权说明</RouterLink><RouterLink to="/terms">用户协议</RouterLink><RouterLink to="/privacy">隐私政策</RouterLink></nav>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ArrowLeft, ArrowRight } from 'lucide-vue-next'
import DOMPurify from 'dompurify'
import { api } from '../services/api'
import { formatLongDay } from '../utils/datetime'

type ContentPage = { slug: string; title: string; category: string; summary: string; contentHtml: string; publishedAt?: string | null; updatedAt: string }
type ContentSummary = Pick<ContentPage, 'slug' | 'title' | 'category'>
type Section = { id: string; title: string; html: string }

const routePages = [
  { name: 'about', label: '关于我们', path: '/about' },
  { name: 'copyright', label: '版权说明', path: '/copyright' },
  { name: 'terms', label: '用户协议', path: '/terms' },
  { name: 'privacy', label: '隐私政策', path: '/privacy' },
]

const route = useRoute()
const page = ref<ContentPage | null>(null)
const summaries = ref<ContentSummary[]>([])
const loading = ref(false)
const error = ref('')
let requestVersion = 0

const pages = computed(() => routePages.map((item) => ({ ...item, label: summaries.value.find((page) => page.slug === item.name)?.title || item.label })).filter((item) => !summaries.value.length || summaries.value.some((page) => page.slug === item.name)))
const sections = computed<Section[]>(() => parseSections(page.value?.contentHtml || ''))

watch(() => route.name, async (name) => {
  const slug = String(name || 'about')
  const version = ++requestVersion
  loading.value = true; error.value = ''; page.value = null
  try {
    const [items, detail] = await Promise.all([api<ContentSummary[]>('/content-pages'), api<ContentPage>(`/content-pages/${encodeURIComponent(slug)}`)])
    if (version !== requestVersion) return
    summaries.value = items.filter((item) => item.category === '法律与品牌' || routePages.some((routePage) => routePage.name === item.slug))
    page.value = detail
  } catch (reason) {
    if (version === requestVersion) error.value = reason instanceof Error ? reason.message : '公开内容加载失败'
  } finally { if (version === requestVersion) loading.value = false }
}, { immediate: true })

function parseSections(html: string): Section[] {
  if (!html) return []
  const sanitized = DOMPurify.sanitize(html, { ALLOWED_TAGS: ['h2', 'h3', 'h4', 'p', 'ul', 'ol', 'li', 'strong', 'em', 'blockquote', 'a', 'br', 'hr', 'code', 'pre'], ALLOWED_ATTR: ['id', 'href', 'target', 'rel', 'class'] })
  const document = new DOMParser().parseFromString(sanitized, 'text/html')
  const result: Section[] = []
  let current: Section | null = null
  for (const child of [...document.body.children]) {
    if (child.tagName === 'H2') {
      const title = child.textContent?.trim() || '未命名章节'
      const id = uniqueSectionId(child.id || slugify(title), result)
      current = { id, title, html: '' }
      result.push(current)
    } else if (current) current.html += child.outerHTML
  }
  if (!result.length && document.body.innerHTML.trim()) result.push({ id: 'content', title: page.value?.title || '正文', html: document.body.innerHTML })
  return result
}

function slugify(value: string) { return value.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-').replace(/^-|-$/g, '') || 'section' }
function uniqueSectionId(base: string, rows: Section[]) { let id = base; let index = 2; while (rows.some((row) => row.id === id)) id = `${base}-${index++}`; return id }
function formatDate(value: string) { return formatLongDay(value, value) }
</script>
