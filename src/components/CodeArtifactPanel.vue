<template>
  <aside class="code-artifact-panel" aria-label="代码预览">
    <header class="artifact-header">
      <div class="artifact-tabs" role="tablist" aria-label="预览模式">
        <button type="button" role="tab" :aria-selected="tab === 'preview'" :class="{ active: tab === 'preview' }" @click="tab = 'preview'">预览</button>
        <button type="button" role="tab" :aria-selected="tab === 'code'" :class="{ active: tab === 'code' }" @click="tab = 'code'">代码</button>
      </div>
      <strong :title="artifact.title">{{ artifact.title }}</strong>
      <nav aria-label="预览操作">
        <button type="button" :title="copied ? '已复制' : '复制代码'" aria-label="复制代码" @click="copyCode"><Check v-if="copied" :size="17" /><Copy v-else :size="17" /></button>
        <button type="button" title="下载文件" aria-label="下载文件" @click="downloadCode"><Download :size="17" /></button>
        <button type="button" title="关闭预览" aria-label="关闭预览" @click="emit('close')"><X :size="19" /></button>
      </nav>
    </header>
    <div v-if="tab === 'preview'" class="artifact-preview-stage">
      <iframe :key="documentContent" :title="artifact.title" :srcdoc="documentContent" sandbox="allow-scripts allow-forms allow-modals" />
    </div>
    <div v-else class="artifact-code-stage">
      <div class="artifact-code-label"><span>{{ languageLabel(artifact.language) }}</span><small>{{ lineCount }} 行</small></div>
      <pre><code :class="`language-${normalizedLanguage(artifact.language)}`" v-html="highlighted" /></pre>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { Check, Copy, Download, X } from 'lucide-vue-next'
import type { CodeArtifact } from '../types'
import { artifactDocument, artifactExtension, highlightCode, languageLabel, normalizedLanguage } from '../utils/code-artifacts'
import { useCopyFeedback } from '../composables/useCopyFeedback'

const props = defineProps<{ artifact: CodeArtifact }>()
const emit = defineEmits<{ close: [] }>()
const tab = ref<'preview' | 'code'>('preview')
const { copied, copy } = useCopyFeedback()
const highlighted = computed(() => highlightCode(props.artifact.code, props.artifact.language))
const documentContent = computed(() => artifactDocument(props.artifact.code, props.artifact.language))
const lineCount = computed(() => props.artifact.code.split(/\r?\n/).length)

watch(() => props.artifact.code, () => { tab.value = 'preview' })

const copyCode = () => copy(props.artifact.code)

function downloadCode() {
  const extension = artifactExtension(props.artifact.language)
  const blob = new Blob([props.artifact.code], { type: extension === 'svg' ? 'image/svg+xml;charset=utf-8' : 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `xinyue-artifact.${extension}`
  anchor.click()
  URL.revokeObjectURL(url)
}

function handleKeydown(event: KeyboardEvent) { if (event.key === 'Escape') emit('close') }
onMounted(() => window.addEventListener('keydown', handleKeydown))
onUnmounted(() => window.removeEventListener('keydown', handleKeydown))
</script>
