import type { PluginCapability, Prisma, PrismaClient } from '@prisma/client'
import { PREINSTALLED_CONFIG_KEY, pluginConfigObject } from './plugin-preinstall'

type SkillCategoryPreset = { slug: string; name: string; description: string; icon: string; sortOrder: number }

type SkillPreset = {
  slug: string
  name: string
  category: string
  description: string
  instruction: string
  outputRequirements: string
  icon: string
  capabilities: PluginCapability[]
  sortOrder: number
}

export const defaultSkillCategoryPresets: SkillCategoryPreset[] = [
  { slug: 'productivity', name: '效率办公', description: '写作、分析、文档与日常办公', icon: 'briefcase-business', sortOrder: 10 },
  { slug: 'creative', name: '创意设计', description: '图片、视频与视觉创意', icon: 'palette', sortOrder: 20 },
  { slug: 'diagram', name: '图表可视化', description: '流程图、思维导图、信息图、数据图表与矢量图', icon: 'chart-network', sortOrder: 25 },
  { slug: 'commerce', name: '电商营销', description: '商品视觉、营销文案与经营分析', icon: 'shopping-bag', sortOrder: 30 },
  { slug: 'development', name: '开发工具', description: '代码、架构与技术协作', icon: 'code-2', sortOrder: 40 },
  { slug: 'research', name: '研究分析', description: '调研、阅读、报告与决策分析', icon: 'microscope', sortOrder: 50 },
  { slug: 'content', name: '内容创作', description: '文案、社媒、SEO 与本地化内容', icon: 'pen-line', sortOrder: 60 },
]

const htmlArtifactRule = '用一个 ```html 代码块输出完整的单文件页面（含 <!doctype html>），样式写在 <style> 内，不引用外部脚本、字体、图片或 CDN；页面需在 360px 到 1280px 宽度下都能完整阅读。'

export const defaultSkillPresets: SkillPreset[] = [
  {
    slug: 'flowchart', name: '流程图', category: 'diagram', icon: 'workflow', sortOrder: 200,
    capabilities: ['CHAT', 'OFFICE'],
    description: '把业务流程、审批链路或系统步骤画成可预览、可下载的流程图。',
    instruction: [
      '你是流程梳理与图示专家。先从用户描述中识别起点、终点、参与角色、关键步骤、判断条件和异常分支，再绘制流程图。',
      '步骤名称用动宾短语，不超过 12 个字；判断节点写成问题并标出“是/否”两条出口；多角色流程按角色分泳道。',
      '用户描述缺少关键环节时，按行业常规补齐并在图下方列出“假设与待确认”。',
    ].join('\n'),
    outputRequirements: `先用 3 句以内说明流程概要，然后${htmlArtifactRule}节点用圆角矩形、判断用菱形、连线带箭头（可用内联 SVG 绘制）。最后列出假设与待确认事项。`,
  },
  {
    slug: 'mind-map', name: '思维导图', category: 'diagram', icon: 'network', sortOrder: 210,
    capabilities: ['CHAT', 'OFFICE'],
    description: '把主题、文章或会议内容整理成层级清晰的思维导图。',
    instruction: [
      '你是结构化思考专家。围绕中心主题拆出 4 到 7 个一级分支，每个分支 2 到 5 个子节点，层级不超过 4 层。',
      '同级节点保持同一分类标准、互不重叠；节点用关键词或短句，不写长段落。',
      '用户提供原文时严格依据原文提炼，不补写原文没有的事实。',
    ].join('\n'),
    outputRequirements: `先用 Markdown 多级列表输出完整大纲（便于复制到其他导图工具），再${htmlArtifactRule}导图以中心主题向左右两侧展开，不同一级分支使用不同但协调的颜色。`,
  },
  {
    slug: 'svg-vector', name: 'SVG 矢量图', category: 'diagram', icon: 'pen-tool', sortOrder: 220,
    capabilities: ['CHAT'],
    description: '生成图标、Logo 草稿、插画元素和示意图的 SVG 矢量代码。',
    instruction: [
      '你是矢量图形设计师。根据用户描述设计简洁、可缩放的 SVG 图形，优先使用几何形状和少量路径，保持视觉重心稳定、线宽统一。',
      '颜色不超过 5 种；需要文字时使用通用无衬线字体并控制字数；图标类默认 24x24 或 64x64 网格，插画类默认 800x600。',
    ].join('\n'),
    outputRequirements: '用一个 ```svg 代码块输出完整 SVG，必须包含 xmlns 和 viewBox，禁止 <script>、外部链接和位图嵌入。代码块后用 2 到 3 句说明设计思路和可调整的参数。',
  },
  {
    slug: 'infographic', name: '信息图', category: 'diagram', icon: 'layout-dashboard', sortOrder: 230,
    capabilities: ['CHAT', 'OFFICE'],
    description: '把报告、数据或知识点排成一页可分享的信息图。',
    instruction: [
      '你是信息设计师。先提炼一个核心结论作为标题，再把内容拆成 3 到 6 个信息模块（关键数字、步骤、对比、时间线或清单）。',
      '每个模块一个小标题加少量文字，数字要醒目；只使用用户提供或可核验的数据，缺失的数据用“待补充”占位，不编造。',
    ].join('\n'),
    outputRequirements: `${htmlArtifactRule}采用纵向长图布局，配色克制，模块之间有清晰的视觉层级。页面底部注明数据来源或“数据待核验”。`,
  },
  {
    slug: 'data-chart', name: '数据图表', category: 'diagram', icon: 'chart-column', sortOrder: 240,
    capabilities: ['CHAT', 'OFFICE'],
    description: '根据表格或数字生成柱状图、折线图、饼图等可交互图表。',
    instruction: [
      '你是数据可视化分析师。先核对字段、单位、时间范围和口径，再选择最合适的图表：趋势用折线，比较用柱状，构成用堆叠或环形，分布用散点。',
      '所有数值必须来自用户输入，不得虚构或补全；数据不完整时说明缺口，只绘制已有部分。',
    ].join('\n'),
    outputRequirements: `先用表格列出参与绘图的数据，再${htmlArtifactRule}图表用内联 SVG 绘制，包含标题、坐标轴、单位和图例，鼠标悬停显示数值。最后给出 2 到 4 条基于数据的观察。`,
  },
  {
    slug: 'html-prototype', name: '网页原型', category: 'development', icon: 'app-window', sortOrder: 250,
    capabilities: ['CHAT'],
    description: '把页面想法快速做成可点击预览的单文件 HTML 原型。',
    instruction: [
      '你是资深前端与交互设计师。先确定页面目标、核心用户操作和信息层级，再实现原型。',
      '使用语义化 HTML、现代 CSS（Flex/Grid）和少量原生 JavaScript 实现关键交互；按钮、输入框和状态要有真实反馈，不堆砌无意义装饰。',
      '文案使用贴近真实业务的示例内容，不使用 lorem ipsum。',
    ].join('\n'),
    outputRequirements: '用一个 ```html 代码块输出完整单文件页面（含 <!doctype html>），不引用外部资源；需兼顾桌面与移动端。代码块后列出已实现的交互和后续可扩展点。',
  },
  {
    slug: 'prd-writer', name: '产品经理', category: 'productivity', icon: 'clipboard-list', sortOrder: 260,
    capabilities: ['CHAT', 'OFFICE'],
    description: '把一句需求或产品想法整理成结构完整的需求文档（PRD）。',
    instruction: [
      '你是经验丰富的产品经理，擅长把模糊想法转化为可评审、可开发的需求。',
      '输出结构：背景与目标（含可衡量指标）→ 目标用户与场景 → 用户故事（“作为…我希望…以便…”）→ 功能需求（按优先级 P0/P1/P2）→ 交互与页面要点 → 验收标准（可测试）→ 风险、依赖与待确认问题。',
      '不虚构业务数据；信息不足时写出合理假设并在待确认问题中列出。',
    ].join('\n'),
    outputRequirements: '使用清晰的 Markdown 标题和表格；功能需求与验收标准一一对应，每条验收标准可被测试人员直接验证。',
  },
  {
    slug: 'inspiration-board', name: '灵感图', category: 'creative', icon: 'layout-grid', sortOrder: 270,
    capabilities: ['IMAGE'],
    description: '围绕一个主题生成多画面拼贴的灵感板（Moodboard），用于前期风格探索。',
    instruction: [
      '把用户主题扩展为一张灵感拼贴板：在同一画面中以错落拼贴的方式排布 6 到 9 个不同大小的画面格。',
      '各画面格分别展示主题的不同侧面：主体特写、使用场景、材质细节、色彩样本、光影氛围、构图参考等，整体色调统一、风格一致。',
      '格与格之间留出细窄的浅色间隔，可点缀少量色卡或纸片质感，但不出现可读的文字、水印或 Logo。',
    ].join('\n'),
    outputRequirements: '画面清晰、排版有呼吸感；不改变用户指定的主体、品牌元素和色彩倾向。',
  },
  {
    slug: 'grid-image', name: '宫格图', category: 'creative', icon: 'grid-3x3', sortOrder: 280,
    capabilities: ['IMAGE', 'COMMERCE'],
    description: '生成主体一致的九宫格或四宫格组图，适合商品多角度展示、表情包和社媒封面。',
    instruction: [
      '生成一张规整的宫格组图：用户未指定时默认 3x3 九宫格，每格尺寸一致、边距均匀。',
      '所有格子保持同一主体（外观、配色、材质、人物特征）完全一致，只变化角度、动作、场景或表情，形成有节奏的系列感。',
      '背景和光线在整组内协调统一；不添加格外文字、编号或水印，除非用户明确要求。',
    ].join('\n'),
    outputRequirements: '主体一致性优先于画面花样；商品类要保证外观、颜色和结构准确。',
  },
  {
    slug: 'article-illustration', name: '文章配图', category: 'creative', icon: 'image', sortOrder: 290,
    capabilities: ['IMAGE', 'CHAT'],
    description: '为文章、公众号或报告规划并生成风格统一的配图。',
    instruction: [
      '对话中使用时：通读文章，找出最需要视觉辅助的 3 到 6 个位置（开篇题图、概念解释、数据/流程、情绪转折、结尾），为每处给出插图目的、画面描述和一段可直接用于图片生成的提示词，并统一全篇视觉风格。',
      '图片生成中使用时：把用户给出的段落或主题转化为一张编辑插画，用隐喻或场景表达核心观点，构图简洁、主体突出，适合横版阅读场景。',
      '避免在画面中出现大段文字；不使用真实人物肖像或受版权保护的角色。',
    ].join('\n'),
    outputRequirements: '对话输出使用表格列出：位置、目的、画面描述、提示词；全篇配图风格保持一致。',
  },
  {
    slug: 'comic-strip', name: '漫画分镜', category: 'creative', icon: 'book-open', sortOrder: 300,
    capabilities: ['IMAGE', 'CHAT'],
    description: '把故事、产品卖点或知识点改编成多格漫画与分镜脚本。',
    instruction: [
      '对话中使用时：先确定角色设定（外观、性格、固定服装）和画风，再输出 4 到 8 格分镜，每格包含镜头景别、画面内容、角色动作表情和对白（每格对白不超过 20 字）。',
      '图片生成中使用时：生成一张多格漫画（默认四格，从左到右、从上到下阅读），角色外观在各格保持一致，情节有起承转合，结尾有反转或点题。',
      '不使用受版权保护的角色形象；对白使用简体中文，字数精简。',
    ].join('\n'),
    outputRequirements: '分镜用表格呈现；角色一致性、叙事节奏和可读性优先。',
  },
  {
    slug: 'logo-design', name: 'Logo 设计', category: 'creative', icon: 'badge', sortOrder: 310,
    capabilities: ['IMAGE'],
    description: '根据品牌名称和定位生成简洁、可识别的 Logo 方案图。',
    instruction: [
      '根据品牌名称、行业和调性设计一个扁平化 Logo：图形简洁、轮廓清晰、在小尺寸下仍可识别，配色不超过 3 种。',
      '居中构图、纯色或浅色背景，只展示 Logo 本身，不添加样机、阴影堆叠或多余装饰。',
      '若包含文字，只使用用户提供的品牌名称并保证拼写准确。',
    ].join('\n'),
    outputRequirements: '优先可识别性和延展性；不得模仿已知品牌的标志。',
  },
  {
    slug: 'humanize-rewrite', name: '自然润色', category: 'content', icon: 'sparkles', sortOrder: 320,
    capabilities: ['CHAT', 'OFFICE'],
    description: '去掉模板腔和 AI 味，把文字改得自然、具体、像真人写的。',
    instruction: [
      '你是资深编辑。在不改变原意、事实和关键术语的前提下改写文字：删除空泛铺垫、套话和过度排比，减少“首先/其次/总之/值得注意的是”等机械衔接。',
      '用具体的名词、动词和例子替代抽象形容；长短句交替，段落有主次；保持用户指定的语气和受众。',
    ].join('\n'),
    outputRequirements: '直接输出改写后的全文；如用户要求，再附上 3 条以内的主要修改说明。',
  },
  {
    slug: 'translate-localize', name: '翻译本地化', category: 'content', icon: 'languages', sortOrder: 330,
    capabilities: ['CHAT', 'OFFICE'],
    description: '按目标市场习惯翻译并本地化文案、文档和界面文字。',
    instruction: [
      '你是专业译者与本地化专家。先识别原文领域、受众和目标语言（用户未指定时中文译英文、其他语言译中文）。',
      '术语前后一致，数字、单位、日期和货币按目标地区习惯转换；营销文案在保持卖点的前提下意译，技术与法律文本以准确为先。',
      '无法确定的术语保留原文并在括号内标注。',
    ].join('\n'),
    outputRequirements: '先输出译文；如存在术语取舍或文化差异，在末尾用简短列表说明。',
  },
]

export const defaultPreinstalledSkillSlugs = [
  ...defaultSkillPresets.map((item) => item.slug),
  'deep-writer', 'visual-director', 'commerce-studio', 'ppt-planner', 'spreadsheet-analyst', 'meeting-minutes', 'product-detail-page', 'video-storyboard',
]

function presetId(prefix: string, slug: string) {
  return `${prefix}_${slug.replace(/-/g, '_')}`
}

export async function ensureDefaultSkillPresets(prisma: PrismaClient) {
  let added = 0
  await prisma.$transaction(async (tx) => {
    const categoryIds = new Map<string, string>()
    for (const preset of defaultSkillCategoryPresets) {
      const row = await tx.pluginCategory.upsert({
        where: { slug: preset.slug },
        update: {},
        create: { id: presetId('plugin_category', preset.slug), ...preset, enabled: true },
        select: { id: true },
      })
      categoryIds.set(preset.slug, row.id)
    }
    const existing = new Set((await tx.plugin.findMany({ where: { slug: { in: defaultSkillPresets.map((item) => item.slug) } }, select: { slug: true } })).map((row) => row.slug))
    for (const preset of defaultSkillPresets) {
      if (existing.has(preset.slug)) continue
      const { category, ...data } = preset
      await tx.plugin.create({
        data: {
          ...data,
          id: presetId('plugin_official', preset.slug),
          categoryId: categoryIds.get(category) || null,
          version: '1.0.0',
          recommendedModel: '',
          config: { [PREINSTALLED_CONFIG_KEY]: true, builtin: true },
          visibility: 'OFFICIAL',
          status: 'PUBLISHED',
          featured: false,
          priceCredits: 0,
        },
      })
      added += 1
    }
    const candidates = await tx.plugin.findMany({ where: { slug: { in: defaultPreinstalledSkillSlugs }, ownerId: null, visibility: 'OFFICIAL' }, select: { id: true, config: true } })
    for (const row of candidates) {
      const config = pluginConfigObject(row.config)
      if (PREINSTALLED_CONFIG_KEY in config) continue
      await tx.plugin.update({ where: { id: row.id }, data: { config: { ...config, [PREINSTALLED_CONFIG_KEY]: true } as Prisma.InputJsonValue } })
    }
  })
  return { added, total: defaultSkillPresets.length }
}
