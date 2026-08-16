import { createRouter, createWebHistory } from 'vue-router'

const LandingPage = () => import('./views/LandingPage.vue')
const LoginPage = () => import('./views/LoginPage.vue')
const StudioPage = () => import('./views/StudioPage.vue')
const OfficeCenterPage = () => import('./views/OfficeCenterPage.vue')
const PromptLibraryPage = () => import('./views/PromptLibraryPage.vue')
const CapabilityCenterPage = () => import('./views/CapabilityCenterPage.vue')
const WorkspaceLayout = () => import('./components/WorkspaceLayout.vue')
const ApiLandingPage = () => import('./views/ApiLandingPage.vue')
const LegalPage = () => import('./views/LegalPage.vue')
const SharedConversationPage = () => import('./views/SharedConversationPage.vue')
const InstallPage = () => import('./views/InstallPage.vue')
const AdminRedirect = { render: () => null }

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'landing', component: LandingPage, meta: { title: 'Xinyue AI' } },
    { path: '/login', name: 'login', component: LoginPage, meta: { title: '登录' } },
    { path: '/install', name: 'install', component: InstallPage, meta: { title: '首次安装' } },
    {
      path: '/workspace',
      component: WorkspaceLayout,
      children: [
        { path: '/chat', name: 'chat', component: StudioPage, meta: { title: '对话' } },
        { path: '/image', name: 'images', component: StudioPage, meta: { title: '图片创作' } },
        { path: '/video', name: 'videos', component: StudioPage, meta: { title: '视频创作' } },
        { path: '/commerce', name: 'commerce', component: StudioPage, meta: { title: '商品视觉' } },
        { path: '/office', name: 'office', component: OfficeCenterPage, meta: { title: '办公中心' } },
        { path: '/agents', redirect: '/office' },
        { path: '/prompts', name: 'prompts', component: PromptLibraryPage, meta: { title: '提示词库' } },
        { path: '/capabilities', name: 'plugins', component: CapabilityCenterPage, meta: { title: '能力中心' } },
        { path: '/plugins', redirect: '/capabilities' },
        { path: '/projects', name: 'projects', component: StudioPage, meta: { title: '项目' } },
        { path: '/files', name: 'assets', component: StudioPage, meta: { title: '文件库' } },
      ],
    },
    { path: '/api', name: 'api', component: ApiLandingPage, meta: { title: 'API' } },
    { path: '/about', name: 'about', component: LegalPage, meta: { title: '关于我们' } },
    { path: '/copyright', name: 'copyright', component: LegalPage, meta: { title: '版权说明' } },
    { path: '/privacy', name: 'privacy', component: LegalPage, meta: { title: '隐私政策' } },
    { path: '/terms', name: 'terms', component: LegalPage, meta: { title: '用户协议' } },
    { path: '/share/:token', name: 'shared-conversation', component: SharedConversationPage, meta: { title: '共享对话' } },
    {
      path: '/admin/:pathMatch(.*)*',
      component: AdminRedirect,
      beforeEnter: () => {
        window.location.assign(import.meta.env.DEV ? 'http://localhost:5174/admin/' : '/admin/')
        return false
      },
    },
    { path: '/studio/:mode?', redirect: (to) => `/${to.params.mode === 'images' ? 'image' : to.params.mode || 'chat'}` },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

router.beforeEach(async (to) => {
  const { installationStatus } = await import('./services/installation')
  const status = await installationStatus()
  if (status && (!status.installed || status.restartRequired) && to.name !== 'install') return { name: 'install' }
  if (status?.installed && !status.restartRequired && to.name === 'install') return { name: 'landing' }
})

router.afterEach((to) => {
  document.title = to.meta.title ? `${String(to.meta.title)} | Xinyue AI` : 'Xinyue AI'
})
