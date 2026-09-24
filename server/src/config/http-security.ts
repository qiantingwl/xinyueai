const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

export const COOKIE_MUTATION_HEADER = 'x-xinyue-request'

export type TrustProxySetting = false | number | string | string[]

function normalizedOrigin(value: string | undefined): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null
    if (url.pathname !== '/' || url.search || url.hash) return null
    return url.origin
  } catch {
    return null
  }
}

export function parseWebOrigins(value: string | undefined, additional: string[] = []) {
  const configured = (value || '').split(',').map((entry) => entry.trim()).filter(Boolean)
  return [...new Set([...configured, ...additional].map((entry) => {
    const origin = normalizedOrigin(entry)
    if (!origin) throw new Error(`Invalid WEB_ORIGIN entry: ${entry}`)
    return origin
  }))]
}

export function parseTrustProxy(value: string | undefined): TrustProxySetting {
  const configured = String(value || '').trim()
  if (!configured || /^(false|off|no|0)$/i.test(configured)) return false
  if (/^(true|on|yes|\*)$/i.test(configured)) {
    throw new Error('TRUST_PROXY must be an explicit hop count or proxy IP/CIDR, not a blanket trust value')
  }
  if (/^\d+$/.test(configured)) {
    const hops = Number(configured)
    if (!Number.isSafeInteger(hops) || hops < 1 || hops > 16) throw new Error('TRUST_PROXY hop count must be between 1 and 16')
    return hops
  }
  const proxies = configured.split(',').map((entry) => entry.trim()).filter(Boolean)
  if (!proxies.length) return false
  return proxies.length === 1 ? proxies[0] : proxies
}

export function cookieMutationAllowed(input: {
  method: string
  hasSessionCookie: boolean
  requestMarker?: string
  origin?: string
}, allowedOrigins: readonly string[]) {
  if (SAFE_METHODS.has(input.method.toUpperCase()) || !input.hasSessionCookie) return true
  const origin = normalizedOrigin(input.origin)
  if (origin) {
    return allowedOrigins.includes(origin)
  }
  return input.requestMarker === '1'
}
