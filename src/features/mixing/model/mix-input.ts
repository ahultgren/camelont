import { isMixable, type TrackFeatures } from '@/features/track-features'
import type { MixTrack } from '../domain/types'

/** What the planner needs from a playlist entry (structurally a PlaylistEntry). */
export interface PlannerEntry {
  entryId: string
  trackId: string
  title: string
}

export interface MixInput {
  tracks: MixTrack[]
  /** Entries without a key or BPM. */
  missing: PlannerEntry[]
}

/** Entries + merged features → the engine's input; entries without data are set aside. */
export function toMixInput(
  entries: readonly PlannerEntry[],
  features: ReadonlyMap<string, TrackFeatures>,
): MixInput {
  const tracks: MixTrack[] = []
  const missing: PlannerEntry[] = []
  for (const entry of entries) {
    const f = features.get(entry.trackId)
    if (f?.camelot && f.bpm && isMixable(f)) {
      tracks.push({
        id: entry.entryId,
        label: entry.title,
        camelot: f.camelot.value,
        bpm: f.bpm.value,
        energy: f.energy?.value ?? null,
      })
    } else missing.push(entry)
  }
  return { tracks, missing }
}
