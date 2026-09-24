<template>
  <h2 id="settings-notifications">通知</h2><div class="settings-action-row"><span><strong>接收站内通知</strong><small>{{ unreadCount ? `${unreadCount} 条未读通知` : '当前没有未读通知' }}</small></span><button class="switch-control" :class="{ 'is-on': settings.notifications }" type="button" role="switch" :aria-checked="settings.notifications" @click="settings.notifications = !settings.notifications"><i /></button></div><section v-if="notifications.length" class="notification-list"><article v-for="notice in notifications" :key="notice.id" :class="{ 'is-unread': !notice.readAt }"><strong>{{ notice.title || '系统通知' }}</strong><p>{{ notice.body || '账户状态已更新' }}</p><time>{{ formatServerDate(notice.createdAt) }}</time></article></section><section v-else class="settings-simple-card"><h3>通知中心</h3><p>暂无通知</p></section><div class="settings-action-row"><span><strong>全部标记为已读</strong><small>清理当前账户的未读提醒状态。</small></span><button type="button" :disabled="!unreadCount" @click="markAllRead">标记已读</button></div>
</template>

<script setup lang="ts">
import { formatServerDate } from '../../format'
import type { NotificationItem, WorkspaceSettings } from '../../types'

defineProps<{
  settings: WorkspaceSettings
  notifications: NotificationItem[]
  unreadCount: number
  markAllRead: () => Promise<void>
}>()
</script>
