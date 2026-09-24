import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { CreditsModule } from '../credits/credits.module'
import { ProvidersModule } from '../providers/providers.module'
import { SubscriptionsModule } from '../subscriptions/subscriptions.module'
import { CommercialModule } from '../commercial/commercial.module'
import { AdminPaymentsController, PaymentsController } from './payments.controller'
import { PaymentsProcessor } from './payments.processor'
import { PaymentsService } from './payments.service'

@Module({ imports: [BullModule.registerQueue({ name: 'payment-maintenance' }), CreditsModule, ProvidersModule, SubscriptionsModule, CommercialModule], controllers: [PaymentsController, AdminPaymentsController], providers: [PaymentsService, PaymentsProcessor], exports: [PaymentsService] })
export class PaymentsModule {}
