import { computed, onUnmounted, ref } from 'vue'
import { copyText } from '../utils/clipboard'

/**
 * 「复制成功后短暂显示对勾」这一模式此前在 7 个组件里各自实现，
 * 计时器都没在卸载时清理。传 `key` 可区分列表里复制了哪一项。
 */
export function useCopyFeedback(resetAfterMs = 1600) {
  const copiedKey = ref('')
  const copied = computed(() => copiedKey.value !== '')
  let timer = 0

  function clearTimer() {
    if (timer) { window.clearTimeout(timer); timer = 0 }
  }

  async function copy(value: string, key = 'default') {
    const ok = await copyText(value)
    if (!ok) return false
    clearTimer()
    copiedKey.value = key
    timer = window.setTimeout(() => { copiedKey.value = ''; timer = 0 }, resetAfterMs)
    return true
  }

  const isCopied = (key: string) => copiedKey.value === key

  /** 开始一次新操作时主动收起「已复制」提示，避免沿用上一次的状态。 */
  function reset() {
    clearTimer()
    copiedKey.value = ''
  }

  onUnmounted(clearTimer)

  return { copied, copiedKey, copy, isCopied, reset }
}
