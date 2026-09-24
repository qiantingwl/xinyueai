import { fetchPublicManualRedirect } from './outbound-http'

export type AllowedRedirectMessages = {
  invalidUrl: string
  disallowedHost: string
  invalidLocation: string
  tooManyRedirects: string
}

export function allowedHttpsHostUrl(
  value: string,
  allowedHosts: Set<string>,
  messages: Pick<AllowedRedirectMessages, 'invalidUrl' | 'disallowedHost'>,
) {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error(messages.invalidUrl)
  }
  if (
    url.protocol !== 'https:'
    || url.username
    || url.password
    || (url.port && url.port !== '443')
    || !allowedHosts.has(url.hostname.toLowerCase())
  ) {
    throw new Error(messages.disallowedHost)
  }
  return url
}

export type RedirectFetchResponse = {
  status: number
  headers: { get(name: string): string | null }
  body?: { cancel(): Promise<unknown> } | null
}

export async function fetchWithAllowedRedirects<TResponse extends RedirectFetchResponse = Response>(
  value: string,
  init: RequestInit,
  options: {
    allowedHosts: Set<string>
    maxRedirects: number
    messages: AllowedRedirectMessages
    fetch?: (url: URL, init: RequestInit) => Promise<TResponse>
    createError?: (message: string) => Error
    wrapFetchError?: (error: unknown) => never
  },
): Promise<{ response: TResponse; url: URL }> {
  const fail = options.createError ?? ((message: string) => new Error(message))
  const request = (options.fetch ?? ((url, requestInit) => fetchPublicManualRedirect(url, requestInit))) as (url: URL, init: RequestInit) => Promise<TResponse>
  const resolveUrl = (candidate: string) => {
    try {
      return allowedHttpsHostUrl(candidate, options.allowedHosts, options.messages)
    } catch (error) {
      throw fail(error instanceof Error ? error.message : options.messages.invalidUrl)
    }
  }
  let current = resolveUrl(value)
  for (let redirects = 0; ; redirects += 1) {
    let response: TResponse
    try {
      response = await request(current, init)
    } catch (error) {
      options.wrapFetchError?.(error)
      throw error
    }
    if (response.status < 300 || response.status >= 400) return { response, url: current }
    await response.body?.cancel().catch(() => undefined)
    if (redirects >= options.maxRedirects) throw fail(options.messages.tooManyRedirects)
    const location = response.headers.get('location')
    if (!location) throw fail(options.messages.invalidLocation)
    let next: URL
    try {
      next = new URL(location, current)
    } catch {
      throw fail(options.messages.invalidLocation)
    }
    current = resolveUrl(next.toString())
  }
}
