import assert from 'node:assert/strict'
import test from 'node:test'
import { cookieMutationAllowed, parseTrustProxy, parseWebOrigins } from '../../server/src/config/http-security'

test('proxy trust rejects blanket forwarded-header trust', () => {
  assert.equal(parseTrustProxy(undefined), false)
  assert.equal(parseTrustProxy('1'), 1)
  assert.deepEqual(parseTrustProxy('loopback, 10.0.0.0/8'), ['loopback', '10.0.0.0/8'])
  assert.throws(() => parseTrustProxy('true'), /explicit hop count/)
})

test('web origins are normalized and invalid paths fail closed', () => {
  assert.deepEqual(parseWebOrigins('https://example.com/,http://localhost:8080'), ['https://example.com', 'http://localhost:8080'])
  assert.throws(() => parseWebOrigins('https://example.com/app'), /Invalid WEB_ORIGIN/)
})

test('cookie-authenticated mutations require the request marker or an allowed origin', () => {
  const origins = ['https://app.example.com']
  assert.equal(cookieMutationAllowed({ method: 'GET', hasSessionCookie: true }, origins), true)
  assert.equal(cookieMutationAllowed({ method: 'POST', hasSessionCookie: false }, origins), true)
  assert.equal(cookieMutationAllowed({ method: 'POST', hasSessionCookie: true, requestMarker: '1' }, origins), true)
  assert.equal(cookieMutationAllowed({ method: 'POST', hasSessionCookie: true, requestMarker: '1', origin: 'https://evil.example' }, origins), false)
  assert.equal(cookieMutationAllowed({ method: 'DELETE', hasSessionCookie: true, origin: 'https://app.example.com' }, origins), true)
  assert.equal(cookieMutationAllowed({ method: 'PATCH', hasSessionCookie: true, origin: 'https://evil.example' }, origins), false)
  assert.equal(cookieMutationAllowed({ method: 'POST', hasSessionCookie: true }, origins), false)
})
