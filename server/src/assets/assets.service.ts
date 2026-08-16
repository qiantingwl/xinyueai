import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { AssetKind, Prisma } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises'
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { PrismaService } from '../prisma/prisma.service'

type StoredFile = {
  stream: NodeJS.ReadableStream
  name: string
  mimeType: string
  kind: AssetKind
  projectId?: string
  metadata?: Record<string, unknown>
}

const rasterMimeByExtension: Record<string, string> = {
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
}
const inlineMimeTypes = new Set(Object.values(rasterMimeByExtension))
inlineMimeTypes.add('video/mp4')
inlineMimeTypes.add('video/webm')
inlineMimeTypes.add('video/quicktime')
const rasterMimeTypes = new Set(Object.values(rasterMimeByExtension))
const videoMimeByExtension: Record<string, string> = { '.mov': 'video/quicktime', '.mp4': 'video/mp4', '.webm': 'video/webm' }
const videoMimeTypes = new Set(Object.values(videoMimeByExtension))

export function resolveRasterImageMime(name: string, suppliedMimeType: string) {
  return rasterMimeByExtension[extname(name).toLowerCase()] || (rasterMimeTypes.has(suppliedMimeType.toLowerCase()) ? suppliedMimeType.toLowerCase() : null)
}

export function resolveVideoMime(name: string, suppliedMimeType: string) {
  return videoMimeByExtension[extname(name).toLowerCase()] || (videoMimeTypes.has(suppliedMimeType.toLowerCase()) ? suppliedMimeType.toLowerCase() : null)
}

export function assetDisposition(mimeType: string, name: string) {
  const mode = inlineMimeTypes.has(mimeType.toLowerCase()) ? 'inline' : 'attachment'
  return `${mode}; filename*=UTF-8''${encodeURIComponent(name)}`
}

@Injectable()
export class AssetsService {
  private readonly uploadRoot: string

  constructor(private readonly config: ConfigService, private readonly prisma: PrismaService) {
    const configured = this.config.get<string>('UPLOAD_DIR', 'uploads')
    this.uploadRoot = isAbsolute(configured) ? configured : resolve(process.cwd(), configured)
  }

  private safePath(objectKey: string) {
    const target = resolve(this.uploadRoot, objectKey)
    const withinRoot = relative(this.uploadRoot, target)
    if (!withinRoot || withinRoot.startsWith(`..${sep}`) || withinRoot === '..') {
      throw new BadRequestException('文件路径无效')
    }
    return target
  }

  private makeObjectKey(userId: string, name: string, generated = false) {
    const extension = extname(name).toLowerCase().replace(/[^a-z0-9.]/g, '').slice(0, 12)
    const folder = generated ? 'generated' : 'uploads'
    return join('users', userId, folder, new Date().toISOString().slice(0, 10), `${randomUUID()}${extension}`).replaceAll('\\', '/')
  }

  private async assertProjectAccess(userId: string, projectId?: string) {
    if (!projectId) return
    const project = await this.prisma.project.findFirst({ where: { id: projectId, archivedAt: null, OR: [{ userId }, { members: { some: { userId } } }] }, select: { id: true } })
    if (!project) throw new NotFoundException('项目不存在')
  }

  async storeUpload(userId: string, input: StoredFile) {
    try {
      await this.assertProjectAccess(userId, input.projectId)
    } catch (error) {
      input.stream.resume()
      throw error
    }
    const objectKey = this.makeObjectKey(userId, input.name)
    const target = this.safePath(objectKey)
    await mkdir(resolve(target, '..'), { recursive: true })
    try {
      await pipeline(input.stream, createWriteStream(target, { flags: 'wx' }))
      const fileInfo = await stat(target)
      if (!fileInfo.size || fileInfo.size > 50 * 1024 * 1024) throw new BadRequestException('文件大小无效')
      return await this.prisma.asset.create({
        data: {
          userId,
          projectId: input.projectId,
          objectKey,
          name: input.name.slice(0, 255),
          mimeType: input.mimeType,
          kind: input.kind,
          size: BigInt(fileInfo.size),
          metadata: input.metadata as Prisma.InputJsonValue | undefined,
        },
      })
    } catch (error) {
      await unlink(target).catch(() => undefined)
      throw error
    }
  }

  async storeGenerated(userId: string, data: Uint8Array, input: { name: string; mimeType: string; kind: AssetKind; projectId?: string; metadata?: Record<string, unknown> }) {
    await this.assertProjectAccess(userId, input.projectId)
    const namedExtension = extname(input.name).toLowerCase().replace(/[^a-z0-9.]/g, '').slice(0, 12)
    const extension = input.mimeType === 'image/png' ? '.png' : input.mimeType === 'image/webp' ? '.webp' : input.mimeType === 'image/gif' ? '.gif' : input.mimeType === 'image/avif' ? '.avif' : input.mimeType === 'image/svg+xml' ? '.svg' : input.mimeType === 'video/webm' ? '.webm' : input.mimeType === 'video/quicktime' ? '.mov' : input.mimeType.startsWith('video/') ? '.mp4' : namedExtension || '.bin'
    const fileName = input.name.toLowerCase().endsWith(extension) ? input.name : `${input.name}${extension}`
    const objectKey = this.makeObjectKey(userId, fileName, true)
    const target = this.safePath(objectKey)
    await mkdir(resolve(target, '..'), { recursive: true })
    await writeFile(target, data, { flag: 'wx' })
    try {
      return await this.prisma.asset.create({ data: { userId, projectId: input.projectId, objectKey, name: input.name, mimeType: input.mimeType, kind: input.kind, size: BigInt(data.byteLength), metadata: input.metadata as Prisma.InputJsonValue | undefined } })
    } catch (error) {
      await unlink(target).catch(() => undefined)
      throw error
    }
  }

  async readForUser(userId: string, id: string) {
    const asset = await this.prisma.asset.findFirst({ where: { id, userId, deletedAt: null } })
    if (!asset) throw new NotFoundException('文件不存在')
    return this.readAsset(asset)
  }

  async readForAdmin(id: string) {
    const asset = await this.prisma.asset.findFirst({ where: { id, deletedAt: null } })
    if (!asset) throw new NotFoundException('文件不存在')
    return this.readAsset(asset)
  }

  private async readAsset(asset: { objectKey: string; mimeType: string; name: string; kind?: AssetKind }) {
    const target = this.safePath(asset.objectKey)
    const file = await readFile(target).catch(() => null)
    if (!file) throw new NotFoundException('文件内容不存在')
    return { file, mimeType: asset.mimeType, name: asset.name, kind: asset.kind }
  }

  async remove(userId: string, id: string) {
    const asset = await this.prisma.asset.findFirst({ where: { id, userId, deletedAt: null } })
    if (!asset) throw new NotFoundException('文件不存在')
    await this.prisma.asset.update({ where: { id }, data: { deletedAt: new Date() } })
    await unlink(this.safePath(asset.objectKey)).catch(() => undefined)
    return { deleted: true }
  }

  async removeAsAdmin(id: string) {
    const asset = await this.prisma.asset.findFirst({ where: { id, deletedAt: null } })
    if (!asset) throw new NotFoundException('文件不存在')
    await this.prisma.asset.update({ where: { id }, data: { deletedAt: new Date() } })
    await unlink(this.safePath(asset.objectKey)).catch(() => undefined)
    return { deleted: true }
  }

  async health() {
    await mkdir(this.uploadRoot, { recursive: true })
    const info = await stat(this.uploadRoot)
    return { driver: 'local', directory: this.uploadRoot, writable: info.isDirectory() }
  }
}
