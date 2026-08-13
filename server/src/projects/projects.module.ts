import { Module } from "@nestjs/common";
import {
  AdminProjectsController,
  ProjectsController,
} from "./projects.controller";
import { ProvidersModule } from "../providers/providers.module";
import { ProjectSkillsController } from "./project-skills.controller";
import { ProjectSkillsService } from "./project-skills.service";

@Module({
  imports: [ProvidersModule],
  controllers: [ProjectsController, ProjectSkillsController, AdminProjectsController],
  providers: [ProjectSkillsService],
})
export class ProjectsModule {}
