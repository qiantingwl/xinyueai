import { InjectQueue } from '@nestjs/bullmq'
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { AgentTaskStatus, AgentTaskStepStatus, Prisma } from '@prisma/client'
import { Queue } from 'bullmq'
import { GenerationsService } from '../generations/generations.service'
import { PrismaService } from '../prisma/prisma.service'

export interface CreateAgentTaskInput {
  title: string
  goal: string
  instructions?: string
  model: string
  skillId?: string
  assistantId?: string
  projectId?: string
  pluginId?: string
  attachmentIds?: string[]
  webSearchEnabled?: boolean
  sourceTaskId?: string
  scheduleId?: string
  scheduledFor?: Date
}

export interface UpdateAgentTaskInput extends Partial<Omit<CreateAgentTaskInput, 'scheduledFor'>> {}

const activeStatuses: AgentTaskStatus[] = [AgentTaskStatus.QUEUED, AgentTaskStatus.RUNNING, AgentTaskStatus.WAITING_APPROVAL]

@Injectable()
export class AgentTasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly generations: GenerationsService,
    @InjectQueue('agent-task') private readonly queue: Queue,
  ) {}

  async list(userId: string, archived = false) {
    return this.prisma.agentTask.findMany({
      where: { userId, archivedAt: archived ? { not: null } : null },
      orderBy: { updatedAt: 'desc' },
      take: 100,
      include: {
        assistant: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
        steps: { orderBy: { position: 'asc' } },
        generationJob: { select: { id: true, status: true, creditCost: true, errorMessage: true } },
        conversation: { select: { id: true, messages: { where: { role: 'ASSISTANT', deletedAt: null }, orderBy: { createdAt: 'desc' }, take: 1, select: { content: true } } } },
        runs: { orderBy: { createdAt: 'desc' }, take: 1, include: { toolCalls: { orderBy: [{ iteration: 'asc' }, { position: 'asc' }] }, events: { orderBy: { createdAt: 'desc' }, take: 30 } } },
        schedule: { select: { id: true, title: true, enabled: true, cronExpression: true, timezone: true, nextRunAt: true } },
      },
    })
  }

  async create(userId: string, input: CreateAgentTaskInput) {
    await this.assertRelations(userId, input)
    return this.prisma.agentTask.create({
      data: {
        userId,
        title: input.title.trim(),
        goal: input.goal.trim(),
        instructions: input.instructions?.trim() || '',
        model: input.model.trim(),
        skillId: input.skillId?.trim() || 'daily',
        assistantId: input.assistantId || null,
        projectId: input.projectId || null,
        pluginId: input.pluginId || null,
        attachmentIds: (input.attachmentIds || []) as Prisma.InputJsonValue,
        webSearchEnabled: input.webSearchEnabled ?? true,
        sourceTaskId: input.sourceTaskId || null,
        scheduleId: input.scheduleId || null,
        scheduledFor: input.scheduledFor || null,
        steps: { create: [
          { position: 0, title: '准备任务上下文' },
          { position: 1, title: '制定执行计划' },
          { position: 2, title: '执行任务' },
          { position: 3, title: '校验并交付结果' },
        ] },
      },
      include: { assistant: { select: { id: true, name: true } }, project: { select: { id: true, name: true } }, steps: { orderBy: { position: 'asc' } } },
    })
  }

  validateInput(userId: string, input: CreateAgentTaskInput) {
    return this.assertRelations(userId, input)
  }

  async update(userId: string, id: string, input: UpdateAgentTaskInput) {
    const task = await this.prisma.agentTask.findFirst({ where: { id, userId } })
    if (!task) throw new NotFoundException('Agent 任务不存在')
    if (activeStatuses.includes(task.status)) throw new BadRequestException('执行中的任务不能编辑')
    const merged: CreateAgentTaskInput = {
      title: input.title ?? task.title,
      goal: input.goal ?? task.goal,
      instructions: input.instructions ?? task.instructions,
      model: input.model ?? task.model,
      skillId: input.skillId ?? task.skillId,
      assistantId: input.assistantId === undefined ? task.assistantId || undefined : input.assistantId,
      projectId: input.projectId === undefined ? task.projectId || undefined : input.projectId,
      pluginId: input.pluginId === undefined ? task.pluginId || undefined : input.pluginId,
      attachmentIds: input.attachmentIds ?? this.attachmentIds(task.attachmentIds),
      webSearchEnabled: input.webSearchEnabled ?? task.webSearchEnabled,
    }
    await this.assertRelations(userId, merged)
    await this.prisma.agentTask.update({ where: { id }, data: {
      title: merged.title.trim(), goal: merged.goal.trim(), instructions: merged.instructions?.trim() || '', model: merged.model.trim(),
      skillId: merged.skillId?.trim() || 'daily', assistantId: merged.assistantId || null, projectId: merged.projectId || null,
      pluginId: merged.pluginId || null, attachmentIds: (merged.attachmentIds || []) as Prisma.InputJsonValue,
      webSearchEnabled: merged.webSearchEnabled ?? true,
    } })
    return this.get(userId, id)
  }

  async duplicate(userId: string, id: string) {
    const task = await this.prisma.agentTask.findFirst({ where: { id, userId } })
    if (!task) throw new NotFoundException('Agent 任务不存在')
    return this.create(userId, {
      title: `${task.title}（副本）`, goal: task.goal, instructions: task.instructions, model: task.model,
      skillId: task.skillId, assistantId: task.assistantId || undefined, projectId: task.projectId || undefined,
      pluginId: task.pluginId || undefined, attachmentIds: this.attachmentIds(task.attachmentIds), sourceTaskId: task.id,
      webSearchEnabled: task.webSearchEnabled,
    })
  }

  async retry(userId: string, id: string) {
    const task = await this.prisma.agentTask.findFirst({ where: { id, userId }, select: { status: true } })
    if (!task) throw new NotFoundException('Agent 任务不存在')
    const retryable: AgentTaskStatus[] = [AgentTaskStatus.FAILED, AgentTaskStatus.CANCELLED, AgentTaskStatus.SUCCEEDED]
    if (!retryable.includes(task.status)) throw new BadRequestException('当前任务不能重新执行')
    return this.run(userId, id)
  }

  async setArchived(userId: string, id: string, archived: boolean) {
    const task = await this.prisma.agentTask.findFirst({ where: { id, userId }, select: { status: true } })
    if (!task) throw new NotFoundException('Agent 任务不存在')
    if (activeStatuses.includes(task.status)) throw new BadRequestException('请先停止正在执行的任务')
    await this.prisma.agentTask.update({ where: { id }, data: { archivedAt: archived ? new Date() : null } })
    return this.get(userId, id)
  }

  async get(userId: string, id: string) {
    const task = await this.prisma.agentTask.findFirst({
      where: { id, userId },
      include: {
        assistant: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
        steps: { orderBy: { position: 'asc' } },
        conversation: { select: { id: true, messages: { where: { role: 'ASSISTANT', deletedAt: null }, orderBy: { createdAt: 'desc' }, take: 1, select: { content: true } } } },
        runs: { orderBy: { createdAt: 'desc' }, take: 1, include: { toolCalls: { orderBy: [{ iteration: 'asc' }, { position: 'asc' }] }, events: { orderBy: { createdAt: 'desc' }, take: 100 } } },
        schedule: { select: { id: true, title: true, enabled: true, cronExpression: true, timezone: true, nextRunAt: true } },
      },
    })
    if (!task) throw new NotFoundException('Agent 任务不存在')
    const run = task.generationJobId ? await this.generations.get(userId, task.generationJobId) : null
    const latestRun = task.runs[0] || null
    const artifactIds = latestRun ? this.attachmentIds(latestRun.artifactIds) : []
    const artifacts = artifactIds.length ? await this.prisma.asset.findMany({ where: { id: { in: artifactIds }, userId, deletedAt: null }, orderBy: { createdAt: 'desc' }, select: { id: true, name: true, mimeType: true, size: true, createdAt: true } }) : []
    return { ...task, run, agentRun: latestRun, artifacts: artifacts.map((asset) => ({ ...asset, size: Number(asset.size), contentUrl: `/v1/assets/${asset.id}/content` })) }
  }

  async run(userId: string, id: string) {
    const task = await this.prisma.agentTask.findFirst({ where: { id, userId }, include: { steps: true } })
    if (!task) throw new NotFoundException('Agent 任务不存在')
    if (activeStatuses.includes(task.status)) throw new BadRequestException('任务正在执行中')
    await this.assertRelations(userId, {
      title: task.title,
      goal: task.goal,
      instructions: task.instructions,
      model: task.model,
      skillId: task.skillId,
      assistantId: task.assistantId || undefined,
      projectId: task.projectId || undefined,
      pluginId: task.pluginId || undefined,
      attachmentIds: this.attachmentIds(task.attachmentIds),
    })
    const now = new Date()
    const runKey = `${id}-${now.getTime()}`
    let runId = ''
    try {
      const run = await this.prisma.$transaction(async (tx) => {
        const result = await tx.agentTask.updateMany({
          where: { id, userId, status: { notIn: activeStatuses } },
          data: { conversationId: null, generationJobId: null, status: AgentTaskStatus.QUEUED, errorMessage: null, startedAt: now, completedAt: null, archivedAt: null },
        })
        if (!result.count) return null
        if (task.conversationId) {
          await tx.conversation.updateMany({
            where: { id: task.conversationId, userId },
            data: { archivedAt: now },
          })
        }
        await tx.agentTaskStep.updateMany({ where: { agentTaskId: id }, data: { status: AgentTaskStepStatus.PENDING, startedAt: null, completedAt: null, detail: '' } })
        return tx.agentRun.create({ data: { agentTaskId: id, runKey, status: AgentTaskStatus.QUEUED, maxIterations: 3 } })
      })
      if (!run) throw new BadRequestException('任务正在执行中')
      runId = run.id
      await this.queue.add('run', { taskId: id, runId: run.id, runKey }, { jobId: runKey, attempts: 1, removeOnComplete: 1000, removeOnFail: 5000 })
      return this.get(userId, id)
    } catch (error) {
      if (!(error instanceof BadRequestException)) await this.failEnqueue(id, runId, error, '任务启动失败')
      throw error
    }
  }

  async cancel(userId: string, id: string) {
    const task = await this.prisma.agentTask.findFirst({ where: { id, userId } })
    if (!task) throw new NotFoundException('Agent 任务不存在')
    if (!activeStatuses.includes(task.status)) return this.get(userId, id)
    if (task.generationJobId) await this.generations.cancel(userId, task.generationJobId)
    const queuedJobs = await this.queue.getJobs(['waiting', 'delayed', 'prioritized'])
    await Promise.all(queuedJobs.filter((job) => job.data.taskId === id).map((job) => job.remove()))
    const now = new Date()
    await this.prisma.$transaction([
      this.prisma.agentTask.updateMany({ where: { id, userId, status: { in: activeStatuses } }, data: { status: AgentTaskStatus.CANCELLED, completedAt: now } }),
      this.prisma.agentTaskStep.updateMany({ where: { agentTaskId: id, status: { in: [AgentTaskStepStatus.PENDING, AgentTaskStepStatus.RUNNING] } }, data: { status: AgentTaskStepStatus.CANCELLED, completedAt: now } }),
      this.prisma.agentRun.updateMany({ where: { agentTaskId: id, status: { in: activeStatuses } }, data: { status: AgentTaskStatus.CANCELLED, completedAt: now } }),
    ])
    return this.get(userId, id)
  }

  async remove(userId: string, id: string) {
    const task = await this.prisma.agentTask.findFirst({ where: { id, userId }, select: { status: true } })
    if (!task) throw new NotFoundException('Agent 任务不存在')
    if (activeStatuses.includes(task.status)) throw new BadRequestException('请先停止正在执行的任务')
    const existing = await this.prisma.agentTask.findUniqueOrThrow({ where: { id }, select: { conversationId: true } })
    await this.prisma.agentTask.delete({ where: { id } })
    if (existing.conversationId) await this.prisma.conversation.deleteMany({ where: { id: existing.conversationId, userId, temporary: true } })
    return { deleted: true }
  }

  async reviewToolCall(userId: string, taskId: string, callId: string, decision: 'APPROVED' | 'REJECTED') {
    const task = await this.prisma.agentTask.findFirst({ where: { id: taskId, userId }, select: { id: true, status: true } })
    if (!task) throw new NotFoundException('Agent 任务不存在')
    if (task.status !== AgentTaskStatus.WAITING_APPROVAL) throw new BadRequestException('任务当前不在等待审批')
    const call = await this.prisma.agentToolCall.findFirst({ where: { id: callId, agentTaskId: taskId, requiresApproval: true }, include: { run: true } })
    if (!call) throw new NotFoundException('待确认的工具调用不存在')
    if (call.approvalStatus !== 'PENDING') throw new BadRequestException('该工具调用已经处理')
    const reviewed = await this.prisma.agentToolCall.updateMany({ where: { id: call.id, approvalStatus: 'PENDING' }, data: { approvalStatus: decision } })
    if (!reviewed.count) throw new BadRequestException('该工具调用已经处理')
    await this.prisma.agentEvent.create({ data: { agentTaskId: taskId, runId: call.runId, type: 'approval', title: decision === 'APPROVED' ? `已批准 ${call.name}` : `已拒绝 ${call.name}`, detail: '用户已处理任务级工具调用确认' } })
    const remaining = await this.prisma.agentToolCall.count({ where: { runId: call.runId, iteration: call.iteration, approvalStatus: 'PENDING' } })
    if (!remaining) {
      const claimed = await this.prisma.agentRun.updateMany({ where: { id: call.runId, status: AgentTaskStatus.WAITING_APPROVAL }, data: { status: AgentTaskStatus.QUEUED, currentNode: 'tools' } })
      if (claimed.count) {
        await this.prisma.agentTask.updateMany({ where: { id: taskId, status: AgentTaskStatus.WAITING_APPROVAL }, data: { status: AgentTaskStatus.QUEUED } })
        const resumeKey = `${call.run.runKey}-resume-${call.iteration}`
        try {
          await this.queue.add('resume', { taskId, runId: call.runId, runKey: call.run.runKey }, { jobId: resumeKey, attempts: 1, removeOnComplete: 1000, removeOnFail: 5000 })
        } catch (error) {
          await this.failEnqueue(taskId, call.runId, error, '审批完成，但任务恢复失败')
          throw error
        }
      }
    }
    return this.get(userId, taskId)
  }

  private attachmentIds(value: Prisma.JsonValue | null): string[] {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
  }

  private async failEnqueue(taskId: string, runId: string, error: unknown, fallback: string) {
    const now = new Date()
    const message = error instanceof Error ? error.message : fallback
    await this.prisma.$transaction([
      this.prisma.agentTask.updateMany({ where: { id: taskId, status: { in: [AgentTaskStatus.QUEUED, AgentTaskStatus.WAITING_APPROVAL] } }, data: { status: AgentTaskStatus.FAILED, errorMessage: message, completedAt: now } }),
      ...(runId ? [this.prisma.agentRun.updateMany({ where: { id: runId, status: { in: [AgentTaskStatus.QUEUED, AgentTaskStatus.WAITING_APPROVAL] } }, data: { status: AgentTaskStatus.FAILED, completedAt: now } })] : []),
    ])
  }

  private async assertRelations(userId: string, input: CreateAgentTaskInput) {
    const attachmentIds = [...new Set(input.attachmentIds || [])]
    const [project, assistant, assets] = await Promise.all([
      input.projectId ? this.prisma.project.findFirst({ where: { id: input.projectId, archivedAt: null, OR: [{ userId }, { members: { some: { userId } } }] }, select: { id: true } }) : null,
      input.assistantId ? this.prisma.assistant.findFirst({ where: { id: input.assistantId, enabled: true, visibility: 'PUBLIC' }, select: { id: true } }) : null,
      attachmentIds.length ? this.prisma.asset.count({ where: { id: { in: attachmentIds }, userId, deletedAt: null } }) : 0,
    ])
    if (input.projectId && !project) throw new NotFoundException('项目不存在或已归档')
    if (input.assistantId && !assistant) throw new NotFoundException('助手不存在或已停用')
    if (assets !== attachmentIds.length) throw new NotFoundException('附件不存在或不属于当前用户')
  }
}
