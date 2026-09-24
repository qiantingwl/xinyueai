<template>
  <ElDrawer
    :model-value="modelValue"
    :title="
      editingRow
        ? `${xt('编辑')}${xt(configTitle)}`
        : xt(editorConfig?.createLabel || `新增${configTitle}`)
    "
    size="620px"
    destroy-on-close
    @update:model-value="emit('update:modelValue', $event)"
  >
    <ElForm v-if="editorConfig" ref="formRef" :model="form" label-position="top" @submit.prevent>
      <ElRow :gutter="16">
        <ElCol v-for="field in fields" :key="field.key" :xs="24" :sm="field.span || 24">
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
              v-model="form[field.key]"
              :placeholder="field.placeholder ? xt(field.placeholder) : undefined"
              :maxlength="field.maxlength"
              show-word-limit
            />
            <ElInput
              v-else-if="field.type === 'textarea'"
              v-model="form[field.key]"
              type="textarea"
              :rows="field.rows || 4"
              :placeholder="field.placeholder ? xt(field.placeholder) : undefined"
              :maxlength="field.maxlength"
              show-word-limit
            />
            <ElInputNumber
              v-else-if="field.type === 'number'"
              v-model="form[field.key]"
              :min="field.min ?? 0"
              :max="field.max ?? 100000"
              controls-position="right"
              class="wide"
            />
            <ElSwitch v-else-if="field.type === 'switch'" v-model="form[field.key]" />
            <ElSelect
              v-else-if="field.type === 'select'"
              v-model="form[field.key]"
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
            <p
              v-if="
                field.help ||
                field.helpUrl ||
                (field.key === 'documentationUrl' &&
                  /^https?:\/\//.test(String(form[field.key] || '')))
              "
              class="field-help"
            >
              <span v-if="field.help">{{ xt(field.help) }}</span>
              <a v-if="field.helpUrl" :href="field.helpUrl.url" target="_blank" rel="noreferrer"
                >{{ xt(field.helpUrl.label) }}<ArtSvgIcon icon="ri:external-link-line"
              /></a>
              <a
                v-if="
                  field.key === 'documentationUrl' &&
                  /^https?:\/\//.test(String(form[field.key] || ''))
                "
                :href="String(form[field.key])"
                target="_blank"
                rel="noreferrer"
                >{{ xt('打开当前说明地址') }}<ArtSvgIcon icon="ri:external-link-line"
              /></a>
            </p>
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
                :on-change="(file) => emit('select-tool-icon', file)"
              >
                <ElButton><ArtSvgIcon icon="ri:upload-2-line" />{{ xt('上传图标') }}</ElButton>
              </ElUpload>
              <ElButton
                v-if="editingRow?.iconAssetId"
                type="danger"
                plain
                @click="emit('remove-tool-icon')"
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
                :on-change="(file) => emit('select-cover', file)"
                ><ElButton>{{ xt('选择新封面') }}</ElButton></ElUpload
              >
              <ElButton
                v-if="editingRow?.coverAssetId"
                type="danger"
                plain
                @click="emit('remove-cover')"
                >{{ xt('移除封面') }}</ElButton
              >
              <ElTag v-if="coverFile" type="success">{{ xt('已选择') }} {{ coverFile.name }}</ElTag>
            </div>
          </div>
          <div v-if="form.mode === 'VIDEO'">
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
                :on-change="(file) => emit('select-video', file)"
                ><ElButton>{{ xt('选择演示视频') }}</ElButton></ElUpload
              >
              <ElButton
                v-if="editingRow?.uploadedPreviewVideo?.assetId"
                type="danger"
                plain
                @click="emit('remove-video')"
                >{{ xt('移除演示视频') }}</ElButton
              >
              <ElTag v-if="previewVideoFile" type="success"
                >{{ xt('已选择') }} {{ previewVideoFile.name }}</ElTag
              >
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
                  @click="emit('remove-preview', image.assetId)"
                  ><ArtSvgIcon icon="ri:delete-bin-line"
                /></ElButton>
              </div>
            </div>
            <ElUpload
              multiple
              :auto-upload="false"
              :show-file-list="true"
              accept="image/*"
              :on-change="(file) => emit('select-preview', file)"
              :on-remove="(file) => emit('remove-selected-preview', file)"
              ><ElButton>{{ xt('选择预览图片') }}</ElButton></ElUpload
            >
          </div>
        </div>
      </template>
    </ElForm>
    <template #footer>
      <ElButton @click="emit('update:modelValue', false)">{{ xt('取消') }}</ElButton>
      <ElButton type="primary" :loading="saving" @click="submit">{{ xt('保存') }}</ElButton>
    </template>
  </ElDrawer>
</template>

<script setup lang="ts">
  import type { FormInstance, UploadFile } from 'element-plus'
  import { ref } from 'vue'
  import { xinyueText as xt } from '@/locales/xinyue'
  import type {
    ResourceEditorConfig,
    ResourceEditorField,
    ResourceRow as Row,
    ResourceSelectOption
  } from './resource-types'

  defineProps<{
    modelValue: boolean
    configTitle: string
    resourceKey: string
    editorConfig?: ResourceEditorConfig
    editingRow: Row | null
    fields: ResourceEditorField[]
    saving: boolean
    toolIconPreviewUrl: string
    toolIconFile: File | null
    coverFile: File | null
    previewVideoFile: File | null
    fieldOptions: (field: ResourceEditorField) => ResourceSelectOption[]
    adminMediaUrl: (value: unknown) => string
  }>()
  const form = defineModel<Row>('form', { required: true })
  const emit = defineEmits<{
    'update:modelValue': [value: boolean]
    save: []
    'select-tool-icon': [file: UploadFile]
    'remove-tool-icon': []
    'select-cover': [file: UploadFile]
    'remove-cover': []
    'select-video': [file: UploadFile]
    'remove-video': []
    'select-preview': [file: UploadFile]
    'remove-selected-preview': [file: UploadFile]
    'remove-preview': [assetId: string]
  }>()
  const formRef = ref<FormInstance>()
  async function submit() {
    if (await formRef.value?.validate().catch(() => false)) emit('save')
  }
</script>

<style scoped>
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
    border-radius: 8px;
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
    font-size: 13px;
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
  .field-help {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 10px;
    width: 100%;
    margin: 6px 0 0;
    font-size: 12px;
    line-height: 1.6;
    color: var(--art-gray-500);
  }
  .field-help a {
    display: inline-flex;
    gap: 3px;
    align-items: center;
    color: var(--el-color-primary);
    text-decoration: none;
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
</style>
