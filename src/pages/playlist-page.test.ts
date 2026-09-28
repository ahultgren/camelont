import { screen, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { server } from '@/test/msw'
import { renderRoutes, route } from '@/test/render'
import { reccoBeatsHandler, SPOTIFY, spotifyHandlers } from '@/test/spotify-mocks'
import { loggedInStorage } from '@/test/storage'
import { wcsId } from '@/test/wcs'
import HomePage from './HomePage.vue'
import PlaylistPage from './PlaylistPage.vue'

const routes = [
  route('/', HomePage, { name: 'home' }),
  route('/playlists/:id', PlaylistPage, {
    name: 'playlist',
    props: true,
    meta: { requiresAuth: true },
  }),
]
const SLOW = { timeout: 8000 }

async function openWcs(unknown: string[] = ['Lemon Tree']) {
  server.use(...spotifyHandlers(), reccoBeatsHandler(unknown))
  await renderRoutes({ routes, path: '/playlists/wcs', storage: loggedInStorage() })
  await screen.findByRole('heading', { level: 1, name: 'WCS' })
  await screen.findAllByText('12B', {}, SLOW)
}

const trackRow = (title: string) => {
  const item = screen.getAllByText(title)[0]?.closest('li')
  if (!item) throw new Error(title)
  return within(item)
}

describe('playlist page', { timeout: 30_000 }, () => {
  it('waits for missing data, then mixes once the track is excluded', async () => {
    await openWcs()
    expect(screen.getByText(/1 track\(s\) have no key or BPM/)).toBeInTheDocument()
    expect(screen.getByText('Waiting for key and BPM')).toBeInTheDocument()

    await userEvent.click(
      trackRow('Lemon Tree (feat. Will Jay)').getByRole('checkbox', { name: 'Exclude' }),
    )
    const mixes = await screen.findByRole('radiogroup', { name: 'Alternative mixes' }, SLOW)
    const cards = within(mixes).getAllByRole('radio')
    expect(cards.length).toBeGreaterThan(1)
    expect(cards[0]).toHaveAttribute('aria-checked', 'true')

    const points = screen.getAllByRole('img', { name: /^\d+\. .*BPM/ })
    expect(points).toHaveLength(19)
    expect(screen.queryByText(/not in chart/)).toBeNull()
  })

  it('applies a start track', async () => {
    await openWcs([])
    await screen.findByRole('radiogroup', { name: 'Alternative mixes' }, SLOW)
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'First track' }),
      wcsId('Girl on Fire'),
    )
    await screen.findAllByText(
      (_, el) => el?.tagName === 'DD' && el.textContent.startsWith('Girl on Fire'),
      {},
      SLOW,
    )
    const first = screen.getAllByRole('img', { name: /^1\. / })[0]
    expect(first).toHaveAccessibleName(/^1\. Girl on Fire, 11B, A major, 92.5 BPM$/)
  })

  it('explains an infeasible set and a clashing pair', async () => {
    await openWcs([])
    await screen.findByRole('radiogroup', { name: 'Alternative mixes' }, SLOW)
    await userEvent.click(trackRow('Counting Stars').getByRole('checkbox', { name: 'Exclude' }))
    await userEvent.click(trackRow('Stolen Dance').getByRole('checkbox', { name: 'Exclude' }))
    expect(await screen.findByText('No clash-free mix is possible', {}, SLOW)).toBeInTheDocument()
    expect(
      screen.getByText(
        /Bloodstream \(2A · E♭ minor\) can’t follow or precede any other included track/,
      ),
    ).toBeInTheDocument()

    await userEvent.click(trackRow('Counting Stars').getByRole('checkbox', { name: 'Exclude' }))
    await userEvent.click(trackRow('Stolen Dance').getByRole('checkbox', { name: 'Exclude' }))
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Track' }),
      wcsId('Bloodstream'),
    )
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'is followed by' }),
      wcsId('I Wanna Dance'),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Add pair' }))
    expect(await screen.findByText('These constraints can’t all hold')).toBeInTheDocument()
    expect(screen.getByText(/is a clash on the chart/)).toBeInTheDocument()
  })

  it('saves the chosen mix as a new private playlist without touching the source', async () => {
    const created: unknown[] = []
    const added: string[][] = []
    const sourceWrites: string[] = []
    server.use(
      http.post(`${SPOTIFY}/me/playlists`, async ({ request }) => {
        created.push(await request.json())
        return HttpResponse.json(
          { id: 'new', external_urls: { spotify: 'https://open.spotify.com/playlist/new' } },
          { status: 201 },
        )
      }),
      http.post(`${SPOTIFY}/playlists/new/items`, async ({ request }) => {
        added.push(((await request.json()) as { uris: string[] }).uris)
        return HttpResponse.json({ snapshot_id: 's' }, { status: 201 })
      }),
      http.all(`${SPOTIFY}/playlists/wcs/*`, ({ request }) => {
        if (request.method !== 'GET') sourceWrites.push(request.method)
        return undefined
      }),
    )
    await openWcs([])
    await screen.findByRole('radiogroup', { name: 'Alternative mixes' }, SLOW)
    const order = screen
      .getAllByRole('img', { name: /^\d+\. / })
      .map((el) => el.getAttribute('aria-label') ?? '')
    await userEvent.click(screen.getByRole('button', { name: 'Save as a new playlist' }))
    const link = await screen.findByRole('link', { name: 'Open in Spotify' })
    expect(link).toHaveAttribute('href', 'https://open.spotify.com/playlist/new')
    expect(created).toEqual([
      expect.objectContaining({ name: 'WCS · Camelot mix', public: false }) as unknown,
    ])
    expect(added.flat()).toHaveLength(20)
    expect(added.flat()[0]).toBe(
      `spotify:track:${wcsId(order[0]?.replace(/^1\. /, '').split(',')[0] ?? '')}`,
    )
    expect(sourceWrites).toEqual([])
  })
})
