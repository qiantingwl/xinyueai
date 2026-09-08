export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

const configuredApiBase = import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/+$/, '') || ''
// The Vite dev server and the production Nginx entry both proxy /v1 same-origin.
// Keep this empty so a host-facing port never bypasses that proxy to an internal API port.
const localFrontendPorts = new Set<string>()

export type ApiLifecycleDetail = {
  id: string
  path: string
  method: string
  phase: 'start' | 'success' | 'error' | 'end'
  message?: string
}

/** Optional browser request timeout used by startup probes and other bounded calls. */
export type ApiRequestInit = RequestInit & { timeoutMs?: number }

function createTimeoutSignal(signal: AbortSignal | null | undefined, timeoutMs?: number) {
  if (!Number.isFinite(timeoutMs) || !timeoutMs || timeoutMs <= 0) {
    return { signal: signal ?? undefined, timedOut: () => false, cleanup: () => undefined }
  }

  const controller = new AbortController()
  let timedOut = false
  const onAbort = () => {
    if (!controller.signal.aborted) controller.abort()
  }

  if (signal?.aborted) onAbort()
  else signal?.addEventListener('abort', onAbort, { once: true })

  const timer = globalThis.setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)

  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    cleanup: () => {
      globalThis.clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    },
  }
}

function emitLifecycle(detail: ApiLifecycleDetail) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent<ApiLifecycleDetail>('xinyue:api-lifecycle', { detail }))
}

function mutationMessage(method: string) {
  if (method === 'DELETE') return '删除成功'
  if (method === 'PATCH' || method === 'PUT') return '保存成功'
  return '操作成功'
}

function localApiBase() {
  if (typeof window === 'undefined') return ''
  const host = window.location.hostname
  const isLocal = host === 'localhost' || host === '127.0.0.1'
  return isLocal && localFrontendPorts.has(window.location.port) ? `http://${host}:3100` : ''
}

export function apiUrl(path: string) {
  const normalizedPath = path.startsWith('/v1') ? path : `/v1${path.startsWith('/') ? path : `/${path}`}`
  const base = configuredApiBase || localApiBase()
  return base ? `${base}${normalizedPath}` : normalizedPath
}

export async function api<T>(path: string, init: ApiRequestInit = {}): Promise<T> {
  const method = (init.method || 'GET').toUpperCase()
  const mutation = !['GET', 'HEAD', 'OPTIONS'].includes(method)
  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const hasJsonBody = init.body !== undefined && !(init.body instanceof FormData)
  const { timeoutMs, signal: callerSignal, ...requestInit } = init
  const requestSignal = createTimeoutSignal(callerSignal, timeoutMs)
  emitLifecycle({ id: requestId, path, method, phase: 'start' })
  try {
    const response = await fetch(apiUrl(path), {
      ...requestInit,
      credentials: 'include',
      headers: { ...(hasJsonBody ? { 'Content-Type': 'application/json' } : {}), ...(mutation ? { 'X-Xinyue-Request': '1' } : {}), ...init.headers },
      ...(requestSignal.signal ? { signal: requestSignal.signal } : {}),
    })
    if (!response.ok) {
      const payload = await response.json().catch(() => null) as { message?: string | string[] } | null
      const message = Array.isArray(payload?.message) ? payload.message.join('，') : payload?.message
      const error = new ApiError(response.status, message || `请求失败 (${response.status})`)
      emitLifecycle({ id: requestId, path, method, phase: 'error', message: error.message })
      throw error
    }
    if (path.startsWith('/admin') && method !== 'GET') emitLifecycle({ id: requestId, path, method, phase: 'success', message: mutationMessage(method) })
    if (response.status === 204) return undefined as T
    return response.json() as Promise<T>
  } catch (reason) {
    if (requestSignal.timedOut()) {
      const error = new ApiError(408, '请求超时，请稍后重试')
      emitLifecycle({ id: requestId, path, method, phase: 'error', message: error.message })
      throw error
    }
    if (!(reason instanceof ApiError)) emitLifecycle({ id: requestId, path, method, phase: 'error', message: reason instanceof Error ? reason.message : '无法连接管理服务' })
    throw reason
  } finally {
    requestSignal.cleanup()
    emitLifecycle({ id: requestId, path, method, phase: 'end' })
  }
}

export type StreamApiEventMeta = { id?: string; event?: string }

export async function streamApiEvents<T>(path: string, onEvent?: (value: T) => void, onMeta?: (meta: StreamApiEventMeta) => void): Promise<T> {
  const controller = new AbortController()
  const idleTimeoutMs = 30_000
  let idleTimer = window.setTimeout(() => controller.abort(), idleTimeoutMs)
  const resetIdleTimer = () => {
    window.clearTimeout(idleTimer)
    idleTimer = window.setTimeout(() => controller.abort(), idleTimeoutMs)
  }
  const response = await fetch(apiUrl(path), { credentials: 'include', headers: { Accept: 'text/event-stream' }, signal: controller.signal })
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { message?: string | string[] } | null
    const message = Array.isArray(payload?.message) ? payload.message.join('，') : payload?.message
    throw new ApiError(response.status, message || `请求失败 (${response.status})`)
  }
  if (!response.body) throw new ApiError(502, '服务未返回流式响应')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let latest: T | undefined
  const consume = (block: string) => {
    const lines = block.split(/\r?\n/)
    const id = lines.find((line) => line.startsWith('id:'))?.slice(3).trim()
    const event = lines.find((line) => line.startsWith('event:'))?.slice(6).trim()
    onMeta?.({ id, event })
    const data = lines.filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n').trim()
    if (!data) return
    latest = JSON.parse(data) as T
    onEvent?.(latest)
  }
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (value?.length) resetIdleTimer()
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done })
      const blocks = buffer.split(/\r?\n\r?\n/)
      buffer = blocks.pop() || ''
      for (const block of blocks) consume(block)
      if (done) break
    }
  } finally {
    window.clearTimeout(idleTimer)
  }
  if (buffer.trim()) consume(buffer)
  if (!latest) throw new ApiError(502, '流式响应中没有任务状态')
  return latest
}
