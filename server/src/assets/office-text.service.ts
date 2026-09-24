import { Injectable } from '@nestjs/common'
import { extname } from 'node:path'
import ExcelJS = require('exceljs')
import { extractRawText } from 'mammoth'

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const SHEET_MIMES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel.sheet.macroEnabled.12',
])

/** Office files are zipped XML, so a modest archive can expand into far more text than it weighs.
 *  Both budgets are hard caps: parsing stops rather than growing the prompt without bound. */
export const OFFICE_TEXT_MAX_BYTES = 20 * 1024 * 1024
export const OFFICE_TEXT_MAX_CELLS = 10_000

export type OfficeTextKind = 'docx' | 'sheet'
export type OfficeTextResult = { text: string; truncated: boolean }

@Injectable()
export class OfficeTextService {
  /** Identifies modern Office formats by extension first, since browsers report inconsistent
   *  MIME types for `.docx`/`.xlsx`/`.xlsm`. */
  kind(name: string, mimeType: string): OfficeTextKind | null {
    const extension = extname(name).toLowerCase()
    if (extension === '.docx' || mimeType === DOCX_MIME) return 'docx'
    if (extension === '.xlsx' || extension === '.xlsm' || SHEET_MIMES.has(mimeType)) return 'sheet'
    return null
  }

  async extract(file: Buffer, name: string, mimeType: string): Promise<OfficeTextResult> {
    const kind = this.kind(name, mimeType)
    if (!kind) return { text: '', truncated: false }
    if (file.byteLength > OFFICE_TEXT_MAX_BYTES) return { text: '', truncated: true }
    return kind === 'docx' ? this.extractDocx(file) : this.extractSheet(file)
  }

  private async extractDocx(file: Buffer): Promise<OfficeTextResult> {
    const result = await extractRawText({ buffer: file })
    return { text: result.value.replaceAll('\u0000', '').trim(), truncated: false }
  }

  private async extractSheet(file: Buffer): Promise<OfficeTextResult> {
    const workbook = new ExcelJS.Workbook()
    // ExcelJS declares its own ArrayBuffer-shaped `Buffer`; a Node Buffer is what it reads at runtime.
    await workbook.xlsx.load(file as unknown as Parameters<typeof workbook.xlsx.load>[0])
    const lines: string[] = []
    let cells = 0
    let truncated = false

    for (const sheet of workbook.worksheets) {
      if (cells >= OFFICE_TEXT_MAX_CELLS) { truncated = true; break }
      lines.push(`# ${sheet.name}`)
      sheet.eachRow({ includeEmpty: false }, (row) => {
        if (cells >= OFFICE_TEXT_MAX_CELLS) { truncated = true; return }
        const values: string[] = []
        row.eachCell({ includeEmpty: false }, (cell) => {
          if (cells >= OFFICE_TEXT_MAX_CELLS) { truncated = true; return }
          values.push(this.cellText(cell))
          cells += 1
        })
        if (values.some(Boolean)) lines.push(values.join('\t'))
      })
    }

    return { text: lines.join('\n').replaceAll('\u0000', '').trim(), truncated }
  }

  private cellText(cell: ExcelJS.Cell) {
    const value = cell.value
    if (value === null || value === undefined) return ''
    // Formula cells expose the cached result; the formula itself is not useful as context.
    if (typeof value === 'object' && 'result' in value) return String((value as { result?: unknown }).result ?? '')
    if (value instanceof Date) return value.toISOString()
    return cell.text ?? String(value)
  }
}
