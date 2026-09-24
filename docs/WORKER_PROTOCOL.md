# Xinyue Local Worker 协议

本文定义独立图片工具 Worker 与 Xinyue AI 的最小稳定协议。计费和执行顺序以当前版本 API 契约为准。

## 1. 边界

- Worker 只执行算法，不管理用户、套餐、创作点、项目、文件库或审计。
- Xinyue NestJS 创建 `GenerationJob`、执行权限和额度预检；`generation` 队列的 Processor 通过 HTTP 调用 Worker，并把结果写入 `Asset`。Worker 不接触 BullMQ 或数据库。
- Worker 只能由管理员配置，不能作为用户 BYOK 渠道。
- 推荐仅暴露在 Docker 内网或受控私网；可选 Bearer Token 由管理员渠道保存。
- 模型文件、缓存和 GPU 运行目录不进入主 Git 仓库或主应用镜像。

## 2. 基础地址

管理端填写 Worker 根地址，例如：

```text
http://image-worker:8080
```

Xinyue 会规范化为 `http://image-worker:8080/v1`，随后调用以下接口。

## 3. 健康检查

```http
GET /v1/health
```

成功响应必须是 `2xx`。建议返回：

```json
{
  "ok": true,
  "version": "1.0.1",
  "device": "cuda",
  "queueDepth": 0
}
```

## 4. 能力发现

```http
GET /v1/models
```

```json
{
  "data": [
    { "id": "rembg", "name": "智能抠图" },
    { "id": "iopaint-inpaint", "name": "局部擦除" },
    { "id": "iopaint-outpaint", "name": "智能扩图" },
    { "id": "realesrgan-x4", "name": "4 倍清晰化" },
    { "id": "comfyui:product-v1", "name": "商品视觉工作流" }
  ]
}
```

`id` 会作为模型路由的 `upstreamModel`，必须稳定且不能复用为不同算法。

## 5. 图片处理

```http
POST /v1/process
Content-Type: multipart/form-data
X-Xinyue-Task-Id: <GenerationJob.id>
Authorization: Bearer <optional-token>
```

字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `model` | string | `/models` 返回的稳定能力 ID |
| `prompt` | string | 用户提示词和已授权技能要求 |
| `task_id` | string | 幂等任务标识 |
| `options` | JSON string | 尺寸、质量、格式、背景和压缩参数 |
| `input` | file[] | 0 至 4 张输入图；抠图、擦除、扩图、放大必须校验数量 |
| `mask` | file | 可选蒙版 |

Worker 必须按 `task_id` 幂等：相同任务重试时返回同一结果或同一执行状态，不能重复占用 GPU 生成多份结果。

成功时可以直接返回 `image/png`、`image/jpeg` 或 `image/webp`；也可以返回 OpenAI 图片兼容 JSON：

```json
{
  "data": [
    { "b64_json": "..." }
  ]
}
```

也允许返回 Xinyue 后端可访问的临时 `url`。临时 URL 不得公开长期有效，最终文件仍由 Xinyue 下载并写入自己的资产存储。

错误响应必须使用明确 HTTP 状态和简短信息：参数错误 `400`，模型未加载 `503`，队列过载 `429`，执行失败 `500`。不要用 `200` 包装失败。

## 6. 取消任务

```http
POST /v1/tasks/:task_id/cancel
Authorization: Bearer <optional-token>
```

Worker 应立即记录取消标记并尽力终止尚未开始或支持中断的计算。底层推理无法立即中断时，完成后必须丢弃结果，不得把已取消任务写入幂等结果缓存。重复取消应保持幂等；任务已经结束或不存在时可返回 `404` 或 `409`，Xinyue 仍会保持站内任务为已取消并丢弃迟到结果。

## 7. 首批适配

| 能力 ID 建议 | 开源项目 | 输入约束 |
| --- | --- | --- |
| `rembg` | `danielgatis/rembg` | 1 张输入图 |
| `iopaint-inpaint` | `Sanster/IOPaint` | 1 张输入图和 1 张蒙版 |
| `iopaint-outpaint` | `Sanster/IOPaint` | 1 张输入图和扩展参数 |
| `realesrgan-x2/x4` | `xinntao/Real-ESRGAN` | 1 张输入图 |
| `comfyui:<workflow>` | ComfyUI | 仅允许管理员登记的工作流和参数白名单 |

当前仓库提供四个互相隔离的实现：

| 服务 | 目录 | Compose profile | 说明 |
| --- | --- | --- | --- |
| 背景移除 | `workers/image-tools` | `image-tools` | `rembg`，CPU 默认 |
| 擦除与扩图 | `workers/iopaint` | `iopaint` | IOPaint，默认 `lama` CPU 模型；当前未认证，默认禁用 |
| 清晰化 | `workers/realesrgan` | `realesrgan` | Real-ESRGAN x2/x4，首次调用下载权重；当前未认证，默认禁用 |
| 图片工作流 | `workers/comfyui-gateway` | `comfyui` | 只执行只读挂载的管理员白名单工作流 |

每个服务都需要单独建立 `LOCAL_WORKER` 渠道。不要把多个服务填写成同一个地址，也不要将 Worker 端口直接暴露到公网。

ComfyUI 网关不接受用户提交工作流 JSON。管理员必须从自己的 ComfyUI 导出 API 格式工作流，逐个审查节点和模型，再按网关 README 的绑定清单挂载；修改白名单后重启网关。IOPaint、Real-ESRGAN 和 ComfyUI 的模型文件均保存在运行卷或外部服务中，不进入主仓库。

接入时在管理端执行：创建本地 Worker 渠道、检测发现能力、为每个能力建立图片模型、配置真实能力矩阵与创作点、绑定模型路由、最后发布对应创作工具。未通过健康检查的路由不会出现在用户模型目录。
