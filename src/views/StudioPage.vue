<template>
    <section v-if="activeMode === 'chat'" :key="activeMode" class="studio-chat chat-page" :class="{ 'has-messages': hasChatThread, 'is-artifact-open': activeArtifact }">
      <div class="chat-dialog-pane">
      <header class="chat-page__header"><h1>{{ store.temporaryChat ? '' : 'Xinyue AI' }}</h1><div class="chat-page__header-actions"><button v-if="auth.isAuthenticated" class="temporary-chat-toggle" :class="{ active: store.temporaryChat }" type="button" :aria-pressed="store.temporaryChat" :title="store.temporaryChat ? '删除临时聊天并返回新对话' : '开启临时聊天'" @click="toggleTemporaryChat"><Trash2 v-if="store.temporaryChat" :size="15" /><Clock3 v-else :size="15" /><span>{{ store.temporaryChat ? '退出临时聊天' : '临时聊天' }}</span></button><div v-else-if="catalog.loginEnabled" class="chat-page__auth-actions"><RouterLink to="/login?redirect=/chat">登录</RouterLink><RouterLink v-if="catalog.registrationAvailable" class="is-primary" to="/login?redirect=/chat&amp;register=1">免费注册</RouterLink></div></div></header>
      <div v-if="store.lastError" class="studio-feedback" role="alert"><span>{{ store.lastError }}</span><button type="button" aria-label="关闭提示" @click="store.clearError"><X :size="15" /></button></div>
      <div v-if="store.conversationAuditReadOnly" class="project-audit-banner"><Eye :size="16" /><span>项目成员对话审计，只读查看成员提问及删除记录</span></div>

      <div class="chat-center" :class="{ 'chat-center--thread': hasChatThread }">
        <div v-if="!hasChatThread && store.temporaryChat" class="temporary-chat-intro"><h2>临时聊天</h2><p>这次聊天不会出现在历史记录中，也不会用于改进模型。</p></div>
        <h2 v-else-if="!hasChatThread">{{ t('studio.thought') }}</h2>
        <div v-else ref="thread" class="chat-thread" @scroll="syncMessageNavigator">
          <template v-for="entry in chatTimeline" :key="`${entry.kind}-${entry.id}`">
            <div v-if="entry.message" class="message-row" :class="[`message-row--${entry.message.role}`, { 'is-jump-highlight': jumpHighlightId === entry.message.id }]" :data-message-id="entry.message.id" :data-user-message="entry.message.role === 'user' ? 'true' : undefined">
              <form v-if="editingMessageId === entry.message.id" class="message-editor" @submit.prevent="saveMessageEdit(entry.message.id)">
                <textarea v-model="editingMessageContent" rows="3" maxlength="50000" aria-label="编辑消息" @keydown.esc="cancelMessageEdit" />
                <footer><button type="button" @click="cancelMessageEdit">取消</button><button type="submit" :disabled="!editingMessageContent.trim() || store.isGenerating">保存并提交</button></footer>
              </form>
              <template v-else>
                <article :class="[`message message--${entry.message.role}`, { 'is-soft-deleted': entry.message.deletedAt }]">
                  <header v-if="entry.message.author || entry.message.deletedAt" class="message-audit-meta"><span v-if="entry.message.author">{{ entry.message.author.displayName }}</span><em v-if="entry.message.deletedAt">成员已删除</em></header>
                  <ChatMessageContent v-if="entry.message.role === 'assistant'" :content="entry.message.content" @preview="openCodeArtifact" />
                  <template v-else>{{ entry.message.content }}</template>
                </article>
                <nav v-if="entry.message.id !== 'welcome'" class="message-actions" :aria-label="`${entry.message.role === 'user' ? '用户' : '助手'}消息操作`">
                  <button type="button" :title="copiedMessageId === entry.message.id ? '已复制' : '复制'" @click="copyMessage(entry.message)"><Check v-if="copiedMessageId === entry.message.id" :size="15" /><Copy v-else :size="15" /></button>
                  <button v-if="entry.message.canEdit" type="button" title="编辑消息" :disabled="store.isGenerating" @click="startMessageEdit(entry.message)"><Pencil :size="15" /></button>
                  <button v-if="entry.message.canDelete" type="button" title="删除提问" :disabled="store.isGenerating" @click="deleteProjectQuestion(entry.message)"><Trash2 :size="15" /></button>
                  <template v-else-if="!store.conversationAuditReadOnly">
                    <button v-if="entry.message.role === 'assistant'" type="button" title="导出为 Word" :disabled="Boolean(exportingMessage)" @click="exportChatAnswer(entry.message, 'docx')"><LoaderCircle v-if="exportingMessage === `${entry.message.id}:docx`" class="admin-spin" :size="15" /><FileType2 v-else :size="15" /></button>
                    <button v-if="entry.message.role === 'assistant'" type="button" title="导出为 Excel" :disabled="Boolean(exportingMessage)" @click="exportChatAnswer(entry.message, 'xlsx')"><LoaderCircle v-if="exportingMessage === `${entry.message.id}:xlsx`" class="admin-spin" :size="15" /><FileSpreadsheet v-else :size="15" /></button>
                    <button type="button" title="重新生成" :disabled="store.isGenerating" @click="retryAssistantMessage(entry.message.id)"><RefreshCw :size="15" /></button>
                    <button type="button" title="有帮助" :class="{ 'is-active': entry.message.feedback === 'UP' }" :aria-pressed="entry.message.feedback === 'UP'" @click="setMessageFeedback(entry.message.id, 'UP')"><ThumbsUp :size="15" /></button>
                    <button type="button" title="没有帮助" :class="{ 'is-active': entry.message.feedback === 'DOWN' }" :aria-pressed="entry.message.feedback === 'DOWN'" @click="setMessageFeedback(entry.message.id, 'DOWN')"><ThumbsDown :size="15" /></button>
                  </template>
                </nav>
              </template>
            </div>
            <section v-else-if="entry.generation" class="image-generation-response" :class="[`is-${entry.generation.status.toLowerCase()}`, { 'is-video-generation': entry.generation.mode === 'videos' }]" aria-live="polite">
              <template v-if="entry.generation.status === 'QUEUED' || entry.generation.status === 'RUNNING'">
                <header><LoaderCircle :size="18" /><strong>正在创建{{ entry.generation.mode === 'videos' ? '视频' : '图片' }}</strong><button type="button" class="image-generation-stop" :disabled="store.cancelingJobId === entry.generation.id" :aria-label="`停止${entry.generation.mode === 'videos' ? '视频' : '图片'}生成`" :title="`停止${entry.generation.mode === 'videos' ? '视频' : '图片'}生成`" @click="stopGeneration(entry.generation)"><LoaderCircle v-if="store.cancelingJobId === entry.generation.id" class="generation-stop-spin" :size="14" /><Square v-else :size="14" fill="currentColor" />{{ store.cancelingJobId === entry.generation.id ? '停止中' : '停止' }}</button></header>
                <div class="image-generation-stage"><span>正在创建{{ entry.generation.mode === 'videos' ? '视频' : '图片' }}</span><i aria-hidden="true" /></div>
              </template>
              <template v-else-if="entry.generation.status === 'SUCCEEDED'">
                <header><Check :size="18" /><strong>{{ entry.generation.mode === 'videos' ? '视频' : '图片' }}已生成</strong></header>
                <div class="image-generation-results">
                  <article v-for="asset in entry.generation.assets" :key="asset.id" class="image-generation-result" :class="{ 'image-generation-result--video': entry.generation.mode === 'videos' }">
                    <button v-if="entry.generation.mode === 'videos'" class="video-generation-preview" type="button" :title="`站内查看：${asset.title}`" @click="previewAsset = asset">
                      <video class="image-generation-result__video" :src="asset.contentUrl" muted preload="metadata" playsinline />
                      <span aria-hidden="true"><Play :size="17" fill="currentColor" /></span>
                    </button>
                    <button v-else class="image-generation-result__preview" type="button" :title="`站内查看：${asset.title}`" @click="previewAsset = asset"><img :src="asset.contentUrl" :alt="asset.title" /></button>
                    <nav v-if="entry.generation.mode === 'videos'" class="video-result-actions" aria-label="视频操作">
                      <button type="button" title="站内查看视频" @click="previewAsset = asset"><Maximize2 :size="16" /><span>查看</span></button>
                      <button type="button" title="下载视频" @click="downloadGeneratedAsset(asset)"><Download :size="16" /><span>下载</span></button>
                      <button type="button" title="重新生成视频" :disabled="store.isGenerating" @click="retryVideoGeneration(entry.generation)"><RefreshCw :size="15" /><span>重新生成</span></button>
                    </nav>
                    <nav v-else class="image-result-actions" aria-label="图片操作">
                      <button type="button" title="下载图片" aria-label="下载图片" @click="downloadGeneratedAsset(asset)"><Download :size="18" /></button>
                      <button type="button" title="用作参考" aria-label="用作参考" @click="useGeneratedAssetAsReference(asset, entry.generation)"><ImagePlus :size="18" /></button>
                    </nav>
                  </article>
                </div>
                <nav v-if="entry.generation.mode !== 'videos'" class="image-generation-actions" aria-label="生成结果操作">
                  <button type="button" :disabled="store.isGenerating" @click="retryImageGeneration(entry.generation)"><RefreshCw :size="15" /><span>重新生成</span></button>
                  <button v-if="entry.generation.assets[0]" type="button" @click="useGeneratedAssetAsReference(entry.generation.assets[0], entry.generation)"><ImagePlus :size="15" /><span>用作参考</span></button>
                </nav>
              </template>
              <template v-else>
                <div class="image-generation-failure">
                  <strong>{{ entry.generation.status === 'CANCELLED' ? `${entry.generation.mode === 'videos' ? '视频' : '图片'}生成已停止` : '生成失败，请调整内容后重试' }}</strong>
                  <p>{{ entry.generation.error || '任务未能完成，创作点已按规则退回。' }}</p>
                  <button type="button" :disabled="store.isGenerating" @click="entry.generation.mode === 'videos' ? retryVideoGeneration(entry.generation) : retryImageGeneration(entry.generation)"><RefreshCw :size="15" />重新生成</button>
                </div>
              </template>
            </section>
          </template>
          <article v-if="showChatThinking" class="message message--assistant message--thinking">{{ t('studio.thinking') }}</article>
        </div>

        <form v-if="!store.conversationAuditReadOnly" class="chat-composer" @submit.prevent="submitMessage">
          <div v-if="attachments.length" class="attachment-list" aria-label="待发送附件">
            <article v-for="(asset, index) in attachments" :key="asset.id" class="attachment-card" :class="hasImagePreview(asset) ? 'attachment-card--image' : 'attachment-card--file'">
              <img v-if="hasImagePreview(asset)" :src="asset.contentUrl" :alt="asset.title" />
              <div v-else class="attachment-file-copy">
                <span class="attachment-file-icon"><FileText :size="20" /></span>
                <span><strong :title="asset.title">{{ asset.title }}</strong><small>{{ attachmentMeta(asset) }}</small></span>
              </div>
              <button class="attachment-remove" type="button" :aria-label="`移除附件 ${asset.title}`" title="移除附件" @click="attachments.splice(index, 1)"><X :size="14" /></button>
            </article>
          </div>
          <button type="button" aria-label="添加文件等" title="添加文件等" :class="{ 'is-open': attachmentOpen }" :disabled="uploading" @click="toggleAttachmentMenu"><Plus :size="20" /></button>
          <textarea ref="composerInput" v-model="draft" rows="1" aria-label="消息" :placeholder="t('studio.messagePlaceholder')" @focus="collapseWorkspacePopovers" @input="resizeComposer" @keydown="handleComposerKeydown" />
          <div v-if="auth.isAuthenticated && assistants.length" class="composer-control composer-assistant">
            <button type="button" :class="{ 'is-active': assistantId }" :aria-label="`选择助手，当前为${selectedAssistant?.name || '默认助手'}`" @click="toggleComposerAssistants"><Bot :size="16" /><span>{{ selectedAssistant?.name || '助手' }}</span><ChevronDown :size="14" /></button>
            <div v-if="assistantMenuOpen" class="composer-popover assistant-popover">
              <header><span><strong>选择助手</strong><small>应用后台配置的指令、模型和工具</small></span></header>
              <button type="button" :class="{ 'is-active': !assistantId }" @click="clearAssistant"><span><strong>默认助手</strong><small>使用当前模型直接对话</small></span><Check v-if="!assistantId" :size="15" /></button>
              <button v-for="item in assistants" :key="item.id" type="button" :class="{ 'is-active': assistantId === item.id }" @click="selectAssistant(item)"><span><strong>{{ item.name }}</strong><small>{{ item.description || '管理员配置的专属工作助手' }}</small></span><Check v-if="assistantId === item.id" :size="15" /></button>
            </div>
          </div>
          <PluginSelector v-if="auth.isAuthenticated" v-model="chatPluginId" capability="CHAT" compact />
          <div class="composer-control composer-model">
            <button type="button" :aria-label="`选择模型，当前为${model}`" :title="`模型：${model}`" @click="toggleModelMenu">
              <span>{{ model }}</span><ChevronDown :size="15" />
            </button>
            <div v-if="modelOpen" class="composer-popover model-popover">
              <strong>{{ t('studio.model') }}</strong>
              <button v-for="item in chatModels" :key="item.key" type="button" :class="{ 'is-active': item.displayName === model }" @click="selectModel(item.displayName)">
                <span><strong>{{ item.displayName }}<em v-if="item.badge">{{ item.badge }}</em></strong><small v-if="modelSubtitle(item)">{{ modelSubtitle(item) }}</small></span>
                <span class="model-option-meta"><b v-if="modelCost(item)"><Sparkles :size="11" />{{ modelCost(item) }}</b><Check v-if="item.displayName === model" :size="15" /></span>
              </button>
            </div>
          </div>
          <button class="composer-agent-mode" type="button" :class="{ 'is-active': agentMode }" :aria-label="agentMode ? '关闭 Agent 模式' : '开启 Agent 模式'" :aria-pressed="agentMode" title="Agent 模式：开启后 AI 可自动调用工具" @click="agentMode = !agentMode"><Zap :size="15" /><span>Agent</span></button>
          <button class="composer-voice" :class="{ 'is-listening': voiceListening && voiceTarget === 'chat' }" type="button" :aria-label="voiceListening && voiceTarget === 'chat' ? '停止语音输入' : '开始语音输入'" :aria-pressed="voiceListening && voiceTarget === 'chat'" :title="voiceListening && voiceTarget === 'chat' ? '停止语音输入' : '语音输入'" @click="toggleVoice('chat')"><Mic :size="17" /></button>
          <button :type="store.isGenerating ? 'button' : 'submit'" :aria-label="store.isGenerating ? '停止生成' : '发送'" :title="store.isGenerating ? '停止生成' : '发送，Enter'" :disabled="!store.isGenerating && !draft.trim() && !attachments.length" @click="store.isGenerating && store.cancelActiveJob()"><Square v-if="store.isGenerating" :size="14" fill="currentColor" /><ArrowUp v-else :size="20" /></button>
        </form>

        <Transition name="composer-menu">
          <div v-if="attachmentOpen" class="composer-attachment-panel" :class="{ 'is-library-panel': promptTemplatesOpen }">
            <section v-if="promptTemplatesOpen" class="prompt-template-picker" aria-label="提示词模板">
              <header><div class="prompt-template-heading"><span><FileText :size="17" /></span><div><strong>提示词模板</strong><small>{{ filteredPromptTemplates.length }} 个可用模板</small></div></div><button type="button" aria-label="关闭提示词模板" title="关闭" @click="promptTemplatesOpen = false; attachmentOpen = false"><X :size="16" /></button></header>
              <label class="prompt-template-search"><Search :size="15" /><input v-model.trim="promptTemplateQuery" placeholder="搜索模板" /></label>
              <nav v-if="promptTemplateCategories.length" class="prompt-template-categories" aria-label="模板分类"><button type="button" :class="{ 'is-active': !promptTemplateCategory }" @click="promptTemplateCategory = ''">全部</button><button v-for="item in promptTemplateCategories" :key="item" type="button" :class="{ 'is-active': promptTemplateCategory === item }" @click="promptTemplateCategory = item">{{ item }}</button></nav>
              <div class="prompt-template-list"><button v-for="item in filteredPromptTemplates" :key="item.id" type="button" class="prompt-template-option" @click="usePromptTemplate(item)"><span><strong>{{ item.title }}</strong><small>{{ item.description || item.prompt }}</small></span><span class="prompt-template-option-meta"><em>{{ item.category }}</em><ChevronRight :size="15" /></span></button><p v-if="!filteredPromptTemplates.length" class="prompt-template-empty"><FileText :size="22" /><strong>没有匹配的模板</strong></p></div>
            </section>
            <template v-else>
              <button type="button" @click="openFilePicker('chat-file')"><Paperclip :size="19" /><span><strong>添加照片和文件</strong></span></button>
              <button type="button" @click="attachmentOpen = false; router.push('/image')"><ImageIcon :size="20" /><span><strong>创建图片</strong><small>可视化呈现任何内容</small></span></button>
              <button type="button" @click="openPromptLibrary"><LibraryBig :size="19" /><span><strong>提示词库</strong><small>浏览图片提示词和参考效果</small></span></button>
              <button type="button" @click="togglePromptTemplates"><FileText :size="19" /><span><strong>提示词模板</strong><small>使用后台预设内容</small></span><LoaderCircle v-if="promptTemplatesLoading" class="admin-spin" :size="15" /></button>
            </template>
          </div>
        </Transition>
      </div>

      <aside v-if="messageJumps.length > 1" class="chat-message-navigator" :class="{ 'is-open': messageNavigatorOpen }" aria-label="已发送消息导航" @mouseenter="openMessageNavigator" @mouseleave="scheduleMessageNavigatorClose" @focusin="openMessageNavigator" @focusout="closeMessageNavigatorOnBlur">
        <button type="button" :aria-expanded="messageNavigatorOpen" aria-label="浏览已发送消息" title="浏览已发送消息" @click="openMessageNavigator">
          <span v-for="message in messageJumps.slice(0, 8)" :key="message.id" :class="{ active: activeMessageJumpId === message.id }" />
        </button>
        <section v-if="messageNavigatorOpen" class="chat-message-navigator__panel">
          <div>
            <button v-for="message in messageJumps" :key="message.id" type="button" :class="{ 'is-active': activeMessageJumpId === message.id }" :title="message.content" @click="jumpToMessage(message.id)">
              <strong>{{ compactMessageJump(message.content) }}</strong>
            </button>
          </div>
        </section>
      </aside>

      <footer v-if="store.temporaryChat" class="temporary-chat-retention">为保护安全，临时聊天会按管理员设置的保留期限自动删除。</footer>
      <footer v-else-if="!auth.isAuthenticated" class="chat-legal">Xinyue AI 是 AI 服务。使用即表示你同意我们的<RouterLink to="/terms">条款</RouterLink>和<RouterLink to="/privacy">隐私政策</RouterLink>。请勿分享敏感信息。<RouterLink to="/about">了解更多</RouterLink></footer>
      </div>
      <CodeArtifactPanel v-if="activeArtifact" :artifact="activeArtifact" @close="activeArtifact = null" />
    </section>

    <section v-else-if="activeMode === 'images' || activeMode === 'videos' || activeMode === 'commerce'" :key="activeMode" class="studio-create-page">
      <div class="create-page-inner">
        <div class="creation-heading">
          <h1>{{ activeMode === 'commerce' ? t('studio.commerce') : t('workspace.creation') }}</h1>
          <p>{{ activeMode === 'commerce' ? '从商品参考图到成套营销素材' : '让创作随灵感而生' }}</p>
        </div>
        <div v-if="store.lastError" class="studio-feedback studio-feedback--inline" role="alert"><span>{{ store.lastError }}</span><button type="button" aria-label="关闭提示" @click="store.clearError"><X :size="15" /></button></div>
        <form ref="creationComposer" class="creation-composer" :class="{ 'is-commerce': activeMode === 'commerce', 'is-video': activeMode === 'videos' }" @submit.prevent="submitGeneration">
          <div class="creation-prompt-row">
            <textarea ref="generationInput" v-model="generationPrompt" rows="2" :placeholder="creationPromptPlaceholder" @focus="collapseWorkspacePopovers" @input="resizeGenerationInput" />
          </div>
          <div v-if="creationAttachments.length || maskAttachment" class="creation-attachments" aria-label="参考素材">
            <article v-for="(asset, index) in creationAttachments" :key="asset.id" class="attachment-card" :class="hasImagePreview(asset) ? 'attachment-card--image' : 'attachment-card--file'">
              <img v-if="hasImagePreview(asset)" :src="asset.contentUrl" :alt="asset.title" />
              <div v-else class="attachment-file-copy">
                <span class="attachment-file-icon"><FileText :size="18" /></span>
                <span><strong :title="asset.title">{{ asset.title }}</strong><small>{{ attachmentMeta(asset) }}</small></span>
              </div>
              <button class="attachment-remove" type="button" :aria-label="`移除参考图片 ${asset.title}`" title="移除参考图片" @click="creationAttachments.splice(index, 1)"><X :size="13" /></button>
            </article>
            <article v-if="maskAttachment" class="attachment-card attachment-card--image attachment-card--mask">
              <img :src="maskAttachment.contentUrl" :alt="`蒙版：${maskAttachment.title}`" />
              <span class="attachment-mask-label">蒙版</span>
              <button class="attachment-remove" type="button" :aria-label="`移除蒙版 ${maskAttachment.title}`" title="移除蒙版" @click="maskAttachment = null"><X :size="13" /></button>
            </article>
          </div>
          <div class="creation-controls">
            <div class="creation-control-track">
              <button class="creation-add" type="button" aria-label="添加参考素材" title="添加参考素材" :disabled="uploading" @click="openFilePicker('creation')"><Plus :size="20" /></button>
              <i class="creation-control-divider" aria-hidden="true" />
              <div v-if="activeMode !== 'commerce'" class="creation-mode-switch" role="group" aria-label="创作类型">
                <button type="button" :class="{ 'is-active': activeMode === 'images' }" :aria-pressed="activeMode === 'images'" @click="switchCreationMode('images')">图片</button>
                <button type="button" :class="{ 'is-active': activeMode === 'videos' }" :aria-pressed="activeMode === 'videos'" @click="switchCreationMode('videos')">视频</button>
              </div>
              <div class="creation-option-buttons">
                <button type="button" :class="{ 'is-open': creationMenu === 'model' }" @click.stop="toggleCreationMenu('model', $event)"><Sparkles :size="16" /><span class="creation-control-label">模型</span>{{ activeCreationModel }}<ChevronDown class="creation-control-chevron" :size="14" /></button>
                <button v-if="activeMode === 'commerce'" type="button" :class="{ 'is-open': creationMenu === 'type' }" @click.stop="toggleCreationMenu('type', $event)"><Images :size="16" /><span class="creation-control-label">类型</span>{{ creationType }}<ChevronDown class="creation-control-chevron" :size="14" /></button>
                <button type="button" :class="{ 'is-open': creationMenu === (activeMode === 'images' ? 'size' : activeMode === 'videos' ? 'aspect' : 'platform') }" @click.stop="toggleCreationMenu(activeMode === 'images' ? 'size' : activeMode === 'videos' ? 'aspect' : 'platform', $event)"><SlidersHorizontal :size="16" /><span class="creation-control-label">{{ activeMode === 'commerce' ? '平台' : '比例' }}</span>{{ activeMode === 'videos' ? videoAspectRatio : activeMode === 'commerce' ? commercePlatform : autoMode }}<ChevronDown class="creation-control-chevron" :size="14" /></button>
                <button type="button" :class="{ 'is-open': creationMenu === (activeMode === 'images' ? 'style' : activeMode === 'videos' ? 'resolution' : 'modules') }" @click.stop="toggleCreationMenu(activeMode === 'images' ? 'style' : activeMode === 'videos' ? 'resolution' : 'modules', $event)"><Blend :size="16" /><span class="creation-control-label">{{ activeMode === 'videos' ? '画质' : '风格' }}</span><template v-if="activeMode === 'images'">{{ imageStyle }}</template><template v-else-if="activeMode === 'videos'">{{ videoResolution }}</template><template v-else>{{ commerceModules }} 模块</template><ChevronDown class="creation-control-chevron" :size="14" /></button>
              </div>
              <PluginSelector v-model="creationPluginId" v-model:open="creationPluginOpen" :capability="creationPluginCapability" compact />
              <div class="creation-more-wrap">
                <button ref="creationMoreTrigger" class="creation-more-button" :class="{ 'is-active': creationOptionsOpen }" type="button" aria-label="更多生成设置" title="更多设置" :aria-expanded="creationOptionsOpen" @click.stop="toggleMoreOptions"><Settings2 :size="17" /><span>更多</span><ChevronDown class="creation-control-chevron" :size="13" /></button>
                <Teleport to="body">
                <div v-if="creationOptionsOpen" ref="creationMorePanel" class="creation-more-panel creation-more-panel--floating" :style="creationMorePanelStyle" aria-label="更多生成设置">
                  <button v-if="activeMode === 'images' && activeImageCapabilities.supportsMask" type="button" :disabled="uploading" @click="openFilePicker('mask')"><Blend :size="16" />添加蒙版</button>
                  <button v-if="activeMode === 'images'" type="button" @click.stop="toggleCreationMenu('quality', $event)"><BadgeCheck :size="16" />{{ quality }}画质<ChevronDown :size="13" /></button>
                  <button v-if="activeMode === 'images'" type="button" @click.stop="toggleCreationMenu('count', $event)"><Layers3 :size="16" />{{ imageCount }} 张<ChevronDown :size="13" /></button>
                  <button v-if="activeMode === 'images'" type="button" @click.stop="toggleCreationMenu('format', $event)"><FileType2 :size="16" />{{ outputFormat }}<ChevronDown :size="13" /></button>
                  <button v-if="activeMode === 'images'" type="button" @click.stop="toggleCreationMenu('background', $event)"><ImageIcon :size="16" />{{ imageBackground }}<ChevronDown :size="13" /></button>
                  <button v-if="activeMode === 'videos'" type="button" @click.stop="toggleCreationMenu('duration', $event)"><Clock3 :size="16" />{{ videoDuration }} 秒<ChevronDown :size="13" /></button>
                  <button v-if="activeMode === 'commerce'" type="button" @click.stop="toggleCreationMenu('format', $event)"><FileType2 :size="16" />{{ outputFormat }}<ChevronDown :size="13" /></button>
                  <button v-if="activeMode === 'commerce'" type="button" @click.stop="toggleCreationMenu('background', $event)"><ImageIcon :size="16" />{{ imageBackground }}<ChevronDown :size="13" /></button>
                </div>
                </Teleport>
              </div>
              <span class="creation-cost" :title="`本次预计扣除 ${currentGenerationCost} 创作点`"><Sparkles :size="13" />{{ currentGenerationCost }} 点</span>
            </div>
            <button class="creation-submit" :class="{ 'is-listening': voiceListening && voiceTarget === 'creation' }" :type="canSubmitCreation ? 'submit' : 'button'" :aria-label="canSubmitCreation ? '开始生成' : voiceListening && voiceTarget === 'creation' ? '停止语音输入' : '语音输入'" @click="!canSubmitCreation && toggleVoice('creation')"><ArrowUp v-if="canSubmitCreation" :size="20" /><Mic v-else :size="19" /></button>
          </div>
          <Teleport to="body">
            <div v-if="creationMenu" ref="creationOptionsMenu" class="creation-options-menu creation-options-menu--floating" :class="`creation-options-menu--${creationMenu}`" :style="creationMenuStyle">
              <strong>{{ creationMenuTitle }}</strong>
              <div v-if="creationMenu === 'size'" class="creation-ratio-grid">
                <button v-for="option in creationMenuOptions" :key="option" type="button" :class="{ 'is-active': isCreationOptionActive(option) }" @click="selectCreationOption(option)"><span class="creation-ratio-shape" :class="ratioShapeClass(option)"><i /><i v-if="option === '自动'" /></span><span>{{ option }}</span></button>
              </div>
              <button v-else v-for="option in creationMenuOptions" :key="option" type="button" :class="{ 'is-active': isCreationOptionActive(option) }" @click="selectCreationOption(option)"><img v-if="creationMenu === 'style'" class="creation-style-thumb" :src="styleThumbnail(option)" alt="" /><span>{{ option }}<small v-if="creationOptionPrice(option)">{{ creationOptionPrice(option) }} 点</small></span><Check v-if="isCreationOptionActive(option)" :size="15" /></button>
            </div>
          </Teleport>
        </form>

        <section v-if="(activeMode === 'images' || activeMode === 'videos') && imageTools.length" class="creation-tools" aria-label="图片快捷工具">
          <button v-for="tool in imageTools" :key="tool.id" type="button" :class="{ 'is-active': selectedImageToolId === tool.id }" :aria-pressed="selectedImageToolId === tool.id" @click="selectImageTool(tool)">
            <span>{{ tool.title }}</span><img :src="tool.imageUrl" :alt="`${tool.title}示例`" />
          </button>
        </section>

        <section class="inspiration-section">
          <header>
            <h2>{{ activeMode === 'images' ? '生成图片' : activeMode === 'videos' ? '生成视频' : t('studio.inspiration') }}</h2>
            <nav class="inspiration-navigation" aria-label="浏览生成灵感">
              <button class="inspiration-arrow inspiration-arrow--previous" type="button" aria-label="上一组" title="上一组" :disabled="!canScrollInspirationPrevious" @click="scrollInspiration(-1)"><ChevronLeft :size="20" /></button>
              <button class="inspiration-arrow inspiration-arrow--next" type="button" aria-label="下一组" title="下一组" :disabled="!canScrollInspirationNext" @click="scrollInspiration(1)"><ChevronRight :size="20" /></button>
            </nav>
          </header>
          <div class="inspiration-browser">
            <div ref="inspirationRail" class="inspiration-rail" @scroll="syncInspirationNavigation">
              <div v-if="!activeInspirations.length" class="inspiration-loading" aria-label="正在加载灵感"><i v-for="index in 5" :key="index" /></div>
              <button v-for="item in activeInspirations" :key="item.id" type="button" class="inspiration-card" :class="{ 'is-selected': selectedInspirationId === item.id, 'is-video': activeMode === 'videos' }" :aria-label="`查看灵感：${item.title}`" @click="openInspiration(item)">
                <video v-if="activeMode === 'videos' && item.videoUrl" :src="item.videoUrl" :poster="item.imageUrl" muted loop playsinline preload="metadata" :aria-label="`${item.title} 视频预览`" @mouseenter="playInspirationVideo" @mouseleave="pauseInspirationVideo" />
                <img v-else :src="item.imageUrl" :alt="item.title" />
                <span v-if="item.badge">{{ item.badge }}</span>
                <i v-if="activeMode === 'videos'" class="inspiration-card__play" aria-hidden="true"><Play :size="18" fill="currentColor" /></i>
                <strong>{{ item.title }}</strong>
              </button>
            </div>
          </div>
        </section>

        <section class="creation-output">
          <h2>{{ activeMode === 'images' ? t('studio.myImages') : activeMode === 'videos' ? t('studio.myVideos') : t('studio.myCommerce') }}</h2>
          <template v-if="activeMode === 'videos'">
            <div v-if="pendingVideoRuns.length" class="video-runs video-runs--pending">
              <article v-for="run in pendingVideoRuns" :key="run.id" class="video-run-card" :class="`is-${run.status.toLowerCase()}`">
                <div class="video-run-card__stage"><LoaderCircle :size="26" /><strong>正在生成视频</strong><small>{{ run.request.resolution || '720p' }} · {{ run.request.duration || 5 }} 秒 · {{ run.request.aspectRatio || '16:9' }}</small></div>
                <footer><span><strong>{{ run.model }}</strong><small>{{ run.request.creditCost ?? currentVideoCredit }} 点</small></span><nav><button type="button" title="停止生成" :disabled="store.cancelingJobId === run.id" @click="stopGeneration(run)"><Square :size="14" fill="currentColor" /></button></nav></footer>
                <p>{{ run.prompt }}</p>
              </article>
            </div>
            <template v-if="modeAssets.length">
              <AssetGrid :assets="visibleModeAssets" variant="gallery" :deletable="auth.isAuthenticated" reusable regeneratable @delete="deleteAsset" @quote="useAssetPrompt" @regenerate="retryAssetGeneration" />
              <button v-if="visibleModeAssets.length < modeAssets.length" class="creation-output__more" type="button" @click="modeAssetLimit += 12">加载更多视频</button>
            </template>
            <div v-else-if="auth.isAuthenticated && !store.workspaceHydrated" class="creation-gallery-skeleton" aria-label="正在加载视频"><i v-for="index in 6" :key="index" /></div>
            <p v-else-if="!pendingVideoRuns.length">你创建的视频会显示在这里</p>
          </template>
          <div v-else-if="activeMode === 'commerce' && commerceRuns.length" class="commerce-runs">
            <div v-for="run in commerceRuns" :key="run.id" class="commerce-run-card" :class="{ 'is-running': ['QUEUED', 'RUNNING'].includes(run.status), 'is-clickable': Boolean(run.assets.length) }" :role="run.assets.length ? 'button' : undefined" :tabindex="run.assets.length ? 0 : undefined" @click="run.assets.length && (selectedCommerceRun = run)" @keydown.enter="run.assets.length && (selectedCommerceRun = run)">
              <div class="commerce-run-card__preview">
                <template v-if="run.assets.length"><img v-for="asset in run.assets.slice(0, 4)" :key="asset.id" :src="asset.contentUrl" :alt="asset.moduleLabel || asset.title" /><span><Images :size="14" />{{ run.assets.length }} 张</span></template>
                <span v-else class="commerce-run-card__progress"><LoaderCircle v-if="['QUEUED', 'RUNNING'].includes(run.status)" :size="22" /><span>{{ run.status === 'FAILED' ? run.error || '生成失败' : run.status === 'CANCELLED' ? '生成已停止' : '正在生成商品图' }}</span><button v-if="['QUEUED', 'RUNNING'].includes(run.status)" type="button" class="commerce-run-card__stop" :disabled="store.cancelingJobId === run.id" aria-label="停止商品图生成" title="停止商品图生成" @click.stop="stopGeneration(run)"><LoaderCircle v-if="store.cancelingJobId === run.id" class="generation-stop-spin" :size="14" /><Square v-else :size="14" fill="currentColor" />{{ store.cancelingJobId === run.id ? '停止中' : '停止生成' }}</button></span>
              </div>
              <span class="commerce-run-card__copy"><strong>{{ run.request.creationType || '商品素材包' }}</strong><small>{{ run.prompt }}</small></span>
            </div>
          </div>
          <div v-else-if="auth.isAuthenticated && !store.workspaceHydrated" class="creation-gallery-skeleton" aria-label="正在加载图片"><i v-for="index in 6" :key="index" /></div>
          <template v-else-if="modeAssets.length">
            <AssetGrid :assets="visibleModeAssets" variant="gallery" :deletable="auth.isAuthenticated" :reusable="activeMode === 'images'" :regeneratable="activeMode === 'images'" @delete="deleteAsset" @reuse="useGeneratedAssetAsReference" @quote="useAssetPrompt" @regenerate="retryAssetGeneration" />
            <button v-if="visibleModeAssets.length < modeAssets.length" class="creation-output__more" type="button" @click="modeAssetLimit += 12">加载更多图片</button>
          </template>
          <p v-else>{{ activeMode === 'images' ? '你创建的图片会显示在这里' : '你制作的商品素材包和详情页会显示在这里' }}</p>
        </section>
      </div>
    </section>

    <section v-else-if="activeMode === 'projects'" :key="activeMode" class="studio-index-page projects-page">
      <div class="index-page-inner">
        <div v-if="store.lastError" class="studio-feedback studio-feedback--inline" role="alert"><span>{{ store.lastError }}</span><button type="button" aria-label="关闭提示" @click="store.clearError"><X :size="15" /></button></div>
        <div v-if="projectNotice" class="project-notice" role="status"><Check :size="15" /><span>{{ projectNotice }}</span><button type="button" aria-label="关闭提示" @click="projectNotice = ''"><X :size="15" /></button></div>
        <header class="index-page-header"><h1>{{ t('studio.projects') }}</h1><div><label class="workspace-search"><Search :size="16" /><input v-model="projectSearch" :placeholder="t('studio.search')" /></label><button class="index-new-button" type="button" @click="projectModalOpen = true"><Plus :size="17" />{{ t('studio.create') }}</button></div></header>
        <div class="index-tabs"><button :class="{ 'is-active': projectTab === 'active' }" type="button" @click="projectTab = 'active'"><span>项目</span><small>{{ activeProjectCount }}</small></button><button :class="{ 'is-active': projectTab === 'archived' }" type="button" @click="projectTab = 'archived'"><span>已归档</span><small>{{ archivedProjectCount }}</small></button></div>
        <div class="project-table-head"><span>名称</span><span>项目内容</span><span>修改时间</span><span>操作</span></div>
        <div v-if="auth.isAuthenticated && store.workspaceHydrating && !store.projects.length" class="project-loading"><LoaderCircle class="admin-spin" :size="18" />正在加载项目</div>
        <div v-else-if="filteredProjects.length" class="project-table">
          <article v-for="project in filteredProjects" :key="project.id" class="project-row" :class="{ 'is-active': project.id === store.currentProjectId }"><button type="button" :title="project.archived ? '已归档项目不能设为当前项目' : '设为当前项目'" :disabled="project.archived" @click="selectCurrentProject(project)"><span class="project-row-name"><Folder :size="18" /><span><strong>{{ project.name }} <em v-if="project.accessRole === 'MEMBER'" class="project-member-badge">受邀</em></strong><small>{{ project.brief }}</small></span></span><span class="project-row-content">{{ project.conversationCount }} 个对话 · {{ project.assetCount }} 个文件 · {{ project.versionCount }} 个版本</span><time>{{ formatDate(project.updatedAt) }}</time></button><div><button type="button" :aria-label="`打开${project.name}详情`" title="项目详情" @click="openProjectDetails(project)"><Settings2 :size="16" /></button><button v-if="project.accessRole === 'OWNER'" type="button" :aria-label="project.archived ? `恢复${project.name}` : `归档${project.name}`" :title="project.archived ? '恢复' : '归档'" @click="toggleProjectArchive(project.id, !project.archived)"><ArchiveRestore v-if="project.archived" :size="16" /><Archive v-else :size="16" /></button><button v-if="project.accessRole === 'OWNER'" type="button" :aria-label="`删除${project.name}`" title="删除" @click="deleteProject(project.id, project.name)"><Trash2 :size="16" /></button></div></article>
        </div>
        <div v-else class="project-empty"><ArchiveRestore v-if="projectTab === 'archived'" :size="30" /><Folder v-else :size="30" /><strong>{{ projectSearch ? '没有匹配的项目' : projectTab === 'archived' ? '还没有已归档项目' : '还没有项目' }}</strong><p>{{ projectSearch ? '换一个关键词继续查找。' : projectTab === 'archived' ? '归档后的项目会保留聊天、文件和版本，并显示在这里。' : '把同一主题的聊天、文件和工作流集中到一个项目中。' }}</p><button v-if="projectSearch" type="button" @click="projectSearch = ''">清除搜索</button><button v-else-if="projectTab === 'active'" class="project-empty__create" type="button" @click="projectModalOpen = true"><Plus :size="15" />创建项目</button></div>
      </div>
    </section>

    <section v-else-if="activeMode === 'assets'" :key="activeMode" class="studio-index-page library-page">
      <div class="index-page-inner">
        <div v-if="store.lastError" class="studio-feedback studio-feedback--inline" role="alert"><span>{{ store.lastError }}</span><button type="button" aria-label="关闭提示" @click="store.clearError"><X :size="15" /></button></div>
        <header class="index-page-header"><h1>{{ t('studio.library') }}</h1><div><label class="workspace-search"><Search :size="16" /><input v-model="assetSearch" :placeholder="t('studio.search')" /></label><button class="index-new-button" type="button" @click="newMenuOpen = !newMenuOpen">{{ t('studio.create') }}<ChevronDown :size="15" /></button><div v-if="newMenuOpen" class="library-new-menu"><button type="button" @click="openFilePicker('library')"><Upload :size="16" />上传文件</button></div></div></header>
        <div class="library-toolbar">
          <nav><button v-for="tab in assetTabs" :key="tab.value" type="button" :class="{ 'is-active': assetTab === tab.value }" @click="assetTab = tab.value">{{ tab.label }}</button></nav>
          <div class="library-view-controls"><button type="button" aria-label="筛选" title="筛选" :class="{ 'is-active': assetFilter !== 'all' || filterMenuOpen }" @click="filterMenuOpen = !filterMenuOpen"><ListFilter :size="17" /></button><div v-if="filterMenuOpen" class="library-filter-menu"><strong>筛选</strong><button v-for="filter in assetFilters" :key="filter.value" type="button" :class="{ 'is-active': assetFilter === filter.value }" @click="assetFilter = filter.value; filterMenuOpen = false">{{ filter.label }}<Check v-if="assetFilter === filter.value" :size="15" /></button></div><i></i><button type="button" aria-label="网格视图" title="网格视图" :class="{ 'is-active': libraryGrid }" @click="libraryGrid = true"><LayoutGrid :size="18" /></button><button type="button" aria-label="列表视图" title="列表视图" :class="{ 'is-active': !libraryGrid }" @click="libraryGrid = false"><List :size="18" /></button></div>
        </div>
        <div v-if="auth.isAuthenticated && !store.workspaceHydrated" class="library-list-skeleton" aria-label="正在加载文件"><i v-for="index in 8" :key="index" /></div>
        <div v-else-if="filteredAssets.length" :class="libraryGrid ? 'library-assets-grid' : 'library-assets-list'">
          <div v-if="!libraryGrid" class="library-list-head"><span>名称</span><span>已修改</span><span>大小</span></div>
          <AssetGrid :assets="visibleLibraryAssets" :variant="libraryGrid ? 'cards' : 'list'" :deletable="auth.isAuthenticated" @delete="deleteAsset" />
          <button v-if="visibleLibraryAssets.length < filteredAssets.length" class="library-load-more" type="button" @click="libraryAssetLimit += 30">加载更多</button>
        </div>
        <div v-else class="library-empty"><Search :size="34" /><strong>{{ uploading ? '正在上传' : '未找到文件' }}</strong><button type="button" :disabled="uploading" @click="openFilePicker('library')">上传</button></div>
      </div>
    </section>

    <section v-else :key="activeMode" class="studio-index-page api-page">
      <div class="index-page-inner api-page-inner">
        <header class="index-page-header"><div><h1>API</h1><p>通过兼容接口把 Xinyue AI 接入你的应用。</p></div><button class="index-new-button" type="button" @click="createApiKey"><KeyRound :size="17" />创建密钥</button></header>
        <div class="api-panel"><h2>Provider Adapter</h2><p>统一模型调用、计费、队列、重试和内容审核。</p><code>POST /api/ai/jobs</code><code>GET /api/ai/jobs/events</code><code>POST /api/agent/sessions/:id/messages</code></div>
        <section v-if="store.apiKeys.length" class="api-keys"><h2>API 密钥</h2><div v-for="key in store.apiKeys" :key="key.id" class="api-key-row"><span><strong>{{ key.name }}</strong><code>{{ key.value }}</code></span><button class="icon-button" type="button" :aria-label="`复制${key.name}`" @click="copyKey(key.value)"><Check v-if="copiedKey === key.value" :size="17" /><Copy v-else :size="17" /></button></div></section>
      </div>
    </section>

    <input ref="fileInput" class="visually-hidden" type="file" multiple :accept="fileAccept" @change="handleFiles" />
    <InspirationPreview v-if="inspirationPreview" :inspiration="inspirationPreview" :type-label="activeMode === 'commerce' ? '商品图灵感' : activeMode === 'videos' ? '视频灵感' : '图片灵感'" @close="inspirationPreview = null" @use="useInspiration(inspirationPreview)" />
    <CommerceGallery v-if="selectedCommerceRun" :run="selectedCommerceRun" @close="selectedCommerceRun = null" @reuse="useCommerceAsset" />
    <GeneratedImagePreview v-if="previewAsset" :asset="previewAsset" @close="previewAsset = null" @delete="deletePreviewAsset" @download="downloadGeneratedAsset(previewAsset)" @reuse="useGeneratedAssetAsReference(previewAsset)" @quote="useAssetPrompt(previewAsset)" @regenerate="retryAssetGeneration(previewAsset)" />

    <Teleport to="body">
      <div v-if="projectModalOpen" class="studio-modal-backdrop" @click.self="closeProjectModal">
        <form class="project-create-dialog" role="dialog" aria-modal="true" aria-labelledby="project-modal-title" @submit.prevent="createProject">
          <header><h2 id="project-modal-title">创建项目</h2><div><button type="button" aria-label="项目设置" :class="{ 'is-active': projectAdvanced }" @click="projectAdvanced = !projectAdvanced"><Settings2 :size="19" /></button><button type="button" aria-label="关闭" @click="closeProjectModal"><X :size="20" /></button></div></header>
          <label class="project-name-label"><span>项目名称</span><div><Folder :size="18" /><input v-model="projectName" autofocus maxlength="40" placeholder="例如：品牌内容计划" /></div></label>
          <label v-if="projectAdvanced" class="project-brief-label"><span>项目说明</span><textarea v-model="projectBrief" maxlength="2000" placeholder="说明项目目标、背景和交付要求" /></label>
          <div class="project-create-tip"><Lightbulb :size="18" /><p>{{ projectAdvanced ? '项目创建后可继续设置说明、成员和默认指令。' : '项目功能可将聊天、文件和自定义指令集中保存，以便用于持续进行的工作，或者单纯用于整理内容，让一切更加井然有序。' }}</p></div>
          <p v-if="projectError" class="modal-error">{{ projectError }}</p>
          <footer><button type="submit" :disabled="!projectName.trim()">创建项目</button></footer>
        </form>
      </div>
      <div v-if="projectDetailOpen" class="studio-modal-backdrop project-detail-backdrop" @click.self="closeProjectDetails">
        <section class="project-detail-dialog" role="dialog" aria-modal="true" aria-labelledby="project-detail-title">
          <header class="project-detail-header"><div><span class="project-detail-eyebrow">PROJECT WORKSPACE</span><h2 id="project-detail-title">{{ projectDetail?.name || '项目详情' }}</h2><p>修订 {{ projectDetail?.revision || 1 }} · {{ projectDetail?.workflowConfig.steps.length || 0 }} 个工作步骤</p></div><button type="button" aria-label="关闭项目详情" title="关闭" @click="closeProjectDetails"><X :size="20" /></button></header>
          <div v-if="projectDetailError" class="modal-error">{{ projectDetailError }}</div>
          <div v-if="projectDetailLoading" class="project-detail-loading"><LoaderCircle class="admin-spin" :size="18" />正在加载项目</div>
          <div v-else class="project-detail-body" :class="{ 'is-member-view': projectDetail?.accessRole === 'MEMBER' }">
            <div class="project-detail-main">
              <section class="project-detail-section project-content-section"><div class="project-section-heading"><div><span class="project-detail-eyebrow">CONTENT</span><h3>项目内容</h3></div><span class="project-content-total">{{ projectDetail?.conversationCount || 0 }} 个对话 · {{ projectDetail?.assetCount || 0 }} 个文件</span></div><div class="project-content-grid"><div><h4>最近对话</h4><button v-for="conversation in projectDetail?.conversations || []" :key="conversation.id" class="project-content-row" type="button" @click="openProjectConversation(conversation.id)"><MessageSquare :size="15" /><span><strong>{{ conversation.title }}</strong><small>{{ conversation.author?.displayName || '我' }} · {{ conversation.model }} · {{ formatDate(conversation.updatedAt) }}</small><em v-if="conversation.deletedMessageCount" class="project-deleted-badge">{{ conversation.deletedMessageCount }} 条已删除提问</em></span><ChevronRight :size="15" /></button><p v-if="!projectDetail?.conversations.length" class="project-content-empty">在选中此项目后开始对话，对话会显示在这里。</p></div><div><h4>项目文件</h4><button v-for="asset in projectDetail?.assets || []" :key="asset.id" class="project-content-row" type="button" @click="openProjectAsset(asset)"><ImageIcon v-if="asset.kind === 'image'" :size="15" /><Video v-else-if="asset.kind === 'video'" :size="15" /><FileText v-else :size="15" /><span><strong>{{ asset.title }}</strong><small>{{ asset.tags.join(' · ') }}</small></span><ChevronRight :size="15" /></button><p v-if="!projectDetail?.assets.length" class="project-content-empty">上传到项目或在项目中生成的文件会显示在这里。</p></div></div></section>
              <section class="project-detail-section project-skill-section">
                <div class="project-section-heading"><div><span class="project-detail-eyebrow">PROJECT SKILL</span><h3>项目技能</h3></div><span class="project-skill-state" :class="{ enabled: projectSkillStatus?.active?.enabled }">{{ projectSkillStatus?.active?.enabled ? `已启用 v${projectSkillStatus.active.version}` : '未启用' }}</span></div>
                <div v-if="projectSkillStatus?.active?.enabled" class="project-skill-current"><header><div><strong>{{ projectSkillStatus.active.name }}</strong><span>所有项目对话自动使用</span></div><div v-if="projectDetail?.accessRole === 'OWNER'" class="project-skill-actions"><button type="button" class="project-inline-button" @click="openProjectSkillEditor"><Pencil :size="14" />编辑</button><button type="button" class="project-inline-button is-danger" :disabled="projectSkillBusy" @click="disableProjectSkill"><Power :size="14" />停用</button></div></header><pre>{{ projectSkillStatus.active.content }}</pre></div>
                <div v-else class="project-skill-empty"><Layers3 :size="19" /><span>当前项目没有绑定技能，对话将按原有配置回答。</span><button v-if="projectDetail?.accessRole === 'OWNER'" type="button" class="project-inline-button" @click="openProjectSkillEditor"><Plus :size="14" />设置技能</button></div>
                <form v-if="projectSkillEditorOpen && projectDetail?.accessRole === 'OWNER'" class="project-skill-editor" @submit.prevent="saveProjectSkill"><label><span>技能名称</span><input v-model="projectSkillName" required maxlength="80" placeholder="例如：客户方案撰写规范" /></label><label><span>技能内容</span><textarea v-model="projectSkillContent" required maxlength="50000" rows="8" placeholder="填写本项目所有回答需要遵循的角色、流程、规则和质量标准" /></label><footer><button type="button" class="project-secondary-button" @click="projectSkillEditorOpen = false">取消</button><button type="submit" class="project-primary-button" :disabled="projectSkillBusy || !projectSkillName.trim() || !projectSkillContent.trim()"><Save :size="14" />保存并启用</button></footer></form>
                <div class="project-skill-summary"><h4>从对话总结新技能</h4><form @submit.prevent="summarizeProjectSkill"><select v-model="projectSkillConversationId" required aria-label="选择来源对话"><option value="" disabled>选择我的项目对话</option><option v-for="conversation in projectSkillConversations" :key="conversation.id" :value="conversation.id">{{ conversation.title }}</option></select><input v-model="projectSkillRequest" maxlength="2000" placeholder="可选：说明这次希望补充或调整什么" /><button type="submit" class="project-primary-button" :disabled="projectSkillBusy || !projectSkillConversationId"><LoaderCircle v-if="projectSkillBusy && !projectSkillCandidate" class="admin-spin" :size="14" /><Sparkles v-else :size="14" />生成候选技能</button></form></div>
                <form v-if="projectSkillCandidate" class="project-skill-candidate" @submit.prevent="activateProjectSkillCandidate"><header><div><span>候选技能</span><small>基于 {{ projectSkillCandidate.sourceConversation.title }}</small></div><button type="button" class="project-icon-button" title="关闭候选技能" @click="projectSkillCandidate = null"><X :size="15" /></button></header><label><span>名称</span><input v-model="projectSkillCandidate.name" required maxlength="80" /></label><label><span>内容</span><textarea v-model="projectSkillCandidate.content" required maxlength="50000" rows="9" /></label><label><span>变化摘要</span><input v-model="projectSkillCandidate.changeSummary" maxlength="500" /></label><footer><button type="submit" class="project-primary-button" :disabled="projectSkillBusy"><RefreshCw :size="14" />确认替换</button></footer></form>
                <div v-if="projectSkillStatus?.versions.length" class="project-skill-history"><h4>技能变化记录</h4><article v-for="version in projectSkillStatus.versions" :key="version.id" :class="{ active: version.active }"><div class="project-skill-history-meta"><strong>v{{ version.version }} · {{ version.name }}</strong><span>{{ projectSkillChangeLabel(version.changeType) }}<template v-if="version.active"> · 当前</template></span></div><p>{{ version.changeSummary || '未填写变化摘要' }}</p><small>{{ version.createdBy.displayName }} · {{ formatDate(version.createdAt) }}<template v-if="version.sourceConversation"> · 来源：{{ version.sourceConversation.title }}</template></small><details><summary>查看技能内容</summary><pre>{{ version.content }}</pre></details><button v-if="!version.active" type="button" class="project-restore-button" :disabled="projectSkillRestoringVersion === version.version" @click="restoreProjectSkill(version)"><RotateCcw :size="13" />{{ projectSkillRestoringVersion === version.version ? '回退中' : '回退到此版本' }}</button></article></div>
              </section>
              <section v-if="projectDetail?.accessRole === 'OWNER'" class="project-detail-section"><div class="project-section-heading"><div><span class="project-detail-eyebrow">MEMBERS</span><h3>项目成员</h3></div><span class="project-content-total">{{ projectDetail.members.length }} 位成员</span></div><form class="project-member-invite" @submit.prevent="inviteProjectMember"><input v-model.trim="projectMemberEmail" required type="email" placeholder="输入已注册成员邮箱" /><button type="submit" :disabled="projectMemberBusy"><UserPlus :size="15" />{{ projectMemberBusy ? '邀请中' : '邀请成员' }}</button></form><div class="project-member-list"><article><span><strong>{{ projectDetail.owner?.displayName || '项目创建者' }}</strong><small>{{ projectDetail.owner?.email || '' }}</small></span><em>创建者</em></article><article v-for="member in projectDetail.members" :key="member.userId"><span><strong>{{ member.user.displayName }}</strong><small>{{ member.user.email }}</small></span><button type="button" :aria-label="`移除成员${member.user.displayName}`" title="移除成员" :disabled="projectMemberBusy" @click="removeProjectMember(member)"><Trash2 :size="14" /></button></article></div></section>
              <section v-if="projectDetail?.accessRole === 'OWNER'" class="project-detail-section"><div class="project-section-heading"><div><span class="project-detail-eyebrow">WORKFLOW</span><h3>工作流设置</h3></div><span class="project-revision">v{{ projectDetail?.revision || 1 }}</span></div>
                <div class="project-form-grid"><label><span>项目状态</span><select v-model="projectWorkflowStatus"><option value="PLANNING">规划中</option><option value="IN_PROGRESS">进行中</option><option value="REVIEW">待审核</option><option value="COMPLETED">已完成</option><option value="ARCHIVED">已归档</option></select></label><label><span>默认模型</span><input v-model="projectDefaultModel" maxlength="160" placeholder="跟随系统默认模型" /></label></div>
                <label class="project-form-field"><span>默认项目指令</span><textarea v-model="projectInstructions" maxlength="4000" rows="4" placeholder="每次在此项目中开始工作时使用的背景和约束" /></label>
                <div class="project-form-grid"><label><span>默认助手</span><select v-model="projectDefaultAssistantId"><option value="">不使用默认助手</option><option v-for="assistant in assistants" :key="assistant.id" :value="assistant.id">{{ assistant.name }}</option></select></label><label><span>版本标签</span><input v-model="projectVersionLabel" maxlength="80" placeholder="例如：第一轮方案" /></label></div>
                <label class="project-form-field"><span>默认提示词</span><textarea v-model="projectDefaultPrompt" maxlength="10000" rows="3" placeholder="工作流开始时自动带入的提示词" /></label>
                <label class="project-form-field"><span>交付要求</span><textarea v-model="projectOutputRequirements" maxlength="10000" rows="3" placeholder="定义最终产物、格式和验收标准" /></label>
              </section>
              <section v-if="projectDetail?.accessRole === 'OWNER'" class="project-detail-section"><div class="project-section-heading"><div><span class="project-detail-eyebrow">STEPS</span><h3>工作流步骤</h3></div><button class="project-inline-button" type="button" @click="addProjectStep"><Plus :size="15" />新增步骤</button></div>
                <div v-if="projectSteps.length" class="project-steps"><article v-for="(step, index) in projectSteps" :key="step.id" class="project-step"><span class="project-step-number">{{ String(index + 1).padStart(2, '0') }}</span><div class="project-step-fields"><input v-model="step.title" maxlength="120" placeholder="步骤名称" /><input v-model="step.description" maxlength="1000" placeholder="这一步的目标和交付物" /></div><select v-model="step.status" aria-label="步骤状态"><option value="TODO">待开始</option><option value="IN_PROGRESS">进行中</option><option value="DONE">已完成</option></select><button type="button" aria-label="删除步骤" title="删除步骤" @click="removeProjectStep(index)"><Trash2 :size="15" /></button></article></div>
                <div v-else class="project-steps-empty"><Layers3 :size="20" /><span>还没有工作步骤，从拆解第一项任务开始。</span></div>
              </section>
              <footer v-if="projectDetail?.accessRole === 'OWNER'" class="project-detail-actions"><button type="button" class="project-secondary-button" @click="closeProjectDetails">取消</button><button type="button" class="project-primary-button" :disabled="projectSaving" @click="saveProjectWorkflow"><LoaderCircle v-if="projectSaving" class="admin-spin" :size="15" /><Save v-else :size="15" />保存工作流</button></footer>
            </div>
            <aside class="project-version-panel"><div class="project-section-heading"><div><span class="project-detail-eyebrow">HISTORY</span><h3>版本历史</h3></div><button type="button" class="project-icon-button" title="创建版本检查点" aria-label="创建版本检查点" @click="createProjectCheckpoint"><Plus :size="16" /></button></div><p class="project-version-note">每次保存都会自动留下版本，可随时恢复。</p><div v-if="projectVersions.length" class="project-versions"><article v-for="version in projectVersions" :key="version.id" class="project-version" :class="{ 'is-current': version.version === projectDetail?.revision }"><div class="project-version-dot"></div><div class="project-version-copy"><div><strong>v{{ version.version }}</strong><span>{{ version.label || '未命名版本' }}</span></div><p>{{ version.changeSummary || '未填写修改摘要' }}</p><time>{{ formatDate(version.createdAt) }}</time><div class="project-version-actions"><button type="button" class="project-restore-button" @click="projectVersionPreview = projectVersionPreview?.id === version.id ? null : version"><FileText :size="13" />{{ projectVersionPreview?.id === version.id ? '收起快照' : '查看快照' }}</button><button type="button" class="project-restore-button" :disabled="version.version === projectDetail?.revision || projectRestoringVersion === version.version" @click="restoreProject(version)"><RotateCcw :size="13" />{{ projectRestoringVersion === version.version ? '恢复中' : version.version === projectDetail?.revision ? '当前版本' : '恢复此版本' }}</button></div><pre v-if="projectVersionPreview?.id === version.id" class="project-version-snapshot">{{ formatProjectSnapshot(version.snapshot) }}</pre></div></article></div><div v-else class="project-steps-empty"><History :size="20" /><span>暂无版本历史</span></div></aside>
          </div>
        </section>
      </div>
    </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch, watchEffect } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import {
  Archive, ArchiveRestore, ArrowUp, BadgeCheck, Blend, Bot, Check, ChevronDown, ChevronLeft, ChevronRight, Clock3, Copy, Eye, FileSpreadsheet, FileText, FileType2, Folder,
  Download, Image as ImageIcon, ImagePlus, Images, KeyRound, Layers3, LayoutGrid, LibraryBig, Lightbulb, List, ListFilter, Paperclip,
  History, LoaderCircle, Maximize2, MessageSquare, Mic, Pencil, Play, Plus, Power, RefreshCw, RotateCcw, Save, Search, Settings2, SlidersHorizontal, Sparkles, Square, ThumbsDown, ThumbsUp, Trash2, Upload, UserPlus, Video, X, Zap,
} from 'lucide-vue-next'
import AssetGrid from '../components/AssetGrid.vue'
import CommerceGallery from '../components/CommerceGallery.vue'
import ChatMessageContent from '../components/ChatMessageContent.vue'
import CodeArtifactPanel from '../components/CodeArtifactPanel.vue'
import GeneratedImagePreview from '../components/GeneratedImagePreview.vue'
import InspirationPreview from '../components/InspirationPreview.vue'
import PluginSelector from '../components/PluginSelector.vue'
import { useAuthStore } from '../stores/auth'
import { useCatalogStore } from '../stores/catalog'
import { ChatSendError, useStudioStore } from '../stores/studio'
import type { CodeArtifact, GenerationRun, Message, PluginCapability, Project, ProjectMember, ProjectSkillCandidate, ProjectSkillStatus, ProjectSkillVersion, ProjectStepStatus, ProjectVersion, ProjectWorkflowStatus, StudioAsset, StudioMode } from '../types'
import { api, apiUrl } from '../services/api'
import { consumeImagePrompt } from '../utils/prompt-transfer'
import { createClientId } from '../utils/client-id'

interface Inspiration {
  id: string
  title: string
  prompt: string
  badge: string
  imageUrl: string
  videoUrl?: string
  model?: string | null
  options?: Record<string, unknown> | null
}
interface ImageTool extends Inspiration {
  options?: { inputMode?: 'REFERENCE' | 'MASK'; placeholder?: string; [key: string]: unknown } | null
}

interface PromptTemplate {
  id: string
  title: string
  description: string
  prompt: string
  category: string
  variables: string[] | null
}
interface AssistantOption { id: string; name: string; description: string; defaultModel?: string }

type FilePurpose = 'chat-file' | 'creation' | 'mask' | 'library'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const store = useStudioStore()
const auth = useAuthStore()
const catalog = useCatalogStore()
const draft = ref('')
const composerInput = ref<HTMLTextAreaElement | null>(null)
const activeArtifact = ref<CodeArtifact | null>(null)
const thread = ref<HTMLElement | null>(null)
const messageNavigatorOpen = ref(false)
const activeMessageJumpId = ref('')
const jumpHighlightId = ref('')
let jumpHighlightTimer = 0
let messageNavigatorCloseTimer = 0
const attachmentOpen = ref(false)
const modelOpen = ref(false)
const promptTemplatesOpen = ref(false)
const promptTemplatesLoading = ref(false)
const promptTemplates = ref<PromptTemplate[]>([])
const promptTemplateQuery = ref('')
const promptTemplateCategory = ref('')
const assistantMenuOpen = ref(false)
const assistants = ref<AssistantOption[]>([])
const assistantId = ref('')
const chatPluginId = ref('')
const agentMode = ref(false)
const creationPluginId = ref('')
const attachments = ref<StudioAsset[]>([])
const fileInput = ref<HTMLInputElement | null>(null)
const filePurpose = ref<FilePurpose>('chat-file')
const projectModalOpen = ref(false)
const projectName = ref('')
const projectBrief = ref('')
const projectError = ref('')
const projectAdvanced = ref(false)
const projectDetailOpen = ref(false)
const projectDetailLoading = ref(false)
const projectSaving = ref(false)
const projectRestoringVersion = ref<number | null>(null)
const projectDetailError = ref('')
const projectDetail = ref<Project | null>(null)
const projectMemberEmail = ref('')
const projectMemberBusy = ref(false)
const projectVersions = ref<ProjectVersion[]>([])
const projectVersionPreview = ref<ProjectVersion | null>(null)
const projectSkillStatus = ref<ProjectSkillStatus | null>(null)
const projectSkillEditorOpen = ref(false)
const projectSkillName = ref('')
const projectSkillContent = ref('')
const projectSkillConversationId = ref('')
const projectSkillRequest = ref('')
const projectSkillCandidate = ref<ProjectSkillCandidate | null>(null)
const projectSkillBusy = ref(false)
const projectSkillRestoringVersion = ref<number | null>(null)
const projectWorkflowStatus = ref<ProjectWorkflowStatus>('PLANNING')
const projectDefaultModel = ref('')
const projectDefaultAssistantId = ref('')
const projectInstructions = ref('')
const projectDefaultPrompt = ref('')
const projectOutputRequirements = ref('')
const projectVersionLabel = ref('')
const projectSteps = ref<{ id: string; title: string; description: string; status: ProjectStepStatus; sortOrder: number }[]>([])
const uploading = ref(false)
const previewAsset = ref<StudioAsset | null>(null)
const copiedKey = ref('')
const model = ref('gpt-5.5')
const editingMessageId = ref('')
const editingMessageContent = ref('')
const copiedMessageId = ref('')
const exportingMessage = ref('')
type SpeechRecognizer = { lang: string; interimResults: boolean; continuous: boolean; onresult: ((event: { results: { [key: number]: { [key: number]: { transcript: string } } } }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null; start: () => void; stop: () => void }
type SpeechRecognizerConstructor = new () => SpeechRecognizer
const voiceListening = ref(false)
const voiceRecognizer = ref<SpeechRecognizer | null>(null)
const voiceTarget = ref<'chat' | 'creation'>('chat')
async function toggleTemporaryChat() {
  if (!store.temporaryChat) {
    store.newConversation(true)
    return
  }
  const temporaryConversationId = store.currentConversationId
  if (temporaryConversationId) {
    await store.deleteConversation(temporaryConversationId).catch((reason) => {
      store.lastError = reason instanceof Error ? reason.message : '临时聊天删除失败'
    })
    return
  }
  store.newConversation(false)
}
type CatalogModel = { key: string; displayName: string; upstreamModel: string; description?: string; capability: 'CHAT' | 'IMAGE' | 'VIDEO' | 'COMMERCE'; enabled: boolean; isDefault: boolean; badge?: string; flatCreditCost?: number; effectiveCreditCost?: number; options?: { imageCapabilities?: { sizes?: string[]; qualities?: string[]; outputFormats?: string[]; backgrounds?: string[]; maxCount?: number; defaultSize?: string; defaultQuality?: string; supportsReference?: boolean; supportsMask?: boolean; resolutionPricing?: Record<string, number> }; videoCapabilities?: { resolutions?: string[]; durations?: number[]; aspectRatios?: string[]; defaultResolution?: string; defaultDuration?: number; defaultAspectRatio?: string; pricing?: Record<string, number> } } }
const catalogModels = ref<CatalogModel[]>([])
let modelCatalogRequest: Promise<CatalogModel[]> | null = null
let modelCatalogLoadedAt = 0
const chatModels = computed<CatalogModel[]>(() => {
  const items = catalogModels.value.filter((item) => item.capability === 'CHAT')
  return items.length ? items : ['gpt-5.5', 'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna', 'grok-4.5'].map((name, index) => ({ key: name, displayName: name, upstreamModel: name, description: index === 0 ? '适合日常问答与创作' : '管理员预设模型', capability: 'CHAT', enabled: true, isDefault: index === 0, flatCreditCost: 1 }))
})
const promptTemplateCategories = computed(() => [...new Set(promptTemplates.value.map((item) => item.category).filter(Boolean))].sort())
const filteredPromptTemplates = computed(() => promptTemplates.value.filter((item) => {
  const haystack = `${item.title} ${item.description} ${item.prompt}`.toLowerCase()
  return (!promptTemplateCategory.value || item.category === promptTemplateCategory.value) && (!promptTemplateQuery.value || haystack.includes(promptTemplateQuery.value.toLowerCase()))
}))
const selectedAssistant = computed(() => assistants.value.find((item) => item.id === assistantId.value))
const creationPluginCapability = computed<PluginCapability>(() => activeMode.value === 'videos' ? 'VIDEO' : activeMode.value === 'commerce' ? 'COMMERCE' : 'IMAGE')
const generationPrompt = ref('')
const generationInput = ref<HTMLTextAreaElement | null>(null)
const creationComposer = ref<HTMLFormElement | null>(null)
const creationAttachments = ref<StudioAsset[]>([])
const maskAttachment = ref<StudioAsset | null>(null)
const imageModel = ref('GPT Image 2')
const videoModel = ref('Grok Imagine Video')
const commerceModel = ref('')
const videoResolution = ref('720p')
const videoDuration = ref(5)
const videoAspectRatio = ref('16:9')
const autoMode = ref('自动')
const quality = ref<string>('标准')
const imageStyle = ref('')
const imageCount = ref(1)
const outputFormat = ref<'PNG' | 'JPEG' | 'WebP'>('PNG')
const imageBackground = ref<'自动背景' | '透明背景' | '不透明背景'>('自动背景')
const creationType = ref('详情页')
const commercePlatform = ref('自动')
const commerceModules = ref(8)
const selectedCommerceRun = ref<GenerationRun | null>(null)
const activeImageCapabilities = computed(() => {
  const model = catalogModels.value.find((item) => item.capability === 'IMAGE' && item.displayName === imageModel.value)
  const raw = model?.options?.imageCapabilities || {}
  return { sizes: raw.sizes?.length ? raw.sizes : ['1024x1024', '1536x1024', '1024x1536', '2048x2048', '4096x4096'], qualities: raw.qualities?.length ? raw.qualities : ['low', 'medium', 'high'], outputFormats: raw.outputFormats?.length ? raw.outputFormats : ['png', 'jpeg', 'webp'], backgrounds: raw.backgrounds?.length ? raw.backgrounds : ['auto', 'opaque', 'transparent'], maxCount: Math.max(1, Math.min(10, raw.maxCount || 4)), defaultSize: raw.defaultSize || '1024x1024', defaultQuality: raw.defaultQuality || 'medium', supportsReference: raw.supportsReference !== false, supportsMask: raw.supportsMask === true, resolutionPricing: raw.resolutionPricing || {} }
})
const activeVideoCapabilities = computed(() => {
  const model = catalogModels.value.find((item) => item.capability === 'VIDEO' && item.displayName === videoModel.value)
  const raw = model?.options?.videoCapabilities || {}
  return { resolutions: raw.resolutions?.length ? raw.resolutions : ['480p', '720p'], durations: raw.durations?.length ? raw.durations : [5, 10], aspectRatios: raw.aspectRatios?.length ? raw.aspectRatios : ['16:9', '9:16', '1:1'], defaultResolution: raw.defaultResolution || raw.resolutions?.[0] || '720p', defaultDuration: raw.defaultDuration || raw.durations?.[0] || 5, defaultAspectRatio: raw.defaultAspectRatio || raw.aspectRatios?.[0] || '16:9', pricing: raw.pricing || {} }
})
function imageSizeLabel(value: string) {
  const [width, height] = value.split('x').map(Number)
  const tier = Math.max(width || 0, height || 0) >= 4096 ? '4K' : Math.max(width || 0, height || 0) >= 2048 ? '2K' : '1K'
  const shape = width === height ? '正方形' : width > height ? '横向' : '竖向'
  return `${tier} ${shape} ${value.replace('x', '×')}`
}
function qualityLabel(value: string): string { return value === 'low' ? '低' : value === 'high' ? '高' : '标准' }
function backgroundLabel(value: string) { return value === 'transparent' ? '透明背景' : value === 'opaque' ? '不透明背景' : '自动背景' }
function syncImageSelection() { const caps = activeImageCapabilities.value; if (!imageRatios.includes(autoMode.value)) autoMode.value = imageRatioForSize(autoMode.value); if (imageCount.value > caps.maxCount) imageCount.value = caps.maxCount; if (!caps.qualities.map(qualityLabel).includes(quality.value)) quality.value = qualityLabel(caps.defaultQuality); if (!caps.outputFormats.map((item) => item.toUpperCase()).includes(outputFormat.value)) outputFormat.value = caps.outputFormats[0].toUpperCase() as typeof outputFormat.value; if (!caps.backgrounds.map(backgroundLabel).includes(imageBackground.value)) imageBackground.value = backgroundLabel(caps.backgrounds[0]) }
function syncVideoSelection() { const caps = activeVideoCapabilities.value; if (!caps.resolutions.includes(videoResolution.value)) videoResolution.value = caps.defaultResolution; if (!caps.durations.includes(videoDuration.value)) videoDuration.value = caps.defaultDuration; if (!caps.aspectRatios.includes(videoAspectRatio.value)) videoAspectRatio.value = caps.defaultAspectRatio }
const selectedImageModel = computed(() => catalogModels.value.find((item) => item.capability === 'IMAGE' && item.displayName === imageModel.value))
const selectedVideoModel = computed(() => catalogModels.value.find((item) => item.capability === 'VIDEO' && item.displayName === videoModel.value))
const selectedCommerceModel = computed(() => catalogModels.value.find((item) => item.capability === 'COMMERCE' && item.displayName === commerceModel.value) || catalogModels.value.find((item) => item.capability === 'COMMERCE' && item.isDefault) || catalogModels.value.find((item) => item.capability === 'COMMERCE'))
const activeCreationModel = computed(() => activeMode.value === 'videos' ? videoModel.value : activeMode.value === 'commerce' ? commerceModel.value || selectedCommerceModel.value?.displayName || imageModel.value : imageModel.value)
const currentImageCredit = computed(() => { const size = imageSizeForRatio(autoMode.value); const tier = imageSizeLabel(size).split(' ')[0]; const base = selectedImageModel.value?.effectiveCreditCost ?? selectedImageModel.value?.flatCreditCost ?? 1; return activeImageCapabilities.value.resolutionPricing?.[tier] ?? base * (tier === '4K' ? 4 : tier === '2K' ? 2 : 1) })
const currentVideoCredit = computed(() => activeVideoCapabilities.value.pricing[`${videoResolution.value}:${videoDuration.value}`] ?? (selectedVideoModel.value?.effectiveCreditCost ?? selectedVideoModel.value?.flatCreditCost ?? 10) * (videoResolution.value === '1080p' ? 2 : videoResolution.value === '2160p' ? 4 : 1) * Math.max(1, Math.ceil(videoDuration.value / 5)))
const currentGenerationCost = computed(() => activeMode.value === 'images' ? currentImageCredit.value * imageCount.value : activeMode.value === 'videos' ? currentVideoCredit.value : (selectedCommerceModel.value?.effectiveCreditCost ?? selectedCommerceModel.value?.flatCreditCost ?? 1) * commerceModules.value)

function hasImagePreview(asset: StudioAsset) {
  return Boolean(asset.contentUrl) && (asset.kind === 'image' || asset.mimeType?.startsWith('image/'))
}

function attachmentMeta(asset: StudioAsset) {
  const extension = asset.title.includes('.') ? asset.title.split('.').pop()?.toUpperCase() : undefined
  const type = extension || asset.mimeType?.split('/').pop()?.toUpperCase() || '文件'
  if (!asset.size) return type
  if (asset.size < 1024) return `${type} · ${asset.size} B`
  if (asset.size < 1024 * 1024) return `${type} · ${(asset.size / 1024).toFixed(1)} KB`
  return `${type} · ${(asset.size / (1024 * 1024)).toFixed(1)} MB`
}
const creationMenu = ref<'model' | 'type' | 'size' | 'style' | 'resolution' | 'duration' | 'aspect' | 'platform' | 'quality' | 'modules' | 'count' | 'format' | 'background' | null>(null)
const creationMenuAnchor = ref<HTMLElement | null>(null)
const creationMenuAnchorRect = ref<{ left: number; right: number; top: number; bottom: number; width: number } | null>(null)
const creationOptionsMenu = ref<HTMLElement | null>(null)
const creationMenuStyle = ref<Record<string, string>>({})
const creationOptionsOpen = ref(false)
const creationMoreTrigger = ref<HTMLButtonElement | null>(null)
const creationMorePanel = ref<HTMLElement | null>(null)
const creationMorePanelStyle = ref<Record<string, string>>({ visibility: 'hidden' })
const creationPluginOpen = ref(false)
const inspirationRail = ref<HTMLElement | null>(null)
const canScrollInspirationPrevious = ref(false)
const canScrollInspirationNext = ref(false)
const projectSearch = ref('')
const projectTab = ref<'active' | 'archived'>('active')
const projectNotice = ref('')
const assetSearch = ref('')
const assetTab = ref('all')
const assetFilter = ref('all')
const filterMenuOpen = ref(false)
const libraryGrid = ref(false)
const modeAssetLimit = ref(12)
const libraryAssetLimit = ref(30)
const newMenuOpen = ref(false)
const assetTabs = [{ label: '全部', value: 'all' }, { label: '生成作品', value: 'generated' }, { label: '图片', value: 'image' }, { label: '视频', value: 'video' }, { label: '参考图', value: 'reference' }, { label: '商品素材', value: 'product-pack' }, { label: '文件', value: 'text' }]
const imageInspirations = ref<Inspiration[]>([])
const imageTools = ref<ImageTool[]>([])
const selectedImageToolId = ref('')
const videoInspirations = ref<Inspiration[]>([])
const commerceInspirations = ref<Inspiration[]>([])
const selectedInspirationId = ref('')
const inspirationPreview = ref<Inspiration | null>(null)
const assetFilters = [{ label: '全部来源', value: 'all' }, { label: 'AI 生成', value: 'generated' }, { label: '本地上传', value: 'uploaded' }]
const modes: StudioMode[] = ['chat', 'images', 'videos', 'commerce', 'projects', 'assets', 'api']
const routeModeMap: Record<string, StudioMode> = { chat: 'chat', images: 'images', image: 'images', videos: 'videos', video: 'videos', commerce: 'commerce', projects: 'projects', assets: 'assets', files: 'assets', api: 'api' }

const activeMode = computed<StudioMode>(() => {
  const raw = String(route.params.mode || route.name || 'chat')
  if (routeModeMap[raw]) return routeModeMap[raw]
  return modes.includes(raw as StudioMode) ? raw as StudioMode : 'chat'
})
type ChatTimelineEntry = { id: string; kind: 'message' | 'generation'; createdAt: number; message?: Message; generation?: GenerationRun }
const hasChatThread = computed(() => store.messages.some((message) => message.id !== 'welcome') || store.generations.length > 0)
const chatMessages = computed(() => hasChatThread.value ? store.messages.filter((message) => message.id !== 'welcome') : store.messages)
const showChatThinking = computed(() => {
  if (!store.isGenerating || store.activeGeneration) return false
  const latest = store.messages.at(-1)
  return !latest || latest.role !== 'assistant' || latest.id === 'welcome' || !latest.content.trim()
})
const chatTimeline = computed<ChatTimelineEntry[]>(() => [
  ...chatMessages.value.map((message) => ({ id: message.id, kind: 'message' as const, createdAt: message.createdAt, message })),
  ...store.generations.map((generation) => ({ id: generation.id, kind: 'generation' as const, createdAt: generation.createdAt, generation })),
].sort((left, right) => left.createdAt - right.createdAt || (left.kind === right.kind ? 0 : left.kind === 'message' ? -1 : 1)))
const messageJumps = computed(() => chatMessages.value.filter((message) => message.role === 'user'))
const fileAccept = computed(() => filePurpose.value === 'creation' || filePurpose.value === 'mask' ? 'image/*' : '*/*')
const activeInspirations = computed(() => activeMode.value === 'commerce' ? commerceInspirations.value : activeMode.value === 'videos' ? videoInspirations.value : imageInspirations.value)
const selectedImageTool = computed(() => activeMode.value === 'images' ? imageTools.value.find((tool) => tool.id === selectedImageToolId.value) || null : null)
const canSubmitCreation = computed(() => Boolean(generationPrompt.value.trim()) || Boolean(selectedImageTool.value && creationAttachments.value.length))
const creationPromptPlaceholder = computed(() => selectedImageTool.value?.options?.placeholder || (activeMode.value === 'images' ? '描述你想要的图片' : activeMode.value === 'videos' ? '描述你想要的视频' : '描述你想制作的商品素材包或详情页'))
const modeAssets = computed(() => store.recentAssets.filter((asset) => asset.source === 'generated' && (activeMode.value === 'images' ? asset.kind === 'image' : activeMode.value === 'videos' ? asset.kind === 'video' : asset.kind === 'product-pack')))
const visibleModeAssets = computed(() => modeAssets.value.slice(0, modeAssetLimit.value))
const commerceRuns = computed(() => {
  const runs = [...store.commerceRuns]
  if (store.activeGeneration?.mode === 'commerce' && !runs.some((run) => run.id === store.activeGeneration?.id)) runs.unshift(store.activeGeneration)
  return runs.sort((left, right) => right.createdAt - left.createdAt)
})
const pendingVideoRuns = computed(() => {
  const runs = [...store.videoRuns]
  if (store.activeGeneration?.mode === 'videos' && !runs.some((run) => run.id === store.activeGeneration?.id)) runs.unshift(store.activeGeneration)
  return runs
    .filter((run) => run.status === 'QUEUED' || run.status === 'RUNNING')
    .sort((left, right) => right.createdAt - left.createdAt)
})
const filteredProjects = computed(() => store.projects.filter((project) => Boolean(project.archived) === (projectTab.value === 'archived') && project.name.toLowerCase().includes(projectSearch.value.trim().toLowerCase())))
const activeProjectCount = computed(() => store.projects.filter((project) => !project.archived).length)
const archivedProjectCount = computed(() => store.projects.filter((project) => project.archived).length)
const projectSkillConversations = computed(() => (projectDetail.value?.conversations || []).filter((conversation) => !auth.session?.id || conversation.author?.id === auth.session.id))
const filteredAssets = computed(() => store.recentAssets.filter((asset) => {
  const matchesTab = assetTab.value === 'all' || (assetTab.value === 'generated' ? asset.purpose === 'generated' : assetTab.value === 'reference' ? asset.purpose === 'reference' || asset.purpose === 'mask' : asset.kind === assetTab.value)
  const matchesSource = assetFilter.value === 'all' || (assetFilter.value === 'uploaded' ? asset.source === 'upload' : asset.source === 'generated')
  const matchesSearch = `${asset.title} ${asset.prompt}`.toLowerCase().includes(assetSearch.value.trim().toLowerCase())
  return matchesTab && matchesSource && matchesSearch
}))
const visibleLibraryAssets = computed(() => filteredAssets.value.slice(0, libraryAssetLimit.value))
const imageRatios = ['自动', '9:16', '2:3', '3:4', '1:1', '4:3', '3:2', '16:9']
const imageStyles = ['人像摄影', '电影写真', '中国风', '动漫', '3D渲染', '赛博朋克', 'CG 动画', '水墨画', '油画', '古典', '水彩画', '卡通', '儿童绘画', '抽象', '锐笔插画', '二次元', '油墨印刷', '版画', '莫奈', '毕加索', '伦勃朗', '马蒂斯', '巴洛克', '复古动漫', '绘本']
const styleThumbnails = ['/assets/inspiration-1.jpg', '/assets/inspiration-2.jpg', '/assets/inspiration-3.jpg', '/assets/inspiration-4.jpg', '/assets/inspirations/video/fashion-stage.jpg', '/assets/inspirations/video/sci-fi-iris.jpg', '/assets/inspirations/video/urban-transit.jpg', '/assets/inspirations/video/artisan-pottery.jpg', '/assets/inspirations/video/culinary-detail.jpg', '/assets/inspirations/video/epic-coast.jpg', '/assets/inspirations/video/liminal-corridor.jpg', '/assets/inspirations/video/mountain-road.jpg', '/assets/inspirations/video/urban-geometry.jpg']
const creationMenuTitle = computed(() => ({ model: activeMode.value === 'videos' ? '视频模型' : activeMode.value === 'commerce' ? '商品视觉模型' : '图片模型', type: '商品类型', size: '比例', style: '风格', resolution: '视频分辨率', duration: '视频时长', aspect: '画面比例', platform: '目标平台', quality: '图片质量', modules: '详情模块', count: '生成张数', format: '输出格式', background: '图片背景' }[creationMenu.value || 'model']))
const creationMenuOptions = computed(() => {
  if (creationMenu.value === 'model') {
    const capability = activeMode.value === 'videos' ? 'VIDEO' : activeMode.value === 'commerce' ? 'COMMERCE' : 'IMAGE'
    const items = catalogModels.value.filter((item) => item.capability === capability).map((item) => item.displayName)
    return items.length ? items : activeMode.value === 'videos' ? ['Grok Imagine Video'] : activeMode.value === 'commerce' ? [imageModel.value] : ['GPT Image 2', 'Grok Imagine']
  }
  if (creationMenu.value === 'type') return ['详情页', '素材包']
  if (creationMenu.value === 'size') return imageRatios
  if (creationMenu.value === 'style') return imageStyles
  if (creationMenu.value === 'resolution') return activeVideoCapabilities.value.resolutions
  if (creationMenu.value === 'duration') return activeVideoCapabilities.value.durations.map((item) => `${item} 秒`)
  if (creationMenu.value === 'aspect') return activeVideoCapabilities.value.aspectRatios
  if (creationMenu.value === 'platform') return ['自动', '淘宝/天猫', '京东', '拼多多', '抖音电商', '小红书', 'Amazon', 'TikTok Shop', 'Shopee']
  if (creationMenu.value === 'quality') return activeImageCapabilities.value.qualities.map(qualityLabel)
  if (creationMenu.value === 'modules') return ['6 个模块', '8 个模块', '10 个模块', '12 个模块']
  if (creationMenu.value === 'count') return Array.from({ length: activeImageCapabilities.value.maxCount }, (_, index) => `${index + 1} 张`)
  if (creationMenu.value === 'format') return (activeMode.value === 'commerce' ? ['png', 'jpeg', 'webp'] : activeImageCapabilities.value.outputFormats).map(outputFormatLabel)
  if (creationMenu.value === 'background') return activeMode.value === 'commerce' ? ['自动背景', '透明背景', '不透明背景'] : activeImageCapabilities.value.backgrounds.map(backgroundLabel)
  return []
})
function creationOptionPrice(option: string) {
  if (creationMenu.value === 'size') {
    const size = imageSizeForRatio(option)
    const tier = imageSizeLabel(size).split(' ')[0]
    const base = selectedImageModel.value?.effectiveCreditCost ?? selectedImageModel.value?.flatCreditCost ?? 1
    return (activeImageCapabilities.value.resolutionPricing?.[tier] ?? base * (tier === '4K' ? 4 : tier === '2K' ? 2 : 1)) * imageCount.value
  }
  if (creationMenu.value === 'resolution') {
    const base = selectedVideoModel.value?.effectiveCreditCost ?? selectedVideoModel.value?.flatCreditCost ?? 10
    return activeVideoCapabilities.value.pricing[`${option}:${videoDuration.value}`] ?? base * (option === '2160p' ? 4 : option === '1080p' ? 2 : 1) * Math.max(1, Math.ceil(videoDuration.value / 5))
  }
  if (creationMenu.value === 'duration') {
    const duration = Number.parseInt(option, 10)
    const base = selectedVideoModel.value?.effectiveCreditCost ?? selectedVideoModel.value?.flatCreditCost ?? 10
    return activeVideoCapabilities.value.pricing[`${videoResolution.value}:${duration}`] ?? base * (videoResolution.value === '2160p' ? 4 : videoResolution.value === '1080p' ? 2 : 1) * Math.max(1, Math.ceil(duration / 5))
  }
  return 0
}

function ratioShapeClass(option: string) { return `is-${option === '自动' ? 'auto' : option.replace(':', '-')}` }
function styleThumbnail(option: string) { return styleThumbnails[Math.max(0, imageStyles.indexOf(option)) % styleThumbnails.length] }
function outputFormatLabel(value: string): typeof outputFormat.value { return value.toLowerCase() === 'jpeg' || value.toLowerCase() === 'jpg' ? 'JPEG' : value.toLowerCase() === 'webp' ? 'WebP' : 'PNG' }

watchEffect(() => store.setMode(activeMode.value))
watch(activeMode, async (mode) => { closeCreationMenu(); creationOptionsOpen.value = false; creationPluginOpen.value = false; selectedInspirationId.value = ''; inspirationPreview.value = null; modeAssetLimit.value = 12; store.clearError(); if (mode === 'chat' && auth.isAuthenticated) void store.resumeCurrentChat(); if (mode === 'images' && !imageInspirations.value.length) await loadInspirations('IMAGE'); if ((mode === 'images' || mode === 'videos') && !imageTools.value.length) await loadImageTools(); if (mode === 'videos' && !videoInspirations.value.length) await loadInspirations('VIDEO'); if (mode === 'commerce' && !commerceInspirations.value.length) await loadInspirations('COMMERCE'); await nextTick(); syncInspirationNavigation() })
watch([assetSearch, assetTab, assetFilter], () => { libraryAssetLimit.value = 30 })
watch(() => store.currentConversationId, () => { const conversation = store.conversations.find((item) => item.id === store.currentConversationId); if (conversation?.model) model.value = conversation.model; messageNavigatorOpen.value = false; activeArtifact.value = null; void nextTick(syncMessageNavigator) })
watch(messageJumps, (messages) => { if (!messages.some((message) => message.id === activeMessageJumpId.value)) activeMessageJumpId.value = messages.at(-1)?.id || ''; void nextTick(syncMessageNavigator) })
watch(() => route.query.generation, () => { void syncGenerationRoute() })
watch(() => store.generations.map((generation) => `${generation.id}:${generation.status}:${generation.assets.length}`).join('|'), () => { if (activeMode.value === 'chat') void scrollThreadToBottom() })
watch(() => store.messages.map((message) => `${message.id}:${message.content.length}`).join('|'), () => { if (activeMode.value === 'chat' && store.isGenerating) void scrollThreadToBottom('auto') })
watch(generationPrompt, () => { void nextTick().then(resizeGenerationInput) })
onMounted(async () => {
  document.addEventListener('xinyue:close-popovers', closeWorkspacePopovers)
  const pendingPrompt = activeMode.value === 'images' ? consumeImagePrompt() : null
  if (pendingPrompt) generationPrompt.value = pendingPrompt.prompt
  const inspirationLoad = activeMode.value === 'images' ? Promise.all([loadInspirations('IMAGE'), loadImageTools()]) : activeMode.value === 'videos' ? Promise.all([loadInspirations('VIDEO'), loadImageTools()]) : activeMode.value === 'commerce' ? loadInspirations('COMMERCE') : Promise.resolve()
  await Promise.all([catalog.load(), inspirationLoad, loadModelCatalog({ applyDefaults: true, force: true }), auth.isAuthenticated ? loadAssistants() : Promise.resolve()])
  if (auth.isAuthenticated) {
    await store.hydrateWorkspace().catch(() => undefined)
    if (activeMode.value === 'chat') void store.resumeCurrentChat()
  }
  await syncGenerationRoute()
  await nextTick()
  syncInspirationNavigation()
  window.addEventListener('resize', syncInspirationNavigation)
  window.addEventListener('resize', positionCreationMenu)
  window.addEventListener('scroll', positionCreationMenu, true)
  window.addEventListener('resize', positionCreationMorePanel)
  window.addEventListener('scroll', positionCreationMorePanel, true)
  window.addEventListener('resize', resizeGenerationInput)
  window.addEventListener('focus', refreshModelCatalogOnFocus)
  document.addEventListener('pointerdown', closeCreationMenuOnOutside)
})
onUnmounted(() => {
  document.removeEventListener('xinyue:close-popovers', closeWorkspacePopovers)
  voiceRecognizer.value?.stop()
  window.clearTimeout(jumpHighlightTimer)
  window.clearTimeout(messageNavigatorCloseTimer)
  window.removeEventListener('resize', syncInspirationNavigation)
  window.removeEventListener('resize', positionCreationMenu)
  window.removeEventListener('scroll', positionCreationMenu, true)
  window.removeEventListener('resize', positionCreationMorePanel)
  window.removeEventListener('scroll', positionCreationMorePanel, true)
  window.removeEventListener('resize', resizeGenerationInput)
  window.removeEventListener('focus', refreshModelCatalogOnFocus)
  document.removeEventListener('pointerdown', closeCreationMenuOnOutside)
})

async function loadModelCatalog(options: { applyDefaults?: boolean; force?: boolean } = {}) {
  if (!options.force && catalogModels.value.length && Date.now() - modelCatalogLoadedAt < 15_000) return catalogModels.value
  try {
    modelCatalogRequest ||= api<CatalogModel[]>(auth.isAuthenticated ? '/users/me/models' : '/catalog/models', { cache: 'no-store' })
    catalogModels.value = await modelCatalogRequest
    modelCatalogLoadedAt = Date.now()
    const defaultChat = catalogModels.value.find((item) => item.capability === 'CHAT' && item.isDefault) || catalogModels.value.find((item) => item.capability === 'CHAT')
    const defaultImage = catalogModels.value.find((item) => item.capability === 'IMAGE' && item.isDefault) || catalogModels.value.find((item) => item.capability === 'IMAGE')
    const defaultVideo = catalogModels.value.find((item) => item.capability === 'VIDEO' && item.isDefault) || catalogModels.value.find((item) => item.capability === 'VIDEO')
    const defaultCommerce = catalogModels.value.find((item) => item.capability === 'COMMERCE' && item.isDefault) || catalogModels.value.find((item) => item.capability === 'COMMERCE')
    const chatSelectionExists = catalogModels.value.some((item) => item.capability === 'CHAT' && item.displayName === model.value)
    const imageSelectionExists = catalogModels.value.some((item) => item.capability === 'IMAGE' && item.displayName === imageModel.value)
    const videoSelectionExists = catalogModels.value.some((item) => item.capability === 'VIDEO' && item.displayName === videoModel.value)
    const commerceSelectionExists = catalogModels.value.some((item) => item.capability === 'COMMERCE' && item.displayName === commerceModel.value)
    if (!store.currentConversationId && defaultChat && (options.applyDefaults || !chatSelectionExists)) model.value = defaultChat.displayName
    if (defaultImage && (options.applyDefaults || !imageSelectionExists)) imageModel.value = defaultImage.displayName
    if (defaultVideo && (options.applyDefaults || !videoSelectionExists)) videoModel.value = defaultVideo.displayName
    if (defaultCommerce && (options.applyDefaults || !commerceSelectionExists)) commerceModel.value = defaultCommerce.displayName
    syncImageSelection()
    syncVideoSelection()
  } catch { /* Static fallbacks keep the workspace usable while the catalog is unavailable. */ }
  finally { modelCatalogRequest = null }
  return catalogModels.value
}
function refreshModelCatalogOnFocus() {
  if (Date.now() - modelCatalogLoadedAt >= 2_000) void loadModelCatalog({ force: true })
}
async function loadAssistants() { try { assistants.value = await api<AssistantOption[]>('/assistants') } catch { assistants.value = [] } }

function closeWorkspacePopovers() {
  attachmentOpen.value = false
  modelOpen.value = false
  assistantMenuOpen.value = false
  promptTemplatesOpen.value = false
  closeCreationMenu()
  creationOptionsOpen.value = false
  creationMorePanelStyle.value = { visibility: 'hidden' }
  creationPluginOpen.value = false
}
function collapseWorkspacePopovers() {
  document.dispatchEvent(new Event('xinyue:close-popovers'))
}

async function loadImageTools() {
  try { imageTools.value = await api<ImageTool[]>('/inspirations?mode=IMAGE_TOOL') }
  catch { imageTools.value = [] }
}

async function loadInspirations(mode: 'IMAGE' | 'VIDEO' | 'COMMERCE') {
  try {
    const rows = await api<Inspiration[]>(`/inspirations?mode=${mode}`)
    if (mode === 'IMAGE') imageInspirations.value = rows
    else if (mode === 'VIDEO') videoInspirations.value = rows
    else commerceInspirations.value = rows
  } catch {
    const fallback = mode === 'IMAGE'
      ? ['未来感商业海报', '宁静建筑风格海报', '典藏纸币微距摄影', '清爽夏日饮品海报']
      : mode === 'VIDEO'
        ? ['电影感城市追逐', '产品动态广告', '梦境建筑运镜', '时尚人像短片', '夏日饮品特写']
        : ['洗护产品素材包', '香氛商品详情页', '家居产品卖点页', '新品上市素材包']
    const rows = fallback.map((title, index) => ({ id: `${mode}-${index}`, title, prompt: title, badge: mode === 'COMMERCE' ? (index % 2 ? '详情页' : '素材包') : mode === 'VIDEO' ? '视频灵感' : '', imageUrl: `/assets/inspiration-${index % 4 + 1}.jpg`, options: mode === 'VIDEO' ? { resolution: '720p', duration: index % 2 ? 5 : 10, aspectRatio: index === 3 ? '9:16' : '16:9' } : undefined }))
    if (mode === 'IMAGE') imageInspirations.value = rows
    else if (mode === 'VIDEO') videoInspirations.value = rows
    else commerceInspirations.value = rows
  }
}

function toggleAttachmentMenu() { attachmentOpen.value = !attachmentOpen.value; modelOpen.value = false; assistantMenuOpen.value = false; promptTemplatesOpen.value = false }
function toggleModelMenu() {
  modelOpen.value = !modelOpen.value
  attachmentOpen.value = false
  assistantMenuOpen.value = false
  if (modelOpen.value) void loadModelCatalog({ force: true })
}
function openPromptLibrary() { attachmentOpen.value = false; void router.push('/prompts') }
function toggleComposerAssistants() { assistantMenuOpen.value = !assistantMenuOpen.value; modelOpen.value = false; attachmentOpen.value = false }
function clearAssistant() { assistantId.value = ''; assistantMenuOpen.value = false }
function selectAssistant(item: AssistantOption) { assistantId.value = item.id; assistantMenuOpen.value = false; attachmentOpen.value = false; if (item.defaultModel) model.value = item.defaultModel }
async function togglePromptTemplates() {
  promptTemplatesOpen.value = !promptTemplatesOpen.value
  if (!promptTemplatesOpen.value || promptTemplates.value.length) return
  promptTemplatesLoading.value = true
  try {
    const rows = await api<PromptTemplate[]>('/prompt-templates')
    promptTemplates.value = rows.map((item) => ({ ...item, variables: Array.isArray(item.variables) ? item.variables : [] }))
  } catch (reason) {
    store.lastError = reason instanceof Error ? reason.message : '提示词模板加载失败'
  } finally { promptTemplatesLoading.value = false }
}
function usePromptTemplate(item: PromptTemplate) {
  draft.value = draft.value.trim() ? `${draft.value.trim()}\n\n${item.prompt}` : item.prompt
  promptTemplatesOpen.value = false
  attachmentOpen.value = false
  void nextTick(() => { resizeComposer(); composerInput.value?.focus() })
}
function compactMessageJump(content: string) { return content.replace(/\s+/g, ' ').trim().slice(0, 76) }
function openMessageNavigator() { window.clearTimeout(messageNavigatorCloseTimer); messageNavigatorOpen.value = true }
function scheduleMessageNavigatorClose() { window.clearTimeout(messageNavigatorCloseTimer); messageNavigatorCloseTimer = window.setTimeout(() => { messageNavigatorOpen.value = false }, 220) }
function closeMessageNavigatorOnBlur(event: FocusEvent) { if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null)) messageNavigatorOpen.value = false }
function syncMessageNavigator() {
  const container = thread.value
  if (!container || !messageJumps.value.length) return
  const anchor = container.getBoundingClientRect().top + Math.min(120, container.clientHeight * 0.28)
  const elements = [...container.querySelectorAll<HTMLElement>('[data-user-message="true"]')]
  const nearest = elements.reduce<{ id: string; distance: number } | null>((best, element) => {
    const id = element.dataset.messageId || ''
    const distance = Math.abs(element.getBoundingClientRect().top - anchor)
    return id && (!best || distance < best.distance) ? { id, distance } : best
  }, null)
  if (nearest) activeMessageJumpId.value = nearest.id
}
function jumpToMessage(messageId: string) {
  const target = [...(thread.value?.querySelectorAll<HTMLElement>('[data-user-message="true"]') || [])].find((element) => element.dataset.messageId === messageId)
  if (!target) return
  activeMessageJumpId.value = messageId
  messageNavigatorOpen.value = false
  jumpHighlightId.value = messageId
  target.scrollIntoView({ behavior: 'smooth', block: 'start' })
  window.clearTimeout(jumpHighlightTimer)
  jumpHighlightTimer = window.setTimeout(() => { if (jumpHighlightId.value === messageId) jumpHighlightId.value = '' }, 1400)
}
function modelCost(item: CatalogModel) { return item.effectiveCreditCost ?? item.flatCreditCost ?? 0 }
function modelSubtitle(item: CatalogModel) { return item.description || (item.upstreamModel !== item.displayName ? item.upstreamModel : '') }
function selectModel(value: string) { model.value = value; modelOpen.value = false; if (auth.isAuthenticated) void store.setConversationModel(value).catch((reason) => { store.lastError = reason instanceof Error ? reason.message : '模型保存失败' }) }
function resizeComposer() {
  if (!composerInput.value) return
  composerInput.value.style.height = 'auto'
  const height = Math.min(composerInput.value.scrollHeight, 160)
  composerInput.value.style.height = `${height}px`
  composerInput.value.style.overflowY = composerInput.value.scrollHeight > 160 ? 'auto' : 'hidden'
}
function resizeGenerationInput() {
  const input = generationInput.value
  if (!input) return
  input.style.height = 'auto'
  const viewportLimit = window.innerWidth <= 640
    ? Math.min(240, Math.floor(window.innerHeight * 0.36))
    : Math.min(320, Math.floor(window.innerHeight * 0.42))
  const height = Math.max(38, Math.min(input.scrollHeight, viewportLimit))
  input.style.height = `${height}px`
  input.style.overflowY = input.scrollHeight > viewportLimit ? 'auto' : 'hidden'
}
function toggleVoice(target: 'chat' | 'creation' = 'chat') {
  if (voiceListening.value) { voiceRecognizer.value?.stop(); return }
  const speechWindow = window as Window & { SpeechRecognition?: SpeechRecognizerConstructor; webkitSpeechRecognition?: SpeechRecognizerConstructor }
  const Constructor = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition
  if (!Constructor) { store.lastError = '当前浏览器不支持语音输入，请使用 Chrome 或 Edge'; return }
  const recognizer = new Constructor()
  voiceTarget.value = target
  recognizer.lang = document.documentElement.lang.startsWith('en') ? 'en-US' : 'zh-CN'
  recognizer.interimResults = false
  recognizer.continuous = false
  recognizer.onresult = (event) => {
    const transcript = Object.values(event.results).map((result) => result[0]?.transcript || '').join('')
    if (transcript && voiceTarget.value === 'creation') {
      generationPrompt.value = `${generationPrompt.value}${generationPrompt.value ? ' ' : ''}${transcript}`
      void nextTick(resizeGenerationInput)
    } else if (transcript) {
      draft.value = `${draft.value}${draft.value ? ' ' : ''}${transcript}`
      void nextTick(resizeComposer)
    }
  }
  recognizer.onend = () => { voiceListening.value = false; voiceRecognizer.value = null }
  recognizer.onerror = () => { voiceListening.value = false; voiceRecognizer.value = null; store.lastError = '语音输入没有获得麦克风权限' }
  voiceRecognizer.value = recognizer
  voiceListening.value = true
  try { recognizer.start() } catch { voiceListening.value = false; voiceRecognizer.value = null; store.lastError = '语音输入启动失败' }
}
function startMessageEdit(message: { id: string; content: string }) { editingMessageId.value = message.id; editingMessageContent.value = message.content }
function cancelMessageEdit() { editingMessageId.value = ''; editingMessageContent.value = '' }
function copyMessage(message: { id: string; content: string }) {
  navigator.clipboard?.writeText(message.content).catch(() => undefined)
  copiedMessageId.value = message.id
  window.setTimeout(() => { if (copiedMessageId.value === message.id) copiedMessageId.value = '' }, 1600)
}
async function exportChatAnswer(message: Message, format: 'docx' | 'xlsx') {
  if (!store.currentConversationId || exportingMessage.value) return
  exportingMessage.value = `${message.id}:${format}`
  try {
    const deliverable = await api<{ name: string; contentUrl: string }>('/office/exports', { method: 'POST', body: JSON.stringify({ conversationId: store.currentConversationId, messageId: message.id, format }) })
    const response = await fetch(apiUrl(deliverable.contentUrl), { credentials: 'include' })
    if (!response.ok) throw new Error(`文件下载失败 (${response.status})`)
    const objectUrl = URL.createObjectURL(await response.blob())
    const link = document.createElement('a')
    link.href = objectUrl
    link.download = deliverable.name
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
    await store.refreshAssets()
  } catch (reason) {
    store.lastError = reason instanceof Error ? reason.message : '回答导出失败'
  } finally {
    exportingMessage.value = ''
  }
}
function openCodeArtifact(artifact: CodeArtifact) { activeArtifact.value = artifact }
async function saveMessageEdit(messageId: string) {
  if (!editingMessageContent.value.trim()) return
  try { await store.branchMessage(messageId, editingMessageContent.value, model.value); cancelMessageEdit(); await scrollThreadToBottom() }
  catch { /* Store exposes the server error in-page. */ }
}
async function retryAssistantMessage(assistantMessageId: string) {
  const assistantIndex = store.messages.findIndex((message) => message.id === assistantMessageId)
  const source = store.messages.slice(0, assistantIndex).reverse().find((message) => message.role === 'user')
  if (!source) return
  try { await store.branchMessage(source.id, source.content, model.value); await scrollThreadToBottom() }
  catch { /* Store exposes the server error in-page. */ }
}
async function setMessageFeedback(messageId: string, value: 'UP' | 'DOWN') {
  const message = store.messages.find((item) => item.id === messageId)
  const nextValue = message?.feedback === value ? null : value
  try { await store.setMessageFeedback(messageId, nextValue) }
  catch (reason) { store.lastError = reason instanceof Error ? reason.message : '反馈提交失败' }
}
async function scrollThreadToBottom(behavior: ScrollBehavior = 'smooth') { await nextTick(); thread.value?.scrollTo({ top: thread.value.scrollHeight, behavior }) }
function handleComposerKeydown(event: KeyboardEvent) { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void submitMessage() } }
async function submitMessage() {
  if (store.isGenerating) return
  if (!requireAuth('/chat')) return
  const content = draft.value
  if (!content.trim()) return
  const pendingAttachments = [...attachments.value]
  draft.value = ''
  attachments.value = []
  attachmentOpen.value = false; modelOpen.value = false
  await nextTick()
  resizeComposer()
  try {
    await store.sendMessage(content, { model: model.value, assistantId: assistantId.value || undefined, pluginId: chatPluginId.value || undefined, assetIds: pendingAttachments.map((asset) => asset.id), agentMode: agentMode.value })
    await scrollThreadToBottom()
  } catch (reason) {
    if (reason instanceof ChatSendError && reason.restoreDraft) {
      if (!draft.value.trim()) draft.value = content
      if (!attachments.value.length) attachments.value = pendingAttachments
    }
    await nextTick()
    resizeComposer()
  }
}
function openFilePicker(purpose: FilePurpose) { if (!requireAuth(activeMode.value === 'assets' ? '/files' : activeMode.value === 'commerce' ? '/commerce' : activeMode.value === 'images' ? '/image' : activeMode.value === 'videos' ? '/video' : '/chat')) return; filePurpose.value = purpose; attachmentOpen.value = false; newMenuOpen.value = false; if (fileInput.value) { fileInput.value.value = ''; fileInput.value.click() } }
async function handleFiles(event: Event) {
  const files = Array.from((event.target as HTMLInputElement).files || [])
  if (!files.length) return
  uploading.value = true; store.clearError()
  try {
    const purpose = filePurpose.value === 'creation' ? 'reference' : filePurpose.value === 'mask' ? 'mask' : filePurpose.value === 'chat-file' ? 'attachment' : 'library'
    const uploaded = await store.uploadFiles(files, filePurpose.value === 'creation' || filePurpose.value === 'mask' ? 'IMAGE' : undefined, store.currentProjectId || undefined, purpose)
    if (filePurpose.value === 'chat-file') attachments.value.push(...uploaded)
    else if (filePurpose.value === 'creation') creationAttachments.value.push(...uploaded)
    else if (filePurpose.value === 'mask') maskAttachment.value = uploaded[0] || null
  } catch (reason) { store.lastError = reason instanceof Error ? reason.message : '文件上传失败' }
  finally { uploading.value = false }
}
function closeCreationMenu() {
  creationMenu.value = null
  creationMenuAnchor.value = null
  creationMenuAnchorRect.value = null
  creationMenuStyle.value = {}
}
function closeCreationMenuOnOutside(event: PointerEvent) {
  const target = event.target as Node
  if (creationComposer.value?.contains(target) || creationMorePanel.value?.contains(target) || creationOptionsMenu.value?.contains(target)) return
  closeCreationMenu()
  creationOptionsOpen.value = false
  creationMorePanelStyle.value = { visibility: 'hidden' }
}
async function toggleCreationMenu(menu: NonNullable<typeof creationMenu.value>, event: MouseEvent) {
  if (creationMenu.value === menu) { closeCreationMenu(); return }
  const anchor = event.currentTarget as HTMLElement
  const anchorRect = anchor.getBoundingClientRect()
  const openedFromMore = Boolean(anchor.closest('.creation-more-panel'))
  if (!openedFromMore) document.dispatchEvent(new Event('xinyue:close-popovers'))
  creationOptionsOpen.value = openedFromMore
  creationMenu.value = menu
  creationMenuAnchor.value = anchor
  creationMenuAnchorRect.value = { left: anchorRect.left, right: anchorRect.right, top: anchorRect.top, bottom: anchorRect.bottom, width: anchorRect.width }
  creationMenuStyle.value = { visibility: 'hidden' }
  await nextTick()
  positionCreationMenu()
}
function toggleMoreOptions() {
  const shouldOpen = !creationOptionsOpen.value
  if (shouldOpen) document.dispatchEvent(new Event('xinyue:close-popovers'))
  creationOptionsOpen.value = shouldOpen
  if (shouldOpen) creationPluginOpen.value = false
  if (shouldOpen) { creationMorePanelStyle.value = { visibility: 'hidden' }; void nextTick(positionCreationMorePanel) }
  else creationMorePanelStyle.value = { visibility: 'hidden' }
}
function positionCreationMorePanel() {
  if (!creationOptionsOpen.value || !creationMoreTrigger.value || !creationMorePanel.value) return
  const anchor = creationMoreTrigger.value.getBoundingClientRect()
  const panel = creationMorePanel.value.getBoundingClientRect()
  const gap = 8
  const left = Math.min(window.innerWidth - panel.width - 12, Math.max(12, anchor.left + anchor.width / 2 - panel.width / 2))
  const roomBelow = window.innerHeight - anchor.bottom - gap
  const top = roomBelow >= panel.height ? anchor.bottom + gap : Math.max(12, anchor.top - panel.height - gap)
  creationMorePanelStyle.value = { left: `${left}px`, top: `${top}px`, visibility: 'visible' }
}
function positionCreationMenu() {
  const anchor = creationMenuAnchor.value
  const menu = creationOptionsMenu.value
  if (!anchor || !menu || !creationMenu.value) return
  const liveAnchorRect = anchor.isConnected ? anchor.getBoundingClientRect() : null
  const anchorRect = liveAnchorRect?.width ? liveAnchorRect : creationMenuAnchorRect.value
  if (!anchorRect) return
  const viewportInset = 12
  const gap = 8
  const desiredHeight = menu.scrollHeight
  const spaceAbove = Math.max(0, anchorRect.top - viewportInset - gap)
  const spaceBelow = Math.max(0, window.innerHeight - anchorRect.bottom - viewportInset - gap)
  const placeAbove = desiredHeight <= spaceAbove || spaceAbove > spaceBelow
  const availableHeight = placeAbove ? spaceAbove : spaceBelow
  const renderedHeight = Math.max(72, Math.min(desiredHeight, availableHeight || 72))
  const menuWidth = menu.getBoundingClientRect().width
  const maximumLeft = Math.max(viewportInset, window.innerWidth - menuWidth - viewportInset)
  const anchoredLeft = creationMenu.value === 'size'
    ? anchorRect.left + (anchorRect.width - menuWidth) / 2
    : anchorRect.left
  const left = Math.min(maximumLeft, Math.max(viewportInset, anchoredLeft))
  const top = placeAbove
    ? Math.max(viewportInset, anchorRect.top - renderedHeight - gap)
    : Math.min(window.innerHeight - renderedHeight - viewportInset, anchorRect.bottom + gap)
  creationMenuStyle.value = {
    bottom: 'auto',
    left: `${left}px`,
    maxHeight: desiredHeight <= availableHeight ? 'none' : `${renderedHeight}px`,
    right: 'auto',
    top: `${top}px`,
    visibility: 'visible',
  }
}
function isCreationOptionActive(option: string) {
  if (creationMenu.value === 'model') return activeCreationModel.value === option
  if (creationMenu.value === 'type') return creationType.value === option
  if (creationMenu.value === 'size') return autoMode.value === option
  if (creationMenu.value === 'platform') return commercePlatform.value === option
  if (creationMenu.value === 'resolution') return videoResolution.value === option
  if (creationMenu.value === 'duration') return `${videoDuration.value} 秒` === option
  if (creationMenu.value === 'aspect') return videoAspectRatio.value === option
  if (creationMenu.value === 'style') return imageStyle.value === option
  if (creationMenu.value === 'quality') return quality.value === option
  if (creationMenu.value === 'modules') return `${commerceModules.value} 个模块` === option
  if (creationMenu.value === 'count') return `${imageCount.value} 张` === option
  if (creationMenu.value === 'format') return outputFormat.value === option
  if (creationMenu.value === 'background') return imageBackground.value === option
  return false
}
function selectCreationOption(option: string) {
  if (creationMenu.value === 'model') { if (activeMode.value === 'videos') { videoModel.value = option; syncVideoSelection() } else if (activeMode.value === 'commerce') commerceModel.value = option; else { imageModel.value = option; syncImageSelection() } }
  else if (creationMenu.value === 'type') creationType.value = option
  else if (creationMenu.value === 'size') autoMode.value = option
  else if (creationMenu.value === 'platform') commercePlatform.value = option
  else if (creationMenu.value === 'resolution') videoResolution.value = option
  else if (creationMenu.value === 'duration') videoDuration.value = Number.parseInt(option, 10)
  else if (creationMenu.value === 'aspect') videoAspectRatio.value = option
  else if (creationMenu.value === 'style') imageStyle.value = imageStyle.value === option ? '' : option
  else if (creationMenu.value === 'quality') quality.value = option
  else if (creationMenu.value === 'modules') commerceModules.value = Number.parseInt(option, 10)
  else if (creationMenu.value === 'count') imageCount.value = Number.parseInt(option, 10)
  else if (creationMenu.value === 'format') {
    outputFormat.value = option as typeof outputFormat.value
    if (outputFormat.value === 'JPEG' && imageBackground.value === '透明背景') imageBackground.value = '不透明背景'
  } else if (creationMenu.value === 'background') {
    imageBackground.value = option as typeof imageBackground.value
    if (imageBackground.value === '透明背景' && outputFormat.value === 'JPEG') outputFormat.value = 'PNG'
  }
  closeCreationMenu()
  if (window.innerWidth <= 640) creationOptionsOpen.value = false
}
async function switchCreationMode(mode: 'images' | 'videos') {
  if (activeMode.value === mode) return
  closeCreationMenu()
  creationOptionsOpen.value = false
  store.clearError()
  if (mode === 'videos') selectedImageToolId.value = ''
  await router.push(mode === 'videos' ? '/video' : '/image')
  await nextTick()
  generationInput.value?.focus({ preventScroll: true })
}
async function submitGeneration() {
  if (!requireAuth(activeMode.value === 'commerce' ? '/commerce' : activeMode.value === 'videos' ? '/video' : '/image')) return
  const prompt = generationPrompt.value.trim() || (selectedImageTool.value ? `使用${selectedImageTool.value.title}处理这张图片` : '')
  if (!prompt) return
  if (selectedImageTool.value && !creationAttachments.value.length) { store.lastError = '请先上传一张需要处理的参考图片'; openFilePicker('creation'); return }
  try {
    const job = await store.startGeneration({ mode: activeMode.value, prompt, model: activeCreationModel.value, ratio: imageSizeForRatio(autoMode.value), quality: providerQuality(quality.value), style: activeMode.value === 'images' && imageStyle.value ? imageStyle.value : undefined, count: activeMode.value === 'images' ? imageCount.value : 1, modules: commerceModules.value, creationType: creationType.value, platform: activeMode.value === 'commerce' ? commercePlatform.value : undefined, referenceAssetIds: creationAttachments.value.map((asset) => asset.id), maskAssetId: maskAttachment.value?.id, outputFormat: providerOutputFormat(outputFormat.value), background: providerBackground(imageBackground.value), outputCompression: outputFormat.value === 'PNG' ? undefined : 90, resolution: videoResolution.value, duration: videoDuration.value, aspectRatio: videoAspectRatio.value, creditCost: currentGenerationCost.value, pluginId: creationPluginId.value || undefined, creationToolId: selectedImageToolId.value || undefined }, undefined, false, model.value)
    generationPrompt.value = ''; creationAttachments.value = []; maskAttachment.value = null; selectedImageToolId.value = ''
    await openGenerationConversation(job.id)
  } catch { /* Store exposes the server error in-page. */ }
}

async function selectImageTool(tool: ImageTool) {
  if (activeMode.value === 'videos') {
    await switchCreationMode('images')
    await nextTick()
  }
  selectedImageToolId.value = selectedImageToolId.value === tool.id ? '' : tool.id
  closeWorkspacePopovers()
  if (!selectedImageToolId.value) return
  store.clearError()
  if (!generationPrompt.value.trim() && tool.options?.placeholder) generationPrompt.value = ''
  if (!creationAttachments.value.length) openFilePicker('creation')
  else void nextTick(() => generationInput.value?.focus({ preventScroll: true }))
}

async function retryVideoGeneration(generation: GenerationRun) {
  const job = await store.retryGeneration(generation.id).catch((reason) => { store.lastError = reason instanceof Error ? reason.message : '重新生成失败'; return null })
  if (!job) return
  await openGenerationConversation(job.id, true)
}

async function openGenerationConversation(jobId: string, replace = false) {
  const target = { path: '/chat', query: { generation: jobId } }
  if (replace) await router.replace(target)
  else await router.push(target)
  await nextTick()
  await scrollThreadToBottom()
}

async function syncGenerationRoute() {
  if (!auth.isAuthenticated || activeMode.value !== 'chat') return
  const jobId = typeof route.query.generation === 'string' ? route.query.generation : ''
  if (!jobId || store.activeGeneration?.id === jobId) return
  await store.loadGeneration(jobId).catch((reason) => { store.lastError = reason instanceof Error ? reason.message : '生成任务加载失败' })
  await scrollThreadToBottom()
}

async function retryImageGeneration(generation?: GenerationRun) {
  const job = await store.retryGeneration(generation?.id).catch((reason) => { store.lastError = reason instanceof Error ? reason.message : '重新生成失败'; return null })
  if (!job) return
  await openGenerationConversation(job.id, true)
}

async function retryAssetGeneration(asset: StudioAsset) {
  if (!asset.jobId) return
  try {
    await store.loadGeneration(asset.jobId)
    const job = await store.retryGeneration(asset.jobId)
    if (!job) return
    await openGenerationConversation(job.id)
  } catch (reason) {
    store.lastError = reason instanceof Error ? reason.message : '重新生成失败'
  }
}

async function stopGeneration(generation: GenerationRun) {
  if (!['QUEUED', 'RUNNING'].includes(generation.status)) return
  await store.cancelGeneration(generation.id)
}

async function downloadGeneratedAsset(asset: StudioAsset) {
  if (!asset.contentUrl) return
  try {
    const response = await fetch(asset.contentUrl, { credentials: 'include' })
    if (!response.ok) throw new Error(`文件下载失败 (${response.status})`)
    const blob = await response.blob()
    const objectUrl = URL.createObjectURL(blob)
    const link = document.createElement('a')
    const extension = blob.type.split('/')[1]?.replace('jpeg', 'jpg') || 'png'
    const rawName = asset.title || `generated-${asset.id.slice(-8)}`
    link.href = objectUrl
    link.download = /\.[a-z0-9]{2,5}$/i.test(rawName) ? rawName : `${rawName}.${extension}`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(objectUrl)
  } catch (reason) {
    store.lastError = reason instanceof Error ? reason.message : '文件下载失败'
  }
}

async function useGeneratedAssetAsReference(asset: StudioAsset, generation?: GenerationRun) {
  creationAttachments.value = [asset]
  generationPrompt.value = generation?.prompt || store.activeGeneration?.prompt || ''
  const options: Record<string, unknown> = asset.options || (generation ? { size: generation.request.ratio, quality: generation.request.quality, count: generation.request.count, outputFormat: generation.request.outputFormat, background: generation.request.background } : {})
  if (typeof options.size === 'string') autoMode.value = imageRatioForSize(options.size)
  if (typeof options.quality === 'string') quality.value = qualityLabel(options.quality)
  if (typeof options.style === 'string') imageStyle.value = options.style
  if (typeof options.outputFormat === 'string') outputFormat.value = options.outputFormat.toLowerCase() === 'jpeg' ? 'JPEG' : options.outputFormat.toLowerCase() === 'webp' ? 'WebP' : 'PNG'
  if (typeof options.background === 'string') imageBackground.value = backgroundLabel(options.background)
  if (typeof options.count === 'number') imageCount.value = Math.min(activeImageCapabilities.value.maxCount, Math.max(1, options.count))
  await router.push('/image')
  await nextTick()
  generationInput.value?.focus({ preventScroll: true })
}

async function useAssetPrompt(asset: StudioAsset) {
  generationPrompt.value = asset.prompt || ''
  if (asset.kind === 'video') {
    const options = asset.options || {}
    if (typeof options.resolution === 'string' && activeVideoCapabilities.value.resolutions.includes(options.resolution)) videoResolution.value = options.resolution
    if (typeof options.duration === 'number' && activeVideoCapabilities.value.durations.includes(options.duration)) videoDuration.value = options.duration
    if (typeof options.aspectRatio === 'string' && activeVideoCapabilities.value.aspectRatios.includes(options.aspectRatio)) videoAspectRatio.value = options.aspectRatio
  }
  await router.push(asset.kind === 'video' ? '/video' : '/image')
  await nextTick()
  generationInput.value?.focus({ preventScroll: true })
}
async function deletePreviewAsset() {
  const assetId = previewAsset.value?.id
  if (!assetId) return
  await deleteAsset(assetId)
}
async function useCommerceAsset(asset: StudioAsset | undefined, generation: GenerationRun) {
  if (!asset) return
  selectedCommerceRun.value = null
  creationAttachments.value = [asset]
  generationPrompt.value = generation.prompt
  creationType.value = generation.request.creationType || '详情页'
  await nextTick()
  creationComposer.value?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  generationInput.value?.focus({ preventScroll: true })
}
function syncInspirationNavigation() {
  const rail = inspirationRail.value
  if (!rail) { canScrollInspirationPrevious.value = false; canScrollInspirationNext.value = false; return }
  const maximum = Math.max(0, rail.scrollWidth - rail.clientWidth)
  canScrollInspirationPrevious.value = rail.scrollLeft > 2
  canScrollInspirationNext.value = rail.scrollLeft < maximum - 2
}
function scrollInspiration(direction: number) {
  const rail = inspirationRail.value
  if (!rail) return
  rail.scrollBy({ left: direction * Math.max(470, rail.clientWidth * 0.72), behavior: 'smooth' })
}
function openInspiration(item: Inspiration) {
  selectedInspirationId.value = item.id
  inspirationPreview.value = item
}
function playInspirationVideo(event: Event) { void (event.currentTarget as HTMLVideoElement).play().catch(() => undefined) }
function pauseInspirationVideo(event: Event) { const video = event.currentTarget as HTMLVideoElement; video.pause(); video.currentTime = 0 }
async function useInspiration(item: Inspiration | null) {
  if (!item) return
  selectedInspirationId.value = item.id
  inspirationPreview.value = null
  generationPrompt.value = item.prompt
  if (item.model) {
    if (activeMode.value === 'videos') videoModel.value = item.model
    else imageModel.value = item.model
  }
  const options = item.options || {}
  if (activeMode.value === 'videos') {
    if (typeof options.resolution === 'string' && activeVideoCapabilities.value.resolutions.includes(options.resolution)) videoResolution.value = options.resolution
    if (typeof options.duration === 'number' && activeVideoCapabilities.value.durations.includes(options.duration)) videoDuration.value = options.duration
    if (typeof options.aspectRatio === 'string' && activeVideoCapabilities.value.aspectRatios.includes(options.aspectRatio)) videoAspectRatio.value = options.aspectRatio
  } else if (activeMode.value === 'commerce' && typeof options.platform === 'string') autoMode.value = options.platform
  else if (typeof options.ratio === 'string') autoMode.value = imageRatioForSize(options.ratio)
  if (typeof options.quality === 'string') quality.value = qualityLabel(options.quality)
  if (typeof options.outputFormat === 'string') outputFormat.value = options.outputFormat.toLowerCase() === 'jpeg' ? 'JPEG' : options.outputFormat.toLowerCase() === 'webp' ? 'WebP' : 'PNG'
  if (typeof options.background === 'string') imageBackground.value = backgroundLabel(options.background)
  if (typeof options.count === 'number') imageCount.value = Math.min(10, Math.max(1, options.count))
  if (typeof options.modules === 'number') commerceModules.value = options.modules
  if (typeof options.creationType === 'string') creationType.value = options.creationType
  await nextTick()
  creationComposer.value?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  generationInput.value?.focus({ preventScroll: true })
}
function formatDate(value: number) { return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(value) }
function closeProjectModal() { projectModalOpen.value = false; projectName.value = ''; projectBrief.value = ''; projectError.value = ''; projectAdvanced.value = false }
async function createProject() { if (!requireAuth('/projects')) return; if (!projectName.value.trim()) { projectError.value = '请输入项目名称'; return } try { await store.createProject(projectName.value, projectBrief.value); closeProjectModal() } catch (reason) { projectError.value = reason instanceof Error ? reason.message : '项目创建失败' } }
function closeProjectDetails() {
  projectDetailOpen.value = false
  projectDetail.value = null
  projectVersions.value = []
  projectVersionPreview.value = null
  projectSkillStatus.value = null
  projectSkillCandidate.value = null
  projectSkillEditorOpen.value = false
  projectDetailError.value = ''
}
function formatProjectSnapshot(snapshot: ProjectVersion['snapshot']) { return JSON.stringify(snapshot, null, 2) }
function fillProjectEditor(project: Project) {
  projectDetail.value = project
  projectWorkflowStatus.value = project.workflowStatus
  projectDefaultModel.value = project.defaultModel
  projectDefaultAssistantId.value = project.defaultAssistantId || ''
  projectInstructions.value = project.instructions || ''
  projectDefaultPrompt.value = project.workflowConfig.defaultPrompt
  projectOutputRequirements.value = project.workflowConfig.outputRequirements
  projectSteps.value = project.workflowConfig.steps.map((step, index) => ({ ...step, sortOrder: index }))
  projectVersionLabel.value = ''
}
async function openProjectDetails(project: Project) {
  if (!requireAuth('/projects')) return
  projectDetailOpen.value = true
  projectDetailLoading.value = true
  projectDetailError.value = ''
  try {
    const detail = await store.loadProjectDetail(project.id)
    const assistantPromise = detail.accessRole === 'OWNER' && !assistants.value.length ? loadAssistants() : Promise.resolve()
    const versionsPromise = detail.accessRole === 'OWNER' ? store.loadProjectVersions(project.id) : Promise.resolve([])
    const [versions, , skillStatus] = await Promise.all([versionsPromise, assistantPromise, store.loadProjectSkill(project.id)])
    fillProjectEditor(detail)
    projectVersions.value = versions
    projectSkillStatus.value = skillStatus
    projectSkillConversationId.value = projectSkillConversations.value[0]?.id || ''
  } catch (reason) {
    projectDetailError.value = reason instanceof Error ? reason.message : '项目详情加载失败'
  } finally { projectDetailLoading.value = false }
}
function projectSkillChangeLabel(type: ProjectSkillVersion['changeType']) {
  return type === 'SUMMARY' ? '对话总结' : type === 'RESTORE' ? '版本回退' : type === 'DISABLE' ? '已停用' : '手动设置'
}
function openProjectSkillEditor() {
  projectSkillName.value = projectSkillStatus.value?.active?.name || ''
  projectSkillContent.value = projectSkillStatus.value?.active?.content || ''
  projectSkillEditorOpen.value = true
}
async function refreshProjectSkill() {
  if (projectDetail.value) projectSkillStatus.value = await store.loadProjectSkill(projectDetail.value.id)
}
async function saveProjectSkill() {
  if (!projectDetail.value || projectSkillBusy.value) return
  projectSkillBusy.value = true
  projectDetailError.value = ''
  try {
    await store.setProjectSkill(projectDetail.value.id, { name: projectSkillName.value, content: projectSkillContent.value, changeSummary: '创建者手动更新项目技能' })
    projectSkillEditorOpen.value = false
    await refreshProjectSkill()
  } catch (reason) { projectDetailError.value = reason instanceof Error ? reason.message : '项目技能保存失败' }
  finally { projectSkillBusy.value = false }
}
async function summarizeProjectSkill() {
  if (!projectDetail.value || !projectSkillConversationId.value || projectSkillBusy.value) return
  projectSkillBusy.value = true
  projectSkillCandidate.value = null
  projectDetailError.value = ''
  try { projectSkillCandidate.value = await store.summarizeProjectSkill(projectDetail.value.id, { conversationId: projectSkillConversationId.value, request: projectSkillRequest.value.trim() || undefined }) }
  catch (reason) { projectDetailError.value = reason instanceof Error ? reason.message : '技能总结失败' }
  finally { projectSkillBusy.value = false }
}
async function activateProjectSkillCandidate() {
  if (!projectDetail.value || !projectSkillCandidate.value || projectSkillBusy.value) return
  projectSkillBusy.value = true
  projectDetailError.value = ''
  try {
    const candidate = projectSkillCandidate.value
    await store.activateProjectSkillSummary(projectDetail.value.id, { name: candidate.name, content: candidate.content, changeSummary: candidate.changeSummary, sourceConversationId: candidate.sourceConversation.id })
    projectSkillCandidate.value = null
    projectSkillRequest.value = ''
    await refreshProjectSkill()
  } catch (reason) { projectDetailError.value = reason instanceof Error ? reason.message : '技能替换失败' }
  finally { projectSkillBusy.value = false }
}
async function restoreProjectSkill(version: ProjectSkillVersion) {
  if (!projectDetail.value || projectSkillBusy.value || !window.confirm(`确认回退到技能 v${version.version}？系统会保留当前版本并新增一条回退记录。`)) return
  projectSkillBusy.value = true
  projectSkillRestoringVersion.value = version.version
  projectDetailError.value = ''
  try { await store.restoreProjectSkill(projectDetail.value.id, version.version); await refreshProjectSkill() }
  catch (reason) { projectDetailError.value = reason instanceof Error ? reason.message : '技能回退失败' }
  finally { projectSkillBusy.value = false; projectSkillRestoringVersion.value = null }
}
async function disableProjectSkill() {
  if (!projectDetail.value || projectSkillBusy.value || !window.confirm('确认停用项目技能？后续对话将不再自动使用该技能，历史版本会继续保留。')) return
  projectSkillBusy.value = true
  projectDetailError.value = ''
  try { await store.disableProjectSkill(projectDetail.value.id); await refreshProjectSkill() }
  catch (reason) { projectDetailError.value = reason instanceof Error ? reason.message : '技能停用失败' }
  finally { projectSkillBusy.value = false }
}
async function deleteProjectQuestion(message: Message) {
  if (!message.canDelete || !window.confirm('删除这条提问？删除后你将看不到该内容，项目创建者仍可在审计视图中查看。')) return
  try { await store.softDeleteMessage(message.id) }
  catch (reason) { store.lastError = reason instanceof Error ? reason.message : '提问删除失败' }
}
async function inviteProjectMember() {
  if (!projectDetail.value || !projectMemberEmail.value.trim() || projectMemberBusy.value) return
  projectMemberBusy.value = true
  projectDetailError.value = ''
  try {
    await store.addProjectMember(projectDetail.value.id, projectMemberEmail.value)
    projectDetail.value = await store.loadProjectDetail(projectDetail.value.id)
    projectMemberEmail.value = ''
  } catch (reason) { projectDetailError.value = reason instanceof Error ? reason.message : '成员邀请失败' }
  finally { projectMemberBusy.value = false }
}
async function removeProjectMember(member: ProjectMember) {
  if (!projectDetail.value || projectMemberBusy.value || !window.confirm(`确认移除成员“${member.user.displayName}”？`)) return
  projectMemberBusy.value = true
  projectDetailError.value = ''
  try {
    await store.removeProjectMember(projectDetail.value.id, member.userId)
    projectDetail.value = await store.loadProjectDetail(projectDetail.value.id)
  } catch (reason) { projectDetailError.value = reason instanceof Error ? reason.message : '移除成员失败' }
  finally { projectMemberBusy.value = false }
}
function addProjectStep() { projectSteps.value.push({ id: createClientId(), title: '', description: '', status: 'TODO', sortOrder: projectSteps.value.length }) }
function removeProjectStep(index: number) { projectSteps.value.splice(index, 1); projectSteps.value.forEach((step, stepIndex) => { step.sortOrder = stepIndex }) }
async function saveProjectWorkflow() {
  if (!projectDetail.value || projectSaving.value) return
  const invalid = projectSteps.value.find((step) => !step.title.trim())
  if (invalid) { projectDetailError.value = '请为每个工作流步骤填写名称'; return }
  projectSaving.value = true
  projectDetailError.value = ''
  try {
    const project = await store.updateProjectWorkflow(projectDetail.value.id, { workflowStatus: projectWorkflowStatus.value, workflowConfig: { steps: projectSteps.value.map((step) => ({ id: step.id, title: step.title.trim(), description: step.description.trim(), status: step.status })), defaultPrompt: projectDefaultPrompt.value.trim(), outputRequirements: projectOutputRequirements.value.trim() }, defaultModel: projectDefaultModel.value.trim(), defaultAssistantId: projectDefaultAssistantId.value || null, instructions: projectInstructions.value.trim(), versionLabel: projectVersionLabel.value.trim() || undefined, changeSummary: '保存项目工作流' })
    fillProjectEditor(project)
    projectVersions.value = await store.loadProjectVersions(project.id)
  } catch (reason) {
    projectDetailError.value = reason instanceof Error ? reason.message : '工作流保存失败'
  } finally { projectSaving.value = false }
}
async function createProjectCheckpoint() {
  if (!projectDetail.value) return
  try {
    await store.createProjectVersion(projectDetail.value.id, { label: `检查点 ${projectDetail.value.revision + 1}`, changeSummary: '手动创建版本检查点' })
    const project = await store.loadProjectDetail(projectDetail.value.id)
    fillProjectEditor(project)
    projectVersions.value = await store.loadProjectVersions(project.id)
  } catch (reason) { projectDetailError.value = reason instanceof Error ? reason.message : '版本创建失败' }
}
async function restoreProject(version: ProjectVersion) {
  if (!projectDetail.value || projectRestoringVersion.value !== null) return
  if (!window.confirm(`确认恢复到 v${version.version}？当前内容会自动保存为新版本。`)) return
  projectRestoringVersion.value = version.version
  projectDetailError.value = ''
  try {
    const project = await store.restoreProjectVersion(projectDetail.value.id, version.version)
    fillProjectEditor(project)
    projectVersions.value = await store.loadProjectVersions(project.id)
  } catch (reason) { projectDetailError.value = reason instanceof Error ? reason.message : '版本恢复失败' }
  finally { projectRestoringVersion.value = null }
}
async function toggleProjectArchive(projectId: string, archived: boolean) {
  try {
    const project = store.projects.find((item) => item.id === projectId)
    await store.setProjectArchived(projectId, archived)
    projectTab.value = archived ? 'archived' : 'active'
    projectNotice.value = `“${project?.name || '项目'}”已${archived ? '归档' : '恢复'}`
    window.setTimeout(() => { projectNotice.value = '' }, 3000)
  } catch (reason) { store.lastError = reason instanceof Error ? reason.message : '项目状态更新失败' }
}
function selectCurrentProject(project: Project) { store.selectProject(project.id); projectNotice.value = `已切换到项目“${project.name}”，后续对话、上传和生成内容会归入该项目。`; window.setTimeout(() => { projectNotice.value = '' }, 3600) }
async function openProjectConversation(conversationId: string) { closeProjectDetails(); await router.push('/chat'); await store.openConversation(conversationId) }
function openProjectAsset(asset: StudioAsset) { if (asset.kind === 'image' || asset.kind === 'video') previewAsset.value = asset; else downloadGeneratedAsset(asset) }
async function deleteProject(projectId: string, name: string) { if (!window.confirm(`确认删除“${name}”？此操作无法撤销。`)) return; try { await store.deleteProject(projectId) } catch (reason) { store.lastError = reason instanceof Error ? reason.message : '项目删除失败' } }
async function deleteAsset(assetId: string) { try { await store.deleteAsset(assetId) } catch (reason) { store.lastError = reason instanceof Error ? reason.message : '文件删除失败' } }
function requireAuth(redirect: string) { if (auth.isAuthenticated) return true; void router.push(`/login?redirect=${encodeURIComponent(redirect)}`); return false }
function imageRatioForSize(value: string) {
  if (imageRatios.includes(value)) return value
  const normalized = value.replace('×', 'x')
  const match = normalized.match(/(\d{1,4})x(\d{1,4})/)
  if (!match) return '自动'
  const ratio = Number(match[1]) / Number(match[2])
  return imageRatios.slice(1).sort((left, right) => {
    const [leftWidth, leftHeight] = left.split(':').map(Number)
    const [rightWidth, rightHeight] = right.split(':').map(Number)
    return Math.abs(leftWidth / leftHeight - ratio) - Math.abs(rightWidth / rightHeight - ratio)
  })[0] || '自动'
}
function imageSizeForRatio(ratio: string) {
  const sizes = activeImageCapabilities.value.sizes
  if (!sizes.length || ratio === '自动') return activeImageCapabilities.value.defaultSize
  const [targetWidth, targetHeight] = ratio.split(':').map(Number)
  if (!targetWidth || !targetHeight) return providerSize(ratio)
  const targetRatio = targetWidth / targetHeight
  return [...sizes].sort((left, right) => {
    const [leftWidth, leftHeight] = left.split('x').map(Number)
    const [rightWidth, rightHeight] = right.split('x').map(Number)
    return Math.abs(leftWidth / leftHeight - targetRatio) - Math.abs(rightWidth / rightHeight - targetRatio)
  })[0] || activeImageCapabilities.value.defaultSize
}
function providerSize(value: string) { const match = value.match(/(\d{3,4})×(\d{3,4})/); return match ? `${match[1]}x${match[2]}` : '1024x1024' }
function providerQuality(value: string) { return value === '高' ? 'high' : value === '低' ? 'low' : 'medium' }
function providerOutputFormat(value: typeof outputFormat.value) { return value === 'JPEG' ? 'jpeg' : value === 'WebP' ? 'webp' : 'png' as const }
function providerBackground(value: typeof imageBackground.value) { return value === '透明背景' ? 'transparent' : value === '不透明背景' ? 'opaque' : 'auto' as const }
function createApiKey() { const key = store.createApiKey(`工作台密钥 ${store.apiKeys.length + 1}`); copyKey(key.value) }
function copyKey(value: string) { navigator.clipboard?.writeText(value).catch(() => undefined); copiedKey.value = value; window.setTimeout(() => { if (copiedKey.value === value) copiedKey.value = '' }, 1800) }
</script>
