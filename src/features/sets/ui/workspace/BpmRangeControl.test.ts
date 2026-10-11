import { fireEvent, render, screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import BpmRangeControl from './BpmRangeControl.vue'

const bpms = [78, 88, 89.9, 90, 100, 104, 127.4]
const mount = (range: { min: number | null; max: number | null } = { min: null, max: null }) => {
  const view = render(BpmRangeControl, { props: { bpms, name: 'WCS', ...range } })
  const changes = () => (view.emitted<unknown[]>().change ?? []).map(([change]) => change)
  return { view, changes }
}
const bars = (container: Element) => [...container.querySelectorAll('svg > rect')]

describe('the BPM range control', () => {
  it('draws the playlist’s BPM distribution, every bar inside an open range', () => {
    const { view } = mount()
    // 75–130 in steps of 5.
    expect(bars(view.container)).toHaveLength(11)
    expect(bars(view.container).every((bar) => bar.hasAttribute('data-inside'))).toBe(true)
    expect(screen.getByRole('group', { name: 'BPM range of WCS' })).toHaveAttribute(
      'title',
      'Any BPM',
    )
  })

  it('fades the bars a range leaves out', () => {
    const { view } = mount({ min: 85, max: 110 })
    const inside = bars(view.container).map((bar) => bar.hasAttribute('data-inside'))
    // 75, 80 are below; 85 … 110 inside; 115 … 125 above.
    expect(inside).toEqual([false, false, true, true, true, true, true, true, false, false, false])
    expect(screen.getByRole('group', { name: 'BPM range of WCS' })).toHaveAttribute(
      'title',
      '85–110 BPM',
    )
  })

  it('sets an end from its field when the field is left or Enter is pressed', async () => {
    const { view, changes } = mount()
    const lowest = screen.getByRole('textbox', { name: 'Lowest BPM of WCS' })
    await userEvent.type(lowest, '85')
    // Not while typing: "8" would cut the whole playlist.
    expect(changes()).toEqual([])
    await userEvent.keyboard('{Enter}')
    expect(changes()).toEqual([{ min: 85, max: null }])
    await view.rerender({ min: 85 })

    await userEvent.type(screen.getByRole('textbox', { name: 'Highest BPM of WCS' }), '110')
    await userEvent.tab()
    expect(changes()).toEqual([
      { min: 85, max: null },
      { min: 85, max: 110 },
    ])
  })

  it('leaves an end open when its field is emptied', async () => {
    const { changes } = mount({ min: 85, max: 110 })
    const highest = screen.getByRole('textbox', { name: 'Highest BPM of WCS' })
    expect(highest).toHaveValue('110')
    await userEvent.clear(highest)
    await userEvent.tab()
    expect(changes()).toEqual([{ min: 85, max: null }])
  })

  it('ignores a field that isn’t a number and keeps an end from crossing the other', async () => {
    const { changes } = mount({ min: 85, max: 110 })
    const lowest = screen.getByRole('textbox', { name: 'Lowest BPM of WCS' })
    await userEvent.clear(lowest)
    await userEvent.type(lowest, 'fast{Enter}')
    expect(changes()).toEqual([])
    expect(lowest).toHaveValue('85')

    await userEvent.clear(lowest)
    await userEvent.type(lowest, '140{Enter}')
    expect(changes()).toEqual([{ min: 110, max: 110 }])
  })

  it('has a slider for each end, with its value in words', () => {
    mount({ min: 85, max: null })
    const lowest = screen.getByRole('slider', { name: 'Lowest BPM of WCS' })
    expect(lowest).toHaveAttribute('aria-valuenow', '85')
    expect(lowest).toHaveAttribute('aria-valuetext', '85 BPM')
    expect(lowest).toHaveAttribute('aria-valuemin', '75')
    expect(lowest).toHaveAttribute('aria-valuemax', '130')
    const highest = screen.getByRole('slider', { name: 'Highest BPM of WCS' })
    expect(highest).toHaveAttribute('aria-valuenow', '130')
    expect(highest).toHaveAttribute('aria-valuetext', 'open')
    expect(highest).toHaveAttribute('tabindex', '0')
  })

  it('moves an end with the arrow and page keys', async () => {
    const { changes } = mount({ min: 85, max: 110 })
    const lowest = screen.getByRole('slider', { name: 'Lowest BPM of WCS' })
    await fireEvent.keyDown(lowest, { key: 'ArrowRight' })
    await fireEvent.keyDown(lowest, { key: 'ArrowLeft' })
    await fireEvent.keyDown(lowest, { key: 'PageUp' })
    expect(changes()).toEqual([
      { min: 86, max: 110 },
      { min: 84, max: 110 },
      { min: 90, max: 110 },
    ])
    // Other keys are left alone.
    await fireEvent.keyDown(lowest, { key: 'a' })
    expect(changes()).toHaveLength(3)
  })

  it('opens an end with Home or End, and by stepping onto the end of the scale', async () => {
    const { changes } = mount({ min: 76, max: 129 })
    const lowest = screen.getByRole('slider', { name: 'Lowest BPM of WCS' })
    const highest = screen.getByRole('slider', { name: 'Highest BPM of WCS' })
    await fireEvent.keyDown(lowest, { key: 'ArrowLeft' })
    await fireEvent.keyDown(highest, { key: 'ArrowRight' })
    await fireEvent.keyDown(lowest, { key: 'Home' })
    await fireEvent.keyDown(highest, { key: 'End' })
    expect(changes()).toEqual([
      { min: null, max: 129 },
      { min: 76, max: null },
      { min: null, max: 129 },
      { min: 76, max: null },
    ])
  })

  it('stops an end at the other one', async () => {
    const { changes } = mount({ min: 100, max: 101 })
    const lowest = screen.getByRole('slider', { name: 'Lowest BPM of WCS' })
    await fireEvent.keyDown(lowest, { key: 'PageUp' })
    await fireEvent.keyDown(lowest, { key: 'End' })
    expect(changes()).toEqual([
      { min: 101, max: 101 },
      { min: 101, max: 101 },
    ])
  })

  it('offers the fields alone when no track has a BPM', () => {
    const view = render(BpmRangeControl, {
      props: { bpms: [], name: 'Odd ones', min: null, max: null },
    })
    expect(view.container.querySelector('svg')).toBeNull()
    expect(screen.getByRole('textbox', { name: 'Lowest BPM of Odd ones' })).toBeInTheDocument()
    expect(screen.queryByRole('slider')).toBeNull()
  })
})
