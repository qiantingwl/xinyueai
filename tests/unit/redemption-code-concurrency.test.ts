import assert from 'node:assert/strict'
import test from 'node:test'
import { createHash } from 'node:crypto'
import { EngagementController } from '../../server/src/engagement/engagement.controller'

const delay = () => new Promise((resolve) => setTimeout(resolve, 0))

/** Serializes transactions the same way `SELECT ... FOR UPDATE` does: the lock is taken inside the
 *  transaction and only released when it commits or rolls back. */
class RowLock {
  private tail: Promise<void> = Promise.resolve()

  async acquire() {
    let release!: () => void
    const held = new Promise<void>((resolve) => { release = resolve })
    const previous = this.tail
    this.tail = previous.then(() => held)
    await previous
    return release
  }
}

const CODE = 'GIFT-2026'
const codeHash = createHash('sha256').update(CODE.trim().toUpperCase()).digest('hex')

function createFixture(maxUses: number) {
  const redemption = { id: 'code-1', codeHash, credits: 500, maxUses, usedCount: 0, expiresAt: null as Date | null, disabledAt: null as Date | null }
  const ledger: { idempotencyKey: string; userId: string; amount: number }[] = []
  const lock = new RowLock()

  const models = {
    redemptionCode: {
      findUnique: async ({ where }: any) => {
        await delay()
        return where.codeHash === redemption.codeHash ? { id: redemption.id } : null
      },
      findUniqueOrThrow: async () => {
        await delay()
        return { ...redemption }
      },
      update: async ({ data }: any) => {
        if (data.usedCount?.increment) redemption.usedCount += data.usedCount.increment
        return { ...redemption }
      },
    },
    creditLedger: {
      findUnique: async ({ where }: any) => {
        await delay()
        return ledger.find((entry) => entry.idempotencyKey === where.idempotencyKey) ?? null
      },
    },
  }

  const prisma = {
    ...models,
    $transaction: async (fn: any) => {
      let release: (() => void) | null = null
      const tx = {
        ...models,
        $queryRaw: async () => {
          release = await lock.acquire()
          return [{ id: redemption.id }]
        },
      }
      try {
        return await fn(tx)
      } finally {
        release?.()
      }
    },
  }

  const credits = {
    mutateInTransaction: async (_tx: unknown, userId: string, amount: number, _type: unknown, _description: string, idempotencyKey: string) => {
      ledger.push({ idempotencyKey, userId, amount })
      return { id: `ledger-${ledger.length}` }
    },
  }

  const controller = new EngagementController(prisma as never, credits as never)
  return { controller, redemption, ledger }
}

test('并发兑换同一个单次兑换码时只有一个用户拿到创作点', async () => {
  const { controller, redemption, ledger } = createFixture(1)

  const results = await Promise.all([
    controller.redeem({ id: 'user-a' } as never, { code: CODE } as never),
    controller.redeem({ id: 'user-b' } as never, { code: CODE } as never),
  ])

  const granted = results.filter((result) => result.redeemed)
  assert.equal(granted.length, 1, 'maxUses=1 的兑换码不能被两个用户同时兑换')
  assert.equal(ledger.length, 1, '只应写入一条创作点流水')
  assert.equal(redemption.usedCount, 1)
  const rejected = results.find((result) => !result.redeemed)
  assert.equal(rejected?.reason, 'INVALID_CODE')
})

test('同一用户重复兑换不会重复发放也不会白吃名额', async () => {
  const { controller, redemption, ledger } = createFixture(5)

  const first = await controller.redeem({ id: 'user-a' } as never, { code: CODE } as never)
  const second = await controller.redeem({ id: 'user-a' } as never, { code: CODE } as never)

  assert.equal(first.redeemed, true)
  assert.equal(second.redeemed, false)
  assert.equal(second.reason, 'ALREADY_REDEEMED')
  assert.equal(ledger.length, 1)
  assert.equal(redemption.usedCount, 1, '重复兑换不应继续消耗剩余名额')
})

test('名额用尽后兑换直接失败且不写流水', async () => {
  const { controller, redemption, ledger } = createFixture(1)
  redemption.usedCount = 1

  const result = await controller.redeem({ id: 'user-c' } as never, { code: CODE } as never)

  assert.equal(result.redeemed, false)
  assert.equal(result.reason, 'INVALID_CODE')
  assert.equal(ledger.length, 0)
  assert.equal(redemption.usedCount, 1)
})
