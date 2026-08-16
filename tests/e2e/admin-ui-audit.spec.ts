import { expect, test, type Page } from '@playwright/test'

const adminUrl = 'http://localhost:5174/admin/'
const adminEmail = process.env.E2E_ADMIN_EMAIL || 'admin@flux.local'
const adminPassword = process.env.E2E_ADMIN_PASSWORD || 'FluxAdmin@2026!'

const routes = [
  ['dashboard/console', '工作台'], ['dashboard/analysis', '分析页'], ['dashboard/ecommerce', '电子商务'],
  ['enterprise/customers/users', '客户管理'], ['enterprise/customers/groups', '用户分组'], ['enterprise/customers/credits', '额度流水'],
  ['enterprise/ai/providers', '上游渠道'], ['enterprise/ai/models', '模型与定价'], ['enterprise/ai/jobs', '生成任务'],
  ['enterprise/content/inspirations', '灵感内容'], ['enterprise/content/image-tools', '图片工具'],
  ['enterprise/content/prompt-templates', '提示词模板'], ['enterprise/content/prompt-library', '提示词库'],
  ['enterprise/agent-tools/skills', '插件管理'], ['enterprise/agent-tools/skill-categories', '插件分类'],
  ['enterprise/agent-tools/agent-operations', 'Agent 运营中心'], ['enterprise/agent-tools/assistants', 'AI 助手'],
  ['enterprise/agent-tools/tools', '工具与审批'], ['enterprise/agent-tools/web-search', '联网搜索'],
  ['enterprise/agent-tools/tool-approvals', '审批申请'], ['enterprise/agent-tools/knowledge-bases', '知识库'],
  ['enterprise/workspace/assets', '文件与资产'], ['enterprise/workspace/projects', '项目与工作流'],
  ['enterprise/workspace/external-links', '外部入口'],
  ['enterprise/commerce/subscriptions', '订阅与套餐'], ['enterprise/commerce/payments', '商业化中心'],
  ['enterprise/operations/announcements', '公告管理'], ['enterprise/operations/moderation-rules', '审核规则'],
  ['enterprise/operations/moderation', '内容审核'], ['enterprise/operations/support', '客服工单'],
  ['enterprise/operations/alerts', '告警中心'], ['enterprise/operations/alert-rules', '告警规则'],
  ['enterprise/operations/logins', '登录会话'], ['enterprise/operations/audits', '审计日志'],
  ['enterprise/operations/tool-calls', '工具调用记录'], ['enterprise/operations/system-health', '系统健康'],
  ['enterprise/settings', '业务系统配置'], ['article/article-list', '关于我们']
] as const

async function login(page: Page) {
  await page.goto(adminUrl)
  await page.getByPlaceholder('管理员邮箱').fill(adminEmail)
  await page.getByPlaceholder('密码').fill(adminPassword)
  await page.getByRole('button', { name: '进入管理后台' }).click()
  await expect(page).toHaveURL(/#\/dashboard\/console$/)
}

async function layoutMetrics(page: Page) {
  return page.evaluate(() => ({
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
    await expect(page.locator('main').getByText(title, { exact: true }).last()).toBeVisible({ timeout: 12_000 })
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
