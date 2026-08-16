function normalizeQuestion(value: string) {
  return value.toLowerCase().replace(/[\s，。！？,.!?；;：:“”"'‘’]/g, '')
}

export function createFollowUpSuggestions(prompt: string, answer: string, provided: string[] = []) {
  const currentQuestion = normalizeQuestion(prompt)
  const candidates: string[] = []
  const add = (value: string) => {
    const suggestion = value.replace(/^[：:、，,\s]+|[。；;，,\s]+$/g, '').trim()
    if (!suggestion || suggestion.length < 4 || suggestion.length > 70) return
    const question = /[？?]$/.test(suggestion) || /^(请|帮我)/.test(suggestion) ? suggestion : `${suggestion}？`
    if (normalizeQuestion(question) !== currentQuestion) candidates.push(question)
  }

  provided.forEach(add)
  for (const match of answer.matchAll(/[（(](?:比如|例如|如)[：:\s]*([^）)\n]{4,140})[）)]/g)) {
    if (!/(?:怎么|如何|为什么|哪些|什么|哪种|是否|能否|可以)/.test(match[1])) continue
    match[1].split(/[、；;]|，(?=(?:怎么|如何|为什么|哪些|什么|哪种|是否|能否|可以))/).forEach(add)
  }
  if (/步骤|阶段|执行|落地|排期|里程碑/.test(answer)) add('请把这些步骤整理成可执行的项目计划')
  if (/风险|限制|隐患|注意事项/.test(answer)) add('这些风险分别应该如何规避？')
  if (/对比|区别|优缺点|差异/.test(answer)) add('请把回答中提到的关键差异整理成对比表')
  if (/```[\s\S]*?```/.test(answer)) {
    add('请补充这段代码的测试用例')
    add('这段代码有哪些边界情况？')
  }
  if (/数据|指标|统计|报表/.test(answer)) add('回答中提到的哪些指标最值得优先跟踪？')
  return [...new Set(candidates)].slice(0, 3)
}
