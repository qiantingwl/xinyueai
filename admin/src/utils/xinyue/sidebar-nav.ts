import {
  CREATION_NAV_KEYS,
  NESTED_NAV_KEYS,
  NESTED_NAV_PARENT,
  parseSidebarNav,
  PLUGIN_NAV_KEYS,
  PROMPT_NAV_KEYS,
  SIDEBAR_NAV_KEYS,
  WORKSPACE_NAV_KEYS,
  type NestedNavGroup,
  type SidebarNavPreference
} from '../../../../server/src/common/sidebar-nav'

export {
  applySidebarNav,
  emptySidebarNav,
  moveSidebarItem,
  NESTED_NAV_KEYS,
  NESTED_NAV_PARENT,
  parseSectionNav,
  parseSidebarNav,
  SIDEBAR_NAV_KEYS,
  type NestedNavGroup,
  type SidebarNavPreference
} from '../../../../server/src/common/sidebar-nav'

const SIDEBAR_NAV_LABELS: Record<(typeof SIDEBAR_NAV_KEYS)[number], string> = {
  chat: '新对话',
  creation: 'AI 创作',
  commerce: '电商中心',
  office: '办公中心',
  prompts: '提示词库',
  plugins: '能力中心',
  workspace: '工作空间'
}

const NESTED_NAV_LABELS: Record<(typeof NESTED_NAV_KEYS)[number], string> = {
  projects: '项目',
  files: '文件',
  works: '作品',
  canvases: '画布',
  'image-prompts': '图片反推',
  images: '图片',
  videos: '视频',
  assistants: '助手',
  skills: '技能',
  knowledge: '知识库',
  'prompt-image': '图片提示词',
  'prompt-video': '视频提示词'
}

export const SIDEBAR_NAV_CATALOG = SIDEBAR_NAV_KEYS.map((key) => ({
  key,
  label: SIDEBAR_NAV_LABELS[key]
}))

export const NESTED_NAV_GROUPS: Array<{
  id: NestedNavGroup
  title: string
  note: string
  items: Array<{ key: string; label: string; parent: string }>
}> = [
  {
    id: 'workspace',
    title: '工作空间页面',
    note: '项目、文件、作品、画布和图片反推。可放到一级侧边栏。',
    items: WORKSPACE_NAV_KEYS.map((key) => ({
      key,
      label: NESTED_NAV_LABELS[key],
      parent: 'workspace'
    }))
  },
  {
    id: 'creation',
    title: 'AI 创作页面',
    note: '图片和视频。可把其中一项放到一级侧边栏。',
    items: CREATION_NAV_KEYS.map((key) => ({
      key,
      label: NESTED_NAV_LABELS[key],
      parent: 'creation'
    }))
  },
  {
    id: 'plugins',
    title: '能力中心页面',
    note: '助手、技能和知识库。可放到一级侧边栏。',
    items: PLUGIN_NAV_KEYS.map((key) => ({ key, label: NESTED_NAV_LABELS[key], parent: 'plugins' }))
  },
  {
    id: 'prompts',
    title: '提示词库页面',
    note: '图片提示词和视频提示词。可放到一级侧边栏。',
    items: PROMPT_NAV_KEYS.map((key) => ({ key, label: NESTED_NAV_LABELS[key], parent: 'prompts' }))
  }
]

export function nestedParentKey(key: string) {
  return NESTED_NAV_PARENT[key as keyof typeof NESTED_NAV_PARENT] || ''
}

export function alignHiddenWithFlags(
  nav: SidebarNavPreference,
  disabledKeys: string[],
  managedKeys: readonly string[]
) {
  const managed = new Set(managedKeys)
  const next = nav.hidden.filter((key) => !managed.has(key) || disabledKeys.includes(key))
  for (const key of disabledKeys) if (!next.includes(key)) next.push(key)
  return { ...nav, hidden: next }
}

export function promoteSidebarItem(sidebar: SidebarNavPreference, key: string, parent: string) {
  const promoted = [...new Set([...(sidebar.promoted || []), key])]
  const order = sidebar.order.length ? [...sidebar.order] : [...SIDEBAR_NAV_KEYS]
  if (!order.includes(key)) {
    const index = order.indexOf(parent)
    order.splice(index >= 0 ? index + 1 : order.length, 0, key)
  }
  return parseSidebarNav({
    ...sidebar,
    promoted,
    order,
    hidden: sidebar.hidden.filter((item) => item !== key)
  })
}

export function demoteSidebarItem(sidebar: SidebarNavPreference, key: string) {
  return parseSidebarNav({
    ...sidebar,
    promoted: (sidebar.promoted || []).filter((item) => item !== key),
    order: sidebar.order.filter((item) => item !== key)
  })
}
