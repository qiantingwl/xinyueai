import { createRouter, createWebHistory } from 'vue-router'
import { api } from './services/api'

const LandingPage = () => import('./views/LandingPage.vue')
const LoginPage = () => import('./views/LoginPage.vue')
const InstallPage = () => import('./views/InstallPage.vue')
const StudioPage = () => import('./views/StudioPage.vue')
const OfficeCenterPage = () => import('./views/OfficeCenterPage.vue')
const PromptLibraryPage = () => import('./views/PromptLibraryPage.vue')
const WorksPage = () => import('./views/WorksPage.vue')
const CapabilityCenterPage = () => import('./views/CapabilityCenterPage.vue')
const CanvasLibraryPage = () => import('./views/CanvasLibraryPage.vue')
const CanvasEditorPage = () => import('./views/CanvasEditorPage.vue')
const ImagePromptPage = () => import('./views/ImagePromptPage.vue')
const WorkspaceLayout = () => import('./components/WorkspaceLayout.vue')
const LegalPage = () => import('./views/LegalPage.vue')
const SharedConversationPage = () => import('./views/SharedConversationPage.vue')
const AdminRedirect = { render: () => null }

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'landing', component: LandingPage, meta: { title: 'Xinyue AI' } },
    { path: '/login', name: 'login', component: LoginPage, meta: { title: '登录' } },
    { path: '/install', name: 'install', component: InstallPage, meta: { title: '初始化' } },
    {
      path: '/workspace',
      component: WorkspaceLayout,
      children: [
        { path: '/chat', name: 'chat', component: StudioPage, meta: { title: '对话' } },
        { path: '/image', name: 'images', component: StudioPage, meta: { title: '图片创作' } },
        { path: '/video', name: 'videos', component: StudioPage, meta: { title: '视频创作' } },
        { path: '/commerce', name: 'commerce', component: StudioPage, meta: { title: '商品视觉' } },
        { path: '/office', name: 'office', component: OfficeCenterPage, meta: { title: '办公中心' } },
        { path: '/prompts', name: 'prompts', component: PromptLibraryPage, meta: { title: '提示词库' } },
        { path: '/capabilities', name: 'capabilities', component: CapabilityCenterPage, meta: { title: '能力中心' } },
        { path: '/works', name: 'works', component: WorksPage, meta: { title: '作品中心' } },
        { path: '/canvases', name: 'canvases', component: CanvasLibraryPage, meta: { title: '画布' } },
        { path: '/image-prompt', name: 'image-prompt', component: ImagePromptPage, meta: { title: '图片反推' } },
        { path: '/canvas/:id', name: 'canvas', component: CanvasEditorPage, meta: { title: '画布编辑器' } },
        { path: '', name: 'workspace', component: StudioPage, meta: { title: '工作空间' } },
      ],
    },
    { path: '/about', name: 'about', component: LegalPage, meta: { title: '关于我们' } },
    { path: '/copyright', name: 'copyright', component: LegalPage, meta: { title: '版权说明' } },
    { path: '/privacy', name: 'privacy', component: LegalPage, meta: { title: '隐私政策' } },
    { path: '/terms', name: 'terms', component: LegalPage, meta: { title: '用户协议' } },
    { path: '/share/:token', name: 'shared-conversation', component: SharedConversationPage, meta: { title: '共享对话' } },
    { path: '/plugins', redirect: '/capabilities' },
    { path: '/agents', redirect: '/office' },
    { path: '/projects', redirect: '/workspace?tab=projects' },
    { path: '/files', redirect: '/workspace?tab=files' },
    {
      path: '/studio/:mode?',
      redirect: (to) => {
        const mode = String(to.params.mode || '')
        if (mode === 'images' || mode === 'image') return '/image'
        if (mode === 'videos' || mode === 'video') return '/video'
        if (mode === 'commerce') return '/commerce'
        return '/chat'
      },
    },
    {
      path: '/admin/:pathMatch(.*)*',
      component: AdminRedirect,
      beforeEnter: () => {
        window.location.assign(import.meta.env.DEV ? 'http://localhost:5174/admin/' : '/admin/')
        return false
      },
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

let setupState: 'unknown' | 'required' | 'complete' = 'unknown'
router.beforeEach(async (to) => {
  if (setupState === 'unknown') {
    try {
      setupState = (await api<{ required: boolean }>('/auth/setup/status', { timeoutMs: 8_000 })).required ? 'required' : 'complete'
    } catch {
      // An unavailable backend does not mean this installation is incomplete.
      // Keep the requested route and retry the probe on the next navigation.
      return true
    }
  }
  if (setupState === 'required') return to.name === 'install' ? true : { path: '/install', query: { redirect: to.fullPath } }
  if (to.name === 'install') {
    window.location.replace('/admin/#/auth/login')
    return false
  }
  return true
})

router.afterEach((to) => {
  const title = String(to.meta.title || '').trim()
  document.title = title && title !== 'Xinyue AI' ? `${title} | Xinyue AI` : 'Xinyue AI'
})
