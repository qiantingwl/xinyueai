import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

/**
 * 鉴权不变量（全局 AuthGuard 架构下的双向护栏）：
 * 1. 每个 @Controller 类必须显式选择阵营——类级 @UseGuards（默认拒绝面）或
 *    类级 @Public（匿名白名单）。既没有守卫也没有 @Public 的控制器无法通过编译期
 *    意图审查，直接让测试失败。
 * 2. @Public 控制器名单封闭：新控制器想公开必须把类名加进 ALLOWED_PUBLIC，
 *    防止 @Public 被随手滥用导致匿名面悄悄扩大。
 */

const CONTROLLER_DIR = join(import.meta.dirname, '..', '..', 'server', 'src')

/** 经人工核实的匿名白名单（迁移基线：42 条匿名路由，2026-09-19 全量盘点）。 */
const ALLOWED_PUBLIC = new Set([
  'HealthController',
  'PublicRecommendationsController',
  'AuthController', // 登录/注册/OAuth/安装向导；me/logout/admin/account 有方法级守卫
  'PublicContentController',
  'ConversationSharesController',
  'InspirationsController',
  'PaymentsController', // webhooks 走签名验证；其余方法有方法级守卫
  'PromptLibraryController',
  'PromptTemplatesController',
  'CatalogController',
  'GalleryController',
])

function controllerFiles(dir) {
  const out = []
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, name.name)
    if (name.isDirectory()) out.push(...controllerFiles(full))
    else if (name.name.endsWith('.controller.ts')) out.push(full)
  }
  return out
}

const publicClasses: string[] = []

test('每个控制器必须显式声明守卫或 @Public', () => {
  const offenders = []
  for (const file of controllerFiles(CONTROLLER_DIR)) {
    const source = readFileSync(file, 'utf8')
    if (!source.includes('@Controller(')) continue
    // 紧贴 export class 的装饰器簇：@Public() / @Controller(...) / @UseGuards(...) 的任意排列
    for (const match of source.matchAll(/((?:@\w+\([^)]*\)\s*)+)export class (\w+)/g)) {
      const block = match[1]
      const className = match[2]
      const guarded = block.includes('@UseGuards(')
      const isPublic = block.includes('@Public(')
      if (guarded === isPublic) {
        const relative = file.split('server').pop()?.split('\\').join('/') || file
        offenders.push(`${relative} :: ${className}（守卫=${guarded}，@Public=${isPublic}）`)
      }
      if (isPublic) publicClasses.push(className)
    }
  }
  assert.deepEqual(
    offenders,
    [],
    '以下控制器既没有类级 @UseGuards 也没有类级 @Public，鉴权意图不明确：' + offenders.join('；'),
  )
})

test('@Public 控制器必须全部在封闭白名单内', () => {
  const unexpected = publicClasses.filter((name) => !ALLOWED_PUBLIC.has(name))
  assert.deepEqual(
    unexpected,
    [],
    '以下控制器使用了 @Public 但不在白名单中，请人工核实后加入 ALLOWED_PUBLIC：\n' + unexpected.join('\n'),
  )
})
