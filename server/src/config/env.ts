import { z } from 'zod'

const optionalBoolean = z.preprocess((value) => {
  if (value === undefined || value === '') return undefined
  if (typeof value === 'string') {
    if (value.toLowerCase() === 'true') return true
    if (value.toLowerCase() === 'false') return false
  }
  return value
}, z.boolean().optional())

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3100),
  WEB_ORIGIN: z.string().default('http://localhost:5173'),
  COOKIE_SECURE: optionalBoolean,
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(30),
  OTP_TTL_MINUTES: z.coerce.number().int().positive().default(10),
  GLOBAL_RATE_LIMIT: z.coerce.number().int().positive().default(600),
  UPLOAD_DIR: z.string().default('uploads'),
  AI_PROVIDER_BASE_URL: z.string().url().default('https://api.openai.com/v1'),
  AI_PROVIDER_API_KEY: z.string().optional(),
  AI_CHAT_MODEL: z.string().default('gpt-4.1'),
  AI_IMAGE_MODEL: z.string().default('gpt-image-1'),
  CREDENTIAL_ENCRYPTION_KEY: z.string().min(32).optional(),
  WEB_SEARCH_ENDPOINT: z.string().url().optional(),
  WEB_SEARCH_API_KEY: z.string().optional(),
  INSTALL_TOKEN: z.string().min(8).optional(),
  INSTALL_COMPLETED: optionalBoolean,
  INSTALL_ENV_PATH: z.string().optional(),
  INSTALL_ENV_OVERRIDE: optionalBoolean,
  INSTALL_AUTO_RESTART: optionalBoolean,
})

export function validateEnv(input: Record<string, unknown>) {
  return schema.parse(input)
}
