# Xinyue Real-ESRGAN Worker

可选的独立 Worker，能力为 `realesrgan-x2` 与 `realesrgan-x4`。上游权重在首次使用时下载到 `/models`，不提交进 Git。默认使用 CPU。GPU 部署必须换用匹配的 CUDA / PyTorch 基础镜像，并由运维人员自行验证。

生产说明：此 profile 目前未通过发布认证。在当前支持的 PyTorch 镜像上，锁定的 BasicSR / Real-ESRGAN 会导入已删除的 torchvision 模块，且上游存在安全公告。在隔离环境中通过兼容分支审查和漏洞扫描之前，请保持关闭。
