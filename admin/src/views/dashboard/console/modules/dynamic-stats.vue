<template>
  <div class="art-card h-128 p-5 mb-5 max-sm:mb-4">
    <div class="art-card-header">
      <div class="title"
        ><h4>{{ xt('动态') }}</h4
        ><p
          >{{ xt('待处理') }} <span class="text-danger">{{ pendingCount }}</span></p
        ></div
      >
    </div>
    <div class="h-9/10 mt-2 overflow-hidden">
      <ElScrollbar>
        <div
          v-for="item in list"
          :key="item.type"
          class="h-17.5 leading-17.5 border-b border-g-300 text-sm overflow-hidden last:border-b-0"
        >
          <span class="text-g-800 font-medium">{{ item.username }}</span>
          <span class="mx-2 text-g-600">{{ item.type }}</span>
          <span class="text-theme">{{ item.target }}</span>
        </div>
      </ElScrollbar>
    </div>
  </div>
</template>

<script setup lang="ts">
  import type { Overview } from '@/api/xinyue'
  import { xinyueText as xt } from '@/locales/xinyue'
  const { overview } = defineProps<{ overview: Overview | null }>()
  const list = computed(() => [
    {
      username: xt('今日'),
      type: xt('新增用户'),
      target: `${overview?.today.newUsers || 0} ${xt('人')}`
    },
    {
      username: xt('今日'),
      type: xt('生成任务'),
      target: `${overview?.today.jobs || 0} ${xt('个')}`
    },
    {
      username: xt('近 30 天'),
      type: xt('商业收入'),
      target: `¥${((overview?.revenueCents || 0) / 100).toFixed(2)}`
    },
    {
      username: xt('当前'),
      type: xt('活跃订阅'),
      target: `${overview?.activeSubscriptions || 0} ${xt('个')}`
    },
    {
      username: xt('当前'),
      type: xt('健康渠道'),
      target: `${overview?.healthyProviders || 0}/${overview?.providers || 0}`
    },
    { username: xt('当前'), type: xt('内容资产'), target: `${overview?.assets || 0} ${xt('个')}` }
  ])
  const pendingCount = computed(
    () =>
      (overview?.alerts.paymentFailures || 0) +
      (overview?.alerts.moderationOpen || 0) +
      (overview?.alerts.supportOpen || 0)
  )
</script>
