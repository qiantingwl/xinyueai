import { InjectQueue } from '@nestjs/bullmq'
import { BadRequestException, ForbiddenException, HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common'
import { GenerationJob, JobKind, JobStatus, PluginCapability, Prisma, UserRole } from '@prisma/client'
import { Queue } from 'bullmq'
import { CreditsService } from '../credits/credits.service'
import { PrismaService } from '../prisma/prisma.service'
import { ProvidersService } from '../providers/providers.service'
import { ModerationService } from '../moderation/moderation.service'
import { imageCapabilities, imageCreditCost, imageResolutionTier, normalizeImageOptions } from './image-options'
import { normalizeVideoOptions, videoCapabilities, videoCreditCost } from './video-options'
import { publicGenerationError } from './generation-errors'
import { PluginsService } from '../plugins/plugins.service'

interface CreateJobInput { kind: JobKind; prompt: string; model?: string; projectId?: string; conversationId?: string; options: Record<string, unknown>; idempotencyKey?: string }

@Injectable()
export class GenerationsService {
  constructor(private readonly prisma: PrismaService, private readonly credits: CreditsService, private readonly providers: ProvidersService, private readonly moderation: ModerationService, private readonly plugins: PluginsService, @InjectQueue('generation') private readonly queue: Queue) {}
  async create(userId: string, input: CreateJobInput) {
    const idempotencyKey = input.idempotencyKey ? `${userId}:${input.idempotencyKey}` : undefined
    if (input.idempotencyKey) {
      const existing = await this.prisma.generationJob.findFirst({ where: { userId, idempotencyKey: { in: [idempotencyKey!, input.idempotencyKey] } } })
      if (existing) return existing
    }
    const moderationSource = input.kind === 'CHAT' ? 'CHAT' : input.kind === 'COMMERCE' ? 'COMMERCE' : 'IMAGE'
    await this.moderation.inspect(userId, moderationSource, input.prompt, { conversationId: input.conversationId || null, projectId: input.projectId || null, kind: input.kind })
    const [project, conversation] = await Promise.all([
      input.projectId ? this.prisma.project.findFirst({ where: { id: input.projectId, archivedAt: null, OR: [{ userId }, { members: { some: { userId } } }] }, select: { id: true, instructions: true, activeSkillVersion: { select: { id: true, version: true, name: true, content: true, enabled: true } } } }) : null,
      input.conversationId ? this.prisma.conversation.findFirst({ where: { id: input.conversationId, userId }, select: { id: true, projectId: true } }) : null,
    ])
    if (input.projectId && !project) throw new NotFoundException('项目不存在')
    if (input.conversationId && !conversation) throw new NotFoundException('对话不存在')
    if (input.projectId && conversation?.projectId !== input.projectId) throw new NotFoundException('对话不属于该项目')
    if (input.kind === 'CHAT' && conversation?.projectId && !input.projectId) throw new BadRequestException('项目对话必须携带项目标识')
    const [subscription, privacy, freePlan, account] = await Promise.all([
      this.prisma.userSubscription.findFirst({ where: { userId, status: { in: ['ACTIVE', 'TRIALING'] }, OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { gt: new Date() } }] }, orderBy: { createdAt: 'desc' }, include: { plan: true } }),
      this.prisma.userSettings.findUnique({ where: { userId }, select: { trainingOptOut: true, shareUsageAnalytics: true } }),
      this.prisma.subscriptionPlan.findFirst({ where: { enabled: true, priceCents: 0 }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }),
      this.prisma.user.findUnique({ where: { id: userId }, select: { role: true } }),
    ])
    const effectivePlan = subscription?.plan || freePlan
    const concurrency = Math.max(1, effectivePlan?.concurrency || 1)
    const running = await this.prisma.generationJob.count({ where: { userId, status: { in: ['QUEUED', 'RUNNING'] } } })
    if (running >= concurrency) throw new HttpException(`当前套餐最多同时执行 ${concurrency} 个任务`, HttpStatus.TOO_MANY_REQUESTS)
    const bypassPlanCapabilities = account?.role === UserRole.ADMIN || account?.role === UserRole.SUPER_ADMIN
    if (!bypassPlanCapabilities && effectivePlan && input.kind === 'IMAGE' && !effectivePlan.imageAccess) throw new ForbiddenException('当前套餐未开放图片生成')
    if (!bypassPlanCapabilities && effectivePlan && input.kind === 'VIDEO' && !effectivePlan.videoAccess) throw new ForbiddenException('当前套餐未开放视频生成')
    if (!bypassPlanCapabilities && effectivePlan && input.kind === 'COMMERCE' && !effectivePlan.commerceAccess) throw new ForbiddenException('当前套餐未开放商品视觉')
    const capability = input.kind === 'CHAT' ? 'CHAT' : input.kind === 'VIDEO' ? 'VIDEO' : input.kind === 'COMMERCE' ? 'COMMERCE' : 'IMAGE'
    const pluginCapability = input.kind === 'CHAT' && typeof input.options.officeSkill === 'string' ? PluginCapability.OFFICE : PluginCapability[capability]
    const pluginId = typeof input.options.pluginId === 'string' && input.options.pluginId.trim() ? input.options.pluginId.trim() : undefined
    const plugin = pluginId ? await this.plugins.resolveForUse(userId, pluginId, pluginCapability, account?.role) : null
    const assistantId = input.kind === 'CHAT' && typeof input.options.assistantId === 'string' ? input.options.assistantId : undefined
    const assistant = assistantId ? await this.prisma.assistant.findFirst({ where: { id: assistantId, enabled: true, visibility: 'PUBLIC' }, select: { id: true, defaultModel: true } }) : null
    if (assistantId && !assistant) throw new NotFoundException('助手不存在或已停用')
    const creationToolId = input.kind === 'IMAGE' && typeof input.options.creationToolId === 'string' ? input.options.creationToolId.trim() : ''
    const creationTool = creationToolId ? await this.prisma.inspiration.findFirst({ where: { id: creationToolId, mode: 'IMAGE_TOOL', enabled: true }, select: { id: true, title: true, prompt: true, model: true, options: true } }) : null
    if (creationToolId && !creationTool) throw new NotFoundException('图片工具不存在或已停用')
    const requestedModel = creationTool?.model || input.model || assistant?.defaultModel || plugin?.recommendedModel || undefined
    const resolved = await this.providers.resolve(userId, requestedModel, capability, input.options)
    const projectSkillSnapshot = input.kind === 'CHAT' && project?.activeSkillVersion?.enabled ? { id: project.activeSkillVersion.id, version: project.activeSkillVersion.version, name: project.activeSkillVersion.name, content: project.activeSkillVersion.content } : undefined
    const projectInstructions = input.kind === 'CHAT' ? project?.instructions.trim() || undefined : undefined
    const normalizedOptions: Record<string, unknown> = input.kind === 'IMAGE' || input.kind === 'COMMERCE'
      ? { ...input.options, ...(creationTool ? { creationTool: { id: creationTool.id, title: creationTool.title, instruction: creationTool.prompt, options: creationTool.options } } : {}), ...normalizeImageOptions(input.options, resolved.imageCapabilities) }
      : input.kind === 'VIDEO'
        ? { ...input.options, ...normalizeVideoOptions(input.options, resolved.videoCapabilities) }
        : { ...input.options, ...(projectSkillSnapshot ? { projectSkill: projectSkillSnapshot } : {}), ...(projectInstructions ? { projectInstructions } : {}) }
    if (input.kind === 'IMAGE' || input.kind === 'COMMERCE') await this.assertImageAssets(userId, normalizedOptions)
    const quantity = input.kind === 'COMMERCE' ? Math.max(1, Math.min(Number(normalizedOptions.modules || 8), 12)) : input.kind === 'IMAGE' ? Math.max(1, Math.min(Number(normalizedOptions.count || 1), 10)) : 1
    let unitCreditCost = Math.max(0, resolved.creditCost)
    if (input.kind === 'IMAGE') {
      const size = String(normalizedOptions.size)
      const configured = imageCapabilities(resolved.imageCapabilities).resolutionPricing[imageResolutionTier(size)]
      const raw = imageCreditCost(size, resolved.imageCapabilities, resolved.creditCost)
      unitCreditCost = configured === undefined ? raw : Math.ceil(raw * resolved.creditRatePercent / 100)
    } else if (input.kind === 'VIDEO') {
      const videoOptions = normalizeVideoOptions(normalizedOptions, resolved.videoCapabilities)
      const configured = videoCapabilities(resolved.videoCapabilities).pricing[`${videoOptions.resolution}:${videoOptions.duration}`]
      const raw = videoCreditCost(videoOptions, resolved.videoCapabilities, resolved.creditCost)
      unitCreditCost = configured === undefined ? raw : Math.ceil(raw * resolved.creditRatePercent / 100)
    }
    const baseCreditCost = Math.max(0, unitCreditCost * quantity)
    const maxOutputTokens = input.kind === 'CHAT' ? Math.max(1, Math.min(32768, Number(normalizedOptions.maxOutputTokens || 4096))) : 0
    const inputMessages = input.kind === 'CHAT' && input.conversationId ? await this.prisma.message.findMany({ where: { conversationId: input.conversationId, deletedAt: null }, orderBy: { createdAt: 'asc' }, take: 80, select: { content: true } }) : []
    const estimatedInputTokens = inputMessages.reduce((total, message) => total + message.content.length, 0)
    const reservedTokenCredits = input.kind === 'CHAT' ? Math.ceil(estimatedInputTokens * resolved.inputCreditsPerMillion / 1_000_000) + Math.ceil(maxOutputTokens * resolved.outputCreditsPerMillion / 1_000_000) : 0
    const creditCost = baseCreditCost + reservedTokenCredits
    let job: GenerationJob
    try {
      job = await this.prisma.$transaction(async (tx) => {
        const created = await tx.generationJob.create({ data: { userId, projectId: input.projectId, conversationId: input.conversationId, kind: input.kind, provider: `${resolved.source}:${resolved.type}`, providerChannelId: resolved.providerId, model: resolved.model, prompt: input.prompt, options: { ...normalizedOptions, requestedModel, assistantId: assistant?.id, ...(plugin ? { pluginId: plugin.id, pluginSnapshot: { name: plugin.name, version: plugin.version, capability: plugin.capability } } : {}), presetKey: resolved.presetKey, subscriptionId: subscription?.id, planCode: subscription?.plan.code, billing: { unitCreditCost, baseCreditCost, reservedTokenCredits, maxOutputTokens, inputCreditsPerMillion: resolved.inputCreditsPerMillion, outputCreditsPerMillion: resolved.outputCreditsPerMillion, creditValueMicros: resolved.creditValueMicros }, privacy: { trainingOptOut: privacy?.trainingOptOut ?? true, shareUsageAnalytics: privacy?.shareUsageAnalytics ?? false } } as Prisma.InputJsonValue, creditCost, revenueMicros: Math.min(2_000_000_000, creditCost * resolved.creditValueMicros), idempotencyKey } })
        if (plugin) await tx.pluginUsage.create({ data: { userId, pluginId: plugin.id, jobId: created.id, capability: pluginCapability } })
        return created
      })
    } catch (error) {
      if (idempotencyKey && error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await this.prisma.generationJob.findUnique({ where: { idempotencyKey } })
        if (existing) return existing
      }
      throw error
    }
    let spent = false
    try {
      if (creditCost > 0) {
        await this.credits.mutate(userId, -creditCost, 'SPEND', `${input.kind} 生成任务`, `job:${job.id}:spend`, { type: 'generation_job', id: job.id })
        spent = true
      }
      await this.queue.add(input.kind.toLowerCase(), { jobId: job.id }, { jobId: job.id, attempts: 3, backoff: { type: 'exponential', delay: 2000 }, removeOnComplete: 1000, removeOnFail: 5000 })
      return job
    } catch (error) {
      await this.prisma.generationJob.update({ where: { id: job.id }, data: { status: 'FAILED', errorCode: 'ENQUEUE_FAILED', errorMessage: error instanceof Error ? error.message : 'Unable to enqueue', completedAt: new Date() } })
      await this.prisma.pluginUsage.updateMany({ where: { jobId: job.id, status: 'QUEUED' }, data: { status: 'FAILED', error: 'Unable to enqueue generation job' } })
      if (spent) await this.credits.mutate(userId, creditCost, 'REFUND', '任务创建失败退款', `job:${job.id}:enqueue-refund`, { type: 'generation_job', id: job.id })
      throw error
    }
  }

  private async assertImageAssets(userId: string, options: Record<string, unknown>) {
    const ids = Array.isArray(options.referenceAssetIds) ? options.referenceAssetIds.map(String) : []
    const maskId = typeof options.maskAssetId === 'string' ? options.maskAssetId : undefined
    const allIds = [...new Set([...ids, ...(maskId ? [maskId] : [])])]
    if (!allIds.length) return
    const assets = await this.prisma.asset.findMany({ where: { id: { in: allIds }, userId, deletedAt: null }, select: { id: true, kind: true, mimeType: true } })
    if (assets.length !== allIds.length) throw new NotFoundException('参考图片不存在或不属于当前用户')
    if (assets.some((asset) => asset.kind !== 'IMAGE' || !asset.mimeType.toLowerCase().startsWith('image/'))) throw new BadRequestException('参考图和蒙版必须是图片文件')
  }
  async get(userId: string, id: string) {
    const job = await this.prisma.generationJob.findFirst({ where: { id, userId }, include: { outputs: { include: { asset: true }, orderBy: { position: 'asc' } } } })
    if (!job) throw new NotFoundException('任务不存在')
    const streamMessage = job.kind === 'CHAT' && job.conversationId ? await this.prisma.message.findFirst({ where: { conversationId: job.conversationId, deletedAt: null, metadata: { path: ['jobId'], equals: job.id } }, select: { id: true, content: true, model: true, metadata: true } }) : null
    return { ...job, errorMessage: publicGenerationError(job.kind, job.status, job.errorMessage), stream: streamMessage ? { messageId: streamMessage.id, content: streamMessage.content, model: streamMessage.model, metadata: streamMessage.metadata } : null, outputs: job.outputs.map((output) => ({ ...output, asset: { ...output.asset, size: Number(output.asset.size), contentUrl: `/v1/assets/${output.asset.id}/content` } })) }
  }
  async list(userId: string, kind?: JobKind) {
    const jobs = await this.prisma.generationJob.findMany({ where: { userId, kind }, orderBy: { createdAt: 'desc' }, take: 100, include: { outputs: { include: { asset: true }, orderBy: { position: 'asc' } } } })
    return jobs.map((job) => ({ ...job, errorMessage: publicGenerationError(job.kind, job.status, job.errorMessage), outputs: job.outputs.map((output) => ({ ...output, asset: { ...output.asset, size: Number(output.asset.size), contentUrl: `/v1/assets/${output.asset.id}/content` } })) }))
  }
  async cancel(userId: string, id: string) {
    const job = await this.get(userId, id)
    if (job.status !== JobStatus.QUEUED && job.status !== JobStatus.RUNNING) return job
    const queueJob = await this.queue.getJob(id)
    if (queueJob && !await queueJob.isActive()) await queueJob.remove()
    const cancelled = await this.prisma.generationJob.updateMany({ where: { id, userId, status: { in: ['QUEUED', 'RUNNING'] } }, data: { status: 'CANCELLED', completedAt: new Date() } })
    if (!cancelled.count) return this.get(userId, id)
    await this.prisma.pluginUsage.updateMany({ where: { jobId: id, status: 'QUEUED' }, data: { status: 'CANCELLED' } })
    if (job.creditCost > 0) await this.credits.mutate(userId, job.creditCost, 'REFUND', '取消生成任务退款', `job:${id}:cancel-refund`, { type: 'generation_job', id })
    return this.get(userId, id)
  }
}
