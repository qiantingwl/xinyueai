import { normalizeChatUsage, type ChatUsage } from './chat-usage'

export type ChatProtocol = 'openai' | 'anthropic' | 'gemini'
export type ChatStreamResult = { content: string; reasoning?: string; usage?: ChatUsage; providerRequestId?: string }
export type ChatStreamChunk = { delta: string; reasoningDelta: string; usage?: ChatUsage; providerRequestId?: string }
export type ChatContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }
export type ChatProviderContent = string | ChatContentPart[]

export function anthropicMessageContent(content: ChatProviderContent) {
  if (typeof content === 'string') return content
  return content.map((part) => {
    if (part.type === 'text') return { type: 'text', text: part.text }
    const match = /^data:([^;,]+);base64,(.+)$/s.exec(part.image_url.url)
    if (!match) throw new Error('Anthropic 图片输入必须使用 Base64 数据')
    return { type: 'image', source: { type: 'base64', media_type: match[1], data: match[2] } }
  })
}

export function geminiMessageParts(content: ChatProviderContent) {
  if (typeof content === 'string') return [{ text: content }]
  return content.map((part) => {
    if (part.type === 'text') return { text: part.text }
    const match = /^data:([^;,]+);base64,(.+)$/s.exec(part.image_url.url)
    if (!match) throw new Error('Gemini 图片输入必须使用 Base64 数据')
    return { inlineData: { mimeType: match[1], data: match[2] } }
  })
}

export function reasoningText(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map(reasoningText).filter(Boolean).join('\n')
  if (!value || typeof value !== 'object') return ''
  const row = value as Record<string, unknown>
  const keys = [
    'text', 'summary', 'reasoning_content', 'reasoningContent', 'reasoning',
    'thinking', 'thought', 'content', 'delta'
  ]
  const parts = keys.map((key) => reasoningText(row[key])).filter(Boolean)
  return [...new Set(parts)].join('\n')
}

/** 模型把「快速」模式系统提示抄进正文时，去掉这些泄漏片段。 */
export function stripLeakedModeInstruction(text: string) {
  if (!text) return text
  const next = text
    .replace(/##\s*最终结果/g, '')
    .replace(/直接输出答案[，,]?\s*不添加冗余说明。?/g, '')
    .replace(/直接给出简洁、可用的最终结果，避免不必要的展开。?/g, '')
  if (next === text) return text
  return next.replace(/(?:\\n)+/g, '\n').replace(/\n{3,}/g, '\n\n').trimEnd()
}

export function consumeTaggedReasoning(value: string, open: boolean, carry: string) {
  let input = `${carry}${value}`
  let content = ''
  let reasoning = ''
  let thinking = open
  const openTag = /<think(?:ing)?>/i
  const closeTag = /<\/think(?:ing)?>/i
  const partialSuffix = (text: string, closing: boolean) => {
    const tags = closing ? ['</think>', '</thinking>'] : ['<think>', '<thinking>']
    for (const tag of tags) {
      for (let length = Math.min(tag.length - 1, text.length); length > 0; length -= 1) {
        const suffix = tag.slice(0, length)
        if (text.endsWith(suffix)) return suffix
      }
    }
    return ''
  }
  while (input) {
    if (thinking) {
      const match = closeTag.exec(input)
      if (!match) {
        const partial = partialSuffix(input.slice(-10), true)
        const safe = partial ? input.slice(0, -partial.length) : input
        reasoning += safe
        return { content, reasoning, open: true, carry: partial }
      }
      reasoning += input.slice(0, match.index)
      input = input.slice(match.index + match[0].length)
      thinking = false
      continue
    }
    const match = openTag.exec(input)
    if (!match) {
      const partial = partialSuffix(input.slice(-10), false)
      const safe = partial ? input.slice(0, -partial.length) : input
      content += safe
      return { content, reasoning, open: false, carry: partial }
    }
    content += input.slice(0, match.index)
    input = input.slice(match.index + match[0].length)
    thinking = true
  }
  return { content, reasoning, open: thinking, carry: '' }
}

export function chatJsonResult(protocol: ChatProtocol, payload: Record<string, unknown>): ChatStreamResult {
  const providerRequestId = [payload.id, payload.responseId, payload.request_id]
    .find((value): value is string => typeof value === 'string' && value.length > 0)
  const providerRequest = providerRequestId ? { providerRequestId } : {}
  if (protocol === 'anthropic') {
    const blocks = Array.isArray(payload.content) ? payload.content as Array<Record<string, unknown>> : []
    const content = blocks
      .filter((item) => item.type !== 'thinking')
      .map((item) => typeof item.text === 'string' ? item.text : '')
      .join('')
    const reasoning = blocks
      .filter((item) => item.type === 'thinking')
      .map((item) => typeof item.thinking === 'string' ? item.thinking : typeof item.text === 'string' ? item.text : '')
      .join('')
    return {
      content,
      reasoning: reasoning || undefined,
      usage: normalizeChatUsage('anthropic', payload.usage),
      ...providerRequest,
    }
  }
  if (protocol === 'gemini') {
    const candidates = Array.isArray(payload.candidates)
      ? payload.candidates as Array<Record<string, unknown>>
      : []
    const candidateContent = candidates[0]?.content as Record<string, unknown> | undefined
    const parts = Array.isArray(candidateContent?.parts)
      ? candidateContent.parts as Array<Record<string, unknown>>
      : []
    const content = parts
      .filter((item) => item.thought !== true)
      .map((item) => typeof item.text === 'string' ? item.text : '')
      .join('')
    const reasoning = parts
      .filter((item) => item.thought === true)
      .map((item) => typeof item.text === 'string' ? item.text : '')
      .join('')
    return {
      content,
      reasoning: reasoning || undefined,
      usage: normalizeChatUsage('gemini', payload.usageMetadata),
      ...providerRequest,
    }
  }
  const choices = Array.isArray(payload.choices) ? payload.choices as Array<Record<string, unknown>> : []
  const message = choices[0]?.message as Record<string, unknown> | undefined
  const rawContent = message?.content
  const contentParts = Array.isArray(rawContent)
    ? rawContent.filter((part): part is Record<string, unknown> => Boolean(part && typeof part === 'object'))
    : []
  const content = typeof rawContent === 'string'
    ? rawContent
    : contentParts.map((part) =>
      typeof part.text === 'string' && part.type !== 'reasoning' && part.type !== 'thinking'
        ? part.text
        : ''
    ).join('')
  const partReasoning = contentParts.map((part) => reasoningText([
    part.reasoning_content, part.reasoningContent, part.reasoning, part.reasoning_details,
    part.thinking, part.thought,
    part.type === 'reasoning' || part.type === 'thinking' ? part.text : undefined
  ])).filter(Boolean).join('\n')
  const reasoning = reasoningText([
    message?.reasoning_content, message?.reasoningContent, message?.reasoning,
    message?.reasoning_details, message?.thinking, message?.thought, message?.summary,
    partReasoning, payload.reasoning_content, payload.reasoning, payload.reasoning_details,
    payload.summary
  ])
  return {
    content,
    reasoning: reasoning || undefined,
    usage: normalizeChatUsage('openai', payload.usage),
    ...providerRequest,
  }
}

export function chatStreamChunk(protocol: ChatProtocol, payload: Record<string, unknown>): ChatStreamChunk {
  const providerRequestId = [payload.id, payload.responseId, payload.request_id]
    .find((value): value is string => typeof value === 'string' && value.length > 0)
  if (protocol === 'anthropic') {
    const delta = payload.delta as Record<string, unknown> | undefined
    const message = payload.message as Record<string, unknown> | undefined
    const requestId = providerRequestId || (typeof message?.id === 'string' ? message.id : undefined)
    return {
      delta: delta?.type === 'thinking_delta' ? '' : typeof delta?.text === 'string' ? delta.text : '',
      reasoningDelta: delta?.type === 'thinking_delta' && typeof delta?.thinking === 'string' ? delta.thinking : '',
      usage: normalizeChatUsage('anthropic', message?.usage || payload.usage),
      ...(requestId ? { providerRequestId: requestId } : {}),
    }
  }
  if (protocol === 'gemini') {
    const normalized = chatJsonResult('gemini', payload)
    return {
      delta: normalized.content,
      reasoningDelta: normalized.reasoning || '',
      usage: normalized.usage,
      ...(normalized.providerRequestId ? { providerRequestId: normalized.providerRequestId } : {}),
    }
  }
  const eventType = typeof payload.type === 'string' ? payload.type : ''
  if (/reasoning.*(?:summary|text).*delta/i.test(eventType)) {
    return { delta: '', reasoningDelta: reasoningText(payload.delta), ...(providerRequestId ? { providerRequestId } : {}) }
  }
  if (/(?:output_text|content).*delta/i.test(eventType) && typeof payload.delta === 'string') {
    return { delta: payload.delta, reasoningDelta: '', ...(providerRequestId ? { providerRequestId } : {}) }
  }
  const choices = Array.isArray(payload.choices) ? payload.choices as Array<Record<string, unknown>> : []
  const delta = choices[0]?.delta as Record<string, unknown> | undefined
  const rawContent = delta?.content
  const contentParts = Array.isArray(rawContent)
    ? rawContent.filter((part): part is Record<string, unknown> => Boolean(part && typeof part === 'object'))
    : []
  const content = typeof rawContent === 'string'
    ? rawContent
    : contentParts.map((part) =>
      typeof part.text === 'string' && part.type !== 'reasoning' && part.type !== 'thinking'
        ? part.text
        : ''
    ).join('')
  const choiceMessage = choices[0]?.message as Record<string, unknown> | undefined
  const partReasoning = contentParts.map((part) => reasoningText([
    part.reasoning_content, part.reasoningContent, part.reasoning, part.reasoning_details,
    part.thinking, part.thought,
    part.type === 'reasoning' || part.type === 'thinking' ? part.text : undefined
  ])).filter(Boolean).join('\n')
  const reasoning = reasoningText([
    delta?.reasoning_content, delta?.reasoningContent, delta?.reasoning, delta?.reasoning_text,
    delta?.reasoning_details, delta?.thinking, delta?.thought, delta?.summary,
    partReasoning, choiceMessage?.reasoning_content, choiceMessage?.reasoning, choiceMessage?.reasoning_text,
    choiceMessage?.reasoning_details, payload.reasoning_content, payload.reasoning, payload.reasoning_text,
    payload.reasoning_details, payload.thinking, payload.thought, payload.summary
  ])
  return {
    delta: content,
    reasoningDelta: reasoning,
    usage: normalizeChatUsage('openai', payload.usage),
    ...(providerRequestId ? { providerRequestId } : {}),
  }
}
