import { z } from 'zod'
import { playlistIdFromUrl } from '../domain/save'
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
  // Added after the first stored sets; a set stored without it skipped nothing we know of.
  skipped: z
    .object({ localFiles: z.number(), episodes: z.number(), unavailable: z.number() })
    .default({ localFiles: 0, episodes: 0, unavailable: 0 }),
  choices: TrackChoicesSchema,
})

const MixSettingsSchema = z.object({
  opener: TrackId.nullable(),
  closer: TrackId.nullable(),
  follows: z.array(z.tuple([TrackId, TrackId])),
  arc: z.enum(['none', 'twoWaves', 'steadyBuild']),
  // Later than the first stored sets: one without them has the switches off.
  arcSignal: z.enum(['bpm', 'energy', 'both']).default('bpm'),
  energySteps: z.boolean().default(false),
  keyLift: z.boolean().default(false),
  keysFollowArc: z.boolean().default(false),
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
    .object({
      // Added with the save dialog. A set saved before has only the link, which names
      // the playlist; without an ID the playlist is never offered for replacing.
      playlistId: z.string().min(1).nullable().optional(),
      url: z.string(),
      savedAt: z.number(),
      name: z.string(),
      order: z.array(TrackId),
    })
    .transform((save) => ({
      ...save,
      playlistId: save.playlistId ?? playlistIdFromUrl(save.url),
    }))
    .nullable(),
}) satisfies z.ZodType<MixSet>

export const StoredSet = z.object({ v: z.literal(STORAGE_VERSION), data: MixSetSchema })

/** Just enough of a record to name a set that can't be read. */
export const StoredSetName = z.object({ data: z.object({ name: z.string().min(1) }) })
export const StoredVersion = z.object({ v: z.number() })
