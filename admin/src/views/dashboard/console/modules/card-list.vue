<template>
  <ElRow :gutter="20" class="flex">
    <ElCol v-for="(item, index) in dataList" :key="index" :sm="12" :md="6" :lg="6">
      <div class="art-card relative flex flex-col justify-center h-35 px-5 mb-5 max-sm:mb-4">
        <span class="text-g-700 text-sm">{{ item.des }}</span>
        <ArtCountTo class="text-[26px] font-medium mt-2" :target="item.num" :duration="1300" />
        <div class="flex-c mt-1">
          <span class="text-xs text-g-600">{{ item.changeLabel }}</span>
          <span
            class="ml-1 text-xs font-semibold"
            :class="[item.change.indexOf('+') === -1 ? 'text-danger' : 'text-success']"
          >
            {{ item.change }}
          </span>
        </div>
        <div
          class="absolute top-0 bottom-0 right-5 m-auto size-12.5 rounded-xl flex-cc bg-theme/10"
        >
          <ArtSvgIcon :icon="item.icon" class="text-xl text-theme" />
        </div>
      </div>
    </ElCol>
  </ElRow>
</template>

<script setup lang="ts">
  interface CardDataItem {
    des: string
    icon: string
    startVal: number
    duration: number
    num: number
    change: string
    changeLabel: string
  }

  /**
   * 卡片统计数据列表
   * 展示总访问次数、在线访客数、点击量和新用户等核心数据指标
   */
  import type { Overview } from '@/api/xinyue/dashboard'
  import { xinyueText as xt } from '@/locales/xinyue'

  const props = defineProps<{ overview: Overview | null }>()

  const dataList = computed<CardDataItem[]>(() => [
    {
      des: xt('用户总数'),
      icon: 'ri:pie-chart-line',
      startVal: 0,
      duration: 1000,
      num: props.overview?.users || 0,
      change: `+${props.overview?.newUsers || 0}`,
      changeLabel: xt('近 30 天新增')
    },
    {
      des: xt('活跃用户'),
      icon: 'ri:group-line',
      startVal: 0,
      duration: 1000,
      num: props.overview?.activeUsers || 0,
      change: `+${props.overview?.today.newUsers || 0}`,
      changeLabel: xt('今日新增')
    },
    {
      des: xt('生成任务'),
      icon: 'ri:fire-line',
      startVal: 0,
      duration: 1000,
      num: props.overview?.jobs || 0,
      change: `+${props.overview?.today.jobs || 0}`,
      changeLabel: xt('今日新增')
    },
    {
      des: xt('有效订阅'),
      icon: 'ri:progress-2-line',
      startVal: 0,
      duration: 1000,
      num: props.overview?.activeSubscriptions || 0,
      change: `+${props.overview?.pendingOrders || 0}`,
      changeLabel: xt('待处理订单')
    }
  ])
</script>
