# Xinyue AI Server

Xinyue AI 的 NestJS API、BullMQ 任务处理与业务服务。产品说明见 [README](../README.md)，系统原理见 [ARCHITECTURE](../docs/ARCHITECTURE.md)，部署见 [DEPLOYMENT](../docs/DEPLOYMENT.md)。

## 技术栈

- NestJS 11 + Fastify，全局前缀 `/v1`，默认端口 3100
- Prisma + PostgreSQL 17；Redis 7 + BullMQ；LangGraph.js
- HttpOnly Cookie 会话、全局默认拒绝的 `AuthGuard`、管理员 RBAC
- 本地磁盘或 S3 兼容对象存储
- SSE：对话增量流与生成任务快照流

## 本地开发

在仓库根目录执行：

```bash
npm ci
npm --prefix server ci
docker compose up -d
npm run setup:dev      # 生成 server/.env（随机密钥）、Prisma Client，并执行迁移
npm run server:dev     # 或 npm run dev，同时启动用户端
```

`setup:dev` 不会创建管理员。首次打开用户端 `/install`，用 `server/.env` 中的 `INSTALL_TOKEN` 创建管理员。本地测试也可以在 `server/.env` 填写 `ADMIN_EMAIL` 与 `ADMIN_PASSWORD`，然后执行：

```bash
npm --prefix server run admin:seed             # 幂等创建管理员
npm --prefix server run admin:reset-password   # 重置密码
```

启动后 API 会幂等补齐内置助手、工具、技能分类与预装技能（`CapabilityPresetsService`），不会覆盖已存在的记录。

没有健康的模型渠道时，API 会明确返回不可用错误，不会伪造回复。

## 目录

| 目录 | 内容 |
| --- | --- |
| `src/auth` | 安装向导、注册登录、OAuth、会话、`@Public()` 与守卫 |
| `src/generations` | 生成任务创建、队列处理、租约、Runner、结算与 SSE |
| `src/providers` | 渠道、模型目录、路由、健康、凭据加密、模型发现 |
| `src/billing`、`src/credits` | 价格快照、Token 额度、创作点与流水 |
| `src/plugins` | 技能、分类、安装、预装、外部技能市场 |
| `src/workspace` | 助手、工具、知识库、团队、能力预设 |
| `src/agent-tasks` | Agent 编排、定时任务、工具审批 |
| `src/assets`、`src/exports` | 上传、对象存储、存储迁移、导出 |
| `src/conversations`、`src/canvases`、`src/projects` | 对话、画布、项目 |
| `src/prompt-templates`、`src/inspirations`、`src/works` | 提示词库、灵感、作品 |
| `src/subscriptions`、`src/payments`、`src/commerce`、`src/commercial` | 套餐、支付、优惠、账户生命周期 |
| `src/admin`、`src/alerts`、`src/notifications`、`src/moderation`、`src/support` | 管理与运营 |
| `src/common` | 出站请求与 SSRF 策略、侧栏导航解析、通用工具 |
| `prisma/` | `schema.prisma` 与迁移 |
| `prompt-library-data/` | 随版本发布的提示词快照 |
| `scripts/` | `start-production.cjs`、管理员初始化与重置、`test-plugin-flow.cjs` |

## 常用命令

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | `nest start --watch` |
| `npm run build` / `start` | 构建到 `dist/` / 运行 `dist/main.js` |
| `npm run prisma:generate` | 生成 Prisma Client |
| `npm run prisma:migrate` | 开发期创建迁移 |
| `npm run prisma:deploy` | 执行已发布迁移 |
| `npm run plugin:test` | 对运行中的 API 自测技能与插件链路 |

修改 `prisma/schema.prisma` 必须附带迁移；新增匿名接口需要 `@Public()`，并把 Controller 加入 `tests/unit/route-guard-coverage.test.ts` 的白名单。更多约定见 [DEVELOPMENT](../docs/DEVELOPMENT.md#8-开发约定)。

## 生产

生产容器通过 `scripts/start-production.cjs` 先执行 `prisma migrate deploy` 再启动 API。生产环境拒绝空值、示例值和低强度的 `SESSION_SECRET`、`CREDENTIAL_ENCRYPTION_KEY`、`INSTALL_TOKEN` 等关键配置。上传文件保存在 `UPLOAD_DIR` 或私有 S3 Bucket，只能通过带权限校验的 API 读取。
