import { z } from 'zod'
import { isOptInEnabled } from '../common/external-content-policy'

const optionalBoolean = z.preprocess((value) => {
  if (value === undefined || value === '') return undefined
  if (typeof value === 'string') {
    if (value.toLowerCase() === 'true') return true
    if (value.toLowerCase() === 'false') return false
  }
  return value
}, z.boolean().optional())

const optionalUrl = z.preprocess((value) => {
  if (value === undefined || value === null) return undefined
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed || undefined
  }
  return value
}, z.string().url().optional())

const optInBoolean = z.preprocess((value) => isOptInEnabled(value), z.boolean())

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3100),
  WEB_ORIGIN: z.string().default('http://localhost:6001'),
  PUBLIC_BASE_URL: optionalUrl,
  COOKIE_SECURE: optionalBoolean,
  TRUST_PROXY: z.string().optional(),
  HEALTH_CHECK_TIMEOUT_MS: z.coerce.number().int().min(500).max(30_000).default(3000),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
  INSTALL_TOKEN: z.string().min(32).optional(),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(30),
  OTP_TTL_MINUTES: z.coerce.number().int().positive().default(10),
  GLOBAL_RATE_LIMIT: z.coerce.number().int().positive().default(600),
  ADMIN_LOGIN_RATE_LIMIT: z.coerce.number().int().positive().default(30),
  UPLOAD_DIR: z.string().default('uploads'),
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  S3_ENDPOINT: optionalUrl,
  S3_REGION: z.string().default('auto'),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: optionalBoolean,
  AI_PROVIDER_BASE_URL: z.string().url().default('https://api.openai.com/v1'),
  AI_PROVIDER_API_KEY: z.string().optional(),
  AI_CHAT_MODEL: z.string().default('gpt-4.1'),
  AI_IMAGE_MODEL: z.string().default('gpt-image-1'),
  LOCAL_WORKER_ALLOWED_HOSTS: z.string().optional(),
  CREDENTIAL_ENCRYPTION_KEY: z.string().min(32).optional(),
  PROMPT_LIBRARY_EXTERNAL_SYNC_ENABLED: optInBoolean,
  EXTERNAL_SKILL_MARKET_ENABLED: optInBoolean,
})

export function validateEnv(input: Record<string, unknown>) {
  return schema.parse(input)
}
