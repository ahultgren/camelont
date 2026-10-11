import { screen } from '@testing-library/vue'
import { describe, expect, it } from 'vitest'
import { renderRoutes, route } from '@/test/render'
import { aSet, playlistCopy, setsStorage } from '@/test/sets'
import { loggedInStorage } from '@/test/storage'
import NotFoundPage from './NotFoundPage.vue'
import SetPage from './SetPage.vue'

const routes = [
  route('/', NotFoundPage, { name: 'home' }),
  route('/sets/:id', SetPage, { name: 'set', props: true, meta: { requiresAuth: true } }),
]

const friday = aSet('friday', 'Friday social', [
  playlistCopy('wcs', 'WCS', ['a', 'b', 'c']),
  // A track listed twice counts once.
  playlistCopy('slow', 'Slow ones', ['c', 'd', 'd']),
])

const open = (path: string, raw: Record<string, unknown> = {}) =>
  renderRoutes({
    routes,
    path,
    storage: loggedInStorage(),
    setsStore: setsStorage([friday], raw),
  })

describe('set page', () => {
  it('shows the set’s name and its playlists with their pool sizes', async () => {
    await open('/sets/friday')
    expect(await screen.findByRole('heading', { level: 1, name: 'Friday social' })).toBeVisible()
    const rows = screen.getAllByRole('listitem')
    expect(rows.map((row) => row.textContent)).toEqual(['WCS3 tracks', 'Slow ones2 tracks'])
    expect(screen.getByText(/workspace for mixing a set isn’t built yet/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Your sets/ })).toHaveAttribute('href', '/camelont/')
  })

  it('says so when no set has that ID', async () => {
    await open('/sets/nope')
    expect(await screen.findByRole('heading', { name: 'Set not found' })).toBeVisible()
    expect(screen.getByRole('link', { name: /Your sets/ })).toBeInTheDocument()
  })

  it('reports a stored set that can’t be read, with its ID and the reason', async () => {
    await open('/sets/old', { old: { v: 7, data: { name: 'From the future' } } })
    expect(await screen.findByRole('heading', { name: 'This set can’t be read' })).toBeVisible()
    expect(screen.getByText('old')).toBeInTheDocument()
    expect(screen.getByText(/stored in format version 7/)).toBeInTheDocument()
  })

  it('needs a login', async () => {
    const { router } = await renderRoutes({ routes, path: '/sets/friday' })
    expect(router.currentRoute.value.name).toBe('home')
  })
})
