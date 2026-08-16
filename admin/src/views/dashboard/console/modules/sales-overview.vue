<template>
  <div class="art-card h-105 p-5 mb-5 max-sm:mb-4">
    <div class="art-card-header">
      <div class="title">
        <h4>{{ xt('近 14 天生成趋势') }}</h4>
        <p
          >{{ xt('今日任务') }}
          <span class="text-success">+{{ overview?.today.jobs || 0 }}</span></p
        >
      </div>
    </div>
    <ArtLineChart
      height="calc(100% - 56px)"
      :data="data"
      :xAxisData="xAxisData"
      :showAreaColor="true"
      :showAxisLine="false"
    />
  </div>
</template>

<script setup lang="ts">
  /**
   * 全年访问量数据
   * 记录每月的访问量统计
   */
  import type { Overview } from '@/api/xinyue'
  import { xinyueText as xt } from '@/locales/xinyue'
  const { overview } = defineProps<{ overview: Overview | null }>()
  const data = computed(() => overview?.trend.map((item) => item.jobs) || [])

  /**
   * X 轴月份标签
   */
  const xAxisData = computed(() => overview?.trend.map((item) => item.date.slice(5)) || [])
</script>
