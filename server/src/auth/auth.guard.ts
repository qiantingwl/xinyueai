import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { createHash } from 'node:crypto'
import { IS_PUBLIC_ROUTE_KEY } from './public.decorator'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService, private readonly reflector: Reflector) {}
  async canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_ROUTE_KEY, [context.getHandler(), context.getClass()])
    if (isPublic) return true
    const request = context.switchToHttp().getRequest()
    const token = request.cookies?.flux_session as string | undefined
    if (!token) throw new UnauthorizedException('请先登录')
    const tokenHash = createHash('sha256').update(token).digest('hex')
    const session = await this.prisma.session.findFirst({ where: { tokenHash, revokedAt: null, expiresAt: { gt: new Date() } }, include: { user: true } })
    if (!session || session.user.status !== 'ACTIVE') throw new UnauthorizedException('登录状态已失效')
    request.user = { id: session.user.id, email: session.user.email, username: session.user.username, displayName: session.user.displayName, authMethod: session.authMethod, role: session.user.role, adminRoleId: session.user.adminRoleId }
    request.sessionId = session.id
    return true
  }
}
