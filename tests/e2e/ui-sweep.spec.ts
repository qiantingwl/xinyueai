import { test, expect } from '@playwright/test'
import { loginAdminByApi, assertNoPageOverflow, getE2EAdminCredentials } from './helpers'

// 全站路由渲染巡检：用户端、管理端与聊天皮肤首页
const userRoutes = [
  '/', '/chat', '/image', '/video', '/commerce', '/office', '/prompts',
  '/capabilities', '/works', '/canvases', '/image-prompt', '/workspace',
  '/about', '/copyright', '/privacy', '/terms',
]

const adminRoutes: Array<[string, string]> = [
  ['dashboard/console', '工作台'], ['dashboard/analysis', '经营分析'], ['dashboard/ecommerce', '商业化看板'],
  ['enterprise/customers/users', '客户管理'], ['enterprise/customers/groups', '用户分组'], ['enterprise/customers/teams', '团队与成员'], ['enterprise/customers/credits', '额度流水'],
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
  ['enterprise/commerce/margins', '成本与毛利'], ['enterprise/commerce/byok', '用户密钥运营'],
  ['enterprise/commerce/governance', '商业治理'],
  ['enterprise/operations/announcements', '公告管理'], ['enterprise/operations/notification-templates', '通知模板'],
  ['enterprise/operations/notification-deliveries', '通知投递'], ['enterprise/operations/moderation-rules', '审核规则'],
  ['enterprise/operations/moderation', '内容审核'], ['enterprise/operations/support', '客服工单'],
  ['enterprise/operations/alerts', '告警中心'], ['enterprise/operations/alert-rules', '告警规则'],
  ['enterprise/operations/logins', '登录会话'], ['enterprise/operations/audits', '审计日志'],
  ['enterprise/operations/tool-calls', '工具调用记录'], ['enterprise/operations/system-health', '系统健康'],
  ['enterprise/settings', '业务系统配置'],
]

test('全站 UI 大扫荡：逐页检查渲染、控制台错误、5xx 与横向溢出', async ({ page }) => {
  test.setTimeout(900_000)
  await loginAdminByApi(page)
  const issues: string[] = []
  const consoleErrors: Record<string, string[]> = {}
  let current = ''

  page.on('console', (message) => {
    if (message.type() !== 'error') return
    ;(consoleErrors[current] ||= []).push(message.text().slice(0, 140))
  })
  page.on('response', (response) => {
    if (response.status() >= 500) (consoleErrors[current] ||= []).push(`HTTP ${response.status()} ${response.url()}`)
  })

  const checkPage = async () => {
    await page.waitForLoadState('load')
    await page.waitForTimeout(1200)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    if (overflow > 2) issues.push(`${current}: 横向溢出 ${overflow}px`)
    const blank = await page.evaluate(() => document.body.innerText.trim().length < 10)
    if (blank) issues.push(`${current}: 页面疑似空白`)
  }

  // 用户端全部路由
  for (const path of userRoutes) {
    current = `user ${path}`
    await page.goto(path)
    await checkPage()
  }

  // 画布编辑器（已知画布）
  current = 'user /canvas/:id'
  await page.goto('/canvas/cmu728b85001svgzccag1q3dm')
  await checkPage()

  // 五个皮肤的 /chat 首页（运行时切换 store 预设）
  for (const preset of ['gpt', 'doubao', 'qianwen', 'kimi', 'jixing']) {
    current = `chat /chat (${preset})`
    await page.goto('/chat')
    await page.waitForLoadState('load')
    await page.waitForTimeout(1200)
    await page.evaluate((preset) => {
      const appEl = document.querySelector('#app') as (HTMLElement & { __vue_app__?: { config: { globalProperties: { $pinia: { state: { value: Record<string, any> } } } } } }) | null
      const state = appEl?.__vue_app__?.config.globalProperties.$pinia.state.value
      if (state?.catalog?.settings) state.catalog.settings.chatUiPreset = preset
    }, preset)
    await page.waitForTimeout(1000)
    await checkPage()
  }

  // 管理端全部路由（独立登录）
  await page.goto('/admin/#/auth/login')
  await page.waitForTimeout(800)
  const hasLoginForm = await page.locator('input[type=password]').count()
  if (hasLoginForm) {
    const credentials = getE2EAdminCredentials()
    await page.getByPlaceholder('管理员邮箱').fill(credentials.email)
    await page.locator('input[type=password]').fill(credentials.password)
    await page.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find(x => (x.textContent || '').includes('进入管理后台')); if (b) b.click(); return true; })()`)
    await page.waitForTimeout(2000)
  }
  for (const [path, title] of adminRoutes) {
    current = `admin ${path}`
    await page.goto(`/admin/#/${path}`)
    await page.waitForLoadState('load')
    await page.waitForTimeout(1200)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    if (overflow > 2) issues.push(`${current}: 横向溢出 ${overflow}px`)
    const notFound = await page.locator('main').getByText('页面不存在', { exact: true }).count()
    if (notFound) issues.push(`${current}: 落到 404 页`)
  }

  // 汇总：控制台报错按页聚合输出（ informational ），硬性问题断言
  const errorSummary = Object.entries(consoleErrors)
    .filter(([, list]) => list.length)
    .map(([pageName, list]) => `${pageName}: ${list.length} 条\n  ${list.slice(0, 3).join('\n  ')}`)
  console.log('===== 扫荡报告 =====')
  console.log(`硬性问题 ${issues.length} 项:\n${issues.join('\n') || '（无）'}`)
  console.log(`控制台报错页:\n${errorSummary.join('\n') || '（无）'}`)
  expect(issues, issues.join('\n') || '无硬性问题').toEqual([])
})
