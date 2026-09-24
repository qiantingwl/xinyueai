<template>
  <div v-loading="loading" class="xinyue-page settings-page">
    <header class="page-title"
      ><div
        ><h1>{{ xt('业务系统配置') }}</h1
        ><p>{{ xt('统一管理站点、登录注册、商业化、邮件服务和用户默认值') }}</p></div
      ><ElButton type="primary" :loading="saving" :disabled="!settings" @click="save"
        ><ArtSvgIcon icon="ri:save-line" />{{ xt('保存配置') }}</ElButton
      ></header
    >
    <ElResult
      v-if="!loading && !settings"
      icon="warning"
      :title="xt('配置加载失败')"
      :sub-title="xt('请刷新后重试')"
    >
      <template #extra
        ><ElButton type="primary" @click="load">{{ xt('重新加载') }}</ElButton></template
      >
    </ElResult>
    <ElTabs v-if="settings" v-model="tab" class="settings-tabs">
      <ElTabPane :label="xt('站点与商业能力')" name="site"
        ><ElCard v-if="settings" shadow="never"
          ><template #header
            ><strong>{{ xt('站点信息') }}</strong></template
          ><ElForm label-position="top"
            ><ElRow :gutter="16"
              ><ElCol :span="12"
                ><ElFormItem :label="xt('站点名称')"
                  ><ElInput v-model.trim="settings.siteName" /></ElFormItem></ElCol
              ><ElCol :span="12"
                ><ElFormItem :label="xt('客服地址')"
                  ><ElInput
                    v-model.trim="settings.supportUrl"
                    placeholder="https://..." /></ElFormItem></ElCol></ElRow
            ><ElFormItem :label="xt('品牌 Logo 地址')"
              ><ElInput
                v-model.trim="settings.siteLogoUrl"
                :placeholder="xt('留空使用默认品牌标识')" /></ElFormItem></ElForm></ElCard
        ><ElCard v-if="settings" shadow="never"
          ><template #header
            ><strong>{{ xt('用户端导航') }}</strong></template
          ><div class="toggle-grid"
            ><ToggleRow
              v-model="settings.sidebarCreationEnabled"
              :title="xt('AI 创作')"
              :note="xt('图片与视频创作入口')" />
            <ToggleRow
              v-model="settings.sidebarCommerceEnabled"
              :title="xt('电商中心')"
              :note="xt('商品视觉与电商内容入口')" />
            <ToggleRow
              v-model="settings.sidebarOfficeEnabled"
              :title="xt('办公中心')"
              :note="xt('文档、表格和 Agent 任务入口')" />
            <ToggleRow
              v-model="settings.sidebarPromptsEnabled"
              :title="xt('提示词库')"
              :note="xt('图片和视频灵感入口')" />
            <ToggleRow
              v-model="settings.sidebarPluginsEnabled"
              :title="xt('能力中心')"
              :note="xt('助手、技能和知识库入口')" />
            <ToggleRow
              v-model="workspaceSidebarEnabled"
              :title="xt('工作空间')"
              :note="xt('统一管理项目、工作流、版本与文件资产')" /></div></ElCard
        ><ElCard v-if="settings" shadow="never"
          ><template #header
            ><strong>{{ xt('左侧菜单') }}</strong></template
          ><div class="toggle-grid"
            ><ToggleRow
              v-model="settings.sidebarCreationEnabled"
              :title="xt('AI 创作')"
              :note="xt('控制图片和视频创作入口')" /><ToggleRow
              v-model="settings.sidebarCommerceEnabled"
              :title="xt('电商中心')"
              :note="xt('控制电商内容与商品视觉入口')" /><ToggleRow
              v-model="settings.sidebarOfficeEnabled"
              :title="xt('办公中心')"
              :note="xt('控制文档和表格办公入口')" /><ToggleRow
              v-model="settings.sidebarPromptsEnabled"
              :title="xt('提示词库')"
              :note="xt('控制提示词浏览入口')" /><ToggleRow
              v-model="settings.sidebarPluginsEnabled"
              :title="xt('插件市场')"
              :note="xt('控制插件浏览与使用入口')" /><ToggleRow
              v-model="settings.sidebarProjectsEnabled"
              :title="xt('项目')"
              :note="xt('控制协作项目入口')" /><ToggleRow
              v-model="settings.sidebarAssetsEnabled"
              :title="xt('文件库')"
              :note="xt('控制用户文件管理入口')" /></div></ElCard
        ><ElCard v-if="settings" shadow="never"
          ><template #header
            ><div class="card-title"
              ><div
                ><strong>{{ xt('侧边栏排序与名称') }}</strong
                ><small>{{ xt('全站统一。可关闭入口，包括新对话。') }}</small></div
              ></div
            ></template
          ><SidebarNavEditor
            v-model:preference="settings.sidebarNav"
            :catalog="sidebarNavCatalog"
            :promoted="settings.sidebarNav.promoted"
            @demote="demoteNav" /></ElCard
        ><template v-for="group in nestedNavGroups" :key="group.id"
          ><ElCard v-if="settings" shadow="never"
            ><template #header
              ><div class="card-title"
                ><div
                  ><strong>{{ xt(group.title) }}</strong
                  ><small>{{ xt(group.note) }}</small></div
                ></div
              ></template
            ><SidebarNavEditor
              :preference="groupPreference(group.id)"
              :catalog="group.items"
              promoteable
              :promoted="settings.sidebarNav.promoted"
              @update:preference="setGroupPreference(group.id, $event)"
              @promote="promoteNav"
              @demote="demoteNav" /></ElCard></template
        ><ElCard v-if="settings" shadow="never"
          ><template #header
            ><strong>{{ xt('商业能力开关') }}</strong></template
          ><div class="toggle-grid"
            ><ToggleRow
              v-model="settings.subscriptionsEnabled"
              :title="xt('开放订阅套餐')"
              :note="xt('用户端展示套餐购买与订阅权益')" /><ToggleRow
              v-model="settings.trialEnabled"
              :title="xt('开放免费试用')"
              :note="xt('允许符合条件的新用户领取试用')" /><ToggleRow
              v-model="settings.rechargeEnabled"
              :title="xt('开放余额充值')"
              :note="xt('用户端展示充值商品和支付入口')" /><ToggleRow
              v-model="settings.userByokEnabled"
              :title="xt('允许用户 API 密钥')"
              :note="xt('最终权限仍受用户分组和模型配置约束')" /></div
          ><ElDivider content-position="left">{{ xt('图片提示词反推') }}</ElDivider
          ><div class="toggle-grid"
            ><ToggleRow
              v-model="settings.imagePromptEnabled"
              :title="xt('开放图片反推')"
              :note="xt('在工作空间画布后展示图片反推入口')" /></div
          ><ElRow :gutter="16" class="number-row"
            ><ElCol :xs="24" :sm="12"
              ><ElFormItem :label="xt('费用承担方')"
                ><ElSelect v-model="settings.imagePromptBillingMode" class="wide"
                  ><ElOption :label="xt('平台承担')" value="PLATFORM" />
                  <ElOption :label="xt('用户创作点')" value="USER_CREDITS" />
                  <ElOption
                    :label="xt('用户 BYOK')"
                    value="USER_BYOK" /></ElSelect></ElFormItem></ElCol
            ><ElCol :xs="24" :sm="12"
              ><ElFormItem :label="xt('视觉模型')"
                ><ElSelect
                  v-model="settings.imagePromptModelKey"
                  clearable
                  filterable
                  class="wide"
                  :placeholder="xt('跟随默认聊天模型')"
                  ><ElOption
                    v-for="item in chatModels"
                    :key="item.id"
                    :label="item.displayName"
                    :value="item.key" /></ElSelect></ElFormItem></ElCol></ElRow
          ><ElAlert
            v-if="settings.imagePromptBillingMode === 'USER_BYOK' && !settings.userByokEnabled"
            :title="xt('当前未开放用户 API 密钥，用户 BYOK 模式将无法执行。')"
            type="warning"
            :closable="false"
            show-icon />
          <ElRow :gutter="16" class="number-row"
            ><ElCol :xs="24" :sm="12"
              ><ElFormItem :label="xt('最低充值金额（分）')"
                ><ElInputNumber
                  v-model="settings.minRechargeCents"
                  :min="1"
                  class="wide" /></ElFormItem></ElCol></ElRow
          ><ElDivider content-position="left">{{ xt('模型自动定价') }}</ElDivider
          ><div class="pricing-preset-section">
            <div class="pricing-preset-heading">
              <div
                ><strong>{{ xt('计价基准预设') }}</strong
                ><small>{{
                  xt('选择后只填充配置，保存后生效；不会自动覆盖模型价格。')
                }}</small></div
              >
              <ElTag type="info">{{ pricingFormulaPreview }}</ElTag>
            </div>
            <div class="pricing-preset-grid">
              <button
                v-for="preset in pricingBasePresets"
                :key="preset.key"
                type="button"
                :class="{ active: activePricingPreset === preset.key }"
                @click="applyPricingBasePreset(preset)"
                ><strong>{{ preset.label }}</strong
                ><small>{{ preset.note }}</small></button
              >
            </div>
          </div>
          <ElRow :gutter="16" class="number-row"
            ><ElCol :xs="24" :sm="12" :lg="6"
              ><ElFormItem :label="xt('结算币种')"
                ><ElSelect v-model="settings.currency" class="wide"
                  ><ElOption :label="xt('人民币 CNY')" value="CNY" /><ElOption
                    :label="xt('美元 USD')"
                    value="USD" /></ElSelect></ElFormItem></ElCol
            ><ElCol :xs="24" :sm="12" :lg="6"
              ><ElFormItem :label="xt('1 USD 兑换结算币种')"
                ><ElInputNumber
                  v-model="pricingUsdExchangeRate"
                  :min="0.000001"
                  :max="100"
                  :precision="6"
                  :step="0.1"
                  class="wide" /></ElFormItem></ElCol
            ><ElCol :xs="24" :sm="12" :lg="6"
              ><ElFormItem :label="xt('每计费额度价值')"
                ><ElInputNumber
                  v-model="creditUnitValue"
                  :min="0.000001"
                  :max="100"
                  :precision="6"
                  :step="0.001"
                  class="wide" /></ElFormItem></ElCol
            ><ElCol :xs="24" :sm="12" :lg="6"
              ><ElFormItem :label="xt('默认售价加价率（%）')"
                ><ElInputNumber
                  v-model="settings.modelImportMarkupPercent"
                  :min="100"
                  :max="1000"
                  class="wide" /></ElFormItem></ElCol
            ><ElCol :xs="24" :sm="12"
              ><ElFormItem :label="xt('价格目录刷新（小时）')"
                ><ElInputNumber
                  v-model="settings.modelPriceCatalogRefreshHours"
                  :min="1"
                  :max="168"
                  class="wide" /></ElFormItem></ElCol
            ><ElCol :xs="24" :sm="12"
              ><ElFormItem :label="xt('价格目录')"
                ><ElInput
                  v-model.trim="settings.modelPriceCatalogUrl"
                  class="wide" /></ElFormItem></ElCol></ElRow
          ><div class="pricing-markup-presets">
            <span>{{ xt('加价率快捷值') }}</span>
            <ElButton
              v-for="preset in pricingMarkupPresets"
              :key="preset.value"
              size="small"
              :type="settings.modelImportMarkupPercent === preset.value ? 'primary' : 'default'"
              plain
              @click="settings.modelImportMarkupPercent = preset.value"
              >{{ preset.label }}</ElButton
            >
          </div>
          <ElAlert
            :title="
              xt(
                '同步公式：目录 USD 参考成本 × 汇率 × 加价率 ÷ 每额度价值。保存基准后，到“模型与定价”预览并选择是否应用。'
              )
            "
            type="info"
            :closable="false"
            show-icon /></ElCard
      ></ElTabPane>

      <ElTabPane :label="xt('后台安全')" name="security">
        <AdminAccountCard />
      </ElTabPane>

      <ElTabPane :label="xt('登录与注册')" name="auth"
        ><ElCard v-if="settings" shadow="never"
          ><template #header
            ><strong>{{ xt('站内账户') }}</strong></template
          ><div class="toggle-grid"
            ><ToggleRow
              v-model="settings.registrationEnabled"
              :title="xt('开放新用户注册')"
              :note="xt('关闭后只允许已有账户登录')" /><ToggleRow
              v-model="settings.passwordLoginEnabled"
              :title="xt('用户名 / 邮箱密码登录')"
              :note="xt('用户使用注册后的账户与密码登录')" /><ToggleRow
              v-model="settings.emailLoginEnabled"
              :title="xt('邮箱验证码登录')"
              :note="xt('通过邮箱一次性验证码登录')" /><ToggleRow
              v-model="settings.emailVerifyEnabled"
              :title="xt('注册时验证邮箱')"
              :note="xt('新账户完成邮箱验证后注册')" /><ToggleRow
              v-model="settings.passwordRegistrationEnabled"
              :title="xt('允许用户名密码注册')"
              :note="xt('可不填写邮箱，仅使用用户名和密码注册')" /></div
          ><ElForm label-position="top" class="form-block"
            ><ElFormItem :label="xt('允许注册的邮箱域名')"
              ><ElInput
                v-model="domainsText"
                type="textarea"
                :rows="3"
                :placeholder="xt('留空不限制；多个域名用逗号或换行分隔')" /></ElFormItem
            ><ElRow :gutter="16"
              ><ElCol :span="12"
                ><ElFormItem :label="xt('验证码有效时间（分钟）')"
                  ><ElInputNumber
                    v-model="settings.otpTtlMinutes"
                    :min="1"
                    :max="60"
                    class="wide" /></ElFormItem></ElCol
              ><ElCol :span="12"
                ><ElFormItem :label="xt('重新发送间隔（秒）')"
                  ><ElInputNumber
                    v-model="settings.otpResendSeconds"
                    :min="10"
                    :max="3600"
                    class="wide" /></ElFormItem></ElCol></ElRow></ElForm></ElCard
        ><ElCard v-if="settings" shadow="never"
          ><template #header
            ><div class="card-title"
              ><strong>Linux.do Connect</strong
              ><ElTag :type="linuxReady ? 'success' : 'info'">{{
                linuxReady ? xt('配置完整') : xt('待配置')
              }}</ElTag></div
            ></template
          ><ToggleRow
            v-model="settings.linuxDoLoginEnabled"
            :title="xt('启用 Linux.do 登录')"
            :note="xt('登录按钮展示在站内账户登录方式下方')" /><ElForm
            label-position="top"
            class="form-block"
            ><ElRow :gutter="16"
              ><ElCol :span="12"
                ><ElFormItem label="Client ID"
                  ><ElInput v-model.trim="settings.linuxDoClientId" /></ElFormItem></ElCol
              ><ElCol :span="12"
                ><ElFormItem label="Client Secret"
                  ><ElInput
                    v-model="linuxSecret"
                    type="password"
                    show-password
                    :placeholder="
                      settings.hasLinuxDoClientSecret
                        ? `${xt('已保存')} ${settings.linuxDoClientSecretHint || ''}，${xt('留空保留')}`
                        : xt('请输入 Client Secret')
                    " /></ElFormItem></ElCol></ElRow
            ><ElFormItem :label="xt('回调地址')"
              ><ElInput v-model.trim="settings.linuxDoRedirectUrl"
                ><template #append
                  ><ElButton @click="fillCallback">{{ xt('本地地址') }}</ElButton></template
                ></ElInput
              ></ElFormItem
            ><ElRow :gutter="16"
              ><ElCol :span="12"
                ><ElFormItem label="Scope"
                  ><ElInput v-model.trim="settings.linuxDoScopes" /></ElFormItem></ElCol
              ><ElCol :span="12"
                ><ElFormItem :label="xt('UserInfo 端点')"
                  ><ElInput
                    v-model.trim="settings.linuxDoUserInfoUrl" /></ElFormItem></ElCol></ElRow
            ><ElCollapse
              ><ElCollapseItem :title="xt('高级 OAuth 端点')" name="oauth"
                ><ElFormItem :label="xt('Authorize 端点')"
                  ><ElInput v-model.trim="settings.linuxDoAuthorizeUrl" /></ElFormItem
                ><ElFormItem :label="xt('Token 端点')"
                  ><ElInput
                    v-model.trim="
                      settings.linuxDoTokenUrl
                    " /></ElFormItem></ElCollapseItem></ElCollapse></ElForm></ElCard
      ></ElTabPane>

      <ElTabPane :label="xt('邮件服务')" name="email"
        ><ElCard v-if="settings" shadow="never"
          ><template #header
            ><div class="card-title"
              ><strong>{{ xt('SMTP 发信服务') }}</strong
              ><ElTag :type="smtpReady ? 'success' : 'info'">{{
                smtpReady ? xt('配置完整') : xt('待配置')
              }}</ElTag></div
            ></template
          ><ToggleRow
            v-model="settings.smtpEnabled"
            :title="xt('启用 SMTP')"
            :note="xt('用于登录验证码、通知、找回和运营邮件')"
          /><ElForm label-position="top" class="form-block"
            ><ElRow :gutter="16"
              ><ElCol :span="16"
                ><ElFormItem :label="xt('SMTP 主机')"
                  ><ElInput
                    v-model.trim="settings.smtpHost"
                    placeholder="smtp.example.com" /></ElFormItem></ElCol
              ><ElCol :span="8"
                ><ElFormItem :label="xt('端口')"
                  ><ElInputNumber
                    v-model="settings.smtpPort"
                    :min="1"
                    :max="65535"
                    class="wide" /></ElFormItem></ElCol></ElRow
            ><ElRow :gutter="16"
              ><ElCol :span="12"
                ><ElFormItem :label="xt('用户名')"
                  ><ElInput v-model.trim="settings.smtpUsername" /></ElFormItem></ElCol
              ><ElCol :span="12"
                ><ElFormItem :label="xt('密码 / 授权码')"
                  ><ElInput
                    v-model="smtpPassword"
                    type="password"
                    show-password
                    :placeholder="
                      settings.hasSmtpPassword
                        ? `${xt('已保存')} ${settings.smtpPasswordHint || ''}，${xt('留空保留')}`
                        : ''
                    " /></ElFormItem></ElCol></ElRow
            ><ElRow :gutter="16"
              ><ElCol :span="12"
                ><ElFormItem :label="xt('发件人名称')"
                  ><ElInput v-model.trim="settings.smtpFromName" /></ElFormItem></ElCol
              ><ElCol :span="12"
                ><ElFormItem :label="xt('发件邮箱')"
                  ><ElInput v-model.trim="settings.smtpFromEmail" /></ElFormItem></ElCol></ElRow
            ><ElCheckbox v-model="settings.smtpSecure" class="smtp-secure">{{
              xt('使用 SSL / TLS 安全连接')
            }}</ElCheckbox></ElForm
          ></ElCard
        ></ElTabPane
      >

      <ElTabPane :label="xt('新用户默认值')" name="defaults"
        ><ElCard v-if="settings" shadow="never"
          ><template #header
            ><strong>{{ xt('账户与权益') }}</strong></template
          ><ElForm label-position="top"
            ><ElRow :gutter="16"
              ><ElCol :span="8"
                ><ElFormItem :label="xt('注册赠送创作点')"
                  ><ElInputNumber
                    v-model="settings.defaultUserCredits"
                    :min="0"
                    class="wide" /></ElFormItem></ElCol
              ><ElCol :span="8"
                ><ElFormItem :label="xt('邀请奖励')"
                  ><ElInputNumber
                    v-model="settings.inviteRewardCredits"
                    :min="0"
                    class="wide" /></ElFormItem></ElCol
              ><ElCol :span="8"
                ><ElFormItem :label="xt('试用赠送创作点')"
                  ><ElInputNumber
                    v-model="settings.trialCredits"
                    :min="0"
                    class="wide" /></ElFormItem></ElCol></ElRow
            ><ElRow :gutter="16"
              ><ElCol :span="12"
                ><ElFormItem :label="xt('默认用户分组')"
                  ><ElSelect v-model="settings.defaultUserGroupId" class="wide"
                    ><ElOption
                      v-for="group in groups"
                      :key="group.id"
                      :label="group.name"
                      :value="group.id" /></ElSelect></ElFormItem></ElCol
              ><ElCol :span="12"
                ><ElFormItem :label="xt('默认试用套餐')"
                  ><ElSelect v-model="settings.defaultTrialPlanId" clearable class="wide"
                    ><ElOption
                      v-for="plan in trialPlans"
                      :key="plan.id"
                      :label="`${plan.name} · ${plan.trialDays} ${xt('天')}`"
                      :value="plan.id" /></ElSelect></ElFormItem></ElCol></ElRow></ElForm></ElCard
        ><ElCard v-if="settings" shadow="never"
          ><template #header
            ><strong>{{ xt('邀请奖励规则') }}</strong></template
          ><div class="toggle-grid"
            ><ToggleRow
              v-model="settings.referralEnabled"
              :title="xt('启用邀请奖励')"
              :note="xt('邀请关系在注册时绑定，首笔有效支付后进入奖励流程')" />
            <ToggleRow
              v-model="settings.referralAutoApprove"
              :title="xt('低风险自动审核')"
              :note="xt('同 IP、同设备等风险记录仍进入人工审核')" /></div
          ><ElForm label-position="top" class="form-block"
            ><ElRow :gutter="16" class="number-row"
              ><ElCol :xs="24" :sm="8"
                ><ElFormItem :label="xt('首笔支付门槛（分）')"
                  ><ElInputNumber
                    v-model="settings.referralMinimumPaidCents"
                    :min="0"
                    class="wide" /></ElFormItem></ElCol
              ><ElCol :xs="24" :sm="8"
                ><ElFormItem :label="xt('奖励冷静期（天）')"
                  ><ElInputNumber
                    v-model="settings.referralCoolingDays"
                    :min="0"
                    :max="365"
                    class="wide" /></ElFormItem></ElCol
              ><ElCol :xs="24" :sm="8"
                ><ElFormItem :label="xt('每人每月自动奖励上限（笔）')"
                  ><ElInputNumber
                    v-model="settings.referralMonthlyRewardLimit"
                    :min="0"
                    class="wide" /></ElFormItem></ElCol></ElRow></ElForm
          ><ElAlert
            :title="xt('支付退款后低于门槛时会自动冲正奖励；余额不足将转入人工审核。')"
            type="info"
            :closable="false"
            show-icon /></ElCard
        ><ElCard v-if="settings" shadow="never"
          ><template #header
            ><strong>{{ xt('体验与隐私默认值') }}</strong></template
          ><ElForm label-position="top"
            ><ElRow :gutter="16"
              ><ElCol :span="12"
                ><ElFormItem :label="xt('默认对话模型')"
                  ><ElSelect v-model="settings.defaultChatModelKey" clearable class="wide"
                    ><ElOption
                      v-for="model in chatModels"
                      :key="model.key"
                      :label="model.displayName"
                      :value="model.key" /></ElSelect></ElFormItem></ElCol
              ><ElCol :span="12"
                ><ElFormItem :label="xt('默认图片模型')"
                  ><ElSelect v-model="settings.defaultImageModelKey" clearable class="wide"
                    ><ElOption
                      v-for="model in imageModels"
                      :key="model.key"
                      :label="model.displayName"
                      :value="model.key" /></ElSelect></ElFormItem></ElCol></ElRow
            ><ElRow :gutter="16"
              ><ElCol :span="8"
                ><ElFormItem :label="xt('默认主题')"
                  ><ElSelect v-model="settings.defaultTheme" class="wide"
                    ><ElOption :label="xt('跟随系统')" value="system" /><ElOption
                      :label="xt('浅色')"
                      value="light" /><ElOption
                      :label="xt('深色')"
                      value="dark" /></ElSelect></ElFormItem></ElCol
              ><ElCol :span="8"
                ><ElFormItem :label="xt('默认语言')"
                  ><ElSelect v-model="settings.defaultLanguage" class="wide"
                    ><ElOption :label="xt('简体中文')" value="zh-CN" /><ElOption
                      :label="xt('繁體中文')"
                      value="zh-TW" /><ElOption label="English" value="en" /><ElOption
                      :label="xt('日本語')"
                      value="ja" /><ElOption
                      :label="xt('한국어')"
                      value="ko" /></ElSelect></ElFormItem></ElCol
              ><ElCol :span="8"
                ><ElFormItem :label="xt('临时聊天保留（小时）')"
                  ><ElInputNumber
                    v-model="settings.temporaryChatRetentionHours"
                    :min="1"
                    :max="8760"
                    class="wide" /></ElFormItem></ElCol></ElRow></ElForm
          ><div class="toggle-grid"
            ><ToggleRow
              v-model="settings.defaultChatHistoryEnabled"
              :title="xt('默认保存聊天历史')"
              :note="xt('用户可在个人隐私设置中修改')" /><ToggleRow
              v-model="settings.defaultTrainingOptOut"
              :title="xt('默认不用于训练')"
              :note="xt('商业环境推荐保持开启')" /><ToggleRow
              v-model="settings.defaultShareUsageAnalytics"
              :title="xt('默认共享匿名统计')"
              :note="xt('建议由用户主动选择开启')" /></div></ElCard
      ></ElTabPane>

      <ElTabPane :label="xt('公开页面内容')" name="content">
        <ElCard v-if="settings" shadow="never"
          ><template #header
            ><div class="card-title"
              ><div
                ><strong>{{ xt('官网首页') }}</strong
                ><small>{{ xt('结构化内容保存后直接由用户端读取') }}</small></div
              ><ElButton @click="router.push({ name: 'PublicContentPages' })"
                ><ArtSvgIcon icon="ri:article-line" />{{ xt('法律与品牌页面') }}</ElButton
              ></div
            ></template
          >
          <ElForm label-position="top" class="public-content-form">
            <ElFormItem :label="xt('首页主标题前缀')"
              ><ElInput v-model="settings.siteContent.landing.heroLead" maxlength="100"
            /></ElFormItem>
            <ElRow :gutter="16"
              ><ElCol :span="12"
                ><ElFormItem :label="xt('可信内容区标题')"
                  ><ElInput v-model="settings.siteContent.landing.trustTitle" /></ElFormItem></ElCol
              ><ElCol :span="12"
                ><ElFormItem :label="xt('能力入口区标题')"
                  ><ElInput v-model="settings.siteContent.landing.linksTitle" /></ElFormItem></ElCol
            ></ElRow>
            <ElFormItem :label="xt('可信内容区说明')"
              ><ElInput
                v-model="settings.siteContent.landing.trustDescription"
                type="textarea"
                :rows="2"
                maxlength="500"
                show-word-limit
            /></ElFormItem>
            <ElFormItem :label="xt('能力入口区说明')"
              ><ElInput
                v-model="settings.siteContent.landing.linksDescription"
                type="textarea"
                :rows="2"
                maxlength="500"
                show-word-limit
            /></ElFormItem>
            <ElDivider content-position="left">{{ xt('首页任务模式') }}</ElDivider>
            <section class="site-content-list"
              ><article v-for="(mode, index) in settings.siteContent.landing.modes" :key="mode.key"
                ><header
                  ><strong>{{ index + 1 }}. {{ mode.title }}</strong></header
                ><div class="site-content-fields"
                  ><ElInput v-model="mode.title" :placeholder="xt('名称')" /><ElInput
                    v-model="mode.lead"
                    :placeholder="xt('短标题')" /><ElInput
                    v-model="mode.path"
                    :placeholder="xt('路径')" /><ElInput
                    v-model="mode.image"
                    :placeholder="xt('预览图地址')" /><ElInput
                    v-model="mode.description"
                    type="textarea"
                    :rows="2"
                    :placeholder="xt('能力说明')" /></div></article
            ></section>
            <ElDivider content-position="left">{{ xt('顶部导航') }}</ElDivider>
            <section class="site-content-list"
              ><article v-for="group in settings.siteContent.landing.navGroups" :key="group.key"
                ><header><ElInput v-model="group.label" :placeholder="xt('分组名称')" /></header
                ><div
                  v-for="(item, itemIndex) in group.items"
                  :key="itemIndex"
                  class="site-content-inline"
                  ><ElInput v-model="item.label" :placeholder="xt('名称')" /><ElInput
                    v-model="item.description"
                    :placeholder="xt('说明')" /><ElInput
                    v-model="item.to"
                    :placeholder="xt('跳转地址')" /><ElButton
                    text
                    type="danger"
                    @click="group.items.splice(itemIndex, 1)"
                    ><ArtSvgIcon icon="ri:delete-bin-line" /></ElButton></div
                ><ElButton
                  plain
                  @click="group.items.push({ label: '新入口', description: '', to: '/chat' })"
                  ><ArtSvgIcon icon="ri:add-line" />{{ xt('新增入口') }}</ElButton
                ></article
              ></section
            >
            <ElDivider content-position="left">{{ xt('能力入口') }}</ElDivider>
            <section class="site-content-list"
              ><div
                v-for="(item, index) in settings.siteContent.landing.capabilityLinks"
                :key="index"
                class="site-content-inline"
                ><ElInput v-model="item.title" :placeholder="xt('名称')" /><ElInput
                  v-model="item.description"
                  :placeholder="xt('说明')" /><ElInput
                  v-model="item.to"
                  :placeholder="xt('跳转地址')" /><ElButton
                  text
                  type="danger"
                  @click="settings.siteContent.landing.capabilityLinks.splice(index, 1)"
                  ><ArtSvgIcon icon="ri:delete-bin-line" /></ElButton></div
              ><ElButton
                plain
                @click="
                  settings.siteContent.landing.capabilityLinks.push({
                    title: '新能力',
                    description: '',
                    to: '/chat'
                  })
                "
                ><ArtSvgIcon icon="ri:add-line" />{{ xt('新增能力入口') }}</ElButton
              ></section
            >
            <ElDivider content-position="left">{{ xt('常见问题') }}</ElDivider>
            <ElFormItem :label="xt('区域标题')"
              ><ElInput v-model="settings.siteContent.landing.faqTitle" /></ElFormItem
            ><section class="site-content-list"
              ><article v-for="(item, index) in settings.siteContent.landing.faqs" :key="index"
                ><header
                  ><ElInput v-model="item.question" :placeholder="xt('问题')" /><ElButton
                    text
                    type="danger"
                    @click="settings.siteContent.landing.faqs.splice(index, 1)"
                    ><ArtSvgIcon icon="ri:delete-bin-line" /></ElButton></header
                ><ElInput
                  v-model="item.answer"
                  type="textarea"
                  :rows="2"
                  :placeholder="xt('答案')"
                  maxlength="1000"
                  show-word-limit /></article
              ><ElButton
                plain
                @click="settings.siteContent.landing.faqs.push({ question: '新问题', answer: '' })"
                ><ArtSvgIcon icon="ri:add-line" />{{ xt('新增问题') }}</ElButton
              ></section
            >
            <ElDivider content-position="left">{{ xt('页尾与行动区') }}</ElDivider
            ><ElRow :gutter="16"
              ><ElCol :span="12"
                ><ElFormItem :label="xt('行动区标题')"
                  ><ElInput v-model="settings.siteContent.landing.finalTitle" /></ElFormItem></ElCol
              ><ElCol :span="12"
                ><ElFormItem :label="xt('版权文字')"
                  ><ElInput
                    v-model="settings.siteContent.landing.copyright" /></ElFormItem></ElCol></ElRow
            ><ElFormItem :label="xt('行动区说明')"
              ><ElInput
                v-model="settings.siteContent.landing.finalDescription"
                type="textarea"
                :rows="2" /></ElFormItem
            ><ElFormItem :label="xt('页尾品牌说明')"
              ><ElInput
                v-model="settings.siteContent.landing.footerDescription"
                type="textarea"
                :rows="2"
            /></ElFormItem>
          </ElForm>
        </ElCard>
      </ElTabPane>

      <ElTabPane :label="xt('聊天主页 UI')" name="chat-ui"
        ><ElCard v-if="settings" shadow="never"
          ><template #header
            ><div class="card-title"
              ><strong>{{ xt('聊天主页 UI') }}</strong
              ><ElTag type="primary">{{ activePresetLabel }}</ElTag></div
            ></template
          ><ElFormItem :label="xt('聊天主页界面')"
            ><div class="chat-ui-presets" role="radiogroup" :aria-label="xt('聊天主页界面')"
              ><button
                v-for="preset in chatUiPresets"
                :key="preset.value"
                type="button"
                role="radio"
                :aria-checked="settings.chatUiPreset === preset.value"
                :class="{ active: settings.chatUiPreset === preset.value }"
                @click="settings.chatUiPreset = preset.value"
                ><span :class="`preset-preview preset-preview--${preset.value}`"
                  ><i /><i /><i /></span
                ><strong>{{ preset.label }}</strong
                ><small>{{ preset.note }}</small></button
              ></div
            ></ElFormItem
          ><ElFormItem :label="xt('助手头像动效')"
            ><ElSelect v-model="settings.chatAvatarMotion" class="wide"
              ><ElOption
                value="ambient"
                :label="xt('常驻轮动（空闲时也循环播放形态变化）')" /><ElOption
                value="active"
                :label="xt('仅生成时（思考/回答中播放，结束后定格）')" /><ElOption
                value="off"
                :label="xt('静态（始终定格）')" /></ElSelect></ElFormItem
          ><ElFormItem :label="xt('助手头像小球')"
            ><ElSwitch
              v-model="settings.chatAvatarEnabled"
              :active-text="xt('在对话和首页显示')" /></ElFormItem
          ><template v-if="settings.chatAvatarEnabled"
            ><ElFormItem :label="xt('头像形态风格')"
              ><ElSelect v-model="settings.chatAvatarStyle" class="wide"
                ><ElOption value="classic" :label="xt('经典（球体为主，六种形态轮换）')" /><ElOption
                  value="lively"
                  :label="xt('活泼（形变更密集，含彗星扫尾）')" /><ElOption
                  value="calm"
                  :label="xt('安静（只呼吸眨眼，偶尔 wink）')" /><ElOption
                  value="geometric"
                  :label="xt('几何变换（蛋形 / 六边形 / 三角旋涡）')" /><ElOption
                  value="faces"
                  :label="xt('表情包（wink / 瞪眼 / 消息点）')" /><ElOption
                  value="orbit"
                  :label="xt('星轨环绕（常驻）')" /><ElOption
                  value="comet"
                  :label="xt('彗星扫尾（常驻）')" /><ElOption
                  value="thinker"
                  :label="xt('三点脉冲（常驻）')" /><ElOption
                  value="sleepy"
                  :label="xt('弹跳小点（常驻）')" /></ElSelect></ElFormItem
            ><ElFormItem :label="xt('头像配色')"
              ><div class="avatar-color-row"
                ><ElSelect v-model="avatarColorMode" class="wide"
                  ><ElOption value="auto" :label="xt('跟随主题（明暗自动切换）')" /><ElOption
                    value="brand"
                    :label="xt('品牌蓝')" /><ElOption
                    value="custom"
                    :label="xt('自定义颜色')" /></ElSelect
                ><ElColorPicker
                  v-if="avatarColorMode === 'custom'"
                  v-model="settings.chatAvatarColor" /></div></ElFormItem></template
          ><section v-if="settings.chatUiPreset === 'doubao'" class="home-content-editor"
            ><header
              ><div
                ><strong>{{ xt('豆包推荐内容') }}</strong
                ><small>{{ xt('展示在首页输入框上方，点击后填入问题或打开链接') }}</small></div
              ><ElButton @click="addDoubaoRecommendation"
                ><ArtSvgIcon icon="ri:add-line" />{{ xt('新增推荐') }}</ElButton
              ></header
            ><div
              class="content-row"
              v-for="(item, index) in settings.chatHomeContent.doubaoRecommendations"
              :key="index"
              ><ElInput v-model="item.title" :placeholder="xt('展示文字')" /><ElInput
                v-model="item.prompt"
                :placeholder="xt('填入输入框的问题')" /><ElInput
                v-model="item.targetUrl"
                placeholder="/office 或 https://..." /><ElButton
                text
                type="danger"
                @click="settings.chatHomeContent.doubaoRecommendations.splice(index, 1)"
                ><ArtSvgIcon icon="ri:delete-bin-line" /></ElButton></div></section
          ><section v-else-if="settings.chatUiPreset === 'qianwen'" class="home-content-editor"
            ><header
              ><div
                ><strong>{{ xt('千问首页轮播') }}</strong
                ><small>{{ xt('支持标题、说明、按钮、封面图和站内外跳转') }}</small></div
              ><ElButton @click="addQianwenBanner"
                ><ArtSvgIcon icon="ri:add-line" />{{ xt('新增轮播') }}</ElButton
              ></header
            ><article
              class="banner-editor"
              v-for="(item, index) in settings.chatHomeContent.qianwenBanners"
              :key="index"
              ><div class="banner-editor__number">{{ index + 1 }}</div
              ><div class="banner-editor__fields"
                ><ElInput v-model="item.title" :placeholder="xt('标题')" /><ElInput
                  v-model="item.description"
                  :placeholder="xt('说明文字')" /><ElInput
                  v-model="item.buttonText"
                  :placeholder="xt('按钮文字')" /><div class="banner-image-field"
                  ><ElInput v-model="item.imageUrl" :placeholder="xt('封面图片地址')" /><ElButton
                    plain
                    :loading="bannerUploadingIndex === index"
                    @click="uploadQianwenImage(index)"
                    ><ArtSvgIcon icon="ri:upload-2-line" />{{ xt('上传封面') }}</ElButton
                  ></div
                ><ElInput v-model="item.targetUrl" placeholder="/office 或 https://..." /></div
              ><ElButton
                text
                type="danger"
                @click="settings.chatHomeContent.qianwenBanners.splice(index, 1)"
                ><ArtSvgIcon icon="ri:delete-bin-line" /></ElButton></article></section
          ><section v-else-if="settings.chatUiPreset === 'kimi'" class="home-content-editor"
            ><header
              ><div
                ><strong>{{ xt('Kimi 项目选择条') }}</strong
                ><small>{{ xt('展示在输入框下方') }}</small></div
              ></header
            ><div class="content-row content-row--two"
              ><ElInput
                v-model="settings.chatHomeContent.kimiProject.label"
                :placeholder="xt('显示名称')" /><ElInput
                v-model="settings.chatHomeContent.kimiProject.targetUrl"
                placeholder="/workspace?tab=projects" /></div></section
          ><section v-if="activeComposerControls" class="home-content-editor quick-action-editor"
            ><header
              ><div
                ><strong>{{ xt('快捷能力与执行') }}</strong
                ><small>{{ xt('控制当前界面的入口、排序、模型和联网策略') }}</small></div
              ><ElButton type="primary" plain @click="addQuickAction"
                ><ArtSvgIcon icon="ri:add-line" />{{ xt('新增能力') }}</ElButton
              ></header
            ><div class="quick-control-grid"
              ><ToggleRow
                v-model="activeComposerControls.modeEnabled"
                :title="xt('模式选择')"
                :note="xt('展示快速、专家和任务模式')" /><ToggleRow
                v-model="activeComposerControls.webSearchEnabled"
                :title="xt('联网开关')"
                :note="xt('允许用户手动开关联网搜索')" /><ToggleRow
                v-model="activeComposerControls.modelSelectorEnabled"
                :title="xt('模型选择')"
                :note="xt('允许用户临时切换可用模型')" /><ToggleRow
                v-model="activeComposerControls.moreEnabled"
                :title="xt('更多菜单')"
                :note="xt('展示收纳在更多中的快捷能力')" /></div
            ><div class="quick-action-note"
              ><ArtSvgIcon icon="ri:information-line" /><span>{{
                xt('快捷能力只有在处理器、模型、路由和搜索依赖均可用时才会发布到用户端。')
              }}</span></div
            ><div v-if="!activeQuickActions.length" class="quick-action-empty">{{
              xt('当前界面暂无快捷能力，可点击右上角新增。')
            }}</div
            ><article
              v-for="(action, index) in activeQuickActions"
              :key="action.id"
              class="quick-action-row"
              ><header
                ><span class="quick-action-order">{{ index + 1 }}</span
                ><div
                  ><strong>{{ action.label || xt('未命名能力') }}</strong
                  ><small>{{ action.id }}</small></div
                ><ElTag size="small" effect="plain">{{
                  action.placement === 'BAR' ? xt('主栏') : xt('更多')
                }}</ElTag
                ><ElTooltip
                  :content="quickActionStatus(action)?.reason || xt('依赖检查通过')"
                  placement="top"
                  ><ElTag size="small" effect="plain" :type="quickActionStatusType(action)">{{
                    quickActionStatusLabel(action)
                  }}</ElTag></ElTooltip
                ><ElSwitch
                  v-model="action.enabled"
                  inline-prompt
                  active-text="启"
                  inactive-text="停" />
                <ElButton
                  text
                  :disabled="!canMoveQuickAction(action.id, -1)"
                  :title="xt('上移')"
                  @click="moveQuickAction(action.id, -1)"
                  ><ArtSvgIcon icon="ri:arrow-up-line" /></ElButton
                ><ElButton
                  text
                  :disabled="!canMoveQuickAction(action.id, 1)"
                  :title="xt('下移')"
                  @click="moveQuickAction(action.id, 1)"
                  ><ArtSvgIcon icon="ri:arrow-down-line" /></ElButton
                ><ElButton
                  text
                  type="danger"
                  :title="xt('删除')"
                  @click="removeQuickAction(action.id)"
                  ><ArtSvgIcon icon="ri:delete-bin-line" /></ElButton></header
              ><div class="quick-action-fields"
                ><ElFormItem :label="xt('显示名称')"
                  ><ElInput v-model.trim="action.label" maxlength="60" /></ElFormItem
                ><ElFormItem :label="xt('图标')"
                  ><ElSelect v-model="action.icon" filterable
                    ><ElOption
                      v-for="option in quickActionIconOptions"
                      :key="option[0]"
                      :label="option[1]"
                      :value="option[0]" /></ElSelect></ElFormItem
                ><ElFormItem :label="xt('展示位置')"
                  ><ElSelect v-model="action.placement"
                    ><ElOption :label="xt('主栏')" value="BAR" /><ElOption
                      :label="xt('更多菜单')"
                      value="MORE" /></ElSelect></ElFormItem
                ><ElFormItem :label="xt('动作类型')"
                  ><ElSelect v-model="action.actionType" @change="resetQuickActionTarget(action)"
                    ><ElOption :label="xt('填入提示词')" value="PROMPT" /><ElOption
                      :label="xt('打开办公任务')"
                      value="OFFICE" /><ElOption
                      :label="xt('功能跳转')"
                      value="ROUTE" /></ElSelect></ElFormItem
                ><ElFormItem v-if="action.actionType === 'OFFICE'" :label="xt('办公能力')"
                  ><ElSelect v-model="action.target" filterable
                    ><ElOption
                      v-for="target in officeTargets"
                      :key="target[0]"
                      :label="target[1]"
                      :value="target[0]" /></ElSelect></ElFormItem
                ><ElFormItem v-else-if="action.actionType === 'ROUTE'" :label="xt('跳转地址')"
                  ><ElInput
                    v-model.trim="action.target"
                    placeholder="/image 或 https://..." /></ElFormItem
                ><ElFormItem :label="xt('执行模型')"
                  ><ElSelect
                    v-model="action.modelKey"
                    clearable
                    filterable
                    :placeholder="xt('跟随当前或默认模型')"
                    ><ElOption
                      v-for="item in chatModels"
                      :key="item.id"
                      :label="item.displayName"
                      :value="item.key" /></ElSelect></ElFormItem
                ><ElFormItem :label="xt('排序值')"
                  ><ElInputNumber
                    v-model="action.sortOrder"
                    :min="-10000"
                    :max="10000" /></ElFormItem
                ><ElFormItem class="quick-action-web-search" :label="xt('自动联网')"
                  ><ElSwitch v-model="action.webSearch" /></ElFormItem
                ><ElFormItem
                  v-if="action.actionType !== 'ROUTE'"
                  class="quick-action-prompt"
                  :label="action.actionType === 'OFFICE' ? xt('预填任务提示') : xt('提示词')"
                  ><ElInput
                    v-model="action.prompt"
                    type="textarea"
                    :rows="2"
                    maxlength="4000"
                    show-word-limit /></ElFormItem></div></article></section></ElCard
      ></ElTabPane>
    </ElTabs>
  </div>
</template>

<script setup lang="ts">
  import { ElMessage } from 'element-plus'
  import {
    settingsApi as xinyueApi,
    type ChatQuickAction,
    type ChatUiPreset,
    type SystemSettings
  } from '@/api/xinyue/settings'
  import { customerApi, type UserGroup } from '@/api/xinyue/customers'
  import { modelApi, type ModelPreset } from '@/api/xinyue/models'
  import { subscriptionApi, type SubscriptionPlan } from '@/api/xinyue/subscriptions'
  import { xinyueText as xt } from '@/locales/xinyue'
  import AdminAccountCard from './admin-account-card.vue'
  import ToggleRow from './toggle-row.vue'
  import SidebarNavEditor from './SidebarNavEditor.vue'
  import {
    buildSystemSettingsPayload,
    normalizeChatHomeContent,
    normalizeSiteContent
  } from './settings-form'
  import {
    alignHiddenWithFlags,
    demoteSidebarItem,
    NESTED_NAV_GROUPS,
    nestedParentKey,
    parseSidebarNav,
    parseSectionNav,
    promoteSidebarItem,
    SIDEBAR_NAV_CATALOG,
    type NestedNavGroup,
    type SidebarNavPreference
  } from '@/utils/xinyue/sidebar-nav'
  import { useXinyueAsync } from '@/hooks'
  defineOptions({ name: 'XinyueSystemSettings' })
  const route = useRoute()
  const router = useRouter()
  const { loading, saving, withLoading, withSaving } = useXinyueAsync()
  const tab = ref(typeof route.query.tab === 'string' ? route.query.tab : 'site')
  const settings = ref<SystemSettings | null>(null)
  const groups = ref<UserGroup[]>([])
  const plans = ref<SubscriptionPlan[]>([])
  const models = ref<ModelPreset[]>([])
  const domainsText = ref('')
  const smtpPassword = ref('')
  const linuxSecret = ref('')
  const nestedNavGroups = NESTED_NAV_GROUPS
  const sidebarNavCatalog = computed(() => {
    const promoted = new Set(settings.value?.sidebarNav.promoted || [])
    const nested = NESTED_NAV_GROUPS.flatMap((group) => group.items).filter((item) =>
      promoted.has(item.key)
    )
    return [...SIDEBAR_NAV_CATALOG.map((item) => ({ ...item })), ...nested]
  })
  function groupPreference(id: NestedNavGroup) {
    if (!settings.value) return parseSidebarNav(null)
    return id === 'workspace' ? settings.value.workspaceNav : settings.value.sectionNav[id]
  }
  function setGroupPreference(id: NestedNavGroup, value: SidebarNavPreference) {
    if (!settings.value) return
    if (id === 'workspace') settings.value.workspaceNav = value
    else settings.value.sectionNav[id] = value
  }
  function promoteNav(key: string) {
    if (!settings.value) return
    settings.value.sidebarNav = promoteSidebarItem(
      settings.value.sidebarNav,
      key,
      nestedParentKey(key)
    )
    const group = nestedParentKey(key) as NestedNavGroup | ''
    if (!group) return
    const nav = groupPreference(group)
    setGroupPreference(group, { ...nav, hidden: nav.hidden.filter((item) => item !== key) })
  }
  function demoteNav(key: string) {
    if (!settings.value) return
    settings.value.sidebarNav = demoteSidebarItem(settings.value.sidebarNav, key)
  }
  const bannerUploadingIndex = ref<number | null>(null)
  const pricingBasePresets = [
    {
      key: 'cny-parity',
      label: xt('人民币 1:1'),
      note: xt('1 USD 按 ¥1；适合对标数值'),
      currency: 'CNY',
      exchangeRate: 1,
      creditValue: 0.01
    },
    {
      key: 'cny-market',
      label: xt('人民币市场参考'),
      note: xt('1 USD 按 ¥7.2；部署后可手动调整'),
      currency: 'CNY',
      exchangeRate: 7.2,
      creditValue: 0.01
    },
    {
      key: 'usd-parity',
      label: xt('美元 1:1'),
      note: xt('1 USD 按 $1；适合美元结算'),
      currency: 'USD',
      exchangeRate: 1,
      creditValue: 0.01
    }
  ] as const
  const pricingMarkupPresets = [
    { label: xt('成本价 1.0x'), value: 100 },
    { label: xt('轻量 1.1x'), value: 110 },
    { label: xt('标准 1.3x'), value: 130 },
    { label: xt('运营 1.5x'), value: 150 },
    { label: xt('高保障 2.0x'), value: 200 }
  ] as const
  const pricingUsdExchangeRate = computed({
    get: () => (settings.value?.pricingUsdExchangeRateMicros || 1_000_000) / 1_000_000,
    set: (value: number) => {
      if (settings.value)
        settings.value.pricingUsdExchangeRateMicros = Math.max(1, Math.round(value * 1_000_000))
    }
  })
  const creditUnitValue = computed({
    get: () => (settings.value?.creditValueMicros || 10_000) / 1_000_000,
    set: (value: number) => {
      if (settings.value)
        settings.value.creditValueMicros = Math.max(1, Math.round(value * 1_000_000))
    }
  })
  const activePricingPreset = computed(
    () =>
      pricingBasePresets.find(
        (preset) =>
          preset.currency === settings.value?.currency &&
          Math.abs(preset.exchangeRate - pricingUsdExchangeRate.value) < 0.000001 &&
          Math.abs(preset.creditValue - creditUnitValue.value) < 0.000001
      )?.key || ''
  )
  const pricingFormulaPreview = computed(() => {
    const creditValueMicros = settings.value?.creditValueMicros || 10_000
    const exchangeRateMicros = settings.value?.pricingUsdExchangeRateMicros || 1_000_000
    const markupPercent = settings.value?.modelImportMarkupPercent || 130
    const units =
      creditValueMicros > 0
        ? Math.ceil((exchangeRateMicros * markupPercent) / (creditValueMicros * 100))
        : 0
    return `$1 × ${pricingUsdExchangeRate.value} × ${(markupPercent / 100).toFixed(1)} = ${units} ${xt('额度')}`
  })
  function applyPricingBasePreset(preset: (typeof pricingBasePresets)[number]) {
    if (!settings.value) return
    settings.value.currency = preset.currency
    pricingUsdExchangeRate.value = preset.exchangeRate
    creditUnitValue.value = preset.creditValue
  }
  const workspaceSidebarEnabled = computed({
    get: () => Boolean(settings.value && !settings.value.sidebarNav.hidden.includes('workspace')),
    set: (enabled: boolean) => {
      syncNavHidden('sidebarNav', 'workspace', !enabled)
    }
  })
  let navSyncing = false
  function withNavSync(fn: () => void) {
    if (!settings.value || navSyncing) return
    navSyncing = true
    try {
      fn()
    } finally {
      navSyncing = false
    }
  }
  function syncNavHidden(field: 'sidebarNav' | 'workspaceNav', key: string, hidden: boolean) {
    withNavSync(() => {
      if (!settings.value) return
      const nav = settings.value[field]
      const has = nav.hidden.includes(key)
      if (hidden === has) return
      settings.value[field] = {
        ...nav,
        hidden: hidden ? [...nav.hidden, key] : nav.hidden.filter((item) => item !== key)
      }
    })
  }
  watch(
    () => settings.value?.sidebarNav.hidden,
    (hidden) => {
      if (!settings.value || !hidden) return
      withNavSync(() => {
        if (!settings.value) return
        const set = new Set(hidden)
        settings.value.sidebarCreationEnabled = !set.has('creation')
        settings.value.sidebarCommerceEnabled = !set.has('commerce')
        settings.value.sidebarOfficeEnabled = !set.has('office')
        settings.value.sidebarPromptsEnabled = !set.has('prompts')
        settings.value.sidebarPluginsEnabled = !set.has('plugins')
      })
    },
    { flush: 'sync' }
  )
  watch(
    () => settings.value?.workspaceNav.hidden,
    (hidden) => {
      if (!settings.value || !hidden) return
      withNavSync(() => {
        if (!settings.value) return
        const set = new Set(hidden)
        settings.value.sidebarProjectsEnabled = !set.has('projects')
        settings.value.sidebarAssetsEnabled = !set.has('files')
        settings.value.imagePromptEnabled = !set.has('image-prompts')
      })
    },
    { flush: 'sync' }
  )
  watch(
    () => settings.value?.sidebarCreationEnabled,
    (enabled) => {
      if (enabled !== undefined) syncNavHidden('sidebarNav', 'creation', !enabled)
    },
    { flush: 'sync' }
  )
  watch(
    () => settings.value?.sidebarCommerceEnabled,
    (enabled) => {
      if (enabled !== undefined) syncNavHidden('sidebarNav', 'commerce', !enabled)
    },
    { flush: 'sync' }
  )
  watch(
    () => settings.value?.sidebarOfficeEnabled,
    (enabled) => {
      if (enabled !== undefined) syncNavHidden('sidebarNav', 'office', !enabled)
    },
    { flush: 'sync' }
  )
  watch(
    () => settings.value?.sidebarPromptsEnabled,
    (enabled) => {
      if (enabled !== undefined) syncNavHidden('sidebarNav', 'prompts', !enabled)
    },
    { flush: 'sync' }
  )
  watch(
    () => settings.value?.sidebarPluginsEnabled,
    (enabled) => {
      if (enabled !== undefined) syncNavHidden('sidebarNav', 'plugins', !enabled)
    },
    { flush: 'sync' }
  )
  watch(
    () => settings.value?.sidebarProjectsEnabled,
    (enabled) => {
      if (enabled !== undefined) syncNavHidden('workspaceNav', 'projects', !enabled)
    },
    { flush: 'sync' }
  )
  watch(
    () => settings.value?.sidebarAssetsEnabled,
    (enabled) => {
      if (enabled !== undefined) syncNavHidden('workspaceNav', 'files', !enabled)
    },
    { flush: 'sync' }
  )
  watch(
    () => settings.value?.imagePromptEnabled,
    (enabled) => {
      if (enabled !== undefined) syncNavHidden('workspaceNav', 'image-prompts', !enabled)
    },
    { flush: 'sync' }
  )
  watch(
    () => settings.value?.sidebarNav.hidden,
    (hidden) => {
      if (!settings.value || !hidden) return
      for (const key of hidden) {
        const group = nestedParentKey(key) as NestedNavGroup | ''
        if (!group) continue
        const nav = groupPreference(group)
        if (nav.hidden.includes(key)) continue
        setGroupPreference(group, { ...nav, hidden: [...nav.hidden, key] })
      }
    },
    { flush: 'sync' }
  )
  const chatUiPresets = [
    { value: 'gpt', label: 'GPT', note: xt('紧凑居中') },
    { value: 'doubao', label: xt('豆包'), note: xt('推荐与双层输入') },
    { value: 'qianwen', label: xt('千问'), note: xt('能力入口布局') },
    { value: 'kimi', label: 'Kimi', note: xt('品牌字标与任务入口') },
    { value: 'jixing', label: xt('季星'), note: xt('创作广场与图文推荐') }
  ] as const
  const activePresetLabel = computed(
    () => chatUiPresets.find((item) => item.value === settings.value?.chatUiPreset)?.label || 'GPT'
  )
  const avatarColorMode = computed({
    get: () => {
      const value = settings.value?.chatAvatarColor || 'auto'
      return value === 'auto' || value === 'brand' ? value : 'custom'
    },
    set: (mode: string) => {
      if (!settings.value) return
      if (mode === 'custom') {
        if (!settings.value.chatAvatarColor?.startsWith('#'))
          settings.value.chatAvatarColor = '#4d6bfe'
      } else {
        settings.value.chatAvatarColor = mode
      }
    }
  })
  const trialPlans = computed(() =>
    plans.value.filter((item) => item.enabled && item.trialDays > 0)
  )
  const chatModels = computed(() =>
    models.value.filter((item) => item.enabled && item.capability === 'CHAT')
  )
  const imageModels = computed(() =>
    models.value.filter((item) => item.enabled && item.capability === 'IMAGE')
  )
  const activeChatPreset = computed<ChatUiPreset>(() => settings.value?.chatUiPreset || 'gpt')
  const activeComposerControls = computed(
    () => settings.value?.chatHomeContent.composerControls[activeChatPreset.value]
  )
  const activeQuickActions = computed(() => {
    const actions = settings.value?.chatHomeContent.quickActions[activeChatPreset.value] || []
    return [...actions].sort(
      (left, right) =>
        (left.placement === right.placement ? 0 : left.placement === 'BAR' ? -1 : 1) ||
        left.sortOrder - right.sortOrder ||
        left.label.localeCompare(right.label, 'zh-CN')
    )
  })
  function quickActionStatus(action: ChatQuickAction) {
    return settings.value?.quickActionRegistry?.actions.find(
      (item) => item.preset === activeChatPreset.value && item.id === action.id
    )
  }
  function quickActionStatusType(action: ChatQuickAction) {
    if (!action.enabled) return 'info'
    return quickActionStatus(action)?.published ? 'success' : 'danger'
  }
  function quickActionStatusLabel(action: ChatQuickAction) {
    if (!action.enabled) return xt('已停用')
    const status = quickActionStatus(action)
    if (!status) return xt('保存后检测')
    return status.published ? xt('可发布') : xt('缺少依赖')
  }
  const quickActionIconOptions = [
    ['sparkles', '智能'],
    ['video', '视频'],
    ['music', '音乐'],
    ['image', '图像'],
    ['podcast', '播客'],
    ['table', '表格'],
    ['writing', '写作'],
    ['transcribe', '转写'],
    ['ppt', 'PPT'],
    ['translate', '翻译'],
    ['research', '研究'],
    ['answer', '答疑'],
    ['code', '代码'],
    ['document', '文档'],
    ['website', '网站'],
    ['design', '设计'],
    ['office', '办公']
  ] as const
  const officeTargets = [
    ['daily', '日常办公'],
    ['writing', '内容创作'],
    ['analysis', '数据分析'],
    ['development', '代码开发'],
    ['ppt', 'PPT 生成'],
    ['report', '报告撰写'],
    ['meeting', '会议纪要'],
    ['spreadsheet', '多维表格'],
    ['excel', 'Excel 助手']
  ] as const
  const linuxReady = computed(() =>
    Boolean(
      settings.value?.linuxDoClientId &&
      settings.value?.linuxDoRedirectUrl &&
      (settings.value?.hasLinuxDoClientSecret || linuxSecret.value)
    )
  )
  const smtpReady = computed(() =>
    Boolean(
      settings.value?.smtpHost &&
      settings.value?.smtpFromEmail &&
      (settings.value?.hasSmtpPassword || smtpPassword.value)
    )
  )
  function hydrateNav(loadedSettings: SystemSettings) {
    loadedSettings.sidebarNav = alignHiddenWithFlags(
      parseSidebarNav(loadedSettings.sidebarNav),
      [
        ...(loadedSettings.sidebarCreationEnabled ? [] : ['creation']),
        ...(loadedSettings.sidebarCommerceEnabled ? [] : ['commerce']),
        ...(loadedSettings.sidebarOfficeEnabled ? [] : ['office']),
        ...(loadedSettings.sidebarPromptsEnabled ? [] : ['prompts']),
        ...(loadedSettings.sidebarPluginsEnabled ? [] : ['plugins'])
      ],
      ['creation', 'commerce', 'office', 'prompts', 'plugins']
    )
    loadedSettings.workspaceNav = alignHiddenWithFlags(
      parseSidebarNav(loadedSettings.workspaceNav),
      [
        ...(loadedSettings.sidebarProjectsEnabled ? [] : ['projects']),
        ...(loadedSettings.sidebarAssetsEnabled ? [] : ['files']),
        ...(loadedSettings.imagePromptEnabled ? [] : ['image-prompts'])
      ],
      ['projects', 'files', 'image-prompts']
    )
    loadedSettings.sectionNav = parseSectionNav(loadedSettings.sectionNav)
    return loadedSettings
  }
  async function load() {
    try {
      await withLoading(async () => {
        const [loadedSettings, loadedGroups, loadedPlans, loadedModels] = await Promise.all([
          xinyueApi.systemSettings(),
          customerApi.groups(),
          subscriptionApi.plans(),
          modelApi.models()
        ])
        loadedSettings.chatHomeContent = normalizeChatHomeContent(loadedSettings.chatHomeContent)
        loadedSettings.siteContent = normalizeSiteContent(loadedSettings.siteContent)
        settings.value = hydrateNav(loadedSettings)
        groups.value = loadedGroups
        plans.value = loadedPlans
        models.value = loadedModels
        domainsText.value = settings.value.allowedEmailDomains.join('\n')
        smtpPassword.value = ''
        linuxSecret.value = ''
      })
    } catch {
      settings.value = null
    }
  }
  function fillCallback() {
    if (settings.value)
      settings.value.linuxDoRedirectUrl = `${window.location.origin}/v1/auth/oauth/linuxdo/callback`
  }
  function addDoubaoRecommendation() {
    settings.value?.chatHomeContent.doubaoRecommendations.push({
      title: '',
      prompt: '',
      targetUrl: ''
    })
  }
  function addQianwenBanner() {
    settings.value?.chatHomeContent.qianwenBanners.push({
      title: '',
      description: '',
      buttonText: '立即体验',
      imageUrl: '',
      targetUrl: '/office'
    })
  }
  function addQuickAction() {
    if (!settings.value) return
    const actions = settings.value.chatHomeContent.quickActions[activeChatPreset.value]
    const nextOrder = actions.length ? Math.max(...actions.map((item) => item.sortOrder)) + 10 : 10
    actions.push({
      id: `${activeChatPreset.value}-${Date.now().toString(36)}`,
      label: '新快捷能力',
      icon: 'sparkles',
      placement: 'MORE',
      actionType: 'PROMPT',
      prompt: '',
      target: '',
      modelKey: '',
      imageUrl: '',
      webSearch: false,
      enabled: true,
      sortOrder: nextOrder
    })
  }
  function removeQuickAction(id: string) {
    if (!settings.value) return
    const actions = settings.value.chatHomeContent.quickActions[activeChatPreset.value]
    const index = actions.findIndex((item) => item.id === id)
    if (index >= 0) actions.splice(index, 1)
  }
  function moveQuickAction(id: string, offset: -1 | 1) {
    if (!settings.value) return
    const current = activeQuickActions.value.find((item) => item.id === id)
    if (!current) return
    const sorted = activeQuickActions.value.filter((item) => item.placement === current.placement)
    const index = sorted.findIndex((item) => item.id === id)
    const targetIndex = index + offset
    if (index < 0 || targetIndex < 0 || targetIndex >= sorted.length) return
    const currentOrder = sorted[index].sortOrder
    sorted[index].sortOrder = sorted[targetIndex].sortOrder
    sorted[targetIndex].sortOrder = currentOrder
    if (sorted[index].sortOrder === sorted[targetIndex].sortOrder) {
      sorted.forEach((item, itemIndex) => {
        item.sortOrder = (itemIndex + 1) * 10
      })
    }
  }
  function canMoveQuickAction(id: string, offset: -1 | 1) {
    const current = activeQuickActions.value.find((item) => item.id === id)
    if (!current) return false
    const group = activeQuickActions.value.filter((item) => item.placement === current.placement)
    const index = group.findIndex((item) => item.id === id)
    return index + offset >= 0 && index + offset < group.length
  }
  function resetQuickActionTarget(action: ChatQuickAction) {
    if (action.actionType === 'PROMPT') action.target = ''
    else if (
      action.actionType === 'OFFICE' &&
      !officeTargets.some(([value]) => value === action.target)
    )
      action.target = 'daily'
    else if (action.actionType === 'ROUTE' && !action.target) action.target = '/chat'
  }
  async function uploadQianwenImage(index: number) {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/png,image/jpeg,image/webp,image/gif,image/avif'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file || !settings.value) return
      bannerUploadingIndex.value = index
      try {
        const data = new FormData()
        data.append('file', file)
        const result = await xinyueApi.uploadChatHomeImage(data)
        settings.value.chatHomeContent.qianwenBanners[index].imageUrl = result.imageUrl
      } finally {
        bannerUploadingIndex.value = null
      }
    }
    input.click()
  }
  async function save() {
    if (!settings.value) return
    if (settings.value.linuxDoLoginEnabled && !linuxReady.value) {
      tab.value = 'auth'
      return ElMessage.warning(xt('启用 Linux.do 前请完整填写 Client ID、Secret 和回调地址'))
    }
    if (settings.value.smtpEnabled && !smtpReady.value) {
      tab.value = 'email'
      return ElMessage.warning(xt('启用邮件服务前请完整填写 SMTP 主机、发件邮箱和密码'))
    }
    await withSaving(async () => {
      const saved = await xinyueApi.saveSystemSettings(
        buildSystemSettingsPayload(
          settings.value!,
          domainsText.value,
          smtpPassword.value,
          linuxSecret.value
        )
      )
      saved.chatHomeContent = normalizeChatHomeContent(saved.chatHomeContent)
      saved.siteContent = normalizeSiteContent(saved.siteContent)
      settings.value = hydrateNav(saved)
      domainsText.value = settings.value.allowedEmailDomains.join('\n')
      smtpPassword.value = ''
      linuxSecret.value = ''
    })
  }
  onMounted(load)
  watch(tab, (value) => {
    void router.replace({ query: { ...route.query, tab: value } })
  })
  watch(
    () => route.query.tab,
    (value) => {
      if (typeof value === 'string' && value !== tab.value) tab.value = value
    }
  )
</script>

<style scoped src="./settings.css"></style>
