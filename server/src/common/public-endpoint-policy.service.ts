import { BadRequestException, Injectable } from '@nestjs/common'
import { isIP } from 'node:net'
import { lookup } from 'node:dns/promises'

export function publicHttpUrl(value: string | URL): URL {
  let url: URL
  try { url = value instanceof URL ? new URL(value.toString()) : new URL(value) } catch { throw new BadRequestException('工具 Endpoint 地址无效') }
  const hostname = normalizedHostname(url)
  if (!['http:', 'https:'].includes(url.protocol) || !hostname || url.username || url.password) throw new BadRequestException('工具 Endpoint 仅允许公网 HTTP/HTTPS 地址')
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') || hostname.endsWith('.internal')) throw new BadRequestException('工具 Endpoint 不允许访问本机或内网')
  if (isIP(hostname) && isPrivateNetworkAddress(hostname)) throw new BadRequestException('工具 Endpoint 解析到非公网地址')
  return url
}

/**
 * Local workers are intentionally reachable on a private network, but their
 * targets must still be explicitly allowlisted.  This keeps the exception
 * narrow instead of turning every admin-configurable provider into an SSRF
 * primitive.
 */
export function localWorkerHttpUrl(value: string | URL, allowedHosts: Iterable<string>): URL {
  let url: URL
  try { url = value instanceof URL ? new URL(value.toString()) : new URL(value) } catch { throw new BadRequestException('本地 Worker Endpoint 地址无效') }
  const hostname = normalizedHostname(url)
  if (!['http:', 'https:'].includes(url.protocol) || !hostname || url.username || url.password) throw new BadRequestException('本地 Worker Endpoint 仅允许 HTTP/HTTPS 地址')

  const normalized = new Set([...allowedHosts].map((item) => normalizeAllowedHost(item)).filter(Boolean))
  const host = hostname.toLowerCase().replace(/\.$/, '')
  const port = url.port || (url.protocol === 'https:' ? '443' : '80')
  if (!normalized.has(host) && !normalized.has(`${host}:${port}`)) throw new BadRequestException('本地 Worker Endpoint 不在允许列表中')
  return url
}

function normalizeAllowedHost(value: string) {
  const raw = String(value || '').trim().toLowerCase()
  if (!raw) return ''
  try {
    const parsed = raw.includes('://') ? new URL(raw) : null
    if (parsed) return `${normalizedHostname(parsed)}${parsed.port ? `:${parsed.port}` : ''}`
  } catch {
    return ''
  }
  return raw.replace(/^\[/, '').replace(/\]$/, '').replace(/\.$/, '')
}

export function normalizedHostname(url: URL) {
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '')
  return hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname
}

export function isPrivateNetworkAddress(value: string) {
  const address = value.trim().toLowerCase()
  const version = isIP(address)
  if (version === 6) return isPrivateIpv6(address)
  if (version !== 4) return true
  return isPrivateIpv4(address)
}

function isPrivateIpv4(address: string) {
  const parts = address.split('.').map(Number)
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true
  const [a, b, c] = parts
  return a === 0
    || a === 10
    || a === 127
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 192 && b === 0 && (c === 0 || c === 2))
    || (a === 198 && (b === 18 || b === 19))
    || (a === 198 && b === 51 && c === 100)
    || (a === 203 && b === 0 && c === 113)
    || a >= 224
}

function isPrivateIpv6(address: string) {
  const groups = ipv6Groups(address)
  if (!groups) return true
  const first = groups[0]
  const compatible = groups.slice(0, 6).every((group) => group === 0)
  if (compatible) {
    if (groups[6] === 0 && groups[7] <= 1) return true
    return isPrivateIpv4(embeddedIpv4(groups[6], groups[7]))
  }
  const mapped = groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff
  if (mapped) return isPrivateIpv4(embeddedIpv4(groups[6], groups[7]))
  if (first === 0x0064 && groups[1] === 0xff9b) return true
  if (first === 0x2002) return true
  if (first === 0x2001 && groups[1] === 0) return true
  return (first & 0xfe00) === 0xfc00
    || (first & 0xffc0) === 0xfe80
    || (first & 0xffc0) === 0xfec0
    || (first & 0xff00) === 0xff00
    || (first === 0x0100 && groups.slice(1, 4).every((group) => group === 0))
    || (first === 0x2001 && groups[1] === 0x0002 && groups[2] === 0)
    || (first === 0x2001 && groups[1] === 0x0db8)
}

function embeddedIpv4(high: number, low: number) {
  return `${high >>> 8}.${high & 0xff}.${low >>> 8}.${low & 0xff}`
}

function ipv6Groups(address: string): number[] | null {
  const value = address.split('%', 1)[0]
  const sections = value.split('::')
  if (sections.length > 2) return null
  const left = sections[0] ? sections[0].split(':') : []
  const right = sections.length === 2 && sections[1] ? sections[1].split(':') : []
  if ((sections.length === 1 && left.length !== 8) || left.length + right.length >= 8) return null
  const fill = sections.length === 2 ? new Array(8 - left.length - right.length).fill('0') : []
  const raw = [...left, ...fill, ...right]
  if (raw.length !== 8 || raw.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) return null
  return raw.map((group) => Number.parseInt(group, 16))
}

@Injectable()
export class PublicEndpointPolicyService {
  async assertPublicHttpUrl(value: string): Promise<URL> {
    const url = publicHttpUrl(value)
    const lookupHost = normalizedHostname(url)
    let addresses: string[]
    try { addresses = isIP(lookupHost) ? [lookupHost] : (await lookup(lookupHost, { all: true, verbatim: true })).map((item) => item.address) } catch { throw new BadRequestException('工具 Endpoint DNS 解析失败') }
    if (!addresses.length) throw new BadRequestException('工具 Endpoint 解析到非公网地址')
    const publicAddresses = addresses.filter((address) => !isPrivateNetworkAddress(address))
    if (!publicAddresses.length) throw new BadRequestException('工具 Endpoint 解析到非公网地址')
    return url
  }
}
