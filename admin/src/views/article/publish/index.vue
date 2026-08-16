<template>
  <div class="page-content editor-page">
    <div class="editor-heading">
      <div>
        <ElButton text @click="router.back()"
          ><ArtSvgIcon icon="ri:arrow-left-line" />{{ xt('返回') }}</ElButton
        >
        <h1>{{ isEdit ? xt('编辑内容') : xt('新增内容') }}</h1>
        <p>{{ xt('内容发布后可通过公开内容接口提供给用户端页面') }}</p>
      </div>
      <div class="heading-actions">
        <ElButton @click="save(false)" :loading="saving">{{ xt('保存草稿') }}</ElButton>
        <ElButton type="primary" @click="save(true)" :loading="saving">{{ xt('发布') }}</ElButton>
      </div>
    </div>

    <div v-loading="loading" class="editor-layout">
      <main>
        <section class="form-section">
          <label>{{ xt('内容标题') }}</label>
          <ElInput
            v-model.trim="form.title"
            maxlength="160"
            show-word-limit
            :placeholder="xt('例如：关于 Xinyue AI')"
          />
        </section>
        <section class="form-section editor-section">
          <label>{{ xt('正文内容') }}</label>
          <ArtWangEditor v-model="form.contentHtml" />
        </section>
      </main>

      <aside>
        <section class="settings-panel">
          <h2>{{ xt('发布设置') }}</h2>
          <ElForm label-position="top">
            <ElFormItem :label="xt('内容路径')">
              <ElInput v-model.trim="form.slug" maxlength="120">
                <template #prepend>/</template>
              </ElInput>
              <div class="field-help">{{ xt('仅支持小写字母、数字和连字符') }}</div>
            </ElFormItem>
            <ElFormItem :label="xt('内容分类')">
              <ElSelect v-model="form.category" filterable allow-create default-first-option>
                <ElOption v-for="item in categories" :key="item" :label="xt(item)" :value="item" />
              </ElSelect>
            </ElFormItem>
            <ElFormItem :label="xt('内容摘要')">
              <ElInput
                v-model="form.summary"
                type="textarea"
                :rows="4"
                maxlength="1000"
                show-word-limit
              />
            </ElFormItem>
            <ElFormItem :label="xt('封面图片 URL')">
              <ElInput
                v-model.trim="form.coverUrl"
                :placeholder="xt('可选，支持 HTTPS 图片地址')"
              />
              <ElImage v-if="form.coverUrl" class="cover-preview" :src="form.coverUrl" fit="cover">
                <template #error
                  ><div class="image-error">{{ xt('图片无法加载') }}</div></template
                >
              </ElImage>
            </ElFormItem>
            <ElFormItem :label="xt('排序权重')">
              <ElInputNumber
                v-model="form.sortOrder"
                :min="-10000"
                :max="10000"
                controls-position="right"
              />
            </ElFormItem>
            <ElFormItem :label="xt('当前状态')">
              <ElTag :type="form.published ? 'success' : 'info'">{{
                form.published ? xt('已发布') : xt('草稿')
              }}</ElTag>
            </ElFormItem>
          </ElForm>
        </section>
      </aside>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { xinyueApi } from '@/api/xinyue'
  import { router } from '@/router'
  import { xinyueText as xt } from '@/locales/xinyue'

  defineOptions({ name: 'ArticlePublish' })
  const route = useRoute()
  const id = computed(() => String(route.query.id || ''))
  const isEdit = computed(() => Boolean(id.value))
  const loading = ref(false)
  const saving = ref(false)
  const categories = ['关于我们', '服务条款', '隐私说明', '使用帮助', '品牌资料']
  const form = reactive({
    title: '',
    slug: `content-${Date.now()}`,
    category: '关于我们',
    summary: '',
    contentHtml: '',
    coverUrl: '',
    published: false,
    sortOrder: 0
  })

  function validate() {
    if (!form.title) return (ElMessage.warning(xt('请输入内容标题')), false)
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(form.slug))
      return (ElMessage.warning(xt('内容路径格式不正确')), false)
    if (!form.contentHtml || form.contentHtml === '<p><br></p>')
      return (ElMessage.warning(xt('请输入正文内容')), false)
    return true
  }

  async function load() {
    if (!isEdit.value) return
    loading.value = true
    try {
      const item = await xinyueApi.contentPage(id.value)
      Object.assign(form, {
        title: item.title,
        slug: item.slug,
        category: item.category,
        summary: item.summary,
        contentHtml: item.contentHtml,
        coverUrl: item.coverUrl,
        published: item.published,
        sortOrder: item.sortOrder
      })
    } finally {
      loading.value = false
    }
  }

  async function save(published: boolean) {
    if (!validate()) return
    saving.value = true
    try {
      await xinyueApi.saveContentPage({ ...form, published }, id.value || undefined)
      ElMessage.success(published ? xt('内容已发布') : xt('草稿已保存'))
      router.push({ name: 'ArticleList' })
    } finally {
      saving.value = false
    }
  }

  onMounted(load)
</script>

<style scoped lang="scss">
  .editor-page {
    min-height: calc(100vh - 130px);
  }

  .editor-heading {
    display: flex;
    gap: 20px;
    align-items: flex-end;
    justify-content: space-between;
    padding-bottom: 22px;
    margin-bottom: 22px;
    border-bottom: 1px solid var(--art-gray-200);
  }

  .editor-heading h1 {
    margin: 12px 0 5px;
    font-size: 24px;
    font-weight: 600;
    color: var(--art-gray-900);
  }

  .editor-heading p {
    margin: 0;
    font-size: 13px;
    color: var(--art-gray-600);
  }

  .heading-actions {
    display: flex;
    gap: 10px;
  }

  .editor-layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 320px;
    gap: 20px;
  }

  main,
  .settings-panel {
    min-width: 0;
  }

  .form-section,
  .settings-panel {
    padding: 20px;
    background: var(--art-main-bg-color);
    border: 1px solid var(--art-card-border);
    border-radius: 8px;
  }

  .form-section + .form-section {
    margin-top: 16px;
  }

  .form-section > label {
    display: block;
    margin-bottom: 10px;
    font-size: 14px;
    font-weight: 600;
    color: var(--art-gray-800);
  }

  .editor-section :deep(.w-e-text-container) {
    min-height: 480px;
  }

  .settings-panel h2 {
    margin: 0 0 20px;
    font-size: 16px;
    font-weight: 600;
    color: var(--art-gray-900);
  }

  .settings-panel :deep(.el-select),
  .settings-panel :deep(.el-input-number) {
    width: 100%;
  }

  .field-help {
    margin-top: 6px;
    font-size: 12px;
    color: var(--art-gray-500);
  }

  .cover-preview {
    width: 100%;
    aspect-ratio: 16 / 8;
    margin-top: 10px;
    border-radius: 6px;
  }

  .image-error {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    font-size: 12px;
    color: var(--art-gray-500);
    background: var(--art-gray-100);
  }

  @media (width <= 900px) {
    .editor-heading {
      flex-direction: column;
      align-items: stretch;
    }

    .editor-layout {
      grid-template-columns: 1fr;
    }

    .heading-actions .el-button {
      flex: 1;
    }
  }
</style>
