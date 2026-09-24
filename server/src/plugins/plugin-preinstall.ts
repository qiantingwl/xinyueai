import type { Prisma } from '@prisma/client'

/**
 * Free official skills flagged with `config.preinstalled` are usable by every
 * user without an installation row. Uninstalling stores a disabled row, which
 * takes precedence so the skill stays hidden for that user.
 */
export const PREINSTALLED_CONFIG_KEY = 'preinstalled'

export function pluginConfigObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? { ...(value as Record<string, unknown>) } : {}
}

export function isPreinstalledPlugin(plugin: { config: unknown; priceCredits: number; ownerId: string | null; visibility: string }) {
  return plugin.visibility === 'OFFICIAL' && plugin.ownerId === null && plugin.priceCredits === 0 && pluginConfigObject(plugin.config)[PREINSTALLED_CONFIG_KEY] === true
}

export function preinstalledPluginWhere(userId: string): Prisma.PluginWhereInput {
  return {
    visibility: 'OFFICIAL',
    ownerId: null,
    priceCredits: 0,
    config: { path: [PREINSTALLED_CONFIG_KEY], equals: true },
    installations: { none: { userId } },
  }
}
