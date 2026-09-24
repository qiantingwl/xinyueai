<template>
  <main class="login-page">
    <section class="login-panel">
      <header class="login-header">
        <RouterLink class="login-brand" to="/">
          <span class="login-brand__mark">X</span>
          <strong>XINYUE</strong>
          <i></i>
          <span>AI</span>
        </RouterLink>
        <div class="login-header__tools">
          <select v-model="locale" class="login-locale-select" aria-label="Language">
            <option value="zh-CN">简中</option>
            <option value="zh-TW">繁中</option>
            <option value="en">EN</option>
            <option value="ja">日本語</option>
            <option value="ko">한국어</option>
          </select>
          <span class="login-account-pill">Xinyue AI 账户</span>
        </div>
      </header>

      <section class="login-form" aria-live="polite">
        <div v-if="!catalog.loaded || catalog.loading" class="auth-step auth-step--availability">
          <LoaderCircle class="is-spinning" :size="22" />
        </div>

        <div v-else-if="catalog.loadError" class="auth-step auth-step--availability">
          <div class="login-heading">
            <h1>暂时无法连接服务</h1>
            <p>{{ catalog.loadError }}</p>
          </div>
          <button class="button button--solid login-submit" type="button" @click="catalog.load(true)">
            <RotateCcw :size="17" />重新加载
          </button>
        </div>

        <div v-else-if="!hasAnyLogin" class="auth-step auth-step--availability">
          <div class="login-heading">
            <h1>登录暂未开放</h1>
            <p>管理员尚未开放邮箱验证码登录。</p>
          </div>
          <RouterLink class="button button--solid login-submit" :to="homePath">返回工作台</RouterLink>
        </div>

        <div v-else class="auth-step auth-step--multi">
          <div class="login-heading">
            <h1>{{ isRegister ? '创建账户' : '欢迎回来' }}</h1>
            <p>{{ isRegister ? '注册时如填写邮箱，会先完成验证码验证。' : catalog.registrationEnabled ? '使用邮箱或账户继续，首次使用可创建账号。' : '使用已注册的邮箱或账户继续。' }}</p>
          </div>

          <div v-if="availableModes.length > 1" class="auth-method-tabs" role="tablist" aria-label="登录方式">
            <button v-for="item in availableModes" :key="item.value" type="button" :class="{ active: mode === item.value }" @click="selectMode(item.value)">{{ item.label }}</button>
          </div>

          <form v-if="mode === 'password' && !isRegister && catalog.passwordLoginEnabled" class="auth-method-form" @submit.prevent="submitPasswordLogin">
            <label class="field">
              <span>邮箱或用户名</span>
              <input v-model.trim="identifier" autocomplete="username" placeholder="输入邮箱或用户名" required />
            </label>
            <label class="field">
              <span>密码</span>
              <input v-model="password" type="password" autocomplete="current-password" placeholder="请输入密码" required />
            </label>
            <p v-if="error" class="login-error" role="alert">{{ error }}</p>
            <button class="button button--solid login-submit" type="submit" :disabled="busy">
              <LoaderCircle v-if="busy" class="is-spinning" :size="17" />
              <span>{{ busy ? '正在登录...' : '登录' }}</span>
            </button>
            <button v-if="catalog.registrationEnabled && (catalog.passwordRegistrationEnabled || catalog.emailVerifyEnabled)" class="auth-switch" type="button" @click="toggleRegister">{{ '没有账户？创建一个' }}</button>
          </form>

          <form v-else-if="mode === 'password' && isRegister && catalog.passwordRegistrationEnabled" class="auth-method-form" @submit.prevent="submitPasswordRegister">
            <label class="field">
              <span>用户名</span>
              <input v-model.trim="username" autocomplete="username" maxlength="32" placeholder="3-32 位字母、数字或 _ . -" required />
            </label>
            <label class="field">
              <span>邮箱 <small>选填</small></span>
              <input v-model.trim="email" type="email" autocomplete="email" placeholder="name@example.com" />
            </label>
            <label class="field">
              <span>显示名称 <small>选填</small></span>
              <input v-model.trim="displayName" autocomplete="name" maxlength="100" placeholder="页面展示名称" />
            </label>
            <label class="field">
              <span>密码</span>
              <input v-model="password" type="password" autocomplete="new-password" minlength="8" placeholder="至少 8 位" required />
            </label>
            <label class="field">
              <span>确认密码</span>
              <input v-model="passwordConfirm" type="password" autocomplete="new-password" minlength="8" required />
            </label>
            <p v-if="error" class="login-error" role="alert">{{ error }}</p>
            <button class="button button--solid login-submit" type="submit" :disabled="busy">
              <LoaderCircle v-if="busy" class="is-spinning" :size="17" />
              <span>{{ busy ? '正在处理...' : email && (catalog.emailLoginEnabled || catalog.emailVerifyEnabled) ? '发送验证码并继续' : '创建账户' }}</span>
            </button>
            <button class="auth-switch" type="button" @click="toggleRegister">已有账户？返回登录</button>
          </form>

          <form v-else-if="mode === 'email' && step === 'main' && (catalog.emailLoginEnabled || catalog.emailVerifyEnabled)" class="auth-method-form" @submit.prevent="requestEmailCode">
            <label class="field">
              <span>邮箱</span>
              <input v-model.trim="email" type="email" autocomplete="email" placeholder="name@example.com" required />
            </label>
            <p v-if="error" class="login-error" role="alert">{{ error }}</p>
            <button class="button button--solid login-submit" type="submit" :disabled="busy">
              <LoaderCircle v-if="busy" class="is-spinning" :size="17" />
              <span>{{ busy ? '正在处理...' : '继续' }}</span>
            </button>
            <button v-if="catalog.registrationEnabled && catalog.emailVerifyEnabled" class="auth-switch" type="button" @click="startEmailRegister">没有账户？先验证邮箱</button>
          </form>

          <form v-else-if="mode === 'email' && step === 'code'" class="auth-method-form" @submit.prevent="verifyEmailCode">
            <button class="auth-back" type="button" aria-label="返回" @click="backToEmailEntry"><ArrowLeft :size="18" /></button>
            <div class="login-heading">
              <h1>检查你的邮箱</h1>
              <p>验证码已发送至 <strong>{{ email }}</strong></p>
            </div>
            <label class="field auth-code-field">
              <span>验证码</span>
              <div class="auth-code-input">
                <input ref="codeInput" v-model="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" aria-label="六位验证码" @input="normalizeCode" />
                <span v-for="index in 6" :key="index" :class="{ 'is-filled': code.length >= index, 'is-current': code.length + 1 === index }">{{ code[index - 1] || '' }}</span>
              </div>
            </label>
            <p v-if="error" class="login-error" role="alert">{{ error }}</p>
            <button class="button button--solid login-submit" type="submit" :disabled="busy || code.length !== 6">
              <LoaderCircle v-if="busy" class="is-spinning" :size="17" />
              <span>{{ busy ? '正在验证...' : '继续' }}</span>
            </button>
            <button class="auth-resend" type="button" :disabled="countdown > 0 || busy" @click="requestEmailCode">
              <RotateCcw :size="15" />
              <span>{{ countdown > 0 ? `${countdown} 秒后重新发送` : '重新发送验证码' }}</span>
            </button>
          </form>

          <form v-else-if="mode === 'email' && step === 'register'" class="auth-method-form" @submit.prevent="completeEmailRegistration">
            <button class="auth-back" type="button" aria-label="返回" @click="backToEmailEntry"><ArrowLeft :size="18" /></button>
            <div class="login-heading">
              <h1>完善账户信息</h1>
              <p>邮箱 <strong>{{ email }}</strong> 已验证，设置资料后即可登录。</p>
            </div>
            <label class="field">
              <span>用户名</span>
              <input v-model.trim="username" autocomplete="username" maxlength="32" placeholder="3-32 位字母、数字或 _ . -" required />
            </label>
            <label class="field">
              <span>显示名称</span>
              <input v-model.trim="displayName" autocomplete="name" maxlength="100" placeholder="用于页面展示，可和用户名不同" />
            </label>
            <label class="field">
              <span>密码</span>
              <input v-model="password" type="password" autocomplete="new-password" minlength="8" placeholder="至少 8 位" required />
            </label>
            <label class="field">
              <span>确认密码</span>
              <input v-model="passwordConfirm" type="password" autocomplete="new-password" minlength="8" required />
            </label>
            <p v-if="error" class="login-error" role="alert">{{ error }}</p>
            <button class="button button--solid login-submit" type="submit" :disabled="busy">
              <LoaderCircle v-if="busy" class="is-spinning" :size="17" />
              <span>{{ busy ? '正在创建...' : '完成注册' }}</span>
            </button>
          </form>

          <div v-if="showLinuxDoLogin && step === 'main' && !isRegister" class="auth-provider-stack">
            <div class="auth-provider-divider"><span>或</span></div>
            <a class="auth-oauth-button" :href="linuxDoUrl">
              <span>使用 Linux.do 登录</span>
            </a>
          </div>
        </div>
      </section>

      <p class="login-legal">
        继续即表示你同意 Xinyue AI 的 <RouterLink to="/terms">用户协议</RouterLink> 和 <RouterLink to="/privacy">隐私政策</RouterLink>。
      </p>
    </section>

    <aside class="login-visual" aria-hidden="true">
      <div class="login-particles">
        <i v-for="index in 18" :key="index" :style="particleStyle(index)"></i>
      </div>
      <div class="login-visual__mark"><span>X</span></div>
    </aside>
  </main>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ArrowLeft, LoaderCircle, RotateCcw } from 'lucide-vue-next'
import { useAuthStore } from '../stores/auth'
import { useCatalogStore } from '../stores/catalog'
import { apiUrl } from '../services/api'
import { firstSidebarPath } from '../utils/sidebar-nav'
import { updateStoredSettings } from '../utils/settings-storage'

type LoginMode = 'password' | 'email'
type AuthStep = 'main' | 'code' | 'register' | 'success'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const catalog = useCatalogStore()
const { locale } = useI18n()

const mode = ref<LoginMode>('password')
const isRegister = ref(route.query.register === '1')
const inviteCode = typeof route.query.invite === 'string' ? route.query.invite.trim().toUpperCase().slice(0, 64) : ''
const step = ref<AuthStep>('main')
const identifier = ref('')
const username = ref('')
const displayName = ref('')
const email = ref('')
const password = ref('')
const passwordConfirm = ref('')
const code = ref('')
const error = ref('')
const busy = ref(false)
const countdown = ref(0)
const codeInput = ref<HTMLInputElement | null>(null)
const registrationTicket = ref('')
const pendingRegistration = ref<{ username: string; displayName?: string; password: string } | null>(null)
let countdownTimer: number | null = null

const homePath = computed(() => firstSidebarPath(catalog.settings) || '/chat')
const redirectPath = computed(() =>
  typeof route.query.redirect === 'string' && route.query.redirect.startsWith('/') && !route.query.redirect.startsWith('//')
    ? route.query.redirect
    : homePath.value,
)
const linuxDoUrl = computed(() => apiUrl(`/auth/oauth/linuxdo/start?redirect=${encodeURIComponent(redirectPath.value)}${inviteCode ? `&invite=${encodeURIComponent(inviteCode)}` : ''}`))
const availableModes = computed(() => [
  { value: 'email' as const, label: '邮箱' },
  { value: 'password' as const, label: '账户' },
].filter((item) => item.value === 'email' ? catalog.emailLoginEnabled || catalog.emailVerifyEnabled : catalog.passwordLoginEnabled))
const showLinuxDoLogin = computed(() => catalog.linuxDoLoginReady)
const hasAnyLogin = computed(() => catalog.passwordLoginEnabled || catalog.emailLoginEnabled || catalog.emailVerifyEnabled || catalog.passwordRegistrationEnabled || catalog.linuxDoLoginReady)

function clearSensitiveAuthState() {
  password.value = ''
  passwordConfirm.value = ''
  registrationTicket.value = ''
  pendingRegistration.value = null
}

function selectMode(value: LoginMode) {
  mode.value = value
  step.value = 'main'
  error.value = ''
  code.value = ''
  clearSensitiveAuthState()
}

function toggleRegister() {
  isRegister.value = !isRegister.value
  error.value = ''
  code.value = ''
  clearSensitiveAuthState()
  step.value = 'main'
}

function validateUsername(value: string) {
  return /^[a-zA-Z0-9][a-zA-Z0-9_.-]{2,31}$/.test(value)
}

function normalizeCode(event: Event) {
  code.value = (event.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, 6)
  error.value = ''
}

function clearCountdown() {
  if (countdownTimer) window.clearInterval(countdownTimer)
  countdownTimer = null
  countdown.value = 0
}

function startCountdown() {
  clearCountdown()
  countdown.value = catalog.settings.otpResendSeconds || 60
  countdownTimer = window.setInterval(() => {
    countdown.value -= 1
    if (countdown.value <= 0) clearCountdown()
  }, 1000)
}

async function finish() {
  step.value = 'success'
  await new Promise((resolve) => window.setTimeout(resolve, 450))
  await router.push(redirectPath.value)
}

async function submitPasswordLogin() {
  error.value = ''
  if (!identifier.value.trim()) {
    error.value = '请输入邮箱或用户名'
    return
  }
  if (!password.value) {
    error.value = '请输入密码'
    return
  }
  busy.value = true
  try {
    await auth.loginPassword(identifier.value, password.value)
    await finish()
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '登录失败'
  } finally {
    busy.value = false
  }
}

async function submitPasswordRegister() {
  error.value = ''
  if (!validateUsername(username.value)) {
    error.value = '用户名格式不正确'
    return
  }
  if (password.value.length < 8) {
    error.value = '密码至少需要 8 位'
    return
  }
  if (password.value !== passwordConfirm.value) {
    error.value = '两次输入的密码不一致'
    return
  }

  busy.value = true
  try {
    if (email.value && catalog.emailVerifyEnabled) {
      if (!catalog.settings.smtpReady) {
        error.value = '邮件服务尚未配置，请联系管理员'
        return
      }
      pendingRegistration.value = { username: username.value, displayName: displayName.value || undefined, password: password.value }
      const response = await auth.requestEmailCode(email.value)
      step.value = 'code'
      startCountdown()
      await nextTick()
      if (response.developmentCode) code.value = response.developmentCode
      codeInput.value?.focus()
      return
    }
    await auth.registerPassword({ username: username.value, email: email.value || undefined, displayName: displayName.value || undefined, password: password.value, inviteCode: inviteCode || undefined })
    await finish()
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '注册失败'
  } finally {
    busy.value = false
  }
}

async function requestEmailCode() {
  error.value = ''
  if (!email.value.trim()) {
    error.value = '请输入邮箱'
    return
  }
  if (!catalog.settings.smtpReady) {
    error.value = '邮件服务尚未配置，请联系管理员'
    return
  }
  busy.value = true
  try {
    const response = await auth.requestEmailCode(email.value)
    step.value = 'code'
    startCountdown()
    await nextTick()
    if (response.developmentCode) code.value = response.developmentCode
    codeInput.value?.focus()
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '验证码发送失败'
  } finally {
    busy.value = false
  }
}

async function verifyEmailCode() {
  if (code.value.length !== 6) return
  busy.value = true
  error.value = ''
  try {
    const response = await auth.verifyEmailCode(email.value, code.value)
    if (response.registrationRequired && response.ticket) {
      registrationTicket.value = response.ticket
      if (pendingRegistration.value) {
        await auth.completeEmailRegistration({ ticket: response.ticket, ...pendingRegistration.value, inviteCode: inviteCode || undefined })
        await finish()
        return
      }
      username.value ||= email.value.split('@')[0]?.replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 32) || ''
      displayName.value ||= ''
      password.value = ''
      passwordConfirm.value = ''
      code.value = ''
      step.value = 'register'
      await nextTick()
      return
    }
    await finish()
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '验证码无效'
  } finally {
    busy.value = false
  }
}

async function completeEmailRegistration() {
  error.value = ''
  if (!registrationTicket.value) {
    error.value = '注册票据无效，请重新验证邮箱'
    return
  }
  if (!validateUsername(username.value)) {
    error.value = '用户名格式不正确'
    return
  }
  if (password.value.length < 8) {
    error.value = '密码至少需要 8 位'
    return
  }
  if (password.value !== passwordConfirm.value) {
    error.value = '两次输入的密码不一致'
    return
  }
  busy.value = true
  try {
    await auth.completeEmailRegistration({ ticket: registrationTicket.value, username: username.value, displayName: displayName.value || undefined, password: password.value, inviteCode: inviteCode || undefined })
    await finish()
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '注册失败'
  } finally {
    busy.value = false
  }
}

function backToEmailEntry() {
  step.value = 'main'
  error.value = ''
  code.value = ''
  clearSensitiveAuthState()
  clearCountdown()
}

function startEmailRegister() {
  isRegister.value = true
  mode.value = 'email'
  step.value = 'main'
  error.value = ''
  code.value = ''
  clearSensitiveAuthState()
}

function particleStyle(index: number) {
  return {
    left: `${(index * 37) % 96}%`,
    top: `${(index * 53) % 94}%`,
    width: `${2 + (index % 3)}px`,
    height: `${2 + (index % 3)}px`,
    animationDelay: `${(index * 0.47) % 7}s`,
    animationDuration: `${14 + (index % 7) * 2}s`,
  }
}

onMounted(async () => {
  await catalog.load()
  if (auth.isAuthenticated) await router.replace(redirectPath.value)
  mode.value = catalog.emailLoginEnabled || catalog.emailVerifyEnabled ? 'email' : 'password'
})

onUnmounted(() => clearCountdown())

watch(locale, (value) => {
  document.documentElement.lang = value
  updateStoredSettings((stored) => ({ ...stored, language: value }))
})
</script>
