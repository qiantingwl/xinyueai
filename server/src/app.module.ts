import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { BullModule } from '@nestjs/bullmq'
import { ThrottlerModule } from '@nestjs/throttler'
import { ThrottlerGuard } from '@nestjs/throttler'
import { AuthGuard } from './auth/auth.guard'
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core'
import { validateEnv } from './config/env'
import { PrismaModule } from './prisma/prisma.module'
import { AuthModule } from './auth/auth.module'
import { UsersModule } from './users/users.module'
import { CreditsModule } from './credits/credits.module'
import { ProjectsModule } from './projects/projects.module'
import { AssetsModule } from './assets/assets.module'
import { ConversationsModule } from './conversations/conversations.module'
import { GenerationsModule } from './generations/generations.module'
import { AdminModule } from './admin/admin.module'
import { EngagementModule } from './engagement/engagement.module'
import { HealthController } from './health.controller'
import { InspirationsModule } from './inspirations/inspirations.module'
import { ProvidersModule } from './providers/providers.module'
import { SubscriptionsModule } from './subscriptions/subscriptions.module'
import { PaymentsModule } from './payments/payments.module'
import { ModerationModule } from './moderation/moderation.module'
import { SupportModule } from './support/support.module'
import { AlertsModule } from './alerts/alerts.module'
import { PromptTemplatesModule } from './prompt-templates/prompt-templates.module'
import { WorkspaceModule } from './workspace/workspace.module'
import { ContentModule } from './content/content.module'
import { PluginsModule } from './plugins/plugins.module'
import { AgentTasksModule } from './agent-tasks/agent-tasks.module'
import { ResourceAccessModule } from './common/resource-access.module'
import { CommercialModule } from './commercial/commercial.module'
import { WorksModule } from './works/works.module'
import { CanvasesModule } from './canvases/canvases.module'
import { RequestContextInterceptor } from './common/request-context'
import { FeatureFlagsModule } from './features/feature-flags.module'
import { ExportsModule } from './exports/exports.module'
import { RuntimeMetricsService } from './common/runtime-metrics.service'
import { ReadinessService } from './common/readiness.service'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: Number(process.env.GLOBAL_RATE_LIMIT || 600) }],
      errorMessage: (context) => context.getHandler().name === 'adminLogin'
        ? '登录尝试过于频繁，请稍后再试'
        : '请求过于频繁，请稍后再试',
    }),
    BullModule.forRoot({ connection: { url: process.env.REDIS_URL || 'redis://localhost:6379' } }),
    BullModule.registerQueue({ name: 'generation' }),
    PrismaModule,
    ResourceAccessModule,
    AuthModule,
    UsersModule,
    CreditsModule,
    ProjectsModule,
    AssetsModule,
    ConversationsModule,
    GenerationsModule,
    EngagementModule,
    AdminModule,
    InspirationsModule,
    ProvidersModule,
    SubscriptionsModule,
    PaymentsModule,
    ModerationModule,
    SupportModule,
    AlertsModule,
    PromptTemplatesModule,
    WorkspaceModule,
    ContentModule,
    PluginsModule,
    AgentTasksModule,
    CommercialModule,
    WorksModule,
    CanvasesModule,
    FeatureFlagsModule,
    ExportsModule,
  ],
  controllers: [HealthController],
  providers: [
    RuntimeMetricsService,
    ReadinessService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // 全局鉴权：匿名面必须显式 @Public()（auth/public.decorator.ts），默认拒绝
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_INTERCEPTOR, useClass: RequestContextInterceptor },
  ],
})
export class AppModule {}
