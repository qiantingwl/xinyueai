# Xinyue AI 部署与运维指南

本文覆盖 Docker Compose 生产部署、首次安装、升级、备份恢复、健康检查和手工 Node.js 部署。

## 1. 生产架构

| 服务 | 作用 | 默认暴露 |
| --- | --- | --- |
| `frontend` | Nginx、用户端和管理端静态文件、API 反向代理 | 主机 `80` |
| `backend` | NestJS API、BullMQ Worker、安装服务 | 容器 `3100` |
| `postgres` | 主业务数据库 | 仅 Compose 内网 |
| `redis` | 队列、缓存和任务状态 | 仅 Compose 内网 |

Nginx 路由：用户端位于 `/`，管理端位于 `/admin/`，API 位于 `/v1/`。上传上限为 55 MB，流式 API 已关闭代理缓冲。

## 2. Docker Compose 部署

### 2.1 环境要求

- 2 核 CPU、4 GB 内存起步；生成任务多时建议 4 核 8 GB
- 40 GB 以上可用磁盘
- Docker Engine 24+ 和 Docker Compose v2+
- 已解析到服务器的域名和可用的 HTTPS 反向代理

### 2.2 创建生产配置

```powershell
Copy-Item .env.production.example .env.production
```

必须修改 `.env.production` 中的 `POSTGRES_PASSWORD`。`SESSION_SECRET` 和 `CREDENTIAL_ENCRYPTION_KEY` 可以留空，由首次安装向导生成，也可以预先写入不少于 32 位的随机值。

重要：Compose 的 `--env-file` 用于解析 `${POSTGRES_PASSWORD}`，而 `backend.env_file` 仍读取根目录的 `.env.production`。两者都需要，因此后续命令始终保留 `--env-file .env.production`。

### 2.3 启动

```powershell
docker compose --env-file .env.production -f docker-compose.prod.yml config
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
docker compose --env-file .env.production -f docker-compose.prod.yml ps
docker compose --env-file .env.production -f docker-compose.prod.yml logs -f backend
```

首次启动时后端日志会输出一次“首次安装密钥”。不要把该密钥发送到聊天、工单或 Git。

### 2.4 首次安装

1. 打开 `http://服务器地址/install`。
2. 输入后端日志中的安装密钥。
3. 数据库地址填写 `postgresql://flux:数据库密码@postgres:5432/flux_studio?schema=public`。
4. Redis 地址填写 `redis://redis:6379`。
5. 填写网站名称、正式域名和超级管理员账户。
6. 完成安装后后端容器会自动重启，安装入口随即锁定。

数据库密码包含 `@`、`:`、`/`、`#` 等字符时，需要先进行 URL 编码。也可以在启动前直接填写 `DATABASE_URL`，安装向导会跳过数据库连接步骤。

### 2.5 HTTPS 和域名

推荐在宿主机使用 Caddy、Nginx Proxy Manager 或云负载均衡终止 TLS，再转发到 `127.0.0.1:80`。启用 HTTPS 后修改：

```dotenv
WEB_ORIGIN=https://xinyue.example.com
COOKIE_SECURE=true
```

然后重建后端：

```powershell
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build backend
```

`WEB_ORIGIN` 必须与浏览器实际访问的 Origin 完全一致，否则登录 Cookie 和跨域请求会失败。

## 3. 持久化与备份

生产数据位于以下 Docker Volume：

- `xinyue_postgres`：PostgreSQL 数据
- `xinyue_redis`：Redis AOF 和队列状态
- `xinyue_uploads`：用户上传与生成文件
- `xinyue_config`：安装向导写入的运行配置

升级前至少备份数据库、上传文件和运行配置：

```powershell
New-Item -ItemType Directory -Force backups | Out-Null
docker compose --env-file .env.production -f docker-compose.prod.yml exec -T postgres pg_dump -U flux -Fc flux_studio > backups/xinyue-postgres.dump
docker run --rm -v xinyue_uploads:/data -v "${PWD}/backups:/backup" alpine tar czf /backup/xinyue-uploads.tar.gz -C /data .
docker run --rm -v xinyue_config:/data -v "${PWD}/backups:/backup" alpine tar czf /backup/xinyue-config.tar.gz -C /data .
```

数据库恢复应在维护窗口执行：

```powershell
docker compose --env-file .env.production -f docker-compose.prod.yml stop backend
Get-Content backups/xinyue-postgres.dump -AsByteStream | docker compose --env-file .env.production -f docker-compose.prod.yml exec -T postgres pg_restore -U flux -d flux_studio --clean --if-exists
docker compose --env-file .env.production -f docker-compose.prod.yml start backend
```

先在测试环境验证恢复文件；不要在仍有业务写入时直接覆盖生产数据库。

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
Invoke-RestMethod http://localhost/v1/health
```

上线检查：

- `/v1/health` 返回 `ok: true`
- `/`、`/login`、`/admin/` 和 `/install` 路由状态正确
- 超级管理员可以登录，普通用户不能进入管理后台
- PostgreSQL、Redis、文件存储在管理端系统健康页均正常
- 模型和搜索渠道健康检查成功
- 注册、登录、套餐下单、支付回调、对话和生成任务完成
- HTTPS 下 Cookie 带 `Secure`，浏览器控制台没有跨域或 Mixed Content 错误

常见问题：

- `env file .env.production not found`：先复制 `.env.production.example`。
- 登录后仍提示未授权：检查 `WEB_ORIGIN`、`COOKIE_SECURE`、代理的 `X-Forwarded-Proto` 和系统时间。
- 后端反复重启：查看迁移日志，确认数据库可连接且用户有建表权限。
- 首次安装页被锁定：站点已安装时属于正常行为；如果数据库丢失，恢复 `xinyue_config` 和数据库备份。
- 上传失败：检查反向代理请求体上限和 `xinyue_uploads` Volume 的可写状态。

## 6. 手工 Node.js 部署

不使用 Docker 时，需要自行提供 PostgreSQL 17、Redis 7、Node.js 20.19+（推荐 22）、pnpm 和 Nginx。

```powershell
npm ci
npm --prefix server ci
pnpm --dir admin install --frozen-lockfile
npm run build
npm run admin:build
npm run server:build
npm --prefix server run prisma:generate
npm --prefix server run prisma:deploy
```

部署结构：

- `dist/` 作为用户端静态目录
- `admin/dist/` 挂载到 `/admin/`
- `server/dist/main.js` 由 systemd、PM2 或 Windows Service 常驻运行
- Nginx 将 `/v1/` 代理到 `127.0.0.1:3100`
- `UPLOAD_DIR` 指向持久化目录

后端至少需要配置：`NODE_ENV=production`、`DATABASE_URL`、`REDIS_URL`、`WEB_ORIGIN`、`COOKIE_SECURE`、`SESSION_SECRET`、`CREDENTIAL_ENCRYPTION_KEY`。手工部署升级时，应在启动新进程前先执行 `npm --prefix server run prisma:deploy`。

## 7. 发布前验证

```powershell
npm run audit:ui-actions
npm run verify
npm run test:e2e
git diff --check
```

真实生产密钥、管理员密码、支付密钥、OAuth Secret 和供应商 API Key 只能通过部署环境注入，不能提交到仓库。
