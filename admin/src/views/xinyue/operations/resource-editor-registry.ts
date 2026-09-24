import type { ResourceEditorConfig } from './resource-types'

export const operationEditorConfigs: Record<string, ResourceEditorConfig> = {
  projects: {
    canCreate: true,
    canEdit: true,
    canDelete: true,
    createLabel: '新增项目',
    createUrl: '/v1/admin/projects',
    updateUrl: (row) => `/v1/admin/projects/${row.id}`,
    deleteUrl: (row) => `/v1/admin/projects/${row.id}`,
    defaults: {
      userId: '',
      name: '',
      description: '',
      instructions: '',
      workflowStatus: 'PLANNING',
      defaultModel: '',
      defaultAssistantId: '',
      archived: false,
      versionLabel: '',
      changeSummary: ''
    },
    fields: [
      {
        key: 'userId',
        label: '所属用户',
        type: 'select',
        optionsFrom: 'users',
        required: true,
        createOnly: true,
        filterable: true,
        span: 12
      },
      { key: 'name', label: '项目名称', required: true, maxlength: 80, span: 12 },
      {
        key: 'workflowStatus',
        label: '工作流状态',
        type: 'select',
        required: true,
        span: 12,
        options: [
          { label: '规划中', value: 'PLANNING' },
          { label: '进行中', value: 'IN_PROGRESS' },
          { label: '待审核', value: 'REVIEW' },
          { label: '已完成', value: 'COMPLETED' },
          { label: '已归档', value: 'ARCHIVED' }
        ]
      },
      {
        key: 'defaultModel',
        label: '默认模型',
        type: 'select',
        optionsFrom: 'models',
        filterable: true,
        allowCreate: true,
        span: 12
      },
      {
        key: 'defaultAssistantId',
        label: '默认助手',
        type: 'select',
        optionsFrom: 'assistants',
        filterable: true,
        span: 12
      },
      { key: 'description', label: '项目说明', type: 'textarea', rows: 3, maxlength: 2000 },
      { key: 'instructions', label: '项目指令', type: 'textarea', rows: 7, maxlength: 4000 },
      { key: 'archived', label: '归档项目', type: 'switch', editOnly: true, span: 12 },
      { key: 'versionLabel', label: '版本标签', maxlength: 80, editOnly: true, span: 12 },
      {
        key: 'changeSummary',
        label: '变更说明',
        type: 'textarea',
        rows: 2,
        maxlength: 500,
        editOnly: true
      }
    ]
  },
  inspirations: {
    canCreate: true,
    canEdit: true,
    canDelete: true,
    createLabel: '新增灵感',
    createUrl: '/v1/admin/inspirations',
    updateUrl: (row) => `/v1/admin/inspirations/${row.id}`,
    deleteUrl: (row) => `/v1/admin/inspirations/${row.id}`,
    defaults: {
      mode: 'IMAGE',
      title: '',
      prompt: '',
      badge: '',
      coverUrl: '',
      model: '',
      externalVideoUrl: '',
      videoResolution: '720p',
      videoDuration: 5,
      videoAspectRatio: '16:9',
      sortOrder: 0,
      enabled: true
    },
    fields: [
      {
        key: 'mode',
        label: '使用场景',
        type: 'select',
        required: true,
        span: 12,
        options: [
          { label: '图片生成', value: 'IMAGE' },
          { label: '视频生成', value: 'VIDEO' },
          { label: '商品视觉', value: 'COMMERCE' }
        ]
      },
      { key: 'title', label: '名称', required: true, span: 12, maxlength: 80 },
      {
        key: 'prompt',
        label: '提示词',
        type: 'textarea',
        required: true,
        rows: 7,
        maxlength: 5000
      },
      { key: 'badge', label: '角标', span: 12, maxlength: 20 },
      {
        key: 'model',
        label: '专用 Worker 模型',
        type: 'select',
        span: 12,
        optionsFrom: 'models',
        filterable: true,
        allowCreate: true
      },
      { key: 'coverUrl', label: '外部封面地址', placeholder: 'https://...', maxlength: 1000 },
      {
        key: 'externalVideoUrl',
        label: '外部视频地址',
        placeholder: 'https://.../demo.mp4',
        maxlength: 2000,
        when: { key: 'mode', value: 'VIDEO' }
      },
      {
        key: 'videoResolution',
        label: '视频分辨率',
        type: 'select',
        span: 8,
        when: { key: 'mode', value: 'VIDEO' },
        options: [
          { label: '720p', value: '720p' },
          { label: '1080p', value: '1080p' },
          { label: '4K', value: '2160p' }
        ]
      },
      {
        key: 'videoDuration',
        label: '视频时长（秒）',
        type: 'number',
        span: 8,
        min: 1,
        max: 300,
        when: { key: 'mode', value: 'VIDEO' }
      },
      {
        key: 'videoAspectRatio',
        label: '画面比例',
        type: 'select',
        span: 8,
        when: { key: 'mode', value: 'VIDEO' },
        options: [
          { label: '16:9', value: '16:9' },
          { label: '9:16', value: '9:16' },
          { label: '1:1', value: '1:1' }
        ]
      },
      { key: 'sortOrder', label: '排序', type: 'number', span: 12, min: 0 },
      { key: 'enabled', label: '前台展示', type: 'switch', span: 12 }
    ]
  },
  imageTools: {
    canCreate: true,
    canEdit: true,
    canDelete: true,
    createLabel: '新增图片工具',
    createUrl: '/v1/admin/inspirations',
    updateUrl: (row) => `/v1/admin/inspirations/${row.id}`,
    deleteUrl: (row) => `/v1/admin/inspirations/${row.id}`,
    defaults: {
      mode: 'IMAGE_TOOL',
      title: '',
      prompt: '',
      coverUrl: '',
      model: '',
      toolKey: 'background-removal',
      executionMode: 'GENERIC',
      toolType: 'CUSTOM',
      inputMode: 'REFERENCE',
      placeholder: '',
      outpaintLeft: 0,
      outpaintRight: 0,
      outpaintTop: 0,
      outpaintBottom: 0,
      steps: 30,
      strength: 1,
      sortOrder: 0,
      enabled: true
    },
    fields: [
      { key: 'title', label: '工具名称', required: true, span: 12, maxlength: 80 },
      {
        key: 'toolKey',
        label: '前台工具标识',
        type: 'select',
        required: true,
        span: 12,
        filterable: true,
        allowCreate: true,
        options: [
          { label: 'AI 抠图', value: 'background-removal' },
          { label: 'AI 擦除', value: 'erase' },
          { label: '标记改图', value: 'marked-edit' },
          { label: 'AI 扩图', value: 'outpaint' },
          { label: '变清晰', value: 'enhance' },
          { label: '自定义工具', value: 'custom' }
        ]
      },
      {
        key: 'toolType',
        label: '工具类型',
        type: 'select',
        required: true,
        span: 12,
        options: [
          { label: '智能抠图', value: 'BACKGROUND_REMOVAL' },
          { label: '局部擦除 / 重绘', value: 'INPAINT' },
          { label: '智能扩图', value: 'OUTPAINT' },
          { label: '清晰放大', value: 'UPSCALE' },
          { label: '自定义工作流', value: 'CUSTOM' }
        ]
      },
      {
        key: 'inputMode',
        label: '素材方式',
        type: 'select',
        required: true,
        span: 12,
        options: [
          { label: '参考图', value: 'REFERENCE' },
          { label: '参考图与蒙版', value: 'MASK' }
        ]
      },
      {
        key: 'executionMode',
        label: '执行方式',
        type: 'select',
        required: true,
        span: 12,
        options: [
          { label: '通用图像模型回退', value: 'GENERIC' },
          { label: '专用本地 Worker', value: 'WORKER' }
        ]
      },
      {
        key: 'prompt',
        label: '执行指令',
        type: 'textarea',
        required: true,
        rows: 7,
        maxlength: 5000
      },
      { key: 'placeholder', label: '输入提示', maxlength: 160 },
      {
        key: 'model',
        label: '指定模型',
        type: 'select',
        span: 12,
        optionsFrom: 'models',
        filterable: true,
        allowCreate: true
      },
      { key: 'coverUrl', label: '外部封面地址', placeholder: 'https://...', maxlength: 1000 },
      {
        key: 'outpaintLeft',
        label: '左侧扩展（像素）',
        type: 'number',
        span: 6,
        min: 0,
        max: 2048
      },
      {
        key: 'outpaintRight',
        label: '右侧扩展（像素）',
        type: 'number',
        span: 6,
        min: 0,
        max: 2048
      },
      { key: 'outpaintTop', label: '顶部扩展（像素）', type: 'number', span: 6, min: 0, max: 2048 },
      {
        key: 'outpaintBottom',
        label: '底部扩展（像素）',
        type: 'number',
        span: 6,
        min: 0,
        max: 2048
      },
      { key: 'steps', label: '推理步数', type: 'number', span: 12, min: 1, max: 100 },
      { key: 'strength', label: '修改强度（0 或 1）', type: 'number', span: 12, min: 0, max: 1 },
      { key: 'sortOrder', label: '排序', type: 'number', span: 12, min: 0 },
      { key: 'enabled', label: '前台展示', type: 'switch', span: 12 }
    ]
  },
  promptTemplates: {
    canCreate: true,
    canEdit: true,
    canDelete: true,
    createLabel: '新增模板',
    createUrl: '/v1/admin/prompt-templates',
    updateUrl: (row) => `/v1/admin/prompt-templates/${row.id}`,
    deleteUrl: (row) => `/v1/admin/prompt-templates/${row.id}`,
    defaults: {
      title: '',
      category: '通用',
      description: '',
      prompt: '',
      variables: [],
      sortOrder: 0,
      enabled: true
    },
    fields: [
      { key: 'title', label: '模板名称', required: true, span: 12, maxlength: 100 },
      { key: 'category', label: '分类', required: true, span: 12, maxlength: 50 },
      { key: 'description', label: '说明', type: 'textarea', rows: 2, maxlength: 1000 },
      {
        key: 'prompt',
        label: '提示词正文',
        type: 'textarea',
        required: true,
        rows: 8,
        maxlength: 20000
      },
      {
        key: 'variables',
        label: '变量',
        type: 'select',
        multiple: true,
        filterable: true,
        allowCreate: true,
        placeholder: '输入变量名后回车'
      },
      { key: 'sortOrder', label: '排序', type: 'number', span: 12, min: 0 },
      { key: 'enabled', label: '启用', type: 'switch', span: 12 }
    ]
  },
  promptLibrary: {
    canEdit: true,
    canDelete: true,
    updateUrl: (row) => `/v1/admin/prompt-library/items/${row.id || row.itemId}`,
    deleteUrl: (row) => `/v1/admin/prompt-library/items/${row.id || row.itemId}`,
    defaults: { title: '', prompt: '', description: '', tags: [], coverUrl: '', enabled: true },
    fields: [
      { key: 'title', label: '名称', required: true, maxlength: 300 },
      {
        key: 'prompt',
        label: '提示词正文',
        type: 'textarea',
        required: true,
        rows: 9,
        maxlength: 30000
      },
      { key: 'description', label: '说明', type: 'textarea', rows: 3, maxlength: 2000 },
      {
        key: 'tags',
        label: '标签',
        type: 'select',
        multiple: true,
        filterable: true,
        allowCreate: true
      },
      { key: 'coverUrl', label: '展示图片地址', maxlength: 2000 },
      {
        key: 'previewVideoUrl',
        label: '视频预览地址',
        maxlength: 2000,
        placeholder: '视频提示词可填写 MP4 或 WebM 地址'
      },
      { key: 'enabled', label: '前台展示', type: 'switch' }
    ]
  },
  plugins: {
    canCreate: true,
    canEdit: true,
    canDelete: true,
    createLabel: '新增官方插件',
    createUrl: '/v1/admin/plugins',
    updateUrl: (row) => `/v1/admin/plugins/${row.id}`,
    deleteUrl: (row) => `/v1/admin/plugins/${row.id}`,
    defaults: {
      name: '',
      slug: '',
      description: '',
      instruction: '',
      icon: 'blocks',
      version: '1.0.0',
      capabilities: ['CHAT'],
      recommendedModel: '',
      outputRequirements: '',
      categoryId: '',
      status: 'DRAFT',
      featured: false,
      preinstalled: false,
      priceCredits: 0,
      sortOrder: 0
    },
    fields: [
      { key: 'name', label: '插件名称', required: true, span: 12, maxlength: 80 },
      {
        key: 'slug',
        label: '唯一标识',
        required: true,
        span: 12,
        maxlength: 100,
        placeholder: 'lowercase-plugin-name'
      },
      {
        key: 'categoryId',
        label: '插件分类',
        type: 'select',
        optionsFrom: 'pluginCategories',
        span: 12
      },
      { key: 'icon', label: '图标名称', span: 12, maxlength: 80 },
      { key: 'description', label: '插件简介', type: 'textarea', rows: 2, maxlength: 500 },
      {
        key: 'instruction',
        label: '系统指令',
        type: 'textarea',
        required: true,
        rows: 9,
        maxlength: 20000
      },
      {
        key: 'capabilities',
        label: '支持能力',
        type: 'select',
        required: true,
        multiple: true,
        span: 12,
        options: [
          { label: '对话', value: 'CHAT' },
          { label: '图片生成', value: 'IMAGE' },
          { label: '视频生成', value: 'VIDEO' },
          { label: '商品视觉', value: 'COMMERCE' },
          { label: '办公中心', value: 'OFFICE' }
        ]
      },
      {
        key: 'recommendedModel',
        label: '推荐模型',
        type: 'select',
        optionsFrom: 'models',
        filterable: true,
        allowCreate: true,
        span: 12
      },
      {
        key: 'outputRequirements',
        label: '输出要求',
        type: 'textarea',
        rows: 3,
        maxlength: 4000
      },
      { key: 'version', label: '版本', required: true, span: 8, maxlength: 40 },
      {
        key: 'priceCredits',
        label: '安装价格（创作点）',
        type: 'number',
        span: 8,
        min: 0,
        max: 10000000
      },
      { key: 'sortOrder', label: '排序', type: 'number', span: 8, min: -10000, max: 10000 },
      {
        key: 'status',
        label: '发布状态',
        type: 'select',
        required: true,
        span: 12,
        options: [
          { label: '草稿', value: 'DRAFT' },
          { label: '已发布', value: 'PUBLISHED' },
          { label: '已停用', value: 'DISABLED' }
        ]
      },
      { key: 'featured', label: '精选推荐', type: 'switch', span: 12 },
      {
        key: 'preinstalled',
        label: '默认启用（免费技能用户无需安装）',
        type: 'switch',
        span: 12
      }
    ]
  },
  pluginCategories: {
    canCreate: true,
    canEdit: true,
    canDelete: true,
    createLabel: '新增插件分类',
    createUrl: '/v1/admin/plugin-categories',
    updateUrl: (row) => `/v1/admin/plugin-categories/${row.id}`,
    deleteUrl: (row) => `/v1/admin/plugin-categories/${row.id}`,
    defaults: {
      name: '',
      slug: '',
      description: '',
      icon: 'blocks',
      sortOrder: 0,
      enabled: true
    },
    fields: [
      { key: 'name', label: '分类名称', required: true, span: 12, maxlength: 60 },
      {
        key: 'slug',
        label: '唯一标识',
        required: true,
        span: 12,
        maxlength: 80,
        placeholder: 'category-name'
      },
      { key: 'description', label: '分类说明', type: 'textarea', rows: 3, maxlength: 500 },
      { key: 'icon', label: '图标名称', span: 12, maxlength: 80 },
      { key: 'sortOrder', label: '排序', type: 'number', span: 12, min: -10000, max: 10000 },
      { key: 'enabled', label: '前台展示', type: 'switch', span: 12 }
    ]
  },
  assistants: {
    canCreate: true,
    canEdit: true,
    canDelete: true,
    createLabel: '新增助手',
    createUrl: '/v1/admin/assistants',
    updateUrl: (row) => `/v1/admin/assistants/${row.id}`,
    deleteUrl: (row) => `/v1/admin/assistants/${row.id}`,
    defaults: {
      name: '',
      description: '',
      systemPrompt: '',
      defaultModel: '',
      templateIds: [],
      toolIds: [],
      knowledgeBaseIds: [],
      sortOrder: 0,
      enabled: true
    },
    fields: [
      { key: 'name', label: '助手名称', required: true, span: 12, maxlength: 100 },
      {
        key: 'defaultModel',
        label: '默认模型',
        type: 'select',
        span: 12,
        optionsFrom: 'models',
        filterable: true,
        allowCreate: true,
        help: '留空时跟随平台当前默认聊天模型；只有确实需要固定模型时才指定。'
      },
      {
        key: 'description',
        label: '简介',
        type: 'textarea',
        rows: 2,
        maxlength: 2000,
        help: '展示给用户的能力说明，建议写清适用任务和边界。'
      },
      {
        key: 'systemPrompt',
        label: '系统指令',
        type: 'textarea',
        rows: 8,
        maxlength: 30000,
        help: '定义角色、工作步骤、事实约束和输出格式；不要在这里填写 API Key 或个人数据。'
      },
      {
        key: 'templateIds',
        label: '提示词模板',
        type: 'select',
        multiple: true,
        filterable: true,
        optionsFrom: 'promptTemplates',
        help: '把常用模板作为快捷入口，不会自动把全部模板内容塞进每次对话。'
      },
      {
        key: 'toolIds',
        label: '可用工具',
        type: 'select',
        multiple: true,
        filterable: true,
        optionsFrom: 'tools',
        help: '外部工具必须先在“工具与审批”中完成 Endpoint、鉴权和安全检测。'
      },
      {
        key: 'knowledgeBaseIds',
        label: '知识库',
        type: 'select',
        multiple: true,
        filterable: true,
        optionsFrom: 'knowledgeBases',
        help: '只绑定已获授权且内容已经完成解析的知识库。'
      },
      { key: 'sortOrder', label: '排序', type: 'number', span: 12, min: 0 },
      { key: 'enabled', label: '发布', type: 'switch', span: 12 }
    ]
  },
  tools: {
    canCreate: true,
    canEdit: true,
    canDelete: true,
    createLabel: '新增工具',
    createUrl: '/v1/admin/tools',
    updateUrl: (row) => `/v1/admin/tools/${row.id}`,
    deleteUrl: (row) => `/v1/admin/tools/${row.id}`,
    defaults: {
      key: '',
      name: '',
      description: '',
      icon: 'wrench',
      kind: 'BUILT_IN',
      authType: 'NONE',
      documentationUrl: '',
      credentialFieldsText: '[]',
      endpoint: '',
      httpMethod: 'POST',
      timeoutMs: 45000,
      headersText: '{}',
      secretHeadersText: '{}',
      clearSecretHeaders: false,
      inputSchemaText: '{}',
      scopes: [],
      enabled: false,
      requiresApproval: true
    },
    fields: [
      { key: 'key', label: '工具标识', required: true, span: 12, maxlength: 80 },
      { key: 'name', label: '工具名称', required: true, span: 12, maxlength: 100 },
      {
        key: 'description',
        label: '说明',
        type: 'textarea',
        rows: 3,
        maxlength: 2000,
        help: '预设中标记“需部署/配置”的工具默认关闭，完成配置和检测后再启用。'
      },
      { key: 'icon', label: '图标地址 / 内置标识', span: 12, maxlength: 80 },
      {
        key: 'kind',
        label: '能力类型',
        type: 'select',
        span: 12,
        options: [{ label: '内置工具', value: 'BUILT_IN' }]
      },
      {
        key: 'authType',
        label: '用户授权方式',
        type: 'select',
        span: 12,
        options: [
          { label: '无需授权', value: 'NONE' },
          { label: '用户 API Key', value: 'API_KEY' }
        ]
      },
      {
        key: 'documentationUrl',
        label: '官方说明地址',
        placeholder: 'https://...',
        maxlength: 2000,
        help: '填写官方部署或 API 文档地址，保存前可通过下方链接核对。'
      },
      {
        key: 'credentialFieldsText',
        label: '用户授权字段（JSON）',
        type: 'textarea',
        rows: 4,
        placeholder: '[{"key":"apiKey","label":"API Key","type":"password","required":true}]',
        when: { key: 'authType', value: 'API_KEY' }
      },
      {
        key: 'endpoint',
        label: '调用地址',
        placeholder: 'https://...',
        maxlength: 500,
        help: '必须是服务器可访问的公网 HTTP(S) 地址；localhost、内网 IP 和云元数据地址会被拒绝。'
      },
      {
        key: 'httpMethod',
        label: '请求方法',
        type: 'select',
        span: 12,
        options: [
          { label: 'POST', value: 'POST' },
          { label: 'GET', value: 'GET' },
          { label: 'PUT', value: 'PUT' },
          { label: 'PATCH', value: 'PATCH' },
          { label: 'DELETE', value: 'DELETE' }
        ]
      },
      { key: 'timeoutMs', label: '超时毫秒', type: 'number', span: 12, min: 1000, max: 120000 },
      {
        key: 'headersText',
        label: '公共请求头（JSON）',
        type: 'textarea',
        rows: 3,
        placeholder: '{"X-App":"xinyue"}',
        help: '仅放可公开的固定请求头，不要填写 Token、Cookie 或密钥。'
      },
      {
        key: 'secretHeadersText',
        label: '敏感请求头（JSON，留空保留）',
        type: 'textarea',
        rows: 3,
        placeholder: '{"Authorization":"Bearer ..."}',
        omitEmpty: true,
        help: '敏感请求头会加密保存；编辑时留空表示保留现有值。Dify、FastGPT 等 Bearer Key 填在这里。'
      },
      { key: 'clearSecretHeaders', label: '清除已保存敏感请求头', type: 'switch' },
      {
        key: 'inputSchemaText',
        label: '输入 Schema（JSON）',
        type: 'textarea',
        rows: 4,
        placeholder: '{"type":"object","properties":{}}',
        help: 'JSON Schema 会约束模型生成的工具参数；字段越明确，调用越稳定。'
      },
      {
        key: 'scopes',
        label: '权限范围',
        type: 'select',
        multiple: true,
        filterable: true,
        allowCreate: true
      },
      {
        key: 'requiresApproval',
        label: '调用前审批',
        type: 'switch',
        span: 12,
        help: '涉及外部写入、通知、支付或业务工作流时建议保持开启。'
      },
      {
        key: 'enabled',
        label: '启用',
        type: 'switch',
        span: 12,
        help: '第三方工具应在 Endpoint、鉴权、参数 Schema 和审批策略全部验证后启用。'
      }
    ]
  },
  externalLinks: {
    canCreate: true,
    canEdit: true,
    canDelete: true,
    createLabel: '新增入口',
    createUrl: '/v1/admin/external-links',
    updateUrl: (row) => `/v1/admin/external-links/${row.id}`,
    deleteUrl: (row) => `/v1/admin/external-links/${row.id}`,
    defaults: {
      key: '',
      name: '',
      description: '',
      url: '',
      icon: 'code',
      enabled: true,
      openNewTab: true,
      sortOrder: 0
    },
    fields: [
      { key: 'key', label: '唯一标识', required: true, span: 12, maxlength: 80 },
      { key: 'name', label: '显示名称', required: true, span: 12, maxlength: 100 },
      { key: 'url', label: '跳转地址', required: true, maxlength: 1000 },
      { key: 'description', label: '说明', type: 'textarea', rows: 2, maxlength: 1000 },
      { key: 'icon', label: '图标名称', span: 12, maxlength: 40 },
      { key: 'sortOrder', label: '排序', type: 'number', span: 12, min: -10000, max: 10000 },
      { key: 'openNewTab', label: '新窗口打开', type: 'switch', span: 12 },
      { key: 'enabled', label: '启用', type: 'switch', span: 12 }
    ]
  },
  announcements: {
    canCreate: true,
    createLabel: '发布公告',
    createUrl: '/v1/admin/announcements',
    defaults: { title: '', body: '', groupId: '', channels: ['IN_APP'] },
    fields: [
      { key: 'title', label: '公告标题', required: true, maxlength: 100 },
      {
        key: 'body',
        label: '公告内容',
        type: 'textarea',
        required: true,
        rows: 8,
        maxlength: 2000
      },
      {
        key: 'groupId',
        label: '接收用户组',
        type: 'select',
        optionsFrom: 'groups',
        placeholder: '留空发送给全部正常用户',
        omitEmpty: true
      },
      {
        key: 'channels',
        label: '发送渠道',
        type: 'select',
        multiple: true,
        required: true,
        options: [
          { label: '站内通知', value: 'IN_APP' },
          { label: '邮件通知', value: 'EMAIL' }
        ]
      }
    ]
  },
  notificationTemplates: {
    canCreate: true,
    canEdit: true,
    canDelete: true,
    createLabel: '新增通知模板',
    createUrl: '/v1/admin/notifications/templates',
    updateUrl: (row) => `/v1/admin/notifications/templates/${row.id}`,
    deleteUrl: (row) => `/v1/admin/notifications/templates/${row.id}`,
    defaults: {
      key: '',
      name: '',
      description: '',
      titleTemplate: '',
      bodyTemplate: '',
      channels: ['IN_APP'],
      enabled: true,
      webhookUrl: '',
      webhookSecret: ''
    },
    fields: [
      { key: 'key', label: '模板标识', required: true, span: 12, maxlength: 64 },
      { key: 'name', label: '模板名称', required: true, span: 12, maxlength: 100 },
      { key: 'description', label: '用途说明', type: 'textarea', rows: 2, maxlength: 500 },
      {
        key: 'titleTemplate',
        label: '标题模板',
        required: true,
        maxlength: 300,
        placeholder: '支持 {{变量名}}'
      },
      {
        key: 'bodyTemplate',
        label: '正文模板',
        type: 'textarea',
        required: true,
        rows: 8,
        maxlength: 20000,
        placeholder: '支持 {{变量名}}'
      },
      {
        key: 'channels',
        label: '发送渠道',
        type: 'select',
        multiple: true,
        required: true,
        options: [
          { label: '站内通知', value: 'IN_APP' },
          { label: '邮件通知', value: 'EMAIL' },
          { label: 'Webhook', value: 'WEBHOOK' }
        ]
      },
      { key: 'webhookUrl', label: 'Webhook 地址', maxlength: 1000, omitEmpty: true },
      {
        key: 'webhookSecret',
        label: 'Webhook 签名密钥',
        maxlength: 1000,
        omitEmpty: true,
        placeholder: '留空保留现有密钥'
      },
      { key: 'enabled', label: '启用', type: 'switch' }
    ]
  },
  moderationRules: {
    canCreate: true,
    canEdit: true,
    canDelete: true,
    createLabel: '新增规则',
    createUrl: '/v1/admin/moderation/rules',
    updateUrl: (row) => `/v1/admin/moderation/rules/${row.id}`,
    deleteUrl: (row) => `/v1/admin/moderation/rules/${row.id}`,
    defaults: {
      name: '',
      category: '自定义',
      type: 'KEYWORD',
      pattern: '',
      action: 'BLOCK',
      caseSensitive: false,
      enabled: true,
      sortOrder: 0,
      description: ''
    },
    fields: [
      { key: 'name', label: '规则名称', required: true, span: 12, maxlength: 80 },
      { key: 'category', label: '分类', span: 12, maxlength: 80 },
      {
        key: 'type',
        label: '匹配方式',
        type: 'select',
        required: true,
        span: 12,
        options: [
          { label: '关键词', value: 'KEYWORD' },
          { label: '正则表达式', value: 'REGEX' }
        ]
      },
      {
        key: 'action',
        label: '命中动作',
        type: 'select',
        required: true,
        span: 12,
        options: [
          { label: '仅记录', value: 'LOG' },
          { label: '转人工审核', value: 'REVIEW' },
          { label: '直接阻断', value: 'BLOCK' }
        ]
      },
      {
        key: 'pattern',
        label: '匹配内容',
        type: 'textarea',
        required: true,
        rows: 4,
        maxlength: 500
      },
      { key: 'description', label: '规则说明', type: 'textarea', rows: 2, maxlength: 500 },
      { key: 'sortOrder', label: '排序', type: 'number', span: 8, min: 0, max: 10000 },
      { key: 'caseSensitive', label: '区分大小写', type: 'switch', span: 8 },
      { key: 'enabled', label: '启用', type: 'switch', span: 8 }
    ]
  },
  alertRules: {
    canEdit: true,
    updateUrl: (row) => `/v1/admin/alerts/rules/${row.id}`,
    defaults: {
      enabled: true,
      severity: 'HIGH',
      cooldownMinutes: 30,
      notifyInApp: true,
      notifyWebhook: false,
      webhookUrl: '',
      webhookSecret: ''
    },
    fields: [
      {
        key: 'severity',
        label: '告警级别',
        type: 'select',
        required: true,
        span: 12,
        options: [
          { label: '低', value: 'LOW' },
          { label: '中', value: 'MEDIUM' },
          { label: '高', value: 'HIGH' },
          { label: '严重', value: 'CRITICAL' }
        ]
      },
      {
        key: 'cooldownMinutes',
        label: '通知冷却（分钟）',
        type: 'number',
        span: 12,
        min: 1,
        max: 10080
      },
      { key: 'notifyInApp', label: '站内通知', type: 'switch', span: 8 },
      { key: 'notifyWebhook', label: 'Webhook 通知', type: 'switch', span: 8 },
      { key: 'enabled', label: '启用规则', type: 'switch', span: 8 },
      { key: 'webhookUrl', label: 'Webhook 地址', maxlength: 500 },
      {
        key: 'webhookSecret',
        label: 'Webhook 密钥',
        placeholder: '留空保留现有密钥',
        maxlength: 500,
        omitEmpty: true
      }
    ]
  }
}
