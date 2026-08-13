import { expect, test } from '@playwright/test'
import { adminEmail, adminPassword, assertNoPageOverflow, loginAdminByApi } from './helpers'

test.beforeEach(async ({ page }) => {
  await loginAdminByApi(page)
})

test('提示词库展示预览图并只将完整提示词带入图片生成', async ({ page }) => {
  const prompt = ['主题：自然光下的极简商品主视觉', ...Array.from({ length: 18 }, (_, index) => `画面要求 ${index + 1}：保持包装文字准确，保留真实材质细节，并为标题和商品卖点预留清晰区域。`)].join('\n')
  await page.route('**/v1/prompt-library?**', (route) => {
    const requestedPage = Number(new URL(route.request().url()).searchParams.get('page') || 1)
    return route.fulfill({ json: {
      items: requestedPage === 1
        ? [{ id: 'source:e2e-1', sourceId: 'source', sourceName: '创意视觉精选', title: '极简商品主视觉', prompt, description: '适合商品首页主视觉', tags: ['商品摄影', '极简'], author: 'E2E', imageModel: 'gpt-image-2', coverUrl: '/assets/inspiration-1.jpg' }]
        : [{ id: 'source:e2e-2', sourceId: 'source', sourceName: '创意视觉精选', title: '第二页提示词', prompt: '第二页完整提示词', description: '分页结果', tags: ['海报'], author: '', imageModel: 'gpt-image-2', coverUrl: '/assets/inspiration-2.jpg' }],
      total: 48, page: requestedPage, pageSize: 24, sources: [{ id: 'source', name: '创意视觉精选', count: 48 }], tags: [{ name: '商品摄影', count: 1 }], partial: false,
    } })
  })
  await page.goto('/prompts')
  await expect(page.getByRole('heading', { name: '提示词库', exact: true })).toBeVisible()
  await expect(page.getByText('极简商品主视觉', { exact: true })).toBeVisible()
  await expect(page.locator('.prompt-library-card img')).toBeVisible()
  await expect(page.getByText('第 1 / 2 页', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '下一页', exact: true }).click()
  await expect(page.getByText('第二页提示词', { exact: true })).toBeVisible()
  await expect(page.getByText('第 2 / 2 页', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '上一页', exact: true }).click()
  await expect(page.getByText('极简商品主视觉', { exact: true })).toBeVisible()
  await assertNoPageOverflow(page)
  await page.getByRole('button', { name: '使用', exact: true }).first().click()
  await expect(page).toHaveURL(/\/image$/)
  const generationInput = page.getByPlaceholder('描述新图片')
  await expect(generationInput).toHaveValue(prompt)
  await expect(page.locator('.creation-attachments')).toHaveCount(0)
  const promptBox = await generationInput.boundingBox()
  expect(promptBox).not.toBeNull()
  expect(promptBox!.height).toBeGreaterThan(180)

  await page.setViewportSize({ width: 390, height: 844 })
  const mobilePromptBox = await generationInput.boundingBox()
  expect(mobilePromptBox).not.toBeNull()
  expect(mobilePromptBox!.height).toBeLessThanOrEqual(240)
  expect(mobilePromptBox!.height).toBeGreaterThan(120)
  await assertNoPageOverflow(page)
})

test('工作区切页保留侧栏且长输入菜单不越界', async ({ page }) => {
  await page.goto('/chat')
  const sidebar = page.locator('.workspace-sidebar')
  const sidebarScroll = page.locator('.workspace-sidebar__scroll')
  await sidebar.evaluate((element) => { element.dataset.e2ePersistent = 'true' })
  await expect(sidebarScroll).toHaveCSS('overflow-y', 'auto')
  await expect(page.locator('.workspace-recent__body')).toHaveCSS('overflow-y', 'visible')

  await page.getByRole('link', { name: '提示词库', exact: true }).click()
  await expect(page).toHaveURL(/\/prompts$/)
  await expect(sidebar).toHaveAttribute('data-e2e-persistent', 'true')
  await page.getByRole('link', { name: '图片', exact: true }).click()
  await expect(page).toHaveURL(/\/image$/)
  await expect(sidebar).toHaveAttribute('data-e2e-persistent', 'true')

  await page.getByRole('link', { name: '新对话', exact: true }).click()
  const input = page.getByLabel('消息', { exact: true })
  await input.fill(Array.from({ length: 14 }, (_, index) => `第 ${index + 1} 段长提示词：保持文字准确、材质真实，并预留清晰排版空间。`).join('\n'))
  await page.getByRole('button', { name: '添加文件等', exact: true }).click()
  await page.getByRole('button', { name: /提示词模板/ }).click()
  const menuBox = await page.locator('.composer-attachment-panel').boundingBox()
  const viewport = page.viewportSize()
  expect(menuBox).not.toBeNull()
  expect(viewport).not.toBeNull()
  expect(menuBox!.x).toBeGreaterThanOrEqual(0)
  expect(menuBox!.y).toBeGreaterThanOrEqual(0)
  expect(menuBox!.x + menuBox!.width).toBeLessThanOrEqual(viewport!.width)
  expect(menuBox!.y + menuBox!.height).toBeLessThanOrEqual(viewport!.height)
  await assertNoPageOverflow(page)
})

test('多轮聊天可以从右侧导航跳回已发送消息', async ({ page }) => {
  const title = `e2e-message-nav-${Date.now()}`
  const created = await page.request.post('/v1/conversations', { data: { title, model: 'gpt-5.5' } })
  expect(created.ok()).toBeTruthy()
  const conversation = await created.json() as { id: string }

  try {
    for (const content of ['第一条需要回看的用户消息', '第二条用于验证消息导航的用户消息']) {
      const response = await page.request.post(`/v1/conversations/${conversation.id}/messages`, { data: { content } })
      expect(response.ok()).toBeTruthy()
    }
    await page.goto('/chat')
    await page.getByRole('button', { name: title, exact: true }).click()
    const navigator = page.getByRole('button', { name: '浏览已发送消息', exact: true })
    await expect(navigator).toBeVisible()
    await navigator.click()
    const panel = page.locator('.chat-message-navigator__panel')
    await expect(panel.getByRole('button')).toHaveCount(2)
    await expect(panel).toContainText('第一条需要回看的用户消息')
    await panel.getByRole('button').first().click()
    await expect(panel).toHaveCount(0)
    await expect(page.locator('.message-row.is-jump-highlight')).toHaveCount(1)
    await assertNoPageOverflow(page)
  } finally {
    await page.request.delete(`/v1/conversations/${conversation.id}`)
  }
})

test('关闭邮箱验证码后隐藏游客登录入口并显示关闭状态', async ({ page }) => {
  await page.context().clearCookies()
  await page.addInitScript(() => localStorage.setItem('flux:settings', JSON.stringify({ appearance: '浅色', language: 'zh-CN' })))
  await page.route('**/v1/catalog/settings', (route) => route.fulfill({ json: { siteName: 'Xinyue AI', emailLoginEnabled: false, registrationEnabled: true, otpResendSeconds: 60, smtpReady: false } }))
  await page.goto('/chat')
  await expect(page.getByRole('button', { name: '设置', exact: true })).toBeVisible()
  await expect(page.locator('.workspace-signin')).toHaveCount(0)
  await expect(page.locator('.chat-page__auth-actions')).toHaveCount(0)
  const settingsBox = await page.getByRole('button', { name: '设置', exact: true }).boundingBox()
  expect(settingsBox).not.toBeNull()
  expect(settingsBox!.y + settingsBox!.height).toBeGreaterThan(830)

  await page.goto('/login?redirect=/chat')
  await expect(page.getByRole('heading', { name: '登录暂未开放', exact: true })).toBeVisible()
  await expect(page.getByLabel('邮箱')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: '登录暂未开放', exact: true })).toHaveCSS('color', 'rgb(22, 23, 26)')
  await expect(page.getByText('管理员尚未开放邮箱验证码登录。', { exact: true })).toHaveCSS('color', 'rgb(126, 131, 140)')
  await expect(page.getByRole('link', { name: '返回工作台', exact: true })).toHaveCSS('background-color', 'rgb(9, 10, 13)')
  await page.waitForTimeout(500)
  await page.screenshot({ path: 'test-results/login-disabled.png', fullPage: false })
})

test('开启邮箱登录但关闭注册时仅显示已有用户登录', async ({ page }) => {
  await page.context().clearCookies()
  await page.addInitScript(() => localStorage.setItem('flux:settings', JSON.stringify({ appearance: '浅色', language: 'zh-CN' })))
  await page.route('**/v1/catalog/settings', (route) => route.fulfill({ json: { siteName: 'Xinyue AI', emailLoginEnabled: true, registrationEnabled: false, otpResendSeconds: 60, smtpReady: true } }))
  await page.goto('/chat')
  await expect(page.getByRole('link', { name: '登录', exact: true }).first()).toBeVisible()
  await expect(page.getByRole('link', { name: '免费注册', exact: true })).toHaveCount(0)
  await expect(page.locator('.workspace-signin p')).toHaveCSS('color', 'rgb(98, 98, 98)')

  await page.goto('/login?redirect=/chat')
  await expect(page.getByLabel('邮箱')).toBeVisible()
  await expect(page.getByText('使用已注册的邮箱或账户继续。', { exact: true })).toBeVisible()
})

test('套餐购买会先选择支付渠道再创建订单并刷新交易状态', async ({ page }) => {
  const now = new Date().toISOString()
  let orderPosts = 0
  let checkoutPayload: Record<string, unknown> | undefined
  await page.route('**/v1/catalog/settings', (route) => route.fulfill({ json: { userByokEnabled: true, rechargeEnabled: true, subscriptionsEnabled: true, trialEnabled: true, currency: 'CNY' } }))
  await page.route('**/v1/subscriptions/plans', (route) => route.fulfill({ json: [{ id: 'plan-e2e-pay', code: 'e2e-pay', name: '企业专业版', description: '支付流程测试套餐', billingCycle: 'MONTHLY', priceCents: 9900, includedCredits: 1000, trialDays: 0, concurrency: 5, allowByok: true, recommended: true }] }))
  await page.route('**/v1/subscriptions/me', (route) => route.fulfill({ json: null }))
  await page.route('**/v1/subscriptions/orders', async (route) => {
    if (route.request().method() === 'POST') { orderPosts += 1; return route.fulfill({ json: { id: 'subscription-order-e2e' } }) }
    return route.fulfill({ json: [] })
  })
  await page.route('**/v1/payments/methods', (route) => route.fulfill({ json: [{ id: 'manual-channel-e2e', name: '企业对公转账', providerKey: 'MANUAL', isDefault: true, supportedMethods: ['manual'], minAmountCents: 100, maxAmountCents: null }] }))
  await page.route('**/v1/payments/checkout', async (route) => {
    checkoutPayload = route.request().postDataJSON() as Record<string, unknown>
    await route.fulfill({ json: { id: 'transaction-e2e', outTradeNo: 'XYE2ETRADE', amountCents: 9900, currency: 'CNY', status: 'PENDING', checkoutUrl: '', qrCodeUrl: '', metadata: { instructions: '请汇款至企业对公账户并备注交易号' }, createdAt: now } })
  })
  await page.route('**/v1/payments/transactions/transaction-e2e', (route) => route.fulfill({ json: { id: 'transaction-e2e', outTradeNo: 'XYE2ETRADE', amountCents: 9900, currency: 'CNY', status: 'COMPLETED', metadata: { instructions: '请汇款至企业对公账户并备注交易号' }, createdAt: now } }))

  await page.goto('/chat?settings=plan')
  await page.getByRole('button', { name: '选择套餐', exact: true }).click()
  await expect(page.getByRole('heading', { name: '选择支付方式', exact: true })).toBeVisible()
  expect(orderPosts).toBe(0)
  await expect(page.getByText('企业对公转账', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: /确认支付/ }).click()
  await expect.poll(() => orderPosts).toBe(1)
  await expect.poll(() => checkoutPayload).toMatchObject({ orderType: 'SUBSCRIPTION', orderId: 'subscription-order-e2e', channelId: 'manual-channel-e2e', paymentMethod: 'manual' })
  await expect(page.getByText('请汇款至企业对公账户并备注交易号')).toBeVisible()
  await page.getByRole('button', { name: '我已完成支付', exact: true }).click()
  await expect(page.getByText('支付完成，权益已到账', { exact: true })).toBeVisible()
  await assertNoPageOverflow(page)
})

test('商品图灵感卡片会打开多图预览并可带入生成框', async ({ page }) => {
  await page.route('**/v1/inspirations?mode=COMMERCE', (route) => route.fulfill({ json: [{ id: 'commerce-inspiration-preview', title: '洗护产品素材包', prompt: '制作一套清新明亮的洗护产品电商素材', badge: '素材包', imageUrl: '/assets/inspiration-1.jpg', model: null, options: { modules: 8, creationType: '素材包', previewImages: ['/assets/inspiration-1.jpg', '/assets/inspiration-2.jpg'] } }] }))
  await page.goto('/commerce')
  await page.getByRole('button', { name: '查看灵感：洗护产品素材包', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByText('素材包 · 1 / 2', { exact: true })).toBeVisible()
  await page.screenshot({ path: 'test-results/commerce-inspiration-preview-desktop.png', fullPage: true })
  await page.getByRole('button', { name: '下一张灵感图' }).click()
  await expect(page.getByText('素材包 · 2 / 2', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '使用此灵感', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.locator('.creation-prompt-row textarea')).toHaveValue('制作一套清新明亮的洗护产品电商素材')
  await expect(page.locator('.creation-controls')).toContainText('8 模块')
  await expect(page.locator('.creation-controls')).toContainText('素材包')
  await assertNoPageOverflow(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: '查看灵感：洗护产品素材包', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.waitForTimeout(260)
  await assertNoPageOverflow(page)
  await page.screenshot({ path: 'test-results/commerce-inspiration-preview-mobile.png' })
})

test('商品图任务留在当前页面并以八张成组图库展示', async ({ page }) => {
  const now = new Date().toISOString()
  const assets = Array.from({ length: 8 }, (_, index) => ({ asset: { id: `commerce-asset-${index + 1}`, kind: 'PRODUCT_PACK', name: `详情模块 ${index + 1}.jpg`, mimeType: 'image/jpeg', size: 2048, objectKey: `users/mock/generated/commerce-${index + 1}.jpg`, contentUrl: `/assets/inspiration-${index % 4 + 1}.jpg`, createdAt: now, metadata: { jobId: 'mock-commerce-job', position: index, moduleLabel: `详情模块 ${index + 1}`, creationType: '详情页', platform: '自动', prompt: '高端护肤品详情页' } } }))
  await page.route('**/v1/conversations', async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    await route.fulfill({ json: { id: 'mock-commerce-conversation', title: '高端护肤品详情页', model: 'gpt-5.5', temporary: false, createdAt: now, updatedAt: now } })
  })
  await page.route('**/v1/conversations/mock-commerce-conversation/messages', (route) => route.fulfill({ json: { id: 'mock-commerce-message', role: 'USER', content: '高端护肤品详情页', createdAt: now } }))
  await page.route('**/v1/generations', async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    await route.fulfill({ json: { id: 'mock-commerce-job', conversationId: 'mock-commerce-conversation', kind: 'COMMERCE', status: 'QUEUED', model: 'gpt-image-2', prompt: '高端护肤品详情页', options: { requestedModel: 'GPT Image 2', modules: 8, creationType: '详情页', platform: '自动' }, outputs: [], createdAt: now } })
  })
  await page.route('**/v1/generations/mock-commerce-job', (route) => route.fulfill({ json: { id: 'mock-commerce-job', conversationId: 'mock-commerce-conversation', kind: 'COMMERCE', status: 'SUCCEEDED', model: 'gpt-image-2', prompt: '高端护肤品详情页', options: { requestedModel: 'GPT Image 2', modules: 8, creationType: '详情页', platform: '自动' }, outputs: assets, createdAt: now } }))
  await page.route('**/v1/generations?kind=COMMERCE', (route) => route.fulfill({ json: [] }))

  await page.goto('/commerce')
  await page.locator('.creation-prompt-row textarea').fill('高端护肤品详情页')
  await page.getByRole('button', { name: '开始生成', exact: true }).click()
  await expect(page).toHaveURL(/\/commerce$/)
  await expect(page.locator('.commerce-run-card')).toContainText('8 张')
  await page.locator('.commerce-run-card').click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByText('详情页 · 1 / 8', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '下载当前图片' })).toBeVisible()
  await expect(page.getByRole('button', { name: '下载全部图片' })).toBeVisible()
  await page.getByRole('button', { name: '下一张' }).click()
  await expect(page.getByText('详情页 · 2 / 8', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '继续创作', exact: true }).click()
  await expect(page.locator('.creation-attachments img')).toBeVisible()
  await expect(page.locator('.creation-prompt-row textarea')).toHaveValue('高端护肤品详情页')
  await assertNoPageOverflow(page)
})

test('生图提交后进入聊天任务流并支持失败重试', async ({ page }) => {
  const now = new Date().toISOString()
  let generationCount = 0

  await page.route('**/v1/conversations', async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    await route.fulfill({ json: { id: 'mock-image-conversation', title: '霓虹城市夜景', model: 'gpt-5.5', temporary: false, createdAt: now, updatedAt: now } })
  })
  await page.route('**/v1/conversations/mock-image-conversation/messages', async (route) => {
    await route.fulfill({ json: { id: `mock-image-message-${Date.now()}`, role: 'USER', content: '霓虹城市夜景', createdAt: now } })
  })
  await page.route('**/v1/generations', async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    generationCount += 1
    await route.fulfill({ json: { id: `mock-image-job-${generationCount}`, conversationId: 'mock-image-conversation', kind: 'IMAGE', status: 'QUEUED', model: 'gpt-image-2', prompt: '霓虹城市夜景', options: { requestedModel: 'GPT Image 2', size: '1024x1024', count: 1 }, outputs: [], createdAt: now } })
  })
  await page.route('**/v1/generations/mock-image-job-*', async (route) => {
    const id = route.request().url().split('/').pop() || 'mock-image-job-1'
    await new Promise((resolve) => setTimeout(resolve, 1200))
    const succeeded = id.endsWith('-2')
    await route.fulfill({ json: { id, conversationId: 'mock-image-conversation', kind: 'IMAGE', status: succeeded ? 'SUCCEEDED' : 'FAILED', model: 'gpt-image-2', prompt: '霓虹城市夜景', options: { requestedModel: 'GPT Image 2', size: '1024x1024', count: 1 }, errorMessage: succeeded ? null : '上游渠道暂时不可用', outputs: succeeded ? [{ asset: { id: 'mock-generated-image', kind: 'IMAGE', name: '生成图片 1.jpg', mimeType: 'image/jpeg', size: 73229, objectKey: 'users/mock/generated/image.jpg', contentUrl: '/assets/inspiration-1.jpg', createdAt: now, metadata: { prompt: '霓虹城市夜景' } } }] : [], createdAt: now } })
  })

  await page.goto('/image')
  await page.locator('.creation-prompt-row textarea').fill('霓虹城市夜景')
  await page.getByRole('button', { name: '开始生成', exact: true }).click()
  await expect(page).toHaveURL(/\/chat\?generation=mock-image-job-1/)
  await expect(page.locator('.message--user')).toContainText('霓虹城市夜景')
  await expect(page.locator('.image-generation-stage')).toBeVisible()
  await expect(page.locator('.chat-thread')).toHaveCSS('scrollbar-width', 'none')
  await page.waitForTimeout(350)
  await page.screenshot({ path: 'test-results/image-generation-chat-running.png', fullPage: true })

  await expect(page.getByText('生成失败，请调整内容后重试')).toBeVisible()
  await expect(page.getByText('上游渠道暂时不可用')).toBeVisible()
  await page.getByRole('button', { name: '重新生成', exact: true }).click()
  await expect(page).toHaveURL(/\/chat\?generation=mock-image-job-2/)
  await expect(page.locator('.message--user').last()).toContainText('按原方案重试')
  await expect(page.getByText('图片已生成', { exact: true })).toBeVisible()
  await expect(page.locator('.image-generation-response')).toHaveCount(2)
  await expect(page.locator('.image-generation-response').first()).toContainText('生成失败')
  await expect(page.locator('.image-generation-response').last()).toContainText('图片已生成')
  await expect(page.locator('.image-generation-results img')).toBeVisible()
  const chatUrl = page.url()
  await page.locator('.image-generation-result__preview').click()
  const imagePreview = page.getByRole('dialog', { name: /生成图片 1/ })
  await expect(imagePreview).toBeVisible()
  await expect(page).toHaveURL(chatUrl)
  await expect(imagePreview.getByRole('button', { name: '放大', exact: true })).toBeVisible()
  await expect(imagePreview.getByRole('button', { name: '下载图片', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '关闭预览', exact: true }).click()
  await expect(page.locator('.image-result-actions').getByRole('button', { name: '下载图片' })).toBeAttached()
  await expect(page.locator('.image-generation-actions').getByRole('button', { name: '重新生成' })).toBeVisible()
  await expect(page.locator('.image-generation-actions').getByRole('button', { name: '用作参考' })).toBeVisible()
  await assertNoPageOverflow(page)

  const downloadPromise = page.waitForEvent('download')
  await page.locator('.image-result-actions').getByRole('button', { name: '下载图片' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('生成图片 1.jpg')

  await page.locator('.image-generation-actions').getByRole('button', { name: '用作参考' }).click()
  await expect(page).toHaveURL(/\/image$/)
  await expect(page.locator('.creation-attachments img')).toBeVisible()
  await expect(page.locator('.creation-prompt-row textarea')).toHaveValue('霓虹城市夜景')
})

test('生成中的图片任务可以主动停止并显示退款后的取消状态', async ({ page }) => {
  const now = new Date().toISOString()
  let cancelled = false
  await page.route('**/v1/conversations', async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    await route.fulfill({ json: { id: 'mock-cancel-conversation', title: '可停止任务', model: 'gpt-5.5', temporary: false, createdAt: now, updatedAt: now } })
  })
  await page.route('**/v1/conversations/mock-cancel-conversation/messages', (route) => route.fulfill({ json: { id: 'mock-cancel-message', role: 'USER', content: '可停止任务', createdAt: now } }))
  await page.route('**/v1/generations', async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    await route.fulfill({ json: { id: 'mock-cancel-job', conversationId: 'mock-cancel-conversation', kind: 'IMAGE', status: 'QUEUED', model: 'gpt-image-2', prompt: '可停止任务', options: { requestedModel: 'GPT Image 2', size: '1024x1024', count: 1 }, outputs: [], createdAt: now } })
  })
  await page.route('**/v1/generations/mock-cancel-job/cancel', async (route) => {
    cancelled = true
    await route.fulfill({ json: { id: 'mock-cancel-job', conversationId: 'mock-cancel-conversation', kind: 'IMAGE', status: 'CANCELLED', model: 'gpt-image-2', prompt: '可停止任务', errorMessage: '任务已取消', options: { requestedModel: 'GPT Image 2', size: '1024x1024', count: 1 }, outputs: [], createdAt: now } })
  })
  await page.route('**/v1/generations/mock-cancel-job', (route) => route.fulfill({ json: { id: 'mock-cancel-job', conversationId: 'mock-cancel-conversation', kind: 'IMAGE', status: cancelled ? 'CANCELLED' : 'QUEUED', model: 'gpt-image-2', prompt: '可停止任务', errorMessage: cancelled ? '任务已取消' : null, options: { requestedModel: 'GPT Image 2', size: '1024x1024', count: 1 }, outputs: [], createdAt: now } }))

  await page.goto('/image')
  await page.locator('.creation-prompt-row textarea').fill('可停止任务')
  await page.getByRole('button', { name: '开始生成', exact: true }).click()
  await expect(page.getByRole('button', { name: '停止图片生成' })).toBeVisible()
  await page.getByRole('button', { name: '停止图片生成' }).click()
  await expect.poll(() => cancelled).toBeTruthy()
  await expect(page.getByText('图片生成已停止', { exact: true })).toBeVisible()
})

test('上传图片会显示可移除的真实缩略图', async ({ page }) => {
  const fixture = 'public/assets/inspiration-1.jpg'
  const uploadedAssetIds: string[] = []

  try {
    await page.goto('/chat')
    const chatUpload = page.waitForResponse((response) => response.url().includes('/v1/assets/uploads') && response.request().method() === 'POST')
    await page.locator('input[type="file"]').setInputFiles(fixture)
    const chatUploadResponse = await chatUpload
    expect(chatUploadResponse.ok()).toBeTruthy()
    uploadedAssetIds.push((await chatUploadResponse.json() as { id: string }).id)

    const chatPreview = page.locator('.attachment-list .attachment-card--image img')
    await expect(chatPreview).toBeVisible()
    await expect.poll(() => chatPreview.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0)
    await expect(page.locator('.attachment-list .attachment-card--file')).toHaveCount(0)
    await page.screenshot({ path: 'test-results/upload-image-preview-chat.png', fullPage: true })
    await page.getByRole('button', { name: /移除附件 inspiration-1\.jpg/ }).click()
    await expect(page.locator('.attachment-list')).toHaveCount(0)
    await assertNoPageOverflow(page)

    await page.goto('/image')
    const chooserPromise = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: '添加参考文件', exact: true }).click()
    const chooser = await chooserPromise
    const creationUpload = page.waitForResponse((response) => response.url().includes('/v1/assets/uploads') && response.request().method() === 'POST')
    await chooser.setFiles(fixture)
    const creationUploadResponse = await creationUpload
    expect(creationUploadResponse.ok()).toBeTruthy()
    uploadedAssetIds.push((await creationUploadResponse.json() as { id: string }).id)

    const creationPreview = page.locator('.creation-attachments .attachment-card--image img')
    await expect(creationPreview).toBeVisible()
    await expect.poll(() => creationPreview.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0)
    await expect(page.locator('.creation-output')).not.toContainText('inspiration-1.jpg')
    await assertNoPageOverflow(page)
    await page.screenshot({ path: 'test-results/upload-image-preview-creation.png', fullPage: true })

    await page.setViewportSize({ width: 390, height: 844 })
    await expect(creationPreview).toBeVisible()
    await assertNoPageOverflow(page)
    await page.waitForTimeout(250)
    await page.screenshot({ path: 'test-results/upload-image-preview-mobile.png' })
  } finally {
    await Promise.all(uploadedAssetIds.map((assetId) => page.request.delete(`/v1/assets/${assetId}`).catch(() => undefined)))
  }
})

test('浅色工作台关键页面保持可读且浮层不遮挡内容', async ({ page }) => {
  await page.request.patch('/v1/users/me/settings', { data: { appearance: 'light' } })
  await page.addInitScript(() => localStorage.setItem('flux:settings', JSON.stringify({ appearance: '浅色', language: 'zh-CN' })))

  await page.goto('/image')
  await expect(page.locator('html')).toHaveAttribute('data-studio-theme', 'light')
  await expect(page.locator('.workspace-main')).toHaveCSS('background-color', 'rgb(255, 255, 255)')
  await expect(page.locator('.creation-composer')).toHaveCSS('background-color', 'rgb(244, 244, 244)')
  await expect(page.locator('.creation-prompt-row > strong')).toHaveCSS('color', 'rgb(49, 95, 159)')
  await expect(page.getByRole('heading', { name: '生成图片', exact: true })).toBeVisible()
  const inspirationHeaderBox = await page.locator('.inspiration-section > header').boundingBox()
  const inspirationCardBox = await page.locator('.inspiration-card').first().boundingBox()
  const previousInspirationButton = page.getByRole('button', { name: '上一组', exact: true })
  const previousInspirationBox = await previousInspirationButton.boundingBox()
  expect(inspirationHeaderBox).not.toBeNull()
  expect(inspirationCardBox).not.toBeNull()
  expect(previousInspirationBox).not.toBeNull()
  expect(previousInspirationBox!.y).toBeGreaterThanOrEqual(inspirationHeaderBox!.y)
  expect(previousInspirationBox!.y + previousInspirationBox!.height).toBeLessThanOrEqual(inspirationCardBox!.y)
  await expect(previousInspirationButton).toBeDisabled()
  const creationControlsBox = await page.locator('.creation-controls').boundingBox()
  const creationSubmitBox = await page.locator('.creation-submit').boundingBox()
  expect(creationControlsBox).not.toBeNull()
  expect(creationSubmitBox).not.toBeNull()
  expect(Math.abs((creationControlsBox!.y + creationControlsBox!.height / 2) - (creationSubmitBox!.y + creationSubmitBox!.height / 2))).toBeLessThanOrEqual(1)
  await assertNoPageOverflow(page)

  await page.goto('/chat')
  const heading = page.locator('.chat-center h2')
  const chatComposer = page.locator('.chat-composer')
  const attachmentButton = page.getByRole('button', { name: '添加文件等', exact: true })
  await attachmentButton.click()
  const chatComposerBox = await chatComposer.boundingBox()
  const attachmentPanelBox = await page.locator('.composer-attachment-panel').boundingBox()
  expect(chatComposerBox).not.toBeNull()
  expect(attachmentPanelBox).not.toBeNull()
  expect(attachmentPanelBox!.y - (chatComposerBox!.y + chatComposerBox!.height)).toBeLessThanOrEqual(10)
  await expect(attachmentButton).toHaveCSS('background-color', 'rgb(232, 232, 232)')
  await attachmentButton.click()
  await page.locator('.composer-model > button').click()
  const headingBox = await heading.boundingBox()
  const modelBox = await page.locator('.model-popover').boundingBox()
  expect(headingBox).not.toBeNull()
  expect(modelBox).not.toBeNull()
  expect(modelBox!.y).toBeGreaterThanOrEqual(headingBox!.y + headingBox!.height)

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/image')
  await page.getByRole('button', { name: '生成设置', exact: true }).click()
  await expect(page.locator('.creation-option-buttons')).toHaveClass(/is-open/)
  await expect(page.locator('.creation-option-buttons').getByRole('button', { name: /^自动背景$/ })).toBeVisible()
  const mobileOptionsBox = await page.locator('.creation-option-buttons').boundingBox()
  const mobileInspirationHeadingBox = await page.getByRole('heading', { name: '生成图片', exact: true }).boundingBox()
  expect(mobileOptionsBox).not.toBeNull()
  expect(mobileInspirationHeadingBox).not.toBeNull()
  expect(mobileOptionsBox!.y + mobileOptionsBox!.height).toBeLessThanOrEqual(mobileInspirationHeadingBox!.y)
  const mobileCreationControlsBox = await page.locator('.creation-controls').boundingBox()
  const mobileCreationSubmitBox = await page.locator('.creation-submit').boundingBox()
  expect(mobileCreationControlsBox).not.toBeNull()
  expect(mobileCreationSubmitBox).not.toBeNull()
  expect(Math.abs((mobileCreationControlsBox!.y + mobileCreationControlsBox!.height / 2) - (mobileCreationSubmitBox!.y + mobileCreationSubmitBox!.height / 2))).toBeLessThanOrEqual(1)
  await assertNoPageOverflow(page)

  await page.goto('/chat?settings=notifications')
  const sidebarBox = await page.locator('.settings-sidebar').boundingBox()
  const contentBox = await page.locator('.settings-content').boundingBox()
  expect(sidebarBox).not.toBeNull()
  expect(contentBox).not.toBeNull()
  expect(Math.abs(contentBox!.y - (sidebarBox!.y + sidebarBox!.height))).toBeLessThanOrEqual(1)
  await expect(page.locator('.settings-action-row .switch-control').first()).toHaveCSS('height', '24px')
  const toggleBox = await page.locator('.settings-action-row .switch-control').first().boundingBox()
  const toggleThumbBox = await page.locator('.settings-action-row .switch-control i').first().boundingBox()
  expect(toggleBox).not.toBeNull()
  expect(toggleThumbBox).not.toBeNull()
  expect(toggleThumbBox!.x).toBeGreaterThanOrEqual(toggleBox!.x)
  expect(toggleThumbBox!.x + toggleThumbBox!.width).toBeLessThanOrEqual(toggleBox!.x + toggleBox!.width)
  await assertNoPageOverflow(page)
})

test('聊天设置可切换浅色模式，模型菜单显示后台信息', async ({ page }) => {
  await page.addInitScript(() => {
    class MockSpeechRecognition {
      lang = ''
      interimResults = false
      continuous = false
      onresult: ((event: unknown) => void) | null = null
      onend: (() => void) | null = null
      onerror: (() => void) | null = null
      start() { window.setTimeout(() => { this.onresult?.({ results: { 0: { 0: { transcript: '语音测试' } } } }); this.onend?.() }, 30) }
      stop() { this.onend?.() }
    }
    ;(window as unknown as { SpeechRecognition: typeof MockSpeechRecognition }).SpeechRecognition = MockSpeechRecognition
  })
  await page.goto('/chat')
    await expect(page.getByRole('heading', { name: 'Xinyue AI' })).toBeVisible()
  await page.locator('.workspace-account-button').click()
  await page.locator('.workspace-account-menu').getByRole('button', { name: '设置', exact: true }).click()
  await page.getByLabel('外观', { exact: true }).selectOption({ label: '浅色' })
  await expect(page.locator('html')).toHaveAttribute('data-studio-theme', 'light')
  await page.locator('.settings-close').click()

  await page.locator('.composer-model > button').click()
  await expect(page.locator('.model-popover')).toBeVisible()
  await expect(page.locator('.model-popover button').first()).toBeVisible()
  await assertNoPageOverflow(page)

  await page.locator('.workspace-account-button').click()
  await page.locator('.workspace-account-menu').getByRole('button', { name: '设置', exact: true }).click()
  await page.getByLabel('外观', { exact: true }).selectOption({ label: '深色' })
  await page.locator('.settings-sidebar').getByRole('button', { name: '数据控制', exact: true }).click()
  await expect(page.getByRole('button', { name: '导出', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '全部删除', exact: true })).toBeVisible()
})

test('最近对话可以直接重命名并归档', async ({ page }) => {
  const title = `e2e-conversation-${Date.now()}`
  const renamed = `${title}-renamed`
  const created = await page.request.post('/v1/conversations', { data: { title, model: 'gpt-5.5' } })
  expect(created.ok()).toBeTruthy()
  const conversation = await created.json() as { id: string }

  try {
    await page.goto('/chat')
    await expect(page.getByRole('button', { name: title, exact: true })).toBeVisible()
    await page.getByRole('button', { name: `重命名“${title}”`, exact: true }).click()
    await page.getByLabel('对话名称').fill(renamed)
    await page.getByRole('button', { name: '保存对话名称', exact: true }).click()
    await expect(page.getByRole('button', { name: renamed, exact: true })).toBeVisible()

    await page.getByRole('button', { name: `打开“${renamed}”的对话选项`, exact: true }).click()
    await page.getByRole('menuitem', { name: '归档', exact: true }).click()
    await expect(page.getByRole('button', { name: renamed, exact: true })).toHaveCount(0)
  } finally {
    await page.request.delete(`/v1/conversations/${conversation.id}/permanent`).catch(() => undefined)
  }
})

test('图片输出格式与背景选项会保持有效组合', async ({ page }) => {
  await page.goto('/image')
  const controls = page.locator('.creation-controls')
  for (const buttonName of [/^GPT Image 2$/, /^自动$/, /^标准$/, /^1 张$/, /^PNG$/, /^自动背景$/]) {
    await controls.getByRole('button', { name: buttonName }).click()
    const menuBox = await page.locator('.creation-options-menu').boundingBox()
    const triggerBox = await controls.getByRole('button', { name: buttonName }).boundingBox()
    const composerBox = await page.locator('.creation-composer').boundingBox()
    expect(menuBox).not.toBeNull()
    expect(triggerBox).not.toBeNull()
    expect(composerBox).not.toBeNull()
    expect(menuBox!.x).toBeGreaterThanOrEqual(composerBox!.x)
    expect(menuBox!.x + menuBox!.width).toBeLessThanOrEqual(composerBox!.x + composerBox!.width)
    expect(menuBox!.y).toBeGreaterThanOrEqual(0)
    expect(menuBox!.y + menuBox!.height).toBeLessThanOrEqual(900)
    const menuOverflow = await page.locator('.creation-options-menu').evaluate((element) => element.scrollHeight - element.clientHeight)
    expect(menuOverflow).toBeLessThanOrEqual(1)
    const triggerGap = menuBox!.y >= triggerBox!.y + triggerBox!.height
      ? menuBox!.y - (triggerBox!.y + triggerBox!.height)
      : triggerBox!.y - (menuBox!.y + menuBox!.height)
    expect(triggerGap).toBeLessThanOrEqual(10)
    await controls.getByRole('button', { name: buttonName }).click()
  }
  await controls.getByRole('button', { name: /PNG/ }).click()
  await page.locator('.creation-options-menu').getByRole('button', { name: 'JPEG', exact: true }).click()
  await expect(controls.getByRole('button', { name: /JPEG/ })).toBeVisible()

  await controls.getByRole('button', { name: /自动背景/ }).click()
  await page.locator('.creation-options-menu').getByRole('button', { name: '透明背景', exact: true }).click()
  await expect(controls.getByRole('button', { name: /透明背景/ })).toBeVisible()
  await expect(controls.getByRole('button', { name: /PNG/ })).toBeVisible()
  await assertNoPageOverflow(page)
})

test('消息分支接口会更新目标消息并删除后续内容', async ({ page }) => {
  const conversationResponse = await page.request.post('/v1/conversations', { data: { title: `e2e-branch-${Date.now()}`, model: 'gpt-5.5' } })
  expect(conversationResponse.ok()).toBeTruthy()
  const conversation = await conversationResponse.json() as { id: string }

  try {
    const firstResponse = await page.request.post(`/v1/conversations/${conversation.id}/messages`, { data: { content: 'first prompt' } })
    const first = await firstResponse.json() as { id: string }
    await page.request.post(`/v1/conversations/${conversation.id}/messages`, { data: { content: 'following prompt' } })
    const branch = await page.request.post(`/v1/conversations/${conversation.id}/messages/${first.id}/branch`, { data: { content: 'edited prompt' } })
    expect(branch.ok()).toBeTruthy()

    const detail = await (await page.request.get(`/v1/conversations/${conversation.id}`)).json() as { messages: Array<{ content: string }> }
    expect(detail.messages).toHaveLength(1)
    expect(detail.messages[0].content).toBe('edited prompt')
  } finally {
    await page.request.delete(`/v1/conversations/${conversation.id}`)
  }
})

test('账户导出包含聊天数据，并可永久删除单条对话', async ({ page }) => {
  const apiBase = process.env.E2E_BACKEND_URL || ''
  const endpoint = (path: string) => `${apiBase}/v1${path}`
  if (apiBase) {
    const login = await page.request.post(endpoint('/auth/admin/login'), { data: { email: adminEmail, password: adminPassword } })
    expect(login.ok()).toBeTruthy()
  }
  const title = `e2e-export-${Date.now()}`
  const createdResponse = await page.request.post(endpoint('/conversations'), { data: { title, model: 'gpt-5.5' } })
  expect(createdResponse.ok()).toBeTruthy()
  const conversation = await createdResponse.json() as { id: string }

  try {
    const invalidImage = await page.request.post(endpoint('/generations'), { data: { kind: 'IMAGE', prompt: 'invalid format combination', model: 'GPT Image 2', options: { outputFormat: 'jpeg', background: 'transparent' } } })
    expect(invalidImage.status()).toBe(400)

    const message = await page.request.post(endpoint(`/conversations/${conversation.id}/messages`), { data: { content: 'export verification' } })
    expect(message.ok()).toBeTruthy()

    const exportResponse = await page.request.get(endpoint('/conversations/export'))
    expect(exportResponse.ok()).toBeTruthy()
    const exported = await exportResponse.json() as { conversations: Array<{ id: string; messages: Array<{ content: string }> }> }
    expect(exported.conversations.find((item) => item.id === conversation.id)?.messages[0]?.content).toBe('export verification')

    const removed = await page.request.delete(endpoint(`/conversations/${conversation.id}/permanent`))
    expect(removed.ok()).toBeTruthy()
    expect((await page.request.get(endpoint(`/conversations/${conversation.id}`))).status()).toBe(404)
  } finally {
    await page.request.delete(endpoint(`/conversations/${conversation.id}/permanent`)).catch(() => undefined)
  }
})

test('资源关联校验和项目详情序列化保持稳定', async ({ page }) => {
  const missingId = `missing-${Date.now()}`
  expect((await page.request.post('/v1/projects', { data: { name: '   ' } })).status()).toBe(400)
  expect((await page.request.post('/v1/generations', { data: { kind: 'IMAGE', prompt: '   ', options: {} } })).status()).toBe(400)
  const invalidConversation = await page.request.post('/v1/conversations', { data: { title: 'invalid project', projectId: missingId } })
  expect(invalidConversation.status()).toBe(404)

  const invalidGeneration = await page.request.post('/v1/generations', {
    data: { kind: 'IMAGE', prompt: 'invalid project', projectId: missingId, options: {} },
  })
  expect(invalidGeneration.status()).toBe(404)

  const invalidKind = await page.request.get('/v1/assets?kind=NOT_A_KIND')
  expect(invalidKind.status()).toBe(400)

  const projectResponse = await page.request.post('/v1/projects', { data: { name: `e2e-assets-${Date.now()}` } })
  expect(projectResponse.ok()).toBeTruthy()
  const project = await projectResponse.json() as { id: string }
  let assetId = ''
  let unsafeAssetId = ''
  try {
    const uploaded = await page.request.post(`/v1/assets/uploads?kind=IMAGE&projectId=${project.id}`, {
      multipart: { file: { name: 'project-image.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('e2e-project-image') } },
    })
    expect(uploaded.ok()).toBeTruthy()
    assetId = (await uploaded.json() as { id: string }).id

    const detailResponse = await page.request.get(`/v1/projects/${project.id}`)
    expect(detailResponse.ok()).toBeTruthy()
    const detail = await detailResponse.json() as { assets: Array<{ id: string; size: number; contentUrl: string }> }
    const asset = detail.assets.find((item) => item.id === assetId)
    expect(asset).toBeTruthy()
    expect(typeof asset?.size).toBe('number')
    expect(asset?.contentUrl).toBe(`/v1/assets/${assetId}/content`)

    const unsafeUpload = await page.request.post('/v1/assets/uploads?kind=FILE', {
      multipart: { file: { name: 'unsafe.html', mimeType: 'text/html', buffer: Buffer.from('<script>alert(1)</script>') } },
    })
    expect(unsafeUpload.ok()).toBeTruthy()
    unsafeAssetId = (await unsafeUpload.json() as { id: string }).id
    const unsafeContent = await page.request.get(`/v1/assets/${unsafeAssetId}/content`)
    expect(unsafeContent.headers()['content-disposition']).toContain('attachment')
  } finally {
    if (assetId) await page.request.delete(`/v1/assets/${assetId}`).catch(() => undefined)
    if (unsafeAssetId) await page.request.delete(`/v1/assets/${unsafeAssetId}`).catch(() => undefined)
    await page.request.delete(`/v1/projects/${project.id}`).catch(() => undefined)
  }
})

test('项目页面可创建、归档、恢复并删除项目', async ({ page }) => {
  const projectName = `e2e-ui-project-${Date.now()}`
  let projectId = ''
  const staleProjects = await (await page.request.get('/v1/projects')).json() as Array<{ id: string; name: string }>
  await Promise.all(staleProjects.filter((project) => project.name.startsWith('e2e-ui-project-')).map((project) => page.request.delete(`/v1/projects/${project.id}`)))
  await page.goto('/projects')
  try {
    await page.getByRole('button', { name: '新建', exact: true }).click()
    await expect(page.getByRole('dialog', { name: '创建项目' })).toBeVisible()
    await page.getByLabel('项目名称').fill(projectName)
    await page.getByRole('button', { name: '项目设置' }).click()
    await page.getByLabel('项目说明').fill('UI 自动化创建的项目')
    await page.getByRole('dialog', { name: '创建项目' }).getByRole('button', { name: '创建项目', exact: true }).click()
    let projectRow = page.locator('.project-row').filter({ hasText: projectName })
    await expect(projectRow).toBeVisible()

    const projects = await (await page.request.get('/v1/projects')).json() as Array<{ id: string; name: string }>
    projectId = projects.find((project) => project.name === projectName)?.id || ''
    expect(projectId).not.toBe('')

    await page.getByRole('button', { name: `归档${projectName}` }).click()
    await expect(projectRow).toHaveCount(0)
    await page.getByRole('button', { name: '已归档', exact: true }).click()
    projectRow = page.locator('.project-row').filter({ hasText: projectName })
    await expect(projectRow).toBeVisible()
    await page.getByRole('button', { name: `恢复${projectName}` }).click()
    await expect(projectRow).toHaveCount(0)
  } finally {
    if (projectId) await page.request.delete(`/v1/projects/${projectId}`).catch(() => undefined)
  }
})

test('文件库视图、筛选、缩放和下载按钮可用', async ({ page }) => {
  await page.goto('/files')
  const firstAsset = page.locator('.asset-card').first()
  await expect(firstAsset).toBeVisible()
  await page.getByRole('button', { name: '列表视图' }).click()
  await expect(page.locator('.library-assets-list')).toBeVisible()
  await page.getByRole('button', { name: '网格视图' }).click()
  await page.getByRole('button', { name: '筛选' }).click()
  await page.locator('.library-filter-menu').getByRole('button', { name: '全部来源' }).click()

  await firstAsset.click()
  const preview = page.locator('.asset-preview-dialog')
  await expect(preview).toBeVisible()
  await preview.getByRole('button', { name: '放大' }).click()
  await expect(preview.getByText('120%')).toBeVisible()
  await preview.getByRole('button', { name: '适配画布' }).click()
  await expect(preview.getByText('100%')).toBeVisible()
  const downloadPromise = page.waitForEvent('download')
  await preview.getByRole('button', { name: '下载素材' }).click()
  expect((await downloadPromise).suggestedFilename()).not.toBe('')
  await preview.getByRole('button', { name: '关闭预览' }).click()
  await expect(preview).toHaveCount(0)
})
