/** Marks a failure whose message was authored here and is therefore safe to persist and show. */
export class UpstreamChannelError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UpstreamChannelError'
  }
}

const statusHints: Record<number, string> = {
  400: '请求被上游拒绝，请检查渠道地址与参数',
  401: '鉴权失败，请检查 API 密钥',
  402: '账户余额不足，请检查渠道充值',
  403: '无访问权限，请检查密钥权限、额度与地区限制',
  404: '接口不存在，请检查 Base URL 是否包含正确的版本前缀',
  408: '上游响应超时',
  413: '请求体超出上游限制',
  429: '触发上游限流，请稍后重试',
}

export function looksLikeUpstreamDump(text: string) {
  return /Provider returned|insufficient balance|payment required|"error"\s*:\s*\{|HTTP[_\s]?\d{3}\s*:?\s*\{/i.test(text)
}

export function publicUpstreamHealthMessage(raw: string, fallback = '上游渠道异常，请检查密钥、余额与网络') {
  const text = raw.trim()
  if (!text) return fallback
  if (!looksLikeUpstreamDump(text) && !/https?:\/\/|sk-[a-z0-9]|[A-Za-z]:\\/i.test(text)) return text.slice(0, 200)
  const matched = text.match(/Provider returned (\d+)/i) || text.match(/HTTP[_\s](\d{3})/i)
  const status = matched ? Number(matched[1]) : 0
  if (status === 402 || /insufficient.?balance|payment.?required/.test(text)) return '上游账户余额不足，请检查渠道充值'
  if (status) {
    const hint = statusHints[status] || (status >= 500 ? '上游服务异常，请稍后重试' : '上游请求未成功')
    return `上游返回 HTTP ${status}：${hint}`
  }
  return fallback
}

/** Upstream response bodies can echo API keys, internal hostnames and other tenants' details, so
 *  diagnostics are limited to the status code plus an actionable hint. */
export function upstreamHttpError(label: string, status: number) {
  const hint = statusHints[status] || (status >= 500 ? '上游服务异常，请稍后重试' : '上游请求未成功')
  return new UpstreamChannelError(`${label}返回 HTTP ${status}：${hint}`)
}

export function upstreamSafeMessage(error: unknown) {
  if (error instanceof UpstreamChannelError) return error.message
  if (error instanceof Error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') return '连接上游渠道超时'
    if (error instanceof SyntaxError) return '上游返回的内容不是合法 JSON，请检查渠道地址是否指向模型接口'
  }
  return '连接上游渠道失败，请检查渠道地址、密钥与网络策略'
}
