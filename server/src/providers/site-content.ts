import type { Prisma } from '@prisma/client'
import { asJsonRecord } from '../common/json-record'

export interface SiteContent {
  landing: {
    heroLead: string
    modes: Array<{ key: string; title: string; path: string; image: string; imageAlt: string; lead: string; description: string; actions: Array<{ label: string; to: string }> }>
    navGroups: Array<{ key: string; label: string; items: Array<{ label: string; description: string; to: string }> }>
    previewNav: string[]
    trustTitle: string
    trustDescription: string
    trustItems: Array<{ title: string; description: string }>
    linksTitle: string
    linksDescription: string
    capabilityLinks: Array<{ title: string; description: string; to: string }>
    faqTitle: string
    faqs: Array<{ question: string; answer: string }>
    finalTitle: string
    finalDescription: string
    footerDescription: string
    copyright: string
  }
}

export const DEFAULT_SITE_CONTENT: SiteContent = {
  landing: {
    heroLead: '在一个平台，完成',
    modes: [
      { key: 'chat', title: '对话', path: 'chat', image: '/assets/chat-workspace-white.jpg', imageAlt: 'Xinyue AI 对话工作台预览', lead: '先聊清需求、资料和下一步。', description: '讨论方案、整理文件、撰写内容或分析图片。项目上下文会保留在同一段工作中。', actions: [{ label: '开始对话', to: '/chat' }] },
      { key: 'image', title: '图片创作', path: 'image', image: '/assets/image-studio-white.jpg', imageAlt: 'Xinyue AI 图片创作工作台预览', lead: '从描述或参考图开始创作。', description: '选择模型、比例和输出数量，生成多张候选并继续编辑，结果自动进入文件库。', actions: [{ label: '开始创作', to: '/image' }] },
      { key: 'product', title: '商品上新', path: 'commerce', image: '/assets/product-visual-white.jpg', imageAlt: 'Xinyue AI 商品视觉工作台预览', lead: '从商品资料到成套上新视觉。', description: '商品素材包和连续详情页分别规划、分别交付，结果统一进入文件库。', actions: [{ label: '制作素材包', to: '/commerce' }, { label: '制作详情页', to: '/commerce' }] },
    ],
    navGroups: [
      { key: 'features', label: '功能', items: [{ label: 'AI 对话', description: '思考、写作与协作', to: '/chat' }, { label: '图片生成', description: '生成、编辑与多图创作', to: '/image' }, { label: '商品视觉', description: '商品素材包与连续详情页', to: '/commerce' }] },
      { key: 'resources', label: '资源', items: [{ label: '办公中心', description: 'Agent 任务与办公文件', to: '/office' }, { label: '提示词库', description: '图片与视频灵感', to: '/prompts' }, { label: '能力中心', description: '助手、技能、工具与知识库', to: '/capabilities' }] },
    ],
    previewNav: ['新对话', 'AI 创作', '电商中心', '办公中心', '工作空间'],
    trustTitle: '创作可以大胆，关键信息不能靠猜。',
    trustDescription: 'Xinyue AI 会利用当前对话和你提供的资料继续工作；涉及事实信息时，只使用有依据的内容。',
    trustItems: [{ title: '上下文持续可用，作品统一留存', description: '项目里的对话、文件和生成结果统一保留，可从明确版本继续处理。' }, { title: '有依据的信息，才写进商业内容', description: '包装、卖点、参数和适用范围由你提供并确认，不把猜测包装成事实。' }],
    linksTitle: '把当前任务，接到合适的下一步。',
    linksDescription: '根据现在要完成的内容，继续了解相关能力和使用方式。',
    capabilityLinks: [{ title: '图片生成', description: '普通图片生成、参考图编辑与多张候选。', to: '/image' }, { title: '商品视觉', description: '围绕同一商品生成成套商业素材。', to: '/commerce' }, { title: '办公中心', description: '执行 Agent 任务并交付真实办公文件。', to: '/office' }, { title: '能力中心', description: '使用助手、技能、工具和知识库。', to: '/capabilities' }],
    faqTitle: '开始前，你可能还想确认这些。',
    faqs: [{ question: '一定要先从 AI 对话开始吗？', answer: '不需要。需求明确时可以直接进入创作或办公中心。' }, { question: '生成的作品保存在哪里？', answer: '生成结果会进入文件库，并可关联到当前项目继续处理和下载。' }, { question: '哪些功能可以免费体验？', answer: '具体试用额度、模型和生成成本以当前套餐页面为准。' }],
    finalTitle: '从今天要完成的事开始。',
    finalDescription: '提出一个问题、生成素材或发起办公任务，选择当前任务就可以开始。',
    footerDescription: '在同一个平台完成 AI 对话、视觉创作、办公任务和团队协作。',
    copyright: '© 2026 Xinyue AI. 保留所有权利。',
  },
}

export function normalizeSiteContent(value: Prisma.JsonValue | Record<string, unknown> | null | undefined): SiteContent {
  const root = asJsonRecord(value)
  const landing = asJsonRecord(root.landing)
  const defaults = DEFAULT_SITE_CONTENT.landing
  const destination = (value: unknown, fallback: string) => {
    const candidate = text(value, fallback, 1000)
    if (candidate.startsWith('/')) return candidate
    try { const url = new URL(candidate); return ['http:', 'https:'].includes(url.protocol) ? url.toString() : fallback } catch { return fallback }
  }
  const modes = list(landing.modes, 6).map((entry, index) => {
    const row = asJsonRecord(entry); const fallback = defaults.modes[index % defaults.modes.length]
    return { key: text(row.key, fallback.key, 30).replace(/[^a-z0-9_-]/gi, '-'), title: text(row.title, fallback.title, 50), path: text(row.path, fallback.path, 80), image: destination(row.image, fallback.image), imageAlt: text(row.imageAlt, fallback.imageAlt, 120), lead: text(row.lead, fallback.lead, 160), description: text(row.description, fallback.description, 500), actions: list(row.actions, 4).map((item, actionIndex) => { const action = asJsonRecord(item); const base = fallback.actions[actionIndex % fallback.actions.length]; return { label: text(action.label, base.label, 50), to: destination(action.to, base.to) } }) }
  })
  const navGroups = list(landing.navGroups, 6).map((entry, index) => { const row = asJsonRecord(entry); const fallback = defaults.navGroups[index % defaults.navGroups.length]; return { key: text(row.key, fallback.key, 30).replace(/[^a-z0-9_-]/gi, '-'), label: text(row.label, fallback.label, 40), items: list(row.items, 10).map((item, itemIndex) => { const child = asJsonRecord(item); const base = fallback.items[itemIndex % fallback.items.length]; return { label: text(child.label, base.label, 60), description: text(child.description, base.description, 160), to: destination(child.to, base.to) } }) } })
  return { landing: {
    heroLead: text(landing.heroLead, defaults.heroLead, 100),
    modes: modes.length ? modes : structuredClone(defaults.modes),
    navGroups: navGroups.length ? navGroups : structuredClone(defaults.navGroups),
    previewNav: list(landing.previewNav, 10).map((item) => text(item, '', 30)).filter(Boolean).length ? list(landing.previewNav, 10).map((item) => text(item, '', 30)).filter(Boolean) : [...defaults.previewNav],
    trustTitle: text(landing.trustTitle, defaults.trustTitle, 160), trustDescription: text(landing.trustDescription, defaults.trustDescription, 500),
    trustItems: normalizeCards(landing.trustItems, defaults.trustItems, 6),
    linksTitle: text(landing.linksTitle, defaults.linksTitle, 160), linksDescription: text(landing.linksDescription, defaults.linksDescription, 500),
    capabilityLinks: list(landing.capabilityLinks, 12).map((entry, index) => { const row = asJsonRecord(entry); const fallback = defaults.capabilityLinks[index % defaults.capabilityLinks.length]; return { title: text(row.title, fallback.title, 80), description: text(row.description, fallback.description, 240), to: destination(row.to, fallback.to) } }),
    faqTitle: text(landing.faqTitle, defaults.faqTitle, 160),
    faqs: list(landing.faqs, 20).map((entry, index) => { const row = asJsonRecord(entry); const fallback = defaults.faqs[index % defaults.faqs.length]; return { question: text(row.question, fallback.question, 200), answer: text(row.answer, fallback.answer, 1000) } }),
    finalTitle: text(landing.finalTitle, defaults.finalTitle, 160), finalDescription: text(landing.finalDescription, defaults.finalDescription, 500), footerDescription: text(landing.footerDescription, defaults.footerDescription, 300), copyright: text(landing.copyright, defaults.copyright, 120),
  } }
}

function list(value: unknown, max: number): unknown[] { return Array.isArray(value) ? value.slice(0, max) : [] }
function text(value: unknown, fallback: string, max: number): string { return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : fallback }
function normalizeCards(value: unknown, fallback: Array<{ title: string; description: string }>, max: number) { const rows = list(value, max).map((entry, index) => { const row = asJsonRecord(entry); const base = fallback[index % fallback.length]; return { title: text(row.title, base.title, 120), description: text(row.description, base.description, 500) } }); return rows.length ? rows : structuredClone(fallback) }
