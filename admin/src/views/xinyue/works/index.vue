<template>
  <div class="xinyue-page works-admin-page">
    <header class="page-title">
      <div><h1>作品审核</h1><p>审核用户发布版本、管理广场精选，并处理作品举报。</p></div>
      <ElButton :loading="loading" @click="load"
        ><ArtSvgIcon icon="ri:refresh-line" />刷新</ElButton
      >
    </header>

    <ElTabs v-model="tab" class="works-admin-tabs" @tab-change="handleTabChange">
      <ElTabPane label="作品管理" name="works">
        <ElCard shadow="never" class="works-table-card">
          <template #header>
            <div class="works-filter-bar">
              <ElSegmented v-model="status" :options="statusOptions" @change="loadWorks" />
              <ElInput
                v-model.trim="query"
                clearable
                placeholder="搜索标题或简介"
                @keyup.enter="loadWorks"
                ><template #prefix><ArtSvgIcon icon="ri:search-line" /></template
              ></ElInput>
              <ElButton @click="loadWorks">查询</ElButton>
            </div>
          </template>
          <ElTable v-loading="loading" :data="works" height="100%" row-key="id">
            <ElTableColumn label="作品" min-width="280">
              <template #default="{ row }">
                <div class="work-title-cell">
                  <ElImage
                    v-if="cover(row as AdminPublishedWork)"
                    :src="cover(row as AdminPublishedWork)!.contentUrl"
                    fit="cover"
                    :preview-src-list="previewList(row as AdminPublishedWork)"
                    preview-teleported
                  />
                  <span v-else class="work-cover-empty"><ArtSvgIcon icon="ri:image-line" /></span>
                  <div
                    ><strong>{{ row.currentVersion.title }}</strong
                    ><small
                      >v{{ row.currentVersion.versionNumber }} ·
                      {{ row.currentVersion.category || '未分类' }}</small
                    ></div
                  >
                </div>
              </template>
            </ElTableColumn>
            <ElTableColumn label="发布者" min-width="180"
              ><template #default="{ row }"
                ><strong>{{ row.user.displayName }}</strong
                ><small class="note">{{ row.user.email || row.user.id }}</small></template
              ></ElTableColumn
            >
            <ElTableColumn label="状态" width="110"
              ><template #default="{ row }"
                ><ElTag :type="statusType(row.currentVersion.moderationStatus)">{{
                  statusText(row.currentVersion.moderationStatus)
                }}</ElTag></template
              ></ElTableColumn
            >
            <ElTableColumn label="可见范围" width="110"
              ><template #default="{ row }">{{
                visibilityText(row.currentVersion.visibility)
              }}</template></ElTableColumn
            >
            <ElTableColumn label="数据" width="150"
              ><template #default="{ row }"
                ><span class="work-metrics"
                  ><span><ArtSvgIcon icon="ri:eye-line" />{{ row.viewCount }}</span
                  ><span><ArtSvgIcon icon="ri:heart-3-line" />{{ row.likeCount }}</span
                  ><span><ArtSvgIcon icon="ri:flag-line" />{{ row._count.reports }}</span></span
                ></template
              ></ElTableColumn
            >
            <ElTableColumn label="更新时间" width="170"
              ><template #default="{ row }">{{ date(row.updatedAt) }}</template></ElTableColumn
            >
            <ElTableColumn label="操作" width="260" fixed="right" align="right">
              <template #default="{ row }">
                <ElButton link type="primary" @click="openDetail(row as AdminPublishedWork)"
                  >查看</ElButton
                >
                <ElButton
                  v-if="row.currentVersion.moderationStatus === 'PENDING'"
                  link
                  type="success"
                  :disabled="saving"
                  @click="review(row as AdminPublishedWork, 'APPROVED')"
                  >通过</ElButton
                >
                <ElButton
                  v-if="row.currentVersion.moderationStatus === 'PENDING'"
                  link
                  type="danger"
                  :disabled="saving"
                  @click="review(row as AdminPublishedWork, 'REJECTED')"
                  >驳回</ElButton
                >
                <ElButton
                  v-if="row.publishedVersion"
                  link
                  :type="row.isFeatured ? 'warning' : 'primary'"
                  :disabled="saving"
                  @click="toggleFeatured(row as AdminPublishedWork)"
                  >{{ row.isFeatured ? '取消精选' : '设为精选' }}</ElButton
                >
                <ElButton
                  v-if="row.publishedVersion"
                  link
                  type="danger"
                  :disabled="saving"
                  @click="takeDown(row as AdminPublishedWork)"
                  >下架</ElButton
                >
              </template>
            </ElTableColumn>
          </ElTable>
        </ElCard>
      </ElTabPane>

      <ElTabPane :label="`举报处理 ${pendingReportCount}`" name="reports">
        <ElCard shadow="never" class="works-table-card">
          <template #header
            ><div class="works-filter-bar"
              ><ElSegmented
                v-model="reportStatus"
                :options="reportStatusOptions"
                @change="loadReports" /></div
          ></template>
          <ElTable v-loading="loading" :data="reports" height="100%" row-key="id">
            <ElTableColumn label="作品" min-width="220"
              ><template #default="{ row }"
                ><strong>{{ row.work.currentVersion?.title || row.work.id }}</strong
                ><small class="note">{{ row.work.id }}</small></template
              ></ElTableColumn
            >
            <ElTableColumn label="举报人" min-width="180"
              ><template #default="{ row }"
                ><strong>{{ row.reporter.displayName }}</strong
                ><small class="note">{{ row.reporter.email || row.reporter.id }}</small></template
              ></ElTableColumn
            >
            <ElTableColumn prop="reason" label="原因" width="130" />
            <ElTableColumn prop="details" label="补充说明" min-width="220" show-overflow-tooltip />
            <ElTableColumn label="状态" width="100"
              ><template #default="{ row }"
                ><ElTag
                  :type="
                    row.status === 'PENDING'
                      ? 'warning'
                      : row.status === 'RESOLVED'
                        ? 'success'
                        : 'info'
                  "
                  >{{ reportStatusText(row.status) }}</ElTag
                ></template
              ></ElTableColumn
            >
            <ElTableColumn label="提交时间" width="170"
              ><template #default="{ row }">{{ date(row.createdAt) }}</template></ElTableColumn
            >
            <ElTableColumn label="操作" width="170" fixed="right" align="right"
              ><template #default="{ row }"
                ><ElButton
                  v-if="row.status === 'PENDING'"
                  link
                  type="success"
                  :disabled="saving"
                  @click="resolveReport(row as AdminWorkReport, 'RESOLVED')"
                  >确认违规</ElButton
                ><ElButton
                  v-if="row.status === 'PENDING'"
                  link
                  type="primary"
                  :disabled="saving"
                  @click="resolveReport(row as AdminWorkReport, 'DISMISSED')"
                  >驳回举报</ElButton
                ></template
              ></ElTableColumn
            >
          </ElTable>
        </ElCard>
      </ElTabPane>
    </ElTabs>

    <ElDrawer v-model="detailVisible" title="作品版本详情" size="620px">
      <template v-if="detail">
        <div class="work-preview-grid"
          ><template v-for="asset in detail.currentVersion.assets" :key="asset.id"
            ><video
              v-if="asset.kind === 'VIDEO'"
              :src="asset.contentUrl"
              controls
              playsinline /><ElImage
              v-else
              :src="asset.contentUrl"
              fit="cover"
              :preview-src-list="previewList(detail)"
              preview-teleported /></template
        ></div>
        <ElDescriptions :column="1" border>
          <ElDescriptionsItem label="标题">{{ detail.currentVersion.title }}</ElDescriptionsItem>
          <ElDescriptionsItem label="简介">{{
            detail.currentVersion.description || '-'
          }}</ElDescriptionsItem>
          <ElDescriptionsItem label="分类 / 标签"
            >{{ detail.currentVersion.category || '-' }} ·
            {{ detail.currentVersion.tags.join('、') || '无标签' }}</ElDescriptionsItem
          >
          <ElDescriptionsItem label="公开提示词">
            <pre>{{ detail.currentVersion.publicPrompt || '未公开提示词' }}</pre>
          </ElDescriptionsItem>
          <ElDescriptionsItem v-if="detail.currentVersion.rejectionReason" label="审核说明">{{
            detail.currentVersion.rejectionReason
          }}</ElDescriptionsItem>
        </ElDescriptions>
      </template>
    </ElDrawer>
  </div>
</template>

<script setup lang="ts">
  import { computed, onMounted, ref } from 'vue'
  import { ElMessageBox } from 'element-plus'
  import {
    contentApi as xinyueApi,
    type AdminPublishedWork,
    type AdminWorkReport
  } from '@/api/xinyue/content'
  import { useXinyueAsync } from '@/hooks'
  import { formatDateTime } from '@/utils/xinyue/formatters'

  const tab = ref('works')
  const { loading, saving, withLoading, withSaving } = useXinyueAsync()
  const status = ref('')
  const query = ref('')
  const works = ref<AdminPublishedWork[]>([])
  const reports = ref<AdminWorkReport[]>([])
  const reportStatus = ref('PENDING')
  const detailVisible = ref(false)
  const detail = ref<AdminPublishedWork | null>(null)
  const statusOptions = [
    { label: '全部', value: '' },
    { label: '待审核', value: 'PENDING' },
    { label: '已发布', value: 'APPROVED' },
    { label: '已驳回', value: 'REJECTED' },
    { label: '草稿', value: 'DRAFT' }
  ]
  const reportStatusOptions = [
    { label: '待处理', value: 'PENDING' },
    { label: '已处理', value: 'RESOLVED' },
    { label: '已驳回', value: 'DISMISSED' },
    { label: '全部', value: '' }
  ]
  const pendingReportCount = computed(
    () => reports.value.filter((item) => item.status === 'PENDING').length
  )

  const date = (value?: string | null) => formatDateTime(value, '-')
  const statusText = (value: string) =>
    (
      ({
        DRAFT: '草稿',
        PENDING: '待审核',
        APPROVED: '已发布',
        REJECTED: '已驳回',
        TAKEN_DOWN: '已下架'
      }) as Record<string, string>
    )[value] || value
  const visibilityText = (value: string) =>
    (({ PRIVATE: '私密', UNLISTED: '仅链接', PUBLIC: '公开' }) as Record<string, string>)[value] ||
    value
  const reportStatusText = (value: string) =>
    (({ PENDING: '待处理', RESOLVED: '已处理', DISMISSED: '已驳回' }) as Record<string, string>)[
      value
    ] || value
  const statusType = (value: string) =>
    value === 'APPROVED'
      ? 'success'
      : value === 'PENDING'
        ? 'warning'
        : value === 'REJECTED' || value === 'TAKEN_DOWN'
          ? 'danger'
          : 'info'
  const cover = (row: AdminPublishedWork) => row.currentVersion.assets[0]
  const previewList = (row: AdminPublishedWork) =>
    row.currentVersion.assets.filter((item) => item.kind === 'IMAGE').map((item) => item.contentUrl)

  async function loadWorks() {
    await withLoading(async () => {
      works.value = await xinyueApi.works({
        ...(status.value ? { status: status.value } : {}),
        ...(query.value ? { q: query.value } : {})
      })
    })
  }
  async function loadReports() {
    await withLoading(async () => {
      reports.value = await xinyueApi.workReports(reportStatus.value || undefined)
    })
  }
  async function load() {
    if (tab.value === 'reports') await loadReports()
    else await loadWorks()
  }
  async function handleTabChange(value: string | number) {
    if (String(value) === 'reports') await loadReports()
    else await loadWorks()
  }
  function openDetail(row: AdminPublishedWork) {
    detail.value = row
    detailVisible.value = true
  }

  async function review(row: AdminPublishedWork, decision: 'APPROVED' | 'REJECTED') {
    let reason = ''
    if (decision === 'REJECTED') {
      const result = await ElMessageBox.prompt(
        '请输入明确的驳回原因，用户修改后可以再次提交。',
        '驳回作品',
        { inputValidator: (value) => value.trim().length >= 2 || '至少填写 2 个字' }
      )
      reason = result.value
    } else
      await ElMessageBox.confirm(
        `确认通过“${row.currentVersion.title}”并发布当前版本？`,
        '通过作品',
        { type: 'success' }
      )
    await withSaving(async () => {
      await xinyueApi.reviewWork(row.id, { status: decision, reason })
      await loadWorks()
    })
  }
  async function toggleFeatured(row: AdminPublishedWork) {
    await withSaving(async () => {
      await xinyueApi.featureWork(row.id, !row.isFeatured)
      await loadWorks()
    })
  }
  async function takeDown(row: AdminPublishedWork) {
    const result = await ElMessageBox.prompt(
      '请输入下架原因，该原因会保留在审核记录中。',
      '下架作品',
      { inputValidator: (value) => value.trim().length >= 2 || '至少填写 2 个字', type: 'warning' }
    )
    await withSaving(async () => {
      await xinyueApi.takeDownWork(row.id, result.value)
      await loadWorks()
    })
  }
  async function resolveReport(row: AdminWorkReport, decision: 'RESOLVED' | 'DISMISSED') {
    const result = await ElMessageBox.prompt(
      decision === 'RESOLVED'
        ? '填写违规处置说明。确认后可继续前往作品列表下架作品。'
        : '填写驳回举报的复核说明。',
      decision === 'RESOLVED' ? '确认违规' : '驳回举报',
      { inputValidator: (value) => value.trim().length >= 2 || '至少填写 2 个字' }
    )
    await withSaving(async () => {
      await xinyueApi.resolveWorkReport(row.id, { status: decision, resolution: result.value })
      await loadReports()
    })
  }
  onMounted(loadWorks)
</script>

<style scoped>
  .works-admin-page {
    min-width: 0;
  }
  .works-admin-tabs {
    min-height: 0;
  }
  .works-table-card {
    height: calc(100vh - 235px);
    min-height: 460px;
  }
  .works-filter-bar {
    align-items: center;
    display: flex;
    gap: 10px;
  }
  .works-filter-bar .el-input {
    margin-left: auto;
    width: min(320px, 40vw);
  }
  .work-title-cell {
    align-items: center;
    display: grid;
    gap: 11px;
    grid-template-columns: 58px minmax(0, 1fr);
  }
  .work-title-cell .el-image,
  .work-cover-empty {
    align-items: center;
    background: var(--el-fill-color-light);
    border: 1px solid var(--el-border-color-lighter);
    border-radius: 6px;
    display: flex;
    height: 44px;
    justify-content: center;
    overflow: hidden;
    width: 58px;
  }
  .work-title-cell div {
    min-width: 0;
  }
  .work-title-cell strong,
  .work-title-cell small,
  .note {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .work-title-cell small,
  .note {
    color: var(--el-text-color-secondary);
    font-size: 12px;
    margin-top: 3px;
  }
  .work-metrics {
    display: flex;
    gap: 10px;
  }
  .work-metrics > span {
    align-items: center;
    color: var(--el-text-color-secondary);
    display: inline-flex;
    font-size: 12px;
    gap: 3px;
  }
  .work-preview-grid {
    display: grid;
    gap: 8px;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    margin-bottom: 18px;
  }
  .work-preview-grid .el-image,
  .work-preview-grid video {
    aspect-ratio: 4/3;
    background: #111;
    border-radius: 7px;
    height: auto;
    object-fit: cover;
    width: 100%;
  }
  .el-descriptions pre {
    font: inherit;
    margin: 0;
    max-height: 180px;
    overflow: auto;
    white-space: pre-wrap;
  }
  @media (max-width: 760px) {
    .works-filter-bar {
      align-items: stretch;
      flex-direction: column;
    }
    .works-filter-bar .el-input {
      margin: 0;
      width: 100%;
    }
    .works-table-card {
      height: 560px;
    }
  }
</style>
