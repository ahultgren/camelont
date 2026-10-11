import { render, screen } from '@testing-library/vue'
import { describe, expect, it } from 'vitest'
import EnergyMeter from './EnergyMeter.vue'
import { keyColor } from './key-color'
import KeyChip from './KeyChip.vue'
import MoveBadge from './MoveBadge.vue'

describe('KeyChip', () => {
  it('shows both notations', () => {
    const { container } = render(KeyChip, { props: { camelot: '11B' } })
    expect(container.textContent.replace(/\s+/g, ' ').trim()).toBe('11B · A major')
  })

  it('marks a missing key', () => {
    render(KeyChip, { props: { camelot: null } })
    expect(screen.getByText(/unknown key/)).toBeInTheDocument()
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
