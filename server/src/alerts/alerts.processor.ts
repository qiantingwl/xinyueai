import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq'
import { Logger, OnModuleInit } from '@nestjs/common'
import { Queue } from 'bullmq'
import { AlertsService } from './alerts.service'

/** Evaluation is idempotent: candidates are deduped per (ruleId, fingerprint) and each rule's own
 *  cooldownMinutes (15-360) governs notification spam, so a short scan interval only buys fresher
 *  detection. */
const EVALUATION_INTERVAL_MS = 5 * 60_000

@Processor('alert-evaluation', { concurrency: 1 })
export class AlertsProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(AlertsProcessor.name)

  constructor(private readonly alerts: AlertsService, @InjectQueue('alert-evaluation') private readonly queue: Queue) { super() }

  async onModuleInit() {
    await this.queue.upsertJobScheduler('alert-rule-evaluation', { every: EVALUATION_INTERVAL_MS }, {
      name: 'evaluate', data: {}, opts: { removeOnComplete: 20, removeOnFail: 100 },
    })
  }

  async process() {
    const result = await this.alerts.evaluate()
    if (result.raised || result.resolved) this.logger.log(`告警评估完成：新增 ${result.raised} 条，消解 ${result.resolved} 条`)
    return result
  }
}
