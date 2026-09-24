import type { Prisma } from '@prisma/client'

export const DEFAULT_CHAT_HOME_CONTENT = {
  doubaoRecommendations: [],
  qianwenBanners: [
    { title: 'Xinyue 办公助理上线', description: '解锁本地任务能力，多格式交付', buttonText: '立即体验', imageUrl: '', targetUrl: '/office' },
    { title: '多格式办公文件交付', description: '生成可继续编辑的 PPTX、DOCX 与 XLSX 文件', buttonText: '开始办公任务', imageUrl: '', targetUrl: '/office' },
    { title: '会议材料整理', description: '根据会议文字或文档提炼议题、结论与待办', buttonText: '整理会议材料', imageUrl: '', targetUrl: '/office?tool=meeting' },
  ],
  kimiProject: { label: '选择项目', targetUrl: '/workspace?tab=projects' },
  composerControls: {
    gpt: { modeEnabled: false, webSearchEnabled: true, modelSelectorEnabled: true, moreEnabled: false },
    doubao: { modeEnabled: true, webSearchEnabled: true, modelSelectorEnabled: true, moreEnabled: true },
    qianwen: { modeEnabled: true, webSearchEnabled: true, modelSelectorEnabled: true, moreEnabled: true },
    kimi: { modeEnabled: true, webSearchEnabled: true, modelSelectorEnabled: true, moreEnabled: true },
    jixing: { modeEnabled: false, webSearchEnabled: true, modelSelectorEnabled: true, moreEnabled: false },
  },
  quickActions: {
    gpt: [],
    doubao: [
      { id: 'doubao-video', label: '视频生成', icon: 'video', placement: 'BAR', actionType: 'ROUTE', prompt: '', target: '/video', modelKey: '', webSearch: false, enabled: true, sortOrder: 10 },
      { id: 'doubao-music', label: '音乐创作方案', icon: 'music', placement: 'BAR', actionType: 'PROMPT', prompt: '请根据以下描述策划音乐风格、结构、歌词方向与制作方案：', target: '', modelKey: '', webSearch: false, enabled: true, sortOrder: 20 },
      { id: 'doubao-image', label: '图像生成', icon: 'image', placement: 'BAR', actionType: 'ROUTE', prompt: '', target: '/image', modelKey: '', webSearch: false, enabled: true, sortOrder: 30 },
      { id: 'doubao-podcast', label: 'AI 播客', icon: 'podcast', placement: 'BAR', actionType: 'PROMPT', prompt: '请策划一份 AI 播客脚本：', target: '', modelKey: '', webSearch: false, enabled: true, sortOrder: 40 },
      { id: 'doubao-table', label: 'AI 表格', icon: 'table', placement: 'BAR', actionType: 'OFFICE', prompt: '', target: 'spreadsheet', modelKey: '', webSearch: false, enabled: true, sortOrder: 50 },
      { id: 'doubao-writing', label: '帮我写作', icon: 'writing', placement: 'BAR', actionType: 'OFFICE', prompt: '请帮我撰写：', target: 'writing', modelKey: '', webSearch: false, enabled: true, sortOrder: 60 },
      { id: 'doubao-transcribe', label: '会议纪要', icon: 'transcribe', placement: 'BAR', actionType: 'OFFICE', prompt: '请根据我提供的会议文字或文档整理会议纪要：', target: 'meeting', modelKey: '', webSearch: false, enabled: true, sortOrder: 70 },
      { id: 'doubao-ppt', label: 'PPT 生成', icon: 'ppt', placement: 'MORE', actionType: 'OFFICE', prompt: '', target: 'ppt', modelKey: '', webSearch: false, enabled: true, sortOrder: 10 },
      { id: 'doubao-translate', label: '翻译', icon: 'translate', placement: 'MORE', actionType: 'PROMPT', prompt: '请准确翻译以下内容：', target: '', modelKey: '', webSearch: false, enabled: true, sortOrder: 20 },
      { id: 'doubao-research', label: '深入研究', icon: 'research', placement: 'MORE', actionType: 'PROMPT', prompt: '请深入研究并给出可核验的资料来源：', target: '', modelKey: '', webSearch: true, enabled: true, sortOrder: 30 },
      { id: 'doubao-answer', label: '解题答疑', icon: 'answer', placement: 'MORE', actionType: 'PROMPT', prompt: '请分步解答以下问题：', target: '', modelKey: '', webSearch: false, enabled: true, sortOrder: 40 },
      { id: 'doubao-analysis', label: '数据分析', icon: 'table', placement: 'MORE', actionType: 'OFFICE', prompt: '', target: 'analysis', modelKey: '', webSearch: false, enabled: true, sortOrder: 50 },
    ],
    qianwen: [
      { id: 'qianwen-office', label: '办公助理', icon: 'office', placement: 'BAR', actionType: 'OFFICE', prompt: '', target: 'daily', modelKey: '', webSearch: false, enabled: true, sortOrder: 10 },
      { id: 'qianwen-ppt', label: 'PPT 创作', icon: 'ppt', placement: 'BAR', actionType: 'OFFICE', prompt: '', target: 'ppt', modelKey: '', webSearch: false, enabled: true, sortOrder: 20 },
      { id: 'qianwen-video', label: 'AI 生视频', icon: 'video', placement: 'BAR', actionType: 'ROUTE', prompt: '', target: '/video', modelKey: '', webSearch: false, enabled: true, sortOrder: 30 },
      { id: 'qianwen-image', label: 'AI 生图', icon: 'image', placement: 'BAR', actionType: 'ROUTE', prompt: '', target: '/image', modelKey: '', webSearch: false, enabled: true, sortOrder: 40 },
      { id: 'qianwen-code', label: '代码', icon: 'code', placement: 'MORE', actionType: 'OFFICE', prompt: '', target: 'development', modelKey: '', webSearch: false, enabled: true, sortOrder: 10 },
      { id: 'qianwen-translate', label: '翻译', icon: 'translate', placement: 'MORE', actionType: 'PROMPT', prompt: '请准确翻译以下内容：', target: '', modelKey: '', webSearch: false, enabled: true, sortOrder: 20 },
      { id: 'qianwen-writing', label: 'AI 写作', icon: 'writing', placement: 'MORE', actionType: 'OFFICE', prompt: '', target: 'writing', modelKey: '', webSearch: false, enabled: true, sortOrder: 30 },
      { id: 'qianwen-research', label: '研究', icon: 'research', placement: 'MORE', actionType: 'PROMPT', prompt: '请深入研究并给出可核验的资料来源：', target: '', modelKey: '', webSearch: true, enabled: true, sortOrder: 40 },
      { id: 'qianwen-meeting', label: '会议纪要', icon: 'transcribe', placement: 'MORE', actionType: 'OFFICE', prompt: '请根据我提供的会议文字或文档整理会议纪要：', target: 'meeting', modelKey: '', webSearch: false, enabled: true, sortOrder: 50 },
    ],
    kimi: [
      { id: 'kimi-ppt', label: 'PPT', icon: 'ppt', placement: 'BAR', actionType: 'OFFICE', prompt: '', target: 'ppt', modelKey: '', webSearch: false, enabled: true, sortOrder: 10 },
      { id: 'kimi-agent', label: '集群', icon: 'office', placement: 'BAR', actionType: 'OFFICE', prompt: '', target: 'daily', modelKey: '', webSearch: false, enabled: true, sortOrder: 20 },
      { id: 'kimi-research', label: '深度研究', icon: 'research', placement: 'BAR', actionType: 'PROMPT', prompt: '请深入研究并给出可核验的资料来源：', target: '', modelKey: '', webSearch: true, enabled: true, sortOrder: 30 },
      { id: 'kimi-document', label: '文档', icon: 'document', placement: 'BAR', actionType: 'OFFICE', prompt: '', target: 'report', modelKey: '', webSearch: false, enabled: true, sortOrder: 40 },
      { id: 'kimi-website', label: '网站', icon: 'website', placement: 'BAR', actionType: 'OFFICE', prompt: '', target: 'development', modelKey: '', webSearch: false, enabled: true, sortOrder: 50 },
      { id: 'kimi-table', label: '表格', icon: 'table', placement: 'BAR', actionType: 'OFFICE', prompt: '', target: 'spreadsheet', modelKey: '', webSearch: false, enabled: true, sortOrder: 60 },
      { id: 'kimi-design', label: '设计', icon: 'design', placement: 'BAR', actionType: 'ROUTE', prompt: '', target: '/canvases', modelKey: '', webSearch: false, enabled: true, sortOrder: 70 },
    ],
    jixing: [
      { id: 'jixing-polish', label: '一键商品精修', icon: 'image', placement: 'BAR', actionType: 'ROUTE', prompt: '', target: '/image', modelKey: '', webSearch: false, enabled: true, sortOrder: 10 },
      { id: 'jixing-mainimage', label: '电商主图直出', icon: 'design', placement: 'BAR', actionType: 'ROUTE', prompt: '', target: '/image', modelKey: '', webSearch: false, enabled: true, sortOrder: 20 },
      { id: 'jixing-detail', label: '商品详情页/A+', icon: 'ppt', placement: 'BAR', actionType: 'PROMPT', prompt: '请为以下商品生成详情页/A+ 文案与版面方案：', target: '', modelKey: '', webSearch: false, enabled: true, sortOrder: 30 },
      { id: 'jixing-scene', label: '商品场景图', icon: 'image', placement: 'BAR', actionType: 'ROUTE', prompt: '', target: '/image', modelKey: '', webSearch: false, enabled: true, sortOrder: 40 },
      { id: 'jixing-card-main-set', label: '电商主图套图', icon: 'image', placement: 'MORE', actionType: 'ROUTE', prompt: '', target: '/image', modelKey: '', webSearch: false, enabled: true, sortOrder: 10, imageUrl: '/assets/jx-tools/main-set.jpg' },
      { id: 'jixing-card-polish', label: '商品精修', icon: 'image', placement: 'MORE', actionType: 'ROUTE', prompt: '', target: '/image', modelKey: '', webSearch: false, enabled: true, sortOrder: 20, imageUrl: '/assets/jx-tools/polish.jpg' },
      { id: 'jixing-card-replica', label: '爆款主图复刻', icon: 'design', placement: 'MORE', actionType: 'ROUTE', prompt: '', target: '/image', modelKey: '', webSearch: false, enabled: true, sortOrder: 30, imageUrl: '/assets/jx-tools/replica.jpg' },
      { id: 'jixing-card-detail', label: '商品详情页/A+', icon: 'ppt', placement: 'MORE', actionType: 'ROUTE', prompt: '', target: '/commerce', modelKey: '', webSearch: false, enabled: true, sortOrder: 40, imageUrl: '/assets/jx-tools/detail.jpg' },
      { id: 'jixing-card-scene', label: '商品场景图', icon: 'image', placement: 'MORE', actionType: 'ROUTE', prompt: '', target: '/image', modelKey: '', webSearch: false, enabled: true, sortOrder: 50, imageUrl: '/assets/jx-tools/scene.jpg' },
      { id: 'jixing-card-poster', label: '电商海报', icon: 'design', placement: 'MORE', actionType: 'ROUTE', prompt: '', target: '/image', modelKey: '', webSearch: false, enabled: true, sortOrder: 60, imageUrl: '/assets/jx-tools/poster.jpg' },
      { id: 'jixing-card-model', label: '模特试衣', icon: 'image', placement: 'MORE', actionType: 'ROUTE', prompt: '', target: '/image', modelKey: '', webSearch: false, enabled: true, sortOrder: 70, imageUrl: '/assets/jx-tools/model.jpg' },
      { id: 'jixing-card-swap', label: '换模特', icon: 'image', placement: 'MORE', actionType: 'ROUTE', prompt: '', target: '/image', modelKey: '', webSearch: false, enabled: true, sortOrder: 80, imageUrl: '/assets/jx-tools/swap.jpg' },
    ],
  },
}

export function normalizeChatHomeContent(value: Prisma.JsonValue | Record<string, unknown> | null | undefined) {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
  const text = (item: unknown, fallback = '', max = 500) => typeof item === 'string' ? item.trim().slice(0, max) : fallback
  const destination = (item: unknown, fallback: string) => {
    const value = text(item, fallback, 1000)
    if (value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/\\')) return value
    try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.toString() : fallback } catch { return fallback }
  }
  const actionRouteTarget = (id: string, configured: unknown, fallback: string) => {
    const target = destination(configured, fallback)
    if (id === 'kimi-design' && (target === '/image' || target.startsWith('/image?'))) return '/canvases'
    return target
  }
  const defaultRecommendations = DEFAULT_CHAT_HOME_CONTENT.doubaoRecommendations as Array<{ title: string; prompt: string; targetUrl: string }>
  const recommendations = Array.isArray(input.doubaoRecommendations) ? input.doubaoRecommendations : defaultRecommendations
  const defaultBanners = DEFAULT_CHAT_HOME_CONTENT.qianwenBanners
  const banners = Array.isArray(input.qianwenBanners) ? input.qianwenBanners : defaultBanners
  const rawProject = input.kimiProject && typeof input.kimiProject === 'object' && !Array.isArray(input.kimiProject) ? input.kimiProject as Record<string, unknown> : DEFAULT_CHAT_HOME_CONTENT.kimiProject
  const rawControls = input.composerControls && typeof input.composerControls === 'object' && !Array.isArray(input.composerControls) ? input.composerControls as Record<string, unknown> : {}
  const rawActions = input.quickActions && typeof input.quickActions === 'object' && !Array.isArray(input.quickActions) ? input.quickActions as Record<string, unknown> : {}
  const presets = ['gpt', 'doubao', 'qianwen', 'kimi', 'jixing'] as const
  const bool = (item: unknown, fallback: boolean) => typeof item === 'boolean' ? item : fallback
  const integer = (item: unknown, fallback: number) => typeof item === 'number' && Number.isFinite(item) ? Math.max(-10000, Math.min(10000, Math.trunc(item))) : fallback
  const composerControls = Object.fromEntries(presets.map((preset) => {
    const fallback = DEFAULT_CHAT_HOME_CONTENT.composerControls[preset]
    const row = rawControls[preset] && typeof rawControls[preset] === 'object' && !Array.isArray(rawControls[preset]) ? rawControls[preset] as Record<string, unknown> : {}
    return [preset, {
      modeEnabled: bool(row.modeEnabled, fallback.modeEnabled),
      webSearchEnabled: bool(row.webSearchEnabled, fallback.webSearchEnabled),
      modelSelectorEnabled: bool(row.modelSelectorEnabled, fallback.modelSelectorEnabled),
      moreEnabled: bool(row.moreEnabled, fallback.moreEnabled),
    }]
  }))
  const quickActions = Object.fromEntries(presets.map((preset) => {
    const fallback = DEFAULT_CHAT_HOME_CONTENT.quickActions[preset]
    const configuredRows = Array.isArray(rawActions[preset]) ? rawActions[preset] : fallback
    const seen = new Set<string>()
    const actions = configuredRows.slice(0, 30).map((item, index) => {
      const row = item && typeof item === 'object' && !Array.isArray(item) ? item as Record<string, unknown> : {}
      const fallbackRow = fallback[index % Math.max(1, fallback.length)] as Record<string, unknown> | undefined
      const baseId = text(row.id, text(fallbackRow?.id, `${preset}-action-${index + 1}`, 80), 80).replace(/[^a-zA-Z0-9_-]/g, '-')
      let id = baseId || `${preset}-action-${index + 1}`
      while (seen.has(id)) id = `${baseId}-${index + 1}`
      seen.add(id)
      const actionType = ['PROMPT', 'OFFICE', 'ROUTE'].includes(String(row.actionType)) ? String(row.actionType) : text(fallbackRow?.actionType, 'PROMPT', 20)
      const placement = ['BAR', 'MORE'].includes(String(row.placement)) ? String(row.placement) : text(fallbackRow?.placement, 'MORE', 20)
      const action = {
        id,
        label: text(row.label, text(fallbackRow?.label, '', 60), 60),
        icon: text(row.icon, text(fallbackRow?.icon, 'sparkles', 30), 30).toLowerCase(),
        placement,
        actionType,
        prompt: text(row.prompt, text(fallbackRow?.prompt, '', 4000), 4000),
        target: actionType === 'ROUTE' ? actionRouteTarget(id, row.target, text(fallbackRow?.target, '/', 1000)) : text(row.target, text(fallbackRow?.target, '', 120), 120),
        modelKey: text(row.modelKey, text(fallbackRow?.modelKey, '', 100), 100),
        imageUrl: destination(row.imageUrl, destination(fallbackRow?.imageUrl, '')),
        webSearch: bool(row.webSearch, Boolean(fallbackRow?.webSearch)),
        enabled: bool(row.enabled, fallbackRow ? Boolean(fallbackRow.enabled) : true),
        sortOrder: integer(row.sortOrder, typeof fallbackRow?.sortOrder === 'number' ? fallbackRow.sortOrder : (index + 1) * 10),
      }
      return action
    }).filter((item) => item.label)
    return [preset, actions]
  }))
  return {
    doubaoRecommendations: recommendations.slice(0, 12).map((item, index) => {
      const row = item && typeof item === 'object' && !Array.isArray(item) ? item as Record<string, unknown> : {}
      const fallback = defaultRecommendations.length ? defaultRecommendations[index % defaultRecommendations.length] : undefined
      return { title: text(row.title, fallback?.title || '', 160), prompt: text(row.prompt, fallback?.prompt || '', 2000), targetUrl: destination(row.targetUrl, fallback?.targetUrl || '') }
    }).filter((item) => item.title),
    qianwenBanners: banners.slice(0, 8).map((item, index) => {
      const row = item && typeof item === 'object' && !Array.isArray(item) ? item as Record<string, unknown> : {}
      const fallback = defaultBanners[index % defaultBanners.length]
      const title = text(row.title, fallback.title, 120)
      return { title, description: text(row.description, fallback.description, 240), buttonText: text(row.buttonText, fallback.buttonText, 40), imageUrl: destination(row.imageUrl, ''), targetUrl: destination(row.targetUrl, fallback.targetUrl) }
    }).filter((item) => item.title),
    kimiProject: { label: text(rawProject.label, DEFAULT_CHAT_HOME_CONTENT.kimiProject.label, 60), targetUrl: destination(rawProject.targetUrl, DEFAULT_CHAT_HOME_CONTENT.kimiProject.targetUrl) },
    composerControls,
    quickActions,
  }
}
