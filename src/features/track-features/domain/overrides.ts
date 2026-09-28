import type { Override } from './features'

export interface ImportReport {
  added: number
  updated: number
  unchanged: number
}

const same = (a: Override, b: Override) =>
  a.camelot === b.camelot && a.bpm === b.bpm && a.note === b.note

/** Import merge: incoming overrides win; the report says what changed. */
export function mergeOverrides(
  existing: ReadonlyMap<string, Override>,
  incoming: readonly Override[],
): { changed: Override[]; report: ImportReport } {
  const report: ImportReport = { added: 0, updated: 0, unchanged: 0 }
  const changed: Override[] = []
  for (const o of incoming) {
    const current = existing.get(o.trackId)
    if (!current) report.added++
    else if (same(current, o)) {
      report.unchanged++
      continue
    } else report.updated++
    changed.push(o)
  }
  return { changed, report }
}

export const EXPORT_APP = 'camelont'
export const EXPORT_KIND = 'track-overrides'
export const EXPORT_VERSION = 1

export interface OverridesExport {
  app: typeof EXPORT_APP
  kind: typeof EXPORT_KIND
  version: typeof EXPORT_VERSION
  exportedAt: string
  overrides: Override[]
}

export function buildExport(overrides: readonly Override[], now: Date): OverridesExport {
  return {
    app: EXPORT_APP,
    kind: EXPORT_KIND,
    version: EXPORT_VERSION,
    exportedAt: now.toISOString(),
    overrides: [...overrides].sort((a, b) => a.trackId.localeCompare(b.trackId)),
  }
}
