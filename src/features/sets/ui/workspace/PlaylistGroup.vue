<script setup lang="ts">
import { computed } from 'vue'
import type { PlaylistSelection } from '../../domain/select'
import { visibleRows, type ListFilter, type ListRow } from '../../domain/track-list'
import type { SetPlaylist } from '../../domain/types'
import { useWorkspaceUi } from './context'
import PlaylistHeader from './PlaylistHeader.vue'
import TrackRow from './TrackRow.vue'

/** A playlist in the one track list: its header bar over its own tracks. */
const { playlist, selection, filter, open, dropped } = defineProps<{
  playlist: SetPlaylist
  selection: PlaylistSelection | null
  filter: ListFilter
  open: boolean
  /** What the last Update dropped, a line each; null when there is nothing to say. */
  dropped: readonly string[] | null
}>()
const emit = defineEmits<{ toggle: []; update: []; remove: []; dismiss: [] }>()

const { ws } = useWorkspaceUi()

/** One row per track, in playlist order; a track new to the pool has no status yet. */
const rows = computed<ListRow[]>(() => {
  const known = new Map(selection?.tracks.map((row) => [row.trackId, row.status]))
  const seen = new Set<string>()
  const all: ListRow[] = []
  for (const { trackId } of playlist.tracks) {
    if (seen.has(trackId)) continue
    seen.add(trackId)
    all.push({ trackId, status: known.get(trackId) ?? null })
  }
  return all
})

const shown = computed(() =>
  visibleRows(
    rows.value,
    (trackId) => {
      const track = ws.tracks.value.get(trackId)
      const known = ws.features.value.get(trackId)
      return track
        ? {
            title: track.title,
            artists: track.artists,
            camelot: known?.camelot?.value ?? null,
            bpm: known?.bpm?.value ?? null,
          }
        : undefined
    },
    filter,
  ),
)
</script>

<template>
  <section :aria-label="playlist.name" :data-playlist="playlist.playlistId">
    <PlaylistHeader
      :playlist="playlist"
      :selection="selection"
      :open="open"
      @toggle="emit('toggle')"
      @update="emit('update')"
      @remove="emit('remove')"
    />
    <div
      v-if="dropped"
      class="flex items-start gap-2 border-b border-rule bg-ok-bg px-2.5 py-1.5 text-xs"
      role="status"
    >
      <div class="grid min-w-0 gap-0.5">
        <p class="font-medium">Updated from Spotify.</p>
        <p v-if="dropped.length === 0">Nothing was dropped.</p>
        <p v-for="line in dropped" :key="line">{{ line }}</p>
      </div>
      <button
        type="button"
        class="ml-auto rounded px-1.5 py-0.5 hover:bg-surface"
        @click="emit('dismiss')"
      >
        Dismiss
      </button>
    </div>
    <template v-if="open">
      <ol v-if="shown.length" class="bg-surface">
        <TrackRow
          v-for="row in shown"
          :key="row.trackId"
          :track-id="row.trackId"
          :playlist-id="playlist.playlistId"
          :status="row.status"
          :choices="playlist.choices"
        />
      </ol>
      <p v-else class="border-b border-rule bg-surface px-3 py-2 text-xs text-muted">
        {{
          rows.length === 0
            ? 'This playlist has no tracks to mix.'
            : 'No track here matches the filter.'
        }}
      </p>
    </template>
  </section>
</template>
