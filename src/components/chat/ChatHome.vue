<template>
        <div v-if="isJixingSkin && !hasChatThread && store.temporaryChat" class="jx-home-hero jx-home-hero--temporary">
          <AssistantAvatar v-if="avatarEnabled" class="jx-home-hero__avatar" state="idle" :size="34" :variant="avatarStyle" :tone="avatarColor" />
          <h2 class="jx-home-hero__title">临时聊天</h2>
          <p class="jx-home-hero__subtitle">这次聊天不会出现在历史记录中，也不会用于改进模型。</p>
        </div>
        <div v-else-if="isJixingSkin && !hasChatThread" class="jx-home-hero">
          <AssistantAvatar v-if="avatarEnabled" class="jx-home-hero__avatar" state="idle" :size="34" :variant="avatarStyle" :tone="avatarColor" />
          <h2 class="jx-home-hero__title"><span>{{ catalog.settings.siteName }}</span> <em>智能创作工作台</em></h2>
          <p class="jx-home-hero__subtitle">一句话完成图片、视频和电商视觉创作</p>
          <nav class="jx-home-hero__tabs" aria-label="创作模式">
            <RouterLink v-for="tab in jxModeTabs" :key="tab.to" class="jx-home-hero__tab" :class="{ 'is-active': route.path === tab.to }" :to="tab.to">{{ tab.label }}</RouterLink>
          </nav>
        </div>
        <div v-else-if="!hasChatThread" class="chat-home-identity" :class="{ 'is-temporary': store.temporaryChat }">
          <AssistantAvatar v-if="avatarEnabled" class="chat-home-identity__avatar" state="idle" :size="52" :variant="avatarStyle" :tone="avatarColor" />
          <span v-if="chatUiPreset === 'kimi' && !store.temporaryChat" class="chat-home-wordmark">XINYUE</span>
          <h2 v-if="chatHomeTitle"><Sparkles v-if="chatUiPreset === 'qianwen' && !store.temporaryChat" class="chat-home-qianwen-mark" :size="30" fill="currentColor" />{{ chatHomeTitle }}</h2>
          <h2 v-else-if="store.temporaryChat">临时聊天</h2>
          <p v-if="chatHomeSubtitle">{{ chatHomeSubtitle }}</p>
          <nav v-if="chatUiPreset === 'doubao' && !store.temporaryChat" class="chat-home-mode-pill" aria-label="对话或工作">
            <button type="button" class="is-active" aria-current="true" @click="focusComposer">对话</button>
            <button type="button" title="前往办公中心" @click="router.push('/office')">工作</button>
          </nav>
        </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Sparkles } from 'lucide-vue-next'
import AssistantAvatar from './AssistantAvatar.vue'
import type { ChatUiPreset } from '../../stores/catalog'
import { useCatalogStore } from '../../stores/catalog'
import { useStudioStore } from '../../stores/studio'

const props = defineProps<{ hasChatThread: boolean; chatUiPreset: ChatUiPreset }>()

const route = useRoute()
const router = useRouter()
const store = useStudioStore()
const catalog = useCatalogStore()
const isJixingSkin = computed(() => props.chatUiPreset === 'jixing')
const avatarEnabled = computed(() => catalog.settings.chatAvatarEnabled !== false)
const avatarStyle = computed(() => catalog.settings.chatAvatarStyle || 'classic')
const avatarColor = computed(() => catalog.settings.chatAvatarColor || 'auto')
const jxModeTabs = [
  { label: 'Agent模式', to: '/chat' },
  { label: '图片生成', to: '/image' },
  { label: '视频生成', to: '/video' },
]
const chatUiPreset = computed(() => props.chatUiPreset)
const chatHomeTitle = computed(() => store.temporaryChat ? '临时聊天' : ({ gpt: '我们先从哪里开始呢？', doubao: '有什么我能帮你的吗？', qianwen: '你好，我是 Xinyue AI', kimi: '', jixing: '' })[chatUiPreset.value])
const chatHomeSubtitle = computed(() => store.temporaryChat ? '这次聊天不会出现在历史记录中，也不会用于改进模型。' : '')

function focusComposer() {
  document.querySelector<HTMLTextAreaElement>('.chat-composer textarea')?.focus()
}
</script>
