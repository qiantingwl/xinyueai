export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

const configuredApiBase = import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/+$/, '') || ''
const localFrontendPorts = new Set(['4173', '5173', '5174', '5175'])

export type ApiLifecycleDetail = {
  id: string
  path: string
  method: string
  phase: 'start' | 'success' | 'error' | 'end'
  message?: string
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
  return isLocal && localFrontendPorts.has(window.location.port) ? 'http://localhost:3100' : ''
}

export function apiUrl(path: string) {
  const normalizedPath = path.startsWith('/v1') ? path : `/v1${path.startsWith('/') ? path : `/${path}`}`
  const base = configuredApiBase || localApiBase()
  return base ? `${base}${normalizedPath}` : normalizedPath
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method || 'GET').toUpperCase()
  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const hasJsonBody = init.body !== undefined && !(init.body instanceof FormData)
  emitLifecycle({ id: requestId, path, method, phase: 'start' })
  try {
    const response = await fetch(apiUrl(path), {
      ...init,
      credentials: 'include',
      headers: { ...(hasJsonBody ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
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
    if (!(reason instanceof ApiError)) emitLifecycle({ id: requestId, path, method, phase: 'error', message: reason instanceof Error ? reason.message : '无法连接管理服务' })
    throw reason
  } finally {
    emitLifecycle({ id: requestId, path, method, phase: 'end' })
  }
}

export async function streamApiEvents<T>(path: string, onEvent?: (value: T) => void): Promise<T> {
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
    const data = block.split(/\r?\n/).filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n').trim()
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
