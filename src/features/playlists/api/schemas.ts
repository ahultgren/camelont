import { z } from 'zod'

const Image = z.object({ url: z.string() })
const Images = z.array(Image).nullable().optional()

export const MeDto = z.object({ id: z.string(), display_name: z.string().nullable().optional() })

const Count = z.object({ total: z.number() }).nullable().optional()

export const PlaylistDto = z.object({
  id: z.string(),
  name: z.string(),
  collaborative: z.boolean().optional().default(false),
  images: Images,
  owner: z.object({ id: z.string(), display_name: z.string().nullable().optional() }),
  // The count moved from `tracks` to `items` in the Feb 2026 API; accept either.
  items: Count,
  tracks: Count,
  external_urls: z.object({ spotify: z.string().optional() }).optional(),
})

export const PlaylistPageDto = z.object({
  items: z.array(PlaylistDto.nullable()),
  next: z.string().nullable(),
})

const TrackDto = z.object({
  type: z.literal('track'),
  id: z.string().nullable(),
  uri: z.string(),
  name: z.string(),
  duration_ms: z.number(),
  is_local: z.boolean().optional().default(false),
  artists: z.array(z.object({ name: z.string() })),
  album: z.object({ images: Images }).optional(),
})

/** Episodes and anything else Spotify may add: counted, never mixed. */
const OtherItemDto = z.object({ type: z.string() })

export const PlaylistItemDto = z.object({
  is_local: z.boolean().optional().default(false),
  item: z.union([TrackDto, OtherItemDto]).nullable(),
})

export const PlaylistItemsPageDto = z.object({
  items: z.array(PlaylistItemDto),
  next: z.string().nullable(),
})

export const CreatedPlaylistDto = z.object({
  id: z.string(),
  external_urls: z.object({ spotify: z.string() }),
})

export const SnapshotDto = z.object({ snapshot_id: z.string() })

export type PlaylistDto = z.output<typeof PlaylistDto>
export type PlaylistItemDto = z.output<typeof PlaylistItemDto>
export type TrackDto = z.output<typeof TrackDto>

export const isTrack = (item: { type: string }): item is TrackDto =>
  item.type === 'track' && 'uri' in item
