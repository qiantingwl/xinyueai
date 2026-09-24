import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common'
import { NotificationType, Prisma } from '@prisma/client'
import { createHmac } from 'node:crypto'
import { CredentialCryptoService } from '../providers/credential-crypto.service'
import { PrismaService } from '../prisma/prisma.service'
import { PublicEndpointPolicyService } from '../common/public-endpoint-policy.service'
import { fetchPublicNoRedirect } from '../common/outbound-http'
import { publicUpstreamHealthMessage } from '../providers/upstream-errors'

type RuleInput = { enabled?: boolean; severity?: string; cooldownMinutes?: number; notifyInApp?: boolean; notifyWebhook?: boolean; webhookUrl?: string; webhookSecret?: string }
type Candidate = { fingerprint: string; title: string; message: string; source: string; targetId?: string; metadata?: Record<string, unknown> }

const DEFAULT_RULES = [
  { key: 'provider_unhealthy', name: '上游模型渠道异常', description: '渠道连续失败、健康检查异常或进入冷却时触发。', severity: 'CRITICAL', cooldownMinutes: 15 },
  { key: 'payment_channel_invalid', name: '支付渠道配置异常', description: '启用中的收款渠道配置校验失败时触发。', severity: 'HIGH', cooldownMinutes: 30 },
  { key: 'moderation_backlog', name: '内容审核积压', description: '存在待管理员处置的敏感内容事件时触发。', severity: 'MEDIUM', cooldownMinutes: 60 },
  { key: 'support_urgent', name: '紧急客服工单', description: '存在未关闭的紧急工单时触发。', severity: 'HIGH', cooldownMinutes: 30 },
  { key: 'low_margin', name: '模型毛利异常', description: '最近 24 小时已完成任务出现负毛利或整体毛利率低于 10% 时触发。', severity: 'HIGH', cooldownMinutes: 60 },
  { key: 'byok_attention', name: '用户密钥异常', description: '用户密钥即将到期或处于不可用状态时触发。', severity: 'MEDIUM', cooldownMinutes: 360 },
]

@Injectable()
export class AlertsService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService, private readonly crypto: CredentialCryptoService, private readonly endpointPolicy: PublicEndpointPolicyService) {}

  async onModuleInit() {
    await Promise.all(DEFAULT_RULES.map((rule) => this.prisma.alertRule.upsert({ where: { key: rule.key }, update: {}, create: rule })))
  }

  async listRules() {
    return this.prisma.alertRule.findMany({ orderBy: [{ enabled: 'desc' }, { severity: 'asc' }, { createdAt: 'asc' }], include: { _count: { select: { events: true } } } }).then((rows) => rows.map((row) => ({ ...row, encryptedWebhookSecret: undefined, hasWebhookSecret: Boolean(row.encryptedWebhookSecret) })))
  }

  listEvents(status?: string) {
    return this.prisma.alertEvent.findMany({ where: status ? { status } : undefined, orderBy: [{ status: 'asc' }, { lastSeenAt: 'desc' }], take: 300, include: { rule: { select: { key: true, name: true, severity: true, mutedUntil: true } } } }).then((rows) => rows.map((row) => ({ ...row, message: publicUpstreamHealthMessage(row.message) })))
  }

  async updateRule(id: string, input: RuleInput) {
    const before = await this.prisma.alertRule.findUnique({ where: { id } })
    if (!before) throw new NotFoundException('告警规则不存在')
    if (input.severity && !['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(input.severity)) throw new BadRequestException('告警级别无效')
    if (input.cooldownMinutes !== undefined && (!Number.isInteger(input.cooldownMinutes) || input.cooldownMinutes < 1 || input.cooldownMinutes > 10080)) throw new BadRequestException('静默间隔必须为 1 到 10080 分钟')
    if (input.webhookUrl !== undefined) await this.assertWebhookUrl(input.webhookUrl)
    const data: Prisma.AlertRuleUpdateInput = {
      ...(input.enabled === undefined ? {} : { enabled: input.enabled }),
      ...(input.severity === undefined ? {} : { severity: input.severity }),
      ...(input.cooldownMinutes === undefined ? {} : { cooldownMinutes: input.cooldownMinutes }),
      ...(input.notifyInApp === undefined ? {} : { notifyInApp: input.notifyInApp }),
      ...(input.notifyWebhook === undefined ? {} : { notifyWebhook: input.notifyWebhook }),
      ...(input.webhookUrl === undefined ? {} : { webhookUrl: input.webhookUrl.trim() }),
    }
    if (input.webhookSecret) { data.encryptedWebhookSecret = this.crypto.encrypt(input.webhookSecret); data.webhookSecretHint = this.crypto.hint(input.webhookSecret) }
    else if (input.webhookSecret === '') { data.encryptedWebhookSecret = ''; data.webhookSecretHint = '' }
    return this.prisma.alertRule.update({ where: { id }, data }).then((row) => ({ ...row, encryptedWebhookSecret: undefined, hasWebhookSecret: Boolean(row.encryptedWebhookSecret) }))
  }

  async muteRule(id: string, minutes: number) {
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 43200) throw new BadRequestException('静默时长必须为 1 到 43200 分钟')
    const mutedUntil = new Date(Date.now() + minutes * 60_000)
    // 只把「记录不存在」映射成 404，连接失败等其它异常原样抛出，避免误导排障
    return this.prisma.alertRule.update({ where: { id }, data: { mutedUntil } }).catch((reason) => {
      if (reason instanceof Prisma.PrismaClientKnownRequestError && reason.code === 'P2025') throw new NotFoundException('告警规则不存在')
      throw reason
    })
  }

  async acknowledge(id: string, adminId: string) {
    return this.prisma.alertEvent.updateMany({ where: { id, status: { in: ['OPEN', 'MUTED'] } }, data: { status: 'ACKNOWLEDGED', acknowledgedAt: new Date(), acknowledgedById: adminId } }).then((result) => { if (!result.count) throw new BadRequestException('告警不存在或已经处理'); return { acknowledged: true } })
  }

  async resolve(id: string) {
    return this.prisma.alertEvent.updateMany({ where: { id, status: { not: 'RESOLVED' } }, data: { status: 'RESOLVED', resolvedAt: new Date() } }).then((result) => { if (!result.count) throw new BadRequestException('告警不存在或已经恢复'); return { resolved: true } })
  }

  async evaluate() {
    const rules = await this.prisma.alertRule.findMany({ where: { enabled: true } })
    const active = new Map<string, Candidate[]>()
    const [providers, paymentChannels, moderationOpen, supportUrgent, margin, byokAttention] = await Promise.all([
      this.prisma.providerChannel.findMany({ where: { enabled: true, OR: [{ lastHealthStatus: 'unhealthy' }, { consecutiveFailures: { gte: 3 } }, { cooldownUntil: { gt: new Date() } }] }, select: { id: true, name: true, lastHealthMessage: true, consecutiveFailures: true, cooldownUntil: true } }),
      this.prisma.paymentChannel.findMany({ where: { enabled: true, lastHealthStatus: 'invalid' }, select: { id: true, name: true, providerKey: true, lastError: true } }),
      this.prisma.moderationEvent.count({ where: { status: 'OPEN' } }),
      this.prisma.supportTicket.count({ where: { priority: 'URGENT', status: { notIn: ['RESOLVED', 'CLOSED'] } } }),
      this.prisma.generationJob.aggregate({ where: { status: 'SUCCEEDED', completedAt: { gte: new Date(Date.now() - 86_400_000) } }, _count: { _all: true }, _sum: { revenueMicros: true, upstreamCostMicros: true } }),
      this.prisma.userApiCredential.count({ where: { enabled: true, OR: [{ lastHealthStatus: 'unhealthy' }, { expiresAt: { lte: new Date(Date.now() + 14 * 86_400_000) } }] } }),
    ])
    active.set('provider_unhealthy', providers.map((item) => ({ fingerprint: item.id, title: `模型渠道异常：${item.name}`, message: publicUpstreamHealthMessage(item.lastHealthMessage || '', `连续失败 ${item.consecutiveFailures} 次`), source: 'provider_channel', targetId: item.id, metadata: { consecutiveFailures: item.consecutiveFailures, cooldownUntil: item.cooldownUntil } })))
    active.set('payment_channel_invalid', paymentChannels.map((item) => ({ fingerprint: item.id, title: `支付渠道异常：${item.name}`, message: item.lastError || '渠道配置校验失败', source: 'payment_channel', targetId: item.id, metadata: { providerKey: item.providerKey } })))
    active.set('moderation_backlog', moderationOpen ? [{ fingerprint: 'global', title: '内容审核积压', message: `当前有 ${moderationOpen} 条内容审核事件待处理`, source: 'moderation', metadata: { openCount: moderationOpen } }] : [])
    active.set('support_urgent', supportUrgent ? [{ fingerprint: 'global', title: '存在紧急客服工单', message: `当前有 ${supportUrgent} 个紧急工单未关闭`, source: 'support', metadata: { openCount: supportUrgent } }] : [])
    const revenue = Number(margin._sum.revenueMicros || 0), cost = Number(margin._sum.upstreamCostMicros || 0), marginRate = revenue > 0 ? (revenue - cost) / revenue : 1
    active.set('low_margin', margin._count._all && revenue > 0 && marginRate < 0.1 ? [{ fingerprint: '24h', title: '最近 24 小时模型毛利异常', message: `收入 ¥${(revenue / 1_000_000).toFixed(2)}，成本 ¥${(cost / 1_000_000).toFixed(2)}，毛利率 ${(marginRate * 100).toFixed(2)}%`, source: 'generation_finance', metadata: { jobs: margin._count._all, revenueMicros: revenue, upstreamCostMicros: cost, marginRate } }] : [])
    active.set('byok_attention', byokAttention ? [{ fingerprint: 'global', title: '用户 API 密钥需要处理', message: `当前有 ${byokAttention} 个用户密钥不可用或将在 14 天内到期`, source: 'user_api_credential', metadata: { count: byokAttention } }] : [])
    let raised = 0, resolved = 0
    for (const rule of rules) {
      const candidates = active.get(rule.key) || []
      for (const candidate of candidates) { if (await this.raise(rule, candidate)) raised += 1 }
      const fingerprints = candidates.map((item) => item.fingerprint)
      const stale = await this.prisma.alertEvent.findMany({ where: { ruleId: rule.id, status: { not: 'RESOLVED' }, ...(fingerprints.length ? { fingerprint: { notIn: fingerprints } } : {}) }, select: { id: true } })
      if (stale.length) { await this.prisma.alertEvent.updateMany({ where: { id: { in: stale.map((item) => item.id) } }, data: { status: 'RESOLVED', resolvedAt: new Date() } }); resolved += stale.length }
    }
    return { evaluated: rules.length, raised, resolved, active: [...active.values()].reduce((sum, items) => sum + items.length, 0) }
  }

  private async raise(rule: { id: string; key: string; name: string; enabled: boolean; severity: string; cooldownMinutes: number; notifyInApp: boolean; notifyWebhook: boolean; webhookUrl: string; encryptedWebhookSecret: string; mutedUntil: Date | null }, candidate: Candidate) {
    const existing = await this.prisma.alertEvent.findUnique({ where: { ruleId_fingerprint: { ruleId: rule.id, fingerprint: candidate.fingerprint } } })
    const now = new Date()
    const muted = Boolean(rule.mutedUntil && rule.mutedUntil > now)
    if (existing) {
      await this.prisma.alertEvent.update({ where: { id: existing.id }, data: { status: muted ? 'MUTED' : existing.status === 'RESOLVED' ? 'OPEN' : existing.status, severity: rule.severity, title: candidate.title, message: candidate.message, metadata: candidate.metadata as Prisma.InputJsonValue, lastSeenAt: now, ...(muted ? {} : { resolvedAt: null }) } })
      const reopened = !muted && existing.status === 'RESOLVED'
      const cooldownDue = !muted && existing.status !== 'RESOLVED' && now.getTime() - existing.lastSeenAt.getTime() >= rule.cooldownMinutes * 60_000
      if (reopened) await this.notify(rule, { ...candidate, id: existing.id, severity: rule.severity }, { inApp: true, webhook: true })
      else if (cooldownDue) await this.notify(rule, { ...candidate, id: existing.id, severity: rule.severity }, { inApp: false, webhook: true })
      return reopened || cooldownDue
    }
    const created = await this.prisma.alertEvent.create({ data: { ruleId: rule.id, fingerprint: candidate.fingerprint, status: muted ? 'MUTED' : 'OPEN', severity: rule.severity, title: candidate.title, message: candidate.message, source: candidate.source, targetId: candidate.targetId, metadata: candidate.metadata as Prisma.InputJsonValue } })
    if (!muted) await this.notify(rule, { ...candidate, id: created.id, severity: rule.severity }, { inApp: true, webhook: true })
    return !muted
  }

  private async notify(rule: { id: string; key: string; name: string; severity: string; notifyInApp: boolean; notifyWebhook: boolean; webhookUrl: string; encryptedWebhookSecret: string }, event: Candidate & { id: string; severity: string }, channels: { inApp: boolean; webhook: boolean }) {
    if (channels.inApp && rule.notifyInApp) {
      const admins = await this.prisma.user.findMany({ where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] }, status: 'ACTIVE' }, select: { id: true } })
      if (admins.length) await this.prisma.notification.createMany({ data: admins.map((admin) => ({ userId: admin.id, type: NotificationType.SYSTEM, title: event.title, body: event.message, metadata: { alertEventId: event.id, ruleKey: rule.key, severity: event.severity } as Prisma.InputJsonValue })) })
    }
    if (channels.webhook && rule.notifyWebhook && rule.webhookUrl) {
      const payload = JSON.stringify({ eventId: event.id, rule: rule.key, severity: event.severity, title: event.title, message: event.message, source: event.source, targetId: event.targetId, metadata: event.metadata, occurredAt: new Date().toISOString() })
      const secret = rule.encryptedWebhookSecret ? this.crypto.decrypt(rule.encryptedWebhookSecret) : ''
      const signature = secret ? createHmac('sha256', secret).update(payload).digest('hex') : ''
      try {
        const url = await this.endpointPolicy.assertPublicHttpUrl(rule.webhookUrl)
        await fetchPublicNoRedirect(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(signature ? { 'X-Xinyue-Alert-Signature': signature } : {}) }, body: payload, signal: AbortSignal.timeout(10_000) })
      } catch { /* Alert delivery must not interrupt rule evaluation. */ }
    }
  }

  private async assertWebhookUrl(value: string) {
    if (!value.trim()) return
    try { await this.endpointPolicy.assertPublicHttpUrl(value.trim()) } catch { throw new BadRequestException('Webhook 仅允许公网 HTTP 或 HTTPS 地址') }
  }
}
