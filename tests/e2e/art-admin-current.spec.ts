import { expect, test, type Page } from '@playwright/test'

const adminUrl = 'http://localhost:5174/admin/'
const adminEmail = process.env.E2E_ADMIN_EMAIL || 'admin@flux.local'
const adminPassword = process.env.E2E_ADMIN_PASSWORD || 'FluxAdmin@2026!'

const businessPages = [
  ['enterprise/customers/credits', '额度流水'],
  ['enterprise/workspace/projects', '项目与工作流'],
  ['enterprise/content/inspirations', '灵感内容'],
  ['enterprise/content/prompt-templates', '提示词模板'],
  ['enterprise/content/prompt-library', '提示词库'],
  ['enterprise/agent-tools/assistants', 'AI 助手'],
  ['enterprise/agent-tools/tools', '工具与审批'],
  ['enterprise/agent-tools/knowledge-bases', '知识库'],
  ['enterprise/workspace/external-links', '外部入口'],
  ['enterprise/operations/announcements', '公告管理'],
  ['enterprise/operations/moderation-rules', '审核规则'],
  ['enterprise/operations/moderation', '内容审核'],
  ['enterprise/operations/support', '客服工单'],
  ['enterprise/operations/alerts', '告警中心'],
  ['enterprise/operations/alert-rules', '告警规则'],
  ['enterprise/operations/logins', '登录会话'],
  ['enterprise/operations/audits', '审计日志'],
  ['enterprise/operations/tool-calls', '工具调用记录'],
  ['enterprise/operations/system-health', '系统健康'],
] as const

async function login(page: Page) {
  await page.goto(adminUrl)
  await page.getByPlaceholder('管理员邮箱').fill(adminEmail)
  await page.getByPlaceholder('密码').fill(adminPassword)
  await page.getByRole('button', { name: '进入管理后台' }).click()
  await expect(page).toHaveURL(/#\/dashboard\/console$/)
  await expect(page.getByText('工作台', { exact: true }).first()).toBeVisible()
}

async function assertNoPageOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }))
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1)
}

test('当前 Art 企业后台页面、抽屉与响应式布局可用', async ({ page }) => {
  const consoleErrors: string[] = []
  const failedRequests: string[] = []
  const unauthorizedResponses: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('requestfailed', (request) => failedRequests.push(`${request.method()} ${request.url()} ${request.failure()?.errorText || ''}`))
  page.on('response', (response) => {
    if (response.status() === 401) unauthorizedResponses.push(`${response.request().method()} ${response.url()}`)
  })

  await login(page)
  await assertNoPageOverflow(page)

  for (const [path, heading] of businessPages) {
    await page.goto(`${adminUrl}#/${path}`)
    await expect(page.locator('main').getByText(heading, { exact: true }).last()).toBeVisible()
    if (path.endsWith('system-health')) {
      await expect(page.locator('.service-list')).toBeVisible()
    } else {
      await expect(page.locator('.el-table').first()).toBeVisible()
    }
    await expect(page.getByText('页面不存在', { exact: true })).toHaveCount(0)
    await assertNoPageOverflow(page)
  }

  await page.goto(`${adminUrl}#/article/article-list`)
  await expect(page.getByRole('heading', { name: '关于我们', exact: true })).toBeVisible()
  await expect(page.locator('.content-card').first()).toBeVisible()
  await assertNoPageOverflow(page)
  await page.locator('.content-card').first().click()
  await expect(page.getByRole('heading', { name: '关于 Xinyue AI', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '编辑内容' })).toBeVisible()
  await assertNoPageOverflow(page)

  for (const [path, heading] of [['dashboard/analysis', '分析页'], ['dashboard/ecommerce', '电子商务']] as const) {
    await page.goto(`${adminUrl}#/${path}`)
    await expect(page.locator('main').getByText(heading, { exact: true }).last()).toBeVisible()
    await expect(page.locator('.metric-grid')).toBeVisible()
    await assertNoPageOverflow(page)
  }

  await page.goto(`${adminUrl}#/enterprise/content/inspirations`)
  await page.getByRole('button', { name: '新增灵感' }).click()
  await expect(page.getByRole('heading', { name: '新增灵感' })).toBeVisible()
  await page.locator('.el-drawer').filter({ hasText: '新增灵感' }).getByRole('button', { name: '取消' }).click()

  await page.goto(`${adminUrl}#/enterprise/content/prompt-library`)
  await page.getByRole('button', { name: '来源配置' }).click()
  await expect(page.getByRole('heading', { name: '提示词库来源' })).toBeVisible()
  await page.locator('.el-drawer').filter({ hasText: '提示词库来源' }).getByLabel('关闭此对话框').click()

  await page.goto(`${adminUrl}#/enterprise/operations/moderation-rules`)
  await page.mouse.move(0, 0)
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '审核策略' }).click()
  await expect(page.getByRole('heading', { name: '内容审核策略' })).toBeVisible()
  await page.locator('.el-drawer').filter({ hasText: '内容审核策略' }).getByRole('button', { name: '取消' }).click()

  await page.setViewportSize({ width: 390, height: 844 })
  for (const [path, heading] of businessPages.slice(0, 8)) {
    await page.goto(`${adminUrl}#/${path}`)
    await expect(page.locator('main').getByText(heading, { exact: true }).last()).toBeVisible()
    await assertNoPageOverflow(page)
  }

  expect(failedRequests, failedRequests.join('\n')).toEqual([])
  expect(unauthorizedResponses, unauthorizedResponses.join('\n')).toEqual([])
  expect(consoleErrors, consoleErrors.join('\n')).toEqual([])
})

test('用户分组可以创建、编辑策略并删除', async ({ page }) => {
  const groupName = `E2E 分组 ${Date.now()}`
  await login(page)
  await page.goto(`${adminUrl}#/enterprise/customers/groups`)

  try {
    await page.getByRole('button', { name: '新增分组', exact: true }).click()
    const createDialog = page.getByRole('dialog', { name: '新增用户分组' })
    await createDialog.getByLabel('分组名称').fill(groupName)
    await createDialog.getByLabel('分组说明').fill('自动化验证分组')
    await createDialog.getByRole('button', { name: '保存分组', exact: true }).click()

    let row = page.locator('.el-table__row').filter({ hasText: groupName })
    await expect(row).toBeVisible()
    await row.getByRole('button', { name: '编辑', exact: true }).click()
    const editDialog = page.getByRole('dialog', { name: '编辑用户分组' })
    await editDialog.getByLabel('分组说明').fill('自动化验证分组已更新')
    await editDialog.getByRole('button', { name: '保存分组', exact: true }).click()
    await expect(row).toContainText('自动化验证分组已更新')

    await row.getByRole('button', { name: '策略', exact: true }).click()
    const policyDrawer = page.locator('.el-drawer').filter({ hasText: '分组权限策略' })
    await expect(policyDrawer).toBeVisible()
    await policyDrawer.getByRole('button', { name: '保存策略', exact: true }).click()
    await expect(policyDrawer).toBeHidden()

    row = page.locator('.el-table__row').filter({ hasText: groupName })
    await row.getByRole('button', { name: '更多分组操作' }).click()
    await page.getByRole('menuitem', { name: '删除分组', exact: true }).click()
    await page.getByRole('button', { name: '确定', exact: true }).click()
    await expect(row).toHaveCount(0)
  } finally {
    const groups = await page.request.get('http://localhost:3100/v1/admin/groups')
    if (groups.ok()) {
      const match = ((await groups.json()) as Array<{ id: string; name: string }>).find((item) => item.name === groupName)
      if (match) await page.request.delete(`http://localhost:3100/v1/admin/groups/${match.id}`).catch(() => undefined)
    }
  }
})
