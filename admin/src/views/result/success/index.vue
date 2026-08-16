<template>
  <ArtResultPage
    type="success"
    :title="xt('提交成功')"
    :message="
      xt(
        '提交结果页用于反馈一系列操作任务的处理结果，如果仅是简单操作，使用 Message 全局提示反馈即可。灰色区域可以显示一些补充的信息。'
      )
    "
    iconCode="ri:check-fill"
  >
    <template #content>
      <p>{{ xt('已提交申请，等待部门审核。') }}</p>
    </template>
    <template #buttons>
      <ElButton type="primary" v-ripple @click="goBack">{{ xt('返回上一页') }}</ElButton>
      <ElButton v-ripple @click="goHome">{{ xt('返回工作台') }}</ElButton>
      <ElButton v-ripple @click="printPage">{{ xt('打印') }}</ElButton>
    </template>
  </ArtResultPage>
</template>

<script setup lang="ts">
  import { useRouter } from 'vue-router'
  import { xinyueText as xt } from '@/locales/xinyue'

  defineOptions({ name: 'ResultSuccess' })

  const router = useRouter()
  const goBack = () => router.back()
  const goHome = () => router.push('/dashboard/console')
  const printPage = () => window.print()
</script>
