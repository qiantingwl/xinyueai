import type { ResourceConfig } from './resource-types'

export const operationResources: Record<string, ResourceConfig> = {
  credits: {
    title: '额度流水',
    description: '追踪充值、赠送、消耗和人工调整',
    icon: 'ri:coins-line',
    endpoint: '/v1/admin/credits/ledger',
    columns: [
      { key: 'account.user.displayName', label: '用户', minWidth: 140 },
      { key: 'account.user.email', label: '邮箱', minWidth: 190 },
      { key: 'type', label: '类型', width: 110, type: 'status' },
      { key: 'amount', label: '变动', width: 110, type: 'number' },
      { key: 'description', label: '原因', minWidth: 180 },
      { key: 'createdAt', label: '时间', width: 175, type: 'date' }
    ]
  },
  jobs: {
    title: '生成任务',
    description: '查看模型调用、运行状态和失败原因',
    icon: 'ri:task-line',
    endpoint: '/v1/admin/jobs',
    columns: [
      { key: 'user.displayName', label: '用户', minWidth: 130 },
      { key: 'kind', label: '类型', width: 105, type: 'status' },
      { key: 'model', label: '模型', minWidth: 150 },
      { key: 'provider', label: '渠道', minWidth: 130 },
      { key: 'status', label: '状态', width: 110, type: 'status' },
      { key: 'creditCost', label: '点数', width: 90, type: 'number' },
      { key: 'createdAt', label: '创建时间', width: 175, type: 'date' }
    ]
  },
  assets: {
    title: '文件与资产',
    description: '管理用户上传文件和生成结果',
    icon: 'ri:image-line',
    endpoint: '/v1/admin/assets',
    columns: [
      { key: 'name', label: '文件名', minWidth: 210 },
      { key: 'user.displayName', label: '用户', minWidth: 130 },
      { key: 'kind', label: '类型', width: 110, type: 'status' },
      { key: 'mimeType', label: 'MIME', minWidth: 150 },
      { key: 'size', label: '大小', width: 100, type: 'bytes' },
      { key: 'project.name', label: '项目', minWidth: 120 },
      { key: 'createdAt', label: '创建时间', width: 175, type: 'date' }
    ]
  },
  projects: {
    title: '项目与工作流',
    description: '审查用户项目、工作流配置和版本历史',
    icon: 'ri:git-branch-line',
    endpoint: '/v1/admin/projects',
    columns: [
      { key: 'name', label: '项目名称', minWidth: 190 },
      { key: 'user.displayName', label: '用户', minWidth: 130 },
      { key: 'user.email', label: '邮箱', minWidth: 190 },
      { key: 'workflowStatus', label: '工作流状态', width: 120, type: 'status' },
      { key: 'revision', label: '修订', width: 80, type: 'number' },
      { key: '_count.assets', label: '资产', width: 80, type: 'number' },
      { key: '_count.conversations', label: '对话', width: 80, type: 'number' },
      { key: '_count.versions', label: '版本', width: 80, type: 'number' },
      { key: 'updatedAt', label: '更新时间', width: 175, type: 'date' }
    ]
  },
  inspirations: {
    title: '灵感内容',
    description: '管理前台灵感卡片、封面和预览素材',
    icon: 'ri:lightbulb-line',
    endpoint: '/v1/admin/inspirations',
    columns: [
      { key: 'imageUrl', label: '封面', width: 118, type: 'image' },
      { key: 'title', label: '名称', minWidth: 190 },
      { key: 'mode', label: '场景', width: 120, type: 'status' },
      { key: 'badge', label: '角标', width: 110 },
      { key: 'model', label: '指定模型', minWidth: 140 },
      { key: 'enabled', label: '状态', width: 100, type: 'status' },
      { key: 'sortOrder', label: '排序', width: 90, type: 'number' },
      { key: 'updatedAt', label: '更新时间', width: 175, type: 'date' }
    ]
  },
  imageTools: {
    title: '图片工具',
    description: '管理 AI 抠图、擦除、扩图和清晰化等前台快捷工具',
    icon: 'ri:image-edit-line',
    endpoint: '/v1/admin/inspirations?mode=IMAGE_TOOL',
    columns: [
      { key: 'imageUrl', label: '封面', width: 118, type: 'image' },
      { key: 'title', label: '工具名称', minWidth: 190 },
      { key: 'options.inputMode', label: '素材方式', width: 130, type: 'status' },
      { key: 'model', label: '指定模型', minWidth: 140 },
      { key: 'enabled', label: '状态', width: 100, type: 'status' },
      { key: 'sortOrder', label: '排序', width: 90, type: 'number' },
      { key: 'updatedAt', label: '更新时间', width: 175, type: 'date' }
    ]
  },
  promptTemplates: {
    title: '提示词模板',
    description: '管理前台可直接使用的提示词模板',
    icon: 'ri:file-text-line',
    endpoint: '/v1/admin/prompt-templates',
    columns: [
      { key: 'title', label: '模板名称', minWidth: 200 },
      { key: 'category', label: '分类', width: 120 },
      { key: 'description', label: '说明', minWidth: 180 },
      { key: 'enabled', label: '状态', width: 100, type: 'status' },
      { key: 'sortOrder', label: '排序', width: 90, type: 'number' },
      { key: 'updatedAt', label: '更新时间', width: 175, type: 'date' }
    ]
  },
  promptLibrary: {
    title: '提示词库',
    description: '集中管理图片与视频提示词来源和展示内容',
    icon: 'ri:book-open-line',
    endpoint: '/v1/admin/prompt-library/items',
    serverPagination: true,
    columns: [
      { key: 'coverUrl', label: '预览', width: 118, type: 'image' },
      { key: 'promptTypeLabel', label: '类型', width: 82 },
      { key: 'title', label: '名称', minWidth: 220 },
      { key: 'sourceName', label: '来源', minWidth: 150 },
      { key: 'tags', label: '标签', minWidth: 170 },
      { key: 'overridden', label: '已调整', width: 100 },
      { key: 'enabled', label: '状态', width: 100, type: 'status' }
    ]
  },
  plugins: {
    title: '技能管理',
    description: '管理官方技能的发布、能力、定价和使用情况',
    icon: 'ri:apps-2-line',
    endpoint: '/v1/admin/plugins',
    columns: [
      { key: 'name', label: '技能名称', minWidth: 180 },
      { key: 'category.name', label: '分类', minWidth: 120 },
      { key: 'capabilities', label: '支持能力', minWidth: 180 },
      { key: 'status', label: '发布状态', width: 105, type: 'status' },
      { key: 'featured', label: '精选', width: 85, type: 'status' },
      { key: 'preinstalled', label: '默认启用', width: 100, type: 'status' },
      { key: 'priceCredits', label: '安装价格', width: 105, type: 'number' },
      { key: 'installCount', label: '安装', width: 85, type: 'number' },
      { key: 'usageCount', label: '调用', width: 85, type: 'number' },
      { key: 'errorCount', label: '失败', width: 85, type: 'number' },
      { key: 'updatedAt', label: '更新时间', width: 175, type: 'date' }
    ]
  },
  pluginCategories: {
    title: '技能分类',
    description: '维护技能市场分类、图标和前台排序',
    icon: 'ri:folder-settings-line',
    endpoint: '/v1/admin/plugin-categories',
    columns: [
      { key: 'name', label: '分类名称', minWidth: 180 },
      { key: 'slug', label: '唯一标识', minWidth: 160 },
      { key: 'description', label: '说明', minWidth: 220 },
      { key: 'enabled', label: '状态', width: 100, type: 'status' },
      { key: 'sortOrder', label: '排序', width: 90, type: 'number' }
    ]
  },
  assistants: {
    title: 'AI 助手',
    description: '使用开箱预设或配置系统指令、默认模型、工具和知识库',
    icon: 'ri:sparkling-2-line',
    endpoint: '/v1/admin/assistants',
    columns: [
      { key: 'name', label: '助手名称', minWidth: 180 },
      { key: 'defaultModel', label: '默认模型', minWidth: 160 },
      { key: '_count.tools', label: '工具', width: 90, type: 'number' },
      { key: '_count.knowledgeBases', label: '知识库', width: 100, type: 'number' },
      { key: 'enabled', label: '状态', width: 100, type: 'status' },
      { key: 'updatedAt', label: '更新时间', width: 175, type: 'date' }
    ]
  },
  tools: {
    title: '工具与审批',
    description: '管理内置能力、第三方工作流模板、调用凭证和审批策略',
    icon: 'ri:tools-line',
    endpoint: '/v1/admin/tools',
    columns: [
      { key: 'name', label: '工具名称', minWidth: 170 },
      { key: 'key', label: '标识', minWidth: 150 },
      { key: 'endpoint', label: 'Endpoint', minWidth: 220 },
      { key: 'requiresApproval', label: '需审批', width: 100, type: 'status' },
      { key: 'enabled', label: '状态', width: 100, type: 'status' },
      { key: '_count.calls', label: '调用数', width: 95, type: 'number' }
    ]
  },
  toolApprovals: {
    title: '审批申请',
    description: '处理用户对外部工具和业务工作流的调用申请',
    icon: 'ri:shield-check-line',
    endpoint: '/v1/admin/tool-approval-requests',
    columns: [
      { key: 'tool.name', label: '工具', minWidth: 170 },
      { key: 'assistant.name', label: '助手', minWidth: 150 },
      { key: 'user.displayName', label: '申请人', minWidth: 130 },
      { key: 'user.email', label: '邮箱', minWidth: 190 },
      { key: 'status', label: '状态', width: 105, type: 'status' },
      { key: 'reason', label: '申请说明', minWidth: 220 },
      { key: 'expiresAt', label: '有效期至', width: 175, type: 'date' },
      { key: 'createdAt', label: '申请时间', width: 175, type: 'date' }
    ]
  },
  knowledgeBases: {
    title: '知识库',
    description: '查看用户知识库、文档和助手关联',
    icon: 'ri:database-2-line',
    endpoint: '/v1/admin/knowledge-bases',
    columns: [
      { key: 'name', label: '名称', minWidth: 190 },
      { key: 'creator.displayName', label: '创建人', minWidth: 140 },
      { key: 'documentCount', label: '文档', width: 90, type: 'number' },
      { key: 'chunkCount', label: '分块', width: 90, type: 'number' },
      { key: '_count.assistants', label: '助手', width: 90, type: 'number' },
      { key: 'updatedAt', label: '更新时间', width: 175, type: 'date' }
    ]
  },
  externalLinks: {
    title: '外部入口',
    description: '管理前台 API、帮助、社区和商业服务入口',
    icon: 'ri:external-link-line',
    endpoint: '/v1/admin/external-links',
    columns: [
      { key: 'name', label: '名称', minWidth: 180 },
      { key: 'key', label: '标识', minWidth: 130 },
      { key: 'url', label: '地址', minWidth: 280 },
      { key: 'openNewTab', label: '新窗口', width: 100, type: 'status' },
      { key: 'enabled', label: '状态', width: 100, type: 'status' },
      { key: 'sortOrder', label: '排序', width: 90, type: 'number' }
    ]
  },
  announcements: {
    title: '公告管理',
    description: '管理用户端公告和站内通知',
    icon: 'ri:notification-3-line',
    endpoint: '/v1/admin/announcements',
    columns: [
      { key: 'title', label: '标题', minWidth: 230 },
      { key: 'body', label: '内容', minWidth: 260 },
      { key: 'targetGroup.name', label: '接收用户组', width: 150 },
      { key: 'recipientCount', label: '接收人数', width: 110, type: 'number' },
      { key: 'createdAt', label: '发布时间', width: 175, type: 'date' }
    ]
  },
  notificationTemplates: {
    title: '通知模板',
    description: '配置站内信、邮件和 Webhook 的统一通知内容与渠道',
    icon: 'ri:mail-settings-line',
    endpoint: '/v1/admin/notifications/templates',
    columns: [
      { key: 'name', label: '模板名称', minWidth: 180 },
      { key: 'key', label: '标识', minWidth: 160 },
      { key: 'channels', label: '渠道', minWidth: 180 },
      { key: 'enabled', label: '状态', width: 100, type: 'status' },
      { key: 'updatedAt', label: '更新时间', width: 175, type: 'date' }
    ]
  },
  notificationDeliveries: {
    title: '通知投递',
    description: '查看站内信、邮件和 Webhook 的发送结果并重试失败任务',
    icon: 'ri:send-plane-line',
    endpoint: '/v1/admin/notifications/deliveries',
    columns: [
      { key: 'title', label: '标题', minWidth: 210 },
      { key: 'user.email', label: '用户', minWidth: 190 },
      { key: 'channel', label: '渠道', width: 110, type: 'status' },
      { key: 'status', label: '状态', width: 110, type: 'status' },
      { key: 'attempts', label: '尝试次数', width: 100, type: 'number' },
      { key: 'lastError', label: '错误', minWidth: 220 },
      { key: 'createdAt', label: '创建时间', width: 175, type: 'date' }
    ]
  },
  byokOperations: {
    title: '用户密钥运营',
    description: '查看用户 BYOK 的健康状态、轮换日期、到期时间和累计用量',
    icon: 'ri:key-2-line',
    endpoint: '/v1/admin/byok/summary',
    columns: [
      { key: 'user.email', label: '用户', minWidth: 190 },
      { key: 'name', label: '密钥名称', minWidth: 160 },
      { key: 'providerType', label: '协议', width: 150 },
      { key: 'apiKeyHint', label: '密钥提示', width: 130 },
      { key: 'lastHealthStatus', label: '健康', width: 110, type: 'status' },
      { key: 'totalRequests', label: '请求', width: 100, type: 'number' },
      { key: 'totalFailures', label: '失败', width: 90, type: 'number' },
      { key: 'lastRotatedAt', label: '最近轮换', width: 175, type: 'date' },
      { key: 'expiresAt', label: '到期时间', width: 175, type: 'date' }
    ]
  },
  financeMargins: {
    title: '成本与毛利',
    description: '按模型、任务类型和实际路由核算收入、上游成本与毛利',
    icon: 'ri:line-chart-line',
    endpoint: '/v1/admin/finance/margins',
    columns: [
      { key: 'kind', label: '任务', width: 110, type: 'status' },
      { key: 'model', label: '模型', minWidth: 190 },
      { key: 'provider', label: '路由', minWidth: 160 },
      { key: 'jobs', label: '任务数', width: 100, type: 'number' },
      { key: 'inputTokens', label: '输入 Token', width: 125, type: 'number' },
      { key: 'outputTokens', label: '输出 Token', width: 125, type: 'number' },
      { key: 'cachedInputTokens', label: '缓存 Token', width: 125, type: 'number' },
      { key: 'reasoningTokens', label: '推理 Token', width: 125, type: 'number' },
      { key: 'revenueMicros', label: '收入（微元）', width: 140, type: 'number' },
      { key: 'upstreamCostMicros', label: '成本（微元）', width: 140, type: 'number' },
      { key: 'marginMicros', label: '毛利（微元）', width: 140, type: 'number' },
      { key: 'marginPercent', label: '毛利率 %', width: 110, type: 'number' }
    ]
  },
  billingReconciliation: {
    title: '异常账单',
    description: '核对供应商用量、任务计费、额度账本和结算退款',
    icon: 'ri:exchange-funds-line',
    endpoint: '/v1/admin/finance/reconciliation',
    columns: [
      { key: 'status', label: '级别', width: 100, type: 'status' },
      { key: 'issueSummary', label: '异常说明', minWidth: 280 },
      { key: 'user.displayName', label: '用户', minWidth: 130 },
      { key: 'model', label: '模型', minWidth: 170 },
      { key: 'provider', label: '路由', minWidth: 150 },
      { key: 'inputTokens', label: '输入 Token', width: 125, type: 'number' },
      { key: 'outputTokens', label: '输出 Token', width: 125, type: 'number' },
      { key: 'taskCreditCost', label: '任务应扣', width: 110, type: 'number' },
      { key: 'netLedgerCharge', label: '账本实扣', width: 110, type: 'number' },
      { key: 'ledgerRefunded', label: '已退款', width: 100, type: 'number' },
      { key: 'createdAt', label: '创建时间', width: 175, type: 'date' }
    ]
  },
  moderation: {
    title: '内容审核',
    description: '处理命中敏感词和安全策略的内容事件',
    icon: 'ri:shield-keyhole-line',
    endpoint: '/v1/admin/moderation/events',
    columns: [
      { key: 'user.displayName', label: '用户', minWidth: 130 },
      { key: 'source', label: '来源', width: 110, type: 'status' },
      { key: 'action', label: '处置', width: 110, type: 'status' },
      { key: 'status', label: '状态', width: 110, type: 'status' },
      { key: 'appeal.status', label: '申诉状态', width: 120, type: 'status' },
      { key: 'contentExcerpt', label: '内容摘要', minWidth: 220 },
      { key: 'matchedRules', label: '命中规则', minWidth: 180 },
      { key: 'createdAt', label: '时间', width: 175, type: 'date' }
    ]
  },
  moderationRules: {
    title: '审核规则',
    description: '管理敏感词、匹配类型和自动处置动作',
    icon: 'ri:filter-3-line',
    endpoint: '/v1/admin/moderation/rules',
    columns: [
      { key: 'name', label: '规则名称', minWidth: 180 },
      { key: 'pattern', label: '匹配内容', minWidth: 210 },
      { key: 'category', label: '分类', width: 120 },
      { key: 'action', label: '动作', width: 110, type: 'status' },
      { key: 'enabled', label: '状态', width: 100, type: 'status' },
      { key: 'sortOrder', label: '排序', width: 90, type: 'number' }
    ]
  },
  support: {
    title: '客服工单',
    description: '处理用户咨询、售后与故障反馈',
    icon: 'ri:customer-service-2-line',
    endpoint: '/v1/admin/support/tickets',
    columns: [
      { key: 'subject', label: '标题', minWidth: 220 },
      { key: 'user.displayName', label: '用户', minWidth: 130 },
      { key: 'priority', label: '优先级', width: 110, type: 'status' },
      { key: 'status', label: '状态', width: 110, type: 'status' },
      { key: 'assignedTo.displayName', label: '处理人', minWidth: 120 },
      { key: 'updatedAt', label: '更新时间', width: 175, type: 'date' }
    ]
  },
  alerts: {
    title: '告警中心',
    description: '集中查看渠道、支付、审核和工单告警',
    icon: 'ri:alarm-warning-line',
    endpoint: '/v1/admin/alerts/events',
    columns: [
      { key: 'title', label: '告警', minWidth: 220 },
      { key: 'source', label: '来源', width: 120 },
      { key: 'severity', label: '级别', width: 110, type: 'status' },
      { key: 'status', label: '状态', width: 110, type: 'status' },
      { key: 'message', label: '说明', minWidth: 220 },
      { key: 'createdAt', label: '时间', width: 175, type: 'date' }
    ]
  },
  alertRules: {
    title: '告警规则',
    description: '配置支付、渠道、审核与工单阈值',
    icon: 'ri:equalizer-2-line',
    endpoint: '/v1/admin/alerts/rules',
    columns: [
      { key: 'name', label: '规则名称', minWidth: 190 },
      { key: 'description', label: '触发条件', minWidth: 260 },
      { key: 'severity', label: '级别', width: 110, type: 'status' },
      { key: 'cooldownMinutes', label: '冷却(分钟)', width: 120, type: 'number' },
      { key: 'notifyInApp', label: '站内通知', width: 100, type: 'status' },
      { key: 'notifyWebhook', label: 'Webhook', width: 100, type: 'status' },
      { key: 'enabled', label: '状态', width: 100, type: 'status' },
      { key: 'mutedUntil', label: '静默至', width: 175, type: 'date' }
    ]
  },
  logins: {
    title: '登录会话',
    description: '审查用户登录设备、IP 和会话状态',
    icon: 'ri:login-circle-line',
    endpoint: '/v1/admin/logins',
    columns: [
      { key: 'user.displayName', label: '用户', minWidth: 130 },
      { key: 'user.email', label: '邮箱', minWidth: 190 },
      { key: 'user.role', label: '角色', width: 110, type: 'status' },
      { key: 'ipAddress', label: 'IP', width: 140 },
      { key: 'userAgent', label: '设备', minWidth: 250 },
      { key: 'createdAt', label: '登录时间', width: 175, type: 'date' }
    ]
  },
  audits: {
    title: '审计日志',
    description: '记录管理员操作、对象和变更内容',
    icon: 'ri:file-list-3-line',
    endpoint: '/v1/admin/audits',
    columns: [
      { key: 'actor.displayName', label: '操作人', minWidth: 130 },
      { key: 'action', label: '动作', minWidth: 190 },
      { key: 'targetType', label: '对象类型', minWidth: 130 },
      { key: 'targetId', label: '对象 ID', minWidth: 180 },
      { key: 'ipAddress', label: 'IP', width: 140 },
      { key: 'createdAt', label: '时间', width: 175, type: 'date' }
    ]
  },
  toolCalls: {
    title: '工具调用记录',
    description: '审计 AI 助手的工具调用、耗时和失败原因',
    icon: 'ri:terminal-box-line',
    endpoint: '/v1/admin/tool-calls',
    columns: [
      { key: 'tool.name', label: '工具', minWidth: 160 },
      { key: 'assistant.name', label: '助手', minWidth: 140 },
      { key: 'user.displayName', label: '用户', minWidth: 130 },
      { key: 'status', label: '状态', width: 110, type: 'status' },
      { key: 'durationMs', label: '耗时(ms)', width: 110, type: 'number' },
      { key: 'error', label: '错误', minWidth: 190 },
      { key: 'createdAt', label: '时间', width: 175, type: 'date' }
    ]
  }
}
