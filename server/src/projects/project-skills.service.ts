import { BadGatewayException, BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { ModelCapability, Prisma, ProjectSkillChangeType } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { ProvidersService, type ResolvedProvider } from '../providers/providers.service'

type ActivateSkillInput = {
  name: string
  content: string
  changeSummary?: string
  sourceConversationId?: string
  changeType?: ProjectSkillChangeType
}

@Injectable()
export class ProjectSkillsService {
  constructor(private readonly prisma: PrismaService, private readonly providers: ProvidersService) {}

  async status(userId: string, projectId: string) {
    const project = await this.accessibleProject(userId, projectId)
    const versions = await this.prisma.projectSkillVersion.findMany({
      where: { projectId },
      orderBy: { version: 'desc' },
      take: 100,
      include: {
        createdBy: { select: { id: true, displayName: true, email: true } },
        sourceConversation: { select: { id: true, title: true } },
      },
    })
    return {
      activeVersionId: project.activeSkillVersionId,
      active: versions.find((item) => item.id === project.activeSkillVersionId) || null,
      versions: versions.map((item) => ({ ...item, active: item.id === project.activeSkillVersionId })),
    }
  }

  async activate(userId: string, projectId: string, input: ActivateSkillInput, ownerOnly = false) {
    const project = ownerOnly ? await this.ownedProject(userId, projectId) : await this.accessibleProject(userId, projectId)
    const name = input.name.trim()
    const content = input.content.trim()
    if (!name || !content) throw new BadRequestException('技能名称和内容不能为空')
    if (input.sourceConversationId) await this.ownProjectConversation(userId, projectId, input.sourceConversationId)
    return this.createVersion(project, userId, {
      name,
      content,
      enabled: true,
      changeType: input.changeType || ProjectSkillChangeType.MANUAL,
      changeSummary: input.changeSummary?.trim() || (input.changeType === ProjectSkillChangeType.SUMMARY ? '根据项目对话总结并替换技能' : '手动设置项目技能'),
      sourceConversationId: input.sourceConversationId,
    })
  }

  async disable(userId: string, projectId: string) {
    const project = await this.ownedProject(userId, projectId)
    if (!project.activeSkillVersion) throw new BadRequestException('项目当前未启用技能')
    return this.createVersion(project, userId, {
      name: project.activeSkillVersion.name,
      content: project.activeSkillVersion.content,
      enabled: false,
      changeType: ProjectSkillChangeType.DISABLE,
      changeSummary: '停用项目技能',
    })
  }

  async restore(userId: string, projectId: string, version: number) {
    const project = await this.accessibleProject(userId, projectId)
    const source = await this.prisma.projectSkillVersion.findFirst({ where: { projectId, version } })
    if (!source) throw new NotFoundException('技能版本不存在')
    return this.createVersion(project, userId, {
      name: source.name,
      content: source.content,
      enabled: source.enabled,
      changeType: ProjectSkillChangeType.RESTORE,
      changeSummary: `回退到技能 v${source.version}`,
      sourceConversationId: source.sourceConversationId || undefined,
    })
  }

  async summarize(userId: string, projectId: string, conversationId: string, request = '') {
    const project = await this.accessibleProject(userId, projectId)
    const conversation = await this.ownProjectConversation(userId, projectId, conversationId)
    const messages = await this.prisma.message.findMany({
      where: { conversationId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      take: 80,
      select: { role: true, content: true },
    })
    if (!messages.length) throw new BadRequestException('该对话还没有可用于总结的内容')
    const transcript = messages.map((item) => `${item.role === 'USER' ? '用户' : '助手'}：${item.content}`).join('\n\n').slice(-40_000)
    const oldSkill = project.activeSkillVersion?.enabled ? project.activeSkillVersion : null
    const prompt = `你是团队项目技能维护助手。请从旧技能和对话中提炼可复用、明确、可执行的新技能。保留仍然有效的旧规则，吸收对话中验证过的新偏好、流程和质量标准；不要写入一次性任务、个人隐私、账号密钥或对话原文。\n\n旧技能名称：${oldSkill?.name || '未设置'}\n旧技能内容：\n${oldSkill?.content || '无'}\n\n本次调整要求：\n${request.trim() || '结合对话自动提炼'}\n\n来源对话《${conversation.title}》：\n${transcript}\n\n只返回 JSON，不要 Markdown，格式为：{"name":"简短技能名称","content":"完整技能正文","changeSummary":"本次变化摘要"}`
    const candidate = await this.generateCandidate(userId, project.defaultModel || undefined, prompt)
    return { ...candidate, sourceConversation: { id: conversation.id, title: conversation.title }, basedOnVersion: oldSkill?.version || null }
  }

  private async createVersion(
    project: Awaited<ReturnType<ProjectSkillsService['accessibleProject']>>,
    userId: string,
    input: { name: string; content: string; enabled: boolean; changeType: ProjectSkillChangeType; changeSummary: string; sourceConversationId?: string },
  ) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const current = await tx.project.findUniqueOrThrow({ where: { id: project.id }, select: { activeSkillVersionId: true } })
          const updated = await tx.project.update({ where: { id: project.id }, data: { skillRevision: { increment: 1 } }, select: { skillRevision: true } })
          const version = await tx.projectSkillVersion.create({
            data: {
              projectId: project.id,
              version: updated.skillRevision,
              name: input.name,
              content: input.content,
              enabled: input.enabled,
              changeType: input.changeType,
              changeSummary: input.changeSummary,
              previousVersionId: current.activeSkillVersionId || undefined,
              sourceConversationId: input.sourceConversationId,
              createdById: userId,
            },
            include: { createdBy: { select: { id: true, displayName: true, email: true } }, sourceConversation: { select: { id: true, title: true } } },
          })
          await tx.project.update({ where: { id: project.id }, data: { activeSkillVersionId: version.id } })
          return { ...version, active: true }
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2034' || attempt === 2) throw error
      }
    }
    throw new Error('Unable to create project skill version')
  }

  private accessibleProject(userId: string, projectId: string) {
    return this.prisma.project.findFirst({
      where: { id: projectId, OR: [{ userId }, { members: { some: { userId } } }] },
      select: { id: true, userId: true, defaultModel: true, activeSkillVersionId: true, activeSkillVersion: true },
    }).then((project) => {
      if (!project) throw new NotFoundException('项目不存在')
      return project
    })
  }

  private ownedProject(userId: string, projectId: string) {
    return this.accessibleProject(userId, projectId).then((project) => {
      if (project.userId !== userId) throw new ForbiddenException('只有项目创建者可以执行此操作')
      return project
    })
  }

  private ownProjectConversation(userId: string, projectId: string, conversationId: string) {
    return this.prisma.conversation.findFirst({ where: { id: conversationId, projectId, userId }, select: { id: true, title: true } }).then((conversation) => {
      if (!conversation) throw new ForbiddenException('只能使用自己在该项目中的对话')
      return conversation
    })
  }

  private async generateCandidate(userId: string, model: string | undefined, prompt: string) {
    const candidates = await this.providers.resolveCandidates(userId, model, ModelCapability.CHAT, {})
    let lastError: unknown
    for (const provider of candidates) {
      try {
        const content = provider.source === 'demo'
          ? JSON.stringify({ name: '项目协作技能', content: prompt.match(/旧技能内容：\n([\s\S]*?)\n\n本次调整要求/)?.[1]?.trim() === '无' ? '根据项目目标回答问题，优先给出明确、可执行且可复用的结果。' : `${prompt.match(/旧技能内容：\n([\s\S]*?)\n\n本次调整要求/)?.[1]?.trim()}\n\n结合本次项目对话持续采用已验证的工作方法。`, changeSummary: '结合所选对话补充可复用的工作方法' })
          : await this.requestProvider(provider, prompt)
        await this.providers.recordProviderResult(provider.providerId, true)
        return this.parseCandidate(content)
      } catch (error) {
        lastError = error
        await this.providers.recordProviderResult(provider.providerId, false, error instanceof Error ? error.message : '技能总结失败')
      }
    }
    throw new BadGatewayException(lastError instanceof Error ? lastError.message : '技能总结失败')
  }

  private async requestProvider(provider: ResolvedProvider, prompt: string) {
    let path = '/chat/completions'
    let protocol: 'openai' | 'claude' | 'gemini' = 'openai'
    let body: Record<string, unknown> = { model: provider.model, messages: [{ role: 'user', content: prompt }], max_tokens: 4096, response_format: { type: 'json_object' } }
    if (provider.apiProtocol === 'anthropic') {
      protocol = 'claude'; path = '/messages'
      body = { model: provider.model, max_tokens: 4096, messages: [{ role: 'user', content: prompt }] }
    } else if (provider.apiProtocol === 'gemini') {
      protocol = 'gemini'; path = `/models/${encodeURIComponent(provider.model)}:generateContent`
      body = { contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 4096, responseMimeType: 'application/json' } }
    }
    const response = await fetch(`${provider.baseUrl}${path}`, { method: 'POST', headers: this.providers.buildRequestHeaders(provider, protocol), body: JSON.stringify(body), signal: AbortSignal.timeout(provider.timeoutMs) })
    if (!response.ok) throw new Error(`模型服务返回 ${response.status}: ${(await response.text()).slice(0, 300)}`)
    const payload = await response.json() as Record<string, unknown>
    if (provider.apiProtocol === 'anthropic') return ((payload.content as Array<Record<string, unknown>> | undefined) || []).map((item) => String(item.text || '')).join('')
    if (provider.apiProtocol === 'gemini') {
      const candidate = ((payload.candidates as Array<Record<string, unknown>> | undefined) || [])[0]
      const content = candidate?.content as Record<string, unknown> | undefined
      return ((content?.parts as Array<Record<string, unknown>> | undefined) || []).map((item) => String(item.text || '')).join('')
    }
    const choice = ((payload.choices as Array<Record<string, unknown>> | undefined) || [])[0]
    return String((choice?.message as Record<string, unknown> | undefined)?.content || '')
  }

  private parseCandidate(raw: string) {
    const normalized = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
    let value: Record<string, unknown>
    try { value = JSON.parse(normalized) as Record<string, unknown> } catch { throw new Error('模型未返回有效的技能内容') }
    const name = String(value.name || '').trim().slice(0, 80)
    const content = String(value.content || '').trim().slice(0, 50_000)
    const changeSummary = String(value.changeSummary || '根据项目对话更新技能').trim().slice(0, 500)
    if (!name || !content) throw new Error('模型返回的技能名称或内容为空')
    return { name, content, changeSummary }
  }
}
