# Xinyue AI 开源依赖、参考项目与内容来源

本文记录 Xinyue AI 使用了哪些开源软件，参考了哪些产品，以及提示词、技能、媒体等内容来自哪里、边界在哪里。系统架构与运行链路见 [ARCHITECTURE.md](ARCHITECTURE.md)。

信息依据仓库中的 `package.json`、锁文件、Dockerfile、Compose 与 Worker 配置整理。某项能力如果需要管理员配置、可选 Compose profile 或外部服务，会明确标记，不把可选能力描述为默认可用。

最后核对日期：2026-09-24。

> 本文不是法律意见。许可证、模型权重、媒体、提示词数据和第三方在线服务可能分别适用不同条款；发布或商用前仍需核对对应版本的上游许可证。

## 1. 如何理解“使用”和“参考”

| 类型 | 含义 |
| --- | --- |
| 直接使用 | 代码、包、容器或 Worker 是 Xinyue AI 构建或运行链路的一部分 |
| 移植/改造 | 仓库中存在基于上游源码改造的文件，必须保留上游版权和许可证 |
| 可选集成 | 仓库提供接口或 Compose profile，默认可能不启用 |
| 产品/UI 参考 | 参考信息架构、页面布局、交互或部署思路，不代表复制源码 |
| 内容来源 | 提示词或媒体来自外部站点；内容授权与代码许可证分开判断 |

完整的间接依赖版本以根目录及 `server/package-lock.json`、`admin/pnpm-lock.yaml` 为准；本文重点列出所有直接依赖和影响产品能力的外部项目。

## 2. 系统组成与功能

| 模块 | 当前技术 | 主要功能 |
| --- | --- | --- |
| 用户端 | Vue 3、Vite、Pinia、Vue Router、Naive UI | 登录注册、聊天、模型选择、项目、文件、图片/视频生成、商品视觉、提示词库、作品、账户与设置 |
| 无限画布 | Vue Flow | 节点编辑、连线、缩放、小地图、图片/视频节点、生成任务与画布保存恢复 |
| 管理后台 | Art Design Pro、Vue 3、Element Plus、Pinia | 用户和权限、Provider、模型与路由、定价、任务、订单、账务、内容、系统设置和运维 |
| Backend | NestJS 11、Fastify、Prisma | REST/SSE API、认证、RBAC、模型路由、任务生命周期、资产、支付、审计和系统配置 |
| 队列 | BullMQ、Redis | Generation Job 排队、重试、恢复、取消、Worker lease/fencing 和定时任务 |
| 数据库 | PostgreSQL、Prisma | 用户、会话、项目、任务、ProviderAttempt、Usage、Quota、Reservation、Ledger、订单等持久化 |
| Web 入口 | Nginx | 提供用户端和 Admin 静态文件，将 `/v1/*` 转发到 Backend，并支持 SSE |
| 文件存储 | 本地卷或 AWS S3 兼容接口 | 上传文件、生成结果、对象校验、迁移与下载权限控制 |
| 本地 Worker | FastAPI + 图像项目 | 抠图、擦除/扩图、超分辨率、受控 ComfyUI 工作流 |
| 测试 | Node Test Runner、Playwright、TypeScript | 单元测试、浏览器 E2E、构建检查和 UI 行为审计 |

## 3. 直接采用或明确参考的项目

| 项目 | 关系 | 许可证 | 在 Xinyue AI 中的作用 |
| --- | --- | --- | --- |
| [Art Design Pro](https://github.com/Daymychen/art-design-pro) | 直接采用并二次开发 | MIT | 管理后台的基础工程、布局、菜单和通用组件体系 |
| [Vue Flow](https://github.com/bcakmakoglu/vue-flow) | 直接依赖 | MIT | 无限画布的节点、边、缩放、控制器、小地图和节点尺寸调整 |
| [Lobe Icons](https://github.com/lobehub/lobe-icons) | SVG 品牌图标素材来源 | MIT；Copyright (c) 2023 LobeHub | `public/assets/model-logos/` 的模型厂商 Logo 集合；代码许可不替代各品牌的商标规范 |
| [Bloub](https://github.com/jeremy-prt/bloub) | 头像引擎移植并改造 | MIT；Copyright (c) 2026 Jérémy Perret | `src/assistant-avatar/` 的形变身体、眼睛、视线、表情、状态循环和 Vue 渲染基础；Xinyue 在其上适配聊天 idle/thinking/responding 状态 |
| [VOZEB-PRO](https://github.com/csyqlz/VOZEB-PRO) | 产品、业务流程与 Canvas 参考；未标记直接移植源码 | BUSL-1.1，商业使用受限 | 参考统一创作 Agent、Canvas、持久任务、素材、作品、商业后台和一键部署的产品组织；不得在没有商业授权时复制其受限源码用于商业部署 |
| [VOZEB Canvas 示例](https://www.vozeb.com/canvas/canvas-jssun6C-YNPnWFTCla7sy) | 指定 UI/交互参考页 | 在线产品页面，代码许可证不适用 | 作为画布编辑器、节点组织和任务回填的视觉参考；2026-09-17 未登录访问会跳转登录页，本文不声称已读取其私有画布内容 |
| [LobeHub](https://github.com/lobehub/lobehub) | Agent 产品/UI 与 Skills 生态参考；Skills 市场为可选外部发现源 | 当前仓库入口/API 直接访问返回 404，许可证未核验 | 参考 Agent/Skill 市场、团队式 Agent 组织和工具入口；Backend 可只读发现 LobeHub Skills，安装具体 Skill 前逐项核验许可证 |
| [Aivory](https://github.com/hjxwz123/Aivory) | 产品与架构参考，未声明直接复制源码 | Apache-2.0（按仓库 `LICENSE`） | 参考自托管 AI 工作台、Provider/模型管理、工具与知识能力、管理后台、首次初始化和 Docker 部署的产品组织方式 |
| [OpenTu](https://github.com/ljquan/opentu) | 产品与 Canvas 交互参考，未复制源码 | MIT | 参考以画布为核心的 AI 工作区、生成节点、素材/任务复用、工具窗和办公输出组织；内置技能的选题与分类（流程图、思维导图、信息图、宫格图、条漫等）参考其 Skill 选择器的组织方式，技能提示词与实现均为 Xinyue 自写 |
| [Infinite Canvas](https://github.com/basketikun/infinite-canvas) | 画布交互参考，未复制源码 | MIT | 参考无限画布操作方式；实际画布引擎是 Vue Flow |
| [DailyHotApi](https://github.com/imsyy/DailyHotApi) | 可选容器集成 | 以上游仓库为准 | 为首页推荐提供多站热点聚合；不代替模型联网搜索 |
| [rembg](https://github.com/danielgatis/rembg) | 可选 Worker 直接依赖 | MIT | 本地图片背景移除 |
| [IOPaint](https://github.com/Sanster/IOPaint) | 可选 Worker 直接依赖 | Apache-2.0 | 图片局部擦除和扩图；当前 profile 未发布认证，默认关闭 |
| [Real-ESRGAN](https://github.com/xinntao/Real-ESRGAN) | 可选 Worker 直接依赖 | BSD-3-Clause | 图片 2x/4x 超分辨率；当前 profile 未发布认证，默认关闭 |
| [ComfyUI](https://github.com/comfyanonymous/ComfyUI) | 可选外部服务 | GPL-3.0 | 由受控网关调用管理员审核并只读挂载的工作流；ComfyUI 本体不包含在主应用镜像中 |
| [Coverr](https://coverr.co/) | 媒体素材来源 | Coverr License | 部分视频灵感预览素材，需保留来源记录 |

### Aivory 参考边界

Aivory 是一个自托管 AI 聊天平台，公开能力包括多模型 Provider、工具调用、RAG、Deep Research、工作区、额度与管理后台。Xinyue AI 曾参考其产品和部署组织思路，但当前项目使用 Vue/NestJS/Prisma/BullMQ 技术栈，Aivory 使用 React/Go，并非同一套实现。除非未来实际引入其代码，否则应始终将其标为“参考项目”，不能写成 Xinyue AI 的运行依赖。

### VOZEB-PRO 与 Canvas 参考边界

VOZEB-PRO 公开说明的能力包括统一创作 Agent、图片/视频/音频、Canvas、短剧、作品广场、持久 Worker、模型路由和商业后台，与 Xinyue 的部分产品域存在可比较关系。Xinyue 当前实现仍以本仓库的 Vue 3、NestJS、Prisma、BullMQ、Vue Flow 和独立数据模型为准。VOZEB-PRO 的 BUSL-1.1 明确限制企业生产、商业项目、SaaS、私有化交付和转售；因此本文只记录产品/流程参考，不把它列为开源依赖，也不授予任何复制其源码的权利。

用户指定的 VOZEB Canvas URL 作为单独的 UI 参考链接保留。核对时该页面会重定向到 `https://www.vozeb.com/login`，所以只能确认它属于 VOZEB Canvas 入口，不能根据未登录页面推断具体节点、数据或私有交互。

### LobeHub 参考与集成边界

LobeHub 官网将产品描述为 Agent 团队的组织、调度和报告空间。用户指定的 GitHub 地址在 GitHub 组织仓库列表中可见，但 2026-09-17 对仓库页面、Git clone 和 Repository API 的直接访问均返回 404，许可证无法可靠核验。因此 LobeHub 只作为产品/UI 参考记录，不能据此复制仓库代码。

Xinyue 代码中另有一条独立、可验证的实际集成：`server/src/plugins/external-market.service.ts` 会读取 `lobehub.com/zh/skills` 作为外部 Skill 发现源。发现不等于授权，具体 Skill 始终以 `unreviewed` 风险进入审核流程。

### Bloub 移植边界

`src/assistant-avatar/BloubBot.vue` 与 `gaze.ts` 已明确注明移植自 Bloub，目录内的 engine、shape、profiles、expressions、states、cycles、face、gaze 等共同组成改造后的头像引擎。Bloub 使用 MIT License，版权属于 Jérémy Perret；完整 MIT 声明已加入根目录 `THIRD_PARTY_NOTICES.md`。Bloub 上游同时说明其视觉行为重现了 x.ai 机器人头像，MIT 只覆盖代码，不覆盖 x.ai/Grok 的设计和商标，Xinyue 对外发布时应继续使用自有名称、配色和品牌表述。

## 4. 用户端直接依赖

| 项目/包 | 许可证 | 用途 |
| --- | --- | --- |
| Vue、`@vitejs/plugin-vue` | MIT | 用户端组件系统和单文件组件编译 |
| Vite | MIT | 开发服务器和生产构建 |
| Pinia | MIT | 登录状态、目录、会话和工作区状态管理 |
| Vue Router | MIT | 用户端路由和页面懒加载 |
| Vue I18n | MIT | 多语言文案 |
| Vue Flow：core/background/controls/minimap/node-resizer | MIT | 无限画布及配套控件 |
| Naive UI | MIT | 消息提示和基础 UI 能力 |
| Lucide Vue Next | ISC | 用户端图标 |
| marked、marked-katex-extension | MIT | Markdown 与数学公式渲染 |
| KaTeX | MIT | 数学公式排版 |
| highlight.js | BSD-3-Clause | 代码块语法高亮 |
| DOMPurify | MPL-2.0 OR Apache-2.0 | 清理模型输出 HTML，降低 XSS 风险 |

开发与测试直接依赖：Playwright（Apache-2.0）、TypeScript（Apache-2.0）、tsx（MIT）、vue-tsc（MIT）。

## 5. 管理后台直接依赖

管理后台基于 Art Design Pro 二次开发，运行依赖如下：

| 项目/包 | 许可证 | 用途 |
| --- | --- | --- |
| Vue、Vue Router、Pinia、Vue I18n | MIT | 页面、路由、状态和国际化 |
| Element Plus、Element Plus Icons | MIT | 表格、表单、弹窗、抽屉和后台组件 |
| Tailwind CSS、`@tailwindcss/vite` | MIT | 工具类样式和构建集成 |
| VueUse、Vue Demi、Vue Reactivity | MIT | Vue 组合式工具和响应式能力 |
| Iconify Vue | MIT | 后台图标资源接口 |
| Axios | MIT | 管理 API 请求 |
| ECharts | Apache-2.0 | 仪表盘、用量和运营图表 |
| WangEditor、WangEditor for Vue | MIT | 富文本内容编辑 |
| xgplayer | MIT | 视频预览 |
| vue-img-cutter | MIT | 图片裁剪 |
| vue-draggable-plus | MIT | 拖拽排序 |
| qrcode.vue | MIT | 二维码生成 |
| mitt、ohash、nprogress | MIT | 事件、哈希和页面加载进度 |
| highlight.js | BSD-3-Clause | 代码展示 |
| pinia-plugin-persistedstate | MIT | 后台本地状态持久化 |

构建和质量工具还直接使用 ESLint、Prettier、Stylelint、Sass、Terser、Husky、lint-staged、Commitlint、Commitizen、cz-git、TypeScript、tsx、Vite 及自动导入/组件插件；许可证以 MIT、Apache-2.0、BSD-2-Clause 或 ISC 为主，精确版本见 `admin/package.json` 和 `admin/pnpm-lock.yaml`。

## 6. Backend 直接依赖

| 项目/包 | 许可证 | 用途 |
| --- | --- | --- |
| NestJS core/common/config/platform-fastify | MIT | 后端模块、依赖注入、配置和 Fastify HTTP 服务 |
| Fastify cookie/helmet/multipart | MIT | Cookie、安全响应头和文件上传 |
| NestJS Throttler | MIT | API 与登录限流 |
| NestJS BullMQ、BullMQ | MIT | 队列、重试、调度和 Worker 编排 |
| Prisma Client/CLI | Apache-2.0 | PostgreSQL ORM、Schema 和 Migration |
| ioredis | MIT | Redis 连接、缓存与队列基础连接 |
| LangGraph JS | MIT | Agent 图式执行和流程编排 |
| AWS SDK S3、lib-storage | Apache-2.0 | AWS S3、R2、MinIO、OSS 网关等兼容对象存储 |
| class-validator、class-transformer | MIT | DTO 参数验证与转换 |
| Zod、AJV | MIT | 配置、工具输入和 JSON Schema 验证 |
| Undici | MIT | 受控外部 HTTP 请求和连接策略 |
| sanitize-html | MIT | 服务端 HTML 清理 |
| Cheerio | MIT | 受控页面内容解析 |
| js-tiktoken | MIT | Token 估算与用量回退 |
| Nodemailer | MIT-0 | 邮件验证码和系统邮件 |
| ExcelJS | MIT | XLSX 生成和读取 |
| docx | MIT | DOCX 文档生成 |
| Mammoth | BSD-2-Clause | DOCX 文本提取 |
| officegen | MIT | Office 文件生成补充能力 |
| adm-zip | MIT | ZIP 导入导出 |
| js-yaml | MIT | YAML 配置解析 |
| RxJS、reflect-metadata | Apache-2.0 | NestJS 响应式和元数据基础设施 |
| dotenv | BSD-2-Clause | 本地环境变量加载 |

## 7. 基础设施与容器

| 项目 | 当前用途 | 许可证/注意事项 |
| --- | --- | --- |
| Node.js 22 | 用户端/Admin 构建和 NestJS 运行时 | MIT，包含多个第三方组件声明 |
| Nginx Alpine | 唯一宿主 Web 入口、静态文件、`/v1/*` 代理和 SSE | BSD-2-Clause |
| PostgreSQL 17 | 主业务关系数据库 | PostgreSQL License |
| Redis 7 | BullMQ、缓存和协调 | 必须按实际镜像版本核验；Redis 7.4+ 为 RSALv2/SSPLv1 双许可，不属于标准 OSI 开源许可证 |
| Alpine Linux | PostgreSQL、Redis、Nginx 和辅助初始化镜像基础 | 各组件许可证组合，镜像内清单以上游为准 |
| Docker Engine/Compose | 构建和编排 | Engine/Compose 为 Apache-2.0；Docker Desktop 另有商业许可条件 |

生产 Compose 默认启动 `frontend`、`backend`、`postgres`、`redis` 和一次性的 `uploads-init`。`dailyhot`、`image-worker`、`iopaint-worker`、`realesrgan-worker`、`comfyui-gateway` 均由 profile 显式启用，不是默认必需项。

## 8. Worker 依赖与能力

| Worker | 主要依赖 | 功能 | 默认状态 |
| --- | --- | --- | --- |
| image-tools | FastAPI、Uvicorn、Pillow、python-multipart、rembg | 背景移除；按任务 ID 幂等并支持取消 | 可选，已提供 Compose profile |
| iopaint | FastAPI、IOPaint、OpenCV、Pillow | 局部擦除、蒙版修复和扩图 | 可选，未发布认证，默认关闭 |
| realesrgan | FastAPI、Real-ESRGAN、BasicSR、PyTorch、Torchvision、OpenCV | 图片 2x/4x 清晰化 | 可选，未发布认证，默认关闭 |
| comfyui-gateway | FastAPI、HTTPX、Pillow | 代理管理员审核的 ComfyUI API 工作流，拒绝用户提交任意工作流 | 可选，需另行部署 ComfyUI |

模型权重不会提交到主仓库。权重许可证可能与代码许可证不同，启用 Worker 前必须分别检查模型、训练数据、商用范围和硬件运行环境。

## 9. Prompt 与外部内容来源

提示词库包含 Xinyue 内置快照、站内公开作品和可选外部同步来源。代码将外部来源标记为 `unverified`，默认不联网同步；管理员或部署者确认授权后才能启用。

| 来源 | 类型 | 地址 | 默认策略 |
| --- | --- | --- | --- |
| Xinyue AI 内置提示词 | 图片/视频 | 仓库 `server/prompt-library-data` | 默认可用 |
| Xinyue AI 公开作品 | 图片/视频 | 站内已审核公开作品 | 默认可用 |
| yukkcat/image-prompts | 图片数据聚合 | https://github.com/yukkcat/image-prompts | 作为若干图片来源的标准化分发地址；各条内容仍按原始来源核验 |
| UPMA / awesome-gpt-image-2 | 图片 | https://github.com/freestylefly/awesome-gpt-image-2 | 外部，授权未核验，默认关闭同步 |
| YouMind Image Prompts | 图片 | https://youmind.com/zh-CN/prompts/image | 外部，授权未核验，默认关闭同步 |
| YouMind Nano Banana Pro | 图片 | https://github.com/YouMind-OpenLab/awesome-nano-banana-pro-prompts | 外部，授权未核验，默认关闭同步 |
| Banana Prompt Quicker | 图片 | https://glidea.github.io/banana-prompt-quicker/ | 外部，授权未核验，默认关闭同步 |
| DavidWu Awesome GPT Image 2 | 图片 | https://github.com/davidwuw0811-boop/awesome-gpt-image2-prompts | 外部，授权未核验，默认关闭同步 |
| ZeroLu Awesome GPT Image | 图片 | https://github.com/ZeroLu/awesome-gpt-image | 外部，授权未核验，默认关闭同步 |
| ImgEdify Awesome GPT-4o Image Prompts | 图片 | https://github.com/ImgEdify/Awesome-GPT4o-Image-Prompts | 外部，授权未核验，默认关闭同步 |
| GeneratePrompt Video Prompts | 视频 | https://generateprompt.net/zh/video-prompts | 外部，授权未核验，默认关闭同步 |
| YouMind Video Prompts | 视频 | https://youmind.com/zh-CN/prompts/video | 外部，授权未核验，默认关闭同步 |
| Higgsfield | 视频运镜灵感 | https://higgsfield.ai/ | 本地种子和同步代码中存在来源标记，内容许可需单独核验 |
| jnMetaCode | 视频短片灵感 | 本地种子中仅保留作者标记 | 原始地址和内容许可需在发布前补充核验 |

`server/prompt-library-data` 中的发布快照仍保留原始 `sourceId`，其中部分条目来源于上述外部集合；将快照随程序分发并不会自动获得原内容许可。“能公开访问”不等于“允许重新分发或商用”，代码许可证也不会自动覆盖提示词文本、图片、视频、人物形象、商标或用户上传内容。

## 10. 外部协议与服务兼容

以下属于接口兼容或用户自行配置的第三方服务，不表示仓库包含其服务端代码：

- OpenAI Compatible、Anthropic、Gemini 等模型 API 协议；
- S3、Cloudflare R2、MinIO、兼容 OSS 网关等对象存储；
- SMTP 邮件服务、OAuth/OIDC 登录来源和支付渠道；
- 外部 Tool、Webhook、搜索服务和用户 BYOK Provider；
- 管理员部署的 ComfyUI 或本地 Worker。

Provider 密钥只应存放于服务端加密字段或部署环境中。使用第三方模型、支付、OAuth、搜索和对象存储时，部署者需要遵守相应服务条款、数据处理要求和地区法规。

### 10.1 Provider 与模型协议

| 外部项目/服务 | 关系 | Xinyue 中的实现 |
| --- | --- | --- |
| OpenAI / OpenAI Compatible | API 协议兼容 | Chat/Image 兼容请求、流式响应、原生搜索和模型发现 |
| Anthropic Claude | API 协议兼容 | Anthropic Header、消息格式、流式事件与工具调用适配 |
| Google Gemini | API 协议兼容 | Gemini REST 格式、模型与原生搜索配置 |
| xAI | OpenAI 兼容 Provider 模板 | 模型目录、Chat 与原生搜索配置；不代表使用其 UI 代码 |
| DeepSeek | OpenAI 兼容 Provider 模板 | Chat/Reasoning 模型配置和 UI 模型标识 |
| 阿里云百炼/Qwen | OpenAI 兼容 Provider 模板 | Chat、模型目录和原生搜索配置 |
| 火山方舟/Doubao | OpenAI 兼容 Provider 模板 | Chat、图片/视频能力配置和原生搜索配置 |
| NewAPI | OpenAI 兼容中转协议 | 渠道发现、原生联网与模型调用 |
| Sub2API | OpenAI 兼容中转及账户连接 | Provider 调用、OAuth/账户信息与视频参数差异适配 |
| OpenRouter | OpenAI 兼容 Provider 模板 | 多模型路由入口 |
| LiteLLM | 模型价格目录和可选兼容网关 | 读取 `model_prices_and_context_window.json`，用于模型能力/成本参考和后台定价预览 |
| Pollinations | 可选免密图片 Provider | 服务端构造受控图片 URL，校验返回类型、大小和图片签名 |

这些名称主要描述兼容协议与预置模板。模型商标、API 可用区、数据留存和价格都由相应供应商决定。

### 10.2 外部 Skill 与目录来源

| 来源 | 实际用途 | 安全与授权策略 |
| --- | --- | --- |
| [LobeHub Skills](https://lobehub.com/zh/skills) | 搜索和读取公开 `SKILL.md` 条目 | 来源标为 restricted/unreviewed，安装前人工核验具体 Skill |
| [SkillHub](https://www.skillhub.cn/skills) | 通过公开 API 发现 Skill | 条目许可证不统一，逐项核验 |
| [SkillsMP](https://skillsmp.com/zh/occupations) | 搜索索引并定位 GitHub 仓库 | 索引不是授权，只允许受控 GitHub/raw URL |
| [CocoLoop](https://hub.cocoloop.cn/) | 搜索 Skill 与可选 ZIP 下载 | 安全评级不等于许可证，下载仍需审核 |
| GitHub/raw.githubusercontent.com | 读取经过白名单解析的 Skill 源文件 | 校验 owner/repo/branch/path，禁止任意 URL 和内网目标 |

外部市场只负责“发现”。安装时仍要验证来源域名、重定向、下载体积、ZIP 路径、Skill 内容和许可证；管理员审核后才可启用。

### 10.3 搜索、工作流、认证与支付服务

| 服务 | 类型 | 默认状态与用途 |
| --- | --- | --- |
| SearXNG | 自托管搜索 | 预置但关闭；管理员填写实例地址并启用 JSON 输出 |
| Tavily | 托管搜索 API | 预置但关闭；配置 API Key 后用于联网检索 |
| Google Serper | 托管 Google 搜索 API | 预置但关闭；支持地区和语言参数 |
| Brave Search | 托管搜索 API | 预置但关闭；支持普通网页与新闻检索 |
| Exa | 托管语义搜索 API | 预置但关闭；返回正文摘要与可选域名过滤 |
| DailyHotApi / TGMeng Trend API | 热点推荐聚合 | 用于首页热点和搜索回退，不等于模型搜索能力 |
| n8n | 外部工作流 Tool | 默认关闭，配置 Webhook、鉴权头并要求审批后使用 |
| Dify | 外部 Workflow Tool | 默认关闭，配置 Workflow API 与 Bearer Key 后使用 |
| FastGPT | 外部应用 Tool | 默认关闭，配置应用 API 与 Bearer Key 后使用 |
| Linux.do | OAuth 登录来源 | 默认关闭；启用后使用 state、PKCE、回调校验和邮箱绑定 |
| Stripe | 支付和退款网关 | 管理员配置 Secret/Webhook Secret；服务端验签和幂等入账 |
| 易支付兼容网关 | 支付和退款协议 | 管理员提供公网 API、PID 与密钥；服务端校验签名 |
| 自定义外部收银台/人工收款 | 可选支付渠道 | 由管理员创建并承担渠道与对账责任 |

上述服务均不是默认运行依赖。外部 Endpoint、Webhook 和返回的资源地址继续经过出站 URL/SSRF 策略；密钥只在服务端加密保存。

## 11. 产品界面参考

当前 UI 参考来源分为三层：直接采用/移植的代码、明确的产品与页面参考，以及开发期通过真实浏览器观察得到的交互样本。除 Art Design Pro 和 Bloub 外，下表均不表示复制第三方源码。

### 11.1 用户指定并确认的产品参考

| 产品/页面 | 参考范围 | Xinyue 的独立实现 |
| --- | --- | --- |
| [VOZEB-PRO](https://github.com/csyqlz/VOZEB-PRO) | 统一创作入口、Canvas、持续任务、素材与作品、商业后台、安装向导 | Vue 用户端 + NestJS 模块化 Backend + BullMQ Generation/Agent/Export 队列；不采用其 Next.js 全栈实现 |
| [VOZEB Canvas 示例](https://www.vozeb.com/canvas/canvas-jssun6C-YNPnWFTCla7sy) | 画布页面层级、节点式创作和结果回填的视觉方向 | `CanvasEditorPage.vue` + Vue Flow + `CanvasDocument` + Generation SSE；私有示例内容未被抓取或内置 |
| [LobeHub](https://github.com/lobehub/lobehub) / [官网](https://lobehub.com/) | Agent 团队、Skill 生态、助手/工具入口、工作空间组织 | Assistant/Plugin/Tool/KnowledgeBase/AgentTask 数据模型与 Xinyue 自有管理页面；外部 Skills 只作发现源 |
| [Aivory](https://github.com/hjxwz123/Aivory) | 多模型聊天、工具链、知识库、团队空间、额度和管理后台 | Provider 路由、Tool Loop、项目/团队、TokenQuota/Ledger 和 Admin 资源体系 |
| [OpenTu](https://github.com/ljquan/opentu) | Canvas 核心工作区、生成节点、素材/任务复用、PPT/内容工作流、Skill 选择器的分类与开箱即用组织 | Vue Flow 画布、JobOutput/Asset、办公技能、ExportJob 与内置预装技能；未采用其 React/Plait 代码 |
| [Bloub](https://github.com/jeremy-prt/bloub) | 形变头像的状态、视线与动画引擎 | `src/assistant-avatar/` 基于 MIT 源码移植，并映射为 Xinyue 聊天状态 |

### 11.2 聊天首页与消息界面参考

仓库实现了 `gpt`、`doubao`、`qianwen`、`kimi`、`jixing` 五套可配置 Chat UI preset。名称用于区分布局采样，不代表与对应厂商存在合作或认证。

| 参考产品 | 已采用的设计输入 | 没有采用/必须保持的边界 |
| --- | --- | --- |
| ChatGPT | 简洁对话层级、居中 Composer、消息 Markdown/代码块、附件和工具入口的通用习惯 | 未使用 OpenAI 前端源码、图标资产或官方品牌外观；`gpt` 只是内部 preset 键 |
| 豆包 | 问候区、推荐问题、Composer 工具行、更多菜单、移动端快捷操作密度；五个内置图片工具按官方示例分类组织 | 推荐逻辑和工具执行来自 Xinyue；`public/assets/doubao-tools/` 的本地示例图需单独核验素材授权，不因代码开源自动获得商用权 |
| Kimi | 大标题/Composer/能力胶囊三层结构、黑白灰密度、快速/进阶模式位置 | 模型路由与业务状态完全由 Xinyue 实现 |
| 通义千问/Qwen | 居中问候、工具滚动轨、工作助理/图片/视频/PPT 能力入口组织 | `qianwen` 为布局 preset；Provider 模板与 UI 参考是两件事 |
| DeepSeek | 克制的品牌蓝、推理内容层级和流式思考呈现方式 | UI 审计记录显示当时实时首页受登录墙限制；没有声明像素级复制或源码使用 |
| xAI/Grok | 通过 Bloub 上游间接观察的形变机器人视觉行为 | MIT 只覆盖 Bloub 代码，不覆盖 xAI 视觉设计或商标；Xinyue 必须保持自有品牌表达 |
| Xinyue `jixing` | 在上述交互规律上形成的自有导航、主题 Token、蓝白视觉、任务中心与创作工作区 | 是默认自有皮肤，不应继续显示其他产品品牌名称 |

当前的令牌、皮肤与组件约定见 [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md)；本文只保留仍影响实现的参考关系。

### 11.3 管理端与画布参考

| 范围 | 参考/基础 | 当前实现 |
| --- | --- | --- |
| 管理端基础布局 | Art Design Pro | 直接二次开发其路由壳、布局、菜单和基础组件，再加入 Xinyue 业务页面、权限资源和 API |
| 表格/表单/弹窗 | Element Plus 与 Art Design Pro 组件范式 | 用户、Provider、模型、定价、任务、支付、内容、Agent、审计等页面统一交互 |
| 无限画布引擎 | Vue Flow | 节点、边、缩放、MiniMap、Controls 和 Node Resizer |
| Canvas 产品方向 | VOZEB Canvas、OpenTu、Infinite Canvas | 项目库、节点创建、连线、生成节点、SSE 回填、自动保存、导入导出和移动端工具栏 |
| 头像动效 | Bloub | idle/thinking/responding、历史消息定格和视线交互 |
| 主题 SVG 辅助组件 | Art Design Pro 代码中的 [IconPark 插画 13](https://iconpark.oceanengine.com/illustrations/13) 来源注释 | `admin/src/components/core/theme/theme-svg/index.vue` 对传入 SVG 做清理和主题色映射；当前组件不固定打包该在线插画 |

### 11.4 品牌和商标说明

OpenAI、ChatGPT、Anthropic、Claude、Gemini、xAI、Grok、DeepSeek、Qwen、通义、豆包、Kimi、Midjourney、Flux、Notion、VOZEB、LobeHub、Aivory、OpenTu 等名称归各自权利人所有。模型徽标、Provider 名称和兼容协议用于帮助用户识别连接目标；对外发行时不得暗示官方合作、授权、认证或品牌从属。

`public/assets/model-logos/` 来自 Lobe Icons 的 MIT 图标集合，MIT 许可覆盖素材文件的复制和修改，但不授予底层模型品牌商标权。`public/connectors/` 还包含 Notion、GitHub、Stripe、Tavily、飞书、钉钉、企业微信、WPS、Google Workspace、Supabase、Neon、HubSpot 等连接器标识；当前目录没有逐文件来源清单，应按识别用途使用，并在公开发行前补齐每个品牌的来源与商标规范核验。

## 12. 功能与开源项目的对应关系

| 产品功能 | 主要实现/项目 |
| --- | --- |
| 多模型聊天与 SSE | Vue、NestJS、Fastify、RxJS、Provider 协议适配 |
| 模型路由、重试和 failover | NestJS 服务、Prisma、BullMQ、Redis |
| Token、额度和账务 | js-tiktoken、Prisma、PostgreSQL，以及项目自有的 Reservation/Ledger 逻辑 |
| 文件上传和资产 | Fastify Multipart、本地卷、AWS SDK S3 |
| 无限画布 | Vue Flow 全家桶；产品交互参考 VOZEB Canvas、OpenTu、Infinite Canvas |
| Markdown、代码和公式 | marked、DOMPurify、highlight.js、KaTeX |
| Agent 与工具 | LangGraph、AJV/Zod、项目自有 Tool/Plugin 协议；产品参考 LobeHub/Aivory，外部发现接入 LobeHub Skills、SkillHub、SkillsMP、CocoLoop |
| 办公文件 | docx、ExcelJS、Mammoth、officegen、adm-zip |
| 邮件登录 | Nodemailer |
| Admin 表格、表单和图表 | Art Design Pro、Element Plus、ECharts、WangEditor |
| 助手头像 | 基于 Bloub MIT 源码移植的 Xinyue 头像引擎 |
| 图片工具 | rembg、IOPaint、Real-ESRGAN、ComfyUI 可选 Worker |
| 热点推荐 | DailyHotApi 可选服务 |
| 模型价格目录 | LiteLLM `model_prices_and_context_window.json` 加本地回退表 |
| 浏览器 E2E | Playwright |
| 容器化部署 | Docker Compose、Nginx、PostgreSQL、Redis |

### 12.1 参考输入到实际代码的落点

| 参考输入 | Xinyue 源码落点 | 数据/状态落点 |
| --- | --- | --- |
| 多产品 Chat UI | `src/components/chat/`、`ChatComposer.vue`、`src/styles/workspace/chat.css`、`foundation.css`、`skin-jixing.css` | `SystemSetting.chatUiPreset` 和前端 preset 状态 |
| VOZEB/OpenTu Canvas | `src/views/CanvasEditorPage.vue`、`src/composables/canvas/`、`src/components/CanvasAgentDialog.vue`、`CanvasMediaDialog.vue`、`src/styles/canvas/shell.css`、`agent.css`、`surface.css`、`server/src/canvases/` | CanvasDocument、GenerationJob、JobOutput、Asset |
| Bloub 头像 | `src/assistant-avatar/`、`ChatMessageItem.vue` | 前端 idle/thinking/responding 状态，不写入服务端业务数据 |
| Aivory/LobeHub Agent 组织 | `server/src/agent-tasks/`、`plugins/`、Admin Agent/Operations 页面 | Assistant、Plugin、ToolDefinition、KnowledgeBase、AgentTask/Step/Event/ToolCall |
| OpenTu Skill 组织 | `server/src/plugins/default-skill-presets.ts`、`plugin-preinstall.ts`、`src/views/PluginMarketPage.vue`、`src/components/PluginSelector.vue` | PluginCategory、Plugin（`config.preinstalled`）、PluginInstallation |
| VOZEB/Aivory 商业运营思路 | `server/src/subscriptions/`、`payments/`、`commerce/`、`commercial/`、Admin Commerce 页面 | SubscriptionPlan、UserSubscription、RechargeOrder、PaymentTransaction、CouponTemplate、CreditLedger、InvoiceRequest |
| Art Design Pro | `admin/src/components/core/`、`admin/src/router/`、`admin/src/views/` | Admin 前端状态；业务权威数据仍由 NestJS/Prisma 提供 |
| LiteLLM 价格目录 | `model-discovery.service.ts`、`provider-pricing.service.ts` | ModelPreset、ModelPriceVersion、GenerationJob.pricingSnapshot |
| 外部 Prompt 来源 | `server/src/prompt-templates/` | PromptLibrarySourceConfig、ItemOverride、缓存快照 |

参考关系只说明设计输入。任务幂等、Worker fencing、SSRF、Public DTO、Reservation/Ledger、RBAC、Migration 和恢复机制均为 Xinyue 当前代码中的独立实现，不能归因于某个 UI 参考项目。

## 13. 维护和合规要求

1. 升级直接依赖时同时更新锁文件，并检查许可证是否发生变化。
2. 分发经过修改的 MIT、Apache-2.0、BSD 等项目时，保留原版权与许可证文本。
3. VOZEB-PRO、VOZEB Canvas、LobeHub、Aivory、OpenTu、Infinite Canvas 等仅参考项目必须保持“参考”表述；实际引入源码后再补充文件级归属和修改说明。VOZEB-PRO 为 BUSL-1.1，未经商业授权不得将其受限源码用于商业部署。
4. Bloub 属于已经移植的 MIT 代码，不是普通参考；分发时必须保留 Jérémy Perret 的版权与 MIT 条款，并避免暗示与 x.ai/Grok 存在关联。
5. 外部 Prompt、Skill、媒体和模型权重上线前逐项确认转载、再分发和商业使用权限。
6. Redis 镜像升级时核实实际版本及许可证；如发行政策要求 OSI 开源组件，应评估固定 Redis 7.2 或迁移到 Valkey。
7. 使用 Docker Desktop 的组织应单独核对 Docker Desktop 订阅条款。
8. 自动生成完整软件物料清单时，应从锁文件和最终容器镜像生成 SBOM，而不是只依赖本文。

相关文件：

- [`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md)：第三方声明摘要
- [`README.md`](../README.md)：产品与快速开始
- [`docs/ARCHITECTURE.md`](ARCHITECTURE.md)：系统架构与运行链路
- [`docs/DEPLOYMENT.md`](DEPLOYMENT.md)：部署与运维
- [`docs/WORKER_PROTOCOL.md`](WORKER_PROTOCOL.md)：本地 Worker 协议
- [`SECURITY.md`](../SECURITY.md)：安全策略
