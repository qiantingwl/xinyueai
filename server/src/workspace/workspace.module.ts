import { Module } from '@nestjs/common'
import { WorkspaceController, AdminWorkspaceController } from './workspace.controller'
import { AssetsModule } from '../assets/assets.module'
import { CapabilityPresetsService } from './capability-presets.service'
import { OfficeExportService } from './office-export.service'
import { ProvidersModule } from '../providers/providers.module'
import { TeamService } from './team.service'
import { AuthModule } from '../auth/auth.module'
import { CreditsModule } from '../credits/credits.module'
import { WebSearchModule } from '../agent-tasks/web-search.module'

@Module({ imports: [AssetsModule, ProvidersModule, AuthModule, CreditsModule, WebSearchModule], controllers: [WorkspaceController, AdminWorkspaceController], providers: [CapabilityPresetsService, OfficeExportService, TeamService], exports: [OfficeExportService] })
export class WorkspaceModule {}
