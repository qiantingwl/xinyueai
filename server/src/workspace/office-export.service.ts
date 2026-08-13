import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { AssetKind } from '@prisma/client'
import { Document, HeadingLevel, Packer, Paragraph } from 'docx'
import ExcelJS = require('exceljs')
import { PassThrough } from 'node:stream'
import { AssetsService } from '../assets/assets.service'
import { PrismaService } from '../prisma/prisma.service'

type PresentationTextOptions = {
  x?: number | string
  y?: number | string
  cx?: number | string
  cy?: number | string
  font_face?: string
  font_size?: number
  color?: string
  fill?: string
  line?: string
  line_size?: number
  bold?: boolean
  align?: 'left' | 'right' | 'center' | 'justify'
  bodyProp?: Record<string, unknown>
}
type PresentationSlide = {
  back: string
  addText(text: string, options?: PresentationTextOptions): unknown
  addShape(shape: string, options?: PresentationTextOptions): unknown
}
type PresentationDocument = {
  shapes: { RECT: string; LINE: string }
  setDocTitle(title: string): void
  setWidescreen(wide: boolean): void
  makeNewSlide(): PresentationSlide
  generate(stream: NodeJS.WritableStream): void
  on(event: 'error', listener: (error: Error | string) => void): void
}
type OfficegenFactory = (type: 'pptx') => PresentationDocument

const officegen = require('officegen') as OfficegenFactory

type OfficeFormat = 'pptx' | 'xlsx' | 'docx' | 'md'
type MarkdownSection = { title: string; lines: string[] }

const skillFormats: Record<string, OfficeFormat> = {
  ppt: 'pptx',
  analysis: 'xlsx',
  spreadsheet: 'xlsx',
  excel: 'xlsx',
  development: 'md',
}

const mimeTypes: Record<OfficeFormat, string> = {
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  md: 'text/markdown',
}

function cleanMarkdown(value: string) {
  return value
    .replace(/^\s{0,3}#{1,6}\s+/, '')
    .replace(/^\s*[-*+]\s+/, '')
    .replace(/^\s*\d+[.、]\s+/, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .trim()
}

function safeBaseName(value: string) {
  return cleanMarkdown(value).replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 72) || '办公任务'
}

function parseSections(content: string, fallbackTitle: string): MarkdownSection[] {
  const sections: MarkdownSection[] = []
  let current: MarkdownSection | null = null
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) continue
    const heading = line.match(/^#{1,3}\s+(.+)$/)?.[1]
      || line.match(/^第\s*\d+\s*页[：:]?\s*(.+)$/)?.[1]
      || line.match(/^Slide\s*\d+[：:]?\s*(.+)$/i)?.[1]
    if (heading) {
      current = { title: cleanMarkdown(heading), lines: [] }
      sections.push(current)
      continue
    }
    if (!current) {
      current = { title: fallbackTitle, lines: [] }
      sections.push(current)
    }
    current.lines.push(cleanMarkdown(line))
  }
  return sections.filter((section) => section.title || section.lines.length)
}

function parseMarkdownTables(content: string) {
  const lines = content.split(/\r?\n/)
  const tables: string[][][] = []
  for (let index = 0; index < lines.length - 1; index += 1) {
    const header = lines[index].trim()
    const separator = lines[index + 1].trim()
    if (!header.includes('|') || !/^\s*\|?\s*:?-{3,}/.test(separator)) continue
    const rows: string[][] = []
    const split = (line: string) => line.replace(/^\s*\||\|\s*$/g, '').split('|').map((cell) => cleanMarkdown(cell))
    rows.push(split(header))
    index += 2
    while (index < lines.length && lines[index].includes('|') && lines[index].trim()) {
      rows.push(split(lines[index]))
      index += 1
    }
    index -= 1
    if (rows.length) tables.push(rows)
  }
  return tables
}

@Injectable()
export class OfficeExportService {
  constructor(private readonly prisma: PrismaService, private readonly assets: AssetsService) {}

  async create(userId: string, conversationId: string, requestedFormat?: OfficeFormat, messageId?: string) {
    const conversation = await this.prisma.conversation.findFirst({ where: { id: conversationId, userId }, select: { id: true, title: true } })
    if (!conversation) throw new NotFoundException('对话不存在')
    const requestedMessage = messageId ? await this.prisma.message.findFirst({ where: { id: messageId, conversationId, role: 'ASSISTANT', deletedAt: null }, select: { id: true, content: true } }) : null
    if (messageId && !requestedMessage) throw new NotFoundException('要导出的回答不存在')
    const agentTask = await this.prisma.agentTask.findFirst({
      where: { userId, conversationId, status: 'SUCCEEDED' },
      include: { runs: { where: { status: 'SUCCEEDED' }, orderBy: { completedAt: 'desc' }, take: 1 } },
    })
    const jobs = await this.prisma.generationJob.findMany({
      where: { userId, conversationId, kind: 'CHAT', status: 'SUCCEEDED' },
      orderBy: { completedAt: 'desc' },
      take: 20,
      select: { id: true, options: true },
    })
    const job = jobs.find((item) => {
      const options = item.options && typeof item.options === 'object' && !Array.isArray(item.options) ? item.options as Record<string, unknown> : {}
      return typeof options.officeSkill === 'string'
    })
    if (!requestedMessage && !job && !agentTask?.runs[0]) throw new BadRequestException('该对话不是可导出的办公任务')
    const sourceId = requestedMessage?.id || agentTask?.runs[0]?.id || job!.id
    const options = job?.options && typeof job.options === 'object' && !Array.isArray(job.options) ? job.options as Record<string, unknown> : {}
    const skillId = agentTask?.skillId || String(options.officeSkill || '')
    const format = requestedFormat || (skillId.startsWith('assistant:') ? 'docx' : skillFormats[skillId] || 'docx')
    const sourceMetadata = requestedMessage ? { path: ['officeMessageId'], equals: sourceId } : agentTask?.runs[0] ? { path: ['agentRunId'], equals: sourceId } : { path: ['officeJobId'], equals: sourceId }
    const existing = await this.prisma.asset.findFirst({ where: { userId, deletedAt: null, AND: [{ metadata: sourceMetadata }, { metadata: { path: ['officeFormat'], equals: format } }] } })
    if (existing) {
      if (agentTask?.runs[0]) await this.attachArtifact(agentTask.runs[0].id, agentTask.runs[0].artifactIds, existing.id)
      return this.publicAsset(existing)
    }

    const message = !requestedMessage && job ? await this.prisma.message.findFirst({ where: { conversationId, metadata: { path: ['jobId'], equals: job.id } }, select: { content: true } }) : null
    const content = requestedMessage?.content || agentTask?.runs[0]?.finalAnswer || message?.content || ''
    if (!content.trim()) throw new BadRequestException('办公任务尚未生成可导出的内容')
    const title = safeBaseName(conversation.title.replace(/^[^·]+·\s*/, ''))
    const bytes = await this.render(format, title, content)
    const name = `${title}.${format}`
    const asset = await this.assets.storeGenerated(userId, bytes, {
      name,
      mimeType: mimeTypes[format],
      kind: AssetKind.FILE,
      metadata: { purpose: 'generated', ...(requestedMessage ? { officeMessageId: sourceId } : agentTask?.runs[0] ? { agentRunId: sourceId } : { officeJobId: sourceId }), officeConversationId: conversationId, officeSkill: skillId, officeFormat: format },
    })
    if (agentTask?.runs[0]) {
      await this.attachArtifact(agentTask.runs[0].id, agentTask.runs[0].artifactIds, asset.id)
    }
    return this.publicAsset(asset)
  }

  private publicAsset(asset: { id: string; name: string; mimeType: string; size: bigint; createdAt: Date }) {
    return { ...asset, size: Number(asset.size), contentUrl: `/v1/assets/${asset.id}/content` }
  }

  private attachArtifact(runId: string, value: unknown, assetId: string) {
    const current = Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
    return this.prisma.agentRun.update({ where: { id: runId }, data: { artifactIds: [...new Set([...current, assetId])] } })
  }

  private render(format: OfficeFormat, title: string, content: string) {
    if (format === 'pptx') return this.renderPresentation(title, content)
    if (format === 'xlsx') return this.renderWorkbook(title, content)
    if (format === 'docx') return this.renderDocument(title, content)
    return Promise.resolve(Buffer.from(content, 'utf8'))
  }

  private async renderPresentation(title: string, content: string) {
    const pptx = officegen('pptx')
    pptx.setDocTitle(title)
    pptx.setWidescreen(true)

    const cover = pptx.makeNewSlide()
    cover.back = 'F7F8FA'
    cover.addShape(pptx.shapes.RECT, { x: 0, y: 0, cx: 12, cy: 540, fill: '2563EB', line: '2563EB' })
    cover.addText(title, { x: 66, y: 176, cx: 806, cy: 70, font_face: 'Microsoft YaHei', font_size: 30, bold: true, color: '111827', bodyProp: { normAutofit: 90000 } })
    cover.addText('Xinyue AI · 办公中心', { x: 68, y: 256, cx: 396, cy: 28, font_face: 'Microsoft YaHei', font_size: 11, color: '64748B' })

    const sections = parseSections(content, title)
    const contentSections = sections.length > 1 && sections[0].lines.length <= 1 ? sections.slice(1) : sections
    for (const [sectionIndex, section] of contentSections.slice(0, 24).entries()) {
      const chunks: string[][] = []
      for (let index = 0; index < section.lines.length; index += 8) chunks.push(section.lines.slice(index, index + 8))
      if (!chunks.length) chunks.push([''])
      for (const [chunkIndex, lines] of chunks.entries()) {
        const slide = pptx.makeNewSlide()
        slide.back = 'FFFFFF'
        slide.addText(chunkIndex ? `${section.title}（续）` : section.title, { x: 52, y: 38, cx: 842, cy: 42, font_face: 'Microsoft YaHei', font_size: 22, bold: true, color: '111827', bodyProp: { normAutofit: 90000 } })
        slide.addShape(pptx.shapes.LINE, { x: 52, y: 88, cx: 854, cy: 0, line: 'DDE3EA', line_size: 1 })
        const body = lines.map((line) => cleanMarkdown(line)).filter(Boolean).map((line) => `• ${line}`).join('\n') || ' '
        slide.addText(body, { x: 62, y: 112, cx: 820, cy: 356, font_face: 'Microsoft YaHei', font_size: 16, color: '334155', bodyProp: { normAutofit: 85000 } })
        slide.addText(`${sectionIndex + 1}`, { x: 858, y: 506, cx: 48, cy: 14, font_face: 'Microsoft YaHei', font_size: 8, color: '94A3B8', align: 'right' })
      }
    }
    return new Promise<Buffer>((resolve, reject) => {
      const output = new PassThrough()
      const chunks: Buffer[] = []
      let settled = false
      const fail = (error: unknown) => {
        if (settled) return
        settled = true
        reject(error instanceof Error ? error : new Error(String(error)))
      }
      output.on('data', (chunk: Buffer | Uint8Array) => chunks.push(Buffer.from(chunk)))
      output.on('error', fail)
      output.on('finish', () => {
        if (settled) return
        settled = true
        resolve(Buffer.concat(chunks))
      })
      pptx.on('error', fail)
      pptx.generate(output)
    })
  }

  private async renderWorkbook(title: string, content: string) {
    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'Xinyue AI'
    workbook.created = new Date()
    const tables = parseMarkdownTables(content)
    if (tables.length) {
      tables.forEach((rows, index) => {
        const sheet = workbook.addWorksheet(`数据${index + 1}`)
        rows.forEach((row) => sheet.addRow(row))
        const header = sheet.getRow(1)
        header.font = { bold: true, color: { argb: 'FFFFFFFF' } }
        header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } }
        header.alignment = { vertical: 'middle', horizontal: 'left' }
        sheet.views = [{ state: 'frozen', ySplit: 1 }]
        sheet.columns.forEach((column, columnIndex) => { column.width = Math.min(42, Math.max(14, ...rows.map((row) => String(row[columnIndex] || '').length + 2))) })
        sheet.eachRow((row) => { row.alignment = { vertical: 'top', wrapText: true }; row.height = Math.max(row.height || 18, 20) })
        sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: Math.max(1, rows[0]?.length || 1) } }
      })
    } else {
      const sheet = workbook.addWorksheet('分析结果')
      sheet.columns = [{ header: '序号', key: 'index', width: 10 }, { header: title, key: 'content', width: 100 }]
      content.split(/\r?\n/).map(cleanMarkdown).filter(Boolean).forEach((line, index) => sheet.addRow({ index: index + 1, content: line }))
      const header = sheet.getRow(1)
      header.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } }
      sheet.views = [{ state: 'frozen', ySplit: 1 }]
      sheet.eachRow((row) => { row.alignment = { vertical: 'top', wrapText: true } })
    }
    return Buffer.from(await workbook.xlsx.writeBuffer())
  }

  private async renderDocument(title: string, content: string) {
    const children: Paragraph[] = [new Paragraph({ text: title, heading: HeadingLevel.TITLE })]
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim()
      if (!line) continue
      const heading = line.match(/^(#{1,3})\s+(.+)$/)
      if (heading) {
        const level = heading[1].length === 1 ? HeadingLevel.HEADING_1 : heading[1].length === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3
        children.push(new Paragraph({ text: cleanMarkdown(heading[2]), heading: level }))
      } else if (/^[-*+]\s+/.test(line)) {
        children.push(new Paragraph({ text: cleanMarkdown(line), bullet: { level: 0 } }))
      } else {
        children.push(new Paragraph({ text: cleanMarkdown(line), spacing: { after: 140, line: 320 } }))
      }
    }
    const document = new Document({ creator: 'Xinyue AI', title, description: '由 Xinyue AI 办公中心生成', sections: [{ children }] })
    return Packer.toBuffer(document)
  }
}
