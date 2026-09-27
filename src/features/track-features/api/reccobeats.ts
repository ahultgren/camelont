import { z } from 'zod'
import { createHttpClient } from '@/shared/api'
import { fromPitchClass } from '@/shared/music'
import type { FetchedFeatures } from '../domain/features'

export const RECCOBEATS_API = 'https://api.reccobeats.com/v1'
/** Batches of 40 worked in research; the real limit isn't documented. */
export const RECCOBEATS_BATCH = 40

const Row = z.object({
  href: z.string(),
  key: z.number().int().min(-1).max(11).nullable().optional(),
  mode: z.number().int().min(0).max(1).nullable().optional(),
  tempo: z.number().nullable().optional(),
  energy: z.number().nullable().optional(),
})

// Rows are validated one by one, so one odd row can't sink the batch.
const Response = z.object({ content: z.array(z.unknown()) })

const SPOTIFY_TRACK_RE = /open\.spotify\.com\/track\/([A-Za-z0-9]{22})/

/** A provider of key/BPM data (a second opinion can slot in later). */
export interface FeatureProvider {
  /** Features for every requested ID (found or not). Throws if the batch fails. */
  fetch(trackIds: readonly string[], now: number): Promise<FetchedFeatures[]>
}

/**
 * ReccoBeats: no key, CORS open. Rows come back reordered and unknown tracks are
 * silently absent, so rows are matched by `href`, never by position.
 */
export function createReccoBeatsProvider(fetchImpl?: typeof fetch): FeatureProvider {
  const http = createHttpClient({
    baseUrl: RECCOBEATS_API,
    ...(fetchImpl ? { fetch: fetchImpl } : {}),
  })
  return {
    async fetch(trackIds, now) {
      const results = new Map<string, FetchedFeatures>()
      for (let i = 0; i < trackIds.length; i += RECCOBEATS_BATCH) {
        const batch = trackIds.slice(i, i + RECCOBEATS_BATCH)
        const data = await http.request('/audio-features', Response, {
          query: { ids: batch.join(',') },
        })
        for (const raw of data.content) {
          const row = Row.safeParse(raw)
          if (!row.success) continue
          const id = SPOTIFY_TRACK_RE.exec(row.data.href)?.[1]
          if (!id || !batch.includes(id)) continue
          const { key, mode, tempo, energy } = row.data
          results.set(id, {
            trackId: id,
            found: true,
            camelot: key != null && mode != null ? fromPitchClass(key, mode === 1 ? 1 : 0) : null,
            bpm: tempo != null && tempo > 0 ? Math.round(tempo * 10) / 10 : null,
            energy: energy ?? null,
            fetchedAt: now,
          })
        }
      }
      return trackIds.map((id) => results.get(id) ?? { trackId: id, found: false, fetchedAt: now })
    },
  }
}
