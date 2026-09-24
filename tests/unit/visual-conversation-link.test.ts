import assert from 'node:assert/strict'
import test from 'node:test'
import { GenerationsService } from '../../server/src/generations/generations.service'

function visualJob(conversationId: string | null, options: Record<string, unknown> = {}) {
  return {
    options,
    id: 'job-visual',
    userId: 'user-1',
    kind: 'IMAGE',
    status: 'SUCCEEDED',
    settlementStatus: 'SETTLED',
    errorMessage: null,
    prompt: '一只猫',
    model: 'image-test',
    projectId: null,
    conversationId,
    outputs: [],
    events: [],
    providerAttempts: [],
    billingTransactions: [],
    usageRecords: [],
  }
}

function serviceWith(prisma: Record<string, unknown>) {
  const none = {} as never
  return new GenerationsService(prisma as never, none, none, none, none, none, none, none, none, none, none, none, none, none, none, none)
}

test('concurrent reads link only one conversation to an orphan visual job', async () => {
  const deleted: string[] = []
  let reads = 0
  const prisma = {
    generationJob: {
      findFirst: async () => visualJob(reads++ === 0 ? null : 'conversation-winner'),
      updateMany: async () => ({ count: 0 }),
    },
    conversation: {
      create: async () => ({ id: 'conversation-loser' }),
      deleteMany: async (input: { where: { id: string } }) => {
        deleted.push(input.where.id)
        return { count: 1 }
      },
    },
  }

  const result = await serviceWith(prisma).get('user-1', 'job-visual')

  assert.deepEqual(deleted, ['conversation-loser'])
  assert.equal(result.conversationId, 'conversation-winner')
})

test('an orphan visual job is linked to the conversation created for it', async () => {
  let linkedTo: string | undefined
  let reads = 0
  const prisma = {
    generationJob: {
      findFirst: async () => visualJob(reads++ === 0 ? null : linkedTo ?? null),
      updateMany: async (input: { where: Record<string, unknown>; data: { conversationId: string } }) => {
        assert.equal(input.where.conversationId, null)
        linkedTo = input.data.conversationId
        return { count: 1 }
      },
    },
    conversation: {
      create: async () => ({ id: 'conversation-new' }),
      deleteMany: async () => { throw new Error('must not delete a linked conversation') },
    },
  }

  const result = await serviceWith(prisma).get('user-1', 'job-visual')

  assert.equal(result.conversationId, 'conversation-new')
})

test('visual jobs from a temporary chat never gain a history conversation', async () => {
  const forbidden = async () => { throw new Error('temporary chat jobs must not touch conversations') }
  const temporaryJob = visualJob(null, { temporaryConversation: true })
  const prisma = {
    generationJob: {
      findFirst: async () => temporaryJob,
      findMany: async () => [temporaryJob],
      updateMany: forbidden,
    },
    conversation: { create: forbidden, updateMany: forbidden, deleteMany: forbidden },
  }
  const service = serviceWith(prisma)

  assert.equal((await service.get('user-1', 'job-visual')).conversationId, null)
  assert.equal((await service.list('user-1', 'IMAGE' as never))[0]?.conversationId, null)
})
