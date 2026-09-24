import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { ProvidersModule } from '../providers/providers.module'
import { AlertsController } from './alerts.controller'
import { AlertsProcessor } from './alerts.processor'
import { AlertsService } from './alerts.service'

@Module({ imports: [BullModule.registerQueue({ name: 'alert-evaluation' }), ProvidersModule], controllers: [AlertsController], providers: [AlertsService, AlertsProcessor], exports: [AlertsService] })
export class AlertsModule {}
