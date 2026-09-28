import type { CamelotKey } from '@/shared/music'

/** Where a value came from; shown next to every value (spec U3). */
export type FeatureSource = 'reccobeats' | 'manual'

export const SOURCE_LABEL: Record<FeatureSource, string> = {
  reccobeats: 'ReccoBeats',
  manual: 'Manual',
}

export interface Sourced<T> {
  value: T
  source: FeatureSource
}

/** What the provider said about a track (cached locally). */
export type FetchedFeatures =
  | {
      trackId: string
      found: true
      camelot: CamelotKey | null
      bpm: number | null
      energy: number | null
      fetchedAt: number
    }
  | { trackId: string; found: false; fetchedAt: number }

/** A manual correction; null fields are not overridden. Always beats fetched data. */
export interface Override {
  trackId: string
  camelot: CamelotKey | null
  bpm: number | null
  note: string | null
  /** Human-readable track name, for exports. */
  label: string | null
  updatedAt: number
}

export interface TrackFeatures {
  trackId: string
  camelot: Sourced<CamelotKey> | null
  bpm: Sourced<number> | null
  energy: Sourced<number> | null
  note: string | null
  /** The provider's raw answer, for "ReccoBeats said …" hints. */
  fetched: FetchedFeatures | null
  overridden: boolean
}

/** Can this track be mixed? It needs a key and a BPM. */
export const isMixable = (f: TrackFeatures | undefined): boolean =>
  f?.camelot != null && f.bpm != null

/** Per-field merge: an override wins over fetched data, field by field. */
export function mergeFeatures(
  trackId: string,
  fetched: FetchedFeatures | undefined,
  override: Override | undefined,
): TrackFeatures {
  const found = fetched?.found ? fetched : null
  const pick = <T>(
    manual: T | null | undefined,
    provided: T | null | undefined,
  ): Sourced<T> | null =>
    manual != null
      ? { value: manual, source: 'manual' }
      : provided != null
        ? { value: provided, source: 'reccobeats' }
        : null
  return {
    trackId,
    camelot: pick(override?.camelot, found?.camelot),
    bpm: pick(override?.bpm, found?.bpm),
    energy: pick(null, found?.energy),
    note: override?.note ?? null,
    fetched: fetched ?? null,
    overridden: override !== undefined && (override.camelot !== null || override.bpm !== null),
  }
}

/** Not-found answers are retried after a week (ReccoBeats coverage grows). */
export const NOT_FOUND_TTL_MS = 7 * 24 * 3600_000

export const needsFetch = (cached: FetchedFeatures | undefined, now: number): boolean =>
  cached === undefined || (!cached.found && now - cached.fetchedAt > NOT_FOUND_TTL_MS)

export const MIN_BPM = 30
export const MAX_BPM = 300

export const isValidBpm = (bpm: number): boolean =>
  Number.isFinite(bpm) && bpm >= MIN_BPM && bpm <= MAX_BPM
