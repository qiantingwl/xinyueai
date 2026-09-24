import { onMounted, onUnmounted, toValue, type MaybeRefOrGetter } from 'vue'

/**
 * 弹层统一交互：Esc 关闭。mounted 时注册，卸载时清理。
 *
 * 页面内用 `v-if` 直接渲染的弹层不会随开关重新挂载，需传 `enabled` 指明当前是否生效；
 * 同页多个弹层应让各自的 `enabled` 互斥，避免一次 Esc 关掉多层。
 */
export function useEscapeClose(close: () => void, options: { stopPropagation?: boolean; enabled?: MaybeRefOrGetter<boolean> } = {}) {
  function onKeydown(event: KeyboardEvent) {
    if (event.key !== 'Escape' || event.isComposing || event.defaultPrevented) return
    if (options.enabled !== undefined && !toValue(options.enabled)) return
    if (options.stopPropagation !== false) {
      event.stopPropagation()
    }
    close()
  }
  onMounted(() => document.addEventListener('keydown', onKeydown))
  onUnmounted(() => document.removeEventListener('keydown', onKeydown))
}
