<template>
  <div class="flex w-full h-screen">
    <LoginLeftView />
    <div class="relative flex-1">
      <AuthTopBar />
      <div class="auth-right-wrap">
        <div class="form">
          <span class="login-kicker">XINYUE AI CONSOLE</span>
          <h3 class="title">{{ xt('管理后台登录') }}</h3>
          <p class="sub-title">{{ xt('使用管理员账户进入运营控制台') }}</p>
          <ElForm
            ref="formRef"
            :model="formData"
            :rules="rules"
            style="margin-top: 30px"
            @keyup.enter="handleSubmit"
          >
            <ElFormItem prop="email">
              <ElInput
                v-model.trim="formData.email"
                class="custom-height"
                type="email"
                autocomplete="username"
                :placeholder="xt('管理员邮箱')"
              >
                <template #prefix><ArtSvgIcon icon="ri:mail-line" /></template>
              </ElInput>
            </ElFormItem>
            <ElFormItem prop="password">
              <ElInput
                v-model="formData.password"
                ref="passwordInputRef"
                class="custom-height"
                type="password"
                autocomplete="current-password"
                show-password
                :placeholder="xt('密码')"
              >
                <template #prefix><ArtSvgIcon icon="ri:lock-password-line" /></template>
              </ElInput>
            </ElFormItem>
            <div class="flex-cb mt-2 text-sm">
              <ElCheckbox v-model="formData.rememberPassword">{{ xt('保持登录状态') }}</ElCheckbox>
              <span class="login-security"><i />{{ xt('安全会话') }}</span>
            </div>
            <ElButton
              class="w-full custom-height login-submit"
              type="primary"
              :loading="loading"
              @click="handleSubmit"
              >{{ xt('进入管理后台') }}</ElButton
            >
          </ElForm>
          <p v-if="loginError" class="login-error" role="alert">{{ loginError }}</p>
          <p class="login-note">{{ xt('管理员账户由系统初始化或现有超级管理员创建。') }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import type { FormInstance, FormRules } from 'element-plus'
  import { ElNotification } from 'element-plus'
  import { fetchLogin, toAdminUserInfo } from '@/api/auth'
  import { isHttpError } from '@/utils/http/error'
  import { HOME_PAGE_PATH } from '@/router'
  import { resetRouterStateNow } from '@/router/guards/beforeEach'
  import { useUserStore } from '@/store/modules/user'
  import { xinyueText as xt } from '@/locales/xinyue'

  defineOptions({ name: 'Login' })

  const formRef = ref<FormInstance>()
  const loading = ref(false)
  const loginError = ref('')
  const passwordInputRef = ref<{ focus?: () => void }>()
  const userStore = useUserStore()
  const router = useRouter()
  const route = useRoute()
  const formData = reactive({ email: '', password: '', rememberPassword: true })
  const rules: FormRules = {
    email: [
      { required: true, message: xt('请输入管理员邮箱'), trigger: 'blur' },
      { type: 'email', message: xt('邮箱格式不正确'), trigger: 'blur' }
    ],
    password: [{ required: true, min: 8, message: xt('请输入至少 8 位密码'), trigger: 'blur' }]
  }

  async function handleSubmit() {
    if (loading.value) return
    if (!formRef.value || !(await formRef.value.validate().catch(() => false))) return
    loading.value = true
    loginError.value = ''
    try {
      const session = await fetchLogin({
        email: formData.email,
        password: formData.password,
        remember: formData.rememberPassword
      })
      resetRouterStateNow()
      userStore.setUserInfo(toAdminUserInfo(session.user))
      userStore.setToken('cookie-session')
      userStore.setLoginStatus(true)
      userStore.checkAndClearWorktabs()
      ElNotification({
        title: xt('登录成功'),
        message: xt('欢迎回到 Xinyue AI 管理后台'),
        type: 'success',
        duration: 2200
      })
      const requestedPath =
        typeof route.query.redirect === 'string' ? route.query.redirect : HOME_PAGE_PATH
      const redirectPath =
        requestedPath === '/xinyue/overview' || !requestedPath.startsWith('/')
          ? HOME_PAGE_PATH
          : requestedPath
      await router.replace(redirectPath)
    } catch (error) {
      if (!isHttpError(error)) throw error
      loginError.value = error.message
      formData.password = ''
      await nextTick()
      passwordInputRef.value?.focus?.()
    } finally {
      loading.value = false
    }
  }
</script>

<style scoped>
  @import './style.css';

  .login-kicker {
    display: block;
    margin-bottom: 12px;
    font-size: 12px;
    font-weight: 700;
    color: var(--main-color);
    letter-spacing: 0;
  }

  .login-submit {
    margin-top: 30px;
    font-weight: 600;
  }

  .login-security {
    display: inline-flex;
    gap: 7px;
    align-items: center;
    color: var(--art-gray-500);
  }

  .login-security i {
    width: 7px;
    height: 7px;
    background: var(--el-color-success);
    border-radius: 50%;
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--el-color-success) 18%, transparent);
  }

  .login-note {
    margin-top: 24px;
    font-size: 12px;
    line-height: 1.7;
    color: var(--art-gray-500);
  }

  .login-error {
    margin: 14px 0 0;
    color: var(--el-color-danger);
    font-size: 13px;
    line-height: 1.5;
  }
</style>
