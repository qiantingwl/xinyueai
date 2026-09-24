const SETTINGS_STORAGE_KEY = 'xinyue:settings'

export interface PendingSettingsSync {
  appearance?: string
  language?: string
  changedAt?: number
}

export interface StoredSettings extends Record<string, unknown> {
  appearance?: string
  language?: string
  notifications?: boolean
  rememberModel?: boolean
  style?: string
  detail?: string
  replyLanguage?: string
  customInstructions?: string
  nickname?: string
  occupation?: string
  bio?: string
  useMemory?: boolean
  referenceChats?: boolean
  chatHistoryEnabled?: boolean
  trainingOptOut?: boolean
  temporaryChatDefault?: boolean
  dataRetentionDays?: number
  shareUsageAnalytics?: boolean
  onboarded?: boolean
  pendingServerSync?: PendingSettingsSync
}

export function readStoredSettings(): StoredSettings {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) || '{}')
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value as StoredSettings
      : {}
  } catch {
    return {}
  }
}

export function writeStoredSettings(settings: object): void {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // Storage can be unavailable in private browsing or when the quota is full.
  }
}

export function updateStoredSettings(
  update: (current: StoredSettings) => StoredSettings,
): StoredSettings {
  const next = update(readStoredSettings())
  writeStoredSettings(next)
  return next
}
