import { JobKind, JobStatus } from '@prisma/client'

export function publicGenerationError(kind: JobKind, status: JobStatus, errorMessage?: string | null) {
  if (status === JobStatus.CANCELLED) return '任务已取消'
  if (status !== JobStatus.FAILED) return null

  const message = (errorMessage || '').toLowerCase()
  const subject = kind === JobKind.VIDEO ? '视频生成' : kind === JobKind.CHAT ? '回复生成' : kind === JobKind.COMMERCE ? '商品素材生成' : '图片生成'

  if (/content.?policy|moderation|safety|unsafe|blocked|sensitive|审核|敏感/.test(message)) {
    return '请求内容未通过安全检查，请调整描述后重试。'
  }
  if (/429|rate.?limit|too many requests|quota/.test(message)) {
    return `${subject}请求较多，请稍后重试。`
  }
  if (/timeout|timed out|504|等待超时/.test(message)) {
    return `${subject}等待超时，请稍后重试。`
  }
  if (/非公网|dns 解析失败|eacces/.test(message)) {
    return `${subject}结果下载失败，请稍后重试。`
  }
  if (/no eligible|503|service unavailable|overload|capacity|暂时不可用|暂无可用/.test(message)) {
    return `${subject}服务暂时繁忙，请稍后重试或切换模型。`
  }
  return `${subject}暂时未能完成，请稍后重试。`
}
