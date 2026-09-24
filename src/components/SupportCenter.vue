<template>
  <section class="support-center">
    <header class="support-heading">
      <div>
        <h2 id="settings-support">帮助与客服</h2>
        <p>提交问题并跟踪客服处理进度</p>
      </div>
      <button v-if="view === 'list'" type="button" @click="startCreate"><Plus :size="15" />新建工单</button>
      <button v-else type="button" @click="backToList"><ArrowLeft :size="15" />返回</button>
    </header>

    <p v-if="error" class="support-error"><CircleAlert :size="15" />{{ error }}</p>
    <div v-if="loading" class="support-loading"><LoaderCircle class="support-spin" :size="18" />正在加载</div>

    <template v-else-if="view === 'list'">
      <div class="support-summary">
        <span><strong>{{ activeCount }}</strong>处理中</span>
        <span><strong>{{ unreadCount }}</strong>待查看</span>
        <span><strong>{{ tickets.length }}</strong>全部工单</span>
      </div>
      <div v-if="tickets.length" class="support-ticket-list">
        <button v-for="ticket in tickets" :key="ticket.id" type="button" :class="{ unread: ticket.hasUnread }" @click="openTicket(ticket.id)">
          <i />
          <span>
            <strong>{{ ticket.subject }}</strong>
            <small>{{ ticket.category }} · {{ statusText[ticket.status] }}</small>
            <p>{{ ticket.messages?.[0]?.body || '暂无消息' }}</p>
          </span>
          <time>{{ formatDate(ticket.updatedAt) }}</time>
          <ChevronRight :size="16" />
        </button>
      </div>
      <EmptyState v-else class="support-empty" :icon="LifeBuoy" title="暂无工单" description="遇到账号、支付或创作问题时，可以在这里联系人工客服。">
        <button type="button" @click="startCreate">创建第一个工单</button>
      </EmptyState>
    </template>

    <form v-else-if="view === 'create'" class="support-form" @submit.prevent="createTicket">
      <label>问题类型<select v-model="createForm.category"><option v-for="category in categories" :key="category">{{ category }}</option></select></label>
      <label>标题<input v-model.trim="createForm.subject" minlength="3" maxlength="120" placeholder="简要描述遇到的问题" required /></label>
      <label>详细说明<textarea v-model.trim="createForm.body" minlength="3" maxlength="10000" rows="8" placeholder="请写明复现步骤、订单号或报错信息" required /></label>
      <SupportAttachments v-model="createForm.attachments" :busy="uploading" @pick="pickFiles(createFileInput)" @remove="removeUploaded" />
      <input ref="createFileInput" class="support-file-input" type="file" multiple @change="uploadFiles($event, createForm.attachments)" />
      <footer><button type="button" @click="backToList">取消</button><button class="primary" :disabled="saving || uploading"><LoaderCircle v-if="saving" class="support-spin" :size="15" />提交工单</button></footer>
    </form>

    <template v-else-if="ticket">
      <header class="support-ticket-header">
        <div><span>{{ ticket.category }}</span><h3>{{ ticket.subject }}</h3><small>工单 {{ ticket.id.slice(-8) }} · {{ formatDate(ticket.createdAt) }}</small></div>
        <span class="support-status" :class="ticket.status.toLowerCase()">{{ statusText[ticket.status] }}</span>
      </header>
      <div class="support-messages">
        <article v-for="message in ticket.messages" :key="message.id" :class="{ mine: message.authorType === 'USER' }">
          <header><strong>{{ message.authorType === 'USER' ? '我' : 'Xinyue AI 客服' }}</strong><time>{{ formatDateTime(message.createdAt) }}</time></header>
          <p>{{ message.body }}</p>
          <div v-if="message.attachments?.length" class="support-message-files"><a v-for="file in message.attachments" :key="file.id" :href="apiUrl(file.contentUrl)" target="_blank" rel="noopener noreferrer"><Paperclip :size="13" />{{ file.name }}</a></div>
        </article>
      </div>
      <form v-if="ticket.status !== 'CLOSED'" class="support-reply" @submit.prevent="reply">
        <textarea v-model.trim="replyBody" maxlength="10000" rows="3" placeholder="补充问题或回复客服" required />
        <SupportAttachments v-model="replyAttachments" compact :busy="uploading" @pick="pickFiles(replyFileInput)" @remove="removeUploaded" />
        <input ref="replyFileInput" class="support-file-input" type="file" multiple @change="uploadFiles($event, replyAttachments)" />
        <footer><button class="danger" type="button" :disabled="saving" @click="closeTicket"><Lock :size="14" />关闭工单</button><button type="button" :disabled="uploading || replyAttachments.length >= 5" @click="pickFiles(replyFileInput)"><Paperclip :size="14" />附件</button><button class="primary" :disabled="saving || uploading || !replyBody"><Send :size="14" />发送</button></footer>
      </form>
      <div v-else class="support-closed"><Lock :size="15" />工单已关闭。如有新问题，请创建新工单。</div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, onMounted, ref, type PropType } from 'vue'
import { ArrowLeft, ChevronRight, CircleAlert, FileText, LifeBuoy, LoaderCircle, Lock, Paperclip, Plus, Send, Trash2, Upload } from 'lucide-vue-next'
import { api, apiUrl } from '../services/api'
import { uploadAsset } from '../utils/asset-upload'
import { formatDay as formatDate, formatDayTime as formatDateTime } from '../utils/datetime'
import EmptyState from './common/EmptyState.vue'

type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'WAITING_USER' | 'RESOLVED' | 'CLOSED'
type Attachment = { id: string; name: string; mimeType: string; size: number; contentUrl: string }
type TicketMessage = { id: string; body: string; authorType: 'USER' | 'ADMIN' | 'SYSTEM'; createdAt: string; attachments?: Attachment[] }
type Ticket = { id: string; subject: string; category: string; status: TicketStatus; priority: string; createdAt: string; updatedAt: string; hasUnread?: boolean; messages: TicketMessage[] }

const SupportAttachments = defineComponent({
  props: { modelValue: { type: Array as PropType<Attachment[]>, required: true }, busy: Boolean, compact: Boolean },
  emits: ['pick', 'remove'],
  setup(props, { emit }) {
    return () => h('div', { class: ['support-attachments', { compact: props.compact }] }, [
      ...props.modelValue.map((file) => h('span', { key: file.id }, [h(FileText, { size: 14 }), h('b', file.name), h('button', { type: 'button', title: '移除附件', onClick: () => emit('remove', file, props.modelValue) }, [h(Trash2, { size: 13 })])])),
      !props.compact && props.modelValue.length < 5 ? h('button', { type: 'button', disabled: props.busy, onClick: () => emit('pick') }, [h(Upload, { size: 15 }), props.busy ? '上传中' : '添加附件']) : null,
    ])
  },
})

const categories = ['账号与登录', '充值与账单', '套餐与额度', '图片生成', '对话与文件', '意见反馈', '其他']
const statusText: Record<TicketStatus, string> = { OPEN: '待处理', IN_PROGRESS: '处理中', WAITING_USER: '待你回复', RESOLVED: '已解决', CLOSED: '已关闭' }
const tickets = ref<Ticket[]>([])
const ticket = ref<Ticket | null>(null)
const view = ref<'list' | 'create' | 'detail'>('list')
const loading = ref(true), saving = ref(false), uploading = ref(false), error = ref('')
const createForm = ref({ subject: '', category: categories[0], body: '', attachments: [] as Attachment[] })
const replyBody = ref(''), replyAttachments = ref<Attachment[]>([])
const createFileInput = ref<HTMLInputElement | null>(null), replyFileInput = ref<HTMLInputElement | null>(null)
const activeCount = computed(() => tickets.value.filter((item) => !['RESOLVED', 'CLOSED'].includes(item.status)).length)
const unreadCount = computed(() => tickets.value.filter((item) => item.hasUnread).length)

function pickFiles(input: HTMLInputElement | null) { input?.click() }
function startCreate() { error.value = ''; createForm.value = { subject: '', category: categories[0], body: '', attachments: [] }; view.value = 'create' }
async function backToList() { view.value = 'list'; ticket.value = null; await load() }
async function load() { loading.value = true; error.value = ''; try { tickets.value = await api<Ticket[]>('/support/tickets') } catch (reason) { error.value = reason instanceof Error ? reason.message : '工单加载失败' } finally { loading.value = false } }
async function openTicket(id: string) { loading.value = true; error.value = ''; view.value = 'detail'; try { ticket.value = await api<Ticket>(`/support/tickets/${id}`); const item = tickets.value.find((row) => row.id === id); if (item) item.hasUnread = false } catch (reason) { error.value = reason instanceof Error ? reason.message : '工单详情加载失败'; view.value = 'list' } finally { loading.value = false } }
async function uploadFiles(event: Event, target: Attachment[]) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files || []).slice(0, Math.max(0, 5 - target.length))
  input.value = ''
  if (!files.length) return
  uploading.value = true; error.value = ''
  try { for (const file of files) { target.push(await uploadAsset<Attachment>(file, { kind: 'FILE' })) } }
  catch (reason) { error.value = reason instanceof Error ? reason.message : '附件上传失败' }
  finally { uploading.value = false }
}
async function removeUploaded(file: Attachment, target: Attachment[]) { const index = target.findIndex((item) => item.id === file.id); if (index >= 0) target.splice(index, 1); await api(`/assets/${file.id}`, { method: 'DELETE' }).catch(() => undefined) }
async function createTicket() {
  saving.value = true; error.value = ''
  try { const created = await api<Ticket>('/support/tickets', { method: 'POST', body: JSON.stringify({ subject: createForm.value.subject, category: createForm.value.category, body: createForm.value.body, assetIds: createForm.value.attachments.map((item) => item.id) }) }); await load(); await openTicket(created.id) }
  catch (reason) { error.value = reason instanceof Error ? reason.message : '工单提交失败' }
  finally { saving.value = false }
}
async function reply() {
  if (!ticket.value) return
  saving.value = true; error.value = ''
  try { await api(`/support/tickets/${ticket.value.id}/messages`, { method: 'POST', body: JSON.stringify({ body: replyBody.value, assetIds: replyAttachments.value.map((item) => item.id) }) }); replyBody.value = ''; replyAttachments.value = []; await openTicket(ticket.value.id) }
  catch (reason) { error.value = reason instanceof Error ? reason.message : '回复发送失败' }
  finally { saving.value = false }
}
async function closeTicket() { if (!ticket.value || !window.confirm('确认关闭这个工单？关闭后将不能继续回复。')) return; saving.value = true; try { await api(`/support/tickets/${ticket.value.id}/close`, { method: 'POST', body: '{}' }); await openTicket(ticket.value.id) } finally { saving.value = false } }
onMounted(load)
</script>
