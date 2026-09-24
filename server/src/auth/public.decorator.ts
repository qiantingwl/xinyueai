import { SetMetadata } from '@nestjs/common'

export const IS_PUBLIC_ROUTE_KEY = 'xinyue:is-public-route'

/**
 * 标记匿名可访问的控制器/路由。全局 AuthGuard（见 app.module.ts 的 APP_GUARD）
 * 命中该标记直接放行，行为等同迁移前「不挂守卫」。
 * 注意：方法/类上显式 @UseGuards(AuthGuard) 的路由不受影响，本地守卫照常执行。
 * 新增匿名接口必须显式使用本装饰器，禁止靠「忘写守卫」达成匿名——
 * tests/unit/route-guard-coverage.test.ts 会同时校验两个方向。
 */
export const Public = () => SetMetadata(IS_PUBLIC_ROUTE_KEY, true)
