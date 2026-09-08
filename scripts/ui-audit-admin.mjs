// 管理后台 UI 审计：登录后逐路由截图，收集控制台错误与横向溢出。
// 结果输出到 tests/e2e/.ui-audit-admin/，并在 stdout 打印每页问题汇总。
import { chromium } from '@playwright/test'
import fs from 'node:fs'
import { getE2EAdminCredentials } from './e2e-admin-credentials.mjs'

const outDir = 'tests/e2e/.ui-audit-admin'
fs.rmSync(outDir, { recursive: true, force: true })
fs.mkdirSync(outDir, { recursive: true })

const adminUrl = 'http://localhost:6001/admin/'
const { email: adminEmail, password: adminPassword } = getE2EAdminCredentials()

const routes = [
  ['dashboard/console', '工作台'], ['dashboard/analysis', '分析页'], ['dashboard/ecommerce', '电子商务'],
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
  ['enterprise/settings', '业务系统配置'], ['article/article-list', '关于我们'],
]

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
await page.goto(adminUrl)
await page.getByPlaceholder('管理员邮箱').fill(adminEmail)
await page.getByPlaceholder('密码').fill(adminPassword)
await page.getByRole('button', { name: '进入管理后台' }).click()
await page.waitForURL(/#\/dashboard\/console$/, { timeout: 15000 })

const report = []

for (const [route, label] of routes) {
  const errors = []
  const onConsole = (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)) }
  const onPageError = (e) => errors.push(`pageerror: ${String(e).slice(0, 200)}`)
  page.on('console', onConsole)
  page.on('pageerror', onPageError)
  await page.goto(`${adminUrl}#/${route}`, { waitUntil: 'networkidle' }).catch(() => {})
  await page.waitForTimeout(1200)
  const metrics = await page.evaluate(() => ({
    hOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }))
  const tag = route.replaceAll('/', '_')
  await page.screenshot({ path: `${outDir}/${tag}.png` })
  const issues = []
  if (metrics.hOverflow > 2) issues.push(`横向溢出 +${metrics.hOverflow}px`)
  const realErrors = errors.filter((e) => !/favicon|net::|Failed to load resource|401|403/.test(e))
  if (realErrors.length) issues.push(`控制台错误: ${realErrors.slice(0, 3).join(' ; ')}`)
  report.push({ tag: `${tag}（${label}）`, issues })
  page.off('console', onConsole)
  page.off('pageerror', onPageError)
}

await browser.close()

console.log('\n===== 管理后台 UI 审计汇总 =====')
for (const r of report) {
  console.log(`${r.issues.length ? '❌' : '✅'} ${r.tag}${r.issues.length ? ' — ' + r.issues.join(' | ') : ''}`)
}
