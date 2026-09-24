import { expect, test } from '@playwright/test'

const quickActions = [
  { id: 'translate', label: '翻译', icon: 'translate', placement: 'MORE', actionType: 'PROMPT', prompt: '请准确翻译：', target: '', modelKey: 'chat-test', webSearch: false, enabled: true, sortOrder: 10 },
  { id: 'research', label: '深入研究', icon: 'research', placement: 'MORE', actionType: 'PROMPT', prompt: '请深入研究：', target: '', modelKey: 'chat-test', webSearch: true, enabled: true, sortOrder: 20 },
  { id: 'ppt', label: 'PPT 生成', icon: 'ppt', placement: 'MORE', actionType: 'OFFICE', prompt: '制作产品发布演示文稿', target: 'ppt', modelKey: 'chat-test', webSearch: false, enabled: true, sortOrder: 30 },
  { id: 'analysis', label: '数据分析', icon: 'table', placement: 'MORE', actionType: 'OFFICE', prompt: '', target: 'analysis', modelKey: 'chat-test', webSearch: false, enabled: true, sortOrder: 40 },
]

test.beforeEach(async ({ page }) => {
  await page.route('**/v1/catalog/settings', (route) => route.fulfill({ json: {
    siteName: 'Xinyue AI',
    chatUiPreset: 'doubao',
    chatHomeContent: {
      doubaoRecommendations: [],
      qianwenBanners: [],
      kimiProject: { label: '选择项目', targetUrl: '/workspace?tab=projects' },
      composerControls: {
        gpt: { modeEnabled: false, webSearchEnabled: true, modelSelectorEnabled: true, moreEnabled: false },
        doubao: { modeEnabled: false, webSearchEnabled: true, modelSelectorEnabled: true, moreEnabled: true },
        qianwen: { modeEnabled: true, webSearchEnabled: true, modelSelectorEnabled: true, moreEnabled: true },
        kimi: { modeEnabled: true, webSearchEnabled: true, modelSelectorEnabled: true, moreEnabled: true },
      },
      quickActions: { gpt: [], doubao: quickActions, qianwen: [], kimi: [] },
    },
  } }))
  await page.route('**/v1/catalog/models', (route) => route.fulfill({ json: [
    { key: 'chat-test', displayName: 'Chat Test', upstreamModel: 'chat-test', capability: 'CHAT', enabled: true, isDefault: true, source: 'PLATFORM', vendor: { key: 'openai', name: 'OpenAI' } },
    { key: 'chat-pro', displayName: 'Chat Pro', upstreamModel: 'chat-pro', capability: 'CHAT', enabled: true, isDefault: false, source: 'PLATFORM', vendor: { key: 'openai', name: 'OpenAI' } },
    { key: 'private-deepseek', displayName: '我的 DeepSeek', upstreamModel: 'deepseek-chat', capability: 'CHAT', enabled: true, isDefault: false, source: 'USER', availability: 'AVAILABLE', vendor: { key: 'deepseek', name: 'DeepSeek' } },
  ] }))
  await page.route('**/v1/catalog/recommendations', (route) => route.fulfill({ json: { enabled: false, items: [] } }))
})

test('提示词与研究快捷能力会执行后台配置', async ({ page }) => {
  await page.goto('/chat')
  await page.getByRole('button', { name: '更多' }).click()
  await page.getByRole('menuitem', { name: '翻译' }).click()
  await expect(page.getByRole('textbox', { name: '消息' })).toHaveValue('请准确翻译：')

  await page.getByRole('button', { name: '更多' }).click()
  await page.getByRole('menuitem', { name: '深入研究' }).click()
  await expect(page.getByRole('textbox', { name: '消息' })).toHaveValue('请深入研究：')
  await expect(page.getByRole('button', { name: '联网' })).toHaveAttribute('aria-pressed', 'true')
})

test('办公快捷能力会选中工具、模型和真实交付格式', async ({ page }) => {
  await page.goto('/chat')
  await page.getByRole('button', { name: '更多' }).click()
  await page.getByRole('menuitem', { name: 'PPT 生成' }).click()
  await expect(page).toHaveURL(/\/office\?tool=ppt&model=chat-test/)
  await expect(page.locator('.office-composer textarea')).toHaveValue('制作产品发布演示文稿')
  await expect(page.getByRole('button', { name: 'PowerPoint' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Chat Test' })).toBeVisible()

  await page.goto('/chat')
  await page.getByRole('button', { name: '更多' }).click()
  await page.getByRole('menuitem', { name: '数据分析' }).click()
  await expect(page).toHaveURL(/\/office\?tool=analysis&model=chat-test/)
  await expect(page.getByRole('button', { name: 'Excel' })).toBeVisible()
})

test('输入框底栏可切换模型并显示当前选中项', async ({ page }) => {
  await page.goto('/chat')
  const modelTrigger = page.getByRole('button', { name: /选择模型，当前为/ })
  await modelTrigger.click()

  const modelPicker = page.getByRole('dialog', { name: '选择模型' })
  await expect(modelPicker).toBeVisible()
  await expect(modelPicker.getByRole('button', { name: '对话模型', exact: true })).toBeVisible()
  await modelPicker.getByRole('button', { name: '视频模型', exact: true }).click()
  await expect(modelPicker.getByText('当前能力暂无可用模型')).toBeVisible()
  await modelPicker.getByRole('button', { name: '对话模型', exact: true }).click()
  await expect(modelPicker.getByRole('option', { name: /Chat Test/ })).toBeVisible()
  await modelPicker.getByRole('button', { name: /^DeepSeek/ }).click()
  await expect(modelPicker.getByRole('button', { name: /DeepSeek/ })).toBeVisible()
  await expect(modelPicker.getByRole('option', { name: /我的 DeepSeek/ })).toBeVisible()
  await modelPicker.getByRole('button', { name: /^OpenAI/ }).click()
  await expect(modelPicker.getByRole('button', { name: /OpenAI/ })).toBeVisible()
  await modelPicker.getByRole('option', { name: /Chat Pro/ }).click()

  await expect(modelPicker).toBeHidden()
  await expect(modelTrigger).toContainText('Chat Pro')
  await modelTrigger.click()
  await expect(page.getByRole('option', { name: /Chat Pro/ })).toHaveAttribute('aria-selected', 'true')
  for (const viewport of [{ width: 1440, height: 900 }, { width: 768, height: 720 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport)
    const box = await page.getByRole('dialog', { name: '选择模型' }).boundingBox()
    expect(box).not.toBeNull()
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.y).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width)
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height)
  }
})

test('没有健康模型时不展示伪造模型并禁用提交', async ({ page }) => {
  await page.unroute('**/v1/catalog/models')
  await page.route('**/v1/catalog/models', (route) => route.fulfill({ json: [] }))
  await page.goto('/chat')

  await page.getByRole('textbox', { name: '消息' }).fill('测试真实模型空状态')
  const chatSubmit = page.getByRole('button', { name: '暂无可用模型', exact: true })
  await expect(chatSubmit).toBeDisabled()
  await expect(page.getByText('gpt-5.5', { exact: true })).toHaveCount(0)
  await expect(page.getByText('grok-4.5', { exact: true })).toHaveCount(0)

  await page.goto('/image')
  await page.getByRole('textbox', { name: '创作描述' }).fill('生成一张产品图')
  await expect(page.getByRole('button', { name: '暂无可用模型', exact: true })).toBeDisabled()
  await expect(page.locator('.creation-option-buttons').getByRole('button').first()).toContainText('暂无可用模型')
})
