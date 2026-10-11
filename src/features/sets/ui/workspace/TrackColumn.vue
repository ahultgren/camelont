<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue'
import { OverrideDialog } from '@/features/track-features'
import { AppButton, AppDialog } from '@/shared/ui'
import { describeDropped } from '../../domain/playlist-diff'
import { isFiltering, NO_FILTER, type SortBy, type StatusFilter } from '../../domain/track-list'
import { useWorkspaceUi } from './context'
import PlaylistGroup from './PlaylistGroup.vue'
import WsIcon from './WsIcon.vue'

/**
 * The one track list of the set (spec W7, §9.1): every playlist a header bar over its
 * own tracks, with a filter and a sort that work inside each. The column scrolls by
 * itself.
 */
const ui = useWorkspaceUi()
const { ws } = ui

const playlists = computed(() => ws.set.value?.playlists ?? [])
const selections = computed(
  () => new Map(ws.selection.value?.playlists.map((playlist) => [playlist.playlistId, playlist])),
)

// ── Filter and sort ────────────────────────────────────────────────────────────────
const text = ref('')
const status = ref<StatusFilter>('all')
const sort = ref<SortBy>('playlist')
const filter = computed(() => ({ text: text.value, status: status.value, sort: sort.value }))

const totals = computed(() => {
  const statuses = [...(ws.selection.value?.statusByTrack.values() ?? [])]
  const inSet = statuses.filter((entry) => entry.inSet).length
  return {
    all: ws.tracks.value.size,
    inSet,
    leftOut: statuses.length - inSet,
    needsData: statuses.filter((entry) => entry.reason === 'needsData').length,
  }
})
const STATUSES: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'inSet', label: 'In the set' },
  { value: 'leftOut', label: 'Left out' },
  { value: 'needsData', label: 'Needs key/BPM' },
]
const SORTS: { value: SortBy; label: string }[] = [
  { value: 'playlist', label: 'Playlist order' },
  { value: 'bpm', label: 'BPM' },
  { value: 'key', label: 'Key' },
]

// ── Folding: any number of playlists can be open ───────────────────────────────────
const folded = ref<ReadonlySet<string>>(new Set())
function toggle(playlistId: string) {
  const next = new Set(folded.value)
  if (!next.delete(playlistId)) next.add(playlistId)
  folded.value = next
}

// ── Update from Spotify, and what it dropped ───────────────────────────────────────
const droppedBy = ref<ReadonlyMap<string, readonly string[]>>(new Map())
function update(playlistId: string) {
  // The names are read before the tracks are gone.
  const dropped = ws.updatePlaylist(playlistId)
  if (!dropped) return
  droppedBy.value = new Map(droppedBy.value).set(playlistId, describeDropped(dropped, removedName))
}
function dismiss(playlistId: string) {
  const next = new Map(droppedBy.value)
  next.delete(playlistId)
  droppedBy.value = next
}
/** A name that still works once the track has left the pool. */
const names = new Map<string, string>()
watch(
  () => ws.tracks.value,
  (tracks) => {
    for (const track of tracks.values()) names.set(track.trackId, track.title)
  },
  { immediate: true },
)
const removedName = (trackId: string) => names.get(trackId) ?? 'a track'

// ── Remove from set, after saying what goes with it ────────────────────────────────
const removing = ref<{ playlistId: string; name: string; lines: string[]; tracks: number } | null>(
  null,
)
function askRemove(playlistId: string) {
  const dropped = ws.removalOf(playlistId)
  const playlist = playlists.value.find((candidate) => candidate.playlistId === playlistId)
  if (!dropped || !playlist) return
  removing.value = {
    playlistId,
    name: playlist.name,
    lines: describeDropped(dropped, removedName),
    tracks: new Set(playlist.tracks.map((track) => track.trackId)).size,
  }
}
function remove() {
  if (removing.value) ws.removePlaylist(removing.value.playlistId)
  removing.value = null
}

// ── The edit dialog, opened from a row's key or BPM ────────────────────────────────
const editOpen = computed({
  get: () => ui.editing.value !== null,
  set: (open: boolean) => {
    if (!open) ui.editing.value = null
  },
})

// ── Bringing a track's row into view ───────────────────────────────────────────────
const scroller = useTemplateRef<HTMLElement>('scroller')
watch(
  () => ui.revealed.value,
  async (request) => {
    if (!request) return
    const { trackId } = request
    // The playlist that decides the track shows its real status; else the first that has it.
    const having = playlists.value.filter((playlist) =>
      playlist.tracks.some((track) => track.trackId === trackId),
    )
    const home =
      having.find((playlist) =>
        selections.value
          .get(playlist.playlistId)
          ?.tracks.some((row) => row.trackId === trackId && row.status.reason !== 'duplicate'),
      ) ?? having[0]
    if (!home) return
    if (folded.value.has(home.playlistId)) toggle(home.playlistId)
    if (isFiltering(filter.value)) {
      text.value = NO_FILTER.text
      status.value = NO_FILTER.status
    }
    await nextTick()
    const row = [...(scroller.value?.querySelectorAll<HTMLElement>('[data-track-id]') ?? [])].find(
      (candidate) =>
        candidate.dataset.trackId === trackId && candidate.dataset.playlistId === home.playlistId,
    )
    if (typeof row?.scrollIntoView === 'function') row.scrollIntoView({ block: 'center' })
    ws.pointedTrackId.value = trackId
  },
)

// The notice above the list appears on a click in the list: the list is scrolled by the
// notice's height, so the row under the pointer stays where it is.
const notice = useTemplateRef<HTMLElement>('notice')
let shiftedBy = 0
watch(
  () => ui.armed.value !== null,
  (armed) => {
    const list = scroller.value
    if (!list) return
    if (armed) shiftedBy = notice.value?.offsetHeight ?? 0
    list.scrollTop += armed ? shiftedBy : -shiftedBy
  },
  { flush: 'post' },
)

const segment = 'border-l border-rule px-2 py-1 first:border-l-0 whitespace-nowrap'
const segmentOn = 'bg-accent font-medium text-surface'
const segmentOff = 'bg-surface hover:bg-band'
</script>

<template>
  <section class="flex min-h-0 min-w-0 flex-col" aria-label="Tracks">
    <div class="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-rule px-2 py-1.5">
      <input
        v-model="text"
        type="search"
        class="h-7 min-w-0 flex-1 basis-32 rounded border border-rule bg-surface px-2 text-[13px] placeholder:text-muted focus:border-accent"
        placeholder="Find a track or artist"
        aria-label="Find a track or artist"
      />
      <div
        role="radiogroup"
        aria-label="Show"
        class="flex overflow-hidden rounded border border-rule text-xs"
      >
        <button
          v-for="option in STATUSES"
          :key="option.value"
          type="button"
          role="radio"
          :aria-checked="status === option.value"
          :class="[segment, status === option.value ? segmentOn : segmentOff]"
          @click="status = option.value"
        >
          {{ option.label }}
          <span class="num" :class="status === option.value ? '' : 'text-muted'">{{
            totals[option.value]
          }}</span>
        </button>
      </div>
      <label class="flex items-center gap-1 text-xs text-muted">
        Sort
        <select
          v-model="sort"
          class="h-7 rounded border border-rule bg-surface px-1 text-xs text-ink focus:border-accent"
        >
          <option v-for="option in SORTS" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
      </label>
      <button
        type="button"
        class="flex h-7 items-center gap-1 rounded px-2 text-xs font-medium text-accent hover:bg-band"
        @click="ui.addingPlaylists.value = true"
      >
        <WsIcon name="plus" :size="12" /> Add playlists
      </button>
    </div>

    <p
      v-if="ws.providerError.value"
      role="alert"
      class="border-b border-rule bg-warn-bg px-2.5 py-1.5 text-xs text-warn"
    >
      ReccoBeats couldn’t be reached ({{ ws.providerError.value }}). Some tracks have no key or BPM
      yet.
      <button type="button" class="font-medium underline" @click="ws.retryFeatures()">
        Try again
      </button>
    </p>

    <!-- Stays put while the list scrolls, folds and filters (spec §9.1). -->
    <p
      v-if="ui.armed.value"
      ref="notice"
      role="status"
      class="flex items-center gap-2 border-b border-ok bg-ok-bg px-2.5 py-1.5 text-[13px]"
    >
      <WsIcon name="follow" />
      <span class="min-w-0 truncate">
        <b class="font-semibold">{{ ui.titleOf(ui.armed.value) }}</b> is followed by… choose a
        track. <span class="text-muted">Esc cancels.</span>
      </span>
      <button
        type="button"
        class="ml-auto rounded px-1.5 py-0.5 text-xs font-medium hover:bg-surface"
        @click="ui.disarm()"
      >
        Cancel
      </button>
    </p>

    <div
      ref="scroller"
      class="min-h-0 flex-1 overflow-y-auto overscroll-contain"
      tabindex="-1"
      data-testid="track-scroller"
    >
      <PlaylistGroup
        v-for="playlist in playlists"
        :key="playlist.playlistId"
        :playlist="playlist"
        :selection="selections.get(playlist.playlistId) ?? null"
        :filter="filter"
        :open="!folded.has(playlist.playlistId)"
        :dropped="droppedBy.get(playlist.playlistId) ?? null"
        @toggle="toggle(playlist.playlistId)"
        @update="update(playlist.playlistId)"
        @remove="askRemove(playlist.playlistId)"
        @dismiss="dismiss(playlist.playlistId)"
      />
      <div v-if="playlists.length === 0" class="grid justify-items-start gap-2 p-4 text-sm">
        <p class="text-muted">This set has no playlists yet.</p>
        <AppButton variant="secondary" @click="ui.addingPlaylists.value = true">
          Add playlists
        </AppButton>
      </div>
    </div>

    <OverrideDialog
      v-if="ui.editing.value"
      v-model:open="editOpen"
      :track-id="ui.editing.value"
      :label="ui.titleOf(ui.editing.value)"
      :features="ws.features.value.get(ui.editing.value)"
    />

    <AppDialog
      :open="removing !== null"
      :title="`Remove “${removing?.name ?? ''}” from this set?`"
      description="Only the set changes. The playlist stays as it is in Spotify."
      @update:open="(open) => open || (removing = null)"
    >
      <div v-if="removing" class="grid gap-1.5 text-sm">
        <p v-if="removing.lines.length === 0">
          {{
            removing.tracks === 0
              ? 'It has no tracks, so nothing else goes with it.'
              : 'All its tracks are in the set’s other playlists too, so no track, mark or mix rule goes with it.'
          }}
        </p>
        <template v-else>
          <p>This goes with it:</p>
          <ul class="grid list-disc gap-1 pl-5">
            <li v-for="line in removing.lines" :key="line">{{ line }}</li>
          </ul>
        </template>
      </div>
      <div class="flex justify-end gap-2">
        <AppButton variant="secondary" @click="removing = null">Cancel</AppButton>
        <AppButton variant="danger" @click="remove">Remove from set</AppButton>
      </div>
    </AppDialog>
  </section>
</template>
