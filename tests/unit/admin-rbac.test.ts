import '../../server/node_modules/reflect-metadata/Reflect.js'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { AdminGuard } from '../../server/src/admin/admin.guard'
import { ADMIN_PERMISSION_METADATA, ADMIN_SUPER_ONLY_METADATA } from '../../server/src/admin/admin-permission.decorator'
import { permissionForAdminRequest } from '../../server/src/admin/admin-permissions'
import { AdminRolesService } from '../../server/src/admin/admin-roles.service'
import { AuthGuard } from '../../server/src/auth/auth.guard'

class TestController {}

function controllerFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = join(directory, entry.name)
    if (entry.isDirectory()) return controllerFiles(target)
    return entry.name.endsWith('.controller.ts') ? [target] : []
  })
}

function executionContext(request: Record<string, unknown>, handler: Function = () => undefined, controller: Function = TestController) {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => handler,
    getClass: () => controller,
  } as never
}

function adminGuard(permissions: string[], declaredPermission?: string, superAdminOnly = false) {
  const prisma = {
    adminRole: {
      findFirst: async () => ({ permissions }),
    },
  }
  const reflector = {
    getAllAndOverride: (key: string) => key === ADMIN_SUPER_ONLY_METADATA
      ? superAdminOnly
      : key === ADMIN_PERMISSION_METADATA ? declaredPermission : undefined,
  }
  return new AdminGuard(prisma as never, reflector as never)
}

function hasHttpStatus(error: unknown, status: number) {
  return typeof error === 'object'
    && error !== null
    && 'getStatus' in error
    && typeof error.getStatus === 'function'
    && error.getStatus() === status
}

test('后台路由权限映射覆盖 P0 模块并对未知路径 fail-closed', () => {
  assert.equal(permissionForAdminRequest('/v1/admin/commerce/promotions', 'GET'), 'billing.read')
  assert.equal(permissionForAdminRequest('/v1/admin/works/work-1/review', 'POST'), 'content.write')
  assert.equal(permissionForAdminRequest('/v1/admin/web-search-channels', 'GET'), 'agent.read')
  assert.equal(permissionForAdminRequest('/v1/admin/prompt-library/items', 'GET'), 'content.read')
  assert.equal(permissionForAdminRequest('/v1/admin/prompt-templates', 'POST'), 'content.write')
  assert.equal(permissionForAdminRequest('/v1/admin/model-pricing/preview', 'POST'), 'models.write')
  assert.equal(permissionForAdminRequest('/v1/admin/token-billing/ledger', 'GET'), 'billing.read')
  assert.equal(permissionForAdminRequest('/v1/admin/not-configured', 'GET'), null)
  assert.equal(permissionForAdminRequest('/v1/health/metrics', 'GET'), null)
})

test('所有当前 admin controller 均经过 AdminGuard 且路由有权限映射', () => {
  for (const file of controllerFiles(fileURLToPath(new URL('../../server/src/', import.meta.url)))) {
    const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
    for (const node of source.statements) {
      if (!ts.isClassDeclaration(node)) continue
      const decorators = ts.getDecorators(node) || []
      const controller = decorators.find((decorator) => ts.isCallExpression(decorator.expression) && decorator.expression.expression.getText(source) === 'Controller')
      if (!controller) continue
      const controllerArgument = controller.expression.arguments[0]
      const base = controllerArgument && ts.isStringLiteral(controllerArgument) ? controllerArgument.text : ''
      if (!(base === 'admin' || base.startsWith('admin/'))) continue

      const guards = decorators.find((decorator) => ts.isCallExpression(decorator.expression) && decorator.expression.expression.getText(source) === 'UseGuards')
      const guardNames = guards && ts.isCallExpression(guards.expression) ? guards.expression.arguments.map((argument) => argument.getText(source)) : []
      assert.ok(guardNames.includes('AuthGuard') && guardNames.includes('AdminGuard'), `${file} 的 ${node.name?.text} 未完整配置后台 Guard`)

      for (const member of node.members) {
        if (!ts.isMethodDeclaration(member)) continue
        const memberDecorators = ts.getDecorators(member) || []
        const route = memberDecorators.find((decorator) => ts.isCallExpression(decorator.expression) && ['Get', 'Post', 'Put', 'Patch', 'Delete', 'Head', 'Options'].includes(decorator.expression.expression.getText(source)))
        if (!route || !ts.isCallExpression(route.expression)) continue
        const routeArgument = route.expression.arguments[0]
        const childPath = routeArgument && ts.isStringLiteral(routeArgument) ? routeArgument.text : ''
        const method = route.expression.expression.getText(source).toUpperCase()
        const url = `/v1/${[base, childPath].filter(Boolean).join('/')}`
        assert.ok(permissionForAdminRequest(url, method), `${method} ${url} 未配置后台权限`)
        if (base === 'admin/roles' && !['GET', 'HEAD', 'OPTIONS'].includes(method)) {
          const superAdminOnly = memberDecorators.some((decorator) => ts.isCallExpression(decorator.expression) && decorator.expression.expression.getText(source) === 'RequireSuperAdmin')
          assert.ok(superAdminOnly, `${method} ${url} 必须限制为超级管理员`)
        }
      }
    }
  }
})

test('无后台资源权限的管理员访问时返回 403', async () => {
  const guard = adminGuard([])
  await assert.rejects(
    () => guard.canActivate(executionContext({ user: { role: 'ADMIN', adminRoleId: 'role-1' }, url: '/v1/admin/providers', method: 'GET' })),
    (error: unknown) => hasHttpStatus(error, 403),
  )
})

test('受限管理员只能访问获授权的方法和资源', async () => {
  const guard = adminGuard(['models.read'])
  assert.equal(await guard.canActivate(executionContext({ user: { role: 'ADMIN', adminRoleId: 'role-1' }, url: '/v1/admin/providers', method: 'GET' })), true)
  await assert.rejects(
    () => guard.canActivate(executionContext({ user: { role: 'ADMIN', adminRoleId: 'role-1' }, url: '/v1/admin/providers', method: 'POST' })),
    (error: unknown) => hasHttpStatus(error, 403),
  )
  await assert.rejects(
    () => guard.canActivate(executionContext({ user: { role: 'ADMIN', adminRoleId: 'role-1' }, url: '/v1/admin/commerce/promotions', method: 'GET' })),
    (error: unknown) => hasHttpStatus(error, 403),
  )
})

test('未知后台路径即使对通配权限管理员也拒绝，SUPER_ADMIN 保持放行', async () => {
  const wildcardGuard = adminGuard(['*'])
  const request = { user: { role: 'ADMIN', adminRoleId: 'role-1' }, url: '/v1/admin/not-configured', method: 'GET' }
  await assert.rejects(() => wildcardGuard.canActivate(executionContext(request)), (error: unknown) => hasHttpStatus(error, 403))
  assert.equal(await wildcardGuard.canActivate(executionContext({ ...request, user: { role: 'SUPER_ADMIN' } })), true)
})

test('角色写权限不能绕过仅限超级管理员的高权限操作', async () => {
  const guard = adminGuard(['roles.write'], undefined, true)
  const request = { user: { role: 'ADMIN', adminRoleId: 'role-1' }, url: '/v1/admin/roles', method: 'POST' }
  await assert.rejects(() => guard.canActivate(executionContext(request)), (error: unknown) => hasHttpStatus(error, 403))
  assert.equal(await guard.canActivate(executionContext({ ...request, user: { role: 'SUPER_ADMIN' } })), true)
})

test('无角色的普通管理员不会在启动时被自动授予通配权限', async () => {
  let userUpdates = 0
  const service = new AdminRolesService({
    adminRole: { upsert: async () => ({ id: 'role_system_administrator' }) },
    user: { updateMany: async () => { userUpdates += 1 } },
  } as never)
  await service.onModuleInit()
  assert.equal(userUpdates, 0)
})

test('metrics 端点要求登录且显式要求 dashboard.read', async () => {
  const source = readFileSync(new URL('../../server/src/health.controller.ts', import.meta.url), 'utf8')
  assert.match(source, /@Get\('metrics'\)\s*@UseGuards\(AuthGuard, AdminGuard\)\s*@RequireAdminPermission\('dashboard\.read'\)/)

  // reflector 用最小桩：返回 undefined 即「非 @Public」，让守卫继续走会话校验
  const authGuard = new AuthGuard({} as never, { getAllAndOverride: () => undefined } as never)
  await assert.rejects(
    () => authGuard.canActivate(executionContext({ cookies: {}, url: '/v1/health/metrics', method: 'GET' })),
    (error: unknown) => hasHttpStatus(error, 401),
  )

  const guard = adminGuard(['dashboard.read'], 'dashboard.read')
  assert.equal(await guard.canActivate(executionContext({ user: { role: 'ADMIN', adminRoleId: 'role-1' }, url: '/v1/health/metrics', method: 'GET' })), true)
  const noMetricsPermission = adminGuard([], 'dashboard.read')
  await assert.rejects(
    () => noMetricsPermission.canActivate(executionContext({ user: { role: 'ADMIN', adminRoleId: 'role-1' }, url: '/v1/health/metrics', method: 'GET' })),
    (error: unknown) => hasHttpStatus(error, 403),
  )
})
