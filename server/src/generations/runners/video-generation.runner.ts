import { Injectable, Logger } from '@nestjs/common'
import { AssetKind, GenerationJob, Prisma, ProviderType } from '@prisma/client'
import { AssetsService } from '../../assets/assets.service'
import { PrismaService } from '../../prisma/prisma.service'
import { ProvidersService, ResolvedProvider } from '../../providers/providers.service'
import { GenerationJobCancelledError, GenerationRunner } from '../generation-runners'
import { GenerationOutputService } from '../generation-output.service'
import { readResponseBytes } from '../../common/response-bytes'
import { fetchNoRedirect, fetchPublicMedia } from '../../common/outbound-http'
import { canFailoverHttpStatus, postProviderForm, postProviderJson, providerFetch } from '../provider-request.client'

const MAX_GENERATED_VIDEO_BYTES = 500 * 1024 * 1024
import { ProviderRequestError, ReconciliationRequiredError, TerminalProviderJobError, TerminalSettlementError } from '../generation-provider-errors'
import { normalizeVideoOptions, videoCapabilities } from '../video-options'
import { GenerationSettlementService } from '../generation-settlement.service'
import { ProviderAttemptAuditService } from '../provider-attempt-audit.service'
import { localizedCostMicros } from '../../billing/micros'
import { pluginAugmentedPrompt } from '../plugin-prompt'

type ProviderPayload = {
  [key: string]: unknown
  data?: Array<Record<string, unknown>> | Record<string, unknown>
}

class JobCancelledError extends GenerationJobCancelledError {}

@Injectable()
export class VideoGenerationRunner implements GenerationRunner {
  readonly kind = 'VIDEO' as const
  private readonly logger = new Logger(VideoGenerationRunner.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly assets: AssetsService,
    private readonly providers: ProvidersService,
    private readonly outputs: GenerationOutputService,
    private readonly attemptAudit: ProviderAttemptAuditService,
    private readonly settlement: GenerationSettlementService,
  ) {}

  private provider(resolved: ResolvedProvider, path: string, body: unknown, timeoutMs = resolved.timeoutMs) {
    return postProviderJson<ProviderPayload>(resolved, path, body, this.providers.buildRequestHeaders(resolved), ProviderRequestError, timeoutMs)
  }

  private providerForm(resolved: ResolvedProvider, path: string, form: FormData) {
    return postProviderForm<ProviderPayload>(resolved, path, form, this.providers.buildRequestHeaders(resolved, 'openai', undefined), ProviderRequestError)
  }

  private canFailover(error: unknown) {
    return canFailoverHttpStatus(error, (value): value is ProviderRequestError => value instanceof ProviderRequestError)
  }

  private async withProviderFailover<T>(task: GenerationJob, capability: 'CHAT' | 'IMAGE' | 'VIDEO' | 'COMMERCE', execute: (provider: ResolvedProvider) => Promise<T>) {
    const options = task.options as Record<string, unknown>
    const candidates = await this.providers.resolveCandidates(task.userId, String(options.requestedModel || task.model), capability, options)
    const attempts: Array<Record<string, unknown>> = Array.isArray(options.providerAttempts) ? [...options.providerAttempts] : []
    let lastError: unknown
    for (const candidate of candidates) {
      const startedAt = Date.now()
      const attemptMetadata = { providerId: candidate.providerId || null, routeId: candidate.routeId || null, credentialId: candidate.credentialId || null }
      const providerAttempt = await this.attemptAudit.start({ generationId: task.id, provider: `${candidate.source}:${candidate.type}`, model: candidate.model, metadata: attemptMetadata as Prisma.InputJsonValue })
      let result: T
      try {
        result = await execute(candidate)
      } catch (error) {
        lastError = error
        const message = error instanceof Error ? error.message : 'Provider request failed'
        await this.attemptAudit.fail({ id: providerAttempt.id, generationId: task.id, errorCode: error instanceof ProviderRequestError && error.status ? `HTTP_${error.status}` : 'PROVIDER_ERROR', errorMessage: message, metadata: { ...attemptMetadata, latencyMs: Date.now() - startedAt } as Prisma.InputJsonValue })
        attempts.push({ source: candidate.source, providerId: candidate.providerId, credentialId: candidate.credentialId, routeId: candidate.routeId, label: candidate.label, model: candidate.model, status: 'failed', latencyMs: Date.now() - startedAt, error: message.slice(0, 500), at: new Date().toISOString() })
        try { await this.providers.recordCandidateResult(candidate, false, message) } catch (reason) { this.logger.warn(`Provider health write failed: ${reason instanceof Error ? reason.message : String(reason)}`) }
        await this.updateRunningTask(task, { options: { ...options, providerAttempts: attempts } as Prisma.InputJsonValue })
        if (!this.canFailover(error)) break
        continue
      }
      await this.attemptAudit.succeed({ id: providerAttempt.id, generationId: task.id, metadata: { ...attemptMetadata, latencyMs: Date.now() - startedAt } as Prisma.InputJsonValue })
      attempts.push({ source: candidate.source, providerId: candidate.providerId, credentialId: candidate.credentialId, routeId: candidate.routeId, label: candidate.label, model: candidate.model, status: 'succeeded', latencyMs: Date.now() - startedAt, at: new Date().toISOString() })
      try { await this.providers.recordCandidateResult(candidate, true) } catch (reason) { this.logger.warn(`Provider health write failed: ${reason instanceof Error ? reason.message : String(reason)}`) }
      const originalPricing = task.pricingSnapshot && typeof task.pricingSnapshot === 'object' && !Array.isArray(task.pricingSnapshot) ? task.pricingSnapshot as Record<string, unknown> : {}
      await this.updateRunningTask(task, { provider: `${candidate.source}:${candidate.type}`, providerChannelId: candidate.providerId || null, userCredentialId: candidate.credentialId || null, userModelRouteId: candidate.source === 'user' ? candidate.routeId || null : null, model: candidate.model, pricingSnapshot: { ...originalPricing, source: candidate.source, presetKey: candidate.presetKey || '', model: candidate.model, settlementCurrency: candidate.settlementCurrency, creditValueMicros: candidate.creditValueMicros, pricingUsdExchangeRateMicros: candidate.pricingUsdExchangeRateMicros, inputCreditsPerMillion: candidate.inputCreditsPerMillion, outputCreditsPerMillion: candidate.outputCreditsPerMillion, inputCostMicrosPerMillion: candidate.inputCostMicrosPerMillion, outputCostMicrosPerMillion: candidate.outputCostMicrosPerMillion, imageCostMicros: candidate.imageCostMicros, videoCostMicros: candidate.videoCostMicros } as Prisma.InputJsonValue, options: { ...options, providerAttempts: attempts, successfulRouteId: candidate.routeId, successfulCredentialId: candidate.credentialId } as Prisma.InputJsonValue, settlementStatus: 'RECONCILING' }, true)
      return { result, provider: candidate, providerAttemptId: providerAttempt.id }
    }
    throw lastError || new Error('没有可用的模型渠道')
  }

  async run(task: GenerationJob) {
    await this.outputs.cleanup(task, { requireActiveLease: true })
    const options = task.options as Record<string, unknown>
    const prompt = await pluginAugmentedPrompt(this.prisma, task)
    const execution = await this.withProviderFailover(task, 'VIDEO', async (resolved) => {
      const capabilities = videoCapabilities(resolved.videoCapabilities)
      const normalized = normalizeVideoOptions(options, resolved.videoCapabilities)
      let payload: ProviderPayload = {}
      let providerJobId = task.providerJobId && task.providerChannelId === resolved.providerId ? task.providerJobId : undefined
      if (!providerJobId) {
        const fields = {
          model: resolved.model,
          prompt,
          resolution: normalized.resolution,
          duration: normalized.duration,
          aspect_ratio: normalized.aspectRatio,
          ...(resolved.type === ProviderType.SUB2API ? {} : {
            size: normalized.resolution,
            seconds: normalized.duration,
          }),
        }
        const referenceAssetIds = Array.isArray(options.referenceAssetIds)
          ? [...new Set(options.referenceAssetIds.map(String).filter((id) => /^[A-Za-z0-9_-]{1,100}$/.test(id)))].slice(0, 1)
          : []
        // 首帧/尾帧：可选图片资产，经 multipart 以 first_frame_image / last_frame_image 转发上游
        const frameIds = [options.firstFrameAssetId, options.lastFrameAssetId]
          .filter((id): id is string => typeof id === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(id))
          .slice(0, 2)
        const frameAssets: Array<{ slot: 'first_frame_image' | 'last_frame_image'; file: Buffer; mimeType: string; name: string }> = []
        for (const [slot, id] of [['first_frame_image', frameIds[0]], ['last_frame_image', frameIds[1]]] as const) {
          if (!id) continue
          const asset = await this.assets.readForUser(task.userId, id)
          frameAssets.push({ slot, file: Buffer.from(asset.file), mimeType: asset.mimeType, name: asset.name })
        }
        if (referenceAssetIds.length || frameAssets.length) {
          const form = new FormData()
          for (const [key, value] of Object.entries(fields)) form.append(key, String(value))
          if (referenceAssetIds.length) {
            const reference = await this.assets.readForUser(task.userId, referenceAssetIds[0])
            form.append('input_reference', new Blob([new Uint8Array(reference.file)], { type: reference.mimeType }), reference.name)
          }
          for (const frame of frameAssets) {
            form.append(frame.slot, new Blob([new Uint8Array(frame.file)], { type: frame.mimeType }), frame.name)
          }
          payload = await this.providerForm(resolved, capabilities.createPath, form)
        } else {
          payload = await this.provider(resolved, capabilities.createPath, fields)
        }
        const immediateUrl = this.videoResultUrl(payload)
        if (immediateUrl) return { resolved, payload, url: immediateUrl }
        providerJobId = this.videoJobId(payload)
        if (!providerJobId) throw new ProviderRequestError('视频上游未返回任务 ID 或结果地址', 502)
        await this.updateRunningTask(task, { providerJobId, updatedAt: new Date() }, true)
      }
      const deadline = Date.now() + capabilities.maxPollSeconds * 1000
      while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, capabilities.pollIntervalMs))
        await this.assertNotCancelled(task.id)
        payload = await this.providerGet(resolved, this.videoPath(capabilities.statusPath, providerJobId))
        const status = this.videoStatus(payload)
        const resultUrl = this.videoResultUrl(payload)
        await this.updateRunningTask(task, { updatedAt: new Date() }, true)
        if (resultUrl) return { resolved, payload, url: resultUrl }
        if (['failed', 'error', 'cancelled', 'canceled', 'rejected'].includes(status)) throw new TerminalProviderJobError(this.videoError(payload) || '视频上游生成失败', 502)
        if (['completed', 'succeeded', 'success', 'done'].includes(status)) return { resolved, payload, url: this.videoPath(capabilities.contentPath, providerJobId) }
      }
      throw new ProviderRequestError('视频生成等待超时', 504)
    })

    const { resolved, url } = execution.result
    await this.assertNotCancelled(task.id)
    const result = await this.videoBytes(url, resolved)
    await this.assertNotCancelled(task.id)
    const extension = result.mimeType.includes('webm') ? 'webm' : result.mimeType.includes('quicktime') ? 'mov' : 'mp4'
    const normalized = normalizeVideoOptions(options, resolved.videoCapabilities)
    const asset = await this.outputs.storeAndLink(task, {
      data: result.bytes,
      projectId: task.projectId || undefined,
      name: `生成视频.${extension}`,
      mimeType: result.mimeType,
      kind: AssetKind.VIDEO,
      metadata: { purpose: 'generated', prompt: task.prompt, model: task.model, jobId: task.id, position: 0, options: normalized },
    })
    try { await this.assertNotCancelled(task.id) } catch (error) { await this.assets.remove(task.userId, asset.id); throw error }
    await this.updateRunningTask(task, {
      upstreamCostMicros: localizedCostMicros(execution.provider.videoCostMicros, execution.provider.pricingUsdExchangeRateMicros),
    }, true)
    await this.settlement.settleNonChat(task.id, execution.providerAttemptId)
  }

  private async updateRunningTask(task: GenerationJob, data: Prisma.GenerationJobUncheckedUpdateManyInput, reconciliationRequired = false) {
    try {
      const updated = await this.prisma.generationJob.updateMany({
        where: { id: task.id, status: 'RUNNING', lockedBy: task.lockedBy, leaseVersion: task.leaseVersion, leaseExpiresAt: { gt: new Date() } },
        data,
      })
      if (updated.count !== 1) throw new Error('Generation worker lease was lost')
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误'
      if (reconciliationRequired) throw new ReconciliationRequiredError(`视频任务持久化失败：${message}`)
      throw new TerminalSettlementError(`视频任务状态写入失败：${message}`)
    }
  }

  private videoPath(template: string, id: string) {
    return template.replaceAll('{id}', encodeURIComponent(id))
  }

  private videoJobId(payload: ProviderPayload) {
    const data = payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data) ? payload.data as Record<string, unknown> : {}
    return [payload.id, payload.request_id, payload.requestId, payload.task_id, payload.taskId, data.id, data.request_id, data.requestId, data.task_id, data.taskId]
      .find((value): value is string => typeof value === 'string' && value.length > 0)
  }

  private videoStatus(payload: ProviderPayload) {
    const data = payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data) ? payload.data as Record<string, unknown> : {}
    return String(payload.status || payload.state || data.status || data.state || '').toLowerCase()
  }

  private videoError(payload: ProviderPayload) {
    const error = payload.error
    if (typeof error === 'string') return error
    if (error && typeof error === 'object' && !Array.isArray(error) && typeof (error as Record<string, unknown>).message === 'string') return String((error as Record<string, unknown>).message)
    return typeof payload.message === 'string' ? payload.message : ''
  }

  private videoResultUrl(payload: ProviderPayload): string | undefined {
    const direct = [payload.output_url, payload.video_url, payload.url].find((value): value is string => typeof value === 'string' && value.length > 0)
    if (direct) return direct
    const data = payload.data
    if (Array.isArray(data)) {
      const first = data.find((item) => item && typeof item === 'object') as Record<string, unknown> | undefined
      return first ? [first.output_url, first.video_url, first.url].find((value): value is string => typeof value === 'string' && value.length > 0) : undefined
    }
    if (data && typeof data === 'object') return this.videoResultUrl(data as ProviderPayload)
    const output = payload.output
    if (output && typeof output === 'object' && !Array.isArray(output)) return this.videoResultUrl(output as ProviderPayload)
    return undefined
  }

  private async providerGet(resolved: ResolvedProvider, path: string) {
    let response: Response
    try { response = await this.providerFetch(resolved, `${resolved.baseUrl}${path}`, { headers: this.providers.buildRequestHeaders(resolved, 'openai', undefined), signal: AbortSignal.timeout(resolved.timeoutMs) }) }
    catch (error) { throw new ProviderRequestError(error instanceof Error ? error.message : 'Provider network request failed') }
    if (!response.ok) {
      await response.text().catch(() => '')
      throw new ProviderRequestError(`Provider returned ${response.status}`, response.status)
    }
    return response.json() as Promise<ProviderPayload>
  }

  private async videoBytes(input: string, resolved: ResolvedProvider) {
    let url: URL
    try { url = new URL(input, `${resolved.baseUrl}/`) } catch { throw new ProviderRequestError('视频上游返回了无效的结果地址', 502) }
    const providerOrigin = new URL(resolved.baseUrl).origin
    const sameOrigin = url.origin === providerOrigin
    const headers = sameOrigin ? this.providers.buildRequestHeaders(resolved, 'openai', undefined) : undefined
    const signal = AbortSignal.timeout(Math.max(resolved.timeoutMs, 300_000))
    let response: Response
    try {
      if (sameOrigin && resolved.type === ProviderType.LOCAL_WORKER) response = await fetchNoRedirect(url, { headers, signal })
      else if (sameOrigin) response = await this.providerFetch(resolved, url, { headers, signal })
      else response = await fetchPublicMedia(url, { signal }, { allowProxy: resolved.source !== 'user' })
    } catch (error) {
      throw new ProviderRequestError(error instanceof Error ? error.message : '视频结果下载失败', 502)
    }
    if (!response.ok) throw new ProviderRequestError(`视频下载返回 ${response.status}`, response.status)
    let bytes: Uint8Array
    try { bytes = await readResponseBytes(response, MAX_GENERATED_VIDEO_BYTES, 'Provider 视频') }
    catch { throw new ProviderRequestError('视频下载超过 500 MB', 502) }
    if (!bytes.length) throw new ProviderRequestError('视频上游返回了空文件', 502)
    const contentType = (response.headers.get('content-type') || 'video/mp4').split(';')[0].toLowerCase()
    return { bytes, mimeType: contentType.startsWith('video/') ? contentType : 'video/mp4' }
  }

  private providerFetch(resolved: ResolvedProvider, input: string | URL, init: RequestInit) {
    return providerFetch(resolved, input, init)
  }

  private async assertNotCancelled(jobId: string) {
    const job = await this.prisma.generationJob.findUnique({ where: { id: jobId }, select: { status: true } })
    if (!job || job.status === 'CANCELLED') throw new JobCancelledError('Generation job was cancelled')
  }

}
