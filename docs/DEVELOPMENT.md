# 开发指南

本文面向在本地修改 Xinyue AI 源码的开发者：环境准备、目录结构、常用命令、测试与提交前验证。生产部署见 [DEPLOYMENT.md](DEPLOYMENT.md)，系统原理见 [ARCHITECTURE.md](ARCHITECTURE.md)。

## 1. 环境要求

- Node.js 20.19+（推荐 22）与 npm
- pnpm 10（管理端使用 pnpm）
- Docker（本地 PostgreSQL 17 与 Redis 7）
- 本机安装的 Google Chrome（Playwright 使用 `channel: 'chrome'`）
- Python 3.11+（仅在修改 `workers/` 时需要）

## 2. 首次准备

```bash
npm ci
npm --prefix server ci
pnpm --dir admin install --frozen-lockfile
docker compose up -d        # postgres:5432, redis:6379
npm run setup:dev
```

`setup:dev`（`scripts/setup-dev.cjs`）做三件事：

1. 如果没有 `server/.env`，从 `server/.env.example` 复制一份，并随机生成 `SESSION_SECRET`、`INSTALL_TOKEN`、`CREDENTIAL_ENCRYPTION_KEY`；
2. `prisma generate`；
3. `prisma migrate deploy`。

它不会创建管理员。启动后打开 `http://localhost:5173/install`，用 `server/.env` 中的 `INSTALL_TOKEN` 创建首个管理员。本地测试也可以在 `server/.env` 填写 `ADMIN_EMAIL` / `ADMIN_PASSWORD`，然后执行 `npm --prefix server run admin:seed` 幂等创建；忘记密码时用 `npm --prefix server run admin:reset-password`。

Windows 上 `DATABASE_URL` 与 `REDIS_URL` 建议写 `127.0.0.1` 而不是 `localhost`，避免解析到 `::1` 后连接失败。

## 3. 启动

```bash
npm run dev          # API（nest --watch，3100）+ 用户端（Vite，5173）
npm run admin:dev    # 管理端（Vite，5174，路径 /admin/）
```

也可以分开启动：`npm run dev:web`（仅用户端）、`npm run server:dev`（仅 API）。两个 Vite 开发服务器都把 `/v1` 代理到 3100。

API 需要至少一个可用的模型渠道才能对话和生成：在管理端「模型与生成 → 上游渠道」添加渠道并检测，再到「模型与定价」启用模型。没有健康渠道时，API 会返回明确的不可用错误，不会用演示回复代替真实结果。

## 4. 目录结构

```text
src/                         用户端（Vue 3）
  views/                     页面：Studio（对话/创作）、画布、能力中心、技能市场、提示词库、办公中心……
  components/                chat/、shell/、canvas 相关组件与通用组件
  composables/               canvas/、chat/、studio/ 组合式逻辑
  stores/                    Pinia：auth、catalog、studio
  services/api.ts            统一 API 客户端（Cookie、超时、X-Xinyue-Request）
  layouts/chat-presets.ts    五套聊天皮肤的布局配置
  assistant-avatar/          形变头像引擎（移植自 Bloub，MIT）
  styles/                    tokens.css 与各域样式，见 DESIGN_SYSTEM.md
admin/                       管理端（Art Design Pro 二次开发）
  src/router/modules/enterprise.ts   业务路由与菜单
  src/views/xinyue/          业务页面
  src/api/xinyue/            管理 API 封装
server/                      NestJS API
  src/<domain>/              按业务域划分的 Module / Controller / Service / Processor
  prisma/schema.prisma       数据库结构
  prisma/migrations/         按序执行的迁移（唯一发布来源）
  prompt-library-data/       随版本发布的提示词快照
  scripts/                   启动、管理员初始化、插件链路自测
workers/                     可选 Python Worker：image-tools、iopaint、realesrgan、comfyui-gateway
tests/unit/                  单元测试（node:test + tsx）
tests/e2e/                   Playwright 浏览器测试
scripts/                     开发、审计、截图、备份恢复与运维脚本
deploy/nginx.conf            生产 Web 入口
docs/                        文档与 README 截图
```

## 5. 命令速查

### 根目录

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 同时启动 API（watch）与用户端 |
| `npm run build` | 用户端 `vue-tsc -b` + `vite build` |
| `npm run admin:build` | 管理端 `vue-tsc --noEmit` + `vite build` |
| `npm run server:build` | API `nest build`（输出到 `server/dist`） |
| `npm run verify` | UI 审计 + 三端构建 |
| `npm run test:unit` | 全部单元测试 |
| `npm run test:e2e` | Playwright 全量 E2E |
| `npm run audit:ui-actions` | 静态审计按钮、链接与交互是否都有处理函数 |
| `npm run screenshots:demo` | 重新生成 `docs/images/` 下的 README 截图（需要 E2E 管理员凭据） |
| `npm run clean` / `clean:reports` | 删除构建产物与日志 / 只删测试报告 |
| `npm run infra:up` / `infra:down` | 启停本地 PostgreSQL 与 Redis |

### API（`npm --prefix server run …`）

| 命令 | 作用 |
| --- | --- |
| `prisma:generate` | 生成 Prisma Client |
| `prisma:migrate` | 开发期创建新迁移（`prisma migrate dev`） |
| `prisma:deploy` | 执行已发布迁移 |
| `prisma:studio` | 数据浏览 |
| `admin:seed` / `admin:reset-password` | 用 `server/.env` 中的管理员配置初始化或重置 |
| `plugin:test` | 对运行中的 API 跑一遍技能 / 插件链路自测 |

### 管理端（`pnpm --dir admin …`）

| 命令 | 作用 |
| --- | --- |
| `lint` / `fix` | ESLint 检查 / 自动修复（含 Prettier 规则） |
| `lint:stylelint` | 样式检查并修复 |

## 6. 测试

### 6.1 单元测试

```bash
npm run test:unit
```

测试位于 `tests/unit/*.test.ts`，使用 `server/tsconfig.json` 编译。根目录无法解析 `@prisma/client` 的运行时导出，因此单元测试和被测模块只能从 Prisma 导入类型（`import type`），枚举值用字符串字面量。

### 6.2 E2E

E2E 默认复用已经启动的 5173 / 5174 / 3100，需要一个管理员账号：

```bash
export E2E_ADMIN_EMAIL='管理员邮箱'
export E2E_ADMIN_PASSWORD='管理员密码'
export E2E_BASE_URL='http://localhost:5173'
export E2E_ADMIN_URL='http://localhost:5174/admin'
export E2E_API_ORIGIN='http://localhost:3100'
npx playwright test
```

Windows PowerShell 请改用 `$env:E2E_ADMIN_EMAIL = '管理员邮箱'` 这种写法。

- 未设置 `E2E_BASE_URL` / `E2E_API_ORIGIN` 时，Playwright 会尝试自行启动用户端与 `server/dist`。
- `tests/e2e/global-teardown.ts` 每轮结束后清理 `e2e-*` 测试画布。
- `tests/e2e/ui-sweep.spec.ts` 逐页检查用户端、管理端与五套皮肤首页的渲染、控制台错误、5xx 与横向溢出。
- **跑 E2E 期间不要修改 `server/src`**：`nest --watch` 会重启 API，导致用例随机失败。
- 缺少 ffmpeg 时执行 `npx playwright install ffmpeg`。
- 报告输出到 `playwright-report/` 与 `test-results/`，均被 Git 忽略，可用 `npm run clean:reports` 清除。

## 7. 提交前验证

完整清单（CI 的 `.github/workflows/build.yml` 覆盖其中不需要数据库的部分）：

```bash
npm run audit:ui-actions
npm run test:unit
pnpm --dir admin lint
npm run build
npm run server:build
npm run admin:build
cd server && npx prisma validate && npx prisma migrate status && cd ..
python -m py_compile workers/comfyui-gateway/app.py workers/image-tools/app.py workers/iopaint/app.py workers/realesrgan/app.py
npm --prefix server run plugin:test     # 需要运行中的 API
npx playwright test                     # 需要三端运行中与管理员凭据
git diff --check
```

`npm run server:build` 会覆盖 `server/dist`；如果 `nest --watch` 正在运行，可以只做类型检查：`npx tsc -p server/tsconfig.json --noEmit`。

## 8. 开发约定

- **数据库**：修改 `schema.prisma` 必须附带 migration；删除列前确认 `prisma generate` 与所有读写方已同步。不要用 `db push` 代替迁移。
- **公开接口**：新 Controller 默认需要登录；确需匿名访问时标 `@Public()`，并把类名加入 `tests/unit/route-guard-coverage.test.ts` 的 `ALLOWED_PUBLIC`。
- **写请求**：浏览器写请求必须带 `X-Xinyue-Request: 1`（`src/services/api.ts` 与管理端请求封装已处理）；脚本直接调用 API 时也要带上。
- **出站请求**：访问用户或管理员配置的 URL 一律走 `server/src/common/outbound-http.ts` 与 `public-endpoint-policy.service.ts`，不要直接 `fetch`。
- **公开 DTO**：返回给用户的数据走白名单映射，不要序列化渠道、成本、租约或预留等内部字段。
- **环境变量**：新增变量同时更新 `server/.env.example` 与 `.env.production.example`，不要提交真实值。
- **预设**：内置助手、工具与技能写在 `default-capability-presets.ts` / `default-skill-presets.ts`，启动时幂等补齐；不要依赖手动插库。
- **样式**：用户端业务 CSS 消费 `tokens.css` 令牌，不硬编码颜色，见 [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md)。
- **不要提交**：`.env*`（示例文件除外）、日志、`dist/`、测试报告、`uploads/`、`storage/`、`backups/`、数据库导出与任何密钥。
