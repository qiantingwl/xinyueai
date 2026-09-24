/**
 * E2E 全局兜底清扫：跑完（哪怕有用例失败）后删除本轮测试账号名下所有
 * `e2e-` 前缀画布，避免运行被硬中断时残留测试数据污染开发库。
 * 凭据与地址与 tests/e2e/helpers.ts 的约定一致（E2E_* 环境变量）。
 */
const apiOrigin = (process.env.E2E_API_ORIGIN || 'http://localhost:3100').replace(/\/+$/, '')
const email = process.env.E2E_ADMIN_EMAIL || ''
const password = process.env.E2E_ADMIN_PASSWORD || ''

export default async function () {
  if (!email || !password) return
  try {
    const login = await fetch(`${apiOrigin}/v1/auth/admin/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    if (!login.ok) return
    const setCookie = login.headers.get('set-cookie') || ''
    const cookie = setCookie.split(';')[0]
    const list = await (await fetch(`${apiOrigin}/v1/canvases`, { headers: { cookie } })).json()
    const stale = (Array.isArray(list) ? list : []).filter((row) => /^e2e-/.test(row.title || ''))
    let deleted = 0
    for (const row of stale) {
      const res = await fetch(`${apiOrigin}/v1/canvases/${row.id}`, { method: 'DELETE', headers: { cookie } })
      if (res.ok || res.status === 404) deleted += 1
    }
    if (deleted) console.log(`[e2e-cleanup] removed ${deleted} leftover e2e-* canvas(es)`)
  } catch (reason) {
    console.log(`[e2e-cleanup] skipped: ${reason instanceof Error ? reason.message : reason}`)
  }
}
