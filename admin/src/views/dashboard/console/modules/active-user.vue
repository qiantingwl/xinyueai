<template>
  <div class="art-card h-105 p-4 box-border mb-5 max-sm:mb-4">
    <ArtBarChart
      v-if="hasChartData"
      class="box-border p-2"
      barWidth="50%"
      height="13.7rem"
      :showAxisLine="false"
      :data="chartData"
      :xAxisData="xAxisLabels"
    />
    <div v-else class="chart-empty box-border p-2">
      <ArtSvgIcon icon="ri:bar-chart-2-line" style="font-size: 34px" />
      <p>{{ xt('暂无数据') }}</p>
    </div>
    <div class="ml-1">
      <h3 class="mt-5 text-lg font-medium">{{ xt('业务概述') }}</h3>
      <p class="mt-1 text-sm"
        >{{ xt('近 30 天新增用户') }}
        <span class="text-success font-medium">+{{ overview?.newUsers || 0 }}</span></p
      >
      <p class="mt-1 text-sm">{{ xt('用户、任务、内容资产和渠道健康情况') }}</p>
    </div>
    <div class="flex-b mt-2">
      <div class="flex-1" v-for="(item, index) in list" :key="index">
        <p class="text-2xl text-g-900">{{ item.num }}</p>
        <p class="text-xs text-g-500">{{ item.name }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  interface UserStatItem {
    name: string
    num: string
  }

  // 最近9个月
  import type { Overview } from '@/api/xinyue/dashboard'
  import { xinyueText as xt } from '@/locales/xinyue'
  const { overview } = defineProps<{ overview: Overview | null }>()

  const xAxisLabels = computed(
    () => overview?.trend.slice(-9).map((item) => item.date.slice(5)) || []
  )

  // 每日生成任务数（近 9 天）；新增用户几乎恒为 0，画任务量才有内容
  const chartData = computed(() => overview?.trend.slice(-9).map((item) => item.jobs) || [])

  const hasChartData = computed(() => chartData.value.some((value) => value > 0))

  /**
   * 用户统计数据列表
   * 包含总用户量、总访问量、日访问量和周同比等关键指标
   */
  const list = computed<UserStatItem[]>(() => [
    { name: xt('总用户'), num: String(overview?.users || 0) },
    { name: xt('总任务'), num: String(overview?.jobs || 0) },
    { name: xt('内容资产'), num: String(overview?.assets || 0) },
    { name: xt('健康渠道'), num: `${overview?.healthyProviders || 0}/${overview?.providers || 0}` }
  ])
</script>

<style scoped>
  .chart-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    height: 13.7rem;
    color: var(--xinyue-muted, var(--art-gray-600));
  }

  .chart-empty p {
    margin: 0;
    font-size: 13px;
  }
</style>
