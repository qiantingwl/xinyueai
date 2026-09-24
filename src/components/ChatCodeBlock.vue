<template>
  <section class="chat-code-block" :class="{ 'is-collapsed': collapsed }">
    <header>
      <button class="code-language" type="button" :aria-expanded="!collapsed" @click="collapsed = !collapsed">
        <span>{{ languageLabel(language) }}</span><ChevronDown :size="15" />
      </button>
      <nav aria-label="代码操作">
        <button v-if="previewable" type="button" title="预览代码" @click="openPreview"><Play :size="14" /><span>预览</span></button>
        <button type="button" :title="copied ? '已复制' : '复制代码'" @click="copyCode"><Check v-if="copied" :size="14" /><Copy v-else :size="14" /><span>{{ copied ? '已复制' : '复制' }}</span></button>
      </nav>
    </header>
    <pre v-show="!collapsed"><code :class="`language-${normalizedLanguage(language)}`" v-html="highlighted" /></pre>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { Check, ChevronDown, Copy, Play } from 'lucide-vue-next'
import type { CodeArtifact } from '../types'
import { artifactTitle, highlightCode, isPreviewableCode, languageLabel, normalizedLanguage } from '../utils/code-artifacts'
import { useCopyFeedback } from '../composables/useCopyFeedback'

const props = defineProps<{ code: string; language?: string }>()
const emit = defineEmits<{ preview: [artifact: CodeArtifact] }>()
const collapsed = ref(false)
const { copied, copy } = useCopyFeedback()
const highlighted = computed(() => highlightCode(props.code, props.language))
const previewable = computed(() => isPreviewableCode(props.code, props.language))

function openPreview() {
  emit('preview', { code: props.code, language: props.language || 'html', title: artifactTitle(props.code, props.language) })
}

const copyCode = () => copy(props.code)
</script>
