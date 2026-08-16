import { BadRequestException } from '@nestjs/common'

export type ImageOutputFormat = 'png' | 'jpeg' | 'webp'
export type ImageBackground = 'auto' | 'opaque' | 'transparent'

export type NormalizedImageOptions = {
  size: string
  quality: string
  count: number
  outputFormat: ImageOutputFormat
  background: ImageBackground
  outputCompression?: number
  referenceAssetIds: string[]
  maskAssetId?: string
}

export type ImageCapabilityConfig = {
  sizes: string[]
  qualities: string[]
  outputFormats: ImageOutputFormat[]
  backgrounds: ImageBackground[]
  maxCount: number
  defaultSize: string
  defaultQuality: string
  supportsReference: boolean
  supportsMask: boolean
  resolutionPricing: Record<string, number>
}

const OUTPUT_FORMATS = new Set<ImageOutputFormat>(['png', 'jpeg', 'webp'])
const BACKGROUNDS = new Set<ImageBackground>(['auto', 'opaque', 'transparent'])
const DEFAULT_CAPABILITIES: ImageCapabilityConfig = { sizes: ['1024x1024', '1536x1024', '1024x1536', '2048x2048', '4096x4096'], qualities: ['low', 'medium', 'high'], outputFormats: ['png', 'jpeg', 'webp'], backgrounds: ['auto', 'opaque', 'transparent'], maxCount: 4, defaultSize: '1024x1024', defaultQuality: 'medium', supportsReference: true, supportsMask: false, resolutionPricing: {} }

export function imageResolutionTier(size: string) {
  const [width, height] = size.toLowerCase().split('x').map(Number)
  const edge = Math.max(width || 0, height || 0)
  return edge >= 4096 ? '4K' : edge >= 2048 ? '2K' : '1K'
}

function pricingMap(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const result: Record<string, number> = {}
  for (const [key, price] of Object.entries(value as Record<string, unknown>)) {
    const credits = Number(price)
    if (['1K', '2K', '4K'].includes(key.toUpperCase()) && Number.isInteger(credits) && credits >= 0 && credits <= 100000) result[key.toUpperCase()] = credits
  }
  return result
}

export function imageCapabilities(value: unknown): ImageCapabilityConfig {
  const root = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
  const raw = root.imageCapabilities && typeof root.imageCapabilities === 'object' && !Array.isArray(root.imageCapabilities) ? root.imageCapabilities as Record<string, unknown> : root
  const sizes = Array.isArray(raw.sizes) ? raw.sizes.map(String).filter((item) => /^\d{3,5}x\d{3,5}$/.test(item)).slice(0, 30) : DEFAULT_CAPABILITIES.sizes
  const qualities = Array.isArray(raw.qualities) ? raw.qualities.map(String).filter((item) => ['low', 'medium', 'high'].includes(item)).slice(0, 3) : DEFAULT_CAPABILITIES.qualities
  const outputFormats = Array.isArray(raw.outputFormats) ? raw.outputFormats.map((item) => String(item).toLowerCase().replace('jpg', 'jpeg') as ImageOutputFormat).filter((item): item is ImageOutputFormat => OUTPUT_FORMATS.has(item)).slice(0, 3) : DEFAULT_CAPABILITIES.outputFormats
  const backgrounds = Array.isArray(raw.backgrounds) ? raw.backgrounds.map(String).filter((item): item is ImageBackground => BACKGROUNDS.has(item as ImageBackground)).slice(0, 3) : DEFAULT_CAPABILITIES.backgrounds
  const maxCount = Number.isInteger(Number(raw.maxCount)) ? Math.max(1, Math.min(10, Number(raw.maxCount))) : DEFAULT_CAPABILITIES.maxCount
  const defaultSize = sizes.includes(String(raw.defaultSize)) ? String(raw.defaultSize) : sizes[0] || DEFAULT_CAPABILITIES.defaultSize
  const defaultQuality = qualities.includes(String(raw.defaultQuality)) ? String(raw.defaultQuality) : qualities[0] || DEFAULT_CAPABILITIES.defaultQuality
  return { sizes: sizes.length ? sizes : DEFAULT_CAPABILITIES.sizes, qualities: qualities.length ? qualities : DEFAULT_CAPABILITIES.qualities, outputFormats: outputFormats.length ? outputFormats : DEFAULT_CAPABILITIES.outputFormats, backgrounds: backgrounds.length ? backgrounds : DEFAULT_CAPABILITIES.backgrounds, maxCount, defaultSize, defaultQuality, supportsReference: raw.supportsReference === undefined ? DEFAULT_CAPABILITIES.supportsReference : Boolean(raw.supportsReference), supportsMask: raw.supportsMask === undefined ? DEFAULT_CAPABILITIES.supportsMask : Boolean(raw.supportsMask), resolutionPricing: pricingMap(raw.resolutionPricing) }
}

export function imageCreditCost(size: string, configuredCapabilities: unknown, fallback: number) {
  const tier = imageResolutionTier(size)
  const configured = imageCapabilities(configuredCapabilities).resolutionPricing[tier]
  if (configured !== undefined) return configured
  return Math.max(0, fallback) * (tier === '4K' ? 4 : tier === '2K' ? 2 : 1)
}

export function normalizeImageOptions(options: Record<string, unknown>, configuredCapabilities?: unknown): NormalizedImageOptions {
  const capabilities = imageCapabilities(configuredCapabilities)
  const size = String(options.size || capabilities.defaultSize)
  const quality = String(options.quality || capabilities.defaultQuality).toLowerCase()
  const count = Math.max(1, Math.min(10, Number(options.count || 1)))
  if (!capabilities.sizes.includes(size)) throw new BadRequestException('当前图片模型不支持该尺寸')
  if (!capabilities.qualities.includes(quality)) throw new BadRequestException('当前图片模型不支持该质量')
  if (count > capabilities.maxCount) throw new BadRequestException(`当前图片模型最多一次生成 ${capabilities.maxCount} 张`)
  const rawFormat = String(options.outputFormat || capabilities.outputFormats[0] || 'png').toLowerCase().replace('jpg', 'jpeg') as ImageOutputFormat
  const rawBackground = String(options.background || capabilities.backgrounds[0] || 'auto').toLowerCase() as ImageBackground
  const referenceAssetIds = Array.isArray(options.referenceAssetIds) ? [...new Set(options.referenceAssetIds.map(String).filter((item) => /^[a-zA-Z0-9_-]{1,100}$/.test(item)))].slice(0, 4) : []
  const maskAssetId = typeof options.maskAssetId === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(options.maskAssetId) ? options.maskAssetId : undefined
  if (referenceAssetIds.length && !capabilities.supportsReference) throw new BadRequestException('当前图片模型不支持参考图')
  if (maskAssetId && !capabilities.supportsMask) throw new BadRequestException('当前图片模型不支持蒙版编辑')
  if (maskAssetId && !referenceAssetIds.length) throw new BadRequestException('使用蒙版前请先添加参考图')
  if (!OUTPUT_FORMATS.has(rawFormat)) throw new BadRequestException('图片输出格式仅支持 PNG、JPEG 或 WebP')
  if (!BACKGROUNDS.has(rawBackground)) throw new BadRequestException('图片背景参数无效')
  if (!capabilities.outputFormats.includes(rawFormat)) throw new BadRequestException('当前图片模型不支持该输出格式')
  if (!capabilities.backgrounds.includes(rawBackground)) throw new BadRequestException('当前图片模型不支持该背景')
  if (rawFormat === 'jpeg' && rawBackground === 'transparent') throw new BadRequestException('JPEG 不支持透明背景')

  const compression = options.outputCompression === undefined ? undefined : Number(options.outputCompression)
  if (compression !== undefined && (!Number.isFinite(compression) || compression < 0 || compression > 100)) {
    throw new BadRequestException('图片压缩质量必须在 0 到 100 之间')
  }
  return {
    size,
    quality,
    count,
    outputFormat: rawFormat,
    background: rawBackground,
    referenceAssetIds,
    ...(maskAssetId ? { maskAssetId } : {}),
    ...(compression === undefined ? {} : { outputCompression: Math.round(compression) }),
  }
}

export function identifyImageFormat(bytes: Uint8Array): ImageOutputFormat | undefined {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'png'
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8) return 'jpeg'
  if (bytes.length >= 12 && Buffer.from(bytes.subarray(0, 4)).toString('ascii') === 'RIFF' && Buffer.from(bytes.subarray(8, 12)).toString('ascii') === 'WEBP') return 'webp'
  return undefined
}

export function detectImageFormat(bytes: Uint8Array, fallback: ImageOutputFormat): ImageOutputFormat {
  return identifyImageFormat(bytes) || fallback
}

export function imageFormatMetadata(format: ImageOutputFormat) {
  if (format === 'jpeg') return { extension: 'jpg', mimeType: 'image/jpeg' }
  return { extension: format, mimeType: `image/${format}` }
}
