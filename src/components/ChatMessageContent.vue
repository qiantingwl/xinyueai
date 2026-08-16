<template>
  <div class="chat-markdown">
    <template v-for="block in blocks" :key="block.key">
      <ChatCodeBlock v-if="block.kind === 'code'" :code="block.code" :language="block.language" @preview="emit('preview', $event)" />
      <div v-else class="markdown-segment" v-html="block.html" />
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import DOMPurify from 'dompurify'
import { marked, type Token } from 'marked'
import type { CodeArtifact } from '../types'
import ChatCodeBlock from './ChatCodeBlock.vue'

const props = defineProps<{ content: string }>()
const emit = defineEmits<{ preview: [artifact: CodeArtifact] }>()
const tokens = computed(() => marked.lexer(props.content, { gfm: true, breaks: true }) as Token[])

type RenderBlock =
  | { key: string; kind: 'code'; code: string; language?: string }
  | { key: string; kind: 'markdown'; html: string }

const blocks = computed<RenderBlock[]>(() => {
  const result: RenderBlock[] = []
  let markdownTokens: Token[] = []
  let blockIndex = 0

  const flushMarkdown = () => {
    if (!markdownTokens.length) return
    const html = marked.parser(markdownTokens, { gfm: true, breaks: true })
    result.push({
      key: `markdown-${blockIndex++}`,
      kind: 'markdown',
      html: DOMPurify.sanitize(String(html), {
        USE_PROFILES: { html: true },
        ADD_TAGS: ['img'],
        ADD_ATTR: ['src', 'alt', 'title', 'width', 'height', 'loading'],
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
