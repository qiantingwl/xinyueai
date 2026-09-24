import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { OFFICE_TEXT_MAX_CELLS, OfficeTextService } from '../../server/src/assets/office-text.service'

// `docx` and `exceljs` are backend dependencies, so resolve them from `server/` rather than the root.
const serverRequire = createRequire(new URL('../../server/package.json', import.meta.url))
const { Document, Packer, Paragraph } = serverRequire('docx')
const ExcelJS = serverRequire('exceljs')

const service = new OfficeTextService()

async function buildDocx(paragraphs: string[]): Promise<Buffer> {
  const document = new Document({ sections: [{ children: paragraphs.map((text: string) => new Paragraph(text)) }] })
  return Packer.toBuffer(document)
}

async function buildWorkbook(rows: Array<Array<string | number>>, sheetName = '数据'): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet(sheetName)
  rows.forEach((row) => sheet.addRow(row))
  return Buffer.from(await workbook.xlsx.writeBuffer())
}

test('按扩展名与 MIME 识别 Word 与 Excel 附件', () => {
  assert.equal(service.kind('report.docx', 'application/octet-stream'), 'docx')
  assert.equal(service.kind('report.DOCX', ''), 'docx')
  assert.equal(service.kind('data.xlsx', ''), 'sheet')
  assert.equal(service.kind('macro.xlsm', ''), 'sheet')
  assert.equal(service.kind('unnamed', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'), 'docx')
  assert.equal(service.kind('unnamed', 'application/vnd.ms-excel.sheet.macroEnabled.12'), 'sheet')
  assert.equal(service.kind('notes.txt', 'text/plain'), null)
  assert.equal(service.kind('photo.png', 'image/png'), null)
})

test('DOCX 正文被提取为纯文本', async () => {
  const file = await buildDocx(['季度复盘', '收入同比增长 18%', '下季度聚焦留存'])
  const result = await service.extract(file, 'review.docx', '')

  assert.equal(result.truncated, false)
  assert.match(result.text, /季度复盘/)
  assert.match(result.text, /收入同比增长 18%/)
  assert.match(result.text, /下季度聚焦留存/)
})

test('XLSX 按工作表与行还原为可读文本', async () => {
  const file = await buildWorkbook([['城市', '订单'], ['上海', 120], ['深圳', 96]], '销量')
  const result = await service.extract(file, 'sales.xlsx', '')

  assert.equal(result.truncated, false)
  assert.match(result.text, /^# 销量/m)
  assert.match(result.text, /城市\t订单/)
  assert.match(result.text, /上海\t120/)
  assert.match(result.text, /深圳\t96/)
})

test('Excel 单元格数量超过上限时截断并标记', async () => {
  const rows = Array.from({ length: 4_000 }, (_, index) => [`行${index}`, index, `备注${index}`])
  const file = await buildWorkbook(rows)
  const result = await service.extract(file, 'big.xlsx', '')

  assert.equal(result.truncated, true)
  // 3 cells per row, so the budget must stop well before the last row is reached.
  assert.equal(result.text.includes('行3999'), false)
  assert.ok(result.text.length > 0, '截断不应丢弃已解析内容')
  const parsedRows = result.text.split('\n').filter((line: string) => line.startsWith('行')).length
  assert.ok(parsedRows <= Math.ceil(OFFICE_TEXT_MAX_CELLS / 3), `解析行数应受单元格预算约束，实际 ${parsedRows}`)
})

test('超过体积上限的 Office 文件不被解析', async () => {
  const oversized = Buffer.alloc(21 * 1024 * 1024)
  const result = await service.extract(oversized, 'huge.docx', '')

  assert.equal(result.text, '')
  assert.equal(result.truncated, true)
})

test('非 Office 附件直接返回空结果而不尝试解压', async () => {
  const result = await service.extract(Buffer.from('plain text'), 'notes.txt', 'text/plain')
  assert.equal(result.text, '')
  assert.equal(result.truncated, false)
})

test('公式单元格使用缓存结果而不是公式本身', async () => {
  const workbook = new ExcelJS.Workbook() as InstanceType<typeof ExcelJS.Workbook>
  const sheet = workbook.addWorksheet('计算')
  sheet.addRow(['数量', 2])
  sheet.getCell('B2').value = { formula: 'B1*3', result: 6 }
  const file = Buffer.from(await workbook.xlsx.writeBuffer())

  const result = await service.extract(file, 'formula.xlsx', '')
  assert.match(result.text, /6/)
  assert.equal(result.text.includes('B1*3'), false)
})
