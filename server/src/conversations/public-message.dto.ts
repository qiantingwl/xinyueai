import { MessageRole, Prisma } from '@prisma/client'
import { PublicAssetSource, toPublicAsset } from '../assets/public-asset.dto'

type PublicMessageSource = {
  id: string
  role: MessageRole
  content: string
  model: string | null
  metadata: Prisma.JsonValue | null
  createdAt: Date
  parentId: string | null
  branchIndex: number
  author?: { id: string; displayName: string } | null
  attachments?: Array<{ assetId: string; asset?: PublicAssetSource }>
}

export class PublicMessageDto {
  id!: string
  role!: MessageRole
  content!: string
  model!: string | null
  metadata!: Record<string, unknown> | null
  createdAt!: Date
  parentId!: string | null
  branchIndex!: number
  branchCount?: number
  branches?: Array<{ id: string; branchIndex: number }>
  author?: { id: string; displayName: string } | null
  attachments!: Array<{ assetId: string; asset?: ReturnType<typeof toPublicAsset> }>
}

function recordOf(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function publicWebSearch(value: unknown) {
  const search = recordOf(value)
  if (!Object.keys(search).length) return undefined
  const result: Record<string, unknown> = {}
  for (const key of ['enabled', 'status', 'queries', 'sources']) if (search[key] !== undefined) result[key] = search[key]
  if (typeof search.error === 'string' && search.error.trim()) result.error = '搜索暂时不可用'
  return result
}

export function publicMessageMetadata(value: unknown) {
  const metadata = recordOf(value)
  if (!Object.keys(metadata).length) return null
  const result: Record<string, unknown> = {}
  for (const key of ['jobId', 'feedback', 'reasoning', 'reasoningTokens', 'thinkingSeconds', 'suggestionVersion', 'suggestions']) {
    if (metadata[key] !== undefined) result[key] = metadata[key]
  }
  const webSearch = publicWebSearch(metadata.webSearch)
  if (webSearch) result.webSearch = webSearch
  return result
}

export function toPublicMessage(
  message: PublicMessageSource,
  options: { branches?: Array<{ id: string; branchIndex: number }>; branchCount?: number } = {},
): PublicMessageDto {
  const branches = options.branches
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    model: message.model,
    metadata: publicMessageMetadata(message.metadata),
    createdAt: message.createdAt,
    parentId: message.parentId,
    branchIndex: message.branchIndex,
    ...(branches ? { branchCount: branches.length || 1, branches: branches.length ? branches : [{ id: message.id, branchIndex: message.branchIndex }] } : options.branchCount !== undefined ? { branchCount: options.branchCount } : {}),
    ...(message.author !== undefined ? { author: message.author ? { id: message.author.id, displayName: message.author.displayName } : null } : {}),
    attachments: (message.attachments || []).map((attachment) => ({
      assetId: attachment.assetId,
      ...(attachment.asset ? { asset: toPublicAsset(attachment.asset) } : {}),
    })),
  }
}
