import { screen, waitFor, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { createMemoryStore } from '@/shared/storage'
import { wcsId } from '@/test/wcs'
import {
  copyOf,
  CORE,
  headline,
  inRow,
  madeId,
  openWorkspace,
  playlist,
  row,
  rowTitles,
  setOf,
  settled,
  tracksInMix,
} from '@/test/workspace'

vi.setConfig({ testTimeout: 60_000 })

const core = () => copyOf('wcs', 'WCS', CORE)
const pressed = (playlistName: string, title: string) =>
  inRow(playlistName, title)
    .queryAllByRole('button', { pressed: true })
    .map((button) => button.getAttribute('aria-label'))

describe('the workspace: opening a set', () => {
  it('shows the set’s name, the way back, and each playlist over its tracks', async () => {
    await openWorkspace(setOf([core(), copyOf('odd', 'Odd ones', ['Higher Love', 'Love Is'])]))
    expect(await screen.findByRole('heading', { level: 1, name: 'Friday social' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Back to your sets' })).toHaveAttribute(
      'href',
      '/camelont/',
    )
    await settled()
    expect(screen.getByRole('heading', { level: 3, name: 'WCS' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: 'Odd ones' })).toBeInTheDocument()
    expect(rowTitles('WCS')).toHaveLength(8)
    // Tracks in the set out of tracks in the pool; Love Is is decided by WCS.
    const count = (name: string) => playlist(name).getByTestId('playlist-count')
    expect(count('WCS')).toHaveTextContent(/^8\/8/)
    expect(count('WCS')).toHaveAttribute('title', '8 of 8 tracks in the set')
    expect(count('Odd ones')).toHaveTextContent(/^1\/2/)
    expect(count('Odd ones')).toHaveAttribute(
      'title',
      '1 of 2 tracks in the set · 1 in another playlist',
    )
  })

  it('shows a track on one line: title, artist, key in both notations and BPM', async () => {
    await openWorkspace(setOf([core()]))
    await settled()
    const pompeii = inRow('WCS', 'Pompeii')
    expect(pompeii.getByText('Bastille')).toBeInTheDocument()
    expect(pompeii.getByRole('button', { name: /^Key of Pompeii:/ })).toHaveTextContent(
      '11B · A major',
    )
    expect(pompeii.getByRole('button', { name: /^BPM of Pompeii:/ })).toHaveTextContent('127.4')
    // Every row says in words whether it is in the set.
    expect(row('WCS', 'Pompeii')).toHaveTextContent('in the set')
  })

  it('marks only the values set by hand', async () => {
    const id = wcsId('Love Is')
    const overridesStore = createMemoryStore({
      [id]: {
        v: 1,
        data: { trackId: id, camelot: null, bpm: 90, note: null, label: 'Love Is', updatedAt: 1 },
      },
    })
    await openWorkspace(setOf([core()]), { overridesStore })
    await settled()
    const loveIs = inRow('WCS', 'Love Is')
    const bpm = loveIs.getByRole('button', { name: /^BPM of Love Is:/ })
    expect(bpm).toHaveTextContent('90')
    expect(bpm).toHaveTextContent('set by hand')
    // Its key is still ReccoBeats' own, and so is everything about Pompeii: no mark.
    expect(loveIs.getByRole('button', { name: /^Key of Love Is:/ })).not.toHaveTextContent(
      'set by hand',
    )
    expect(screen.getAllByTestId('by-hand')).toHaveLength(1)
  })

  it('says so when no set has that address, with a way back', async () => {
    await openWorkspace(setOf([core()]), { setId: 'nope' })
    expect(await screen.findByRole('heading', { name: 'Set not found' })).toBeVisible()
    expect(screen.getByText(/isn’t on this device/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to your sets' })).toBeInTheDocument()
  })

  it('reports a stored set that can’t be read, with its ID and the reason', async () => {
    const setsStore = createMemoryStore({ old: { v: 7, data: { name: 'From the future' } } })
    await openWorkspace([], { setsStore, setId: 'old' })
    expect(await screen.findByRole('heading', { name: 'This set can’t be read' })).toBeVisible()
    expect(screen.getByText(/stored in format version 7/)).toBeInTheDocument()
    expect(screen.getByText('old')).toBeInTheDocument()
  })
})

describe('the workspace: marks from the row (one toggle group)', () => {
  it('has four toggles of which at most one is on', async () => {
    const { stored } = await openWorkspace(setOf([core()]))
    await settled()
    const group = inRow('WCS', 'Try').getByRole('group', { name: 'Role of Try' })
    expect(
      within(group)
        .getAllByRole('button')
        .map((button) => button.getAttribute('aria-label')),
    ).toEqual(['Opener', 'Closer', 'Always include', 'Exclude'])
    expect(within(group).queryAllByRole('button', { pressed: true })).toEqual([])

    await userEvent.click(within(group).getByRole('button', { name: 'Always include' }))
    expect(pressed('WCS', 'Try')).toEqual(['Always include'])
    await userEvent.click(within(group).getByRole('button', { name: 'Opener' }))
    expect(pressed('WCS', 'Try')).toEqual(['Opener'])
    await waitFor(async () => {
      expect((await stored())?.mix.opener).toBe(wcsId('Try'))
    })
    expect((await stored())?.marks).toEqual({})

    // Pressing the one that is on turns it off.
    await userEvent.click(within(group).getByRole('button', { name: 'Opener' }))
    expect(pressed('WCS', 'Try')).toEqual([])
  })

  it('moves the opener to another track, and the mix opens with it', async () => {
    await openWorkspace(setOf([core()]))
    await settled()
    await userEvent.click(inRow('WCS', 'Try').getByRole('button', { name: 'Opener' }))
    await userEvent.click(inRow('WCS', 'Pompeii').getByRole('button', { name: 'Opener' }))
    expect(pressed('WCS', 'Try')).toEqual([])
    expect(pressed('WCS', 'Pompeii')).toEqual(['Opener'])
    await settled()
    const order = within(screen.getByRole('list', { name: 'Running order' })).getAllByRole(
      'listitem',
    )
    expect(order[0]).toHaveTextContent('Pompeii')
  })

  it('dims an excluded row, with no tag: the toggle says it', async () => {
    await openWorkspace(setOf([core()]))
    await settled()
    expect(tracksInMix()).toBe(8)
    await userEvent.click(inRow('WCS', 'Try').getByRole('button', { name: 'Exclude' }))
    expect(row('WCS', 'Try')).toHaveAttribute('data-left-out')
    expect(row('WCS', 'Try')).toHaveTextContent('left out · excluded')
    expect(inRow('WCS', 'Try').queryByTestId('reason')).toBeNull()
    expect(row('WCS', 'Pompeii')).not.toHaveAttribute('data-left-out')
    await settled()
    await waitFor(() => {
      expect(tracksInMix()).toBe(7)
    })
  })
})

describe('the workspace: why a track is left out', () => {
  it('tags a row only when the app made the call', async () => {
    await openWorkspace(
      setOf([
        core(),
        copyOf('odd', 'Odd ones', ['Love Is', 'Higher Love', 'Stolen Dance', 'Lemon Tree']),
      ]),
      { unknown: ['Lemon Tree'] },
    )
    await settled()
    const reason = (playlistName: string, title: string) =>
      inRow(playlistName, title).queryByTestId('reason')?.textContent ?? null

    // In the set: no tag. Already taken by another playlist, or without data: a tag.
    expect(reason('WCS', 'Love Is')).toBeNull()
    expect(reason('Odd ones', 'Love Is')).toBe('in WCS')
    expect(row('Odd ones', 'Love Is')).toHaveTextContent('already in WCS')
    expect(reason('Odd ones', 'Lemon Tree')).toBe('needs key/BPM')
    expect(row('Odd ones', 'Lemon Tree')).toHaveAttribute('data-left-out')

    // A BPM range: the tracks outside it say so, with the range in words.
    const lowest = playlist('WCS').getByRole('textbox', { name: 'Lowest BPM of WCS' })
    await userEvent.type(lowest, '90{Enter}')
    expect(reason('WCS', 'Brother')).toBe('outside range')
    expect(row('WCS', 'Brother')).toHaveTextContent('left out · below 90 BPM')
    expect(row('WCS', 'Brother')).toHaveAttribute('data-left-out')
    // Love Is (88) is outside too, and now Odd ones, which has no range, takes it.
    expect(reason('WCS', 'Love Is')).toBe('outside range')
    expect(reason('Odd ones', 'Love Is')).toBeNull()
    expect(playlist('WCS').getByTestId('playlist-count')).toHaveTextContent(/^6\/8/)
  })

  it('shows picks as picked, and locks or rejects one with the row’s own toggles', async () => {
    await openWorkspace(
      setOf([core(), copyOf('odd', 'Odd ones', ['x100', 'x101', 'x102', 'x103'])]),
    )
    await settled()
    const odd = playlist('Odd ones')
    // The pick method shows only when there is a limit.
    expect(odd.queryByRole('radiogroup', { name: 'How Odd ones picks' })).toBeNull()
    await userEvent.type(odd.getByRole('textbox', { name: 'Limit of Odd ones' }), '2{Enter}')
    const method = within(odd.getByRole('radiogroup', { name: 'How Odd ones picks' }))
    expect(method.getByRole('radio', { name: 'Random' })).toBeChecked()
    expect(odd.getByRole('button', { name: /Reshuffle/ })).toBeInTheDocument()

    const tags = () =>
      odd.getAllByRole('listitem').map((item) => within(item).getByTestId('reason').textContent)
    await waitFor(() => {
      expect(tags().sort()).toEqual(['not picked', 'not picked', 'picked', 'picked'])
    })
    expect(odd.getByTestId('playlist-count')).toHaveAttribute(
      'title',
      '2 of 4 tracks in the set · 2 not picked',
    )

    // Rejecting a pick is turning on Exclude: the playlist picks again.
    const picked = odd
      .getAllByRole('listitem')
      .find((item) => within(item).getByTestId('reason').textContent === 'picked')
    if (!picked) throw new Error('no pick')
    await userEvent.click(within(picked).getByRole('button', { name: 'Exclude' }))
    await waitFor(() => {
      // The rejected one has no tag (its toggle says it); the other three compete again.
      expect(within(picked).queryByTestId('reason')).toBeNull()
      expect(
        odd
          .getAllByTestId('reason')
          .map((tag) => tag.textContent)
          .sort(),
      ).toEqual(['not picked', 'picked', 'picked'])
    })
    expect(odd.getByTestId('playlist-count')).toHaveAttribute(
      'title',
      '2 of 4 tracks in the set · 1 excluded · 1 not picked',
    )

    // Best fit has no Reshuffle; the limit can be taken away again.
    await userEvent.click(method.getByRole('radio', { name: 'Best fit' }))
    expect(method.getByRole('radio', { name: 'Best fit' })).toBeChecked()
    expect(odd.queryByRole('button', { name: /Reshuffle/ })).toBeNull()
    await userEvent.clear(odd.getByRole('textbox', { name: 'Limit of Odd ones' }))
    await userEvent.tab()
    expect(odd.queryByRole('radiogroup', { name: 'How Odd ones picks' })).toBeNull()
  })

  it('says when the must-include tracks alone fill the limit', async () => {
    await openWorkspace(
      setOf([copyOf('odd', 'Odd ones', ['x100', 'x101', 'x102'])], (set) => ({
        ...set,
        marks: { [madeId('x100')]: 'mustInclude', [madeId('x101')]: 'mustInclude' },
        playlists: set.playlists.map((p) => ({ ...p, choices: { ...p.choices, limit: 1 } })),
      })),
    )
    await settled()
    expect(playlist('Odd ones').getByText(/must-include, limit/)).toHaveTextContent(
      '2 must-include, limit 1',
    )
  })
})

describe('the workspace: key and BPM from the row', () => {
  it('opens the edit dialog from the key, and a filled-in track joins the set', async () => {
    await openWorkspace(setOf([core(), copyOf('odd', 'Odd ones', ['Lemon Tree'])]), {
      unknown: ['Lemon Tree'],
    })
    await settled()
    expect(tracksInMix()).toBe(8)
    const key = inRow('Odd ones', 'Lemon Tree').getByRole('button', { name: /^Key of Lemon Tree/ })
    expect(key).toHaveTextContent('unknown key')
    await userEvent.click(key)

    const dialog = within(await screen.findByRole('dialog', { name: /Key and BPM: Lemon Tree/ }))
    expect(dialog.getByText('ReccoBeats has no data for this track.')).toBeInTheDocument()
    await userEvent.selectOptions(dialog.getByRole('combobox', { name: 'Key' }), '11B')
    await userEvent.type(dialog.getByRole('spinbutton', { name: 'BPM' }), '95')
    await userEvent.click(dialog.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(inRow('Odd ones', 'Lemon Tree').queryByTestId('reason')).toBeNull()
    })
    expect(
      inRow('Odd ones', 'Lemon Tree').getByRole('button', { name: /^Key of Lemon Tree/ }),
    ).toHaveTextContent(/11B · A major\s*set by hand/)
    await settled()
    await waitFor(() => {
      expect(tracksInMix()).toBe(9)
    })
    // The change is explained: the track joined.
    const change = screen.getByRole('status', { name: 'Last change' })
    expect(change).toHaveTextContent('8 → 9 tracks')
    expect(change).toHaveTextContent('+ Lemon Tree')
    expect(row('Odd ones', 'Lemon Tree')).toHaveTextContent('joined the set in the last change')
  })

  it('opens the same dialog from the BPM, with where each value came from', async () => {
    await openWorkspace(setOf([core()]))
    await settled()
    await userEvent.click(inRow('WCS', 'Pompeii').getByRole('button', { name: /^BPM of Pompeii/ }))
    const dialog = within(await screen.findByRole('dialog', { name: /Key and BPM: Pompeii/ }))
    expect(dialog.getByText(/ReccoBeats says/)).toHaveTextContent('11B · A major, 127.4 BPM')
    expect(dialog.getAllByText('ReccoBeats', { exact: false }).length).toBeGreaterThan(2)
  })
})

describe('the workspace: one track list', () => {
  const two = () => setOf([core(), copyOf('odd', 'Odd ones', ['Higher Love', 'Lemon Tree'])])

  it('filters by status, inside each playlist', async () => {
    await openWorkspace(two(), { unknown: ['Lemon Tree'] })
    await settled()
    const show = within(screen.getByRole('radiogroup', { name: 'Show' }))
    expect(show.getByRole('radio', { name: /^All/ })).toHaveTextContent('All 10')
    expect(show.getByRole('radio', { name: /^In the set/ })).toHaveTextContent('9')
    expect(show.getByRole('radio', { name: /^Needs key\/BPM/ })).toHaveTextContent('1')

    await userEvent.click(show.getByRole('radio', { name: /^Left out/ }))
    expect(rowTitles('Odd ones')).toEqual(['Lemon Tree (feat. Will Jay)'])
    expect(playlist('WCS').getByText('No track here matches the filter.')).toBeInTheDocument()
    await userEvent.click(show.getByRole('radio', { name: /^In the set/ }))
    expect(rowTitles('Odd ones')).toEqual(['Higher Love'])
    expect(rowTitles('WCS')).toHaveLength(8)
  })

  it('finds tracks by title or artist', async () => {
    await openWorkspace(two())
    await settled()
    await userEvent.type(screen.getByRole('searchbox', { name: 'Find a track or artist' }), 'bast')
    expect(rowTitles('WCS')).toEqual(['Pompeii'])
    expect(playlist('Odd ones').queryAllByRole('listitem')).toEqual([])
  })

  it('sorts by BPM and by key inside each playlist', async () => {
    await openWorkspace(two())
    await settled()
    const sort = screen.getByRole('combobox', { name: 'Sort' })
    await userEvent.selectOptions(sort, 'BPM')
    expect(rowTitles('WCS').slice(0, 3)).toEqual(['Brother', 'Love Is', 'Girl on Fire'])
    expect(rowTitles('WCS').at(-1)).toBe('Pompeii')
    await userEvent.selectOptions(sort, 'Key')
    // 10B, then the 11Bs in playlist order, then 12A, then 12B.
    expect(rowTitles('WCS')).toEqual([
      'Try',
      'Love Is',
      'Girl on Fire',
      'Blank Space/Stand By Me - Live From Spotify London',
      'Pompeii',
      'Counting Stars',
      'Brother',
      'I Want To Break Free',
    ])
    await userEvent.selectOptions(sort, 'Playlist order')
    expect(rowTitles('WCS')[0]).toBe('Brother')
  })

  it('folds a playlist’s tracks away and back; several can be open', async () => {
    await openWorkspace(two())
    await settled()
    const fold = playlist('WCS').getByRole('button', { name: 'WCS' })
    expect(fold).toHaveAttribute('aria-expanded', 'true')
    await userEvent.click(fold)
    expect(fold).toHaveAttribute('aria-expanded', 'false')
    expect(playlist('WCS').queryAllByRole('listitem')).toEqual([])
    // The other playlist is untouched, and the folded one keeps its controls.
    expect(rowTitles('Odd ones')).toHaveLength(2)
    expect(playlist('WCS').getByRole('group', { name: 'BPM range of WCS' })).toBeInTheDocument()
    await userEvent.click(fold)
    expect(rowTitles('WCS')).toHaveLength(8)
  })

  it('keeps the headline in the mix while the list is filtered', async () => {
    await openWorkspace(two())
    await settled()
    await userEvent.type(screen.getByRole('searchbox'), 'zzz')
    expect(headline()).toHaveTextContent(/^10\s*tracks/)
  })
})
