import { computed, nextTick, onUnmounted, ref, watch, type ComputedRef } from 'vue'
import type { Message } from '../../types'

interface ChatMessageNavigatorOptions {
  messages: ComputedRef<Message[]>
  thread: ComputedRef<HTMLElement | null>
  conversationId: () => string
}

const NEAR_BOTTOM_THRESHOLD = 80

export function useChatMessageNavigator(options: ChatMessageNavigatorOptions) {
  const messageNavigatorOpen = ref(false)
  const activeMessageJumpId = ref('')
  const jumpHighlightId = ref('')
  const messageJumps = computed(() => {
    const messages = options.messages.value
    return messages.filter((message, index) => (
      message.role === 'user' && messages[index + 1]?.role !== 'user'
    ))
  })
  const threadFollowing = ref(true)
  const threadOverflowing = ref(false)
  const streamUnread = ref(false)
  const showBackToBottom = computed(() => !threadFollowing.value && threadOverflowing.value)
  let jumpHighlightTimer = 0
  let navigatorCloseTimer = 0
  let lastScrollTop = 0
  let resizeObserver: ResizeObserver | null = null
  let childListObserver: MutationObserver | null = null
  const observedChildren = new Set<Element>()

  function scrollBehavior(behavior: ScrollBehavior): ScrollBehavior {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : behavior
  }

  function measureThreadOverflow() {
    const container = options.thread.value
    if (!container) return
    threadOverflowing.value = container.scrollHeight > container.clientHeight + 4
  }

  function handleThreadScroll() {
    const container = options.thread.value
    if (!container) return
    const top = container.scrollTop
    const distance = container.scrollHeight - container.clientHeight - top
    if (distance <= NEAR_BOTTOM_THRESHOLD) {
      threadFollowing.value = true
      streamUnread.value = false
    } else if (top < lastScrollTop - 1) {
      // 用户主动向上滚动：退出流式跟随
      threadFollowing.value = false
    }
    lastScrollTop = top
    measureThreadOverflow()
  }

  function handleThreadResize() {
    measureThreadOverflow()
    // 晚到布局兜底：跟随状态下内容尺寸变化（图片/KaTeX 晚加载）时保持贴底
    if (threadFollowing.value) void scrollThreadToBottom('auto')
  }

  function syncObservedChildren(container: HTMLElement) {
    if (!resizeObserver) return
    for (const child of Array.from(container.children)) {
      if (observedChildren.has(child)) continue
      observedChildren.add(child)
      resizeObserver.observe(child)
    }
  }

  function compactMessageJump(content: string) {
    return content.replace(/\s+/g, ' ').trim().slice(0, 76)
  }

  function openMessageNavigator() {
    window.clearTimeout(navigatorCloseTimer)
    messageNavigatorOpen.value = true
  }

  function scheduleMessageNavigatorClose() {
    window.clearTimeout(navigatorCloseTimer)
    navigatorCloseTimer = window.setTimeout(() => { messageNavigatorOpen.value = false }, 220)
  }

  function closeMessageNavigatorOnBlur(event: FocusEvent) {
    if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null)) {
      messageNavigatorOpen.value = false
    }
  }

  function syncMessageNavigator() {
    const container = options.thread.value
    if (!container || !messageJumps.value.length) return
    const anchor = container.getBoundingClientRect().top + Math.min(120, container.clientHeight * 0.28)
    const elements = [...container.querySelectorAll<HTMLElement>('[data-user-message="true"]')]
    const nearest = elements.reduce<{ id: string; distance: number } | null>((best, element) => {
      const id = element.dataset.messageId || ''
      const distance = Math.abs(element.getBoundingClientRect().top - anchor)
      return id && (!best || distance < best.distance) ? { id, distance } : best
    }, null)
    if (nearest) activeMessageJumpId.value = nearest.id
  }

  function jumpToMessage(messageId: string) {
    const elements = options.thread.value?.querySelectorAll<HTMLElement>('[data-user-message="true"]') || []
    const target = [...elements].find((element) => element.dataset.messageId === messageId)
    if (!target) return
    activeMessageJumpId.value = messageId
    messageNavigatorOpen.value = false
    jumpHighlightId.value = messageId
    target.scrollIntoView({ behavior: 'smooth', block: 'start' })
    window.clearTimeout(jumpHighlightTimer)
    jumpHighlightTimer = window.setTimeout(() => {
      if (jumpHighlightId.value === messageId) jumpHighlightId.value = ''
    }, 1400)
  }

  async function scrollThreadToBottom(behavior: ScrollBehavior = 'smooth') {
    threadFollowing.value = true
    await nextTick()
    const container = options.thread.value
    container?.scrollTo({ top: container.scrollHeight, behavior: scrollBehavior(behavior) })
  }

  // 流式输出时的贴底入口：跟随中瞬时贴底，退出跟随后仅标记未读增量
  function stickThreadToBottom() {
    if (threadFollowing.value) {
      void scrollThreadToBottom('auto')
    } else {
      streamUnread.value = true
      measureThreadOverflow()
    }
  }

  function resumeFollowing() {
    streamUnread.value = false
    void scrollThreadToBottom('smooth')
  }

  function resetNavigator() {
    messageNavigatorOpen.value = false
    jumpHighlightId.value = ''
    threadFollowing.value = true
    streamUnread.value = false
    lastScrollTop = 0
    void nextTick(syncMessageNavigator)
  }

  watch(options.thread, (container, previous) => {
    previous?.removeEventListener('scroll', handleThreadScroll)
    observedChildren.clear()
    resizeObserver?.disconnect()
    childListObserver?.disconnect()
    resizeObserver = null
    childListObserver = null
    if (!container) return
    container.addEventListener('scroll', handleThreadScroll, { passive: true })
    lastScrollTop = container.scrollTop
    resizeObserver = new ResizeObserver(handleThreadResize)
    resizeObserver.observe(container)
    syncObservedChildren(container)
    childListObserver = new MutationObserver(() => syncObservedChildren(container))
    childListObserver.observe(container, { childList: true })
    measureThreadOverflow()
  }, { immediate: true })

  watch(options.conversationId, resetNavigator)
  const messageJumpKey = computed(() => messageJumps.value.map((message) => message.id).join('|'))
  watch(messageJumpKey, () => {
    if (!messageJumps.value.some((message) => message.id === activeMessageJumpId.value)) {
      activeMessageJumpId.value = messageJumps.value.at(-1)?.id || ''
    }
    void nextTick(syncMessageNavigator)
  })

  onUnmounted(() => {
    window.clearTimeout(jumpHighlightTimer)
    window.clearTimeout(navigatorCloseTimer)
    options.thread.value?.removeEventListener('scroll', handleThreadScroll)
    resizeObserver?.disconnect()
    childListObserver?.disconnect()
  })

  return {
    messageJumps,
    messageNavigatorOpen,
    activeMessageJumpId,
    jumpHighlightId,
    compactMessageJump,
    openMessageNavigator,
    scheduleMessageNavigatorClose,
    closeMessageNavigatorOnBlur,
    syncMessageNavigator,
    jumpToMessage,
    scrollThreadToBottom,
    stickThreadToBottom,
    resumeFollowing,
    threadFollowing,
    streamUnread,
    showBackToBottom,
  }
}
