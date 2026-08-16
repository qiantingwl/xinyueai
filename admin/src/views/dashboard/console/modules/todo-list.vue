<template>
  <div class="art-card h-128 p-5 mb-5 max-sm:mb-4">
    <div class="art-card-header">
      <div class="title"
        ><h4>{{ xt('待办事项') }}</h4
        ><p
          >{{ xt('待处理') }} <span class="text-danger">{{ pendingCount }}</span></p
        ></div
      >
    </div>
    <div class="h-[calc(100%-40px)] overflow-auto">
      <ElScrollbar>
        <div
          v-for="item in list"
          :key="item.username"
          class="flex-cb h-17.5 border-b border-g-300 text-sm last:border-b-0"
        >
          <div
            ><p class="text-sm">{{ item.username }}</p
            ><p class="text-g-500 mt-1">{{ item.date }}</p></div
          >
          <ElTag :type="item.count ? 'danger' : 'success'" effect="light">{{ item.count }}</ElTag>
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
      username: xt('支付失败'),
      date: xt('检查订单与回调'),
      count: overview?.alerts.paymentFailures || 0
    },
    {
      username: xt('异常渠道'),
      date: xt('检查模型与支付渠道'),
      count: overview?.alerts.unhealthyChannels || 0
    },
    {
      username: xt('内容审核'),
      date: xt('处理待审核内容'),
      count: overview?.alerts.moderationOpen || 0
    },
    {
      username: xt('客服工单'),
      date: `${xt('其中紧急')} ${overview?.alerts.supportUrgent || 0} ${xt('个')}`,
      count: overview?.alerts.supportOpen || 0
    },
    { username: xt('待支付订单'), date: xt('跟进订阅与充值'), count: overview?.pendingOrders || 0 },
    {
      username: xt('失败生成任务'),
      date: xt('可在生成任务中重试'),
      count: overview?.failedJobs || 0
    }
  ])
  const pendingCount = computed(() => list.value.reduce((total, item) => total + item.count, 0))
</script>
