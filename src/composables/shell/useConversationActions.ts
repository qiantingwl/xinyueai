import { computed, ref } from 'vue'
import { useMessage } from 'naive-ui'
import type { ConversationSummary } from '../../types'
import { useStudioStore } from '../../stores/studio'
import { api } from '../../services/api'
import { copyText } from '../../utils/clipboard'

type ConversationIdentity = Pick<ConversationSummary, 'id' | 'title'>

export function useConversationActions() {
  const studio = useStudioStore()
  const message = useMessage()
  const conversationMenuId = ref('')
  const conversationRename = ref('')
  const conversationActionBusy = ref(false)
  const renamingConversationId = ref('')
  const conversationRenameBusy = ref(false)
  const activeConversationMenu = computed(() => [...studio.conversations, ...studio.archivedConversations].find((item) => item.id === conversationMenuId.value) || null)

  function closeConversationMenu() {
    conversationMenuId.value = ''
  }

  async function shareConversation(conversation: ConversationSummary) {
    closeConversationMenu()
    conversationActionBusy.value = true
    try {
      const result = await api<{ token: string; sharedAt: string }>(`/conversations/${conversation.id}/share`, { method: 'POST' })
      conversation.sharedAt = Date.parse(result.sharedAt)
      await copyText(`${window.location.origin}/share/${result.token}`)
      message.success('共享链接已复制')
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : '创建共享链接失败')
    } finally {
      conversationActionBusy.value = false
    }
  }

  async function toggleConversationPinned(conversation: ConversationSummary) {
    closeConversationMenu()
    conversationActionBusy.value = true
    const pinned = !conversation.pinnedAt
    try {
      await studio.setConversationPinned(conversation.id, pinned)
      message.success(pinned ? '已置顶聊天' : '已取消置顶')
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : '置顶状态更新失败')
    } finally {
      conversationActionBusy.value = false
    }
  }

  function startConversationRename(conversation: ConversationIdentity) {
    closeConversationMenu()
    renamingConversationId.value = conversation.id
    conversationRename.value = conversation.title
  }

  function cancelConversationRename() {
    if (conversationRenameBusy.value) return
    renamingConversationId.value = ''
    conversationRename.value = ''
  }

  async function saveConversationRename(conversationId: string) {
    if (!conversationRename.value.trim() || conversationRenameBusy.value) return
    conversationRenameBusy.value = true
    try {
      await studio.renameConversation(conversationId, conversationRename.value)
      renamingConversationId.value = ''
      conversationRename.value = ''
      message.success('对话名称已更新')
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : '对话重命名失败')
    } finally {
      conversationRenameBusy.value = false
    }
  }

  async function archiveConversation(conversationId: string) {
    closeConversationMenu()
    try {
      await studio.archiveConversation(conversationId)
      message.success('对话已归档')
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : '归档失败')
    }
  }

  async function restoreConversation(conversationId: string) {
    closeConversationMenu()
    try {
      await studio.restoreConversation(conversationId)
      message.success('对话已恢复')
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : '恢复失败')
    }
  }

  async function deleteConversation(conversation: ConversationIdentity) {
    closeConversationMenu()
    if (!window.confirm(`永久删除“${conversation.title}”？此操作无法撤销。`)) return
    try {
      await studio.deleteConversation(conversation.id)
      message.success('对话已删除')
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : '对话删除失败')
    }
  }

  return {
    conversationMenuId,
    conversationRename,
    conversationActionBusy,
    renamingConversationId,
    conversationRenameBusy,
    activeConversationMenu,
    closeConversationMenu,
    shareConversation,
    toggleConversationPinned,
    startConversationRename,
    cancelConversationRename,
    saveConversationRename,
    archiveConversation,
    restoreConversation,
    deleteConversation,
  }
}
