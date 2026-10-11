import { screen, waitFor, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { wcsId } from '@/test/wcs'
import { copyOf, CORE, inRow, openWorkspace, row, setOf, settled } from '@/test/workspace'

vi.setConfig({ testTimeout: 60_000 })

// Two playlists: the pairs below join tracks across them.
const two = () =>
  setOf([
    copyOf('wcs', 'WCS', CORE),
    copyOf('odd', 'Odd ones', ['Higher Love', 'Stand By Me - Acoustic', 'Stolen Dance']),
  ])
const id = wcsId
const HIGHER = 'Higher Love'

const link = (playlistName: string, title: string) =>
  inRow(playlistName, title).getByRole('button', { name: /^Followed by…/ })
const arm = (playlistName: string, title: string) => userEvent.click(link(playlistName, title))
/** The button that completes the pair on a row, while a track waits. */
const choice = (playlistName: string, title: string) =>
  inRow(playlistName, title).getByRole('button', { name: /^Follow .+ with |can’t follow/ })
const notice = () => screen.queryByText(/is followed by… choose a track/)
const pairs = () => within(screen.getByRole('group', { name: 'Follow pairs' }))
const pin = (from: string, to: string) =>
  screen.getByRole('button', { name: `Keep ${from} and ${to} together` })

describe('follow pairs: "Followed by…" from a row', () => {
  it('arms a track, says which one waits and how to cancel', async () => {
    await openWorkspace(two())
    await settled()
    expect(notice()).toBeNull()
    await arm('Odd ones', HIGHER)
    expect(notice()).toHaveTextContent('Higher Love is followed by… choose a track. Esc cancels.')
    expect(link('Odd ones', HIGHER)).toHaveAttribute('aria-pressed', 'true')
    // The toggle group is separate from the link button and stays where it was.
    expect(
      inRow('Odd ones', HIGHER).getByRole('group', { name: 'Role of Higher Love' }),
    ).toBeVisible()

    await userEvent.keyboard('{Escape}')
    expect(notice()).toBeNull()
    expect(link('Odd ones', HIGHER)).toHaveAttribute('aria-pressed', 'false')

    await arm('Odd ones', HIGHER)
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(notice()).toBeNull()
    // Pressing the armed button again cancels too.
    await arm('Odd ones', HIGHER)
    await arm('Odd ones', HIGHER)
    expect(notice()).toBeNull()
  })

  it('shows on every other row the chart move it would make, and refuses a clash', async () => {
    await openWorkspace(two())
    await settled()
    await arm('Odd ones', HIGHER)
    // 4B → 11B is on the chart; 4B → 10B and 4B → 12B are not.
    expect(choice('WCS', 'Love Is')).toHaveAccessibleName(
      'Follow Higher Love with Love Is: energy (+++)',
    )
    expect(choice('WCS', 'Love Is')).toBeEnabled()
    expect(choice('Odd ones', 'Stand By Me - Acoustic')).toHaveAccessibleName(
      'Follow Higher Love with Stand By Me - Acoustic: energy −',
    )
    expect(choice('WCS', 'Try')).toHaveAccessibleName('Try can’t follow Higher Love: would clash')
    expect(choice('WCS', 'Try')).toBeDisabled()
    expect(choice('WCS', 'Try')).toHaveTextContent('✗')
    expect(choice('WCS', 'Brother')).toBeDisabled()
  })

  it('completes the pair with the next row chosen, in another playlist', async () => {
    const { stored } = await openWorkspace(two())
    await settled()
    await arm('Odd ones', HIGHER)
    await userEvent.click(choice('WCS', 'Love Is'))
    expect(notice()).toBeNull()

    // On both rows, with the partner's name.
    expect(
      inRow('Odd ones', HIGHER).getByRole('button', { name: 'Followed by Love Is. Show it' }),
    ).toHaveTextContent(/then\s*Love Is/)
    expect(
      inRow('WCS', 'Love Is').getByRole('button', { name: 'Follows Higher Love. Show it' }),
    ).toHaveTextContent(/after\s*Higher Love/)
    // In the mix column's list of pairs.
    expect(pairs().getByRole('listitem')).toHaveTextContent(
      /Higher Love\s*→\s*is followed by\s*Love Is/,
    )
    await waitFor(async () => {
      expect((await stored())?.mix.follows).toEqual([[id(HIGHER), id('Love Is')]])
    })
    // And as the pin between the two in the running order.
    await settled()
    await waitFor(() => {
      expect(pin(HIGHER, 'Love Is')).toHaveAttribute('aria-pressed', 'true')
    })
  })

  it('chooses with a click anywhere on the row', async () => {
    const { stored } = await openWorkspace(two())
    await settled()
    await arm('Odd ones', HIGHER)
    await userEvent.click(inRow('WCS', 'Love Is').getByTestId('track-title'))
    expect(notice()).toBeNull()
    await waitFor(async () => {
      expect((await stored())?.mix.follows).toEqual([[id(HIGHER), id('Love Is')]])
    })
    // A row that would clash can't be chosen that way either.
    await arm('WCS', 'Love Is')
    await userEvent.click(inRow('WCS', 'Brother').getByTestId('track-title'))
    await arm('Odd ones', HIGHER)
    await userEvent.click(inRow('WCS', 'Try').getByTestId('track-title'))
    expect(notice()).not.toBeNull()
  })

  it('works from the keyboard', async () => {
    const { stored } = await openWorkspace(two())
    await settled()
    link('Odd ones', HIGHER).focus()
    await userEvent.keyboard('{Enter}')
    expect(notice()).not.toBeNull()
    choice('WCS', 'Love Is').focus()
    await userEvent.keyboard('{Enter}')
    expect(notice()).toBeNull()
    await waitFor(async () => {
      expect((await stored())?.mix.follows).toEqual([[id(HIGHER), id('Love Is')]])
    })
  })

  it('extends a pair into a chain from its second track', async () => {
    const { stored } = await openWorkspace(
      setOf(two().playlists, (set) => ({
        ...set,
        mix: { ...set.mix, follows: [[id(HIGHER), id('Love Is')]] },
      })),
    )
    await settled()
    await arm('WCS', 'Love Is')
    // The chain can't close on itself, and a track has one leader.
    expect(choice('Odd ones', HIGHER)).toHaveAccessibleName(
      'Higher Love can’t follow Love Is: would close the chain on itself',
    )
    await userEvent.click(choice('WCS', 'Girl on Fire'))
    await waitFor(async () => {
      expect((await stored())?.mix.follows).toEqual([
        [id(HIGHER), id('Love Is')],
        [id('Love Is'), id('Girl on Fire')],
      ])
    })
    // Love Is now shows both of its partners.
    expect(
      inRow('WCS', 'Love Is').getByRole('button', { name: /^Follows Higher Love/ }),
    ).toBeVisible()
    expect(
      inRow('WCS', 'Love Is').getByRole('button', { name: /^Followed by Girl on Fire/ }),
    ).toBeVisible()

    await arm('WCS', 'Brother')
    expect(choice('WCS', 'Love Is')).toHaveAccessibleName(
      'Love Is can’t follow Brother: follows Higher Love already',
    )
  })

  it('gives a track another follower in place of the one it had', async () => {
    const { stored } = await openWorkspace(
      setOf(two().playlists, (set) => ({
        ...set,
        mix: { ...set.mix, follows: [[id(HIGHER), id('Love Is')]] },
      })),
    )
    await settled()
    await arm('Odd ones', HIGHER)
    expect(choice('WCS', 'Love Is')).toHaveAccessibleName(
      'Love Is can’t follow Higher Love: follows it already',
    )
    await userEvent.click(choice('Odd ones', 'Stand By Me - Acoustic'))
    await waitFor(async () => {
      expect((await stored())?.mix.follows).toEqual([[id(HIGHER), id('Stand By Me - Acoustic')]])
    })
    expect(inRow('WCS', 'Love Is').queryByRole('button', { name: /^Follows/ })).toBeNull()
  })

  it('can’t arm a track without a key, an excluded one, or the closer', async () => {
    await openWorkspace(
      setOf([copyOf('wcs', 'WCS', [...CORE, 'Lemon Tree'])], (set) => ({
        ...set,
        marks: { [id('Try')]: 'exclude' },
        mix: { ...set.mix, closer: id('Pompeii') },
      })),
      { unknown: ['Lemon Tree'] },
    )
    await settled()
    expect(link('WCS', 'Lemon Tree')).toBeDisabled()
    expect(link('WCS', 'Lemon Tree')).toHaveAttribute('title', 'Needs a key first')
    expect(link('WCS', 'Try')).toBeDisabled()
    expect(link('WCS', 'Pompeii')).toHaveAttribute('title', 'The closer is followed by nothing')
    expect(link('WCS', 'Brother')).toBeEnabled()
    // And while another track waits, they can't be chosen.
    await arm('WCS', 'Brother')
    expect(choice('WCS', 'Lemon Tree')).toHaveAccessibleName(/needs a key$/)
    expect(choice('WCS', 'Try')).toHaveAccessibleName(/excluded$/)
  })

  it('still lists, filters and folds while a track waits', async () => {
    await openWorkspace(two())
    await settled()
    await arm('Odd ones', HIGHER)
    await userEvent.type(screen.getByRole('searchbox'), 'love is')
    expect(notice()).not.toBeNull()
    expect(choice('WCS', 'Love Is')).toBeEnabled()
    await userEvent.click(screen.getByRole('button', { name: 'Odd ones' }))
    expect(notice()).not.toBeNull()
    await userEvent.click(choice('WCS', 'Love Is'))
    expect(notice()).toBeNull()
  })
})

describe('follow pairs: in the mix column and the running order', () => {
  it('pins a transition in the running order, and lets it part again', async () => {
    const { stored } = await openWorkspace(setOf([copyOf('wcs', 'WCS', CORE)]))
    await settled()
    const order = within(screen.getByRole('list', { name: 'Running order' }))
    const titles = order
      .getAllByRole('listitem')
      .filter((item) => item.hasAttribute('tabindex'))
      .map((item) => item.querySelector('.font-medium')?.textContent ?? '')
    const [first, second] = titles
    if (!first || !second) throw new Error('no order')
    expect(pairs().getByText('none')).toBeInTheDocument()

    await userEvent.click(pin(first, second))
    await waitFor(() => {
      expect(pin(first, second)).toHaveAttribute('aria-pressed', 'true')
    })
    expect(pairs().getByRole('listitem')).toHaveTextContent(first)
    await waitFor(async () => {
      expect((await stored())?.mix.follows).toHaveLength(1)
    })

    await userEvent.click(pin(first, second))
    await waitFor(async () => {
      expect((await stored())?.mix.follows).toEqual([])
    })
    expect(pairs().getByText('none')).toBeInTheDocument()
  })

  it('removes a pair from the list of pairs', async () => {
    const { stored } = await openWorkspace(
      setOf(two().playlists, (set) => ({
        ...set,
        mix: { ...set.mix, follows: [[id(HIGHER), id('Love Is')]] },
      })),
    )
    await settled()
    await userEvent.click(
      pairs().getByRole('button', { name: 'Remove the pair Higher Love → Love Is' }),
    )
    expect(pairs().getByText('none')).toBeInTheDocument()
    expect(inRow('WCS', 'Love Is').queryByRole('button', { name: /^Follows/ })).toBeNull()
    await waitFor(async () => {
      expect((await stored())?.mix.follows).toEqual([])
    })
  })

  it('highlights the partner when a pair on a row is pointed at', async () => {
    await openWorkspace(
      setOf(two().playlists, (set) => ({
        ...set,
        mix: { ...set.mix, follows: [[id(HIGHER), id('Love Is')]] },
      })),
    )
    await settled()
    expect(row('WCS', 'Love Is')).not.toHaveAttribute('data-highlighted')
    inRow('Odd ones', HIGHER)
      .getByRole('button', { name: /^Followed by Love Is/ })
      .focus()
    await waitFor(() => {
      expect(row('WCS', 'Love Is')).toHaveAttribute('data-highlighted')
    })
    expect(row('Odd ones', HIGHER)).not.toHaveAttribute('data-highlighted')
  })
})
