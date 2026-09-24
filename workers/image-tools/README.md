# Xinyue 图片工具 Worker

这个容器按 Xinyue Local Worker 协议提供 `rembg` 抠图。它与 NestJS API 分开构建，模型缓存和本地推理依赖不会进入主应用镜像。

启动：

```bash
docker compose --profile image-tools --env-file .env.production -f docker-compose.prod.yml up -d --build image-worker
```

然后在管理端创建 `LOCAL_WORKER` 渠道：

```text
Base URL: http://image-worker:8080
Token: LOCAL_WORKER_TOKEN 的值（必填；缺失时 Worker 拒绝启动）
```

执行渠道检测，用发现的 `rembg` 能力创建图片模型，绑定路由、设置价格，并发布对应图片工具。

幂等结果默认在 `/data/results` 保留七天。模型下载目录是 `/home/worker/.u2net`。生产 Compose profile 把这两个目录做成 Docker Volume。
