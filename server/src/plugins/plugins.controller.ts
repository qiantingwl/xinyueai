import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common'
import { PluginCapability } from '@prisma/client'
import type { FastifyRequest } from 'fastify'
import { AuthGuard } from '../auth/auth.guard'
import { AuthenticatedUser, CurrentUser } from '../common/request-user'
import { PrivatePluginDto } from './plugin.dto'
import { PluginsService } from './plugins.service'

@Controller('plugins')
@UseGuards(AuthGuard)
export class PluginsController {
  constructor(private readonly plugins: PluginsService) {}
  private capability(value?: string) {
    if (!value) return undefined
    if (!Object.values(PluginCapability).includes(value as PluginCapability)) throw new BadRequestException('插件能力类型无效')
    return value as PluginCapability
  }
  @Get('categories') categories() { return this.plugins.categories() }
  @Get('market') market(@CurrentUser() user: AuthenticatedUser, @Query('capability') capability?: string, @Query('category') category?: string, @Query('q') query?: string) { return this.plugins.market(user.id, this.capability(capability), category?.slice(0, 80), query?.trim().slice(0, 100)) }
  @Get('installed') installed(@CurrentUser() user: AuthenticatedUser) { return this.plugins.installed(user.id) }
  @Get('mine') mine(@CurrentUser() user: AuthenticatedUser) { return this.plugins.mine(user.id) }
  @Get('available') available(@CurrentUser() user: AuthenticatedUser, @Query('capability') capability?: string) { return this.plugins.available(user.id, this.capability(capability)) }
  @Post(':id/install') install(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.plugins.install(user.id, id) }
  @Delete(':id/install') uninstall(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.plugins.uninstall(user.id, id) }
  @Post('mine') create(@CurrentUser() user: AuthenticatedUser, @Body() body: PrivatePluginDto) { return this.plugins.createPrivate(user.id, body) }
  @Post('mine/import')
  async importSkill(@CurrentUser() user: AuthenticatedUser, @Req() request: FastifyRequest) {
    const part = await request.file()
    if (!part) throw new BadRequestException('请选择技能文件')
    const chunks: Buffer[] = []; let size = 0
    for await (const chunk of part.file) { size += chunk.length; if (size > 5 * 1024 * 1024) throw new BadRequestException('技能包大小必须在 5MB 以内'); chunks.push(Buffer.from(chunk)) }
    return this.plugins.importPrivate(user.id, part.filename, Buffer.concat(chunks))
  }
  @Patch('mine/:id') update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: PrivatePluginDto) { return this.plugins.updatePrivate(user.id, id, body) }
  @Delete('mine/:id') remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.plugins.deletePrivate(user.id, id) }
}
