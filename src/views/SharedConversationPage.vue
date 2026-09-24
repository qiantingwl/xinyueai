<template>
  <main class="shared-page">
    <header class="shared-header">
      <BrandMark to="/" />
      <RouterLink class="shared-start" to="/chat">开始新对话</RouterLink>
    </header>

    <section v-if="loading" class="shared-state"><span class="shared-state__loading"><LoaderCircle class="is-spinning" :size="17" />正在加载共享对话...</span></section>
    <section v-else-if="error" class="shared-state shared-state--error">
      <h1>无法打开此共享对话</h1>
      <p>{{ error }}</p>
      <div class="shared-state__actions">
        <button type="button" :disabled="loading" @click="loadConversation">重新加载</button>
        <RouterLink to="/chat">返回 Xinyue AI</RouterLink>
      </div>
    </section>
    <article v-else-if="conversation" class="shared-conversation">
      <header>
        <span>共享对话</span>
        <h1>{{ conversation.title }}</h1>
        <p>{{ conversation.model }} · {{ formatDate(conversation.sharedAt || conversation.createdAt) }}</p>
      </header>
      <div class="shared-messages">
        <section v-for="message in visibleMessages" :key="message.id" class="shared-message" :class="`is-${message.role.toLowerCase()}`">
          <strong>{{ message.role === 'USER' ? '你' : 'Xinyue AI' }}</strong>
          <ChatMessageContent v-if="message.role === 'ASSISTANT'" class="shared-message__content" :content="message.content" />
          <p v-else>{{ message.content }}</p>
        </section>
      </div>
    </article>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { LoaderCircle } from 'lucide-vue-next'
import BrandMark from '../components/BrandMark.vue'
import ChatMessageContent from '../components/ChatMessageContent.vue'
import { api } from '../services/api'
import { formatLongDay as formatDate } from '../utils/datetime'

interface SharedMessage { id: string; role: 'USER' | 'ASSISTANT' | 'SYSTEM' | 'TOOL'; content: string; model?: string | null; createdAt: string }
interface SharedConversation { title: string; model: string; createdAt: string; sharedAt?: string | null; messages: SharedMessage[] }

const route = useRoute()
const loading = ref(true)
const error = ref('')
const conversation = ref<SharedConversation | null>(null)
const visibleMessages = computed(() => conversation.value?.messages.filter((message) => message.role === 'USER' || message.role === 'ASSISTANT') || [])


function loadErrorMessage(reason: unknown) {
  const message = reason instanceof Error ? reason.message : ''
  if (/failed to fetch|networkerror|network request failed/i.test(message)) return '网络连接失败，请检查网络后重试。'
  return message || '共享链接不存在或已失效'
}

async function loadConversation() {
  loading.value = true
  error.value = ''
  conversation.value = null
  try { conversation.value = await api<SharedConversation>(`/shares/${String(route.params.token || '')}`) }
  catch (reason) { error.value = loadErrorMessage(reason) }
  finally { loading.value = false }
}

onMounted(loadConversation)
</script>
