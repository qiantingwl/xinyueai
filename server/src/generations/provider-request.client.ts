import { ProviderType } from '@prisma/client'
import { fetchNoRedirect, fetchPublicNoRedirect } from '../common/outbound-http'

export type ProviderHttpError = new (message: string, status?: number) => Error

type ProviderFetchTarget = { apiKey?: string; baseUrl: string; type: string; timeoutMs: number }

export function providerFetch(resolved: Pick<ProviderFetchTarget, 'type'>, input: string | URL, init: RequestInit) {
  return resolved.type === ProviderType.LOCAL_WORKER || resolved.type === 'LOCAL_WORKER'
    ? fetchNoRedirect(input, init)
    : fetchPublicNoRedirect(input, init)
}

export function canFailoverHttpStatus(error: unknown, isProviderError: (value: unknown) => value is { status?: number }) {
  if (!isProviderError(error)) return false
  if (error.status === undefined) return true
  return [401, 403, 404, 408, 409, 425, 429].includes(error.status) || error.status >= 500
}

async function postProvider<T>(
  resolved: ProviderFetchTarget,
  path: string,
  init: RequestInit,
  ErrorClass: ProviderHttpError,
  timeoutMs = resolved.timeoutMs,
): Promise<T> {
  if (!resolved.apiKey) throw new ErrorClass('AI provider is not configured')
  let response: Response
  try {
    response = await providerFetch(resolved, `${resolved.baseUrl}${path}`, { ...init, signal: AbortSignal.timeout(timeoutMs) })
  } catch (error) {
    throw new ErrorClass(error instanceof Error ? error.message : 'Provider network request failed')
  }
  if (!response.ok) {
    await response.text().catch(() => '')
    throw new ErrorClass(`Provider returned ${response.status}`, response.status)
  }
  return response.json() as Promise<T>
}

export function postProviderJson<T>(
  resolved: ProviderFetchTarget,
  path: string,
  body: unknown,
  headers: Record<string, string>,
  ErrorClass: ProviderHttpError,
  timeoutMs = resolved.timeoutMs,
) {
  return postProvider<T>(resolved, path, { method: 'POST', headers, body: JSON.stringify(body) }, ErrorClass, timeoutMs)
}

export function postProviderForm<T>(
  resolved: ProviderFetchTarget,
  path: string,
  form: FormData,
  headers: Record<string, string>,
  ErrorClass: ProviderHttpError,
) {
  return postProvider<T>(resolved, path, { method: 'POST', headers, body: form }, ErrorClass, resolved.timeoutMs)
}
