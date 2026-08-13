import {
  Body,
  BadRequestException,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import { Prisma } from "@prisma/client";
import { AuthGuard } from "../auth/auth.guard";
import { AdminGuard } from "../admin/admin.guard";
import { CurrentUser, AuthenticatedUser } from "../common/request-user";
import { PrismaService } from "../prisma/prisma.service";
import { FastifyRequest } from "fastify";

const WORKFLOW_STATUSES = [
  "PLANNING",
  "IN_PROGRESS",
  "REVIEW",
  "COMPLETED",
  "ARCHIVED",
] as const;
const STEP_STATUSES = ["TODO", "IN_PROGRESS", "DONE"] as const;

class WorkflowStepDto {
  @IsString() @MinLength(1) @MaxLength(100) id!: string;
  @IsString() @Matches(/\S/) @MinLength(1) @MaxLength(120) title!: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsIn(STEP_STATUSES) status!: (typeof STEP_STATUSES)[number];
}

class WorkflowConfigDto {
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => WorkflowStepDto)
  steps!: WorkflowStepDto[];
  @IsOptional() @IsString() @MaxLength(10_000) defaultPrompt?: string;
  @IsOptional() @IsString() @MaxLength(10_000) outputRequirements?: string;
}

class ProjectDto {
  @IsString() @Matches(/\S/) @MinLength(1) @MaxLength(80) name!: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsString() @MaxLength(4000) instructions?: string;
  @IsOptional()
  @IsIn(WORKFLOW_STATUSES)
  workflowStatus?: (typeof WORKFLOW_STATUSES)[number];
  @IsOptional()
  @ValidateNested()
  @Type(() => WorkflowConfigDto)
  workflowConfig?: WorkflowConfigDto;
  @IsOptional() @IsString() @MaxLength(160) defaultModel?: string;
  @IsOptional() @IsString() @MaxLength(100) defaultAssistantId?: string | null;
}

class UpdateProjectDto extends ProjectDto {
  @IsOptional() declare name: string;
  @IsOptional() @IsBoolean() archived?: boolean;
  @IsOptional() @IsString() @MaxLength(500) changeSummary?: string;
  @IsOptional() @IsString() @MaxLength(80) versionLabel?: string;
}

class AdminCreateProjectDto extends ProjectDto {
  @IsString() @Matches(/\S/) @MinLength(1) @MaxLength(100) userId!: string;
}

class AdminUpdateProjectDto extends UpdateProjectDto {}

class WorkflowDto {
  @IsIn(WORKFLOW_STATUSES) workflowStatus!: (typeof WORKFLOW_STATUSES)[number];
  @ValidateNested()
  @Type(() => WorkflowConfigDto)
  workflowConfig!: WorkflowConfigDto;
  @IsOptional() @IsString() @MaxLength(160) defaultModel?: string;
  @IsOptional() @IsString() @MaxLength(100) defaultAssistantId?: string | null;
  @IsOptional() @IsString() @MaxLength(4000) instructions?: string;
  @IsOptional() @IsString() @MaxLength(500) changeSummary?: string;
  @IsOptional() @IsString() @MaxLength(80) versionLabel?: string;
}

class CreateVersionDto {
  @IsOptional() @IsString() @MaxLength(80) label?: string;
  @IsOptional() @IsString() @MaxLength(500) changeSummary?: string;
}

class ProjectMemberDto {
  @IsEmail() email!: string;
}

type ProjectSnapshotSource = {
  name: string;
  description: string;
  instructions: string;
  workflowStatus: string;
  workflowConfig: Prisma.JsonValue | null;
  defaultModel: string;
  defaultAssistantId: string | null;
  revision: number;
};

@Controller("projects")
@UseGuards(AuthGuard)
export class ProjectsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query("archived") archived?: string,
    @Query("q") query?: string,
  ) {
    const projects = await this.prisma.project.findMany({
      where: {
        OR: [{ userId: user.id }, { members: { some: { userId: user.id } } }],
        archivedAt: archived === "true" ? { not: null } : null,
        name: query ? { contains: query, mode: "insensitive" } : undefined,
      },
      orderBy: { updatedAt: "desc" },
      include: {
        user: { select: { id: true, displayName: true, email: true } },
        members: { where: { userId: user.id }, select: { userId: true } },
        conversations: { where: { userId: user.id, archivedAt: null }, select: { id: true } },
        assets: { where: { userId: user.id, deletedAt: null }, select: { id: true } },
        _count: {
          select: { assets: true, conversations: true, versions: true },
        },
      },
    });
    return projects.map(({ conversations, assets, ...project }) => {
      const accessRole = project.userId === user.id ? "OWNER" : "MEMBER";
      return {
        ...project,
        accessRole,
        _count: accessRole === "OWNER" ? project._count : { ...project._count, conversations: conversations.length, assets: assets.length },
      };
    });
  }

  @Post()
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: ProjectDto,
  ) {
    await this.assertAssistant(body.defaultAssistantId);
    return this.prisma.$transaction(async (tx) => {
      const project = await tx.project.create({
        data: {
          userId: user.id,
          name: body.name.trim(),
          description: body.description?.trim() || "",
          instructions: body.instructions?.trim() || "",
          workflowStatus: body.workflowStatus || "PLANNING",
          workflowConfig: this.workflowConfig(body.workflowConfig),
          defaultModel: body.defaultModel?.trim() || "",
          defaultAssistantId: body.defaultAssistantId || null,
        },
      });
      await tx.projectVersion.create({
        data: {
          projectId: project.id,
          version: 1,
          label: "初始版本",
          changeSummary: "创建项目",
          snapshot: this.snapshot(project),
        },
      });
      return project;
    });
  }

  @Get(":id")
  async get(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    const project = await this.prisma.project.findFirst({
      where: { id, OR: [{ userId: user.id }, { members: { some: { userId: user.id } } }] },
      include: {
        assets: {
          where: { deletedAt: null },
          orderBy: { createdAt: "desc" },
          take: 30,
        },
        conversations: {
          where: { archivedAt: null },
          orderBy: { updatedAt: "desc" },
          take: 30,
          include: { user: { select: { id: true, displayName: true, email: true } }, messages: { where: { role: "USER", deletedAt: { not: null } }, select: { id: true } } },
        },
        user: { select: { id: true, displayName: true, email: true } },
        members: { include: { user: { select: { id: true, displayName: true, email: true, avatarUrl: true } } }, orderBy: { joinedAt: "asc" } },
        defaultAssistant: {
          select: {
            id: true,
            name: true,
            description: true,
            defaultModel: true,
          },
        },
        _count: { select: { assets: { where: { deletedAt: null } }, conversations: { where: { archivedAt: null } }, versions: true } },
      },
    });
    if (!project) throw new NotFoundException("项目不存在");
    const isOwner = project.userId === user.id;
    const visibleConversations = isOwner ? project.conversations : project.conversations.filter((conversation) => conversation.userId === user.id);
    const visibleAssets = project.assets.filter((asset) => asset.userId === user.id);
    return {
      ...project,
      accessRole: isOwner ? "OWNER" : "MEMBER",
      conversations: visibleConversations.map((conversation) => ({ ...conversation, deletedMessageCount: conversation.messages.length, messages: undefined })),
      assets: visibleAssets.map((asset) => ({
        ...asset,
        size: Number(asset.size),
        contentUrl: `/v1/assets/${asset.id}/content`,
      })),
      _count: {
        ...project._count,
        assets: visibleAssets.length,
        conversations: visibleConversations.length,
      },
    };
  }

  @Post(":id/members")
  async addMember(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() body: ProjectMemberDto) {
    const project = await this.findOwnedProject(user.id, id);
    const member = await this.prisma.user.findUnique({ where: { email: body.email.trim().toLowerCase() }, select: { id: true, email: true, displayName: true, avatarUrl: true } });
    if (!member) throw new NotFoundException("该邮箱尚未注册");
    if (member.id === project.userId) throw new BadRequestException("项目创建者无需重复加入");
    return this.prisma.projectMember.upsert({
      where: { projectId_userId: { projectId: id, userId: member.id } },
      update: {},
      create: { projectId: id, userId: member.id },
      include: { user: { select: { id: true, email: true, displayName: true, avatarUrl: true } } },
    });
  }

  @Delete(":id/members/:userId")
  async removeMember(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Param("userId") userId: string) {
    await this.findOwnedProject(user.id, id);
    const result = await this.prisma.projectMember.deleteMany({ where: { projectId: id, userId } });
    if (!result.count) throw new NotFoundException("项目成员不存在");
    return { removed: true };
  }

  @Patch(":id")
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() body: UpdateProjectDto,
  ) {
    const current = await this.findOwnedProject(user.id, id);
    await this.assertAssistant(body.defaultAssistantId);
    const { archived, changeSummary, versionLabel, workflowConfig, ...fields } =
      body;
    return this.prisma.$transaction(async (tx) => {
      const project = await tx.project.update({
        where: { id },
        data: {
          ...fields,
          name: fields.name?.trim(),
          description: fields.description?.trim(),
          instructions: fields.instructions?.trim(),
          defaultModel: fields.defaultModel?.trim(),
          defaultAssistantId:
            fields.defaultAssistantId === undefined
              ? undefined
              : fields.defaultAssistantId || null,
          workflowConfig:
            workflowConfig === undefined
              ? undefined
              : this.workflowConfig(workflowConfig),
          archivedAt:
            archived === undefined ? undefined : archived ? new Date() : null,
          revision: { increment: 1 },
        },
      });
      await tx.projectVersion.create({
        data: {
          projectId: id,
          version: project.revision,
          label: versionLabel?.trim() || `版本 ${project.revision}`,
          changeSummary:
            changeSummary?.trim() || this.changeSummary(current, project),
          snapshot: this.snapshot(project),
        },
      });
      return project;
    });
  }

  @Get(":id/workflow")
  async workflow(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
  ) {
    const project = await this.findOwnedProject(user.id, id);
    return { ...project, ...this.workflowResponse(project) };
  }

  @Patch(":id/workflow")
  async updateWorkflow(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() body: WorkflowDto,
  ) {
    const current = await this.findOwnedProject(user.id, id);
    await this.assertAssistant(body.defaultAssistantId);
    const project = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.project.update({
        where: { id },
        data: {
          workflowStatus: body.workflowStatus,
          workflowConfig: this.workflowConfig(body.workflowConfig),
          defaultModel: body.defaultModel?.trim() || "",
          defaultAssistantId: body.defaultAssistantId || null,
          instructions: body.instructions?.trim() || "",
          revision: { increment: 1 },
        },
      });
      await tx.projectVersion.create({
        data: {
          projectId: id,
          version: updated.revision,
          label: body.versionLabel?.trim() || `版本 ${updated.revision}`,
          changeSummary:
            body.changeSummary?.trim() || this.changeSummary(current, updated),
          snapshot: this.snapshot(updated),
        },
      });
      return updated;
    });
    return { ...project, ...this.workflowResponse(project) };
  }

  @Get(":id/versions")
  async versions(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
  ) {
    await this.findOwnedProject(user.id, id);
    return this.prisma.projectVersion.findMany({
      where: { projectId: id },
      orderBy: { version: "desc" },
      take: 100,
    });
  }

  @Post(":id/versions")
  async createVersion(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() body: CreateVersionDto,
  ) {
    const current = await this.findOwnedProject(user.id, id);
    return this.prisma.$transaction(async (tx) => {
      const project = await tx.project.update({
        where: { id },
        data: { revision: { increment: 1 } },
      });
      return tx.projectVersion.create({
        data: {
          projectId: id,
          version: project.revision,
          label: body.label?.trim() || `版本 ${project.revision}`,
          changeSummary:
            body.changeSummary?.trim() ||
            `基于版本 ${current.revision} 创建检查点`,
          snapshot: this.snapshot(project),
        },
      });
    });
  }

  @Post(":id/versions/:version/restore")
  async restoreVersion(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Param("version") versionParam: string,
  ) {
    const current = await this.findOwnedProject(user.id, id);
    const version = Number.parseInt(versionParam, 10);
    const source = Number.isInteger(version)
      ? await this.prisma.projectVersion.findFirst({
          where: { projectId: id, version },
        })
      : null;
    if (!source) throw new NotFoundException("项目版本不存在");
    const snapshot = source.snapshot as unknown as ProjectSnapshotSource;
    await this.assertAssistant(snapshot.defaultAssistantId);
    return this.prisma.$transaction(async (tx) => {
      const project = await tx.project.update({
        where: { id },
        data: {
          name: snapshot.name,
          description: snapshot.description,
          instructions: snapshot.instructions,
          workflowStatus: WORKFLOW_STATUSES.includes(
            snapshot.workflowStatus as (typeof WORKFLOW_STATUSES)[number],
          )
            ? snapshot.workflowStatus
            : "PLANNING",
          workflowConfig: (snapshot.workflowConfig ||
            this.workflowConfig()) as Prisma.InputJsonValue,
          defaultModel: snapshot.defaultModel || "",
          defaultAssistantId: snapshot.defaultAssistantId || null,
          revision: { increment: 1 },
        },
      });
      await tx.projectVersion.create({
        data: {
          projectId: id,
          version: project.revision,
          label: `恢复自版本 ${version}`,
          changeSummary: `从版本 ${current.revision} 恢复到版本 ${version} 的内容`,
          snapshot: this.snapshot(project),
        },
      });
      return project;
    });
  }

  @Delete(":id")
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
  ) {
    const result = await this.prisma.project.deleteMany({
      where: { id, userId: user.id },
    });
    if (!result.count) throw new NotFoundException("项目不存在");
    return { deleted: true };
  }

  private async findOwnedProject(userId: string, id: string) {
    const project = await this.prisma.project.findFirst({
      where: { id, userId },
    });
    if (!project) throw new NotFoundException("项目不存在");
    return project;
  }

  private async assertAssistant(id?: string | null) {
    if (!id) return;
    const assistant = await this.prisma.assistant.findFirst({
      where: { id, enabled: true, visibility: "PUBLIC" },
      select: { id: true },
    });
    if (!assistant) throw new NotFoundException("默认助手不存在或未发布");
  }

  private workflowConfig(config?: WorkflowConfigDto): Prisma.InputJsonValue {
    return {
      steps: (config?.steps || []).map((step, index) => ({
        id: step.id,
        title: step.title.trim(),
        description: step.description?.trim() || "",
        status: step.status,
        sortOrder: index,
      })),
      defaultPrompt: config?.defaultPrompt?.trim() || "",
      outputRequirements: config?.outputRequirements?.trim() || "",
    };
  }

  private snapshot(project: ProjectSnapshotSource): Prisma.InputJsonValue {
    return {
      name: project.name,
      description: project.description,
      instructions: project.instructions,
      workflowStatus: project.workflowStatus,
      workflowConfig: project.workflowConfig || this.workflowConfig(),
      defaultModel: project.defaultModel,
      defaultAssistantId: project.defaultAssistantId,
      revision: project.revision,
    } as Prisma.InputJsonObject;
  }

  private workflowResponse(project: ProjectSnapshotSource) {
    return {
      workflowStatus: project.workflowStatus,
      workflowConfig: project.workflowConfig || this.workflowConfig(),
      defaultModel: project.defaultModel,
      defaultAssistantId: project.defaultAssistantId,
      instructions: project.instructions,
      revision: project.revision,
    };
  }

  private changeSummary(
    before: ProjectSnapshotSource,
    after: ProjectSnapshotSource,
  ) {
    const changed: string[] = [];
    if (before.name !== after.name || before.description !== after.description)
      changed.push("项目信息");
    if (before.instructions !== after.instructions) changed.push("项目指令");
    if (
      before.workflowStatus !== after.workflowStatus ||
      JSON.stringify(before.workflowConfig) !==
        JSON.stringify(after.workflowConfig)
    )
      changed.push("工作流");
    if (
      before.defaultModel !== after.defaultModel ||
      before.defaultAssistantId !== after.defaultAssistantId
    )
      changed.push("默认执行配置");
    return changed.length ? `更新${changed.join("、")}` : "保存项目设置";
  }
}

@Controller("admin/projects")
@UseGuards(AuthGuard, AdminGuard)
export class AdminProjectsController {
  constructor(private readonly prisma: PrismaService) {}

  @Post()
  async create(
    @CurrentUser() admin: AuthenticatedUser,
    @Req() request: FastifyRequest,
    @Body() body: AdminCreateProjectDto,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: body.userId },
      select: { id: true, role: true },
    });
    if (!user || user.role !== "USER")
      throw new NotFoundException("所属用户不存在");
    await this.assertAssistant(body.defaultAssistantId);
    const project = await this.prisma.$transaction(async (tx) => {
      const created = await tx.project.create({
        data: {
          userId: body.userId,
          name: body.name.trim(),
          description: body.description?.trim() || "",
          instructions: body.instructions?.trim() || "",
          workflowStatus: body.workflowStatus || "PLANNING",
          workflowConfig: this.workflowConfig(body.workflowConfig),
          defaultModel: body.defaultModel?.trim() || "",
          defaultAssistantId: body.defaultAssistantId || null,
        },
      });
      await tx.projectVersion.create({
        data: {
          projectId: created.id,
          version: 1,
          label: "初始版本",
          changeSummary: "管理员创建项目",
          snapshot: this.snapshot(created),
        },
      });
      return created;
    });
    await this.audit(
      admin.id,
      request,
      "project.create",
      project.id,
      undefined,
      project,
    );
    return project;
  }

  @Patch(":id")
  async update(
    @CurrentUser() admin: AuthenticatedUser,
    @Req() request: FastifyRequest,
    @Param("id") id: string,
    @Body() body: AdminUpdateProjectDto,
  ) {
    const current = await this.prisma.project.findUnique({ where: { id } });
    if (!current) throw new NotFoundException("项目不存在");
    await this.assertAssistant(body.defaultAssistantId);
    const { archived, changeSummary, versionLabel, workflowConfig, ...fields } =
      body;
    const project = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.project.update({
        where: { id },
        data: {
          ...fields,
          name: fields.name?.trim(),
          description: fields.description?.trim(),
          instructions: fields.instructions?.trim(),
          defaultModel: fields.defaultModel?.trim(),
          defaultAssistantId:
            fields.defaultAssistantId === undefined
              ? undefined
              : fields.defaultAssistantId || null,
          workflowConfig:
            workflowConfig === undefined
              ? undefined
              : this.workflowConfig(workflowConfig),
          archivedAt:
            archived === undefined ? undefined : archived ? new Date() : null,
          revision: { increment: 1 },
        },
      });
      await tx.projectVersion.create({
        data: {
          projectId: id,
          version: updated.revision,
          label: versionLabel?.trim() || `版本 ${updated.revision}`,
          changeSummary:
            changeSummary?.trim() || this.changeSummary(current, updated),
          snapshot: this.snapshot(updated),
        },
      });
      return updated;
    });
    await this.audit(admin.id, request, "project.update", id, current, project);
    return project;
  }

  @Delete(":id")
  async remove(
    @CurrentUser() admin: AuthenticatedUser,
    @Req() request: FastifyRequest,
    @Param("id") id: string,
  ) {
    const current = await this.prisma.project.findUnique({ where: { id } });
    if (!current) throw new NotFoundException("项目不存在");

    // ProjectVersion cascades with the project; conversations, assets, and jobs
    // keep their user-owned records and simply lose the project association.
    await this.prisma.project.delete({ where: { id } });
    await this.audit(admin.id, request, "project.delete", id, current);
    return { id, deleted: true };
  }

  @Get()
  list(
    @Query("q") query?: string,
    @Query("status") status?: string,
    @Query("archived") archived?: string,
  ) {
    const workflowStatus = WORKFLOW_STATUSES.includes(
      status as (typeof WORKFLOW_STATUSES)[number],
    )
      ? status
      : undefined;
    return this.prisma.project.findMany({
      where: {
        workflowStatus,
        archivedAt:
          archived === "true"
            ? { not: null }
            : archived === "false"
              ? null
              : undefined,
        ...(query
          ? {
              OR: [
                { name: { contains: query, mode: "insensitive" as const } },
                {
                  user: {
                    is: {
                      OR: [
                        {
                          displayName: {
                            contains: query,
                            mode: "insensitive" as const,
                          },
                        },
                        {
                          email: {
                            contains: query,
                            mode: "insensitive" as const,
                          },
                        },
                      ],
                    },
                  },
                },
              ],
            }
          : {}),
      },
      orderBy: { updatedAt: "desc" },
      take: 300,
      include: {
        user: {
          select: { id: true, displayName: true, email: true, status: true },
        },
        defaultAssistant: { select: { id: true, name: true } },
        _count: {
          select: {
            assets: true,
            conversations: true,
            jobs: true,
            versions: true,
          },
        },
      },
    });
  }

  @Get(":id")
  async detail(@Param("id") id: string) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            email: true,
            status: true,
            createdAt: true,
          },
        },
        defaultAssistant: {
          select: { id: true, name: true, description: true },
        },
        versions: { orderBy: { version: "desc" }, take: 100 },
        _count: {
          select: {
            assets: true,
            conversations: true,
            jobs: true,
            versions: true,
          },
        },
      },
    });
    if (!project) throw new NotFoundException("项目不存在");
    return project;
  }

  private async assertAssistant(id?: string | null) {
    if (!id) return;
    const assistant = await this.prisma.assistant.findFirst({
      where: { id, enabled: true, visibility: "PUBLIC" },
      select: { id: true },
    });
    if (!assistant) throw new NotFoundException("默认助手不存在或未发布");
  }

  private workflowConfig(config?: WorkflowConfigDto): Prisma.InputJsonValue {
    return {
      steps: (config?.steps || []).map((step, index) => ({
        id: step.id,
        title: step.title.trim(),
        description: step.description?.trim() || "",
        status: step.status,
        sortOrder: index,
      })),
      defaultPrompt: config?.defaultPrompt?.trim() || "",
      outputRequirements: config?.outputRequirements?.trim() || "",
    };
  }

  private snapshot(project: ProjectSnapshotSource): Prisma.InputJsonValue {
    return {
      name: project.name,
      description: project.description,
      instructions: project.instructions,
      workflowStatus: project.workflowStatus,
      workflowConfig: project.workflowConfig || this.workflowConfig(),
      defaultModel: project.defaultModel,
      defaultAssistantId: project.defaultAssistantId,
      revision: project.revision,
    } as Prisma.InputJsonObject;
  }

  private changeSummary(
    before: ProjectSnapshotSource,
    after: ProjectSnapshotSource,
  ) {
    const changed: string[] = [];
    if (before.name !== after.name || before.description !== after.description)
      changed.push("项目信息");
    if (before.instructions !== after.instructions) changed.push("项目指令");
    if (
      before.workflowStatus !== after.workflowStatus ||
      JSON.stringify(before.workflowConfig) !==
        JSON.stringify(after.workflowConfig)
    )
      changed.push("工作流");
    if (
      before.defaultModel !== after.defaultModel ||
      before.defaultAssistantId !== after.defaultAssistantId
    )
      changed.push("默认执行配置");
    return changed.length ? `更新${changed.join("、")}` : "保存项目设置";
  }

  private audit(
    actorId: string,
    request: FastifyRequest,
    action: string,
    targetId: string,
    before?: unknown,
    after?: unknown,
  ) {
    return this.prisma.auditLog.create({
      data: {
        actorId,
        action,
        targetType: "project",
        targetId,
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"],
        ...(before == null ? {} : { before: before as Prisma.InputJsonValue }),
        ...(after == null ? {} : { after: after as Prisma.InputJsonValue }),
      },
    });
  }
}
