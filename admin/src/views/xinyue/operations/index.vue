<template>
  <div class="art-full-height operation-page">
    <ArtSearchBar
      v-model="filters"
      :items="searchItems"
      :show-expand="false"
      @search="applySearch"
      @reset="resetSearch"
    />

    <ElCard class="art-table-card" shadow="never">
      <ArtTableHeader :loading="loading" @refresh="load">
        <template #left>
          <div class="resource-heading">
            <span class="resource-icon"><ArtSvgIcon :icon="config.icon" /></span>
            <div>
              <strong>{{ xt(config.title) }}</strong>
              <p>{{ xt(config.description) }}</p>
            </div>
          </div>
        </template>
        <template #right>
          <div class="resource-actions">
            <ElTag effect="plain">{{ filteredRows.length }}{{ xt('条记录') }}</ElTag>
            <ElButton v-if="resourceKey === 'promptTemplates'" @click="restorePromptTemplates">{{
              xt('恢复默认模板')
            }}</ElButton>
            <ElButton v-if="resourceKey === 'promptLibrary'" @click="openPromptSources">{{
              xt('来源配置')
            }}</ElButton>
            <ElButton v-if="resourceKey === 'promptLibrary'" @click="refreshPromptLibrary">{{
              xt('刷新提示词源')
            }}</ElButton>
            <ElButton v-if="resourceKey === 'moderationRules'" @click="openModerationPolicy">{{
              xt('审核策略')
            }}</ElButton>
            <ElButton v-if="resourceKey === 'alerts'" @click="evaluateAlerts">{{
              xt('立即检测')
            }}</ElButton>
            <ElButton v-if="editorConfig?.canCreate" type="primary" @click="openEditor()">
              <ArtSvgIcon icon="ri:add-line" />
              {{ xt(editorConfig.createLabel || '新增') }}
            </ElButton>
          </div>
        </template>
      </ArtTableHeader>

      <ElTable
        v-loading="loading"
        :data="pagedRows"
        height="100%"
        row-key="id"
        :table-layout="isCompact ? 'fixed' : 'auto'"
      >
        <ElTableColumn
          v-for="column in config.columns"
          :key="column.key"
          :label="xt(column.label)"
          :min-width="isCompact ? undefined : column.minWidth"
          :width="isCompact ? undefined : column.width"
          show-overflow-tooltip
        >
          <template #default="{ row }">
            <div v-if="column.type === 'image'" class="table-image-cell">
              <ElImage
                v-if="rowCover(row)"
                :src="rowCover(row)"
                fit="cover"
                class="table-cover"
                :preview-src-list="rowPreviewList(row)"
                :initial-index="0"
                preview-teleported
              />
              <span v-else class="image-placeholder">
                <ArtSvgIcon icon="ri:image-line" />
              </span>
              <small v-if="row.uploadedPreviewImages?.length">
                +{{ row.uploadedPreviewImages.length }} {{ xt('张预览') }}
              </small>
            </div>
            <ElTag
              v-else-if="column.type === 'status'"
              :type="statusType(valueAt(row, column.key))"
              effect="light"
            >
              {{ statusText(valueAt(row, column.key)) }}
            </ElTag>
            <span v-else-if="column.type === 'date'">{{
              formatDate(valueAt(row, column.key))
            }}</span>
            <span v-else-if="column.type === 'bytes'">{{
              formatBytes(Number(valueAt(row, column.key) || 0))
            }}</span>
            <span v-else-if="column.type === 'number'">{{
              formatNumber(Number(valueAt(row, column.key) || 0))
            }}</span>
            <span v-else>{{ displayValue(valueAt(row, column.key)) }}</span>
          </template>
        </ElTableColumn>
        <ElTableColumn
          :label="xt('操作')"
          :width="isCompact ? 150 : 230"
          fixed="right"
          align="right"
        >
          <template #default="{ row }">
            <ElButton link type="primary" @click="showDetail(row)">{{ xt('查看') }}</ElButton>
            <ElButton v-if="editorConfig?.canEdit" link type="primary" @click="openEditor(row)">{{
              xt('编辑')
            }}</ElButton>
            <ElButton
              v-if="resourceKey === 'projects'"
              link
              type="primary"
              @click="openProject(row)"
              >{{ xt('工作流') }}</ElButton
            >
            <ElButton
              v-if="resourceKey === 'toolApprovals' && row.status === 'PENDING'"
              link
              type="success"
              @click="reviewToolApproval(row, 'APPROVED')"
              >{{ xt('批准') }}</ElButton
            >
            <ElButton
              v-if="resourceKey === 'toolApprovals' && row.status === 'PENDING'"
              link
              type="danger"
              @click="reviewToolApproval(row, 'REJECTED')"
              >{{ xt('拒绝') }}</ElButton
            >
            <ElButton
              v-if="resourceKey === 'support'"
              link
              type="primary"
              @click="openTicket(row)"
              >{{ xt('处理') }}</ElButton
            >
            <ElButton v-if="canCancel(row)" link type="warning" @click="cancelJob(row)">{{
              xt('取消')
            }}</ElButton>
            <ElButton v-if="canRetry(row)" link type="primary" @click="retryJob(row)">{{
              xt('重试')
            }}</ElButton>
            <ElButton
              v-if="resourceKey === 'assets'"
              link
              type="danger"
              @click="removeAsset(row)"
              >{{ xt('删除') }}</ElButton
            >
            <ElButton
              v-if="canAcknowledge(row)"
              link
              type="warning"
              @click="updateAlert(row, 'acknowledge')"
              >{{ xt('确认') }}</ElButton
            >
            <ElButton
              v-if="canResolve(row)"
              link
              type="success"
              @click="updateAlert(row, 'resolve')"
              >{{ xt('解决') }}</ElButton
            >
            <ElButton
              v-if="resourceKey === 'alertRules'"
              link
              type="warning"
              @click="muteAlertRule(row)"
              >{{ xt('静默') }}</ElButton
            >
            <ElDropdown
              v-if="resourceKey === 'moderation' && row.status === 'OPEN'"
              @command="(command: string) => resolveModeration(row, command)"
            >
              <ElButton link type="warning"
                >{{ xt('处置') }}<ArtSvgIcon icon="ri:arrow-down-s-line"
              /></ElButton>
              <template #dropdown
                ><ElDropdownMenu
                  ><ElDropdownItem command="APPROVED">{{ xt('批准') }}</ElDropdownItem
                  ><ElDropdownItem command="DISMISSED">{{
                    xt('驳回')
                  }}</ElDropdownItem></ElDropdownMenu
                ></template
              >
            </ElDropdown>
            <ElButton
              v-if="editorConfig?.canDelete"
              link
              type="danger"
              @click="removeResource(row)"
              >{{ xt(resourceKey === 'promptLibrary' ? '重置' : '删除') }}</ElButton
            >
          </template>
        </ElTableColumn>
      </ElTable>

      <div class="table-footer">
        <ElPagination
          v-model:current-page="page"
          v-model:page-size="pageSize"
          :page-sizes="[20, 50, 100]"
          :total="filteredRows.length"
          layout="total, sizes, prev, pager, next, jumper"
        />
      </div>
    </ElCard>

    <ElDrawer v-model="detailVisible" :title="`${xt(config.title)}${xt('详情')}`" size="520px">
      <ElDescriptions v-if="detailRow" :column="1" border>
        <ElDescriptionsItem v-for="item in detailItems" :key="item.key" :label="item.label">
          <pre v-if="item.complex">{{ item.value }}</pre>
          <span v-else>{{ item.value }}</span>
        </ElDescriptionsItem>
      </ElDescriptions>
      <template v-if="resourceKey === 'knowledgeBases' && detailRow">
        <ElDivider content-position="left">{{ xt('绑定文档') }}</ElDivider>
        <ElTable
          v-if="detailRow.assets?.length"
          :data="detailRow.assets"
          size="small"
          row-key="assetId"
        >
          <ElTableColumn :label="xt('文件名')" min-width="190"
            ><template #default="{ row }">{{
              row.asset?.name || row.assetId
            }}</template></ElTableColumn
          >
          <ElTableColumn :label="xt('类型')" min-width="130"
            ><template #default="{ row }">{{ row.asset?.mimeType || '-' }}</template></ElTableColumn
          >
          <ElTableColumn :label="xt('分块')" width="80" prop="chunkCount" />
          <ElTableColumn :label="xt('状态')" width="90"
            ><template #default="{ row }"
              ><ElTag :type="statusType(row.status)">{{ statusText(row.status) }}</ElTag></template
            ></ElTableColumn
          >
        </ElTable>
        <ElEmpty v-else :description="xt('尚未绑定文档')" :image-size="64" />
        <ElDivider content-position="left">{{ xt('关联助手') }}</ElDivider>
        <div v-if="detailRow.assistants?.length" class="knowledge-assistant-list">
          <ElTag v-for="item in detailRow.assistants" :key="item.assistantId" effect="plain">{{
            item.assistant?.name || item.assistantId
          }}</ElTag>
        </div>
        <ElEmpty v-else :description="xt('尚未关联助手')" :image-size="64" />
      </template>
    </ElDrawer>

    <ElDrawer
      v-model="editorVisible"
      :title="
        editingRow
          ? `${xt('编辑')}${xt(config.title)}`
          : xt(editorConfig?.createLabel || `新增${config.title}`)
      "
      size="620px"
      destroy-on-close
    >
      <ElForm
        v-if="editorConfig"
        ref="editorFormRef"
        :model="editorForm"
        label-position="top"
        @submit.prevent
      >
        <ElRow :gutter="16">
          <ElCol
            v-for="field in visibleEditorFields"
            :key="field.key"
            :xs="24"
            :sm="field.span || 24"
          >
            <ElFormItem
              :label="xt(field.label)"
              :prop="field.key"
              :rules="
                field.required
                  ? [
                      {
                        required: true,
                        message: `${xt('请填写')}${xt(field.label)}`,
                        trigger: field.type === 'select' ? 'change' : 'blur'
                      }
                    ]
                  : undefined
              "
            >
              <ElInput
                v-if="!field.type || field.type === 'input'"
                v-model="editorForm[field.key]"
                :placeholder="field.placeholder ? xt(field.placeholder) : undefined"
                :maxlength="field.maxlength"
                show-word-limit
              />
              <ElInput
                v-else-if="field.type === 'textarea'"
                v-model="editorForm[field.key]"
                type="textarea"
                :rows="field.rows || 4"
                :placeholder="field.placeholder ? xt(field.placeholder) : undefined"
                :maxlength="field.maxlength"
                show-word-limit
              />
              <ElInputNumber
                v-else-if="field.type === 'number'"
                v-model="editorForm[field.key]"
                :min="field.min ?? 0"
                :max="field.max ?? 100000"
                controls-position="right"
                class="wide"
              />
              <ElSwitch v-else-if="field.type === 'switch'" v-model="editorForm[field.key]" />
              <ElSelect
                v-else-if="field.type === 'select'"
                v-model="editorForm[field.key]"
                :multiple="field.multiple"
                :filterable="field.filterable"
                :allow-create="field.allowCreate"
                clearable
                class="wide"
              >
                <ElOption
                  v-for="option in fieldOptions(field)"
                  :key="String(option.value)"
                  :label="xt(option.label)"
                  :value="option.value"
                />
              </ElSelect>
            </ElFormItem>
          </ElCol>
        </ElRow>

        <template v-if="resourceKey === 'tools'">
          <ElDivider content-position="left">{{ xt('品牌图标') }}</ElDivider>
          <div class="tool-icon-editor">
            <div class="tool-icon-preview">
              <img
                v-if="
                  toolIconPreviewUrl ||
                  editingRow?.iconAssetId ||
                  /^https?:\/\//.test(editingRow?.icon || '')
                "
                :src="toolIconPreviewUrl || adminMediaUrl(editingRow?.icon)"
                alt=""
              />
              <ArtSvgIcon v-else icon="ri:tools-line" />
            </div>
            <div class="tool-icon-controls">
              <div class="media-row">
                <ElUpload
                  :auto-upload="false"
                  :show-file-list="false"
                  accept="image/jpeg,image/png,image/webp,image/gif,image/avif,.jpg,.jpeg,.png,.webp,.gif,.avif"
                  :on-change="selectToolIcon"
                >
                  <ElButton><ArtSvgIcon icon="ri:upload-2-line" />{{ xt('上传图标') }}</ElButton>
                </ElUpload>
                <ElButton
                  v-if="editingRow?.iconAssetId"
                  type="danger"
                  plain
                  @click="removeToolIcon"
                  >{{ xt('移除上传图标') }}</ElButton
                >
                <ElTag v-if="toolIconFile" type="success"
                  >{{ xt('已选择') }} {{ toolIconFile.name }}</ElTag
                >
              </div>
              <p class="media-help">{{
                xt('建议使用正方形 PNG 或 WebP；保存后会自动替换上方图标地址。')
              }}</p>
            </div>
          </div>
        </template>

        <template v-if="resourceKey === 'inspirations' || resourceKey === 'imageTools'">
          <ElDivider content-position="left">{{ xt('演示素材') }}</ElDivider>
          <div class="media-editor">
            <div>
              <span class="field-label">{{ xt('封面图片') }}</span>
              <div class="media-row">
                <ElImage
                  v-if="editingRow?.imageUrl"
                  :src="adminMediaUrl(editingRow.imageUrl)"
                  fit="cover"
                  class="cover-preview"
                  :preview-src-list="[adminMediaUrl(editingRow.imageUrl)]"
                />
                <ElUpload
                  :auto-upload="false"
                  :show-file-list="false"
                  accept="image/*"
                  :on-change="selectCover"
                  ><ElButton>{{ xt('选择新封面') }}</ElButton></ElUpload
                >
                <ElButton
                  v-if="editingRow?.coverAssetId"
                  type="danger"
                  plain
                  @click="removeInspirationCover"
                  >{{ xt('移除封面') }}</ElButton
                >
                <ElTag v-if="coverFile" type="success"
                  >{{ xt('已选择') }} {{ coverFile.name }}</ElTag
                >
              </div>
            </div>
            <div v-if="editorForm.mode === 'VIDEO'">
              <span class="field-label">{{ xt('演示视频') }}</span>
              <video
                v-if="editingRow?.videoUrl"
                class="video-preview"
                :src="adminMediaUrl(editingRow.videoUrl)"
                :poster="editingRow.imageUrl ? adminMediaUrl(editingRow.imageUrl) : undefined"
                controls
                playsinline
                preload="metadata"
              />
              <div class="media-row">
                <ElUpload
                  :auto-upload="false"
                  :show-file-list="false"
                  accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov"
                  :on-change="selectPreviewVideo"
                  ><ElButton>{{ xt('选择演示视频') }}</ElButton></ElUpload
                >
                <ElButton
                  v-if="editingRow?.uploadedPreviewVideo?.assetId"
                  type="danger"
                  plain
                  @click="removeInspirationVideo"
                  >{{ xt('移除演示视频') }}</ElButton
                >
                <ElTag v-if="previewVideoFile" type="success">
                  {{ xt('已选择') }} {{ previewVideoFile.name }}
                </ElTag>
              </div>
              <p class="media-help">{{
                xt('支持 MP4、WebM 或 MOV，文件最大 50 MB；上传文件优先于外部视频地址。')
              }}</p>
            </div>
            <div v-else-if="resourceKey === 'inspirations'">
              <span class="field-label">{{ xt('成组预览图片（最多 30 张）') }}</span>
              <div class="preview-grid">
                <div
                  v-for="image in editingRow?.uploadedPreviewImages || []"
                  :key="image.assetId"
                  class="preview-item"
                >
                  <ElImage
                    :src="adminMediaUrl(image.url)"
                    fit="cover"
                    :preview-src-list="
                      (editingRow?.uploadedPreviewImages || []).map((item: Row) =>
                        adminMediaUrl(item.url)
                      )
                    "
                  />
                  <ElButton
                    circle
                    type="danger"
                    size="small"
                    @click="removeInspirationPreview(image.assetId)"
                    ><ArtSvgIcon icon="ri:delete-bin-line"
                  /></ElButton>
                </div>
              </div>
              <ElUpload
                multiple
                :auto-upload="false"
                :show-file-list="true"
                accept="image/*"
                :on-change="selectPreviewFiles"
                :on-remove="removeSelectedPreview"
                ><ElButton>{{ xt('选择预览图片') }}</ElButton></ElUpload
              >
            </div>
          </div>
        </template>
      </ElForm>
      <template #footer
        ><ElButton @click="editorVisible = false">{{ xt('取消') }}</ElButton
        ><ElButton type="primary" :loading="saving" @click="saveResource">{{
          xt('保存')
        }}</ElButton></template
      >
    </ElDrawer>

    <ElDrawer v-model="ticketVisible" :title="xt('处理客服工单')" size="680px" destroy-on-close>
      <template v-if="ticketDetail">
        <div class="ticket-header"
          ><div
            ><strong>{{ ticketDetail.subject }}</strong
            ><p>{{ ticketDetail.user?.displayName }} · {{ ticketDetail.user?.email }}</p></div
          ><ElTag :type="statusType(ticketDetail.status)">{{
            statusText(ticketDetail.status)
          }}</ElTag></div
        >
        <ElForm label-position="top" class="ticket-settings"
          ><ElRow :gutter="14"
            ><ElCol :span="8"
              ><ElFormItem :label="xt('状态')"
                ><ElSelect v-model="ticketForm.status" class="wide"
                  ><ElOption
                    v-for="option in ticketStatusOptions"
                    :key="String(option.value)"
                    :label="xt(option.label)"
                    :value="option.value" /></ElSelect></ElFormItem></ElCol
            ><ElCol :span="8"
              ><ElFormItem :label="xt('优先级')"
                ><ElSelect v-model="ticketForm.priority" class="wide"
                  ><ElOption
                    v-for="option in ticketPriorityOptions"
                    :key="String(option.value)"
                    :label="xt(option.label)"
                    :value="option.value" /></ElSelect></ElFormItem></ElCol
            ><ElCol :span="8"
              ><ElFormItem :label="xt('负责人')"
                ><ElSelect v-model="ticketForm.assignedToId" clearable class="wide"
                  ><ElOption
                    v-for="agent in supportAgents"
                    :key="agent.id"
                    :label="agent.displayName || agent.email"
                    :value="agent.id" /></ElSelect></ElFormItem></ElCol></ElRow
          ><ElButton type="primary" plain :loading="saving" @click="updateTicket">{{
            xt('更新工单')
          }}</ElButton></ElForm
        >
        <ElDivider content-position="left">{{ xt('沟通记录') }}</ElDivider>
        <div class="ticket-messages"
          ><div
            v-for="message in ticketDetail.messages"
            :key="message.id"
            class="ticket-message"
            :class="{ admin: message.authorType === 'ADMIN' }"
            ><div
              ><strong>{{
                message.author?.displayName ||
                (message.authorType === 'ADMIN' ? xt('管理员') : xt('用户'))
              }}</strong
              ><time>{{ formatDate(message.createdAt) }}</time></div
            ><p>{{ message.body }}</p></div
          ></div
        >
        <ElForm label-position="top" class="ticket-reply"
          ><ElFormItem :label="xt('回复用户')"
            ><ElInput
              v-model.trim="ticketForm.reply"
              type="textarea"
              :rows="4"
              maxlength="10000"
              show-word-limit /></ElFormItem
          ><ElButton type="primary" :loading="saving" @click="replyTicket">{{
            xt('发送回复')
          }}</ElButton></ElForm
        >
      </template>
    </ElDrawer>

    <ElDrawer v-model="policyVisible" :title="xt('内容审核策略')" size="560px" destroy-on-close>
      <ElForm v-if="moderationPolicy" label-position="top">
        <div class="switch-grid">
          <label
            ><span
              ><strong>{{ xt('启用内容审核') }}</strong
              ><small>{{ xt('统一控制全部内容入口') }}</small></span
            ><ElSwitch v-model="moderationPolicy.enabled"
          /></label>
          <label
            ><span
              ><strong>{{ xt('扫描聊天') }}</strong
              ><small>{{ xt('发送模型前检查消息') }}</small></span
            ><ElSwitch v-model="moderationPolicy.scanChat"
          /></label>
          <label
            ><span
              ><strong>{{ xt('扫描图片提示词') }}</strong
              ><small>{{ xt('创建图片任务前检查') }}</small></span
            ><ElSwitch v-model="moderationPolicy.scanImage"
          /></label>
          <label
            ><span
              ><strong>{{ xt('扫描商品视觉') }}</strong
              ><small>{{ xt('创建商品图任务前检查') }}</small></span
            ><ElSwitch v-model="moderationPolicy.scanCommerce"
          /></label>
          <label
            ><span
              ><strong>{{ xt('审核故障时阻断') }}</strong
              ><small>{{ xt('安全服务异常时拒绝请求') }}</small></span
            ><ElSwitch v-model="moderationPolicy.failClosed"
          /></label>
          <label
            ><span
              ><strong>{{ xt('保留内容摘要') }}</strong
              ><small>{{ xt('审核事件中保存受控摘要') }}</small></span
            ><ElSwitch v-model="moderationPolicy.retainContent"
          /></label>
        </div>
        <ElFormItem :label="xt('用户提示语')"
          ><ElInput
            v-model="moderationPolicy.blockMessage"
            type="textarea"
            :rows="3"
            maxlength="300"
            show-word-limit
        /></ElFormItem>
        <ElFormItem :label="xt('摘要最大长度')"
          ><ElInputNumber
            v-model="moderationPolicy.excerptLength"
            :min="40"
            :max="1000"
            controls-position="right"
        /></ElFormItem>
      </ElForm>
      <template #footer
        ><ElButton @click="policyVisible = false">{{ xt('取消') }}</ElButton
        ><ElButton type="primary" :loading="saving" @click="saveModerationPolicy">{{
          xt('保存策略')
        }}</ElButton></template
      >
    </ElDrawer>

    <ElDrawer
      v-model="sourceVisible"
      :title="xt('提示词库来源')"
      size="min(960px, 96vw)"
      destroy-on-close
    >
      <ElAlert
        class="source-cache-notice"
        type="info"
        :closable="false"
        :title="
          xt('图片与视频提示词均从本地缓存读取，系统每 6 小时自动检查更新，也可单独手动刷新。')
        "
      />
      <ElTable v-loading="sourceLoading" :data="promptSources" row-key="id">
        <ElTableColumn :label="xt('类型')" prop="promptTypeLabel" width="72" />
        <ElTableColumn :label="xt('来源')" min-width="180"
          ><template #default="{ row }"
            ><ElInput v-model.trim="row.displayName" maxlength="100" /><small class="source-meta">{{
              row.upstreamName || row.id
            }}</small></template
          ></ElTableColumn
        >
        <ElTableColumn :label="xt('内容数')" prop="count" width="90" />
        <ElTableColumn :label="xt('排序')" width="120"
          ><template #default="{ row }"
            ><ElInputNumber
              v-model="row.sortOrder"
              :min="0"
              :max="100000"
              controls-position="right" /></template
        ></ElTableColumn>
        <ElTableColumn :label="xt('启用')" width="90"
          ><template #default="{ row }"><ElSwitch v-model="row.enabled" /></template
        ></ElTableColumn>
        <ElTableColumn :label="xt('缓存状态')" min-width="180"
          ><template #default="{ row }"
            ><ElTag :type="row.refreshing ? 'warning' : row.lastError ? 'danger' : 'success'">{{
              row.refreshing ? xt('同步中') : row.lastError ? xt('同步异常') : xt('缓存完整')
            }}</ElTag
            ><small v-if="row.fetchedAt" class="source-meta"
              >{{ xt('更新于') }} {{ formatDate(row.fetchedAt) }}</small
            ><small v-if="row.lastError && !row.refreshing" class="source-error">{{
              row.lastError
            }}</small></template
          ></ElTableColumn
        >
        <ElTableColumn :label="xt('操作')" width="138" align="right"
          ><template #default="{ row }"
            ><ElButton link :loading="row._refreshing" @click="refreshPromptSource(row)">{{
              xt('更新缓存')
            }}</ElButton
            ><ElButton link type="primary" @click="savePromptSource(row)">{{
              xt('保存')
            }}</ElButton></template
          ></ElTableColumn
        >
      </ElTable>
    </ElDrawer>

    <ElDrawer
      v-model="projectVisible"
      :title="xt('项目工作流与版本')"
      size="760px"
      destroy-on-close
    >
      <template v-if="projectDetail">
        <div class="project-audit-head">
          <div
            ><strong>{{ projectDetail.name }}</strong
            ><p>{{ projectDetail.user?.displayName }} · {{ projectDetail.user?.email }}</p></div
          >
          <ElTag :type="statusType(projectDetail.workflowStatus)">{{
            statusText(projectDetail.workflowStatus)
          }}</ElTag>
        </div>
        <ElDescriptions :column="2" border>
          <ElDescriptionsItem :label="xt('当前修订')"
            >v{{ projectDetail.revision }}</ElDescriptionsItem
          >
          <ElDescriptionsItem :label="xt('默认模型')">{{
            projectDetail.defaultModel || '-'
          }}</ElDescriptionsItem>
          <ElDescriptionsItem :label="xt('默认助手')">{{
            projectDetail.defaultAssistant?.name || '-'
          }}</ElDescriptionsItem>
          <ElDescriptionsItem :label="xt('最后更新')">{{
            formatDate(projectDetail.updatedAt)
          }}</ElDescriptionsItem>
          <ElDescriptionsItem :label="xt('说明')" :span="2">{{
            projectDetail.description || '-'
          }}</ElDescriptionsItem>
          <ElDescriptionsItem :label="xt('项目指令')" :span="2">
            <pre>{{ projectDetail.instructions || '-' }}</pre>
          </ElDescriptionsItem>
        </ElDescriptions>
        <ElDivider content-position="left">{{ xt('工作步骤') }}</ElDivider>
        <ElTimeline v-if="projectSteps.length">
          <ElTimelineItem
            v-for="step in projectSteps"
            :key="step.id"
            :type="
              step.status === 'DONE'
                ? 'success'
                : step.status === 'IN_PROGRESS'
                  ? 'warning'
                  : 'info'
            "
          >
            <strong>{{ step.title }}</strong
            ><ElTag size="small" effect="plain">{{ statusText(step.status) }}</ElTag
            ><p>{{ step.description || xt('无步骤说明') }}</p>
          </ElTimelineItem>
        </ElTimeline>
        <ElEmpty v-else :description="xt('该项目尚未配置工作步骤')" :image-size="72" />
        <ElDivider content-position="left">{{ xt('编辑工作流') }}</ElDivider>
        <ElForm label-position="top" class="admin-workflow-editor">
          <ElRow :gutter="14">
            <ElCol :span="8"
              ><ElFormItem :label="xt('状态')"
                ><ElSelect v-model="projectWorkflowForm.workflowStatus" class="wide"
                  ><ElOption :label="xt('规划中')" value="PLANNING" /><ElOption
                    :label="xt('进行中')"
                    value="IN_PROGRESS" /><ElOption :label="xt('待审核')" value="REVIEW" /><ElOption
                    :label="xt('已完成')"
                    value="COMPLETED" /><ElOption
                    :label="xt('已归档')"
                    value="ARCHIVED" /></ElSelect></ElFormItem
            ></ElCol>
            <ElCol :span="8"
              ><ElFormItem :label="xt('默认模型')"
                ><ElSelect
                  v-model="projectWorkflowForm.defaultModel"
                  class="wide"
                  filterable
                  clearable
                  allow-create
                  ><ElOption
                    v-for="model in lookups.models"
                    :key="model.id || model.key"
                    :label="model.name || model.key"
                    :value="model.key || model.name" /></ElSelect></ElFormItem
            ></ElCol>
            <ElCol :span="8"
              ><ElFormItem :label="xt('默认助手')"
                ><ElSelect
                  v-model="projectWorkflowForm.defaultAssistantId"
                  class="wide"
                  filterable
                  clearable
                  ><ElOption
                    v-for="assistant in lookups.assistants"
                    :key="assistant.id"
                    :label="assistant.name"
                    :value="assistant.id" /></ElSelect></ElFormItem
            ></ElCol>
          </ElRow>
          <ElFormItem :label="xt('项目指令')"
            ><ElInput
              v-model="projectWorkflowForm.instructions"
              type="textarea"
              :rows="3"
              maxlength="4000"
              show-word-limit
          /></ElFormItem>
          <ElFormItem :label="xt('默认提示词')"
            ><ElInput
              v-model="projectWorkflowForm.defaultPrompt"
              type="textarea"
              :rows="3"
              maxlength="10000"
              show-word-limit
          /></ElFormItem>
          <ElFormItem :label="xt('输出要求')"
            ><ElInput
              v-model="projectWorkflowForm.outputRequirements"
              type="textarea"
              :rows="3"
              maxlength="10000"
              show-word-limit
          /></ElFormItem>
          <div class="workflow-editor-heading"
            ><strong>{{ xt('工作步骤') }}</strong
            ><ElButton size="small" @click="addProjectWorkflowStep"
              ><ArtSvgIcon icon="ri:add-line" />{{ xt('新增步骤') }}</ElButton
            ></div
          >
          <div v-if="projectWorkflowForm.steps.length" class="workflow-step-list">
            <div
              v-for="(step, index) in projectWorkflowForm.steps"
              :key="step.id"
              class="workflow-step-row"
            >
              <span class="workflow-step-index">{{ String(index + 1).padStart(2, '0') }}</span>
              <ElInput v-model="step.title" :placeholder="xt('步骤名称')" maxlength="120" />
              <ElInput
                v-model="step.description"
                :placeholder="xt('目标和交付物（可选）')"
                maxlength="1000"
              />
              <ElSelect v-model="step.status" :aria-label="xt('步骤状态')"
                ><ElOption :label="xt('待开始')" value="TODO" /><ElOption
                  :label="xt('进行中')"
                  value="IN_PROGRESS" /><ElOption :label="xt('已完成')" value="DONE"
              /></ElSelect>
              <ElButton
                circle
                text
                type="danger"
                :aria-label="xt('删除步骤')"
                @click="removeProjectWorkflowStep(index)"
                ><ArtSvgIcon icon="ri:delete-bin-line"
              /></ElButton>
            </div>
          </div>
          <ElEmpty v-else :description="xt('尚未配置步骤')" :image-size="56" />
        </ElForm>
        <div class="workflow-editor-actions"
          ><ElButton @click="projectVisible = false">{{ xt('关闭') }}</ElButton
          ><ElButton
            type="primary"
            :loading="projectWorkflowSaving"
            @click="saveProjectWorkflowAdmin"
            >{{ xt('保存工作流') }}</ElButton
          ></div
        >
        <ElDivider content-position="left">{{ xt('版本历史') }}</ElDivider>
        <ElCollapse accordion>
          <ElCollapseItem
            v-for="version in projectDetail.versions || []"
            :key="version.id"
            :name="version.id"
          >
            <template #title
              ><div class="version-title"
                ><strong>v{{ version.version }} · {{ version.label || xt('未命名版本') }}</strong
                ><span>{{ version.changeSummary || xt('无变更说明') }}</span
                ><time>{{ formatDate(version.createdAt) }}</time></div
              ></template
            >
            <pre>{{ JSON.stringify(version.snapshot, null, 2) }}</pre>
          </ElCollapseItem>
        </ElCollapse>
      </template>
    </ElDrawer>
  </div>
</template>

<script setup lang="ts">
  import type { FormInstance, UploadFile } from 'element-plus'
  import { ElMessage, ElMessageBox } from 'element-plus'
  import { useRoute } from 'vue-router'
  import request from '@/utils/http'
  import { xinyueLocale, xinyueText as xt } from '@/locales/xinyue'

  defineOptions({ name: 'XinyueOperations' })

  type Row = Record<string, any>
  type Column = {
    key: string
    label: string
    width?: number
    minWidth?: number
    type?: 'status' | 'date' | 'bytes' | 'number' | 'image'
  }
  type ResourceConfig = {
    title: string
    description: string
    icon: string
    endpoint: string
    columns: Column[]
  }
  type SelectOption = { label: string; value: string | number | boolean }
  type EditorField = {
    key: string
    label: string
    type?: 'input' | 'textarea' | 'number' | 'switch' | 'select'
    required?: boolean
    span?: number
    placeholder?: string
    maxlength?: number
    rows?: number
    min?: number
    max?: number
    multiple?: boolean
    filterable?: boolean
    allowCreate?: boolean
    options?: SelectOption[]
    optionsFrom?:
      | 'groups'
      | 'models'
      | 'tools'
      | 'knowledgeBases'
      | 'promptTemplates'
      | 'users'
      | 'assistants'
      | 'pluginCategories'
    createOnly?: boolean
    editOnly?: boolean
    omitEmpty?: boolean
    when?: { key: string; value: string | number | boolean }
  }
  type EditorConfig = {
    canCreate?: boolean
    canEdit?: boolean
    canDelete?: boolean
    createLabel?: string
    createUrl?: string
    updateUrl?: (row: Row) => string
    deleteUrl?: (row: Row) => string
    fields: EditorField[]
    defaults: Row
  }

  const ticketStatusOptions: SelectOption[] = [
    { label: '待处理', value: 'OPEN' },
    { label: '处理中', value: 'IN_PROGRESS' },
    { label: '等待用户', value: 'WAITING_USER' },
    { label: '已解决', value: 'RESOLVED' },
    { label: '已关闭', value: 'CLOSED' }
  ]
  const ticketPriorityOptions: SelectOption[] = [
    { label: '低', value: 'LOW' },
    { label: '普通', value: 'NORMAL' },
    { label: '高', value: 'HIGH' },
    { label: '紧急', value: 'URGENT' }
  ]

  const editorConfigs: Record<string, EditorConfig> = {
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
          label: '指定模型',
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
        inputMode: 'REFERENCE',
        placeholder: '',
        sortOrder: 0,
        enabled: true
      },
      fields: [
        { key: 'title', label: '工具名称', required: true, span: 12, maxlength: 80 },
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
        { key: 'featured', label: '精选推荐', type: 'switch', span: 12 }
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
          allowCreate: true
        },
        { key: 'description', label: '简介', type: 'textarea', rows: 2, maxlength: 2000 },
        { key: 'systemPrompt', label: '系统指令', type: 'textarea', rows: 8, maxlength: 30000 },
        {
          key: 'templateIds',
          label: '提示词模板',
          type: 'select',
          multiple: true,
          filterable: true,
          optionsFrom: 'promptTemplates'
        },
        {
          key: 'toolIds',
          label: '可用工具',
          type: 'select',
          multiple: true,
          filterable: true,
          optionsFrom: 'tools'
        },
        {
          key: 'knowledgeBaseIds',
          label: '知识库',
          type: 'select',
          multiple: true,
          filterable: true,
          optionsFrom: 'knowledgeBases'
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
        { key: 'description', label: '说明', type: 'textarea', rows: 3, maxlength: 2000 },
        { key: 'icon', label: '图标地址 / 内置标识', span: 12, maxlength: 80 },
        {
          key: 'kind',
          label: '能力类型',
          type: 'select',
          span: 12,
          options: [
            { label: '内置工具', value: 'BUILT_IN' },
            { label: '用户连接器', value: 'CONNECTOR' }
          ]
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
          maxlength: 2000
        },
        {
          key: 'credentialFieldsText',
          label: '用户授权字段（JSON）',
          type: 'textarea',
          rows: 4,
          placeholder: '[{"key":"apiKey","label":"API Key","type":"password","required":true}]',
          when: { key: 'authType', value: 'API_KEY' }
        },
        { key: 'endpoint', label: '调用地址', placeholder: 'https://...', maxlength: 500 },
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
          placeholder: '{"X-App":"xinyue"}'
        },
        {
          key: 'secretHeadersText',
          label: '敏感请求头（JSON，留空保留）',
          type: 'textarea',
          rows: 3,
          placeholder: '{"Authorization":"Bearer ..."}',
          omitEmpty: true
        },
        { key: 'clearSecretHeaders', label: '清除已保存敏感请求头', type: 'switch' },
        {
          key: 'inputSchemaText',
          label: '输入 Schema（JSON）',
          type: 'textarea',
          rows: 4,
          placeholder: '{"type":"object","properties":{}}'
        },
        {
          key: 'scopes',
          label: '权限范围',
          type: 'select',
          multiple: true,
          filterable: true,
          allowCreate: true
        },
        { key: 'requiresApproval', label: '调用前审批', type: 'switch', span: 12 },
        { key: 'enabled', label: '启用', type: 'switch', span: 12 }
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
      defaults: { title: '', body: '', groupId: '' },
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
        }
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

  const resources: Record<string, ResourceConfig> = {
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
        { key: 'reason', label: '原因', minWidth: 180 },
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
      endpoint: '/v1/admin/prompt-library/items?page=1&pageSize=5000',
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
      title: '插件管理',
      description: '管理官方插件的发布、能力、定价和使用情况',
      icon: 'ri:apps-2-line',
      endpoint: '/v1/admin/plugins',
      columns: [
        { key: 'name', label: '插件名称', minWidth: 180 },
        { key: 'category.name', label: '分类', minWidth: 120 },
        { key: 'capabilities', label: '支持能力', minWidth: 180 },
        { key: 'status', label: '发布状态', width: 105, type: 'status' },
        { key: 'featured', label: '精选', width: 85, type: 'status' },
        { key: 'priceCredits', label: '安装价格', width: 105, type: 'number' },
        { key: 'installCount', label: '安装', width: 85, type: 'number' },
        { key: 'usageCount', label: '调用', width: 85, type: 'number' },
        { key: 'errorCount', label: '失败', width: 85, type: 'number' },
        { key: 'updatedAt', label: '更新时间', width: 175, type: 'date' }
      ]
    },
    pluginCategories: {
      title: '插件分类',
      description: '维护插件市场分类、图标和前台排序',
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
      description: '配置系统提示词、默认模型、工具和知识库',
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
      description: '管理助手可调用的外部工具及审批策略',
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
    },
    systemHealth: {
      title: '系统健康',
      description: '查看数据库、Redis、文件存储和运行环境',
      icon: 'ri:pulse-line',
      endpoint: '/v1/admin/system',
      columns: [
        { key: 'database', label: '数据库', minWidth: 150, type: 'status' },
        { key: 'queue', label: '队列', minWidth: 150, type: 'status' },
        { key: 'storage.driver', label: '存储驱动', minWidth: 160 },
        { key: 'storage.status', label: '存储状态', minWidth: 150, type: 'status' },
        { key: 'environment', label: '运行环境', minWidth: 150, type: 'status' }
      ]
    }
  }

  const route = useRoute()
  const rows = ref<Row[]>([])
  const loading = ref(false)
  const pendingLoads = new Map<string, Promise<Row[]>>()
  const filters = reactive({ keyword: '' })
  const appliedKeyword = ref('')
  const page = ref(1)
  const pageSize = ref(20)
  const detailVisible = ref(false)
  const detailRow = ref<Row | null>(null)
  const editorVisible = ref(false)
  const editorFormRef = ref<FormInstance>()
  const editorForm = reactive<Row>({})
  const editingRow = ref<Row | null>(null)
  const saving = ref(false)
  const toolIconFile = ref<File | null>(null)
  const toolIconPreviewUrl = ref('')
  const coverFile = ref<File | null>(null)
  const previewVideoFile = ref<File | null>(null)
  const previewFiles = ref<File[]>([])
  const lookups = reactive<Record<string, Row[]>>({
    groups: [],
    models: [],
    tools: [],
    knowledgeBases: [],
    promptTemplates: [],
    users: [],
    assistants: [],
    pluginCategories: []
  })
  const ticketVisible = ref(false)
  const ticketDetail = ref<Row | null>(null)
  const supportAgents = ref<Row[]>([])
  const ticketForm = reactive({ status: 'OPEN', priority: 'NORMAL', assignedToId: '', reply: '' })
  const policyVisible = ref(false)
  const moderationPolicy = ref<Row | null>(null)
  const sourceVisible = ref(false)
  const sourceLoading = ref(false)
  const promptSources = ref<Row[]>([])
  const projectVisible = ref(false)
  const projectDetail = ref<Row | null>(null)
  const projectWorkflowSaving = ref(false)
  const projectWorkflowForm = reactive<{
    workflowStatus: string
    defaultModel: string
    defaultAssistantId: string
    instructions: string
    defaultPrompt: string
    outputRequirements: string
    steps: Row[]
  }>({
    workflowStatus: 'PLANNING',
    defaultModel: '',
    defaultAssistantId: '',
    instructions: '',
    defaultPrompt: '',
    outputRequirements: '',
    steps: []
  })
  const isCompact = ref(false)

  const resourceKey = computed(() => String(route.meta.resource || 'jobs'))
  const config = computed(() => resources[resourceKey.value] || resources.jobs)
  const editorConfig = computed(() => editorConfigs[resourceKey.value])
  const visibleEditorFields = computed(() =>
    (editorConfig.value?.fields || []).filter(
      (item) =>
        (!item.createOnly || !editingRow.value) &&
        (!item.editOnly || editingRow.value) &&
        (!item.when || editorForm[item.when.key] === item.when.value)
    )
  )
  const searchItems = computed(() => [
    {
      label: xt('关键词'),
      key: 'keyword',
      type: 'input',
      props: { clearable: true, placeholder: `${xt('搜索')}${xt(config.value.title)}` }
    }
  ])
  const filteredRows = computed(() => {
    const keyword = appliedKeyword.value.trim().toLowerCase()
    return keyword
      ? rows.value.filter((row) => JSON.stringify(row).toLowerCase().includes(keyword))
      : rows.value
  })
  const pagedRows = computed(() =>
    filteredRows.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value)
  )
  const projectSteps = computed<Row[]>(() => {
    const steps = projectDetail.value?.workflowConfig?.steps
    return Array.isArray(steps) ? steps : []
  })
  const detailItems = computed(() =>
    Object.entries(detailRow.value || {}).map(([key, value]) => ({
      key,
      label: key,
      complex: value !== null && typeof value === 'object',
      value:
        value !== null && typeof value === 'object'
          ? JSON.stringify(value, null, 2)
          : displayValue(value)
    }))
  )

  function unwrap(payload: any): Row[] {
    if (Array.isArray(payload)) return payload
    for (const key of ['items', 'rows', 'data', 'tickets', 'events', 'entries'])
      if (Array.isArray(payload?.[key])) return payload[key]
    if (payload && typeof payload === 'object' && resourceKey.value === 'systemHealth')
      return [{ id: 'system', ...payload }]
    return []
  }
  async function load() {
    const endpoint = config.value.endpoint
    let pending = pendingLoads.get(endpoint)
    loading.value = true
    try {
      if (!pending) {
        pending = request.get<any>({ url: endpoint }).then((payload) => unwrap(payload))
        pendingLoads.set(endpoint, pending)
      }
      const nextRows = await pending
      if (config.value.endpoint === endpoint) rows.value = nextRows
    } catch {
      // 请求层已经负责展示错误提示；这里收口异步异常，避免路由切换产生未处理 Promise。
      if (config.value.endpoint === endpoint) rows.value = []
    } finally {
      if (pendingLoads.get(endpoint) === pending) pendingLoads.delete(endpoint)
      if (config.value.endpoint === endpoint) loading.value = false
    }
  }
  function applySearch() {
    appliedKeyword.value = filters.keyword
    page.value = 1
  }
  function resetSearch() {
    filters.keyword = ''
    appliedKeyword.value = ''
    page.value = 1
  }
  function valueAt(row: Row, path: string) {
    return path.split('.').reduce<any>((value, key) => value?.[key], row)
  }
  function adminMediaUrl(value: unknown) {
    if (typeof value !== 'string' || !value) return ''
    if (!value.startsWith('/assets/')) return value
    const base = import.meta.env.BASE_URL.endsWith('/')
      ? import.meta.env.BASE_URL.slice(0, -1)
      : import.meta.env.BASE_URL
    return `${base}${value}`
  }
  function rowPreviewList(row: Row) {
    return [
      row.coverUrl,
      row.imageUrl,
      typeof row.icon === 'string' && /^(?:https?:\/\/|\/)/.test(row.icon) ? row.icon : '',
      ...(Array.isArray(row.uploadedPreviewImages)
        ? row.uploadedPreviewImages.map((item: Row) => item.url || item.contentUrl)
        : []),
      ...(Array.isArray(row.referenceImageUrls) ? row.referenceImageUrls : []),
      ...(Array.isArray(row.options?.previewImages) ? row.options.previewImages : [])
    ]
      .filter((value): value is string => typeof value === 'string' && Boolean(value))
      .map(adminMediaUrl)
  }
  function rowCover(row: Row) {
    return rowPreviewList(row)[0] || ''
  }
  function displayValue(value: unknown) {
    if (value === null || value === undefined || value === '') return '-'
    if (Array.isArray(value))
      return (
        value.map((item) => (typeof item === 'object' ? JSON.stringify(item) : item)).join('、') ||
        '-'
      )
    if (typeof value === 'boolean') return value ? xt('是') : xt('否')
    if (typeof value === 'object') return JSON.stringify(value)
    return String(value)
  }
  function formatDate(value: unknown) {
    if (!value) return '-'
    const date = new Date(String(value))
    return Number.isNaN(date.getTime())
      ? String(value)
      : new Intl.DateTimeFormat(xinyueLocale(), { dateStyle: 'medium', timeStyle: 'short' }).format(
          date
        )
  }
  function formatBytes(value: number) {
    if (!value) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1)
    return `${(value / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`
  }
  function formatNumber(value: number) {
    return new Intl.NumberFormat(xinyueLocale()).format(value)
  }
  function statusText(value: unknown) {
    const map: Record<string, string> = {
      true: '启用',
      false: '停用',
      ACTIVE: '正常',
      SUSPENDED: '已停用',
      QUEUED: '排队中',
      RUNNING: '运行中',
      SUCCEEDED: '已完成',
      FAILED: '失败',
      CANCELLED: '已取消',
      DRAFT: '草稿',
      PUBLISHED: '已发布',
      DISABLED: '已停用',
      OPEN: '待处理',
      IN_PROGRESS: '处理中',
      WAITING_USER: '等待用户',
      ACKNOWLEDGED: '已确认',
      APPROVED: '已批准',
      PENDING: '待审批',
      REJECTED: '已拒绝',
      DISMISSED: '已驳回',
      RESOLVED: '已解决',
      CLOSED: '已关闭',
      URGENT: '紧急',
      NORMAL: '普通',
      CRITICAL: '严重',
      HIGH: '高',
      MEDIUM: '中',
      LOW: '低',
      LOG: '仅记录',
      REVIEW: '人工审核',
      BLOCK: '阻断',
      PLANNING: '规划中',
      TODO: '待开始',
      DONE: '已完成',
      CHAT: '对话',
      IMAGE: '图片生成',
      VIDEO: '视频生成',
      COMMERCE: '商品视觉',
      OFFICE: '办公中心',
      SUPPORT: '客服'
    }
    return xt(map[String(value)] || displayValue(value))
  }
  function statusType(value: unknown): 'success' | 'warning' | 'danger' | 'info' | 'primary' {
    const key = String(value)
    if (['true', 'ACTIVE', 'SUCCEEDED', 'RESOLVED', 'COMPLETED', 'APPROVED', 'DONE'].includes(key))
      return 'success'
    if (
      [
        'RUNNING',
        'QUEUED',
        'OPEN',
        'IN_PROGRESS',
        'WAITING_USER',
        'ACKNOWLEDGED',
        'MEDIUM',
        'REVIEW'
      ].includes(key)
    )
      return 'warning'
    if (['FAILED', 'SUSPENDED', 'URGENT', 'CRITICAL', 'HIGH', 'BLOCK', 'DISMISSED'].includes(key))
      return 'danger'
    return 'info'
  }
  function showDetail(row: Row) {
    detailRow.value = row
    detailVisible.value = true
  }
  function fieldOptions(field: EditorField): SelectOption[] {
    if (field.options) return field.options
    const rows = field.optionsFrom ? lookups[field.optionsFrom] || [] : []
    return rows.map((row) => ({
      label: row.displayName || row.name || row.title || row.email || row.key || row.id,
      value: field.optionsFrom === 'models' ? row.key : row.id
    }))
  }
  async function loadEditorLookups() {
    const endpoints: Record<string, string> = {
      groups: '/v1/admin/groups',
      models: '/v1/admin/model-presets',
      tools: '/v1/admin/tools',
      knowledgeBases: '/v1/admin/knowledge-bases',
      promptTemplates: '/v1/admin/prompt-templates',
      users: '/v1/admin/users',
      assistants: '/v1/admin/assistants',
      pluginCategories: '/v1/admin/plugin-categories'
    }
    const needed = new Set(
      editorConfig.value?.fields.map((field) => field.optionsFrom).filter(Boolean) || []
    )
    await Promise.all(
      [...needed].map(async (key) => {
        if (!key || lookups[key].length) return
        lookups[key] = unwrapLookup(await request.get<any>({ url: endpoints[key] }))
      })
    )
  }
  function unwrapLookup(payload: any): Row[] {
    if (Array.isArray(payload)) return payload
    for (const key of ['items', 'rows', 'data'])
      if (Array.isArray(payload?.[key])) return payload[key]
    return []
  }
  async function openEditor(row?: Row) {
    if (!editorConfig.value) return
    editingRow.value = row ? { ...row } : null
    if (toolIconPreviewUrl.value) URL.revokeObjectURL(toolIconPreviewUrl.value)
    toolIconFile.value = null
    toolIconPreviewUrl.value = ''
    coverFile.value = null
    previewVideoFile.value = null
    previewFiles.value = []
    Object.keys(editorForm).forEach((key) => delete editorForm[key])
    const source: Row = row || editorConfig.value.defaults
    for (const field of editorConfig.value.fields) {
      let value = source[field.key] ?? editorConfig.value.defaults[field.key]
      if (row && resourceKey.value === 'inspirations' && field.key === 'videoResolution')
        value = row.options?.resolution || '720p'
      if (row && resourceKey.value === 'inspirations' && field.key === 'videoDuration')
        value = row.options?.duration || 5
      if (row && resourceKey.value === 'inspirations' && field.key === 'videoAspectRatio')
        value = row.options?.aspectRatio || '16:9'
      if (row && resourceKey.value === 'inspirations' && field.key === 'externalVideoUrl')
        value = row.options?.previewVideoUrl || ''
      if (row && resourceKey.value === 'imageTools' && field.key === 'inputMode')
        value = row.options?.inputMode || 'REFERENCE'
      if (row && resourceKey.value === 'imageTools' && field.key === 'placeholder')
        value = row.options?.placeholder || ''
      if (row && resourceKey.value === 'assistants') {
        if (field.key === 'toolIds') value = (row.tools || []).map((item: Row) => item.toolId)
        if (field.key === 'knowledgeBaseIds')
          value = (row.knowledgeBases || []).map((item: Row) => item.knowledgeBaseId)
      }
      if (row && resourceKey.value === 'tools') {
        if (field.key === 'headersText') value = JSON.stringify(row.headers || {}, null, 2)
        if (field.key === 'secretHeadersText') value = ''
        if (field.key === 'inputSchemaText') value = JSON.stringify(row.inputSchema || {}, null, 2)
        if (field.key === 'credentialFieldsText')
          value = JSON.stringify(row.credentialFields || [], null, 2)
      }
      editorForm[field.key] = Array.isArray(value) ? [...value] : value
    }
    editorVisible.value = true
    await loadEditorLookups()
  }
  function editorPayload() {
    const payload: Row = {}
    for (const field of visibleEditorFields.value) {
      const value = editorForm[field.key]
      if (field.omitEmpty && (value === '' || value === undefined || value === null)) continue
      payload[field.key] = value
    }
    if (resourceKey.value === 'inspirations') {
      const options = { ...(editingRow.value?.options || {}) }
      delete options.resolution
      delete options.duration
      delete options.aspectRatio
      delete options.previewVideoUrl
      if (payload.mode === 'VIDEO') {
        options.resolution = payload.videoResolution || '720p'
        options.duration = Number(payload.videoDuration || 5)
        options.aspectRatio = payload.videoAspectRatio || '16:9'
        if (String(payload.externalVideoUrl || '').trim())
          options.previewVideoUrl = String(payload.externalVideoUrl).trim()
      }
      delete payload.externalVideoUrl
      delete payload.videoResolution
      delete payload.videoDuration
      delete payload.videoAspectRatio
      payload.options = options
    }
    if (resourceKey.value === 'imageTools') {
      const options = {
        ...(editingRow.value?.options || {}),
        inputMode: payload.inputMode || 'REFERENCE',
        placeholder: String(payload.placeholder || '').trim()
      }
      delete payload.inputMode
      delete payload.placeholder
      payload.mode = 'IMAGE_TOOL'
      payload.options = options
    }
    if (resourceKey.value === 'tools') {
      for (const [textKey, targetKey] of [
        ['headersText', 'headers'],
        ['secretHeadersText', 'secretHeaders'],
        ['inputSchemaText', 'inputSchema'],
        ['credentialFieldsText', 'credentialFields']
      ] as const) {
        const raw = String(payload[textKey] || '').trim()
        delete payload[textKey]
        if (!raw && textKey === 'secretHeadersText') continue
        try {
          payload[targetKey] = raw ? JSON.parse(raw) : {}
        } catch {
          throw new Error(`${textKey} 不是有效 JSON`)
        }
      }
    }
    return payload
  }
  async function saveResource() {
    const editor = editorConfig.value
    if (!editor || !(await editorFormRef.value?.validate().catch(() => false))) return
    const url = editingRow.value ? editor.updateUrl?.(editingRow.value) : editor.createUrl
    if (!url) return
    saving.value = true
    try {
      const saved = await request.request<Row>({
        url,
        method: editingRow.value ? 'PATCH' : 'POST',
        data: editorPayload(),
        showSuccessMessage: true
      })
      if (resourceKey.value === 'inspirations' || resourceKey.value === 'imageTools')
        await uploadInspirationMedia(saved.id || editingRow.value?.id)
      if (resourceKey.value === 'tools') await uploadToolIcon(saved.id || editingRow.value?.id)
      editorVisible.value = false
      await load()
    } finally {
      saving.value = false
    }
  }
  async function removeResource(row: Row) {
    const editor = editorConfig.value
    const url = editor?.deleteUrl?.(row)
    if (!url) return
    const action =
      resourceKey.value === 'promptLibrary'
        ? '重置该提示词的后台覆盖内容'
        : `删除“${row.title || row.name || row.key || row.id}”`
    await ElMessageBox.confirm(`确认${action}？此操作不可撤销。`, '确认操作', { type: 'warning' })
    await request.del({ url, showSuccessMessage: true })
    await load()
  }
  async function reviewToolApproval(row: Row, status: 'APPROVED' | 'REJECTED') {
    let adminNote = ''
    if (status === 'REJECTED') {
      const result = await ElMessageBox.prompt('请输入拒绝原因（可选）', '拒绝审批申请', {
        inputPlaceholder: '例如：该工具尚未完成安全配置',
        inputValidator: (value) => value.length <= 2000 || '最多 2000 个字符'
      }).catch(() => null)
      if (!result) return
      adminNote = result.value
    } else {
      const result = await ElMessageBox.prompt('设置本次批准的有效期（分钟）', '批准审批申请', {
        inputValue: '1440',
        inputPlaceholder: '5 - 10080',
        inputValidator: (value) =>
          /^(?:[5-9]|[1-9][0-9]{1,3}|10080)$/.test(value) || '请输入 5 至 10080 的分钟数'
      }).catch(() => null)
      if (!result) return
      await request.request({
        url: `/v1/admin/tool-approval-requests/${row.id}`,
        method: 'PATCH',
        data: { status, expiresInMinutes: Number(result.value) },
        showSuccessMessage: true
      })
      await load()
      return
    }
    await request.request({
      url: `/v1/admin/tool-approval-requests/${row.id}`,
      method: 'PATCH',
      data: { status, adminNote },
      showSuccessMessage: true
    })
    await load()
  }
  function selectCover(file: UploadFile) {
    coverFile.value = file.raw || null
  }
  function selectToolIcon(file: UploadFile) {
    if (!file.raw) return
    if (toolIconPreviewUrl.value) URL.revokeObjectURL(toolIconPreviewUrl.value)
    toolIconFile.value = file.raw
    toolIconPreviewUrl.value = URL.createObjectURL(file.raw)
  }
  async function uploadToolIcon(id?: string) {
    if (!id || !toolIconFile.value) return
    const data = new FormData()
    data.append('file', toolIconFile.value)
    await request.post({ url: `/v1/admin/tools/${id}/icon`, data, showSuccessMessage: true })
  }
  async function removeToolIcon() {
    if (!editingRow.value) return
    await ElMessageBox.confirm('确认移除当前上传图标？', '移除图标', { type: 'warning' })
    await request.del({
      url: `/v1/admin/tools/${editingRow.value.id}/icon`,
      showSuccessMessage: true
    })
    editingRow.value.iconAssetId = null
    editingRow.value.icon = 'wrench'
    editorForm.icon = 'wrench'
  }
  function selectPreviewVideo(file: UploadFile) {
    previewVideoFile.value = file.raw || null
  }
  function selectPreviewFiles(file: UploadFile) {
    if (file.raw && !previewFiles.value.some((item) => item === file.raw))
      previewFiles.value.push(file.raw)
  }
  function removeSelectedPreview(file: UploadFile) {
    if (file.raw) previewFiles.value = previewFiles.value.filter((item) => item !== file.raw)
  }
  async function uploadInspirationMedia(id?: string) {
    if (!id) return
    if (coverFile.value) {
      const data = new FormData()
      data.append('file', coverFile.value)
      await request.post({ url: `/v1/admin/inspirations/${id}/cover`, data })
    }
    if (editorForm.mode === 'VIDEO' && previewVideoFile.value) {
      const data = new FormData()
      data.append('file', previewVideoFile.value)
      await request.post({ url: `/v1/admin/inspirations/${id}/preview-video`, data })
    }
    if (editorForm.mode !== 'VIDEO' && previewFiles.value.length) {
      const data = new FormData()
      previewFiles.value.forEach((file) => data.append('files', file))
      await request.post({ url: `/v1/admin/inspirations/${id}/preview-images`, data })
    }
  }
  async function removeInspirationCover() {
    if (!editingRow.value) return
    await ElMessageBox.confirm('确认移除当前封面？', '移除封面', { type: 'warning' })
    await request.del({
      url: `/v1/admin/inspirations/${editingRow.value.id}/cover`,
      showSuccessMessage: true
    })
    editingRow.value.coverAssetId = null
    editingRow.value.imageUrl = ''
  }
  async function removeInspirationPreview(assetId: string) {
    if (!editingRow.value) return
    await request.del({
      url: `/v1/admin/inspirations/${editingRow.value.id}/preview-images/${assetId}`,
      showSuccessMessage: true
    })
    editingRow.value.uploadedPreviewImages = (editingRow.value.uploadedPreviewImages || []).filter(
      (item: Row) => item.assetId !== assetId
    )
  }
  async function removeInspirationVideo() {
    if (!editingRow.value) return
    await ElMessageBox.confirm(xt('确认移除当前演示视频？'), xt('移除演示视频'), {
      type: 'warning'
    })
    await request.del({
      url: `/v1/admin/inspirations/${editingRow.value.id}/preview-video`,
      showSuccessMessage: true
    })
    editingRow.value.uploadedPreviewVideo = null
    editingRow.value.videoUrl = editingRow.value.options?.previewVideoUrl || ''
  }
  function canCancel(row: Row) {
    return resourceKey.value === 'jobs' && ['QUEUED', 'RUNNING'].includes(row.status)
  }
  function canRetry(row: Row) {
    return resourceKey.value === 'jobs' && ['FAILED', 'CANCELLED'].includes(row.status)
  }
  function canAcknowledge(row: Row) {
    return resourceKey.value === 'alerts' && row.status === 'OPEN'
  }
  function canResolve(row: Row) {
    return resourceKey.value === 'alerts' && !['RESOLVED', 'CLOSED'].includes(row.status)
  }
  async function cancelJob(row: Row) {
    await ElMessageBox.confirm('确认取消该生成任务？', '取消任务', { type: 'warning' })
    await request.post({
      url: `/v1/admin/jobs/${row.id}/cancel`,
      params: {},
      showSuccessMessage: true
    })
    await load()
  }
  async function retryJob(row: Row) {
    await request.post({
      url: `/v1/admin/jobs/${row.id}/retry`,
      params: {},
      showSuccessMessage: true
    })
    await load()
  }
  async function removeAsset(row: Row) {
    await ElMessageBox.confirm(`确认删除“${row.name}”？`, '删除资产', { type: 'warning' })
    await request.del({ url: `/v1/admin/assets/${row.id}`, showSuccessMessage: true })
    await load()
  }
  async function updateAlert(row: Row, action: 'acknowledge' | 'resolve') {
    await request.post({
      url: `/v1/admin/alerts/events/${row.id}/${action}`,
      params: {},
      showSuccessMessage: true
    })
    await load()
  }
  async function evaluateAlerts() {
    await request.post({ url: '/v1/admin/alerts/evaluate', params: {}, showSuccessMessage: true })
    await load()
  }
  async function restorePromptTemplates() {
    await request.post({
      url: '/v1/admin/prompt-templates/restore-defaults',
      params: {},
      showSuccessMessage: true
    })
    await load()
  }
  async function refreshPromptLibrary() {
    await request.post({
      url: '/v1/admin/prompt-library/refresh',
      params: {},
      timeout: 600000,
      showSuccessMessage: true
    })
    await load()
  }
  async function openPromptSources() {
    sourceVisible.value = true
    sourceLoading.value = true
    try {
      promptSources.value = await request.get<Row[]>({ url: '/v1/admin/prompt-library/sources' })
    } finally {
      sourceLoading.value = false
    }
  }
  async function savePromptSource(row: Row) {
    await request.request({
      url: `/v1/admin/prompt-library/sources/${row.id}`,
      method: 'PATCH',
      data: { displayName: row.displayName, enabled: row.enabled, sortOrder: row.sortOrder },
      showSuccessMessage: true
    })
    await openPromptSources()
    await load()
  }
  async function refreshPromptSource(row: Row) {
    row._refreshing = true
    try {
      await request.post({
        url: `/v1/admin/prompt-library/sources/${row.id}/refresh`,
        params: {},
        timeout: 600000,
        showSuccessMessage: true
      })
      await openPromptSources()
      await load()
    } finally {
      row._refreshing = false
    }
  }
  async function openModerationPolicy() {
    policyVisible.value = true
    moderationPolicy.value = await request.get<Row>({ url: '/v1/admin/moderation/policy' })
  }
  async function saveModerationPolicy() {
    if (!moderationPolicy.value) return
    saving.value = true
    try {
      const {
        enabled,
        scanChat,
        scanImage,
        scanCommerce,
        failClosed,
        retainContent,
        blockMessage,
        excerptLength
      } = moderationPolicy.value
      moderationPolicy.value = await request.request<Row>({
        url: '/v1/admin/moderation/policy',
        method: 'PATCH',
        data: {
          enabled,
          scanChat,
          scanImage,
          scanCommerce,
          failClosed,
          retainContent,
          blockMessage,
          excerptLength
        },
        showSuccessMessage: true
      })
      policyVisible.value = false
    } finally {
      saving.value = false
    }
  }
  async function muteAlertRule(row: Row) {
    const { value } = await ElMessageBox.prompt(
      '请输入静默分钟数（1-43200）',
      `静默：${row.name}`,
      {
        inputValue: '60',
        inputPattern: /^([1-9]\d{0,3}|[1-3]\d{4}|4[0-2]\d{3}|43[01]\d{2}|43200)$/,
        inputErrorMessage: '请输入 1 到 43200 的整数'
      }
    )
    await request.post({
      url: `/v1/admin/alerts/rules/${row.id}/mute`,
      data: { minutes: Number(value) },
      showSuccessMessage: true
    })
    await load()
  }
  async function resolveModeration(row: Row, status: string) {
    const { value } = await ElMessageBox.prompt(
      '可填写本次处置说明',
      status === 'APPROVED' ? '批准内容' : '驳回事件',
      { inputType: 'textarea', inputPlaceholder: '处置说明（可选）', confirmButtonText: '确认处置' }
    )
    await request.request({
      url: `/v1/admin/moderation/events/${row.id}`,
      method: 'PATCH',
      data: { status, note: value || '' },
      showSuccessMessage: true
    })
    await load()
  }
  async function openTicket(row: Row) {
    ticketVisible.value = true
    const [detail, agents] = await Promise.all([
      request.get<Row>({ url: `/v1/admin/support/tickets/${row.id}` }),
      supportAgents.value.length
        ? Promise.resolve(supportAgents.value)
        : request.get<Row[]>({ url: '/v1/admin/support/tickets/agents' })
    ])
    ticketDetail.value = detail
    supportAgents.value = agents
    ticketForm.status = detail.status
    ticketForm.priority = detail.priority
    ticketForm.assignedToId = detail.assignedToId || ''
    ticketForm.reply = ''
  }
  async function openProject(row: Row) {
    projectVisible.value = true
    const [detail] = await Promise.all([
      request.get<Row>({ url: `/v1/admin/projects/${row.id}` }),
      loadEditorLookups()
    ])
    projectDetail.value = detail
    const workflow = (detail.workflowConfig || {}) as Row
    projectWorkflowForm.workflowStatus = String(detail.workflowStatus || 'PLANNING')
    projectWorkflowForm.defaultModel = String(detail.defaultModel || '')
    projectWorkflowForm.defaultAssistantId = String(detail.defaultAssistantId || '')
    projectWorkflowForm.instructions = String(detail.instructions || '')
    projectWorkflowForm.defaultPrompt = String(workflow.defaultPrompt || '')
    projectWorkflowForm.outputRequirements = String(workflow.outputRequirements || '')
    projectWorkflowForm.steps = Array.isArray(workflow.steps)
      ? workflow.steps.map((step: Row, index: number) => ({
          id: String(step.id || `step-${index + 1}`),
          title: String(step.title || ''),
          description: String(step.description || ''),
          status: ['TODO', 'IN_PROGRESS', 'DONE'].includes(String(step.status))
            ? step.status
            : 'TODO'
        }))
      : []
  }
  function addProjectWorkflowStep() {
    projectWorkflowForm.steps.push({
      id: `step-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      title: '',
      description: '',
      status: 'TODO'
    })
  }
  function removeProjectWorkflowStep(index: number) {
    projectWorkflowForm.steps.splice(index, 1)
  }
  async function saveProjectWorkflowAdmin() {
    if (!projectDetail.value) return
    if (projectWorkflowForm.steps.some((step) => !String(step.title || '').trim())) {
      ElMessage.warning('请填写每个步骤的名称')
      return
    }
    projectWorkflowSaving.value = true
    try {
      await request.request<Row>({
        url: `/v1/admin/projects/${projectDetail.value.id}`,
        method: 'PATCH',
        data: {
          workflowStatus: projectWorkflowForm.workflowStatus,
          workflowConfig: {
            steps: projectWorkflowForm.steps.map((step) => ({
              id: step.id,
              title: String(step.title).trim(),
              description: String(step.description || '').trim(),
              status: step.status
            })),
            defaultPrompt: projectWorkflowForm.defaultPrompt.trim(),
            outputRequirements: projectWorkflowForm.outputRequirements.trim()
          },
          defaultModel: projectWorkflowForm.defaultModel.trim(),
          defaultAssistantId: projectWorkflowForm.defaultAssistantId || null,
          instructions: projectWorkflowForm.instructions.trim(),
          changeSummary: '管理员保存项目工作流'
        },
        showSuccessMessage: true
      })
      await load()
      projectDetail.value = await request.get<Row>({
        url: `/v1/admin/projects/${projectDetail.value.id}`
      })
    } finally {
      projectWorkflowSaving.value = false
    }
  }
  async function updateTicket() {
    if (!ticketDetail.value) return
    saving.value = true
    try {
      await request.request({
        url: `/v1/admin/support/tickets/${ticketDetail.value.id}`,
        method: 'PATCH',
        data: {
          status: ticketForm.status,
          priority: ticketForm.priority,
          assignedToId: ticketForm.assignedToId || null
        },
        showSuccessMessage: true
      })
      await openTicket(ticketDetail.value)
      await load()
    } finally {
      saving.value = false
    }
  }
  async function replyTicket() {
    if (!ticketDetail.value || !ticketForm.reply.trim()) return ElMessage.warning('请输入回复内容')
    saving.value = true
    try {
      await request.post({
        url: `/v1/admin/support/tickets/${ticketDetail.value.id}/messages`,
        data: { body: ticketForm.reply },
        showSuccessMessage: true
      })
      await openTicket(ticketDetail.value)
      await load()
    } finally {
      saving.value = false
    }
  }

  watch(
    resourceKey,
    () => {
      rows.value = []
      editorVisible.value = false
      ticketVisible.value = false
      projectVisible.value = false
      resetSearch()
      load()
    },
    { immediate: true }
  )

  function updateCompact() {
    isCompact.value = window.innerWidth <= 1200
  }

  onMounted(() => {
    updateCompact()
    window.addEventListener('resize', updateCompact)
  })
  onBeforeUnmount(() => window.removeEventListener('resize', updateCompact))
</script>

<style scoped>
  .operation-page {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-height: 0;
  }

  .art-table-card {
    display: flex;
    flex: 1;
    flex-direction: column;
    width: 100%;
    min-width: 0;
    max-width: 100%;
    min-height: 0;
    overflow: hidden;
  }

  .art-table-card :deep(.el-card__body) {
    display: flex;
    flex: 1;
    flex-direction: column;
    width: 100%;
    min-width: 0;
    max-width: 100%;
    min-height: 0;
    overflow: hidden;
  }

  .art-table-card :deep(.el-table) {
    width: 100%;
    min-width: 0 !important;
    max-width: 100%;
  }

  .art-table-card :deep(.el-table__inner-wrapper),
  .art-table-card :deep(.el-table__body-wrapper),
  .art-table-card :deep(.el-scrollbar__wrap) {
    max-width: 100%;
  }

  .resource-heading {
    display: flex;
    gap: 12px;
    align-items: center;
  }

  .resource-heading p {
    margin: 3px 0 0;
    font-size: 12px;
    font-weight: 400;
    color: var(--art-gray-500);
  }

  .resource-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    justify-content: flex-end;
    max-width: 100%;
  }

  .resource-actions :deep(.el-button) {
    height: 32px;
    padding: 0 12px;
  }

  .resource-icon {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    font-size: 18px;
    color: var(--main-color);
    background: var(--art-gray-100);
    border-radius: 6px;
  }

  .table-footer {
    display: flex;
    justify-content: flex-end;
    max-width: 100%;
    padding-top: 16px;
    overflow-x: auto;
  }

  .table-image-cell {
    display: flex;
    gap: 7px;
    align-items: center;
    min-width: 0;
  }

  .table-image-cell small {
    font-size: 11px;
    color: var(--art-gray-500);
    white-space: nowrap;
  }

  .table-cover,
  .image-placeholder {
    flex: 0 0 58px;
    width: 58px;
    height: 44px;
    overflow: hidden;
    border: 1px solid var(--art-gray-200);
    border-radius: 6px;
  }

  .table-cover {
    cursor: zoom-in;
  }

  .table-image-cell :deep(.el-image__inner) {
    display: block;
  }

  .image-placeholder {
    display: grid;
    place-items: center;
    font-size: 18px;
    color: var(--art-gray-400);
    background: var(--art-gray-100);
  }

  .wide {
    width: 100%;
  }

  .media-editor {
    display: grid;
    gap: 22px;
  }

  .tool-icon-editor {
    display: flex;
    gap: 16px;
    align-items: center;
    min-width: 0;
  }

  .tool-icon-preview {
    display: grid;
    flex: 0 0 64px;
    place-items: center;
    width: 64px;
    height: 64px;
    overflow: hidden;
    font-size: 24px;
    color: var(--art-gray-500);
    background: var(--art-gray-100);
    border: 1px solid var(--art-gray-200);
    border-radius: 12px;
  }

  .tool-icon-preview img {
    width: 100%;
    height: 100%;
    padding: 8px;
    object-fit: contain;
  }

  .tool-icon-controls {
    min-width: 0;
  }

  .field-label {
    display: block;
    margin-bottom: 10px;
    font-size: 14px;
    font-weight: 500;
    color: var(--art-gray-800);
  }

  .media-row {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: center;
  }

  .cover-preview {
    width: 112px;
    height: 84px;
    border: 1px solid var(--art-gray-200);
    border-radius: 6px;
  }

  .video-preview {
    display: block;
    width: min(100%, 520px);
    aspect-ratio: 16 / 9;
    margin-bottom: 12px;
    object-fit: contain;
    background: #111;
    border: 1px solid var(--art-gray-200);
    border-radius: 6px;
  }

  .media-help {
    margin: 9px 0 0;
    font-size: 12px;
    line-height: 1.6;
    color: var(--art-gray-500);
  }

  .preview-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(92px, 1fr));
    gap: 10px;
    margin-bottom: 12px;
  }

  .preview-item {
    position: relative;
    aspect-ratio: 1;
    overflow: hidden;
    border: 1px solid var(--art-gray-200);
    border-radius: 6px;
  }

  .preview-item :deep(.el-image) {
    width: 100%;
    height: 100%;
  }

  .preview-item .el-button {
    position: absolute;
    top: 5px;
    right: 5px;
  }

  .ticket-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    padding-bottom: 16px;
  }

  .ticket-header strong {
    font-size: 17px;
  }

  .ticket-header p {
    margin: 6px 0 0;
    font-size: 12px;
    color: var(--art-gray-500);
  }

  .ticket-settings,
  .ticket-reply {
    padding: 16px;
    background: var(--default-bg-color);
    border: 1px solid var(--art-gray-200);
    border-radius: 6px;
  }

  .ticket-messages {
    display: grid;
    gap: 10px;
    max-height: 360px;
    margin-bottom: 18px;
    overflow: auto;
  }

  .ticket-message {
    max-width: 88%;
    padding: 12px 14px;
    background: var(--default-box-color);
    border: 1px solid var(--art-gray-200);
    border-radius: 6px;
  }

  .ticket-message.admin {
    margin-left: auto;
    background: color-mix(in srgb, var(--main-color) 7%, var(--default-box-color));
    border-color: color-mix(in srgb, var(--main-color) 28%, transparent);
  }

  .ticket-message > div {
    display: flex;
    gap: 18px;
    justify-content: space-between;
    font-size: 12px;
  }

  .ticket-message time {
    color: var(--art-gray-500);
  }

  .ticket-message p {
    margin: 7px 0 0;
    line-height: 1.65;
    white-space: pre-wrap;
  }

  .switch-grid {
    display: grid;
    gap: 1px;
    margin-bottom: 22px;
    overflow: hidden;
    background: var(--art-gray-200);
    border: 1px solid var(--art-gray-200);
    border-radius: 6px;
  }

  .switch-grid label {
    display: flex;
    gap: 20px;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px;
    background: var(--default-box-color);
  }

  .switch-grid label span {
    display: grid;
    gap: 3px;
  }

  .switch-grid small,
  .source-meta,
  .source-error {
    display: block;
    font-size: 11px;
    line-height: 1.5;
    color: var(--art-gray-500);
  }

  .source-cache-notice {
    margin-bottom: 16px;
  }

  .source-meta {
    margin-top: 5px;
  }

  .source-error {
    margin-top: 4px;
    color: var(--el-color-danger);
  }

  .project-audit-head {
    display: flex;
    gap: 20px;
    align-items: flex-start;
    justify-content: space-between;
    margin-bottom: 18px;
  }

  .project-audit-head strong {
    font-size: 18px;
  }

  .project-audit-head p {
    margin: 5px 0 0;
    font-size: 12px;
    color: var(--art-gray-500);
  }

  .project-audit-head + :deep(.el-descriptions) {
    margin-bottom: 20px;
  }

  .admin-workflow-editor {
    padding: 2px 0 8px;
  }

  .workflow-editor-heading,
  .workflow-editor-actions {
    display: flex;
    gap: 12px;
    align-items: center;
    justify-content: space-between;
  }

  .workflow-editor-heading {
    margin: 4px 0 10px;
  }

  .workflow-editor-actions {
    justify-content: flex-end;
    margin-top: 14px;
  }

  .workflow-step-list {
    display: grid;
    gap: 8px;
  }

  .workflow-step-row {
    display: grid;
    grid-template-columns: 28px minmax(120px, 1fr) minmax(160px, 1.4fr) 120px 32px;
    gap: 8px;
    align-items: center;
  }

  .workflow-step-index {
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    color: var(--art-gray-500);
    text-align: center;
  }

  .knowledge-assistant-list {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  :deep(.el-timeline-item__content) > strong {
    margin-right: 8px;
  }

  :deep(.el-timeline-item__content) > p {
    margin: 5px 0 0;
    line-height: 1.6;
    color: var(--art-gray-500);
  }

  .version-title {
    display: grid;
    grid-template-columns: minmax(150px, auto) minmax(140px, 1fr) auto;
    gap: 12px;
    align-items: center;
    width: 100%;
    min-width: 0;
    padding-right: 12px;
  }

  .version-title span {
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--art-gray-500);
    white-space: nowrap;
  }

  .version-title time {
    font-size: 12px;
    color: var(--art-gray-500);
  }

  pre {
    max-width: 100%;
    margin: 0;
    overflow: auto;
    font:
      12px/1.6 Consolas,
      monospace;
    overflow-wrap: anywhere;
    white-space: pre-wrap;
  }

  @media (width <= 768px) {
    .resource-heading p {
      display: none;
    }

    .table-footer :deep(.el-pagination__sizes),
    .table-footer :deep(.el-pagination__jump) {
      display: none;
    }

    .version-title {
      grid-template-columns: 1fr;
      gap: 2px;
    }

    .version-title time {
      display: none;
    }

    .workflow-step-row {
      grid-template-columns: 24px minmax(0, 1fr) 32px;
    }

    .workflow-step-row .el-select,
    .workflow-step-row .el-input:nth-child(3) {
      grid-column: 2 / -1;
    }
  }
</style>
