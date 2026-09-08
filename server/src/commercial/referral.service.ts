import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { ConfigService } from '@nestjs/config'
import { NotificationType, Prisma, ReferralStatus } from '@prisma/client'
import { Queue } from 'bullmq'
import { createHash, randomBytes } from 'node:crypto'
import { CreditsService } from '../credits/credits.service'
import { PrismaService } from '../prisma/prisma.service'

type RegistrationMeta = { ip?: string; userAgent?: string }

@Injectable()
export class ReferralService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly credits: CreditsService,
    private readonly config: ConfigService,
    @InjectQueue('commercial-lifecycle') private readonly queue: Queue,
  ) {}

  async onModuleInit() {
    await this.queue.upsertJobScheduler('commercial-referral-due-scan', { every: 15 * 60_000 }, {
      name: 'scan-referrals', data: {}, opts: { removeOnComplete: 20, removeOnFail: 100 },
    })
  }

  async summary(userId: string) {
    const code = await this.getOrCreateCode(userId)
    const [invited, rewarded, pending, reviewRequired] = await Promise.all([
      this.prisma.invitation.count({ where: { inviterId: userId } }),
      this.prisma.invitation.aggregate({ where: { inviterId: userId, status: ReferralStatus.REWARDED }, _sum: { reward: true } }),
      this.prisma.invitation.count({ where: { inviterId: userId, status: { in: [ReferralStatus.COOLING, ReferralStatus.APPROVED] } } }),
      this.prisma.invitation.count({ where: { inviterId: userId, status: ReferralStatus.REVIEW_REQUIRED } }),
    ])
    const origin = process.env.WEB_ORIGIN?.split(',')[0]?.trim().replace(/\/$/, '') || 'http://localhost:6001'
    return { code: code.code, url: `${origin}/login?register=1&invite=${code.code}`, invited, reward: rewarded._sum.reward || 0, pending, reviewRequired }
  }

  async attributeRegistration(inviteeId: string, rawCode: string | undefined, meta: RegistrationMeta) {
    const code = rawCode?.trim().toUpperCase()
    if (!code) return null
    const source = await this.prisma.referralCode.findFirst({ where: { code, enabled: true } })
    if (!source || source.userId === inviteeId) return null
    const inviterSession = meta.ip ? await this.prisma.session.findFirst({
      where: { userId: source.userId, ipAddress: meta.ip },
      orderBy: { createdAt: 'desc' },
      select: { ipAddress: true, userAgent: true },
    }) : null
    const riskFlags = [
      ...(meta.ip && inviterSession?.ipAddress === meta.ip ? ['SAME_IP'] : []),
      ...(meta.ip && meta.userAgent && inviterSession?.ipAddress === meta.ip && inviterSession.userAgent === meta.userAgent ? ['SAME_DEVICE'] : []),
    ]
    return this.prisma.invitation.create({
      data: {
        inviterId: source.userId,
        inviteeId,
        code,
        registrationIpHash: this.fingerprint(meta.ip),
        registrationAgentHash: this.fingerprint(meta.userAgent),
        riskFlags: riskFlags as Prisma.InputJsonValue,
      },
    }).catch((error) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return null
      throw error
    })
  }

  async onPaymentCompleted(transactionId: string) {
    const transaction = await this.prisma.paymentTransaction.findUnique({ where: { id: transactionId } })
    if (!transaction || transaction.status !== 'COMPLETED') return null
    const [settings, invitation] = await Promise.all([
      this.settings(),
      this.prisma.invitation.findUnique({ where: { inviteeId: transaction.userId } }),
    ])
    if (!settings.referralEnabled || !settings.inviteRewardCredits || !invitation || invitation.status !== ReferralStatus.REGISTERED) return invitation
    const firstPaid = await this.prisma.paymentTransaction.findFirst({
      where: { userId: transaction.userId, status: { in: ['COMPLETED', 'REFUNDED'] } },
      orderBy: [{ completedAt: 'asc' }, { createdAt: 'asc' }],
      select: { id: true },
    })
    if (firstPaid?.id !== transaction.id) return this.rejectUnqualified(invitation.id, '邀请用户的首笔有效支付早于当前交易')
    if (transaction.amountCents < settings.referralMinimumPaidCents) {
      return this.rejectUnqualified(invitation.id, `首笔支付未达到 ${settings.referralMinimumPaidCents} 分门槛`)
    }
    const flags = this.flags(invitation.riskFlags)
    const payableAt = new Date(Date.now() + settings.referralCoolingDays * 86_400_000)
    const status = flags.length || !settings.referralAutoApprove ? ReferralStatus.REVIEW_REQUIRED : ReferralStatus.COOLING
    const updated = await this.prisma.invitation.updateMany({
      where: { id: invitation.id, status: ReferralStatus.REGISTERED, qualifyingTransactionId: null },
      data: {
        status,
        qualifyingTransactionId: transaction.id,
        qualifiedAmountCents: transaction.amountCents,
        reward: settings.inviteRewardCredits,
        payableAt,
        reviewReason: flags.length ? `风险标记：${flags.join('、')}` : status === ReferralStatus.REVIEW_REQUIRED ? '等待管理员审核' : '',
      },
    })
    if (!updated.count) return this.prisma.invitation.findUnique({ where: { id: invitation.id } })
    await this.prisma.notification.create({ data: { userId: invitation.inviterId, type: NotificationType.INVITE, title: '邀请已完成首笔支付', body: status === ReferralStatus.COOLING ? `奖励将在 ${payableAt.toLocaleString('zh-CN')} 后发放` : '该笔邀请奖励正在等待审核', metadata: { invitationId: invitation.id, transactionId } as Prisma.InputJsonValue } })
    return this.prisma.invitation.findUnique({ where: { id: invitation.id } })
  }

  async handleRefund(transactionId: string, totalRefundedCents: number) {
    const [invitation, transaction, settings] = await Promise.all([
      this.prisma.invitation.findUnique({ where: { qualifyingTransactionId: transactionId } }),
      this.prisma.paymentTransaction.findUnique({ where: { id: transactionId }, select: { amountCents: true } }),
      this.settings(),
    ])
    if (!invitation || !transaction || transaction.amountCents - totalRefundedCents >= settings.referralMinimumPaidCents) return invitation
    if (invitation.status !== ReferralStatus.REWARDED) {
      return this.prisma.invitation.update({ where: { id: invitation.id }, data: { status: ReferralStatus.REVERSED, reversedAt: new Date(), reviewReason: '有效支付退款后低于邀请奖励门槛' } })
    }
    try {
      await this.credits.mutate(invitation.inviterId, -invitation.reward, 'ADJUST', '邀请订单退款冲正', `referral:${invitation.id}:reversal`, { type: 'invitation', id: invitation.id })
      return this.prisma.invitation.update({ where: { id: invitation.id }, data: { status: ReferralStatus.REVERSED, reversedAt: new Date(), reviewReason: '邀请订单退款，奖励已冲正' } })
    } catch {
      const flags = [...new Set([...this.flags(invitation.riskFlags), 'REWARD_BALANCE_INSUFFICIENT'])]
      return this.prisma.invitation.update({ where: { id: invitation.id }, data: { status: ReferralStatus.REVIEW_REQUIRED, reviewReason: '邀请奖励已被使用，退款冲正需要人工处理', riskFlags: flags as Prisma.InputJsonValue } })
    }
  }

  list(status?: ReferralStatus) {
    return this.prisma.invitation.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' }, take: 500,
      include: {
        inviter: { select: { id: true, displayName: true, email: true, username: true, creditAccount: { select: { balance: true } } } },
        invitee: { select: { id: true, displayName: true, email: true, username: true, createdAt: true } },
        qualifyingTransaction: { select: { id: true, outTradeNo: true, orderType: true, amountCents: true, status: true, completedAt: true } },
      },
    })
  }

  async approve(id: string, actorId: string, releaseNow = false) {
    const invitation = await this.prisma.invitation.findUnique({ where: { id } })
    if (!invitation) throw new NotFoundException('邀请记录不存在')
    if (!([ReferralStatus.REVIEW_REQUIRED, ReferralStatus.COOLING, ReferralStatus.APPROVED] as ReferralStatus[]).includes(invitation.status)) throw new BadRequestException('当前邀请状态不能审核通过')
    const payableAt = releaseNow ? new Date() : invitation.payableAt || new Date()
    await this.prisma.invitation.update({ where: { id }, data: { status: ReferralStatus.APPROVED, reviewedAt: new Date(), reviewedById: actorId, reviewReason: '', payableAt } })
    return payableAt <= new Date() ? this.payout(id, releaseNow) : this.prisma.invitation.findUniqueOrThrow({ where: { id } })
  }

  async reject(id: string, actorId: string, reason: string) {
    const result = await this.prisma.invitation.updateMany({
      where: { id, status: { in: [ReferralStatus.REGISTERED, ReferralStatus.COOLING, ReferralStatus.REVIEW_REQUIRED, ReferralStatus.APPROVED] } },
      data: { status: ReferralStatus.REJECTED, reviewedAt: new Date(), reviewedById: actorId, reviewReason: reason.trim() },
    })
    if (!result.count) throw new BadRequestException('当前邀请状态不能拒绝')
    return this.prisma.invitation.findUniqueOrThrow({ where: { id } })
  }

  async processDue() {
    const due = await this.prisma.invitation.findMany({
      where: { status: { in: [ReferralStatus.COOLING, ReferralStatus.APPROVED] }, payableAt: { lte: new Date() } },
      orderBy: { payableAt: 'asc' }, take: 100, select: { id: true },
    })
    const results = await Promise.allSettled(due.map((item) => this.payout(item.id)))
    return { attempted: due.length, completed: results.filter((item) => item.status === 'fulfilled').length }
  }

  private async payout(id: string, bypassMonthlyLimit = false) {
    const invitation = await this.prisma.invitation.findUnique({ where: { id } })
    if (!invitation) throw new NotFoundException('邀请记录不存在')
    if (invitation.status === ReferralStatus.REWARDED) return invitation
    if (!([ReferralStatus.COOLING, ReferralStatus.APPROVED] as ReferralStatus[]).includes(invitation.status) || !invitation.payableAt || invitation.payableAt > new Date()) throw new BadRequestException('邀请奖励尚未到发放时间')
    const settings = await this.settings()
    if (!settings.referralEnabled || invitation.reward <= 0) return this.rejectUnqualified(id, '邀请奖励已关闭')
    const monthStart = new Date(); monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0)
    const monthlyRewarded = await this.prisma.invitation.count({ where: { inviterId: invitation.inviterId, status: ReferralStatus.REWARDED, rewardedAt: { gte: monthStart } } })
    if (!bypassMonthlyLimit && settings.referralMonthlyRewardLimit > 0 && monthlyRewarded >= settings.referralMonthlyRewardLimit) {
      return this.prisma.invitation.update({ where: { id }, data: { status: ReferralStatus.REVIEW_REQUIRED, reviewReason: `本月已达到 ${settings.referralMonthlyRewardLimit} 笔自动奖励上限` } })
    }
    await this.credits.mutate(invitation.inviterId, invitation.reward, 'INVITE', '邀请用户首单奖励', `referral:${id}:reward`, { type: 'invitation', id })
    const updated = await this.prisma.invitation.updateMany({ where: { id, status: { in: [ReferralStatus.COOLING, ReferralStatus.APPROVED] }, rewardedAt: null }, data: { status: ReferralStatus.REWARDED, rewardedAt: new Date(), reviewReason: '' } })
    if (updated.count) await this.prisma.notification.create({ data: { userId: invitation.inviterId, type: NotificationType.INVITE, title: '邀请奖励已到账', body: `${invitation.reward} 创作点已发放到你的账户`, metadata: { invitationId: id } as Prisma.InputJsonValue } })
    return this.prisma.invitation.findUniqueOrThrow({ where: { id } })
  }

  private async getOrCreateCode(userId: string) {
    const existing = await this.prisma.referralCode.findUnique({ where: { userId } })
    if (existing) return existing
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        return await this.prisma.referralCode.create({ data: { userId, code: randomBytes(6).toString('base64url').toUpperCase() } })
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error
        const concurrent = await this.prisma.referralCode.findUnique({ where: { userId } })
        if (concurrent) return concurrent
      }
    }
    throw new BadRequestException('邀请码生成失败，请稍后重试')
  }

  private rejectUnqualified(id: string, reason: string) {
    return this.prisma.invitation.update({ where: { id }, data: { status: ReferralStatus.REJECTED, reviewReason: reason } })
  }

  private settings() {
    return this.prisma.systemSetting.upsert({ where: { id: 'global' }, update: {}, create: { id: 'global' } })
  }

  private flags(value: Prisma.JsonValue | null | undefined) {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
  }

  private fingerprint(value?: string) {
    if (!value) return ''
    const secret = this.config.get<string>('SESSION_SECRET') || 'xinyue-referral'
    return createHash('sha256').update(`${secret}:${value}`).digest('hex')
  }
}
