# 贡献指南

本文说明如何为 Xinyue AI 提交改动。本地环境与完整命令见 [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)。

欢迎缺陷修复、文档、界面改进、Provider 适配、测试，以及可维护性改进。

## 分支

从最新的 `main` 创建分支：

```bash
git switch main
git pull --ff-only
git switch -c feature/short-description
```

分支前缀使用 `feature/`、`fix/`、`refactor/`、`docs/` 或 `chore/`。

## 提交 Pull Request 前

至少运行与改动相关的检查。改动涉及多端时，运行完整清单：

```bash
npm run audit:ui-actions
npm run test:unit
pnpm --dir admin lint
npm run build
npm run server:build
npm run admin:build
cd server && npx prisma validate && cd ..
git diff --check
```

改动界面或跨端流程时，再运行 Playwright E2E。需要本地三端和管理员凭据，见开发指南第 6 节：

```bash
npx playwright test
```

CI（`.github/workflows/build.yml`）会在 PR 上执行界面操作审计、单元测试、管理端 lint、三端构建、Prisma 校验与空白检查。

## PR 要求

- 每个 PR 只做一件事。
- 说明用户可见的变化，以及 API、数据库或环境变量的变化。
- 修改 `server/prisma/schema.prisma` 时附带迁移文件。
- 新增环境变量时，同步更新 `server/.env.example` 与 `.env.production.example`。
- 新增匿名接口时说明原因，并更新 `tests/unit/route-guard-coverage.test.ts` 的公开白名单。
- 引入第三方代码或素材时，更新 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)，并核对许可证是否允许商用与修改。
- 合并前请先获得评审。批准后优先 squash merge，并删除源分支。

## 不要提交

不要提交 `.env` 文件（示例文件除外）、真实 API Key、支付凭据、生产日志、构建产物、测试报告、数据库备份和用户上传内容。

安全问题请按 [SECURITY.md](SECURITY.md) 私下报告，不要创建公开 Issue。
