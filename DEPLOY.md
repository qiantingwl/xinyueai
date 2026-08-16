# Docker 部署与更新指南

## 首次部署

```bash
# 1. 确保 .env.production 文件存在且配置正确
# 2. 构建并启动所有服务
docker compose -f docker-compose.prod.yml up -d --build
```

启动后访问 `http://localhost` 进入安装向导。

**安装向导填写说明：**

| 字段 | 值 |
|------|-----|
| 安装密钥 | 查看后端日志获取（见下方） |
| 数据库 URL | `postgresql://flux:<POSTGRES_PASSWORD>@postgres:5432/flux_studio` |
| Redis URL | `redis://redis:6379` |

获取安装密钥：
```bash
docker logs xinyueai-backend-1 2>&1 | grep -i "install"
```

---

## 日常代码更新

### 改了前端或后端代码（最常用）

```bash
docker compose -f docker-compose.prod.yml up -d --build backend frontend
```

### 只改了后端

```bash
docker compose -f docker-compose.prod.yml up -d --build backend
```

### 只改了前端

```bash
docker compose -f docker-compose.prod.yml up -d --build frontend
```

---

## 改了 Prisma Schema（新增字段/枚举）

```bash
# 1. 手动在 server/prisma/migrations/ 下创建迁移 SQL 文件
#    目录命名格式：YYYYMMDDHHMMSS_描述/migration.sql

# 2. 重新构建后端
docker compose -f docker-compose.prod.yml up -d --build backend

# 3. 执行数据库迁移（替换 <POSTGRES_PASSWORD> 为实际密码）
docker compose -f docker-compose.prod.yml exec backend sh -c \
  "DATABASE_URL=postgresql://flux:<POSTGRES_PASSWORD>@postgres:5432/flux_studio npx prisma migrate deploy"
```

---

## 完整重置（清空数据重新部署）

> ⚠️ 危险操作，会清空所有数据

```bash
# 停止并删除所有容器和数据卷
docker compose -f docker-compose.prod.yml down -v

# 重新构建并启动
docker compose -f docker-compose.prod.yml up -d --build
```

---

## 常用运维命令

```bash
# 查看所有容器状态
docker compose -f docker-compose.prod.yml ps

# 实时查看后端日志
docker compose -f docker-compose.prod.yml logs -f backend

# 实时查看所有服务日志
docker compose -f docker-compose.prod.yml logs -f

# 重启某个服务（不重新 build）
docker compose -f docker-compose.prod.yml restart backend

# 进入后端容器 shell
docker compose -f docker-compose.prod.yml exec backend sh
```

---

## 提交代码 + 更新部署（完整流程）

```bash
# 1. 提交代码
git add -A
git commit -m "feat: 描述改动内容"
git push origin Q

# 2. 重新构建并部署
docker compose -f docker-compose.prod.yml up -d --build backend frontend
```

---

## 注意事项

- **不需要停止服务**再 build，`up -d --build` 会自动替换运行中的容器
- Docker 有**层缓存机制**，只重新编译变化的部分，通常 2-3 分钟完成
- 改了 `package.json` 依赖后 build 时间会更长（需重新安装依赖）
- `.env.production` 文件不要提交到 Git（已在 `.gitignore` 中忽略）
