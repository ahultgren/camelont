import { render, screen } from '@testing-library/vue'
import { describe, expect, it } from 'vitest'
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
