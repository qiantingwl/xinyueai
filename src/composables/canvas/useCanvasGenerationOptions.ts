import type { Ref } from 'vue'
import type { CanvasGenerationKind, CanvasGenerationOptions } from '../../types/canvas'
import { findCatalogModel, type CatalogModel } from '../../utils/model-catalog'
import { isDedicatedImageTool, type ImageToolRecord } from '../../utils/image-tools'
import type { FlowEdge, FlowNode } from './useCanvasHistory'

export type ImageCapabilitySet = {
  sizes: string[]
  qualities: string[]
  outputFormats: string[]
  backgrounds: string[]
  maxCount: number
  defaultSize: string
  defaultQuality: string
  resolutionPricing: Record<string, number>
}

export type VideoCapabilitySet = {
  resolutions: string[]
  durations: number[]
  aspectRatios: string[]
  defaultResolution: string
  defaultDuration: number
  defaultAspectRatio: string
  pricing: Record<string, number>
}

export function useCanvasGenerationOptions(input: {
  nodes: Ref<FlowNode[]>
  edges: Ref<FlowEdge[]>
  catalogModels: Ref<CatalogModel[]>
  activeImageTool: (node: FlowNode | null | undefined) => ImageToolRecord | undefined
}) {
  function isGenerationNode(node: FlowNode | null | undefined) {
    return node?.data.kind === 'IMAGE' || node?.data.kind === 'VIDEO' || node?.data.kind === 'CONFIG'
  }

  function activeGenerationKind(node: FlowNode): CanvasGenerationKind {
    return node.data.kind === 'VIDEO' || node.data.generationKind === 'VIDEO' ? 'VIDEO' : 'IMAGE'
  }

  function modelsForCapability(capability: 'CHAT' | CanvasGenerationKind) {
    return input.catalogModels.value.filter((model) => model.capability === capability && model.enabled !== false)
  }

  function modelsForNode(node: FlowNode) {
    if (node.data.kind === 'TEXT') return modelsForCapability('CHAT')
    return modelsForCapability(activeGenerationKind(node))
  }

  function defaultModel(kind: CanvasGenerationKind | 'CHAT') {
    const models = modelsForCapability(kind)
    return models.find((model) => model.isDefault)?.key || models[0]?.key || ''
  }

  function flowNodeModelOptions(id: string) {
    const node = input.nodes.value.find((item) => item.id === id)
    return node ? modelsForNode(node) : []
  }

  function flowNodeGenerationModel(id: string) {
    const node = input.nodes.value.find((item) => item.id === id)
    if (!node) return ''
    if (node.data.kind === 'TEXT') return node.data.model || defaultModel('CHAT')
    return isGenerationNode(node) ? generationModel(node) : ''
  }

  function upstreamNodes(nodeId: string) {
    const visited = new Set<string>()
    const result: FlowNode[] = []
    const visit = (targetId: string) => {
      for (const edge of input.edges.value.filter((item) => item.target === targetId)) {
        if (visited.has(edge.source)) continue
        visited.add(edge.source)
        const source = input.nodes.value.find((node) => node.id === edge.source)
        if (!source) continue
        result.push(source)
        visit(source.id)
      }
    }
    visit(nodeId)
    return result
  }

  function generationContext(node: FlowNode) {
    const upstream = upstreamNodes(node.id)
    const textNodes = upstream.filter((item) => item.data.kind === 'TEXT' && item.data.content.trim())
    const config = upstream.find((item) => item.data.kind === 'CONFIG' && activeGenerationKind(item) === activeGenerationKind(node))
    const referenceAssetIds = [...new Set(upstream.filter((item) => item.data.kind === 'IMAGE' && item.data.assetId).map((item) => item.data.assetId!))].slice(0, 4)
    const dramaPrompt = node.data.shotId ? [
      node.data.sceneName ? `场景：${node.data.sceneName}` : '',
      node.data.characterNames?.length ? `角色：${node.data.characterNames.join('、')}` : '',
      node.data.cameraMotion ? `运镜：${node.data.cameraMotion}` : '',
      node.data.dialogue ? `对白：${node.data.dialogue}` : '',
      node.data.narration ? `旁白：${node.data.narration}` : '',
      node.data.continuity?.shotSize ? `景别：${node.data.continuity.shotSize}` : '',
      node.data.continuity?.cameraAngle ? `机位角度：${node.data.continuity.cameraAngle}` : '',
      node.data.continuity?.composition ? `构图：${node.data.continuity.composition}` : '',
      node.data.continuity?.characterBlocking ? `人物站位：${node.data.continuity.characterBlocking}` : '',
      node.data.continuity?.gazeDirection ? `视线方向：${node.data.continuity.gazeDirection}` : '',
      node.data.continuity?.actionStart ? `动作起始：${node.data.continuity.actionStart}` : '',
      node.data.continuity?.actionEnd ? `动作结束：${node.data.continuity.actionEnd}` : '',
      node.data.continuity?.axisRule ? `轴线规则：${node.data.continuity.axisRule}` : '',
      node.data.continuity?.notes ? `衔接备注：${node.data.continuity.notes}` : ''
    ].filter(Boolean).join('\n') : ''
    const prompts = [node.data.prompt, config?.data.prompt, ...textNodes.map((item) => item.data.content), dramaPrompt]
      .map((item) => item?.trim())
      .filter((item): item is string => Boolean(item))
    return { prompt: [...new Set(prompts)].join('\n\n'), textCount: textNodes.length, referenceAssetIds, config }
  }

  function generationModel(node: FlowNode) {
    const kind = activeGenerationKind(node)
    const inherited = node.data.kind === 'CONFIG' ? '' : generationContext(node).config?.data.model || ''
    const activeTool = node.data.kind === 'IMAGE' ? input.activeImageTool(node) : undefined
    const toolModel = isDedicatedImageTool(activeTool) ? activeTool?.model || '' : ''
    return toolModel || node.data.model || inherited || defaultModel(kind)
  }

  function imageCapabilities(node: FlowNode): ImageCapabilitySet {
    const raw = findCatalogModel(input.catalogModels.value, generationModel(node), 'IMAGE')?.options?.imageCapabilities || {}
    const sizes = raw.sizes?.length ? raw.sizes : ['1024x1024', '1536x1024', '1024x1536']
    const qualities = raw.qualities?.length ? raw.qualities : ['low', 'medium', 'high']
    const outputFormats = raw.outputFormats?.length ? raw.outputFormats : ['png', 'jpeg', 'webp']
    const backgrounds = raw.backgrounds?.length ? raw.backgrounds : ['auto', 'opaque', 'transparent']
    return { sizes, qualities, outputFormats, backgrounds, maxCount: Math.max(1, Math.min(10, raw.maxCount || 1)), defaultSize: raw.defaultSize && sizes.includes(raw.defaultSize) ? raw.defaultSize : sizes[0], defaultQuality: raw.defaultQuality && qualities.includes(raw.defaultQuality) ? raw.defaultQuality : qualities[0], resolutionPricing: raw.resolutionPricing || {} }
  }

  function videoCapabilities(node: FlowNode): VideoCapabilitySet {
    const raw = findCatalogModel(input.catalogModels.value, generationModel(node), 'VIDEO')?.options?.videoCapabilities || {}
    const resolutions = raw.resolutions?.length ? raw.resolutions : ['720p']
    const durations = raw.durations?.length ? raw.durations : [5, 10]
    const aspectRatios = raw.aspectRatios?.length ? raw.aspectRatios : ['16:9', '9:16', '1:1']
    return { resolutions, durations, aspectRatios, defaultResolution: raw.defaultResolution && resolutions.includes(raw.defaultResolution) ? raw.defaultResolution : resolutions[0], defaultDuration: raw.defaultDuration && durations.includes(raw.defaultDuration) ? raw.defaultDuration : durations[0], defaultAspectRatio: raw.defaultAspectRatio && aspectRatios.includes(raw.defaultAspectRatio) ? raw.defaultAspectRatio : aspectRatios[0], pricing: raw.pricing || {} }
  }

  function generationOptions(node: FlowNode): CanvasGenerationOptions {
    const inherited = node.data.kind === 'CONFIG' ? {} : generationContext(node).config?.data.generationOptions || {}
    const current = { ...inherited, ...(node.data.generationOptions || {}) }
    if (activeGenerationKind(node) === 'VIDEO') {
      const capabilities = videoCapabilities(node)
      return { ...current, resolution: capabilities.resolutions.includes(String(current.resolution)) ? current.resolution : capabilities.defaultResolution, duration: capabilities.durations.includes(Number(current.duration)) ? Number(current.duration) : capabilities.defaultDuration, aspectRatio: capabilities.aspectRatios.includes(String(current.aspectRatio)) ? current.aspectRatio : capabilities.defaultAspectRatio }
    }
    const capabilities = imageCapabilities(node)
    return { ...current, size: capabilities.sizes.includes(String(current.size)) ? current.size : capabilities.defaultSize, quality: capabilities.qualities.includes(String(current.quality)) ? current.quality : capabilities.defaultQuality, count: Math.max(1, Math.min(capabilities.maxCount, Number(current.count || 1))), outputFormat: capabilities.outputFormats.includes(String(current.outputFormat)) ? current.outputFormat as CanvasGenerationOptions['outputFormat'] : capabilities.outputFormats[0] as CanvasGenerationOptions['outputFormat'], background: capabilities.backgrounds.includes(String(current.background)) ? current.background as CanvasGenerationOptions['background'] : capabilities.backgrounds[0] as CanvasGenerationOptions['background'] }
  }

  function generationCreditCost(node: FlowNode) {
    const kind = activeGenerationKind(node)
    const model = findCatalogModel(input.catalogModels.value, generationModel(node), kind)
    const base = model?.effectiveCreditCost ?? model?.flatCreditCost ?? 0
    const options = generationOptions(node)
    if (kind === 'VIDEO') {
      const configured = videoCapabilities(node).pricing[`${options.resolution}:${options.duration}`]
      if (configured !== undefined) return configured
      const multiplier = options.resolution === '2160p' ? 4 : options.resolution === '1080p' ? 2 : 1
      return base * multiplier * Math.max(1, Math.ceil(Number(options.duration || 5) / 5))
    }
    const edge = Math.max(...String(options.size).split('x').map(Number))
    const tier = edge >= 4096 ? '4K' : edge >= 2048 ? '2K' : '1K'
    const configured = imageCapabilities(node).resolutionPricing[tier]
    return (configured ?? base * (tier === '4K' ? 4 : tier === '2K' ? 2 : 1)) * Number(options.count || 1)
  }

  function flowNodeGenerationSummary(id: string) {
    const node = input.nodes.value.find((item) => item.id === id)
    if (!node || !isGenerationNode(node)) return ''
    const options = generationOptions(node)
    const summary = activeGenerationKind(node) === 'VIDEO'
      ? `${String(options.resolution || '720p').toUpperCase()} · ${options.duration || 5} 秒 · ${options.aspectRatio || '16:9'}`
      : `${imageSizeLabel(String(options.size || '1024x1024'))} · ${qualityLabel(String(options.quality || 'medium'))}`
    const refs = generationContext(node).referenceAssetIds.length
    return refs ? `${summary} · ${refs} 个参考` : summary
  }

  function imageSizeLabel(value: string) {
    const [width, height] = value.split('x').map(Number)
    const tier = Math.max(width || 0, height || 0) >= 4096 ? '4K' : Math.max(width || 0, height || 0) >= 2048 ? '2K' : '1K'
    return `${tier} · ${width === height ? '正方形' : width > height ? '横向' : '竖向'}`
  }
  function qualityLabel(value: string) { return value === 'low' ? '低' : value === 'high' ? '高' : '标准' }

  return { isGenerationNode, activeGenerationKind, modelsForNode, defaultModel, flowNodeModelOptions, flowNodeGenerationModel, flowNodeGenerationSummary, upstreamNodes, generationContext, generationModel, imageCapabilities, videoCapabilities, generationOptions, generationCreditCost, imageSizeLabel, qualityLabel }
}
