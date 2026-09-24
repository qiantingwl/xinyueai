import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveChatResponseState } from '../../src/utils/chat-response-state.ts'
import type { Message } from '../../src/types.ts'

const message = (value: Partial<Message>): Message => ({
  id: 'assistant-1',
  role: 'assistant',
  content: '',
  createdAt: 1,
  generationJobId: 'job-1',
  ...value,
})

const active = { isGenerating: true, activeJobId: 'job-1' }

test('空的活动助手消息处于思考阶段', () => {
  const state = resolveChatResponseState(message({}), active)
  assert.equal(state.phase, 'thinking')
  assert.equal(state.isStreaming, true)
  assert.equal(state.isPending, true)
  assert.equal(state.processTitle, '思考中')
})

test('联网中的消息优先进入检索阶段', () => {
  const state = resolveChatResponseState(message({
    webSearch: { enabled: true, status: 'searching', queries: [], sources: [] },
  }), active)
  assert.equal(state.phase, 'search')
  assert.equal(state.processTitle, '正在搜索')
  assert.equal(state.processStatus, '实时更新')
})

test('推理和正文流分别进入推理与回答阶段', () => {
  const reasoning = resolveChatResponseState(message({ reasoning: 'Analyzing the request' }), active)
  const answering = resolveChatResponseState(message({ content: '正在输出正文' }), active)
  assert.equal(reasoning.phase, 'reasoning')
  assert.equal(reasoning.reasoningSummary, '已完成问题分析和关键信息梳理')
  assert.equal(answering.phase, 'answer')
  assert.equal(answering.shouldRender, true)
})

test('正文开始输出后标题变为已思考', () => {
  const state = resolveChatResponseState(message({ reasoning: '已完成分析', content: '正在输出正文' }), active)
  assert.equal(state.phase, 'answer')
  assert.equal(state.processTitle, '已思考')
})

test('完成检索用关键词和资料数量做摘要', () => {
  const completed = resolveChatResponseState(message({
    content: '最终回答',
    webSearch: { enabled: true, status: 'completed', queries: ['测试'], sources: [] },
  }), { isGenerating: false, activeJobId: '' })
  const failed = resolveChatResponseState(message({
    content: '保底回答',
    webSearch: { enabled: true, status: 'failed', queries: [], sources: [], error: '暂不可用' },
  }), { isGenerating: false, activeJobId: '' })
  assert.equal(completed.phase, 'done')
  assert.equal(completed.processTitle, '搜索 1 个关键词')
  assert.equal(completed.processStatus, '已完成')
  assert.equal(failed.phase, 'done')
  assert.equal(failed.processStatus, '部分完成')
})

test('非当前任务的旧助手消息不会被误判为流式消息', () => {
  const state = resolveChatResponseState(message({ content: '历史回答', generationJobId: 'job-old' }), active)
  assert.equal(state.isStreaming, false)
  assert.equal(state.phase, 'done')
  assert.equal(state.hasProcess, false)
})

test('隐藏推理 token 的助手消息仍保留思考过程', () => {
  const state = resolveChatResponseState(message({
    content: '你好！有什么可以帮忙的吗？',
    reasoningTokens: 956,
    thinkingSeconds: 25,
  }), { isGenerating: false, activeJobId: '' })
  assert.equal(state.hasProcess, true)
  assert.equal(state.processTitle, '已思考（用时 25 秒）')
  assert.equal(state.isStreaming, false)
})

test('检索完成显示关键词和资料数量', () => {
  const state = resolveChatResponseState(message({
    content: '回答',
    webSearch: {
      enabled: true,
      status: 'completed',
      queries: ['关键词一', '关键词二', '关键词三'],
      sources: Array.from({ length: 14 }, (_, index) => ({ title: `资料 ${index + 1}`, url: `https://example.com/${index + 1}` })),
    },
  }), { isGenerating: false, activeJobId: '' })
  assert.equal(state.processTitle, '搜索 3 个关键词，参考 14 篇资料')
})
