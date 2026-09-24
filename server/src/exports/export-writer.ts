import { PayloadTooLargeException } from '@nestjs/common'
import type { WriteStream } from 'node:fs'
import { once } from 'node:events'

export const EXPORT_BATCH_SIZE = 200

type Cursor = { createdAt: Date; id: string }
type BatchLoader<T> = (cursor?: Cursor) => Promise<T[]>

function stringify(value: unknown) {
  return JSON.stringify(value, (_key, item) => (typeof item === 'bigint' ? Number(item) : item))
}

/** Serializes an export document straight to disk. Rows are appended batch by batch so a large
 *  account never materializes as one in-memory object graph plus one giant JSON string, and both a
 *  byte and a row budget bound what a single job can cost. */
export class ExportWriter {
  private bytes = 0
  private readonly truncated: string[] = []

  constructor(private readonly stream: WriteStream, private readonly maxBytes: number, private readonly maxRows: number) {}

  private async push(chunk: string) {
    this.bytes += Buffer.byteLength(chunk)
    if (this.bytes > this.maxBytes) throw new PayloadTooLargeException('导出数据超出单次导出体积上限，请缩小导出范围后重试')
    if (!this.stream.write(chunk)) await once(this.stream, 'drain')
  }

  async field(name: string, value: unknown) {
    await this.push(`${stringify(name)}:${stringify(value) ?? 'null'},`)
  }

  /** Streams one array field, pulling rows through `load` until a short batch or a budget is hit. */
  async collection<T extends Cursor>(name: string, load: BatchLoader<T>, map: (row: T) => unknown) {
    await this.push(`${stringify(name)}:[`)
    let cursor: Cursor | undefined
    let written = 0
    while (true) {
      const batch = await load(cursor)
      if (!batch.length) break
      for (const row of batch) {
        if (written >= this.maxRows) break
        await this.push(`${written ? ',' : ''}${stringify(map(row))}`)
        written += 1
      }
      const last = batch.at(-1)!
      cursor = { createdAt: last.createdAt, id: last.id }
      if (batch.length < EXPORT_BATCH_SIZE) break
      if (written >= this.maxRows) { this.truncated.push(name); break }
    }
    await this.push('],')
    return written
  }

  async open() { await this.push('{') }

  /** Closes the document, recording which collections hit the row budget. */
  async close() {
    await this.push(`"truncatedCollections":${stringify(this.truncated)}}`)
    await new Promise<void>((resolve, reject) => {
      this.stream.once('error', reject)
      this.stream.end(() => resolve())
    })
    return { bytes: this.bytes, truncated: [...this.truncated] }
  }
}
