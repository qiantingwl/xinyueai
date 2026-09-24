import {
  applySidebarNav,
  emptySidebarNav,
  NESTED_NAV_KEYS,
  NESTED_NAV_PARENT,
  WORKSPACE_NAV_KEYS,
  type NestedNavGroup,
  type SectionNavPreference,
  type SidebarNavPreference,
} from '../../server/src/common/sidebar-nav'

export {
  applySidebarNav,
  emptySectionNav,
  emptySidebarNav,
  moveSidebarItem,
  NESTED_NAV_KEYS,
  parseSectionNav,
  parseSidebarNav,
  WORKSPACE_NAV_KEYS,
  type NestedNavGroup,
  type SectionNavPreference,
  type SidebarNavPreference,
} from '../../server/src/common/sidebar-nav'

export type WorkspaceNavKey = (typeof WORKSPACE_NAV_KEYS)[number]
export type NestedNavKey = (typeof NESTED_NAV_KEYS)[number]

export const NESTED_NAV_CATALOG: Array<{
  key: NestedNavKey
  group: NestedNavGroup
  label: string
  to: string
  mode: 'workspace' | 'images' | 'videos' | 'plugins' | 'prompts'
}> = [
  { key: 'projects', group: 'workspace', label: '项目', to: '/workspace?tab=projects', mode: 'workspace' },
  { key: 'files', group: 'workspace', label: '文件', to: '/workspace?tab=files', mode: 'workspace' },
  { key: 'works', group: 'workspace', label: '作品', to: '/works', mode: 'workspace' },
  { key: 'canvases', group: 'workspace', label: '画布', to: '/canvases', mode: 'workspace' },
  { key: 'image-prompts', group: 'workspace', label: '图片反推', to: '/image-prompt', mode: 'workspace' },
  { key: 'images', group: 'creation', label: '图片', to: '/image', mode: 'images' },
  { key: 'videos', group: 'creation', label: '视频', to: '/video', mode: 'videos' },
  { key: 'assistants', group: 'plugins', label: '助手', to: '/capabilities?tab=assistants', mode: 'plugins' },
  { key: 'skills', group: 'plugins', label: '技能', to: '/capabilities?tab=skills', mode: 'plugins' },
  { key: 'knowledge', group: 'plugins', label: '知识库', to: '/capabilities?tab=knowledge', mode: 'plugins' },
  { key: 'prompt-image', group: 'prompts', label: '图片提示词', to: '/prompts?type=image', mode: 'prompts' },
  { key: 'prompt-video', group: 'prompts', label: '视频提示词', to: '/prompts?type=video', mode: 'prompts' },
]

export const WORKSPACE_NAV_CATALOG = NESTED_NAV_CATALOG.filter((item) => item.group === 'workspace')

export type WorkspaceNavFlags = {
  sidebarProjectsEnabled?: boolean
  sidebarAssetsEnabled?: boolean
  imagePromptEnabled?: boolean
  workspaceNav?: SidebarNavPreference | null
  sectionNav?: SectionNavPreference | null
  sidebarNav?: SidebarNavPreference | null
}

export type SidebarNavFlags = WorkspaceNavFlags & {
  sidebarCreationEnabled?: boolean
  sidebarCommerceEnabled?: boolean
  sidebarOfficeEnabled?: boolean
  sidebarPromptsEnabled?: boolean
  sidebarPluginsEnabled?: boolean
}

export function nestedParentKey(key: string) {
  return NESTED_NAV_PARENT[key as NestedNavKey] || ''
}

export function isPromotedKey(flags: WorkspaceNavFlags, key: string) {
  return Boolean(flags.sidebarNav?.promoted?.includes(key))
}

export function groupPreference(group: NestedNavGroup, flags: WorkspaceNavFlags) {
  if (group === 'workspace') return flags.workspaceNav || emptySidebarNav()
  return flags.sectionNav?.[group] || emptySidebarNav()
}

function nestedEnabled(key: NestedNavKey, flags: SidebarNavFlags) {
  if (key === 'projects' && flags.sidebarProjectsEnabled === false) return false
  if (key === 'files' && flags.sidebarAssetsEnabled === false) return false
  if (key === 'image-prompts' && flags.imagePromptEnabled === false) return false
  if ((key === 'images' || key === 'videos') && flags.sidebarCreationEnabled === false) return false
  if ((key === 'assistants' || key === 'skills' || key === 'knowledge') && flags.sidebarPluginsEnabled === false) return false
  if ((key === 'prompt-image' || key === 'prompt-video') && flags.sidebarPromptsEnabled === false) return false
  return true
}

export function visibleGroupTabs(group: NestedNavGroup, flags: SidebarNavFlags) {
  const promoted = new Set(flags.sidebarNav?.promoted || [])
  const catalog = NESTED_NAV_CATALOG.filter((item) => item.group === group && nestedEnabled(item.key, flags) && !promoted.has(item.key))
  return applySidebarNav(catalog, groupPreference(group, flags))
}

export function visibleWorkspaceNav(flags: WorkspaceNavFlags) {
  return visibleGroupTabs('workspace', flags)
}

export function firstWorkspacePath(flags: WorkspaceNavFlags) {
  return visibleWorkspaceNav(flags)[0]?.to || ''
}

export function firstGroupPath(group: NestedNavGroup, flags: SidebarNavFlags) {
  return visibleGroupTabs(group, flags)[0]?.to || NESTED_NAV_CATALOG.find((item) => item.group === group)?.to || ''
}

export type NavRouteQuery = {
  tab?: unknown
  type?: unknown
}

export function nestedKeyFromRoute(path: string, name: string, query: NavRouteQuery = {}) {
  const tab = typeof query.tab === 'string' ? query.tab : ''
  const type = typeof query.type === 'string' ? query.type.toLowerCase() : ''
  if (name === 'images') return 'images'
  if (name === 'videos') return 'videos'
  if (name === 'capabilities') {
    if (tab === 'assistants' || tab === 'knowledge' || tab === 'skills') return tab
    return 'skills'
  }
  if (name === 'prompts') return type === 'video' ? 'prompt-video' : 'prompt-image'
  return workspaceTabKeyFromRoute(path, tab)
}

export function workspaceTabKeyFromRoute(path: string, tab?: string) {
  if (path === '/workspace' || path.startsWith('/workspace?')) {
    return tab === 'files' ? 'files' : 'projects'
  }
  if (path.startsWith('/works')) return 'works'
  if (path.startsWith('/canvases') || path.startsWith('/canvas/')) return 'canvases'
  if (path.startsWith('/image-prompt')) return 'image-prompts'
  return ''
}

export function sidebarKeyFromRouteName(name: string) {
  if (name === 'chat') return 'chat'
  if (name === 'images' || name === 'videos') return 'creation'
  if (name === 'commerce') return 'commerce'
  if (name === 'office') return 'office'
  if (name === 'prompts') return 'prompts'
  if (name === 'capabilities') return 'plugins'
  if (name === 'workspace' || name === 'works' || name === 'canvases' || name === 'canvas' || name === 'image-prompt') return 'workspace'
  return ''
}

export function visibleSidebarNav(flags: SidebarNavFlags) {
  const promotedKeys = new Set((flags.sidebarNav?.promoted || []).filter((key) => {
    const item = NESTED_NAV_CATALOG.find((entry) => entry.key === key)
    return Boolean(item && nestedEnabled(item.key, flags) && !groupPreference(item.group, flags).hidden.includes(item.key))
  }))
  const workspaceTo = firstGroupPath('workspace', flags)
  const creationTo = firstGroupPath('creation', flags)
  const promptsTo = firstGroupPath('prompts', flags)
  const pluginsTo = firstGroupPath('plugins', flags)
  const items = [
    { key: 'chat', label: '新对话', to: '/chat' },
    ...(flags.sidebarCreationEnabled === false || !creationTo ? [] : [{ key: 'creation', label: 'AI 创作', to: creationTo }]),
    ...(flags.sidebarCommerceEnabled === false ? [] : [{ key: 'commerce', label: '电商中心', to: '/commerce' }]),
    ...(flags.sidebarOfficeEnabled === false ? [] : [{ key: 'office', label: '办公中心', to: '/office' }]),
    ...(flags.sidebarPromptsEnabled === false || !promptsTo ? [] : [{ key: 'prompts', label: '提示词库', to: promptsTo }]),
    ...(flags.sidebarPluginsEnabled === false || !pluginsTo ? [] : [{ key: 'plugins', label: '能力中心', to: pluginsTo }]),
    ...(workspaceTo ? [{ key: 'workspace', label: '工作空间', to: workspaceTo }] : []),
    ...NESTED_NAV_CATALOG.filter((item) => promotedKeys.has(item.key)).map((item) => ({
      key: item.key,
      label: groupPreference(item.group, flags).labels[item.key]?.trim() || item.label,
      to: item.to,
    })),
  ]
  return applySidebarNav(items, flags.sidebarNav)
}

export function firstSidebarPath(flags: SidebarNavFlags) {
  return visibleSidebarNav(flags)[0]?.to || '/'
}

export function navItemIsActive(
  key: string,
  path: string,
  name: string,
  query: NavRouteQuery,
  flags: SidebarNavFlags,
  currentConversationId?: string,
) {
  if (key === 'chat') return name === 'chat' && !currentConversationId
  const nested = nestedKeyFromRoute(path, name, query)
  if (nested) {
    if (key === nested) return true
    const parent = nestedParentKey(nested)
    return key === parent && !isPromotedKey(flags, nested)
  }
  return key === sidebarKeyFromRouteName(name)
}

export function closedPageRedirect(
  path: string,
  name: string,
  query: NavRouteQuery | undefined,
  flags: SidebarNavFlags,
) {
  const parsedQuery = query || {}
  const nested = nestedKeyFromRoute(path, name, parsedQuery)
  if (nested) {
    const item = NESTED_NAV_CATALOG.find((entry) => entry.key === nested)
    if (!item) return ''
    const tabs = visibleGroupTabs(item.group, flags)
    const promoted = isPromotedKey(flags, nested) && nestedEnabled(nested, flags) && !groupPreference(item.group, flags).hidden.includes(nested)
    if (promoted) return ''
    if (!tabs.some((entry) => entry.key === nested)) return tabs[0]?.to || firstSidebarPath(flags)
    const parentVisible = visibleSidebarNav(flags).some((entry) => entry.key === item.group)
    if (!parentVisible) return firstSidebarPath(flags)
    const tab = typeof parsedQuery.tab === 'string' ? parsedQuery.tab : undefined
    const isWorkspaceRoot = (path === '/workspace' || path === '/workspace/') && !tab
    if (isWorkspaceRoot && tabs[0] && tabs[0].key !== 'projects') return tabs[0].to
    return ''
  }
  const sidebarKey = sidebarKeyFromRouteName(name)
  if (!sidebarKey || sidebarKey === 'chat') return ''
  if (visibleSidebarNav(flags).some((item) => item.key === sidebarKey)) return ''
  return firstSidebarPath(flags)
}
