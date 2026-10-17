import { render, screen } from '@testing-library/vue'
import { describe, expect, it } from 'vitest'
import { energyColor } from './energy-color'
import EnergyChip from './EnergyChip.vue'
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

describe('EnergyChip', () => {
  it('shows energy as a level out of 10, coloured by the level, and says so', () => {
    render(EnergyChip, { props: { energy: 0.929 } })
    const chip = screen.getByTestId('energy')
    expect(chip).toHaveTextContent(/^9Energy 9 of 10$/)
    expect(chip).toHaveAttribute('title', 'Energy 9 of 10')
    expect(screen.getByText('Energy 9 of 10')).toHaveClass('sr-only')
    // The number is shown, not only the colour.
    expect(screen.getByText('9')).not.toHaveClass('sr-only')
    expect(chip.style.background).toBe(energyColor(0.929))
  })

  it('says when the energy is unknown, without a colour of the scale', () => {
    render(EnergyChip, { props: { energy: null } })
    const chip = screen.getByTestId('energy')
    expect(chip).toHaveTextContent(/^–Energy unknown$/)
    expect(chip).toHaveAttribute('title', 'Energy unknown')
    expect(chip.style.background).toBe('')
  })
})

describe('energyColor', () => {
  it('takes the hue of the level, at the tone of a key chip', () => {
    expect(energyColor(0)).toBe('hsl(220 var(--chip-s) var(--chip-l))')
    expect(energyColor(0.715)).toBe('hsl(66 var(--chip-s) var(--chip-l))')
    expect(energyColor(1)).toBe('hsl(0 var(--chip-s) var(--chip-l))')
    // Two energies shown as the same level have the same colour.
    expect(energyColor(0.66)).toBe(energyColor(0.74))
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
