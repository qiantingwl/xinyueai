import { Injectable } from '@nestjs/common'
import { JobKind, Prisma } from '@prisma/client'
import { GenerationsService } from '../generations/generations.service'
import { PrismaService } from '../prisma/prisma.service'

type AgentModelTask = {
  id: string
  userId: string
  projectId: string | null
  assistantId: string | null
  pluginId: string | null
  model: string
  skillId: string
}

@Injectable()
export class AgentModelService {
  constructor(private readonly prisma: PrismaService, private readonly generations: GenerationsService) {}

  async complete(task: AgentModelTask, runKey: string, purpose: string, prompt: string, onProgress?: (content: string) => Promise<void>) {
    const sourceTask = await this.prisma.agentTask.findUnique({ where: { id: task.id }, select: { attachmentIds: true } })
    const attachmentIds = Array.isArray(sourceTask?.attachmentIds) ? sourceTask.attachmentIds.filter((id): id is string => typeof id === 'string').slice(0, 20) : []
    const conversation = await this.prisma.conversation.create({
      data: {
        userId: task.userId,
        projectId: task.projectId,
        title: `Agent internal · ${purpose}`,
        model: task.model,
        temporary: true,
        expiresAt: new Date(Date.now() + 24 * 60 * 60_000),
        messages: { create: { authorId: task.userId, role: 'USER', content: prompt, metadata: { agentTaskId: task.id, internal: true, purpose }, attachments: attachmentIds.length ? { create: attachmentIds.map((assetId) => ({ assetId })) } : undefined } },
      },
    })
    const job = await this.generations.create(task.userId, {
        kind: JobKind.CHAT,
        prompt,
        model: task.model,
        projectId: task.projectId || undefined,
        conversationId: conversation.id,
        options: {
          officeMode: 'agent',
          officeSkill: task.skillId,
          agentTaskId: task.id,
          agentPurpose: purpose,
          disableAssistantTools: true,
          maxOutputTokens: purpose.startsWith('planner') || purpose.startsWith('verifier') ? 1800 : 8192,
          ...(task.assistantId ? { assistantId: task.assistantId } : {}),
          ...(task.pluginId ? { pluginId: task.pluginId } : {}),
        },
        idempotencyKey: `agent:${runKey}:${purpose}`,
      })
    if (job.conversationId !== conversation.id) {
      await this.prisma.conversation.delete({ where: { id: conversation.id } })
    }
    let lastContent = ''
    while (true) {
      const taskState = await this.prisma.agentTask.findUnique({ where: { id: task.id }, select: { status: true } })
      if (!taskState || taskState.status === 'CANCELLED') {
        await this.generations.cancel(task.userId, job.id).catch(() => undefined)
        throw new Error('Agent 任务已取消')
      }
      const current = await this.generations.get(task.userId, job.id)
      const content = current.stream?.content || ''
      if (content && content !== lastContent) {
        lastContent = content
        await onProgress?.(content)
      }
      if (current.status === 'SUCCEEDED') {
        if (!content.trim()) throw new Error(`${purpose} 模型调用已完成但未返回内容`)
        return { content, jobId: job.id, creditCost: current.creditCost }
      }
      if (current.status === 'FAILED') throw new Error(current.errorMessage || `${purpose} 模型调用失败`)
      if (current.status === 'CANCELLED') throw new Error('Agent 模型调用已取消')
      await new Promise((resolve) => setTimeout(resolve, 400))
    }
  }

  parseJson<T>(content: string, fallback: T): T {
    const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]
    const candidate = fenced || content.slice(content.indexOf('{'), content.lastIndexOf('}') + 1)
    try {
      const value = JSON.parse(candidate) as unknown
      return value && typeof value === 'object' ? value as T : fallback
    } catch {
      return fallback
    }
  }

  json(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
  }
}
