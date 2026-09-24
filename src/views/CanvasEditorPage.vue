<template>
  <section class="canvas-editor-page" :class="{ 'is-inspector-open': nodeConfigOpen && selectedNode, 'is-short-drama': isDramaCanvas, 'is-assets-open': assetsPanelOpen, 'is-sidebar-open': sidebarOpen, 'has-selection-actions': selectionCount > 1 || selectedEdgeCount }" :style="{ '--canvas-desktop-sidebar-width': `${canvasSidebarWidth}px` }">
    <header class="canvas-editor-header">
      <button type="button" class="canvas-icon-button canvas-menu-trigger" aria-label="打开画布菜单" title="打开画布菜单" :class="{ 'is-active': canvasMenuOpen }" @click="canvasMenuOpen = !canvasMenuOpen"><Menu :size="20" /></button>
      <button type="button" class="canvas-icon-button canvas-back-trigger" aria-label="返回画布列表" title="返回画布列表" @click="goBack"><ArrowLeft :size="19" /></button>
      <div v-if="canvasMenuOpen" class="canvas-command-menu" role="menu">
        <button type="button" role="menuitem" @click="goBack(); canvasMenuOpen = false"><ArrowLeft :size="15" />返回画布列表</button>
        <button type="button" role="menuitem" @click="addNode('TEXT'); canvasMenuOpen = false"><FileText :size="15" />添加文本节点</button>
        <button type="button" role="menuitem" @click="addNode('IMAGE'); canvasMenuOpen = false"><ImageIcon :size="15" />添加图片节点</button>
        <button type="button" role="menuitem" @click="addPanoramaNode(); canvasMenuOpen = false"><Globe2 :size="15" />添加全景图节点</button>
        <button type="button" role="menuitem" @click="addNode('VIDEO'); canvasMenuOpen = false"><Video :size="15" />添加视频节点</button>
        <button type="button" role="menuitem" @click="addNode('AUDIO'); canvasMenuOpen = false"><Music2 :size="15" />添加音频节点</button>
        <button type="button" role="menuitem" @click="addNode('CONFIG'); canvasMenuOpen = false"><SlidersHorizontal :size="15" />添加生成设置</button>
        <button type="button" role="menuitem" @click="addNode('GROUP'); canvasMenuOpen = false"><Layers3 :size="15" />添加分组</button>
        <button type="button" role="menuitem" @click="presetMenuOpen = true; canvasMenuOpen = false"><PanelsTopLeft :size="15" />套用创作预设</button>
      </div>
      <input v-model="title" class="canvas-title-input" maxlength="100" aria-label="画布名称" @focus="checkpoint" @change="scheduleSave" />
      <span class="canvas-save-status" :class="`is-${saveState}`"><LoaderCircle v-if="saveState === 'saving'" class="canvas-spin" :size="14" /><Cloud v-else :size="14" />{{ saveLabel }}</span>
      <button type="button" class="canvas-header-action" :class="{ 'is-active': assetsPanelOpen }" title="打开画布资产" @click="assetsPanelOpen = !assetsPanelOpen"><LibraryBig :size="16" /><span>资产</span></button>
      <div class="canvas-editor-header-actions">
        <button type="button" class="canvas-icon-button" :disabled="!history.length" aria-label="撤销" title="撤销 Ctrl+Z" @click="undo"><Undo2 :size="18" /></button>
        <button type="button" class="canvas-icon-button" :disabled="!future.length" aria-label="重做" title="重做 Ctrl+Shift+Z" @click="redo"><Redo2 :size="18" /></button>
        <button type="button" class="canvas-agent-header-button" :class="{ 'is-active': agentSidebarOpen }" aria-label="画布 Agent" :title="agentAvailable ? '打开画布 Agent' : '打开画布 Agent 配置'" @click="openAgentPanel"><Bot :size="17" /><span>Agent</span></button>
        <button type="button" class="canvas-icon-button canvas-header-fit" aria-label="适应画布" title="适应画布" @click="void fitView({ padding: 0.18, duration: 260 })"><Scan :size="18" /></button>
        <button type="button" class="canvas-icon-button canvas-header-import" aria-label="导入画布" title="导入画布" @click="importInput?.click()"><Upload :size="18" /></button>
        <button type="button" class="canvas-icon-button canvas-header-export" aria-label="导出画布" title="导出画布" @click="exportCanvas"><Download :size="18" /></button>
        <span class="canvas-header-divider" aria-hidden="true" />
        <button type="button" class="canvas-header-stat" aria-label="查看创作点余额" title="查看创作点余额" @click="openWorkspaceSettings('credits')"><Sparkles :size="15" /><strong>{{ studio.credits }}</strong></button>
        <button type="button" class="canvas-icon-button canvas-header-badge-button" aria-label="通知中心" title="通知中心" @click="openWorkspaceSettings('notifications')"><Bell :size="17" /><span v-if="unreadNotifications" class="canvas-header-badge">{{ unreadNotifications > 99 ? '99+' : unreadNotifications }}</span></button>
        <button type="button" class="canvas-icon-button" :aria-label="canvasDark ? '切换到浅色主题' : '切换到深色主题'" :title="canvasDark ? '切换到浅色主题' : '切换到深色主题'" @click="toggleCanvasTheme"><Sun v-if="canvasDark" :size="17" /><Moon v-else :size="17" /></button>
        <button type="button" class="canvas-account-button" aria-label="账户菜单" title="账户设置" @click="openWorkspaceSettings('account')"><span>{{ auth.initials }}</span></button>
        <button type="button" class="canvas-icon-button" aria-label="快捷键" title="快捷键" @click="shortcutHelpOpen = true"><Keyboard :size="17" /></button>
        <input ref="importInput" hidden type="file" accept="application/json,.json" @change="replaceFromImport" />
      </div>
    </header>

    <div v-if="!loading && !loadError && isDramaCanvas" class="canvas-drama-toolbar">
      <nav aria-label="短剧创作阶段">
        <button v-for="stage in dramaStages" :key="stage.key" type="button" :class="{ 'is-active': activeDramaStage === stage.key }" @click="focusDramaStage(stage.key)">
          <component :is="stage.icon" :size="16" />
          <span><small>{{ stage.order }}</small>{{ stage.label }}</span>
          <b>{{ dramaStageCount(stage.key) }}</b>
        </button>
      </nav>
      <div class="canvas-drama-actions">
        <button type="button" :class="{ 'is-active': productionSidebarOpen }" title="打开短剧制作台" @click="openProductionPanel"><ChartNoAxesGantt :size="15" />制作台</button>
        <button type="button" title="在剧本末尾添加一集" @click="addDramaEpisode"><Plus :size="15" />添加集</button>
        <button type="button" title="把剧本拆分成镜头" @click="splitDramaIntoShots"><ListTree :size="15" />拆分剧本</button>
        <button class="is-primary" type="button" title="添加一个空镜头" @click="addDramaShot"><Clapperboard :size="15" />添加镜头</button>
      </div>
    </div>

    <div v-if="loading" class="canvas-editor-loading"><LoaderCircle class="canvas-spin" :size="24" /><span>正在打开画布</span></div>
    <div v-else-if="loadError" class="canvas-editor-error"><CircleAlert :size="26" /><h1>画布无法打开</h1><p>{{ loadError }}</p><button type="button" @click="void loadCanvas()">重新加载</button></div>
    <template v-else>
      <CanvasAssetsPanel v-if="assetsPanelOpen" :project-id="projectId || undefined" :current-assets="canvasMedia" :nodes="nodes" @close="assetsPanelOpen = false" @insert="insertCanvasAsset" @drag-asset="pendingPanelAsset = $event" @insert-prompt="insertCanvasPrompt" @locate="focusNode" @open="openNodeSettings" />
      <VueFlow
        v-model:nodes="nodes"
        v-model:edges="edges"
        class="canvas-flow"
        :min-zoom="0.05"
        :max-zoom="5"
        :default-edge-options="defaultEdgeOptions"
        :delete-key-code="null"
        :multi-selection-key-code="['Meta', 'Control', 'Shift']"
        :pan-on-drag="effectivePanMode"
        zoom-on-scroll
        :pan-on-scroll="false"
        zoom-on-pinch
        :zoom-on-double-click="false"
        @connect="connectNodes"
        @connect-start="handleConnectStart"
        @connect-end="handleConnectEnd"
        @edge-click="selectEdge"
        @edge-context-menu="openEdgeContextMenu"
        @node-drag-start="onCanvasDragStart"
        @node-drag-stop="onCanvasDragStop"
        @selection-drag-start="onCanvasDragStart"
        @selection-drag-stop="onCanvasDragStop"
        @viewport-change-end="updateViewport"
        @pane-click="closeInspector"
        @node-click="selectCanvasNode($event.node.id); presetMenuOpen = false"
        @node-double-click="openNodeSettings($event.node.id)"
        @pane-context-menu="openCanvasContextMenu"
        @dblclick.capture="openNodeCreateMenu"
        @dragover.prevent
        @drop.prevent="handleCanvasDrop"
      >
        <Background v-if="background !== 'none'" :variant="background === 'lines' ? BackgroundVariant.Lines : BackgroundVariant.Dots" :gap="22" :size="1.2" color="var(--canvas-grid)" />
        <MiniMap v-if="miniMapOpen" pannable zoomable position="bottom-right" :node-color="miniMapColor" />
        <Controls :show-interactive="false" position="bottom-left" />
        <template #node-canvas="{ id }">
          <CanvasFlowNode
            :data="flowNodeData(id)"
            :selected="Boolean(nodes.find((node) => node.id === id)?.selected)"
            :models="flowNodeModelOptions(id)"
            :active-model="flowNodeGenerationModel(id)"
            :generation-summary="flowNodeGenerationSummary(id)"
            @checkpoint="checkpoint"
            @update="updateNodeData(id, $event)"
            @resize="resizeNode(id, $event)"
            @duplicate="duplicateNode(id)"
            @remove="removeNode(id)"
            @pick="openMediaPicker(id)"
            @cancel="cancelGeneration(id)"
            @retry="generateNode(id)"
            @run="generateNode(id)"
            @context="openNodeContextMenu(id, $event)"
            @configure="openNodeSettings(id)"
            @derive="deriveNode(id, $event)"
            @extend="extendFromNode(id, $event)"
            @download="downloadNodeAsset(id)"
            @edit="openImageEditor(id, 'crop')"
          />
        </template>
      </VueFlow>

      <div v-if="!nodes.length" class="canvas-empty-guide" aria-hidden="false">
        <div class="canvas-empty-guide-card">
          <span class="canvas-empty-guide-badge"><Sparkles :size="14" />AI 创作画布</span>
          <h2>从一个想法开始</h2>
          <p>双击画布空白处快速创建节点，也可以从下面任一起点出发。</p>
          <div class="canvas-empty-guide-actions">
            <button type="button" @click="addNode('TEXT')"><FileText :size="16" /><span><strong>写一段创意</strong><small>提示词、脚本或说明</small></span></button>
            <button type="button" @click="addNode('IMAGE')"><ImageIcon :size="16" /><span><strong>生成图片</strong><small>从文字到视觉方案</small></span></button>
            <button type="button" @click="presetMenuOpen = true"><PanelsTopLeft :size="16" /><span><strong>套用创作预设</strong><small>一键建立节点链路</small></span></button>
          </div>
          <span class="canvas-empty-guide-hint"><Keyboard :size="13" />点击右上角快捷键图标，查看全部快捷操作</span>
        </div>
      </div>

      <aside v-if="sidebarOpen" class="canvas-workspace-sidebar" :class="{ 'is-agent': workspacePanel === 'agent', 'is-production': workspacePanel === 'production', 'is-properties': workspacePanel === 'properties' }" :aria-label="workspacePanel === 'agent' ? 'Canvas Agent 对话面板' : undefined">
        <button v-if="workspacePanel === 'agent'" type="button" class="canvas-sidebar-resize-handle" aria-label="调整右侧面板宽度" @mousedown="startCanvasSidebarResize" />
        <nav v-if="workspacePanel === 'agent' || workspacePanel === 'production'" class="canvas-workspace-tabs canvas-workspace-tabs--single" :aria-label="workspacePanel === 'agent' ? '画布 Agent' : '短剧制作台'">
          <button v-if="workspacePanel === 'agent'" type="button" class="canvas-agent-sidebar-header is-active" @click="agentSidebarOpen = false"><span class="canvas-agent-sidebar-icon"><Bot :size="18" /></span><span class="canvas-agent-sidebar-copy"><strong>Agent</strong><small>画布助手 · 让创意落地更简单</small></span></button>
          <button v-else type="button" class="is-active" @click="productionSidebarOpen = false"><ChartNoAxesGantt :size="16" />短剧制作台</button>
        </nav>

        <nav v-if="workspacePanel === 'agent'" class="canvas-agent-dock-tabs" aria-label="Agent 面板"><div><button type="button" role="tab" :aria-selected="agentDockView === 'create' || agentDockView === 'connect'" :class="{ 'is-active': agentDockView === 'create' || agentDockView === 'connect' }" @click="agentDockView = agentAvailable ? 'create' : 'connect'">对话</button><button type="button" role="tab" :aria-selected="agentDockView === 'history'" :class="{ 'is-active': agentDockView === 'history' }" @click="agentDockView = 'history'; void loadAgentHistory()"><History :size="15" />历史 <span v-if="agentHistory.length">{{ agentHistory.length }}</span></button></div><button class="canvas-agent-new-chat" type="button" @click="agentDockView = 'create'; agentGoal = ''"><Plus :size="15" />新建对话</button></nav>

        <section v-if="workspacePanel === 'agent'" class="canvas-agent-dock">
          <section v-if="agentDockView === 'connect'" class="canvas-agent-connect" aria-live="polite"><div class="canvas-agent-connect-status"><span class="canvas-agent-status-dot" :class="{ 'is-ready': agentAvailable }" /><div><strong>{{ agentAvailable ? 'Agent 已就绪' : 'Agent 未配置' }}</strong><small>{{ agentAvailable ? `${agentModelsCount} 个可用模型，可直接执行画布计划` : '管理端尚未配置可用 Agent 模型' }}</small></div></div><div class="canvas-agent-connect-detail"><span>运行方式</span><strong>工作台 Agent 服务</strong><small>当前画布会随任务提交到已配置的服务，结果需确认后才会写回节点。</small></div><button type="button" class="canvas-agent-connect-link" @click="openWorkspaceSettings('api')">查看模型与服务配置 <ArrowRight :size="14" /></button></section>
          <template v-else-if="agentDockView === 'create'">
          <section class="canvas-agent-welcome"><div><h2>你好，我是你的画布助手</h2><p>我可以帮你生成图像、优化布局、撰写文案、梳理思路、提取关键信息，让创意更高效实现。</p><button type="button" @click="agentGoal = '请介绍一下你能如何协助我完成当前画布。'">了解 Agent 能做什么 <ArrowRight :size="15" /></button></div><span class="canvas-agent-welcome-icon" aria-hidden="true"><Sparkles :size="30" /></span></section>
          <span class="canvas-agent-starter-heading">你可以试试 <Sparkles :size="14" /></span>
          <div class="canvas-agent-starters" aria-label="常用画布操作">
            <button type="button" @click="addAgentStarter('image')"><ImageIcon :size="17" /><span><strong>生成一套新品发布海报</strong><small>营造促销氛围，突出产品亮点</small></span></button>
            <button type="button" @click="addAgentStarter('layout')"><PanelsTopLeft :size="17" /><span><strong>优化当前画布布局</strong><small>提升对齐与信息效率</small></span></button>
            <button type="button" @click="addAgentStarter('plan')"><FileText :size="17" /><span><strong>撰写一段产品宣传文案</strong><small>突出卖点，吸引用户</small></span></button>
            <button type="button" @click="addAgentStarter('group')"><Sparkles :size="17" /><span><strong>增强画面质感</strong><small>提升细节与光影表现</small></span></button>
            <button type="button" @click="agentGoal = '将当前画布中的文案与图片按对应关系进行批量替换。'"><Copy :size="17" /><span><strong>批量替换文案与图片</strong><small>保持风格一致，批量应用</small></span></button>
            <button type="button" @click="agentGoal = '基于当前画布生成三套可对比的设计方案。'"><Layers3 :size="17" /><span><strong>生成多套设计方案</strong><small>提供多种风格供选择</small></span></button>
          </div>
          <div class="canvas-agent-dock-footer">
            <section class="canvas-agent-reference-assets"><span>本轮参考素材</span><button type="button" title="打开资产面板添加参考素材" @click="assetsPanelOpen = true"><Plus :size="15" />添加参考素材</button></section>
            <section class="canvas-agent-composer" :class="{ 'is-disabled': !agentAvailable }">
              <div class="canvas-agent-composer-main">
                <textarea ref="canvasAgentInput" v-model="agentGoal" rows="1" maxlength="4000" aria-label="描述你想让 Agent 如何操作画布" placeholder="描述你想让 Agent 如何操作画布" @input="resizeAgentGoalInput" @keydown="(event: KeyboardEvent) => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); openAgentPlan() } }" />
              </div>
              <div class="canvas-agent-composer-controls">
                <button type="button" class="canvas-agent-add-reference" title="添加参考素材" aria-label="添加参考素材" @click="assetsPanelOpen = true"><Plus :size="17" /></button>
                <button type="button" class="canvas-agent-planning-toggle" :class="{ 'is-active': agentSmartPlanning }" :aria-pressed="agentSmartPlanning" :aria-label="agentSmartPlanning ? '智能规划已开启，点击关闭' : '智能规划已关闭，点击开启'" title="智能规划" @click="agentSmartPlanning = !agentSmartPlanning"><Lightbulb :size="16" /></button>
                <PluginSelector v-model="agentPluginId" capability="CHAT" compact />
                <div class="canvas-agent-model-control"><button type="button" class="canvas-agent-model-trigger" :disabled="!agentAvailable" :aria-expanded="agentModelPickerOpen" title="选择生成模型" @click="toggleAgentModelPicker"><strong>{{ agentModelLabel }}</strong><ChevronDown :size="14" /></button></div>
                <div class="canvas-agent-parameter-control"><button ref="agentParamTrigger" type="button" class="canvas-agent-param-trigger" :disabled="!agentAvailable" :aria-expanded="agentParamOpen" title="生成参数" @click="toggleAgentParamPicker"><strong>{{ agentGenerationCount }} 张</strong><ChevronDown :size="14" /></button></div>
                <span class="canvas-agent-composer-spacer" aria-hidden="true" />
                <button type="button" class="canvas-agent-send" :disabled="!agentAvailable || !agentGoal.trim()" title="发送" aria-label="发送" @click="openAgentPlan"><ArrowUp :size="18" /></button>
              </div>
            </section>
            <Teleport to="body">
              <div v-if="agentModelPickerOpen" class="canvas-agent-model-picker canvas-agent-model-picker--floating" :style="agentModelPickerStyle" @click.stop>
                <ModelCatalogPicker v-model="agentModel" :models="agentModels" title="选择生成模型" description-mode="agent" @select="closeAgentPickers" @close="closeAgentPickers" />
              </div>
              <div v-if="agentParamOpen" class="canvas-agent-param-picker" :style="agentParamStyle" @click.stop>
                <button v-for="option in agentParamOptions" :key="option.value" type="button" :class="{ 'is-active': agentGenerationCount === option.value }" @click="agentGenerationCount = option.value; agentParamOpen = false">{{ option.label }}</button>
              </div>
            </Teleport>
            <p v-if="!agentAvailable" class="canvas-agent-dock-notice">管理端尚未配置可用 Agent 模型。</p>
          </div>
          </template>
          <section v-else-if="agentDockView === 'history'" class="canvas-agent-history" aria-live="polite">
            <div v-if="agentHistoryLoading" class="canvas-agent-history-empty"><LoaderCircle class="canvas-spin" :size="17" />正在读取历史</div>
            <div v-else-if="!agentHistory.length" class="canvas-agent-history-empty"><History :size="20" /><span>当前画布还没有 Agent 计划</span></div>
            <button v-for="task in agentHistory" :key="task.id" type="button" class="canvas-agent-history-item" @click="openAgentHistoryTask(task)"><div><strong>{{ task.goal }}</strong><small>{{ task.updatedAt ? formatShortDayTime(task.updatedAt) : '刚刚' }}</small></div><span :data-status="task.status">{{ agentTaskStatus(task.status) }}</span></button>
          </section>
        </section>

        <CanvasDramaProductionPanel
          v-else-if="workspacePanel === 'production'"
          :summary="dramaProductionSummary"
          :batch="dramaBatch"
          @close="productionSidebarOpen = false"
          @generate="runDramaBatch"
          @stop="stopDramaBatchQueue"
          @arrange="arrangeDramaPipeline"
          @focus="focusDramaIssues"
        />

        <section v-else-if="nodeConfigOpen && selectedNode" class="canvas-inspector">
        <header><div><span>{{ nodeKindLabel(selectedNode.data.kind) }}</span><strong>节点设置</strong></div><button type="button" aria-label="关闭节点设置" @click="deselectAll"><X :size="17" /></button></header>
        <label>节点名称<input :value="selectedNode.data.title" maxlength="120" @focus="checkpoint" @input="updateSelectedTitle" /></label>
        <label v-if="selectedNode.data.kind === 'TEXT'">内容<textarea :value="selectedNode.data.content" rows="7" @focus="checkpoint" @input="updateSelectedContent" /></label>
        <label v-if="selectedNode.data.kind === 'CONFIG'">生成类型<select :value="activeGenerationKind(selectedNode)" @change="updateSelectedGenerationKind"><option value="IMAGE">图片</option><option value="VIDEO">视频</option></select></label>
        <label v-if="isGenerationNode(selectedNode)">生成提示词<textarea :value="selectedNode.data.prompt || ''" rows="5" placeholder="可以留空并连接文本节点" @focus="checkpoint" @input="updateSelectedPrompt" /></label>
        <div v-if="isGenerationNode(selectedNode)" class="canvas-inspector-model">
          <span>模型</span>
          <button ref="inspectorModelTrigger" type="button" class="canvas-inspector-model-trigger" :disabled="!modelsForNode(selectedNode).length" :aria-expanded="inspectorModelOpen" :aria-label="`选择模型，当前为${inspectorModelLabel}`" @click="toggleInspectorModelPicker">
            <ModelBadge v-if="inspectorSelectedModel" :model="inspectorSelectedModel" size="sm" />
            <strong>{{ inspectorModelLabel }}</strong>
            <ChevronDown :size="14" />
          </button>
        </div>
        <Teleport to="body">
          <div v-if="inspectorModelOpen && selectedNode && isGenerationNode(selectedNode)" class="canvas-agent-model-picker canvas-agent-model-picker--floating" :style="inspectorModelPickerStyle" @click.stop>
            <ModelCatalogPicker :models="modelsForNode(selectedNode)" :model-value="generationModel(selectedNode)" title="选择模型" @select="selectInspectorModel" @close="inspectorModelOpen = false" />
          </div>
        </Teleport>
        <p v-if="catalogModelsError" class="canvas-inspector-error">{{ catalogModelsError }}<button type="button" @click="void reloadCanvasCatalog()">重新加载模型</button></p>

        <CanvasDramaShotInspector v-if="isDramaCanvas && selectedNode.data.shotId" :data="selectedNode.data" @checkpoint="checkpoint" @update="updateDramaShotData" />

        <section v-if="selectedNode.data.kind === 'IMAGE'" class="canvas-image-tools-panel">
          <div class="canvas-inspector-section-heading">
            <div><strong>图片编辑</strong><span>裁剪、蒙版与 AI 工具</span></div>
            <WandSparkles :size="17" />
          </div>
          <div class="canvas-image-local-actions">
            <button type="button" :disabled="!selectedNode.data.assetId" @click="openImageEditor(selectedNode.id, 'crop')"><Crop :size="16" />裁剪</button>
            <button type="button" :disabled="!selectedNode.data.assetId" :class="{ 'is-active': Boolean(selectedNode.data.maskAssetId) }" @click="openImageEditor(selectedNode.id, 'mask')"><Brush :size="16" />{{ selectedNode.data.maskAssetId ? '重绘蒙版' : '绘制蒙版' }}</button>
          </div>
          <div v-if="imageTools.length" class="canvas-image-tool-grid">
            <button v-for="tool in imageTools" :key="tool.id" type="button" class="canvas-image-tool-card" :class="{ 'is-active': selectedNode.data.creationToolId === tool.id }" :aria-pressed="selectedNode.data.creationToolId === tool.id" :title="tool.prompt" @click="selectImageTool(selectedNode.id, tool)">
              <span>{{ tool.title }}</span>
              <img v-if="tool.imageUrl" :src="tool.imageUrl" :alt="`${tool.title}示例`" loading="lazy" />
              <span v-else class="canvas-image-tool-fallback" aria-hidden="true"><component :is="imageToolIcon(tool)" :size="25" /></span>
              <Check v-if="selectedNode.data.creationToolId === tool.id" class="canvas-image-tool-card-check" :size="14" />
            </button>
          </div>
          <p v-else-if="imageToolsError" class="canvas-image-tools-empty">{{ imageToolsError }}<button type="button" @click="void reloadCanvasCatalog()">重新加载工具</button></p>
          <p v-else class="canvas-image-tools-empty">管理端尚未发布图片工具。裁剪和蒙版仍可直接使用。</p>
          <template v-if="activeImageTool(selectedNode)">
            <div class="canvas-selected-tool">
              <span>{{ imageToolTypeLabel(activeImageTool(selectedNode)!) }}</span>
              <strong>{{ activeImageTool(selectedNode)!.title }}</strong>
              <button type="button" aria-label="取消图片工具" title="取消图片工具" @click="clearImageTool(selectedNode.id)"><X :size="14" /></button>
            </div>
            <div v-if="imageToolType(activeImageTool(selectedNode)!) === 'OUTPAINT'" class="canvas-inspector-grid canvas-outpaint-grid">
              <label v-for="field in outpaintFields" :key="field.key">{{ field.label }}<input type="number" min="0" max="2048" step="32" :value="selectedNode.data.imageToolOptions?.[field.key] ?? activeImageTool(selectedNode)?.options?.[field.key] ?? 0" @input="updateImageToolOption(field.key, $event)" /></label>
            </div>
            <div v-if="activeImageTool(selectedNode)?.options?.inputMode === 'MASK'" class="canvas-mask-requirement" :class="{ 'is-ready': selectedNode.data.maskAssetId }">
              <CheckCircle2 v-if="selectedNode.data.maskAssetId" :size="15" /><CircleAlert v-else :size="15" />
              <span>{{ selectedNode.data.maskAssetId ? '蒙版已准备，可执行局部编辑' : '此工具需要先绘制蒙版' }}</span>
            </div>
          </template>
        </section>

        <template v-if="isGenerationNode(selectedNode) && activeGenerationKind(selectedNode) === 'IMAGE'">
          <div class="canvas-inspector-grid">
            <label>尺寸<select :value="generationOptions(selectedNode).size" @change="updateGenerationOption('size', $event)"><option v-for="size in imageCapabilities(selectedNode).sizes" :key="size" :value="size">{{ imageSizeLabel(size) }}</option></select></label>
            <label>质量<select :value="generationOptions(selectedNode).quality" @change="updateGenerationOption('quality', $event)"><option v-for="quality in imageCapabilities(selectedNode).qualities" :key="quality" :value="quality">{{ qualityLabel(quality) }}</option></select></label>
            <label>数量<select :value="generationOptions(selectedNode).count" @change="updateGenerationOption('count', $event, true)"><option v-for="count in imageCapabilities(selectedNode).maxCount" :key="count" :value="count">{{ count }} 张</option></select></label>
            <label>格式<select :value="generationOptions(selectedNode).outputFormat" @change="updateGenerationOption('outputFormat', $event)"><option v-for="format in imageCapabilities(selectedNode).outputFormats" :key="format" :value="format">{{ format.toUpperCase() }}</option></select></label>
          </div>
        </template>

        <template v-if="isGenerationNode(selectedNode) && activeGenerationKind(selectedNode) === 'VIDEO'">
          <div class="canvas-inspector-grid">
            <label>分辨率<select :value="generationOptions(selectedNode).resolution" @change="updateGenerationOption('resolution', $event)"><option v-for="resolution in videoCapabilities(selectedNode).resolutions" :key="resolution" :value="resolution">{{ resolution.toUpperCase() }}</option></select></label>
            <label>时长<select :value="generationOptions(selectedNode).duration" @change="updateGenerationOption('duration', $event, true)"><option v-for="duration in videoCapabilities(selectedNode).durations" :key="duration" :value="duration">{{ duration }} 秒</option></select></label>
            <label>比例<select :value="generationOptions(selectedNode).aspectRatio" @change="updateGenerationOption('aspectRatio', $event)"><option v-for="ratio in videoCapabilities(selectedNode).aspectRatios" :key="ratio" :value="ratio">{{ ratio }}</option></select></label>
          </div>
        </template>

        <div v-if="isGenerationNode(selectedNode)" class="canvas-generation-context">
          <span><Link2 :size="14" />已读取 {{ generationContext(selectedNode).textCount }} 个文本、{{ generationContext(selectedNode).referenceAssetIds.length }} 张参考图</span>
          <span><Sparkles :size="14" />预计 {{ generationCreditCost(selectedNode) }} 点</span>
        </div>
        <div v-if="isMediaNode(selectedNode)" class="canvas-generation-actions">
          <button type="button" @click="openMediaPicker(selectedNode.id)"><FolderOpen :size="16" />文件库</button>
          <button class="is-primary" type="button" :disabled="selectedNode.data.status === 'QUEUED' || selectedNode.data.status === 'RUNNING'" @click="generateNode(selectedNode.id)"><Sparkles :size="16" />{{ selectedNode.data.status === 'FAILED' || selectedNode.data.status === 'CANCELLED' ? '重新生成' : selectedNode.data.creationToolId ? '运行工具' : '开始生成' }}</button>
        </div>
        <p v-if="selectedNode.data.error && selectedNode.data.status === 'FAILED'" class="canvas-inspector-error">{{ selectedNode.data.error }}</p>
        <div class="canvas-inspector-meta"><span>位置</span><code>{{ Math.round(selectedNode.position.x) }}, {{ Math.round(selectedNode.position.y) }}</code></div>
        <footer><button type="button" @click="duplicateNode(selectedNode.id)"><Copy :size="16" />复制</button><button class="is-danger" type="button" @click="removeNode(selectedNode.id)"><Trash2 :size="16" />删除</button></footer>
        </section>
        <section v-else class="canvas-properties-empty"><SlidersHorizontal :size="22" /><strong>选择一个节点</strong><span>节点的媒体、提示词、模型和生成参数会显示在这里。</span></section>
      </aside>

      <nav class="canvas-tool-dock" aria-label="画布工具">
        <button type="button" class="is-active" :title="canvasPanMode ? '切换到框选模式' : '切换到小手模式'" :aria-label="canvasPanMode ? '切换到框选模式' : '切换到小手模式'" @click="canvasPanMode = !canvasPanMode"><Hand v-if="canvasPanMode" :size="18" /><MousePointer2 v-else :size="18" /></button>
        <button type="button" :disabled="!history.length" title="撤销" aria-label="撤销" @click="undo"><Undo2 :size="18" /></button>
        <button type="button" :disabled="!future.length" title="重做" aria-label="重做" @click="redo"><Redo2 :size="18" /></button>
        <i aria-hidden="true" />
        <button type="button" title="添加文本" aria-label="添加文本" @click="addNode('TEXT')"><FileText :size="19" /></button>
        <button type="button" title="添加图片节点" aria-label="添加图片节点" @click="addNode('IMAGE')"><ImageIcon :size="19" /></button>
        <button type="button" title="添加全景图节点" aria-label="添加全景图节点" @click="addPanoramaNode"><Globe2 :size="19" /></button>
        <button type="button" title="添加视频节点" aria-label="添加视频节点" @click="addNode('VIDEO')"><Video :size="19" /></button>
        <button type="button" title="添加音频节点" aria-label="添加音频节点" @click="addNode('AUDIO')"><Music2 :size="19" /></button>
        <button type="button" title="生成配置" aria-label="生成配置" @click="addNode('CONFIG')"><SlidersHorizontal :size="19" /></button>
        <button type="button" title="上传素材" aria-label="上传素材" @click="mediaUploadInput?.click()"><Upload :size="19" /></button>
        <i aria-hidden="true" />
        <button type="button" :class="{ 'is-active': assetsPanelOpen }" title="资产" aria-label="资产" @click="assetsPanelOpen = !assetsPanelOpen"><FolderOpen :size="19" /></button>
        <button type="button" title="一键整理画布" aria-label="一键整理画布" @click="autoArrangeCanvas"><Network :size="19" /></button>
        <button type="button" :class="{ 'is-active': canvasAppearanceOpen }" title="画布外观" aria-label="画布外观" @click="canvasAppearanceOpen = !canvasAppearanceOpen"><Palette :size="19" /></button>
        <button type="button" :disabled="!nodes.length && !edges.length" title="清空画布" aria-label="清空画布" @click="clearCanvasOpen = true"><Eraser :size="18" /></button>
      </nav>

      <section v-if="canvasAppearanceOpen" class="canvas-appearance-menu" aria-label="画布外观">
        <header><strong>画布外观</strong><button type="button" title="关闭" aria-label="关闭画布外观" @click="canvasAppearanceOpen = false"><X :size="15" /></button></header>
        <span>背景样式</span>
        <div class="canvas-appearance-swatches">
          <button type="button" :class="{ 'is-active': background === 'dots' }" :aria-pressed="background === 'dots'" @click="setBackground('dots')"><Dot :size="15" />点阵</button>
          <button type="button" :class="{ 'is-active': background === 'lines' }" :aria-pressed="background === 'lines'" @click="setBackground('lines')"><Grid2X2 :size="15" />网格</button>
          <button type="button" :class="{ 'is-active': background === 'none' }" :aria-pressed="background === 'none'" @click="setBackground('none')"><Square :size="14" />空白</button>
        </div>
        <button type="button" class="canvas-appearance-presets" @click="presetMenuOpen = true; canvasAppearanceOpen = false"><PanelsTopLeft :size="16" /><span><strong>创作预设</strong><small>快速建立可编辑节点链路</small></span><ArrowRight :size="14" /></button>
      </section>

      <div v-if="selectionCount > 1 || selectedEdgeCount || selectedNode?.data.kind === 'GROUP'" class="canvas-selection-actions">
        <span>{{ selectedEdgeCount ? '已选连线' : `已选 ${selectionCount} 项` }}</span>
        <template v-if="selectionCount > 1">
          <div class="canvas-selection-align" role="group" aria-label="对齐选中节点">
            <button type="button" title="左对齐" aria-label="左对齐" @click="alignSelected('left')"><AlignStartVertical :size="14" /></button>
            <button type="button" title="水平居中" aria-label="水平居中" @click="alignSelected('hcenter')"><AlignCenterVertical :size="14" /></button>
            <button type="button" title="右对齐" aria-label="右对齐" @click="alignSelected('right')"><AlignEndVertical :size="14" /></button>
            <button type="button" title="顶对齐" aria-label="顶对齐" @click="alignSelected('top')"><AlignStartHorizontal :size="14" /></button>
            <button type="button" title="垂直居中" aria-label="垂直居中" @click="alignSelected('vmiddle')"><AlignCenterHorizontal :size="14" /></button>
            <button type="button" title="底对齐" aria-label="底对齐" @click="alignSelected('bottom')"><AlignEndHorizontal :size="14" /></button>
          </div>
          <button type="button" title="横向等距排列" aria-label="横向等距排列" @click="arrangeSelected('horizontal')"><Columns3 :size="15" />横排</button>
          <button type="button" title="纵向等距排列" aria-label="纵向等距排列" @click="arrangeSelected('vertical')"><Rows3 :size="15" />纵排</button>
        </template>
        <button v-if="selectionCount" type="button" title="缩放至选中节点" @click="void focusSelected()"><Focus :size="15" />聚焦</button>
        <button v-if="selectionCount" type="button" title="复制选中节点 Ctrl+D" @click="duplicateSelected"><Copy :size="15" />复制</button>
        <button v-if="selectionCount > 1" type="button" title="建立分组 Ctrl+G" @click="wrapSelectedInGroup"><Layers3 :size="15" />分组</button>
        <button v-if="selectedNode?.data.kind === 'GROUP'" type="button" title="取消分组 Ctrl+Shift+G" @click="ungroupSelected"><Layers3 :size="15" />取消分组</button>
        <button type="button" class="is-danger" title="删除选中节点" @click="deleteSelected"><Trash2 :size="15" />删除</button>
      </div>

      <section v-if="presetMenuOpen" class="canvas-preset-menu" aria-label="创作预设">
        <header><div><strong>创作预设</strong><span>快速建立可继续编辑的节点链路</span></div><button type="button" title="关闭预设" aria-label="关闭预设" @click="presetMenuOpen = false"><X :size="16" /></button></header>
        <button v-for="preset in canvasPresets" :key="preset.key" type="button" @click="applyCanvasPreset(preset.key)"><span><component :is="preset.icon" :size="17" /></span><span><strong>{{ preset.label }}</strong><small>{{ preset.description }}</small></span></button>
      </section>

      <div class="canvas-navigation-dock" aria-label="画布导航">
        <button type="button" :class="{ 'is-active': miniMapOpen }" :title="miniMapOpen ? '关闭小地图' : '打开小地图'" :aria-label="miniMapOpen ? '关闭小地图' : '打开小地图'" @click="miniMapOpen = !miniMapOpen"><Compass :size="17" /></button><button type="button" title="重置视图" aria-label="重置视图" @click="void fitView({ padding: 0.18, duration: 260 })"><Focus :size="16" /></button><input class="canvas-zoom-slider" type="range" min="5" max="500" step="1" :value="Math.round(viewport.zoom * 100)" aria-label="放大/缩小画布" @input="setZoomFromControl" /><output>{{ Math.round(viewport.zoom * 100) }}%</output><button type="button" title="快捷键" aria-label="快捷键" @click="shortcutHelpOpen = true"><CircleHelp :size="16" /></button>
      </div>

      <div v-if="canvasContextMenu" class="canvas-context-menu" :style="{ left: `${canvasContextMenu.x}px`, top: `${canvasContextMenu.y}px` }" role="menu">
        <template v-if="canvasContextMenu.nodeId">
          <button type="button" @click="openNodeSettings(canvasContextMenu.nodeId); canvasContextMenu = null"><SlidersHorizontal :size="15" />打开节点设置</button>
          <button type="button" @click="duplicateNode(canvasContextMenu.nodeId); canvasContextMenu = null"><Copy :size="15" />复制节点</button>
          <button v-if="nodes.find((node) => node.id === canvasContextMenu?.nodeId)?.data.kind === 'GROUP'" type="button" @click="ungroupSelected(); canvasContextMenu = null"><Layers3 :size="15" />取消分组</button>
          <button v-if="isMediaNode(nodes.find((node) => node.id === canvasContextMenu?.nodeId))" type="button" @click="branchMediaNode(canvasContextMenu.nodeId); canvasContextMenu = null"><Sparkles :size="15" />派生生成节点</button>
          <button v-if="nodes.find((node) => node.id === canvasContextMenu?.nodeId)?.data.url" type="button" @click="downloadNodeAsset(canvasContextMenu.nodeId); canvasContextMenu = null"><Download :size="15" />下载素材</button>
          <button type="button" class="is-danger" @click="removeNode(canvasContextMenu.nodeId); canvasContextMenu = null"><Trash2 :size="15" />删除节点</button>
        </template>
        <template v-else-if="canvasContextMenu.edgeId">
          <button type="button" class="is-danger" @click="removeEdge(canvasContextMenu.edgeId); canvasContextMenu = null"><Trash2 :size="15" />删除连线</button>
        </template>
        <template v-else>
          <button type="button" @click="addNodeAt('TEXT', canvasContextMenu)"><FileText :size="15" />添加文本</button>
          <button type="button" @click="addNodeAt('IMAGE', canvasContextMenu)"><ImageIcon :size="15" />添加图片</button>
          <button type="button" @click="addNodeAt('VIDEO', canvasContextMenu)"><Video :size="15" />添加视频</button>
          <button type="button" @click="addNodeAt('CONFIG', canvasContextMenu)"><SlidersHorizontal :size="15" />添加生成设置</button>
          <button type="button" @click="addNodeAt('GROUP', canvasContextMenu)"><Layers3 :size="15" />添加分组</button>
        </template>
      </div>
      <div v-if="nodeCreateMenu" class="canvas-node-create-menu" :style="{ left: `${nodeCreateMenu.x}px`, top: `${nodeCreateMenu.y}px` }" role="menu" data-canvas-no-zoom>
        <header>
          <strong>{{ nodeCreateMenu.sourceId ? '基于节点创建' : '添加节点' }}</strong>
          <span>{{ nodeCreateMenu.sourceId ? nodeCreateSourceLabel : '双击画布即可开始创作' }}</span>
        </header>
        <button v-for="option in nodeCreateOptions" :key="option.kind" type="button" @click="createNodeFromMenu(option.kind)">
          <span :class="`is-${option.kind.toLowerCase()}`"><component :is="option.icon" :size="16" /></span>
          <span><strong>{{ option.label }}</strong><small>{{ option.description }}</small></span>
        </button>
      </div>
      <input ref="mediaUploadInput" hidden type="file" accept="image/*,video/*,audio/*,text/*,.txt,.md,.markdown,.json,.csv" multiple @change="selectCanvasFiles" />
    </template>

    <CanvasMediaDialog v-if="mediaPickerNode" :kind="mediaPickerKind" :project-id="projectId || undefined" @close="mediaPickerNodeId = ''" @select="useMediaAsset" />
    <CanvasImageEditorDialog v-if="imageEditorNode" :src="imageEditorNode.data.url!" :mode="imageEditorMode" :busy="imageEditorUploading" @close="closeImageEditor" @apply="applyImageEdit" />
    <CanvasAgentDialog v-if="agentOpen" :canvas-id="String(route.params.id)" :canvas-title="title" :project-id="projectId || undefined" :document="serializeDocument()" :models="catalogModels" :initial-goal="agentGoal" :initial-model="agentModel" :initial-plugin-id="agentPluginId" :smart-planning="agentSmartPlanning" :generation-count="agentGenerationCount" :initial-task-id="selectedAgentTaskId" @close="agentOpen = false" @apply="applyAgentOperations" />
    <div v-if="clearCanvasOpen" class="canvas-modal-backdrop" @click.self="clearCanvasOpen = false">
      <section class="canvas-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="clear-canvas-title">
        <header><div><span>不可撤销操作</span><h2 id="clear-canvas-title">清空当前画布</h2><p>所有节点和连线都会被移除，画布资产仍保留在文件库中。</p></div><button type="button" aria-label="关闭" @click="clearCanvasOpen = false"><X :size="19" /></button></header>
        <footer><button type="button" @click="clearCanvasOpen = false">取消</button><button type="button" class="is-danger" @click="clearCanvas">清空画布</button></footer>
      </section>
    </div>
    <div v-if="shortcutHelpOpen" class="canvas-modal-backdrop canvas-shortcut-backdrop" @click.self="shortcutHelpOpen = false"><section class="canvas-shortcut-dialog" role="dialog" aria-modal="true" aria-labelledby="shortcut-help-title"><header><div><span>CANVAS SHORTCUTS</span><h2 id="shortcut-help-title">快捷键</h2><p>在画布上快速完成常用操作。</p></div><button type="button" aria-label="关闭快捷键" @click="shortcutHelpOpen = false"><X :size="19" /></button></header><dl><div><dt>Space / Control</dt><dd>按住临时切换抓手</dd></div><div><dt>Ctrl / Cmd + Z</dt><dd>撤销</dd></div><div><dt>Ctrl / Cmd + Shift + Z</dt><dd>重做</dd></div><div><dt>Ctrl / Cmd + C / V</dt><dd>复制 / 粘贴节点</dd></div><div><dt>Ctrl / Cmd + D</dt><dd>快速复制选中节点</dd></div><div><dt>Ctrl / Cmd + G</dt><dd>将选中节点打组</dd></div><div><dt>Ctrl / Cmd + Shift + G</dt><dd>取消分组</dd></div><div><dt>Ctrl / Cmd + 0</dt><dd>缩放至适应画布</dd></div><div><dt>Ctrl / Cmd + Shift + F</dt><dd>缩放至选中节点</dd></div><div><dt>Ctrl / Cmd + / -</dt><dd>放大 / 缩小画布</dd></div><div><dt>方向键</dt><dd>微调选中节点位置（Shift 加速）</dd></div><div><dt>双击空白处</dt><dd>快速创建节点</dd></div><div><dt>Delete / Backspace</dt><dd>删除选中节点或连线</dd></div><div><dt>Esc</dt><dd>关闭菜单并取消选择</dd></div></dl><footer><button type="button" class="is-primary" @click="shortcutHelpOpen = false">完成</button></footer></section></div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type Component } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { Background, BackgroundVariant } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { VueFlow, MarkerType, useVueFlow, type Connection, type EdgeMouseEvent, type ViewportTransform } from '@vue-flow/core'
import { MiniMap } from '@vue-flow/minimap'
import { AlignCenterHorizontal, AlignCenterVertical, AlignEndHorizontal, AlignEndVertical, AlignStartHorizontal, AlignStartVertical, ArrowLeft, ArrowRight, ArrowUp, Bell, Blend, BookOpen, Bot, Brush, ChartNoAxesGantt, Check, CheckCircle2, ChevronDown, CircleAlert, CircleHelp, Clapperboard, Cloud, Columns3, Compass, Copy, Crop, Dot, Download, Eraser, Expand, FileText, Film, Focus, FolderOpen, Globe2, Grid2X2, Hand, History, Image as ImageIcon, Keyboard, Layers3, LibraryBig, Link2, Lightbulb, ListTree, LoaderCircle, Maximize2, Menu, Moon, MousePointer2, Music2, Network, Palette, PanelsTopLeft, Plus, Redo2, Rows3, Scan, SlidersHorizontal, Sparkles, Square, Sun, Trash2, Undo2, Upload, Users, Video, WandSparkles, X } from 'lucide-vue-next'
import CanvasAgentDialog from '../components/CanvasAgentDialog.vue'
import CanvasAssetsPanel, { type CanvasAssetPanelItem, type CanvasPromptPanelItem } from '../components/CanvasAssetsPanel.vue'
import CanvasDramaProductionPanel, { type DramaBatchState, type DramaProductionSummary } from '../components/CanvasDramaProductionPanel.vue'
import CanvasDramaShotInspector from '../components/CanvasDramaShotInspector.vue'
import CanvasImageEditorDialog from '../components/CanvasImageEditorDialog.vue'
import CanvasMediaDialog, { type CanvasMediaAsset, type CanvasMediaKind } from '../components/CanvasMediaDialog.vue'
import CanvasFlowNode from '../components/CanvasFlowNode.vue'
import PluginSelector from '../components/PluginSelector.vue'
import { api, streamApiEvents } from '../services/api'
import { uploadAsset } from '../utils/asset-upload'
import type { CanvasAgentOperation, CanvasBackground, CanvasDocumentPayload, CanvasDramaStage, CanvasGenerationKind, CanvasGenerationOptions, CanvasImageToolOptions, CanvasImageToolType, CanvasKind, CanvasNodeData, CanvasNodeKind, CanvasRecord } from '../types/canvas'
import { emptyCanvasDocument } from '../types/canvas'
import { canvasTextRewritePlan } from '../utils/canvas-text'
import { clone } from '../utils/clone'
import { createClientId } from '../utils/client-id'
import { formatShortDayTime } from '../utils/datetime'
import { isAgentModelEligible, resolveCatalogModel, type CatalogModel } from '../utils/model-catalog'
import { splitShortDramaScript, type ShortDramaShotDraft } from '../utils/short-drama'
import { isDedicatedImageTool, mergeImageTools, type ImageToolOptions, type ImageToolRecord } from '../utils/image-tools'
import { useAuthStore } from '../stores/auth'
import { useStudioStore } from '../stores/studio'
import { updateStoredSettings } from '../utils/settings-storage'
import { agentTaskLabel } from '../utils/status-labels'
import { useCanvasHistory, type FlowEdge, type FlowNode } from '../composables/canvas/useCanvasHistory'
import { useCanvasPersistence, type CanvasSaveState } from '../composables/canvas/useCanvasPersistence'
import { useCanvasGenerationMonitor, type CanvasGenerationJob } from '../composables/canvas/useCanvasGenerationMonitor'
import { useCanvasKeyboard } from '../composables/canvas/useCanvasKeyboard'
import { useCanvasGenerationOptions } from '../composables/canvas/useCanvasGenerationOptions'
import { resizeTextarea } from '../composables/useAutoResizeTextarea'
import { useEscapeClose } from '../composables/useEscapeClose'
import ModelCatalogPicker from '../components/ModelCatalogPicker.vue'
import ModelBadge from '../components/common/ModelBadge.vue'

type CanvasImageTool = ImageToolRecord & { options?: (ImageToolOptions & CanvasImageToolOptions) | null }
type CanvasAgentHistoryItem = { id: string; title: string; goal: string; status: string; updatedAt?: string }
type NodeCreateMenu = { x: number; y: number; flowX: number; flowY: number; sourceId?: string }
type NodeCreateOption = { kind: CanvasNodeKind; label: string; description: string; icon: Component }
type CanvasPreset = { key: 'visual-story' | 'image-variation' | 'storyboard'; label: string; description: string; icon: Component }

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const studio = useStudioStore()
const flow = useVueFlow('xinyue-canvas')
const { fitView, setViewport, setCenter, screenToFlowCoordinate } = flow
const nodes = ref<FlowNode[]>([])
const edges = ref<FlowEdge[]>([])
const viewport = ref<ViewportTransform>({ x: 0, y: 0, zoom: 1 })
const background = ref<CanvasBackground>('dots')
const canvasPanMode = ref(false)
const kind = ref<CanvasKind>('FREEFORM')
const activeDramaStage = ref<CanvasDramaStage>('SCRIPT')
const title = ref('未命名画布')
const projectId = ref('')
const revision = ref(1)
const loading = ref(true)
const loadError = ref('')
const hydrated = ref(false)
const dirty = ref(false)
const saveState = ref<CanvasSaveState>('saved')
const saveError = ref('')
const importInput = ref<HTMLInputElement | null>(null)
const mediaUploadInput = ref<HTMLInputElement | null>(null)
const catalogModels = ref<CatalogModel[]>([])
const imageTools = ref<CanvasImageTool[]>([])
const catalogModelsError = ref('')
const imageToolsError = ref('')
const mediaPickerNodeId = ref('')
const mediaPickerNode = computed(() => nodes.value.find((node) => node.id === mediaPickerNodeId.value && isMediaNode(node)) || null)
const mediaPickerKind = computed<CanvasMediaKind>(() => mediaPickerNode.value?.data.kind === 'VIDEO' ? 'VIDEO' : mediaPickerNode.value?.data.kind === 'AUDIO' ? 'AUDIO' : 'IMAGE')
const imageEditorNodeId = ref('')
const imageEditorMode = ref<'crop' | 'mask'>('crop')
const imageEditorUploading = ref(false)
const agentOpen = ref(false)
const agentGoal = ref('')
const canvasAgentInput = ref<HTMLTextAreaElement | null>(null)
// 目标输入框自动伸缩：默认一行，输入随内容长高（封顶 140px），清空后收回，避免固定高度的空洞
function resizeAgentGoalInput() { resizeTextarea(canvasAgentInput.value, 140, 30) }
watch([agentGoal, canvasAgentInput], () => { void nextTick(resizeAgentGoalInput) })
const agentModel = ref('')
// 模型/参数选择用自定义浮层（原生 select 下拉无法定制样式）；打开时以触发钮/输入卡为锚定位一次
const agentModelPickerOpen = ref(false)
const inspectorModelOpen = ref(false)
const inspectorModelTrigger = ref<HTMLButtonElement | null>(null)
const inspectorModelPickerStyle = ref<Record<string, string>>({})
const agentParamOpen = ref(false)
const agentParamTrigger = ref<HTMLButtonElement | null>(null)
const agentModelPickerStyle = ref<{ [key: string]: string }>({})
const agentParamStyle = ref<{ [key: string]: string }>({})
const agentParamOptions = [{ value: 1, label: '1 张' }, { value: 2, label: '2 张' }, { value: 4, label: '4 张' }]
function closeAgentPickers() { agentModelPickerOpen.value = false; agentParamOpen.value = false }
async function toggleAgentModelPicker() {
  inspectorModelOpen.value = false
  agentParamOpen.value = false
  agentModelPickerOpen.value = !agentModelPickerOpen.value
  if (!agentModelPickerOpen.value) return
  await nextTick()
  const composer = document.querySelector('.canvas-agent-composer')?.getBoundingClientRect()
  if (composer) agentModelPickerStyle.value = { right: '12px', bottom: `${Math.round(window.innerHeight - composer.top + 8)}px`, top: 'auto', left: 'auto' }
}
async function toggleAgentParamPicker() {
  agentModelPickerOpen.value = false
  agentParamOpen.value = !agentParamOpen.value
  if (!agentParamOpen.value) return
  await nextTick()
  const trigger = agentParamTrigger.value?.getBoundingClientRect()
  if (trigger) agentParamStyle.value = { left: `${Math.max(12, Math.round(Math.min(trigger.right, window.innerWidth - 142)) - 130)}px`, bottom: `${Math.round(window.innerHeight - trigger.top + 8)}px`, top: 'auto' }
}
function closeAgentPickersOnOutside(event: PointerEvent) {
  const target = event.target as HTMLElement | null
  if (!target?.closest('.canvas-agent-model-trigger, .canvas-agent-param-trigger, .canvas-agent-model-picker, .canvas-agent-param-picker')) closeAgentPickers()
  if (!target?.closest('.canvas-inspector-model-trigger, .canvas-agent-model-picker')) inspectorModelOpen.value = false
}
const agentDockView = ref<'connect' | 'create' | 'history' | 'logs'>('create')
const agentHistory = ref<CanvasAgentHistoryItem[]>([])
const agentHistoryLoading = ref(false)
const selectedAgentTaskId = ref('')
const assetsPanelOpen = ref(false)
const canvasMenuOpen = ref(false)
const presetMenuOpen = ref(false)
const clearCanvasOpen = ref(false)
const pendingPanelAsset = ref<CanvasAssetPanelItem | null>(null)
const agentSidebarOpen = ref(false)
const canvasSidebarWidth = ref(404)
const compactCanvasQuery = window.matchMedia('(max-width: 680px)')
const miniMapOpen = ref(false)
const canvasAppearanceOpen = ref(false)
const agentPluginId = ref('')
const agentSmartPlanning = ref(true)
const agentGenerationCount = ref(1)
const shortcutHelpOpen = ref(false)
const canvasDark = ref(document.documentElement.dataset.studioTheme !== 'light')
const unreadNotifications = ref(0)
const productionSidebarOpen = ref(false)
const workspacePanel = ref<'agent' | 'properties' | 'production'>('agent')
const nodeConfigOpen = ref(false)
const canvasContextMenu = ref<{ x: number; y: number; flowX: number; flowY: number; nodeId?: string; edgeId?: string } | null>(null)
const nodeCreateMenu = ref<NodeCreateMenu | null>(null)
const connectionStartNodeId = ref('')
const imageEditorNode = computed(() => nodes.value.find((node) => node.id === imageEditorNodeId.value && node.data.kind === 'IMAGE' && node.data.url && node.data.assetId) || null)
const outpaintFields: Array<{ key: keyof CanvasImageToolOptions; label: string }> = [{ key: 'outpaintLeft', label: '左扩展' }, { key: 'outpaintRight', label: '右扩展' }, { key: 'outpaintTop', label: '上扩展' }, { key: 'outpaintBottom', label: '下扩展' }]
const {
  applyingHistory,
  checkpoint,
  copySelected,
  deleteSelected,
  future,
  history,
  pasteNodes,
  redo,
  resetHistory,
  undo,
} = useCanvasHistory({ nodes, edges, viewport, background, hydrated, dirty, saveState, setViewport, scheduleSave: () => scheduleSave() })

const { saveLabel, scheduleSave, saveNow, handleBeforeUnload, pauseDocumentWatch, resumeDocumentWatch } = useCanvasPersistence({
  title,
  revision,
  hydrated,
  dirty,
  loadError,
  saveState,
  saveError,
  documentState: () => [nodes.value, edges.value, background.value],
  serializeDocument,
}, {
  isApplyingHistory: () => applyingHistory.value,
  saveRecord: (input) => api<CanvasRecord>(`/canvases/${String(route.params.id)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  }),
})

function onCanvasDragStart() { checkpoint(); pauseDocumentWatch() }
function onCanvasDragStop() { resumeDocumentWatch() }

const {
  temporaryPanActive,
  handleKeyboard,
  handleKeyboardUp,
  resetTemporaryPan,
  handleClipboardPaste
} = useCanvasKeyboard({
  nodes,
  edges,
  save: saveNow,
  undo,
  redo,
  copySelected,
  pasteNodes,
  duplicateSelected,
  fitView: () => fitView({ padding: 0.18, duration: 260 }),
  focusSelected,
  zoom: zoomCanvas,
  nudgeSelected,
  closeTransientUi: closeTransientCanvasUi,
  deselectAll,
  deleteSelected,
  wrapSelectedInGroup,
  ungroupSelected,
  screenToFlowCoordinate,
  uploadFiles: uploadCanvasFiles,
  addTextNode: (position) => addNodeAtFlow('TEXT', position),
  updateNodeData
})

const { monitorGeneration, cancelGeneration } = useCanvasGenerationMonitor({
  nodeExists: (nodeId) => nodes.value.some((node) => node.id === nodeId),
  jobIdForNode: (nodeId) => nodes.value.find((node) => node.id === nodeId)?.data.jobId,
  updateNode: updateNodeData,
  applyResult: applyGenerationResult,
  streamJob: (jobId, onUpdate) => streamApiEvents<CanvasGenerationJob>(`/generations/${jobId}/events`, onUpdate),
  fetchJob: (jobId) => api<CanvasGenerationJob>(`/generations/${jobId}`),
  cancelJob: (jobId) => api<CanvasGenerationJob>(`/generations/${jobId}/cancel`, { method: 'POST', body: JSON.stringify({}) }),
})

const defaultEdgeOptions = { type: 'smoothstep', markerEnd: MarkerType.ArrowClosed, style: { stroke: 'var(--canvas-edge)', strokeWidth: 1.7 } }
const selectedNode = computed(() => nodes.value.find((node) => node.selected) || null)
const selectionCount = computed(() => nodes.value.filter((node) => node.selected).length)
const selectedEdgeCount = computed(() => edges.value.filter((edge) => edge.selected).length)
const effectivePanMode = computed(() => temporaryPanActive.value ? !canvasPanMode.value : canvasPanMode.value)
const sidebarOpen = computed(() => agentSidebarOpen.value || productionSidebarOpen.value || (nodeConfigOpen.value && Boolean(selectedNode.value)))
const canvasMedia = computed<Array<{ id: string; kind: CanvasGenerationKind; title: string; url: string }>>(() => nodes.value.flatMap((node) => (node.data.kind === 'IMAGE' || node.data.kind === 'VIDEO') && node.data.url ? [{ id: node.id, kind: node.data.kind, title: node.data.title, url: node.data.url }] : []))
const isDramaCanvas = computed(() => kind.value === 'SHORT_DRAMA')
const agentAvailable = computed(() => catalogModels.value.some(isAgentModelEligible))
const agentModelsCount = computed(() => catalogModels.value.filter(isAgentModelEligible).length)
const agentModels = computed(() => catalogModels.value.filter(isAgentModelEligible))
const agentModelLabel = computed(() => agentModels.value.find((item) => item.key === agentModel.value)?.displayName || '选择模型')
const canvasPresets: CanvasPreset[] = [
  { key: 'visual-story', label: '创意到视频', description: '文案、图片和视频的一条创作链路', icon: Video },
  { key: 'image-variation', label: '图片多方向', description: '从同一创意快速探索两种视觉方向', icon: ImageIcon },
  { key: 'storyboard', label: '镜头分镜', description: '镜头描述、生成配置、分镜图和成片', icon: Clapperboard },
]
const nodeCreateSource = computed(() => nodeCreateMenu.value?.sourceId ? nodes.value.find((node) => node.id === nodeCreateMenu.value?.sourceId) || null : null)
const nodeCreateSourceLabel = computed(() => nodeCreateSource.value ? `来自「${nodeCreateSource.value.data.title}」` : '选择下一步创作类型')
const nodeCreateOptions = computed<NodeCreateOption[]>(() => {
  const source = nodeCreateSource.value
  if (!source || source.data.kind === 'GROUP') return [
    { kind: 'TEXT', label: '文本', description: '添加提示词、脚本或说明', icon: FileText },
    { kind: 'IMAGE', label: '图片生成', description: '创建图片创作节点', icon: ImageIcon },
    { kind: 'VIDEO', label: '视频生成', description: '创建视频创作节点', icon: Video },
    { kind: 'AUDIO', label: '音频素材', description: '上传并管理音频素材', icon: Music2 },
    { kind: 'CONFIG', label: '生成设置', description: '配置模型和生成参数', icon: SlidersHorizontal },
    { kind: 'GROUP', label: '分组', description: '整理相关创作内容', icon: Layers3 },
  ]
  if (source.data.kind === 'TEXT' || source.data.kind === 'CONFIG') return [
    { kind: 'IMAGE', label: '生成图片', description: '继承文本内容作为提示词', icon: ImageIcon },
    { kind: 'VIDEO', label: '生成视频', description: '将当前创意延展为视频', icon: Video },
    { kind: 'TEXT', label: '补充文本', description: '继续拆解创意和文案', icon: FileText },
  ]
  if (source.data.kind === 'IMAGE') return [
    { kind: 'IMAGE', label: '派生图片', description: '基于当前画面继续创作', icon: ImageIcon },
    { kind: 'VIDEO', label: '生成视频', description: '以当前画面作为参考', icon: Video },
    { kind: 'TEXT', label: '补充说明', description: '记录画面方向和提示词', icon: FileText },
  ]
  return [
    { kind: 'VIDEO', label: '派生视频', description: '基于当前视频继续创作', icon: Video },
    { kind: 'IMAGE', label: '提取视觉方向', description: '创建相关图片创作节点', icon: ImageIcon },
    { kind: 'TEXT', label: '补充说明', description: '记录镜头和创意说明', icon: FileText },
  ]
})
const dramaBatch = ref<DramaBatchState>({ active: false, label: '', total: 0, completed: 0, message: '', error: false })
let dramaBatchStopRequested = false
const dramaProductionSummary = computed<DramaProductionSummary>(() => {
  const shotNodes = nodes.value.filter((node) => node.data.shotId)
  const shotIds = [...new Set(shotNodes.map((node) => node.data.shotId!))]
  const storyboards = shotIds.map((id) => shotNodes.find((node) => node.data.shotId === id && node.data.dramaRole === 'STORYBOARD')).filter((node): node is FlowNode => Boolean(node))
  const videos = shotIds.map((id) => shotNodes.find((node) => node.data.shotId === id && node.data.dramaRole === 'SHOT_VIDEO')).filter((node): node is FlowNode => Boolean(node))
  const done = (node: FlowNode) => Boolean(node.data.assetId && node.data.url)
  const running = (node: FlowNode) => node.data.status === 'QUEUED' || node.data.status === 'RUNNING'
  const ready = (node: FlowNode) => !done(node) && !running(node) && Boolean(generationContext(node).prompt.trim() && generationModel(node)) && (node.data.kind !== 'VIDEO' || generationContext(node).referenceAssetIds.length > 0)
  const duration = shotIds.reduce((total, id) => total + (shotNodes.find((node) => node.data.shotId === id)?.data.duration || 5), 0)
  return {
    shots: shotIds.length,
    duration,
    storyboardDone: storyboards.filter(done).length,
    storyboardReady: storyboards.filter(ready).length,
    storyboardBlocked: storyboards.filter((node) => !done(node) && !running(node) && !ready(node)).length,
    videoDone: videos.filter(done).length,
    videoReady: videos.filter(ready).length,
    videoBlocked: videos.filter((node) => !done(node) && !running(node) && !ready(node)).length,
    running: [...storyboards, ...videos].filter(running).length,
    failed: new Set(shotNodes.filter((node) => node.data.status === 'FAILED').map((node) => node.data.shotId)).size,
  }
})
const dramaStages: Array<{ key: CanvasDramaStage; order: string; label: string; icon: Component }> = [
  { key: 'SCRIPT', order: '01', label: '剧本', icon: BookOpen },
  { key: 'ASSETS', order: '02', label: '角色与场景', icon: Users },
  { key: 'STORYBOARD', order: '03', label: '分镜', icon: PanelsTopLeft },
  { key: 'PRODUCTION', order: '04', label: '成片', icon: Film },
]

watch(selectedNode, async (node) => {
  if (node) return
  await nextTick()
  if (!selectedNode.value) nodeConfigOpen.value = false
})

// Highlight edges connected to running generations so the data flow is visible.
watch(() => nodes.value.map((node) => `${node.id}:${node.data.status || ''}`).join('|'), () => {
  const active = new Set(nodes.value.filter((node) => node.data.status === 'QUEUED' || node.data.status === 'RUNNING').map((node) => node.id))
  edges.value.forEach((edge) => {
    const animated = active.has(edge.source) || active.has(edge.target)
    if (Boolean(edge.animated) !== animated) edge.animated = animated
  })
})

function closeHeaderMenusOnOutside(event: PointerEvent) {
  const target = event.target as HTMLElement | null
  if (canvasMenuOpen.value && !target?.closest('.canvas-menu-trigger, .canvas-command-menu')) canvasMenuOpen.value = false
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyboard)
  window.addEventListener('keyup', handleKeyboardUp)
  window.addEventListener('blur', resetTemporaryPan)
  window.addEventListener('paste', handleClipboardPaste)
  window.addEventListener('beforeunload', handleBeforeUnload)
  document.addEventListener('pointerdown', closeHeaderMenusOnOutside)
  document.addEventListener('pointerdown', closeAgentPickersOnOutside)
  compactCanvasQuery.addEventListener('change', handleCompactCanvasChange)
  void studio.refreshCredits().catch(() => undefined)
  void api<Array<{ readAt?: string | null }>>('/notifications').then((items) => { unreadNotifications.value = items.filter((item) => !item.readAt).length }).catch(() => undefined)
  void loadCanvas()
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeyboard)
  window.removeEventListener('keyup', handleKeyboardUp)
  window.removeEventListener('blur', resetTemporaryPan)
  window.removeEventListener('paste', handleClipboardPaste)
  window.removeEventListener('beforeunload', handleBeforeUnload)
  document.removeEventListener('pointerdown', closeHeaderMenusOnOutside)
  document.removeEventListener('pointerdown', closeAgentPickersOnOutside)
  compactCanvasQuery.removeEventListener('change', handleCompactCanvasChange)
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
})

onBeforeRouteLeave(async () => {
  if (dirty.value) await saveNow()
  return !dirty.value || window.confirm('画布尚未保存，仍然离开？')
})

async function loadCanvas() {
  loading.value = true
  loadError.value = ''
  hydrated.value = false
  try {
    const [recordResult, modelsResult, toolsResult] = await Promise.allSettled([
      api<CanvasRecord>(`/canvases/${String(route.params.id)}`),
      api<CatalogModel[]>('/users/me/models'),
      api<CanvasImageTool[]>('/inspirations?mode=IMAGE_TOOL'),
    ])
    if (recordResult.status === 'rejected') throw recordResult.reason
    const record = recordResult.value
    applyCanvasCatalogResults(modelsResult, toolsResult)
    agentModel.value = agentModels.value.find((item) => item.isDefault)?.key || agentModels.value[0]?.key || ''
    title.value = record.title
    kind.value = record.kind
    projectId.value = record.projectId || ''
    revision.value = record.revision
    applyDocument(record.document || emptyCanvasDocument())
    resetHistory()
    loading.value = false
    await nextTick()
    await setViewport(record.document?.viewport || { x: 0, y: 0, zoom: 1 })
    void loadAgentHistory()
    // The reference canvas opens with the Agent workspace visible. Keep the
    // connection state in the real panel so an unconfigured Agent is still
    // actionable rather than presenting a dead button.
    agentSidebarOpen.value = !compactCanvasQuery.matches
    workspacePanel.value = 'agent'
    // Keep the complete Agent workspace visible before a model is configured;
    // the action button and notice explain the missing setup in place.
    agentDockView.value = 'create'
    dirty.value = false
    saveState.value = 'saved'
    hydrated.value = true
    for (const node of nodes.value) {
      if (node.data.jobId && (node.data.status === 'QUEUED' || node.data.status === 'RUNNING')) void monitorGeneration(node.id, node.data.jobId)
    }
  } catch (reason) { loadError.value = reason instanceof Error ? reason.message : '画布加载失败' }
  finally { loading.value = false }
}

function handleCompactCanvasChange(event: MediaQueryListEvent) {
  if (!event.matches) return
  agentSidebarOpen.value = false
  productionSidebarOpen.value = false
}

function applyCanvasCatalogResults(
  modelsResult: PromiseSettledResult<CatalogModel[]>,
  toolsResult: PromiseSettledResult<CanvasImageTool[]>,
) {
  if (modelsResult.status === 'fulfilled') {
    catalogModels.value = modelsResult.value
    catalogModelsError.value = ''
  } else {
    catalogModelsError.value = '模型目录加载失败，暂时无法选择或运行生成模型。'
  }
  if (toolsResult.status === 'fulfilled') {
    imageTools.value = mergeImageTools(toolsResult.value) as CanvasImageTool[]
    imageToolsError.value = ''
  } else {
    imageToolsError.value = '图片工具加载失败，裁剪和蒙版仍可使用。'
  }
}

async function reloadCanvasCatalog() {
  const [modelsResult, toolsResult] = await Promise.allSettled([
    api<CatalogModel[]>('/users/me/models'),
    api<CanvasImageTool[]>('/inspirations?mode=IMAGE_TOOL'),
  ])
  applyCanvasCatalogResults(modelsResult, toolsResult)
}

function applyDocument(document: CanvasDocumentPayload) {
  applyingHistory.value = true
  background.value = document.background || 'dots'
  viewport.value = document.viewport || { x: 0, y: 0, zoom: 1 }
  nodes.value = (document.nodes || []).map((node) => ({
    id: node.id,
    type: 'canvas',
    position: { ...node.position },
    data: { ...node.data, kind: node.type, title: node.title, content: node.data.content || '' },
    style: { width: `${node.size?.width || 280}px`, height: `${node.size?.height || (node.type === 'GROUP' ? 360 : 220)}px` },
    selected: false,
  }))
  edges.value = (document.edges || []).map((edge) => ({ ...edge, type: 'smoothstep', markerEnd: MarkerType.ArrowClosed }))
  nextTick(() => { applyingHistory.value = false })
}

function serializeDocument(): CanvasDocumentPayload {
  return {
    version: 1,
    viewport: { ...viewport.value },
    background: background.value,
    nodes: nodes.value.map((node) => ({
      id: node.id,
      type: node.data.kind,
      title: node.data.title,
      position: { x: node.position.x, y: node.position.y },
      size: { width: node.dimensions?.width || styleNumber(node.style, 'width', 280), height: node.dimensions?.height || styleNumber(node.style, 'height', node.data.kind === 'GROUP' ? 360 : 220) },
      data: { ...node.data },
    })),
    edges: edges.value.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target, label: typeof edge.label === 'string' ? edge.label : '' })),
  }
}

function styleNumber(style: FlowNode['style'], key: 'width' | 'height', fallback: number) {
  if (!style) return fallback
  const value = style[key]
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value || ''))
  return Number.isFinite(parsed) ? parsed : fallback
}

function isMediaNode(node: FlowNode | null | undefined) { return node?.data.kind === 'IMAGE' || node?.data.kind === 'VIDEO' || node?.data.kind === 'AUDIO' }
const {
  isGenerationNode,
  activeGenerationKind,
  modelsForNode,
  defaultModel,
  flowNodeModelOptions,
  flowNodeGenerationModel,
  flowNodeGenerationSummary,
  upstreamNodes,
  generationContext,
  generationModel,
  imageCapabilities,
  videoCapabilities,
  generationOptions,
  generationCreditCost,
  imageSizeLabel,
  qualityLabel
} = useCanvasGenerationOptions({
  nodes,
  edges,
  catalogModels,
  activeImageTool
})
const inspectorSelectedModel = computed(() => selectedNode.value ? resolveCatalogModel(modelsForNode(selectedNode.value), generationModel(selectedNode.value)) : undefined)
const inspectorModelLabel = computed(() => inspectorSelectedModel.value?.displayName || '选择可用模型')
watch(() => [selectedNode.value?.id, nodeConfigOpen.value] as const, () => { inspectorModelOpen.value = false })
useEscapeClose(() => { inspectorModelOpen.value = false }, { enabled: () => inspectorModelOpen.value })
async function toggleInspectorModelPicker() {
  closeAgentPickers()
  inspectorModelOpen.value = !inspectorModelOpen.value
  if (!inspectorModelOpen.value) return
  await nextTick()
  const trigger = inspectorModelTrigger.value?.getBoundingClientRect()
  if (!trigger) return
  const edge = 12
  const width = Math.min(704, window.innerWidth - edge * 2)
  const height = Math.min(460, window.innerHeight - edge * 2)
  const openAbove = trigger.top - edge >= height || trigger.top >= window.innerHeight - trigger.bottom
  const top = openAbove
    ? Math.max(edge, trigger.top - 8 - height)
    : Math.min(window.innerHeight - edge - height, trigger.bottom + 8)
  const left = Math.min(Math.max(edge, trigger.right - width), Math.max(edge, window.innerWidth - width - edge))
  inspectorModelPickerStyle.value = { left: `${Math.round(left)}px`, top: `${Math.round(top)}px`, width: `${Math.round(width)}px` }
}
function selectInspectorModel(value: string) {
  const node = selectedNode.value
  if (!node) return
  checkpoint()
  updateNodeData(node.id, { model: value, generationOptions: {} })
  inspectorModelOpen.value = false
}
function addNode(kind: CanvasNodeKind) {
  const nodeIndex = nodes.value.length
  const position = screenToFlowCoordinate({
    x: Math.min(window.innerWidth - 220, Math.max(220, window.innerWidth * 0.42)) + (nodeIndex % 3) * 42,
    y: Math.min(window.innerHeight - 220, Math.max(260, window.innerHeight * 0.42) + (Math.floor(nodeIndex / 3) % 6) * 44),
  })
  addNodeAtFlow(kind, position)
}

function addPanoramaNode() {
  const position = screenToFlowCoordinate({ x: window.innerWidth / 2, y: window.innerHeight / 2 })
  const id = addNodeAtFlow('IMAGE', position)
  updateNodeData(id, { title: '全景图', generationOptions: { size: '1536x1024', quality: 'medium', count: 1 } })
}

function addNodeAt(kind: CanvasNodeKind, position: { flowX: number; flowY: number }) {
  addNodeAtFlow(kind, { x: position.flowX, y: position.flowY })
  canvasContextMenu.value = null
}

function openNodeCreateMenu(event: MouseEvent) {
  const target = event.target as Element | null
  if (effectivePanMode.value) return
  if (target?.closest('[data-canvas-no-zoom], .vue-flow__node, .vue-flow__controls, .vue-flow__minimap, .canvas-context-menu, .canvas-node-create-menu')) return
  event.preventDefault()
  const point = screenToFlowCoordinate({ x: event.clientX, y: event.clientY })
  const position = createMenuScreenPosition(event.clientX, event.clientY)
  canvasContextMenu.value = null
  canvasMenuOpen.value = false
  nodeCreateMenu.value = { x: position.x, y: position.y, flowX: point.x, flowY: point.y }
}

function handleConnectStart(payload: { nodeId?: string; handleType?: 'source' | 'target' }) {
  connectionStartNodeId.value = payload.handleType === 'source' && payload.nodeId ? payload.nodeId : ''
  nodeCreateMenu.value = null
}

function handleConnectEnd(event?: MouseEvent) {
  const sourceId = connectionStartNodeId.value
  connectionStartNodeId.value = ''
  if (!sourceId || !event) return
  const target = event.target as Element | null
  if (target?.closest('.vue-flow__handle, .vue-flow__node, [data-canvas-no-zoom]')) return
  const point = screenToFlowCoordinate({ x: event.clientX, y: event.clientY })
  const position = createMenuScreenPosition(event.clientX, event.clientY)
  canvasContextMenu.value = null
  nodeCreateMenu.value = { x: position.x, y: position.y, flowX: point.x, flowY: point.y, sourceId }
}

function createMenuScreenPosition(x: number, y: number) {
  return { x: Math.max(12, Math.min(x, window.innerWidth - 286)), y: Math.max(66, Math.min(y, window.innerHeight - 380)) }
}

function createNodeFromMenu(kind: CanvasNodeKind) {
  const menu = nodeCreateMenu.value
  if (!menu) return
  const source = menu.sourceId ? nodes.value.find((node) => node.id === menu.sourceId) : undefined
  const id = addNodeAtFlow(kind, { x: menu.flowX, y: menu.flowY })
  if (source) {
    const prompt = source.data.kind === 'TEXT'
      ? source.data.content.trim() || source.data.prompt?.trim() || `基于“${source.data.title}”继续创作`
      : source.data.prompt?.trim() || `基于“${source.data.title}”继续创作`
    const patch: Partial<CanvasNodeData> = kind === 'TEXT'
      ? { title: `${source.data.title} · 说明`, content: source.data.content || source.data.prompt || '' }
      : kind === 'IMAGE' || kind === 'VIDEO' || kind === 'CONFIG'
        ? { prompt, generationKind: kind === 'VIDEO' ? 'VIDEO' : 'IMAGE', model: defaultModel(kind === 'VIDEO' ? 'VIDEO' : 'IMAGE') }
        : {}
    if (Object.keys(patch).length) updateNodeData(id, patch)
    edges.value.push({
      id: createClientId(),
      source: source.id,
      target: id,
      type: 'smoothstep',
      markerEnd: MarkerType.ArrowClosed,
      label: kind === 'VIDEO' ? '生成视频' : kind === 'IMAGE' ? '生成图片' : '延展',
    })
    if (kind === 'IMAGE' || kind === 'VIDEO' || kind === 'CONFIG') {
      agentSidebarOpen.value = false
      productionSidebarOpen.value = false
      workspacePanel.value = 'properties'
      nodeConfigOpen.value = true
    }
    if ((kind === 'IMAGE' || kind === 'VIDEO') && (source.data.kind === 'TEXT' || source.data.kind === 'CONFIG') && prompt) {
      void nextTick(() => { void generateNode(id) })
    }
  }
  nodeCreateMenu.value = null
}

async function handleCanvasDrop(event: DragEvent) {
  const rawAsset = event.dataTransfer?.getData('application/x-xinyue-canvas-asset')
  if (rawAsset) {
    try {
      const asset = JSON.parse(rawAsset) as CanvasAssetPanelItem
      if (asset.id && asset.contentUrl && (asset.kind === 'IMAGE' || asset.kind === 'VIDEO')) {
        insertCanvasAsset(asset, screenToFlowCoordinate({ x: event.clientX, y: event.clientY }))
        pendingPanelAsset.value = null
        return
      }
    } catch { /* Ignore unrelated drag payloads. */ }
  }
  if (pendingPanelAsset.value) {
    insertCanvasAsset(pendingPanelAsset.value, screenToFlowCoordinate({ x: event.clientX, y: event.clientY }))
    pendingPanelAsset.value = null
    return
  }
  const droppedFiles = Array.from(event.dataTransfer?.files || [])
  const files = droppedFiles.filter((file) => file.type.startsWith('image/') || file.type.startsWith('video/') || file.type.startsWith('audio/'))
  const origin = screenToFlowCoordinate({ x: event.clientX, y: event.clientY })
  if (files.length) await uploadCanvasFiles(files, origin)
  const textFiles = droppedFiles.filter((file) => file.type.startsWith('text/') || /\.(txt|md|markdown|json|csv)$/i.test(file.name)).slice(0, 8)
  for (const [index, file] of textFiles.entries()) {
    const id = addNodeAtFlow('TEXT', { x: origin.x + (files.length + index) * 34, y: origin.y + (files.length + index) * 34 })
    try {
      updateNodeData(id, { title: file.name.slice(0, 120), content: (await file.text()).slice(0, 20_000) })
    } catch (reason) {
      updateNodeData(id, { title: file.name.slice(0, 120), content: '', error: reason instanceof Error ? reason.message : '文本文件读取失败' })
    }
  }
}

async function selectCanvasFiles(event: Event) {
  const input = event.target as HTMLInputElement
  const allFiles = Array.from(input.files || [])
  const files = allFiles.filter((file) => file.type.startsWith('image/') || file.type.startsWith('video/') || file.type.startsWith('audio/'))
  const textFiles = allFiles.filter((file) => file.type.startsWith('text/') || /\.(txt|md|markdown|json|csv)$/i.test(file.name)).slice(0, 8)
  input.value = ''
  const origin = screenToFlowCoordinate({ x: window.innerWidth / 2, y: window.innerHeight / 2 })
  if (files.length) await uploadCanvasFiles(files, origin)
  for (const [index, file] of textFiles.entries()) {
    const id = addNodeAtFlow('TEXT', { x: origin.x + (files.length + index) * 34, y: origin.y + (files.length + index) * 34 })
    try { updateNodeData(id, { title: file.name.slice(0, 120), content: (await file.text()).slice(0, 20_000) }) }
    catch (reason) { updateNodeData(id, { title: file.name.slice(0, 120), content: '', error: reason instanceof Error ? reason.message : '文本文件读取失败' }) }
  }
}

async function uploadCanvasFiles(files: File[], origin: { x: number; y: number }) {
  for (const [index, file] of files.slice(0, 8).entries()) {
    const kind: CanvasNodeKind = file.type.startsWith('video/') ? 'VIDEO' : file.type.startsWith('audio/') ? 'AUDIO' : 'IMAGE'
    const position = { x: origin.x + index * 34, y: origin.y + index * 34 }
    const nodeId = addNodeAtFlow(kind, position)
    updateNodeData(nodeId, { title: file.name.slice(0, 120), status: 'RUNNING', error: '' })
    try {
      const asset = await uploadAsset<CanvasMediaAsset>(file, {
        kind: kind === 'VIDEO' ? 'VIDEO' : kind === 'AUDIO' ? 'FILE' : 'IMAGE',
        purpose: 'library',
        projectId: projectId.value,
      })
      updateNodeData(nodeId, { url: asset.contentUrl, assetId: asset.id, mimeType: asset.mimeType, status: 'SUCCEEDED', error: '' })
    } catch (reason) {
      updateNodeData(nodeId, { status: 'FAILED', error: reason instanceof Error ? reason.message : '素材上传失败' })
    }
  }
}

function insertCanvasAsset(asset: CanvasAssetPanelItem, position = screenToFlowCoordinate({ x: window.innerWidth / 2, y: window.innerHeight / 2 })) {
  const kind: CanvasNodeKind = asset.kind === 'VIDEO' ? 'VIDEO' : 'IMAGE'
  const id = addNodeAtFlow(kind, position)
  updateNodeData(id, { title: asset.name.slice(0, 120), url: asset.contentUrl, assetId: asset.id, mimeType: asset.mimeType, status: 'SUCCEEDED', error: '' })
}

function insertCanvasPrompt(prompt: CanvasPromptPanelItem) {
  const id = addNodeAtFlow('TEXT', screenToFlowCoordinate({ x: window.innerWidth / 2, y: window.innerHeight / 2 }))
  updateNodeData(id, { title: prompt.title.slice(0, 120), content: (prompt.prompt || prompt.description || '').slice(0, 20_000) })
}

async function focusNode(id: string) {
  if (!nodes.value.some((node) => node.id === id)) return
  nodes.value.forEach((node) => { node.selected = node.id === id })
  nodeConfigOpen.value = false
  await nextTick()
  await fitView({ nodes: [id], padding: 0.35, maxZoom: 1.2, duration: 250 })
}

function createFlowNode(kind: CanvasNodeKind, position: { x: number; y: number }, patch: Partial<CanvasNodeData> = {}): FlowNode {
  const size = kind === 'GROUP' ? { width: 520, height: 360 } : kind === 'IMAGE' ? { width: 320, height: 320 } : kind === 'VIDEO' ? { width: 360, height: 240 } : kind === 'AUDIO' ? { width: 320, height: 150 } : { width: 300, height: 220 }
  const generationKind = kind === 'VIDEO' ? 'VIDEO' : 'IMAGE'
  const id = createClientId()
  return {
    id,
    type: 'canvas',
    position: { x: position.x - size.width / 2, y: position.y - size.height / 2 },
    data: {
      kind,
      title: nodeKindLabel(kind),
      content: '',
      ...(kind === 'TEXT' ? { model: defaultModel('CHAT'), status: 'IDLE' as const } : {}),
      ...(kind === 'IMAGE' || kind === 'VIDEO' || kind === 'CONFIG' ? { generationKind, model: defaultModel(generationKind), status: 'IDLE' as const } : {}),
      ...patch,
    },
    style: { width: `${size.width}px`, height: `${size.height}px` },
    selected: false,
  }
}

function addNodeAtFlow(kind: CanvasNodeKind, position: { x: number; y: number }) {
  checkpoint()
  nodes.value.forEach((node) => { node.selected = false })
  const node = createFlowNode(kind, position)
  if (kind === 'GROUP') nodes.value.unshift(node)
  else nodes.value.push(node)
  return node.id
}

function applyCanvasPreset(key: CanvasPreset['key']) {
  const center = screenToFlowCoordinate({ x: window.innerWidth / 2, y: window.innerHeight / 2 })
  checkpoint()
  nodes.value.forEach((node) => { node.selected = false })
  edges.value.forEach((edge) => { edge.selected = false })
  const create = (kind: CanvasNodeKind, x: number, y: number, patch: Partial<CanvasNodeData>) => createFlowNode(kind, { x: center.x + x, y: center.y + y }, patch)
  let additions: FlowNode[] = []
  let links: Array<[FlowNode, FlowNode, string]> = []

  if (key === 'visual-story') {
    const brief = create('TEXT', -390, 0, { title: '创意简报', content: '目标：\n受众：\n核心信息：\n视觉方向：' })
    const image = create('IMAGE', 0, 0, { title: '主视觉', prompt: '根据创意简报生成一张具有明确主体、构图与光线的主视觉图片。' })
    const video = create('VIDEO', 390, 0, { title: '动态延展', prompt: '基于主视觉生成自然、有节奏的短视频镜头。' })
    additions = [brief, image, video]
    links = [[brief, image, '生成图片'], [image, video, '生成视频']]
  } else if (key === 'image-variation') {
    const brief = create('TEXT', -330, 0, { title: '视觉方向', content: '产品/主体：\n风格关键词：\n希望保留的元素：' })
    const first = create('IMAGE', 20, -145, { title: '视觉方向 A', prompt: '根据视觉方向生成克制、干净的主视觉方案。' })
    const second = create('IMAGE', 20, 145, { title: '视觉方向 B', prompt: '根据同一视觉方向生成更具张力和对比度的备选方案。' })
    additions = [brief, first, second]
    links = [[brief, first, '视觉方向'], [brief, second, '视觉方向']]
  } else {
    const script = create('TEXT', -500, 0, { title: '镜头描述', content: '景别：\n主体动作：\n环境与光线：\n运镜：' })
    const config = create('CONFIG', -150, 0, { title: '分镜配置', prompt: '保持画面风格、角色与环境的一致性。' })
    const image = create('IMAGE', 210, 0, { title: '分镜图', prompt: '根据镜头描述生成电影感分镜画面。' })
    const video = create('VIDEO', 570, 0, { title: '镜头成片', prompt: '基于分镜图生成连续镜头，保持主体和场景一致。' })
    additions = [script, config, image, video]
    links = [[script, config, '输入'], [config, image, '生成图片'], [image, video, '生成视频']]
  }

  additions.forEach((node, index) => { node.selected = index === additions.length - 1 })
  nodes.value.push(...additions)
  edges.value.push(...links.map(([source, target, label]) => ({ id: createClientId(), source: source.id, target: target.id, type: 'smoothstep', markerEnd: MarkerType.ArrowClosed, label })))
  presetMenuOpen.value = false
}

function openAgentPanel() {
  nodeCreateMenu.value = null
  canvasContextMenu.value = null
  presetMenuOpen.value = false
  agentOpen.value = false
  agentSidebarOpen.value = !agentSidebarOpen.value
  productionSidebarOpen.value = false
  nodeConfigOpen.value = false
  workspacePanel.value = 'agent'
  if (agentSidebarOpen.value) agentDockView.value = 'create'
}

async function keepCanvasNodeVisible(id: string) {
  await nextTick()
  const node = nodes.value.find((item) => item.id === id)
  const nodeElement = document.querySelector<HTMLElement>(`.vue-flow__node-canvas[data-id="${id}"]`)
  const flowElement = document.querySelector<HTMLElement>('.canvas-flow')
  if (!node || !nodeElement || !flowElement) return
  const nodeRect = nodeElement.getBoundingClientRect()
  const flowRect = flowElement.getBoundingClientRect()
  const safeTop = flowRect.top + 72
  const safeBottom = flowRect.bottom - 140
  const needsReframe = nodeRect.top < safeTop || nodeRect.bottom > safeBottom || nodeRect.left < flowRect.left + 16 || nodeRect.right > flowRect.right - 16
  if (!needsReframe) return
  const width = styleNumber(node.style, 'width', 320)
  const height = styleNumber(node.style, 'height', 240)
  await setCenter(node.position.x + width / 2, node.position.y + height / 2, { zoom: viewport.value.zoom, duration: 220 })
}

async function selectCanvasNode(id: string) {
  if (!nodes.value.some((node) => node.id === id)) return
  nodeCreateMenu.value = null
  canvasContextMenu.value = null
  nodes.value.forEach((node) => { node.selected = node.id === id })
  await keepCanvasNodeVisible(id)
}

function openWorkspaceSettings(section: 'account' | 'api' | 'credits' | 'notifications') {
  void router.push({ path: '/chat', query: { settings: section } })
}

function toggleCanvasTheme() {
  canvasDark.value = !canvasDark.value
  const appearance = canvasDark.value ? '深色' : '浅色'
  updateStoredSettings((current) => ({ ...current, appearance, pendingServerSync: { ...(current.pendingServerSync || {}), appearance, changedAt: Date.now() } }))
  document.documentElement.dataset.studioTheme = canvasDark.value ? 'dark' : 'light'
}

function openProductionPanel() {
  nodeCreateMenu.value = null
  canvasContextMenu.value = null
  presetMenuOpen.value = false
  productionSidebarOpen.value = !productionSidebarOpen.value
  agentSidebarOpen.value = false
  nodeConfigOpen.value = false
  workspacePanel.value = 'production'
}

function openNodeSettings(id: string) {
  if (!nodes.value.some((node) => node.id === id)) return
  nodeCreateMenu.value = null
  canvasContextMenu.value = null
  presetMenuOpen.value = false
  nodes.value.forEach((node) => { node.selected = node.id === id })
  agentSidebarOpen.value = false
  productionSidebarOpen.value = false
  workspacePanel.value = 'properties'
  nodeConfigOpen.value = true
}

function extendFromNode(id: string, event: MouseEvent) {
  const source = nodes.value.find((node) => node.id === id)
  if (!source || source.data.kind === 'GROUP') return
  const width = styleNumber(source.style, 'width', 320)
  const height = styleNumber(source.style, 'height', 240)
  const position = createMenuScreenPosition(event.clientX + 12, event.clientY - 12)
  canvasContextMenu.value = null
  presetMenuOpen.value = false
  nodeCreateMenu.value = {
    x: position.x,
    y: position.y,
    flowX: source.position.x + width + 96,
    flowY: source.position.y + height / 2,
    sourceId: id,
  }
}

async function loadAgentHistory() {
  agentHistoryLoading.value = true
  try {
    const tasks = await api<CanvasAgentHistoryItem[]>('/agent-tasks')
    const titlePrefix = `画布 Agent · ${title.value}`
    agentHistory.value = tasks.filter((task) => task.title === titlePrefix).slice(0, 12)
  } catch {
    agentHistory.value = []
  } finally { agentHistoryLoading.value = false }
}

function agentTaskStatus(status: string) {
  return agentTaskLabel(status, status)
}

function openAgentPlan() {
  if (!agentGoal.value.trim() || !agentAvailable.value) return
  selectedAgentTaskId.value = ''
  if (!agentModel.value) agentModel.value = agentModels.value.find((item) => item.isDefault)?.key || agentModels.value[0]?.key || ''
  agentOpen.value = true
}

function openAgentHistoryTask(item: CanvasAgentHistoryItem) {
  agentGoal.value = item.goal
  selectedAgentTaskId.value = item.id
  agentOpen.value = true
}

function startCanvasSidebarResize(event: MouseEvent) {
  event.preventDefault()
  const move = (current: MouseEvent) => {
    const nextWidth = Math.max(340, Math.min(560, window.innerWidth - current.clientX))
    canvasSidebarWidth.value = nextWidth
  }
  const stop = () => {
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    window.removeEventListener('mousemove', move)
    window.removeEventListener('mouseup', stop)
  }
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
  window.addEventListener('mousemove', move)
  window.addEventListener('mouseup', stop, { once: true })
}

function addAgentStarter(action: 'image' | 'plan' | 'group' | 'layout') {
  const goals: Record<typeof action, string> = {
    image: '围绕当前画布创建一组图片生成方向，并连接必要的提示词节点。',
    plan: '分析当前画布，撰写一份可执行的创作计划，并把计划整理成文本节点。',
    group: '分析当前画布的内容关系，为相关节点建立合理的分组并整理布局。',
    layout: '检查当前画布的节点和连接，给出并执行更清晰的布局方案。',
  }
  agentGoal.value = goals[action]
  if (agentAvailable.value) openAgentPlan()
}

function openCanvasContextMenu(event: MouseEvent) {
  event.preventDefault()
  nodeCreateMenu.value = null
  presetMenuOpen.value = false
  const point = screenToFlowCoordinate({ x: event.clientX, y: event.clientY })
  const position = contextMenuScreenPosition(event.clientX, event.clientY)
  canvasContextMenu.value = { x: position.x, y: position.y, flowX: point.x, flowY: point.y }
}

function openNodeContextMenu(id: string, event: MouseEvent) {
  nodeCreateMenu.value = null
  presetMenuOpen.value = false
  const point = screenToFlowCoordinate({ x: event.clientX, y: event.clientY })
  const position = contextMenuScreenPosition(event.clientX, event.clientY)
  canvasContextMenu.value = { x: position.x, y: position.y, flowX: point.x, flowY: point.y, nodeId: id }
}

function contextMenuScreenPosition(x: number, y: number) {
  return { x: Math.max(12, Math.min(x, window.innerWidth - 196)), y: Math.max(62, Math.min(y, window.innerHeight - 238)) }
}

function branchMediaNode(id: string) {
  const source = nodes.value.find((node) => node.id === id)
  if (!source || !isMediaNode(source)) return
  checkpoint()
  const kind = source.data.kind
  const width = kind === 'VIDEO' ? 360 : 320
  const derivedId = createClientId()
  nodes.value.forEach((node) => { node.selected = false })
  nodes.value.push({
    id: derivedId,
    type: 'canvas',
    position: { x: source.position.x + width + 88, y: source.position.y },
    data: { kind, title: `${source.data.title} · 派生`, content: '', prompt: `基于“${source.data.title}”继续创作`, generationKind: kind === 'VIDEO' ? 'VIDEO' : 'IMAGE', model: defaultModel(kind === 'VIDEO' ? 'VIDEO' : 'IMAGE'), status: 'IDLE' },
    style: { width: `${width}px`, height: '240px' },
    selected: true,
  })
  edges.value.push({ id: createClientId(), source: source.id, target: derivedId, type: 'smoothstep', markerEnd: MarkerType.ArrowClosed, label: '派生' })
}

function deriveNode(sourceId: string, targetKind: CanvasGenerationKind) {
  const source = nodes.value.find((node) => node.id === sourceId)
  if (!source || source.data.kind === 'GROUP') return
  if (isMediaNode(source) && source.data.kind === targetKind) { branchMediaNode(sourceId); return }

  checkpoint()
  const width = targetKind === 'VIDEO' ? 360 : 320
  const height = targetKind === 'VIDEO' ? 240 : 320
  const sourceText = source.data.kind === 'TEXT' ? source.data.content.trim() : source.data.prompt?.trim() || `基于“${source.data.title}”继续创作`
  const id = createClientId()
  nodes.value.forEach((node) => { node.selected = false })
  nodes.value.push({
    id,
    type: 'canvas',
    position: { x: source.position.x + styleNumber(source.style, 'width', 320) + 88, y: source.position.y },
    data: {
      kind: targetKind,
      title: targetKind === 'VIDEO' ? '视频创作' : '图片创作',
      content: '',
      prompt: sourceText,
      generationKind: targetKind,
      model: defaultModel(targetKind),
      status: 'IDLE',
    },
    style: { width: `${width}px`, height: `${height}px` },
    selected: true,
  })
  edges.value.push({ id: createClientId(), source: source.id, target: id, type: 'smoothstep', markerEnd: MarkerType.ArrowClosed, label: targetKind === 'VIDEO' ? '生成视频' : '生成图片' })
  nodeConfigOpen.value = true
  workspacePanel.value = 'properties'
  if (sourceText) void nextTick(() => { void generateNode(id) })
}

function zoomCanvas(delta: number) {
  const zoom = Math.min(4, Math.max(0.05, viewport.value.zoom + delta))
  const next = { ...viewport.value, zoom }
  viewport.value = next
  void setViewport(next)
}

function setZoomFromControl(event: Event) {
  const zoom = Math.min(4, Math.max(0.05, Number((event.target as HTMLInputElement).value) / 100))
  const next = { ...viewport.value, zoom }
  viewport.value = next
  void setViewport(next)
}

function duplicateSelected() {
  if (!selectionCount.value) return
  copySelected()
  pasteNodes()
}

function nudgeSelected(event: KeyboardEvent) {
  const selected = nodes.value.filter((node) => node.selected)
  if (!selected.length) return
  event.preventDefault()
  if (!event.repeat) checkpoint()
  const step = event.shiftKey ? 12 : 1
  const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0
  const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0
  selected.forEach((node) => { node.position = { x: node.position.x + dx, y: node.position.y + dy } })
}

function alignSelected(mode: 'left' | 'hcenter' | 'right' | 'top' | 'vmiddle' | 'bottom') {
  const selected = nodes.value.filter((node) => node.selected)
  if (selected.length < 2) return
  checkpoint()
  const boxes = selected.map((node) => ({ node, width: styleNumber(node.style, 'width', 280), height: styleNumber(node.style, 'height', 220) }))
  const minX = Math.min(...boxes.map((box) => box.node.position.x))
  const maxX = Math.max(...boxes.map((box) => box.node.position.x + box.width))
  const minY = Math.min(...boxes.map((box) => box.node.position.y))
  const maxY = Math.max(...boxes.map((box) => box.node.position.y + box.height))
  for (const box of boxes) {
    const next = { ...box.node.position }
    if (mode === 'left') next.x = minX
    else if (mode === 'hcenter') next.x = (minX + maxX) / 2 - box.width / 2
    else if (mode === 'right') next.x = maxX - box.width
    else if (mode === 'top') next.y = minY
    else if (mode === 'vmiddle') next.y = (minY + maxY) / 2 - box.height / 2
    else next.y = maxY - box.height
    box.node.position = next
  }
}

async function focusSelected() {
  const ids = nodes.value.filter((node) => node.selected).map((node) => node.id)
  if (!ids.length) return
  await fitView({ nodes: ids, padding: 0.24, maxZoom: 1.2, duration: 260 })
}

function arrangeSelected(direction: 'horizontal' | 'vertical') {
  const selected = nodes.value.filter((node) => node.selected)
  if (selected.length < 2) return
  checkpoint()
  const ordered = [...selected].sort((a, b) => direction === 'horizontal' ? a.position.x - b.position.x : a.position.y - b.position.y)
  const startX = Math.min(...ordered.map((node) => node.position.x))
  const startY = Math.min(...ordered.map((node) => node.position.y))
  let cursor = direction === 'horizontal' ? startX : startY
  for (const node of ordered) {
    node.position = direction === 'horizontal' ? { x: cursor, y: startY } : { x: startX, y: cursor }
    cursor += styleNumber(node.style, direction === 'horizontal' ? 'width' : 'height', direction === 'horizontal' ? 280 : 220) + 32
  }
}

function autoArrangeCanvas() {
  if (!nodes.value.length) return
  checkpoint()
  const columns = Math.max(1, Math.ceil(Math.sqrt(nodes.value.length)))
  const gapX = 48
  const gapY = 42
  const columnWidths = Array.from({ length: columns }, (_, column) => Math.max(...nodes.value.filter((_, index) => index % columns === column).map((node) => styleNumber(node.style, 'width', 280)), 280))
  const rowHeights = Array.from({ length: Math.ceil(nodes.value.length / columns) }, (_, row) => Math.max(...nodes.value.slice(row * columns, (row + 1) * columns).map((node) => styleNumber(node.style, 'height', 220)), 220))
  const xOffsets = columnWidths.map((_, index) => columnWidths.slice(0, index).reduce((sum, width) => sum + width + gapX, 0))
  const yOffsets = rowHeights.map((_, index) => rowHeights.slice(0, index).reduce((sum, height) => sum + height + gapY, 0))
  nodes.value = nodes.value.map((node, index) => ({ ...node, position: { x: xOffsets[index % columns], y: yOffsets[Math.floor(index / columns)] } }))
  scheduleSave()
}

function wrapSelectedInGroup() {
  const selected = nodes.value.filter((node) => node.selected)
  if (selected.length < 2) return
  checkpoint()
  const left = Math.min(...selected.map((node) => node.position.x)) - 32
  const top = Math.min(...selected.map((node) => node.position.y)) - 48
  const right = Math.max(...selected.map((node) => node.position.x + styleNumber(node.style, 'width', 280))) + 32
  const bottom = Math.max(...selected.map((node) => node.position.y + styleNumber(node.style, 'height', 220))) + 32
  nodes.value.forEach((node) => { node.selected = false })
  // Keep the group behind its members so the frame never blocks node editing.
  nodes.value.unshift({ id: createClientId(), type: 'canvas', position: { x: left, y: top }, data: { kind: 'GROUP', title: '节点分组', content: '' }, style: { width: `${Math.max(280, right - left)}px`, height: `${Math.max(220, bottom - top)}px` }, selected: true })
}

function ungroupSelected() {
  const groups = nodes.value.filter((node) => node.selected && node.data.kind === 'GROUP')
  if (!groups.length) return
  checkpoint()
  const groupIds = new Set(groups.map((node) => node.id))
  nodes.value = nodes.value.filter((node) => !groupIds.has(node.id))
  edges.value = edges.value.filter((edge) => !groupIds.has(edge.source) && !groupIds.has(edge.target))
}

function dramaStageCount(stage: CanvasDramaStage) {
  if (stage === 'STORYBOARD') return nodes.value.filter((node) => node.data.dramaRole === 'STORYBOARD').length
  if (stage === 'PRODUCTION') return nodes.value.filter((node) => node.data.dramaRole === 'SHOT_VIDEO').length
  return nodes.value.filter((node) => node.data.dramaStage === stage && node.data.dramaRole !== 'STAGE').length
}

async function focusDramaStage(stage: CanvasDramaStage) {
  activeDramaStage.value = stage
  deselectAll()
  await nextTick()
  const stageNodeIds = nodes.value.filter((node) => node.data.dramaStage === stage && node.data.dramaRole !== 'STAGE').map((node) => node.id)
  if (stageNodeIds.length) await fitView({ nodes: stageNodeIds, padding: 0.12, maxZoom: 1.1, duration: 280 })
}

async function addDramaEpisode() {
  const script = nodes.value.find((node) => node.data.dramaRole === 'SCRIPT')
  if (!script) return
  checkpoint()
  const matches = script.data.content.match(/第\s*[一二三四五六七八九十百零〇0-9]+\s*集/g) || []
  const nextOrder = matches.length + 1
  const prefix = script.data.content.trim() ? `${script.data.content.trimEnd()}\n\n` : ''
  updateNodeData(script.id, { content: `${prefix}第 ${nextOrder} 集\n` })
  nodes.value.forEach((node) => { node.selected = node.id === script.id })
  activeDramaStage.value = 'SCRIPT'
  await nextTick()
  await fitView({ nodes: [script.id], padding: 0.18, maxZoom: 1.05, duration: 240 })
}

async function addDramaShot() {
  const episodeOrder = Math.max(1, ...nodes.value.map((node) => node.data.episodeOrder || 0))
  const shotOrder = Math.max(0, ...nodes.value.filter((node) => node.data.episodeOrder === episodeOrder).map((node) => node.data.shotOrder || 0)) + 1
  checkpoint()
  const ids = appendDramaShot({ episodeTitle: `第 ${episodeOrder} 集`, episodeOrder, shotOrder, content: '' }, dramaShotCount())
  resizeDramaStageGroups(dramaShotCount())
  activeDramaStage.value = 'STORYBOARD'
  await nextTick()
  await fitView({ nodes: ids, padding: 0.16, maxZoom: 0.9, duration: 280 })
}

async function splitDramaIntoShots() {
  const script = nodes.value.find((node) => node.data.dramaRole === 'SCRIPT')
  const drafts = splitShortDramaScript(script?.data.content || '')
  if (!drafts.length) { window.alert('请先在“剧本原文”节点中输入剧本内容。'); return }
  const existing = nodes.value.filter((node) => node.data.shotId)
  if (existing.length && !window.confirm(`将使用剧本重新生成 ${drafts.length} 个镜头节点。现有分镜节点会从画布移除，文件库中的素材仍会保留。`)) return
  checkpoint()
  const existingIds = new Set(existing.map((node) => node.id))
  nodes.value = nodes.value.filter((node) => !existingIds.has(node.id))
  edges.value = edges.value.filter((edge) => !existingIds.has(edge.source) && !existingIds.has(edge.target))
  drafts.forEach((draft, index) => appendDramaShot(draft, index))
  resizeDramaStageGroups(drafts.length)
  activeDramaStage.value = 'STORYBOARD'
  await nextTick()
  await focusDramaStage('STORYBOARD')
}

function appendDramaShot(draft: ShortDramaShotDraft, index: number) {
  const shotId = createClientId()
  const episodeId = `episode-${draft.episodeOrder}`
  const promptId = createClientId()
  const imageId = createClientId()
  const videoId = createClientId()
  const y = 80 + index * 286
  const shared = {
    episodeId,
    episodeOrder: draft.episodeOrder,
    shotId,
    shotOrder: draft.shotOrder,
    duration: 5,
    characterNames: [] as string[],
    sceneName: '',
    cameraMotion: '',
    dialogue: '',
    narration: '',
  }
  const shotTitle = `${draft.episodeTitle} · 镜头 ${draft.shotOrder}`
  nodes.value.push(
    { id: promptId, type: 'canvas', position: { x: 1480, y }, data: { kind: 'TEXT', title: `${shotTitle} 提示`, content: draft.content, dramaRole: 'SHOT_PROMPT', dramaStage: 'STORYBOARD', ...shared }, style: { width: '280px', height: '240px' } },
    { id: imageId, type: 'canvas', position: { x: 1800, y }, data: { kind: 'IMAGE', title: `${shotTitle} 分镜`, content: '', generationKind: 'IMAGE', model: defaultModel('IMAGE'), status: 'IDLE', dramaRole: 'STORYBOARD', dramaStage: 'STORYBOARD', ...shared }, style: { width: '320px', height: '240px' } },
    { id: videoId, type: 'canvas', position: { x: 2320, y }, data: { kind: 'VIDEO', title: `${shotTitle} 成片`, content: '', generationKind: 'VIDEO', model: defaultModel('VIDEO'), generationOptions: { duration: 5 }, status: 'IDLE', dramaRole: 'SHOT_VIDEO', dramaStage: 'PRODUCTION', ...shared }, style: { width: '360px', height: '240px' } },
  )
  edges.value.push(
    { id: createClientId(), source: promptId, target: imageId, type: 'smoothstep', markerEnd: MarkerType.ArrowClosed, label: '生成分镜' },
    { id: createClientId(), source: imageId, target: videoId, type: 'smoothstep', markerEnd: MarkerType.ArrowClosed, label: '生成成片' },
  )
  return [promptId, imageId, videoId]
}

function dramaShotCount() { return new Set(nodes.value.flatMap((node) => node.data.shotId ? [node.data.shotId] : [])).size }

function resizeDramaStageGroups(shotCount: number) {
  const height = Math.max(720, 120 + shotCount * 286)
  nodes.value = nodes.value.map((node) => node.data.dramaRole === 'STAGE' && (node.data.dramaStage === 'STORYBOARD' || node.data.dramaStage === 'PRODUCTION')
    ? { ...node, style: { ...(node.style || {}), height: `${height}px` } }
    : node)
}

async function arrangeDramaPipeline() {
  const shotIds = [...new Set(nodes.value.filter((node) => node.data.shotId).sort((a, b) => (a.data.episodeOrder || 0) - (b.data.episodeOrder || 0) || (a.data.shotOrder || 0) - (b.data.shotOrder || 0)).map((node) => node.data.shotId!))]
  if (!shotIds.length) {
    dramaBatch.value = { active: false, label: '', total: 0, completed: 0, message: '当前还没有可整理的镜头，请先拆分剧本。', error: false }
    return
  }
  checkpoint()
  let y = 80
  let previousEpisode = 0
  for (const shotId of shotIds) {
    const shotNodes = nodes.value.filter((node) => node.data.shotId === shotId)
    const episode = shotNodes[0]?.data.episodeOrder || 1
    if (previousEpisode && episode !== previousEpisode) y += 56
    previousEpisode = episode
    const prompt = shotNodes.find((node) => node.data.dramaRole === 'SHOT_PROMPT')
    const storyboard = shotNodes.find((node) => node.data.dramaRole === 'STORYBOARD')
    const video = shotNodes.find((node) => node.data.dramaRole === 'SHOT_VIDEO')
    if (prompt) prompt.position = { x: 1480, y }
    if (storyboard) storyboard.position = { x: 1800, y }
    if (video) video.position = { x: 2320, y }
    y += 286
  }
  const groupHeight = Math.max(720, y + 40)
  nodes.value.forEach((node) => {
    if (node.data.dramaRole === 'STAGE' && (node.data.dramaStage === 'STORYBOARD' || node.data.dramaStage === 'PRODUCTION')) node.style = { ...(node.style || {}), height: `${groupHeight}px` }
  })
  dramaBatch.value = { active: false, label: '', total: 0, completed: 0, message: `已按 ${shotIds.length} 个镜头恢复提示词、分镜和成片流水线。`, error: false }
  await nextTick()
  await focusDramaStage(activeDramaStage.value === 'SCRIPT' || activeDramaStage.value === 'ASSETS' ? 'STORYBOARD' : activeDramaStage.value)
}

function dramaBatchTargets(stage: 'STORYBOARD' | 'PRODUCTION') {
  const role = stage === 'STORYBOARD' ? 'STORYBOARD' : 'SHOT_VIDEO'
  return nodes.value.filter((node) => {
    if (node.data.dramaRole !== role || !isMediaNode(node) || node.data.assetId || node.data.status === 'QUEUED' || node.data.status === 'RUNNING') return false
    const context = generationContext(node)
    return Boolean(context.prompt.trim() && generationModel(node) && (stage === 'STORYBOARD' || context.referenceAssetIds.length))
  }).sort((a, b) => (a.data.episodeOrder || 0) - (b.data.episodeOrder || 0) || (a.data.shotOrder || 0) - (b.data.shotOrder || 0))
}

async function runDramaBatch(stage: 'STORYBOARD' | 'PRODUCTION') {
  if (dramaBatch.value.active) return
  const targets = dramaBatchTargets(stage)
  if (!targets.length) {
    dramaBatch.value = { active: false, label: '', total: 0, completed: 0, message: stage === 'STORYBOARD' ? '没有可生成的分镜，请先补全镜头提示词和图片模型。' : '没有可生成的成片，请先完成分镜图并配置视频模型。', error: true }
    return
  }
  dramaBatchStopRequested = false
  dramaBatch.value = { active: true, label: stage === 'STORYBOARD' ? '正在批量生成分镜' : '正在批量生成成片', total: targets.length, completed: 0, message: '', error: false }
  for (const node of targets) {
    if (dramaBatchStopRequested) break
    nodes.value.forEach((item) => { item.selected = item.id === node.id })
    await generateNode(node.id)
    dramaBatch.value = { ...dramaBatch.value, completed: dramaBatch.value.completed + 1 }
  }
  const stopped = dramaBatchStopRequested
  const failed = targets.filter((node) => node.data.status === 'FAILED').length
  dramaBatch.value = {
    ...dramaBatch.value,
    active: false,
    message: stopped ? `已停止后续排队，完成 ${dramaBatch.value.completed}/${targets.length} 个任务。` : failed ? `批次执行完成，${failed} 个任务需要检查后重试。` : `批次执行完成，共处理 ${targets.length} 个任务。`,
    error: failed > 0,
  }
  scheduleSave()
}

function stopDramaBatchQueue() { dramaBatchStopRequested = true }

async function focusDramaIssues(kind: 'FAILED' | 'PENDING') {
  const targets = nodes.value.filter((node) => node.data.shotId && isMediaNode(node) && (kind === 'FAILED' ? node.data.status === 'FAILED' : !node.data.assetId && node.data.status !== 'QUEUED' && node.data.status !== 'RUNNING'))
  if (!targets.length) {
    dramaBatch.value = { ...dramaBatch.value, message: kind === 'FAILED' ? '当前没有失败镜头。' : '当前没有待生产镜头。', error: false }
    return
  }
  const ids = new Set(targets.map((node) => node.id))
  nodes.value.forEach((node) => { node.selected = ids.has(node.id) })
  await nextTick()
  await fitView({ nodes: [...ids], padding: 0.18, maxZoom: 0.9, duration: 280 })
}

async function applyAgentOperations(operations: CanvasAgentOperation[]) {
  if (!operations.length) return
  checkpoint()
  agentOpen.value = false
  const aliases = new Map<string, string>()
  const generationTargets: string[] = []
  const origin = screenToFlowCoordinate({ x: window.innerWidth / 2, y: window.innerHeight / 2 })
  const resolveId = (value?: string) => value ? aliases.get(value) || value : ''

  for (const [index, operation] of operations.slice(0, 20).entries()) {
    if (operation.type === 'add_text' || operation.type === 'add_image' || operation.type === 'add_video') {
      if (nodes.value.length >= 500) break
      const nodeKind: CanvasNodeKind = operation.type === 'add_text' ? 'TEXT' : operation.type === 'add_image' ? 'IMAGE' : 'VIDEO'
      const generationKind: CanvasGenerationKind = nodeKind === 'VIDEO' ? 'VIDEO' : 'IMAGE'
      const id = createClientId()
      const width = nodeKind === 'TEXT' ? 300 : nodeKind === 'IMAGE' ? 320 : 360
      const height = nodeKind === 'TEXT' ? 220 : 240
      const position = {
        x: operation.x ?? origin.x + (index % 3) * 350 - width / 2,
        y: operation.y ?? origin.y + Math.floor(index / 3) * 280 - height / 2,
      }
      nodes.value.push({
        id,
        type: 'canvas',
        position,
        data: {
          kind: nodeKind,
          title: operation.title || nodeKindLabel(nodeKind),
          content: operation.content || '',
          prompt: operation.prompt || '',
          ...(nodeKind === 'IMAGE' || nodeKind === 'VIDEO' ? { generationKind, model: defaultModel(generationKind), status: 'IDLE' as const } : {}),
        },
        style: { width: `${width}px`, height: `${height}px` },
      })
      if (operation.tempId) aliases.set(operation.tempId, id)
      continue
    }

    const nodeId = resolveId(operation.nodeId)
    if (operation.type === 'update_node') {
      const node = nodes.value.find((item) => item.id === nodeId)
      if (!node) continue
      updateNodeData(node.id, {
        ...(operation.title ? { title: operation.title } : {}),
        ...(operation.content !== undefined && node.data.kind === 'TEXT' ? { content: operation.content } : {}),
        ...(operation.prompt !== undefined && isGenerationNode(node) ? { prompt: operation.prompt } : {}),
      })
    } else if (operation.type === 'connect_nodes') {
      const source = resolveId(operation.source)
      const target = resolveId(operation.target)
      if (!source || !target || source === target || !nodes.value.some((node) => node.id === source) || !nodes.value.some((node) => node.id === target) || edges.value.some((edge) => edge.source === source && edge.target === target)) continue
      edges.value.push({ id: createClientId(), source, target, type: 'smoothstep', markerEnd: MarkerType.ArrowClosed })
    } else if (operation.type === 'move_node') {
      nodes.value = nodes.value.map((node) => node.id === nodeId ? { ...node, position: { x: operation.x ?? node.position.x, y: operation.y ?? node.position.y } } : node)
    } else if (operation.type === 'delete_node') {
      if (!nodes.value.some((node) => node.id === nodeId)) continue
      nodes.value = nodes.value.filter((node) => node.id !== nodeId)
      edges.value = edges.value.filter((edge) => edge.source !== nodeId && edge.target !== nodeId)
    } else if (operation.type === 'run_generation') {
      if (isMediaNode(nodes.value.find((node) => node.id === nodeId))) generationTargets.push(nodeId)
    }
  }

  await nextTick()
  if (nodes.value.length) await fitView({ padding: 0.14, maxZoom: 1, duration: 280 })
  if (generationTargets.length) void runAgentGenerations(generationTargets)
}

async function runAgentGenerations(ids: string[]) {
  for (const id of [...new Set(ids)]) await generateNode(id)
}

function connectNodes(connection: Connection) {
  if (!connection.source || !connection.target || connection.source === connection.target) return
  if (edges.value.some((edge) => edge.source === connection.source && edge.target === connection.target)) return
  checkpoint()
  edges.value.push({ id: createClientId(), source: connection.source, target: connection.target, type: 'smoothstep', markerEnd: MarkerType.ArrowClosed })
}

function updateViewport(next: ViewportTransform) {
  viewport.value = { ...next }
  if (!hydrated.value) return
  dirty.value = true
  saveState.value = 'dirty'
  scheduleSave()
}

function updateNodeData(id: string, patch: Partial<CanvasNodeData>) {
  nodes.value = nodes.value.map((node) => node.id === id ? { ...node, data: { ...node.data, ...patch } } : node)
  if (hydrated.value && !applyingHistory.value) {
    dirty.value = true
    saveState.value = 'dirty'
    scheduleSave()
  }
}

function resizeNode(id: string, size: { width: number; height: number }) {
  nodes.value = nodes.value.map((node) => node.id === id ? { ...node, style: { ...(typeof node.style === 'object' && !Array.isArray(node.style) ? node.style : {}), width: `${size.width}px`, height: `${size.height}px` } } : node)
}

function openMediaPicker(id: string) {
  const node = nodes.value.find((item) => item.id === id)
  if (!isMediaNode(node)) return
  nodes.value.forEach((item) => { item.selected = item.id === id })
  mediaPickerNodeId.value = id
}

function useMediaAsset(asset: CanvasMediaAsset) {
  const node = nodes.value.find((item) => item.id === mediaPickerNodeId.value)
  if (!node || !isMediaNode(node)) return
  checkpoint()
  updateNodeData(node.id, { url: asset.contentUrl, assetId: asset.id, mimeType: asset.mimeType, status: 'SUCCEEDED', error: '', jobId: undefined, maskAssetId: undefined })
  mediaPickerNodeId.value = ''
}

function activeImageTool(node: FlowNode | null | undefined) {
  if (!node?.data.creationToolId) return undefined
  return imageTools.value.find((tool) => tool.id === node.data.creationToolId)
}

function imageToolType(tool: CanvasImageTool): CanvasImageToolType {
  if (tool.options?.toolType) return tool.options.toolType
  const identifier = `${tool.options?.toolKey || ''} ${tool.model || ''} ${tool.title}`.toLowerCase()
  if (identifier.includes('rembg') || identifier.includes('抠图') || identifier.includes('背景')) return 'BACKGROUND_REMOVAL'
  if (identifier.includes('outpaint') || identifier.includes('扩图')) return 'OUTPAINT'
  if (identifier.includes('inpaint') || identifier.includes('擦除') || identifier.includes('重绘')) return 'INPAINT'
  if (identifier.includes('esrgan') || identifier.includes('upscale') || identifier.includes('放大') || identifier.includes('清晰')) return 'UPSCALE'
  return 'CUSTOM'
}

function imageToolTypeLabel(tool: CanvasImageTool) {
  return ({ BACKGROUND_REMOVAL: '智能抠图', INPAINT: '局部编辑', OUTPAINT: '智能扩图', UPSCALE: '清晰放大', CUSTOM: '图片工作流' })[imageToolType(tool)]
}

function imageToolIcon(tool: CanvasImageTool) {
  return ({ BACKGROUND_REMOVAL: Eraser, INPAINT: Brush, OUTPAINT: Expand, UPSCALE: Maximize2, CUSTOM: Blend })[imageToolType(tool)]
}

function selectImageTool(nodeId: string, tool: CanvasImageTool) {
  const node = nodes.value.find((item) => item.id === nodeId)
  if (!node || node.data.kind !== 'IMAGE') return
  checkpoint()
  if (node.data.creationToolId === tool.id) { clearImageTool(nodeId); return }
  const configuredOptions = Object.fromEntries(outpaintFields.flatMap(({ key }) => tool.options?.[key] === undefined ? [] : [[key, Number(tool.options[key])]])) as CanvasImageToolOptions
  updateNodeData(nodeId, {
    creationToolId: tool.id,
    creationToolTitle: tool.title,
    imageToolOptions: configuredOptions,
    model: isDedicatedImageTool(tool) ? tool.model || node.data.model : node.data.model,
    prompt: tool.prompt,
    error: '',
  })
  if (node.data.assetId && tool.options?.inputMode === 'MASK' && !node.data.maskAssetId) openImageEditor(nodeId, 'mask')
}

function clearImageTool(nodeId: string) {
  updateNodeData(nodeId, { creationToolId: undefined, creationToolTitle: undefined, imageToolOptions: undefined, error: '' })
}

function updateImageToolOption(key: keyof CanvasImageToolOptions, event: Event) {
  const node = selectedNode.value
  if (!node || node.data.kind !== 'IMAGE') return
  const value = Math.max(0, Math.min(2048, Number((event.target as HTMLInputElement).value || 0)))
  updateNodeData(node.id, { imageToolOptions: { ...(node.data.imageToolOptions || {}), [key]: value } })
}

function openImageEditor(nodeId: string, mode: 'crop' | 'mask') {
  const node = nodes.value.find((item) => item.id === nodeId)
  if (!node || node.data.kind !== 'IMAGE') return
  if (!node.data.assetId || !node.data.url) { openMediaPicker(nodeId); return }
  imageEditorMode.value = mode
  imageEditorNodeId.value = nodeId
}

function closeImageEditor() { imageEditorNodeId.value = '' }

async function applyImageEdit(payload: { blob: Blob; name: string; purpose: 'library' | 'mask' }) {
  const node = imageEditorNode.value
  if (!node) return
  imageEditorUploading.value = true
  try {
    const asset = await uploadAsset<CanvasMediaAsset>(new File([payload.blob], payload.name, { type: payload.blob.type || 'image/png' }), {
      kind: 'IMAGE',
      purpose: payload.purpose,
      projectId: projectId.value,
    })
    checkpoint()
    if (payload.purpose === 'mask') updateNodeData(node.id, { maskAssetId: asset.id, error: '' })
    else updateNodeData(node.id, { url: asset.contentUrl, assetId: asset.id, mimeType: asset.mimeType, maskAssetId: undefined, status: 'SUCCEEDED', jobId: undefined, error: '' })
    closeImageEditor()
  } catch (reason) {
    updateNodeData(node.id, { error: reason instanceof Error ? reason.message : '图片上传失败' })
  } finally { imageEditorUploading.value = false }
}

function updateGenerationOption(key: keyof CanvasGenerationOptions, event: Event, numeric = false) {
  const node = selectedNode.value
  if (!node) return
  const raw = (event.target as HTMLSelectElement).value
  const value = numeric ? Number(raw) : raw
  updateNodeData(node.id, { generationOptions: { ...generationOptions(node), [key]: value } })
  if (key === 'duration' && node.data.shotId) updateDramaShotData({ duration: Number(value) })
}

function textRewriteReferences(nodeId: string) {
  return upstreamNodes(nodeId).flatMap((item) => {
    if (item.data.kind === 'TEXT' && item.data.content.trim()) return [item.data.content.trim()]
    if (item.data.kind === 'IMAGE' && item.data.url) return [`参考图：${item.data.title || '未命名图片'}`]
    if (item.data.kind === 'VIDEO' && item.data.url) return [`参考视频：${item.data.title || '未命名视频'}`]
    return []
  })
}

async function generateTextNode(id: string) {
  const node = nodes.value.find((item) => item.id === id)
  if (!node || node.data.kind !== 'TEXT') return
  const instruction = (node.data.prompt || '').trim()
  const model = node.data.model || defaultModel('CHAT')
  if (!instruction) { updateNodeData(id, { status: 'FAILED', error: '请输入想生成或改写的文本说明。' }); return }
  if (!model) { updateNodeData(id, { status: 'FAILED', error: '暂无可用对话模型，请先在管理端配置模型与健康渠道。' }); return }

  const plan = canvasTextRewritePlan(node.data.content, instruction, textRewriteReferences(id))
  checkpoint()
  let targetId = id
  if (plan.fillCurrent) {
    updateNodeData(id, { model, prompt: instruction, status: 'QUEUED', error: '', jobId: undefined })
  } else {
    const width = styleNumber(node.style, 'width', 300)
    const height = styleNumber(node.style, 'height', 220)
    targetId = createClientId()
    nodes.value.forEach((item) => { item.selected = false })
    nodes.value.push({
      id: targetId,
      type: 'canvas',
      position: { x: node.position.x + width + 88, y: node.position.y },
      data: { kind: 'TEXT', title: `${node.data.title} · 改写`, content: '', prompt: instruction, model, fontSize: node.data.fontSize, status: 'QUEUED', error: '' },
      style: { width: `${width}px`, height: `${height}px` },
      selected: true,
    })
    edges.value.push({ id: createClientId(), source: id, target: targetId, type: 'smoothstep', markerEnd: MarkerType.ArrowClosed, label: '改写' })
  }

  try {
    const conversation = await api<{ id: string }>('/conversations', {
      method: 'POST',
      body: JSON.stringify({
        model,
        title: `${title.value} · 文本`.slice(0, 42),
        temporary: true,
        projectId: projectId.value || undefined,
      }),
    })
    await api(`/conversations/${conversation.id}/messages`, { method: 'POST', body: JSON.stringify({ content: plan.prompt }) })
    const job = await api<CanvasGenerationJob>('/generations', {
      method: 'POST',
      body: JSON.stringify({
        kind: 'CHAT',
        prompt: plan.prompt,
        model,
        conversationId: conversation.id,
        projectId: projectId.value || undefined,
        options: { responseMode: 'fast' },
        idempotencyKey: `canvas:${String(route.params.id)}:${targetId}:${createClientId()}`,
      }),
    })
    updateNodeData(targetId, { jobId: job.id, status: job.status, creditCost: job.creditCost })
    await monitorGeneration(targetId, job.id)
  } catch (reason) {
    updateNodeData(targetId, { status: 'FAILED', error: reason instanceof Error ? reason.message : '文本生成失败' })
  }
}

function fitNodeToImage(nodeId: string, url: string) {
  const image = new Image()
  image.onload = () => {
    const target = nodes.value.find((node) => node.id === nodeId)
    if (!target || target.data.kind !== 'IMAGE') return
    const width = styleNumber(target.style, 'width', 320)
    const ratio = image.naturalHeight / Math.max(1, image.naturalWidth)
    resizeNode(nodeId, { width, height: Math.max(180, Math.min(560, Math.round(width * ratio))) })
  }
  image.src = url
}

async function generateNode(id: string) {
  const node = nodes.value.find((item) => item.id === id)
  if (!node || node.data.status === 'QUEUED' || node.data.status === 'RUNNING') return
  if (node.data.kind === 'TEXT') {
    await generateTextNode(id)
    return
  }
  if (!isMediaNode(node)) return
  const kind = activeGenerationKind(node)
  const context = generationContext(node)
  const tool = kind === 'IMAGE' ? activeImageTool(node) : undefined
  const prompt = context.prompt.trim() || (tool ? `使用${tool.title}处理当前图片` : '')
  const model = generationModel(node)
  if (!prompt) { updateNodeData(id, { status: 'FAILED', error: '请输入提示词，或连接一个包含内容的文本节点。' }); return }
  if (!model) { updateNodeData(id, { status: 'FAILED', error: `暂无可用${kind === 'IMAGE' ? '图片' : '视频'}模型，请先在管理端配置模型与健康渠道。` }); return }
  if (tool && !node.data.assetId) { updateNodeData(id, { status: 'FAILED', error: '请先为图片节点选择一张需要处理的图片。' }); openMediaPicker(id); return }
  if (tool?.options?.inputMode === 'MASK' && !node.data.maskAssetId) { updateNodeData(id, { status: 'FAILED', error: '当前工具需要先绘制蒙版。' }); openImageEditor(id, 'mask'); return }

  checkpoint()
  updateNodeData(id, { model, prompt: node.data.prompt || '', generationOptions: generationOptions(node), status: 'QUEUED', error: '', jobId: undefined })
  try {
    const options = generationOptions(node)
    const job = await api<CanvasGenerationJob>('/generations', {
      method: 'POST',
      body: JSON.stringify({
        kind,
        prompt,
        model,
        projectId: projectId.value || undefined,
        options: {
          ...options,
          ...(node.data.imageToolOptions || {}),
          referenceAssetIds: [...new Set([...(tool && node.data.assetId ? [node.data.assetId] : []), ...context.referenceAssetIds])].slice(0, 4),
          ...(isDedicatedImageTool(tool) ? { creationToolId: tool!.id } : {}),
          ...(node.data.maskAssetId ? { maskAssetId: node.data.maskAssetId } : {}),
        },
        idempotencyKey: `canvas:${String(route.params.id)}:${id}:${createClientId()}`,
      }),
    })
    updateNodeData(id, { jobId: job.id, status: job.status, creditCost: job.creditCost })
    await monitorGeneration(id, job.id)
  } catch (reason) {
    updateNodeData(id, { status: 'FAILED', error: reason instanceof Error ? reason.message : '生成任务创建失败' })
  }
}

function applyGenerationResult(nodeId: string, job: CanvasGenerationJob) {
  const target = nodes.value.find((node) => node.id === nodeId)
  if (!target) return
  if (job.status !== 'SUCCEEDED') {
    updateNodeData(nodeId, { status: job.status, error: job.errorMessage || (job.status === 'CANCELLED' ? '任务已取消' : '生成任务失败') })
    return
  }
  if (target.data.kind === 'TEXT' || job.kind === 'CHAT') {
    const content = job.stream?.content?.trim() || target.data.content.trim()
    if (!content) { updateNodeData(nodeId, { status: 'FAILED', error: '任务已完成，但没有返回可用文本。' }); return }
    updateNodeData(nodeId, { content, status: 'SUCCEEDED', error: '', jobId: job.id, creditCost: job.creditCost })
    return
  }
  const outputs = job.outputs || []
  if (!outputs.length) { updateNodeData(nodeId, { status: 'FAILED', error: '任务已完成，但没有返回可用媒体文件。' }); return }
  checkpoint()
  const first = outputs[0].asset
  updateNodeData(nodeId, { url: first.contentUrl, assetId: first.id, mimeType: first.mimeType, status: 'SUCCEEDED', error: '', jobId: job.id, creditCost: job.creditCost })
  if (target.data.kind === 'IMAGE' && first.contentUrl) fitNodeToImage(nodeId, first.contentUrl)
  outputs.slice(1).forEach(({ asset }, index) => {
    const width = styleNumber(target.style, 'width', 320)
    const height = styleNumber(target.style, 'height', 240)
    const id = createClientId()
    nodes.value.push({ id, type: 'canvas', position: { x: target.position.x + (index + 1) * (width + 32), y: target.position.y }, data: { ...target.data, title: `${target.data.title} ${index + 2}`, url: asset.contentUrl, assetId: asset.id, mimeType: asset.mimeType, status: 'SUCCEEDED', jobId: job.id, error: '' }, style: { width: `${width}px`, height: `${height}px` } })
    edges.value.push({ id: createClientId(), source: target.id, target: id, type: 'smoothstep', markerEnd: MarkerType.ArrowClosed, label: '生成变体' })
  })
}

function duplicateNode(id: string) {
  const source = nodes.value.find((node) => node.id === id)
  if (!source) return
  checkpoint()
  nodes.value.forEach((node) => { node.selected = false })
  nodes.value.push({ ...clone(source), id: createClientId(), position: { x: source.position.x + 34, y: source.position.y + 34 }, selected: true })
}

function removeNode(id: string) {
  checkpoint()
  nodes.value = nodes.value.filter((node) => node.id !== id)
  edges.value = edges.value.filter((edge) => edge.source !== id && edge.target !== id)
}

function downloadNodeAsset(id: string) {
  const node = nodes.value.find((item) => item.id === id)
  if (!node?.data.url) return
  const link = document.createElement('a')
  link.href = node.data.url
  link.download = safeFilename(node.data.title || nodeKindLabel(node.data.kind))
  link.target = '_blank'
  link.rel = 'noopener'
  link.click()
}

function selectEdge(payload: EdgeMouseEvent) {
  nodes.value.forEach((node) => { node.selected = false })
  edges.value.forEach((edge) => { edge.selected = edge.id === payload.edge.id })
  nodeConfigOpen.value = false
  canvasContextMenu.value = null
  nodeCreateMenu.value = null
}

function openEdgeContextMenu(payload: EdgeMouseEvent) {
  const event = payload.event
  if (!(event instanceof MouseEvent)) return
  event.preventDefault()
  event.stopPropagation()
  selectEdge(payload)
  const point = screenToFlowCoordinate({ x: event.clientX, y: event.clientY })
  const position = contextMenuScreenPosition(event.clientX, event.clientY)
  canvasContextMenu.value = { x: position.x, y: position.y, flowX: point.x, flowY: point.y, edgeId: payload.edge.id }
}

function removeEdge(id: string) {
  if (!edges.value.some((edge) => edge.id === id)) return
  checkpoint()
  edges.value = edges.value.filter((edge) => edge.id !== id)
}

function clearCanvas() {
  if (!nodes.value.length && !edges.value.length) { clearCanvasOpen.value = false; return }
  checkpoint()
  nodes.value = []
  edges.value = []
  closeTransientCanvasUi()
  clearCanvasOpen.value = false
}

function closeTransientCanvasUi() {
  canvasContextMenu.value = null
  canvasMenuOpen.value = false
  nodeCreateMenu.value = null
  presetMenuOpen.value = false
  nodeConfigOpen.value = false
  clearCanvasOpen.value = false
  shortcutHelpOpen.value = false
}
function closeInspector() { closeTransientCanvasUi(); deselectAll() }
function deselectAll() { nodes.value.forEach((node) => { node.selected = false }); edges.value.forEach((edge) => { edge.selected = false }) }
function updateSelectedTitle(event: Event) { if (selectedNode.value) updateNodeData(selectedNode.value.id, { title: (event.target as HTMLInputElement).value }) }
function updateSelectedContent(event: Event) { if (selectedNode.value) updateNodeData(selectedNode.value.id, { content: (event.target as HTMLTextAreaElement).value }) }
function updateSelectedPrompt(event: Event) { if (selectedNode.value) updateNodeData(selectedNode.value.id, { prompt: (event.target as HTMLTextAreaElement).value }) }
function updateSelectedGenerationKind(event: Event) {
  const node = selectedNode.value
  if (!node || node.data.kind !== 'CONFIG') return
  const generationKind = (event.target as HTMLSelectElement).value === 'VIDEO' ? 'VIDEO' : 'IMAGE'
  updateNodeData(node.id, { generationKind, model: defaultModel(generationKind), generationOptions: {} })
}
function updateDramaShotData(patch: Partial<CanvasNodeData>) {
  const shotId = selectedNode.value?.data.shotId
  if (!shotId) return
  nodes.value = nodes.value.map((node) => node.data.shotId === shotId ? {
    ...node,
    data: {
      ...node.data,
      ...patch,
      ...(patch.duration !== undefined && node.data.kind === 'VIDEO' ? { generationOptions: { ...(node.data.generationOptions || {}), duration: patch.duration } } : {}),
    },
  } : node)
  if (hydrated.value && !applyingHistory.value) {
    dirty.value = true
    saveState.value = 'dirty'
    scheduleSave()
  }
}
function setBackground(value: CanvasBackground) { checkpoint(); background.value = value }
function miniMapColor(node: { data?: unknown }) { return ({ TEXT: '#64748b', IMAGE: '#22a06b', VIDEO: '#e07a34', AUDIO: '#a66dd4', GROUP: '#94a3b8', CONFIG: '#4d6bfe' } as Record<string, string>)[(node.data as CanvasNodeData | undefined)?.kind || ''] || '#64748b' }
function nodeKindLabel(kind: CanvasNodeKind) { return ({ TEXT: '文本', IMAGE: '图片', VIDEO: '视频', AUDIO: '音频', GROUP: '分组', CONFIG: '生成设置' })[kind] }
function flowNodeData(id: string) { return nodes.value.find((node) => node.id === id)?.data || { kind: 'TEXT' as const, title: '文本', content: '' } }

function exportCanvas() {
  const blob = new Blob([JSON.stringify(serializeDocument(), null, 2)], { type: 'application/json' })
  const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `${safeFilename(title.value)}.json`; link.click(); URL.revokeObjectURL(link.href)
}

async function replaceFromImport(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  try { checkpoint(); applyDocument(JSON.parse(await file.text()) as CanvasDocumentPayload); dirty.value = true; saveState.value = 'dirty'; scheduleSave() }
  catch { window.alert('无法读取该画布文件') }
  finally { if (importInput.value) importInput.value.value = '' }
}

async function goBack() { if (dirty.value) await saveNow(); await router.push('/canvases') }
function safeFilename(value: string) { return value.trim().replace(/[\\/:*?"<>|]+/g, '-').slice(0, 80) || 'canvas' }
</script>
