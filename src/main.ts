import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
import { i18n } from './i18n'
import { useAuthStore } from './stores/auth'
import { useCatalogStore } from './stores/catalog'
import './styles/tokens.css'
import './styles/main.css'
import './styles/workspace.css'
import './styles/landing.css'
import './styles/legal.css'
import './styles/prompt-library.css'
import './styles/office.css'
import './styles/plugins.css'
import './styles/canvas.css'
import './styles/image-prompt.css'
import './styles/skin-jixing.css'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia).use(router).use(i18n)

async function bootstrap() {
  // Resolve the public catalog alongside the cookie-backed session. Mounting
  // only after the catalog arrives prevents the default GPT layout from
  // flashing before the administrator-selected UI preset is applied. A
  // stalled backend still cannot block the shell beyond the short deadline;
  // the catalog store keeps the last known preset in localStorage.
  let deadline: ReturnType<typeof globalThis.setTimeout> | undefined
  const deadlineReached = new Promise<void>((resolve) => {
    deadline = globalThis.setTimeout(resolve, 8_000)
  })
  try {
    const auth = useAuthStore(pinia)
    const catalog = useCatalogStore(pinia)
    await Promise.race([
      Promise.all([auth.refresh().catch(() => undefined), catalog.load().catch(() => undefined)]),
      deadlineReached,
    ])
  } finally {
    if (deadline !== undefined) globalThis.clearTimeout(deadline)
  }
  app.mount('#app')
}

void bootstrap()
