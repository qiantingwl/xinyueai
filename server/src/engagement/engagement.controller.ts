import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { IsString, Length } from 'class-validator'
import { createHash } from 'node:crypto'
import { AuthGuard } from '../auth/auth.guard'
import { CurrentUser, AuthenticatedUser } from '../common/request-user'
import { CreditsService } from '../credits/credits.service'
import { PrismaService } from '../prisma/prisma.service'
import { collapseNotifications, notificationAlertKey } from '../notifications/public-notification'

class RedeemDto { @IsString() @Length(4, 64) code!: string }

@Controller()
@UseGuards(AuthGuard)
export class EngagementController {
  constructor(private readonly prisma: PrismaService, private readonly credits: CreditsService) {}
  @Get('notifications') notifications(@CurrentUser() user: AuthenticatedUser) {
    return this.prisma.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 200 }).then((rows) => collapseNotifications(rows).slice(0, 100))
  }
  @Patch('notifications/:id/read') async read(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const row = await this.prisma.notification.findFirst({ where: { id, userId: user.id }, select: { id: true, metadata: true } })
    if (!row) return { read: true }
    const alertEventId = notificationAlertKey(row.metadata)
    if (alertEventId) {
      const siblings = await this.prisma.notification.findMany({ where: { userId: user.id, readAt: null }, select: { id: true, metadata: true } })
      const ids = siblings.filter((item) => notificationAlertKey(item.metadata) === alertEventId).map((item) => item.id)
      if (ids.length) await this.prisma.notification.updateMany({ where: { userId: user.id, id: { in: ids } }, data: { readAt: new Date() } })
      return { read: true }
    }
    await this.prisma.notification.updateMany({ where: { id, userId: user.id }, data: { readAt: new Date() } })
    return { read: true }
  }
  @Post('notifications/read-all') async readAll(@CurrentUser() user: AuthenticatedUser) { await this.prisma.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } }); return { read: true } }
  @Post('credits/redeem') async redeem(@CurrentUser() user: AuthenticatedUser, @Body() body: RedeemDto) {
    const codeHash = createHash('sha256').update(body.code.trim().toUpperCase()).digest('hex')
    // The row lock makes usedCount the gate: concurrent redeemers of the same
    // code serialize here, so maxUses cannot be overshot.
    return this.prisma.$transaction(async (tx) => {
      const found = await tx.redemptionCode.findUnique({ where: { codeHash }, select: { id: true } })
      if (!found) return { redeemed: false, reason: 'INVALID_CODE' as const }
      await tx.$queryRaw`SELECT id FROM "RedemptionCode" WHERE id = ${found.id} FOR UPDATE`
      const redemption = await tx.redemptionCode.findUniqueOrThrow({ where: { id: found.id } })
      if (redemption.disabledAt || redemption.expiresAt && redemption.expiresAt < new Date()) return { redeemed: false, reason: 'INVALID_CODE' as const }
      const idempotencyKey = `redeem:${redemption.id}:${user.id}`
      const already = await tx.creditLedger.findUnique({ where: { idempotencyKey }, select: { id: true } })
      if (already) return { redeemed: false, reason: 'ALREADY_REDEEMED' as const }
      if (redemption.usedCount >= redemption.maxUses) return { redeemed: false, reason: 'INVALID_CODE' as const }
      await this.credits.mutateInTransaction(tx, user.id, redemption.credits, 'REDEEM', '兑换码充值', idempotencyKey, { type: 'redemption', id: redemption.id })
      await tx.redemptionCode.update({ where: { id: redemption.id }, data: { usedCount: { increment: 1 } } })
      return { redeemed: true as const, credits: redemption.credits }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
  }
}
