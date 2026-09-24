<template>
  <div class="chat-markdown">
    <template v-for="block in blocks" :key="block.key">
      <ChatCodeBlock v-if="block.kind === 'code'" :code="block.code" :language="block.language" @preview="emit('preview', $event)" />
      <div v-else class="markdown-segment" v-html="block.html" />
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import DOMPurify from 'dompurify'
import { Marked, type Token } from 'marked'
import type { CodeArtifact } from '../types'
import ChatCodeBlock from './ChatCodeBlock.vue'

// 注意：不能给 lexer/parser 传 options（会丢掉 use 注册的扩展），gfm/breaks 在构造时传入
const md = new Marked({ gfm: true, breaks: true })
const katexReady = ref(false)
let katexLoading: Promise<void> | null = null
const MATH_HINT = /(?:\\\[|\\\(|\$\$|\$[^$\n]{1,400}\$)/

async function ensureKatex() {
  if (katexReady.value) return
  if (!katexLoading) {
    katexLoading = Promise.all([
      import('marked-katex-extension'),
      import('katex/dist/katex.min.css'),
    ]).then(([mod]) => {
      const plugin = 'default' in mod && mod.default ? mod.default : mod
      md.use((plugin as typeof import('marked-katex-extension').default)({ throwOnError: false, nonStandard: true }))
      katexReady.value = true
    })
  }
  await katexLoading
}

// 模型常输出 \(...\) / \[...\] 形式的公式，marked-katex-extension 只认 $...$ / $$...$$，
// 这里在跳过代码块的前提下统一转成美元分隔符
const normalizeMathDelimiters = (src: string): string => {
  const CODE_SEGMENT = /(```[\s\S]*?(?:```|$)|`[^`\n]*`)/g
  return src
    .split(CODE_SEGMENT)
    .map((segment, index) => {
      if (index % 2 === 1) return segment // 代码片段原样保留
      return segment
        .replace(/\\\[([\s\S]+?)\\\]/g, (_m, tex: string) => `$$${tex}$$`)
        .replace(/\\\(([\s\S]+?)\\\)/g, (_m, tex: string) => `$${tex}$`)
    })
    .join('')
}

const props = defineProps<{ content: string }>()
const emit = defineEmits<{ preview: [artifact: CodeArtifact] }>()
watch(() => props.content, (content) => {
  if (MATH_HINT.test(content)) void ensureKatex()
}, { immediate: true })
const tokens = computed(() => {
  void katexReady.value
  return md.lexer(normalizeMathDelimiters(props.content)) as Token[]
})

type RenderBlock =
  | { key: string; kind: 'code'; code: string; language?: string }
  | { key: string; kind: 'markdown'; html: string }

const blocks = computed<RenderBlock[]>(() => {
  const result: RenderBlock[] = []
  let markdownTokens: Token[] = []
  let blockIndex = 0

  const flushMarkdown = () => {
    if (!markdownTokens.length) return
    const html = md.parser(markdownTokens)
    result.push({
      key: `markdown-${blockIndex++}`,
      kind: 'markdown',
      html: DOMPurify.sanitize(String(html), {
        USE_PROFILES: { html: true, mathMl: true, svg: true, svgFilters: true },
        ADD_TAGS: ['img'],
        ADD_ATTR: ['src', 'alt', 'title', 'width', 'height', 'loading', 'aria-hidden'],
        ALLOW_DATA_ATTR: false,
      }),
    })
    markdownTokens = []
  }

  for (const token of tokens.value) {
    if (token.type !== 'code') {
      markdownTokens.push(token)
      continue
    }
    flushMarkdown()
    result.push({
      key: `code-${blockIndex++}`,
      kind: 'code',
      code: token.text || '',
      language: token.lang,
    })
  }
  flushMarkdown()
  return result
})
</script>
