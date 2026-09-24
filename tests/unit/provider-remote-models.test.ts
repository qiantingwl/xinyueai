import assert from 'node:assert/strict'
import test from 'node:test'
import { hasSupportedImageSignature, remoteModelIds } from '../../server/src/providers/provider-remote-models'

test('remote model IDs flatten OpenAI and Worker catalog shapes', () => {
  assert.deepEqual(remoteModelIds({ data: [{ id: 'gpt-4o' }, { id: 'gpt-4o' }, 'flux'] }), ['flux', 'gpt-4o'])
  assert.deepEqual(remoteModelIds({ models: [{ name: 'image.generate' }] }), ['image.generate'])
  assert.deepEqual(remoteModelIds(['b', 'a']), ['a', 'b'])
})

test('image signature helper accepts PNG and JPEG magic bytes', () => {
  const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0])
  const text = Uint8Array.from([0x3c, 0x68, 0x74, 0x6d, 0x6c])
  assert.equal(hasSupportedImageSignature(png), true)
  assert.equal(hasSupportedImageSignature(jpeg), true)
  assert.equal(hasSupportedImageSignature(text), false)
})
