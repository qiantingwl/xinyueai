import request from '@/utils/http'

/**
 * 登录
 * @param params 登录参数
 * @returns 登录响应
 */
export function fetchLogin(params: Api.Auth.LoginParams) {
  return request
    .post<{ user: XinyueAdminIdentity }>({
      url: '/v1/auth/admin/login',
      params
    })
    .then(() => ({ token: 'cookie-session', refreshToken: '' }))
}

/**
 * 获取用户信息
 * @returns 用户信息
 */
export function fetchGetUserInfo() {
  return request.get<XinyueAdminIdentity>({ url: '/v1/auth/me' }).then((user) => ({
    buttons: ['*'],
    roles: user.role === 'SUPER_ADMIN' ? ['R_SUPER', 'R_ADMIN'] : ['R_ADMIN'],
    userId: user.id,
    userName: user.displayName || user.email,
    email: user.email,
    avatar: user.avatarUrl || undefined
  }))
}

type XinyueAdminIdentity = {
  id: string
  email: string
  displayName: string
  role: 'ADMIN' | 'SUPER_ADMIN'
  avatarUrl?: string | null
}
