<template>
  <div class="page-content content-manager">
    <div class="page-heading">
      <div>
        <h1>{{ xt('关于我们') }}</h1>
        <p>{{ xt('管理产品介绍、服务条款、隐私说明和帮助内容') }}</p>
      </div>
      <ElButton type="primary" @click="toCreate" v-auth="'add'">
        <ArtSvgIcon icon="ri:add-line" />
        {{ xt('新增内容') }}
      </ElButton>
    </div>

    <div class="filter-bar">
      <ElInput
        v-model="query"
        :prefix-icon="Search"
        clearable
        :placeholder="xt('搜索标题、摘要或路径')"
        @keyup.enter="load(true)"
      />
      <ElSelect v-model="status" :placeholder="xt('发布状态')" clearable @change="load(true)">
        <ElOption :label="xt('已发布')" value="true" />
        <ElOption :label="xt('草稿')" value="false" />
      </ElSelect>
      <ElButton @click="load(true)">{{ xt('查询') }}</ElButton>
    </div>

    <div v-loading="loading" class="content-grid">
      <article v-for="item in rows" :key="item.id" class="content-card" @click="toDetail(item)">
        <div class="cover" :class="{ empty: !item.coverUrl }">
          <ElImage v-if="item.coverUrl" :src="item.coverUrl" fit="cover" lazy />
          <ArtSvgIcon v-else icon="ri:file-text-line" />
          <ElTag
            class="status"
            size="small"
            :type="item.published ? 'success' : 'info'"
            effect="dark"
          >
            {{ item.published ? xt('已发布') : xt('草稿') }}
          </ElTag>
        </div>
        <div class="card-body">
          <div class="category">{{ xt(item.category) }}</div>
          <h2>{{ item.title }}</h2>
          <p>{{ item.summary || xt('暂无摘要') }}</p>
          <div class="meta">
            <span><ArtSvgIcon icon="ri:eye-line" />{{ item.views }}</span>
            <span>{{ formatDate(item.updatedAt) }}</span>
          </div>
          <div class="actions" @click.stop>
            <ElButton text type="primary" @click="toEdit(item)">{{ xt('编辑') }}</ElButton>
            <ElButton text @click="togglePublish(item)">{{
              item.published ? xt('转为草稿') : xt('发布')
            }}</ElButton>
            <ElButton text type="danger" @click="remove(item)">{{ xt('删除') }}</ElButton>
          </div>
        </div>
      </article>
    </div>

    <ElEmpty v-if="!loading && rows.length === 0" :description="xt('暂无内容')" />
    <div v-if="total > pageSize" class="pagination">
      <ElPagination
        v-model:current-page="page"
        background
        layout="prev, pager, next, total"
        :page-size="pageSize"
        :total="total"
        @current-change="load()"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
  import { Search } from '@element-plus/icons-vue'
  import { ElMessageBox } from 'element-plus'
  import { useDateFormat } from '@vueuse/core'
  import { router } from '@/router'
  import { ContentPage, xinyueApi } from '@/api/xinyue'
  import { xinyueText as xt } from '@/locales/xinyue'

  defineOptions({ name: 'ArticleList' })

  const query = ref('')
  const status = ref('')
  const rows = ref<ContentPage[]>([])
  const loading = ref(false)
  const page = ref(1)
  const pageSize = 20
  const total = ref(0)

  const formatDate = (value: string) => useDateFormat(value, 'YYYY-MM-DD HH:mm').value

  async function load(reset = false) {
    if (reset) page.value = 1
    loading.value = true
    try {
      const result = await xinyueApi.contentPages({
        page: page.value,
        pageSize,
        q: query.value,
        published: status.value
      })
      rows.value = result.items
      total.value = result.total
    } finally {
      loading.value = false
    }
  }

  const toCreate = () => router.push({ name: 'ArticlePublish' })
  const toEdit = (item: ContentPage) =>
    router.push({ name: 'ArticlePublish', query: { id: item.id } })
  const toDetail = (item: ContentPage) =>
    router.push({ name: 'ArticleDetail', params: { id: item.id } })

  async function togglePublish(item: ContentPage) {
    await xinyueApi.saveContentPage({ published: !item.published }, item.id)
    await load()
  }

  async function remove(item: ContentPage) {
    await ElMessageBox.confirm(
      `${xt('确定删除')} "${item.title}"? ${xt('此操作不可恢复。')}`,
      xt('删除内容'),
      { type: 'warning' }
    )
    await xinyueApi.deleteContentPage(item.id)
    await load()
  }

  onMounted(() => load())
</script>

<style scoped lang="scss">
  .content-manager {
    min-height: calc(100vh - 130px);
  }

  .page-heading {
    display: flex;
    gap: 20px;
    align-items: flex-start;
    justify-content: space-between;
    margin-bottom: 24px;
  }

  .page-heading h1 {
    margin: 0;
    font-size: 24px;
    font-weight: 600;
    color: var(--art-gray-900);
  }

  .page-heading p {
    margin: 7px 0 0;
    font-size: 14px;
    color: var(--art-gray-600);
  }

  .filter-bar {
    display: grid;
    grid-template-columns: minmax(260px, 420px) 150px auto;
    gap: 12px;
    margin-bottom: 20px;
  }

  .content-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 18px;
    min-height: 160px;
  }

  .content-card {
    overflow: hidden;
    cursor: pointer;
    background: var(--art-main-bg-color);
    border: 1px solid var(--art-card-border);
    border-radius: 8px;
    transition:
      border-color 0.2s,
      box-shadow 0.2s,
      transform 0.2s;
  }

  .content-card:hover {
    border-color: var(--el-color-primary-light-5);
    box-shadow: 0 8px 24px rgb(0 0 0 / 7%);
    transform: translateY(-2px);
  }

  .cover {
    position: relative;
    aspect-ratio: 16 / 7;
    overflow: hidden;
    background: var(--art-gray-100);
  }

  .cover :deep(.el-image) {
    width: 100%;
    height: 100%;
  }

  .cover.empty {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--art-gray-400);
  }

  .cover.empty :deep(svg) {
    width: 42px;
    height: 42px;
  }

  .cover .status {
    position: absolute;
    top: 12px;
    right: 12px;
  }

  .card-body {
    padding: 17px 18px 14px;
  }

  .category {
    margin-bottom: 7px;
    font-size: 12px;
    color: var(--el-color-primary);
  }

  .card-body h2 {
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 17px;
    font-weight: 600;
    color: var(--art-gray-900);
    white-space: nowrap;
  }

  .card-body > p {
    display: -webkit-box;
    min-height: 42px;
    margin: 9px 0 13px;
    overflow: hidden;
    -webkit-line-clamp: 2;
    font-size: 13px;
    line-height: 21px;
    color: var(--art-gray-600);
    -webkit-box-orient: vertical;
  }

  .meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 12px;
    color: var(--art-gray-500);
  }

  .meta span:first-child {
    display: flex;
    gap: 5px;
    align-items: center;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    padding-top: 8px;
    margin-top: 12px;
    border-top: 1px solid var(--art-gray-200);
  }

  .pagination {
    display: flex;
    justify-content: center;
    margin-top: 24px;
  }

  @media (width <= 1100px) {
    .content-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (width <= 640px) {
    .page-heading {
      flex-direction: column;
      align-items: stretch;
    }

    .filter-bar {
      grid-template-columns: 1fr;
    }

    .content-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
