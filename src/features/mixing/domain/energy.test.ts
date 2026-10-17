import { describe, expect, it } from 'vitest'
import { DEFAULT_ENERGY_STEP, energyRise, energyStepCost, keyLiftFactor } from './energy'
import type { MixTrack } from './types'

const track = (energy: number | null): MixTrack => ({
  id: String(energy),
  label: '',
  camelot: '8A',
  bpm: 100,
  energy,
})

describe('energyRise', () => {
  it('is the climb from one track to the next, and unknown when either is', () => {
    expect(energyRise(track(0.4), track(0.7))).toBeCloseTo(0.3)
    expect(energyRise(track(0.7), track(0.4))).toBeCloseTo(-0.3)
    expect(energyRise(track(null), track(0.4))).toBeNull()
    expect(energyRise(track(0.4), track(null))).toBeNull()
  })
})

describe('energyStepCost', () => {
  const step = { weight: 10, free: 0.1, fallFactor: 0.25 }

  it('lets a small step pass and charges a climb for what is beyond it', () => {
    expect(energyStepCost(0.1, step)).toBe(0)
    expect(energyStepCost(-0.05, step)).toBe(0)
    expect(energyStepCost(0.3, step)).toBeCloseTo(2)
  })

  it('charges a fall a share of the same climb: a reset may be sudden', () => {
    expect(energyStepCost(-0.3, step)).toBeCloseTo(0.5)
  })

  it('costs nothing when the energy is unknown or steps are not scored', () => {
    expect(energyStepCost(null, step)).toBe(0)
    expect(energyStepCost(0.5, null)).toBe(0)
  })

  it('has a default where a 0.3 climb costs about one +++', () => {
    expect(energyStepCost(0.3, DEFAULT_ENERGY_STEP)).toBeCloseTo(2)
  })
})

describe('keyLiftFactor', () => {
  it('makes a key move that goes with the energy cheaper, and one against it dearer', () => {
    expect(keyLiftFactor('boost', 0.1, 1)).toBeCloseTo(0.5)
    expect(keyLiftFactor('drop', -0.1, 1)).toBeCloseTo(0.5)
    expect(keyLiftFactor('boost', -0.1, 1)).toBeCloseTo(1.5)
    expect(keyLiftFactor('drop', 0.1, 1)).toBeCloseTo(1.5)
  })

  it('is in full effect from a 0.2 change in energy', () => {
    expect(keyLiftFactor('boost', 0.2, 1)).toBeCloseTo(0)
    expect(keyLiftFactor('boost', 0.6, 1)).toBeCloseTo(0)
    expect(keyLiftFactor('boost', -0.6, 1)).toBeCloseTo(2)
  })

  it('leaves moves with no direction, level energy and unknown energy alone', () => {
    expect(keyLiftFactor('perfect', 0.3, 1)).toBe(1)
    expect(keyLiftFactor('mood', 0.3, 1)).toBe(1)
    expect(keyLiftFactor('clash', 0.3, 1)).toBe(1)
    expect(keyLiftFactor('boost', 0, 1)).toBe(1)
    expect(keyLiftFactor('boost', null, 1)).toBe(1)
  })

  it('is off at 0 and reversed below it: a key move then cushions the change', () => {
    expect(keyLiftFactor('boost', 0.3, 0)).toBe(1)
    expect(keyLiftFactor('boost', -0.3, -1)).toBeCloseTo(0)
    expect(keyLiftFactor('boost', 0.3, -1)).toBeCloseTo(2)
  })
})
