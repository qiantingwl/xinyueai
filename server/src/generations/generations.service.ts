import { InjectQueue } from '@nestjs/bullmq'
import { BadRequestException, ForbiddenException, HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { GenerationJob, JobKind, JobStatus, PluginCapability, Prisma, UserRole } from '@prisma/client'
import { Queue } from 'bullmq'
import { CreditsService } from '../credits/credits.service'
import { PrismaService } from '../prisma/prisma.service'
import { ProvidersService } from '../providers/providers.service'
import { ModerationService } from '../moderation/moderation.service'
import { imageCapabilities, imageCreditCost, imageResolutionTier, normalizeImageOptions } from './image-options'
import { normalizeVideoOptions, videoCapabilities, videoCreditCost } from './video-options'
import { PluginsService } from '../plugins/plugins.service'
import { ResourceAccessService } from '../common/resource-access.service'
import { GenerationEventsService } from './generation-events.service'
import { GenerationLifecycleService } from './generation-lifecycle.service'
import { BillingTransactionsService } from '../credits/billing-transactions.service'
import { FeatureFlagsService } from '../features/feature-flags.service'
import { PricingResolverService } from '../billing/pricing-resolver.service'
import { TokenizerService } from '../billing/tokenizer.service'
import { TokenQuotaService, type QuotaReservation } from '../billing/token-quota.service'
import { ChatContextService } from './chat-context.service'
import { publicGenerationDetailSelect, publicGenerationListSelect, toPublicGeneration, toPublicGenerationEvent, type PublicGenerationDto, type PublicGenerationEventDto } from './public-generation.dto'
import { GenerationReconciliationService } from './generation-reconciliation.service'
import { isUserOwnedChatFree, parseQuotaReservationRefs } from './chat-billing'

interface CreateJobInput { kind: JobKind; prompt: string; model?: string; projectId?: string; conversationId?: string; options: Record<string, unknown>; idempotencyKey?: string }
interface RequestTrace { requestId?: string; traceId?: string }

@Injectable()
export class GenerationsService {
  constructor(private readonly prisma: PrismaService, private readonly credits: CreditsService, private readonly billingTransactions: BillingTransactionsService, private readonly featureFlags: FeatureFlagsService, private readonly providers: ProvidersService, private readonly moderation: ModerationService, private readonly plugins: PluginsService, private readonly access: ResourceAccessService, private readonly eventsService: GenerationEventsService, private readonly lifecycle: GenerationLifecycleService, private readonly pricing: PricingResolverService, private readonly tokenizer: TokenizerService, private readonly tokenQuota: TokenQuotaService, private readonly chatContext: ChatContextService, private readonly reconciliation: GenerationReconciliationService, @InjectQueue('generation') private readonly queue: Queue) {}
  async create(userId: string, input: CreateJobInput, trace: RequestTrace = {}): Promise<PublicGenerationDto> {
    const idempotencyKey = input.idempotencyKey ? `${userId}:${input.idempotencyKey}` : undefined
    if (input.idempotencyKey) {
      const existing = await this.prisma.generationJob.findFirst({ where: { userId, idempotencyKey }, select: publicGenerationListSelect })
      if (existing) return toPublicGeneration(existing)
    }
    const imagePromptTask = input.kind === 'CHAT' && input.options.taskType === 'IMAGE_PROMPT_EXTRACTION'
    if (imagePromptTask) {
      const assetId = typeof input.options.assetId === 'string' ? input.options.assetId.trim() : ''
      const mode = typeof input.options.mode === 'string' ? input.options.mode.trim().toUpperCase() : 'GENERAL'
      const language = typeof input.options.language === 'string' ? input.options.language.trim() : 'zh-CN'
      const allowedModes = new Set(['GENERAL', 'CONCISE', 'STRUCTURED', 'GRAPHIC_DESIGN', 'JSON', 'FLUX', 'MIDJOURNEY', 'STABLE_DIFFUSION'])
      if (!assetId) throw new BadRequestException('请选择需要反推提示词的图片')
      if (!allowedModes.has(mode)) throw new BadRequestException('图片反推模式无效')
      if (!['zh-CN', 'en-US', 'ja-JP'].includes(language)) throw new BadRequestException('输出语言无效')
      const [settings, asset] = await Promise.all([
        this.prisma.systemSetting.upsert({ where: { id: 'global' }, update: {}, create: { id: 'global' } }),
        this.prisma.asset.findFirst({ where: { id: assetId, deletedAt: null, ...this.access.assetWhere(userId) }, select: { id: true, kind: true, mimeType: true, size: true } }),
      ])
      if (!await this.featureFlags.resolve('generation.image_prompt_extraction', settings.imagePromptEnabled, userId)) throw new ForbiddenException('图片反推功能暂未开放')
      if (!asset) throw new NotFoundException('图片不存在或你没有访问权限')
      if (asset.kind !== 'IMAGE' || !asset.mimeType.toLowerCase().startsWith('image/')) throw new BadRequestException('只能反推图片文件')
      if (asset.size > BigInt(20 * 1024 * 1024)) throw new BadRequestException('图片不能超过 20 MB')
      const billingMode = ['PLATFORM', 'USER_BYOK'].includes(settings.imagePromptBillingMode) ? settings.imagePromptBillingMode : 'USER_CREDITS'
      input.prompt = '分析图片并生成可复用的图像生成提示词'
      input.model = settings.imagePromptModelKey.trim() || undefined
      input.options = {
        taskType: 'IMAGE_PROMPT_EXTRACTION',
        assetId,
        mode,
        language,
        billingMode,
        providerSource: billingMode === 'USER_BYOK' ? 'user' : 'platform',
        maxOutputTokens: 1800,
      }
    }
    const moderationSource = input.kind === 'CHAT' ? 'CHAT' : input.kind === 'COMMERCE' ? 'COMMERCE' : 'IMAGE'
    await this.moderation.inspect(userId, moderationSource, input.prompt, { conversationId: input.conversationId || null, projectId: input.projectId || null, kind: input.kind })
    const [project, conversation] = await Promise.all([
      input.projectId ? this.prisma.project.findFirst({ where: { id: input.projectId, archivedAt: null, ...this.access.projectWhere(userId) }, select: { id: true, teamId: true, instructions: true, team: { select: { status: true, billingEnabled: true } }, activeSkillVersion: { select: { id: true, version: true, name: true, content: true, enabled: true } } } }) : null,
      input.conversationId ? this.prisma.conversation.findFirst({ where: { id: input.conversationId, userId }, select: { id: true, projectId: true, temporary: true } }) : null,
    ])
    const temporaryConversation = input.conversationId ? Boolean(conversation?.temporary) : input.options?.temporaryConversation === true
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
    const creationToolOptions = creationTool?.options && typeof creationTool.options === 'object' && !Array.isArray(creationTool.options) ? creationTool.options as Record<string, unknown> : {}
    const creationToolUsesWorker = creationToolOptions.executionMode === 'WORKER'
    if (creationTool) {
      const referenceAssetIds = Array.isArray(input.options.referenceAssetIds) ? input.options.referenceAssetIds.filter((value) => typeof value === 'string' && value.trim()) : []
      if (!referenceAssetIds.length) throw new BadRequestException('图片工具需要一张参考图片')
      if (creationToolOptions.inputMode === 'MASK' && !(typeof input.options.maskAssetId === 'string' && input.options.maskAssetId.trim())) throw new BadRequestException('当前图片工具需要先绘制或上传蒙版')
      if (creationToolUsesWorker && !creationTool.model?.trim()) throw new BadRequestException('图片工具尚未绑定专用 Worker 模型')
    }
    const requestedModel = creationToolUsesWorker ? creationTool?.model || input.model : input.model || assistant?.defaultModel || plugin?.recommendedModel || undefined
    const resolved = await this.providers.resolve(userId, requestedModel, capability, input.options)
    if (creationToolUsesWorker && resolved.type !== 'LOCAL_WORKER') throw new BadRequestException('图片工具必须绑定本地 Worker 渠道')
    const priceVersion = resolved.presetKey && !resolved.presetKey.startsWith('private:')
      ? await this.prisma.modelPriceVersion.findFirst({ where: { modelPreset: { key: resolved.presetKey } }, orderBy: { version: 'desc' } })
      : null
    const projectSkillSnapshot = input.kind === 'CHAT' && project?.activeSkillVersion?.enabled ? { id: project.activeSkillVersion.id, version: project.activeSkillVersion.version, name: project.activeSkillVersion.name, content: project.activeSkillVersion.content } : undefined
    const projectInstructions = input.kind === 'CHAT' ? project?.instructions.trim() || undefined : undefined
    const normalizedOptions: Record<string, unknown> = input.kind === 'IMAGE' || input.kind === 'COMMERCE'
      ? { ...input.options, ...(creationTool ? { creationTool: { id: creationTool.id, title: creationTool.title, instruction: creationTool.prompt, options: creationTool.options, executionMode: creationToolUsesWorker ? 'WORKER' : 'GENERIC' } } : {}), ...normalizeImageOptions(input.options, resolved.imageCapabilities) }
      : input.kind === 'VIDEO'
        ? { ...input.options, ...normalizeVideoOptions(input.options, resolved.videoCapabilities) }
        : { ...input.options, ...(resolved.options?.contextWindow ? { contextWindow: resolved.options.contextWindow } : {}), ...(projectSkillSnapshot ? { projectSkill: projectSkillSnapshot } : {}), ...(projectInstructions ? { projectInstructions } : {}) }
    if (input.kind === 'IMAGE' || input.kind === 'COMMERCE' || input.kind === 'VIDEO') await this.assertImageAssets(userId, normalizedOptions)
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
    const billedToPlatform = imagePromptTask && input.options.billingMode === 'PLATFORM'
    const byokPlanFree = resolved.source === 'user' && effectivePlan?.byokMode === 'FREE'
    const byokFree = (input.kind === 'CHAT' && isUserOwnedChatFree(resolved.source, effectivePlan?.byokMode, resolved.inputCreditsPerMillion, resolved.outputCreditsPerMillion)) || byokPlanFree
    if (byokPlanFree) unitCreditCost = 0
    const userTokenFree = byokFree || billedToPlatform
    const effectiveInputRate = userTokenFree ? 0 : resolved.inputCreditsPerMillion
    const effectiveOutputRate = userTokenFree ? 0 : resolved.outputCreditsPerMillion
    const tokenPricingConfigured = input.kind === 'CHAT' && (effectiveInputRate > 0 || effectiveOutputRate > 0)
    if (input.kind === 'CHAT' && !billedToPlatform && !byokFree && !tokenPricingConfigured) {
      throw new BadRequestException('当前文字模型尚未配置 Token 价格，请先在管理端同步或设置模型价格')
    }
    const baseCreditCost = input.kind === 'CHAT' ? 0 : Math.max(0, unitCreditCost * quantity)
    const maxOutputTokens = input.kind === 'CHAT' ? Math.max(1, Math.min(32768, Number(normalizedOptions.maxOutputTokens || 4096))) : 0
    const inputConversation = input.kind === 'CHAT' && input.conversationId
      ? await this.prisma.conversation.findFirst({
          where: { id: input.conversationId, userId },
          select: { activeLeafId: true, messages: { where: { deletedAt: null }, orderBy: { createdAt: 'asc' }, take: 250, select: { id: true, parentId: true, role: true, content: true } } },
        })
      : null
    const inputMessages = inputConversation
      ? this.chatContext.activePath(inputConversation.messages, inputConversation.activeLeafId)
      : []
    const contextMessages = input.kind === 'CHAT'
      ? this.chatContext.select(inputMessages, resolved.model, { ...input.options, maxOutputTokens, ...(resolved.options?.contextWindow ? { contextWindow: resolved.options.contextWindow } : {}) })
      : []
    const latestContextMessage = contextMessages.at(-1)
    const contextIncludesPrompt = latestContextMessage?.role === 'USER' && latestContextMessage.content.trim() === input.prompt.trim()
    const estimatedInputTokens = input.kind === 'CHAT'
      ? this.tokenizer.estimateMessages([...contextMessages, ...(!contextIncludesPrompt ? [{ role: 'user', content: input.prompt }] : []), ...(projectInstructions ? [{ role: 'system', content: projectInstructions }] : []), ...(projectSkillSnapshot ? [{ role: 'system', content: projectSkillSnapshot.content }] : [])], resolved.model)
      : 0
    const reservedTokenUnits = input.kind === 'CHAT' ? Math.ceil((estimatedInputTokens * effectiveInputRate + maxOutputTokens * effectiveOutputRate) / 1_000_000) : 0
    const tokenQuotaUnits = effectivePlan?.monthlyQuotaUnits ?? 0n
    const dailyQuotaUnits = effectivePlan?.dailyQuotaUnits ?? 0n
    const overageEnabled = input.kind === 'CHAT' && effectivePlan?.tokenOverageMode === 'OVERAGE_CREDITS' && (effectivePlan.tokenOverageRate || 0) > 0 && !billedToPlatform && !byokFree
    const overageRatePercent = overageEnabled ? effectivePlan?.tokenOverageRate || 0 : 0
    const reservedOverageCredits = overageEnabled ? Math.ceil(reservedTokenUnits * overageRatePercent / 100) : 0
    let tokenQuotaEnabled = input.kind === 'CHAT' && tokenPricingConfigured && tokenQuotaUnits > 0n && !billedToPlatform
    if (input.kind === 'CHAT' && tokenPricingConfigured && !tokenQuotaEnabled && !overageEnabled && !imagePromptTask) {
      throw new HttpException('当前套餐没有可用的文字计费额度', HttpStatus.PAYMENT_REQUIRED)
    }
    const quotaIdentity = subscription?.id || 'FREE'
    const quotaScopeKey = `MONTHLY:${quotaIdentity}`
    const quotaPeriodStart = subscription?.currentPeriodStart || new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1))
    const quotaPeriodEnd = subscription?.currentPeriodEnd || new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 1))
    const dailyStart = new Date()
    dailyStart.setUTCHours(0, 0, 0, 0)
    const dailyEnd = new Date(dailyStart.getTime() + 86_400_000)
    const dailyScopeKey = `DAILY:${quotaIdentity}:${dailyStart.toISOString().slice(0, 10)}`
    // Persist the expected reservation shape before creating any reservation.
    // If the worker dies between reserve() and the options update, recovery can
    // distinguish a complete hold from a partial/orphaned hold.
    const expectedReservationSpecs = tokenQuotaEnabled && reservedTokenUnits > 0
      ? [{ scopeKey: quotaScopeKey, periodStart: quotaPeriodStart, periodEnd: quotaPeriodEnd, grantedUnits: tokenQuotaUnits }, ...(dailyQuotaUnits > 0n ? [{ scopeKey: dailyScopeKey, periodStart: dailyStart, periodEnd: dailyEnd, grantedUnits: dailyQuotaUnits }] : [])]
      : []
    const expectedReservationCount = expectedReservationSpecs.length
    const expectedReservationScopes = expectedReservationSpecs.map((spec) => spec.scopeKey)
    const directTokenCreditCost = imagePromptTask && !billedToPlatform
      ? reservedTokenUnits
      : reservedOverageCredits
    let creditCost = billedToPlatform ? 0 : baseCreditCost + (tokenQuotaEnabled ? 0 : directTokenCreditCost)
    const chargedBaseCreditCost = billedToPlatform ? 0 : baseCreditCost
    let chargedReservedTokenCredits = billedToPlatform ? 0 : directTokenCreditCost
    let billingSource = billedToPlatform ? 'PLATFORM' : byokFree ? 'BYOK_FREE' : tokenQuotaEnabled ? 'SUBSCRIPTION_QUOTA' : imagePromptTask ? 'CREATION_CREDITS' : 'OVERAGE_CREDITS'
    const billingTeamId = project?.teamId && project.team?.status === 'ACTIVE' && project.team.billingEnabled ? project.teamId : null
    let conversationId = input.conversationId
    let createdConversationId: string | undefined
    if (!conversationId && input.kind !== 'CHAT' && !temporaryConversation) {
      conversationId = createdConversationId = await this.createVisualConversation(userId, {
        kind: input.kind,
        prompt: input.prompt,
        model: resolved.model,
        projectId: project?.id || input.projectId || null,
      })
    }
    let job: GenerationJob
    try {
      job = await this.prisma.$transaction(async (tx) => {
        const pricingSnapshot = this.pricing.snapshot({ version: priceVersion?.version || 0, presetKey: resolved.presetKey || '', source: resolved.source, model: resolved.model, provider: `${resolved.source}:${resolved.type}`, unitCreditCost, settlementCurrency: resolved.settlementCurrency, creditValueMicros: resolved.creditValueMicros, pricingUsdExchangeRateMicros: resolved.pricingUsdExchangeRateMicros, inputRate: effectiveInputRate, outputRate: effectiveOutputRate, baseInputRate: resolved.baseInputCreditsPerMillion, baseOutputRate: resolved.baseOutputCreditsPerMillion, groupRatePercent: resolved.creditRatePercent, billingSource, overageRatePercent, inputCreditsPerMillion: effectiveInputRate, outputCreditsPerMillion: effectiveOutputRate, inputCostMicrosPerMillion: resolved.inputCostMicrosPerMillion, outputCostMicrosPerMillion: resolved.outputCostMicrosPerMillion, imageCostMicros: resolved.imageCostMicros, videoCostMicros: resolved.videoCostMicros, expectedReservationCount, expectedReservationScopes, expectedReservationUnits: String(reservedTokenUnits) })
        const created = await tx.generationJob.create({ data: { userId, requestId: trace.requestId, traceId: trace.traceId, projectId: input.projectId, conversationId, billingTeamId, kind: input.kind, provider: `${resolved.source}:${resolved.type}`, providerChannelId: resolved.providerId, userCredentialId: resolved.credentialId, userModelRouteId: resolved.source === 'user' ? resolved.routeId : undefined, priceVersionId: priceVersion?.id, pricingSnapshot: pricingSnapshot as Prisma.InputJsonValue, model: resolved.model, prompt: input.prompt, options: { ...normalizedOptions, requestedModel, assistantId: assistant?.id, ...(temporaryConversation ? { temporaryConversation: true } : {}), ...(plugin ? { pluginId: plugin.id, pluginSnapshot: { name: plugin.name, version: plugin.version, capability: plugin.capability } } : {}), presetKey: resolved.presetKey, subscriptionId: subscription?.id, planCode: subscription?.plan.code, billing: { accountType: billingTeamId ? 'TEAM' : 'PERSONAL', teamId: billingTeamId, subscriptionId: subscription?.id, unitCreditCost, baseCreditCost: chargedBaseCreditCost, reservedTokenUnits, reservedTokenCredits: chargedReservedTokenCredits, maxOutputTokens, baseInputCreditsPerMillion: resolved.baseInputCreditsPerMillion, baseOutputCreditsPerMillion: resolved.baseOutputCreditsPerMillion, inputCreditsPerMillion: effectiveInputRate, outputCreditsPerMillion: effectiveOutputRate, groupRatePercent: resolved.creditRatePercent, overageRatePercent, billingSource, creditValueMicros: resolved.creditValueMicros, estimatedInputTokens, quotaEnabled: tokenQuotaEnabled, quotaScopeKey, quotaPeriodStart: quotaPeriodStart.toISOString(), quotaPeriodEnd: quotaPeriodEnd.toISOString(), expectedReservationCount, expectedReservationScopes, expectedReservationUnits: String(reservedTokenUnits) }, privacy: { trainingOptOut: privacy?.trainingOptOut ?? true, shareUsageAnalytics: privacy?.shareUsageAnalytics ?? false } } as Prisma.InputJsonValue, creditCost, revenueMicros: Math.min(2_000_000_000, creditCost * resolved.creditValueMicros), idempotencyKey } })
        if (plugin) await tx.pluginUsage.create({ data: { userId, pluginId: plugin.id, jobId: created.id, capability: pluginCapability } })
        return created
      })
    } catch (error) {
      if (createdConversationId) await this.prisma.conversation.deleteMany({ where: { id: createdConversationId, userId } }).catch(() => undefined)
      if (idempotencyKey && error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await this.prisma.generationJob.findUnique({ where: { idempotencyKey }, select: publicGenerationListSelect })
        if (existing) return toPublicGeneration(existing)
      }
      throw error
    }
    let spent = false
    let quotaReservations: QuotaReservation[] = []
    try {
      if (tokenQuotaEnabled && reservedTokenUnits > 0) {
        const reservationSpecs = expectedReservationSpecs
        try {
          for (const spec of reservationSpecs) {
            const reservation = await this.tokenQuota.reserve({ userId, subscriptionId: subscription?.id, ...spec, units: BigInt(reservedTokenUnits), generationId: job.id, metadata: { model: resolved.model, estimatedInputTokens, scopeKey: spec.scopeKey } as Prisma.InputJsonValue })
            if (reservation) quotaReservations.push(reservation)
          }
        } catch (error) {
          const quotaInsufficient = error instanceof HttpException && error.getStatus() === HttpStatus.PAYMENT_REQUIRED
          if (!quotaInsufficient || !overageEnabled) throw error
          for (const reservation of quotaReservations) {
            await this.tokenQuota.release({ userId, reservationId: reservation.reservationId, quotaId: reservation.quotaId, generationId: job.id, metadata: { reason: 'OVERAGE_FALLBACK' } as Prisma.InputJsonValue })
          }
          quotaReservations = []
          tokenQuotaEnabled = false
          billingSource = 'OVERAGE_CREDITS'
          chargedReservedTokenCredits = reservedOverageCredits
          creditCost = chargedBaseCreditCost + chargedReservedTokenCredits
        }
        const currentOptions = job.options && typeof job.options === 'object' && !Array.isArray(job.options) ? job.options as Record<string, unknown> : {}
        const currentBilling = currentOptions.billing && typeof currentOptions.billing === 'object' && !Array.isArray(currentOptions.billing) ? currentOptions.billing as Record<string, unknown> : {}
        const currentPricing = job.pricingSnapshot && typeof job.pricingSnapshot === 'object' && !Array.isArray(job.pricingSnapshot) ? job.pricingSnapshot as Record<string, unknown> : {}
        job = await this.prisma.generationJob.update({ where: { id: job.id }, data: {
          creditCost,
          revenueMicros: Math.min(2_000_000_000, creditCost * resolved.creditValueMicros),
          pricingSnapshot: { ...currentPricing, billingSource, expectedReservationCount: tokenQuotaEnabled ? reservationSpecs.length : 0, expectedReservationScopes: tokenQuotaEnabled ? reservationSpecs.map((spec) => spec.scopeKey) : [], expectedReservationUnits: String(tokenQuotaEnabled ? reservedTokenUnits : 0) } as Prisma.InputJsonValue,
          options: { ...currentOptions, billing: { ...currentBilling, quotaEnabled: tokenQuotaEnabled, billingSource, reservedTokenCredits: chargedReservedTokenCredits, quotaId: quotaReservations[0]?.quotaId, quotaReservations: quotaReservations.map((item) => ({ reservationId: item.reservationId, quotaId: item.quotaId, reservedUnits: item.reservedUnits.toString() })), expectedReservationCount: tokenQuotaEnabled ? reservationSpecs.length : 0, expectedReservationScopes: tokenQuotaEnabled ? reservationSpecs.map((spec) => spec.scopeKey) : [], expectedReservationUnits: String(tokenQuotaEnabled ? reservedTokenUnits : 0) } } as Prisma.InputJsonValue,
        } })
      }
      if (creditCost > 0) {
        await this.credits.spend(userId, creditCost, imagePromptTask ? '图片提示词反推' : `${input.kind} 生成任务`, `job:${job.id}:spend`, { type: 'generation_job', id: job.id }, billingTeamId)
        spent = true
        await this.billingTransactions.safely(this.billingTransactions.recordPreAuth({ userId, generationId: job.id, amount: creditCost, provider: job.provider, idempotencyKey: `job:${job.id}:pre-auth`, metadata: { billingTeamId, pricingSnapshot: job.pricingSnapshot } as Prisma.InputJsonValue }), `${job.id}:pre-auth`)
      }
      await this.prisma.generationJob.update({ where: { id: job.id }, data: { settlementStatus: 'RESERVED' } })
      await this.eventsService.append(job.id, 'queued', { requestId: trace.requestId, traceId: trace.traceId, kind: job.kind, model: job.model })
      await this.queue.add(input.kind.toLowerCase(), { jobId: job.id }, { jobId: job.id, attempts: 3, backoff: { type: 'exponential', delay: 2000 }, removeOnComplete: 1000, removeOnFail: 5000 })
      const created = await this.prisma.generationJob.findUniqueOrThrow({ where: { id: job.id }, select: publicGenerationListSelect })
      return toPublicGeneration(created)
    } catch (error) {
      await this.lifecycle.fail(job.id, 'ENQUEUE_FAILED', error instanceof Error ? error.message : 'Unable to enqueue')
      await this.prisma.pluginUsage.updateMany({ where: { jobId: job.id, status: 'QUEUED' }, data: { status: 'FAILED', error: 'Unable to enqueue generation job' } })
      if (spent) {
        await this.credits.refund(userId, creditCost, '任务创建失败退款', `job:${job.id}:enqueue-refund`, { type: 'generation_job', id: job.id }, billingTeamId)
        await this.billingTransactions.safely(this.billingTransactions.recordRefund({ userId, generationId: job.id, amount: creditCost, provider: job.provider, idempotencyKey: `job:${job.id}:enqueue-refund`, metadata: { reason: 'ENQUEUE_FAILED', billingTeamId } as Prisma.InputJsonValue }), `${job.id}:enqueue-refund`)
      }
      const reservationsReleased = await this.releaseTokenReservations(job, 'ENQUEUE_FAILED')
      await this.prisma.generationJob.updateMany({ where: { id: job.id }, data: { settlementStatus: reservationsReleased ? (spent ? 'REFUNDED' : 'RELEASED') : 'RECONCILING' } }).catch(() => undefined)
      throw error
    }
  }

  private visualConversationTitle(kind: JobKind, prompt: string) {
    const trimmed = prompt.trim().replace(/\s+/g, ' ').slice(0, 42)
    if (trimmed) return trimmed
    return kind === 'VIDEO' ? '视频生成' : kind === 'COMMERCE' ? '商品视觉' : '图片生成'
  }

  private async createVisualConversation(userId: string, input: { kind: JobKind; prompt: string; model: string; projectId?: string | null }) {
    const title = this.visualConversationTitle(input.kind, input.prompt)
    const conversation = await this.prisma.conversation.create({
      data: {
        userId,
        projectId: input.projectId || undefined,
        title,
        model: input.model.trim() || process.env.AI_CHAT_MODEL || 'gpt-4.1',
        temporary: false,
        messages: { create: { authorId: userId, role: 'USER', content: input.prompt.trim() || title } },
      },
      select: { id: true },
    })
    return conversation.id
  }

  /** Jobs from a temporary chat keep no history, even after their temporary conversation expires. */
  private needsVisualConversation(job: { conversationId: string | null; kind: JobKind; options: Prisma.JsonValue }) {
    if (job.conversationId || job.kind === 'CHAT') return false
    const options = job.options && typeof job.options === 'object' && !Array.isArray(job.options) ? job.options as Record<string, unknown> : {}
    return options.temporaryConversation !== true
  }

  private async attachVisualConversation(userId: string, job: { id: string; kind: JobKind; prompt: string; model: string; projectId: string | null }) {
    const conversationId = await this.createVisualConversation(userId, job)
    const linked = await this.prisma.generationJob.updateMany({ where: { id: job.id, conversationId: null }, data: { conversationId } })
    if (!linked.count) {
      await this.prisma.conversation.deleteMany({ where: { id: conversationId, userId } }).catch(() => undefined)
      return null
    }
    return conversationId
  }

  private async assertImageAssets(userId: string, options: Record<string, unknown>) {
    const ids = Array.isArray(options.referenceAssetIds) ? options.referenceAssetIds.map(String) : []
    const maskId = typeof options.maskAssetId === 'string' ? options.maskAssetId : undefined
    const firstFrameId = typeof options.firstFrameAssetId === 'string' ? options.firstFrameAssetId : undefined
    const lastFrameId = typeof options.lastFrameAssetId === 'string' ? options.lastFrameAssetId : undefined
    const allIds = [...new Set([...ids, ...(maskId ? [maskId] : []), ...(firstFrameId ? [firstFrameId] : []), ...(lastFrameId ? [lastFrameId] : [])])]
    if (!allIds.length) return
    const assets = await this.prisma.asset.findMany({ where: { id: { in: allIds }, deletedAt: null, ...this.access.assetWhere(userId) }, select: { id: true, kind: true, mimeType: true } })
    if (assets.length !== allIds.length) throw new NotFoundException('参考图片不存在或你没有访问权限')
    if (assets.some((asset) => asset.kind !== 'IMAGE' || !asset.mimeType.toLowerCase().startsWith('image/'))) throw new BadRequestException('参考图和蒙版必须是图片文件')
  }
  async get(userId: string, id: string): Promise<PublicGenerationDto> {
    let job = await this.prisma.generationJob.findFirst({ where: { id, userId }, select: publicGenerationDetailSelect })
    if (!job) throw new NotFoundException('任务不存在')
    if (this.needsVisualConversation(job)) {
      await this.attachVisualConversation(userId, job)
      job = await this.prisma.generationJob.findFirst({ where: { id, userId }, select: publicGenerationDetailSelect })
      if (!job) throw new NotFoundException('任务不存在')
    }
    const streamMessage = job.kind === 'CHAT' && job.conversationId ? await this.prisma.message.findFirst({ where: { conversationId: job.conversationId, deletedAt: null, metadata: { path: ['jobId'], equals: job.id } }, select: { id: true, content: true, model: true, metadata: true } }) : null
    return toPublicGeneration(job, streamMessage ? { messageId: streamMessage.id, content: streamMessage.content, model: streamMessage.model, metadata: streamMessage.metadata } : null)
  }
  async events(userId: string, id: string): Promise<PublicGenerationEventDto[]> {
    const job = await this.prisma.generationJob.findFirst({ where: { id, userId }, select: { id: true, kind: true } })
    if (!job) throw new NotFoundException('任务不存在')
    return (await this.eventsService.list(id)).map((event) => toPublicGenerationEvent(event, job.kind))
  }
  async retry(userId: string, id: string, trace: RequestTrace = {}): Promise<PublicGenerationDto> {
    const job = await this.prisma.generationJob.findFirst({ where: { id, userId } })
    if (!job) throw new NotFoundException('任务不存在')
    if (job.status !== JobStatus.FAILED && job.status !== JobStatus.CANCELLED) throw new BadRequestException('只有失败或已取消的任务可以重试')
    const options = job.options && typeof job.options === 'object' && !Array.isArray(job.options) ? job.options as Record<string, unknown> : {}
    const { providerAttempts: _providerAttempts, successfulRouteId: _successfulRouteId, successfulCredentialId: _successfulCredentialId, ...retryOptions } = options
    return this.create(userId, {
      kind: job.kind,
      prompt: job.prompt,
      model: typeof retryOptions.requestedModel === 'string' ? retryOptions.requestedModel : job.model,
      projectId: job.projectId || undefined,
      conversationId: job.conversationId || undefined,
      options: retryOptions,
      idempotencyKey: `retry:${id}:${randomUUID()}`,
    }, trace)
  }
  async list(userId: string, kind?: JobKind): Promise<PublicGenerationDto[]> {
    const jobs = await this.prisma.generationJob.findMany({ where: { userId, kind }, orderBy: { createdAt: 'desc' }, take: 100, select: publicGenerationListSelect })
    const orphans = jobs.filter((job) => this.needsVisualConversation(job))
    if (orphans.length) {
      for (const job of orphans) await this.attachVisualConversation(userId, job)
      const refreshed = await this.prisma.generationJob.findMany({ where: { userId, kind }, orderBy: { createdAt: 'desc' }, take: 100, select: publicGenerationListSelect })
      return refreshed.map((job) => toPublicGeneration(job))
    }
    return jobs.map((job) => toPublicGeneration(job))
  }
  async cancel(userId: string, id: string): Promise<PublicGenerationDto> {
    const job = await this.get(userId, id)
    if (job.status !== JobStatus.QUEUED && job.status !== JobStatus.RUNNING) return job
    const queueJob = await this.queue.getJob(id)
    const cancelled = await this.lifecycle.cancel(id, userId)
    if (!cancelled) return this.get(userId, id)
    // Reload after the conditional lifecycle transition. A runner may have
    // updated usage or billing metadata immediately before cancellation won
    // the race, so the original read is not a safe source for refunds.
    const current = await this.prisma.generationJob.findUniqueOrThrow({ where: { id } })
    if (current.providerChannelId) await this.providers.cancelLocalWorkerTask(current.providerChannelId, id).catch(() => undefined)
    await this.prisma.pluginUsage.updateMany({ where: { jobId: id, status: 'QUEUED' }, data: { status: 'CANCELLED' } })
    // Cancellation invalidates the worker lease first. Compensation then runs
    // through one idempotent path for both queued and in-flight tasks.
    const reconciled = await this.reconciliation.finalizeTerminal(id, 'CANCELLED')
    const compensationComplete = reconciled
      && ['RELEASED', 'REFUNDED', 'SETTLED'].includes(reconciled.settlementStatus)
    // Keep an incomplete terminal job available so a queued worker can retry
    // compensation instead of waiting for the next process restart.
    if (compensationComplete && queueJob && !await queueJob.isActive()) await queueJob.remove()
    return this.get(userId, id)
  }

  private async releaseTokenReservations(job: GenerationJob, reason: string): Promise<boolean> {
    const options = job.options && typeof job.options === 'object' && !Array.isArray(job.options) ? job.options as Record<string, unknown> : {}
    const billing = options.billing && typeof options.billing === 'object' && !Array.isArray(options.billing) ? options.billing as Record<string, unknown> : {}
    const optionReservations = parseQuotaReservationRefs(billing, { includeQuotaIdAlways: true })
    let databaseLookupSucceeded = true
    let databaseReservations: Awaited<ReturnType<TokenQuotaService['reservationsForGeneration']>> = []
    try {
      databaseReservations = await this.tokenQuota.reservationsForGeneration(job.userId, job.id)
    } catch {
      databaseLookupSucceeded = false
    }
    if (databaseReservations.some((reservation) => reservation.status === 'SETTLED')) return false
    const reservations = new Map(optionReservations.map((reservation) => [reservation.quotaId, reservation]))
    for (const reservation of databaseReservations) {
      if (reservation.status !== 'RESERVED') continue
      reservations.set(reservation.quotaId, { reservationId: reservation.reservationId, quotaId: reservation.quotaId })
    }
    let released = databaseLookupSucceeded
    for (const reservation of reservations.values()) {
      try {
        await this.tokenQuota.release({ userId: job.userId, reservationId: reservation.reservationId, quotaId: reservation.quotaId, generationId: job.id, metadata: { reason } as Prisma.InputJsonValue })
      } catch {
        released = false
      }
    }
    return released
  }
}

