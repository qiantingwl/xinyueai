import assert from 'node:assert/strict'
import test from 'node:test'
import { isOptInEnabled, isSourceEffectivelyEnabled } from '../../server/src/common/external-content-policy'
import { ExternalMarketService } from '../../server/src/plugins/external-market.service'

test('external content opt-in defaults to disabled', () => {
  assert.equal(isOptInEnabled(undefined), false)
  assert.equal(isOptInEnabled(''), false)
})

test('external content opt-in rejects false and invalid values', () => {
  for (const value of ['false', '0', 'enabled', 'tru', 'off', 0, null]) {
    assert.equal(isOptInEnabled(value), false)
  }
})

test('external content opt-in accepts only explicit affirmative values', () => {
  for (const value of ['true', 'TRUE', '1', 'yes', 'on', true, 1]) {
    assert.equal(isOptInEnabled(value), true)
  }
})

test('internal sources remain enabled by default', () => {
  assert.equal(isSourceEffectivelyEnabled({ external: false }), true)
})

test('external sources require administrator acceptance or environment opt-in', () => {
  assert.equal(isSourceEffectivelyEnabled({ external: true, configuredEnabled: true }), false)
  assert.equal(isSourceEffectivelyEnabled({ external: true, configuredEnabled: true, reviewAcceptedAt: new Date() }), true)
  assert.equal(isSourceEffectivelyEnabled({ external: true, environmentOptIn: 'yes' }), true)
})

test('explicitly disabled sources stay disabled', () => {
  assert.equal(isSourceEffectivelyEnabled({ external: true, configuredEnabled: false, reviewAcceptedAt: new Date(), environmentOptIn: 'true' }), false)
})

test('an unconfigured external skill market stays off and neither queries installations nor allows installs', async (t) => {
  const previous = process.env.EXTERNAL_SKILL_MARKET_ENABLED
  delete process.env.EXTERNAL_SKILL_MARKET_ENABLED
  t.after(() => {
    if (previous === undefined) delete process.env.EXTERNAL_SKILL_MARKET_ENABLED
    else process.env.EXTERNAL_SKILL_MARKET_ENABLED = previous
  })

  const plugins = {
    externalInstallationKeys: async () => { throw new Error('must not query installations') },
    findImported: async () => { throw new Error('must not inspect imported skills') },
  }
  const service = new ExternalMarketService(plugins as never)
  await service.onModuleInit()

  const result = await service.search('user-1', 'writing')
  assert.equal(result.enabled, false)
  assert.equal(result.total, 0)
  assert.deepEqual(result.items, [])
  await assert.rejects(
    () => service.install('user-1', { source: 'skillsmp', id: 'example' }),
    /外部技能市场已关闭/,
  )
  service.onModuleDestroy()
})
