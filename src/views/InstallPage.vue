<template>
  <main class="install-page">
    <header class="install-header">
      <div class="install-brand"><span>X</span><strong>Xinyue AI</strong></div>
      <span>首次安装</span>
    </header>

    <section class="install-layout">
      <aside class="install-progress" aria-label="安装进度">
        <div><strong>部署向导</strong><p>连接基础服务并创建首个管理账户。</p></div>
        <ol>
          <li :class="{ active: step === 1, done: step > 1 }"><span><Check v-if="step > 1" :size="15" /><Database v-else :size="15" /></span><div><strong>服务连接</strong><small>PostgreSQL 与 Redis</small></div></li>
          <li :class="{ active: step === 2, done: step > 2 }"><span><Check v-if="step > 2" :size="15" /><PanelsTopLeft v-else :size="15" /></span><div><strong>网站信息</strong><small>名称、地址与访问策略</small></div></li>
          <li :class="{ active: step === 3, done: step > 3 }"><span><Check v-if="step > 3" :size="15" /><ShieldCheck v-else :size="15" /></span><div><strong>管理员</strong><small>创建超级管理员账户</small></div></li>
        </ol>
        <footer><LockKeyhole :size="15" />安装完成后入口将自动锁定</footer>
      </aside>

      <section class="install-content">
        <div v-if="loading" class="install-loading"><LoaderCircle :size="24" /><span>正在检查部署状态</span></div>

        <div v-else-if="locked" class="install-locked">
          <span><TriangleAlert :size="28" /></span>
          <h1>数据库连接异常</h1>
          <p>{{ error || '当前无法连接已经安装的数据库。' }}</p>
          <div>
            安装入口已经锁定。请检查服务端的 <code>DATABASE_URL</code>、PostgreSQL 服务和网络连接，恢复后重启 API。
          </div>
          <button type="button" :disabled="checkingRestart" @click="reloadStatus">
            <RefreshCw :class="{ 'install-spin': checkingRestart }" :size="17" />
            {{ checkingRestart ? '正在重新检测' : '重新检测' }}
          </button>
        </div>

        <template v-else-if="step === 1">
          <header><span>步骤 1 / 3</span><h1>连接基础服务</h1><p>填写部署环境中的 PostgreSQL 和 Redis 地址，系统会测试连接并执行数据库迁移。</p></header>
          <form class="install-form" @submit.prevent="configureDatabase">
            <label><span>安装密钥</span><input v-model="form.installToken" type="password" autocomplete="off" minlength="8" placeholder="从后端启动日志中获取" required /><small>服务启动日志会输出一次“首次安装密钥”。</small></label>
            <label><span>PostgreSQL 连接地址</span><input v-model.trim="form.databaseUrl" autocomplete="off" placeholder="postgresql://user:password@postgres:5432/xinyue" required /></label>
            <label><span>Redis 连接地址</span><input v-model.trim="form.redisUrl" autocomplete="off" placeholder="redis://redis:6379" required /></label>
            <div class="install-note"><ServerCog :size="17" /><span>数据库密码只写入服务端运行配置，不会保存到浏览器或业务数据库。</span></div>
            <p v-if="error" class="install-error" role="alert">{{ error }}</p>
            <button type="submit" :disabled="busy"><LoaderCircle v-if="busy" class="install-spin" :size="17" /><DatabaseZap v-else :size="17" />{{ busy ? '正在测试并迁移' : '测试连接并继续' }}</button>
          </form>
        </template>

        <template v-else-if="step === 2">
          <header><span>步骤 2 / 3</span><h1>设置网站信息</h1><p>这些信息会成为用户首次看到的站点身份，后续可以在管理后台继续修改。</p></header>
          <form class="install-form" @submit.prevent="step = 3; error = ''">
            <div class="install-grid">
              <label><span>网站名称</span><input v-model.trim="form.siteName" maxlength="100" placeholder="Xinyue AI" required /></label>
              <label><span>网站地址</span><input v-model.trim="form.siteUrl" type="url" placeholder="https://ai.example.com" required /></label>
            </div>
            <label><span>Logo 地址 <em>可选</em></span><input v-model.trim="form.siteLogoUrl" type="url" placeholder="https://cdn.example.com/logo.png" /></label>
            <label><span>客服地址 <em>可选</em></span><input v-model.trim="form.supportUrl" type="url" placeholder="https://support.example.com" /></label>
            <label class="install-toggle"><input v-model="form.registrationEnabled" type="checkbox" /><span><strong>开放用户注册</strong><small>安装后允许用户使用账号和密码创建账户</small></span></label>
            <p v-if="error" class="install-error" role="alert">{{ error }}</p>
            <div class="install-actions"><button class="secondary" type="button" @click="step = 1"><ChevronLeft :size="17" />上一步</button><button type="submit">继续创建管理员<ChevronRight :size="17" /></button></div>
          </form>
        </template>

        <template v-else-if="step === 3">
          <header><span>步骤 3 / 3</span><h1>创建超级管理员</h1><p>该账户拥有全部管理权限。请使用独立邮箱和不少于 12 位的高强度密码。</p></header>
          <form class="install-form" @submit.prevent="completeInstall">
            <label><span>显示名称</span><input v-model.trim="form.adminDisplayName" maxlength="100" autocomplete="name" placeholder="系统管理员" required /></label>
            <label><span>管理员邮箱</span><input v-model.trim="form.adminEmail" type="email" autocomplete="username" placeholder="admin@example.com" required /></label>
            <label><span>管理员密码</span><input v-model="form.adminPassword" type="password" autocomplete="new-password" minlength="12" placeholder="至少 12 位" required /></label>
            <label><span>确认密码</span><input v-model="confirmPassword" type="password" autocomplete="new-password" minlength="12" placeholder="再次输入密码" required /></label>
            <div class="install-summary"><div><Globe2 :size="16" /><span><strong>{{ form.siteName }}</strong><small>{{ form.siteUrl }}</small></span></div><div><UserRoundCog :size="16" /><span><strong>{{ form.adminDisplayName }}</strong><small>{{ form.adminEmail }}</small></span></div></div>
            <p v-if="error" class="install-error" role="alert">{{ error }}</p>
            <div class="install-actions"><button class="secondary" type="button" @click="step = 2"><ChevronLeft :size="17" />上一步</button><button type="submit" :disabled="busy"><LoaderCircle v-if="busy" class="install-spin" :size="17" /><ShieldCheck v-else :size="17" />{{ busy ? '正在完成安装' : '完成安装' }}</button></div>
          </form>
        </template>

        <template v-else>
          <div class="install-complete"><span><Check :size="28" /></span><h1>安装完成</h1><p>网站与超级管理员已经创建。服务重启后将自动关闭安装入口并进入正式运行模式。</p><div><strong>{{ form.siteName }}</strong><small>{{ form.siteUrl }}</small></div><button type="button" @click="checkRestart"><LoaderCircle v-if="checkingRestart" class="install-spin" :size="17" />{{ checkingRestart ? '正在等待服务重启' : '检查服务并进入网站' }}</button><a href="/admin/">打开管理后台</a></div>
        </template>
      </section>
    </section>
  </main>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Check, ChevronLeft, ChevronRight, Database, DatabaseZap, Globe2, LoaderCircle, LockKeyhole, PanelsTopLeft, RefreshCw, ServerCog, ShieldCheck, TriangleAlert, UserRoundCog } from 'lucide-vue-next'
import { api } from '../services/api'
import { clearInstallationStatus, installationStatus, type InstallationStatus } from '../services/installation'

const router = useRouter()
const loading = ref(true)
const busy = ref(false)
const checkingRestart = ref(false)
const locked = ref(false)
const error = ref('')
const step = ref(1)
const confirmPassword = ref('')
const form = reactive({
  installToken: '', databaseUrl: '', redisUrl: 'redis://localhost:6379', siteName: 'Xinyue AI', siteUrl: window.location.origin,
  siteLogoUrl: '', supportUrl: '', registrationEnabled: true, adminDisplayName: '系统管理员', adminEmail: '', adminPassword: '',
})

function applyStatus(status: InstallationStatus | null) {
  locked.value = Boolean(status?.locked)
  if (!status) { error.value = '无法连接安装服务，请确认后端已经启动'; step.value = 1; return }
  if (status.locked) { error.value = status.databaseError || '数据库连接异常'; step.value = 1; return }
  if (status.installed) {
    if (status.restartRequired) { step.value = 4; return }
    void router.replace('/'); return
  }
  if (status.siteName) form.siteName = status.siteName
  step.value = status.phase === 'database' ? 1 : 2
  if (status.databaseError) error.value = status.databaseError
}

async function reloadStatus() {
  checkingRestart.value = true
  clearInstallationStatus()
  applyStatus(await installationStatus(true))
  checkingRestart.value = false
}

async function configureDatabase() {
  busy.value = true; error.value = ''
  try {
    await api('/install/database', { method: 'POST', body: JSON.stringify({ installToken: form.installToken, databaseUrl: form.databaseUrl, redisUrl: form.redisUrl }) })
    clearInstallationStatus(); step.value = 2
  } catch (reason) { error.value = reason instanceof Error ? reason.message : '基础服务配置失败' }
  finally { busy.value = false }
}

async function completeInstall() {
  if (form.adminPassword !== confirmPassword.value) { error.value = '两次输入的管理员密码不一致'; return }
  busy.value = true; error.value = ''
  try {
    const { siteLogoUrl, supportUrl, ...required } = form
    await api('/install/complete', { method: 'POST', body: JSON.stringify({ ...required, ...(siteLogoUrl ? { siteLogoUrl } : {}), ...(supportUrl ? { supportUrl } : {}) }) })
    clearInstallationStatus(); step.value = 4
  } catch (reason) { error.value = reason instanceof Error ? reason.message : '安装未能完成' }
  finally { busy.value = false }
}

async function checkRestart() {
  checkingRestart.value = true; error.value = ''
  for (let attempt = 0; attempt < 20; attempt += 1) {
    clearInstallationStatus()
    const status = await installationStatus(true)
    if (status?.installed && !status.restartRequired) { window.location.assign('/login'); return }
    await new Promise((resolve) => window.setTimeout(resolve, 1500))
  }
  checkingRestart.value = false
  error.value = '服务尚未重启，请重启后端后再次检查'
}

onMounted(async () => { applyStatus(await installationStatus(true)); loading.value = false })
</script>
