import assert from 'node:assert/strict'
import test from 'node:test'
import { fetchWithAllowedRedirects } from '../../server/src/common/allowed-redirect-fetch'

const hosts = new Set(['allowed.example'])
const messages = {
  invalidUrl: '地址无效',
  disallowedHost: '来源不在允许列表',
  invalidLocation: '重定向地址无效',
  tooManyRedirects: '重定向次数超过限制',
}

function jsonResponse(status: number, body = 'ok', headers: Record<string, string> = {}) {
  return new Response(body, { status, headers })
}

test('allowlist redirect fetch follows revalidated HTTPS hops and returns the terminal URL', async () => {
  const seen: string[] = []
  const { response, url } = await fetchWithAllowedRedirects('https://allowed.example/start', {}, {
    allowedHosts: hosts,
    maxRedirects: 3,
    messages,
    fetch: async (current) => {
      seen.push(current.toString())
      if (current.pathname === '/start') return jsonResponse(302, '', { location: '/next' })
      return jsonResponse(200, 'done')
    },
  })
  assert.equal(await response.text(), 'done')
  assert.equal(url.toString(), 'https://allowed.example/next')
  assert.deepEqual(seen, ['https://allowed.example/start', 'https://allowed.example/next'])
})

test('allowlist redirect fetch rejects off-host redirects and wraps fetch failures', async () => {
  await assert.rejects(
    () => fetchWithAllowedRedirects('https://evil.example/start', {}, {
      allowedHosts: hosts,
      maxRedirects: 3,
      messages,
      fetch: async () => jsonResponse(200),
    }),
    /来源不在允许列表/,
  )

  await assert.rejects(
    () => fetchWithAllowedRedirects('https://allowed.example/start', {}, {
      allowedHosts: hosts,
      maxRedirects: 3,
      messages,
      fetch: async () => { throw new Error('offline') },
      wrapFetchError: () => { throw new Error('来源暂时无法访问') },
    }),
    /来源暂时无法访问/,
  )
})

test('allowlist redirect fetch stops after the configured hop limit', async () => {
  await assert.rejects(
    () => fetchWithAllowedRedirects('https://allowed.example/hop-0', {}, {
      allowedHosts: hosts,
      maxRedirects: 3,
      messages,
      fetch: async (current) => jsonResponse(302, '', { location: `/hop-${Number(current.pathname.split('-')[1] || 0) + 1}` }),
    }),
    /重定向次数超过限制/,
  )
})
