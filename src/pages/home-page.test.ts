import { screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { server } from '@/test/msw'
import { renderRoutes, route } from '@/test/render'
import { spotifyHandlers } from '@/test/spotify-mocks'
import { loggedInStorage } from '@/test/storage'
import HomePage from './HomePage.vue'
import NotFoundPage from './NotFoundPage.vue'

const routes = [
  route('/', HomePage, { name: 'home' }),
  route('/playlists/:id', NotFoundPage, { name: 'playlist' }),
]

describe('home page (logged in)', () => {
  it('lists playlists, links mixable ones and explains followed ones', async () => {
    server.use(...spotifyHandlers())
    await renderRoutes({ routes, storage: loggedInStorage() })
    const wcs = await screen.findByRole('link', { name: /WCS/ })
    expect(wcs).toHaveAttribute('href', '/camelont/playlists/wcs')
    expect(wcs).toHaveTextContent('20 tracks · by me')
    expect(screen.queryByRole('link', { name: /Top Hits/ })).toBeNull()
    expect(screen.getByText(/Followed, can’t be mixed/)).toBeInTheDocument()
  })

  it('filters by name', async () => {
    server.use(...spotifyHandlers())
    await renderRoutes({ routes, storage: loggedInStorage() })
    await screen.findByRole('link', { name: /WCS/ })
    await userEvent.type(screen.getByRole('searchbox'), 'top')
    expect(screen.queryByRole('link', { name: /WCS/ })).toBeNull()
    expect(screen.getByText('Top Hits')).toBeInTheDocument()
  })
})
