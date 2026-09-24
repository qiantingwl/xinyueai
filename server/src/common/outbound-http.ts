import { AsyncLocalStorage } from 'node:async_hooks'
import { lookup as dnsLookup } from 'node:dns'
import type { LookupAddress, LookupOptions } from 'node:dns'
import type { LookupFunction } from 'node:net'
import { Agent, ProxyAgent, type Dispatcher } from 'undici'
import { isIP } from 'node:net'
import { isPrivateNetworkAddress, normalizedHostname, publicHttpUrl } from './public-endpoint-policy.service'

export type OutboundExecutionLease = Readonly<{ workerId: string; leaseVersion: number }>
type OutboundExecutionContext = Readonly<{ signal: AbortSignal; lease?: OutboundExecutionLease }>

const outboundContext = new AsyncLocalStorage<OutboundExecutionContext>()

type PublicAddressResolver = (
  hostname: string,
  options: LookupOptions & { all: true },
  callback: (error: NodeJS.ErrnoException | null, addresses: LookupAddress[]) => void,
) => void

export function createPublicNetworkLookup(resolve: PublicAddressResolver = dnsLookup as PublicAddressResolver): LookupFunction {
  return (hostname, options, callback) => resolve(hostname, {
    all: true,
    family: options.family,
    hints: options.hints,
    order: 'verbatim',
  }, (error, addresses) => {
    if (error) {
      callback(error, [])
      return
    }
    const publicAddresses = addresses.filter((entry) => !isPrivateNetworkAddress(entry.address))
    if (!publicAddresses.length) {
      const denied = Object.assign(new Error('Outbound HTTP target resolved to a non-public address'), { code: 'EACCES' })
      callback(denied, [])
      return
    }
    if (options.all) callback(null, publicAddresses)
    else callback(null, publicAddresses[0].address, publicAddresses[0].family)
  })
}

const publicNetworkLookup = createPublicNetworkLookup()
const publicNetworkDispatcher = new Agent({ connect: { lookup: publicNetworkLookup } })
type FetchInitWithDispatcher = RequestInit & { dispatcher?: Dispatcher }

let mediaProxyUrl = ''
let mediaProxyDispatcher: Dispatcher | undefined

function configuredOutboundProxy() {
  return String(process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy || '').trim()
}

function mediaDispatcher() {
  const proxy = configuredOutboundProxy()
  if (!proxy) return publicNetworkDispatcher
  if (mediaProxyDispatcher && mediaProxyUrl === proxy) return mediaProxyDispatcher
  mediaProxyDispatcher = new ProxyAgent(proxy)
  mediaProxyUrl = proxy
  return mediaProxyDispatcher
}

export class OutboundRedirectError extends Error {
  constructor(status?: number) {
    super(status ? `Outbound HTTP redirect rejected (HTTP ${status})` : 'Outbound HTTP redirects are not allowed')
    this.name = 'OutboundRedirectError'
  }
}

/**
 * Runs Provider-facing work with a signal that is automatically inherited by
 * every fetchNoRedirect call in the async call tree.
 */
export function runWithOutboundSignal<T>(signal: AbortSignal, callback: () => Promise<T>, lease?: OutboundExecutionLease) {
  return outboundContext.run({ signal, lease }, callback)
}

export function currentOutboundExecutionLease() {
  return outboundContext.getStore()?.lease
}

/**
 * Outbound requests fail closed on redirects. This prevents a public endpoint
 * from redirecting a request (and its credentials) to loopback, metadata, or a
 * private network after the original URL has passed validation.
 */
export async function fetchNoRedirect(input: string | URL | Request, init: RequestInit = {}) {
  return fetchWithPolicy(input, init, 'error')
}

/**
 * Public-only outbound requests validate DNS in the connector lookup callback,
 * so the exact address set approved by policy is the one handed to the socket.
 */
export async function fetchPublicNoRedirect(input: string | URL | Request, init: RequestInit = {}) {
  publicHttpUrl(requestUrl(input))
  return fetchWithPolicy(input, init, 'error', publicNetworkDispatcher)
}

/**
 * Download a Provider-returned media URL. Hostnames may be Clash fake-ip
 * (198.18/15) when HTTPS_PROXY is set; private IP literals stay blocked.
 */
/**
 * The proxy resolves hostnames itself, so socket-level private-IP checks cannot run on that path.
 * Only callers whose result URLs come from admin-managed upstreams may set `allowProxy`.
 */
export async function fetchPublicMedia(input: string | URL | Request, init: RequestInit = {}, options: { allowProxy?: boolean } = {}) {
  const url = publicHttpUrl(requestUrl(input))
  if (options.allowProxy && configuredOutboundProxy() && !isIP(normalizedHostname(url))) {
    return fetchWithPolicy(url, init, 'error', mediaDispatcher())
  }
  return fetchPublicNoRedirect(url, init)
}

/** Used only by callers that validate every Location hop themselves. */
export async function fetchPublicManualRedirect(input: string | URL | Request, init: RequestInit = {}) {
  publicHttpUrl(requestUrl(input))
  return fetchWithPolicy(input, init, 'manual', publicNetworkDispatcher)
}

/**
 * Follow same-host public redirects so OpenAI-compatible / Sub2API gateways
 * that issue a trailing-slash or https hop still work for BYOK discovery.
 * Cross-host hops are rejected so the API key never leaves the approved host.
 */
export async function fetchPublicSameHostRedirects(input: string | URL, init: RequestInit = {}, maxRedirects = 3) {
  let current = publicHttpUrl(input)
  for (let hops = 0; hops <= maxRedirects; hops += 1) {
    const response = await fetchPublicManualRedirect(current, init)
    if (response.status < 300 || response.status >= 400) return response
    const location = response.headers.get('location')
    await response.body?.cancel().catch(() => undefined)
    if (!location) throw new OutboundRedirectError(response.status)
    let next: URL
    try {
      next = new URL(location, current)
    } catch {
      throw new OutboundRedirectError(response.status)
    }
    if (next.hostname.toLowerCase() !== current.hostname.toLowerCase()) throw new OutboundRedirectError(response.status)
    current = publicHttpUrl(next)
  }
  throw new OutboundRedirectError()
}

function requestUrl(input: string | URL | Request) {
  return typeof input === 'string' || input instanceof URL ? input : input.url
}

async function fetchWithPolicy(input: string | URL | Request, init: RequestInit, redirect: RequestRedirect, dispatcher?: Dispatcher) {
  const inheritedSignal = outboundContext.getStore()?.signal
  const signals = [init.signal, inheritedSignal].filter((signal): signal is AbortSignal => Boolean(signal))
  const requestInit: FetchInitWithDispatcher = {
    ...init,
    redirect,
    ...(dispatcher ? { dispatcher } : {}),
    ...(signals.length ? { signal: signals.length === 1 ? signals[0] : AbortSignal.any(signals) } : {}),
  }
  const response = await fetch(input, requestInit as RequestInit)
  // Real fetch rejects redirect:'error' before returning a 3xx. Keep this
  // explicit check for alternative fetch implementations and test doubles.
  if (redirect === 'error' && response.status >= 300 && response.status < 400) {
    await response.body?.cancel().catch(() => undefined)
    throw new OutboundRedirectError(response.status)
  }
  return response
}
