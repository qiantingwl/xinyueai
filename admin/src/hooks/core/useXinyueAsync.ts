import { ref } from 'vue'

/** 管理端页面共用的 loading / saving 包裹，避免每个 CRUD 页再抄一遍 try/finally。 */
export function useXinyueAsync() {
  const loading = ref(false)
  const saving = ref(false)
  const depth = { loading: 0, saving: 0 }

  async function withFlag<T>(
    key: 'loading' | 'saving',
    flag: { value: boolean },
    work: () => Promise<T>
  ) {
    depth[key] += 1
    flag.value = true
    try {
      return await work()
    } finally {
      depth[key] -= 1
      if (depth[key] === 0) flag.value = false
    }
  }

  return {
    loading,
    saving,
    withLoading: <T>(work: () => Promise<T>) => withFlag('loading', loading, work),
    withSaving: <T>(work: () => Promise<T>) => withFlag('saving', saving, work)
  }
}
