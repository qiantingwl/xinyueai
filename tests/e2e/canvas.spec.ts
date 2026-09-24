import { expect, test } from '@playwright/test'
import { assertNoPageOverflow, loginAdminByApi } from './helpers'

test.describe('无限画布基础能力', () => {
  test.beforeEach(async ({ page }) => {
    await loginAdminByApi(page)
  })

  test('创建节点、自动保存并在刷新后恢复', async ({ page }) => {
    test.setTimeout(60_000)
    const title = `e2e-canvas-${Date.now()}`
    let canvasId = ''

    try {
      await page.goto('/canvases')
      await expect(page.getByRole('heading', { name: '画布', exact: true })).toBeVisible()
      await assertNoPageOverflow(page)

      await page.getByRole('button', { name: '新建画布', exact: true }).first().click()
      await page.getByLabel('名称', { exact: true }).fill(title)
      await page.getByRole('button', { name: '创建', exact: true }).click()
      await expect(page).toHaveURL(/\/canvas\/[^/]+$/)
      canvasId = page.url().split('/').pop() || ''

      await page.getByTitle('添加文本').click()
      const textNode = page.locator('.canvas-flow-node.is-text textarea')
      await expect(textNode).toBeVisible()
      await textNode.fill('阶段一自动保存与恢复测试')
      await page.getByTitle('添加图片节点').click()
      await page.getByTitle('添加视频节点').click()
      await page.getByTitle('生成配置').click()
      await page.getByRole('button', { name: '打开画布菜单' }).click()
      await page.getByRole('menuitem', { name: '添加分组' }).click()

      await expect(page.locator('.vue-flow__node-canvas')).toHaveCount(5)
      await page.getByTitle('画布外观').click()
      const appearancePanel = page.getByLabel('画布外观', { exact: true })
      await appearancePanel.getByRole('button', { name: '网格', exact: true }).click()
      await expect(page.locator('.canvas-save-status')).toContainText('已保存', { timeout: 10_000 })
      await assertNoPageOverflow(page)

      await page.reload()
      await expect(page.locator('.vue-flow__node-canvas')).toHaveCount(5)
      await expect(page.locator('.canvas-flow-node.is-text textarea')).toHaveValue('阶段一自动保存与恢复测试')
      await page.getByTitle('画布外观').click()
      await expect(page.getByLabel('画布外观', { exact: true }).getByRole('button', { name: '网格', exact: true })).toHaveClass(/is-active/)

      await page.setViewportSize({ width: 390, height: 844 })
      await expect(page.locator('.canvas-tool-dock')).toBeVisible()
      await expect(page.locator('.canvas-navigation-dock')).toBeVisible()
      await assertNoPageOverflow(page)
      await page.evaluate(() => { document.documentElement.dataset.studioTheme = 'dark' })
      await expect(page.locator('.canvas-editor-page')).toHaveCSS('overflow', 'hidden')
      await page.evaluate(() => { document.documentElement.dataset.studioTheme = 'light' })

      await page.getByRole('button', { name: '返回画布列表', exact: true }).click()
      await expect(page).toHaveURL(/\/canvases$/)
      await page.getByLabel('搜索画布').fill(title)
      await expect(page.getByRole('button', { name: `打开${title}` })).toBeVisible()
    } finally {
      if (canvasId) await page.request.delete(`/v1/canvases/${canvasId}`)
    }
  })

  test('API 支持复制、归档、并发保护和删除', async ({ page }) => {
    const title = `e2e-canvas-api-${Date.now()}`
    const created = await page.request.post('/v1/canvases', { data: { title } })
    expect(created.ok()).toBeTruthy()
    const source = await created.json() as { id: string; revision: number }
    let duplicateId = ''

    try {
      const updated = await page.request.patch(`/v1/canvases/${source.id}`, {
        data: {
          expectedRevision: source.revision,
          document: {
            version: 1,
            viewport: { x: 0, y: 0, zoom: 1 },
            background: 'dots',
            nodes: [
              { id: 'prompt', type: 'TEXT', title: '提示词', position: { x: 0, y: 0 }, size: { width: 280, height: 220 }, data: { content: '测试' } },
              { id: 'result', type: 'IMAGE', title: '结果', position: { x: 360, y: 0 }, size: { width: 320, height: 240 }, data: {} },
            ],
            edges: [{ id: 'prompt-result', source: 'prompt', target: 'result', label: '生成' }],
          },
        },
      })
      expect(updated.ok()).toBeTruthy()

      const conflict = await page.request.patch(`/v1/canvases/${source.id}`, {
        data: { expectedRevision: source.revision, title: '过期更新' },
      })
      expect(conflict.status()).toBe(409)

      const duplicate = await page.request.post(`/v1/canvases/${source.id}/duplicate`, { data: { title: `${title}-副本` } })
      expect(duplicate.ok()).toBeTruthy()
      duplicateId = ((await duplicate.json()) as { id: string }).id

      const current = await updated.json() as { revision: number }
      const archived = await page.request.patch(`/v1/canvases/${source.id}`, { data: { expectedRevision: current.revision, archived: true } })
      expect(archived.ok()).toBeTruthy()
      const archivedList = await page.request.get('/v1/canvases?archived=true')
      const archivedRows = await archivedList.json() as Array<{ id: string }>
      expect(archivedRows.some((item) => item.id === source.id)).toBeTruthy()
    } finally {
      await page.request.delete(`/v1/canvases/${source.id}`)
      if (duplicateId) await page.request.delete(`/v1/canvases/${duplicateId}`)
    }
  })

  test('短剧工作流创建模板、拆分剧本并保持镜头链路', async ({ page }) => {
    test.setTimeout(60_000)
    const title = `e2e-short-drama-${Date.now()}`
    const response = await page.request.post('/v1/canvases', { data: { title, kind: 'SHORT_DRAMA' } })
    expect(response.ok()).toBeTruthy()
    const created = await response.json() as { id: string; kind: string; document: { nodes: Array<{ data: { dramaRole?: string } }> } }

    try {
      expect(created.kind).toBe('SHORT_DRAMA')
      expect(created.document.nodes.some((node) => node.data.dramaRole === 'SCRIPT')).toBeTruthy()
      expect(created.document.nodes.filter((node) => node.data.dramaRole === 'STAGE')).toHaveLength(4)

      await page.goto(`/canvas/${created.id}`)
      await expect(page.getByRole('navigation', { name: '短剧创作阶段' })).toBeVisible()
      await expect(page.locator('.vue-flow__node-canvas')).toHaveCount(8)

      const script = page.locator('.vue-flow__node-canvas[data-id="drama-script"] textarea')
      await script.fill('第 1 集\n女孩走进空旷车站。\n\n镜头 2：她打开一封旧信。')
      await page.getByTitle('把剧本拆分成镜头').click()
      await expect(page.locator('.vue-flow__node-canvas')).toHaveCount(14)
      await expect(page.locator('.vue-flow__edge')).toHaveCount(4)

      await page.getByRole('button', { name: /04.*成片/ }).click()
      await page.getByRole('button', { name: /01.*剧本/ }).click()
      await expect(script).toHaveValue('第 1 集\n女孩走进空旷车站。\n\n镜头 2：她打开一封旧信。')

      await page.getByTitle('添加一个空镜头').click()
      await expect(page.locator('.vue-flow__node-canvas')).toHaveCount(17)
      await expect(page.locator('.vue-flow__edge')).toHaveCount(6)
      await expect(page.locator('.canvas-save-status')).toContainText('已保存', { timeout: 10_000 })

      const saved = await (await page.request.get(`/v1/canvases/${created.id}`)).json() as {
        document: { nodes: Array<{ id: string; data: { dramaRole?: string; shotId?: string } }>; edges: Array<{ source: string; target: string }> }
      }
      const storyboards = saved.document.nodes.filter((node) => node.data.dramaRole === 'STORYBOARD')
      const videos = saved.document.nodes.filter((node) => node.data.dramaRole === 'SHOT_VIDEO')
      expect(storyboards).toHaveLength(3)
      expect(videos).toHaveLength(3)
      for (const video of videos) {
        const storyboard = storyboards.find((node) => node.data.shotId === video.data.shotId)
        expect(storyboard).toBeTruthy()
        expect(saved.document.edges.some((edge) => edge.source === storyboard!.id && edge.target === video.id)).toBeTruthy()
      }

      await page.setViewportSize({ width: 390, height: 844 })
      await expect(page.locator('.canvas-drama-toolbar')).toBeVisible()
      await assertNoPageOverflow(page)
    } finally {
      await page.request.delete(`/v1/canvases/${created.id}`)
    }
  })

  test('画布 Agent 先预览操作并在确认后应用', async ({ page }) => {
    const response = await page.request.post('/v1/canvases', { data: { title: `e2e-canvas-agent-${Date.now()}` } })
    expect(response.ok()).toBeTruthy()
    const canvas = await response.json() as { id: string }
    const steps = [
      { id: 'step-1', title: '准备任务上下文', status: 'SUCCEEDED' },
      { id: 'step-2', title: '制定执行计划', status: 'SUCCEEDED' },
      { id: 'step-3', title: '执行任务', status: 'SUCCEEDED' },
      { id: 'step-4', title: '校验并交付结果', status: 'SUCCEEDED' },
    ]
    const operations = {
      summary: '建立产品视觉生成流程',
      operations: [
        { type: 'add_text', tempId: 'brief', title: '产品简报', content: '极简白色耳机产品摄影' },
        { type: 'add_image', tempId: 'hero', title: '主视觉', prompt: '极简白色耳机产品摄影' },
        { type: 'connect_nodes', source: 'brief', target: 'hero' },
      ],
    }

    try {
      await page.route('**/v1/users/me/models', (route) => route.fulfill({ json: [{ key: 'agent-test', displayName: 'Agent Test', capability: 'CHAT', enabled: true, isDefault: true, options: { agentEnabled: true, agentCapabilities: { eligible: true } } }] }))
      await page.route('**/v1/agent-tasks', async (route) => {
        if (route.request().method() !== 'POST') return route.continue()
        await route.fulfill({ json: { id: 'agent-task-test', status: 'DRAFT', steps } })
      })
      await page.route('**/v1/agent-tasks/agent-task-test/run', (route) => route.fulfill({ json: { id: 'agent-task-test', status: 'QUEUED', steps } }))
      await page.route('**/v1/agent-tasks/agent-task-test/events', (route) => route.fulfill({
        contentType: 'text/event-stream',
        body: `event: task\ndata: ${JSON.stringify({ id: 'agent-task-test', status: 'SUCCEEDED', steps, agentRun: { iteration: 0, creditCost: 3, finalAnswer: JSON.stringify(operations) } })}\n\n`,
      }))

      await page.goto(`/canvas/${canvas.id}`)
      await expect(page.getByRole('complementary', { name: 'Canvas Agent 对话面板' })).toBeVisible()
      await page.getByRole('textbox', { name: '描述你想让 Agent 如何操作画布' }).fill('为产品建立一条主视觉生成流程')
      await page.getByRole('button', { name: '发送', exact: true }).click()
      await expect(page.getByRole('heading', { name: '让 Agent 整理当前画布' })).toBeVisible()
      await page.getByRole('dialog', { name: '让 Agent 整理当前画布' }).getByRole('button', { name: '生成操作计划' }).click()
      await expect(page.getByText('建立产品视觉生成流程')).toBeVisible()
      await expect(page.locator('.canvas-agent-operation-list li')).toHaveCount(3)
      await page.getByRole('button', { name: '应用 3 项变更' }).click()
      await expect(page.locator('.vue-flow__node-canvas')).toHaveCount(2)
      await expect(page.locator('.vue-flow__edge')).toHaveCount(1)
      await expect(page.locator('.canvas-save-status')).toContainText('已保存', { timeout: 10_000 })
    } finally {
      await page.request.delete(`/v1/canvases/${canvas.id}`)
    }
  })

  test('媒体上传进入文件库并回填画布节点', async ({ page }) => {
    test.setTimeout(90_000)
    const title = `e2e-canvas-media-${Date.now()}`
    const fileName = `${title}.png`
    const created = await page.request.post('/v1/canvases', { data: { title } })
    expect(created.ok()).toBeTruthy()
    const canvas = await created.json() as { id: string }
    let assetId = ''
    const derivedAssetIds: string[] = []
    const existingAssets = await (await page.request.get('/v1/assets?kind=IMAGE')).json() as Array<{ id: string }>
    const existingAssetIds = new Set(existingAssets.map((asset) => asset.id))

    try {
      await page.goto(`/canvas/${canvas.id}`)
      await page.getByTitle('添加图片节点').click()
      const imageNode = page.locator('.canvas-flow-node.is-image')
      await imageNode.hover()
      await imageNode.getByRole('button', { name: '选择或替换素材', exact: true }).click()
      await expect(page.getByRole('heading', { name: '选择图片', exact: true })).toBeVisible()

      await page.locator('.canvas-media-dialog input[type="file"]').setInputFiles({
        name: fileName,
        mimeType: 'image/png',
        buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nWQAAAAASUVORK5CYII=', 'base64'),
      })
      await expect(page.locator('.canvas-media-dialog')).toHaveCount(0)
      await expect(page.locator('.canvas-flow-node.is-image .canvas-node-body img')).toBeVisible()
      await page.locator('.canvas-flow-node.is-image').dblclick()
      await page.getByRole('button', { name: '裁剪', exact: true }).click()
      await expect(page.getByRole('heading', { name: '裁剪图片', exact: true })).toBeVisible()
      await page.getByRole('button', { name: '1:1', exact: true }).click()
      await page.getByRole('button', { name: '完成裁剪', exact: true }).click()
      await expect(page.locator('.canvas-image-editor')).toHaveCount(0)

      await page.locator('.canvas-flow-node.is-image').dblclick()
      await page.getByRole('button', { name: '绘制蒙版', exact: true }).click()
      await expect(page.getByRole('heading', { name: '绘制编辑区域', exact: true })).toBeVisible()
      const mask = page.locator('.canvas-mask-layer')
      const box = await mask.boundingBox()
      expect(box).toBeTruthy()
      if (box) {
        await page.mouse.move(box.x + box.width * .35, box.y + box.height * .5)
        await page.mouse.down()
        await page.mouse.move(box.x + box.width * .65, box.y + box.height * .5, { steps: 6 })
        await page.mouse.up()
      }
      await page.getByRole('button', { name: '使用蒙版', exact: true }).click()
      await expect(page.locator('.canvas-image-editor')).toHaveCount(0)
      await expect(page.getByRole('button', { name: '重绘蒙版', exact: true })).toBeVisible()

      await page.setViewportSize({ width: 390, height: 844 })
      await page.getByRole('button', { name: '重绘蒙版', exact: true }).click()
      const editorBounds = await page.locator('.canvas-image-editor').boundingBox()
      expect(editorBounds).toBeTruthy()
      if (editorBounds) {
        expect(editorBounds.x).toBeGreaterThanOrEqual(0)
        expect(editorBounds.y).toBeGreaterThanOrEqual(0)
        expect(editorBounds.x + editorBounds.width).toBeLessThanOrEqual(390)
        expect(editorBounds.y + editorBounds.height).toBeLessThanOrEqual(844)
      }
      await page.getByRole('button', { name: '关闭图片编辑器', exact: true }).click()

      const derivedAssets = await (await page.request.get('/v1/assets?kind=IMAGE')).json() as Array<{ id: string; name: string }>
      derivedAssetIds.push(...derivedAssets.filter((asset) => !existingAssetIds.has(asset.id) && (asset.name.startsWith('canvas-crop-') || asset.name.startsWith('canvas-mask-'))).map((asset) => asset.id))
      await expect(page.locator('.canvas-save-status')).toContainText('已保存', { timeout: 10_000 })

      const assetsResponse = await page.request.get(`/v1/assets?kind=IMAGE&q=${encodeURIComponent(fileName)}`)
      const assets = await assetsResponse.json() as Array<{ id: string; name: string }>
      assetId = assets.find((asset) => asset.name === fileName)?.id || ''
      expect(assetId).toBeTruthy()

      await page.reload()
      await expect(page.locator('.canvas-flow-node.is-image .canvas-node-body img')).toBeVisible()

      const invalidVideo = await page.request.post('/v1/assets/uploads?kind=VIDEO&purpose=library', {
        multipart: { file: { name: 'not-a-video.txt', mimeType: 'text/plain', buffer: Buffer.from('not a video') } },
      })
      expect(invalidVideo.status()).toBe(400)
      await assertNoPageOverflow(page)
    } finally {
      for (const id of derivedAssetIds) await page.request.delete(`/v1/assets/${id}`)
      if (assetId) await page.request.delete(`/v1/assets/${assetId}`)
      await page.request.delete(`/v1/canvases/${canvas.id}`)
    }
  })

  test('图片工具在入队前校验参考图和蒙版', async ({ page }) => {
    const toolResponse = await page.request.get('/v1/inspirations?mode=IMAGE_TOOL')
    expect(toolResponse.ok()).toBeTruthy()
    const tools = await toolResponse.json() as Array<{ id: string; options?: { inputMode?: string } }>
    const tool = tools.find((item) => item.options?.inputMode === 'MASK')
    expect(tool).toBeTruthy()
    let referenceAssetId = ''
    try {
      const withoutReference = await page.request.post('/v1/generations', { data: { kind: 'IMAGE', prompt: '测试工具', options: { creationToolId: tool!.id } } })
      expect(withoutReference.status()).toBe(400)
      expect((await withoutReference.json()).message).toContain('参考图片')

      const upload = await page.request.post('/v1/assets/uploads?kind=IMAGE&purpose=reference', {
        multipart: { file: { name: 'canvas-tool-reference.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nWQAAAAASUVORK5CYII=', 'base64') } },
      })
      expect(upload.ok()).toBeTruthy()
      referenceAssetId = ((await upload.json()) as { id: string }).id
      const withoutMask = await page.request.post('/v1/generations', { data: { kind: 'IMAGE', prompt: '测试工具', options: { creationToolId: tool!.id, referenceAssetIds: [referenceAssetId] } } })
      expect(withoutMask.status()).toBe(400)
      expect((await withoutMask.json()).message).toContain('蒙版')
    } finally {
      if (referenceAssetId) await page.request.delete(`/v1/assets/${referenceAssetId}`)
    }
  })
})
