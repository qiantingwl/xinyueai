import request from '@/utils/http'

/**
 * 登录
 * @param params 登录参数
 * @returns 登录响应
 */
export function fetchLogin(params: Api.Auth.LoginParams) {
  return request.post<{ user: XinyueAdminIdentity }>({
    url: '/v1/auth/admin/login',
    params
  })
}

export function toAdminUserInfo(user: XinyueAdminIdentity | null | undefined): Api.Auth.UserInfo {
  if (!user?.id || (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN')) {
    throw new Error('管理员会话无效')
  }
  return {
    buttons: ['*'],
    roles: user.role === 'SUPER_ADMIN' ? ['R_SUPER', 'R_ADMIN'] : ['R_ADMIN'],
    userId: user.id,
    userName: user.displayName || user.email || user.id,
    email: user.email || '',
    avatar: user.avatarUrl || undefined
  }
}

/**
 * 获取用户信息
 * @returns 用户信息
 */
export function fetchGetUserInfo() {
  return request.get<XinyueAdminIdentity>({ url: '/v1/auth/me' }).then(toAdminUserInfo)
}

type XinyueAdminIdentity = {
  id: string
  email?: string | null
  displayName?: string | null
  role: 'USER' | 'ADMIN' | 'SUPER_ADMIN'
  avatarUrl?: string | null
}
