import { api } from './api'

export type InstallationStatus = {
  installed: boolean
  locked?: boolean
  phase: 'database' | 'site' | 'complete'
  databaseConfigured: boolean
  databaseReady: boolean
  databaseError?: string
  siteName?: string
  requiresInstallToken: boolean
  restartRequired?: boolean
}

let current: InstallationStatus | null = null
let pending: Promise<InstallationStatus | null> | null = null

export async function installationStatus(force = false) {
  if (!force && current) return current
  if (!force && pending) return pending
  pending = api<InstallationStatus>('/install/status', { cache: 'no-store' })
    .then((status) => { current = status; return status })
    .catch(() => null)
    .finally(() => { pending = null })
  return pending
}

export function clearInstallationStatus() { current = null }
