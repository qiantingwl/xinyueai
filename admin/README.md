# Xinyue AI 管理端

Xinyue AI 的运营管理后台，基于 [Art Design Pro](https://github.com/Daymychen/art-design-pro)（MIT）二次开发，技术栈为 Vue 3、TypeScript、Vite、Element Plus、Tailwind CSS 4 与 ECharts。上游许可证见 [LICENSE](./LICENSE)。

产品说明见仓库根目录 [README](../README.md)，系统原理见 [ARCHITECTURE](../docs/ARCHITECTURE.md)。

## 开发

在仓库根目录执行：

```bash
pnpm --dir admin install --frozen-lockfile
npm run admin:dev          # http://localhost:5174/admin/
```

开发服务器把 `/v1` 代理到 `http://localhost:3100`，需要先启动 API（`npm run dev` 或 `npm run server:dev`）。只有 `ADMIN` / `SUPER_ADMIN` 账号可以登录。

| 命令（`pnpm --dir admin …`） | 作用 |
| --- | --- |
| `dev` | 开发服务器 |
| `build` | `vue-tsc --noEmit` + `vite build`，输出 `admin/dist`，生产由 Nginx 挂载到 `/admin/` |
| `lint` / `fix` | ESLint 检查 / 自动修复 |
| `lint:stylelint` | 样式检查 |

## 目录

| 位置 | 内容 |
| --- | --- |
| `src/router/modules/enterprise.ts` | 业务路由与菜单 |
| `src/views/xinyue/` | 业务页面：客户、模型与渠道、内容、AI 能力、运营中心、商业化、系统配置 |
| `src/views/xinyue/operations/resource-registry.ts` | 运营中心通用资源的列表列、筛选与操作 |
| `src/views/xinyue/operations/resource-editor-registry.ts` | 通用资源的编辑表单 |
| `src/api/xinyue/` | 管理 API 封装 |
| `src/utils/http/` | 请求封装（Cookie 会话、`X-Xinyue-Request` 头、错误提示） |
| `src/locales/` | 界面文案（中文、英文） |
| `src/components/core/` | Art Design Pro 布局与基础组件 |

菜单可见性受服务端资源权限控制，但隐藏菜单不是安全边界，所有写操作都由服务端 `AdminGuard` 与权限表校验。
