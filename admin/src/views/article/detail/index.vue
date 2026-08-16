<template>
  <div v-loading="loading" class="article-detail page-content">
    <div v-if="page" class="detail-shell">
      <div class="detail-topbar">
        <ElButton text @click="router.back()"
          ><ArtSvgIcon icon="ri:arrow-left-line" />{{ xt('返回') }}</ElButton
        >
        <ElButton type="primary" @click="edit"
          ><ArtSvgIcon icon="ri:edit-line" />{{ xt('编辑内容') }}</ElButton
        >
      </div>
      <header>
        <ElTag :type="page.published ? 'success' : 'info'">{{
          page.published ? xt('已发布') : xt('草稿')
        }}</ElTag>
        <span>{{ xt(page.category) }}</span>
        <h1>{{ page.title }}</h1>
        <p v-if="page.summary">{{ page.summary }}</p>
        <div class="metadata">
          <span>{{ xt('路径') }} /{{ page.slug }}</span>
          <span>{{ xt('浏览') }} {{ page.views }}</span>
          <span>{{ xt('更新于') }} {{ formatDate(page.updatedAt) }}</span>
        </div>
      </header>
      <ElImage v-if="page.coverUrl" class="hero-image" :src="page.coverUrl" fit="cover" />
      <div class="markdown-body content" v-html="page.contentHtml"></div>
    </div>
    <ElResult
      v-else-if="!loading"
      icon="warning"
      :title="xt('内容加载失败')"
      :sub-title="xt('该内容可能已被删除')"
    >
      <template #extra
        ><ElButton @click="router.back()">{{ xt('返回列表') }}</ElButton></template
      >
    </ElResult>
    <ArtBackToTop />
  </div>
</template>

<script setup lang="ts">
  import '@/assets/styles/core/md.scss'
  import { useDateFormat } from '@vueuse/core'
  import { ContentPage, xinyueApi } from '@/api/xinyue'
  import { router } from '@/router'
  import { xinyueText as xt } from '@/locales/xinyue'

  defineOptions({ name: 'ArticleDetail' })
  const route = useRoute()
  const page = ref<ContentPage | null>(null)
  const loading = ref(false)
  const formatDate = (value: string) => useDateFormat(value, 'YYYY-MM-DD HH:mm').value

  async function load() {
    loading.value = true
    try {
      page.value = await xinyueApi.contentPage(String(route.params.id))
    } finally {
      loading.value = false
    }
  }
  const edit = () =>
    page.value && router.push({ name: 'ArticlePublish', query: { id: page.value.id } })
  onMounted(load)
</script>

<style scoped lang="scss">
  .article-detail {
    min-height: calc(100vh - 130px);
  }

  .detail-shell {
    width: min(860px, 100%);
    margin: 0 auto;
  }

  .detail-topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 36px;
  }

  header {
    padding-bottom: 28px;
    border-bottom: 1px solid var(--art-gray-200);
  }

  header > span {
    margin-left: 10px;
    font-size: 13px;
    color: var(--art-gray-600);
  }

  h1 {
    margin: 18px 0 10px;
    font-size: 32px;
    font-weight: 650;
    line-height: 1.3;
    color: var(--art-gray-900);
  }

  header > p {
    margin: 0;
    font-size: 15px;
    line-height: 1.7;
    color: var(--art-gray-600);
  }

  .metadata {
    display: flex;
    flex-wrap: wrap;
    gap: 18px;
    margin-top: 18px;
    font-size: 12px;
    color: var(--art-gray-500);
  }

  .hero-image {
    width: 100%;
    aspect-ratio: 16 / 7;
    margin-top: 28px;
    border-radius: 8px;
  }

  .content {
    margin-top: 34px;
    color: var(--art-gray-800);
  }
</style>
