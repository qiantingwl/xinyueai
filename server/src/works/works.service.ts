import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { ModerationSource, Prisma, WorkAuthorDisplay, WorkModerationStatus, WorkReportStatus, WorkVisibility } from '@prisma/client'
import { randomBytes } from 'node:crypto'
import { AssetsService } from '../assets/assets.service'
import { ResourceAccessService } from '../common/resource-access.service'
import { ModerationService } from '../moderation/moderation.service'
import { PrismaService } from '../prisma/prisma.service'

export type WorkDraftInput = {
  title?: string
  description?: string
  category?: string
  tags?: string[]
  visibility?: WorkVisibility
  authorDisplay?: WorkAuthorDisplay
  customAuthor?: string
  publicPrompt?: string
  assetIds?: string[]
}

const versionInclude = {
  assets: { orderBy: { sortOrder: 'asc' as const }, include: { asset: { select: { id: true, name: true, kind: true, mimeType: true, width: true, height: true, size: true } } } },
  reviewedBy: { select: { id: true, displayName: true } },
}

@Injectable()
export class WorksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ResourceAccessService,
    private readonly assets: AssetsService,
    private readonly moderation: ModerationService,
  ) {}

  async listMine(userId: string) {
    const rows = await this.prisma.publishedWork.findMany({
      where: { userId, lifecycleStatus: { not: 'DELETED' } },
      orderBy: { updatedAt: 'desc' },
      include: { currentVersion: { include: versionInclude }, publishedVersion: { include: versionInclude }, _count: { select: { versions: true, likes: true, reports: true } } },
    })
    return rows.map((work) => this.privateWork(work))
  }

  async getMine(userId: string, id: string) {
    const work = await this.prisma.publishedWork.findFirst({
      where: { id, userId, lifecycleStatus: { not: 'DELETED' } },
      include: { currentVersion: { include: versionInclude }, publishedVersion: { include: versionInclude }, versions: { orderBy: { versionNumber: 'desc' }, include: versionInclude }, _count: { select: { likes: true, reports: true } } },
    })
    if (!work) throw new NotFoundException('作品不存在')
    return this.privateWork(work)
  }

  async create(userId: string, input: WorkDraftInput) {
    const draft = await this.normalizeDraft(userId, input, true)
    const slug = randomBytes(9).toString('base64url').toLowerCase()
    const work = await this.prisma.$transaction(async (tx) => {
      const created = await tx.publishedWork.create({ data: { userId, slug, sourceType: 'ASSET', sourceId: draft.assetIds[0] } })
      const version = await tx.publishedWorkVersion.create({ data: {
        workId: created.id,
        versionNumber: 1,
        ...draft.data,
        assets: { create: draft.assetIds.map((assetId, index) => ({ assetId, role: index === 0 ? 'COVER' : 'CONTENT', sortOrder: index })) },
      } })
      return tx.publishedWork.update({ where: { id: created.id }, data: { currentVersionId: version.id } })
    })
    return this.getMine(userId, work.id)
  }

  async update(userId: string, id: string, input: WorkDraftInput) {
    const work = await this.prisma.publishedWork.findFirst({ where: { id, userId, lifecycleStatus: { not: 'DELETED' } }, include: { currentVersion: { include: { assets: true } } } })
    if (!work?.currentVersion) throw new NotFoundException('作品不存在')
    const base = work.currentVersion
    const draft = await this.normalizeDraft(userId, {
      title: input.title ?? base.title,
      description: input.description ?? base.description,
      category: input.category ?? base.category,
      tags: input.tags ?? base.tags,
      visibility: input.visibility ?? base.visibility,
      authorDisplay: input.authorDisplay ?? base.authorDisplay,
      customAuthor: input.customAuthor ?? base.customAuthor,
      publicPrompt: input.publicPrompt ?? base.publicPrompt,
      assetIds: input.assetIds ?? base.assets.sort((a, b) => a.sortOrder - b.sortOrder).map((item) => item.assetId),
    }, true)
    const editable = ['DRAFT', 'REJECTED'].includes(base.moderationStatus)
    await this.prisma.$transaction(async (tx) => {
      let versionId = base.id
      if (editable) {
        await tx.publishedWorkVersion.update({ where: { id: base.id }, data: { ...draft.data, moderationStatus: 'DRAFT', rejectionReason: '', submittedAt: null, reviewedAt: null, reviewedById: null } })
        await tx.publishedWorkAsset.deleteMany({ where: { versionId: base.id } })
      } else {
        const next = await tx.publishedWorkVersion.aggregate({ where: { workId: work.id }, _max: { versionNumber: true } })
        const version = await tx.publishedWorkVersion.create({ data: { workId: work.id, versionNumber: (next._max.versionNumber || 0) + 1, ...draft.data } })
        versionId = version.id
        await tx.publishedWork.update({ where: { id: work.id }, data: { currentVersionId: versionId } })
      }
      await tx.publishedWorkAsset.createMany({ data: draft.assetIds.map((assetId, index) => ({ versionId, assetId, role: index === 0 ? 'COVER' : 'CONTENT', sortOrder: index })) })
    })
    return this.getMine(userId, id)
  }

  async submit(userId: string, id: string) {
    const work = await this.prisma.publishedWork.findFirst({ where: { id, userId, lifecycleStatus: 'ACTIVE' }, include: { currentVersion: { include: { assets: true } } } })
    if (!work?.currentVersion) throw new NotFoundException('作品不存在')
    if (!['DRAFT', 'REJECTED'].includes(work.currentVersion.moderationStatus)) throw new BadRequestException('当前版本不能重复提交')
    if (work.currentVersion.visibility === 'PRIVATE') throw new BadRequestException('私密作品无需发布，请先选择公开或不公开链接')
    if (!work.currentVersion.assets.length) throw new BadRequestException('作品至少需要一个素材')
    await this.moderation.inspect(userId, ModerationSource.WORK, [work.currentVersion.title, work.currentVersion.description, work.currentVersion.publicPrompt, ...work.currentVersion.tags].join('\n'), { workId: id, versionId: work.currentVersion.id })
    await this.prisma.publishedWorkVersion.update({ where: { id: work.currentVersion.id }, data: { moderationStatus: 'PENDING', submittedAt: new Date(), rejectionReason: '' } })
    const account = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true } })
    if (account?.role === 'ADMIN' || account?.role === 'SUPER_ADMIN') {
      return this.review(userId, id, 'APPROVED')
    }
    return this.getMine(userId, id)
  }

  async archive(userId: string, id: string, archived: boolean) {
    const result = await this.prisma.publishedWork.updateMany({ where: { id, userId, lifecycleStatus: { not: 'DELETED' } }, data: { lifecycleStatus: archived ? 'ARCHIVED' : 'ACTIVE' } })
    if (!result.count) throw new NotFoundException('作品不存在')
    return { archived }
  }

  async remove(userId: string, id: string) {
    const result = await this.prisma.publishedWork.updateMany({ where: { id, userId, lifecycleStatus: { not: 'DELETED' } }, data: { lifecycleStatus: 'DELETED', currentVersionId: null, publishedVersionId: null, isFeatured: false, featuredAt: null } })
    if (!result.count) throw new NotFoundException('作品不存在')
    return { deleted: true }
  }

  async gallery(input: { q?: string; category?: string; sort?: string; cursor?: string; limit?: number }) {
    const take = Math.max(1, Math.min(48, input.limit || 24))
    const query = input.q?.trim().slice(0, 120)
    const category = input.category?.trim().slice(0, 80)
    const orderBy: Prisma.PublishedWorkOrderByWithRelationInput[] = input.sort === 'popular'
      ? [{ likeCount: 'desc' }, { viewCount: 'desc' }, { updatedAt: 'desc' }]
      : input.sort === 'latest'
        ? [{ publishedVersion: { reviewedAt: 'desc' } }, { id: 'desc' }]
        : [{ isFeatured: 'desc' }, { featuredAt: 'desc' }, { updatedAt: 'desc' }]
    const rows = await this.prisma.publishedWork.findMany({
      where: {
        lifecycleStatus: 'ACTIVE',
        publishedVersion: {
          moderationStatus: 'APPROVED', visibility: 'PUBLIC',
          ...(category ? { category } : {}),
          ...(query ? { OR: [{ title: { contains: query, mode: 'insensitive' } }, { description: { contains: query, mode: 'insensitive' } }, { tags: { has: query } }] } : {}),
        },
      },
      orderBy,
      cursor: input.cursor ? { id: input.cursor } : undefined,
      skip: input.cursor ? 1 : 0,
      take: take + 1,
      include: { user: { select: { id: true, displayName: true, avatarUrl: true } }, publishedVersion: { include: versionInclude } },
    })
    const hasMore = rows.length > take
    const page = rows.slice(0, take)
    return { items: page.map((work) => this.publicWork(work)), nextCursor: hasMore ? page.at(-1)?.id || null : null }
  }

  async publicDetail(slug: string) {
    const work = await this.prisma.publishedWork.findFirst({
      where: { slug, lifecycleStatus: 'ACTIVE', publishedVersion: { moderationStatus: 'APPROVED', visibility: { in: ['PUBLIC', 'UNLISTED'] } } },
      include: { user: { select: { id: true, displayName: true, avatarUrl: true, _count: { select: { followers: true } } } }, publishedVersion: { include: versionInclude } },
    })
    if (!work?.publishedVersion) throw new NotFoundException('作品不存在或暂未公开')
    return this.publicWork(work)
  }

  async recordView(slug: string) {
    const result = await this.prisma.publishedWork.updateMany({ where: { slug, lifecycleStatus: 'ACTIVE', publishedVersion: { moderationStatus: 'APPROVED', visibility: { in: ['PUBLIC', 'UNLISTED'] } } }, data: { viewCount: { increment: 1 } } })
    if (!result.count) throw new NotFoundException('作品不存在')
    return { viewed: true }
  }

  async publicAsset(slug: string, assetId: string) {
    const work = await this.prisma.publishedWork.findFirst({ where: { slug, lifecycleStatus: 'ACTIVE', publishedVersion: { moderationStatus: 'APPROVED', visibility: { in: ['PUBLIC', 'UNLISTED'] }, assets: { some: { assetId } } } } })
    if (!work) throw new NotFoundException('作品素材不存在')
    return this.assets.readForAdmin(assetId)
  }

  async toggleLike(userId: string, id: string) {
    const work = await this.prisma.publishedWork.findFirst({ where: { id, lifecycleStatus: 'ACTIVE', publishedVersion: { moderationStatus: 'APPROVED', visibility: { in: ['PUBLIC', 'UNLISTED'] } } } })
    if (!work) throw new NotFoundException('作品不存在')
    return this.prisma.$transaction(async (tx) => {
      // Serialize updates for this work so the denormalized counter stays exact.
      await tx.$queryRaw`SELECT id FROM "PublishedWork" WHERE id = ${id} FOR UPDATE`
      const existing = await tx.workLike.findUnique({ where: { workId_userId: { workId: id, userId } } })
      if (existing) {
        await tx.workLike.delete({ where: { workId_userId: { workId: id, userId } } })
        const likeCount = await tx.workLike.count({ where: { workId: id } })
        await tx.publishedWork.update({ where: { id }, data: { likeCount } })
        return { liked: false, likeCount }
      }
      await tx.workLike.create({ data: { workId: id, userId } })
      const likeCount = await tx.workLike.count({ where: { workId: id } })
      await tx.publishedWork.update({ where: { id }, data: { likeCount } })
      return { liked: true, likeCount }
    })
  }

  async toggleFollow(userId: string, followedId: string) {
    if (userId === followedId) throw new BadRequestException('不能关注自己')
    const target = await this.prisma.user.findFirst({ where: { id: followedId, status: 'ACTIVE' }, select: { id: true } })
    if (!target) throw new NotFoundException('创作者不存在')
    const key = { followerId_followedId: { followerId: userId, followedId } }
    const existing = await this.prisma.userFollow.findUnique({ where: key })
    if (existing) { await this.prisma.userFollow.delete({ where: key }); return { following: false } }
    await this.prisma.userFollow.create({ data: { followerId: userId, followedId } })
    return { following: true }
  }

  async report(userId: string, id: string, reason: string, details = '') {
    const work = await this.prisma.publishedWork.findFirst({ where: { id, lifecycleStatus: 'ACTIVE', publishedVersionId: { not: null } }, select: { id: true, userId: true } })
    if (!work) throw new NotFoundException('作品不存在')
    if (work.userId === userId) throw new BadRequestException('不能举报自己的作品')
    const existing = await this.prisma.workReport.findFirst({ where: { workId: id, reporterId: userId, status: 'PENDING' } })
    if (existing) throw new BadRequestException('该作品已有待处理举报')
    return this.prisma.workReport.create({ data: { workId: id, reporterId: userId, reason: reason.trim().slice(0, 80), details: details.trim().slice(0, 2000) } })
  }

  async adminList(status?: WorkModerationStatus, query?: string) {
    const normalizedQuery = query?.trim().slice(0, 120)
    const currentVersion = {
      ...(status ? { moderationStatus: status } : {}),
      ...(normalizedQuery ? { OR: [{ title: { contains: normalizedQuery, mode: Prisma.QueryMode.insensitive } }, { description: { contains: normalizedQuery, mode: Prisma.QueryMode.insensitive } }] } : {}),
    }
    const rows = await this.prisma.publishedWork.findMany({
      where: { lifecycleStatus: { not: 'DELETED' }, ...(Object.keys(currentVersion).length ? { currentVersion } : {}) },
      orderBy: { updatedAt: 'desc' }, take: 200,
      include: { user: { select: { id: true, displayName: true, email: true } }, currentVersion: { include: versionInclude }, publishedVersion: { include: versionInclude }, _count: { select: { likes: true, reports: true, versions: true } } },
    })
    return rows.map((work) => this.privateWork(work, 'admin'))
  }

  async review(actorId: string, id: string, status: 'APPROVED' | 'REJECTED', reason = '') {
    const work = await this.prisma.publishedWork.findFirst({ where: { id, lifecycleStatus: { not: 'DELETED' } }, include: { currentVersion: true } })
    if (!work?.currentVersion) throw new NotFoundException('作品不存在')
    if (work.currentVersion.moderationStatus !== 'PENDING') throw new BadRequestException('只有待审核版本可以处理')
    const now = new Date()
    await this.prisma.$transaction(async (tx) => {
      await tx.publishedWorkVersion.update({ where: { id: work.currentVersion!.id }, data: { moderationStatus: status, rejectionReason: status === 'REJECTED' ? reason.trim().slice(0, 2000) : '', reviewedAt: now, reviewedById: actorId } })
      if (status === 'APPROVED') await tx.publishedWork.update({ where: { id }, data: { publishedVersionId: work.currentVersion!.id, lifecycleStatus: 'ACTIVE' } })
      await tx.auditLog.create({ data: { actorId, action: `work.review.${status.toLowerCase()}`, targetType: 'published_work', targetId: id, after: { versionId: work.currentVersion!.id, status, reason } } })
    })
    const updated = await this.prisma.publishedWork.findUnique({ where: { id }, include: { currentVersion: { include: versionInclude }, publishedVersion: { include: versionInclude } } })
    return this.privateWork(updated, 'admin')
  }

  async setFeatured(actorId: string, id: string, featured: boolean) {
    const work = await this.prisma.publishedWork.findFirst({ where: { id, lifecycleStatus: 'ACTIVE', publishedVersion: { moderationStatus: 'APPROVED', visibility: 'PUBLIC' } } })
    if (!work) throw new BadRequestException('只有已公开通过的作品可以设为精选')
    const updated = await this.prisma.publishedWork.update({ where: { id }, data: { isFeatured: featured, featuredAt: featured ? new Date() : null } })
    await this.prisma.auditLog.create({ data: { actorId, action: featured ? 'work.feature' : 'work.unfeature', targetType: 'published_work', targetId: id } })
    return updated
  }

  async takeDown(actorId: string, id: string, reason: string) {
    const work = await this.prisma.publishedWork.findFirst({ where: { id }, include: { publishedVersion: true } })
    if (!work?.publishedVersion) throw new NotFoundException('线上作品不存在')
    await this.prisma.$transaction([
      this.prisma.publishedWorkVersion.update({ where: { id: work.publishedVersion.id }, data: { moderationStatus: 'TAKEN_DOWN', rejectionReason: reason.trim().slice(0, 2000), reviewedAt: new Date(), reviewedById: actorId } }),
      this.prisma.publishedWork.update({ where: { id }, data: { publishedVersionId: null, isFeatured: false, featuredAt: null } }),
      this.prisma.auditLog.create({ data: { actorId, action: 'work.take_down', targetType: 'published_work', targetId: id, after: { reason } } }),
    ])
    return { takenDown: true }
  }

  listReports(status?: WorkReportStatus) {
    return this.prisma.workReport.findMany({ where: status ? { status } : undefined, orderBy: { createdAt: 'desc' }, take: 200, include: { reporter: { select: { id: true, displayName: true, email: true } }, work: { include: { currentVersion: { select: { title: true } } } }, resolvedBy: { select: { id: true, displayName: true } } } })
  }

  async resolveReport(actorId: string, id: string, status: 'RESOLVED' | 'DISMISSED', resolution: string) {
    const report = await this.prisma.workReport.findUnique({ where: { id } })
    if (!report) throw new NotFoundException('举报记录不存在')
    const updated = await this.prisma.workReport.update({ where: { id }, data: { status, resolution: resolution.trim().slice(0, 2000), resolvedById: actorId, resolvedAt: new Date() } })
    await this.prisma.auditLog.create({ data: { actorId, action: 'work.report.resolve', targetType: 'work_report', targetId: id, after: { status, resolution } } })
    return updated
  }

  private async normalizeDraft(userId: string, input: WorkDraftInput, requireAssets: boolean) {
    const title = input.title?.trim().slice(0, 120) || ''
    if (!title) throw new BadRequestException('请输入作品标题')
    const assetIds = [...new Set(input.assetIds || [])].slice(0, 20)
    if (requireAssets && !assetIds.length) throw new BadRequestException('至少选择一个图片或视频素材')
    if (assetIds.length) {
      const assets = await this.prisma.asset.findMany({ where: { ...this.access.assetWhere(userId), id: { in: assetIds }, deletedAt: null, kind: { in: ['IMAGE', 'VIDEO'] } }, select: { id: true } })
      if (assets.length !== assetIds.length) throw new ForbiddenException('部分素材不存在或无权使用')
    }
    const authorDisplay = input.authorDisplay || WorkAuthorDisplay.PROFILE
    const customAuthor = input.customAuthor?.trim().slice(0, 80) || ''
    if (authorDisplay === 'CUSTOM' && !customAuthor) throw new BadRequestException('请输入展示作者名')
    const publicPrompt = input.publicPrompt?.trim().slice(0, 10000) || ''
    return {
      assetIds,
      data: {
        title,
        description: input.description?.trim().slice(0, 5000) || '',
        category: input.category?.trim().slice(0, 80) || '创意作品',
        tags: [...new Set((input.tags || []).map((item) => item.trim().slice(0, 30)).filter(Boolean))].slice(0, 12),
        visibility: input.visibility || WorkVisibility.PRIVATE,
        authorDisplay,
        customAuthor,
        publicPrompt,
      },
    }
  }

  private assetView(slug: string, item: { role: string; sortOrder: number; caption: string; asset: { id: string; name: string; kind: unknown; mimeType: string; width: number | null; height: number | null; size: bigint } }, scope: 'public' | 'user' | 'admin') {
    const contentUrl = scope === 'public' ? `/v1/gallery/${slug}/assets/${item.asset.id}` : scope === 'admin' ? `/v1/admin/assets/${item.asset.id}/content` : `/v1/assets/${item.asset.id}/content`
    return { role: item.role, sortOrder: item.sortOrder, caption: item.caption, ...item.asset, size: Number(item.asset.size), contentUrl }
  }

  private versionView(slug: string, version: Prisma.PublishedWorkVersionGetPayload<{ include: typeof versionInclude }> | null, scope: 'public' | 'user' | 'admin') {
    if (!version) return null
    return { ...version, assets: version.assets.map((item) => this.assetView(slug, item, scope)) }
  }

  private privateWork(work: any, scope: 'user' | 'admin' = 'user') {
    if (!work) return work
    return { ...work, currentVersion: this.versionView(work.slug, work.currentVersion, scope), publishedVersion: this.versionView(work.slug, work.publishedVersion, scope), versions: work.versions?.map((item: any) => this.versionView(work.slug, item, scope)) }
  }

  private publicWork(work: any) {
    const version = this.versionView(work.slug, work.publishedVersion, 'public')
    const authorName = version?.authorDisplay === 'HIDDEN' ? '匿名创作者' : version?.authorDisplay === 'CUSTOM' ? version.customAuthor : work.user.displayName
    return { id: work.id, slug: work.slug, isFeatured: work.isFeatured, viewCount: work.viewCount, likeCount: work.likeCount, publishedAt: version?.reviewedAt || version?.updatedAt, author: { id: work.user.id, name: authorName, avatarUrl: version?.authorDisplay === 'HIDDEN' ? null : work.user.avatarUrl, followerCount: work.user._count?.followers }, version }
  }
}
