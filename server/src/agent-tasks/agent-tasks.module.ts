import { BullModule } from '@nestjs/bullmq'
import { Module } from '@nestjs/common'
import { GenerationsModule } from '../generations/generations.module'
import { AgentTasksController } from './agent-tasks.controller'
import { AgentTasksProcessor } from './agent-tasks.processor'
import { AgentTasksService } from './agent-tasks.service'
import { AgentModelService } from './agent-model.service'
import { AgentToolsService } from './agent-tools.service'
import { AgentSchedulesService } from './agent-schedules.service'
import { AdminAgentTasksController } from './admin-agent-tasks.controller'
import { AdminGuard } from '../admin/admin.guard'
import { ProvidersModule } from '../providers/providers.module'
import { AdminWebSearchController } from './admin-web-search.controller'
import { WebSearchModule } from './web-search.module'
import { PublicRecommendationsController } from './public-recommendations.controller'

@Module({
  imports: [BullModule.registerQueue({ name: 'agent-task' }), GenerationsModule, ProvidersModule, WebSearchModule],
  controllers: [AgentTasksController, AdminAgentTasksController, AdminWebSearchController, PublicRecommendationsController],
  providers: [AgentTasksService, AgentSchedulesService, AgentTasksProcessor, AgentModelService, AgentToolsService, AdminGuard],
  exports: [AgentToolsService],
})
export class AgentTasksModule {}
