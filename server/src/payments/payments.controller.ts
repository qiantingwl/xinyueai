import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Query, RawBodyRequest, Req, UseGuards } from '@nestjs/common'
import { IsArray, IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator'
import { FastifyRequest } from 'fastify'
import { Prisma } from '@prisma/client'
import { AdminGuard } from '../admin/admin.guard'
import { AuthGuard } from '../auth/auth.guard'
import { AuthenticatedUser, CurrentUser } from '../common/request-user'
import { PrismaService } from '../prisma/prisma.service'
import { PAYMENT_METHODS, PAYMENT_PROVIDERS, type PaymentMethod } from './payment.constants'
import { PaymentsService } from './payments.service'
import { Public } from '../auth/public.decorator'

class CheckoutDto { @IsIn(['SUBSCRIPTION', 'RECHARGE']) orderType!: 'SUBSCRIPTION' | 'RECHARGE'; @IsString() orderId!: string; @IsOptional() @IsString() channelId?: string; @IsIn(PAYMENT_METHODS) paymentMethod!: PaymentMethod }
class ChannelDto {
  @IsString() @MinLength(1) @MaxLength(100) name!: string
  @IsIn(PAYMENT_PROVIDERS) providerKey!: typeof PAYMENT_PROVIDERS[number]
  @IsOptional() @IsBoolean() enabled?: boolean
  @IsOptional() @IsBoolean() isDefault?: boolean
  @IsArray() @IsIn(PAYMENT_METHODS, { each: true }) supportedMethods!: PaymentMethod[]
  @IsOptional() @IsInt() @Min(1) @Max(100000000) minAmountCents?: number
  @IsOptional() @IsInt() @Min(1) @Max(100000000) maxAmountCents?: number | null
  @IsOptional() @IsInt() @Min(1) @Max(1000000000) dailyLimitCents?: number | null
  @IsOptional() @IsInt() @Min(0) @Max(10000) feeRateBps?: number
  @IsOptional() @IsInt() @Min(-10000) @Max(10000) sortOrder?: number
  @IsOptional() @IsObject() publicConfig?: Record<string, unknown>
  @IsOptional() @IsObject() secrets?: Record<string, string>
}
class UpdateChannelDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) name?: string
  @IsOptional() @IsIn(PAYMENT_PROVIDERS) providerKey?: typeof PAYMENT_PROVIDERS[number]
  @IsOptional() @IsBoolean() enabled?: boolean
  @IsOptional() @IsBoolean() isDefault?: boolean
  @IsOptional() @IsArray() @IsIn(PAYMENT_METHODS, { each: true }) supportedMethods?: PaymentMethod[]
  @IsOptional() @IsInt() @Min(1) @Max(100000000) minAmountCents?: number
  @IsOptional() @IsInt() @Min(1) @Max(100000000) maxAmountCents?: number | null
  @IsOptional() @IsInt() @Min(1) @Max(1000000000) dailyLimitCents?: number | null
  @IsOptional() @IsInt() @Min(0) @Max(10000) feeRateBps?: number
  @IsOptional() @IsInt() @Min(-10000) @Max(10000) sortOrder?: number
  @IsOptional() @IsObject() publicConfig?: Record<string, unknown>
  @IsOptional() @IsObject() secrets?: Record<string, string>
}
class RefundDto {
  @IsInt() @Min(1) @Max(100000000) amountCents!: number
  @IsString() @MinLength(2) @MaxLength(500) reason!: string
  @IsOptional() @IsBoolean() manualConfirmed?: boolean
}
class ProcessRefundDto { @IsOptional() @IsBoolean() manualConfirmed?: boolean }
class RejectRefundDto { @IsString() @MinLength(2) @MaxLength(500) reason!: string }

@Public()
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}
  @Get('methods') @UseGuards(AuthGuard) methods() { return this.payments.methods() }
  @Post('checkout') @UseGuards(AuthGuard) checkout(@CurrentUser() user: AuthenticatedUser, @Req() request: FastifyRequest, @Body() body: CheckoutDto) { return this.payments.checkout(user.id, body, `${request.protocol}://${request.hostname}`) }
  @Get('transactions/:id') @UseGuards(AuthGuard) transaction(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.payments.getTransaction(user.id, id) }
  @Post('webhooks/:channelId') webhook(@Param('channelId') channelId: string, @Body() body: Record<string, unknown>, @Headers() headers: Record<string, string | string[] | undefined>, @Req() request: RawBodyRequest<FastifyRequest>) { return this.payments.webhook(channelId, body || {}, headers, request.rawBody || Buffer.from(JSON.stringify(body || {}))) }
  @Get('webhooks/:channelId') webhookGet(@Param('channelId') channelId: string, @Query() query: Record<string, unknown>, @Headers() headers: Record<string, string | string[] | undefined>) { return this.payments.webhook(channelId, query || {}, headers, Buffer.from(JSON.stringify(query || {}))) }
}

@Controller('admin/payments')
@UseGuards(AuthGuard, AdminGuard)
export class AdminPaymentsController {
  constructor(private readonly payments: PaymentsService, private readonly prisma: PrismaService) {}
  @Get('summary') summary() { return this.payments.summary() }
  @Get('reconciliation') reconciliation() { return this.payments.reconciliation() }
  @Get('channels') channels() { return this.payments.listChannels() }
  @Post('channels') async create(@CurrentUser() admin: AuthenticatedUser, @Req() request: FastifyRequest, @Body() body: ChannelDto) { const result = await this.payments.createChannel(body); await this.audit(admin.id, request, 'payment.channel.create', 'payment_channel', result.id, result); return result }
  @Patch('channels/:id') async update(@CurrentUser() admin: AuthenticatedUser, @Req() request: FastifyRequest, @Param('id') id: string, @Body() body: UpdateChannelDto) { const result = await this.payments.updateChannel(id, body); await this.audit(admin.id, request, 'payment.channel.update', 'payment_channel', id, result); return result }
  @Delete('channels/:id') async remove(@CurrentUser() admin: AuthenticatedUser, @Req() request: FastifyRequest, @Param('id') id: string) { const result = await this.payments.deleteChannel(id); await this.audit(admin.id, request, 'payment.channel.delete', 'payment_channel', id, result); return result }
  @Post('channels/:id/check') check(@Param('id') id: string) { return this.payments.checkChannel(id) }
  @Get('transactions') transactions(@Query('status') status?: string, @Query('type') type?: string, @Query('q') query?: string, @Query('channelId') channelId?: string, @Query('method') method?: string) { return this.payments.listTransactions({ status, type, query, channelId, method }) }
  @Get('transactions/:id') transaction(@Param('id') id: string) { return this.payments.getAdminTransaction(id) }
  @Post('transactions/:id/complete') async complete(@CurrentUser() admin: AuthenticatedUser, @Req() request: FastifyRequest, @Param('id') id: string) { const result = await this.payments.complete(id); await this.audit(admin.id, request, 'payment.transaction.complete', 'payment_transaction', id, result); return result }
  @Post('transactions/:id/refunds') async refund(@CurrentUser() admin: AuthenticatedUser, @Req() request: FastifyRequest, @Param('id') id: string, @Body() body: RefundDto) { const result = await this.payments.createRefund(id, admin.id, body); await this.audit(admin.id, request, 'payment.refund.create', 'payment_refund', result.id, result); return result }
  @Post('refunds/:id/process') async processRefund(@CurrentUser() admin: AuthenticatedUser, @Req() request: FastifyRequest, @Param('id') id: string, @Body() body: ProcessRefundDto) { const result = await this.payments.processRefund(id, admin.id, Boolean(body.manualConfirmed)); await this.audit(admin.id, request, 'payment.refund.process', 'payment_refund', id, result); return result }
  @Post('refunds/:id/reject') async rejectRefund(@CurrentUser() admin: AuthenticatedUser, @Req() request: FastifyRequest, @Param('id') id: string, @Body() body: RejectRefundDto) { const result = await this.payments.rejectRefund(id, admin.id, body.reason); await this.audit(admin.id, request, 'payment.refund.reject', 'payment_refund', id, result); return result }
  @Post('reconciliation/expire') async expire(@CurrentUser() admin: AuthenticatedUser, @Req() request: FastifyRequest) { const result = await this.payments.expirePendingTransactions(); await this.audit(admin.id, request, 'payment.reconciliation.expire', 'payment_transaction', 'expired-pending', result); return result }
  @Post('webhook-events/:id/replay') async replay(@CurrentUser() admin: AuthenticatedUser, @Req() request: FastifyRequest, @Param('id') id: string) { const result = await this.payments.replayWebhookEvent(id); await this.audit(admin.id, request, 'payment.webhook.replay', 'payment_webhook_event', id, result); return result }

  private async audit(actorId: string, request: FastifyRequest, action: string, targetType: string, targetId: string, after: unknown) {
    await this.prisma.auditLog.create({ data: { actorId, action, targetType, targetId, ipAddress: request.ip, userAgent: request.headers['user-agent'], after: after as Prisma.InputJsonValue } })
  }
}
