import { screen, waitFor, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { SPOTIFY } from '@/test/spotify-mocks'
import { wcsId } from '@/test/wcs'
import {
  copyOf,
  CORE,
  itemsOf,
  openWorkspace,
  playlist,
  playlistDto,
  rowTitles,
  setOf,
  settled,
  tracksInMix,
} from '@/test/workspace'

vi.setConfig({ testTimeout: 60_000 })

const core = () => copyOf('wcs', 'WCS', CORE)
const odd = () => copyOf('odd', 'Odd ones', ['Love Is', 'Higher Love', 'Stolen Dance'])

/** The playlist's small menu, opened. */
async function openMenu(name: string) {
  await userEvent.click(playlist(name).getByRole('button', { name: `More for ${name}` }))
  return within(await screen.findByRole('menu'))
}

describe('the workspace: a playlist that changed in Spotify', () => {
  const changed = [
    http.get(`${SPOTIFY}/playlists/wcs`, () =>
      HttpResponse.json(playlistDto('wcs', 'WCS', 'snap-2')),
    ),
    // Brother is gone; Follow Me and Shotgun are new.
    http.get(`${SPOTIFY}/playlists/wcs/items`, () =>
      HttpResponse.json(itemsOf([...CORE.slice(1), 'Follow Me', 'Shotgun'])),
    ),
  ]
  const withRules = () =>
    setOf([core(), odd()], (set) => ({
      ...set,
      marks: { [wcsId('Brother')]: 'mustInclude' },
      mix: { ...set.mix, opener: wcsId('Brother') },
    }))

  it('shows no notice for a playlist that is as it was stored', async () => {
    await openWorkspace(setOf([core(), odd()]))
    await settled()
    expect(playlist('WCS').queryByRole('status')).toBeNull()
    expect(playlist('WCS').queryByRole('button', { name: 'Update WCS' })).toBeNull()
  })

  it('says how it changed, and changes nothing until Update', async () => {
    await openWorkspace(withRules(), { handlers: changed })
    await settled()
    const notice = await playlist('WCS').findByRole('status')
    expect(notice).toHaveTextContent('2 new, 1 removed')
    expect(playlist('Odd ones').queryByRole('status')).toBeNull()
    // The stored copy is still in use.
    expect(rowTitles('WCS')).toContain('Brother')
    expect(rowTitles('WCS')).not.toContain('Shotgun')
    expect(tracksInMix()).toBe(10)
  })

  it('updates on demand and lists what was dropped', async () => {
    const { stored } = await openWorkspace(withRules(), { handlers: changed })
    await settled()
    await userEvent.click(await playlist('WCS').findByRole('button', { name: 'Update WCS' }))

    const done = await playlist('WCS').findByText('Updated from Spotify.')
    const lines = within(done.parentElement ?? done)
    expect(lines.getByText('1 track leaves the set: Brother.')).toBeInTheDocument()
    expect(lines.getByText('1 mark: Brother (always include).')).toBeInTheDocument()
    expect(lines.getByText('1 mix rule: Brother as the opener.')).toBeInTheDocument()
    // The notice is gone, the new tracks are listed, the removed one is not.
    expect(playlist('WCS').queryByRole('button', { name: 'Update WCS' })).toBeNull()
    expect(rowTitles('WCS')).not.toContain('Brother')
    expect(rowTitles('WCS').slice(-2)).toEqual(['Follow Me', 'Shotgun'])
    await waitFor(async () => {
      const set = await stored()
      expect(set?.playlists[0]?.snapshotId).toBe('snap-2')
      expect(set?.marks).toEqual({})
      expect(set?.mix.opener).toBeNull()
    })

    await userEvent.click(playlist('WCS').getByRole('button', { name: 'Dismiss' }))
    expect(playlist('WCS').queryByText('Updated from Spotify.')).toBeNull()
  })

  it('offers Update in the playlist’s menu too', async () => {
    await openWorkspace(withRules(), { handlers: changed })
    await settled()
    await playlist('WCS').findByRole('status')
    const menu = await openMenu('WCS')
    await userEvent.click(menu.getByRole('menuitem', { name: /Update from Spotify/ }))
    expect(await playlist('WCS').findByText('Updated from Spotify.')).toBeInTheDocument()
  })

  it('says a playlist can’t be checked when Spotify no longer has it, and keeps its copy', async () => {
    await openWorkspace(setOf([core(), odd()]), {
      handlers: [
        http.get(`${SPOTIFY}/playlists/odd`, () => HttpResponse.json({}, { status: 404 })),
      ],
    })
    await settled()
    const notice = await playlist('Odd ones').findByRole('status')
    expect(notice).toHaveTextContent('can’t be checked')
    expect(notice).toHaveAttribute(
      'title',
      expect.stringContaining('The set keeps its stored copy.'),
    )
    expect(rowTitles('Odd ones')).toHaveLength(3)
    // Update is offered only when there is something to apply.
    const menu = await openMenu('Odd ones')
    expect(menu.getByRole('menuitem', { name: /Update from Spotify/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
  })
})

describe('the workspace: the set’s playlists (U13)', () => {
  it('removes a playlist only after saying exactly what goes with it', async () => {
    const higher = wcsId('Higher Love')
    const { stored } = await openWorkspace(
      setOf([core(), odd()], (set) => ({
        ...set,
        marks: { [wcsId('Stolen Dance')]: 'exclude' },
        mix: { ...set.mix, follows: [[higher, wcsId('Love Is')]] },
      })),
    )
    await settled()
    const menu = await openMenu('Odd ones')
    await userEvent.click(menu.getByRole('menuitem', { name: /Remove from set/ }))

    const dialog = within(
      await screen.findByRole('dialog', { name: 'Remove “Odd ones” from this set?' }),
    )
    expect(dialog.getByText(/The playlist stays as it is in Spotify/)).toBeInTheDocument()
    // Love Is is in WCS too, so it stays; the other two go, with their mark and rule.
    expect(dialog.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      '2 tracks leave the set: Higher Love, Stolen Dance.',
      '1 mark: Stolen Dance (excluded).',
      '1 mix rule: the pair Higher Love → Love Is.',
    ])
    // Nothing has happened yet; Cancel keeps it that way.
    expect(screen.getByRole('region', { name: 'Odd ones', hidden: true })).toBeInTheDocument()
    await userEvent.click(dialog.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('region', { name: 'Odd ones' })).toBeInTheDocument()

    const again = await openMenu('Odd ones')
    await userEvent.click(again.getByRole('menuitem', { name: /Remove from set/ }))
    const confirm = within(await screen.findByRole('dialog'))
    await userEvent.click(confirm.getByRole('button', { name: 'Remove from set' }))
    await waitFor(() => {
      expect(screen.queryByRole('region', { name: 'Odd ones' })).toBeNull()
    })
    await waitFor(async () => {
      const set = await stored()
      expect(set?.playlists.map((p) => p.playlistId)).toEqual(['wcs'])
      expect(set?.marks).toEqual({})
      expect(set?.mix.follows).toEqual([])
    })
    await settled()
    expect(tracksInMix()).toBe(8)
  })

  it('says so when nothing else goes with a playlist', async () => {
    await openWorkspace(setOf([core(), copyOf('dup', 'Doubles', ['Love Is', 'Try'])]))
    await settled()
    const menu = await openMenu('Doubles')
    await userEvent.click(menu.getByRole('menuitem', { name: /Remove from set/ }))
    const dialog = within(await screen.findByRole('dialog'))
    expect(
      dialog.getByText(/All its tracks are in the set’s other playlists too/),
    ).toBeInTheDocument()
    expect(dialog.queryAllByRole('listitem')).toEqual([])
  })

  it('adds playlists with the picker, reading them as they are in Spotify now', async () => {
    const handlers = [
      http.get(`${SPOTIFY}/me/playlists`, () =>
        HttpResponse.json({
          items: [
            { ...playlistDto('wcs', 'WCS', 'snap-1'), items: { total: 8 } },
            { ...playlistDto('slow', 'Slow ones', 'slow-7'), items: { total: 2 } },
          ],
          next: null,
        }),
      ),
      http.get(`${SPOTIFY}/playlists/slow`, () =>
        HttpResponse.json(playlistDto('slow', 'Slow ones', 'slow-7')),
      ),
      http.get(`${SPOTIFY}/playlists/slow/items`, () =>
        HttpResponse.json(itemsOf(['Higher Love', 'Stolen Dance'])),
      ),
    ]
    const { stored } = await openWorkspace(setOf([core()]), { handlers })
    await settled()
    await userEvent.click(screen.getByRole('button', { name: 'Add playlists' }))
    const dialog = within(await screen.findByRole('dialog', { name: 'Add playlists' }))
    // A playlist is in a set once.
    const taken = await dialog.findByRole('checkbox', { name: /WCS/ })
    expect(taken).toBeDisabled()
    expect(taken).toHaveAccessibleName(/Already in this set/)
    expect(dialog.getByRole('button', { name: 'Add to the set' })).toBeDisabled()

    await userEvent.click(dialog.getByRole('checkbox', { name: /Slow ones/ }))
    await userEvent.click(dialog.getByRole('button', { name: 'Add to the set' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
    expect(await screen.findByRole('region', { name: 'Slow ones' })).toBeInTheDocument()
    expect(rowTitles('Slow ones')).toEqual(['Higher Love', 'Stolen Dance'])
    await settled()
    await waitFor(() => {
      expect(tracksInMix()).toBe(10)
    })
    await waitFor(async () => {
      expect((await stored())?.playlists.map((p) => [p.playlistId, p.snapshotId])).toEqual([
        ['wcs', 'snap-1'],
        ['slow', 'slow-7'],
      ])
    })
  })

  it('adds nothing when a playlist can’t be read, and says which', async () => {
    const handlers = [
      http.get(`${SPOTIFY}/me/playlists`, () =>
        HttpResponse.json({
          items: [{ ...playlistDto('slow', 'Slow ones', 'slow-7'), items: { total: 2 } }],
          next: null,
        }),
      ),
      http.get(`${SPOTIFY}/playlists/slow`, () =>
        HttpResponse.json({ error: { status: 502, message: 'Bad gateway' } }, { status: 502 }),
      ),
    ]
    await openWorkspace(setOf([core()]), { handlers })
    await settled()
    await userEvent.click(screen.getByRole('button', { name: 'Add playlists' }))
    const dialog = within(await screen.findByRole('dialog', { name: 'Add playlists' }))
    await userEvent.click(await dialog.findByRole('checkbox', { name: /Slow ones/ }))
    await userEvent.click(dialog.getByRole('button', { name: 'Add to the set' }))
    expect(await dialog.findByRole('alert')).toHaveTextContent(
      'Couldn’t read “Slow ones”: Bad gateway. Nothing was added.',
    )
    expect(dialog.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Slow ones' })).toBeNull()
  })

  it('offers to add playlists in a set that has none', async () => {
    await openWorkspace(setOf([]))
    expect(await screen.findByText('This set has no playlists yet.')).toBeInTheDocument()
    await settled()
    expect(screen.getByTestId('problems')).toHaveTextContent(
      'This set has no playlists yet. Add one to start mixing.',
    )
    expect(screen.getAllByRole('button', { name: 'Add playlists' }).length).toBeGreaterThan(1)
  })
})
