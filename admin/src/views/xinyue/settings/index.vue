<template>
  <div class="settings-page">
    <header class="page-title"
      ><div
        ><h1>{{ xt('业务系统配置') }}</h1
        ><p>{{ xt('统一管理站点、登录注册、商业化、邮件服务和用户默认值') }}</p></div
      ><ElButton type="primary" :loading="saving" :disabled="!settings" @click="save"
        ><ArtSvgIcon icon="ri:save-line" />{{ xt('保存配置') }}</ElButton
      ></header
    >
    <ElTabs v-model="tab" class="settings-tabs">
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
          ><ElRow :gutter="16" class="number-row"
            ><ElCol :span="8"
              ><ElFormItem :label="xt('最低充值金额（分）')"
                ><ElInputNumber
                  v-model="settings.minRechargeCents"
                  :min="1"
                  class="wide" /></ElFormItem></ElCol
            ><ElCol :span="8"
              ><ElFormItem :label="xt('结算币种')"
                ><ElSelect v-model="settings.currency" class="wide"
                  ><ElOption :label="xt('人民币 CNY')" value="CNY" /><ElOption
                    :label="xt('美元 USD')"
                    value="USD" /></ElSelect></ElFormItem></ElCol
            ><ElCol :span="8"
              ><ElFormItem :label="xt('每点价值（微元）')"
                ><ElInputNumber
                  v-model="settings.creditValueMicros"
                  :min="0"
                  class="wide" /></ElFormItem></ElCol></ElRow></ElCard
      ></ElTabPane>

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
            ><ElCheckbox v-model="settings.smtpSecure">{{
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
    </ElTabs>
  </div>
</template>

<script setup lang="ts">
  import { ElMessage } from 'element-plus'
  import {
    xinyueApi,
    type ModelPreset,
    type SubscriptionPlan,
    type SystemSettings,
    type UserGroup
  } from '@/api/xinyue'
  import { xinyueText as xt } from '@/locales/xinyue'
  import ToggleRow from './toggle-row.vue'
  defineOptions({ name: 'XinyueSettings' })
  const tab = ref('site')
  const settings = ref<SystemSettings | null>(null)
  const groups = ref<UserGroup[]>([])
  const plans = ref<SubscriptionPlan[]>([])
  const models = ref<ModelPreset[]>([])
  const saving = ref(false)
  const domainsText = ref('')
  const smtpPassword = ref('')
  const linuxSecret = ref('')
  const editableSettingKeys = [
    'siteName',
    'siteLogoUrl',
    'supportUrl',
    'sidebarCreationEnabled',
    'sidebarCommerceEnabled',
    'sidebarOfficeEnabled',
    'sidebarPromptsEnabled',
    'sidebarPluginsEnabled',
    'sidebarProjectsEnabled',
    'sidebarAssetsEnabled',
    'registrationEnabled',
    'emailLoginEnabled',
    'emailVerifyEnabled',
    'passwordLoginEnabled',
    'passwordRegistrationEnabled',
    'linuxDoLoginEnabled',
    'linuxDoClientId',
    'linuxDoRedirectUrl',
    'linuxDoScopes',
    'linuxDoAuthorizeUrl',
    'linuxDoTokenUrl',
    'linuxDoUserInfoUrl',
    'otpTtlMinutes',
    'otpResendSeconds',
    'defaultUserCredits',
    'defaultTheme',
    'defaultLanguage',
    'defaultChatModelKey',
    'defaultImageModelKey',
    'userByokEnabled',
    'inviteRewardCredits',
    'rechargeEnabled',
    'minRechargeCents',
    'currency',
    'creditValueMicros',
    'subscriptionsEnabled',
    'trialEnabled',
    'defaultTrialPlanId',
    'trialCredits',
    'defaultUserGroupId',
    'temporaryChatRetentionHours',
    'defaultChatHistoryEnabled',
    'defaultTrainingOptOut',
    'defaultShareUsageAnalytics',
    'smtpEnabled',
    'smtpHost',
    'smtpPort',
    'smtpSecure',
    'smtpUsername',
    'smtpFromName',
    'smtpFromEmail'
  ] as const satisfies readonly (keyof SystemSettings)[]
  const trialPlans = computed(() =>
    plans.value.filter((item) => item.enabled && item.trialDays > 0)
  )
  const chatModels = computed(() =>
    models.value.filter((item) => item.enabled && item.capability === 'CHAT')
  )
  const imageModels = computed(() =>
    models.value.filter((item) => item.enabled && item.capability === 'IMAGE')
  )
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
  async function load() {
    ;[settings.value, groups.value, plans.value, models.value] = await Promise.all([
      xinyueApi.systemSettings(),
      xinyueApi.groups(),
      xinyueApi.plans(),
      xinyueApi.models()
    ])
    domainsText.value = settings.value.allowedEmailDomains.join('\n')
    smtpPassword.value = ''
    linuxSecret.value = ''
  }
  function fillCallback() {
    if (settings.value)
      settings.value.linuxDoRedirectUrl = `${window.location.origin}/v1/auth/oauth/linuxdo/callback`
  }
  async function save() {
    if (!settings.value) return
    if (settings.value.linuxDoLoginEnabled && !linuxReady.value) {
      tab.value = 'auth'
      return ElMessage.warning(xt('启用 Linux.do 前请完整填写 Client ID、Secret 和回调地址'))
    }
    const body = Object.fromEntries(editableSettingKeys.map((key) => [key, settings.value![key]]))
    saving.value = true
    try {
      settings.value = await xinyueApi.saveSystemSettings({
        ...body,
        allowedEmailDomains: domainsText.value
          .split(/[\n,，;；]+/)
          .map((item) => item.trim().replace(/^@/, ''))
          .filter(Boolean),
        ...(smtpPassword.value ? { smtpPassword: smtpPassword.value } : {}),
        ...(linuxSecret.value ? { linuxDoClientSecret: linuxSecret.value } : {})
      })
      domainsText.value = settings.value.allowedEmailDomains.join('\n')
      smtpPassword.value = ''
      linuxSecret.value = ''
    } finally {
      saving.value = false
    }
  }
  onMounted(load)
</script>

<style scoped>
  .settings-page {
    display: flex;
    flex-direction: column;
    gap: 12px;
    height: 100%;
    min-width: 0;
    max-width: 100%;
    overflow: hidden;
  }
  .page-title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-width: 0;
  }
  .page-title > div {
    min-width: 0;
  }
  .page-title h1 {
    margin: 0 0 4px;
    font-size: 22px;
  }
  .page-title p {
    margin: 0;
    color: var(--art-gray-500);
    font-size: 13px;
  }
  .settings-tabs {
    flex: 1;
    min-height: 0;
    min-width: 0;
    width: 100%;
  }
  .settings-tabs :deep(.el-tabs__header) {
    flex: 0 0 auto;
    margin-bottom: 12px;
  }
  .settings-tabs :deep(.el-tabs__nav) {
    max-width: 100%;
  }
  .settings-tabs :deep(.el-tabs__content) {
    height: 100%;
    min-width: 0;
    max-width: 100%;
    overflow: auto;
  }
  .settings-tabs :deep(.el-tab-pane) {
    display: grid;
    gap: 12px;
    width: 100%;
    min-width: 0;
  }
  .settings-tabs :deep(.el-card) {
    min-width: 0;
    max-width: 100%;
    overflow: hidden;
  }
  .settings-tabs :deep(.el-card__body),
  .settings-tabs :deep(.el-card__header) {
    min-width: 0;
    max-width: 100%;
  }
  .settings-tabs :deep(.el-row),
  .settings-tabs :deep(.el-col) {
    min-width: 0;
    max-width: 100%;
  }
  .settings-tabs :deep(.el-input),
  .settings-tabs :deep(.el-select),
  .settings-tabs :deep(.el-input-number) {
    max-width: 100%;
  }
  .card-title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  .toggle-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }
  .form-block,
  .number-row {
    margin-top: 18px;
  }
  .wide {
    width: 100%;
  }
  @media (max-width: 800px) {
    .settings-page {
      height: auto;
      overflow: visible;
    }
    .page-title {
      align-items: flex-start;
      flex-wrap: wrap;
    }
    .page-title h1 {
      font-size: 20px;
    }
    .page-title :deep(.el-button) {
      margin-left: auto;
    }
    .settings-tabs {
      display: flex;
      flex-direction: column;
      height: auto;
    }
    .settings-tabs :deep(.el-tabs__header) {
      display: block;
      width: 100%;
      height: 40px;
      flex: 0 0 40px;
      margin: 0 0 8px;
      overflow-x: auto;
      overflow-y: hidden;
    }
    .settings-tabs :deep(.el-tabs__nav-wrap),
    .settings-tabs :deep(.el-tabs__nav-scroll) {
      overflow: visible;
    }
    .settings-tabs :deep(.el-tabs__nav-wrap) {
      width: 100%;
      height: 40px;
      margin: 0;
    }
    .settings-tabs :deep(.el-tabs__nav-scroll) {
      width: 100%;
      height: 40px;
    }
    .settings-tabs :deep(.el-tabs__nav) {
      display: flex;
      flex-direction: row !important;
      flex-wrap: nowrap;
      width: max-content;
      min-width: max-content;
      height: 40px;
    }
    .settings-tabs :deep(.el-tabs__item) {
      height: 38px;
      padding: 0 14px;
      white-space: nowrap;
    }
    .settings-tabs :deep(.el-tabs__active-bar) {
      right: auto;
      bottom: 0;
    }
    .settings-tabs :deep(.el-tabs__content) {
      height: auto;
      overflow: visible;
    }
    .settings-tabs :deep(.el-tab-pane) {
      max-width: none;
    }
    .toggle-grid {
      grid-template-columns: minmax(0, 1fr);
    }
    .settings-tabs :deep(.el-col) {
      width: 100%;
      max-width: 100%;
      flex: 0 0 100%;
    }
  }
</style>
