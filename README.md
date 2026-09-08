# Xinyue AI

开源 AI 创作与模型管理平台。

Xinyue AI 将 AI 对话、模型接入、Provider 路由、无限画布、图片/视频生成和运营后台整合在一个工作空间中，支持本地部署与自托管。

![Xinyue AI 对话工作区](docs/images/xinyue-chat.png)

## ✨ 功能特性

### AI Workspace

- 多模型对话与流式响应
- 会话历史、临时聊天、分支和附件
- 文件处理、提示词库、助手与办公任务

### Model Gateway

- OpenAI Compatible、Anthropic、Gemini 等协议
- Provider 渠道、模型目录、价格和能力管理
- 优先级、权重、健康检查与失败切换
- Token 用量、额度、创作点和账单流水

### Creative Studio

- 无限画布与项目协作
- 图片、视频和商品视觉生成
- 图片提示词提取与提示词管理
- 可选本地图片工具 Worker

### Admin Console

- 用户、会员、套餐和权限
- 模型、渠道、定价和搜索服务配置
- 任务、账单、资产、操作记录和系统健康
- 默认助手、工具和第三方能力预设

## 📸 界面预览

| 对话工作区 | 创作工作区 |
| --- | --- |
| ![对话](docs/images/xinyue-chat.png) | ![创作](docs/images/xinyue-creation.png) |

| 管理后台 | 能力中心 |
| --- | --- |
| ![管理后台](docs/images/xinyue-admin-dashboard.png) | ![能力中心](docs/images/xinyue-capability-center.png) |

## 🚀 快速开始

### Docker 一键部署（推荐）

适合不需要修改源码的用户。在 Linux/macOS 服务器执行：

```bash
curl -fsSL https://raw.githubusercontent.com/qiantingwl/xinyueai/main/install.sh | bash
```

安装脚本会检查 Docker、生成运行密钥和一次性安装令牌，并启动 PostgreSQL、Redis、Backend 和 Frontend。Frontend/Nginx 是唯一对外 Web 入口，默认监听所有主机地址；安装完成后直接打开终端输出的 `http://服务器IP:实际端口/`。默认端口固定为 `6001`；如果端口已被占用，安装会停止并提示先释放该端口，不会自动切换到其他端口。首次访问 `http://服务器IP:6001/install`，使用服务器本机 `.env.production` 中的安装令牌创建管理员；令牌不会打印到终端，初始化完成后入口会自动关闭。

一键部署不需要手工配置 Nginx、Cloudflare、数据库或 Redis。高级部署者可在 `.env.production` 设置 `XINYUE_HTTP_BIND=127.0.0.1` 和 `XINYUE_HTTP_PORT`，再用自己的域名反向代理到该本机端口。

已克隆仓库时可以直接运行：

```bash
./install.sh
```

### Docker Compose

适合需要自定义域名、数据库、Redis、存储或反向代理的部署者：

```bash
git clone https://github.com/qiantingwl/xinyueai.git
cd xinyueai
cp .env.production.example .env.production
# 编辑 .env.production，生成 INSTALL_TOKEN 并填写站点、密钥和存储配置
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

完整升级、备份、对象存储和 Worker 配置见 [部署指南](docs/DEPLOYMENT.md)。

### 本地开发

要求 Node.js 20.19+（推荐 22）、npm、pnpm 和 Docker Desktop：

```bash
git clone https://github.com/qiantingwl/xinyueai.git
cd xinyueai
npm ci
npm --prefix server ci
pnpm --dir admin install --frozen-lockfile
docker compose up -d
npm run setup:dev
```

本地开发时启动用户端和 API；管理端可通过同一 Web 入口的 `/admin/` 访问：

```bash
npm run dev
npm run server:dev
npm run admin:dev
```

- 用户端：`http://localhost:6001`
- 管理端：`http://localhost:6001/admin/`
- API：`http://localhost:6001/v1`

初始化脚本只准备数据库和安全配置，不会创建固定管理员。首次打开 `/install`，使用 `server/.env` 中自动生成的 `INSTALL_TOKEN` 创建管理员。

## ⚙️ 配置与文档

- [部署与运维指南](docs/DEPLOYMENT.md)
- [本地 Worker 协议](docs/WORKER_PROTOCOL.md)
- [更新日志](CHANGELOG.md)
- [安全策略](SECURITY.md)
- [贡献指南](CONTRIBUTING.md)
- [第三方声明](THIRD_PARTY_NOTICES.md)

运行时配置、日志、数据库、构建产物和用户上传文件不会提交到 Git。更多安全约定见 [安全策略](SECURITY.md)。

## 🤝 贡献
欢迎提交 Bug 修复、文档改进、UI 优化、Provider 适配和测试补充。请先阅读 [CONTRIBUTING.md](CONTRIBUTING.md)，并通过分支和 Pull Request 参与开发。
