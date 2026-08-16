import { BadRequestException, ConflictException, ForbiddenException, HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common'
import { PluginCapability, PluginStatus, PluginVisibility, Prisma, UserRole } from '@prisma/client'
import { randomBytes } from 'crypto'
import AdmZip = require('adm-zip')
import { load as loadYaml } from 'js-yaml'
import { PrismaService } from '../prisma/prisma.service'
import { AdminPluginDto, PluginCategoryDto, PrivatePluginDto } from './plugin.dto'

const forbiddenConfigKeys = /(?:script|code|command|package|dependency|endpoint|webhook|callback|executable|binary|url|uri)/i
const forbiddenConfigValues = /(?:javascript:|data:text\/html|<script|npm\s+(?:i|install)|pnpm\s+add|yarn\s+add|powershell|cmd\.exe|\/bin\/sh)/i

@Injectable()
export class PluginsService {
  constructor(private readonly prisma: PrismaService) {}

  private publicPlugin<T extends { instruction: string; config: unknown; outputRequirements: string }>(plugin: T) {
    const { instruction: _instruction, config: _config, outputRequirements: _outputRequirements, ...safe } = plugin
    return safe
  }

  private safeConfig(value?: Record<string, unknown>) {
    if (!value) return undefined
    const inspect = (input: unknown, depth = 0): unknown => {
      if (depth > 5) throw new BadRequestException('插件配置嵌套层级过深')
      if (typeof input === 'string') {
        if (input.length > 4_000 || forbiddenConfigValues.test(input)) throw new BadRequestException('插件配置包含不允许的可执行内容')
        return input
      }
      if (typeof input === 'number' || typeof input === 'boolean' || input === null) return input
      if (Array.isArray(input)) {
        if (input.length > 100) throw new BadRequestException('插件配置项过多')
        return input.map((item) => inspect(item, depth + 1))
      }
      if (input && typeof input === 'object') {
        const entries = Object.entries(input as Record<string, unknown>)
        if (entries.length > 100) throw new BadRequestException('插件配置项过多')
        return Object.fromEntries(entries.map(([key, item]) => {
          if (forbiddenConfigKeys.test(key)) throw new BadRequestException(`插件配置字段 ${key} 不允许使用`)
          return [key, inspect(item, depth + 1)]
        }))
      }
      throw new BadRequestException('插件配置仅支持文本、数字、布尔值、数组和对象')
    }
    return inspect(value) as Prisma.InputJsonValue
  }

  private privateSlug(name: string) {
    const base = name.toLowerCase().trim().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-').replace(/^-|-$/g, '').slice(0, 45) || 'private-plugin'
    return `private-${base}-${randomBytes(5).toString('hex')}`
  }

  private pluginData(body: PrivatePluginDto) {
    return {
      name: body.name.trim(), description: body.description?.trim() || '', instruction: body.instruction.trim(), icon: body.icon?.trim() || 'blocks',
      version: body.version?.trim() || '1.0.0', capabilities: [...new Set(body.capabilities)], recommendedModel: body.recommendedModel?.trim() || '',
      outputRequirements: body.outputRequirements?.trim() || '', config: this.safeConfig(body.config), categoryId: body.categoryId || null,
    }
  }

  async importPrivate(userId: string, fileName: string, bytes: Buffer) {
    if (!bytes.length || bytes.length > 5 * 1024 * 1024) throw new BadRequestException('技能包大小必须在 5MB 以内')
    let markdown = ''
    if (/\.zip$/i.test(fileName)) {
      let archive: AdmZip
      try { archive = new AdmZip(bytes) } catch { throw new BadRequestException('技能 ZIP 无法解析') }
      const entries = archive.getEntries()
      if (!entries.length || entries.length > 100) throw new BadRequestException('技能包文件数量无效')
      let expandedSize = 0
      for (const entry of entries) {
        const normalized = entry.entryName.replaceAll('\\', '/')
        if (normalized.startsWith('/') || normalized.split('/').includes('..')) throw new BadRequestException('技能包包含不安全路径')
        expandedSize += entry.header.size
        if (expandedSize > 10 * 1024 * 1024) throw new BadRequestException('技能包解压后大小超过限制')
        if (/\.(?:exe|dll|so|dylib|bat|cmd|ps1|sh|msi|apk|jar)$/i.test(normalized)) throw new BadRequestException('技能包不能包含可执行文件')
      }
      const skillEntry = entries.find((entry) => /(^|\/)SKILL\.md$/i.test(entry.entryName) && !entry.isDirectory)
      if (!skillEntry) throw new BadRequestException('技能包中缺少 SKILL.md')
      markdown = skillEntry.getData().toString('utf8')
    } else if (/^(?:SKILL\.md|.+\.skill)$/i.test(fileName)) markdown = bytes.toString('utf8')
    else throw new BadRequestException('请选择 SKILL.md、.skill 或 ZIP 技能包')
    if (!markdown.trim() || markdown.length > 100_000) throw new BadRequestException('SKILL.md 内容大小无效')
    const match = markdown.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?([\s\S]*)$/)
    if (!match) throw new BadRequestException('SKILL.md 顶部必须包含 YAML 元数据')
    let metadata: Record<string, unknown>
    try { const parsed = loadYaml(match[1]); metadata = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {} } catch { throw new BadRequestException('SKILL.md YAML 元数据格式错误') }
    const name = typeof metadata.name === 'string' ? metadata.name.trim() : ''
    const description = typeof metadata.description === 'string' ? metadata.description.trim() : ''
    const version = typeof metadata.version === 'string' && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(metadata.version) ? metadata.version : '1.0.0'
    const requested = Array.isArray(metadata.capabilities) ? metadata.capabilities : ['CHAT']
    const capabilities = requested.map((item) => String(item).toUpperCase()).filter((item): item is PluginCapability => Object.values(PluginCapability).includes(item as PluginCapability))
    if (!name || name.length > 80) throw new BadRequestException('技能名称不能为空且不能超过 80 个字符')
    if (!match[2].trim()) throw new BadRequestException('SKILL.md 缺少技能执行说明')
    return this.createPrivate(userId, { name, description: description.slice(0, 500), instruction: match[2].trim().slice(0, 20_000), icon: 'blocks', version, capabilities: capabilities.length ? [...new Set(capabilities)] : [PluginCapability.CHAT], recommendedModel: typeof metadata.recommendedModel === 'string' ? metadata.recommendedModel.slice(0, 160) : '', outputRequirements: typeof metadata.outputRequirements === 'string' ? metadata.outputRequirements.slice(0, 4_000) : '', config: { importedFrom: fileName } })
  }

  private async validateCategory(categoryId?: string, requireEnabled = true) {
    if (!categoryId) return
    const category = await this.prisma.pluginCategory.findFirst({ where: { id: categoryId, enabled: requireEnabled ? true : undefined }, select: { id: true } })
    if (!category) throw new BadRequestException('插件分类不存在或已停用')
  }

  market(userId: string, capability?: PluginCapability, category?: string, query?: string) {
    return this.prisma.plugin.findMany({
      where: { visibility: PluginVisibility.OFFICIAL, status: PluginStatus.PUBLISHED, capabilities: capability ? { has: capability } : undefined, category: category ? { slug: category } : undefined, OR: query ? [{ name: { contains: query, mode: 'insensitive' } }, { description: { contains: query, mode: 'insensitive' } }] : undefined },
      orderBy: [{ featured: 'desc' }, { sortOrder: 'asc' }, { installCount: 'desc' }], include: { category: true, installations: { where: { userId }, select: { enabled: true, installedAt: true } } },
    }).then((rows) => rows.map(({ installations, ...plugin }) => ({ ...this.publicPlugin(plugin), installed: Boolean(installations[0]?.enabled), purchased: Boolean(installations[0]), installedAt: installations[0]?.installedAt || null })))
  }

  categories(publicOnly = true) {
    return this.prisma.pluginCategory.findMany({ where: publicOnly ? { enabled: true } : undefined, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], include: publicOnly ? { _count: { select: { plugins: { where: { visibility: PluginVisibility.OFFICIAL, status: PluginStatus.PUBLISHED } } } } } : undefined })
  }

  installed(userId: string) {
    return this.prisma.pluginInstallation.findMany({ where: { userId, enabled: true, plugin: { visibility: PluginVisibility.OFFICIAL, status: PluginStatus.PUBLISHED } }, orderBy: { updatedAt: 'desc' }, include: { plugin: { include: { category: true } } } }).then((rows) => rows.map((row) => ({ ...this.publicPlugin(row.plugin), installed: true, installedAt: row.installedAt })))
  }

  mine(userId: string) {
    return this.prisma.plugin.findMany({ where: { ownerId: userId, visibility: PluginVisibility.PRIVATE }, orderBy: { updatedAt: 'desc' }, include: { category: true } })
  }

  async available(userId: string, capability?: PluginCapability) {
    const [privatePlugins, installed] = await Promise.all([
      this.prisma.plugin.findMany({ where: { ownerId: userId, visibility: PluginVisibility.PRIVATE, status: PluginStatus.PUBLISHED, capabilities: capability ? { has: capability } : undefined }, orderBy: { updatedAt: 'desc' }, include: { category: true } }),
      this.prisma.pluginInstallation.findMany({ where: { userId, enabled: true, plugin: { visibility: PluginVisibility.OFFICIAL, status: PluginStatus.PUBLISHED, capabilities: capability ? { has: capability } : undefined } }, orderBy: { updatedAt: 'desc' }, include: { plugin: { include: { category: true } } } }),
    ])
    return [...installed.map((row) => ({ ...this.publicPlugin(row.plugin), installed: true })), ...privatePlugins.map((plugin) => ({ ...this.publicPlugin(plugin), installed: false, owned: true }))]
  }

  async install(userId: string, pluginId: string) {
    const plugin = await this.prisma.plugin.findFirst({ where: { id: pluginId, ownerId: null, visibility: PluginVisibility.OFFICIAL, status: PluginStatus.PUBLISHED } })
    if (!plugin) throw new NotFoundException('市场插件不存在或已下架')
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.pluginInstallation.findUnique({ where: { userId_pluginId: { userId, pluginId } } })
      if (existing?.enabled) return
      if (!existing && plugin.priceCredits > 0) {
        const account = await tx.creditAccount.findUniqueOrThrow({ where: { userId } })
        if (account.balance < plugin.priceCredits) throw new HttpException('创作点不足', HttpStatus.PAYMENT_REQUIRED)
        const updated = await tx.creditAccount.updateMany({ where: { id: account.id, version: account.version }, data: { balance: { decrement: plugin.priceCredits }, version: { increment: 1 } } })
        if (!updated.count) throw new ConflictException('创作点账户发生并发更新，请重试')
        await tx.creditLedger.create({ data: { accountId: account.id, type: 'SPEND', amount: -plugin.priceCredits, balanceAfter: account.balance - plugin.priceCredits, description: `安装插件：${plugin.name}`, idempotencyKey: `plugin:${pluginId}:user:${userId}:purchase`, referenceType: 'plugin', referenceId: pluginId } })
      }
      await tx.pluginInstallation.upsert({ where: { userId_pluginId: { userId, pluginId } }, create: { userId, pluginId, paidCredits: plugin.priceCredits }, update: { enabled: true } })
      const installCount = await tx.pluginInstallation.count({ where: { pluginId } })
      await tx.plugin.update({ where: { id: pluginId }, data: { installCount } })
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
    return { ...this.publicPlugin(plugin), installed: true }
  }

  async uninstall(userId: string, pluginId: string) {
    const result = await this.prisma.pluginInstallation.updateMany({ where: { userId, pluginId, enabled: true }, data: { enabled: false } })
    if (!result.count) throw new NotFoundException('尚未安装该插件')
    return { uninstalled: true }
  }

  async createPrivate(userId: string, body: PrivatePluginDto) {
    await this.validateCategory(body.categoryId)
    return this.prisma.plugin.create({ data: { ...this.pluginData(body), ownerId: userId, slug: this.privateSlug(body.name), visibility: PluginVisibility.PRIVATE, status: PluginStatus.PUBLISHED, featured: false, priceCredits: 0 } })
  }

  async updatePrivate(userId: string, id: string, body: PrivatePluginDto) {
    await this.validateCategory(body.categoryId)
    const result = await this.prisma.plugin.updateMany({ where: { id, ownerId: userId, visibility: PluginVisibility.PRIVATE }, data: { ...this.pluginData(body), status: PluginStatus.PUBLISHED, featured: false, priceCredits: 0 } })
    if (!result.count) throw new NotFoundException('私有插件不存在')
    return this.prisma.plugin.findUniqueOrThrow({ where: { id } })
  }

  async deletePrivate(userId: string, id: string) {
    const result = await this.prisma.plugin.deleteMany({ where: { id, ownerId: userId, visibility: PluginVisibility.PRIVATE } })
    if (!result.count) throw new NotFoundException('私有插件不存在')
    return { deleted: true }
  }

  async resolveForUse(userId: string, pluginId: string, capability: PluginCapability, role?: UserRole) {
    const plugin = await this.prisma.plugin.findUnique({ where: { id: pluginId }, include: { installations: { where: { userId, enabled: true }, select: { userId: true } } } })
    if (!plugin || plugin.status !== PluginStatus.PUBLISHED) throw new NotFoundException('插件不存在或已停用')
    if (!plugin.capabilities.includes(capability)) throw new BadRequestException('该插件不支持当前创作类型')
    const allowed = plugin.visibility === PluginVisibility.PRIVATE ? plugin.ownerId === userId : plugin.visibility === PluginVisibility.OFFICIAL && plugin.installations.length > 0
    if (!allowed) throw new ForbiddenException('请先安装该插件')
    return { id: plugin.id, name: plugin.name, instruction: plugin.instruction, outputRequirements: plugin.outputRequirements, recommendedModel: plugin.recommendedModel, version: plugin.version, capability }
  }

  adminList() {
    return this.prisma.plugin.findMany({ where: { visibility: PluginVisibility.OFFICIAL }, orderBy: [{ sortOrder: 'asc' }, { updatedAt: 'desc' }], include: { category: true, _count: { select: { installations: true, usages: true } } } })
  }

  async createOfficial(body: AdminPluginDto) {
    await this.validateCategory(body.categoryId, false)
    return this.prisma.plugin.create({ data: { ...this.pluginData(body), ownerId: null, slug: body.slug, visibility: PluginVisibility.OFFICIAL, status: body.status || PluginStatus.DRAFT, featured: body.featured ?? false, priceCredits: body.priceCredits ?? 0, sortOrder: body.sortOrder ?? 0 } })
  }

  async updateOfficial(id: string, body: AdminPluginDto) {
    await this.validateCategory(body.categoryId, false)
    const result = await this.prisma.plugin.updateMany({ where: { id, visibility: PluginVisibility.OFFICIAL, ownerId: null }, data: { ...this.pluginData(body), slug: body.slug, status: body.status || PluginStatus.DRAFT, featured: body.featured ?? false, priceCredits: body.priceCredits ?? 0, sortOrder: body.sortOrder ?? 0 } })
    if (!result.count) throw new NotFoundException('官方插件不存在')
    return this.prisma.plugin.findUniqueOrThrow({ where: { id } })
  }

  async deleteOfficial(id: string) {
    const plugin = await this.prisma.plugin.findUnique({ where: { id }, select: { visibility: true, _count: { select: { installations: true, usages: true } } } })
    if (!plugin || plugin.visibility !== PluginVisibility.OFFICIAL) throw new NotFoundException('官方插件不存在')
    if (plugin._count.installations || plugin._count.usages) throw new BadRequestException('该插件已有安装或调用记录，请改为停用以保留商业数据')
    await this.prisma.plugin.delete({ where: { id } })
    return { deleted: true }
  }

  createCategory(body: PluginCategoryDto) { return this.prisma.pluginCategory.create({ data: { name: body.name.trim(), slug: body.slug, description: body.description?.trim() || '', icon: body.icon?.trim() || 'blocks', sortOrder: body.sortOrder ?? 0, enabled: body.enabled ?? true } }) }
  updateCategory(id: string, body: PluginCategoryDto) { return this.prisma.pluginCategory.update({ where: { id }, data: { name: body.name.trim(), slug: body.slug, description: body.description?.trim() || '', icon: body.icon?.trim() || 'blocks', sortOrder: body.sortOrder ?? 0, enabled: body.enabled ?? true } }) }
  async deleteCategory(id: string) { await this.prisma.pluginCategory.delete({ where: { id } }); return { deleted: true } }

  async stats() {
    const [plugins, installations, usages, failures, popular] = await Promise.all([
      this.prisma.plugin.count({ where: { visibility: PluginVisibility.OFFICIAL } }), this.prisma.pluginInstallation.count({ where: { enabled: true } }),
      this.prisma.pluginUsage.count(), this.prisma.pluginUsage.count({ where: { status: 'FAILED' } }),
      this.prisma.plugin.findMany({ where: { visibility: PluginVisibility.OFFICIAL }, orderBy: [{ usageCount: 'desc' }, { installCount: 'desc' }], take: 8, select: { id: true, name: true, installCount: true, usageCount: true, errorCount: true } }),
    ])
    return { plugins, installations, usages, failures, popular }
  }
}
