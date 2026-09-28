/** What the track table needs from a playlist entry (structurally a PlaylistEntry). */
export interface TrackRow {
  entryId: string
  trackId: string
  title: string
  artists: readonly string[]
}
