import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq'
import { Logger, OnModuleInit } from '@nestjs/common'
import { Queue } from 'bullmq'
import { PaymentsService } from './payments.service'

/** A PENDING transaction is already inert once `expiresAt` passes — `checkout` refuses to reuse it —
 *  so this scan only settles the row's recorded status for reconciliation and admin views. */
const EXPIRY_SCAN_INTERVAL_MS = 15 * 60_000

@Processor('payment-maintenance', { concurrency: 1 })
export class PaymentsProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(PaymentsProcessor.name)

  constructor(private readonly payments: PaymentsService, @InjectQueue('payment-maintenance') private readonly queue: Queue) { super() }

  async onModuleInit() {
    await this.queue.upsertJobScheduler('payment-pending-expiry-scan', { every: EXPIRY_SCAN_INTERVAL_MS }, {
      name: 'expire-pending', data: {}, opts: { removeOnComplete: 20, removeOnFail: 100 },
    })
  }

  async process() {
    const result = await this.payments.expirePendingTransactions()
    if (result.expired) this.logger.log(`已将 ${result.expired} 笔超期待支付交易标记为 EXPIRED`)
    return result
  }
}
