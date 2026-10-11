import { render, screen } from '@testing-library/vue'
import { describe, expect, it } from 'vitest'
import EnergyMeter from './EnergyMeter.vue'
import { keyColor } from './key-color'
import KeyChip from './KeyChip.vue'
import MoveBadge from './MoveBadge.vue'

describe('KeyChip', () => {
  it('shows the Camelot code, with the key name as the tooltip and for assistive tech', () => {
    render(KeyChip, { props: { camelot: '11B' } })
    const chip = screen.getByTestId('key')
    expect(chip).toHaveTextContent(/^11B · A major$/)
    expect(chip).toHaveAttribute('title', 'A major')
    expect(screen.getByText('· A major')).toHaveClass('sr-only')
  })

  it('marks a missing key', () => {
    render(KeyChip, { props: { camelot: null } })
    const chip = screen.getByTestId('key')
    expect(chip).toHaveTextContent(/^\? · unknown key$/)
    expect(chip).toHaveAttribute('title', 'Unknown key')
    expect(screen.getByText('· unknown key')).toHaveClass('sr-only')
  })
})

describe('EnergyMeter', () => {
  it('shows energy as a number out of 100, and says so', () => {
    render(EnergyMeter, { props: { energy: 0.929 } })
    const meter = screen.getByTestId('energy')
    expect(meter).toHaveTextContent(/^93\s*Energy 93 of 100$/)
    expect(meter).toHaveAttribute('title', 'Energy 93 of 100')
    expect(screen.getByText('Energy 93 of 100')).toHaveClass('sr-only')
  })

  it('says when the energy is unknown', () => {
    render(EnergyMeter, { props: { energy: null } })
    const meter = screen.getByTestId('energy')
    expect(meter).toHaveTextContent(/^–\s*Energy unknown$/)
    expect(meter).toHaveAttribute('title', 'Energy unknown')
  })
})

describe('MoveBadge', () => {
  it('carries a symbol and an accessible name', () => {
    render(MoveBadge, { props: { symbol: '+++', tone: 'boost', label: 'energy +++' } })
    expect(screen.getByText('+++')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByText('energy +++')).toHaveClass('sr-only')
  })
})

describe('keyColor', () => {
  it('uses the wheel hue and a lighter tone for minor', () => {
    expect(keyColor('11B')).toBe('hsl(270 var(--chip-s) var(--chip-l))')
    expect(keyColor('11A')).toBe('hsl(270 var(--chip-s) var(--chip-la))')
  })
})
