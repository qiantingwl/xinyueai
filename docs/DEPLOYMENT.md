# Xinyue AI 部署与运维指南

本文只维护可直接执行的部署和运维步骤；产品功能以当前版本代码和数据库迁移为准。

本文覆盖 Docker Compose 生产部署、首次安装、升级、备份恢复、健康检查和手工 Node.js 部署。

## 1. 生产架构

| 服务 | 作用 | 默认暴露 |
| --- | --- | --- |
| `frontend` | Nginx、用户端和管理端静态文件、API 反向代理 | 默认绑定 `0.0.0.0:8080`，是唯一宿主机 Web 入口（可通过 `XINYUE_HTTP_BIND`/`XINYUE_HTTP_PORT` 修改） |
| `backend` | NestJS API、BullMQ Worker、迁移和幂等初始化 | 容器 `3100` |
| `postgres` | 主业务数据库 | 仅 Compose 内网 |
| `redis` | 队列、缓存和任务状态 | 仅 Compose 内网 |

Nginx 路由：用户端位于 `/`，管理端位于 `/admin/`，API 位于 `/v1/`。上传上限为 55 MB，流式 API 已关闭代理缓冲。

## 2. Docker Compose 部署

### 2.1 环境要求

- 2 核 CPU、4 GB 内存起步；生成任务多时建议 4 核 8 GB
- 40 GB 以上可用磁盘
- Docker Engine 24+ 和 Docker Compose v2+
- Docker Engine 允许宿主机暴露一个 Web 端口；域名、HTTPS 和额外反向代理均为可选的后续配置

### 2.2 创建生产配置

```powershell
Copy-Item .env.production.example .env.production
```

必须修改 `.env.production` 中的 `POSTGRES_PASSWORD`、`SESSION_SECRET`、`CREDENTIAL_ENCRYPTION_KEY`、`INSTALL_TOKEN` 和 `LOCAL_WORKER_TOKEN`，所有系统令牌均不得少于 32 位且不能使用占位值。`INSTALL_TOKEN` 只用于授权首次管理员创建，不能放入 URL、日志或工单。管理员账号通过首次访问 `/install` 页面创建，生产启动不会回退到固定管理员密码。

一键安装默认把唯一的 Frontend/Nginx Web 入口绑定到 `0.0.0.0`，安装完成后可直接访问终端输出的 `http://服务器IP:实际端口/`，并通过 `/install` 创建首次管理员。安装脚本在首次生成配置时从 `8080` 开始检测；若端口已占用，会递增选择可用端口并写回 `XINYUE_HTTP_PORT`。已有 `.env.production` 或显式设置的 `XINYUE_HTTP_PORT` 不会被静默替换，冲突时安装会退出并提示用户选择端口。

Backend `3100`、PostgreSQL `5432` 和 Redis `6379` 只在 Compose 网络内开放，绝不映射到宿主机。手工部署可以设置 `XINYUE_HTTP_BIND=127.0.0.1`，仅供本机访问或由外部反向代理转发。

重要：Compose 的 `--env-file` 用于解析 `${POSTGRES_PASSWORD}`，而 `backend.env_file` 仍读取根目录的 `.env.production`。两者都需要，因此后续命令始终保留 `--env-file .env.production`。

### 2.3 启动

```powershell
docker compose --env-file .env.production -f docker-compose.prod.yml config
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
docker compose --env-file .env.production -f docker-compose.prod.yml ps
docker compose --env-file .env.production -f docker-compose.prod.yml logs -f backend
```

后端每次启动都会先执行 `prisma migrate deploy`，然后幂等初始化全局设置和默认用户组；完成后才启动 API。管理员通过 `/install` 页面使用安装令牌创建，重复启动不会创建重复管理员或重复用户组。

### 2.4 首次初始化

1. 查看 `backend` 日志，确认所有迁移完成并出现 API 启动成功日志。
2. 仅在服务器本机从权限受控的 `.env.production` 读取 `INSTALL_TOKEN`；安装脚本不会把它输出到终端或日志，也不要通过 URL、聊天工具或工单传递。
3. 打开 `/install`，填写安装令牌、管理员邮箱和至少 8 位密码并提交。
4. 创建成功后进入 `/admin/`，确认管理员信息、会话安全和权限边界。
5. 在管理端完成站点、邮件、支付、模型渠道、搜索和内容配置。

数据库密码包含 `@`、`:`、`/`、`#` 等字符时，需要先在 `DATABASE_URL` 中进行 URL 编码。安装页面不会返回或修改服务器配置；缺少正确安装令牌时，创建管理员请求会被拒绝。

两个外部内容开关在代码中默认关闭，示例配置中的取值如下：

```dotenv
PROMPT_LIBRARY_EXTERNAL_SYNC_ENABLED=false   # 外部提示词同步，启动时不访问第三方站点
EXTERNAL_SKILL_MARKET_ENABLED=true           # 能力中心「外部市场」只读发现第三方 Skill
```

外部 Skill 市场只负责搜索和展示条目，用户安装时服务端才下载内容，并以未审核风险入库。安全扫描只检查格式、脚本和危险命令，不构成许可证授权或商业使用确认；不希望用户接触第三方 Skill 的部署应改为 `false`。开启外部提示词同步前，部署所有者需逐项核验来源许可证与商业使用条件。Prompt 渠道也可由管理员在后台逐个审核并启用；明确关闭的渠道不会被环境变量强制打开。

从旧版本升级时，历史上已标记为启用、但没有审核时间戳的外部 Prompt 渠道会保持停用。管理员完成核验后，可在来源管理中逐个重新启用；内部公开作品来源不受影响。

### 2.5 可选 HTTPS、域名和反向代理

一键部署不要求域名、HTTPS、Cloudflare 或额外 Nginx；用户可直接通过服务器 IP 和安装器输出的端口使用服务。面向公网的长期运行建议在宿主机使用 Caddy、Nginx Proxy Manager 或云负载均衡终止 TLS。

使用反向代理时，将 Web 入口改为回环绑定，再把代理转发到 `127.0.0.1:实际端口`：

```dotenv
XINYUE_HTTP_BIND=127.0.0.1
WEB_ORIGIN=https://xinyue.example.com
PUBLIC_BASE_URL=https://xinyue.example.com
COOKIE_SECURE=true
TRUST_PROXY=1
```

然后重建后端：

```powershell
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build backend
```

`WEB_ORIGIN` 必须与浏览器实际访问的 Origin 完全一致，否则登录 Cookie 和跨域请求会失败。`PUBLIC_BASE_URL` 是支付 Webhook 对外地址；前后端同域时与首个 `WEB_ORIGIN` 保持一致。内置 Docker 拓扑只有一层 Nginx，因此 `TRUST_PROXY=1`；手工部署时必须按真实代理跳数或代理 IP/CIDR 配置，不能使用 `true` 信任任意转发头。外层 TLS 代理必须覆盖 `X-Forwarded-Proto`。

安全防护约定：
- 带 Cookie 的写请求强制校验请求 Origin 必须在 `WEB_ORIGIN` 白名单内；单纯伪造 `X-Xinyue-Request` 请求头无法绕过外站防护。
- 团队导出仅限团队所有者或管理员执行；导出的内容严格限定为团队项目和团队共享资源，成员个人未绑项目的私有对话和非团队生成任务不随团队导出。
- 公开灵感媒体由只读公开接口分发，严格校验灵感公开状态和资源归属；禁止未授权直接访问后台私有存储。

### 2.6 出口网络与 SSRF 边界

应用会在外部请求前拒绝回环、私网、链路本地、云 Metadata 地址和非 HTTP(S) 协议，并拒绝不受信重定向。但域名校验和 TCP 建连不是同一个网络操作，DNS 记录可能在两者之间变化；使用正向代理时，目标域名还可能由代理服务器解析。因此，应用层校验不能替代生产 egress 策略。

生产环境必须按实际拓扑配置安全组、防火墙、容器网络策略或专用 egress proxy：

- 只允许 Backend/Worker 访问明确需要的 PostgreSQL、Redis、DailyHot 或本地 Worker 地址和端口；
- 拒绝访问其余回环、RFC 1918、链路本地、Docker/Kubernetes 管理网段及 IPv6 ULA/链路本地网段；
- 显式阻断云厂商 Metadata 地址，包括 `169.254.169.254` 及云平台提供的 IPv6 Metadata 地址；
- 普通公网请求尽量只允许经受控 egress proxy 访问 `80/443`，并由代理在实际解析和建连时再次执行公网 IP 校验；
- 上线前用 DNS 重绑定、私网 A/AAAA 记录、302 跳转到 Metadata 和代理远端解析四类用例验证规则确实生效。

如果业务允许管理员配置内网 Local Worker，应通过 `LOCAL_WORKER_ALLOWED_HOSTS` 建立独立、最小化的主机或 `主机:端口` 白名单；留空时仅允许仓库 Compose 内置的 Worker 服务名。不要因此对普通 Provider、用户自定义 Provider、Tool、Webhook 或搜索地址开放内网访问。

## 3. 持久化与备份

生产数据位于以下 Docker Volume：

- `xinyue_postgres`：PostgreSQL 数据
- `xinyue_redis`：Redis AOF 和队列状态
- `xinyue_uploads`：本地存储模式下的用户上传与生成文件；切换 S3 后仍需保留，直到历史本地资产迁移完成

升级前至少备份数据库、上传文件和运行配置：

```powershell
npm run backup:production
```

脚本会备份 PostgreSQL、Redis、上传文件、生产环境配置和 Compose 文件，并生成带 SHA-256 的 `manifest.json`。备份目录默认位于 `backups/<时间>`；可使用 `--output=绝对路径` 指定位置。备份包含生产密钥，必须加密保存并限制读取权限。

数据库恢复应在维护窗口执行：

```powershell
npm run restore:production -- --source=backups/2026-08-17_00-00-00-000 --confirm
```

默认不会覆盖当前 `.env.production`。只有明确需要恢复旧配置时才添加 `--restore-config`。恢复脚本会先校验全部文件、停止写入服务、恢复数据库/上传/Redis，再重新启动服务。

先在测试环境验证恢复文件；不要在仍有业务写入时直接覆盖生产数据库。

### 3.1 对象存储

默认配置为 `STORAGE_DRIVER=local`。启用 AWS S3、Cloudflare R2 或其他 S3 兼容服务时设置：

```dotenv
STORAGE_DRIVER=s3
S3_ENDPOINT=https://你的对象存储端点
S3_REGION=auto
S3_BUCKET=xinyue-assets
S3_ACCESS_KEY_ID=你的访问标识
S3_SECRET_ACCESS_KEY=你的访问密钥
S3_FORCE_PATH_STYLE=false
```

AWS S3 可留空 `S3_ENDPOINT` 并填写真实 Region；部分自建兼容服务需要 `S3_FORCE_PATH_STYLE=true`。Bucket 应使用私有访问策略，文件必须通过 Xinyue API 的登录和资源权限检查下载，不能直接公开整个 Bucket。

每条 `Asset` 都记录写入时的 `storageDriver`、`storageBucket` 和 SHA-256 校验和。迁移前已有记录会自动标记为 `local`，新上传文件使用当前活动驱动。

切换存储后，在管理端进入“运维管理 -> 系统健康 -> 资产存储迁移”。先确认活动存储健康，再按批次执行迁移。每个文件的顺序为：

```text
读取旧文件 -> 校验大小和 SHA-256 -> 写入并校验目标文件
-> 条件更新 Asset 存储位置 -> 删除旧副本
```

迁移进度直接由未处于活动存储的 `Asset` 数量计算，不依赖进程内状态；后端重启或单批失败后可以继续执行。冲突、源文件缺失或校验失败的记录会保留原存储位置，不会删除源文件。迁移时仍需注意：

- 切换到 S3 后不会在后台静默搬运历史文件，必须由管理员明确启动迁移。
- 历史本地资产未迁移前必须继续挂载并备份 `xinyue_uploads`。
- 数据库中仍存在 S3 资产时，必须保留对应 Bucket 和可读取该 Bucket 的凭据。
- 不要绕过管理端迁移流程手工复制后直接删除源文件。
- S3/R2 的版本控制、生命周期、跨区域复制和备份由对象存储侧配置，数据库备份不能代替对象备份。

管理端可以应用 Xinyue 自带的安全生命周期规则：清理未完成的分片上传，并在 Bucket 已启用版本控制时清理历史版本。它不会删除仍在使用的资产对象。保留天数由 `S3_ABORT_INCOMPLETE_UPLOAD_DAYS` 和 `S3_NONCURRENT_EXPIRATION_DAYS` 控制；其他非 Xinyue 生命周期规则会原样保留。

### 3.2 可选热点服务

生产 Compose 提供可选的 `DailyHotApi` 服务，它只负责首页多源热点推荐，不替代 SearXNG 或模型原生联网搜索。启用方式：

```powershell
docker compose --profile recommendations --env-file .env.production -f docker-compose.prod.yml up -d
```

随后在管理端“联网搜索与热点”中保存：

```text
服务地址：http://dailyhot:6688
```

选择需要展示的榜单后先执行“检测”，再启用首页推荐。系统最多并行读取 12 个榜单，按来源轮询、标题去重并持久化最近一次真实结果；单个上游故障不会用模型编造热点。DailyHotApi 聚合公开站点数据，上线前应评估目标站点条款和自身业务合规要求。

### 3.3 可选图片工具 Worker

首个独立 Worker 提供真实 `rembg` 智能抠图。它不管理用户、套餐或文件库，所有任务仍由 NestJS 执行权限、计费、BullMQ 调度、资产入库和审计。

先在 `.env.production` 生成独立令牌并启动 profile：

`LOCAL_WORKER_TOKEN` 也是生产启动门禁的一部分，即使暂不启用可选 Worker profile 也必须生成。这样后续启用任一 profile 时不会出现空 token 的内部服务。

```dotenv
LOCAL_WORKER_TOKEN=替换为独立随机令牌
LOCAL_WORKER_CONCURRENCY=1
LOCAL_WORKER_RESULT_TTL_SECONDS=604800
LOCAL_WORKER_REMBG_MODEL=u2net
```

```powershell
docker compose --profile image-tools --env-file .env.production -f docker-compose.prod.yml up -d --build image-worker
```

随后在管理端创建 `LOCAL_WORKER` 渠道：

```text
API 地址：http://image-worker:8080
访问令牌：LOCAL_WORKER_TOKEN 的值
```

执行渠道检测后，使用发现的 `rembg` 能力创建图片模型、绑定路由、配置价格和用户分组，再发布对应图片工具。模型缓存保存在 `xinyue_worker_models`，七天幂等结果缓存保存在 `xinyue_worker_data`；两者都不进入 Git。完整接口和取消语义见 [WORKER_PROTOCOL.md](WORKER_PROTOCOL.md)。

其余图片 Worker 按需启动，不需要时不要构建。`iopaint` 和 `realesrgan` 当前属于未认证的实验 profile，不得作为生产能力启用；只有在完成各自 README 中的依赖、漏洞和推理验收后，才可以在隔离 staging 使用：

```powershell
docker compose --profile iopaint --env-file .env.production -f docker-compose.prod.yml up -d --build iopaint-worker
docker compose --profile realesrgan --env-file .env.production -f docker-compose.prod.yml up -d --build realesrgan-worker
docker compose --profile comfyui --env-file .env.production -f docker-compose.prod.yml up -d --build comfyui-gateway
```

对应管理端渠道地址分别是 `http://iopaint-worker:8080`、`http://realesrgan-worker:8080` 和 `http://comfyui-gateway:8080`。ComfyUI 本体由运维人员单独部署，并通过 `COMFYUI_URL` 指向其内网地址；`COMFYUI_WORKFLOW_DIR` 只读挂载管理员审核后的 API 工作流。首次 Real-ESRGAN 和 IOPaint 推理会下载模型，生产环境应在发布前预热并确认模型许可证、磁盘和显存/内存容量。

## 4. 升级与回滚

### 4.1 升级

```powershell
git pull --ff-only
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
docker compose --env-file .env.production -f docker-compose.prod.yml ps
```

后端容器每次启动都会先执行 `prisma migrate deploy`，迁移成功后才启动 API。迁移失败时容器不会带着不匹配的数据库结构继续运行。

### 4.2 回滚

1. 保留升级前的 Git 提交号、数据库备份和 Volume 备份。
2. 切换到上一稳定提交并重新构建镜像。
3. 如果新版本执行了不可向后兼容的数据库迁移，先停止后端，再恢复数据库备份。
4. 恢复上传和配置 Volume 后启动全部服务。

Prisma 迁移不会自动执行数据库降级，不能只回退代码而忽略数据结构。

## 5. 健康检查与故障定位

```powershell
docker compose --env-file .env.production -f docker-compose.prod.yml ps
docker compose --env-file .env.production -f docker-compose.prod.yml logs --tail 200 backend
docker compose --env-file .env.production -f docker-compose.prod.yml logs --tail 200 frontend
Invoke-RestMethod http://localhost:8080/v1/health/live
Invoke-RestMethod http://localhost:8080/v1/health/ready
```

上线检查：

- `/v1/health/live` 返回 `ok: true`
- `/v1/health/ready` 返回 `ok: true`，且 PostgreSQL、Redis、BullMQ 均为 `up`
- `/`、`/login`、`/install` 和 `/admin/` 路由状态正确；管理员创建后 `/install` 自动关闭
- 超级管理员可以登录，普通用户不能进入管理后台
- PostgreSQL、Redis、文件存储在管理端系统健康页均正常
- 模型和搜索渠道健康检查成功
- 注册、登录、套餐下单、支付回调、对话和生成任务完成
- HTTPS 下 Cookie 带 `Secure`，浏览器控制台没有跨域或 Mixed Content 错误

常见问题：

- `env file .env.production not found`：先复制 `.env.production.example`。
- 登录后仍提示未授权：检查 `WEB_ORIGIN`、`COOKIE_SECURE`、代理的 `X-Forwarded-Proto` 和系统时间。
- 后端反复重启：查看迁移日志，确认数据库可连接且用户有建表权限。
- 上传失败：检查反向代理请求体上限和 `xinyue_uploads` Volume 的可写状态。
- S3 上传或下载失败：检查 Bucket、Region、Endpoint、路径风格、凭据权限和服务器时间；管理端系统健康应返回当前存储驱动和 Bucket。

## 6. 手工 Node.js 部署

不使用 Docker 时，需要自行提供 PostgreSQL 17、Redis 7、Node.js 20.19+（推荐 22）、pnpm 和 Nginx。

```powershell
npm ci
npm --prefix server ci
pnpm --dir admin install --frozen-lockfile
npm --prefix server run prisma:generate
npm run build
npm run admin:build
npm run server:build
npm --prefix server run prisma:deploy
```

部署结构：

- `dist/` 作为用户端静态目录
- `admin/dist/` 挂载到 `/admin/`
- `server/dist/main.js` 由 systemd、PM2 或 Windows Service 常驻运行
- Nginx 将 `/v1/` 代理到 `127.0.0.1:3100`
- `UPLOAD_DIR` 指向持久化目录

后端至少需要配置：`NODE_ENV=production`、`DATABASE_URL`、`REDIS_URL`、`WEB_ORIGIN`、`COOKIE_SECURE`、`SESSION_SECRET`、`CREDENTIAL_ENCRYPTION_KEY`、`INSTALL_TOKEN` 和存储配置。管理员通过 `/install` 创建；也可以同时提供 `ADMIN_EMAIL`、`ADMIN_PASSWORD` 让启动脚本执行幂等初始化。手工部署升级时，应在启动新进程前先执行 `npm --prefix server run prisma:deploy`。

## 7. 运维脚本

| 命令 | 作用 |
| --- | --- |
| `npm run backup:production` | 备份 PostgreSQL、Redis、上传文件、生产配置和 Compose 文件，生成带 SHA-256 的 `manifest.json`，见第 3 节 |
| `npm run restore:production -- --source=<目录> --confirm` | 校验并恢复备份，默认不覆盖 `.env.production`，见第 3 节 |
| `node scripts/ensure-production-secrets.cjs --local` | 仅用于本机或测试机：为 `.env.production` 中缺失或仍是占位值的 `POSTGRES_PASSWORD`、`SESSION_SECRET`、`CREDENTIAL_ENCRYPTION_KEY`、`INSTALL_TOKEN`、`LOCAL_WORKER_TOKEN` 生成 32 字节随机值。数据库主机不是本地地址时会拒绝执行，也不打印密钥值。真实生产环境请使用 secret manager |
| `NEW_API_KEY=… [NEW_BASE_URL=…] node scripts/rotate-sub2api-key.cjs` | 轮换 SUB2API 类型渠道的 API Key 并清空健康与冷却状态；不传 `NEW_BASE_URL` 时保留原地址。日志只显示 Key 前后 6 位。管理端编辑渠道也能完成同样操作 |
| `npm --prefix server run admin:reset-password` | 使用环境中的 `ADMIN_EMAIL` / `ADMIN_PASSWORD` 重置管理员密码 |

脚本读取 `server/.env`（或容器内环境变量）连接数据库，需在能访问数据库的机器上执行。

## 8. 日常更新

```bash
git pull --ff-only
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

更新前先执行 `npm run backup:production`。只改了前端时也需要重建 `frontend` 镜像；后端镜像启动时会自动执行新迁移。

## 9. 发布前验证

完整清单见 [DEVELOPMENT.md](DEVELOPMENT.md#7-提交前验证)。最少执行：

```powershell
npm run audit:ui-actions
npm run test:unit
npm run verify
npm run test:e2e
git diff --check
```

真实生产密钥、管理员密码、支付密钥、OAuth Secret 和供应商 API Key 只能通过部署环境注入，不能提交到仓库。
