import { Injectable, Logger } from '@nestjs/common'
import { AssetKind, GenerationJob, PluginCapability, Prisma, ProviderType } from '@prisma/client'
import { AssetsService } from '../../assets/assets.service'
import { PrismaService } from '../../prisma/prisma.service'
import { ProvidersService, ResolvedProvider } from '../../providers/providers.service'
import { GenerationJobCancelledError, GenerationRunner } from '../generation-runners'
import { GenerationOutputService } from '../generation-output.service'
import { readResponseBytes } from '../../common/response-bytes'
import { fetchNoRedirect, fetchPublicMedia } from '../../common/outbound-http'
import { localizedCostMicros } from '../../billing/micros'
import { canFailoverHttpStatus, postProviderForm, postProviderJson, providerFetch } from '../provider-request.client'
import { detectImageFormat, identifyImageFormat, imageFormatMetadata, normalizeImageOptions } from '../image-options'
import { GenerationSettlementService } from '../generation-settlement.service'
import { ProviderAttemptAuditService } from '../provider-attempt-audit.service'
import { ReconciliationRequiredError, TerminalSettlementError } from '../generation-provider-errors'
import { loadPublishedPlugin } from '../plugin-prompt'

type ProviderPayload = {
  [key: string]: unknown
  data?: Array<Record<string, unknown>>
}

const MAX_GENERATED_IMAGE_BYTES = 50 * 1024 * 1024

class ImageProviderError extends Error {
  constructor(message: string, readonly status?: number) { super(message) }
}

@Injectable()
export class ImageGenerationRunner implements GenerationRunner {
  readonly kind = 'IMAGE' as const
  private readonly logger = new Logger(ImageGenerationRunner.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly assets: AssetsService,
    private readonly providers: ProvidersService,
    private readonly outputs: GenerationOutputService,
    private readonly attemptAudit: ProviderAttemptAuditService,
    private readonly settlement: GenerationSettlementService,
  ) {}

  async run(task: GenerationJob) {
    await this.outputs.cleanup(task, { requireActiveLease: true })
    const options = task.options as Record<string, unknown>
    const basePrompt = await this.pluginPrompt(task)
    const selectedStyle = typeof options.style === 'string' ? options.style.trim() : ''
    const creationTool = options.creationTool && typeof options.creationTool === 'object' && !Array.isArray(options.creationTool) ? options.creationTool as Record<string, unknown> : null
    const toolInstruction = creationTool && typeof creationTool.instruction === 'string' ? creationTool.instruction.trim() : ''
    const promptedByTool = toolInstruction ? `${basePrompt}\n\n图片编辑工具要求：${toolInstruction}` : basePrompt
    const prompt = selectedStyle ? `${promptedByTool}\n\n视觉风格：${selectedStyle}。保持主体和用户要求不变，将该风格自然应用到构图、光影、色彩与材质。` : promptedByTool
    const count = task.kind === 'COMMERCE' ? Math.max(1, Math.min(Number(options.modules || 8), 12)) : Math.max(1, Math.min(Number(options.count || 1), 10))
    const persistPayload = async (resolved: ResolvedProvider, payload: ProviderPayload) => {
      if (!Array.isArray(payload.data) || !payload.data.length) throw new ImageProviderError('Provider returned no images', 502)
      if (payload.data.length !== count) throw new ImageProviderError(`Provider 图片数量不完整：期望 ${count} 张，实际 ${payload.data.length} 张`, 502)
      const imageOptions = normalizeImageOptions(options, resolved.imageCapabilities)
      try {
        for (const [position, item] of payload.data.entries()) {
          await this.assertNotCancelled(task.id)
          const bytes = await this.imageBytes(item, resolved)
          await this.assertNotCancelled(task.id)
          const format = detectImageFormat(bytes, imageOptions.outputFormat)
          const file = imageFormatMetadata(format)
          const moduleLabel = typeof item.moduleLabel === 'string' ? item.moduleLabel : ''
          const asset = await this.outputs.storeAndLink(task, { data: bytes, projectId: task.projectId || undefined, name: task.kind === 'COMMERCE' ? `${options.creationType || '商品视觉'} ${position + 1}${moduleLabel ? ` - ${moduleLabel}` : ''}.${file.extension}` : `生成图片 ${position + 1}.${file.extension}`, mimeType: file.mimeType, kind: task.kind === 'COMMERCE' ? AssetKind.PRODUCT_PACK : AssetKind.IMAGE, position, metadata: { purpose: 'generated', prompt: task.prompt, model: task.model, jobId: task.id, position, moduleLabel, creationType: options.creationType, platform: options.platform, options: { ...options, outputFormat: format } } })
          try { await this.assertNotCancelled(task.id) } catch (error) { await this.assets.remove(task.userId, asset.id); throw error }
        }
      } catch (error) {
        // A partially persisted attempt must not leak outputs into the next failover candidate.
        try { await this.outputs.cleanup(task, { requireActiveLease: true }) }
        catch (cleanupError) { throw new ReconciliationRequiredError(`图片部分结果清理失败：${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`) }
        throw error
      }
      return payload
    }
    const execution = await this.withProviderFailover(task, async (resolved) => {
      const imageOptions = normalizeImageOptions(options, resolved.imageCapabilities)
      if (resolved.type === ProviderType.LOCAL_WORKER) {
        if (task.kind === 'COMMERCE') throw new ImageProviderError('本地图片工具不能作为商品视觉多图模型使用', 400)
        if (count > 1) throw new ImageProviderError('本地图片工具每个任务只返回 1 张图片', 400)
        return { resolved, payload: await persistPayload(resolved, await this.localWorkerImage(task, resolved, prompt, imageOptions)) }
      }
      if (resolved.type === ProviderType.POLLINATIONS) {
        if (imageOptions.referenceAssetIds.length || imageOptions.maskAssetId) throw new ImageProviderError('Pollinations 渠道不支持参考图或蒙版编辑', 400)
        if (task.kind !== 'COMMERCE' && count > 1) throw new ImageProviderError('Pollinations 渠道每次最多生成 1 张图片', 400)
        const [rawWidth, rawHeight] = imageOptions.size.toLowerCase().split('x').map(Number)
        const width = Number.isInteger(rawWidth) ? rawWidth : 1024
        const height = Number.isInteger(rawHeight) ? rawHeight : 1024
        const requestPollinations = async (singlePrompt: string) => {
          const url = this.providers.buildPollinationsImageUrl(resolved.baseUrl, singlePrompt, { model: resolved.model || 'flux', width, height, seed: Math.floor(Math.random() * 2_147_483_647) })
          const response = await this.providerFetch(resolved, url, { headers: this.providers.buildRequestHeaders(resolved, 'openai', undefined), signal: AbortSignal.timeout(resolved.timeoutMs) })
          const contentType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() || ''
          const declaredSize = Number(response.headers.get('content-length') || 0)
          if (!response.ok) throw new ImageProviderError(`Pollinations 返回 ${response.status}: ${(await response.text()).slice(0, 300)}`, response.status)
          if (!contentType.startsWith('image/')) throw new ImageProviderError(`Pollinations 返回了非图片内容：${contentType || '未知类型'}`, 502)
          if (declaredSize > MAX_GENERATED_IMAGE_BYTES) throw new ImageProviderError('Pollinations 返回的图片超过 50 MB', 502)
          const bytes = new Uint8Array(await response.arrayBuffer())
          this.assertValidImageBytes(bytes, 'Pollinations')
          return bytes
        }
        if (task.kind !== 'COMMERCE') return { resolved, payload: await persistPayload(resolved, { data: [{ _generatedBytes: await requestPollinations(prompt) }] }) }
        const labels = this.commerceModuleLabels(String(options.creationType || '详情页'), count)
        const data: Record<string, unknown>[] = []
        for (const [position, label] of labels.entries()) {
          const modulePrompt = `${prompt}\n\n请生成一张完整、可直接发布的中文电商${options.creationType || '详情页'}图片。这是整组 ${count} 张中的第 ${position + 1} 张，页面职责：${label}。目标平台：${options.platform || '自动适配'}。保持同一商品、包装、品牌信息和视觉系统一致，不要拼接多张小图，不要虚构未提供的参数、认证或功效。`
          data.push({ _generatedBytes: await requestPollinations(modulePrompt), moduleLabel: label })
        }
        return { resolved, payload: await persistPayload(resolved, { data }) }
      }
      const request = async (singlePrompt: string, n: number) => {
        const fields = { model: resolved.model, prompt: singlePrompt, n, size: imageOptions.size, quality: imageOptions.quality, output_format: imageOptions.outputFormat, background: imageOptions.background, ...(imageOptions.outputCompression === undefined ? {} : { output_compression: imageOptions.outputCompression }) }
        if (!imageOptions.referenceAssetIds.length) return this.normalizeImagePayload(await this.provider(resolved, '/images/generations', fields, Math.max(resolved.timeoutMs, 300_000)))
        const form = new FormData()
        for (const [key, value] of Object.entries(fields)) form.append(key, String(value))
        const references = await Promise.all(imageOptions.referenceAssetIds.map((id) => this.assets.readForUser(task.userId, id)))
        for (const [index, reference] of references.entries()) form.append(index === 0 ? 'image' : 'image[]', new Blob([new Uint8Array(reference.file)], { type: reference.mimeType }), reference.name)
        if (imageOptions.maskAssetId) {
          const mask = await this.assets.readForUser(task.userId, imageOptions.maskAssetId)
          form.append('mask', new Blob([new Uint8Array(mask.file)], { type: mask.mimeType }), mask.name)
        }
        return this.normalizeImagePayload(await this.providerForm(resolved, '/images/edits', form))
      }
      if (task.kind !== 'COMMERCE') return { resolved, payload: await persistPayload(resolved, await request(prompt, count)) }
      const labels = this.commerceModuleLabels(String(options.creationType || '详情页'), count)
      const data: Record<string, unknown>[] = []
      for (const [position, label] of labels.entries()) {
        const modulePrompt = `${prompt}\n\n请生成一张完整、可直接发布的中文电商${options.creationType || '详情页'}图片。这是整组 ${count} 张中的第 ${position + 1} 张，页面职责：${label}。目标平台：${options.platform || '自动适配'}。保持同一商品、包装、品牌信息和视觉系统一致，不要拼接多张小图，不要虚构未提供的参数、认证或功效。`
        const result = await request(modulePrompt, 1)
        const item = Array.isArray(result.data) ? result.data[0] : undefined
        if (!item) throw new ImageProviderError(`Provider returned no image for commerce module ${position + 1}`, 502)
        data.push({ ...item, moduleLabel: label })
      }
      return { resolved, payload: await persistPayload(resolved, { data }) }
    })
    const { payload } = execution.result
    await this.updateRunningTask(task, {
      upstreamCostMicros: localizedCostMicros(payload.data!.length * execution.provider.imageCostMicros, execution.provider.pricingUsdExchangeRateMicros),
    }, true)
    await this.settlement.settleNonChat(task.id, execution.providerAttemptId)
  }

  private async withProviderFailover<T>(task: GenerationJob, execute: (provider: ResolvedProvider) => Promise<T>) {
    const options = task.options as Record<string, unknown>
    const capability = task.kind === 'COMMERCE' ? 'COMMERCE' : 'IMAGE'
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
        await this.attemptAudit.fail({ id: providerAttempt.id, generationId: task.id, errorCode: error instanceof ImageProviderError && error.status ? `HTTP_${error.status}` : 'PROVIDER_ERROR', errorMessage: message, metadata: { ...attemptMetadata, latencyMs: Date.now() - startedAt } as Prisma.InputJsonValue })
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
      await this.updateRunningTask(task, { provider: `${candidate.source}:${candidate.type}`, providerChannelId: candidate.providerId || null, userCredentialId: candidate.credentialId || null, userModelRouteId: candidate.source === 'user' ? candidate.routeId || null : null, model: candidate.model, pricingSnapshot: { ...originalPricing, source: candidate.source, presetKey: candidate.presetKey || '', model: candidate.model, settlementCurrency: candidate.settlementCurrency, creditValueMicros: candidate.creditValueMicros, pricingUsdExchangeRateMicros: candidate.pricingUsdExchangeRateMicros, imageCostMicros: candidate.imageCostMicros } as Prisma.InputJsonValue, options: { ...options, providerAttempts: attempts, successfulRouteId: candidate.routeId, successfulCredentialId: candidate.credentialId } as Prisma.InputJsonValue, settlementStatus: 'RECONCILING' }, true)
      return { result, provider: candidate, providerAttemptId: providerAttempt.id }
    }
    throw lastError || new Error('没有可用的模型渠道')
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
      if (reconciliationRequired) throw new ReconciliationRequiredError(`图片任务持久化失败：${message}`)
      throw new TerminalSettlementError(`图片任务状态写入失败：${message}`)
    }
  }

  private async localWorkerImage(task: GenerationJob, resolved: ResolvedProvider, prompt: string, imageOptions: ReturnType<typeof normalizeImageOptions>): Promise<ProviderPayload> {
    const form = new FormData()
    form.append('model', resolved.model); form.append('prompt', prompt); form.append('task_id', task.id)
    const taskOptions = task.options as Record<string, unknown>
    const creationTool = taskOptions.creationTool && typeof taskOptions.creationTool === 'object' && !Array.isArray(taskOptions.creationTool) ? taskOptions.creationTool as Record<string, unknown> : {}
    const configuredOptions = creationTool.options && typeof creationTool.options === 'object' && !Array.isArray(creationTool.options) ? creationTool.options as Record<string, unknown> : {}
    const workerOptionKeys = ['outpaintLeft', 'outpaintRight', 'outpaintTop', 'outpaintBottom', 'fillColor', 'negativePrompt', 'hdStrategy', 'cropMargin', 'resizeLimit', 'steps', 'seed', 'strength']
    const workerOptions = Object.fromEntries(workerOptionKeys.flatMap((key) => {
      const value = taskOptions[key] ?? configuredOptions[key]
      return value === undefined ? [] : [[key, value]]
    }))
    form.append('options', JSON.stringify({ size: imageOptions.size, quality: imageOptions.quality, outputFormat: imageOptions.outputFormat, background: imageOptions.background, ...(imageOptions.outputCompression === undefined ? {} : { outputCompression: imageOptions.outputCompression }), ...workerOptions }))
    const references = await Promise.all(imageOptions.referenceAssetIds.map((id) => this.assets.readForUser(task.userId, id)))
    for (const reference of references) form.append('input', new Blob([new Uint8Array(reference.file)], { type: reference.mimeType }), reference.name)
    if (imageOptions.maskAssetId) { const mask = await this.assets.readForUser(task.userId, imageOptions.maskAssetId); form.append('mask', new Blob([new Uint8Array(mask.file)], { type: mask.mimeType }), mask.name) }
    let response: Response
    try { response = await this.providerFetch(resolved, `${resolved.baseUrl}/process`, { method: 'POST', headers: { ...this.providers.buildRequestHeaders(resolved, 'openai', undefined), 'X-Xinyue-Task-Id': task.id }, body: form, signal: AbortSignal.timeout(resolved.timeoutMs) }) }
    catch (error) { throw new ImageProviderError(`本地 Worker 连接失败：${error instanceof Error ? error.message : '网络错误'}`, 503) }
    const contentType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() || ''
    const declaredSize = Number(response.headers.get('content-length') || 0)
    if (!response.ok) throw new ImageProviderError(`本地 Worker 返回 ${response.status}: ${(await response.text()).slice(0, 500)}`, response.status)
    if (declaredSize > MAX_GENERATED_IMAGE_BYTES) throw new ImageProviderError('本地 Worker 返回的图片超过 50 MB', 502)
    if (contentType.startsWith('image/')) { const bytes = new Uint8Array(await response.arrayBuffer()); this.assertValidImageBytes(bytes, '本地 Worker'); return { data: [{ _generatedBytes: bytes }] } }
    const text = await response.text()
    let payload: ProviderPayload
    try { payload = JSON.parse(text) as ProviderPayload } catch { throw new ImageProviderError('本地 Worker 返回的不是图片或有效 JSON', 502) }
    if (!Array.isArray(payload.data)) { const direct = payload as Record<string, unknown>; if (typeof direct.url === 'string' || typeof direct.b64_json === 'string') payload.data = [direct] }
    if (!Array.isArray(payload.data) || !payload.data.length) throw new ImageProviderError('本地 Worker 未返回图片结果', 502)
    return payload
  }

  private provider(resolved: ResolvedProvider, path: string, body: unknown, timeoutMs = resolved.timeoutMs) {
    return postProviderJson<ProviderPayload>(resolved, path, body, this.providers.buildRequestHeaders(resolved), ImageProviderError, timeoutMs)
  }

  private providerForm(resolved: ResolvedProvider, path: string, form: FormData) {
    return postProviderForm<ProviderPayload>(resolved, path, form, this.providers.buildRequestHeaders(resolved, 'openai', undefined), ImageProviderError)
  }

  private async pluginPrompt(task: GenerationJob) {
    const capability = task.kind === 'COMMERCE' ? PluginCapability.COMMERCE : PluginCapability.IMAGE
    const options = task.options as Record<string, unknown>
    const pluginId = typeof options.pluginId === 'string' ? options.pluginId : ''
    if (!pluginId) return task.prompt
    const plugin = await loadPublishedPlugin(this.prisma, task.userId, pluginId)
    if (!plugin) throw new Error(`插件已停用、未安装或不支持 ${capability} 创作`)
    return [plugin.instruction.trim(), task.prompt, plugin.outputRequirements.trim() ? `输出要求：${plugin.outputRequirements.trim()}` : ''].filter(Boolean).join('\n\n')
  }

  private normalizeImagePayload(payload: ProviderPayload): ProviderPayload {
    if (Array.isArray(payload.data) && payload.data.length) return { ...payload, data: payload.data.map((item) => this.normalizeImageItem(item)) }
    const root = payload as Record<string, unknown>
    for (const candidate of [root.images, root.outputs, root.output, root.result, root.image]) {
      if (Array.isArray(candidate) && candidate.length) { payload.data = candidate.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && !Array.isArray(item))).map((item) => this.normalizeImageItem(item)); if (payload.data.length) return payload }
      if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) { const nested = candidate as Record<string, unknown>; if (['url', 'image_url', 'imageUrl', 'download_url', 'b64_json', 'base64'].some((key) => typeof nested[key] === 'string')) { payload.data = [this.normalizeImageItem(nested)]; return payload } }
    }
    const direct = ['url', 'image_url', 'imageUrl', 'download_url', 'b64_json', 'base64'].find((key) => typeof root[key] === 'string')
    if (direct) payload.data = [this.normalizeImageItem({ [direct]: root[direct] })]
    return payload
  }

  private normalizeImageItem(value: Record<string, unknown>) {
    const url = ['url', 'image_url', 'imageUrl', 'download_url', 'uri'].map((key) => value[key]).find((item): item is string => typeof item === 'string' && item.length > 0)
    const encoded = ['b64_json', 'b64', 'base64'].map((key) => value[key]).find((item): item is string => typeof item === 'string' && item.length > 0)
    return { ...value, ...(url && !value.url ? { url } : {}), ...(encoded && !value.b64_json ? { b64_json: encoded } : {}) }
  }

  private async imageBytes(item: Record<string, unknown>, resolved: ResolvedProvider) {
    if (item._generatedBytes instanceof Uint8Array) { this.assertValidImageBytes(item._generatedBytes, 'Provider'); return item._generatedBytes }
    const encoded = [item.b64_json, item.b64, item.base64].find((value): value is string => typeof value === 'string' && value.length > 0)
    if (encoded) { const data = encoded.includes(',') && encoded.startsWith('data:') ? encoded.slice(encoded.indexOf(',') + 1) : encoded; const bytes = Buffer.from(data, 'base64'); this.assertValidImageBytes(bytes, 'Provider'); return bytes }
    if (typeof item.url !== 'string' || !item.url) throw new ImageProviderError('Provider image response has no data or URL', 502)
    let url: URL
    try { url = new URL(item.url, `${resolved.baseUrl}/`) } catch { throw new ImageProviderError('Provider returned an invalid image URL', 502) }
    const providerOrigin = new URL(resolved.baseUrl).origin
    const sameOrigin = url.origin === providerOrigin
    if (sameOrigin && resolved.type === ProviderType.LOCAL_WORKER) {
      const response = await fetchNoRedirect(url, { headers: this.providers.buildRequestHeaders(resolved, 'openai', undefined), signal: AbortSignal.timeout(resolved.timeoutMs) })
      return this.readDownloadedImage(response)
    }
    if (sameOrigin) {
      const response = await this.providerFetch(resolved, url, { headers: this.providers.buildRequestHeaders(resolved, 'openai', undefined), signal: AbortSignal.timeout(resolved.timeoutMs) })
      return this.readDownloadedImage(response)
    }
    try {
      const response = await fetchPublicMedia(url, { signal: AbortSignal.timeout(resolved.timeoutMs) }, { allowProxy: resolved.source !== 'user' })
      return this.readDownloadedImage(response)
    } catch (error) {
      if (error instanceof ImageProviderError) throw error
      throw new ImageProviderError(error instanceof Error ? error.message : '图片结果下载失败', 502)
    }
  }

  private async readDownloadedImage(response: Response) {
    if (!response.ok) throw new ImageProviderError(`Provider image download returned ${response.status}`, response.status)
    let bytes: Uint8Array
    try { bytes = await readResponseBytes(response, MAX_GENERATED_IMAGE_BYTES, 'Provider 图片') }
    catch { throw new ImageProviderError('Provider image exceeds 50 MB', 502) }
    this.assertValidImageBytes(bytes, 'Provider'); return bytes
  }

  private providerFetch(resolved: ResolvedProvider, input: string | URL, init: RequestInit) {
    return providerFetch(resolved, input, init)
  }

  private async assertNotCancelled(jobId: string) {
    const job = await this.prisma.generationJob.findUnique({ where: { id: jobId }, select: { status: true } })
    if (!job || job.status === 'CANCELLED') throw new GenerationJobCancelledError()
  }

  private commerceModuleLabels(type: string, count: number) {
    const detail = ['首屏主视觉与核心卖点', '用户痛点与使用场景', '产品核心优势', '材质与工艺细节', '功能或使用步骤', '规格尺寸与包装信息', '对比与选择理由', '品质信任与购买引导', '适用人群', '场景延展', '常见问题', '品牌收尾']
    const pack = ['白底商品主图', '品牌氛围主视觉', '核心卖点海报', '细节特写', '使用场景', '包装与配件展示', '规格尺寸图', '社交媒体封面', '促销活动图', '横版广告图', '竖版信息流', '留白文案底图']
    return (type.includes('素材') ? pack : detail).slice(0, count)
  }

  private canFailover(error: unknown) {
    return canFailoverHttpStatus(error, (value): value is ImageProviderError => value instanceof ImageProviderError)
  }

  private assertValidImageBytes(bytes: Uint8Array, label: string) {
    if (bytes.length < 64) throw new ImageProviderError(`${label} returned an empty or truncated image`, 502)
    if (bytes.length > MAX_GENERATED_IMAGE_BYTES) throw new ImageProviderError(`${label} image exceeds 50 MB`, 502)
    if (!identifyImageFormat(bytes)) throw new ImageProviderError(`${label} returned invalid image data`, 502)
  }
}
