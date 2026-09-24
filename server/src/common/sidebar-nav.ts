/** Shared nav helpers. Keep this file Nest-free so user/admin apps can import it. */
export type SidebarNavPreference = {
  order: string[]
  hidden: string[]
  labels: Record<string, string>
  promoted: string[]
}

export type NestedNavGroup = 'workspace' | 'creation' | 'plugins' | 'prompts'
export type SectionNavPreference = Record<Exclude<NestedNavGroup, 'workspace'>, SidebarNavPreference>

export function emptySidebarNav(): SidebarNavPreference {
  return { order: [], hidden: [], labels: {}, promoted: [] }
}

export function emptySectionNav(): SectionNavPreference {
  return {
    creation: emptySidebarNav(),
    plugins: emptySidebarNav(),
    prompts: emptySidebarNav(),
  }
}

export function parseSidebarNav(value: unknown): SidebarNavPreference {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return emptySidebarNav()
  const row = value as Record<string, unknown>
  const order = Array.isArray(row.order) ? row.order.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())) : []
  const hidden = Array.isArray(row.hidden) ? row.hidden.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())) : []
  const promoted = Array.isArray(row.promoted) ? row.promoted.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())) : []
  const labels = row.labels && typeof row.labels === 'object' && !Array.isArray(row.labels)
    ? Object.fromEntries(Object.entries(row.labels).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
    : {}
  return { order, hidden, labels, promoted }
}

export function parseSectionNav(value: unknown): SectionNavPreference {
  const row = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
  return {
    creation: parseSidebarNav(row.creation),
    plugins: parseSidebarNav(row.plugins),
    prompts: parseSidebarNav(row.prompts),
  }
}

export function applySidebarNav<T extends { key: string; label: string }>(
  items: T[],
  preference: SidebarNavPreference | null | undefined,
) {
  const hidden = new Set(preference?.hidden || [])
  const labels = preference?.labels || {}
  const rank = new Map((preference?.order || []).map((key, index) => [key, index]))
  return items
    .filter((item) => !hidden.has(item.key))
    .sort((left, right) => {
      const leftRank = rank.has(left.key) ? rank.get(left.key)! : Number.MAX_SAFE_INTEGER
      const rightRank = rank.has(right.key) ? rank.get(right.key)! : Number.MAX_SAFE_INTEGER
      if (leftRank !== rightRank) return leftRank - rightRank
      return items.indexOf(left) - items.indexOf(right)
    })
    .map((item) => {
      const label = labels[item.key]?.trim()
      return label ? { ...item, label } : item
    })
}

export function moveSidebarItem(order: string[], key: string, direction: -1 | 1) {
  const next = [...order]
  const index = next.indexOf(key)
  if (index < 0) return next
  const swap = index + direction
  if (swap < 0 || swap >= next.length) return next
  ;[next[index], next[swap]] = [next[swap], next[index]]
  return next
}

export const SIDEBAR_NAV_KEYS = ['chat', 'creation', 'commerce', 'office', 'prompts', 'plugins', 'workspace'] as const
export const WORKSPACE_NAV_KEYS = ['projects', 'files', 'works', 'canvases', 'image-prompts'] as const
export const CREATION_NAV_KEYS = ['images', 'videos'] as const
export const PLUGIN_NAV_KEYS = ['assistants', 'skills', 'knowledge'] as const
export const PROMPT_NAV_KEYS = ['prompt-image', 'prompt-video'] as const
export const NESTED_NAV_KEYS = [...WORKSPACE_NAV_KEYS, ...CREATION_NAV_KEYS, ...PLUGIN_NAV_KEYS, ...PROMPT_NAV_KEYS] as const
export const SIDEBAR_AND_NESTED_KEYS = [...SIDEBAR_NAV_KEYS, ...NESTED_NAV_KEYS] as const
export const NESTED_NAV_PARENT = {
  projects: 'workspace',
  files: 'workspace',
  works: 'workspace',
  canvases: 'workspace',
  'image-prompts': 'workspace',
  images: 'creation',
  videos: 'creation',
  assistants: 'plugins',
  skills: 'plugins',
  knowledge: 'plugins',
  'prompt-image': 'prompts',
  'prompt-video': 'prompts',
} as const satisfies Record<(typeof NESTED_NAV_KEYS)[number], NestedNavGroup>

export function sanitizeSidebarNav(value: unknown, allowedKeys?: readonly string[]): SidebarNavPreference {
  const parsed = parseSidebarNav(value)
  const allowed = allowedKeys ? new Set(allowedKeys) : null
  const keep = (key: string) => (allowed ? allowed.has(key) : Boolean(key.trim()))
  return {
    order: parsed.order.filter(keep).slice(0, 40),
    hidden: [...new Set(parsed.hidden.filter(keep))].slice(0, 40),
    promoted: [...new Set(parsed.promoted.filter(keep))].slice(0, 40),
    labels: Object.fromEntries(
      Object.entries(parsed.labels)
        .filter(([key, label]) => keep(key) && Boolean(label.trim()))
        .map(([key, label]) => [key, label.trim().slice(0, 24)])
        .slice(0, 40),
    ),
  }
}

export function packWorkspaceNav(workspace: unknown, section: unknown) {
  const row = section && typeof section === 'object' && !Array.isArray(section) ? (section as Record<string, unknown>) : {}
  return {
    ...sanitizeSidebarNav(workspace, WORKSPACE_NAV_KEYS),
    creation: sanitizeSidebarNav(row.creation, CREATION_NAV_KEYS),
    plugins: sanitizeSidebarNav(row.plugins, PLUGIN_NAV_KEYS),
    prompts: sanitizeSidebarNav(row.prompts, PROMPT_NAV_KEYS),
  }
}

export function unpackSectionNav(value: unknown) {
  const row = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
  return {
    creation: sanitizeSidebarNav(row.creation, CREATION_NAV_KEYS),
    plugins: sanitizeSidebarNav(row.plugins, PLUGIN_NAV_KEYS),
    prompts: sanitizeSidebarNav(row.prompts, PROMPT_NAV_KEYS),
  }
}

export function presentSystemNav(sidebarNav: unknown, workspaceNav: unknown) {
  return {
    sidebarNav: parseSidebarNav(sidebarNav),
    workspaceNav: parseSidebarNav(workspaceNav),
    sectionNav: unpackSectionNav(workspaceNav),
  }
}
