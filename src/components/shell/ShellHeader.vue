<template>
  <header class="workspace-mobile-header">
    <button class="icon-button" type="button" aria-label="打开菜单" @click="mobileOpen = true">
      <Menu :size="21" />
    </button>
    <strong v-if="mobileTitle" class="workspace-mobile-title">{{ mobileTitle }}</strong>
  </header>
  <nav v-if="showHeaderActions" class="workspace-chat-actions" :class="{ 'is-chat': activeMode === 'chat', 'has-thread': Boolean(currentConversation) }" aria-label="工作区操作">
    <button
      v-if="activeMode === 'chat'"
      class="temporary-chat-toggle"
      :class="{ active: studio.temporaryChat }"
      type="button"
      :aria-pressed="studio.temporaryChat"
      :aria-label="studio.temporaryChat ? '退出临时聊天' : '开启临时聊天'"
      :title="studio.temporaryChat ? '退出临时聊天' : '临时聊天'"
      @click="studio.toggleTemporaryChat()"
    >
      <MessageCircleDashed :size="18" />
    </button>
    <TaskCenter v-if="showTaskCenter" />
    <button v-if="activeMode === 'chat' && showUpgradeEntry" class="workspace-upgrade-button" type="button" @click="openUpgrade"><Sparkles :size="16" /><span>升级</span></button>
    <button v-if="activeMode === 'chat' && currentConversation" type="button" aria-label="分享对话" title="分享" :disabled="conversationActionBusy" @click="shareCurrentConversation"><Share2 :size="18" /><span>分享</span></button>
    <div v-if="activeMode === 'chat' && currentConversation" class="workspace-chat-more-wrap">
      <button type="button" aria-label="更多对话操作" title="更多" :aria-expanded="chatActionsOpen" @click="chatActionsOpen = !chatActionsOpen"><MoreHorizontal :size="20" /></button>
      <div v-if="chatActionsOpen" class="workspace-chat-more-menu" role="menu">
        <button role="menuitem" type="button" @click="toggleCurrentConversationPinned"><PinOff v-if="currentConversation.pinnedAt" :size="17" /><Pin v-else :size="17" />{{ currentConversation.pinnedAt ? '取消置顶' : '置顶聊天' }}</button>
        <button role="menuitem" type="button" @click="archiveCurrentConversation"><Archive :size="17" />归档</button>
        <button class="is-danger" role="menuitem" type="button" @click="deleteCurrentConversation"><Trash2 :size="17" />删除</button>
      </div>
    </div>
  </nav>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Archive, Menu, MessageCircleDashed, MoreHorizontal, Pin, PinOff, Share2, Sparkles, Trash2 } from 'lucide-vue-next'
import type { ConversationSummary, StudioMode } from '../../types'
import { useAuthStore } from '../../stores/auth'
import { useStudioStore } from '../../stores/studio'
import TaskCenter from './TaskCenter.vue'

const props = defineProps<{
  activeMode: StudioMode
  workspaceDataLoaded: boolean
  showUpgradeEntry: boolean
  conversationActionBusy: boolean
  openUpgrade: () => void
  shareConversation: (conversation: ConversationSummary) => Promise<void>
  toggleConversationPinned: (conversation: ConversationSummary) => Promise<void>
  archiveConversation: (conversationId: string) => Promise<void>
  deleteConversation: (conversation: { id: string; title: string }) => Promise<void>
}>()

const mobileOpen = defineModel<boolean>('mobileOpen', { required: true })
const chatActionsOpen = defineModel<boolean>('chatActionsOpen', { required: true })

const auth = useAuthStore()
const studio = useStudioStore()
const { t } = useI18n()

const mobileTitle = computed(() => ({ chat: 'Xinyue AI', images: t('workspace.creation'), videos: t('workspace.creation'), commerce: t('studio.commerce'), office: t('workspace.office'), prompts: t('workspace.prompts'), plugins: t('workspace.plugins'), workspace: '工作空间' } as Partial<Record<StudioMode, string>>)[props.activeMode] || '')
const currentConversation = computed(() => studio.conversations.find((item) => item.id === studio.currentConversationId) || null)
const showTaskCenter = computed(() => ['chat', 'images', 'videos', 'commerce'].includes(props.activeMode))
const showHeaderActions = computed(() => props.workspaceDataLoaded && auth.isAuthenticated && (props.activeMode === 'chat' || showTaskCenter.value))

async function shareCurrentConversation() {
  if (!currentConversation.value) return
  chatActionsOpen.value = false
  await props.shareConversation(currentConversation.value)
}

async function toggleCurrentConversationPinned() {
  if (!currentConversation.value) return
  chatActionsOpen.value = false
  await props.toggleConversationPinned(currentConversation.value)
}

async function archiveCurrentConversation() {
  if (!currentConversation.value) return
  chatActionsOpen.value = false
  await props.archiveConversation(currentConversation.value.id)
}

async function deleteCurrentConversation() {
  if (!currentConversation.value) return
  chatActionsOpen.value = false
  await props.deleteConversation(currentConversation.value)
}
</script>
