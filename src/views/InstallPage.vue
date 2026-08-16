<template>
  <main class="install-page">
    <header class="install-header"><div class="install-brand"><span>X</span><strong>Xinyue AI</strong></div><small>部署向导</small></header>
    <section class="install-layout">
      <aside class="install-progress">
        <div><strong>首次安装</strong><p>连接基础服务，设置站点并创建第一个超级管理员。</p></div>
        <ol><li v-for="item in steps" :key="item.value" :class="{ active: step === item.value, done: step > item.value }"><span><Check v-if="step > item.value" :size="15" /><component :is="item.icon" v-else :size="15" /></span><div><strong>{{ item.title }}</strong><small>{{ item.note }}</small></div></li></ol>
        <footer><LockKeyhole :size="15" />安装完成后入口自动锁定</footer>
      </aside>
      <section class="install-content">
        <div v-if="loading" class="install-loading"><LoaderCircle :size="22" /><span>正在检查部署状态</span></div>
        <div v-else-if="locked" class="install-locked"><span><TriangleAlert :size="26" /></span><h1>安装入口已锁定</h1><p>{{ error || '当前无法连接已安装的数据库。' }}</p><div>请检查服务端 <code>DATABASE_URL</code>、PostgreSQL 服务和网络连接，恢复后重启 API。</div><button type="button" :disabled="checkingRestart" @click="reloadStatus"><RefreshCw :class="{ 'install-spin': checkingRestart }" :size="16" />重新检测</button></div>
        <template v-else-if="step === 1">
          <header><span>步骤 1 / 3</span><h1>连接基础服务</h1><p>系统将测试 PostgreSQL 和 Redis，并自动执行数据库迁移。</p></header>
          <form class="install-form" @submit.prevent="configureDatabase">
            <label><span>安装密钥</span><input v-model="form.installToken" type="password" autocomplete="off" minlength="8" placeholder="从后端启动日志获取" required /><small>密钥只在后端启动日志输出一次。</small></label>
            <label><span>PostgreSQL 地址</span><input v-model.trim="form.databaseUrl" autocomplete="off" placeholder="postgresql://user:password@localhost:5432/xinyue" required /></label>
            <label><span>Redis 地址</span><input v-model.trim="form.redisUrl" autocomplete="off" placeholder="redis://localhost:6379" required /></label>
            <div class="install-note"><ServerCog :size="17" />连接密码只写入服务端运行配置，不进入浏览器存储或业务数据库。</div>
            <p v-if="error" class="install-error">{{ error }}</p><button type="submit" :disabled="busy"><LoaderCircle v-if="busy" class="install-spin" :size="17" /><DatabaseZap v-else :size="17" />{{ busy ? '正在测试并迁移' : '测试连接并继续' }}</button>
          </form>
        </template>
        <template v-else-if="step === 2">
          <header><span>步骤 2 / 3</span><h1>设置网站信息</h1><p>这些内容可以在安装完成后继续通过管理后台修改。</p></header>
          <form class="install-form" @submit.prevent="step = 3; error = ''">
            <div class="install-grid"><label><span>网站名称</span><input v-model.trim="form.siteName" maxlength="100" required /></label><label><span>网站地址</span><input v-model.trim="form.siteUrl" type="url" required /></label></div>
            <label><span>Logo 地址 <em>可选</em></span><input v-model.trim="form.siteLogoUrl" type="url" placeholder="https://..." /></label><label><span>客服地址 <em>可选</em></span><input v-model.trim="form.supportUrl" type="url" placeholder="https://..." /></label>
            <label class="install-toggle"><input v-model="form.registrationEnabled" type="checkbox" /><span><strong>开放用户注册</strong><small>允许用户使用站内账户注册</small></span></label>
            <div class="install-actions"><button class="secondary" type="button" @click="step = 1"><ChevronLeft :size="17" />上一步</button><button type="submit">继续<ChevronRight :size="17" /></button></div>
          </form>
        </template>
        <template v-else-if="step === 3">
          <header><span>步骤 3 / 3</span><h1>创建超级管理员</h1><p>请使用独立邮箱和不少于 12 位的高强度密码。</p></header>
          <form class="install-form" @submit.prevent="completeInstall">
            <label><span>显示名称</span><input v-model.trim="form.adminDisplayName" autocomplete="name" maxlength="100" required /></label><label><span>管理员邮箱</span><input v-model.trim="form.adminEmail" type="email" autocomplete="username" required /></label><label><span>管理员密码</span><input v-model="form.adminPassword" type="password" autocomplete="new-password" minlength="12" required /></label><label><span>确认密码</span><input v-model="confirmPassword" type="password" autocomplete="new-password" minlength="12" required /></label>
            <p v-if="error" class="install-error">{{ error }}</p><div class="install-actions"><button class="secondary" type="button" @click="step = 2"><ChevronLeft :size="17" />上一步</button><button type="submit" :disabled="busy"><LoaderCircle v-if="busy" class="install-spin" :size="17" /><ShieldCheck v-else :size="17" />{{ busy ? '正在完成安装' : '完成安装' }}</button></div>
          </form>
        </template>
        <div v-else class="install-complete"><span><Check :size="28" /></span><h1>安装完成</h1><p>站点和超级管理员已创建，重启服务后进入正式运行模式。</p><div><strong>{{ form.siteName }}</strong><small>{{ form.siteUrl }}</small></div><button type="button" @click="checkRestart"><LoaderCircle v-if="checkingRestart" class="install-spin" :size="17" />{{ checkingRestart ? '正在等待服务重启' : '检查服务并进入网站' }}</button><a href="/admin/">打开管理后台</a></div>
      </section>
    </section>
  </main>
</template>

<script setup lang="ts">
import { markRaw, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Check, ChevronLeft, ChevronRight, Database, DatabaseZap, Globe2, LoaderCircle, LockKeyhole, RefreshCw, ServerCog, ShieldCheck, TriangleAlert, UserRoundCog } from 'lucide-vue-next'
import { api } from '../services/api'
import { clearInstallationStatus, installationStatus, type InstallationStatus } from '../services/installation'

const router = useRouter()
const steps = [{ value: 1, title: '基础服务', note: 'PostgreSQL 与 Redis', icon: markRaw(Database) }, { value: 2, title: '网站信息', note: '名称与访问地址', icon: markRaw(Globe2) }, { value: 3, title: '超级管理员', note: '创建管理账户', icon: markRaw(UserRoundCog) }]
const loading = ref(true), busy = ref(false), checkingRestart = ref(false), locked = ref(false)
const error = ref(''), step = ref(1), confirmPassword = ref('')
const form = reactive({ installToken: '', databaseUrl: '', redisUrl: 'redis://localhost:6379', siteName: 'Xinyue AI', siteUrl: window.location.origin, siteLogoUrl: '', supportUrl: '', registrationEnabled: true, adminDisplayName: '系统管理员', adminEmail: '', adminPassword: '' })

function applyStatus(status: InstallationStatus | null) {
  locked.value = Boolean(status?.locked)
  if (!status) { error.value = '无法连接安装服务，请确认后端已经启动'; return }
  if (status.locked) { error.value = status.databaseError || '数据库连接异常'; return }
  if (status.installed) { if (status.restartRequired) step.value = 4; else void router.replace('/'); return }
  if (status.siteName) form.siteName = status.siteName
  step.value = status.phase === 'database' ? 1 : 2
  error.value = status.databaseError || ''
}
async function reloadStatus() { checkingRestart.value = true; clearInstallationStatus(); applyStatus(await installationStatus(true)); checkingRestart.value = false }
async function configureDatabase() { busy.value = true; error.value = ''; try { await api('/install/database', { method: 'POST', body: JSON.stringify({ installToken: form.installToken, databaseUrl: form.databaseUrl, redisUrl: form.redisUrl }) }); clearInstallationStatus(); step.value = 2 } catch (reason) { error.value = reason instanceof Error ? reason.message : '基础服务配置失败' } finally { busy.value = false } }
async function completeInstall() { if (form.adminPassword !== confirmPassword.value) { error.value = '两次输入的管理员密码不一致'; return } busy.value = true; error.value = ''; try { const { siteLogoUrl, supportUrl, ...required } = form; await api('/install/complete', { method: 'POST', body: JSON.stringify({ ...required, ...(siteLogoUrl ? { siteLogoUrl } : {}), ...(supportUrl ? { supportUrl } : {}) }) }); clearInstallationStatus(); step.value = 4 } catch (reason) { error.value = reason instanceof Error ? reason.message : '安装未能完成' } finally { busy.value = false } }
async function checkRestart() { checkingRestart.value = true; for (let attempt = 0; attempt < 20; attempt += 1) { clearInstallationStatus(); const status = await installationStatus(true); if (status?.installed && !status.restartRequired) { window.location.assign('/login'); return } await new Promise((resolve) => window.setTimeout(resolve, 1500)) } checkingRestart.value = false; error.value = '服务尚未重启，请重启后端后再次检查' }
onMounted(async () => { applyStatus(await installationStatus(true)); loading.value = false })
</script>
