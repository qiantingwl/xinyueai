import 'reflect-metadata'
import { ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify'
import cookie from '@fastify/cookie'
import helmet from '@fastify/helmet'
import multipart from '@fastify/multipart'
import { PrismaExceptionFilter } from './common/prisma-exception.filter'
import { installationBootstrapMode } from './install/install-bootstrap'

async function bootstrap() {
  const mode = await installationBootstrapMode()
  process.env.APP_BOOT_MODE = mode
  const RootModule = mode === 'application' ? (await import('./app.module')).AppModule : (await import('./install/install-app.module')).InstallAppModule
  const app = await NestFactory.create<NestFastifyApplication>(
    RootModule,
    new FastifyAdapter({ trustProxy: true }),
    { bufferLogs: true, rawBody: true },
  )

  await app.register(cookie)
  await app.register(helmet, { contentSecurityPolicy: false })
  await app.register(multipart, {
    limits: { fileSize: 50 * 1024 * 1024, files: 10 },
  })

  const configuredOrigins = (process.env.WEB_ORIGIN || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
  const localOrigins = [
    'http://localhost:5173',
    'http://localhost:5175',
    'http://localhost:4173',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5175',
    'http://127.0.0.1:4173',
  ]
  const origins = [
    ...new Set([
      ...configuredOrigins,
      ...(process.env.NODE_ENV === 'production' ? [] : localOrigins),
    ]),
  ]

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
