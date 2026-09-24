# Xinyue AI

开源、可自托管的 AI 创作与模型管理平台。

同一工作空间包含多模型对话、模型网关、无限画布、图片 / 视频 / 商品视觉、办公输出、助手与技能，以及运营后台。用户端使用 Vue 3，服务端使用 NestJS、Prisma 与 BullMQ，可以用 Docker 一条命令部署。

当前发布版本是 **1.0.1**。此后尚未单独发版的改动，记在 [更新日志](CHANGELOG.md) 的「未发布」一节。

![Xinyue AI 对话工作区](docs/images/xinyue-chat.png)

## 目录

- [功能](#功能)
- [界面预览](#界面预览)
- [快速开始](#快速开始)
- [技术栈](#技术栈)
- [文档](#文档)
- [贡献](#贡献)

## 功能

**AI 工作空间**

- 多模型流式对话：思考过程、联网搜索与引用、分支、临时聊天、附件、追问建议、共享链接
- 五套聊天皮肤，由管理员在后台全站切换：`gpt`、`doubao`、`qianwen`、`kimi`、`jixing`（季星）。名称只区分布局，不代表与对应厂商合作
- 项目、文件库、团队空间与团队额度
- 办公中心：PPT、文档、表格，可导出 PPTX / DOCX / XLSX

**助手、技能与知识库**

启动时会补齐缺失的内置项，已有记录不会被覆盖。

- 12 个内置助手：通用工作、商品视觉、商业文案、知识服务、深度调研、办公写作、数据分析、代码与架构、会议纪要、产品经理、视觉创意、学习辅导
- 14 个预装技能，分 7 类：流程图、思维导图、SVG 矢量图、信息图、数据图表、HTML 原型、PRD、灵感板、宫格图、文章配图、条漫、Logo、去 AI 味改写、翻译本地化。无需安装即可在对话中使用，用户可以停用
- 6 个知识库模板：产品资料、品牌规范、客服 FAQ、团队 SOP、行业研究、学习笔记
- 8 个内置工具：项目上下文、文件目录、数据汇总、日期时间、知识库检索，以及可选的 n8n / Dify / FastGPT 工作流
- 外部技能市场只作发现源：LobeHub Skills、SkillHub、SkillsMP、CocoLoop。开关是 `EXTERNAL_SKILL_MARKET_ENABLED`（代码默认关闭，示例配置为开启）。安装前会做格式与安全扫描；扫描不代表获得许可证授权

**模型网关**

- 协议：OpenAI Compatible、Anthropic、Gemini、NewAPI、Sub2API、Pollinations，以及本地 Worker
- 渠道优先级、权重、健康检查、冷却熔断和失败切换
- 用户自带 Key（BYOK）与私有路由
- Token 额度、创作点、价格快照、预留、对账和不可变流水

**创作**

- 无限画布（Vue Flow）：生成节点、连线、结果回填、自动保存与版本
- 图片、视频（首尾帧）、商品视觉，以及图片反推提示词
- 提示词库、灵感中心、作品发布与审核
- 可选本地图片 Worker：抠图（rembg）可按部署文档启用。擦除 / 扩图（IOPaint）与超分（Real-ESRGAN）尚未通过发布认证，默认关闭。受控 ComfyUI 网关只运行管理员挂载并审核过的工作流

**管理后台**

- 用户、用户组、团队、套餐订阅、支付充值、优惠与兑换码
- 渠道、模型目录、定价、路由、生成任务、联网搜索
- 助手、技能、工具与知识库预设，可一键恢复默认技能
- 公告、通知、审核、客服、告警、审计、系统健康、存储迁移
- 用户端左侧导航、首页内容与站点配置

## 界面预览

| 对话工作区 | AI 创作 |
| --- | --- |
| ![对话](docs/images/xinyue-chat.png) | ![创作](docs/images/xinyue-creation.png) |

| 管理后台 | 能力中心 |
| --- | --- |
| ![管理后台](docs/images/xinyue-admin-dashboard.png) | ![能力中心](docs/images/xinyue-capability-center.png) |

截图由 `npm run screenshots:demo` 在本地测试环境生成，不含密钥和用户隐私数据。

## 快速开始

### Docker 一键部署

在 Linux / macOS 服务器上执行：

```bash
curl -fsSL https://raw.githubusercontent.com/qiantingwl/xinyueai/main/install.sh | bash
```

已经克隆仓库时，也可以直接运行 `./install.sh`。

脚本会检查 Docker，生成运行密钥和一次性安装令牌，并启动 PostgreSQL、Redis、Backend 和 Frontend。Frontend（Nginx）是唯一对外入口，默认端口 `8080`；端口被占用时自动递增，并写回 `.env.production`。

安装完成后打开 `http://服务器IP:端口/install`，填入服务器本机 `.env.production` 中的 `INSTALL_TOKEN` 创建管理员。令牌不会打印到终端。管理员创建后，该入口自动关闭。

### 自定义 Docker Compose

需要自己指定域名、存储或反向代理时：

```bash
git clone https://github.com/qiantingwl/xinyueai.git
cd xinyueai
cp .env.production.example .env.production
# 编辑 .env.production：数据库密码、SESSION_SECRET、CREDENTIAL_ENCRYPTION_KEY、INSTALL_TOKEN、LOCAL_WORKER_TOKEN
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

升级、备份恢复、HTTPS、对象存储和 Worker 见 [部署与运维指南](docs/DEPLOYMENT.md)。

### 本地开发

需要 Node.js 20.19+（推荐 22）、pnpm 10 和 Docker：

```bash
git clone https://github.com/qiantingwl/xinyueai.git
cd xinyueai
npm ci
npm --prefix server ci
pnpm --dir admin install --frozen-lockfile
docker compose up -d        # PostgreSQL 17 + Redis 7
npm run setup:dev           # 生成 server/.env、Prisma Client 并执行迁移
```

启动：

```bash
npm run dev                 # API（3100，watch）+ 用户端（5173）
npm run admin:dev           # 管理端（5174）
```

| 入口 | 地址 |
| --- | --- |
| 用户端 | http://localhost:5173 |
| 管理端 | http://localhost:5174/admin/ |
| API | http://localhost:3100/v1 |

首次打开 `/install`，用 `server/.env` 里自动生成的 `INSTALL_TOKEN` 创建管理员。然后到后台「模型与生成 → 上游渠道」添加至少一个模型渠道，并在「模型与定价」中启用模型。没有健康渠道时，接口会返回明确的不可用错误，不会用演示回复代替真实结果。

开发、测试与提交前检查见 [开发指南](docs/DEVELOPMENT.md)。

## 技术栈

| 部分 | 技术 |
| --- | --- |
| 用户端 `src/` | Vue 3、Vite、Pinia、Vue Router、Vue Flow、marked + KaTeX + highlight.js + DOMPurify |
| 管理端 `admin/` | 基于 Art Design Pro 二次开发，Vue 3、Element Plus、Tailwind CSS 4、ECharts |
| 后端 `server/` | NestJS 11、Fastify、Prisma、PostgreSQL 17、Redis 7、BullMQ、LangGraph.js |
| Worker `workers/` | FastAPI（Python），可选 Compose profile |
| 部署 | Docker Compose、Nginx |
| 测试 | Node test runner + tsx、Playwright |

## 文档

| 文档 | 内容 |
| --- | --- |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 系统架构、生成任务链、路由、计费、SSE、安全与数据模型 |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | 本地开发、目录结构、命令、测试与发布前验证 |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | 生产部署、升级回滚、备份恢复、对象存储、Worker、运维脚本 |
| [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md) | 设计令牌、聊天皮肤、组件与样式约定 |
| [docs/WORKER_PROTOCOL.md](docs/WORKER_PROTOCOL.md) | 本地图片 Worker 接口协议 |
| [docs/OPEN_SOURCE_AND_REFERENCES.md](docs/OPEN_SOURCE_AND_REFERENCES.md) | 依赖、参考项目、内容来源与许可证边界 |
| [CHANGELOG.md](CHANGELOG.md) | 更新日志 |
| [CONTRIBUTING.md](CONTRIBUTING.md) | 贡献流程 |
| [SECURITY.md](SECURITY.md) | 安全策略与漏洞报告 |
| [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) | 第三方声明 |

运行时配置、日志、数据库、构建产物和用户上传文件不会提交到 Git。

## 贡献

欢迎提交缺陷修复、文档、界面、Provider 适配和测试。请先阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。安全问题请按 [SECURITY.md](SECURITY.md) 私下报告，不要创建公开 Issue。
