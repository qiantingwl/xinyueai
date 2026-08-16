import { PrismaClient } from '@prisma/client'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { writeRuntimeEnv } from '../config/runtime-env'

export async function withDatabase<T>(databaseUrl: string, operation: (client: PrismaClient) => Promise<T>) {
  const client = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
  try {
    await client.$connect()
    return await operation(client)
  } finally {
    await client.$disconnect().catch(() => undefined)
  }
}

export function testDatabase(databaseUrl: string) {
  return withDatabase(databaseUrl, async (client) => {
    await client.$queryRawUnsafe('SELECT 1')
    return true
  })
}

export function deployMigrations(databaseUrl: string) {
  const cli = resolve(process.cwd(), 'node_modules', 'prisma', 'build', 'index.js')
  const schema = resolve(process.cwd(), 'prisma', 'schema.prisma')
  return new Promise<void>((resolvePromise, reject) => {
    const child = spawn(process.execPath, [cli, 'migrate', 'deploy', '--schema', schema], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    let errorOutput = ''
    child.stderr.on('data', (chunk) => { errorOutput = `${errorOutput}${chunk}`.slice(-4000) })
    child.once('error', reject)
    child.once('exit', (code) => code === 0 ? resolvePromise() : reject(new Error(errorOutput.trim() || `数据库迁移失败 (${code ?? 'unknown'})`)))
  })
}

export async function installationBootstrapMode() {
  const databaseUrl = process.env.DATABASE_URL?.trim()
  if (!databaseUrl) return process.env.INSTALL_COMPLETED === 'true' ? 'maintenance' as const : 'install' as const
  try {
    await testDatabase(databaseUrl)
    await deployMigrations(databaseUrl)
    const adminCount = await withDatabase(databaseUrl, (client) => client.user.count({ where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] }, status: 'ACTIVE' } }))
    if (adminCount > 0) {
      process.env.INSTALL_COMPLETED = 'true'
      try { writeRuntimeEnv({ INSTALL_COMPLETED: 'true' }) } catch { /* Read-only deployments configure this externally. */ }
      return 'application' as const
    }
    return process.env.INSTALL_COMPLETED === 'true' ? 'maintenance' as const : 'install' as const
  } catch (error) {
    console.warn(`[install] ${error instanceof Error ? error.message : '数据库尚未准备完成'}`)
    return process.env.INSTALL_COMPLETED === 'true' ? 'maintenance' as const : 'install' as const
  }
}
