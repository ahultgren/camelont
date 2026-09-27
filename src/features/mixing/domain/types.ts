import type { CamelotKey } from '@/shared/music'

/**
 * One playlist entry as the mixing engine sees it. Only entries with a key and a BPM
 * can be mixed. `id` is the entry ID (duplicates of a track are distinct entries).
 */
export interface MixTrack {
  id: string
  /** For messages, e.g. "Bloodstream". */
  label: string
  camelot: CamelotKey
  bpm: number
  energy: number | null
}
