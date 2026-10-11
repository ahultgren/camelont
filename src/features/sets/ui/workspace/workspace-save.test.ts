import { screen, waitFor, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { fakeSpotify, type FakePlaylist } from '@/test/spotify-fake'
import { wcsId } from '@/test/wcs'
import { copyOf, CORE, inRow, openWorkspace, setOf, settled, storeOf } from '@/test/workspace'
import type { MixSet } from '../../domain/types'

vi.setConfig({ testTimeout: 60_000 })

const DAY = 86_400_000
const core = () => setOf([copyOf('wcs', 'WCS', CORE)])
/** A set that saved "Friday mix" as the playlist `mine` before. */
const savedBefore = (change: (set: MixSet) => MixSet = (set) => set) =>
  setOf([copyOf('wcs', 'WCS', CORE)], (set) =>
    change({
      ...set,
      lastSave: {
        playlistId: 'mine',
        url: 'https://open.spotify.com/playlist/mine',
        savedAt: 3 * DAY,
        name: 'Friday mix',
        order: ['an', 'older', 'mix'],
      },
    }),
  )
const SOURCES: Record<string, FakePlaylist> = { wcs: { name: 'WCS', owner: 'me' } }
const MINE: Record<string, FakePlaylist> = { ...SOURCES, mine: { name: 'Friday mix', owner: 'me' } }

async function open(set: MixSet | MixSet[], playlists: Record<string, FakePlaylist> = SOURCES) {
  const spotify = fakeSpotify(playlists)
  const page = await openWorkspace(set, { handlers: spotify.handlers })
  await settled()
  return { ...page, spotify }
}

const saveButton = () => screen.getByRole('button', { name: 'Save to Spotify' })
async function openDialog() {
  await userEvent.click(saveButton())
  const dialog = await screen.findByRole('dialog', { name: 'Save to Spotify' })
  return within(dialog)
}
type Dialog = Awaited<ReturnType<typeof openDialog>>
const nameField = (dialog: Dialog) => dialog.getByRole('textbox', { name: 'Playlist name' })
const status = () => screen.getByTestId('save-status')
const closed = () =>
  waitFor(() => {
    expect(screen.queryByRole('dialog')).toBeNull()
  })

describe('Save to Spotify: the first save', () => {
  it('asks first: the name is the set’s, focused, and nothing is written', async () => {
    const { spotify } = await open(core())
    const dialog = await openDialog()
    expect(nameField(dialog)).toHaveValue('Friday social')
    expect(nameField(dialog)).toHaveFocus()
    expect(dialog.getByText(/Nothing is written until you confirm/)).toBeInTheDocument()
    // No earlier save: no choice to make.
    expect(dialog.queryByRole('radio')).toBeNull()
    expect(dialog.getByRole('button', { name: 'Save as new playlist' })).toBeEnabled()
    expect(spotify.writes).toEqual([])

    await userEvent.click(dialog.getByRole('button', { name: 'Cancel' }))
    await closed()
    expect(spotify.writes).toEqual([])
    expect(screen.queryByTestId('save-status')).toBeNull()
  })

  it('cancels with Esc', async () => {
    const { spotify } = await open(core())
    await openDialog()
    await userEvent.keyboard('{Escape}')
    await closed()
    expect(spotify.writes).toEqual([])
  })

  it('saves under the name given, on Enter, and shows the link and the time', async () => {
    const { spotify, stored } = await open(core())
    const dialog = await openDialog()
    await userEvent.clear(nameField(dialog))
    await userEvent.type(nameField(dialog), 'Friday mix{Enter}')
    await closed()

    expect(spotify.calls()).toEqual(['POST /me/playlists', 'POST /playlists/new-1/items'])
    expect(spotify.writes[0]?.body).toMatchObject({ name: 'Friday mix', public: false })
    expect(status()).toHaveTextContent(/^Saved/)
    expect(status().querySelector('time')).toHaveAttribute('datetime')
    expect(within(status()).getByRole('link', { name: 'Open in Spotify' })).toHaveAttribute(
      'href',
      'https://open.spotify.com/playlist/new-1',
    )
    // The set is not renamed by naming the playlist.
    expect(screen.getByRole('textbox', { name: 'Set name' })).toHaveValue('Friday social')
    await waitFor(async () => {
      expect((await stored())?.lastSave).toMatchObject({ playlistId: 'new-1', name: 'Friday mix' })
    })
    expect((await stored())?.name).toBe('Friday social')
  })

  it('can’t be saved without a name', async () => {
    const { spotify } = await open(core())
    const dialog = await openDialog()
    await userEvent.clear(nameField(dialog))
    expect(dialog.getByRole('button', { name: 'Save as new playlist' })).toBeDisabled()
    expect(dialog.getByText('The playlist needs a name.')).toBeInTheDocument()
    await userEvent.type(nameField(dialog), '   {Enter}')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(spotify.writes).toEqual([])
  })

  it('has nothing to save while there is no mix', async () => {
    await open(
      setOf([copyOf('wcs', 'WCS', CORE)], (set) => ({
        ...set,
        marks: Object.fromEntries(CORE.map((title) => [wcsId(title), 'exclude' as const])),
      })),
    )
    expect(saveButton()).toBeDisabled()
    expect(saveButton()).toHaveAttribute('title', 'There is no mix to save yet')
  })
})

describe('Save to Spotify: a name I already use', () => {
  const withNamesake = { ...SOURCES, handmade: { name: 'Friday Social', owner: 'me' } }

  it('warns, and saves anyway when I confirm', async () => {
    const { spotify } = await open(core(), withNamesake)
    const dialog = await openDialog()
    // The set's own name is taken, whatever the case.
    const warning = await dialog.findByText(/You already have a playlist called “Friday Social”/)
    expect(warning.closest('[role="status"]')).not.toBeNull()
    expect(dialog.getByRole('button', { name: 'Save as new playlist' })).toBeEnabled()

    await userEvent.type(nameField(dialog), ' 2')
    expect(dialog.queryByText(/You already have a playlist/)).toBeNull()
    await userEvent.clear(nameField(dialog))
    await userEvent.type(nameField(dialog), '  friday social ')
    expect(dialog.getByText(/You already have a playlist called “Friday Social”/)).toBeVisible()

    await userEvent.click(dialog.getByRole('button', { name: 'Save as new playlist' }))
    await closed()
    // A new playlist; the one with the same name is not touched.
    expect(spotify.written()).toEqual(['NEW', 'new-1'])
  })

  it('says it couldn’t check when my playlists can’t be listed', async () => {
    const spotify = fakeSpotify(SOURCES)
    spotify.failList()
    await openWorkspace(core(), { handlers: spotify.handlers })
    await settled()
    const dialog = await openDialog()
    expect(
      await dialog.findByText(
        /Couldn’t check whether you already have a playlist with this name \(Spotify said 500\)/,
      ),
    ).toBeVisible()
    expect(dialog.getByRole('button', { name: 'Save as new playlist' })).toBeEnabled()
  })
})

describe('Save to Spotify: saving again', () => {
  it('offers to replace the playlist saved before, and says what that means', async () => {
    const { spotify } = await open(savedBefore(), MINE)
    expect(status()).toHaveTextContent(/^Changed since the save of/)
    const dialog = await openDialog()
    // The name used last time, not the set's.
    expect(nameField(dialog)).toHaveValue('Friday mix')

    const choice = within(
      await dialog.findByRole('group', { name: 'This set saved a playlist before' }),
    )
    const replace = choice.getByRole('radio', { name: /^Replace “Friday mix”/ })
    const create = choice.getByRole('radio', { name: /^Create another playlist/ })
    expect(replace).toBeChecked()
    expect(replace).toHaveAccessibleDescription(
      /^Saved .+\. Its current tracks go and this mix takes their place\.$/,
    )
    expect(create).toHaveAccessibleDescription('“Friday mix” stays as it is.')
    // Announced, since it arrives after the dialog opened.
    expect(
      dialog.getByText('You can replace “Friday mix” or create another playlist.'),
    ).toHaveAttribute('role', 'status')
    // The name is the playlist's own: no warning about itself.
    expect(dialog.queryByText(/You already have a playlist/)).toBeNull()

    // The button says what will happen.
    expect(dialog.getByRole('button', { name: 'Replace in Spotify' })).toBeEnabled()
    await userEvent.click(create)
    expect(dialog.getByRole('button', { name: 'Save as new playlist' })).toBeEnabled()
    expect(dialog.getByText(/You already have a playlist called “Friday mix”/)).toBeVisible()
    await userEvent.click(replace)
    expect(dialog.getByRole('button', { name: 'Replace in Spotify' })).toBeEnabled()
    expect(spotify.writes).toEqual([])
  })

  it('replaces that playlist: its tracks, then its name', async () => {
    const { spotify, stored } = await open(savedBefore(), MINE)
    const dialog = await openDialog()
    await dialog.findByRole('radio', { name: /^Replace/ })
    await userEvent.clear(nameField(dialog))
    await userEvent.type(nameField(dialog), 'Friday mix v2')
    await userEvent.click(dialog.getByRole('button', { name: 'Replace in Spotify' }))
    await closed()

    expect(spotify.calls()).toEqual(['PUT /playlists/mine/items', 'PUT /playlists/mine'])
    expect(spotify.writes[1]?.body).toMatchObject({ name: 'Friday mix v2' })
    expect(status()).toHaveTextContent(/^Saved/)
    expect(screen.getByRole('link', { name: 'Open in Spotify' })).toHaveAttribute(
      'href',
      'https://open.spotify.com/playlist/mine',
    )
    await waitFor(async () => {
      expect((await stored())?.lastSave).toMatchObject({
        playlistId: 'mine',
        name: 'Friday mix v2',
      })
    })
  })

  it('creates another playlist when that is chosen', async () => {
    const { spotify } = await open(savedBefore(), MINE)
    const dialog = await openDialog()
    await userEvent.click(await dialog.findByRole('radio', { name: /^Create another playlist/ }))
    await userEvent.click(dialog.getByRole('button', { name: 'Save as new playlist' }))
    await closed()
    expect(spotify.written()).toEqual(['NEW', 'new-1'])
    expect(screen.getByRole('link', { name: 'Open in Spotify' })).toHaveAttribute(
      'href',
      'https://open.spotify.com/playlist/new-1',
    )
  })

  it('reads as changed when the mix changed, not when the set was renamed', async () => {
    await open(core())
    const dialog = await openDialog()
    await userEvent.click(dialog.getByRole('button', { name: 'Save as new playlist' }))
    await closed()
    expect(status()).toHaveTextContent(/^Saved/)

    const name = screen.getByRole('textbox', { name: 'Set name' })
    await userEvent.clear(name)
    await userEvent.type(name, 'Saturday social{Enter}')
    expect(status()).toHaveTextContent(/^Saved/)

    await userEvent.click(inRow('WCS', 'Try').getByRole('button', { name: 'Exclude' }))
    await settled()
    await waitFor(() => {
      expect(status()).toHaveTextContent(/^Changed since the save of/)
    })
  })
})

describe('Save to Spotify: when the earlier playlist may not be replaced', () => {
  const onlyCreate = async (dialog: Dialog, reason: RegExp) => {
    expect(await dialog.findByTestId('save-refused')).toHaveTextContent(reason)
    expect(dialog.queryByRole('radio')).toBeNull()
    expect(dialog.queryByRole('button', { name: 'Replace in Spotify' })).toBeNull()
    expect(dialog.getByRole('button', { name: 'Save as new playlist' })).toBeEnabled()
  }

  it('is a source of a set on this device: only a new playlist, and why', async () => {
    const drawing = {
      ...setOf([copyOf('mine', 'Friday mix', CORE.slice(0, 3))]),
      id: 'saturday',
      name: 'Saturday',
    }
    const spotify = fakeSpotify(MINE)
    await openWorkspace(savedBefore(), {
      handlers: spotify.handlers,
      setsStore: storeOf(savedBefore(), drawing),
    })
    await settled()
    const dialog = await openDialog()
    await onlyCreate(
      dialog,
      /^The playlist saved before is a source of the set “Saturday”, and a source playlist is never changed\.$/,
    )
    await userEvent.click(dialog.getByRole('button', { name: 'Save as new playlist' }))
    await closed()
    expect(spotify.written()).toEqual(['NEW', 'new-1'])
  })

  it('is gone from Spotify', async () => {
    const { spotify } = await open(savedBefore(), SOURCES)
    const dialog = await openDialog()
    await onlyCreate(dialog, /is no longer in Spotify, so this saves a new one/)
    expect(spotify.writes).toEqual([])
  })

  it('is no longer mine', async () => {
    await open(savedBefore(), { ...SOURCES, mine: { name: 'Friday mix', owner: 'someone' } })
    await onlyCreate(await openDialog(), /is no longer yours/)
  })

  it('was saved before playlists were recorded by ID, with a link that names none', async () => {
    const old = savedBefore((set) => ({
      ...set,
      lastSave: set.lastSave && { ...set.lastSave, playlistId: null, url: 'https://example.com/x' },
    }))
    await open(old, MINE)
    await onlyCreate(await openDialog(), /can’t be told from its link/)
  })
})

describe('Save to Spotify: when Spotify doesn’t take it', () => {
  it('says replacing isn’t available and offers to save as new instead', async () => {
    const { spotify } = await open(savedBefore(), MINE)
    spotify.fail.set('set items', 405)
    const dialog = await openDialog()
    await dialog.findByRole('radio', { name: /^Replace/ })
    await userEvent.click(dialog.getByRole('button', { name: 'Replace in Spotify' }))

    expect(await dialog.findByRole('alert')).toHaveTextContent(
      'Spotify doesn’t accept replacing a playlist’s tracks (Spotify said 405), so replacing isn’t available. “Friday mix” is as it was. You can save as a new playlist instead.',
    )
    // The dialog stays, with the one thing that can be done.
    await waitFor(() => {
      expect(dialog.queryByRole('radio')).toBeNull()
    })
    await userEvent.click(dialog.getByRole('button', { name: 'Save as new playlist' }))
    await closed()
    expect(spotify.calls()).toEqual([
      'PUT /playlists/mine/items',
      'POST /me/playlists',
      'POST /playlists/new-1/items',
    ])
  })

  it('says why Spotify may have refused, and changes nothing', async () => {
    const { spotify } = await open(savedBefore(), MINE)
    spotify.fail.set('set items', 403)
    const dialog = await openDialog()
    await dialog.findByRole('radio', { name: /^Replace/ })
    await userEvent.click(dialog.getByRole('button', { name: 'Replace in Spotify' }))
    expect(await dialog.findByRole('alert')).toHaveTextContent(
      /Spotify refused to change “Friday mix” .* may only change private playlists/,
    )
    expect(status()).toHaveTextContent(/^Changed since the save of/)
    // Replacing is still there to try again, and so is creating another.
    expect(await dialog.findByRole('radio', { name: /^Replace/ })).toBeChecked()
  })

  it('says a new playlist couldn’t be created, and that nothing changed', async () => {
    const { spotify } = await open(core())
    spotify.fail.set('create', 500)
    const dialog = await openDialog()
    await userEvent.click(dialog.getByRole('button', { name: 'Save as new playlist' }))
    expect(await dialog.findByRole('alert')).toHaveTextContent(
      'The playlist couldn’t be created (Spotify said 500). Nothing in Spotify changed.',
    )
    expect(screen.queryByTestId('save-status')).toBeNull()
  })

  it('says so when the tracks went in but the new name didn’t', async () => {
    const { spotify } = await open(savedBefore(), MINE)
    spotify.fail.set('details', 404)
    const dialog = await openDialog()
    await dialog.findByRole('radio', { name: /^Replace/ })
    await userEvent.clear(nameField(dialog))
    await userEvent.type(nameField(dialog), 'Another name{Enter}')
    expect(
      await dialog.findByText(
        /The tracks of “Friday mix” were replaced, but Spotify didn’t take the new name/,
      ),
    ).toBeVisible()
    await userEvent.click(dialog.getByRole('button', { name: 'Done' }))
    await closed()
    expect(status()).toHaveTextContent(/^Saved/)
  })
})
