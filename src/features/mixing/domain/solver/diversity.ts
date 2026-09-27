/** Adjacencies (a→b pairs of entry IDs) of an order. */
export function adjacencies(order: readonly string[]): Set<string> {
  const out = new Set<string>()
  for (let i = 1; i < order.length; i++) out.add(`${order[i - 1] ?? ''}>${order[i] ?? ''}`)
  return out
}

/** Share of adjacencies that differ between two orders of the same tracks (0..1). */
export function adjacencyDifference(a: readonly string[], b: readonly string[]): number {
  const edges = Math.max(a.length - 1, 1)
  const shared = adjacencies(b)
  let common = 0
  for (const edge of adjacencies(a)) if (shared.has(edge)) common++
  return 1 - common / edges
}

/**
 * Two mixes that share most of their adjacencies count as the same mix (spec §5.5):
 * each kept mix must differ from every other kept mix in at least `minDifference` of
 * its transitions. Input must be sorted best first.
 */
export function selectDiverse<T>(
  candidates: readonly T[],
  orderOf: (candidate: T) => readonly string[],
  k: number,
  minDifference: number,
): T[] {
  const kept: T[] = []
  for (const candidate of candidates) {
    if (kept.length >= k) break
    const order = orderOf(candidate)
    if (kept.every((other) => adjacencyDifference(order, orderOf(other)) >= minDifference)) {
      kept.push(candidate)
    }
  }
  return kept
}
