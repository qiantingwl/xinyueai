import type { GenerationJob } from '@prisma/client'
import type { Prisma } from '@prisma/client'
import { preinstalledPluginWhere } from '../plugins/plugin-preinstall'
import type { PrismaService } from '../prisma/prisma.service'

const pluginSelect = { name: true, instruction: true, outputRequirements: true } as const

export function publishedPluginWhere(userId: string, pluginId: string): Prisma.PluginWhereInput {
  return {
    id: pluginId,
    status: 'PUBLISHED',
    OR: [
      { ownerId: userId, visibility: 'PRIVATE' },
      { visibility: 'OFFICIAL', installations: { some: { userId, enabled: true } } },
      preinstalledPluginWhere(userId),
    ],
  }
}

export async function loadPublishedPlugin(prisma: PrismaService, userId: string, pluginId: string) {
  return prisma.plugin.findFirst({
    where: publishedPluginWhere(userId, pluginId),
    select: pluginSelect,
  })
}

export function formatPluginInstruction(plugin: { name: string; instruction: string; outputRequirements: string }) {
  return [`当前启用插件：${plugin.name}`, plugin.instruction.trim(), plugin.outputRequirements.trim() ? `输出要求：${plugin.outputRequirements.trim()}` : ''].filter(Boolean).join('\n')
}

export async function pluginInstructionForTask(
  prisma: PrismaService,
  task: Pick<GenerationJob, 'userId' | 'options'>,
  missingMessage = '插件已停用、未安装或不支持当前创作类型',
) {
  const options = task.options as Record<string, unknown>
  const pluginId = typeof options.pluginId === 'string' ? options.pluginId : ''
  if (!pluginId) return ''
  const plugin = await loadPublishedPlugin(prisma, task.userId, pluginId)
  if (!plugin) throw new Error(missingMessage)
  return formatPluginInstruction(plugin)
}

export async function pluginAugmentedPrompt(
  prisma: PrismaService,
  task: Pick<GenerationJob, 'userId' | 'options' | 'prompt'>,
  missingMessage?: string,
) {
  const instruction = await pluginInstructionForTask(prisma, task, missingMessage)
  return instruction ? `${task.prompt}\n\n插件增强要求（在不改变用户核心意图的前提下执行）：\n${instruction}` : task.prompt
}
