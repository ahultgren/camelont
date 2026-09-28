import { NO_BLOCK, pathCost, type Problem } from './problem'

const MAX_SEGMENT = 3

/**
 * Or-opt improvement (move a run of 1–3 blocks elsewhere) plus pairwise swaps, when
 * every edge stays legal and the full objective (arc included) drops. Improvements are applied as they are
 * found; passes repeat until none helps or the budget runs out. Start and end stay put.
 */
export function improvePath(
  problem: Problem,
  path: readonly number[],
  maxPasses: number,
  timedOut: () => boolean,
): number[] {
  const B = problem.blocks.length
  const legal = (a: number | undefined, b: number | undefined) =>
    a === undefined || b === undefined || !Number.isNaN(problem.edgeCost[a * B + b])
  const lo = problem.startBlock !== NO_BLOCK ? 1 : 0
  const hi = problem.endBlock !== NO_BLOCK ? B - 1 : B // movable range [lo, hi)

  let current = [...path]
  let currentCost = pathCost(problem, current)

  for (let pass = 0; pass < maxPasses; pass++) {
    let improved = false
    for (let len = 1; len <= MAX_SEGMENT; len++) {
      for (let i = lo; i + len <= hi; i++) {
        if (timedOut()) return current
        const segFirst = current[i]
        const segLast = current[i + len - 1]
        // Removing the segment must leave a legal join.
        if (!legal(current[i - 1], current[i + len])) continue
        const rest = [...current.slice(0, i), ...current.slice(i + len)]
        const segment = current.slice(i, i + len)
        for (let j = lo; j <= rest.length - (B - hi); j++) {
          if (j === i) continue
          if (!legal(rest[j - 1], segFirst) || !legal(segLast, rest[j])) continue
          const candidate = [...rest.slice(0, j), ...segment, ...rest.slice(j)]
          const cost = pathCost(problem, candidate)
          if (cost < currentCost - 1e-9) {
            current = candidate
            currentCost = cost
            improved = true
            break
          }
        }
      }
    }
    // Swap two blocks: lets the arc trade positions without moving everything between.
    for (let i = lo; i < hi; i++) {
      for (let j = i + 1; j < hi; j++) {
        if (timedOut()) return current
        const candidate = [...current]
        candidate[i] = current[j] ?? 0
        candidate[j] = current[i] ?? 0
        let ok = true
        for (const at of [i - 1, i, j - 1, j]) {
          if (at >= 0 && at + 1 < B && !legal(candidate[at], candidate[at + 1])) ok = false
        }
        if (!ok) continue
        const cost = pathCost(problem, candidate)
        if (cost < currentCost - 1e-9) {
          current = candidate
          currentCost = cost
          improved = true
        }
      }
    }
    if (!improved) break
  }
  return current
}
