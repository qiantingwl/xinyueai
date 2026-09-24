# 更新日志

本文件记录已经发布的版本。当前版本是 1.0.1。

## 1.0.1

首个公开版本后的 Release Candidate 稳定性更新。

### 新增

- 用户工作区、多模型对话、流式响应、会话历史与文件能力。
- 无限画布、图片、视频、商品视觉和异步生成任务。
- 用户、权限、Provider、模型、价格、额度、订单和系统配置管理后台。
- OpenAI Compatible、Anthropic、Gemini 与本地 Worker 接入能力。
- PostgreSQL、Redis、BullMQ、Docker Compose 和首次启动初始化向导。

### 稳定性与账务

- 增加额度 Reservation 生命周期、幂等结算和 Ledger 一致性保护。
- 增加 ProviderAttempt 审计、模型故障切换和 Worker lease fencing。
- 统一 Chat、Image、Video 等生成任务的失败释放与恢复路径。
- 增加健康检查、就绪检查和启动配置校验。

### 安全

- 管理端 RBAC 改为 fail-closed，并保留 SUPER_ADMIN 完整权限。
- 首次初始化使用一次性安装令牌，不提供固定管理员密码。
- 外部 HTTP 请求增加协议、私网地址和重定向逐跳校验。
- 生产启动拒绝空值、示例值和低强度关键配置。
- 默认关闭未经审查的外部 Prompt 与技能市场同步。

## 1.0.0

首次公开版本。

- 提供用户工作区、管理后台、统一 API、Provider 路由和生成任务。
- 提供 Token 额度、创作点、账单流水和会员配置能力。
- 提供 PostgreSQL、Redis、BullMQ、Docker Compose 和一键部署支持。
