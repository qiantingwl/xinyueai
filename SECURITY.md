# Security Policy

## Reporting a vulnerability

请不要在公开 Issue、讨论区或 Pull Request 中披露可利用的安全漏洞。请
通过 [Xinyue AI GitHub 仓库](https://github.com/qiantingwl/xinyueai) 私下联系维护者，
并提供复现步骤、受影响版本、影响范围和必要的日志片段。请先删除或打码
所有密钥、Cookie、用户数据和服务器地址。

优先报告以下问题：

- 身份认证绕过、会话固定或管理员登录问题；
- 权限越权、跨工作区数据访问和敏感资源暴露；
- SSRF、任意网络访问、命令执行和文件写入；
- Token、Provider API Key、支付密钥或凭据泄露；
- 计费、额度、幂等和退款逻辑可被绕过；
- 生产环境配置、备份或上传文件泄露。

## Do not include secrets

不要提交真实 API Key、数据库备份、生产日志、用户上传内容、`.env` 文件、
支付凭据或可访问生产环境的账号信息。发现泄露时，应立即撤销并轮换凭据，
然后再联系维护者。

## Security design

系统的安全边界说明见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)：全局默认拒绝的鉴权（第 2.2 节）、出站 SSRF 防护（第 4.4 节）、公开 DTO 脱敏（第 6 节）与账务幂等（第 7 节）。生产 egress 策略与 HTTPS 配置见 [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)。

## Supported versions

默认只对最新 `main` 和最近一次发布版本处理安全修复。旧版本请先升级到
最新版本并重新验证配置；数据库迁移前务必完成备份。
