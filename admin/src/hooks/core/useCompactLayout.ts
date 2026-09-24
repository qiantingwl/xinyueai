import { onBeforeUnmount, onMounted, ref } from 'vue'

export function useCompactLayout(breakpoint = 1200) {
  const isCompact = ref(typeof window !== 'undefined' ? window.innerWidth <= breakpoint : false)
  function update() {
    isCompact.value = window.innerWidth <= breakpoint
  }
  onMounted(() => {
    update()
    window.addEventListener('resize', update)
  })
  onBeforeUnmount(() => window.removeEventListener('resize', update))
  return isCompact
}
