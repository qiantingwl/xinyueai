import { config as loadDotEnv, parse as parseDotEnv } from 'dotenv'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, resolve } from 'node:path'
import { mkdirSync } from 'node:fs'

const managedKeys = new Set([
  'DATABASE_URL',
  'REDIS_URL',
  'SESSION_SECRET',
  'CREDENTIAL_ENCRYPTION_KEY',
  'WEB_ORIGIN',
  'COOKIE_SECURE',
  'INSTALL_TOKEN',
  'INSTALL_COMPLETED',
])

export function runtimeEnvPath() {
  const configured = process.env.INSTALL_ENV_PATH?.trim()
  if (!configured) return resolve(process.cwd(), '.env')
  return isAbsolute(configured) ? configured : resolve(process.cwd(), configured)
}

export function loadRuntimeEnv() {
  const path = runtimeEnvPath()
  if (!existsSync(path)) return path
  loadDotEnv({ path, override: process.env.INSTALL_ENV_OVERRIDE === 'true' })
  return path
}

export function writeRuntimeEnv(values: Record<string, string>) {
  const path = runtimeEnvPath()
  const source = existsSync(path) ? readFileSync(path, 'utf8') : ''
  const current = parseDotEnv(source)
  const next = { ...current }
  for (const [key, value] of Object.entries(values)) {
    if (!managedKeys.has(key)) throw new Error(`不允许写入运行配置：${key}`)
    next[key] = value
    process.env[key] = value
  }
  const retained = source.split(/\r?\n/).filter((line) => {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=/)
    return !match || !(match[1] in values)
  })
  const appended = Object.entries(values).map(([key, value]) => `${key}=${JSON.stringify(value)}`)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, [...retained.filter((line, index, lines) => line || index < lines.length - 1), ...appended, ''].join('\n'), { encoding: 'utf8', mode: 0o600 })
  return { path, values: next }
}

loadRuntimeEnv()
