<template>
  <h2 id="settings-account">账户</h2><div class="account-detail-row"><span>姓名</span><strong>{{ auth.displayName }}</strong></div><div class="account-detail-row"><span>{{ accountIdentityLabel }}<small>{{ accountIdentityHint }}</small></span><strong>{{ accountIdentity }}</strong></div><div class="account-detail-row"><span>登录方式</span><strong>{{ loginMethodLabel }}</strong></div><h3 class="account-actions-title">Xinyue AI</h3><nav class="settings-legal-links"><RouterLink to="/about" @click="closeSettings">关于我们</RouterLink><RouterLink to="/copyright" @click="closeSettings">版权说明</RouterLink><RouterLink to="/terms" @click="closeSettings">用户协议</RouterLink><RouterLink to="/privacy" @click="closeSettings">隐私政策</RouterLink></nav><h3 class="account-actions-title">账户操作</h3><div class="settings-action-row"><span><strong>退出登录</strong><small>结束当前设备上的登录状态。</small></span><button class="danger-button" type="button" @click="logout">退出登录</button></div><section class="settings-account-deletion"><template v-if="accountDeletion"><h3>账户注销{{ accountDeletion.status === 'FAILED' ? '处理失败' : '冷静期中' }}</h3><p v-if="accountDeletion.status === 'REQUESTED'">计划在 {{ formatShortDayTime(accountDeletion.scheduledAt) }} 清除个人数据。冷静期内可以撤销。</p><p v-else>{{ accountDeletion.failureReason || '注销流程正在处理。' }}</p><button v-if="accountDeletion.status === 'REQUESTED'" type="button" :disabled="deletionBusy" @click="cancelAccountDeletion">撤销注销申请</button></template><template v-else><h3>注销账户</h3><p>提交后有 7 天冷静期。到期将清除登录凭据、个人密钥、连接器和个人内容；支付、发票和审计记录会匿名保留。</p><textarea v-model.trim="deletionReason" maxlength="2000" placeholder="注销原因（可选）" /><button class="danger-button" type="button" :disabled="deletionBusy" @click="requestAccountDeletion">申请注销账户</button></template><small v-if="deletionMessage" class="settings-feedback">{{ deletionMessage }}</small></section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useAuthStore } from '../../../../stores/auth'
import { formatShortDayTime } from '../../../../utils/datetime'
import type { DeletionRequest } from '../../types'

defineProps<{
  accountDeletion: DeletionRequest | null
  deletionBusy: boolean
  deletionMessage: string
  logout: () => Promise<void>
  requestAccountDeletion: () => Promise<void>
  cancelAccountDeletion: () => Promise<void>
  closeSettings: () => void
}>()

const deletionReason = defineModel<string>('deletionReason', { required: true })

const auth = useAuthStore()

const loginMethodLabels = { password: '邮箱 / 密码', email: '邮箱验证码', linuxdo: 'Linux.do', community: '第三方账号' } as const
const loginMethodLabel = computed(() => loginMethodLabels[(auth.session?.provider || 'community') as keyof typeof loginMethodLabels] ?? loginMethodLabels.community)
const hasPublicEmail = computed(() => Boolean(auth.session?.email && !auth.session.email.endsWith('@auth.xinyue.local')))
const accountIdentityLabel = computed(() => hasPublicEmail.value ? '电子邮件' : '用户名')
const accountIdentityHint = computed(() => hasPublicEmail.value ? '已绑定邮箱' : '此账户未绑定邮箱')
const accountIdentity = computed(() => hasPublicEmail.value ? auth.session?.email : auth.session?.username || auth.displayName)
</script>
