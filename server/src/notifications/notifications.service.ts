import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common'
import { NotificationChannel, NotificationDelivery, NotificationDeliveryStatus, NotificationType, Prisma } from '@prisma/client'
import { createHmac } from 'node:crypto'
import { EmailService } from '../auth/email.service'
import { CredentialCryptoService } from '../providers/credential-crypto.service'
import { PrismaService } from '../prisma/prisma.service'
import { PublicEndpointPolicyService } from '../common/public-endpoint-policy.service'
import { fetchPublicNoRedirect } from '../common/outbound-http'
import { asJsonRecord } from '../common/json-record'

type TemplateInput = {
  key: string
  name: string
  description?: string
  titleTemplate: string
  bodyTemplate: string
  channels: NotificationChannel[]
  enabled?: boolean
  webhookUrl?: string
  webhookSecret?: string
}

type SendInput = {
  templateKey: string
  userIds: string[]
  variables?: Record<string, string | number | boolean | null | undefined>
  metadata?: Record<string, unknown>
}

const DEFAULT_TEMPLATES: Array<Omit<TemplateInput, 'webhookSecret'>> = [
  { key: 'announcement', name: '平台公告', description: '管理员向用户或用户组发送的平台公告。', titleTemplate: '{{title}}', bodyTemplate: '{{body}}', channels: [NotificationChannel.IN_APP], enabled: true },
  { key: 'team_invitation', name: '团队邀请', description: '用户收到团队邀请时发送。', titleTemplate: '团队邀请：{{teamName}}', bodyTemplate: '{{inviterName}} 邀请你加入团队 {{teamName}}。', channels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL], enabled: true },
  { key: 'refund_completed', name: '退款完成', description: '支付退款处理完成后发送。', titleTemplate: '退款处理完成', bodyTemplate: '退款 {{amount}} 已处理。', channels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL], enabled: true },
  { key: 'admin_alert', name: '运营告警', description: '向管理员发送渠道、支付、审核等运营告警。', titleTemplate: '{{title}}', bodyTemplate: '{{message}}', channels: [NotificationChannel.IN_APP], enabled: true },
]

@Injectable()
export class NotificationsService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService, private readonly email: EmailService, private readonly crypto: CredentialCryptoService, private readonly endpointPolicy: PublicEndpointPolicyService) {}

  async onModuleInit() {
    await Promise.all(DEFAULT_TEMPLATES.map((template) => this.prisma.notificationTemplate.upsert({
      where: { key: template.key },
      update: {},
      create: template,
    })))
  }

  listTemplates() {
    return this.prisma.notificationTemplate.findMany({ orderBy: [{ enabled: 'desc' }, { createdAt: 'asc' }] }).then((rows) => rows.map((row) => this.publicTemplate(row)))
  }

  async saveTemplate(id: string | undefined, input: TemplateInput) {
    const data = await this.templateData(input)
    const secret = input.webhookSecret?.trim()
    if (secret) Object.assign(data, { encryptedWebhookSecret: this.crypto.encrypt(secret), webhookSecretHint: this.crypto.hint(secret) })
    else if (input.webhookSecret === '') Object.assign(data, { encryptedWebhookSecret: '', webhookSecretHint: '' })
    const row = id
      ? await this.prisma.notificationTemplate.update({ where: { id }, data }).catch(() => { throw new NotFoundException('通知模板不存在') })
      : await this.prisma.notificationTemplate.create({ data: data as Prisma.NotificationTemplateCreateInput })
    return this.publicTemplate(row)
  }

  async removeTemplate(id: string) {
    const row = await this.prisma.notificationTemplate.findUnique({ where: { id }, select: { key: true } })
    if (!row) throw new NotFoundException('通知模板不存在')
    if (DEFAULT_TEMPLATES.some((item) => item.key === row.key)) throw new BadRequestException('系统模板只能停用，不能删除')
    await this.prisma.notificationTemplate.delete({ where: { id } })
    return { deleted: true }
  }

  listDeliveries(status?: NotificationDeliveryStatus) {
    return this.prisma.notificationDelivery.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 300,
      include: { user: { select: { id: true, email: true, displayName: true } } },
    })
  }

  async send(input: SendInput) {
    const template = await this.prisma.notificationTemplate.findUnique({ where: { key: input.templateKey } })
    if (!template?.enabled) return { queued: 0, sent: 0, failed: 0, skipped: input.userIds.length }
    const title = this.render(template.titleTemplate, input.variables || {}).slice(0, 300)
    const body = this.render(template.bodyTemplate, input.variables || {}).slice(0, 20_000)
    return this.sendCustomToUsers(input.userIds, title, body, template.channels, { ...(input.metadata || {}), templateKey: template.key }, template)
  }

  async sendCustomToUsers(userIds: string[], title: string, body: string, channels: NotificationChannel[] = [NotificationChannel.IN_APP], metadata: Record<string, unknown> = {}, template?: { key: string; webhookUrl: string; encryptedWebhookSecret: string }) {
    const ids = [...new Set(userIds)].slice(0, 100_000)
    // 用户分片查询 + 投递记录并发分批插入：一次广播可能覆盖十万用户，
    // 单条巨型 IN 查询和串行逐条 INSERT 都会拖垮请求和连接池。
    const firstBatch = await this.prisma.user.findMany({
      where: { id: { in: ids.slice(0, 1000) }, status: 'ACTIVE' },
      select: { id: true, email: true, settings: { select: { notifications: true } } },
    })
    const users = [...firstBatch]
    for (let offset = 1000; offset < ids.length; offset += 1000) {
      const batch = await this.prisma.user.findMany({
        where: { id: { in: ids.slice(offset, offset + 1000) }, status: 'ACTIVE' },
        select: { id: true, email: true, settings: { select: { notifications: true } } },
      })
      users.push(...batch)
    }
    const templateKey = template?.key || String(metadata.templateKey || 'custom')
    const uniqueChannels = [...new Set(channels)]
    const recipients = users.flatMap((user) => uniqueChannels.map((channel) => ({ user, channel })))
    const deliveries: NotificationDelivery[] = []
    for (let offset = 0; offset < recipients.length; offset += 100) {
      const created = await Promise.all(recipients.slice(offset, offset + 100).map(({ user, channel }) => {
        const recipient = channel === NotificationChannel.EMAIL ? user.email || '' : channel === NotificationChannel.WEBHOOK ? template?.webhookUrl || '' : user.id
        const skipped = user.settings?.notifications === false || !recipient
        return this.prisma.notificationDelivery.create({ data: {
          templateKey, userId: user.id, channel, recipient, title, body,
          metadata: metadata as Prisma.InputJsonValue,
          status: skipped ? NotificationDeliveryStatus.SKIPPED : NotificationDeliveryStatus.PENDING,
          lastError: skipped ? user.settings?.notifications === false ? '用户已关闭通知' : '缺少投递地址' : '',
        } })
      }))
      deliveries.push(...created)
    }
    let sent = 0, failed = 0, skipped = deliveries.filter((item) => item.status === NotificationDeliveryStatus.SKIPPED).length
    for (let offset = 0; offset < deliveries.length; offset += 20) {
      const batch = deliveries.slice(offset, offset + 20).filter((item) => item.status === NotificationDeliveryStatus.PENDING)
      const results = await Promise.all(batch.map((delivery) => this.deliver(delivery, template?.encryptedWebhookSecret || '')))
      sent += results.filter((item) => item === NotificationDeliveryStatus.SENT).length
      failed += results.filter((item) => item === NotificationDeliveryStatus.FAILED).length
    }
    return { queued: deliveries.length, sent, failed, skipped }
  }

  async retry(id: string) {
    const delivery = await this.prisma.notificationDelivery.findUnique({ where: { id } })
    if (!delivery) throw new NotFoundException('投递记录不存在')
    if (delivery.status === NotificationDeliveryStatus.SENT) throw new BadRequestException('通知已经发送成功')
    if (delivery.attempts >= 5) throw new BadRequestException('通知已达到最大重试次数')
    const template = await this.prisma.notificationTemplate.findUnique({ where: { key: delivery.templateKey }, select: { encryptedWebhookSecret: true } })
    const status = await this.deliver(delivery, template?.encryptedWebhookSecret || '')
    return this.prisma.notificationDelivery.findUnique({ where: { id }, include: { user: { select: { id: true, email: true, displayName: true } } } }).then((row) => ({ ...row, retried: true, status }))
  }

  private async deliver(delivery: NotificationDelivery, encryptedWebhookSecret: string) {
    try {
      if (delivery.channel === NotificationChannel.IN_APP) {
        if (!delivery.userId) throw new Error('缺少用户')
        await this.prisma.notification.create({ data: { userId: delivery.userId, type: NotificationType.SYSTEM, title: delivery.title, body: delivery.body, metadata: { ...(asJsonRecord(delivery.metadata)), deliveryId: delivery.id } as Prisma.InputJsonValue } })
      } else if (delivery.channel === NotificationChannel.EMAIL) {
        if (!await this.email.sendNotification(delivery.recipient, delivery.title, delivery.body)) throw new Error('SMTP 未启用或配置不完整')
      } else {
        const payload = JSON.stringify({ id: delivery.id, type: delivery.templateKey, title: delivery.title, body: delivery.body, metadata: delivery.metadata, occurredAt: delivery.createdAt.toISOString() })
        const secret = encryptedWebhookSecret ? this.crypto.decrypt(encryptedWebhookSecret) : ''
        const signature = secret ? createHmac('sha256', secret).update(payload).digest('hex') : ''
        const url = await this.endpointPolicy.assertPublicHttpUrl(delivery.recipient)
        const response = await fetchPublicNoRedirect(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(signature ? { 'X-Xinyue-Signature': `sha256=${signature}` } : {}) }, body: payload, signal: AbortSignal.timeout(10_000) })
        if (!response.ok) throw new Error(`Webhook 返回 HTTP ${response.status}`)
      }
      await this.prisma.notificationDelivery.update({ where: { id: delivery.id }, data: { status: NotificationDeliveryStatus.SENT, attempts: { increment: 1 }, sentAt: new Date(), lastError: '' } })
      return NotificationDeliveryStatus.SENT
    } catch (reason) {
      await this.prisma.notificationDelivery.update({ where: { id: delivery.id }, data: { status: NotificationDeliveryStatus.FAILED, attempts: { increment: 1 }, lastError: (reason instanceof Error ? reason.message : '投递失败').slice(0, 1000) } })
      return NotificationDeliveryStatus.FAILED
    }
  }

  private async templateData(input: TemplateInput): Promise<Prisma.NotificationTemplateUpdateInput> {
    const key = input.key.trim().toLowerCase()
    if (!/^[a-z][a-z0-9_.-]{1,63}$/.test(key)) throw new BadRequestException('模板标识格式不正确')
    const channels = [...new Set(input.channels)]
    if (!channels.length) throw new BadRequestException('至少选择一种通知渠道')
    if (channels.includes(NotificationChannel.WEBHOOK)) await this.assertWebhookUrl(input.webhookUrl || '')
    return {
      key, name: input.name.trim(), description: input.description?.trim() || '',
      titleTemplate: input.titleTemplate.trim(), bodyTemplate: input.bodyTemplate.trim(), channels,
      enabled: input.enabled ?? true, webhookUrl: input.webhookUrl?.trim() || '',
    }
  }

  private render(template: string, variables: Record<string, string | number | boolean | null | undefined>) {
    return template.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, key: string) => variables[key] === null || variables[key] === undefined ? '' : String(variables[key]))
  }

  private async assertWebhookUrl(value: string) {
    try { await this.endpointPolicy.assertPublicHttpUrl(value) } catch { throw new BadRequestException('Webhook 仅允许公网 HTTP 或 HTTPS 地址') }
  }

  private publicTemplate<T extends { encryptedWebhookSecret: string }>(row: T) { return { ...row, encryptedWebhookSecret: undefined, hasWebhookSecret: Boolean(row.encryptedWebhookSecret) } }
}
