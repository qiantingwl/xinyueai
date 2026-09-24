/**
 * 轮换 SUB2API 渠道（ProviderChannel）的 API key。
 * 用法: NEW_API_KEY=sk-xxx [NEW_BASE_URL=https://example.com/v1] node scripts/rotate-sub2api-key.cjs
 * 不在日志中打印完整 key，仅显示前 6 / 后 6 位。
 */
const path = require('node:path')
const { createRequire } = require('node:module')
const { createCipheriv, createDecipheriv, createHash, randomBytes } = require('node:crypto')

const serverDir = path.join(__dirname, '..', 'server')
const serverRequire = createRequire(path.join(serverDir, 'package.json'))
const dotenv = serverRequire('dotenv')
dotenv.config({ path: path.join(serverDir, '.env') })

const source = process.env.CREDENTIAL_ENCRYPTION_KEY || process.env.SESSION_SECRET
if (!source) throw new Error('缺少 CREDENTIAL_ENCRYPTION_KEY / SESSION_SECRET')
const key = createHash('sha256').update(source).digest()

function encrypt(value) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(value.trim(), 'utf8'), cipher.final()])
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.')
}
function decrypt(payload) {
  if (!payload) return ''
  const [version, iv, tag, data] = payload.split('.')
  if (version !== 'v1') return '<无法解析>'
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'))
  decipher.setAuthTag(Buffer.from(tag, 'base64url'))
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8')
}
const mask = (v) => (v ? `${v.slice(0, 6)}…${v.slice(-6)}` : '(空)')
const hint = (v) => (v.startsWith('sk-') ? `sk-••••${v.slice(-4)}` : `••••${v.slice(-4)}`)

async function main() {
  const newKey = (process.env.NEW_API_KEY || '').trim()
  if (!newKey) throw new Error('请通过 NEW_API_KEY 环境变量传入新 key')

  const { PrismaClient } = serverRequire('@prisma/client')
  const prisma = new PrismaClient()
  try {
    const channels = await prisma.providerChannel.findMany({
      where: { OR: [{ type: 'SUB2API' }, { name: { contains: 'SUB2API', mode: 'insensitive' } }] },
    })
    if (!channels.length) throw new Error('未找到 SUB2API 渠道')
    for (const ch of channels) {
      let current = ''
      try { current = decrypt(ch.encryptedApiKey) } catch { current = '<解密失败>' }
      console.log(`渠道: id=${ch.id} name=${ch.name} type=${ch.type} enabled=${ch.enabled}`)
      console.log(`  baseUrl=${ch.baseUrl}`)
      console.log(`  当前 key: ${mask(current)} (hint=${ch.apiKeyHint})`)
      console.log(`  健康状态: ${ch.lastHealthStatus} / ${ch.lastHealthMessage} / cooldownUntil=${ch.cooldownUntil}`)
    }

    const target = channels.find((c) => c.type === 'SUB2API') || channels[0]
    const desiredBase = (process.env.NEW_BASE_URL || '').trim().replace(/\/+$/, '') || target.baseUrl
    const baseUrlChanged = target.baseUrl !== desiredBase
    await prisma.providerChannel.update({
      where: { id: target.id },
      data: {
        encryptedApiKey: encrypt(newKey),
        apiKeyHint: hint(newKey),
        ...(baseUrlChanged ? { baseUrl: desiredBase } : {}),
        lastHealthStatus: null,
        lastHealthMessage: '密钥已轮换，等待重新检测',
        cooldownUntil: null,
        consecutiveFailures: 0,
        lastRotatedAt: new Date(),
      },
    })
    console.log(`已更新渠道 ${target.name} (${target.id}):`)
    console.log(`  新 key: ${mask(newKey)} (hint=${hint(newKey)})`)
    console.log(`  baseUrl: ${target.baseUrl} -> ${desiredBase}${baseUrlChanged ? ' (已变更)' : ' (未变更)'}`)

    // 验证可解密
    const after = await prisma.providerChannel.findUniqueOrThrow({ where: { id: target.id } })
    const roundtrip = decrypt(after.encryptedApiKey)
    console.log(`  回读解密验证: ${roundtrip === newKey ? 'OK' : 'MISMATCH'} (${mask(roundtrip)})`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((err) => { console.error(err.message); process.exit(1) })
