import assert from 'node:assert/strict'
import test from 'node:test'
import { isUserOwnedChatFree } from '../../server/src/generations/chat-billing.ts'

test('user-owned chat is free when the plan marks BYOK as free', () => {
  assert.equal(isUserOwnedChatFree('user', 'FREE', 12, 36), true)
  assert.equal(isUserOwnedChatFree('admin', 'FREE', 12, 36), false)
})

test('user-owned chat is free when no matching token price exists', () => {
  assert.equal(isUserOwnedChatFree('user', 'QUOTA', 0, 0), true)
  assert.equal(isUserOwnedChatFree('user', 'QUOTA', 8, 0), false)
  assert.equal(isUserOwnedChatFree('user', undefined, 0, 0), true)
})
