import { describe, expect, it } from 'vitest'
import {
  describeEnergy,
  energyFromLevel,
  energyHue,
  energyLevel,
  isEnergyLevel,
  MAX_ENERGY_LEVEL,
} from './energy'

const LEVELS = Array.from({ length: MAX_ENERGY_LEVEL + 1 }, (_, level) => level)

describe('energyLevel', () => {
  it.each([
    [0, 0],
    [0.04, 0],
    [0.05, 1],
    [0.414, 4],
    [0.553, 6],
    [0.715, 7],
    [0.929, 9],
    [0.95, 10],
    [1, 10],
  ])('shows %j as %j', (energy, level) => {
    expect(energyLevel(energy)).toBe(level)
  })

  it('keeps a value outside 0..1 on the scale', () => {
    expect(energyLevel(-0.2)).toBe(0)
    expect(energyLevel(1.3)).toBe(10)
  })
})

describe('energyFromLevel', () => {
  it('stores a level as 0..1, and every level comes back as itself', () => {
    expect(energyFromLevel(7)).toBe(0.7)
    for (const level of LEVELS) expect(energyLevel(energyFromLevel(level))).toBe(level)
  })
})

describe('isEnergyLevel', () => {
  it('takes whole numbers from 0 to 10 only', () => {
    for (const level of LEVELS) expect(isEnergyLevel(level)).toBe(true)
    for (const other of [-1, 11, 7.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(isEnergyLevel(other)).toBe(false)
    }
  })
})

describe('describeEnergy', () => {
  it('says the level out of 10, or that it is unknown', () => {
    expect(describeEnergy(0.929)).toBe('Energy 9 of 10')
    expect(describeEnergy(0)).toBe('Energy 0 of 10')
    expect(describeEnergy(null)).toBe('Energy unknown')
  })
})

describe('energyHue', () => {
  it('runs from blue for calm to red for intense, a step per level', () => {
    expect(energyHue(0)).toBe(220)
    expect(energyHue(5)).toBe(110)
    expect(energyHue(10)).toBe(0)
    const hues = LEVELS.map(energyHue)
    expect(new Set(hues).size).toBe(LEVELS.length)
    expect(hues).toEqual([...hues].sort((a, b) => b - a))
  })
})
