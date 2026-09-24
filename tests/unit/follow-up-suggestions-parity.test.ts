import assert from 'node:assert/strict'
import test from 'node:test'
import { createFollowUpSuggestions } from '../../src/utils/follow-up-suggestions.ts'
import { followUpSuggestions } from '../../server/src/generations/follow-up-suggestions.ts'

/**
 * 前端在流式回答结束前先本地算一次追问建议，服务端落库时再算一次。
 * 两份实现必须给出完全相同的结果，否则用户会看到建议在流结束瞬间跳变。
 */
const cases: Array<{ name: string; prompt: string; answer: string; provided?: string[] }> = [
  {
    name: '步骤类回答',
    prompt: '怎么上线这个功能',
    answer: '先完成第一阶段的开发，再按排期推进灰度，最后确认里程碑达成。',
  },
  {
    name: '风险与对比同时命中',
    prompt: '这两个方案怎么选',
    answer: '方案 A 的优缺点在于成本低但隐患多；方案 B 的区别是稳定，注意事项是周期长。',
  },
  {
    name: '代码块回答',
    prompt: '写个排序',
    answer: '可以这样写：\n```ts\nexport const sort = (list: number[]) => [...list].sort((a, b) => a - b)\n```\n',
  },
  {
    name: '括号举例被抽取为追问',
    prompt: '介绍一下缓存',
    answer: '缓存有多种失效策略（比如：如何设置过期时间、怎么处理击穿、是否需要预热）。',
  },
  {
    name: '括号举例不含疑问词时忽略',
    prompt: '介绍一下缓存',
    answer: '缓存分为多级（比如：本地缓存、分布式缓存、CDN）。',
  },
  {
    name: '指标类回答',
    prompt: '这个报表怎么看',
    answer: '重点关注这些统计数据和指标的变化趋势。',
  },
  {
    name: '建议与当前提问重复时被剔除',
    prompt: '这些风险分别应该如何规避？',
    answer: '存在若干风险与限制，需要逐项评估注意事项。',
  },
  {
    name: '空回答',
    prompt: '你好',
    answer: '',
  },
  {
    name: '上游已提供建议',
    prompt: '介绍一下索引',
    answer: '索引可以显著提升查询性能，但也有写入开销的限制。',
    provided: ['哪些字段适合建索引', '请帮我评估索引的写入成本'],
  },
  {
    name: '上游建议过短或过长时被过滤',
    prompt: '介绍一下索引',
    answer: '索引可以提升查询性能。',
    provided: ['短', '很'.repeat(80)],
  },
  {
    name: '全部启发式同时命中时仍只取三条',
    prompt: '给个完整方案',
    answer: '按阶段执行并排期；存在风险与注意事项；需要对比优缺点；相关指标和报表要跟踪。\n```js\nconsole.log(1)\n```',
  },
]

for (const item of cases) {
  test(`前后端追问建议一致：${item.name}`, () => {
    const frontend = createFollowUpSuggestions(item.prompt, item.answer, item.provided ?? [])
    const backend = followUpSuggestions(item.prompt, item.answer, item.provided ?? [])
    assert.deepEqual(backend, frontend)
  })
}

test('追问建议最多三条且不重复', () => {
  const answer = '按阶段执行并排期；存在风险与注意事项；需要对比优缺点；相关指标和报表要跟踪。\n```js\nconsole.log(1)\n```'
  const suggestions = followUpSuggestions('给个完整方案', answer)
  assert.ok(suggestions.length <= 3)
  assert.equal(new Set(suggestions).size, suggestions.length)
})

test('建议统一带问号或以请/帮我开头', () => {
  const suggestions = followUpSuggestions('介绍一下索引', '索引有写入开销的限制和注意事项。', ['哪些字段适合建索引'])
  assert.ok(suggestions.length > 0, '该输入应产出建议')
  for (const suggestion of suggestions) {
    assert.ok(/[？?]$/.test(suggestion) || /^(请|帮我)/.test(suggestion), `建议未规范化：${suggestion}`)
  }
})
