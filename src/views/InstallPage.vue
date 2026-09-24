<template>
  <main class="setup-page">
    <span class="setup-page__band" aria-hidden="true" />
    <section class="setup-shell" aria-label="Xinyue AI 初始化">
      <div class="setup-form-panel">
        <div class="setup-brand" aria-label="Xinyue AI">
          <span class="setup-brand__mark">X</span><strong>Xinyue AI</strong>
        </div>

        <div v-if="loading" class="setup-status" role="status">
          <LoaderCircle :size="28" class="setup-spin" />
          <strong>正在检查初始化状态</strong>
          <span>请稍候，正在连接 Xinyue AI 服务。</span>
        </div>

        <div v-else-if="checkError" class="setup-status setup-status--error" role="alert">
          <CircleAlert :size="28" />
          <strong>暂时无法连接服务</strong>
          <span>{{ checkError }}</span>
          <button type="button" class="setup-retry" @click="checkSetupStatus"><RefreshCw :size="16" />重新检查</button>
        </div>

        <template v-else>
          <header class="setup-heading">
            <h1 id="setup-title">欢迎使用 <span>Xinyue AI</span></h1>
            <p>创建管理员账号，开始构建你的 AI 工作空间</p>
          </header>

          <form class="setup-form" @submit.prevent="submit">
            <div class="setup-field">
              <label for="setup-token">安装令牌</label>
              <div class="setup-input">
                <ShieldCheck :size="19" aria-hidden="true" />
                <input id="setup-token" v-model.trim="installToken" type="password" autocomplete="one-time-code" minlength="32" maxlength="200" placeholder="请输入部署时生成的安装令牌" :disabled="busy" required />
              </div>
            </div>

            <div class="setup-field">
              <label for="setup-email">管理员邮箱</label>
              <div class="setup-input">
                <Mail :size="19" aria-hidden="true" />
                <input id="setup-email" v-model.trim="email" type="email" autocomplete="email" placeholder="请输入管理员邮箱" :disabled="busy" required />
              </div>
            </div>

            <div class="setup-field">
              <label for="setup-password">管理员密码</label>
              <div class="setup-input">
                <LockKeyhole :size="19" aria-hidden="true" />
                <input id="setup-password" v-model="password" :type="showPassword ? 'text' : 'password'" autocomplete="new-password" minlength="8" maxlength="200" placeholder="请输入至少 8 位管理员密码" :disabled="busy" required />
                <button type="button" class="setup-password-toggle" :aria-label="showPassword ? '隐藏管理员密码' : '显示管理员密码'" :title="showPassword ? '隐藏密码' : '显示密码'" :disabled="busy" @click="showPassword = !showPassword">
                  <EyeOff v-if="showPassword" :size="18" /><Eye v-else :size="18" />
                </button>
              </div>
            </div>

            <div class="setup-field">
              <label for="setup-confirm">确认密码</label>
              <div class="setup-input">
                <LockKeyhole :size="19" aria-hidden="true" />
                <input id="setup-confirm" v-model="confirm" :type="showConfirm ? 'text' : 'password'" autocomplete="new-password" minlength="8" maxlength="200" placeholder="请再次输入管理员密码" :disabled="busy" required />
                <button type="button" class="setup-password-toggle" :aria-label="showConfirm ? '隐藏确认密码' : '显示确认密码'" :title="showConfirm ? '隐藏密码' : '显示密码'" :disabled="busy" @click="showConfirm = !showConfirm">
                  <EyeOff v-if="showConfirm" :size="18" /><Eye v-else :size="18" />
                </button>
              </div>
            </div>

            <p v-if="error" class="setup-error" role="alert"><CircleAlert :size="16" />{{ error }}</p>
            <button class="setup-submit" type="submit" :disabled="busy">
              <LoaderCircle v-if="busy" :size="19" class="setup-spin" />
              <span>{{ success ? '创建成功，正在前往登录页' : busy ? '正在创建管理员' : '创建管理员账号' }}</span>
              <ArrowRight v-if="!busy" :size="19" />
            </button>
          </form>

          <p class="setup-security"><ShieldCheck :size="18" />初始化环境 · 安全配置 · 仅执行一次</p>
        </template>
      </div>

      <aside class="setup-showcase" aria-label="Xinyue AI 平台能力">
        <div class="setup-stage" aria-hidden="true">
          <span class="setup-orbit setup-orbit--chat"><MessageSquareText :size="20" /></span>
          <span class="setup-orbit setup-orbit--bot"><Bot :size="20" /></span>
          <span class="setup-orbit setup-orbit--image"><ImageIcon :size="20" /></span>
          <span class="setup-orbit setup-orbit--spark"><Sparkles :size="20" /></span>
          <div class="setup-symbol"><span>X</span></div>
          <span class="setup-platform" />
        </div>
        <h2>Xinyue AI</h2>
        <p class="setup-tagline">让 AI 创作更简单</p>
        <ul class="setup-features">
          <li><CircleCheck :size="18" />多模型支持，灵活切换</li>
          <li><CircleCheck :size="18" />强大的工作空间管理</li>
          <li><CircleCheck :size="18" />安全可靠的数据保护</li>
          <li><CircleCheck :size="18" />持续更新，专业支持</li>
        </ul>
      </aside>
    </section>
  </main>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ArrowRight, Bot, CircleAlert, CircleCheck, Eye, EyeOff, Image as ImageIcon, LoaderCircle, LockKeyhole, Mail, MessageSquareText, RefreshCw, ShieldCheck, Sparkles } from 'lucide-vue-next'
import { api, ApiError } from '../services/api'

const loading = ref(true)
const busy = ref(false)
const success = ref(false)
const installToken = ref('')
const email = ref('')
const password = ref('')
const confirm = ref('')
const showPassword = ref(false)
const showConfirm = ref(false)
const error = ref('')
const checkError = ref('')

onMounted(checkSetupStatus)

async function checkSetupStatus() {
  loading.value = true
  checkError.value = ''
  try {
    const status = await api<{ required: boolean }>('/auth/setup/status', { timeoutMs: 8_000 })
    if (!status.required) {
      window.location.replace('/admin/#/auth/login')
      return
    }
  } catch (reason) {
    checkError.value = reason instanceof ApiError ? reason.message : '无法连接 Xinyue AI 服务，请确认后端已经启动。'
  } finally {
    loading.value = false
  }
}

async function submit() {
  error.value = ''
  if (password.value !== confirm.value) {
    error.value = '两次输入的密码不一致'
    return
  }
  busy.value = true
  try {
    await api('/auth/setup', { method: 'POST', headers: { 'X-Install-Token': installToken.value }, body: JSON.stringify({ email: email.value, password: password.value }) })
    success.value = true
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined)
    window.location.replace('/admin/#/auth/login')
  } catch (reason) {
    error.value = reason instanceof ApiError ? reason.message : '初始化失败，请稍后重试'
    busy.value = false
  }
}
</script>

<style scoped>
.setup-page {
  --setup-accent: var(--studio-brand);
  --setup-accent-strong: var(--studio-brand-hover);
  --setup-accent-soft: var(--studio-brand-soft);
  --setup-ink: #172033;
  --setup-muted: #697386;
  --setup-line: #e4e7ef;
  --setup-surface: #fff;
  --setup-radius: var(--studio-radius-sm);
  --setup-shadow: 0 28px 80px rgba(24, 32, 64, .12);
  --setup-danger: #a8271e;
  position: relative;
  isolation: isolate;
  display: grid;
  min-height: 100svh;
  place-items: center;
  overflow: hidden;
  padding: 28px;
  color: var(--setup-ink);
  color-scheme: light;
  font-family: "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif;
  background:
    linear-gradient(rgba(77, 107, 254, .04) 1px, transparent 1px),
    linear-gradient(90deg, rgba(77, 107, 254, .04) 1px, transparent 1px),
    #f6f7fb;
  background-size: 48px 48px;
}

.setup-page__band {
  position: absolute;
  z-index: -1;
  right: -16%;
  bottom: -28%;
  width: 72%;
  height: 72%;
  transform: rotate(-11deg);
  background: linear-gradient(135deg, rgba(77, 107, 254, .08), rgba(77, 107, 254, .28));
  clip-path: polygon(28% 0, 100% 0, 100% 100%, 0 100%);
}

.setup-shell {
  display: grid;
  grid-template-columns: minmax(0, 1.08fr) minmax(380px, .92fr);
  width: min(1120px, 100%);
  min-height: min(720px, calc(100svh - 56px));
  overflow: hidden;
  border: 1px solid rgba(24, 32, 64, .1);
  border-radius: var(--setup-radius);
  background: var(--setup-surface);
  box-shadow: var(--setup-shadow);
}

.setup-form-panel { display: flex; flex-direction: column; min-width: 0; padding: 48px 56px 40px; }
.setup-brand { display: inline-flex; align-items: center; align-self: flex-start; gap: 12px; font-size: 1.25rem; line-height: 1; }
.setup-brand__mark { display: grid; width: 42px; height: 42px; place-items: center; border-radius: 8px; color: #fff; font-size: 1.55rem; font-weight: 900; background: linear-gradient(145deg, #7b91ff, var(--setup-accent-strong)); box-shadow: 0 8px 18px rgba(77, 107, 254, .22); }
.setup-brand strong, .setup-heading h1, .setup-showcase h2 { letter-spacing: 0; }
.setup-heading { margin-top: 52px; }
.setup-heading h1 { margin: 0; font-size: 2.25rem; line-height: 1.25; font-weight: 850; }
.setup-heading h1 span { color: var(--setup-accent); }
.setup-heading p { margin: 12px 0 0; color: var(--setup-muted); font-size: 1rem; line-height: 1.7; }
.setup-form { display: grid; gap: 20px; margin-top: 36px; }
.setup-field { display: grid; gap: 8px; }
.setup-field label { color: #3f4b5e; font-size: .875rem; font-weight: 700; line-height: 1.5; }

.setup-input {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  min-height: 56px;
  padding: 0 16px;
  border: 1px solid var(--setup-line);
  border-radius: var(--setup-radius);
  color: #8791a1;
  background: #fff;
  transition: border-color 160ms ease, box-shadow 160ms ease, background 160ms ease;
}
.setup-input:focus-within { border-color: var(--setup-accent); box-shadow: 0 0 0 4px var(--setup-accent-soft); }
.setup-input:has(input:disabled) { background: #f5f6f9; }
.setup-input input { width: 100%; min-width: 0; height: 54px; padding: 0 12px; border: 0; outline: 0; color: var(--setup-ink); font: inherit; background: transparent; }
.setup-input input::placeholder { color: #9aa3b1; }
.setup-password-toggle { display: grid; width: 44px; height: 44px; place-items: center; margin-right: -12px; border: 0; border-radius: 6px; color: #8993a2; background: transparent; }
.setup-password-toggle:hover:not(:disabled) { color: var(--setup-accent-strong); background: var(--setup-accent-soft); }
.setup-password-toggle:focus-visible, .setup-submit:focus-visible, .setup-retry:focus-visible { outline: 3px solid var(--setup-accent-soft); outline-offset: 2px; }

.setup-error { display: flex; align-items: center; gap: 8px; margin: -4px 0 0; color: var(--setup-danger); font-size: .875rem; line-height: 1.5; }
.setup-submit { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 56px; margin-top: 4px; padding: 0 24px; border: 0; border-radius: var(--setup-radius); color: #fff; font-size: 1rem; font-weight: 750; background: linear-gradient(90deg, var(--setup-accent-strong), var(--setup-accent)); box-shadow: 0 12px 24px rgba(77, 107, 254, .22); transition: transform 160ms ease, box-shadow 160ms ease, opacity 160ms ease; }
.setup-submit:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 16px 28px rgba(77, 107, 254, .28); }
.setup-submit:disabled { cursor: wait; opacity: .72; }
.setup-security { display: flex; align-items: center; justify-content: center; gap: 8px; margin: 24px 0 0; color: #768294; font-size: .8125rem; line-height: 1.6; }
.setup-security svg { color: var(--setup-accent); }

.setup-status { display: flex; flex: 1; flex-direction: column; align-items: flex-start; justify-content: center; gap: 12px; max-width: 420px; color: var(--setup-accent); }
.setup-status strong { color: var(--setup-ink); font-size: 1.5rem; }
.setup-status span { color: var(--setup-muted); line-height: 1.7; }
.setup-status--error { color: var(--setup-danger); }
.setup-retry { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; margin-top: 8px; padding: 0 16px; border: 1px solid var(--setup-line); border-radius: var(--setup-radius); color: var(--setup-ink); font-weight: 700; background: #fff; }

.setup-showcase { position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; min-width: 0; overflow: hidden; padding: 48px 44px; border-left: 1px solid rgba(77, 107, 254, .1); background: linear-gradient(180deg, rgba(255, 255, 255, .78), rgba(236, 240, 255, .92)), repeating-linear-gradient(135deg, rgba(77, 107, 254, .035) 0 1px, transparent 1px 18px); }
.setup-stage { position: relative; width: 330px; max-width: 100%; height: 260px; }
.setup-symbol { position: absolute; z-index: 2; top: 62px; left: 50%; display: grid; width: 112px; height: 112px; place-items: center; transform: translateX(-50%) rotate(8deg); border: 1px solid rgba(255, 255, 255, .68); border-radius: 24px; background: linear-gradient(145deg, #9aacff, #4d6bfe 62%, #2f4bdb); box-shadow: inset 10px 10px 24px rgba(255, 255, 255, .28), 0 24px 42px rgba(77, 107, 254, .28); animation: setup-float 4.5s ease-in-out infinite; }
.setup-symbol::before, .setup-symbol::after { position: absolute; inset: 10px; content: ""; border: 1px solid rgba(255, 255, 255, .34); border-radius: 18px; }
.setup-symbol::after { inset: 20px; border-color: rgba(255, 255, 255, .22); border-radius: 12px; }
.setup-symbol span { transform: rotate(-8deg); color: rgba(255, 255, 255, .92); font-size: 3.8rem; font-weight: 900; line-height: 1; text-shadow: 0 8px 16px rgba(47, 75, 219, .18); }
.setup-platform { position: absolute; top: 172px; left: 50%; width: 230px; height: 58px; transform: translateX(-50%); border-radius: 50%; background: linear-gradient(180deg, #fff, #e4e8f5); box-shadow: 0 20px 30px rgba(47, 75, 219, .12); }
.setup-platform::after { position: absolute; inset: 9px 28px 20px; content: ""; border-radius: 50%; background: rgba(77, 107, 254, .16); }
.setup-orbit { position: absolute; z-index: 3; display: grid; width: 46px; height: 46px; place-items: center; border: 1px solid rgba(77, 107, 254, .12); border-radius: 50%; color: var(--setup-accent); background: rgba(255, 255, 255, .88); box-shadow: 0 10px 24px rgba(77, 107, 254, .1); }
.setup-orbit--chat { top: 44px; left: 24px; }
.setup-orbit--bot { top: 2px; left: 92px; }
.setup-orbit--image { top: 18px; right: 38px; }
.setup-orbit--spark { top: 102px; right: 4px; }
.setup-showcase h2 { margin: 8px 0 0; font-size: 2rem; line-height: 1.25; }
.setup-tagline { margin: 8px 0 0; color: var(--setup-accent); font-size: 1.0625rem; font-weight: 650; }
.setup-features { display: grid; gap: 16px; width: min(300px, 100%); margin: 32px 0 0; padding: 0; list-style: none; }
.setup-features li { display: flex; align-items: center; gap: 12px; color: #4b5869; font-size: .9375rem; line-height: 1.5; }
.setup-features svg { flex: 0 0 auto; color: var(--setup-accent); }
.setup-spin { animation: setup-spin .8s linear infinite; }

@keyframes setup-spin { to { transform: rotate(360deg); } }
@keyframes setup-float { 0%, 100% { transform: translateX(-50%) translateY(0) rotate(8deg); } 50% { transform: translateX(-50%) translateY(-8px) rotate(8deg); } }

@media (max-width: 900px) {
  .setup-shell { grid-template-columns: minmax(0, 1fr); width: min(620px, 100%); }
  .setup-showcase { display: none; }
  .setup-form-panel { min-height: min(720px, calc(100svh - 56px)); }
}

@media (max-width: 540px) {
  .setup-page { display: block; padding: 0; background: #fff; }
  .setup-page__band { display: none; }
  .setup-shell { min-height: 100svh; border: 0; border-radius: 0; box-shadow: none; }
  .setup-form-panel { min-height: 100svh; padding: 28px 20px 24px; }
  .setup-heading { margin-top: 44px; }
  .setup-heading h1 { font-size: 1.875rem; }
  .setup-form { margin-top: 32px; }
  .setup-security { margin-top: auto; padding-top: 24px; }
}

@media (prefers-reduced-motion: reduce) {
  .setup-symbol, .setup-spin { animation: none; }
  .setup-input, .setup-submit { transition: none; }
}
</style>
