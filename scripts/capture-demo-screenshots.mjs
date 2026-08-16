import { chromium } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const outputDir = resolve(root, 'docs', 'images')
const adminEmail = process.env.E2E_ADMIN_EMAIL || 'admin@flux.local'
const adminPassword = process.env.E2E_ADMIN_PASSWORD || 'FluxAdmin@2026!'

await mkdir(outputDir, { recursive: true })

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({
  baseURL: 'http://localhost:5173',
  colorScheme: 'light',
  locale: 'zh-CN',
  viewport: { width: 1600, height: 1000 },
})
const page = await context.newPage()

async function stabilize() {
  await page.addStyleTag({ content: '*,*::before,*::after{animation-duration:0s!important;transition-duration:0s!important;caret-color:transparent!important}' })
  await page.evaluate(async () => { await document.fonts.ready })
  await page.waitForTimeout(350)
}

async function capture(path, selector, filename) {
  await page.goto(path, { waitUntil: 'networkidle' })
  await page.locator(selector).waitFor({ state: 'visible' })
  await stabilize()
  await page.screenshot({ path: resolve(outputDir, filename), fullPage: false })
}

try {
  const login = await context.request.post('/v1/auth/admin/login', {
    data: { email: adminEmail, password: adminPassword },
  })
  if (!login.ok()) throw new Error(`用户端演示图登录失败：HTTP ${login.status()}`)

  await page.route('**/v1/conversations**', async (route) => {
    const url = new URL(route.request().url())
    if (route.request().method() === 'GET' && url.pathname === '/v1/conversations') {
      await route.fulfill({ json: [] })
      return
    }
    await route.continue()
  })

  await capture('/chat', '.studio-chat', 'xinyue-chat.png')
  await capture('/image', '.studio-create-page', 'xinyue-creation.png')
  await capture('/capabilities', '.capability-page', 'xinyue-capability-center.png')

  await page.unrouteAll({ behavior: 'wait' })
  await context.clearCookies()
  await page.goto('http://localhost:5174/admin/', { waitUntil: 'networkidle' })
  const emailInput = page.getByPlaceholder('管理员邮箱')
  if (await emailInput.isVisible()) {
    await emailInput.fill(adminEmail)
    await page.getByPlaceholder('密码').fill(adminPassword)
    await page.getByRole('button', { name: '进入管理后台' }).click()
  }
  await page.waitForURL(/#\/dashboard\/console$/)
  await page.getByText('工作台', { exact: true }).first().waitFor({ state: 'visible' })
  await stabilize()
  await page.screenshot({ path: resolve(outputDir, 'xinyue-admin-dashboard.png'), fullPage: false })
} finally {
  await browser.close()
}

console.log(`演示图已生成：${outputDir}`)
