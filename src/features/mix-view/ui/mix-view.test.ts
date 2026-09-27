import { fireEvent, render, screen } from '@testing-library/vue'
import { describe, expect, it } from 'vitest'
import { DEFAULT_PROFILE, evaluateMix, withArc, type MixTrack } from '@/features/mixing'
import { parseCamelot } from '@/shared/music'
import { wcsOrder } from '@/test/wcs'
import type { EntryInfo } from '../domain/layout'
import KeyWheel from './KeyWheel.vue'
import MixExplorer from './MixExplorer.vue'
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

describe('TempoArcChart', () => {
  it('labels every point with position, title, both key notations, BPM and the move in', () => {
    render(TempoArcChart, { props: { mix, info } })
    const points = screen.getAllByRole('img')
    expect(points).toHaveLength(20)
    expect(points[0]).toHaveAccessibleName('1. Brother, 12B, E major, 78 BPM')
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
    expect(card).toHaveTextContent('11B · A major')
    expect(card).toHaveTextContent('− energy − from 12B · E major')
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
    expect(screen.getByText('- - arc target')).toBeInTheDocument()
  })
})

describe('KeyWheel', () => {
  it('summarises the keys used with counts', () => {
    render(KeyWheel, { props: { mix } })
    const wheel = screen.getByRole('img')
    expect(wheel.getAttribute('aria-label')).toContain('7B F major × 4')
    expect(screen.getByText('7B×4')).toBeInTheDocument()
  })
})

describe('RunningOrder', () => {
  it('connects each pair with keys, move and BPM change', () => {
    render(RunningOrder, { props: { mix, info } })
    expect(screen.getAllByText(/12B → 11B · energy −/)[0]).toHaveTextContent('+10 BPM')
    expect(screen.getAllByText('3:20')).toHaveLength(20)
  })
})

describe('MixExplorer', () => {
  it('shows the headline stats', () => {
    render(MixExplorer, { props: { mix, info } })
    expect(screen.getByText('78–127.4')).toBeInTheDocument()
    expect(screen.getByText('67')).toBeInTheDocument() // 20 × 3:20
  })
})
