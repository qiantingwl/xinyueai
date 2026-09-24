import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { AssetsService } from '../../server/src/assets/assets.service'
import { ObjectStorageService } from '../../server/src/assets/object-storage.service'
import { OfficeTextService } from '../../server/src/assets/office-text.service'
import { EXPORT_BATCH_SIZE, ExportWriter } from '../../server/src/exports/export-writer'

function collectingStream() {
  const chunks: string[] = []
  const stream = {
    write(chunk: string) { chunks.push(chunk); return true },
    end(callback: () => void) { callback() },
    once() { return stream },
  }
  return { stream, text: () => chunks.join('') }
}

function rows(count: number, prefix = 'row') {
  return Array.from({ length: count }, (_, index) => ({ id: `${prefix}-${index}`, createdAt: new Date(1700000000000 + index) }))
}

test('导出写入器产出合法 JSON 且不在内存中拼接整份文档', async () => {
  const sink = collectingStream()
  const writer = new ExportWriter(sink.stream as never, 1024 * 1024, 1000)
  await writer.open()
  await writer.field('exportedAt', '2026-01-01T00:00:00.000Z')
  await writer.field('account', { id: 'user-1', size: 12n })
  const written = await writer.collection('assets', async (cursor) => (cursor ? [] : rows(3)), (row) => ({ id: row.id }))
  const summary = await writer.close()

  const parsed = JSON.parse(sink.text())
  assert.equal(written, 3)
  assert.equal(parsed.exportedAt, '2026-01-01T00:00:00.000Z')
  assert.equal(parsed.account.size, 12)
  assert.deepEqual(parsed.assets.map((item: { id: string }) => item.id), ['row-0', 'row-1', 'row-2'])
  assert.deepEqual(parsed.truncatedCollections, [])
  assert.equal(summary.truncated.length, 0)
})

test('导出超过体积上限时以可读提示失败而不是写满磁盘', async () => {
  const sink = collectingStream()
  const writer = new ExportWriter(sink.stream as never, 256, 10_000)
  await writer.open()
  await assert.rejects(
    () => writer.collection('conversations', async () => rows(EXPORT_BATCH_SIZE).map((row) => ({ ...row, content: 'x'.repeat(200) })), (row) => row),
    /导出数据超出单次导出体积上限/,
  )
})

test('导出达到行数上限时截断并记录被截断的集合', async () => {
  const sink = collectingStream()
  const writer = new ExportWriter(sink.stream as never, 10 * 1024 * 1024, 250)
  await writer.open()
  let pages = 0
  const written = await writer.collection('generations', async () => { pages += 1; return rows(EXPORT_BATCH_SIZE, `p${pages}`) }, (row) => ({ id: row.id }))
  const summary = await writer.close()

  assert.equal(written, 250)
  assert.equal(pages, 2, '达到上限后必须停止继续翻页')
  assert.deepEqual(summary.truncated, ['generations'])
  assert.deepEqual(JSON.parse(sink.text()).truncatedCollections, ['generations'])
})

test('本地对象存储读取超过上限的文件会被拒绝', async () => {
  const root = await mkdtemp(join(tmpdir(), 'xinyue-storage-'))
  await writeFile(join(root, 'big.bin'), Buffer.alloc(2 * 1024 * 1024, 1))
  await writeFile(join(root, 'small.bin'), Buffer.alloc(1024, 2))
  const config = { get: (key: string, fallback?: unknown) => (key === 'UPLOAD_DIR' ? root : key === 'STORAGE_DRIVER' ? 'local' : key === 'STORAGE_MAX_READ_MB' ? 1 : fallback) }
  const storage = new ObjectStorageService(config as never)
  const location = storage.activeLocation()

  await assert.rejects(() => storage.read(location, 'big.bin'), /超出可读取的大小上限/)
  await assert.rejects(() => storage.readStream(location, 'big.bin'), /超出可读取的大小上限/)
  assert.equal((await storage.read(location, 'small.bin')).byteLength, 1024)
})

test('文本摘要只读取预算内的字节且不截断多字节字符', async () => {
  const payload = Buffer.from('一二三四五', 'utf8')
  let destroyed = false
  const storage = {
    readStream: async () => {
      const stream = Readable.from([payload.subarray(0, 6), payload.subarray(6)])
      const originalDestroy = stream.destroy.bind(stream)
      stream.destroy = ((...args: unknown[]) => { destroyed = true; return originalDestroy(...(args as [])) }) as typeof stream.destroy
      return { stream, size: payload.byteLength }
    },
  }
  const access = { assertAssetReadable: async () => ({ id: 'asset-1', objectKey: 'k', storageDriver: 'local', storageBucket: '', mimeType: 'text/plain', name: 'a.txt' }) }
  const assets = new AssetsService(storage as never, {} as never, access as never, new OfficeTextService())

  const excerpt = await assets.readTextExcerptForUser('user-1', 'asset-1', 4)
  assert.equal(excerpt.text, '一')
  assert.equal(excerpt.truncated, true)
  assert.equal(destroyed, true, '达到预算后必须停止传输')

  const full = await assets.readTextExcerptForUser('user-1', 'asset-1', 1024)
  assert.equal(full.text, '一二三四五')
  assert.equal(full.truncated, false)
})

test('非文本资产不会被读入知识库摘要', async () => {
  let readStreamCalls = 0
  const storage = { readStream: async () => { readStreamCalls += 1; return { stream: Readable.from([Buffer.alloc(8)]), size: 8 } } }
  const access = { assertAssetReadable: async () => ({ id: 'asset-2', objectKey: 'k', storageDriver: 'local', storageBucket: '', mimeType: 'image/png', name: 'a.png' }) }
  const assets = new AssetsService(storage as never, {} as never, access as never, new OfficeTextService())

  const excerpt = await assets.readTextExcerptForUser('user-1', 'asset-2', 2_000_000)
  assert.equal(excerpt.text, '')
  assert.equal(readStreamCalls, 0)
})
