import 'reflect-metadata'
import { ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify'
import cookie from '@fastify/cookie'
import helmet from '@fastify/helmet'
import multipart from '@fastify/multipart'
import { PrismaExceptionFilter } from './common/prisma-exception.filter'
import { AppModule } from './app.module'
import { COOKIE_MUTATION_HEADER, cookieMutationAllowed, parseTrustProxy, parseWebOrigins } from './config/http-security'

// Prisma returns BigInt for quota values; expose them as decimal strings so
// Fastify/Nest JSON serialization remains stable for API consumers.
declare global {
  interface BigInt { toJSON(): string }
}
BigInt.prototype.toJSON = function toJSON() { return this.toString() }

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ trustProxy: parseTrustProxy(process.env.TRUST_PROXY) }),
    { bufferLogs: true, rawBody: true },
  )

  await app.register(cookie)
  await app.register(helmet, { contentSecurityPolicy: false })
  await app.register(multipart, {
    limits: { fileSize: 50 * 1024 * 1024, files: 10 },
  })

  const localOrigins = [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:4173',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5174',
    'http://127.0.0.1:4173',
  ]
  const origins = parseWebOrigins(
    process.env.WEB_ORIGIN,
    process.env.NODE_ENV === 'production' ? [] : localOrigins,
  )

  app.getHttpAdapter().getInstance().addHook('onRequest', async (request, response) => {
    const marker = request.headers[COOKIE_MUTATION_HEADER]
    const allowed = cookieMutationAllowed({
      method: request.method,
      hasSessionCookie: Boolean(request.cookies?.flux_session),
      requestMarker: Array.isArray(marker) ? marker[0] : marker,
      origin: request.headers.origin,
    }, origins)
    if (!allowed) return response.status(403).send({ statusCode: 403, message: '请求来源校验失败', error: 'Forbidden' })
  })

  app.enableCors({
    origin: origins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  })
  app.setGlobalPrefix('v1')
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )
  app.useGlobalFilters(new PrismaExceptionFilter())
  app.enableShutdownHooks()

  await app.listen(Number(process.env.PORT || 3100), '0.0.0.0')
}

void bootstrap()
