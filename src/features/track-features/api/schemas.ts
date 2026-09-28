import { z } from 'zod'
import { isCamelotKey, type CamelotKey } from '@/shared/music'
import { MAX_BPM, MIN_BPM } from '../domain/features'
import { EXPORT_APP, EXPORT_KIND, EXPORT_VERSION } from '../domain/overrides'

const Camelot = z.custom<CamelotKey>(isCamelotKey, 'Not a Camelot key (1A–12B)')
const Bpm = z.number().min(MIN_BPM).max(MAX_BPM)

/** Stored records carry a schema version; unknown versions read as missing. */
export const STORAGE_VERSION = 1

export const StoredFetched = z.object({
  v: z.literal(STORAGE_VERSION),
  data: z.discriminatedUnion('found', [
    z.object({
      trackId: z.string(),
      found: z.literal(true),
      camelot: Camelot.nullable(),
      bpm: z.number().nullable(),
      energy: z.number().nullable(),
      fetchedAt: z.number(),
    }),
    z.object({ trackId: z.string(), found: z.literal(false), fetchedAt: z.number() }),
  ]),
})

export const OverrideSchema = z.object({
  trackId: z.string().min(1),
  camelot: Camelot.nullable(),
  bpm: Bpm.nullable(),
  note: z.string().max(500).nullable(),
  label: z.string().nullable(),
  updatedAt: z.number(),
})

export const StoredOverride = z.object({ v: z.literal(STORAGE_VERSION), data: OverrideSchema })

/** The export file (JSON import is validated against this). */
export const OverridesFile = z.object({
  app: z.literal(EXPORT_APP),
  kind: z.literal(EXPORT_KIND),
  version: z.literal(EXPORT_VERSION),
  exportedAt: z.string(),
  overrides: z.array(OverrideSchema),
})
