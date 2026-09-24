import { Processor, WorkerHost } from '@nestjs/bullmq'
import { InjectQueue } from '@nestjs/bullmq'
import { Logger, OnModuleInit, PayloadTooLargeException } from '@nestjs/common'
import { ExportJobStatus } from '@prisma/client'
import { Job } from 'bullmq'
import { createWriteStream } from 'node:fs'
import { mkdir, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { PrismaService } from '../prisma/prisma.service'
import { Queue } from 'bullmq'
import { publicExportGenerationSelect, toPublicExportGeneration } from './public-export-generation.dto'
import { publicAssetMetadata } from '../assets/public-asset.dto'
import { publicMessageMetadata } from '../conversations/public-message.dto'
import { EXPORT_BATCH_SIZE, ExportWriter } from './export-writer'

const EXPORT_DIR = join(process.cwd(), 'storage', 'exports')

function positiveEnv(name: string, fallback: number) {
  const parsed = Number(process.env[name])
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

/** Keyset pagination clause shared by every exported collection. */
function after(cursor?: { createdAt: Date; id: string }) {
  if (!cursor) return {}
  return { OR: [{ createdAt: { gt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { gt: cursor.id } }] }
}

const order = [{ createdAt: 'asc' as const }, { id: 'asc' as const }]

@Processor('export', { concurrency: 2 })
export class ExportsProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(ExportsProcessor.name)

  constructor(private readonly prisma: PrismaService, @InjectQueue('export') private readonly queue: Queue) { super() }

  async onModuleInit() {
    await this.queue.upsertJobScheduler('export-expiry-cleanup', { every: 60 * 60_000 }, {
      name: 'cleanup', data: {}, opts: { removeOnComplete: 20, removeOnFail: 100 },
    })
  }

  async process(job: Job<{ exportId: string }>) {
    if (job.name === 'cleanup') return this.cleanup()

    const claimed = await this.prisma.exportJob.updateMany({ where: { id: job.data.exportId, status: ExportJobStatus.QUEUED, expiresAt: { gt: new Date() } }, data: { status: ExportJobStatus.RUNNING, startedAt: new Date(), error: '' } })
    if (!claimed.count) return

    const fileName = `xinyue-export-${job.data.exportId}.json`
    const filePath = join(EXPORT_DIR, fileName)
    try {
      await mkdir(EXPORT_DIR, { recursive: true })
      const exportJob = await this.prisma.exportJob.findUniqueOrThrow({ where: { id: job.data.exportId } })
      await this.writeExport(exportJob, filePath)
      const finalized = await this.prisma.exportJob.updateMany({ where: { id: exportJob.id, status: ExportJobStatus.RUNNING, expiresAt: { gt: new Date() } }, data: { status: ExportJobStatus.SUCCEEDED, fileName, filePath, completedAt: new Date() } })
      if (!finalized.count) await unlink(filePath).catch(() => undefined)
    } catch (error) {
      await unlink(filePath).catch(() => undefined)
      // The `error` column is shown to the user and included in support bundles, so only a curated
      // summary goes in; the untrimmed cause stays in server logs.
      this.logger.error(`导出任务 ${job.data.exportId} 失败`, error instanceof Error ? error.stack : String(error))
      await this.prisma.exportJob.updateMany({ where: { id: job.data.exportId, status: ExportJobStatus.RUNNING }, data: { status: ExportJobStatus.FAILED, error: this.publicError(error), completedAt: new Date() } })
      throw error
    }
  }

  private publicError(error: unknown) {
    if (error instanceof PayloadTooLargeException) return error.message
    return '导出失败，请稍后重试；如反复失败请联系管理员'
  }

  private async cleanup() {
    const expired = await this.prisma.exportJob.findMany({
      where: { expiresAt: { lt: new Date() }, status: { not: ExportJobStatus.EXPIRED } },
      select: { id: true, filePath: true },
      take: 500,
    })
    for (const row of expired) {
      if (row.filePath) await unlink(row.filePath).catch(() => undefined)
      await this.prisma.exportJob.updateMany({ where: { id: row.id, status: { not: ExportJobStatus.EXPIRED } }, data: { status: ExportJobStatus.EXPIRED } })
    }
    return { expired: expired.length }
  }

  private async writeExport(exportJob: { id: string; userId: string; scope: string; teamId: string | null }, filePath: string) {
    const isTeam = exportJob.scope === 'TEAM' && Boolean(exportJob.teamId)
    const teamId = exportJob.teamId
    const [account, team] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: exportJob.userId }, select: { id: true, email: true, displayName: true, createdAt: true, settings: true } }),
      isTeam && teamId ? this.prisma.team.findUnique({ where: { id: teamId }, select: { id: true, name: true, slug: true, createdAt: true } }) : null,
    ])
    const teamProjectIds = isTeam && teamId
      ? (await this.prisma.project.findMany({ where: { teamId }, select: { id: true } })).map((item) => item.id)
      : []

    const conversationWhere = isTeam ? { projectId: { in: teamProjectIds }, temporary: false } : { userId: exportJob.userId, temporary: false }
    const projectWhere = isTeam && teamId ? { teamId } : { userId: exportJob.userId }
    const assetWhere = isTeam && teamId ? { teamId, deletedAt: null } : { userId: exportJob.userId, deletedAt: null }
    const generationWhere = isTeam && teamId ? { billingTeamId: teamId } : { userId: exportJob.userId }

    const writer = new ExportWriter(
      createWriteStream(filePath, { flags: 'wx' }),
      positiveEnv('EXPORT_MAX_MB', 512) * 1024 * 1024,
      positiveEnv('EXPORT_MAX_ROWS_PER_COLLECTION', 100_000),
    )

    await writer.open()
    await writer.field('exportedAt', new Date().toISOString())
    await writer.field('scope', exportJob.scope)
    await writer.field('account', account)
    await writer.field('team', team)

    await writer.collection(
      'conversations',
      (cursor) => this.loadConversations(conversationWhere, cursor),
      (row) => row,
    )
    await writer.collection(
      'projects',
      (cursor) => this.prisma.project.findMany({ where: { ...projectWhere, ...after(cursor) }, orderBy: order, take: EXPORT_BATCH_SIZE, select: { id: true, name: true, description: true, instructions: true, archivedAt: true, createdAt: true, updatedAt: true } }),
      (row) => row,
    )
    await writer.collection(
      'assets',
      (cursor) => this.prisma.asset.findMany({ where: { ...assetWhere, ...after(cursor) }, orderBy: order, take: EXPORT_BATCH_SIZE, select: { id: true, projectId: true, teamId: true, kind: true, name: true, mimeType: true, size: true, width: true, height: true, metadata: true, createdAt: true } }),
      (row) => ({ ...row, size: Number(row.size), metadata: publicAssetMetadata(row.metadata) }),
    )
    await writer.collection(
      'generations',
      (cursor) => this.prisma.generationJob.findMany({ where: { ...generationWhere, ...after(cursor) }, orderBy: order, take: EXPORT_BATCH_SIZE, select: publicExportGenerationSelect }),
      toPublicExportGeneration,
    )

    const summary = await writer.close()
    if (summary.truncated.length) this.logger.warn(`导出任务 ${exportJob.id} 达到行数上限：${summary.truncated.join(', ')}`)
    return summary
  }

  /** Conversations carry their messages, so each page joins its own messages instead of loading
   *  every message for the account at once. */
  private async loadConversations(where: Record<string, unknown>, cursor?: { createdAt: Date; id: string }) {
    const rows = await this.prisma.conversation.findMany({
      where: { ...where, ...after(cursor) },
      orderBy: order,
      take: EXPORT_BATCH_SIZE,
      select: { id: true, title: true, model: true, projectId: true, temporary: true, createdAt: true, updatedAt: true },
    })
    if (!rows.length) return []
    const messages = await this.prisma.message.findMany({
      where: { conversationId: { in: rows.map((row) => row.id) }, deletedAt: null },
      orderBy: order,
      select: { id: true, conversationId: true, role: true, content: true, model: true, metadata: true, createdAt: true },
    })
    const byConversation = new Map<string, unknown[]>()
    for (const message of messages) {
      const list = byConversation.get(message.conversationId) || []
      list.push({ id: message.id, role: message.role, content: message.content, model: message.model, metadata: publicMessageMetadata(message.metadata), createdAt: message.createdAt })
      byConversation.set(message.conversationId, list)
    }
    return rows.map((row) => ({ ...row, messages: byConversation.get(row.id) || [] }))
  }
}
