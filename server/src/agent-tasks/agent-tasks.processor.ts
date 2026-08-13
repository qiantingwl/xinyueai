import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Injectable } from '@nestjs/common'
import { AgentTaskStatus, AgentTaskStepStatus, Prisma } from '@prisma/client'
import { Annotation, END, START, StateGraph } from '@langchain/langgraph'
import { Job } from 'bullmq'
import { PrismaService } from '../prisma/prisma.service'
import { AgentModelService } from './agent-model.service'
import { AgentToolDescriptor, AgentToolsService } from './agent-tools.service'
import { AgentSchedulesService } from './agent-schedules.service'

type PlannedAction = { tool: string; input: Record<string, unknown>; reason: string }
type AgentPlan = { summary: string; actions: PlannedAction[]; output: string }
type ToolResult = { tool: string; name: string; status: string; output?: unknown; error?: string }

const AgentState = Annotation.Root({
  taskId: Annotation<string>(),
  runId: Annotation<string>(),
  runKey: Annotation<string>(),
  conversationId: Annotation<string>(),
  iteration: Annotation<number>(),
  plan: Annotation<AgentPlan>(),
  toolResults: Annotation<ToolResult[]>(),
  answer: Annotation<string>(),
  verifierFeedback: Annotation<string>(),
  verdict: Annotation<'complete' | 'replan'>(),
  waitingApproval: Annotation<boolean>(),
  resumeNode: Annotation<'prepare' | 'tools' | 'draft'>(),
})

class AgentTaskCancelledError extends Error {}

@Injectable()
@Processor('agent-task', { concurrency: 8 })
export class AgentTasksProcessor extends WorkerHost {
  constructor(
    private readonly prisma: PrismaService,
    private readonly model: AgentModelService,
    private readonly tools: AgentToolsService,
    private readonly schedules: AgentSchedulesService,
  ) { super() }

  async process(job: Job<{ taskId: string; runId: string; runKey: string }>) {
    if (job.name === 'scheduled') return this.schedules.trigger(job)
    const { taskId, runId, runKey } = job.data
    const claimed = await this.prisma.agentRun.updateMany({
      where: { id: runId, agentTaskId: taskId, status: { in: [AgentTaskStatus.QUEUED, AgentTaskStatus.RUNNING] } },
      data: { status: AgentTaskStatus.RUNNING, startedAt: new Date() },
    })
    if (!claimed.count) return
    await this.prisma.agentTask.updateMany({ where: { id: taskId, status: { in: [AgentTaskStatus.QUEUED, AgentTaskStatus.RUNNING] } }, data: { status: AgentTaskStatus.RUNNING } })
    try {
      const restored = await this.restore(runId)
      const graph = new StateGraph(AgentState)
        .addNode('prepare', (state) => this.prepare(state))
        .addNode('plan', (state) => this.plan(state))
        .addNode('tools', (state) => this.executeTools(state))
        .addNode('draft', (state) => this.draft(state))
        .addNode('verify', (state) => this.verify(state))
        .addNode('replan', (state) => this.replan(state))
        .addNode('deliver', (state) => this.deliver(state))
        .addConditionalEdges(START, (state) => state.resumeNode, { prepare: 'prepare', tools: 'tools', draft: 'draft' })
        .addEdge('prepare', 'plan')
        .addEdge('plan', 'tools')
        .addConditionalEdges('tools', (state) => state.waitingApproval ? END : 'draft', { draft: 'draft', [END]: END })
        .addEdge('draft', 'verify')
        .addConditionalEdges('verify', (state) => state.verdict, { complete: 'deliver', replan: 'replan' })
        .addEdge('replan', 'tools')
        .addEdge('deliver', END)
        .compile()
      return await graph.invoke(restored)
    } catch (error) {
      const current = await this.prisma.agentTask.findUnique({ where: { id: taskId }, select: { status: true } })
      if (current?.status === AgentTaskStatus.CANCELLED || error instanceof AgentTaskCancelledError) return
      const message = error instanceof Error ? error.message : 'Agent 任务执行失败'
      const now = new Date()
      await this.prisma.$transaction([
        this.prisma.agentRun.updateMany({ where: { id: runId, status: { in: [AgentTaskStatus.QUEUED, AgentTaskStatus.RUNNING] } }, data: { status: AgentTaskStatus.FAILED, completedAt: now } }),
        this.prisma.agentTask.updateMany({ where: { id: taskId, status: { in: [AgentTaskStatus.QUEUED, AgentTaskStatus.RUNNING] } }, data: { status: AgentTaskStatus.FAILED, errorMessage: message, completedAt: now } }),
        this.prisma.agentTaskStep.updateMany({ where: { agentTaskId: taskId, status: AgentTaskStepStatus.RUNNING }, data: { status: AgentTaskStepStatus.FAILED, detail: message, completedAt: now } }),
      ])
      await this.event(taskId, runId, 'error', '任务执行失败', message)
      const failedTask = await this.prisma.agentTask.findUnique({ where: { id: taskId }, select: { scheduleId: true } })
      if (failedTask?.scheduleId) await this.prisma.agentSchedule.updateMany({ where: { id: failedTask.scheduleId }, data: { consecutiveFailures: { increment: 1 }, lastError: message } })
      throw error
    }
  }

  private async restore(runId: string): Promise<typeof AgentState.State> {
    const run = await this.prisma.agentRun.findUniqueOrThrow({ where: { id: runId } })
    return {
      taskId: run.agentTaskId,
      runId: run.id,
      runKey: run.runKey,
      conversationId: '',
      iteration: run.iteration,
      plan: this.planValue(run.plan),
      toolResults: this.toolResults(run.context),
      answer: run.finalAnswer,
      verifierFeedback: run.verifierFeedback,
      verdict: 'complete',
      waitingApproval: false,
      resumeNode: run.currentNode === 'tools' ? 'tools' : run.currentNode === 'draft' ? 'draft' : 'prepare',
    }
  }

  private async prepare(state: typeof AgentState.State) {
    await this.assertActive(state.taskId)
    await this.startStep(state.taskId, 0, '正在加载模型、附件、知识库和工具权限')
    const task = await this.task(state.taskId)
    let conversationId = task.conversationId || ''
    if (!conversationId) {
      const conversation = await this.prisma.conversation.create({
        data: { userId: task.userId, projectId: task.projectId, title: task.title, model: task.model, temporary: false },
      })
      conversationId = conversation.id
      const prompt = [task.goal, task.instructions ? `执行要求：\n${task.instructions}` : ''].filter(Boolean).join('\n\n')
      await this.prisma.message.create({
        data: { conversationId, authorId: task.userId, role: 'USER', content: prompt, attachments: this.attachmentIds(task.attachmentIds).length ? { create: this.attachmentIds(task.attachmentIds).map((assetId) => ({ assetId })) } : undefined },
      })
      await this.prisma.agentTask.update({ where: { id: task.id }, data: { conversationId } })
    }
    await this.completeStep(state.taskId, 0, '任务上下文准备完成')
    await this.checkpoint(state.runId, 'plan', { conversationId })
    await this.event(state.taskId, state.runId, 'node', '上下文准备完成', '已加载任务目标、附件和可用能力')
    return { conversationId }
  }

  private async plan(state: typeof AgentState.State) {
    await this.assertActive(state.taskId)
    await this.startStep(state.taskId, 1, '正在制定执行计划')
    const task = await this.task(state.taskId)
    const available = await this.tools.available(task)
    const prompt = this.plannerPrompt(task.goal, task.instructions, available, state.verifierFeedback, state.iteration)
    const completion = await this.model.complete(task, state.runKey, `planner-${state.iteration}`, prompt, async () => this.touch(state.taskId, state.runId, '正在生成结构化执行计划'))
    const fallback: AgentPlan = { summary: '直接分析任务并形成完整交付结果', actions: [], output: '完整办公成果' }
    const parsed = this.model.parseJson<AgentPlan>(completion.content, fallback)
    const known = new Set(available.map((tool) => tool.key))
    const plan: AgentPlan = {
      summary: String(parsed.summary || fallback.summary).slice(0, 1000),
      output: String(parsed.output || fallback.output).slice(0, 500),
      actions: Array.isArray(parsed.actions) ? parsed.actions.slice(0, 8).filter((action) => action && known.has(String(action.tool))).map((action) => ({ tool: String(action.tool), reason: String(action.reason || '').slice(0, 1000), input: action.input && typeof action.input === 'object' && !Array.isArray(action.input) ? action.input : {} })) : [],
    }
    await this.persistPlan(state, plan, available)
    await this.completeStep(state.taskId, 1, `${plan.summary}${plan.actions.length ? ` · ${plan.actions.length} 个工具步骤` : ''}`)
    await this.event(state.taskId, state.runId, 'plan', `第 ${state.iteration + 1} 轮计划已生成`, plan.summary, plan)
    return { plan }
  }

  private async executeTools(state: typeof AgentState.State) {
    await this.assertActive(state.taskId)
    const task = await this.task(state.taskId)
    const available = await this.tools.available(task)
    const byKey = new Map(available.map((tool) => [tool.key, tool]))
    const calls = await this.prisma.agentToolCall.findMany({ where: { runId: state.runId, iteration: state.iteration }, orderBy: { position: 'asc' } })
    const pendingApproval = calls.filter((call) => call.requiresApproval && call.approvalStatus === 'PENDING')
    if (pendingApproval.length) {
      await this.prisma.$transaction([
        this.prisma.agentTask.update({ where: { id: state.taskId }, data: { status: AgentTaskStatus.WAITING_APPROVAL } }),
        this.prisma.agentRun.update({ where: { id: state.runId }, data: { status: AgentTaskStatus.WAITING_APPROVAL, currentNode: 'tools' } }),
      ])
      await this.event(state.taskId, state.runId, 'approval', '任务等待你的确认', `有 ${pendingApproval.length} 个外部工具调用需要批准`)
      return { waitingApproval: true }
    }
    const results: ToolResult[] = []
    for (const call of calls) {
      await this.assertActive(state.taskId)
      if (call.approvalStatus === 'REJECTED') {
        await this.prisma.agentToolCall.update({ where: { id: call.id }, data: { status: 'SKIPPED', completedAt: new Date() } })
        results.push({ tool: call.key, name: call.name, status: 'SKIPPED', error: '用户拒绝了该工具调用' })
        continue
      }
      if (call.status === 'SUCCEEDED') {
        results.push({ tool: call.key, name: call.name, status: call.status, output: call.output })
        continue
      }
      const descriptor = byKey.get(call.key)
      if (!descriptor) {
        const error = '工具已停用或不再可用'
        await this.prisma.agentToolCall.update({ where: { id: call.id }, data: { status: 'FAILED', error, completedAt: new Date() } })
        results.push({ tool: call.key, name: call.name, status: 'FAILED', error })
        continue
      }
      if (call.status === 'RUNNING' && descriptor.kind === 'external') {
        const error = '上次外部工具调用在中断前未确认结果，为避免重复操作已停止自动重放'
        await this.prisma.agentToolCall.update({ where: { id: call.id }, data: { status: 'FAILED', error, completedAt: new Date() } })
        results.push({ tool: call.key, name: call.name, status: 'FAILED', error })
        await this.event(state.taskId, state.runId, 'tool_error', `${call.name} 状态未知`, error)
        continue
      }
      await this.prisma.agentToolCall.update({ where: { id: call.id }, data: { status: 'RUNNING', startedAt: new Date(), error: null } })
      await this.event(state.taskId, state.runId, 'tool', `正在调用 ${call.name}`, String((call.input as Record<string, unknown>).query || ''))
      try {
        const output = await this.tools.execute(task, descriptor, call.input as Record<string, unknown>, `agent-tool:${call.id}`)
        await this.prisma.agentToolCall.update({ where: { id: call.id }, data: { status: 'SUCCEEDED', output: this.model.json(output), completedAt: new Date() } })
        results.push({ tool: call.key, name: call.name, status: 'SUCCEEDED', output })
        const sourceCount = call.key === 'web_search' && output && typeof output === 'object' && Array.isArray((output as Record<string, unknown>).sources) ? ((output as Record<string, unknown>).sources as unknown[]).length : 0
        await this.event(state.taskId, state.runId, 'tool', `${call.name} 已完成`, sourceCount ? `已检索并加入 ${sourceCount} 个网页来源` : '工具结果已加入任务上下文', sourceCount ? { sources: (output as Record<string, unknown>).sources } : undefined)
      } catch (error) {
        const message = error instanceof Error ? error.message : '工具调用失败'
        await this.prisma.agentToolCall.update({ where: { id: call.id }, data: { status: 'FAILED', error: message, completedAt: new Date() } })
        results.push({ tool: call.key, name: call.name, status: 'FAILED', error: message })
        await this.event(state.taskId, state.runId, 'tool_error', `${call.name} 调用失败`, message)
      }
    }
    await this.checkpoint(state.runId, 'draft', { context: results })
    return { toolResults: results, waitingApproval: false }
  }

  private async draft(state: typeof AgentState.State) {
    await this.assertActive(state.taskId)
    await this.startStep(state.taskId, 2, `正在执行第 ${state.iteration + 1} 轮任务`)
    const task = await this.task(state.taskId)
    const context = JSON.stringify(state.toolResults).slice(0, 60_000)
    const prompt = `你是 Xinyue AI 办公任务执行器。请完成用户最终目标并直接生成可交付成品。\n\n用户目标：\n${task.goal}\n\n额外要求：\n${task.instructions || '无'}\n\n执行计划：\n${JSON.stringify(state.plan)}\n\n工具和资料结果：\n${context || '本轮没有调用工具'}\n\n上一轮校验反馈：\n${state.verifierFeedback || '无'}\n\n要求：只使用工具返回的真实事实；信息不足时明确标注；联网资料涉及事实时在正文中使用 [1]、[2] 编号引用，并在文末输出“来源”列表，保留真实标题和 URL；输出完整正文，不要输出执行过程。`
    const completion = await this.model.complete(task, state.runKey, `draft-${state.iteration}`, prompt, async (content) => {
      await this.prisma.agentRun.update({ where: { id: state.runId }, data: { finalAnswer: content, currentNode: 'draft' } })
      await this.touch(state.taskId, state.runId, '正在生成交付结果')
    })
    await this.prisma.agentTask.update({ where: { id: state.taskId }, data: { generationJobId: completion.jobId } })
    await this.checkpoint(state.runId, 'verify', { finalAnswer: completion.content })
    await this.completeStep(state.taskId, 2, `第 ${state.iteration + 1} 轮执行完成`)
    return { answer: completion.content }
  }

  private async verify(state: typeof AgentState.State) {
    await this.assertActive(state.taskId)
    await this.startStep(state.taskId, 3, '正在校验完整性、事实依据和交付质量')
    const task = await this.task(state.taskId)
    const prompt = `你是严格的交付质量检查器。判断结果是否已经完成用户目标。只输出 JSON：{"approved":boolean,"feedback":"具体问题和修改要求"}。\n\n用户目标：${task.goal}\n额外要求：${task.instructions || '无'}\n计划：${JSON.stringify(state.plan)}\n工具结果：${JSON.stringify(state.toolResults).slice(0, 40_000)}\n候选结果：${state.answer.slice(0, 60_000)}`
    const completion = await this.model.complete(task, state.runKey, `verifier-${state.iteration}`, prompt)
    const verdict = this.model.parseJson<{ approved?: boolean; feedback?: string }>(completion.content, { approved: state.answer.trim().length >= 80, feedback: '结果内容不足，请补充完整交付内容。' })
    const feedback = String(verdict.feedback || '').slice(0, 8000)
    const run = await this.prisma.agentRun.findUniqueOrThrow({ where: { id: state.runId }, select: { maxIterations: true } })
    const complete = Boolean(verdict.approved) || state.iteration + 1 >= run.maxIterations
    await this.prisma.agentRun.update({ where: { id: state.runId }, data: { verifierFeedback: feedback, currentNode: complete ? 'deliver' : 'replan' } })
    await this.event(state.taskId, state.runId, 'verification', complete ? '结果校验完成' : '需要继续完善', feedback || '已通过交付质量检查')
    return { verdict: complete ? 'complete' as const : 'replan' as const, verifierFeedback: feedback }
  }

  private async replan(state: typeof AgentState.State) {
    const nextIteration = state.iteration + 1
    await this.prisma.agentRun.update({ where: { id: state.runId }, data: { iteration: nextIteration, currentNode: 'plan' } })
    await this.event(state.taskId, state.runId, 'replan', `开始第 ${nextIteration + 1} 轮`, state.verifierFeedback)
    const task = await this.task(state.taskId)
    const available = await this.tools.available(task)
    const completion = await this.model.complete(task, state.runKey, `planner-${nextIteration}`, this.plannerPrompt(task.goal, task.instructions, available, state.verifierFeedback, nextIteration))
    const fallback: AgentPlan = { summary: '根据校验反馈完善交付结果', actions: [], output: '修订后的完整成果' }
    const parsed = this.model.parseJson<AgentPlan>(completion.content, fallback)
    const known = new Set(available.map((tool) => tool.key))
    const plan = { summary: String(parsed.summary || fallback.summary), output: String(parsed.output || fallback.output), actions: Array.isArray(parsed.actions) ? parsed.actions.slice(0, 8).filter((action) => known.has(String(action.tool))).map((action) => ({ tool: String(action.tool), reason: String(action.reason || ''), input: action.input && typeof action.input === 'object' && !Array.isArray(action.input) ? action.input : {} })) : [] }
    await this.persistPlan({ ...state, iteration: nextIteration }, plan, available)
    return { iteration: nextIteration, plan, toolResults: [] }
  }

  private async deliver(state: typeof AgentState.State) {
    await this.assertActive(state.taskId)
    const task = await this.task(state.taskId)
    const now = new Date()
    const existing = await this.prisma.message.findFirst({ where: { conversationId: task.conversationId!, metadata: { path: ['agentRunId'], equals: state.runId } }, select: { id: true } })
    if (existing) await this.prisma.message.update({ where: { id: existing.id }, data: { content: state.answer, model: task.model } })
    else await this.prisma.message.create({ data: { conversationId: task.conversationId!, role: 'ASSISTANT', content: state.answer, model: task.model, metadata: { agentTaskId: task.id, agentRunId: state.runId } } })
    await this.prisma.$transaction([
      this.prisma.agentTaskStep.updateMany({ where: { agentTaskId: state.taskId, position: 3 }, data: { status: AgentTaskStepStatus.SUCCEEDED, detail: `通过 ${state.iteration + 1} 轮执行与校验，已生成最终结果`, completedAt: now } }),
      this.prisma.agentRun.update({ where: { id: state.runId }, data: { status: AgentTaskStatus.SUCCEEDED, currentNode: 'done', finalAnswer: state.answer, completedAt: now } }),
      this.prisma.agentTask.update({ where: { id: state.taskId }, data: { status: AgentTaskStatus.SUCCEEDED, errorMessage: null, completedAt: now } }),
      this.prisma.conversation.update({ where: { id: task.conversationId! }, data: { updatedAt: now } }),
    ])
    await this.event(state.taskId, state.runId, 'completed', '任务已完成', `经过 ${state.iteration + 1} 轮执行与校验`)
    if (task.scheduleId) await this.prisma.agentSchedule.updateMany({ where: { id: task.scheduleId }, data: { consecutiveFailures: 0, lastError: '' } })
    return {}
  }

  private plannerPrompt(goal: string, instructions: string, available: AgentToolDescriptor[], feedback: string, iteration: number) {
    return `你是办公 Agent 规划器。只输出 JSON，不要 Markdown。格式：{"summary":"计划摘要","actions":[{"tool":"工具 key","input":{},"reason":"调用理由"}],"output":"交付物说明"}。\n工具不是必须调用；仅在确实需要真实外部信息时调用。用户询问近期事件、实时数据、指定网页、事实核验或明确要求搜索时，应调用 web_search，并把 query 写成清晰检索词；复杂调研可以生成多个互不重复的搜索动作。不得虚构工具 key。最多 8 个工具动作。\n\n用户目标：${goal}\n额外要求：${instructions || '无'}\n当前轮次：${iteration + 1}\n上一轮校验反馈：${feedback || '无'}\n可用工具：${JSON.stringify(available.map(({ key, name, description, requiresApproval }) => ({ key, name, description, requiresApproval })))}`
  }

  private async persistPlan(state: Pick<typeof AgentState.State, 'taskId' | 'runId' | 'iteration'>, plan: AgentPlan, available: AgentToolDescriptor[]) {
    const byKey = new Map(available.map((tool) => [tool.key, tool]))
    await this.prisma.$transaction(async (tx) => {
      await tx.agentToolCall.deleteMany({ where: { runId: state.runId, iteration: state.iteration, status: 'PENDING' } })
      for (const [position, action] of plan.actions.entries()) {
        const tool = byKey.get(action.tool)
        if (!tool) continue
        await tx.agentToolCall.upsert({
          where: { runId_iteration_position: { runId: state.runId, iteration: state.iteration, position } },
          update: { key: tool.key, name: tool.name, toolId: tool.id || null, input: this.model.json(action.input), requiresApproval: tool.requiresApproval, approvalStatus: tool.requiresApproval ? 'PENDING' : 'NOT_REQUIRED', status: 'PENDING', output: Prisma.DbNull, error: null, startedAt: null, completedAt: null },
          create: { agentTaskId: state.taskId, runId: state.runId, iteration: state.iteration, position, key: tool.key, name: tool.name, toolId: tool.id, input: this.model.json(action.input), requiresApproval: tool.requiresApproval, approvalStatus: tool.requiresApproval ? 'PENDING' : 'NOT_REQUIRED' },
        })
      }
      await tx.agentRun.update({ where: { id: state.runId }, data: { plan: this.model.json(plan), currentNode: 'tools' } })
    })
  }

  private async task(taskId: string) {
    return this.prisma.agentTask.findUniqueOrThrow({ where: { id: taskId } })
  }

  private async assertActive(taskId: string) {
    const task = await this.prisma.agentTask.findUnique({ where: { id: taskId }, select: { status: true } })
    if (!task || task.status === AgentTaskStatus.CANCELLED) throw new AgentTaskCancelledError('任务已取消')
  }

  private async checkpoint(runId: string, currentNode: string, data: { conversationId?: string; context?: ToolResult[]; finalAnswer?: string }) {
    await this.prisma.agentRun.update({ where: { id: runId }, data: { currentNode, ...(data.context ? { context: this.model.json(data.context) } : {}), ...(data.finalAnswer !== undefined ? { finalAnswer: data.finalAnswer } : {}) } })
  }

  private async event(agentTaskId: string, runId: string, type: string, title: string, detail = '', payload?: unknown) {
    await this.prisma.agentEvent.create({ data: { agentTaskId, runId, type, title, detail: detail.slice(0, 20_000), payload: payload === undefined ? undefined : this.model.json(payload) } })
  }

  private async touch(taskId: string, runId: string, detail: string) {
    await this.prisma.$transaction([
      this.prisma.agentRun.update({ where: { id: runId }, data: { updatedAt: new Date() } }),
      this.prisma.agentTaskStep.updateMany({ where: { agentTaskId: taskId, position: 2 }, data: { detail } }),
    ])
  }

  private async startStep(taskId: string, position: number, detail: string) {
    await this.prisma.agentTaskStep.updateMany({ where: { agentTaskId: taskId, position }, data: { status: AgentTaskStepStatus.RUNNING, detail, startedAt: new Date(), completedAt: null } })
  }

  private async completeStep(taskId: string, position: number, detail: string) {
    await this.prisma.agentTaskStep.updateMany({ where: { agentTaskId: taskId, position }, data: { status: AgentTaskStepStatus.SUCCEEDED, detail, completedAt: new Date() } })
  }

  private attachmentIds(value: Prisma.JsonValue | null): string[] {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
  }

  private planValue(value: Prisma.JsonValue | null): AgentPlan {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return { summary: '', actions: [], output: '' }
    return value as unknown as AgentPlan
  }

  private toolResults(value: Prisma.JsonValue | null): ToolResult[] {
    return Array.isArray(value) ? value as unknown as ToolResult[] : []
  }
}
