const { existsSync, readFileSync } = require('node:fs')
const { spawnSync } = require('node:child_process')
const { resolve } = require('node:path')
const dotenv = require('dotenv')

const runtimeEnvPath = resolve(process.env.INSTALL_ENV_PATH || '/app/config/.env')
if (existsSync(runtimeEnvPath)) {
  const runtime = dotenv.parse(readFileSync(runtimeEnvPath))
  for (const [key, value] of Object.entries(runtime)) process.env[key] = value
}

if (process.env.DATABASE_URL?.trim()) {
  const prismaCli = require.resolve('prisma/build/index.js')
  const migration = spawnSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
    cwd: resolve(__dirname, '..'),
    env: process.env,
    stdio: 'inherit',
  })
  if (migration.status !== 0) process.exit(migration.status || 1)
} else {
  console.log('[startup] DATABASE_URL 尚未配置，启动首次安装服务。')
}

require('../dist/main.js')
