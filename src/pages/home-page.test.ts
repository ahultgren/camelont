import { screen, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import type { MixSet } from '@/features/sets'
import type { KeyValueStore } from '@/shared/storage'
import { server } from '@/test/msw'
import { renderRoutes, route } from '@/test/render'
import { aSet, playlistCopy, setsStorage } from '@/test/sets'
import { slowItems, SPOTIFY, spotifyHandlers } from '@/test/spotify-mocks'
import { loggedInStorage } from '@/test/storage'
import HomePage from './HomePage.vue'
import SetPage from './SetPage.vue'

const routes = [
  route('/', HomePage, { name: 'home' }),
  route('/sets/:id', SetPage, { name: 'set', props: true, meta: { requiresAuth: true } }),
]

const wcs = playlistCopy('wcs', 'WCS', ['a', 'b', 'c'])
const slow = playlistCopy('slow', 'Slow ones', ['c', 'd'])
const DAY = 86_400_000

const openHome = (setsStore: KeyValueStore = setsStorage([])) =>
  renderRoutes({ routes, storage: loggedInStorage(), setsStore })

/** The list's rows, top to bottom, by the set each one links to. */
const rows = async () => {
  const list = await screen.findByRole('list', { name: 'Your sets' })
  return within(list)
    .getAllByRole('listitem')
    .map((row) => ({
      row: within(row),
      name: within(row).getAllByRole('link')[0]?.textContent.trim(),
    }))
}
const row = async (name: string) => {
  const found = (await rows()).find((candidate) => candidate.name === name)
  if (!found) throw new Error(`No row for ${name}`)
  return found.row
}

describe('home page (logged out)', () => {
  it('introduces the app and offers the login, and reads no sets', async () => {
    await renderRoutes({ routes, setsStore: setsStorage([aSet('one', 'Friday', [wcs])]) })
    expect(screen.getByRole('heading', { level: 1, name: 'Camelont' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Log in with Spotify' })).toBeInTheDocument()
    expect(screen.queryByText('Friday')).toBeNull()
    // It describes sets built from playlists, not the old one-playlist mixer.
    expect(screen.getByText(/Build a harmonically mixed set from your playlists/)).toBeVisible()
  })
})

describe('home page (logged in): the sets list', () => {
  it('says so when there are no sets yet', async () => {
    await openHome()
    expect(await screen.findByRole('heading', { name: 'No sets yet' })).toBeVisible()
    expect(screen.getByRole('heading', { level: 1, name: 'Your sets' })).toBeInTheDocument()
  })

  it('offers export and import of the corrections made by hand (U4)', async () => {
    await openHome()
    expect(await screen.findByRole('heading', { name: 'Key and BPM corrections' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Export corrections' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Import corrections' })).toBeEnabled()
  })

  it('lists the sets, most recently edited first, each linking to its page', async () => {
    await openHome(
      setsStorage([
        aSet('old', 'Last month', [wcs], 1 * DAY),
        aSet('new', 'Friday social', [wcs, slow], 3 * DAY),
        aSet('mid', 'Practice', [slow], 2 * DAY),
      ]),
    )
    expect((await rows()).map((r) => r.name)).toEqual(['Friday social', 'Practice', 'Last month'])
    const friday = await row('Friday social')
    expect(friday.getByRole('link', { name: 'Friday social' })).toHaveAttribute(
      'href',
      '/camelont/sets/new',
    )
  })

  it('shows a set’s playlists, pool size, last edit and that it isn’t saved', async () => {
    await openHome(setsStorage([aSet('one', 'Friday social', [wcs, slow], 3 * DAY)]))
    const friday = await row('Friday social')
    expect(friday.getByText('WCS')).toBeInTheDocument()
    expect(friday.getByText('Slow ones')).toBeInTheDocument()
    // Track c is in both playlists and counts once.
    expect(friday.getByText('4 tracks in the pool')).toBeInTheDocument()
    expect(friday.getByText(/Edited/).querySelector('time')).toHaveAttribute(
      'datetime',
      new Date(3 * DAY).toISOString(),
    )
    expect(friday.getByText('Not saved to Spotify')).toBeInTheDocument()
    expect(friday.queryByRole('link', { name: /Spotify/ })).toBeNull()
  })

  it('counts the chosen mix once a set has one, and links to its saved playlist', async () => {
    const order = ['b', 'a']
    const saved: Partial<MixSet> = {
      chosenMix: { order },
      lastSave: {
        url: 'https://open.spotify.com/playlist/mix1',
        savedAt: DAY,
        name: 'Saved',
        order,
      },
    }
    await openHome(
      setsStorage([
        aSet('s', 'Saved', [wcs], 2 * DAY, saved),
        aSet('c', 'Changed', [wcs], DAY, { ...saved, chosenMix: { order: ['a', 'b'] } }),
      ]),
    )
    const savedRow = await row('Saved')
    expect(savedRow.getByText('2 tracks in the mix')).toBeInTheDocument()
    expect(savedRow.getByText('Saved to Spotify')).toBeInTheDocument()
    expect(savedRow.getByRole('link', { name: /Spotify/ })).toHaveAttribute(
      'href',
      'https://open.spotify.com/playlist/mix1',
    )
    const changedRow = await row('Changed')
    expect(changedRow.getByText('Changed since it was saved to Spotify')).toBeInTheDocument()
    expect(changedRow.getByRole('link', { name: /Spotify/ })).toBeInTheDocument()
  })

  it('opens a set from its name', async () => {
    const { router } = await openHome(setsStorage([aSet('one', 'Friday social', [wcs])]))
    await userEvent.click(await screen.findByRole('link', { name: 'Friday social' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Friday social' })).toBeVisible()
    expect(router.currentRoute.value.path).toBe('/sets/one')
  })

  it('renames a set', async () => {
    const storage = setsStorage([aSet('one', 'Friday social', [wcs])])
    await openHome(storage)
    await userEvent.click(await screen.findByRole('button', { name: 'Rename Friday social' }))
    const dialog = within(await screen.findByRole('dialog', { name: 'Rename set' }))
    const name = dialog.getByRole('textbox', { name: 'Name' })
    expect(name).toHaveValue('Friday social')

    await userEvent.clear(name)
    expect(dialog.getByRole('button', { name: 'Rename' })).toBeDisabled()
    await userEvent.type(name, 'Saturday social{Enter}')

    expect(screen.queryByRole('dialog')).toBeNull()
    expect((await rows()).map((r) => r.name)).toEqual(['Saturday social'])
    expect(screen.getByRole('status')).toHaveTextContent('Renamed to “Saturday social”.')
  })

  it('duplicates a set under a new name, on top of the list', async () => {
    await openHome(setsStorage([aSet('one', 'Friday social', [wcs, slow])]))
    await userEvent.click(await screen.findByRole('button', { name: 'Duplicate Friday social' }))
    expect((await rows()).map((r) => r.name)).toEqual(['Friday social copy', 'Friday social'])
    const copy = await row('Friday social copy')
    expect(copy.getByText('4 tracks in the pool')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Duplicated as “Friday social copy”.')
  })

  it('deletes a set only after a confirmation that says Spotify isn’t touched', async () => {
    const storage = setsStorage([
      aSet('one', 'Friday social', [wcs], 2 * DAY),
      aSet('two', 'Practice', [slow], DAY),
    ])
    await openHome(storage)
    await userEvent.click(await screen.findByRole('button', { name: 'Delete Friday social' }))
    let dialog = within(await screen.findByRole('dialog', { name: 'Delete “Friday social”?' }))
    expect(dialog.getByText(/Nothing in Spotify is touched/)).toBeInTheDocument()

    await userEvent.click(dialog.getByRole('button', { name: 'Cancel' }))
    expect((await rows()).map((r) => r.name)).toEqual(['Friday social', 'Practice'])

    await userEvent.click(screen.getByRole('button', { name: 'Delete Friday social' }))
    dialog = within(await screen.findByRole('dialog'))
    await userEvent.click(dialog.getByRole('button', { name: 'Delete set' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect((await rows()).map((r) => r.name)).toEqual(['Practice'])
    expect((await storage.entries()).map(([id]) => id)).toEqual(['two'])
  })

  it('reports a stored set that can’t be read, by ID and reason, and can delete it', async () => {
    const storage = setsStorage([aSet('one', 'Friday social', [wcs])], {
      'broken-1': { v: 7, data: { name: 'From the future' } },
      'broken-2': 'not a set',
    })
    await openHome(storage)
    const unreadable = within(
      await screen.findByRole('list', { name: '2 stored sets can’t be read' }),
    )
    const [first, second] = unreadable.getAllByRole('listitem').map((item) => within(item))
    expect(first?.getByText('From the future')).toBeInTheDocument()
    expect(first?.getByText('ID broken-1')).toBeInTheDocument()
    expect(first?.getByText(/stored in format version 7/)).toBeInTheDocument()
    expect(second?.getByText('No readable name')).toBeInTheDocument()
    expect(second?.getByText('ID broken-2')).toBeInTheDocument()
    // The readable set is still listed.
    expect((await rows()).map((r) => r.name)).toEqual(['Friday social'])

    await userEvent.click(
      screen.getByRole('button', { name: 'Delete the unreadable set From the future' }),
    )
    const dialog = within(await screen.findByRole('dialog'))
    await userEvent.click(dialog.getByRole('button', { name: 'Delete set' }))
    expect(await screen.findByRole('list', { name: '1 stored set can’t be read' })).toBeVisible()
    expect((await storage.entries()).map(([id]) => id).sort()).toEqual(['broken-2', 'one'])
  })

  it('says when the sets can’t be read from this device', async () => {
    const storage = setsStorage([])
    storage.entries = () => Promise.reject(new Error('The database is blocked'))
    await openHome(storage)
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Couldn’t read your sets from this device: The database is blocked',
    )
    expect(screen.queryByRole('heading', { name: 'No sets yet' })).toBeNull()
  })

  it('says when a change couldn’t be stored', async () => {
    const storage = setsStorage([aSet('one', 'Friday social', [wcs])])
    storage.set = () => Promise.reject(new Error('The disk is full'))
    await openHome(storage)
    await userEvent.click(await screen.findByRole('button', { name: 'Duplicate Friday social' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Couldn’t store your latest changes on this device (The disk is full).',
    )
  })
})

describe('home page (logged in): a new set', () => {
  async function openDialog(setsStore: KeyValueStore = setsStorage([])) {
    const page = await openHome(setsStore)
    await userEvent.click(await screen.findByRole('button', { name: 'New set' }))
    const dialog = within(await screen.findByRole('dialog', { name: 'New set' }))
    await dialog.findByRole('checkbox', { name: /WCS/ })
    return { ...page, dialog }
  }
  const storedNames = async (storage: KeyValueStore) =>
    (await storage.entries()).map(([, record]) => (record as { data: MixSet }).data.name)

  it('creates a set from one playlist, named after it, and opens it', async () => {
    server.use(...spotifyHandlers())
    const storage = setsStorage([])
    const { dialog, router } = await openDialog(storage)
    expect(dialog.getByRole('button', { name: 'Create set' })).toBeDisabled()

    await userEvent.click(dialog.getByRole('checkbox', { name: /WCS/ }))
    await userEvent.click(dialog.getByRole('button', { name: 'Create set' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'WCS' })).toBeVisible()
    expect(router.currentRoute.value.name).toBe('set')
    expect(screen.getByRole('listitem')).toHaveTextContent('WCS20 tracks')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(await storedNames(storage)).toEqual(['WCS'])
  })

  it('creates a set from several playlists and says which items were left out', async () => {
    server.use(...spotifyHandlers())
    const { dialog } = await openDialog()
    await userEvent.type(dialog.getByRole('textbox', { name: /Name/ }), 'Friday social')
    await userEvent.click(dialog.getByRole('checkbox', { name: /Slow ones/ }))
    await userEvent.click(dialog.getByRole('checkbox', { name: /WCS/ }))
    await userEvent.click(dialog.getByRole('button', { name: 'Create set' }))

    expect(await dialog.findByText('“Friday social” is ready.')).toBeInTheDocument()
    expect(dialog.getByText(/can’t be mixed and were left out/)).toBeInTheDocument()
    // Only the playlist that had such items is named.
    expect(dialog.getAllByRole('listitem').map((item) => item.textContent.trim())).toEqual([
      'Slow ones: 1 local file, 1 episode',
    ])

    await userEvent.click(dialog.getByRole('button', { name: 'Open the set' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Friday social' })).toBeVisible()
    // In the order they were chosen.
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Slow ones4 tracks',
      'WCS20 tracks',
    ])
  })

  it('stores each playlist’s Spotify version and what its copy leaves out', async () => {
    server.use(...spotifyHandlers())
    const storage = setsStorage([])
    const { dialog } = await openDialog(storage)
    await userEvent.click(dialog.getByRole('checkbox', { name: /Slow ones/ }))
    await userEvent.click(dialog.getByRole('checkbox', { name: /WCS/ }))
    await userEvent.click(dialog.getByRole('button', { name: 'Create set' }))
    await dialog.findByText('“Slow ones” is ready.')

    const [record] = await storage.entries()
    const stored = (record?.[1] as { data: MixSet }).data
    // The change check compares against this version instead of reading the tracks again.
    expect(stored.playlists.map((playlist) => [playlist.playlistId, playlist.snapshotId])).toEqual([
      ['slow', 'slow-1'],
      ['wcs', 'wcs-1'],
    ])
    expect(stored.playlists.map((playlist) => playlist.skipped)).toEqual([
      { localFiles: 1, episodes: 1, unavailable: 0 },
      { localFiles: 0, episodes: 0, unavailable: 0 },
    ])
  })

  it('says why a playlist that is no longer mine can’t be read', async () => {
    server.use(
      http.get(`${SPOTIFY}/playlists/wcs`, () =>
        HttpResponse.json({ id: 'wcs', name: 'WCS', images: [], owner: { id: 'someone-else' } }),
      ),
      ...spotifyHandlers(),
    )
    const storage = setsStorage([])
    const { dialog } = await openDialog(storage)
    await userEvent.click(dialog.getByRole('checkbox', { name: /WCS/ }))
    await userEvent.click(dialog.getByRole('button', { name: 'Create set' }))
    expect(await dialog.findByRole('alert')).toHaveTextContent(
      /Couldn’t read “WCS”: it isn’t yours, .* No set was created\./,
    )
    expect(await storedNames(storage)).toEqual([])
  })

  it('can’t take a followed playlist', async () => {
    server.use(...spotifyHandlers())
    const { dialog } = await openDialog()
    expect(dialog.getByRole('checkbox', { name: /Top Hits/ })).toBeDisabled()
    expect(dialog.getByText(/Followed, can’t be mixed/)).toBeInTheDocument()
  })

  it('shows which playlist is being read', async () => {
    let release: () => void = () => undefined
    const held = new Promise<void>((resolve) => (release = resolve))
    server.use(
      http.get(`${SPOTIFY}/playlists/slow/items`, async () => {
        await held
        return HttpResponse.json({ items: slowItems(), next: null })
      }),
      ...spotifyHandlers(),
    )
    const { dialog } = await openDialog()
    await userEvent.click(dialog.getByRole('checkbox', { name: /WCS/ }))
    await userEvent.click(dialog.getByRole('checkbox', { name: /Slow ones/ }))
    await userEvent.click(dialog.getByRole('button', { name: 'Create set' }))

    const status = await dialog.findByText(/Reading “Slow ones”…/)
    expect(status).toHaveTextContent('2 of 2')
    expect(dialog.getByRole('progressbar', { name: 'Playlists read' })).toHaveValue(1)
    expect(dialog.queryByRole('button', { name: 'Create set' })).toBeNull()

    release()
    expect(await dialog.findByRole('button', { name: 'Open the set' })).toBeInTheDocument()
  })

  it('creates nothing when a playlist can’t be read, and tries again without re-reading', async () => {
    const reads = { wcs: 0, slow: 0 }
    let slowWorks = false
    server.use(
      http.get(`${SPOTIFY}/playlists/:id/items`, ({ params }) => {
        if (params.id === 'wcs') reads.wcs++
        if (params.id !== 'slow') return undefined
        reads.slow++
        return slowWorks
          ? undefined
          : HttpResponse.json({ error: { status: 502, message: 'Bad gateway' } }, { status: 502 })
      }),
      ...spotifyHandlers(),
    )
    const storage = setsStorage([])
    const { dialog } = await openDialog(storage)
    await userEvent.type(dialog.getByRole('textbox', { name: /Name/ }), 'Friday social')
    await userEvent.click(dialog.getByRole('checkbox', { name: /WCS/ }))
    await userEvent.click(dialog.getByRole('checkbox', { name: /Slow ones/ }))
    await userEvent.click(dialog.getByRole('button', { name: 'Create set' }))

    expect(await dialog.findByRole('alert')).toHaveTextContent(
      'Couldn’t read “Slow ones”: Bad gateway. No set was created.',
    )
    expect(await storedNames(storage)).toEqual([])
    // The choices are still there.
    expect(dialog.getByRole('textbox', { name: /Name/ })).toHaveValue('Friday social')
    expect(dialog.getByRole('checkbox', { name: /Slow ones/ })).toBeChecked()

    slowWorks = true
    await userEvent.click(dialog.getByRole('button', { name: 'Try again' }))
    await userEvent.click(await dialog.findByRole('button', { name: 'Open the set' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Friday social' })).toBeVisible()
    expect(reads).toEqual({ wcs: 1, slow: 2 })
    expect(await storedNames(storage)).toEqual(['Friday social'])
  })

  it('creates nothing when the dialog is closed while reading', async () => {
    let release: () => void = () => undefined
    const held = new Promise<void>((resolve) => (release = resolve))
    server.use(
      http.get(`${SPOTIFY}/playlists/wcs/items`, async () => {
        await held
        return undefined
      }),
      ...spotifyHandlers(),
    )
    const storage = setsStorage([])
    const { dialog, router } = await openDialog(storage)
    await userEvent.click(dialog.getByRole('checkbox', { name: /WCS/ }))
    await userEvent.click(dialog.getByRole('button', { name: 'Create set' }))
    await userEvent.click(await dialog.findByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).toBeNull()

    release()
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(router.currentRoute.value.name).toBe('home')
    expect(await storedNames(storage)).toEqual([])
    expect(screen.getByRole('heading', { name: 'No sets yet' })).toBeInTheDocument()
  })
})
