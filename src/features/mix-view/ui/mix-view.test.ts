import { fireEvent, render, screen, within } from '@testing-library/vue'
import { describe, expect, it } from 'vitest'
import { DEFAULT_PROFILE, evaluateMix, withArc, type MixTrack } from '@/features/mixing'
import { parseCamelot } from '@/shared/music'
import { wcsOrder } from '@/test/wcs'
import type { EntryInfo } from '../domain/layout'
import KeyWheel from './KeyWheel.vue'
import RunningOrder from './RunningOrder.vue'
import TempoArcChart from './TempoArcChart.vue'

const order: MixTrack[] = wcsOrder('hand_tuned').map((t) => ({
  ...t,
  camelot: parseCamelot(t.camelot) ?? '8A',
}))
const mix = evaluateMix(
  order,
  withArc(DEFAULT_PROFILE, { preset: 'twoWaves', signal: 'bpm', weight: 8 }),
)
const info = new Map<string, EntryInfo>(
  order.map((t) => [t.id, { title: t.label, artists: ['Artist A', 'B'], durationMs: 200_000 }]),
)

// Price Tag saved at double time (175), between tracks near 90.
const doubled = evaluateMix(
  (
    [
      ['a', 'Opener', '8A', 88],
      ['b', 'Price Tag', '8A', 175],
      ['c', 'Closer', '8A', 90],
    ] as const
  ).map(([id, label, camelot, bpm]) => ({ id, label, camelot, bpm, energy: null })),
  DEFAULT_PROFILE,
)
const doubledInfo = new Map<string, EntryInfo>(
  doubled.order.map((t) => [t.id, { title: t.label, artists: ['X'], durationMs: 200_000 }]),
)

const pointsOf = (line: Element) =>
  (line.getAttribute('points') ?? '')
    .split(' ')
    .map((pair) => pair.split(',').map(Number) as [number, number])

describe('TempoArcChart', () => {
  it('plots the saved BPM, never halved or doubled', async () => {
    render(TempoArcChart, { props: { mix: doubled, info: doubledInfo } })
    const priceTag = screen.getAllByRole('img')[1]
    if (!priceTag) throw new Error('no point')
    expect(priceTag).toHaveAccessibleName(
      '2. Price Tag, 8A, A minor, 175 BPM, perfect match from 8A',
    )
    await fireEvent.focus(priceTag)
    expect(screen.getByTestId('point-card')).toHaveTextContent('175 BPM')
  })

  it('labels every point with position, title, key code and name, BPM and the move in', () => {
    render(TempoArcChart, { props: { mix, info } })
    const points = screen.getAllByRole('img')
    expect(points).toHaveLength(20)
    // Brother's energy is known (0.929); Love Is has none.
    expect(points[0]).toHaveAccessibleName('1. Brother, 12B, E major, 78 BPM, energy 9 of 10')
    expect(points[1]).toHaveAccessibleName('2. Love Is, 11B, A major, 88 BPM, energy − from 12B')
    for (const p of points) expect(p).toHaveAttribute('tabindex', '0')
  })

  it('shows a card on focus and hides it on blur', async () => {
    render(TempoArcChart, { props: { mix, info } })
    const pompeii = screen.getAllByRole('img')[6]
    if (!pompeii) throw new Error('no point')
    await fireEvent.focus(pompeii)
    const card = screen.getByTestId('point-card')
    expect(card).toHaveTextContent('7. Pompeii')
    expect(card).toHaveTextContent('Artist A, B')
    // Keys as Camelot codes: the name is on the point's label, not spelled out here.
    expect(within(card).getByTestId('key')).toHaveTextContent(/^11B · A major$/)
    expect(within(card).getByText('· A major')).toHaveClass('sr-only')
    expect(card).toHaveTextContent('127.4 BPM')
    expect(within(card).getByTestId('energy')).toHaveTextContent(/^7Energy 7 of 10$/)
    expect(card).toHaveTextContent(/− energy − from 12B$/)
    await fireEvent.blur(pompeii)
    expect(screen.queryByTestId('point-card')).toBeNull()
  })

  it('draws a badge per transition and the arc target', () => {
    const { container } = render(TempoArcChart, { props: { mix, info } })
    const badges = [...container.querySelectorAll('rect')].map((r) =>
      r.nextElementSibling?.textContent.trim(),
    )
    expect(badges).toHaveLength(19)
    expect(badges.filter((b) => b === '=')).toHaveLength(9)
    expect(container.querySelector('polyline[stroke-dasharray]')).not.toBeNull()
  })

  // The height of a track's dot: Brother (78) is the slowest, Pompeii (127.4) the fastest.
  const dotY = (i: number) => Number(screen.getAllByRole('img')[i]?.getAttribute('cy'))

  it('draws energy over the span of the set’s BPM, so equal heights stand equally high', () => {
    render(TempoArcChart, { props: { mix, info } })
    const known = order.filter((t) => t.energy !== null)
    const points = pointsOf(screen.getByTestId('energy-line'))
    expect(points).toHaveLength(known.length)
    // The lowest energy is level with the slowest track, the highest with the fastest.
    const ys = points.map(([, py]) => py)
    expect(Math.max(...ys)).toBeCloseTo(dotY(0))
    expect(Math.min(...ys)).toBeCloseTo(dotY(6))
  })

  it('draws no energy line when fewer than two tracks have an energy', () => {
    render(TempoArcChart, { props: { mix: doubled, info: doubledInfo } })
    expect(screen.queryByTestId('energy-line')).toBeNull()
  })

  it('marks the moves against the arc when the keys are to follow it', () => {
    const aligned = evaluateMix(
      order,
      withArc(DEFAULT_PROFILE, { preset: 'twoWaves', signal: 'both', weight: 8, slopeWeight: 10 }),
    )
    const { container } = render(TempoArcChart, { props: { mix: aligned, info } })
    const marked = container.querySelectorAll('rect[data-against]')
    expect(marked.length).toBe(aligned.arc?.against.filter(Boolean).length)
    expect(marked.length).toBeGreaterThan(0)
    // Brother → Love Is: a − where the arc climbs.
    expect(screen.getAllByRole('img')[1]).toHaveAccessibleName(/from 12B, against the arc$/)
    // Without the rule nothing is marked.
    const plain = render(TempoArcChart, { props: { mix, info } })
    expect(plain.container.querySelectorAll('rect[data-against]')).toHaveLength(0)
  })

  it('draws the target of an arc that follows energy on the same span', () => {
    const byEnergy = evaluateMix(
      order,
      withArc(DEFAULT_PROFILE, { preset: 'twoWaves', signal: 'energy', weight: 8 }),
    )
    const { container } = render(TempoArcChart, { props: { mix: byEnergy, info } })
    const target = container.querySelector('polyline[stroke-dasharray]')
    if (!target) throw new Error('no target')
    expect(target).toHaveAttribute('stroke', 'var(--warn)')
    // The same span as everything else: the line's top is level with the fastest track.
    const ys = pointsOf(target).map(([, py]) => py)
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(dotY(6) - 1e-6)
    expect(Math.max(...ys)).toBeLessThanOrEqual(dotY(0) + 1e-6)
  })

  it('says which track is pointed at or focused, and when it no longer is', async () => {
    const view = render(TempoArcChart, { props: { mix, info } })
    const pompeii = screen.getAllByRole('img')[6]
    if (!pompeii) throw new Error('no point')
    await fireEvent.focus(pompeii)
    await fireEvent.blur(pompeii)
    await fireEvent.pointerEnter(pompeii)
    expect(view.emitted('point')).toEqual([[order[6]?.id], [null], [order[6]?.id]])
    await fireEvent.click(pompeii)
    expect(view.emitted('select')).toEqual([[order[6]?.id]])
  })

  it('marks the track pointed at in another view', async () => {
    const view = render(TempoArcChart, { props: { mix, info, highlighted: null } })
    expect(screen.queryByTestId('chart-guide')).toBeNull()
    await view.rerender({ highlighted: order[6]?.id })
    expect(screen.getByTestId('chart-guide')).toBeInTheDocument()
    const marked = screen.getAllByRole('img').filter((p) => p.hasAttribute('data-highlighted'))
    expect(marked.map((p) => p.getAttribute('aria-label'))).toEqual([
      expect.stringMatching(/^7\. Pompeii/),
    ])
    // Pointing from elsewhere opens no card here.
    expect(screen.queryByTestId('point-card')).toBeNull()
  })
})

describe('KeyWheel', () => {
  it('summarises the keys used with counts', () => {
    render(KeyWheel, { props: { mix } })
    const wheel = screen.getByRole('group')
    expect(wheel.getAttribute('aria-label')).toContain('7B F major × 4')
    expect(screen.getByText('7B×4')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '7B · F major · 4 tracks' })).toHaveAttribute(
      'tabindex',
      '0',
    )
  })

  it('marks the key of the track pointed at in another view', async () => {
    const view = render(KeyWheel, { props: { mix, highlighted: null } })
    const cell = screen.getByRole('img', { name: /^11B · A major/ })
    expect(cell).not.toHaveAttribute('data-highlighted')
    await view.rerender({ highlighted: order[6]?.id }) // Pompeii, 11B
    expect(cell).toHaveAttribute('data-highlighted')
  })

  it('points at the first track in a key', async () => {
    const view = render(KeyWheel, { props: { mix } })
    const first = order.find((track) => track.camelot === '7B')
    await fireEvent.focus(screen.getByRole('img', { name: /^7B · F major/ }))
    await fireEvent.blur(screen.getByRole('img', { name: /^7B · F major/ }))
    expect(view.emitted('point')).toEqual([[first?.id], [null]])
  })
})

describe('RunningOrder', () => {
  it('shows each track with its key, BPM and energy', () => {
    render(RunningOrder, { props: { mix, info } })
    const line = (title: string) => {
      const item = screen
        .getByText(title, { selector: '[data-testid="order-title"]' })
        .closest('li')
      if (!item) throw new Error(title)
      return within(item)
    }
    const brother = line('Brother')
    expect(brother.getByTestId('key')).toHaveTextContent(/^12B · E major$/)
    expect(brother.getByText('78')).toBeInTheDocument()
    expect(brother.getByTestId('energy')).toHaveTextContent(/^9Energy 9 of 10$/)
    expect(brother.getByTestId('energy')).toHaveAttribute('title', 'Energy 9 of 10')
    // A track without one says so.
    expect(line('Love Is').getByTestId('energy')).toHaveTextContent(/^–Energy unknown$/)
    expect(screen.getAllByTestId('energy')).toHaveLength(order.length)
  })

  it('connects each pair with keys, move and BPM change', () => {
    render(RunningOrder, { props: { mix, info } })
    const connector = screen.getAllByText(/12B → 11B · energy −/)[0]
    expect(connector).toHaveTextContent('+10 BPM')
    expect(screen.getByRole('list', { name: 'Running order' })).toBeInTheDocument()
    // Keys are Camelot codes; the names are in the tooltips, and in the text for
    // assistive tech.
    expect(connector).toHaveAttribute('title', 'E major → A major')
    const names = screen.getAllByText('· A major')
    expect(names.length).toBeGreaterThan(0)
    for (const name of names) {
      expect(name).toHaveClass('sr-only')
      expect(name.parentElement).toHaveAttribute('title', 'A major')
    }
  })

  it('has a pin on every connector, and says which pairs are kept together', async () => {
    const [a, b, c] = order
    if (!a || !b || !c) throw new Error('no tracks')
    const view = render(RunningOrder, { props: { mix, info, pinned: [[b.id, c.id]] } })
    const pins = screen.getAllByRole('button', { name: /^Keep .+ together$/ })
    expect(pins).toHaveLength(19)
    const first = screen.getByRole('button', { name: `Keep ${a.label} and ${b.label} together` })
    const second = screen.getByRole('button', { name: `Keep ${b.label} and ${c.label} together` })
    expect(first).toHaveAttribute('aria-pressed', 'false')
    expect(second).toHaveAttribute('aria-pressed', 'true')

    await fireEvent.click(first)
    await fireEvent.click(second)
    expect(view.emitted('pin')).toEqual([[a.id, b.id]])
    expect(view.emitted('unpin')).toEqual([[b.id, c.id]])
  })

  it('marks the pointed track and reports the one pointed at here', async () => {
    const [a, b] = order
    if (!a || !b) throw new Error('no tracks')
    const view = render(RunningOrder, { props: { mix, info } })
    const rows = screen
      .getAllByRole('listitem')
      .filter((item) => item.getAttribute('tabindex') === '0')
    expect(rows).toHaveLength(20)
    await view.rerender({ highlighted: b.id })
    expect(rows.filter((row) => row.hasAttribute('data-highlighted'))).toEqual([rows[1]])

    if (!rows[0]) throw new Error('no row')
    await fireEvent.focus(rows[0])
    await fireEvent.blur(rows[0])
    await fireEvent.click(rows[0])
    expect(view.emitted('point')).toEqual([[a.id], [null]])
    expect(view.emitted('select')).toEqual([[a.id]])
  })

  it('shows the saved BPM and its change', () => {
    render(RunningOrder, { props: { mix: doubled, info: doubledInfo } })
    const [first, second] = screen.getAllByText(/8A → 8A/)
    expect(first).toHaveTextContent('+87 BPM')
    expect(second).toHaveTextContent('−85 BPM')
    expect(screen.queryByText(/listed/)).not.toBeInTheDocument()
  })
})
