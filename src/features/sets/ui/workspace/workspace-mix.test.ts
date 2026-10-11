import { fireEvent, screen, waitFor, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { inlineSolverClient, type SolverClient } from '@/features/mixing'
import { wcsId } from '@/test/wcs'
import {
  copyOf,
  CORE,
  headline,
  inRow,
  madeId,
  mixRegion,
  openWorkspace,
  playlist,
  row,
  rowTitles,
  setOf,
  settled,
  storeOf,
  tracksInMix,
} from '@/test/workspace'

vi.setConfig({ testTimeout: 60_000 })
afterEach(() => {
  vi.restoreAllMocks()
})

const core = () => setOf([copyOf('wcs', 'WCS', CORE)])
const alternatives = () =>
  within(screen.getByRole('radiogroup', { name: 'Alternative mixes' })).getAllByRole('radio')
const orderRows = () =>
  within(screen.getByRole('list', { name: 'Running order' }))
    .getAllByRole('listitem')
    .filter((item) => item.hasAttribute('tabindex'))
const orderTitles = () =>
  orderRows().map((item) => item.querySelector('.font-medium')?.textContent ?? '')
const points = () => within(mixRegion()).getAllByRole('img')
const change = () => screen.getByRole('status', { name: 'Last change' })

/** A solver that can be made to wait, to look at the screen while it works. */
function heldSolver() {
  const waiting: (() => void)[] = []
  let holding = false
  const client: SolverClient = (request) => {
    if (!holding) return inlineSolverClient(request)
    const gate = new Promise<void>((resolve) => waiting.push(resolve))
    return { result: gate.then(() => inlineSolverClient(request).result), cancel: () => undefined }
  }
  return {
    client,
    hold: () => {
      holding = true
    },
    release: () => {
      holding = false
      for (const go of waiting.splice(0)) go()
    },
  }
}

describe('the mix column', () => {
  it('shows the mix: headline numbers, the tempo chart, alternatives and the running order', async () => {
    await openWorkspace(core())
    // A calm state first, then the result.
    expect(await within(mixRegion()).findByRole('status')).toHaveTextContent(
      /Looking up keys and tempos…|Working out the mix…/,
    )
    await settled()
    expect(headline()).toHaveTextContent(/^8\s*tracks\s*27\s*min\s*78–127.4\s*BPM/)
    expect(headline()).toHaveTextContent(/cost\s*\d+\.\d/)
    expect(headline()).toHaveTextContent(/=\d+\s*perfect/)
    expect(points()).toHaveLength(8)
    expect(alternatives().length).toBeGreaterThan(1)
    expect(alternatives()[0]).toBeChecked()
    expect(orderRows()).toHaveLength(8)
    // Every key in both notations there too.
    expect(orderRows()[0]).toHaveTextContent(/\d+[AB] · [A-G][♭♯]? (major|minor)/)
    expect(screen.getByRole('group', { name: /^Keys used: / })).toBeInTheDocument()
  })

  it('shows another alternative when it is chosen, and remembers it', async () => {
    const setsStore = storeOf(core())
    const first = await openWorkspace(core(), { setsStore })
    await settled()
    const best = orderTitles()
    const second = alternatives()[1]
    if (!second) throw new Error('one alternative only')
    expect(second).toHaveAccessibleName(/^Mix 2, cost \d+\.\d, .+ opens with .+, closes with .+$/)

    await userEvent.click(second)
    expect(alternatives()[1]).toBeChecked()
    const chosen = orderTitles()
    expect(chosen).not.toEqual(best)
    await waitFor(async () => {
      expect((await first.stored())?.chosenMix?.order).toHaveLength(8)
    })

    // Reloading the page finds the set as it was left.
    first.unmount()
    await openWorkspace(core(), { setsStore })
    await settled()
    expect(alternatives()[1]).toBeChecked()
    expect(orderTitles()).toEqual(chosen)
  })

  it('shapes the mix to an arc, and draws the arc’s target', async () => {
    const { stored, container } = await openWorkspace(core())
    await settled()
    expect(container.querySelector('polyline[stroke-dasharray]')).toBeNull()
    expect(screen.getByRole('radio', { name: 'No arc' })).toBeChecked()
    await userEvent.click(screen.getByRole('radio', { name: 'Two waves' }))
    await waitFor(async () => {
      expect((await stored())?.mix.arc).toBe('twoWaves')
    })
    await settled()
    await waitFor(() => {
      expect(container.querySelector('polyline[stroke-dasharray]')).not.toBeNull()
    })
  })

  it('keeps the previous mix on screen, marked as updating, while a new one is worked out', async () => {
    const solver = heldSolver()
    await openWorkspace(core(), { solverClient: solver.client })
    await settled()
    const before = orderTitles()
    const cost = headline().textContent

    solver.hold()
    await userEvent.click(inRow('WCS', 'Try').getByRole('button', { name: 'Exclude' }))
    const marker = await within(mixRegion()).findByText('Updating…')
    expect(marker).toBeVisible()
    expect(mixRegion()).toHaveAttribute('aria-busy', 'true')
    // Nothing emptied or jumped: the same mix is still there.
    expect(orderTitles()).toEqual(before)
    expect(headline().textContent).toContain(cost)
    expect(points()).toHaveLength(8)
    // The list already shows the new state.
    expect(row('WCS', 'Try')).toHaveAttribute('data-left-out')

    solver.release()
    await settled()
    expect(within(mixRegion()).queryByText('Updating…')).toBeNull()
    expect(orderTitles()).not.toContain('Try')
    expect(points()).toHaveLength(7)
  })

  it('says what a change did: tracks out, cost before and after', async () => {
    await openWorkspace(core())
    await settled()
    expect(change()).toHaveTextContent('What a change does to the mix shows here.')
    await userEvent.click(inRow('WCS', 'Try').getByRole('button', { name: 'Exclude' }))
    await settled()
    await waitFor(() => {
      expect(change()).toHaveTextContent('8 → 7 tracks')
    })
    expect(change()).toHaveTextContent('− Try')
    expect(change()).toHaveTextContent(/cost \d+\.\d → \d+\.\d/)
    expect(row('WCS', 'Try')).toHaveTextContent('left the set in the last change')
  })

  it('names the picks that changed', async () => {
    await openWorkspace(
      setOf([copyOf('wcs', 'WCS', CORE), copyOf('odd', 'Odd ones', ['x100', 'x101', 'x102'])]),
    )
    await settled()
    const odd = playlist('Odd ones')
    await userEvent.type(odd.getByRole('textbox', { name: 'Limit of Odd ones' }), '1{Enter}')
    await settled()
    await waitFor(() => {
      expect(change()).toHaveTextContent('11 → 9 tracks')
    })
    await userEvent.click(odd.getByRole('button', { name: /Reshuffle/ }))
    await userEvent.click(odd.getByRole('button', { name: /Reshuffle/ }))
    // A reshuffle either keeps the pick or names what went out and what came in.
    await settled()
    expect(change().textContent).toMatch(
      /Odd ones picks: − Track x10\d \+ Track x10\d|11 → 9 tracks/,
    )
  })
})

describe('problems where the mix would be (W9)', () => {
  it('names a must-include track without key or BPM, with the fix one step away', async () => {
    await openWorkspace(
      setOf([copyOf('wcs', 'WCS', [...CORE, 'Lemon Tree'])], (set) => ({
        ...set,
        marks: { [wcsId('Lemon Tree')]: 'mustInclude' },
      })),
      { unknown: ['Lemon Tree'] },
    )
    await settled()
    const problems = within(screen.getByTestId('problems'))
    expect(problems.getByRole('heading', { name: 'No mix yet' })).toBeVisible()
    expect(
      problems.getByText(/Lemon Tree .* is marked must-include but has no key or BPM/),
    ).toBeVisible()
    // The result is replaced in place: no chart, no stale numbers, nothing to save.
    expect(within(mixRegion()).queryByTestId('headline')).toBeNull()
    expect(screen.getByRole('button', { name: 'Save to Spotify' })).toBeDisabled()

    await userEvent.click(
      problems.getByRole('button', { name: 'Set key and BPM of Lemon Tree (feat. Will Jay)' }),
    )
    const dialog = within(await screen.findByRole('dialog', { name: /Key and BPM: Lemon Tree/ }))
    await userEvent.selectOptions(dialog.getByRole('combobox', { name: 'Key' }), '11B')
    await userEvent.type(dialog.getByRole('spinbutton', { name: 'BPM' }), '95')
    await userEvent.click(dialog.getByRole('button', { name: 'Save' }))
    await settled()
    await waitFor(() => {
      expect(tracksInMix()).toBe(9)
    })
    expect(screen.queryByTestId('problems')).toBeNull()
  })

  it('explains why no mix is possible and offers the left-out tracks that would fit', async () => {
    // Bloodstream (2A) only mixes after Counting Stars (12A) and before Stolen Dance (1B).
    await openWorkspace(
      setOf([
        copyOf('wcs', 'WCS', [
          'Brother',
          'Love Is',
          'Girl on Fire',
          'Pompeii',
          'Counting Stars',
          'Bloodstream',
          'Stolen Dance',
        ]),
      ]),
    )
    await settled()
    expect(tracksInMix()).toBe(7)
    for (const title of ['Counting Stars', 'Stolen Dance']) {
      await userEvent.click(inRow('WCS', title).getByRole('button', { name: 'Exclude' }))
    }
    const problems = within(await screen.findByTestId('problems'))
    expect(
      await problems.findByText(
        /Bloodstream \(2A\) can’t follow or precede any other included track/,
      ),
    ).toHaveTextContent(/Left-out tracks that would fit: /)
    expect(change()).toHaveTextContent('no mix')

    await userEvent.click(problems.getByRole('button', { name: 'Always include Stolen Dance' }))
    await settled()
    await waitFor(() => {
      expect(tracksInMix()).toBe(6)
    })
    expect(
      inRow('WCS', 'Stolen Dance').getByRole('button', { name: 'Always include' }),
    ).toHaveAttribute('aria-pressed', 'true')
    expect(change()).toHaveTextContent(/mix found, cost \d+\.\d/)
  })

  it('reports a rule that names an excluded track, and can drop either', async () => {
    await openWorkspace(
      setOf([copyOf('wcs', 'WCS', CORE)], (set) => ({
        ...set,
        marks: { [wcsId('Try')]: 'exclude' },
        mix: { ...set.mix, follows: [[wcsId('Try'), wcsId('Pompeii')]] },
      })),
    )
    await settled()
    const problems = within(screen.getByTestId('problems'))
    expect(problems.getByText(/Try .* is excluded, but .* must be followed by/)).toBeVisible()
    expect(problems.getByRole('button', { name: 'Stop excluding Try' })).toBeVisible()
    // The pairs stay within reach while there is no mix.
    expect(screen.getByRole('group', { name: 'Follow pairs' })).toHaveTextContent('Try')
    await userEvent.click(problems.getByRole('button', { name: 'Remove the pair Try → Pompeii' }))
    await settled()
    expect(screen.queryByTestId('problems')).toBeNull()
    expect(tracksInMix()).toBe(7)
  })
})

describe('one track, everywhere (W6)', () => {
  const marked = () => ({
    rows: screen
      .getAllByRole('listitem')
      .filter((item) => item.hasAttribute('data-highlighted'))
      .map(
        (item) =>
          (item.querySelector('[data-testid="track-title"]') ?? item.querySelector('.font-medium'))
            ?.textContent ?? '',
      ),
    points: points()
      .filter((point) => point.hasAttribute('data-highlighted'))
      .map((point) => point.getAttribute('aria-label') ?? ''),
  })

  it('highlights a track pointed at in the list in the chart, the wheel and the running order', async () => {
    await openWorkspace(core())
    await settled()
    expect(marked()).toEqual({ rows: [], points: [] })
    await fireEvent.pointerEnter(row('WCS', 'Pompeii'))
    // Its row in the list and its row in the running order.
    expect(marked().rows).toEqual(['Pompeii', 'Pompeii'])
    expect(marked().points).toEqual([expect.stringMatching(/^\d\. Pompeii, 11B/)])
    expect(screen.getByRole('img', { name: /^11B · A major/ })).toHaveAttribute('data-highlighted')
    expect(screen.getByTestId('chart-guide')).toBeInTheDocument()

    await fireEvent.pointerLeave(row('WCS', 'Pompeii'))
    expect(marked()).toEqual({ rows: [], points: [] })
  })

  it('highlights from the chart, the running order and the wheel too, and on focus', async () => {
    await openWorkspace(core())
    await settled()
    const brother = points().find((point) =>
      (point.getAttribute('aria-label') ?? '').includes(' Brother,'),
    )
    if (!brother) throw new Error('no point')
    await fireEvent.focus(brother)
    expect(row('WCS', 'Brother')).toHaveAttribute('data-highlighted')
    await fireEvent.blur(brother)
    expect(row('WCS', 'Brother')).not.toHaveAttribute('data-highlighted')

    const inOrder = orderRows().find((item) => item.textContent.includes('Try'))
    if (!inOrder) throw new Error('no row')
    await fireEvent.focus(inOrder)
    expect(row('WCS', 'Try')).toHaveAttribute('data-highlighted')
    await fireEvent.blur(inOrder)

    // 12A has one track: Counting Stars.
    await fireEvent.focus(screen.getByRole('img', { name: /^12A · C♯ minor/ }))
    expect(row('WCS', 'Counting Stars')).toHaveAttribute('data-highlighted')
    // Focus inside a row counts as pointing at it.
    inRow('WCS', 'Pompeii').getByRole('button', { name: 'Opener' }).focus()
    await waitFor(() => {
      expect(marked().points).toEqual([expect.stringMatching(/Pompeii/)])
    })
  })

  it('brings a track chosen in the chart into view in the list: unfolded, unfiltered', async () => {
    await openWorkspace(core())
    await settled()
    await userEvent.click(screen.getByRole('button', { name: 'WCS' }))
    await userEvent.type(screen.getByRole('searchbox'), 'zzz')
    expect(playlist('WCS').queryAllByRole('listitem')).toEqual([])
    const pompeii = points().find((point) =>
      (point.getAttribute('aria-label') ?? '').includes(' Pompeii,'),
    )
    if (!pompeii) throw new Error('no point')
    await userEvent.click(pompeii)
    await waitFor(() => {
      expect(rowTitles('WCS')).toContain('Pompeii')
    })
    expect(screen.getByRole('searchbox')).toHaveValue('')
    expect(row('WCS', 'Pompeii')).toHaveAttribute('data-highlighted')
  })
})

describe('the top bar: the set’s name', () => {
  it('renames the set in place; a blank name is not taken', async () => {
    const { stored } = await openWorkspace(core())
    await settled()
    const name = screen.getByRole('textbox', { name: 'Set name' })
    expect(name).toHaveValue('Friday social')
    await userEvent.clear(name)
    await userEvent.type(name, 'Saturday social{Enter}')
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Saturday social' }),
    ).toBeInTheDocument()
    await waitFor(async () => {
      expect((await stored())?.name).toBe('Saturday social')
    })
    await userEvent.clear(name)
    await userEvent.tab()
    expect(name).toHaveValue('Saturday social')
    // Esc gives up an edit.
    await userEvent.type(name, ' night{Escape}')
    expect(name).toHaveValue('Saturday social')
  })
})

describe('at phone width (W10)', () => {
  const narrow = () =>
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query) =>
        ({
          matches: false,
          media: query,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
        }) as unknown as MediaQueryList,
    )
  /** A tab's panel; the hidden ones stay in the page, so by ID rather than by role. */
  const panel = (name: string) => {
    const found = document.getElementById(`panel-${name.toLowerCase()}`)
    if (!found) throw new Error(`No panel for ${name}`)
    expect(found).toHaveAttribute('role', 'tabpanel')
    return found
  }

  it('offers the same tools as tabs under the chart', async () => {
    narrow()
    await openWorkspace(core())
    await settled()
    // The chart and the headline numbers stay on top.
    expect(headline()).toHaveTextContent(/^8\s*tracks/)
    expect(points()).toHaveLength(8)
    const tabs = within(screen.getByRole('tablist', { name: 'Tools' })).getAllByRole('tab')
    expect(tabs.map((tab) => tab.textContent.trim())).toEqual(['Tracks', 'Mix', 'Order'])
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
    expect(panel('Tracks')).toBeVisible()
    expect(panel('Mix')).not.toBeVisible()

    await userEvent.click(screen.getByRole('tab', { name: 'Mix' }))
    expect(panel('Mix')).toBeVisible()
    expect(panel('Tracks')).not.toBeVisible()
    expect(
      within(panel('Mix')).getByRole('radiogroup', { name: 'Alternative mixes' }),
    ).toBeVisible()
    expect(within(panel('Mix')).getByRole('radio', { name: 'Two waves' })).toBeInTheDocument()
    expect(within(panel('Mix')).getByRole('group', { name: 'Follow pairs' })).toBeVisible()
    expect(within(panel('Mix')).getByRole('status', { name: 'Last change' })).toBeVisible()

    await userEvent.click(screen.getByRole('tab', { name: 'Order' }))
    expect(within(panel('Order')).getByRole('list', { name: 'Running order' })).toBeVisible()
    expect(within(panel('Order')).getByRole('group', { name: /^Keys used/ })).toBeVisible()
  })

  it('keeps a tab’s state while another is shown', async () => {
    narrow()
    await openWorkspace(core())
    await settled()
    await userEvent.type(screen.getByRole('searchbox'), 'pompeii')
    await userEvent.click(screen.getByRole('button', { name: 'WCS' }))
    await userEvent.click(screen.getByRole('tab', { name: 'Order' }))
    await userEvent.click(screen.getByRole('tab', { name: 'Tracks' }))
    expect(screen.getByRole('searchbox')).toHaveValue('pompeii')
    expect(screen.getByRole('button', { name: 'WCS' })).toHaveAttribute('aria-expanded', 'false')
  })

  it('goes to the track list when a track is chosen in the running order', async () => {
    narrow()
    await openWorkspace(core())
    await settled()
    await userEvent.click(screen.getByRole('tab', { name: 'Order' }))
    const first = orderRows()[0]
    if (!first) throw new Error('no order')
    await userEvent.click(first)
    expect(screen.getByRole('tab', { name: 'Tracks' })).toHaveAttribute('aria-selected', 'true')
  })
})

describe('a large pool', () => {
  it('lists 1,000 tracks, and filters and marks them', async () => {
    const pool = Array.from({ length: 1000 }, (_, i) => `x${80 + (i % 60)}n${i}`.padEnd(22, 'A'))
    const big = copyOf('big', 'Everything', [])
    big.tracks = pool.map((trackId, i) => ({
      trackId,
      uri: `spotify:track:${trackId}`,
      title: `Track ${i}`,
      artists: [i % 2 ? 'Odd Artist' : 'Even Artist'],
      durationMs: 200_000,
      imageUrl: null,
    }))
    await openWorkspace(
      setOf([big], (set) => ({
        ...set,
        playlists: set.playlists.map((p) => ({ ...p, choices: { ...p.choices, limit: 30 } })),
      })),
    )
    await settled()
    expect(playlist('Everything').getAllByRole('listitem')).toHaveLength(1000)
    expect(playlist('Everything').getByTestId('playlist-count')).toHaveAttribute(
      'title',
      '30 of 1000 tracks in the set · 970 not picked',
    )
    expect(tracksInMix()).toBe(30)

    await userEvent.click(screen.getByRole('radio', { name: /^In the set/ }))
    expect(playlist('Everything').getAllByRole('listitem')).toHaveLength(30)
    await userEvent.click(screen.getByRole('radio', { name: /^All/ }))
    await userEvent.type(screen.getByRole('searchbox'), 'track 99')
    // Track 99, 199 … 899, and 990 … 999.
    expect(rowTitles('Everything')).toHaveLength(19)
    await userEvent.click(
      inRow('Everything', 'Track 990').getByRole('button', { name: 'Always include' }),
    )
    await waitFor(() => {
      expect(row('Everything', 'Track 990')).toHaveTextContent('in the set · must include')
    })
    expect(madeId('x100')).toHaveLength(22)
  })
})
