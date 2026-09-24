import { defineStore } from 'pinia'
import { api, ApiError } from '../services/api'

export interface AuthSession {
  id?: string
  email: string
  displayName?: string
  username?: string
  provider: 'password' | 'email' | 'linuxdo' | 'community'
  signedInAt: number
}

const STORAGE_KEY = 'xinyue:auth-session'

function readSession(): AuthSession | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<AuthSession>
    if (!parsed.provider || !parsed.signedInAt) return null
    return {
      email: typeof parsed.email === 'string' ? parsed.email : '',
      id: typeof parsed.id === 'string' ? parsed.id : undefined,
      displayName: typeof parsed.displayName === 'string' ? parsed.displayName : undefined,
      username: typeof parsed.username === 'string' ? parsed.username : undefined,
      provider: ['password', 'email', 'linuxdo', 'community'].includes(parsed.provider) ? parsed.provider as AuthSession['provider'] : 'password',
      signedInAt: parsed.signedInAt,
    }
  } catch {
    return null
  }
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    session: readSession() as AuthSession | null,
  }),
  getters: {
    isAuthenticated: (state) => state.session !== null,
    displayName: (state) => {
      if (!state.session) return ''
      if (state.session.displayName) return state.session.displayName
      if (state.session.username) return state.session.username
      if (state.session.email && !state.session.email.endsWith('@auth.xinyue.local')) return state.session.email.split('@')[0] || 'Xinyue 用户'
      return '社区用户'
    },
    initials(): string {
      return this.displayName.slice(0, 1).toUpperCase() || 'X'
    },
  },
  actions: {
    signIn(email: string, provider: AuthSession['provider']) {
      this.session = { email: email.trim(), provider, signedInAt: Date.now() }
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.session))
    },
    async loginPassword(identifier: string, password: string) {
      const response = await api<{ user: { id: string; email: string | null; username?: string; displayName?: string } }>('/auth/password/login', { method: 'POST', body: JSON.stringify({ identifier, password }) })
      this.persistUser(response.user, 'password')
    },
    async registerPassword(input: { username: string; email?: string; displayName?: string; password: string; inviteCode?: string }) {
      const response = await api<{ user: { id: string; email: string | null; username?: string; displayName?: string } }>('/auth/password/register', { method: 'POST', body: JSON.stringify(input) })
      this.persistUser(response.user, 'password')
    },
    async requestEmailCode(email: string) {
      return api<{ sent: boolean; exists: boolean; registrationRequired: boolean; expiresIn: number; ticket?: string; developmentCode?: string }>('/auth/code/request', {
        method: 'POST',
        body: JSON.stringify({ email }),
      })
    },
    async verifyEmailCode(email: string, code: string) {
      return api<{ user?: { id: string; email: string | null; username?: string; displayName?: string }; registrationRequired?: boolean; ticket?: string }>('/auth/code/verify', {
        method: 'POST',
        body: JSON.stringify({ email, code }),
      }).then((response) => {
        if (response.user) this.persistUser(response.user, 'email')
        return response
      })
    },
    async completeEmailRegistration(input: { ticket: string; username: string; displayName?: string; password: string; inviteCode?: string }) {
      const response = await api<{ user: { id: string; email: string | null; username?: string; displayName?: string } }>('/auth/code/register', {
        method: 'POST',
        body: JSON.stringify(input),
      })
      this.persistUser(response.user, 'email')
    },
    persistUser(user: { id: string; email: string | null; username?: string; displayName?: string }, provider: AuthSession['provider']) {
      this.session = { id: user.id, email: user.email || '', username: user.username, displayName: user.displayName, provider, signedInAt: Date.now() }
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.session))
    },
    async refresh() {
      // The server session is HttpOnly, so localStorage is only a client-side
      // hint. Reconcile with the non-erroring session probe so an admin portal
      // login (or another tab) unlocks the user workspace without a second
      // sign-in step, while public pages do not emit a predictable 401.
      try {
        const response = await api<{ user: { id: string; email: string | null; username?: string; displayName?: string; authMethod?: string } | null }>('/auth/session', { timeoutMs: 8_000 })
        const user = response.user
        if (!user) {
          this.session = null
          window.localStorage.removeItem(STORAGE_KEY)
          return
        }
        const method = ['password', 'email', 'linuxdo'].includes(user.authMethod || '') ? user.authMethod as AuthSession['provider'] : 'community'
        this.session = { id: user.id, email: user.email || '', username: user.username, displayName: user.displayName, provider: method, signedInAt: this.session?.signedInAt || Date.now() }
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.session))
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          this.session = null
          window.localStorage.removeItem(STORAGE_KEY)
        }
        // A public page without a cookie simply remains signed out. Network
        // failures do not erase a local session so offline work can continue.
      }
    },
    async signOut() {
      this.session = null
      window.localStorage.removeItem(STORAGE_KEY)
      await api('/auth/logout', { method: 'POST' }).catch(() => undefined)
    },
  },
})
