<template>
  <div class="workspace-shell" :class="{ 'is-collapsed': !sidebarOpen }">
    <button
      v-if="mobileOpen"
      class="workspace-backdrop"
      type="button"
      aria-label="关闭菜单"
      @click="mobileOpen = false"
    />

    <aside class="workspace-sidebar" :class="{ 'is-mobile-open': mobileOpen }">
      <div class="workspace-sidebar__top">
        <BrandMark to="/chat" dark :compact="!sidebarOpen" />
        <button class="icon-button sidebar-close" type="button" aria-label="关闭边栏" @click="sidebarOpen = !sidebarOpen">
          <PanelLeftClose :size="18" />
        </button>
        <button class="icon-button mobile-close" type="button" aria-label="关闭菜单" @click="mobileOpen = false">
          <X :size="19" />
        </button>
      </div>

      <div class="workspace-sidebar__scroll" @scroll="closeConversationMenu">
      <nav class="workspace-menu" aria-label="工作台导航">
        <a
          v-for="item in navItems"
          :key="item.key"
          :href="item.to"
          :target="item.external && item.openNewTab ? '_blank' : undefined"
          :rel="item.external && item.openNewTab ? 'noreferrer' : undefined"
          class="workspace-menu__item"
          :class="{ 'is-active': !item.external && (item.activeModes || [item.mode]).includes(activeMode) && (item.mode !== 'chat' || !studio.currentConversationId) }"
          :title="!sidebarOpen ? item.label : undefined"
          @click="handleNavLink($event, item)"
        >
          <component :is="item.icon" :size="19" />
          <span>{{ item.label }}</span>
        </a>
      </nav>

      <section v-if="auth.isAuthenticated && sidebarOpen" class="workspace-recent">
        <header class="workspace-recent__header"><button class="workspace-recent__toggle" type="button" :aria-expanded="recentOpen" @click="recentOpen = !recentOpen">{{ t('workspace.recent') }} <ChevronDown :size="14" :class="{ 'is-up': recentOpen }" /></button><button class="workspace-recent__search-button" type="button" aria-label="搜索对话" title="搜索对话" @click="recentSearchOpen = !recentSearchOpen; recentOpen = true"><Search :size="15" /></button></header>
        <div v-if="recentOpen" class="workspace-recent__body">
          <label v-if="recentSearchOpen" class="workspace-recent__search-field"><Search :size="14" /><input v-model="conversationSearch" aria-label="搜索对话" placeholder="搜索对话" /></label>
          <div v-for="conversation in filteredConversations" :key="conversation.id" class="workspace-recent-row" :class="{ 'is-active': activeMode === 'chat' && conversation.id === studio.currentConversationId }">
            <form v-if="renamingConversationId === conversation.id" class="workspace-recent-rename" @submit.prevent="saveConversationRename(conversation.id)">
              <input v-model="conversationRename" maxlength="120" aria-label="对话名称" autofocus :disabled="conversationRenameBusy" @keydown.esc="cancelConversationRename" />
              <button type="submit" aria-label="保存重命名" title="保存" :disabled="conversationRenameBusy || !conversationRename.trim()"><LoaderCircle v-if="conversationRenameBusy" :size="14" /><Check v-else :size="14" /></button>
              <button type="button" aria-label="取消重命名" title="取消" :disabled="conversationRenameBusy" @click="cancelConversationRename"><X :size="14" /></button>
            </form>
            <template v-else>
              <button class="workspace-recent-item" type="button" :title="conversation.title" @click="openConversation(conversation.id)" @dblclick.prevent="startConversationRename(conversation)">{{ conversation.title }}</button>
              <span v-if="conversation.pinnedAt" class="workspace-recent-pin" :title="`已置顶：${conversation.title}`"><Pin :size="12" /></span>
              <button class="workspace-recent-edit" type="button" :aria-label="`重命名“${conversation.title}”`" title="重命名" @click.stop="startConversationRename(conversation)"><Pencil :size="14" /></button>
              <button class="workspace-recent-more" type="button" :aria-label="`打开“${conversation.title}”的对话选项`" :aria-expanded="conversationMenuId === conversation.id" @click.stop="openConversationMenu($event, conversation)"><MoreHorizontal :size="17" /></button>
            </template>
          </div>
          <p v-if="studio.workspaceHydrating && !studio.conversations.length">正在加载对话...</p>
          <p v-else-if="!filteredConversations.length">{{ conversationSearch ? '没有匹配的对话' : t('workspace.noChats') }}</p>
        </div>
      </section>
      </div>

      <div class="workspace-sidebar__bottom">
        <button v-if="workspaceDataLoaded && auth.isAuthenticated && publicSettings.trialEnabled && !currentSubscription && activeMode !== 'chat'" class="workspace-trial-button" type="button" @click="openSettings('plan')"><Gift :size="17" /><span>免费试用</span></button>
        <button v-if="!auth.isAuthenticated" class="workspace-settings" type="button" title="设置" @click="settingsOpen = true">
          <Settings :size="19" />
          <span>{{ t('workspace.settings') }}</span>
        </button>

        <section v-if="!auth.isAuthenticated && catalog.loginEnabled" class="workspace-signin">
          <strong>获取为你量身定制的回复</strong>
          <p>登录后可保存对话、创建图片并上传文件。</p>
          <RouterLink class="workspace-signin__button" to="/login?redirect=/chat">{{ t('workspace.signIn') }}</RouterLink>
        </section>
        <section v-if="auth.isAuthenticated" class="workspace-account-wrap">
          <button class="workspace-account-button" type="button" :aria-expanded="accountOpen" @click="accountOpen = !accountOpen">
            <span class="workspace-avatar">{{ auth.initials }}</span>
            <span class="workspace-account-copy">
              <strong>{{ auth.displayName }}</strong>
              <small>{{ currentPlanName }}</small>
            </span>
            <ChevronUp :size="16" :class="{ 'is-down': !accountOpen }" />
          </button>
          <div v-if="accountOpen" class="workspace-account-menu">
            <div class="account-menu-heading"><span class="workspace-avatar">{{ auth.initials }}</span><span><strong>{{ auth.displayName }}</strong><small>{{ currentPlanName }}</small></span></div>
            <div class="account-credit"><span>创作点余额</span><strong><Sparkles :size="13" />{{ studio.credits }}</strong></div>
            <button type="button" @click="openUpgrade"><Sparkles :size="16" />{{ currentSubscription ? '查看升级方案' : '升级套餐' }}</button>
            <button type="button" @click="openSettings('teams')"><Users :size="16" />团队空间</button>
            <button type="button" @click="openSettings('support')"><LifeBuoy :size="16" />帮助与客服</button>
            <button type="button" @click="openSettings('personalization')">{{ t('workspace.personalization') }}</button>
            <button type="button" @click="openSettings('account')">{{ t('workspace.account') }}</button>
            <button type="button" @click="openSettings('general')">{{ t('workspace.settings') }}</button>
            <button class="account-logout" type="button" @click="logout"><LogOut :size="17" />{{ t('workspace.logout') }}</button>
          </div>
        </section>
      </div>
    </aside>

    <main ref="workspaceMain" class="workspace-main" :class="{ 'workspace-main--chat': activeMode === 'chat' || activeMode === 'office' }">
      <header class="workspace-mobile-header">
        <button class="icon-button" type="button" aria-label="打开菜单" @click="mobileOpen = true">
          <Menu :size="21" />
        </button>
        <strong v-if="mobileTitle" class="workspace-mobile-title">{{ mobileTitle }}</strong>
      </header>
      <nav v-if="workspaceDataLoaded && auth.isAuthenticated && activeMode === 'chat'" class="workspace-chat-actions" aria-label="对话操作">
        <button v-if="showUpgradeEntry" class="workspace-upgrade-button" type="button" @click="openUpgrade"><Sparkles :size="16" /><span>升级</span></button>
        <button v-if="currentConversation" type="button" aria-label="分享对话" title="分享" :disabled="conversationActionBusy" @click="shareCurrentConversation"><Share2 :size="18" /><span>分享</span></button>
        <div v-if="currentConversation" class="workspace-chat-more-wrap">
          <button type="button" aria-label="更多对话操作" title="更多" :aria-expanded="chatActionsOpen" @click="chatActionsOpen = !chatActionsOpen"><MoreHorizontal :size="20" /></button>
          <div v-if="chatActionsOpen" class="workspace-chat-more-menu" role="menu">
            <button role="menuitem" type="button" @click="toggleCurrentConversationPinned"><PinOff v-if="currentConversation.pinnedAt" :size="17" /><Pin v-else :size="17" />{{ currentConversation.pinnedAt ? '取消置顶' : '置顶聊天' }}</button>
            <button role="menuitem" type="button" @click="archiveCurrentConversation"><Archive :size="17" />归档</button>
            <button class="is-danger" role="menuitem" type="button" @click="deleteCurrentConversation"><Trash2 :size="17" />删除</button>
          </div>
        </div>
      </nav>
      <slot />
    </main>

    <Teleport to="body">
      <div
        v-if="activeConversationMenu"
        ref="conversationMenuElement"
        class="workspace-recent-menu"
        role="menu"
        :aria-label="`打开“${activeConversationMenu.title}”的对话选项`"
        :style="{ left: `${conversationMenuPosition.left}px`, top: `${conversationMenuPosition.top}px` }"
        @click.stop
      >
        <button role="menuitem" type="button" :disabled="conversationActionBusy" @click="shareConversation(activeConversationMenu)"><Share2 :size="16" />分享</button>
        <button role="menuitem" type="button" :disabled="conversationActionBusy" @click="startConversationRename(activeConversationMenu)"><Pencil :size="16" />重命名</button>
        <button role="menuitem" type="button" :disabled="conversationActionBusy" @click="toggleConversationPinned(activeConversationMenu)"><PinOff v-if="activeConversationMenu.pinnedAt" :size="16" /><Pin v-else :size="16" />{{ activeConversationMenu.pinnedAt ? '取消置顶' : '置顶聊天' }}</button>
        <button role="menuitem" type="button" :disabled="conversationActionBusy" @click="archiveConversation(activeConversationMenu.id)"><Archive :size="16" />归档</button>
        <button class="is-danger" role="menuitem" type="button" :disabled="conversationActionBusy" @click="deleteConversation(activeConversationMenu)"><Trash2 :size="16" />删除</button>
      </div>
      <div v-if="settingsOpen" class="studio-modal-backdrop" @click.self="settingsOpen = false">
        <section class="studio-settings-dialog" role="dialog" aria-modal="true" :aria-labelledby="`settings-${settingsSection}`">
          <aside class="settings-sidebar">
            <button class="settings-close" type="button" aria-label="关闭" @click="settingsOpen = false"><X :size="20" /></button>
            <nav ref="settingsNavElement">
              <button v-for="item in settingsNav" :key="item.id" type="button" :data-section="item.id" :class="{ 'is-active': settingsSection === item.id }" @click="selectSettingsSection(item.id)">
                <component :is="item.icon" :size="17" />{{ item.label }}
              </button>
            </nav>
          </aside>
          <main class="settings-content">
            <template v-if="settingsSection === 'general'">
              <h2 id="settings-general">{{ t('settings.general') }}</h2>
              <label class="settings-option-row"><span><strong>{{ t('settings.appearance') }}</strong><small>选择 Xinyue AI 的界面显示方式。</small></span><select v-model="settings.appearance" aria-label="外观"><option value="深色">{{ t('settings.dark') }}</option><option value="浅色">{{ t('settings.light') }}</option><option value="跟随系统">{{ t('settings.system') }}</option></select></label>
              <label class="settings-option-row"><span><strong>{{ t('settings.language') }}</strong><small>设置界面语言。</small></span><select v-model="settings.language" aria-label="语言"><option value="zh-CN">简体中文</option><option value="zh-TW">繁體中文</option><option value="en">English</option><option value="ja">日本語</option><option value="ko">한국어</option></select></label>
            </template>

            <template v-else-if="settingsSection === 'personalization'">
              <h2 id="settings-personalization">{{ t('settings.personalization') }}</h2>
              <label class="settings-option-row"><span><strong>基本风格和语调</strong><small>设置 Xinyue AI 回复你的风格和语调，不会改变功能或执行权限。</small></span><select v-model="settings.style" aria-label="基本风格和语调"><option>默认</option><option>专业</option><option>友好</option><option>直率</option></select></label>
              <label class="settings-option-row"><span><strong>回答详略</strong><small>选择默认的信息密度，本轮明确要求始终优先。</small></span><select v-model="settings.detail" aria-label="回答详略"><option>自动判断</option><option>简洁</option><option>详细</option></select></label>
              <label class="settings-option-row"><span><strong>回复语言</strong><small>设置默认回复语言，也可以继续跟随当前对话。</small></span><select v-model="settings.replyLanguage" aria-label="回复语言"><option>跟随对话</option><option>中文</option><option>English</option></select></label>
              <label class="settings-textarea"><strong>自定义指令</strong><textarea v-model="settings.customInstructions" maxlength="1000" placeholder="例如：先给结论，再说明关键依据；涉及代码时优先给出可执行方案。" /><small>{{ settings.customInstructions.length }}/1000</small></label>
              <section class="settings-about"><h3>关于你</h3><p>这些资料会持续用于个性化回复。请勿填写密码、密钥、证件号或支付账户。</p><label>昵称<input v-model="settings.nickname" placeholder="Xinyue AI 应该怎么称呼你？" /></label><label>职业<input v-model="settings.occupation" placeholder="例如：独立开发者" /></label><label>你的详情<textarea v-model="settings.bio" maxlength="1000" placeholder="需要持续考虑的兴趣、目标、工作方式或背景" /></label><button type="button" @click="saveSettings(true)">保存</button><small v-if="settingsMessage" class="settings-feedback">{{ settingsMessage }}</small></section>
              <section class="settings-memory"><h3>记忆</h3><div><span><strong>使用已保存的记忆</strong><small>让 Xinyue AI 保存并使用你确认过的称呼、习惯和稳定偏好。</small></span><button class="switch-control" :class="{ 'is-on': settings.useMemory }" type="button" role="switch" :aria-checked="settings.useMemory" @click="settings.useMemory = !settings.useMemory"><i /></button></div><div><span><strong>参考过往聊天</strong><small>允许普通聊天在相关时参考其他会话的话题摘要。</small></span><button class="switch-control" :class="{ 'is-on': settings.referenceChats }" type="button" role="switch" :aria-checked="settings.referenceChats" @click="settings.referenceChats = !settings.referenceChats"><i /></button></div></section>
            </template>

            <template v-else-if="settingsSection === 'notifications'">
              <h2 id="settings-notifications">通知</h2><div class="settings-action-row"><span><strong>接收站内通知</strong><small>{{ unreadCount ? `${unreadCount} 条未读通知` : '当前没有未读通知' }}</small></span><button class="switch-control" :class="{ 'is-on': settings.notifications }" type="button" role="switch" :aria-checked="settings.notifications" @click="settings.notifications = !settings.notifications"><i /></button></div><section v-if="notifications.length" class="notification-list"><article v-for="notice in notifications" :key="notice.id" :class="{ 'is-unread': !notice.readAt }"><strong>{{ notice.title || '系统通知' }}</strong><p>{{ notice.body || notice.content || '账户状态已更新' }}</p><time>{{ formatServerDate(notice.createdAt) }}</time></article></section><section v-else class="settings-simple-card"><h3>通知中心</h3><p>暂无通知</p></section><div class="settings-action-row"><span><strong>全部标记为已读</strong><small>清理当前账户的未读提醒状态。</small></span><button type="button" :disabled="!unreadCount" @click="markAllRead">标记已读</button></div>
            </template>
            <template v-else-if="settingsSection === 'data'">
              <h2 id="settings-data">数据控制</h2>
              <section class="settings-data-section">
                <div class="settings-action-row"><span><strong>导出账户数据</strong><small>下载账户资料、设置、项目、文件索引和全部聊天记录的 JSON 副本。</small></span><button type="button" :disabled="dataActionBusy" @click="exportAccountData"><Download :size="15" />导出</button></div>
                <div class="settings-action-row"><span><strong>删除全部聊天</strong><small>永久删除所有聊天和消息。项目与已生成文件不会被删除。</small></span><button class="danger-button" type="button" :disabled="dataActionBusy || !studio.conversations.length" @click="clearConversationHistory"><Trash2 :size="15" />全部删除</button></div>
                <small v-if="dataActionMessage" class="settings-feedback" :class="{ 'is-error': dataActionError }">{{ dataActionMessage }}</small>
              </section>
              <section class="settings-memory"><h3>隐私</h3><div><span><strong>保存聊天记录</strong><small>关闭后新聊天会自动作为临时聊天处理。</small></span><button class="switch-control" :class="{ 'is-on': settings.chatHistoryEnabled }" type="button" role="switch" :aria-checked="settings.chatHistoryEnabled" @click="settings.chatHistoryEnabled = !settings.chatHistoryEnabled"><i /></button></div><div><span><strong>不将内容用于模型训练</strong><small>管理员渠道会收到该隐私偏好，用于后续上游策略适配。</small></span><button class="switch-control" :class="{ 'is-on': settings.trainingOptOut }" type="button" role="switch" :aria-checked="settings.trainingOptOut" @click="settings.trainingOptOut = !settings.trainingOptOut"><i /></button></div><div><span><strong>默认使用临时聊天</strong><small>新聊天不显示在历史记录中并自动过期。</small></span><button class="switch-control" :class="{ 'is-on': settings.temporaryChatDefault }" type="button" role="switch" :aria-checked="settings.temporaryChatDefault" @click="settings.temporaryChatDefault = !settings.temporaryChatDefault"><i /></button></div><div><span><strong>共享匿名使用分析</strong><small>仅用于产品稳定性和功能使用统计。</small></span><button class="switch-control" :class="{ 'is-on': settings.shareUsageAnalytics }" type="button" role="switch" :aria-checked="settings.shareUsageAnalytics" @click="settings.shareUsageAnalytics = !settings.shareUsageAnalytics"><i /></button></div><label class="settings-option-row"><span><strong>聊天数据保留</strong><small>超过期限的普通聊天会自动永久删除。</small></span><select v-model.number="settings.dataRetentionDays"><option :value="0">永久保留</option><option :value="30">30 天</option><option :value="90">90 天</option><option :value="365">1 年</option></select></label></section>
              <section class="settings-empty-section"><h3>共享链接</h3><p>管理你主动公开的对话副本。删除后，原链接会立即失效。</p><strong>你还没有创建公开对话链接。</strong></section>
            </template>
            <template v-else-if="settingsSection === 'plan'">
              <h2 id="settings-plan">套餐与账单</h2><section v-if="currentSubscription" class="settings-current-plan"><div><span>{{ currentSubscription.status === 'TRIALING' ? '试用中' : '当前套餐' }}</span><h3>{{ currentSubscription.plan.name }}</h3><p>{{ subscriptionEndText }}</p></div><strong>{{ currentSubscription.plan.includedCredits }}<small>创作点 / 周期</small></strong></section><div v-if="currentSubscription && !currentSubscription.cancelAtPeriodEnd" class="settings-action-row"><span><strong>取消自动续订</strong><small>付费套餐将在当前周期结束后停止，试用套餐会立即结束。</small></span><button type="button" :disabled="planBusy" @click="cancelSubscription">取消套餐</button></div><section v-if="!currentSubscription" class="settings-empty-section"><h3>免费版</h3><p>升级套餐可获得周期额度、更高并发和更多创作能力。</p><button v-if="publicSettings.trialEnabled" type="button" :disabled="planBusy" @click="startTrial()">{{ planBusy ? '处理中' : '开始免费试用' }}</button></section>
              <section class="settings-plan-grid"><article v-for="plan in subscriptionPlans" :key="plan.id" :class="{ recommended: plan.recommended }"><header><strong>{{ plan.name }}</strong><em v-if="plan.recommended">推荐</em></header><h3>{{ formatMoney(plan.priceCents) }}<small>/ {{ plan.billingCycle === 'YEARLY' ? '年' : plan.billingCycle === 'ONE_TIME' ? '一次性' : '月' }}</small></h3><p>{{ plan.description }}</p><ul><li>{{ plan.includedCredits }} 创作点</li><li>{{ plan.concurrency }} 路并发</li><li>{{ [plan.imageAccess && '图片', plan.videoAccess && '视频', plan.commerceAccess && '商品视觉'].filter(Boolean).join('、') || '对话' }}能力</li><li>{{ plan.allowByok ? '支持个人 API 密钥' : '管理员统一渠道' }}</li><li v-if="plan.trialDays">{{ plan.trialDays }} 天免费试用</li></ul><button type="button" :disabled="planBusy || currentSubscription?.planId === plan.id || (!currentSubscription && !plan.priceCents && !plan.trialDays) || (plan.priceCents > 0 && !publicSettings.subscriptionsEnabled)" @click="purchasePlan(plan)">{{ currentSubscription?.planId === plan.id ? '当前套餐' : !plan.priceCents && !plan.trialDays ? '当前免费方案' : plan.priceCents && !publicSettings.subscriptionsEnabled ? '暂未开放' : plan.priceCents ? '选择套餐' : '免费试用' }}</button></article></section><small v-if="planMessage" class="settings-feedback" :class="{ 'is-error': planError }">{{ planMessage }}</small><section v-if="subscriptionOrders.length" class="settings-history"><h3>套餐订单</h3><div v-for="order in subscriptionOrders" :key="order.id"><span>{{ order.plan.name }}<small>{{ formatServerDate(order.createdAt) }} · {{ rechargeStatusText[order.status] || order.status }}</small></span><strong>{{ formatMoney(order.amountCents) }}</strong></div></section>
            </template>
            <template v-else-if="settingsSection === 'api'">
              <h2 id="settings-api">API 与模型</h2>
              <section v-if="!publicSettings.userByokEnabled" class="settings-empty-section"><h3>用户 API 密钥未开放</h3><p>当前工作区统一使用管理员配置的模型渠道。</p></section>
              <template v-else>
                <section class="settings-routing-overview">
                  <header><div><strong>模型路由</strong><small>管理员渠道优先，失败时可切换到你启用的个人密钥。</small></div><span>{{ availableModels.length }} 个模型</span></header>
                  <div class="settings-routing-grid">
                    <article><span><ServerCog :size="18" /></span><div><strong>平台模型渠道</strong><small>{{ availableModels.length ? `${availableModels.length} 个可用模型，支持自动路由与故障切换` : '管理员暂未发布可用模型' }}</small></div><em :class="{ inactive: !availableModels.length }">{{ availableModels.length ? '可用' : '待配置' }}</em></article>
                    <article><span><KeyRound :size="18" /></span><div><strong>个人 API 密钥</strong><small>{{ apiCredentials.length ? `${apiCredentials.filter((item) => item.enabled).length} 个已启用，任务可按策略使用` : '添加 NewAPI、Sub2API 或 OpenAI 兼容密钥' }}</small></div><em :class="{ inactive: !apiCredentials.some((item) => item.enabled) }">{{ apiCredentials.some((item) => item.enabled) ? '已接入' : '未接入' }}</em></article>
                  </div>
                  <div v-if="availableModels.length" class="settings-model-tags"><span v-for="item in availableModels.slice(0, 8)" :key="item.key">{{ item.displayName }}<small>{{ modelCapabilityLabel[item.capability] || item.capability }}</small></span><em v-if="availableModels.length > 8">+{{ availableModels.length - 8 }}</em></div>
                </section>
                <div class="settings-action-row"><span><strong>我的上游密钥</strong><small>密钥加密保存，可分别启用、停用并设置默认项。</small></span><button type="button" @click="openCredentialEditor()"><CirclePlus :size="15" />添加密钥</button></div>
                <section class="settings-api-list"><article v-for="item in apiCredentials" :key="item.id"><div><strong>{{ item.name }}<em v-if="item.isDefault">默认</em></strong><small>{{ providerTypeLabel[item.providerType] }} · {{ item.apiKeyHint }}</small><p>{{ item.baseUrl }}</p></div><span class="settings-api-state" :class="{ disabled: !item.enabled }">{{ item.enabled ? '已启用' : '已停用' }}</span><footer><button type="button" @click="openCredentialEditor(item)">编辑</button><button type="button" class="danger-button" @click="deleteCredential(item)">删除</button></footer></article><p v-if="!apiCredentials.length">尚未添加个人 API 密钥，生成任务会使用管理员渠道。</p></section>
              </template>
            </template>
            <template v-else-if="settingsSection === 'credits'">
              <h2 id="settings-credits">创作点</h2><section class="settings-credit-card"><p>创作点余额</p><small>所有图片和商品视觉创作统一从当前余额扣点。</small><strong>{{ studio.credits }} 创作点</strong></section><template v-if="publicSettings.rechargeEnabled"><div class="settings-action-row"><span><strong>充值套餐</strong><small>创建订单后按页面提示完成付款</small></span></div><section class="settings-recharge-grid"><button v-for="item in rechargePackages" :key="item.id" type="button" :disabled="creatingOrder" @click="createRechargeOrder(item)"><span><strong>{{ item.name }}</strong><small>{{ item.credits }} 创作点</small></span><b>{{ formatMoney(item.priceCents) }}</b><em v-if="item.recommended">推荐</em></button></section><small v-if="rechargeMessage" class="settings-feedback">{{ rechargeMessage }}</small><section v-if="rechargeOrders.length" class="settings-history"><h3>充值订单</h3><div v-for="order in rechargeOrders" :key="order.id"><span>{{ order.package?.name || '充值订单' }}<small>{{ formatServerDate(order.createdAt) }} · {{ rechargeStatusText[order.status] || order.status }}</small></span><strong>{{ formatMoney(order.amountCents) }}</strong></div></section></template><div v-else class="settings-action-row"><span><strong>补充方式</strong><small>当前可使用兑换码，充值入口由管理员控制</small></span></div><section class="settings-history"><h3>创作点记录</h3><div v-for="entry in creditLedger" :key="entry.id"><span>{{ entry.description }}<small>{{ formatServerDate(entry.createdAt) }}</small></span><strong :class="{ 'is-negative': entry.amount < 0 }">{{ entry.amount > 0 ? '+' : '' }}{{ entry.amount }} 点</strong></div><p v-if="!creditLedger.length">暂无创作点记录</p></section>
            </template>
            <template v-else-if="settingsSection === 'redeem'">
              <h2 id="settings-redeem">兑换码</h2><section class="settings-empty-section"><h3>兑换创作点</h3><p>输入有效兑换码，将创作点添加到当前账户。</p><label class="redeem-field">兑换码<input v-model="settings.redeemCode" placeholder="请输入兑换码" @keydown.enter.prevent="redeemCredits" /></label><button type="button" :disabled="!settings.redeemCode.trim() || redeeming" @click="redeemCredits">{{ redeeming ? '兑换中' : '兑换' }}</button><small v-if="redeemMessage" class="settings-feedback" :class="{ 'is-error': redeemError }">{{ redeemMessage }}</small></section>
            </template>
            <template v-else-if="settingsSection === 'invite'">
              <h2 id="settings-invite">邀请与奖励</h2><section class="settings-invite-grid"><div><span>已邀请用户</span><strong>{{ inviteInfo.invited }}</strong><small>通过你的邀请链接注册的用户数量。</small></div><div><span>累计奖励</span><strong>{{ inviteInfo.reward }} 创作点</strong><small>邀请奖励已计入创作点余额。</small></div></section><label class="invite-link"><span>邀请链接</span><div><input readonly :value="inviteInfo.url" /><button type="button" :disabled="!inviteInfo.url" @click="copyInvite">{{ inviteCopied ? '已复制' : '复制' }}</button></div></label><section class="settings-empty-section"><h3>邀请码</h3><p>{{ inviteInfo.code || '登录后生成专属邀请码' }}</p></section>
            </template>
            <template v-else-if="settingsSection === 'workspace'">
              <h2 id="settings-workspace">知识与工具</h2>
              <p class="settings-section-intro">管理助手可检索的资料，以及需要管理员审批的外部工具权限。</p>
              <section class="settings-workspace-section">
                <header><div><strong>我的知识库</strong><small>文本和 JSON 文件会自动提取内容，图片等文件保留为资料索引。</small></div><BookOpen :size="19" /></header>
                <form class="settings-knowledge-create" @submit.prevent="createKnowledgeBase"><input v-model.trim="knowledgeDraft.name" required maxlength="100" placeholder="知识库名称" /><input v-model.trim="knowledgeDraft.description" maxlength="2000" placeholder="用途说明（可选）" /><button type="submit" :disabled="workspaceBusy"><CirclePlus :size="15" />创建</button></form>
                <div class="settings-knowledge-list">
                  <article v-for="item in knowledgeBases" :key="item.id">
                    <header><div><strong>{{ item.name }}</strong><small>{{ item.description || '暂无说明' }}</small></div><span>{{ item.documentCount }} 个文件 · {{ item.chunkCount }} 个分块</span></header>
                    <div v-if="item.assets.length" class="settings-knowledge-assets"><div v-for="entry in item.assets" :key="entry.assetId"><span><FileText :size="15" />{{ entry.asset.name }}</span><button type="button" aria-label="从知识库移除文件" @click="detachKnowledgeAsset(item.id, entry.assetId)"><X :size="14" /></button></div></div>
                    <p v-else>还没有关联文件。</p>
                    <footer><select :value="knowledgeAssetSelection[item.id] || ''" :aria-label="`为${item.name}选择文件`" @change="knowledgeAssetSelection[item.id] = ($event.target as HTMLSelectElement).value"><option value="">选择已上传文件</option><option v-for="asset in availableKnowledgeAssets(item)" :key="asset.id" :value="asset.id">{{ asset.name }}</option></select><button type="button" :disabled="!knowledgeAssetSelection[item.id] || workspaceBusy" @click="attachKnowledgeAsset(item.id)">添加文件</button><button type="button" @click="editKnowledgeBase(item)"><Pencil :size="14" />编辑</button><button class="danger-button" type="button" @click="deleteKnowledgeBase(item)"><Trash2 :size="14" />删除</button></footer>
                  </article>
                  <p v-if="!knowledgeBases.length" class="settings-empty-copy">尚未创建知识库。创建后可绑定资料并在后台关联到 AI 助手。</p>
                </div>
              </section>
              <section class="settings-workspace-section">
                <header><div><strong>工具权限</strong><small>需要审批的工具会生成正式申请，批准后在有效期内可调用一次。</small></div><Wrench :size="19" /></header>
                <div class="settings-tool-list"><article v-for="binding in assistantToolBindings" :key="binding.key"><div><strong>{{ binding.tool.name }}</strong><small>{{ binding.assistant.name }} · {{ binding.tool.description || binding.tool.key }}</small></div><span :class="`status-${binding.approval?.status?.toLowerCase() || 'none'}`">{{ toolApprovalText(binding) }}</span><button v-if="binding.tool.requiresApproval && !['PENDING', 'APPROVED'].includes(binding.approval?.status || '')" type="button" :disabled="workspaceBusy" @click="requestToolApproval(binding)">申请权限</button><button v-else-if="binding.tool.requiresApproval && binding.approval?.status === 'PENDING'" class="subtle-button" type="button" :disabled="workspaceBusy" @click="cancelToolApproval(binding)">撤回申请</button><em v-else-if="!binding.tool.requiresApproval">无需审批</em></article><p v-if="!assistantToolBindings.length" class="settings-empty-copy">管理员启用并绑定工具后会显示在这里。</p></div>
              </section>
              <small v-if="workspaceMessage" class="settings-feedback" :class="{ 'is-error': workspaceError }">{{ workspaceMessage }}</small>
            </template>
            <template v-else-if="settingsSection === 'teams'">
              <h2 id="settings-teams">团队空间</h2><p class="settings-section-intro">创建团队、分配成员角色并管理协作空间。</p>
              <section class="settings-team-builder"><header><div><strong>创建团队</strong><small>团队创建后，你将成为所有者并可以管理成员。</small></div><Users :size="19" /></header><form class="settings-team-create" @submit.prevent="createTeam"><label><span>团队名称</span><input v-model.trim="teamDraft.name" required maxlength="100" placeholder="例如：品牌设计团队" /></label><label><span>团队说明</span><input v-model.trim="teamDraft.description" maxlength="2000" placeholder="团队目标或用途（可选）" /></label><button type="submit" :disabled="teamBusy"><LoaderCircle v-if="teamBusy" class="settings-payment-spin" :size="15" />{{ teamBusy ? '创建中' : '创建团队' }}</button></form></section>
              <section v-for="team in teams" :key="team.id" class="settings-team-card"><header><div><strong>{{ team.name }}</strong><small>{{ team.description || team.slug }}</small></div><div class="settings-team-actions"><button v-if="team.ownerId === auth.session?.id" type="button" @click="editTeam(team)"><Pencil :size="14" />编辑</button><button v-if="team.ownerId === auth.session?.id" type="button" @click="teamInviteId = team.id">邀请成员</button><button v-else type="button" @click="leaveTeam(team)"><LogOut :size="14" />退出</button></div></header><div class="settings-team-members"><div v-for="member in team.members" :key="member.userId"><span>{{ member.user.displayName }}<small>{{ member.user.email || '未绑定邮箱' }} · {{ teamRoleText[member.role] || member.role }}</small></span><div v-if="member.role !== 'OWNER' && team.ownerId === auth.session?.id"><select :value="member.role" :aria-label="`设置${member.user.displayName}的角色`" @change="updateTeamMemberRole(team.id, member.userId, ($event.target as HTMLSelectElement).value)"><option value="MEMBER">成员</option><option value="ADMIN">管理员</option></select><button type="button" aria-label="移除成员" @click="removeTeamMember(team.id, member.userId)"><Trash2 :size="14" /></button></div></div></div><form v-if="teamInviteId === team.id" class="settings-team-invite" @submit.prevent="inviteToTeam(team.id)"><input v-model.trim="teamInviteEmail" required type="email" placeholder="已注册用户的邮箱" /><select v-model="teamInviteRole" aria-label="成员角色"><option value="MEMBER">成员</option><option value="ADMIN">管理员</option></select><button type="submit" :disabled="teamBusy">添加</button><button type="button" @click="teamInviteId = ''">取消</button></form><footer v-if="team.ownerId === auth.session?.id"><button class="danger-button" type="button" @click="deleteTeam(team)"><Trash2 :size="14" />删除团队</button></footer></section><p v-if="!teams.length" class="settings-empty-copy">你还没有加入团队空间。</p><small v-if="teamMessage" class="settings-feedback" :class="{ 'is-error': teamError }">{{ teamMessage }}</small>
            </template>
            <SupportCenter v-else-if="settingsSection === 'support'" />
            <template v-else>
              <h2 id="settings-account">账户</h2><div class="account-detail-row"><span>姓名</span><strong>{{ auth.displayName }}</strong></div><div class="account-detail-row"><span>{{ accountIdentityLabel }}<small>{{ accountIdentityHint }}</small></span><strong>{{ accountIdentity }}</strong></div><div class="account-detail-row"><span>登录方式</span><strong>{{ loginMethodLabel }}</strong></div><h3 class="account-actions-title">Xinyue AI</h3><nav class="settings-legal-links"><RouterLink to="/about" @click="settingsOpen = false">关于我们</RouterLink><RouterLink to="/copyright" @click="settingsOpen = false">版权说明</RouterLink><RouterLink to="/terms" @click="settingsOpen = false">用户协议</RouterLink><RouterLink to="/privacy" @click="settingsOpen = false">隐私政策</RouterLink></nav><h3 class="account-actions-title">账户操作</h3><div class="settings-action-row"><span><strong>退出登录</strong><small>结束当前设备上的登录状态。</small></span><button class="danger-button" type="button" @click="logout">退出登录</button></div>
            </template>
          </main>
        </section>
      </div>
        <div v-if="upgradeOpen" class="workspace-upgrade-layer" @mousedown.self="upgradeOpen = false">
          <section class="workspace-upgrade-dialog" role="dialog" aria-modal="true" aria-labelledby="workspace-upgrade-title">
            <button class="workspace-upgrade-close" type="button" aria-label="关闭升级套餐" @click="upgradeOpen = false"><X :size="21" /></button>
            <header><h2 id="workspace-upgrade-title">升级套餐</h2><p>选择适合你的使用方式</p></header>
            <div class="workspace-upgrade-tabs" role="tablist"><button type="button" :class="{ active: pricingMode === 'personal' }" @click="pricingMode = 'personal'">个人</button><button type="button" :class="{ active: pricingMode === 'team' }" @click="pricingMode = 'team'">团队</button></div>
            <div v-if="pricingMode === 'personal'" class="workspace-upgrade-plans">
              <article class="workspace-upgrade-plan workspace-upgrade-plan--free"><header><strong>免费版</strong><small>开始使用 Xinyue AI</small></header><h3>{{ formatMoney(0) }}<small>/ 月</small></h3><button type="button" disabled>{{ currentSubscription ? '基础方案' : '当前套餐' }}</button><ul><li><CheckCircle2 :size="17" />基础模型和日常对话</li><li><CheckCircle2 :size="17" />有限额度的图片生成</li><li><CheckCircle2 :size="17" />项目与文件管理</li></ul></article>
              <article v-for="plan in upgradeSubscriptionPlans" :key="plan.id" class="workspace-upgrade-plan" :class="{ recommended: plan.recommended, current: currentSubscription?.planId === plan.id }"><header><strong>{{ plan.name }}</strong><em v-if="plan.recommended">推荐</em><small>{{ plan.description }}</small></header><h3>{{ formatMoney(plan.priceCents) }}<small>/ {{ plan.billingCycle === 'YEARLY' ? '年' : plan.billingCycle === 'ONE_TIME' ? '一次性' : '月' }}</small></h3><button type="button" :disabled="planBusy || currentSubscription?.planId === plan.id || (plan.priceCents > 0 && !publicSettings.subscriptionsEnabled)" @click="purchaseUpgradePlan(plan)">{{ currentSubscription?.planId === plan.id ? '当前套餐' : plan.priceCents ? `升级至 ${plan.name}` : '开始免费试用' }}</button><ul><li><CheckCircle2 :size="17" />{{ plan.includedCredits }} 创作点 / 周期</li><li><CheckCircle2 :size="17" />{{ plan.concurrency }} 路并发任务</li><li><CheckCircle2 :size="17" />{{ plan.allowByok ? '支持个人 API 密钥' : '统一模型渠道' }}</li><li v-if="plan.trialDays"><CheckCircle2 :size="17" />{{ plan.trialDays }} 天免费试用</li></ul></article>
              <section v-if="!upgradeSubscriptionPlans.length" class="workspace-upgrade-empty"><WalletCards :size="24" /><strong>套餐正在配置中</strong><span>管理员上架套餐后会显示在这里。</span></section>
            </div>
            <div v-else class="workspace-team-upgrade"><span><Users :size="26" /></span><h3>团队协作空间</h3><p>集中维护团队成员，让已注册用户加入同一个组织空间。</p><div class="workspace-team-stats"><span><strong>{{ teams.length }}</strong><small>已加入团队</small></span><span><strong>{{ teamMemberTotal }}</strong><small>团队成员</small></span></div><button type="button" @click="openTeamSettings">创建或管理团队</button></div>
            <small v-if="planMessage" class="settings-feedback" :class="{ 'is-error': planError }">{{ planMessage }}</small>
          </section>
        </div>
        <div v-if="paymentIntent" class="settings-payment-layer" @mousedown.self="closePayment">
          <section class="settings-payment-dialog" role="dialog" aria-modal="true" aria-labelledby="payment-dialog-title">
            <header><div><span>安全收银台</span><h3 id="payment-dialog-title">{{ paymentTransaction ? '等待支付结果' : '选择支付方式' }}</h3><p>{{ paymentIntent.productName }}</p></div><button type="button" aria-label="关闭收银台" @click="closePayment"><X :size="18" /></button></header>
            <template v-if="!paymentTransaction">
              <div class="settings-payment-total"><span>应付金额</span><strong>{{ formatMoney(paymentIntent.amountCents) }}</strong></div>
              <div v-if="eligiblePaymentChannels.length" class="settings-payment-channels">
                <button v-for="channel in eligiblePaymentChannels" :key="channel.id" type="button" :class="{ active: selectedPaymentChannelId === channel.id }" @click="selectPaymentChannel(channel)">
                  <span class="settings-payment-channel-icon"><CreditCard v-if="channel.providerKey === 'STRIPE'" :size="18" /><Banknote v-else-if="channel.providerKey === 'MANUAL'" :size="18" /><QrCode v-else :size="18" /></span><span><strong>{{ channel.name }}</strong><small>{{ paymentProviderText[channel.providerKey] || channel.providerKey }}</small></span><i><CheckCircle2 v-if="selectedPaymentChannelId === channel.id" :size="17" /></i>
                </button>
              </div>
              <div v-if="selectedPaymentChannel" class="settings-payment-methods"><span>付款方式</span><div><button v-for="method in selectedPaymentChannel.supportedMethods" :key="method" type="button" :class="{ active: selectedPaymentMethod === method }" @click="selectedPaymentMethod = method">{{ paymentMethodText[method] || method }}</button></div></div>
              <p v-if="!eligiblePaymentChannels.length" class="settings-payment-empty">当前金额暂无可用支付渠道，请联系管理员或稍后再试。</p>
              <p v-if="paymentError" class="settings-feedback is-error">{{ paymentError }}</p>
              <footer><button type="button" @click="closePayment">取消</button><button type="button" :disabled="paymentBusy || !selectedPaymentChannel || !selectedPaymentMethod" @click="confirmCheckout"><LoaderCircle v-if="paymentBusy" class="settings-payment-spin" :size="15" />{{ paymentBusy ? '正在创建订单' : `确认支付 ${formatMoney(paymentIntent.amountCents)}` }}</button></footer>
            </template>
            <template v-else>
              <div class="settings-payment-state" :class="paymentTransaction.status.toLowerCase()"><span><LoaderCircle v-if="['PENDING', 'PAID'].includes(paymentTransaction.status)" class="settings-payment-spin" :size="24" /><CheckCircle2 v-else-if="paymentTransaction.status === 'COMPLETED'" :size="24" /><CircleGauge v-else :size="24" /></span><div><strong>{{ paymentStatusTitle }}</strong><small>交易号 {{ paymentTransaction.outTradeNo }}</small></div><b>{{ formatMoney(paymentTransaction.amountCents) }}</b></div>
              <img v-if="paymentTransaction.qrCodeUrl" class="settings-payment-qr" :src="paymentTransaction.qrCodeUrl" alt="付款二维码" />
              <p v-if="paymentInstructions" class="settings-payment-instructions">{{ paymentInstructions }}</p>
              <p v-if="paymentError" class="settings-feedback is-error">{{ paymentError }}</p>
              <footer><button type="button" @click="closePayment">稍后查看</button><a v-if="paymentTransaction.checkoutUrl" :href="paymentTransaction.checkoutUrl" target="_blank" rel="noreferrer">前往支付</a><button v-if="!['COMPLETED', 'FAILED', 'CANCELLED', 'EXPIRED'].includes(paymentTransaction.status)" type="button" :disabled="paymentBusy" @click="refreshPaymentStatus">我已完成支付</button></footer>
            </template>
          </section>
        </div>
        <div v-if="credentialEditor" class="settings-credential-layer" @mousedown.self="credentialEditor = null"><form class="settings-credential-editor" @submit.prevent="saveCredential"><header><div><h3>{{ credentialEditor.id ? '编辑 API 密钥' : '添加 API 密钥' }}</h3><p>密钥会加密保存在服务器，页面只显示末尾四位。</p></div><button type="button" aria-label="关闭" @click="credentialEditor = null"><X :size="18" /></button></header><label><span>名称</span><input v-model.trim="credentialEditor.name" required maxlength="80" placeholder="我的 NewAPI" /></label><label><span>服务类型</span><select v-model="credentialEditor.providerType"><option value="NEW_API">NewAPI</option><option value="SUB2API">Sub2API</option><option value="OPENAI">OpenAI 官方</option><option value="OPENAI_COMPATIBLE">其他 OpenAI 兼容</option></select></label><label><span>API Base URL</span><input v-model.trim="credentialEditor.baseUrl" required type="url" placeholder="https://api.example.com/v1" /></label><label><span>API 密钥</span><input v-model.trim="credentialEditor.apiKey" :required="!credentialEditor.id" type="password" autocomplete="new-password" :placeholder="credentialEditor.id ? `留空保留 ${credentialEditor.apiKeyHint}` : 'sk-...'" /></label><label><span>认证方式</span><select v-model="credentialEditor.authType"><option value="BEARER">Authorization Bearer</option><option value="X_API_KEY">x-api-key</option><option value="BOTH">同时发送</option></select></label><div class="settings-credential-toggles"><label><input v-model="credentialEditor.enabled" type="checkbox" />启用</label><label><input v-model="credentialEditor.isDefault" type="checkbox" />设为默认密钥</label></div><p v-if="credentialError" class="settings-feedback is-error">{{ credentialError }}</p><footer><button type="button" @click="credentialEditor = null">取消</button><button type="submit" :disabled="credentialSaving">{{ credentialSaving ? '保存中' : '保存' }}</button></footer></form></div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch, type Component } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useMessage } from 'naive-ui'
import { paymentMethodText, paymentProviderText, type PaymentMethodKey, type PaymentProviderKey } from '../constants/payment'
import {
  Archive,
  Banknote,
  BriefcaseBusiness,
  BookOpen,
  Blocks,
  Code2,
  Bell,
  ChevronDown,
  ChevronUp,
  CircleGauge,
  CirclePlus,
  Check,
  CheckCircle2,
  CreditCard,
  Download,
  FileText,
  KeyRound,
  Files,
  Folder,
  Gift,
  Image as ImageIcon,
  ExternalLink,
  LifeBuoy,
  LibraryBig,
  LoaderCircle,
  Menu,
  MoreHorizontal,
  LogOut,
  PanelLeftClose,
  Pencil,
  Pin,
  PinOff,
  QrCode,
  Search,
  ServerCog,
  Share2,
  Settings,
  SlidersHorizontal,
  ShoppingBag,
  SquarePen,
  Sparkles,
  Sun,
  Trash2,
  Users,
  UserRound,
  Wrench,
  WalletCards,
  Webhook,
  X,
} from 'lucide-vue-next'
import BrandMark from './BrandMark.vue'
import SupportCenter from './SupportCenter.vue'
import type { ConversationSummary, StudioMode } from '../types'
import { useAuthStore } from '../stores/auth'
import { useCatalogStore } from '../stores/catalog'
import { useStudioStore } from '../stores/studio'
import { api } from '../services/api'
import { readStoredSettings, updateStoredSettings, writeStoredSettings } from '../utils/settings-storage'

const props = defineProps<{
  activeMode: StudioMode
}>()

const sidebarOpen = ref(true)
const workspaceMain = ref<HTMLElement | null>(null)
const mobileOpen = ref(false)
const recentOpen = ref(true)
const recentSearchOpen = ref(false)
const conversationSearch = ref('')
const conversationMenuId = ref('')
const conversationMenuElement = ref<HTMLElement | null>(null)
const conversationMenuPosition = reactive({ left: 0, top: 0 })
const conversationActionBusy = ref(false)
const renamingConversationId = ref('')
const conversationRename = ref('')
const conversationRenameBusy = ref(false)
const settingsOpen = ref(false)
const upgradeOpen = ref(false)
const pricingMode = ref<'personal' | 'team'>('personal')
const chatActionsOpen = ref(false)
type SettingsSection = 'general' | 'personalization' | 'notifications' | 'data' | 'plan' | 'api' | 'credits' | 'redeem' | 'invite' | 'workspace' | 'teams' | 'support' | 'account'
const settingsSection = ref<SettingsSection>('general')
const settingsNavElement = ref<HTMLElement | null>(null)
const accountOpen = ref(false)
const auth = useAuthStore()
const catalog = useCatalogStore()
const studio = useStudioStore()
const router = useRouter()
const route = useRoute()
const { t, locale } = useI18n()
const message = useMessage()
interface UserSettingsResponse { appearance?: string; language?: string; responseStyle?: string; responseDetail?: string; replyLanguage?: string; customInstructions?: string; nickname?: string; occupation?: string; bio?: string; useMemory?: boolean; referenceChats?: boolean; notifications?: boolean; chatHistoryEnabled?: boolean; trainingOptOut?: boolean; temporaryChatDefault?: boolean; dataRetentionDays?: number; shareUsageAnalytics?: boolean }
interface UserResponse { settings?: UserSettingsResponse | null; creditAccount?: { balance: number } | null }
interface NotificationItem { id: string; title?: string; body?: string; content?: string; readAt?: string | null; createdAt: string }
interface CreditEntry { id: string; amount: number; description: string; createdAt: string }
interface InviteInfo { code: string; url: string; invited: number; reward: number }
type ProviderType = 'OPENAI' | 'NEW_API' | 'SUB2API' | 'OPENAI_COMPATIBLE'
type AuthType = 'BEARER' | 'X_API_KEY' | 'BOTH'
interface ApiCredential { id: string; name: string; providerType: ProviderType; baseUrl: string; apiKeyHint: string; authType: AuthType; enabled: boolean; isDefault: boolean }
interface CredentialEditor extends Partial<ApiCredential> { name: string; providerType: ProviderType; baseUrl: string; apiKey: string; apiKeyHint: string; authType: AuthType; enabled: boolean; isDefault: boolean }
interface RechargePackage { id: string; name: string; credits: number; priceCents: number; recommended: boolean }
interface RechargeOrder { id: string; status: string; amountCents: number; createdAt: string; package?: { name: string } | null }
interface SubscriptionPlan { id: string; code: string; name: string; description: string; billingCycle: 'MONTHLY' | 'YEARLY' | 'ONE_TIME'; priceCents: number; includedCredits: number; trialDays: number; concurrency: number; allowByok: boolean; imageAccess: boolean; videoAccess: boolean; commerceAccess: boolean; recommended: boolean }
interface Subscription { id: string; planId: string; status: 'TRIALING' | 'ACTIVE'; currentPeriodEnd?: string | null; trialEndsAt?: string | null; cancelAtPeriodEnd: boolean; plan: SubscriptionPlan }
interface SubscriptionOrder { id: string; status: string; amountCents: number; createdAt: string; plan: { name: string } }
interface PaymentChannel { id: string; name: string; providerKey: PaymentProviderKey; isDefault: boolean; supportedMethods: PaymentMethodKey[]; minAmountCents: number; maxAmountCents?: number | null }
interface PaymentIntent { orderType: 'SUBSCRIPTION' | 'RECHARGE'; productId: string; productName: string; amountCents: number }
interface PaymentTransaction { id: string; outTradeNo: string; amountCents: number; currency: string; status: string; checkoutUrl?: string; qrCodeUrl?: string; failureReason?: string; metadata?: { instructions?: string } }
interface ExternalNavLinkItem { id: string; key: string; name: string; description: string; url: string; icon: string; enabled: boolean; openNewTab: boolean; sortOrder: number }
interface AvailableModel { key: string; displayName: string; capability: 'CHAT' | 'IMAGE' | 'VIDEO' | 'COMMERCE' }
interface TeamMember { userId: string; role: string; user: { displayName: string; email: string | null } }
interface Team { id: string; name: string; slug: string; description: string; ownerId: string; members: TeamMember[] }
interface WorkspaceAsset { id: string; name: string }
interface KnowledgeBaseAsset { assetId: string; chunkCount: number; asset: WorkspaceAsset }
interface KnowledgeBase { id: string; name: string; description: string; status: string; documentCount: number; chunkCount: number; assets: KnowledgeBaseAsset[] }
interface AssistantToolBinding { key: string; assistant: { id: string; name: string }; tool: { id: string; key: string; name: string; description: string; requiresApproval: boolean }; approval?: { id: string; status: string; expiresAt?: string | null } }
interface WorkspaceNavItem { key: string; mode: StudioMode; activeModes?: StudioMode[]; label: string; icon: Component; to: string; external: boolean; openNewTab: boolean }
const notifications = ref<NotificationItem[]>([])
const creditLedger = ref<CreditEntry[]>([])
const inviteInfo = reactive<InviteInfo>({ code: '', url: '', invited: 0, reward: 0 })
const settingsHydrated = ref(false)
const workspaceDataLoaded = ref(false)
const settingsMessage = ref('')
const redeemMessage = ref('')
const redeemError = ref(false)
const redeeming = ref(false)
const inviteCopied = ref(false)
const teams = ref<Team[]>([])
const teamDraft = reactive({ name: '', description: '' })
const teamInviteId = ref('')
const teamInviteEmail = ref('')
const teamInviteRole = ref<'MEMBER' | 'ADMIN'>('MEMBER')
const teamBusy = ref(false)
const teamMessage = ref('')
const teamError = ref(false)
const knowledgeBases = ref<KnowledgeBase[]>([])
const workspaceAssets = ref<WorkspaceAsset[]>([])
const toolApprovals = ref<{ id: string; assistant?: { id: string; name: string } | null; tool: { id: string; key: string; name: string; description: string; requiresApproval: boolean }; status: string; expiresAt?: string | null }[]>([])
const workspaceTools = ref<AssistantToolBinding['tool'][]>([])
const workspaceAssistants = ref<{ id: string; name: string; tools: { toolId: string }[] }[]>([])
const workspaceBusy = ref(false)
const workspaceMessage = ref('')
const workspaceError = ref(false)
const knowledgeDraft = reactive({ name: '', description: '' })
const knowledgeAssetSelection = reactive<Record<string, string>>({})
const teamRoleText: Record<string, string> = { OWNER: '所有者', ADMIN: '管理员', MEMBER: '成员' }
const apiCredentials = ref<ApiCredential[]>([])
const credentialEditor = ref<CredentialEditor | null>(null)
const credentialSaving = ref(false)
const credentialError = ref('')
const publicSettings = reactive({
  userByokEnabled: true,
  rechargeEnabled: false,
  subscriptionsEnabled: true,
  trialEnabled: false,
  currency: 'CNY',
  sidebarCreationEnabled: true,
  sidebarCommerceEnabled: true,
  sidebarOfficeEnabled: true,
  sidebarPromptsEnabled: true,
  sidebarPluginsEnabled: true,
  sidebarProjectsEnabled: true,
  sidebarAssetsEnabled: true,
})
const rechargePackages = ref<RechargePackage[]>([])
const rechargeOrders = ref<RechargeOrder[]>([])
const rechargeMessage = ref('')
const creatingOrder = ref(false)
const subscriptionPlans = ref<SubscriptionPlan[]>([])
const currentSubscription = ref<Subscription | null>(null)
const subscriptionOrders = ref<SubscriptionOrder[]>([])
const externalLinks = ref<ExternalNavLinkItem[]>([])
const availableModels = ref<AvailableModel[]>([])
const planBusy = ref(false)
const planMessage = ref('')
const planError = ref(false)
const paymentChannels = ref<PaymentChannel[]>([])
const paymentIntent = ref<PaymentIntent | null>(null)
const selectedPaymentChannelId = ref('')
const selectedPaymentMethod = ref<PaymentMethodKey | ''>('')
const paymentTransaction = ref<PaymentTransaction | null>(null)
const paymentBusy = ref(false)
const paymentError = ref('')
let paymentPollTimer = 0
const dataActionBusy = ref(false)
const dataActionMessage = ref('')
const dataActionError = ref(false)
const rechargeStatusText: Record<string, string> = { PENDING: '待支付', PAID: '已到账', CANCELLED: '已取消', REFUNDED: '已退款' }
const providerTypeLabel: Record<ProviderType, string> = { OPENAI: 'OpenAI', NEW_API: 'NewAPI', SUB2API: 'Sub2API', OPENAI_COMPATIBLE: 'OpenAI 兼容' }
const modelCapabilityLabel: Record<AvailableModel['capability'], string> = { CHAT: '对话', IMAGE: '图片', VIDEO: '视频', COMMERCE: '商品图' }
const unreadCount = computed(() => notifications.value.filter((item) => !item.readAt).length)
const currentPlanName = computed(() => currentSubscription.value?.plan.name || '免费版')
const currentConversation = computed(() => studio.conversations.find((item) => item.id === studio.currentConversationId) || null)
const showUpgradeEntry = computed(() => publicSettings.subscriptionsEnabled || publicSettings.trialEnabled || subscriptionPlans.value.length > 0)
const upgradeSubscriptionPlans = computed(() => subscriptionPlans.value.filter((plan) => plan.priceCents > 0 || plan.trialDays > 0))
const teamMemberTotal = computed(() => teams.value.reduce((total, team) => total + team.members.length, 0))
const assistantToolBindings = computed<AssistantToolBinding[]>(() => {
  const bindings: AssistantToolBinding[] = []
  for (const assistant of workspaceAssistants.value) {
    for (const item of assistant.tools || []) {
      const tool = workspaceTools.value.find((entry) => entry.id === item.toolId)
      if (!tool) continue
      const approval = toolApprovals.value.find((entry) => entry.tool.id === tool.id && entry.assistant?.id === assistant.id)
      bindings.push({ key: `${assistant.id}:${tool.id}`, assistant: { id: assistant.id, name: assistant.name }, tool, approval })
    }
  }
  return bindings
})
const loginMethodLabel = computed(() => ({ password: '邮箱 / 密码', email: '邮箱验证码', linuxdo: 'Linux.do', community: '第三方账号' }[auth.session?.provider || 'community']))
const hasPublicEmail = computed(() => Boolean(auth.session?.email && !auth.session.email.endsWith('@auth.xinyue.local')))
const accountIdentityLabel = computed(() => hasPublicEmail.value ? '电子邮件' : '用户名')
const accountIdentityHint = computed(() => hasPublicEmail.value ? '已绑定邮箱' : '此账户未绑定邮箱')
const accountIdentity = computed(() => hasPublicEmail.value ? auth.session?.email : auth.session?.username || auth.displayName)
const subscriptionEndText = computed(() => {
  const subscription = currentSubscription.value
  if (!subscription?.currentPeriodEnd) return '长期有效'
  const date = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(subscription.currentPeriodEnd))
  if (subscription.status === 'TRIALING') return `试用至 ${date}`
  return subscription.cancelAtPeriodEnd ? `${date} 到期后停止` : `下一周期：${date}`
})
const eligiblePaymentChannels = computed(() => paymentIntent.value ? paymentChannels.value.filter((item) => item.minAmountCents <= paymentIntent.value!.amountCents && (!item.maxAmountCents || item.maxAmountCents >= paymentIntent.value!.amountCents)) : [])
const selectedPaymentChannel = computed(() => eligiblePaymentChannels.value.find((item) => item.id === selectedPaymentChannelId.value) || null)
const paymentInstructions = computed(() => String(paymentTransaction.value?.metadata?.instructions || ''))
const paymentStatusTitle = computed(() => ({ PENDING: '等待完成付款', PAID: '付款已确认，正在发放权益', COMPLETED: '支付完成，权益已到账', FAILED: '支付或权益入账失败', CANCELLED: '交易已取消', EXPIRED: '交易已过期', REFUNDED: '交易已退款' }[paymentTransaction.value?.status || ''] || '正在确认交易'))
const filteredConversations = computed(() => {
  const query = conversationSearch.value.trim().toLocaleLowerCase()
  if (!query) return studio.conversations
  return studio.conversations.filter((item) => item.title.toLocaleLowerCase().includes(query))
})
const activeConversationMenu = computed(() => studio.conversations.find((item) => item.id === conversationMenuId.value) || null)
const mobileTitle = computed(() => ({ chat: 'Xinyue AI', images: t('workspace.creation'), videos: t('workspace.creation'), commerce: t('studio.commerce'), office: t('workspace.office'), prompts: t('workspace.prompts'), plugins: t('workspace.plugins'), projects: t('studio.projects'), assets: t('studio.library') } as Partial<Record<StudioMode, string>>)[props.activeMode] || '')
const storedSettings = readStoredSettings()
const storedLanguage = storedSettings.language === 'English' ? 'en' : storedSettings.language === '中文' ? 'zh-CN' : storedSettings.language
const storedAppearance = storedSettings.appearance === 'light' ? '浅色' : storedSettings.appearance === 'dark' ? '深色' : storedSettings.appearance === 'system' ? '跟随系统' : storedSettings.appearance
const settings = reactive({
  notifications: storedSettings.notifications ?? true,
  rememberModel: storedSettings.rememberModel ?? true,
  language: storedLanguage || 'zh-CN',
  appearance: storedAppearance || '深色',
  style: storedSettings.style || '默认',
  detail: storedSettings.detail || '自动判断',
  replyLanguage: storedSettings.replyLanguage || '跟随对话',
  customInstructions: storedSettings.customInstructions || '',
  nickname: storedSettings.nickname || '',
  occupation: storedSettings.occupation || '',
  bio: storedSettings.bio || '',
  useMemory: storedSettings.useMemory ?? true,
  referenceChats: storedSettings.referenceChats ?? true,
  chatHistoryEnabled: storedSettings.chatHistoryEnabled ?? true,
  trainingOptOut: storedSettings.trainingOptOut ?? true,
  temporaryChatDefault: storedSettings.temporaryChatDefault ?? false,
  dataRetentionDays: storedSettings.dataRetentionDays ?? 0,
  shareUsageAnalytics: storedSettings.shareUsageAnalytics ?? false,
  redeemCode: '',
})
const settingsNav = computed(() => [
  { id: 'general' as const, label: t('settings.general'), icon: Sun },
  { id: 'personalization' as const, label: t('settings.personalization'), icon: Sparkles },
  { id: 'notifications' as const, label: t('settings.notifications'), icon: Bell },
  { id: 'data' as const, label: t('settings.data'), icon: SlidersHorizontal },
  { id: 'plan' as const, label: '套餐与账单', icon: WalletCards },
  { id: 'api' as const, label: t('settings.api'), icon: KeyRound },
  { id: 'credits' as const, label: t('settings.credits'), icon: CircleGauge },
  { id: 'redeem' as const, label: t('settings.redeem'), icon: CirclePlus },
  { id: 'invite' as const, label: t('settings.invite'), icon: Gift },
  { id: 'workspace' as const, label: '知识与工具', icon: BookOpen },
  { id: 'teams' as const, label: '团队空间', icon: Users },
  { id: 'support' as const, label: '帮助与客服', icon: LifeBuoy },
  { id: 'account' as const, label: t('settings.account'), icon: UserRound },
])

function applyTheme() {
  document.documentElement.dataset.studioTheme = settings.appearance === '浅色' ? 'light' : settings.appearance === '深色' ? 'dark' : window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  locale.value = settings.language
  document.documentElement.lang = settings.language
}

watch(() => [settings.appearance, settings.language], applyTheme, { immediate: true })
let settingsTimer = 0
watch(settings, () => {
  writeStoredSettings({ ...settings, redeemCode: '' })
  if (!settingsHydrated.value) return
  window.clearTimeout(settingsTimer)
  settingsTimer = window.setTimeout(() => { void saveSettings(false) }, 450)
}, { deep: true })
watch(() => props.activeMode, async () => {
  closeConversationMenu()
  mobileOpen.value = false
  accountOpen.value = false
  chatActionsOpen.value = false
  await nextTick()
  workspaceMain.value?.scrollTo({ top: 0, left: 0, behavior: 'auto' })
})
watch(() => route.fullPath, closeConversationMenu)
onMounted(async () => {
  document.body.classList.add('has-workspace')
  document.addEventListener('pointerdown', handleConversationMenuOutside)
  document.addEventListener('keydown', handleConversationMenuKeydown)
  window.addEventListener('resize', closeConversationMenu)
  try {
    await auth.refresh()
    await loadWorkspaceData()
  } finally {
    workspaceDataLoaded.value = true
    settingsHydrated.value = true
  }
  const requestedSection = String(route.query.settings || '') as SettingsSection
  if (settingsNav.value.some((item) => item.id === requestedSection)) openSettings(requestedSection)
})
onUnmounted(() => {
  document.body.classList.remove('has-workspace')
  document.removeEventListener('pointerdown', handleConversationMenuOutside)
  document.removeEventListener('keydown', handleConversationMenuKeydown)
  window.removeEventListener('resize', closeConversationMenu)
  window.clearTimeout(paymentPollTimer)
})

function openSettings(section: SettingsSection) {
  document.dispatchEvent(new Event('xinyue:close-popovers'))
  settingsSection.value = section
  settingsOpen.value = true
  accountOpen.value = false
  mobileOpen.value = false
  scrollActiveSetting('auto')
}

function openUpgrade() {
  document.dispatchEvent(new Event('xinyue:close-popovers'))
  upgradeOpen.value = true
  pricingMode.value = 'personal'
  settingsOpen.value = false
  accountOpen.value = false
  chatActionsOpen.value = false
}

function openTeamSettings() {
  upgradeOpen.value = false
  openSettings('teams')
}

function selectSettingsSection(section: SettingsSection) {
  settingsSection.value = section
  scrollActiveSetting('smooth')
}

function scrollActiveSetting(behavior: ScrollBehavior) {
  if (!window.matchMedia('(max-width: 640px)').matches) return
  void nextTick(() => settingsNavElement.value?.querySelector<HTMLElement>(`[data-section="${settingsSection.value}"]`)?.scrollIntoView({ behavior, block: 'nearest', inline: 'nearest' }))
}

function handleNav(mode: StudioMode) {
  mobileOpen.value = false
  if (mode === 'chat') studio.newConversation(settings.temporaryChatDefault || !settings.chatHistoryEnabled)
}

function handleNavLink(event: MouseEvent, item: WorkspaceNavItem) {
  if (item.external) return
  event.preventDefault()
  handleNav(item.mode)
  void router.push(item.to)
}

function settingsPayload() {
  return {
    appearance: settings.appearance === '浅色' ? 'light' : settings.appearance === '跟随系统' ? 'system' : 'dark', language: settings.language,
    responseStyle: settings.style, responseDetail: settings.detail, replyLanguage: settings.replyLanguage,
    customInstructions: settings.customInstructions, nickname: settings.nickname, occupation: settings.occupation,
    bio: settings.bio, useMemory: settings.useMemory, referenceChats: settings.referenceChats, notifications: settings.notifications,
    chatHistoryEnabled: settings.chatHistoryEnabled, trainingOptOut: settings.trainingOptOut, temporaryChatDefault: settings.temporaryChatDefault,
    dataRetentionDays: settings.dataRetentionDays, shareUsageAnalytics: settings.shareUsageAnalytics,
  }
}

async function saveSettings(showFeedback = false) {
  writeStoredSettings({ ...settings, redeemCode: '' })
  if (auth.session?.id) {
    try { await api('/users/me/settings', { method: 'PATCH', body: JSON.stringify(settingsPayload()) }); if (showFeedback) settingsMessage.value = '已保存' }
    catch { if (showFeedback) settingsMessage.value = '保存失败，请稍后重试' }
  } else if (showFeedback) settingsMessage.value = '已保存到此设备'
}

async function loadWorkspaceData() {
  const [catalogSettings, links] = await Promise.all([
    catalog.load(),
    api<ExternalNavLinkItem[]>('/catalog/external-links').catch(() => []),
  ])
  Object.assign(publicSettings, catalogSettings)
  externalLinks.value = links
  if (!auth.session?.id) return
  const [, user, notices, models, subscription] = await Promise.all([
    studio.hydrateWorkspace().catch(() => undefined),
    api<UserResponse>('/users/me').catch(() => null), api<NotificationItem[]>('/notifications').catch(() => []),
    api<AvailableModel[]>('/catalog/models').catch(() => []),
    api<Subscription | null>('/subscriptions/me').catch(() => null),
  ])
  if (user?.settings) {
    hydrateSettings(user.settings)
    const pending = storedSettings.pendingServerSync
    if (pending?.changedAt && Date.now() - pending.changedAt < 5 * 60 * 1000) {
      if (pending.appearance) settings.appearance = pending.appearance === 'light' ? '浅色' : pending.appearance === 'system' ? '跟随系统' : '深色'
      if (pending.language) settings.language = pending.language
      await api('/users/me/settings', { method: 'PATCH', body: JSON.stringify(settingsPayload()) }).then(() => {
        updateStoredSettings((current) => current.pendingServerSync?.changedAt === pending.changedAt
          ? { ...current, pendingServerSync: undefined }
          : current)
      }).catch(() => undefined)
    }
  }
  notifications.value = notices
  availableModels.value = models
  currentSubscription.value = subscription
  workspaceAssets.value = studio.assets.map((asset) => ({ id: asset.id, name: asset.title }))
  window.setTimeout(() => { void loadDeferredWorkspaceData() }, 200)
}

let deferredWorkspacePromise: Promise<void> | null = null
let deferredWorkspaceLoaded = false
function loadDeferredWorkspaceData() {
  if (deferredWorkspaceLoaded) return Promise.resolve()
  if (deferredWorkspacePromise) return deferredWorkspacePromise
  deferredWorkspacePromise = (async () => {
    const [ledger, invite, credentials, packages, orders, modelPolicy, plans, planOrders, methods, teamRows, knowledgeRows, tools, assistantRows, approvalRows] = await Promise.all([
      api<CreditEntry[]>('/credits/ledger?take=30').catch(() => []),
      api<InviteInfo>('/invites/me').catch(() => null),
      api<ApiCredential[]>('/users/me/api-credentials').catch(() => []),
      api<RechargePackage[]>('/catalog/recharge-packages').catch(() => []),
      api<RechargeOrder[]>('/recharge/orders').catch(() => []),
      api<{ allowUserByok: boolean }>('/users/me/model-policy').catch(() => null),
      api<SubscriptionPlan[]>('/subscriptions/plans').catch(() => []),
      api<SubscriptionOrder[]>('/subscriptions/orders').catch(() => []),
      api<PaymentChannel[]>('/payments/methods').catch(() => []), api<Team[]>('/teams').catch(() => []),
      api<KnowledgeBase[]>('/knowledge-bases').catch(() => []),
      api<AssistantToolBinding['tool'][]>('/assistants/tools').catch(() => []), api<{ id: string; name: string; tools: { toolId: string }[] }[]>('/assistants').catch(() => []),
      api<typeof toolApprovals.value>('/tool-approvals').catch(() => []),
    ])
  creditLedger.value = ledger
  if (invite) Object.assign(inviteInfo, invite)
  apiCredentials.value = credentials
  rechargePackages.value = packages
  rechargeOrders.value = orders
  subscriptionPlans.value = plans
  subscriptionOrders.value = planOrders
  paymentChannels.value = methods
  teams.value = teamRows
  knowledgeBases.value = knowledgeRows
  workspaceAssets.value = studio.assets.map((asset) => ({ id: asset.id, name: asset.title }))
  workspaceTools.value = tools
  workspaceAssistants.value = assistantRows
  toolApprovals.value = approvalRows
  if (modelPolicy) publicSettings.userByokEnabled = modelPolicy.allowUserByok
    deferredWorkspaceLoaded = true
  })().finally(() => { deferredWorkspacePromise = null })
  return deferredWorkspacePromise
}

function formatMoney(cents: number) { return new Intl.NumberFormat(settings.language, { style: 'currency', currency: publicSettings.currency }).format(cents / 100) }
async function createTeam() {
  if (!teamDraft.name.trim()) return
  teamBusy.value = true; teamMessage.value = ''; teamError.value = false
  try { await api('/teams', { method: 'POST', body: JSON.stringify(teamDraft) }); teamDraft.name = ''; teamDraft.description = ''; teams.value = await api<Team[]>('/teams'); teamMessage.value = '团队已创建' }
  catch (reason) { teamError.value = true; teamMessage.value = reason instanceof Error ? reason.message : '团队创建失败' }
  finally { teamBusy.value = false }
}
async function inviteToTeam(teamId: string) {
  if (!teamInviteEmail.value.trim()) return
  teamBusy.value = true; teamMessage.value = ''; teamError.value = false
  try { await api(`/teams/${teamId}/members`, { method: 'POST', body: JSON.stringify({ email: teamInviteEmail.value, role: teamInviteRole.value }) }); teamInviteEmail.value = ''; teamInviteRole.value = 'MEMBER'; teamInviteId.value = ''; teams.value = await api<Team[]>('/teams'); teamMessage.value = '成员已加入团队' }
  catch (reason) { teamError.value = true; teamMessage.value = reason instanceof Error ? reason.message : '成员添加失败' }
  finally { teamBusy.value = false }
}
async function removeTeamMember(teamId: string, userId: string) {
  if (!window.confirm('确认从团队中移除该成员？')) return
  try { await api(`/teams/${teamId}/members/${userId}`, { method: 'DELETE' }); teams.value = await api<Team[]>('/teams'); teamMessage.value = '成员已移除'; teamError.value = false }
  catch (reason) { teamError.value = true; teamMessage.value = reason instanceof Error ? reason.message : '移除成员失败' }
}
async function updateTeamMemberRole(teamId: string, userId: string, role: string) {
  teamBusy.value = true; teamMessage.value = ''; teamError.value = false
  try { await api(`/teams/${teamId}/members/${userId}`, { method: 'PATCH', body: JSON.stringify({ role }) }); teams.value = await api<Team[]>('/teams'); teamMessage.value = '成员角色已更新' }
  catch (reason) { teamError.value = true; teamMessage.value = reason instanceof Error ? reason.message : '角色更新失败'; teams.value = await api<Team[]>('/teams').catch(() => teams.value) }
  finally { teamBusy.value = false }
}
async function editTeam(team: Team) {
  const name = window.prompt('团队名称', team.name)?.trim()
  if (!name) return
  const description = window.prompt('团队说明', team.description)?.trim() ?? team.description
  teamBusy.value = true; teamMessage.value = ''; teamError.value = false
  try { await api(`/teams/${team.id}`, { method: 'PATCH', body: JSON.stringify({ name, description }) }); teams.value = await api<Team[]>('/teams'); teamMessage.value = '团队资料已更新' }
  catch (reason) { teamError.value = true; teamMessage.value = reason instanceof Error ? reason.message : '团队更新失败' }
  finally { teamBusy.value = false }
}
async function leaveTeam(team: Team) {
  if (!window.confirm(`确认退出“${team.name}”？`)) return
  try { await api(`/teams/${team.id}/leave`, { method: 'POST' }); teams.value = await api<Team[]>('/teams'); teamMessage.value = '已退出团队'; teamError.value = false }
  catch (reason) { teamError.value = true; teamMessage.value = reason instanceof Error ? reason.message : '退出团队失败' }
}
async function deleteTeam(team: Team) {
  if (!window.confirm(`永久删除“${team.name}”及其成员关系？`)) return
  try { await api(`/teams/${team.id}`, { method: 'DELETE' }); teams.value = await api<Team[]>('/teams'); teamMessage.value = '团队已删除'; teamError.value = false }
  catch (reason) { teamError.value = true; teamMessage.value = reason instanceof Error ? reason.message : '团队删除失败' }
}
async function reloadKnowledgeBases() { knowledgeBases.value = await api<KnowledgeBase[]>('/knowledge-bases') }
async function createKnowledgeBase() {
  if (!knowledgeDraft.name.trim()) return
  workspaceBusy.value = true; workspaceMessage.value = ''; workspaceError.value = false
  try { await api('/knowledge-bases', { method: 'POST', body: JSON.stringify(knowledgeDraft) }); knowledgeDraft.name = ''; knowledgeDraft.description = ''; await reloadKnowledgeBases(); workspaceMessage.value = '知识库已创建' }
  catch (reason) { workspaceError.value = true; workspaceMessage.value = reason instanceof Error ? reason.message : '知识库创建失败' }
  finally { workspaceBusy.value = false }
}
async function editKnowledgeBase(item: KnowledgeBase) {
  const name = window.prompt('知识库名称', item.name)?.trim()
  if (!name) return
  const description = window.prompt('知识库说明', item.description)?.trim() ?? item.description
  workspaceBusy.value = true
  try { await api(`/knowledge-bases/${item.id}`, { method: 'PATCH', body: JSON.stringify({ name, description }) }); await reloadKnowledgeBases(); workspaceMessage.value = '知识库已更新'; workspaceError.value = false }
  catch (reason) { workspaceError.value = true; workspaceMessage.value = reason instanceof Error ? reason.message : '知识库更新失败' }
  finally { workspaceBusy.value = false }
}
async function deleteKnowledgeBase(item: KnowledgeBase) {
  if (!window.confirm(`永久删除知识库“${item.name}”？文件本身不会被删除。`)) return
  workspaceBusy.value = true
  try { await api(`/knowledge-bases/${item.id}`, { method: 'DELETE' }); await reloadKnowledgeBases(); workspaceMessage.value = '知识库已删除'; workspaceError.value = false }
  catch (reason) { workspaceError.value = true; workspaceMessage.value = reason instanceof Error ? reason.message : '知识库删除失败' }
  finally { workspaceBusy.value = false }
}
function availableKnowledgeAssets(item: KnowledgeBase) {
  const attached = new Set(item.assets.map((entry) => entry.assetId))
  return workspaceAssets.value.filter((asset) => !attached.has(asset.id))
}
async function attachKnowledgeAsset(knowledgeBaseId: string) {
  const assetId = knowledgeAssetSelection[knowledgeBaseId]
  if (!assetId) return
  workspaceBusy.value = true
  try { await api(`/knowledge-bases/${knowledgeBaseId}/assets`, { method: 'POST', body: JSON.stringify({ assetId }) }); knowledgeAssetSelection[knowledgeBaseId] = ''; await reloadKnowledgeBases(); workspaceMessage.value = '文件已加入知识库'; workspaceError.value = false }
  catch (reason) { workspaceError.value = true; workspaceMessage.value = reason instanceof Error ? reason.message : '文件添加失败' }
  finally { workspaceBusy.value = false }
}
async function detachKnowledgeAsset(knowledgeBaseId: string, assetId: string) {
  workspaceBusy.value = true
  try { await api(`/knowledge-bases/${knowledgeBaseId}/assets/${assetId}`, { method: 'DELETE' }); await reloadKnowledgeBases(); workspaceMessage.value = '文件已从知识库移除'; workspaceError.value = false }
  catch (reason) { workspaceError.value = true; workspaceMessage.value = reason instanceof Error ? reason.message : '文件移除失败' }
  finally { workspaceBusy.value = false }
}
function toolApprovalText(binding: AssistantToolBinding) {
  if (!binding.tool.requiresApproval) return '可直接使用'
  return ({ PENDING: '等待审批', APPROVED: binding.approval?.expiresAt ? `已批准至 ${formatServerDate(binding.approval.expiresAt)}` : '已批准', REJECTED: '已拒绝' } as Record<string, string>)[binding.approval?.status || ''] || '未申请'
}
async function requestToolApproval(binding: AssistantToolBinding) {
  const reason = window.prompt(`申请“${binding.tool.name}”权限的用途说明`, '')?.trim()
  if (reason === undefined) return
  workspaceBusy.value = true
  try { await api(`/assistants/${binding.assistant.id}/tools/${binding.tool.id}/approval-requests`, { method: 'POST', body: JSON.stringify({ reason }) }); toolApprovals.value = await api<typeof toolApprovals.value>('/tool-approvals'); workspaceMessage.value = '审批申请已提交'; workspaceError.value = false }
  catch (error) { workspaceError.value = true; workspaceMessage.value = error instanceof Error ? error.message : '审批申请提交失败' }
  finally { workspaceBusy.value = false }
}
async function cancelToolApproval(binding: AssistantToolBinding) {
  if (!binding.approval?.id || !window.confirm('撤回这条待审批申请？')) return
  workspaceBusy.value = true
  try { await api(`/tool-approvals/${binding.approval.id}`, { method: 'DELETE' }); toolApprovals.value = await api<typeof toolApprovals.value>('/tool-approvals'); workspaceMessage.value = '审批申请已撤回'; workspaceError.value = false }
  catch (error) { workspaceError.value = true; workspaceMessage.value = error instanceof Error ? error.message : '审批申请撤回失败' }
  finally { workspaceBusy.value = false }
}
async function startTrial(planId?: string) {
  planBusy.value = true; planMessage.value = ''; planError.value = false
  try { currentSubscription.value = await api<Subscription>('/subscriptions/trial', { method: 'POST', body: JSON.stringify(planId ? { planId } : {}) }); planMessage.value = '免费试用已生效'; await studio.refreshCredits() }
  catch (reason) { planError.value = true; planMessage.value = reason instanceof Error ? reason.message : '试用领取失败' }
  finally { planBusy.value = false }
}
async function purchasePlan(plan: SubscriptionPlan) {
  if (!plan.priceCents) { if (plan.trialDays) await startTrial(plan.id); return }
  await openPayment({ orderType: 'SUBSCRIPTION', productId: plan.id, productName: `${plan.name}套餐`, amountCents: plan.priceCents })
}
async function purchaseUpgradePlan(plan: SubscriptionPlan) {
  if (!plan.priceCents && plan.trialDays) {
    await startTrial(plan.id)
    if (!planError.value) upgradeOpen.value = false
    return
  }
  upgradeOpen.value = false
  await purchasePlan(plan)
}
async function cancelSubscription() {
  if (!currentSubscription.value || !window.confirm('确认取消当前套餐？')) return
  planBusy.value = true; planMessage.value = ''; planError.value = false
  try { const updated = await api<Subscription & { status: string }>('/subscriptions/cancel', { method: 'POST', body: '{}' }); currentSubscription.value = ['ACTIVE', 'TRIALING'].includes(updated.status) ? updated : null; planMessage.value = updated.cancelAtPeriodEnd ? '已关闭自动续订' : '套餐已取消' }
  catch (reason) { planError.value = true; planMessage.value = reason instanceof Error ? reason.message : '取消失败' }
  finally { planBusy.value = false }
}
async function createRechargeOrder(item: RechargePackage) {
  await openPayment({ orderType: 'RECHARGE', productId: item.id, productName: item.name, amountCents: item.priceCents })
}

async function openPayment(intent: PaymentIntent) {
  paymentIntent.value = intent; paymentTransaction.value = null; paymentError.value = ''
  if (!paymentChannels.value.length) paymentChannels.value = await api<PaymentChannel[]>('/payments/methods').catch(() => [])
  const preferred = paymentChannels.value.find((item) => item.isDefault && item.minAmountCents <= intent.amountCents && (!item.maxAmountCents || item.maxAmountCents >= intent.amountCents)) || paymentChannels.value.find((item) => item.minAmountCents <= intent.amountCents && (!item.maxAmountCents || item.maxAmountCents >= intent.amountCents))
  selectedPaymentChannelId.value = preferred?.id || ''
  selectedPaymentMethod.value = preferred?.supportedMethods[0] || ''
}

function selectPaymentChannel(channel: PaymentChannel) { selectedPaymentChannelId.value = channel.id; if (!selectedPaymentMethod.value || !channel.supportedMethods.includes(selectedPaymentMethod.value)) selectedPaymentMethod.value = channel.supportedMethods[0] || '' }
function closePayment() { window.clearTimeout(paymentPollTimer); paymentIntent.value = null; paymentTransaction.value = null; paymentError.value = '' }

async function confirmCheckout() {
  const intent = paymentIntent.value, channel = selectedPaymentChannel.value
  if (!intent || !channel || !selectedPaymentMethod.value) return
  paymentBusy.value = true; paymentError.value = ''
  const paymentWindow = channel.providerKey === 'MANUAL' ? null : window.open('', '_blank')
  try {
    const order = intent.orderType === 'SUBSCRIPTION'
      ? await api<{ id: string }>('/subscriptions/orders', { method: 'POST', body: JSON.stringify({ planId: intent.productId, paymentMethod: selectedPaymentMethod.value }) })
      : await api<{ id: string }>('/recharge/orders', { method: 'POST', body: JSON.stringify({ packageId: intent.productId, paymentMethod: selectedPaymentMethod.value }) })
    paymentTransaction.value = await api<PaymentTransaction>('/payments/checkout', { method: 'POST', body: JSON.stringify({ orderType: intent.orderType, orderId: order.id, channelId: channel.id, paymentMethod: selectedPaymentMethod.value }) })
    if (paymentTransaction.value.checkoutUrl && paymentWindow) paymentWindow.location.href = paymentTransaction.value.checkoutUrl
    else paymentWindow?.close()
    await refreshOrderHistory(intent.orderType)
    schedulePaymentPoll()
  } catch (reason) { paymentWindow?.close(); paymentError.value = reason instanceof Error ? reason.message : '支付订单创建失败' }
  finally { paymentBusy.value = false }
}

async function refreshPaymentStatus() {
  if (!paymentTransaction.value) return
  paymentBusy.value = true
  try {
    paymentTransaction.value = await api<PaymentTransaction>(`/payments/transactions/${paymentTransaction.value.id}`)
    if (paymentTransaction.value.status === 'COMPLETED' && paymentIntent.value) { await refreshOrderHistory(paymentIntent.value.orderType); await studio.refreshCredits(); currentSubscription.value = await api<Subscription | null>('/subscriptions/me').catch(() => currentSubscription.value) }
    if (paymentTransaction.value.status === 'FAILED') paymentError.value = paymentTransaction.value.failureReason || '交易处理失败，请联系管理员'
  } catch (reason) { paymentError.value = reason instanceof Error ? reason.message : '交易状态查询失败' }
  finally { paymentBusy.value = false }
}

function schedulePaymentPoll() {
  window.clearTimeout(paymentPollTimer)
  if (!paymentTransaction.value || ['COMPLETED', 'FAILED', 'CANCELLED', 'EXPIRED', 'REFUNDED'].includes(paymentTransaction.value.status)) return
  paymentPollTimer = window.setTimeout(async () => { await refreshPaymentStatus(); schedulePaymentPoll() }, 3000)
}

async function refreshOrderHistory(orderType: PaymentIntent['orderType']) {
  if (orderType === 'SUBSCRIPTION') subscriptionOrders.value = await api<SubscriptionOrder[]>('/subscriptions/orders').catch(() => subscriptionOrders.value)
  else rechargeOrders.value = await api<RechargeOrder[]>('/recharge/orders').catch(() => rechargeOrders.value)
}

function openCredentialEditor(item?: ApiCredential) {
  credentialError.value = ''
  credentialEditor.value = item ? { ...item, apiKey: '' } : { name: '', providerType: 'NEW_API', baseUrl: '', apiKey: '', apiKeyHint: '', authType: 'BEARER', enabled: true, isDefault: apiCredentials.value.length === 0 }
}

async function saveCredential() {
  if (!credentialEditor.value) return
  credentialSaving.value = true; credentialError.value = ''
  try {
    const { id, apiKeyHint: _hint, ...payload } = credentialEditor.value
    if (!payload.apiKey) delete (payload as Partial<CredentialEditor>).apiKey
    await api(id ? `/users/me/api-credentials/${id}` : '/users/me/api-credentials', { method: id ? 'PATCH' : 'POST', body: JSON.stringify(payload) })
    credentialEditor.value = null
    apiCredentials.value = await api<ApiCredential[]>('/users/me/api-credentials')
  } catch (reason) { credentialError.value = reason instanceof Error ? reason.message : 'API 密钥保存失败' }
  finally { credentialSaving.value = false }
}

async function deleteCredential(item: ApiCredential) {
  if (!window.confirm(`确认删除“${item.name}”？`)) return
  await api(`/users/me/api-credentials/${item.id}`, { method: 'DELETE' }).catch(() => undefined)
  apiCredentials.value = await api<ApiCredential[]>('/users/me/api-credentials').catch(() => apiCredentials.value.filter((entry) => entry.id !== item.id))
}

function hydrateSettings(value: UserSettingsResponse) {
  settings.appearance = value.appearance === 'light' ? '浅色' : value.appearance === 'system' ? '跟随系统' : '深色'
  settings.language = value.language || 'zh-CN'
  settings.style = value.responseStyle === 'default' ? '默认' : value.responseStyle || settings.style
  settings.detail = value.responseDetail === 'auto' ? '自动判断' : value.responseDetail || settings.detail
  settings.replyLanguage = value.replyLanguage === 'follow' ? '跟随对话' : value.replyLanguage || settings.replyLanguage
  settings.customInstructions = value.customInstructions || ''
  settings.nickname = value.nickname || ''
  settings.occupation = value.occupation || ''
  settings.bio = value.bio || ''
  settings.useMemory = value.useMemory ?? settings.useMemory
  settings.referenceChats = value.referenceChats ?? settings.referenceChats
  settings.notifications = value.notifications ?? settings.notifications
  settings.chatHistoryEnabled = value.chatHistoryEnabled ?? settings.chatHistoryEnabled
  settings.trainingOptOut = value.trainingOptOut ?? settings.trainingOptOut
  settings.temporaryChatDefault = value.temporaryChatDefault ?? settings.temporaryChatDefault
  settings.dataRetentionDays = value.dataRetentionDays ?? settings.dataRetentionDays
  settings.shareUsageAnalytics = value.shareUsageAnalytics ?? settings.shareUsageAnalytics
  if (!studio.currentConversationId) studio.temporaryChat = settings.temporaryChatDefault || !settings.chatHistoryEnabled
}

async function markAllRead() {
  if (!unreadCount.value) return
  await api('/notifications/read-all', { method: 'POST' }).catch(() => undefined)
  const now = new Date().toISOString()
  notifications.value = notifications.value.map((item) => ({ ...item, readAt: item.readAt || now }))
}

async function redeemCredits() {
  if (!settings.redeemCode.trim()) return
  redeeming.value = true; redeemMessage.value = ''; redeemError.value = false
  try {
    const result = await api<{ redeemed: boolean; credits?: number }>('/credits/redeem', { method: 'POST', body: JSON.stringify({ code: settings.redeemCode }) })
    if (!result.redeemed) { redeemError.value = true; redeemMessage.value = '兑换码无效或已失效'; return }
    studio.credits += result.credits || 0; redeemMessage.value = `兑换成功，已增加 ${result.credits || 0} 创作点`; settings.redeemCode = ''
    await loadWorkspaceData()
  } catch { redeemError.value = true; redeemMessage.value = '兑换失败，请稍后重试' }
  finally { redeeming.value = false }
}

function copyInvite() {
  if (!inviteInfo.url) return
  navigator.clipboard?.writeText(inviteInfo.url).catch(() => undefined)
  inviteCopied.value = true
  window.setTimeout(() => { inviteCopied.value = false }, 1600)
}

function closeConversationMenu() { conversationMenuId.value = '' }

function openConversationMenu(event: MouseEvent, conversation: ConversationSummary) {
  if (conversationMenuId.value === conversation.id) {
    closeConversationMenu()
    return
  }
  const trigger = event.currentTarget as HTMLElement
  const rect = trigger.getBoundingClientRect()
  const menuWidth = 144
  const menuHeight = 200
  const viewportGap = 8
  const fitsBelow = rect.bottom + menuHeight - 4 <= window.innerHeight - viewportGap
  conversationMenuPosition.left = Math.min(window.innerWidth - menuWidth - viewportGap, Math.max(viewportGap, rect.left - 8))
  conversationMenuPosition.top = fitsBelow
    ? rect.bottom - 4
    : Math.max(viewportGap, rect.top - menuHeight + 4)
  conversationMenuId.value = conversation.id
}

function handleConversationMenuOutside(event: PointerEvent) {
  if (!conversationMenuId.value || conversationMenuElement.value?.contains(event.target as Node)) return
  closeConversationMenu()
}

function handleConversationMenuKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') closeConversationMenu()
}

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value)
    return
  }
  const input = document.createElement('textarea')
  input.value = value
  input.style.position = 'fixed'
  input.style.opacity = '0'
  document.body.appendChild(input)
  input.select()
  document.execCommand('copy')
  input.remove()
}

async function shareConversation(conversation: ConversationSummary) {
  closeConversationMenu()
  conversationActionBusy.value = true
  try {
    const result = await api<{ token: string; sharedAt: string }>(`/conversations/${conversation.id}/share`, { method: 'POST' })
    conversation.sharedAt = Date.parse(result.sharedAt)
    await copyText(`${window.location.origin}/share/${result.token}`)
    message.success('共享链接已复制')
  } catch (reason) {
    message.error(reason instanceof Error ? reason.message : '创建共享链接失败')
  } finally {
    conversationActionBusy.value = false
  }
}

async function shareCurrentConversation() {
  if (!currentConversation.value) return
  chatActionsOpen.value = false
  await shareConversation(currentConversation.value)
}

async function toggleCurrentConversationPinned() {
  if (!currentConversation.value) return
  chatActionsOpen.value = false
  await toggleConversationPinned(currentConversation.value)
}

async function archiveCurrentConversation() {
  if (!currentConversation.value) return
  chatActionsOpen.value = false
  await archiveConversation(currentConversation.value.id)
}

async function deleteCurrentConversation() {
  if (!currentConversation.value) return
  chatActionsOpen.value = false
  await deleteConversation(currentConversation.value)
}

async function toggleConversationPinned(conversation: ConversationSummary) {
  closeConversationMenu()
  conversationActionBusy.value = true
  const pinned = !conversation.pinnedAt
  try {
    await studio.setConversationPinned(conversation.id, pinned)
    message.success(pinned ? '已置顶聊天' : '已取消置顶')
  } catch (reason) {
    message.error(reason instanceof Error ? reason.message : '置顶状态更新失败')
  } finally {
    conversationActionBusy.value = false
  }
}

async function openConversation(conversationId: string) {
  mobileOpen.value = false
  const loading = studio.openConversation(conversationId).catch(() => undefined)
  await router.push('/chat')
  await loading
  if (studio.currentConversationId === conversationId) void studio.resumeCurrentChat()
}
function startConversationRename(conversation: { id: string; title: string }) {
  closeConversationMenu()
  renamingConversationId.value = conversation.id
  conversationRename.value = conversation.title
}
function cancelConversationRename() {
  if (conversationRenameBusy.value) return
  renamingConversationId.value = ''
  conversationRename.value = ''
}
async function saveConversationRename(conversationId: string) {
  if (!conversationRename.value.trim() || conversationRenameBusy.value) return
  conversationRenameBusy.value = true
  try {
    await studio.renameConversation(conversationId, conversationRename.value)
    renamingConversationId.value = ''
    conversationRename.value = ''
    message.success('对话名称已更新')
  } catch (reason) {
    message.error(reason instanceof Error ? reason.message : '对话重命名失败')
  } finally {
    conversationRenameBusy.value = false
  }
}
async function archiveConversation(conversationId: string) {
  closeConversationMenu()
  try { await studio.archiveConversation(conversationId); message.success('对话已归档') }
  catch (reason) { message.error(reason instanceof Error ? reason.message : '归档失败') }
}
function downloadText(filename: string, content: string, type = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}
async function deleteConversation(conversation: { id: string; title: string }) {
  closeConversationMenu()
  if (!window.confirm(`永久删除“${conversation.title}”？此操作无法撤销。`)) return
  try { await studio.deleteConversation(conversation.id); message.success('对话已删除') }
  catch (reason) { message.error(reason instanceof Error ? reason.message : '对话删除失败') }
}
async function exportAccountData() {
  dataActionBusy.value = true; dataActionMessage.value = ''; dataActionError.value = false
  try {
    const payload = await api<Record<string, unknown>>('/conversations/export')
    downloadText(`flux-data-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(payload, null, 2), 'application/json;charset=utf-8')
    dataActionMessage.value = '账户数据已导出'
  } catch (reason) { dataActionError.value = true; dataActionMessage.value = reason instanceof Error ? reason.message : '数据导出失败' }
  finally { dataActionBusy.value = false }
}
async function clearConversationHistory() {
  if (!window.confirm('永久删除全部聊天记录？此操作无法撤销。')) return
  dataActionBusy.value = true; dataActionMessage.value = ''; dataActionError.value = false
  try { await studio.clearConversations(); dataActionMessage.value = '全部聊天记录已删除' }
  catch (reason) { dataActionError.value = true; dataActionMessage.value = reason instanceof Error ? reason.message : '聊天记录删除失败' }
  finally { dataActionBusy.value = false }
}
function formatServerDate(value: string) { return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) }

async function logout() {
  await auth.signOut()
  studio.clearWorkspace()
  accountOpen.value = false
  await router.push('/')
}

const externalIconMap: Record<string, Component> = { code: Code2, 'book-open': BookOpen, webhook: Webhook, 'key-round': KeyRound, 'life-buoy': LifeBuoy, 'external-link': ExternalLink }
const navItems = computed<WorkspaceNavItem[]>(() => [
  { key: 'chat', mode: 'chat', label: t('workspace.newChat'), icon: SquarePen, to: '/chat', external: false, openNewTab: false },
  ...(publicSettings.sidebarCreationEnabled ? [{ key: 'creation', mode: 'images' as const, activeModes: ['images', 'videos'] as StudioMode[], label: t('workspace.creation'), icon: ImageIcon, to: '/image', external: false, openNewTab: false }] : []),
  ...(publicSettings.sidebarCommerceEnabled ? [{ key: 'commerce', mode: 'commerce' as const, label: t('workspace.commerce'), icon: ShoppingBag, to: '/commerce', external: false, openNewTab: false }] : []),
  ...(publicSettings.sidebarOfficeEnabled ? [{ key: 'office', mode: 'office' as const, label: t('workspace.office'), icon: BriefcaseBusiness, to: '/office', external: false, openNewTab: false }] : []),
  ...(publicSettings.sidebarPromptsEnabled ? [{ key: 'prompts', mode: 'prompts' as const, label: t('workspace.prompts'), icon: LibraryBig, to: '/prompts', external: false, openNewTab: false }] : []),
  ...(publicSettings.sidebarPluginsEnabled ? [{ key: 'plugins', mode: 'plugins' as const, label: '能力中心', icon: Blocks, to: '/capabilities', external: false, openNewTab: false }] : []),
  ...(publicSettings.sidebarProjectsEnabled ? [{ key: 'projects', mode: 'projects' as const, label: t('workspace.projects'), icon: Folder, to: '/projects', external: false, openNewTab: false }] : []),
  ...(publicSettings.sidebarAssetsEnabled ? [{ key: 'assets', mode: 'assets' as const, label: t('workspace.assets'), icon: Files, to: '/files', external: false, openNewTab: false }] : []),
  ...externalLinks.value.map((item) => ({ key: `external-${item.key}`, mode: 'api' as const, label: item.name, icon: externalIconMap[item.icon] || ExternalLink, to: item.url, external: true, openNewTab: item.openNewTab })),
])
</script>
