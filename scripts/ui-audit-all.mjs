// 全页面 UI 审计：逐路由截图（桌面深/浅 + 移动端深色），收集控制台错误与横向溢出。
// 结果输出到 tests/e2e/.ui-audit/，并在 stdout 打印每页问题汇总。
import { chromium } from '@playwright/test'
import fs from 'node:fs'
import { getE2EAdminCredentials } from './e2e-admin-credentials.mjs'

const outDir = 'tests/e2e/.ui-audit'
fs.rmSync(outDir, { recursive: true, force: true })
fs.mkdirSync(outDir, { recursive: true })

const base = 'http://localhost:6001'
const api = 'http://localhost:3100'
const { email: adminEmail, password: adminPassword } = getE2EAdminCredentials()

const ROUTES = [
  ['landing', '/', false],
  ['login', '/login', false],
  ['chat', '/chat', true],
  ['image', '/image', true],
  ['video', '/video', true],
  ['commerce', '/commerce', true],
  ['office', '/office', true],
  ['prompts', '/prompts', true],
  ['capabilities', '/capabilities', true],
  ['works', '/works', true],
  ['canvases', '/canvases', true],
  ['api', '/api', false],
  ['about', '/about', false],
  ['privacy', '/privacy', false],
]
// 移动端只跑核心页面
const MOBILE_ROUTES = ['landing', 'login', 'chat', 'image', 'office', 'prompts', 'works', 'canvases']

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const anonCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const login = await ctx.request.post(`${api}/v1/auth/admin/login`, {
  data: { email: adminEmail, password: adminPassword },
})
const sc = login.headersArray().find((h) => h.name.toLowerCase() === 'set-cookie')
const [nv] = sc.value.split(/;\s*/)
const sep = nv.indexOf('=')
const cookieHeader = nv
const cookie = { name: nv.slice(0, sep), value: nv.slice(sep + 1), domain: 'localhost', path: '/' }

async function setTheme(appearance) {
  await ctx.request.patch(`${api}/v1/users/me/settings`, {
    headers: { Cookie: cookieHeader, 'Content-Type': 'application/json' },
    data: { appearance },
  })
}

const report = []

async function audit(name, path, needsAuth, viewport, theme) {
  // 公开页（landing/login/api/about/privacy）用未登录 context，否则 /login 会被重定向到 /chat。
  // 未登录时服务端主题设置不生效，公开页通过 data-studio-theme 属性控制明暗。
  const activeCtx = needsAuth ? ctx : anonCtx
  if (needsAuth) {
    await setTheme(theme)
    await activeCtx.addCookies([cookie])
  }
  const page = await activeCtx.newPage()
  if (!needsAuth) {
    // 公开页无 WorkspaceShell，主题由 index.html 启动脚本按 matchMedia/localStorage 解析，用 colorScheme 模拟
    await page.emulateMedia({ colorScheme: theme })
  }
  const errors = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)) })
  page.on('pageerror', (e) => errors.push(`pageerror: ${String(e).slice(0, 200)}`))
  await page.setViewportSize(viewport)
  await page.goto(`${base}${path}`, { waitUntil: 'networkidle' }).catch(() => {})
  await page.waitForTimeout(1600)
  const metrics = await page.evaluate(() => {
    const el = document.scrollingElement
    return {
      title: document.title,
      hOverflow: el.scrollWidth - el.clientWidth,
      vHeight: el.scrollHeight,
      loginVisible: !!document.querySelector('input[type="password"], .login-page, .auth-card'),
    }
  })
  const tag = `${name}-${theme}${viewport.width < 500 ? '-mobile' : ''}`
  await page.screenshot({ path: `${outDir}/${tag}.png` })
  const issues = []
  if (metrics.hOverflow > 2) issues.push(`横向溢出 +${metrics.hOverflow}px`)
  const realErrors = errors.filter((e) => !/favicon|net::|Failed to load resource|401|403/.test(e))
  if (realErrors.length) issues.push(`控制台错误: ${realErrors.slice(0, 3).join(' ; ')}`)
  if (needsAuth && metrics.loginVisible) issues.push('疑似被重定向到登录页')
  if (!needsAuth && name === 'login' && !metrics.loginVisible) issues.push('登录页未渲染（可能被重定向）')
  report.push({ tag, issues })
  await page.close()
}

for (const theme of ['dark', 'light']) {
  for (const [name, path, needsAuth] of ROUTES) {
    await audit(name, path, needsAuth, { width: 1440, height: 900 }, theme)
  }
}
for (const [name, path, needsAuth] of ROUTES.filter(([n]) => MOBILE_ROUTES.includes(n))) {
  await audit(name, path, needsAuth, { width: 390, height: 844 }, 'dark')
}

await setTheme('light')
await browser.close()

console.log('\n===== UI 审计汇总 =====')
for (const r of report) {
  console.log(`${r.issues.length ? '❌' : '✅'} ${r.tag}${r.issues.length ? ' — ' + r.issues.join(' | ') : ''}`)
}
