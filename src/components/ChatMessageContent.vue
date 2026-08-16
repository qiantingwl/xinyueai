<template>
  <div class="chat-markdown">
    <template v-for="(token, index) in tokens" :key="`${token.type}-${index}-${token.raw?.slice(0, 12)}`">
      <ChatCodeBlock v-if="token.type === 'code'" :code="token.text || ''" :language="token.lang" @preview="emit('preview', $event)" />
      <div v-else class="markdown-segment" v-html="renderToken(token)" />
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

function renderToken(token: Token) {
  const html = marked.parser([token], { gfm: true, breaks: true })
  return DOMPurify.sanitize(String(html), {
    USE_PROFILES: { html: true },
    ADD_TAGS: ['img'],
    ADD_ATTR: ['src', 'alt', 'title', 'width', 'height', 'loading'],
    ALLOW_DATA_ATTR: false,
  })
}
</script>
