<!-- 工作台页面 -->
<template>
  <div v-loading="loading">
    <CardList :overview="overview" />

    <ElRow :gutter="20">
      <ElCol :sm="24" :md="12" :lg="10">
        <ActiveUser :overview="overview" />
      </ElCol>
      <ElCol :sm="24" :md="12" :lg="14">
        <SalesOverview :overview="overview" />
      </ElCol>
    </ElRow>

    <ElRow :gutter="20">
      <ElCol :sm="24" :md="24" :lg="12">
        <NewUser :users="users" />
      </ElCol>
      <ElCol :sm="24" :md="12" :lg="6">
        <Dynamic :overview="overview" />
      </ElCol>
      <ElCol :sm="24" :md="12" :lg="6">
        <TodoList :overview="overview" />
      </ElCol>
    </ElRow>

    <AboutProject />
  </div>
</template>

<script setup lang="ts">
  import CardList from './modules/card-list.vue'
  import ActiveUser from './modules/active-user.vue'
  import SalesOverview from './modules/sales-overview.vue'
  import NewUser from './modules/new-user.vue'
  import Dynamic from './modules/dynamic-stats.vue'
  import TodoList from './modules/todo-list.vue'
  import AboutProject from './modules/about-project.vue'
  import { dashboardApi, type Overview } from '@/api/xinyue/dashboard'
  import { customerApi, type AdminUser } from '@/api/xinyue/customers'
  import { useXinyueAsync } from '@/hooks'

  defineOptions({ name: 'Console' })

  const overview = ref<Overview | null>(null)
  const users = ref<AdminUser[]>([])
  const { loading, withLoading } = useXinyueAsync()

  async function load() {
    await withLoading(async () => {
      ;[overview.value, users.value] = await Promise.all([
        dashboardApi.overview(),
        customerApi.users()
      ])
    })
  }

  onMounted(load)
</script>
