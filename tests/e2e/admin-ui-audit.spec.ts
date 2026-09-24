import { expect, test, type Page } from '@playwright/test'
import { e2eAdminUrl, getE2EAdminCredentials } from './helpers'

const adminUrl = e2eAdminUrl

const routes = [
  ['dashboard/console', '工作台'], ['dashboard/analysis', '经营分析'], ['dashboard/ecommerce', '商业化看板'],
  ['enterprise/customers/users', '客户管理'], ['enterprise/customers/groups', '用户分组'], ['enterprise/customers/teams', '团队与成员'], ['enterprise/customers/credits', '额度流水'],
  ['enterprise/ai/providers', '上游渠道'], ['enterprise/ai/models', '模型与定价'], ['enterprise/ai/jobs', '生成任务'],
  ['enterprise/content/inspirations', '灵感内容'], ['enterprise/content/image-tools', '图片工具'],
  ['enterprise/content/prompt-templates', '提示词模板'], ['enterprise/content/prompt-library', '提示词库'],
  ['enterprise/agent-tools/skills', '技能管理'], ['enterprise/agent-tools/skill-categories', '技能分类'],
  ['enterprise/agent-tools/agent-operations', 'Agent 运营中心'], ['enterprise/agent-tools/assistants', 'AI 助手'],
  ['enterprise/agent-tools/tools', '工具与审批'], ['enterprise/agent-tools/web-search', '联网搜索'],
  ['enterprise/agent-tools/tool-approvals', '审批申请'], ['enterprise/agent-tools/knowledge-bases', '知识库'],
  ['enterprise/workspace/assets', '文件与资产'], ['enterprise/workspace/projects', '项目与工作流'],
  ['enterprise/workspace/external-links', '外部入口'],
  ['enterprise/commerce/subscriptions', '订阅与套餐'], ['enterprise/commerce/payments', '充值与支付'],
  ['enterprise/commerce/margins', '成本与毛利'], ['enterprise/commerce/byok', '用户密钥运营'],
  ['enterprise/commerce/governance', '商业治理'],
  ['enterprise/operations/announcements', '公告管理'], ['enterprise/operations/notification-templates', '通知模板'],
  ['enterprise/operations/notification-deliveries', '通知投递'], ['enterprise/operations/moderation-rules', '审核规则'],
  ['enterprise/operations/moderation', '内容审核'], ['enterprise/operations/support', '客服工单'],
  ['enterprise/operations/alerts', '告警中心'], ['enterprise/operations/alert-rules', '告警规则'],
  ['enterprise/operations/logins', '登录会话'], ['enterprise/operations/audits', '审计日志'],
  ['enterprise/operations/tool-calls', '工具调用记录'], ['enterprise/operations/system-health', '系统健康'],
  ['enterprise/settings', '业务系统配置'], ['enterprise/content/pages', '关于我们']
] as const

async function login(page: Page) {
  const { email, password } = getE2EAdminCredentials()
  await page.goto(adminUrl)
  await page.getByPlaceholder('管理员邮箱').fill(email)
  await page.getByPlaceholder('密码').fill(password)
  await page.getByRole('button', { name: '进入管理后台' }).click()
  await expect(page).toHaveURL(/#\/dashboard\/console$/)
}

async function layoutMetrics(page: Page) {
  // 后台是 hash 路由 SPA：goto 切页可能触发客户端跳转，evaluate 撞上导航会抛
  // "Execution context was destroyed"。等待加载态并带重试，规避时序竞态。
  for (let attempt = 0; ; attempt++) {
    try {
      await page.waitForLoadState('load')
      return await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        documentWidth: document.documentElement.scrollWidth,
        bodyWidth: document.body.scrollWidth,
        visibleOverflow: [...document.querySelectorAll<HTMLElement>('*')]
          .filter((element) => {
            const rect = element.getBoundingClientRect()
            if (rect.right <= document.documentElement.clientWidth + 2 && rect.left >= -2) return false

            let parent = element.parentElement
            while (parent && parent !== document.body) {
              const style = getComputedStyle(parent)
              const clips = ['hidden', 'clip', 'auto', 'scroll'].includes(style.overflowX)
              if (clips) return false
              parent = parent.parentElement
            }
            return true
          })
          .slice(0, 8)
          .map((element) => `${element.tagName}.${element.className}`)
      }))
    } catch (error) {
      const message = String((error as { message?: string })?.message || error)
      if (attempt >= 2 || !message.includes('Execution context was destroyed')) throw error
      await page.waitForTimeout(500)
    }
  }
}

async function assertRouteReady(page: Page, path: string, title: string) {
  if (path === 'enterprise/content/pages') {
    // A clean staging database has no seeded articles. The page heading is
    // still required, while the content list may legitimately be empty.
    await expect(page.locator('main .el-empty, main .content-card').first()).toBeVisible({ timeout: 12_000 })
  } else {
    await expect(page.locator('main').getByText(title, { exact: true }).last()).toBeVisible({ timeout: 12_000 })
  }
}

test('管理端所有业务页面 UI 宽度巡检', async ({ page }) => {
  test.setTimeout(180_000)
  const errors: string[] = []
  const failedRequests: string[] = []
  const overflow: string[] = []
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
  page.on('response', (response) => { if (response.status() >= 500 || response.status() === 401) failedRequests.push(`${response.status()} ${response.url()}`) })
  await login(page)

  for (const [path, title] of routes) {
    await page.goto(`${adminUrl}#/${path}`)
    // hash 路由 SPA 的 goto 可能撞上客户端重定向（worktab 初始化把路由替换回别的页），
    // 首次断言失败时重跳一次再断言，规避时序竞态
    try {
      await assertRouteReady(page, path, title)
    } catch {
      await page.goto(`${adminUrl}#/${path}`)
      await assertRouteReady(page, path, title)
    }
    await page.waitForTimeout(500)
    await expect(page.getByText('页面不存在', { exact: true })).toHaveCount(0)
    const desktop = await layoutMetrics(page)
    if (desktop.documentWidth > desktop.viewport + 2 || desktop.bodyWidth > desktop.viewport + 2) overflow.push(`${path} desktop ${JSON.stringify(desktop)}`)

    await page.setViewportSize({ width: 390, height: 844 })
    await page.waitForTimeout(500)
    const mobile = await layoutMetrics(page)
    if (mobile.documentWidth > mobile.viewport + 2 || mobile.bodyWidth > mobile.viewport + 2) overflow.push(`${path} mobile ${JSON.stringify(mobile)}`)
    await page.setViewportSize({ width: 1440, height: 900 })
  }

  expect(failedRequests, failedRequests.join('\n')).toEqual([])
  expect(errors, errors.join('\n')).toEqual([])
  expect(overflow, overflow.join('\n')).toEqual([])
})

test('管理端全局搜索支持业务别名并展示所属功能域', async ({ page }) => {
  await login(page)
  await page.getByText('搜索', { exact: true }).click()

  const searchInput = page.getByPlaceholder('搜索页面、功能或业务关键词')
  await expect(searchInput).toBeVisible()

  const cases = [
    { query: 'BYOK', title: '用户密钥运营', domain: '商业化' },
    { query: '生成记录', title: '生成任务', domain: '模型与生成' },
    { query: '插件', title: '技能管理', domain: 'AI 能力' }
  ] as const

  for (const item of cases) {
    await searchInput.fill(item.query)
    const result = page.locator('.search-result-row').filter({ hasText: item.title })
    await expect(result).toBeVisible()
    await expect(result).toContainText(item.domain)
  }

  await searchInput.fill('BYOK')
  await page.locator('.search-result-row').filter({ hasText: '用户密钥运营' }).click()
  await expect(page).toHaveURL(/#\/enterprise\/commerce\/byok$/)

  await page.getByText('搜索', { exact: true }).click()
  await page.setViewportSize({ width: 390, height: 844 })
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  const box = await dialog.boundingBox()
  expect(box).not.toBeNull()
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(390)
})
