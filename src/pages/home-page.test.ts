import { screen, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { MixSet } from '@/features/sets'
import type { KeyValueStore } from '@/shared/storage'
import { renderRoutes, route } from '@/test/render'
import { aSet, playlistCopy, setsStorage } from '@/test/sets'
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
  })
})

describe('home page (logged in): the sets list', () => {
  it('says so when there are no sets yet', async () => {
    await openHome()
    expect(await screen.findByRole('heading', { name: 'No sets yet' })).toBeVisible()
    expect(screen.getByRole('heading', { level: 1, name: 'Your sets' })).toBeInTheDocument()
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
      /latest changes aren’t stored on this device yet: The disk is full/,
    )
  })
})
