import { screen, waitFor } from '@testing-library/vue'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { server } from '@/test/msw'
import { renderRoutes, route } from '@/test/render'
import { RECCOBEATS, SPOTIFY } from '@/test/spotify-mocks'
import { loggedInStorage } from '@/test/storage'
import { copyOf, CORE, setOf, storeOf } from '@/test/workspace'
import NotFoundPage from './NotFoundPage.vue'
import SetPage from './SetPage.vue'

vi.setConfig({ testTimeout: 30_000 })

const routes = [
  route('/', NotFoundPage, { name: 'home' }),
  route('/sets/:id', SetPage, { name: 'set', props: true, meta: { requiresAuth: true } }),
]

const friday = setOf([copyOf('wcs', 'WCS', CORE.slice(0, 4))])
const saturday = {
  ...setOf([copyOf('odd', 'Odd ones', CORE.slice(4))]),
  id: 'saturday',
  name: 'Saturday social',
}

function open(path: string) {
  server.use(
    http.get(`${SPOTIFY}/me`, () => HttpResponse.json({ id: 'me' })),
    http.get(`${SPOTIFY}/playlists/:id`, ({ params }) =>
      HttpResponse.json({
        id: params.id,
        name: 'A playlist',
        images: [],
        owner: { id: 'me' },
        snapshot_id: 'snap-1',
      }),
    ),
    // No track has data here: the page is about which set is open, not its mix.
    http.get(`${RECCOBEATS}/audio-features`, () => HttpResponse.json({ content: [] })),
  )
  return renderRoutes({
    routes,
    path,
    storage: loggedInStorage(),
    setsStore: storeOf(friday, saturday),
  })
}

describe('set page', () => {
  it('opens the workspace of the set in the address', async () => {
    await open('/sets/friday')
    expect(await screen.findByRole('heading', { level: 1, name: 'Friday social' })).toBeVisible()
    expect(screen.getByRole('region', { name: 'WCS' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to your sets' })).toHaveAttribute(
      'href',
      '/camelont/',
    )
  })

  it('gives another set its own workspace when the address changes', async () => {
    const { router } = await open('/sets/friday')
    await screen.findByRole('region', { name: 'WCS' })
    await router.push('/sets/saturday')
    expect(await screen.findByRole('heading', { level: 1, name: 'Saturday social' })).toBeVisible()
    expect(await screen.findByRole('region', { name: 'Odd ones' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'WCS' })).toBeNull()
    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'Set name' })).toHaveValue('Saturday social')
    })
  })

  it('says so when no set has that ID', async () => {
    await open('/sets/nope')
    expect(await screen.findByRole('heading', { name: 'Set not found' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Back to your sets' })).toBeInTheDocument()
  })

  it('needs a login', async () => {
    const { router } = await renderRoutes({ routes, path: '/sets/friday' })
    expect(router.currentRoute.value.name).toBe('home')
  })
})
