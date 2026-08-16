<template>
  <div
    v-show="visible"
    class="art-notification-panel art-card-sm !shadow-xl"
    :style="{ transform: show ? 'scaleY(1)' : 'scaleY(0.9)', opacity: show ? 1 : 0 }"
    @click.stop
  >
    <div class="flex-cb px-3.5 mt-3.5">
      <span class="text-base font-medium text-g-800">{{ $t('notice.title') }}</span>
      <ElButton link type="primary" size="small" :disabled="!unreadCount" @click="markAllRead">
        {{ $t('notice.btnRead') }}
      </ElButton>
    </div>

    <ul class="box-border flex items-end w-full h-12.5 px-3.5 border-b-d">
      <li
        v-for="(item, index) in barList"
        :key="item.key"
        class="h-12 leading-12 mr-5 overflow-hidden text-[13px] text-g-700 c-p select-none"
        :class="{ 'bar-active': barActiveIndex === index }"
        @click="barActiveIndex = index"
      >
        {{ item.name }} ({{ item.num }})
      </li>
    </ul>

    <div class="notification-content">
      <ul v-if="currentList.length" class="notification-list scrollbar-thin">
        <li
          v-for="item in currentList"
          :key="item.id"
          class="notification-item"
          :class="{ 'is-unread': !item.readAt }"
          @click="markRead(item)"
        >
          <div class="notification-icon" :class="getNoticeStyle(item.type).iconClass">
            <ArtSvgIcon class="text-lg !bg-transparent" :icon="getNoticeStyle(item.type).icon" />
          </div>
          <div class="notification-copy">
            <h4>{{ item.title || '系统通知' }}</h4>
            <p v-if="item.body">{{ item.body }}</p>
            <time>{{ formatTime(item.createdAt) }}</time>
          </div>
          <i v-if="!item.readAt" class="unread-dot" aria-label="未读" />
        </li>
      </ul>
      <div v-else class="notification-empty">
        <ArtSvgIcon icon="system-uicons:inbox" class="text-5xl" />
        <p>{{ $t('notice.text[0]') }}{{ barList[barActiveIndex].name }}</p>
      </div>
    </div>

    <div class="notification-footer">
      <ElButton class="w-full" @click="handleViewAll" v-ripple>
        {{ $t('notice.viewAll') }}
      </ElButton>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import { useI18n } from 'vue-i18n'
  import { useRouter } from 'vue-router'
  import request from '@/utils/http'

  defineOptions({ name: 'ArtNotification' })

  type NotificationType = 'SYSTEM' | 'JOB' | 'CREDIT' | 'INVITE' | 'SUPPORT'
  interface NotificationItem {
    id: string
    type: NotificationType
    title: string
    body: string
    readAt: string | null
    createdAt: string
  }
  interface NoticeStyle {
    icon: string
    iconClass: string
  }

  const props = defineProps<{ value: boolean }>()
  const emit = defineEmits<{
    'update:value': [value: boolean]
    updated: []
  }>()
  const { t } = useI18n()
  const router = useRouter()
  const show = ref(false)
  const visible = ref(false)
  const barActiveIndex = ref(0)
  const notifications = ref<NotificationItem[]>([])

  const noticeList = computed(() => notifications.value.filter((item) => item.type !== 'SUPPORT'))
  const msgList = computed(() => notifications.value.filter((item) => item.type === 'SUPPORT'))
  const pendingList = computed<NotificationItem[]>(() => [])
  const lists = [noticeList, msgList, pendingList]
  const currentList = computed(() => lists[barActiveIndex.value]?.value || [])
  const unreadCount = computed(() => notifications.value.filter((item) => !item.readAt).length)
  const barList = computed(() => [
    { key: 'notice', name: t('notice.bar[0]'), num: noticeList.value.length },
    { key: 'message', name: t('notice.bar[1]'), num: msgList.value.length },
    { key: 'pending', name: t('notice.bar[2]'), num: pendingList.value.length }
  ])

  const noticeStyleMap: Record<NotificationType, NoticeStyle> = {
    SYSTEM: { icon: 'ri:notification-3-line', iconClass: 'bg-theme/12 text-theme' },
    JOB: { icon: 'ri:task-line', iconClass: 'bg-info/12 text-info' },
    CREDIT: { icon: 'ri:coins-line', iconClass: 'bg-warning/12 text-warning' },
    INVITE: { icon: 'ri:user-add-line', iconClass: 'bg-success/12 text-success' },
    SUPPORT: { icon: 'ri:customer-service-2-line', iconClass: 'bg-danger/12 text-danger' }
  }
  const getNoticeStyle = (type: NotificationType) => noticeStyleMap[type] || noticeStyleMap.SYSTEM

  function formatTime(value: string) {
    const date = new Date(value)
    return Number.isNaN(date.getTime())
      ? value
      : new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
  }
  async function loadNotifications() {
    try {
      const result = await request.get<NotificationItem[]>({ url: '/v1/notifications' })
      notifications.value = Array.isArray(result) ? result : []
    } catch {
      notifications.value = []
    }
  }
  async function markRead(item: NotificationItem) {
    if (item.readAt) return
    await request.request({ url: `/v1/notifications/${item.id}/read`, method: 'PATCH' })
    item.readAt = new Date().toISOString()
    emit('updated')
  }
  async function markAllRead() {
    if (!unreadCount.value) return
    await request.post({ url: '/v1/notifications/read-all', params: {} })
    const now = new Date().toISOString()
    notifications.value = notifications.value.map((item) => ({
      ...item,
      readAt: item.readAt || now
    }))
    emit('updated')
  }
  function handleViewAll() {
    const target =
      barActiveIndex.value === 1
        ? '/enterprise/operations/support'
        : '/enterprise/operations/announcements'
    emit('update:value', false)
    void router.push(target)
  }
  function showNotice(open: boolean) {
    if (open) {
      visible.value = true
      void loadNotifications()
      window.setTimeout(() => {
        show.value = true
      }, 5)
      return
    }
    show.value = false
    window.setTimeout(() => {
      visible.value = false
    }, 300)
  }

  watch(() => props.value, showNotice)
</script>

<style scoped>
  @reference '@styles/core/tailwind.css';

  .art-notification-panel {
    @apply absolute top-14.5 right-5 w-90 h-125 overflow-hidden transition-all duration-300 origin-top will-change-[top,left] max-[640px]:top-[65px] max-[640px]:right-0 max-[640px]:w-full max-[640px]:h-[80vh];
  }

  .bar-active {
    color: var(--theme-color) !important;
    border-bottom: 2px solid var(--theme-color);
  }

  .notification-content {
    height: calc(100% - 95px);
    min-height: 0;
  }

  .notification-list {
    height: calc(100% - 58px);
    overflow-y: auto;
  }

  .notification-item {
    position: relative;
    display: flex;
    gap: 12px;
    align-items: flex-start;
    padding: 14px;
    cursor: pointer;
    border-bottom: 1px solid var(--art-card-border);
    transition: background-color 0.2s ease;
  }

  .notification-item:hover {
    background: var(--art-gray-100);
  }

  .notification-item.is-unread {
    background: color-mix(in srgb, var(--main-color) 4%, transparent);
  }

  .notification-icon {
    display: flex;
    flex: 0 0 36px;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: 8px;
  }

  .notification-copy {
    flex: 1;
    min-width: 0;
  }

  .notification-copy h4 {
    margin: 0;
    font-size: 13px;
    font-weight: 500;
    line-height: 1.45;
    color: var(--art-gray-900);
  }

  .notification-copy p {
    margin: 4px 0 0;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 12px;
    line-height: 1.5;
    color: var(--art-gray-600);
    white-space: nowrap;
  }

  .notification-copy time {
    display: block;
    margin-top: 5px;
    font-size: 11px;
    color: var(--art-gray-500);
  }

  .unread-dot {
    flex: 0 0 6px;
    width: 6px;
    height: 6px;
    margin-top: 7px;
    background: var(--el-color-danger);
    border-radius: 50%;
  }

  .notification-empty {
    display: grid;
    place-content: center;
    justify-items: center;
    height: 100%;
    color: var(--art-gray-500);
    text-align: center;
  }

  .notification-empty p {
    margin: 12px 0 0;
    font-size: 12px;
  }

  .notification-footer {
    position: relative;
    box-sizing: border-box;
    width: 100%;
    padding: 12px 14px 0;
  }

  .scrollbar-thin::-webkit-scrollbar {
    width: 5px !important;
  }

  .dark .scrollbar-thin::-webkit-scrollbar-track {
    background-color: var(--default-box-color);
  }

  .dark .scrollbar-thin::-webkit-scrollbar-thumb {
    background-color: #222 !important;
  }
</style>
