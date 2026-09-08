import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { localWorkerHttpUrl, PublicEndpointPolicyService } from '../../server/src/common/public-endpoint-policy.service'
import { ProvidersService } from '../../server/src/providers/providers.service'

const ProviderType = {
  OPENAI_COMPATIBLE: 'OPENAI_COMPATIBLE',
} as const
const ProviderAuthType = {
  BEARER: 'BEARER',
} as const

const cryptoStub = {
  encrypt: (value: string) => `encrypted:${value}`,
  hint: (value: string) => value.slice(0, 4),
  decrypt: (value: string) => value.replace(/^encrypted:/, ''),
}

function providerInput(baseUrl: string) {
  return {
    name: 'Test Provider',
    type: ProviderType.OPENAI_COMPATIBLE as never,
    baseUrl,
    apiKey: 'provider-secret',
    authType: ProviderAuthType.BEARER as never,
    enabled: true,
  }
}

function createService(prisma: Record<string, unknown>, endpointPolicy: PublicEndpointPolicyService = new PublicEndpointPolicyService()) {
  const config = { get: (_key: string, fallback = '') => fallback }
  return new ProvidersService(
    prisma as never,
    cryptoStub as never,
    config as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    endpointPolicy,
  )
}

test('admin provider creation rejects loopback, private, and metadata endpoints before persistence', async () => {
  let createCalls = 0
  const service = createService({ providerTemplate: { findUnique: async () => null }, providerChannel: { create: async () => { createCalls += 1 } } })

  for (const baseUrl of [
    'http://127.0.0.1:3100',
    'http://10.0.0.8:8080',
    'http://169.254.169.254/latest/meta-data',
  ]) await assert.rejects(() => service.createProvider(providerInput(baseUrl)), /非公网地址/)

  assert.equal(createCalls, 0)
})

test('changing an admin provider endpoint preserves its retained credential', async () => {
  let updateData: Record<string, unknown> | undefined
  const existing = {
    id: 'provider-1',
    name: 'Old Provider',
    type: ProviderType.OPENAI_COMPATIBLE,
    baseUrl: 'https://old.example/v1',
    encryptedApiKey: 'encrypted:old-secret',
    apiKeyHint: 'old-',
    metadata: {},
  }
  const service = createService({
    providerTemplate: { findUnique: async () => null },
    providerChannel: {
      findUnique: async () => existing,
      update: async ({ data }: { data: Record<string, unknown> }) => {
        updateData = data
        return { ...existing, ...data }
      },
    },
  }, { assertPublicHttpUrl: async (value: string) => new URL(value) } as PublicEndpointPolicyService)

  await service.updateProvider('provider-1', { baseUrl: 'https://new.example/v1' })
  assert.equal(updateData?.encryptedApiKey, undefined)
  assert.equal(updateData?.apiKeyHint, undefined)
  assert.equal(updateData?.lastHealthStatus, null)
  assert.equal(updateData?.lastHealthAt, null)
  assert.match(String(updateData?.lastHealthMessage), /重新检测/)

  await service.updateProvider('provider-1', { apiKey: 'new-secret' })
  assert.equal(updateData?.encryptedApiKey, 'encrypted:new-secret')
  assert.equal(updateData?.apiKeyHint, 'new-')

  await service.updateProvider('provider-1', { apiKey: '' })
  assert.equal(updateData?.encryptedApiKey, '')
  assert.equal(updateData?.apiKeyHint, '')
})

test('admin provider template and key updates use valid Prisma relation fields', async () => {
  let createData: Record<string, unknown> | undefined
  let updateData: Record<string, unknown> | undefined
  const existing = {
    id: 'provider-1',
    name: 'Old Provider',
    type: ProviderType.OPENAI_COMPATIBLE,
    baseUrl: 'https://old.example/v1',
    encryptedApiKey: 'encrypted:old-secret',
    apiKeyHint: 'old-',
    metadata: {},
  }
  const template = {
    id: 'template-1',
    type: ProviderType.OPENAI_COMPATIBLE,
    baseUrl: 'https://template.example/v1',
    authType: ProviderAuthType.BEARER,
    apiProtocol: 'openai',
    nativeSearchProvider: 'disabled',
    customHeaders: null,
  }
  const service = createService({
    providerTemplate: { findUnique: async () => template },
    providerChannel: {
      findUnique: async () => existing,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        createData = data
        return { ...existing, ...data }
      },
      update: async ({ data }: { data: Record<string, unknown> }) => {
        updateData = data
        return { ...existing, ...data }
      },
    },
  }, { assertPublicHttpUrl: async (value: string) => new URL(value) } as PublicEndpointPolicyService)

  await service.createProvider({ ...providerInput('https://new.example/v1'), templateId: 'template-1' })
  assert.equal(createData?.templateId, undefined)
  assert.deepEqual(createData?.template, { connect: { id: 'template-1' } })

  await service.updateProvider('provider-1', { templateId: 'template-1', apiKey: 'new-secret' })
  assert.equal(updateData?.templateId, undefined)
  assert.deepEqual(updateData?.template, { connect: { id: 'template-1' } })
  assert.equal(updateData?.encryptedApiKey, 'encrypted:new-secret')
  assert.equal(updateData?.lastRotatedAt, undefined)

  await service.updateProvider('provider-1', { templateId: null })
  assert.deepEqual(updateData?.template, { disconnect: true })
})

test('changing a user credential resets its credential and route health state', async () => {
  let credentialData: Record<string, unknown> | undefined
  let routeData: Record<string, unknown> | undefined
  const existing = {
    id: 'credential-1',
    userId: 'user-1',
    providerType: ProviderType.OPENAI_COMPATIBLE,
    baseUrl: 'https://old.example/v1',
    encryptedApiKey: 'encrypted:old-secret',
    apiKeyHint: 'old-',
  }
  const prisma: Record<string, any> = {
    providerTemplate: { findUnique: async () => null },
    userGroupMember: { findMany: async () => [] },
    userSubscription: { findFirst: async () => null },
    userApiCredential: {
      findFirst: async () => existing,
      update: async ({ data }: { data: Record<string, unknown> }) => {
        credentialData = data
        return { ...existing, ...data }
      },
    },
    userModelRoute: {
      updateMany: async ({ data }: { data: Record<string, unknown> }) => {
        routeData = data
        return { count: 1 }
      },
    },
  }
  prisma.$transaction = async (callback: (transaction: Record<string, any>) => Promise<unknown>) => callback(prisma)
  const service = createService(prisma, { assertPublicHttpUrl: async (value: string) => new URL(value) } as PublicEndpointPolicyService)

  await service.updateCredential('user-1', 'credential-1', { baseUrl: 'https://new.example/v1', apiKey: 'new-secret' })
  assert.equal(credentialData?.baseUrl, 'https://new.example/v1')
  assert.equal(credentialData?.encryptedApiKey, 'encrypted:new-secret')
  assert.equal(credentialData?.apiKeyHint, 'new-')
  assert.equal(credentialData?.lastHealthStatus, null)
  assert.equal(credentialData?.cooldownUntil, null)
  assert.equal(routeData?.lastHealthStatus, null)
  assert.equal(routeData?.consecutiveFailures, 0)
  assert.equal(routeData?.cooldownUntil, null)
})

test('enabled models remain visible with an explicit unconfigured status', async () => {
  const service = createService({
    modelPreset: {
      findMany: async () => [{
        id: 'model-1',
        key: 'chat-model',
        displayName: 'Chat Model',
        capability: 'CHAT',
        enabled: true,
        isDefault: true,
        provider: null,
        providerRoutes: [],
      }],
    },
  })

  const [model] = await service.listModels()
  assert.equal(model?.key, 'chat-model')
  assert.equal(model?.availability, 'UNCONFIGURED')
  assert.equal(model?.routeCount, 0)
})

test('bound models report a missing provider key instead of a missing channel', async () => {
  const missingKeyProvider = {
    type: ProviderType.OPENAI_COMPATIBLE,
    enabled: true,
    encryptedApiKey: '',
    lastHealthStatus: null,
    cooldownUntil: null,
  }
  const service = createService({
    modelPreset: {
      findMany: async () => [{
        id: 'model-2',
        key: 'image-model',
        displayName: 'Image Model',
        capability: 'IMAGE',
        enabled: true,
        isDefault: true,
        provider: missingKeyProvider,
        providerRoutes: [{ enabled: true, provider: missingKeyProvider }],
      }],
    },
  })

  const [model] = await service.listModels()
  assert.equal(model?.availability, 'UNCONFIGURED')
  assert.equal(model?.availabilityReason, 'API_KEY_MISSING')
})

test('local worker endpoints require an exact allowed host or host and port', () => {
  assert.equal(localWorkerHttpUrl('http://image-worker:8080/v1', ['image-worker']).hostname, 'image-worker')
  assert.equal(localWorkerHttpUrl('http://custom-worker:9000/v1', ['custom-worker:9000']).port, '9000')
  assert.throws(() => localWorkerHttpUrl('http://127.0.0.1:8080/v1', ['image-worker']), /允许列表/)
  assert.throws(() => localWorkerHttpUrl('http://metadata.internal/v1', ['image-worker']), /允许列表/)
})

test('public Provider result downloads keep socket-level public DNS validation', () => {
  for (const file of [
    'server/src/generations/runners/image-generation.runner.ts',
    'server/src/generations/runners/video-generation.runner.ts',
  ]) {
    const source = readFileSync(file, 'utf8')
    assert.match(source, /resolved\.type === ProviderType\.LOCAL_WORKER \? fetchNoRedirect : fetchPublicNoRedirect/)
    assert.doesNotMatch(source, /resolved\.source !== 'user' \? fetchNoRedirect : fetchPublicNoRedirect/)
  }
})
