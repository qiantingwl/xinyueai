import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { AssetKind } from '@prisma/client'
import { Document, HeadingLevel, Packer, Paragraph } from 'docx'
import ExcelJS = require('exceljs')
import AdmZip = require('adm-zip')
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
type OfficeExportInput = { conversationId?: string; agentTaskId?: string; messageId?: string; format?: OfficeFormat }

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

function inferSkillFromIntent(value: string) {
  const normalized = value.toLowerCase()
  if (/\b(pptx?|powerpoint)\b|演示文稿|幻灯片/.test(normalized)) return 'ppt'
  if (/\b(excel|xlsx|spreadsheet)\b|电子表格|数据表|数据分析/.test(normalized)) return 'excel'
  if (/\b(code|markdown)\b|代码|程序/.test(normalized)) return 'development'
  const prefix = value.split('·')[0]?.trim() || ''
  const titleSkills: Record<string, string> = {
    'PPT 大纲': 'ppt',
    '数据分析': 'analysis',
    '多维表格': 'spreadsheet',
    'Excel 助手': 'excel',
    '代码开发': 'development',
  }
  return titleSkills[prefix] || 'daily'
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

  async create(userId: string, input: OfficeExportInput) {
    if (!input.conversationId && !input.agentTaskId) throw new BadRequestException('缺少办公任务标识')
    const requestedAgentTask = input.agentTaskId ? await this.prisma.agentTask.findFirst({
      where: { id: input.agentTaskId, userId, status: 'SUCCEEDED' },
      include: { runs: { where: { status: 'SUCCEEDED' }, orderBy: { completedAt: 'desc' }, take: 1 } },
    }) : null
    if (input.agentTaskId && !requestedAgentTask) throw new BadRequestException('办公任务尚未完成或不存在')
    const conversationId = requestedAgentTask?.conversationId || input.conversationId
    if (!conversationId) throw new BadRequestException('办公任务尚未建立可导出的会话')
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, userId },
      select: { id: true, title: true, messages: { where: { role: 'ASSISTANT', deletedAt: null }, orderBy: { createdAt: 'desc' }, take: 1, select: { content: true } } },
    })
    if (!conversation) throw new NotFoundException('办公任务不存在')
    const requestedMessage = input.messageId ? await this.prisma.message.findFirst({
      where: { id: input.messageId, conversationId, role: 'ASSISTANT', deletedAt: null },
      select: { id: true, content: true },
    }) : null
    if (input.messageId && !requestedMessage) throw new NotFoundException('要导出的回答不存在')
    const agentTask = requestedAgentTask || await this.prisma.agentTask.findFirst({
      where: { userId, conversationId, status: 'SUCCEEDED' },
      include: { runs: { where: { status: 'SUCCEEDED' }, orderBy: { completedAt: 'desc' }, take: 1 } },
    })
    const jobs = await this.prisma.generationJob.findMany({
      where: { userId, conversationId, kind: 'CHAT', status: 'SUCCEEDED' },
      orderBy: { completedAt: 'desc' },
      take: 20,
      select: { id: true, prompt: true, options: true },
    })
    const officeJob = jobs.find((item) => {
      const options = item.options && typeof item.options === 'object' && !Array.isArray(item.options) ? item.options as Record<string, unknown> : {}
      return typeof options.officeSkill === 'string' || typeof options.agentTaskId === 'string'
    })
    const job = officeJob || jobs[0]
    const message = job ? await this.prisma.message.findFirst({ where: { conversationId, deletedAt: null, metadata: { path: ['jobId'], equals: job.id } }, select: { content: true } }) : null
    const content = requestedMessage?.content || agentTask?.runs[0]?.finalAnswer || message?.content || conversation.messages[0]?.content || ''
    if (!content.trim()) throw new BadRequestException('办公任务尚未生成可导出的内容')
    const options = job?.options && typeof job.options === 'object' && !Array.isArray(job.options) ? job.options as Record<string, unknown> : {}
    const configuredSkill = agentTask?.skillId || String(options.officeSkill || '')
    const intent = agentTask?.goal || job?.prompt || conversation.title
    const skillId = configuredSkill && configuredSkill !== 'daily' ? configuredSkill : inferSkillFromIntent(`${conversation.title}\n${intent}`)
    const format = input.format || (skillId.startsWith('assistant:') ? 'docx' : skillFormats[skillId] || 'docx')
    const sourceId = requestedMessage?.id || agentTask?.runs[0]?.id || job?.id || conversation.id
    const matchesFormat = { metadata: { path: ['officeFormat'], equals: format } }
    const existing = await this.prisma.asset.findFirst({
      where: {
        userId,
        deletedAt: null,
        OR: [
          { AND: [{ metadata: { path: ['officeConversationId'], equals: conversation.id } }, matchesFormat] },
          ...(requestedMessage ? [{ AND: [{ metadata: { path: ['officeMessageId'], equals: sourceId } }, matchesFormat] }] : []),
          { AND: [{ metadata: { path: ['officeJobId'], equals: sourceId } }, matchesFormat] },
          { AND: [{ metadata: { path: ['agentRunId'], equals: sourceId } }, matchesFormat] },
        ],
      },
      orderBy: { createdAt: 'desc' },
    })
    if (existing) {
      if (agentTask?.runs[0]) await this.attachArtifact(agentTask.runs[0].id, agentTask.runs[0].artifactIds, existing.id)
      return this.publicAsset(existing)
    }
    const title = safeBaseName(conversation.title.replace(/^[^·]+·\s*/, ''))
    const bytes = await this.render(format, title, content)
    this.assertOfficeFile(format, bytes)
    const name = `${title}.${format}`
    const asset = await this.assets.storeGenerated(userId, bytes, {
      name,
      mimeType: mimeTypes[format],
      kind: AssetKind.FILE,
      metadata: { purpose: 'generated', ...(requestedMessage ? { officeMessageId: sourceId } : agentTask?.runs[0] ? { agentRunId: sourceId } : job ? { officeJobId: sourceId } : {}), officeSourceId: sourceId, officeConversationId: conversation.id, officeSkill: skillId, officeFormat: format },
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

  private assertOfficeFile(format: OfficeFormat, bytes: Buffer) {
    if (!bytes.length) throw new BadRequestException('办公文件生成失败：文件内容为空')
    if (format === 'md') return
    if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new BadRequestException(`办公文件生成失败：${format} 文件签名无效`)
    let entries: Set<string>
    try { entries = new Set(new AdmZip(bytes).getEntries().map((entry) => entry.entryName)) }
    catch { throw new BadRequestException(`办公文件生成失败：${format} 文件结构损坏`) }
    const required = format === 'pptx' ? ['[Content_Types].xml', 'ppt/presentation.xml'] : format === 'xlsx' ? ['[Content_Types].xml', 'xl/workbook.xml'] : ['[Content_Types].xml', 'word/document.xml']
    if (required.some((entry) => !entries.has(entry))) throw new BadRequestException(`办公文件生成失败：${format} 缺少必要结构`)
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
