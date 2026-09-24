# Xinyue IOPaint Worker

可选的独立 Worker，能力为 `iopaint-inpaint` 与 `iopaint-outpaint`。鉴权、幂等和取消语义与抠图 Worker 相同。模型在运行时下载到 `/models`，不进入 Git。

生产说明：此 profile 目前未通过发布认证。IOPaint 1.6.0 锁定了较旧的 FastAPI / Pillow 组合，与已修补的 Worker 基线冲突。在依赖或源码兼容更新通过导入、`pip check`、漏洞扫描和推理测试之前，请保持关闭。不要为了凑一条路由配置而启用它。

默认 CPU 模型是 `lama`。只有在运维人员核验过模型和硬件后，才调整 `IOPAINT_MODEL` 与 `DEVICE`。
