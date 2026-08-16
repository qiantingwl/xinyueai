<template>
  <div class="art-card p-5 flex-b mb-5 max-sm:mb-4">
    <div>
      <h2 class="text-2xl font-medium">{{ xt('Xinyue AI 企业控制台') }}</h2>
      <p class="text-g-700 mt-1">{{ xt('统一管理客户、AI 渠道、模型定价、支付订阅与运营安全') }}</p>
      <p class="text-g-700 mt-1">{{
        xt('当前控制台基于 Art Design Pro，业务数据由 Xinyue API 实时提供')
      }}</p>

      <div class="flex flex-wrap gap-3.5 max-w-150 mt-9">
        <div
          class="w-60 flex-cb h-12.5 px-3.5 border border-g-300 c-p rounded-lg text-sm bg-g-100 duration-300 hover:-translate-y-1 max-sm:w-full"
          v-for="link in linkList"
          :key="link.label"
          @click="goPage(link.route)"
        >
          <span class="text-g-700">{{ link.label }}</span>
          <ArtSvgIcon icon="ri:arrow-right-s-line" class="text-lg text-g-600" />
        </div>
      </div>
    </div>
    <img class="w-75 max-md:!hidden" src="@imgs/draw/draw1.png" alt="draw1" />
  </div>
</template>

<script setup lang="ts">
  import { useRouter } from 'vue-router'
  import { xinyueText as xt } from '@/locales/xinyue'

  const router = useRouter()

  const linkList = [
    { label: xt('客户与用户分组'), route: '/enterprise/customers/users' },
    { label: xt('AI 渠道与模型'), route: '/enterprise/ai/providers' },
    { label: xt('订阅、充值与支付'), route: '/enterprise/commerce/subscriptions' },
    { label: xt('内容审核与告警'), route: '/enterprise/operations/moderation' }
  ]

  /**
   * 在新标签页中打开指定 URL
   * @param url 要打开的网页地址
   */
  const goPage = (route: string): void => {
    router.push(route)
  }
</script>
