import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common'
import { AdminGuard } from '../admin/admin.guard'
import { AuthGuard } from '../auth/auth.guard'
import { AdminPluginDto, PluginCategoryDto } from './plugin.dto'
import { PluginsService } from './plugins.service'

@Controller('admin')
@UseGuards(AuthGuard, AdminGuard)
export class AdminPluginsController {
  constructor(private readonly plugins: PluginsService) {}
  @Get('plugins') list() { return this.plugins.adminList() }
  @Get('plugins/stats') stats() { return this.plugins.stats() }
  @Post('plugins/restore-defaults') restoreDefaults() { return this.plugins.restoreDefaults() }
  @Post('plugins') create(@Body() body: AdminPluginDto) { return this.plugins.createOfficial(body) }
  @Patch('plugins/:id') update(@Param('id') id: string, @Body() body: AdminPluginDto) { return this.plugins.updateOfficial(id, body) }
  @Delete('plugins/:id') remove(@Param('id') id: string) { return this.plugins.deleteOfficial(id) }
  @Get('plugin-categories') categories() { return this.plugins.categories(false) }
  @Post('plugin-categories') createCategory(@Body() body: PluginCategoryDto) { return this.plugins.createCategory(body) }
  @Patch('plugin-categories/:id') updateCategory(@Param('id') id: string, @Body() body: PluginCategoryDto) { return this.plugins.updateCategory(id, body) }
  @Delete('plugin-categories/:id') removeCategory(@Param('id') id: string) { return this.plugins.deleteCategory(id) }
}
