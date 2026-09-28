import { describe, expect, it } from 'vitest'
import { WCS_TRACKS, wcsId, wcsOrder } from '@/test/wcs'
import { NO_CONSTRAINTS } from '../constraints'
import { evaluateMix, mixTracks } from '../evaluate'
import { DEFAULT_PROFILE, withArc } from '../profile'
import { adjacencyDifference, selectDiverse } from './diversity'
import { improvePath } from './local-search'
import { buildBlocks, buildProblem, expandPath, isLegalPath, NO_BLOCK, pathCost } from './problem'

const tracks = mixTracks(WCS_TRACKS)
const arcProfile = withArc(DEFAULT_PROFILE, { preset: 'twoWaves', signal: 'bpm', weight: 8 })
const indexPath = (name: 'hand_tuned' | 'script_greedy' | 'original') =>
  wcsOrder(name).map((t) => tracks.findIndex((x) => x.id === t.id))

describe('buildBlocks', () => {
  it('collapses follow chains in order', () => {
    const a = wcsId('Counting Stars')
    const b = wcsId('Bloodstream')
    const c = wcsId('Stolen Dance')
    const blocks = buildBlocks(tracks, [
      [b, c],
      [a, b],
    ])
    expect(blocks).toHaveLength(18)
    const chain = blocks.find((block) => block.length > 1)?.map((i) => tracks[i]?.id)
    expect(chain).toEqual([a, b, c])
  })
})

describe('problem', () => {
  const problem = buildProblem(tracks, NO_CONSTRAINTS, arcProfile)

  it('scores paths exactly like evaluateMix', () => {
    for (const name of ['hand_tuned', 'script_greedy'] as const) {
      const path = indexPath(name)
      expect(pathCost(problem, path)).toBeCloseTo(
        evaluateMix(expandPath(problem, path), arcProfile).totalCost,
        9,
      )
    }
  })

  it('never has clash edges', () => {
    const B = problem.blocks.length
    for (let a = 0; a < B; a++) {
      for (const b of problem.succ[a] ?? []) {
        expect(Number.isNaN(problem.edgeCost[a * B + b])).toBe(false)
      }
    }
    expect(problem.startBlock).toBe(NO_BLOCK)
  })

  it('checks legality, completeness, start and end', () => {
    const path = indexPath('hand_tuned')
    expect(isLegalPath(problem, path)).toBe(true)
    expect(isLegalPath(problem, path.slice(1))).toBe(false)
    expect(isLegalPath(problem, indexPath('original'))).toBe(false) // has clashes
    const fixed = buildProblem(
      tracks,
      { ...NO_CONSTRAINTS, start: wcsId('Love Is') },
      DEFAULT_PROFILE,
    )
    expect(isLegalPath(fixed, path)).toBe(false)
  })
})

describe('improvePath', () => {
  it('keeps paths legal and never makes them worse', () => {
    const problem = buildProblem(tracks, NO_CONSTRAINTS, arcProfile)
    const greedy = indexPath('script_greedy')
    const improved = improvePath(problem, greedy, 10, () => false)
    expect(isLegalPath(problem, improved)).toBe(true)
    expect(pathCost(problem, improved)).toBeLessThan(pathCost(problem, greedy))
  })

  it('keeps start and end in place', () => {
    const start = wcsId('Brother')
    const end = wcsId('Safe and Sound')
    const problem = buildProblem(tracks, { ...NO_CONSTRAINTS, start, end }, DEFAULT_PROFILE)
    const handTuned = indexPath('hand_tuned')
    const improved = improvePath(problem, handTuned, 10, () => false)
    expect(isLegalPath(problem, improved)).toBe(true)
    expect(tracks[improved[0] ?? -1]?.id).toBe(start)
    expect(tracks[improved[improved.length - 1] ?? -1]?.id).toBe(end)
  })

  it('stops when time is up', () => {
    const problem = buildProblem(tracks, NO_CONSTRAINTS, arcProfile)
    const greedy = indexPath('script_greedy')
    expect(improvePath(problem, greedy, 10, () => true)).toEqual(greedy)
  })
})

describe('diversity', () => {
  it('measures the share of differing adjacencies', () => {
    expect(adjacencyDifference(['a', 'b', 'c'], ['a', 'b', 'c'])).toBe(0)
    expect(adjacencyDifference(['a', 'b', 'c'], ['c', 'b', 'a'])).toBe(1)
    expect(adjacencyDifference(['a', 'b', 'c', 'd'], ['a', 'b', 'd', 'c'])).toBeCloseTo(2 / 3)
  })

  it('keeps the best candidates that differ enough', () => {
    const candidates = [
      ['a', 'b', 'c', 'd'],
      ['a', 'b', 'c', 'd'],
      ['d', 'c', 'b', 'a'],
      ['b', 'a', 'd', 'c'],
    ]
    // b-a-d-c shares d→c and b→a with d-c-b-a, so it differs in only a third.
    expect(selectDiverse(candidates, (c) => c, 5, 0.5)).toEqual([
      ['a', 'b', 'c', 'd'],
      ['d', 'c', 'b', 'a'],
    ])
    expect(selectDiverse(candidates, (c) => c, 1, 0.5)).toHaveLength(1)
  })
})
