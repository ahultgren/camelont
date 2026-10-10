import { z } from 'zod'
import type { MixSet } from '../domain/types'

/** Stored records carry a schema version; another version is reported as unreadable. */
export const STORAGE_VERSION = 1

const TrackId = z.string().min(1)

const SetTrackSchema = z.object({
  trackId: TrackId,
  uri: z.string(),
  title: z.string(),
  artists: z.array(z.string()),
  durationMs: z.number(),
  imageUrl: z.string().nullable(),
})

const TrackChoicesSchema = z.object({
  bpmMin: z.number().nullable(),
  bpmMax: z.number().nullable(),
  limit: z.number().int().min(0).nullable(),
  pick: z.enum(['random', 'bestFit']),
  seed: z.number(),
})

const SetPlaylistSchema = z.object({
  playlistId: z.string().min(1),
  name: z.string(),
  imageUrl: z.string().nullable(),
  tracks: z.array(SetTrackSchema),
  snapshotId: z.string().nullable(),
  readAt: z.number(),
  choices: TrackChoicesSchema,
})

const MixSettingsSchema = z.object({
  opener: TrackId.nullable(),
  closer: TrackId.nullable(),
  follows: z.array(z.tuple([TrackId, TrackId])),
  arc: z.enum(['none', 'twoWaves', 'steadyBuild']),
})

export const MixSetSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  createdAt: z.number(),
  editedAt: z.number(),
  playlists: z.array(SetPlaylistSchema),
  marks: z.record(TrackId, z.enum(['mustInclude', 'exclude'])),
  mix: MixSettingsSchema,
  chosenMix: z.object({ order: z.array(TrackId) }).nullable(),
  lastSave: z
    .object({ url: z.string(), savedAt: z.number(), name: z.string(), order: z.array(TrackId) })
    .nullable(),
}) satisfies z.ZodType<MixSet>

export const StoredSet = z.object({ v: z.literal(STORAGE_VERSION), data: MixSetSchema })

/** Just enough of a record to name a set that can't be read. */
export const StoredSetName = z.object({ data: z.object({ name: z.string().min(1) }) })
export const StoredVersion = z.object({ v: z.number() })
