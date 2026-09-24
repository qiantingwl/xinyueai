require('dotenv').config()
const { createHash, randomBytes } = require('node:crypto')
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()
const baseUrl = `http://localhost:${process.env.PORT || 3100}/v1`
const marker = `plugin-test-${Date.now()}`

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function session(userId) {
  const token = randomBytes(32).toString('base64url')
  await prisma.session.create({ data: { userId, tokenHash: createHash('sha256').update(token).digest('hex'), authMethod: 'test', expiresAt: new Date(Date.now() + 3_600_000) } })
  return token
}

async function request(path, token, init = {}, expected = 200) {
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers: { 'X-Xinyue-Request': '1', ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Cookie: `flux_session=${token}` } : {}), ...init.headers } })
  const text = await response.text()
  let body = null
  try { body = text ? JSON.parse(text) : null } catch { body = text }
  const expectedStatuses = Array.isArray(expected) ? expected : [expected]
  assert(expectedStatuses.includes(response.status), `${init.method || 'GET'} ${path}: expected ${expectedStatuses.join('/')}, received ${response.status}: ${text}`)
  return body
}

async function main() {
  const admin = await prisma.user.findFirst({ where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] }, status: 'ACTIVE' } })
  assert(admin, 'No active admin account is available for plugin API tests')
  const [userA, userB] = await Promise.all([
    prisma.user.create({ data: { email: `${marker}-a@example.test`, displayName: 'Plugin Test A', creditAccount: { create: { balance: 100 } } } }),
    prisma.user.create({ data: { email: `${marker}-b@example.test`, displayName: 'Plugin Test B', creditAccount: { create: { balance: 100 } } } }),
  ])
  const [adminToken, tokenA, tokenB] = await Promise.all([session(admin.id), session(userA.id), session(userB.id)])

  const adminPlugins = await request('/admin/plugins', adminToken)
  assert(adminPlugins.length >= 3, 'Seeded official plugins are missing')
  const market = await request('/plugins/market', tokenA)
  assert(market.length >= 3, 'Plugin market is empty')
  assert(market.every((plugin) => !Object.hasOwn(plugin, 'instruction') && !Object.hasOwn(plugin, 'config') && !Object.hasOwn(plugin, 'outputRequirements')), 'Market API leaked trusted plugin instructions')
  const official = market.find((plugin) => plugin.capabilities.includes('CHAT')) || market[0]
  const categories = await request('/plugins/categories', tokenA)
  assert(categories.length > 0, 'Plugin categories are empty')

  await request(`/plugins/${official.id}/install`, tokenA, { method: 'POST' }, [200, 201])
  const installed = await request('/plugins/installed', tokenA)
  assert(installed.some((plugin) => plugin.id === official.id), 'Installed plugin was not returned')
  assert(installed.every((plugin) => !Object.hasOwn(plugin, 'instruction')), 'Installed API leaked trusted plugin instructions')

  const privatePlugin = await request('/plugins/mine', tokenA, { method: 'POST', body: JSON.stringify({ name: '个人写作规范', description: '仅用于自动化权限测试', instruction: '回答前列出关键约束，然后给出完整结果。', icon: 'chat', categoryId: categories[0].id, version: '1.0.0', capabilities: ['CHAT', 'OFFICE'], outputRequirements: '结论必须可执行。' }) }, [200, 201])
  assert(privatePlugin.icon === 'chat' && privatePlugin.categoryId === categories[0].id, 'Private plugin declarative metadata was not persisted')
  const mineA = await request('/plugins/mine', tokenA)
  const mineB = await request('/plugins/mine', tokenB)
  assert(mineA.some((plugin) => plugin.id === privatePlugin.id), 'Owner cannot see private plugin')
  assert(!mineB.some((plugin) => plugin.id === privatePlugin.id), 'Private plugin leaked to another user')
  await request(`/plugins/mine/${privatePlugin.id}`, tokenB, { method: 'PATCH', body: JSON.stringify({ name: '越权修改', instruction: 'bad', version: '1.0.0', capabilities: ['CHAT'] }) }, 404)
  await request('/generations', tokenB, { method: 'POST', body: JSON.stringify({ kind: 'CHAT', prompt: '越权调用测试', model: 'gpt-5.5', options: { pluginId: privatePlugin.id }, idempotencyKey: marker }) }, 403)
  await request('/plugins/mine', tokenA, { method: 'POST', body: JSON.stringify({ name: '非法配置', instruction: 'test', version: '1.0.0', capabilities: ['CHAT'], config: { endpoint: 'https://example.test/run' } }) }, 400)
  await request('/plugins/mine', tokenA, { method: 'POST', body: JSON.stringify({ name: '非法分类', instruction: 'test', categoryId: 'missing-category', version: '1.0.0', capabilities: ['CHAT'] }) }, 400)
  await request('/plugins/available?capability=EXECUTE', tokenA, {}, 400)
  await request('/admin/plugins', tokenA, {}, 403)

  await request(`/plugins/${official.id}/install`, tokenA, { method: 'DELETE' })
  const availableAfterUninstall = await request('/plugins/available?capability=CHAT', tokenA)
  assert(!availableAfterUninstall.some((plugin) => plugin.id === official.id), 'Uninstalled official plugin remains available')
  assert(availableAfterUninstall.some((plugin) => plugin.id === privatePlugin.id && plugin.owned), 'Private plugin is not available to its owner')
  await request(`/plugins/mine/${privatePlugin.id}`, tokenA, { method: 'DELETE' })

  console.log(JSON.stringify({ ok: true, checks: 17, officialPlugins: adminPlugins.length, marketPlugins: market.length }))
}

main().finally(async () => {
  await prisma.user.deleteMany({ where: { email: { startsWith: marker } } }).catch(() => undefined)
  await prisma.session.deleteMany({ where: { authMethod: 'test' } }).catch(() => undefined)
  await prisma.$disconnect()
})
