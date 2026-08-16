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
          ><template #header><strong>{{ xt('用户端导航') }}</strong></template
          ><div class="toggle-grid"
            ><ToggleRow v-model="settings.sidebarCreationEnabled" :title="xt('AI 创作')" :note="xt('图片与视频创作入口')" />
            <ToggleRow v-model="settings.sidebarCommerceEnabled" :title="xt('电商中心')" :note="xt('商品视觉与电商内容入口')" />
            <ToggleRow v-model="settings.sidebarOfficeEnabled" :title="xt('办公中心')" :note="xt('文档、表格和 Agent 任务入口')" />
            <ToggleRow v-model="settings.sidebarPromptsEnabled" :title="xt('提示词库')" :note="xt('图片和视频灵感入口')" />
            <ToggleRow v-model="settings.sidebarPluginsEnabled" :title="xt('能力中心')" :note="xt('助手、技能、工具和知识库入口')" />
            <ToggleRow v-model="settings.sidebarProjectsEnabled" :title="xt('项目')" :note="xt('项目与协作工作区入口')" />
            <ToggleRow v-model="settings.sidebarAssetsEnabled" :title="xt('文件库')" :note="xt('用户文件和生成结果入口')" /></div></ElCard
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
                placeholder="/projects" /></div></section></ElCard
      ></ElTabPane>
    </ElTabs>
  </div>
</template>

<script setup lang="ts">
  import { ElMessage } from 'element-plus'
  import {
    xinyueApi,
    type ChatHomeContent,
    type ModelPreset,
    type SubscriptionPlan,
    type SystemSettings,
    type UserGroup
  } from '@/api/xinyue'
  import { xinyueText as xt } from '@/locales/xinyue'
  import ToggleRow from './toggle-row.vue'
  defineOptions({ name: 'XinyueSettings' })
  const route = useRoute()
  const router = useRouter()
  const tab = ref(typeof route.query.tab === 'string' ? route.query.tab : 'site')
  const settings = ref<SystemSettings | null>(null)
  const groups = ref<UserGroup[]>([])
  const plans = ref<SubscriptionPlan[]>([])
  const models = ref<ModelPreset[]>([])
  const saving = ref(false)
  const domainsText = ref('')
  const smtpPassword = ref('')
  const linuxSecret = ref('')
  const bannerUploadingIndex = ref<number | null>(null)
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
    'chatUiPreset',
    'chatHomeContent',
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
  const chatUiPresets = [
    { value: 'gpt', label: 'GPT', note: xt('紧凑居中') },
    { value: 'doubao', label: xt('豆包'), note: xt('推荐与双层输入') },
    { value: 'qianwen', label: xt('千问'), note: xt('能力入口布局') },
    { value: 'kimi', label: 'Kimi', note: xt('品牌字标与任务入口') }
  ] as const
  const defaultChatHomeContent: ChatHomeContent = {
    doubaoRecommendations: [
      {
        title: '热点：北语教授刘宗迪称《山海经》并非怪物图鉴',
        prompt: '请介绍这个热点，并说明相关观点和背景。',
        targetUrl: ''
      },
      {
        title: '语言模型的训练数据如何影响 AI 回答的准确性和多样性？',
        prompt: '语言模型的训练数据如何影响 AI 回答的准确性和多样性？',
        targetUrl: ''
      }
    ],
    qianwenBanners: [
      {
        title: 'Xinyue 办公助理上线',
        description: '解锁本地任务能力，多格式交付',
        buttonText: '立即体验',
        imageUrl: '',
        targetUrl: '/office'
      }
    ],
    kimiProject: { label: '选择项目', targetUrl: '/projects' }
  }
  function normalizeChatHomeContent(value: unknown): ChatHomeContent {
    const source =
      value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Partial<ChatHomeContent>)
        : {}
    return {
      doubaoRecommendations: Array.isArray(source.doubaoRecommendations)
        ? source.doubaoRecommendations
        : structuredClone(defaultChatHomeContent.doubaoRecommendations),
      qianwenBanners: Array.isArray(source.qianwenBanners)
        ? source.qianwenBanners
        : structuredClone(defaultChatHomeContent.qianwenBanners),
      kimiProject:
        source.kimiProject && typeof source.kimiProject === 'object'
          ? {
              label: source.kimiProject.label || defaultChatHomeContent.kimiProject.label,
              targetUrl:
                source.kimiProject.targetUrl || defaultChatHomeContent.kimiProject.targetUrl
            }
          : { ...defaultChatHomeContent.kimiProject }
    }
  }
  const activePresetLabel = computed(
    () => chatUiPresets.find((item) => item.value === settings.value?.chatUiPreset)?.label || 'GPT'
  )
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
    const [loadedSettings, loadedGroups, loadedPlans, loadedModels] = await Promise.all([
      xinyueApi.systemSettings(),
      xinyueApi.groups(),
      xinyueApi.plans(),
      xinyueApi.models()
    ])
    loadedSettings.chatHomeContent = normalizeChatHomeContent(loadedSettings.chatHomeContent)
    settings.value = loadedSettings
    groups.value = loadedGroups
    plans.value = loadedPlans
    models.value = loadedModels
    domainsText.value = settings.value.allowedEmailDomains.join('\n')
    smtpPassword.value = ''
    linuxSecret.value = ''
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

<style scoped>
  .settings-page {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
    max-width: 100%;
    height: 100%;
    overflow: hidden;
  }

  .page-title {
    display: flex;
    gap: 12px;
    align-items: center;
    justify-content: space-between;
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
    font-size: 13px;
    color: var(--art-gray-500);
  }

  .settings-tabs {
    flex: 1;
    width: 100%;
    min-width: 0;
    min-height: 0;
  }

  .settings-tabs :deep(.el-tabs__header) {
    flex: 0 0 auto;
    margin-bottom: 12px;
  }

  .settings-tabs :deep(.el-tabs__nav) {
    max-width: 100%;
  }

  .settings-tabs :deep(.el-tabs__content) {
    min-width: 0;
    max-width: 100%;
    height: 100%;
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
    gap: 10px;
    align-items: center;
    justify-content: space-between;
  }

  .toggle-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .chat-ui-presets {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px;
    width: 100%;
  }

  .chat-ui-presets > button {
    display: grid;
    gap: 4px;
    min-width: 0;
    padding: 10px;
    color: var(--art-gray-700);
    text-align: left;
    background: var(--art-main-bg-color);
    border: 1px solid var(--art-border-color);
    border-radius: 8px;
  }

  .chat-ui-presets > button:hover {
    border-color: var(--el-color-primary-light-5);
  }

  .chat-ui-presets > button.active {
    border-color: var(--el-color-primary);
    box-shadow: 0 0 0 1px var(--el-color-primary) inset;
  }

  .chat-ui-presets strong {
    font-size: 13px;
  }

  .chat-ui-presets small {
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 11px;
    color: var(--art-gray-500);
    white-space: nowrap;
  }

  .preset-preview {
    position: relative;
    display: block;
    height: 42px;
    margin-bottom: 3px;
    overflow: hidden;
    background: var(--art-bg-color);
    border: 1px solid var(--art-border-color);
    border-radius: 5px;
  }

  .preset-preview i {
    position: absolute;
    display: block;
    background: var(--art-gray-300);
  }

  .preset-preview i:first-child {
    top: 9px;
    left: 50%;
    width: 34%;
    height: 5px;
    border-radius: 3px;
    transform: translateX(-50%);
  }

  .preset-preview i:nth-child(2) {
    right: 13%;
    bottom: 8px;
    left: 13%;
    height: 10px;
    border-radius: 6px;
  }

  .preset-preview i:nth-child(3) {
    right: 16%;
    bottom: 11px;
    width: 5px;
    height: 5px;
    background: var(--el-color-primary);
    border-radius: 50%;
  }

  .preset-preview--doubao i:first-child {
    width: 26%;
  }

  .preset-preview--doubao i:nth-child(2) {
    height: 15px;
    border-radius: 4px;
  }

  .preset-preview--qianwen i:first-child {
    left: 17%;
    width: 24%;
    transform: none;
  }

  .preset-preview--qianwen i:nth-child(2) {
    right: 20%;
    left: 20%;
  }

  .preset-preview--kimi {
    background: #1d1d1d;
  }

  .preset-preview--kimi i:first-child {
    width: 30%;
    background: #eee;
  }

  .preset-preview--kimi i:nth-child(2) {
    right: 18%;
    left: 18%;
    background: #333;
    border: 1px solid #555;
  }

  .form-block,
  .number-row {
    margin-top: 18px;
  }

  .wide {
    width: 100%;
  }

  .home-content-editor {
    display: grid;
    gap: 10px;
    padding: 14px;
    margin: 8px 0 20px;
    background: var(--art-main-bg-color);
    border: 1px solid var(--art-border-color);
    border-radius: 8px;
  }

  .home-content-editor > header {
    display: flex;
    gap: 12px;
    align-items: center;
    justify-content: space-between;
  }

  .home-content-editor > header > div {
    display: grid;
    gap: 3px;
  }

  .home-content-editor > header small {
    font-size: 11px;
    color: var(--art-gray-500);
  }

  .content-row {
    display: grid;
    grid-template-columns: 1.15fr 1.2fr 1fr 34px;
    gap: 8px;
    align-items: center;
  }

  .content-row--two {
    grid-template-columns: minmax(0, 0.65fr) minmax(0, 1.35fr);
  }

  .banner-editor {
    display: grid;
    grid-template-columns: 30px minmax(0, 1fr) 34px;
    gap: 8px;
    align-items: start;
    padding-top: 10px;
    border-top: 1px solid var(--art-border-color);
  }

  .banner-editor__number {
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    color: var(--art-gray-500);
    background: var(--art-bg-color);
    border-radius: 6px;
  }

  .banner-editor__fields {
    display: grid;
    grid-template-columns: 1fr 1.3fr 0.6fr 1fr 1fr;
    gap: 8px;
    min-width: 0;
  }

  .banner-image-field {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 6px;
    min-width: 0;
  }

  @media (width <= 800px) {
    .settings-page {
      height: auto;
      overflow: visible;
    }

    .page-title {
      flex-wrap: wrap;
      align-items: flex-start;
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
      flex: 0 0 40px;
      width: 100%;
      height: 40px;
      margin: 0 0 8px;
      overflow: auto hidden;
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

    .chat-ui-presets {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .content-row,
    .content-row--two,
    .banner-editor__fields {
      grid-template-columns: minmax(0, 1fr);
    }

    .settings-tabs :deep(.el-col) {
      flex: 0 0 100%;
      width: 100%;
      max-width: 100%;
    }
  }
</style>
