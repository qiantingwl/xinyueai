<template>
  <div class="art-card new-user-card p-5 h-128 overflow-hidden mb-5 max-sm:mb-4">
    <div class="art-card-header">
      <div class="title">
        <h4>{{ xt('新用户') }}</h4>
        <p
          >{{ xt('最近注册') }} <span class="text-success">+{{ users.length }}</span></p
        >
      </div>
      <ElTag effect="plain">{{ xt('最近') }} {{ tableData.length }} {{ xt('人') }}</ElTag>
    </div>
    <ElTable
      class="new-user-table"
      :data="tableData"
      size="large"
      :border="false"
      :stripe="false"
      :header-cell-style="{ background: 'transparent' }"
    >
      <ElTableColumn :label="xt('用户')" min-width="180">
        <template #default="scope">
          <strong class="user-name">{{ scope.row.username }}</strong>
        </template>
      </ElTableColumn>
      <ElTableColumn :label="xt('邮箱')" prop="email" min-width="190" show-overflow-tooltip />
      <ElTableColumn :label="xt('分组')" prop="group" min-width="130" show-overflow-tooltip />
      <ElTableColumn :label="xt('额度')" width="200">
        <template #default="scope">
          <ElProgress
            :percentage="scope.row.percentage"
            :color="scope.row.color"
            :stroke-width="4"
            :aria-label="`${scope.row.username} ${xt('额度比例')}: ${scope.row.percentage}%`"
          />
        </template>
      </ElTableColumn>
    </ElTable>
  </div>
</template>

<script setup lang="ts">
  import type { AdminUser } from '@/api/xinyue'
  import { xinyueText as xt } from '@/locales/xinyue'

  interface UserTableItem {
    username: string
    email: string
    group: string
    percentage: number
    color: string
  }

  const { users } = defineProps<{ users: AdminUser[] }>()
  const tableData = computed<UserTableItem[]>(() => {
    const maximum = Math.max(1, ...users.map((user) => user.creditAccount?.balance || 0))
    return users.slice(0, 6).map((user) => ({
      username: user.displayName || user.email || xt('未命名用户'),
      email: user.email || xt('未绑定邮箱'),
      group: user.groupMemberships.map((item) => item.group.name).join('、') || xt('默认分组'),
      percentage: Math.max(2, Math.round(((user.creditAccount?.balance || 0) / maximum) * 100)),
      color: 'var(--art-primary)'
    }))
  })
</script>

<style scoped>
  .new-user-card {
    min-width: 0;
    overflow: hidden;
  }

  .new-user-table {
    width: 100%;
    margin-top: 10px;
    overflow: hidden;
  }

  .new-user-table :deep(.el-table__inner-wrapper),
  .new-user-table :deep(.el-table__body-wrapper) {
    overflow-x: hidden !important;
  }

  .new-user-table :deep(.el-scrollbar__bar.is-horizontal) {
    display: none !important;
  }

  .user-name {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
