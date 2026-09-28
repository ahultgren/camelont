import { screen } from '@testing-library/vue'
import { describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import { renderRoutes, route } from '@/test/render'
import { loggedInStorage } from '@/test/storage'
import CallbackPage from './CallbackPage.vue'
import HomePage from './HomePage.vue'

const Secret = defineComponent({ render: () => h('p', 'secret') })
const routes = [
  route('/', HomePage, { name: 'home' }),
  route('/callback', CallbackPage, { name: 'callback' }),
  route('/secret', Secret, { name: 'secret', meta: { requiresAuth: true } }),
]

describe('auth pages', () => {
  it('shows a login button when logged out', async () => {
    await renderRoutes({ routes })
    expect(screen.getByRole('button', { name: 'Log in with Spotify' })).toBeInTheDocument()
  })

  it('redirects logged-out users away from pages that need a login', async () => {
    const { router } = await renderRoutes({ routes, path: '/secret' })
    expect(router.currentRoute.value.name).toBe('home')
  })

  it('lets logged-in users through', async () => {
    const { router } = await renderRoutes({ routes, path: '/secret', storage: loggedInStorage() })
    expect(router.currentRoute.value.name).toBe('secret')
    expect(screen.queryByRole('button', { name: 'Log in with Spotify' })).toBeNull()
  })

  it('explains a callback whose state does not match', async () => {
    window.history.replaceState({}, '', '/camelont/callback?code=abc&state=forged')
    await renderRoutes({ routes, path: '/callback' })
    expect(await screen.findByText('Login didn’t work')).toBeInTheDocument()
    expect(screen.getByText(/didn’t match this browser’s request/)).toBeInTheDocument()
  })
})
