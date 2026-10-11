import { render, screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { parseCamelot } from '@/shared/music'
import { wcsOrder } from '@/test/wcs'
import { evaluateMix } from '../domain/evaluate'
import { DEFAULT_PROFILE, NO_SHAPING } from '../domain/profile'
import type { MixTrack } from '../domain/types'
import ArcPicker from './ArcPicker.vue'
import CandidateList from './CandidateList.vue'
import ShapePicker from './ShapePicker.vue'

const tracks = (name: 'hand_tuned' | 'script_greedy'): MixTrack[] =>
  wcsOrder(name).map((track) => ({ ...track, camelot: parseCamelot(track.camelot) ?? '8A' }))
const candidates = [
  evaluateMix(tracks('hand_tuned'), DEFAULT_PROFILE),
  evaluateMix(tracks('script_greedy'), DEFAULT_PROFILE),
]

describe('CandidateList', () => {
  it('shows each alternative with its cost, a tempo line and its moves by kind', () => {
    render(CandidateList, { props: { candidates, modelValue: 0 } })
    const mixes = screen.getAllByRole('radio')
    expect(mixes).toHaveLength(2)
    expect(mixes[0]).toBeChecked()
    expect(mixes[1]).not.toBeChecked()
    // The hand-tuned order: 9 perfect, 7 boost, 3 drop.
    expect(mixes[0]).toHaveTextContent(/=9\s*\+7\s*−3\s*~0/)
    expect(mixes[0]).toHaveTextContent(candidates[0]?.totalCost.toFixed(1) ?? '')
    expect(screen.getAllByRole('img', { name: /^Tempo of mix \d, 78–127.4 BPM$/ })).toHaveLength(2)
  })

  it('names the rest of an alternative’s stats: BPM range, peaks, opener and closer', () => {
    render(CandidateList, { props: { candidates, modelValue: 0 } })
    expect(screen.getAllByRole('radio')[0]).toHaveAccessibleName(
      /^Mix 1, cost \d+\.\d, 9 perfect, 7 boost, 3 drop, 0 mood, 78–127.4 BPM, peaks #\d+.*, opens with Brother, closes with Safe and Sound$/,
    )
  })

  it('chooses the one that is clicked', async () => {
    const view = render(CandidateList, { props: { candidates, modelValue: 0 } })
    const second = screen.getAllByRole('radio')[1]
    if (!second) throw new Error('no second mix')
    await userEvent.click(second)
    expect(view.emitted('update:modelValue')).toEqual([[1]])
  })
})

describe('ArcPicker', () => {
  it('offers no arc and every preset, one of them chosen', async () => {
    const view = render(ArcPicker, { props: { modelValue: 'none' } })
    expect(screen.getByRole('group', { name: 'Arc' })).toBeInTheDocument()
    expect(
      screen.getAllByRole('radio').map((radio) => radio.parentElement?.textContent.trim()),
    ).toEqual(['No arc', 'Two waves', 'Steady build'])
    expect(screen.getByRole('radio', { name: 'No arc' })).toBeChecked()
    await userEvent.click(screen.getByRole('radio', { name: 'Steady build' }))
    expect(view.emitted('update:modelValue')).toEqual([['steadyBuild']])
  })
})

describe('ShapePicker', () => {
  it('offers the arc, what it follows and the two energy switches', async () => {
    const view = render(ShapePicker, { props: { modelValue: { ...NO_SHAPING, arc: 'twoWaves' } } })
    expect(screen.getByRole('radio', { name: 'Two waves' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'BPM' })).toBeChecked()
    await userEvent.click(screen.getByRole('radio', { name: 'Energy' }))
    await userEvent.click(screen.getByRole('button', { name: 'Energy steps' }))
    await userEvent.click(screen.getByRole('button', { name: 'Key lift' }))
    await userEvent.click(screen.getByRole('radio', { name: 'Steady build' }))
    // Each change keeps the others.
    const byEnergy = { ...NO_SHAPING, arc: 'twoWaves', arcSignal: 'energy' }
    expect(view.emitted('update:modelValue')).toEqual([
      [byEnergy],
      [{ ...byEnergy, energySteps: true }],
      [{ ...byEnergy, energySteps: true, keyLift: true }],
      [{ arc: 'steadyBuild', arcSignal: 'energy', energySteps: true, keyLift: true }],
    ])
  })

  it('says which switches are on', () => {
    render(ShapePicker, {
      props: { modelValue: { ...NO_SHAPING, arc: 'twoWaves', arcSignal: 'energy', keyLift: true } },
    })
    expect(screen.getByRole('radio', { name: 'Energy' })).toBeChecked()
    expect(screen.getByRole('button', { name: 'Key lift' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Energy steps' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('has nothing for the arc to follow while there is no arc', () => {
    render(ShapePicker, { props: { modelValue: NO_SHAPING } })
    expect(screen.getByRole('radio', { name: 'BPM' })).toBeDisabled()
    expect(screen.getByRole('radio', { name: 'Energy' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Energy steps' })).toBeEnabled()
  })
})
