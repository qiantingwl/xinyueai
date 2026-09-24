import { BadRequestException, Injectable, NotFoundException, PayloadTooLargeException, ServiceUnavailableException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { DeleteObjectCommand, GetBucketLifecycleConfigurationCommand, GetObjectCommand, HeadBucketCommand, PutBucketLifecycleConfigurationCommand, S3Client, type LifecycleRule } from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, stat, unlink, writeFile } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { Readable, Transform, type TransformCallback } from 'node:stream'
import { pipeline } from 'node:stream/promises'

export type StorageDriver = 'local' | 's3'
export type StorageLocation = { driver: StorageDriver; bucket: string }

class SizeLimitTransform extends Transform {
  size = 0
  private readonly hash = createHash('sha256')
  constructor(private readonly limit: number) { super() }
  _transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback) {
    this.size += chunk.length
    if (this.size > this.limit) return callback(new BadRequestException('文件不能超过 50 MB'))
    this.hash.update(chunk)
    callback(null, chunk)
  }
  checksum() { return this.hash.digest('hex') }
}

/** Guards read paths where the declared object size is missing or lies, so a single oversized
 *  object can never be pulled entirely into the process. */
class ReadLimitTransform extends Transform {
  private size = 0
  constructor(private readonly limit: number) { super() }
  _transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback) {
    this.size += chunk.length
    if (this.size > this.limit) return callback(new PayloadTooLargeException('文件超出可读取的大小上限'))
    callback(null, chunk)
  }
}

@Injectable()
export class ObjectStorageService {
  private readonly localRoot: string
  private readonly activeDriver: StorageDriver
  private readonly s3Bucket: string
  private readonly s3?: S3Client
  private readonly maxBytes = 50 * 1024 * 1024
  private readonly maxReadBytes: number

  constructor(private readonly config: ConfigService) {
    const configured = config.get<string>('UPLOAD_DIR', 'uploads')
    this.localRoot = isAbsolute(configured) ? configured : resolve(process.cwd(), configured)
    this.activeDriver = config.get<StorageDriver>('STORAGE_DRIVER', 'local')
    // Uploads are capped at `maxBytes`, so anything larger in the bucket is unexpected and must not
    // be allowed to dictate this process's memory usage.
    this.maxReadBytes = Math.max(1, Math.min(512, Number(config.get('STORAGE_MAX_READ_MB', 64)) || 64)) * 1024 * 1024
    this.s3Bucket = config.get<string>('S3_BUCKET', '').trim()
    const accessKeyId = config.get<string>('S3_ACCESS_KEY_ID', '').trim()
    const secretAccessKey = config.get<string>('S3_SECRET_ACCESS_KEY', '').trim()
    if (this.activeDriver === 's3' && (!this.s3Bucket || !accessKeyId || !secretAccessKey)) throw new ServiceUnavailableException('S3 存储缺少 Bucket 或访问凭据')
    if (this.s3Bucket && accessKeyId && secretAccessKey) this.s3 = new S3Client({
      endpoint: config.get<string>('S3_ENDPOINT') || undefined,
      region: config.get<string>('S3_REGION', 'auto'),
      forcePathStyle: config.get<boolean>('S3_FORCE_PATH_STYLE', false),
      credentials: { accessKeyId, secretAccessKey },
    })
  }

  activeLocation(): StorageLocation { return { driver: this.activeDriver, bucket: this.activeDriver === 's3' ? this.s3Bucket : '' } }

  async putStream(objectKey: string, input: NodeJS.ReadableStream, contentType: string) {
    const limiter = new SizeLimitTransform(this.maxBytes)
    const source = Readable.from(input as AsyncIterable<Uint8Array>).pipe(limiter)
    if (this.activeDriver === 'local') {
      const target = this.localPath(objectKey)
      await mkdir(resolve(target, '..'), { recursive: true })
      try { await pipeline(source, createWriteStream(target, { flags: 'wx' })) } catch (error) { await unlink(target).catch(() => undefined); throw error }
    } else {
      await new Upload({ client: this.s3Client(), params: { Bucket: this.s3Bucket, Key: objectKey, Body: source, ContentType: contentType }, leavePartsOnError: false }).done()
    }
    if (!limiter.size) { await this.delete(this.activeLocation(), objectKey).catch(() => undefined); throw new BadRequestException('文件内容为空') }
    return { size: limiter.size, checksum: limiter.checksum() }
  }

  async putBytes(objectKey: string, data: Uint8Array, contentType: string) {
    await this.putBytesAt(this.activeLocation(), objectKey, data, contentType)
    return { size: data.byteLength, checksum: createHash('sha256').update(data).digest('hex') }
  }

  async putBytesAt(location: StorageLocation, objectKey: string, data: Uint8Array, contentType: string) {
    if (!data.byteLength || data.byteLength > this.maxBytes) throw new BadRequestException('文件大小无效')
    if (location.driver === 'local') {
      const target = this.localPath(objectKey)
      await mkdir(resolve(target, '..'), { recursive: true })
      await writeFile(target, data, { flag: 'wx' })
    } else await new Upload({ client: this.s3Client(), params: { Bucket: location.bucket || this.s3Bucket, Key: objectKey, Body: data, ContentType: contentType } }).done()
  }

  /** Streams an object without buffering it. Callers that only pass bytes through to an HTTP
   *  response should prefer this over `read`. */
  async readStream(location: StorageLocation, objectKey: string): Promise<{ stream: Readable; size: number }> {
    if (location.driver === 'local') {
      const target = this.localPath(objectKey)
      let size: number
      try { size = (await stat(target)).size } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new NotFoundException('文件内容不存在')
        throw new ServiceUnavailableException('本地文件存储读取失败')
      }
      this.assertReadableSize(size)
      return { stream: createReadStream(target), size }
    }
    try {
      const response = await this.s3Client().send(new GetObjectCommand({ Bucket: location.bucket || this.s3Bucket, Key: objectKey }))
      if (!response.Body) throw new ServiceUnavailableException('对象存储未返回文件内容')
      const size = Number(response.ContentLength || 0)
      if (size) this.assertReadableSize(size)
      const body = response.Body as Readable
      // ContentLength is advisory for some S3-compatible backends, so keep a hard byte ceiling.
      return { stream: body.pipe(new ReadLimitTransform(this.maxReadBytes)), size }
    } catch (error) {
      throw this.readFailure(error)
    }
  }

  async read(location: StorageLocation, objectKey: string) {
    const { stream } = await this.readStream(location, objectKey)
    const chunks: Buffer[] = []
    let total = 0
    try {
      for await (const chunk of stream) {
        const buffer = Buffer.from(chunk as Uint8Array)
        total += buffer.byteLength
        this.assertReadableSize(total)
        chunks.push(buffer)
      }
    } catch (error) {
      stream.destroy()
      throw this.readFailure(error)
    }
    return Buffer.concat(chunks)
  }

  private assertReadableSize(size: number) {
    if (size > this.maxReadBytes) throw new PayloadTooLargeException('文件超出可读取的大小上限')
  }

  private readFailure(error: unknown) {
    if (error instanceof NotFoundException || error instanceof PayloadTooLargeException || error instanceof ServiceUnavailableException) return error
    const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
    if (status === 404 || (error as { name?: string }).name === 'NoSuchKey') return new NotFoundException('文件内容不存在')
    return new ServiceUnavailableException('对象存储读取失败')
  }

  async delete(location: StorageLocation, objectKey: string) {
    if (location.driver === 'local') return void await unlink(this.localPath(objectKey)).catch(() => undefined)
    await this.s3Client().send(new DeleteObjectCommand({ Bucket: location.bucket || this.s3Bucket, Key: objectKey }))
  }

  async health() {
    if (this.activeDriver === 'local') {
      await mkdir(this.localRoot, { recursive: true })
      const info = await stat(this.localRoot)
      return { driver: 'local' as const, directory: this.localRoot, bucket: '', writable: info.isDirectory() }
    }
    await this.s3Client().send(new HeadBucketCommand({ Bucket: this.s3Bucket }))
    return { driver: 's3' as const, directory: '', bucket: this.s3Bucket, writable: true }
  }

  async lifecycleStatus() {
    if (this.activeDriver !== 's3') return { supported: false, driver: this.activeDriver, rules: [], message: '本地存储不需要 Bucket 生命周期规则' }
    try {
      const response = await this.s3Client().send(new GetBucketLifecycleConfigurationCommand({ Bucket: this.s3Bucket }))
      const rules = (response.Rules || []).filter((rule) => rule.ID?.startsWith('xinyue-')).map((rule) => ({ id: rule.ID, status: rule.Status, abortIncompleteMultipartUploadDays: rule.AbortIncompleteMultipartUpload?.DaysAfterInitiation, noncurrentVersionExpirationDays: rule.NoncurrentVersionExpiration?.NoncurrentDays }))
      return { supported: true, driver: 's3' as const, bucket: this.s3Bucket, rules }
    } catch (error) {
      const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
      if (status === 404 || (error as { name?: string }).name === 'NoSuchLifecycleConfiguration') return { supported: true, driver: 's3' as const, bucket: this.s3Bucket, rules: [] }
      return { supported: false, driver: 's3' as const, bucket: this.s3Bucket, rules: [], message: `当前对象存储不支持读取生命周期：${error instanceof Error ? error.message : '请求失败'}` }
    }
  }

  async applyLifecycle() {
    if (this.activeDriver !== 's3') throw new BadRequestException('只有 S3 存储支持 Bucket 生命周期规则')
    const abortDays = Math.min(30, Math.max(1, Number(this.config.get('S3_ABORT_INCOMPLETE_UPLOAD_DAYS', 7))))
    const noncurrentDays = Math.min(3650, Math.max(1, Number(this.config.get('S3_NONCURRENT_EXPIRATION_DAYS', 30))))
    let existing: LifecycleRule[] = []
    try { existing = (await this.s3Client().send(new GetBucketLifecycleConfigurationCommand({ Bucket: this.s3Bucket }))).Rules || [] } catch (error) {
      const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
      if (status !== 404 && (error as { name?: string }).name !== 'NoSuchLifecycleConfiguration') throw error
    }
    const rules: LifecycleRule[] = [
      ...existing.filter((rule) => !rule.ID?.startsWith('xinyue-')),
      { ID: 'xinyue-abort-incomplete-uploads', Status: 'Enabled', Filter: { Prefix: '' }, AbortIncompleteMultipartUpload: { DaysAfterInitiation: abortDays } },
      { ID: 'xinyue-expire-noncurrent-versions', Status: 'Enabled', Filter: { Prefix: '' }, NoncurrentVersionExpiration: { NoncurrentDays: noncurrentDays } },
    ]
    await this.s3Client().send(new PutBucketLifecycleConfigurationCommand({ Bucket: this.s3Bucket, LifecycleConfiguration: { Rules: rules } }))
    return this.lifecycleStatus()
  }

  private localPath(objectKey: string) {
    const target = resolve(this.localRoot, objectKey)
    const withinRoot = relative(this.localRoot, target)
    if (!withinRoot || withinRoot === '..' || withinRoot.startsWith(`..${sep}`)) throw new BadRequestException('文件路径无效')
    return target
  }

  private s3Client() { if (!this.s3) throw new ServiceUnavailableException('S3 存储未配置'); return this.s3 }
}
