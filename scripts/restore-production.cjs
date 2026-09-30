const { copyFileSync, existsSync, openSync, closeSync, readFileSync } = require('node:fs')
const { createHash } = require('node:crypto')
const { resolve } = require('node:path')
const { spawnSync } = require('node:child_process')

const root = resolve(__dirname, '..')
const sourceArg = process.argv.find((arg) => arg.startsWith('--source='))?.slice(9)
if (!sourceArg || !process.argv.includes('--confirm')) throw new Error('用法：npm run restore:production -- --source=备份目录 --confirm [--restore-config]')
const source = resolve(sourceArg)
const manifestPath = resolve(source, 'manifest.json')
if (!existsSync(manifestPath)) throw new Error('备份目录缺少 manifest.json')
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
if (manifest.format !== 1 || manifest.application !== 'Xinyue AI') throw new Error('备份格式不受支持')
for (const [file, expected] of Object.entries(manifest.files || {})) {
  const path = resolve(source, file)
  if (!existsSync(path)) throw new Error(`备份文件缺失：${file}`)
  const actual = createHash('sha256').update(readFileSync(path)).digest('hex')
  if (actual !== expected.sha256) throw new Error(`备份校验失败：${file}`)
}

const envFile = resolve(root, '.env.production')
const composeFile = resolve(root, 'docker-compose.prod.yml')
if (process.argv.includes('--restore-config')) {
  const backupEnv = resolve(source, 'environment.production')
  if (!existsSync(backupEnv)) throw new Error('该备份未包含 environment.production（默认不再打包密钥），请手工准备 .env.production')
  copyFileSync(backupEnv, envFile)
}
if (!existsSync(envFile)) throw new Error('缺少 .env.production；使用 --restore-config 恢复备份配置，或先手工配置')
const compose = ['compose', '--env-file', envFile, '-f', composeFile]
function run(args, options = {}) {
  const result = spawnSync('docker', [...compose, ...args], { cwd: root, stdio: options.stdio || 'inherit' })
  if (result.status !== 0) throw new Error(`Docker 命令失败：docker ${[...compose, ...args].join(' ')}`)
}
function feed(file, args) {
  const fd = openSync(resolve(source, file), 'r')
  try { run(args, { stdio: [fd, 'inherit', 'inherit'] }) } finally { closeSync(fd) }
}

run(['stop', 'frontend', 'backend', 'redis'])
run(['up', '-d', '--wait', '--wait-timeout', '180', 'postgres'])
feed('database.dump', ['exec', '-T', 'postgres', 'pg_restore', '-U', 'flux', '-d', 'flux_studio', '--clean', '--if-exists', '--exit-on-error'])
feed('uploads.tar.gz', ['run', '--rm', '-T', '--no-deps', 'backend', 'sh', '-c', 'find /app/uploads -mindepth 1 -delete && tar xzf - -C /app/uploads'])
feed('redis.tar.gz', ['run', '--rm', '-T', '--no-deps', 'redis', 'sh', '-c', 'find /data -mindepth 1 -delete && tar xzf - -C /data'])
run(['up', '-d', '--wait', '--wait-timeout', '180', 'redis', 'backend', 'frontend'])
console.log(`[restore] 恢复完成：${source}`)
console.log('[restore] 请立即检查 /v1/health、登录、资产下载和任务队列。')
