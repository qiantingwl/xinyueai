import { AppRouteRecord } from '@/types/router'

const resourceSearchKeywords: Record<string, string[]> = {
  users: ['用户管理', '账号', '账户', '会员', 'customer', 'account'],
  groups: ['权限', '用户策略', '模型白名单', '计费倍率', 'BYOK 策略'],
  teams: ['企业', '组织', '成员', '席位', '团队额度'],
  credits: ['创作点', '点数', '余额', '消费记录', '扣费记录', '充值流水'],
  providers: ['渠道', 'API 接口', '中转接口', 'NewAPI', 'Sub2API', 'upstream'],
  models: ['模型目录', 'Token 定价', '计费费率', '上下文', 'model pricing'],
  jobs: ['生成记录', '任务记录', '图片生成', '视频生成', '队列', 'generation records'],
  contentPages: ['文章', '协议', '帮助页面', 'CMS'],
  inspirations: ['灵感', '推荐内容', '首页内容', '创作素材'],
  imageTools: ['图像工具', '图片编辑', '提示词反推', '图片反推'],
  promptTemplates: ['Prompt 模板', '系统提示词', '快捷提示词'],
  promptLibrary: ['Prompt 库', '提示词市场', '提示词内容'],
  works: ['作品', '发布内容', '举报', '作品审核'],
  agentOperations: ['Agent 任务', 'Agent 运行', '执行轨迹', '智能体任务'],
  assistants: ['助手', '智能体', 'bot', 'assistant'],
  plugins: ['插件', 'Skill', 'Plugin', 'MCP'],
  pluginCategories: ['插件分类', '技能目录', 'Skill Categories'],
  tools: ['工具', 'Function Call', '函数调用', '工具审批'],
  webSearch: ['搜索渠道', '联网', 'Tavily', 'Bing'],
  toolApprovals: ['工具审批', '授权申请', '高风险操作'],
  knowledgeBases: ['知识', 'RAG', '文档库', '向量库'],
  assets: ['文件', '素材', '资源', '媒体', '图片', '视频'],
  projects: ['项目', '工作流', '画布', 'Project'],
  externalLinks: ['外链', '导航', '外部地址'],
  subscriptions: ['会员', '会员系统', '套餐', '订阅', '权益', 'VIP', 'plan'],
  payments: ['充值', '支付', '订单', '交易', '商品', '兑换码'],
  financeMargins: ['成本', '毛利', '收入', '利润', '模型用量'],
  billingReconciliation: ['异常账单', '对账', 'Token 用量', '退款异常', '账本差异'],
  byokOperations: ['BYOK', 'API Key', '密钥', '用户密钥', '个人密钥'],
  commercialGovernance: ['商业治理', '账户生命周期', '配额治理', '商业风控'],
  announcements: ['公告', '站内消息', '运营通知'],
  notificationTemplates: ['通知', '邮件模板', '消息模板'],
  notificationDeliveries: ['通知记录', '投递记录', '发送记录', '失败重试'],
  moderationRules: ['审核规则', '风控规则', '敏感词', '关键词规则'],
  moderation: ['审核', '违规内容', '申诉', '内容风控'],
  support: ['客服', '工单', '用户反馈', '售后'],
  alerts: ['告警', '异常', '报警', '事件中心'],
  alertRules: ['告警规则', '监控阈值', '报警规则'],
  logins: ['登录', '会话', '在线设备', '登录记录'],
  audits: ['审计', '操作日志', '管理员日志'],
  toolCalls: ['工具调用', '调用记录', 'Agent Trace', '执行记录'],
  systemHealth: ['健康检查', '监控', '服务状态', '数据库', '队列']
}

const resource = (title: string, icon: string, key: string) => ({
  title: `xinyue.nav.${key}`,
  icon,
  keepAlive: true,
  roles: ['R_SUPER', 'R_ADMIN'],
  resource: key,
  searchKeywords: [title, key, ...(resourceSearchKeywords[key] || [])]
})

const section = (menuSection: string, meta: ReturnType<typeof resource>) => ({
  ...meta,
  menuSection
})

// 企业后台最多保留两级：一级业务分组，二级具体页面。
export const enterpriseRoutes: AppRouteRecord[] = [
  {
    path: '/enterprise/customers',
    name: 'EnterpriseCustomers',
    component: '/index/index',
    meta: {
      title: 'xinyue.nav.customers',
      icon: 'ri:team-line',
      roles: ['R_SUPER', 'R_ADMIN'],
      searchKeywords: ['用户', '会员', '权益', '团队', '额度']
    },
    children: [
      {
        path: 'users',
        name: 'CustomerUsers',
        component: '/xinyue/users',
        meta: resource('客户管理', 'ri:user-line', 'users')
      },
      {
        path: 'groups',
        name: 'CustomerGroups',
        component: '/xinyue/groups',
        meta: resource('用户分组', 'ri:group-line', 'groups')
      },
      {
        path: 'teams',
        name: 'CustomerTeams',
        component: '/xinyue/teams',
        meta: resource('团队与成员', 'ri:team-line', 'teams')
      },
      {
        path: 'credits',
        name: 'CreditLedger',
        component: '/xinyue/operations',
        meta: resource('额度流水', 'ri:coins-line', 'credits')
      }
    ]
  },
  {
    path: '/enterprise/ai',
    name: 'EnterpriseAI',
    component: '/index/index',
    meta: {
      title: 'xinyue.nav.modelGeneration',
      icon: 'ri:brain-line',
      roles: ['R_SUPER', 'R_ADMIN'],
      searchKeywords: ['AI', '模型', '渠道', '生成', 'Token', '计费']
    },
    children: [
      {
        path: 'providers',
        name: 'ProviderChannels',
        component: '/xinyue/providers',
        meta: resource('上游渠道', 'ri:server-line', 'providers')
      },
      {
        path: 'models',
        name: 'ModelCatalog',
        component: '/xinyue/models',
        meta: resource('模型与定价', 'ri:robot-2-line', 'models')
      },
      {
        path: 'jobs',
        name: 'GenerationJobs',
        component: '/xinyue/operations',
        meta: resource('生成任务', 'ri:task-line', 'jobs')
      }
    ]
  },
  {
    path: '/enterprise/content',
    name: 'EnterpriseContent',
    component: '/index/index',
    meta: {
      title: 'xinyue.nav.contentPlugins',
      icon: 'ri:gallery-line',
      roles: ['R_SUPER', 'R_ADMIN'],
      searchKeywords: ['内容', '插件', '提示词', '作品', '灵感']
    },
    children: [
      {
        path: 'pages',
        name: 'PublicContentPages',
        component: '/article/list',
        meta: resource('公开页面', 'ri:article-line', 'contentPages')
      },
      {
        path: 'article/detail/:id',
        name: 'ArticleDetail',
        component: '/article/detail',
        meta: {
          title: 'xinyue.nav.contentPageDetail',
          isHide: true,
          keepAlive: true,
          activePath: '/enterprise/content/pages',
          roles: ['R_SUPER', 'R_ADMIN']
        }
      },
      {
        path: 'article/publish',
        name: 'ArticlePublish',
        component: '/article/publish',
        meta: {
          title: 'xinyue.nav.contentPageEdit',
          isHide: true,
          keepAlive: true,
          activePath: '/enterprise/content/pages',
          roles: ['R_SUPER', 'R_ADMIN']
        }
      },
      {
        path: 'inspirations',
        name: 'InspirationManagement',
        component: '/xinyue/operations',
        meta: resource('灵感内容', 'ri:lightbulb-line', 'inspirations')
      },
      {
        path: 'image-tools',
        name: 'ImageToolManagement',
        component: '/xinyue/operations',
        meta: resource('图片工具', 'ri:image-edit-line', 'imageTools')
      },
      {
        path: 'prompt-templates',
        name: 'PromptTemplateManagement',
        component: '/xinyue/operations',
        meta: resource('提示词模板', 'ri:file-text-line', 'promptTemplates')
      },
      {
        path: 'prompt-library',
        name: 'PromptLibraryManagement',
        component: '/xinyue/operations',
        meta: resource('提示词库', 'ri:book-open-line', 'promptLibrary')
      },
      {
        path: 'works',
        name: 'PublishedWorkManagement',
        component: '/xinyue/works',
        meta: resource('作品审核', 'ri:gallery-line', 'works')
      }
    ]
  },
  {
    path: '/enterprise/agent-tools',
    name: 'EnterpriseAgentTools',
    component: '/index/index',
    meta: {
      title: 'xinyue.nav.agentTools',
      icon: 'ri:robot-3-line',
      roles: ['R_SUPER', 'R_ADMIN'],
      searchKeywords: ['Agent', '助手', '技能', '插件', '工具', '知识库']
    },
    children: [
      {
        path: 'agent-operations',
        name: 'AgentOperations',
        component: '/xinyue/agent',
        meta: section(
          'Agent 执行',
          resource('Agent 运营中心', 'ri:robot-3-line', 'agentOperations')
        )
      },
      {
        path: 'assistants',
        name: 'AssistantManagement',
        component: '/xinyue/operations',
        meta: section('助手与技能', resource('AI 助手', 'ri:sparkling-2-line', 'assistants'))
      },
      {
        path: 'skills',
        name: 'PluginManagement',
        component: '/xinyue/operations',
        meta: section('助手与技能', resource('技能管理', 'ri:apps-2-line', 'plugins'))
      },
      {
        path: 'skill-categories',
        name: 'PluginCategoryManagement',
        component: '/xinyue/operations',
        meta: section(
          '助手与技能',
          resource('技能分类', 'ri:folder-settings-line', 'pluginCategories')
        )
      },
      {
        path: 'tools',
        name: 'ToolManagement',
        component: '/xinyue/operations',
        meta: section('工具、知识与检索', resource('工具与审批', 'ri:tools-line', 'tools'))
      },
      {
        path: 'web-search',
        name: 'WebSearchChannels',
        component: '/xinyue/web-search',
        meta: section('工具、知识与检索', resource('联网搜索', 'ri:global-line', 'webSearch'))
      },
      {
        path: 'tool-approvals',
        name: 'ToolApprovalManagement',
        component: '/xinyue/operations',
        meta: section(
          '工具、知识与检索',
          resource('审批申请', 'ri:shield-check-line', 'toolApprovals')
        )
      },
      {
        path: 'knowledge-bases',
        name: 'KnowledgeBaseManagement',
        component: '/xinyue/operations',
        meta: section(
          '工具、知识与检索',
          resource('知识库', 'ri:database-2-line', 'knowledgeBases')
        )
      }
    ]
  },
  {
    path: '/enterprise/workspace',
    name: 'EnterpriseWorkspace',
    component: '/index/index',
    meta: {
      title: 'xinyue.nav.workspaceData',
      icon: 'ri:folder-chart-line',
      roles: ['R_SUPER', 'R_ADMIN'],
      searchKeywords: ['工作区', '文件', '项目', '资产', '数据']
    },
    children: [
      {
        path: 'assets',
        name: 'AssetLibrary',
        component: '/xinyue/operations',
        meta: resource('文件与资产', 'ri:image-line', 'assets')
      },
      {
        path: 'projects',
        name: 'ProjectWorkflowAudits',
        component: '/xinyue/operations',
        meta: resource('项目与工作流', 'ri:git-branch-line', 'projects')
      },
      {
        path: 'external-links',
        name: 'ExternalLinks',
        component: '/xinyue/operations',
        meta: resource('外部入口', 'ri:external-link-line', 'externalLinks')
      }
    ]
  },
  {
    path: '/enterprise/commerce',
    name: 'EnterpriseCommerce',
    component: '/index/index',
    meta: {
      title: 'xinyue.nav.commerce',
      icon: 'ri:bank-card-line',
      roles: ['R_SUPER', 'R_ADMIN'],
      searchKeywords: ['会员', '订阅', '充值', '支付', '计费', 'BYOK', '成本']
    },
    children: [
      {
        path: 'subscriptions',
        name: 'SubscriptionManagement',
        component: '/xinyue/subscriptions',
        meta: section('商品与交易', resource('订阅与套餐', 'ri:vip-crown-2-line', 'subscriptions'))
      },
      {
        path: 'payments',
        name: 'PaymentManagement',
        component: '/xinyue/commerce',
        meta: section('商品与交易', resource('充值与支付', 'ri:secure-payment-line', 'payments'))
      },
      {
        path: 'margins',
        name: 'FinanceMargins',
        component: '/xinyue/operations',
        meta: section('成本与对账', resource('成本与毛利', 'ri:line-chart-line', 'financeMargins'))
      },
      {
        path: 'reconciliation',
        name: 'BillingReconciliation',
        component: '/xinyue/operations',
        meta: section(
          '成本与对账',
          resource('异常账单', 'ri:exchange-funds-line', 'billingReconciliation')
        )
      },
      {
        path: 'byok',
        name: 'ByokOperations',
        component: '/xinyue/operations',
        meta: section('成本与对账', resource('用户密钥运营', 'ri:key-2-line', 'byokOperations'))
      },
      {
        path: 'governance',
        name: 'CommercialGovernance',
        component: '/xinyue/commercial-governance',
        meta: section(
          '账户治理',
          resource('商业治理', 'ri:shield-user-line', 'commercialGovernance')
        )
      }
    ]
  },
  {
    path: '/enterprise/operations',
    name: 'EnterpriseOperations',
    component: '/index/index',
    meta: {
      title: 'xinyue.nav.operations',
      icon: 'ri:shield-check-line',
      roles: ['R_SUPER', 'R_ADMIN'],
      searchKeywords: ['运营', '审核', '通知', '告警', '审计', '安全']
    },
    children: [
      {
        path: 'announcements',
        name: 'AnnouncementManagement',
        component: '/xinyue/operations',
        meta: section('用户触达', resource('公告管理', 'ri:notification-3-line', 'announcements'))
      },
      {
        path: 'notification-templates',
        name: 'NotificationTemplates',
        component: '/xinyue/operations',
        meta: section(
          '用户触达',
          resource('通知模板', 'ri:mail-settings-line', 'notificationTemplates')
        )
      },
      {
        path: 'notification-deliveries',
        name: 'NotificationDeliveries',
        component: '/xinyue/operations',
        meta: section(
          '用户触达',
          resource('通知投递', 'ri:send-plane-line', 'notificationDeliveries')
        )
      },
      {
        path: 'moderation-rules',
        name: 'ModerationRules',
        component: '/xinyue/operations',
        meta: section('内容安全与客服', resource('审核规则', 'ri:filter-3-line', 'moderationRules'))
      },
      {
        path: 'moderation',
        name: 'ModerationEvents',
        component: '/xinyue/operations',
        meta: section(
          '内容安全与客服',
          resource('内容审核', 'ri:shield-keyhole-line', 'moderation')
        )
      },
      {
        path: 'support',
        name: 'SupportTickets',
        component: '/xinyue/operations',
        meta: section(
          '内容安全与客服',
          resource('客服工单', 'ri:customer-service-2-line', 'support')
        )
      },
      {
        path: 'alerts',
        name: 'AlertCenter',
        component: '/xinyue/operations',
        meta: section('监控与审计', resource('告警中心', 'ri:alarm-warning-line', 'alerts'))
      },
      {
        path: 'alert-rules',
        name: 'AlertRules',
        component: '/xinyue/operations',
        meta: section('监控与审计', resource('告警规则', 'ri:equalizer-2-line', 'alertRules'))
      },
      {
        path: 'logins',
        name: 'LoginSessions',
        component: '/xinyue/operations',
        meta: section('监控与审计', resource('登录会话', 'ri:login-circle-line', 'logins'))
      },
      {
        path: 'audits',
        name: 'AuditLogs',
        component: '/xinyue/operations',
        meta: section('监控与审计', resource('审计日志', 'ri:file-list-3-line', 'audits'))
      },
      {
        path: 'tool-calls',
        name: 'ToolCallAudits',
        component: '/xinyue/operations',
        meta: section('监控与审计', resource('工具调用记录', 'ri:terminal-box-line', 'toolCalls'))
      },
      {
        path: 'system-health',
        name: 'XinyueSystemHealth',
        component: '/safeguard/server',
        meta: section('监控与审计', resource('系统健康', 'ri:pulse-line', 'systemHealth'))
      }
    ]
  },
  {
    path: '/enterprise/settings',
    name: 'XinyueSystemSettings',
    component: '/xinyue/settings',
    meta: {
      title: 'xinyue.nav.settings',
      icon: 'ri:settings-3-line',
      keepAlive: true,
      roles: ['R_SUPER', 'R_ADMIN'],
      resource: 'settings',
      searchKeywords: [
        '系统设置',
        '业务配置',
        '登录注册',
        '邮件',
        '计费设置',
        '图片反推',
        'Prompt Extract'
      ]
    }
  }
]
