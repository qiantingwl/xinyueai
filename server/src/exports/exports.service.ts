import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { ExportJobStatus } from '@prisma/client'
import { InjectQueue } from '@nestjs/bullmq'
import { Queue } from 'bullmq'
import { stat } from 'node:fs/promises'
import { PrismaService } from '../prisma/prisma.service'

export type ExportScope = 'ACCOUNT' | 'TEAM'

@Injectable()
export class ExportsService {
  constructor(private readonly prisma: PrismaService, @InjectQueue('export') private readonly queue: Queue) {}

  async create(userId: string, scope: ExportScope = 'ACCOUNT', teamId?: string) {
    if (scope === 'TEAM') {
      if (!teamId) throw new BadRequestException('团队导出必须提供 teamId')
      const member = await this.prisma.teamMember.findUnique({ where: { teamId_userId: { teamId, userId } }, include: { team: { select: { id: true, name: true, slug: true, status: true } } } })
      if (!member || member.team.status !== 'ACTIVE') throw new BadRequestException('你不是该团队成员')
      if (!['OWNER', 'ADMIN'].includes(member.role)) throw new ForbiddenException('只有团队所有者或管理员可以导出团队数据')
    }
    const job = await this.prisma.exportJob.create({ data: { userId, scope, teamId: scope === 'TEAM' ? teamId : null, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) } })
    try {
      await this.queue.add('export', { exportId: job.id }, { jobId: job.id, attempts: 2, backoff: { type: 'exponential', delay: 2_000 }, removeOnComplete: 1000, removeOnFail: 5000 })
    } catch (error) {
      // Queue failures carry broker hosts and credentials; keep them out of the user-visible record.
      await this.prisma.exportJob.update({ where: { id: job.id }, data: { status: ExportJobStatus.FAILED, error: '导出任务入队失败，请稍后重试', completedAt: new Date() } })
      throw error
    }
    return this.public(job)
  }

  list(userId: string) {
    return this.prisma.exportJob.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 30 }).then((rows) => rows.map((row) => this.public(row)))
  }

  async get(userId: string, id: string) {
    const row = await this.prisma.exportJob.findFirst({ where: { id, userId } })
    if (!row) throw new NotFoundException('导出任务不存在')
    if (row.status !== ExportJobStatus.EXPIRED && row.expiresAt <= new Date()) {
      await this.prisma.exportJob.update({ where: { id }, data: { status: ExportJobStatus.EXPIRED } })
      return this.public({ ...row, status: ExportJobStatus.EXPIRED })
    }
    return this.public(row)
  }

  async download(userId: string, id: string) {
    const row = await this.prisma.exportJob.findFirst({ where: { id, userId } })
    if (!row) throw new NotFoundException('导出任务不存在')
    if (row.status !== ExportJobStatus.SUCCEEDED || !row.filePath) throw new BadRequestException('导出文件尚未准备完成')
    if (row.expiresAt <= new Date()) {
      await this.prisma.exportJob.update({ where: { id }, data: { status: ExportJobStatus.EXPIRED } })
      throw new BadRequestException('导出文件已过期')
    }
    try { await stat(row.filePath) } catch {
      await this.prisma.exportJob.updateMany({ where: { id, status: ExportJobStatus.SUCCEEDED }, data: { status: ExportJobStatus.FAILED, error: '导出文件不存在，请重新导出' } })
      throw new BadRequestException('导出文件不存在，请重新导出')
    }
    return row
  }

  private public(row: { id: string; scope: string; teamId: string | null; status: ExportJobStatus; fileName: string; error: string; expiresAt: Date; createdAt: Date; startedAt: Date | null; completedAt: Date | null }) {
    return { id: row.id, scope: row.scope, teamId: row.teamId, status: row.status, fileName: row.fileName, error: row.error, expiresAt: row.expiresAt, createdAt: row.createdAt, startedAt: row.startedAt, completedAt: row.completedAt, downloadUrl: row.status === ExportJobStatus.SUCCEEDED ? '/v1/exports/' + row.id + '/download' : null }
  }
}
