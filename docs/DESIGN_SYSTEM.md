# 设计系统

本文是用户端视觉与交互的约定：令牌从哪里来、五套聊天皮肤如何隔离、组件与样式怎么写。管理端沿用 Art Design Pro + Element Plus + Tailwind CSS 4 的体系，不在本文范围内。

## 1. 令牌架构

`src/styles/tokens.css` 是用户端唯一的令牌来源。明暗主题与聊天皮肤是两个正交维度：

```text
:root                                         暗色（默认）
html[data-studio-theme="light"]               浅色覆盖
html[data-studio-theme="light"] .chat-ui--jixing   季星皮肤·浅色
html:not([data-studio-theme="light"]) .chat-ui--jixing   季星皮肤·暗色
```

主题由 `src/App.vue` 写入 `html[data-studio-theme]`。皮肤作用域只覆盖变量，不改组件结构。

### 1.1 颜色

| 令牌 | 暗色 | 浅色 | 用途 |
| --- | --- | --- | --- |
| `--studio-brand` | `#4d6bfe` | `#4d6bfe` | 全站唯一强调色（季星皮肤为 `#2f6bff` / `#2e6bff`） |
| `--studio-brand-hover` / `-pressed` | `#3d5bee` / `#2f4bdb` | 同 | 悬浮 / 按压 |
| `--studio-brand-soft` / `-soft-strong` | 16% / 28% | 12% / 20% | 选中底、聚焦光晕 |
| `--studio-bg` / `-panel` / `-panel-soft` / `-elevated` | `#000` / `#090909` / `#111` / `#202020` | `#fff` / `#fff` / `#f7f7f8` / `#fff` | 四层表面 |
| `--studio-input` / `-control` / `-control-hover` | `#151515` / `#2b2b2b` / `#363636` | `#fff` / `#f1f1f2` / `#e9e9eb` | 控件 |
| `--studio-line` / `-border` | `#262626` / `#292929` | `#e5e5e5` / `#dedede` | 分隔线 / 描边 |
| `--studio-text` / `-text-secondary` / `-muted` / `-faint` | `#f7f7f7` / `#d0d0d0` / `#a7a7a7` / `#6b6b6b` | `#171717` / `#3f3f46` / `#646464` / `#9a9aa2` | 四级文本 |
| `--studio-danger` / `-success` / `-accent-warm` | 语义色 | 语义色 | 反馈 |
| `--studio-inverse-bg` / `-inverse-text` | 反色 | 反色 | 主按钮 |
| `--studio-bubble-user` | `#2b2b2b` | `#f1f1f2` | 用户消息气泡 |
| `--studio-vendor-*` | — | — | 模型厂商徽标色（openai、anthropic、google、deepseek、qwen、doubao、kimi、zhipu、minimax、hunyuan、stepfun、longcat） |

浅色主题的弱化文字不得低于 WCAG AA（4.5:1），灰字一律用 `--studio-muted`，不要写 `#999` / `#888`。

### 1.2 尺度

| 维度 | 令牌 | 取值 |
| --- | --- | --- |
| 圆角 | `--studio-radius-xs/sm/md/lg/pill` | 6 / 8 / 10 / 18 / 999（季星 8 / 10 / 14 / 20–22） |
| 阴影 | `--studio-shadow-sm` / `-shadow` / `-shadow-lg` | 三档 |
| 字号 | `--studio-text-xs … 4xl` | 12 / 13 / 14 / 16 / 18 / 20 / 24 / 32 |
| 间距 | `--studio-space-1 … 8` | 4 / 8 / 12 / 16 / 20 / 24 / 32 |
| 层级 | `--studio-z-dropdown/sticky/overlay/modal/toast` | 40 / 50 / 60 / 70 / 80 |
| 输入框浮层 | `--studio-z-floating` / `-floating-top` | 1400 / 1401（创作「更多」面板、技能选择器） |
| 动效 | `--studio-duration-fast/base/slow`、`--studio-ease`、`--studio-ease-spring` | 120 / 200 / 320 ms |
| 聊天宽度 | `--studio-chat-width` / `-wide` | 960 / 1080 px |

排版基线：消息正文 15px / 1.7，用户气泡 16px / 1.55，辅助文字 12–13px，页面大标题 27–28px。

## 2. 聊天皮肤

五套皮肤：`gpt`、`doubao`、`qianwen`、`kimi`、`jixing`。管理员在「业务系统配置」中全站切换，存储于 `SystemSetting.chatUiPreset`（默认 `gpt`），用户不能单独切换。

- 布局配置在 `src/layouts/chat-presets.ts#CHAT_LAYOUTS`；`resolveChatUiPreset` 决定首页用哪套，进入会话后消息线程统一使用 `doubao` 线程布局。
- 样式按根节点类名隔离：`.chat-ui--gpt`、`.chat-ui--doubao`、`.chat-ui--qianwen`、`.chat-ui--kimi`、`.chat-ui--jixing`。主要位于 `src/styles/workspace/chat.css`、`foundation.css` 与 `src/styles/skin-jixing.css`。
- 皮肤名只用于区分布局，不代表与对应厂商有合作；界面上不显示其他产品的品牌名称。
- 豆包与千问皮肤的首页内容（问候、推荐、横幅）可在后台单独编辑。
- 修改任何一套皮肤后，必须回归另外四套皮肤首页，以及至少一个进行中的会话。`tests/e2e/ui-sweep.spec.ts` 会覆盖五套首页。

## 3. 核心组件

**输入区（`src/components/chat/ChatComposer.vue`）**

- 聚焦时显示品牌描边与光晕；可发送时发送钮点亮，生成中变为停止钮。
- 移动端（≤640px）单列，上传收为 32px 小圆钮贴在工具栏左端。
- 工具行芯片按实测宽度溢出收进「更多」，窗口变宽自动放回。
- 状态：空、输入中、上传中（附件进度）、生成中、禁用（无可用模型时给出原因）。

**消息流（`ChatMessageItem.vue`、`ChatThread.vue`）**

- 用户消息右对齐气泡，悬停显示复制 / 编辑。
- 助手消息带形变头像（`src/assistant-avatar/`，idle / thinking / responding 三态，历史消息定格）；正文支持 Markdown、表格、KaTeX、代码块（语言标签、折叠、复制）、思考过程折叠、联网引用与追问建议。
- 流式顺序：思考脉冲 → 光标闪烁 → 完成后浮现操作行。

**外壳（`src/components/shell/`）**

- 桌面侧栏 260px，折叠 52px；激活项有 3px 品牌色左指示条与浅底。
- 左侧导航项由站点配置决定（`server/src/common/sidebar-nav.ts`）。
- 移动端抽屉关闭时必须无阴影，否则左缘会留下灰色残影。

**通用组件（`src/components/common/`）**

- `EmptyState.vue`：图标 + 标题 + 一句描述 + 主操作，全站空态统一使用。
- `StatusPill.vue`、`SectionHeader.vue`、`ModelBadge.vue`。

**状态**

- 加载：按钮内 spinner；本地数据切换不强制骨架屏。
- 错误：顶部反馈条或内联反馈条（带重试），不用假数据掩盖失败。
- 日期统一经 `src/utils/datetime.ts` 格式化，不直接调用 `toLocaleString()`。

## 4. 样式约定

- 业务 CSS 一律消费令牌，不硬编码颜色；皮肤采样区中刻意还原的灰值除外，并集中在对应皮肤作用域内。
- 新的层级只能使用 `--studio-z-*`，不要引入新的魔法数；管理端模板自带的 9999 / 2500 一类层级不在用户端复用。
- 同时支持明暗两套主题：写暗色规则时确认浅色下的对比度与背景。
- 所有动效在 `prefers-reduced-motion` 下降级。
- 可交互元素要有可见焦点环；纯图标按钮必须有 `aria-label`；装饰图片使用 `alt=""`。
- 用户端不引入 Tailwind。如果将来引入，只能通过 `@theme` 把工具类桥接到同一批 `--studio-*` 变量，不允许出现第二套色值。

## 5. 样式文件分布

| 文件 | 范围 |
| --- | --- |
| `src/styles/tokens.css` | 令牌 |
| `src/styles/main.css` | 全局基础 |
| `src/styles/workspace/*.css` | 外壳、对话、线程、设置、登录 |
| `src/styles/skin-jixing.css` | 季星皮肤 |
| `src/styles/canvas/*.css` | 画布编辑器与画布库 |
| `src/styles/plugins.css` | 能力中心、技能市场、知识库 |
| `src/styles/office.css`、`prompt-library.css`、`image-prompt.css`、`landing.css`、`legal.css` | 对应页面 |
