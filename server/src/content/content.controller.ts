import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import sanitizeHtml = require('sanitize-html')
import { IsBoolean, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator'
import { AdminGuard } from '../admin/admin.guard'
import { AuthGuard } from '../auth/auth.guard'
import { PrismaService } from '../prisma/prisma.service'
import { AuthenticatedUser, CurrentUser } from '../common/request-user'
import { Public } from '../auth/public.decorator'

class CreateContentPageDto {
  @IsString() @MinLength(1) @MaxLength(160) title!: string
  @IsString() @MinLength(1) @MaxLength(120) @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { message: 'slug 只能包含小写字母、数字和连字符' }) slug!: string
  @IsOptional() @IsString() @MaxLength(80) category?: string
  @IsOptional() @IsString() @MaxLength(1000) summary?: string
  @IsString() @MinLength(1) @MaxLength(500000) contentHtml!: string
  @IsOptional() @IsString() @MaxLength(2000) coverUrl?: string
  @IsOptional() @IsBoolean() published?: boolean
  @IsOptional() @IsInt() @Min(-10000) @Max(10000) sortOrder?: number
}

class UpdateContentPageDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(160) title?: string
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { message: 'slug 只能包含小写字母、数字和连字符' }) slug?: string
  @IsOptional() @IsString() @MaxLength(80) category?: string
  @IsOptional() @IsString() @MaxLength(1000) summary?: string
  @IsOptional() @IsString() @MinLength(1) @MaxLength(500000) contentHtml?: string
  @IsOptional() @IsString() @MaxLength(2000) coverUrl?: string
  @IsOptional() @IsBoolean() published?: boolean
  @IsOptional() @IsInt() @Min(-10000) @Max(10000) sortOrder?: number
}

@Controller('admin/content-pages')
@UseGuards(AuthGuard, AdminGuard)
export class ContentController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@Query('q') q?: string, @Query('category') category?: string, @Query('published') published?: string, @Query('page') rawPage?: string, @Query('pageSize') rawPageSize?: string) {
    const page = Math.max(1, Number(rawPage) || 1)
    const pageSize = Math.min(100, Math.max(1, Number(rawPageSize) || 20))
    const where: Prisma.ContentPageWhereInput = {
      category: category || undefined,
      published: published === 'true' ? true : published === 'false' ? false : undefined,
      OR: q ? [{ title: { contains: q, mode: 'insensitive' } }, { summary: { contains: q, mode: 'insensitive' } }, { slug: { contains: q, mode: 'insensitive' } }] : undefined,
    }
    const [items, total] = await Promise.all([
      this.prisma.contentPage.findMany({ where, orderBy: [{ sortOrder: 'asc' }, { updatedAt: 'desc' }], skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.contentPage.count({ where }),
    ])
    return { items, total, page, pageSize }
  }

  @Get(':id')
  async detail(@Param('id') id: string) {
    const page = await this.prisma.contentPage.findUnique({ where: { id } })
    if (!page) throw new BadRequestException('内容不存在')
    return page
  }

  @Post()
  async create(@CurrentUser() user: AuthenticatedUser, @Body() body: CreateContentPageDto) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const page = await tx.contentPage.create({ data: this.toData(body) as Prisma.ContentPageCreateInput })
        await tx.auditLog.create({ data: { actorId: user.id, action: 'content.page.create', targetType: 'content_page', targetId: page.id, after: this.auditSnapshot(page) } })
        return page
      })
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new BadRequestException('内容路径已存在')
      throw error
    }
  }

  @Patch(':id')
  async update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: UpdateContentPageDto) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const before = await tx.contentPage.findUnique({ where: { id } })
        if (!before) throw new BadRequestException('内容不存在')
        const page = await tx.contentPage.update({ where: { id }, data: this.toData(body) })
        await tx.auditLog.create({ data: { actorId: user.id, action: 'content.page.update', targetType: 'content_page', targetId: id, before: this.auditSnapshot(before), after: this.auditSnapshot(page) } })
        return page
      })
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new BadRequestException('内容路径已存在')
      throw error
    }
  }

  @Delete(':id')
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    await this.prisma.$transaction(async (tx) => {
      const before = await tx.contentPage.findUnique({ where: { id } })
      if (!before) throw new BadRequestException('内容不存在')
      await tx.contentPage.delete({ where: { id } })
      await tx.auditLog.create({ data: { actorId: user.id, action: 'content.page.delete', targetType: 'content_page', targetId: id, before: this.auditSnapshot(before) } })
    })
    return { deleted: true }
  }

  private toData(body: CreateContentPageDto | UpdateContentPageDto) {
    const data = { ...body, title: body.title?.trim(), slug: body.slug?.trim(), category: body.category?.trim(), summary: body.summary?.trim(), contentHtml: body.contentHtml === undefined ? undefined : this.cleanHtml(body.contentHtml), coverUrl: body.coverUrl?.trim() }
    return { ...data, publishedAt: body.published === true ? new Date() : body.published === false ? null : undefined }
  }

  private cleanHtml(value: string) {
    return sanitizeHtml(value, {
      allowedTags: ['h2', 'h3', 'h4', 'p', 'ul', 'ol', 'li', 'strong', 'em', 'blockquote', 'a', 'br', 'hr', 'code', 'pre'],
      allowedAttributes: { a: ['href', 'target', 'rel'], h2: ['id'], h3: ['id'], code: ['class'] },
      allowedSchemes: ['http', 'https', 'mailto'],
      transformTags: { a: (_tagName, attribs) => ({ tagName: 'a', attribs: { ...attribs, rel: 'noopener noreferrer', ...(attribs.target === '_blank' ? { target: '_blank' } : {}) } }) },
    }).trim()
  }

  private auditSnapshot(page: { slug: string; title: string; category: string; published: boolean; sortOrder: number; contentHtml: string }) {
    return { slug: page.slug, title: page.title, category: page.category, published: page.published, sortOrder: page.sortOrder, contentLength: page.contentHtml.length }
  }
}

@Public()
@Controller('content-pages')
export class PublicContentController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list() {
    return this.prisma.contentPage.findMany({ where: { published: true }, orderBy: [{ sortOrder: 'asc' }, { publishedAt: 'desc' }], select: { id: true, slug: true, title: true, category: true, summary: true, coverUrl: true, publishedAt: true, updatedAt: true } })
  }

  @Get(':slug')
  async detail(@Param('slug') slug: string) {
    const page = await this.prisma.contentPage.findFirst({ where: { slug, published: true }, orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }] })
    if (!page) throw new BadRequestException('内容不存在或尚未发布')
    // 用原生 SQL 累加浏览量，避免 Prisma update() 触发 @updatedAt 刷新导致「更新日期」随每次访问变化
    await this.prisma.$executeRaw`UPDATE "ContentPage" SET views = views + 1 WHERE id = ${page.id}`
    return { ...page, views: page.views + 1 }
  }
}
