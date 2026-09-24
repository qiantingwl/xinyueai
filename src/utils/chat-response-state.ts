import type { Message } from '../types'

export type ChatResponsePhase = 'thinking' | 'search' | 'reasoning' | 'answer' | 'done'

export interface ChatResponseActivity {
  isGenerating: boolean
  activeJobId: string
}

export interface ChatResponseState {
  phase: ChatResponsePhase
  isStreaming: boolean
  isPending: boolean
  shouldRender: boolean
  hasProcess: boolean
  isProcessRunning: boolean
  processTitle: string
  processStatus: '实时更新' | '部分完成' | '已完成'
  reasoningSummary: string
}

export function summarizeChatReasoning(reasoning?: string) {
  const value = reasoning?.replace(/\s+/g, ' ').trim() || ''
  if (!value) return ''
  if (/planning.*answer.*citation/i.test(value)) return '已规划中文回答结构，并安排资料引用'
  if (/planning|outlin/i.test(value) && value.length < 180) return '已分析问题并规划回答结构'
  if (/analy[sz]|reasoning/i.test(value) && value.length < 180) return '已完成问题分析和关键信息梳理'
  if (/^[\x00-\x7F]+$/.test(value) && value.length < 180) return '已完成问题分析与回答组织'
  return value.length > 320 ? `${value.slice(0, 320)}…` : value
}

function withThinkingTime(label: '思考中' | '已思考' | '正在搜索', elapsedSeconds?: number) {
  const seconds = Math.max(0, Math.round(Number(elapsedSeconds || 0)))
  return seconds > 0 ? `${label}（用时 ${seconds} 秒）` : label
}

/** 豆包检索摘要 / DeepSeek「已思考（用时 Xs）」一行标题 */
export function chatProcessHeadline(
  message: Message,
  options: { isStreaming?: boolean; elapsedSeconds?: number } = {},
) {
  const search = message.webSearch
  if (search) {
    if (search.status === 'searching' || (options.isStreaming && search.status !== 'completed' && search.status !== 'failed')) {
      return withThinkingTime('正在搜索', options.elapsedSeconds)
    }
    const queries = search.queries.length
    const sources = search.sources.length
    if (queries && sources) return `搜索 ${queries} 个关键词，参考 ${sources} 篇资料`
    if (queries) return `搜索 ${queries} 个关键词`
    if (sources) return `参考 ${sources} 篇资料`
    return search.status === 'failed' ? '搜索未完成' : '已搜索'
  }
  if (options.isStreaming && !message.content.trim()) return withThinkingTime('思考中', options.elapsedSeconds)
  return withThinkingTime('已思考', options.elapsedSeconds)
}

export function resolveChatResponseState(
  message: Message,
  activity: ChatResponseActivity
): ChatResponseState {
  const isAssistant = message.role === 'assistant'
  const isStreaming = isAssistant
    && activity.isGenerating
    && Boolean(activity.activeJobId)
    && message.generationJobId === activity.activeJobId
  const reasoningSummary = summarizeChatReasoning(message.reasoning)
  const isProcessRunning = isStreaming || message.webSearch?.status === 'searching'
  const shouldRender = Boolean(message.content.trim())
  const isPending = isStreaming && !shouldRender && !message.reasoning?.trim()
  const hasHiddenReasoning = Number(message.reasoningTokens || 0) > 0
  const hasProcess = Boolean(isStreaming || message.webSearch || reasoningSummary || hasHiddenReasoning)

  let phase: ChatResponsePhase = 'done'
  if (isProcessRunning) {
    if (message.webSearch?.status === 'searching') phase = 'search'
    else if (shouldRender) phase = 'answer'
    else if (message.reasoning?.trim()) phase = 'reasoning'
    else phase = 'thinking'
  }

  const processTitle = chatProcessHeadline(message, {
    isStreaming: isProcessRunning,
    elapsedSeconds: message.thinkingSeconds,
  })

  const processStatus = isProcessRunning
    ? '实时更新'
    : message.webSearch?.status === 'failed' ? '部分完成' : '已完成'

  return {
    phase,
    isStreaming,
    isPending,
    shouldRender,
    hasProcess,
    isProcessRunning,
    processTitle,
    processStatus,
    reasoningSummary,
  }
}
