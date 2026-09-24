/**
 * 模型厂商识别与徽标元数据。
 * 供 ModelCatalogPicker / ModelBadge / 消息头部等共用，避免各处重复正则。
 * 颜色全部引用 tokens.css 中的 --studio-vendor-* 变量，不在此处硬编码色值。
 */

export interface VendorInfo {
  key: string
  label: string
}

export interface VendorLike {
  vendor?: { key?: string; name?: string } | null
  provider?: { key?: string; name?: string; type?: string } | null
  displayName?: string
  upstreamModel?: string | null
}

/** 有专用品牌色 token（--studio-vendor-{key}）的厂商 */
const KNOWN_VENDOR_KEYS = new Set([
  'openai',
  'anthropic',
  'google',
  'deepseek',
  'qwen',
  'doubao',
  'kimi',
  'zhipu',
  'minimax',
  'hunyuan',
  'stepfun',
  'longcat',
])

export function inferVendor(item: VendorLike): VendorInfo {
  const hay = `${item.vendor?.key || ''} ${item.vendor?.name || ''} ${item.displayName || ''} ${item.upstreamModel || ''}`.toLowerCase()
  if (/gpt|openai|(^|[^a-z])o\d(?:-|$)/.test(hay)) return { key: 'openai', label: 'OpenAI' }
  if (/deepseek/.test(hay)) return { key: 'deepseek', label: 'DeepSeek' }
  if (/grok|xai/.test(hay)) return { key: 'xai', label: 'xAI' }
  if (/claude|anthropic/.test(hay)) return { key: 'anthropic', label: 'Anthropic' }
  if (/gemini|google/.test(hay)) return { key: 'google', label: 'Google' }
  if (/qwen|通义|千问/.test(hay)) return { key: 'qwen', label: '通义千问' }
  if (/doubao|豆包|bytedance|seed-\d/.test(hay)) return { key: 'doubao', label: '豆包' }
  if (/kimi|moonshot|月之暗面/.test(hay)) return { key: 'kimi', label: 'Kimi' }
  if (/zhipu|z-ai|智谱|\bglm\b|glm[-_.]/.test(hay)) return { key: 'zhipu', label: '智谱 GLM' }
  if (/minimax/.test(hay)) return { key: 'minimax', label: 'MiniMax' }
  if (/hunyuan|混元|(^|[^a-z])hy[34]([^a-z]|$)/.test(hay)) return { key: 'hunyuan', label: '腾讯混元' }
  if (/stepfun|阶跃|(^|[^a-z])step[-_.]/.test(hay)) return { key: 'stepfun', label: '阶跃星辰' }
  if (/longcat/.test(hay)) return { key: 'longcat', label: 'LongCat' }
  if (item.vendor?.name && item.vendor.key && item.vendor.key !== 'other') {
    return { key: item.vendor.key, label: item.vendor.name }
  }
  return { key: 'other', label: '其他模型' }
}

/** 厂商品牌色（CSS 变量引用），未知厂商回退 default */
export function vendorColor(key: string): string {
  const normalized = key.toLowerCase()
  return `var(--studio-vendor-${KNOWN_VENDOR_KEYS.has(normalized) ? normalized : 'default'})`
}

/** 徽标首字符（无 logo 图片时的字母方案） */
export function vendorInitial(info: VendorInfo): string {
  const label = info.label.trim()
  if (!label) return '?'
  // 中文厂商名取第一个汉字，英文取首字母大写
  return label[0]!.toUpperCase()
}
