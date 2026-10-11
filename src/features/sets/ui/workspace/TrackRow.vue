<script setup lang="ts">
import { computed } from 'vue'
import { KeyChip, MoveBadge } from '@/shared/ui'
import { roleOf, type TrackRole } from '../../domain/edits'
import { statusLabel, type TrackStatus } from '../../domain/select'
import type { TrackChoices } from '../../domain/types'
import { usePartners, useWorkspaceUi } from './context'
import WsIcon, { type IconName } from './WsIcon.vue'

/**
 * One track of a playlist, on one line (spec §9.1): title and artist, why it is in or
 * out when the app decided, its pairs, key and BPM (the way into the edit dialog), the
 * one group of toggles, and "Followed by…".
 */
const { trackId, playlistId, status, choices } = defineProps<{
  trackId: string
  playlistId: string
  /** As this playlist shows it; null while the track's key and BPM are looked up. */
  status: TrackStatus | null
  choices: TrackChoices
}>()

const ui = useWorkspaceUi()
const { ws } = ui

const track = computed(() => ws.tracks.value.get(trackId))
const title = computed(() => track.value?.title ?? trackId)
const features = computed(() => ws.features.value.get(trackId))
const camelot = computed(() => features.value?.camelot ?? null)
const bpm = computed(() => features.value?.bpm ?? null)

const role = computed(() => (ws.set.value ? roleOf(ws.set.value, trackId) : null))
const leftOut = computed(() => status?.inSet === false)

/** The reason, in a couple of words, only when the app made the call. */
const tag = computed(() => {
  if (status === null) return 'looking up'
  switch (status.reason) {
    case 'outsideRange':
      return 'outside range'
    case 'notPicked':
      return 'not picked'
    case 'picked':
      return 'picked'
    case 'needsData':
      return 'needs key/BPM'
    case 'duplicate':
      return `in ${ui.playlistName(status.ownerPlaylistId)}`
    case 'in':
    case 'mustInclude':
    case 'excluded':
      return null
  }
})
/** The status in the spec's words, for every row. */
const words = computed(() =>
  status === null
    ? 'looking up key and BPM'
    : statusLabel(status, choices, (id) => ui.playlistName(id)),
)
const changed = computed(() =>
  ui.joined.value.has(trackId) ? 'joined' : ui.left.value.has(trackId) ? 'left' : null,
)

const ROLES: { role: TrackRole; icon: IconName; label: string }[] = [
  { role: 'opener', icon: 'opener', label: 'Opener' },
  { role: 'closer', icon: 'closer', label: 'Closer' },
  { role: 'mustInclude', icon: 'include', label: 'Always include' },
  { role: 'exclude', icon: 'exclude', label: 'Exclude' },
]

const { leader, follower } = usePartners(ui, () => trackId)

const highlighted = computed(() => ws.pointedTrackId.value === trackId)
const point = (id: string | null) => {
  ws.pointedTrackId.value = id
}

// "Followed by…": this row waits, or another one does and this row can complete the pair.
const armedHere = computed(() => ui.armed.value === trackId)
const candidate = computed(() => ui.candidate(trackId))
const armRefusal = computed(() => ui.armRefusal(trackId))
const armedTitle = computed(() => (ui.armed.value ? ui.titleOf(ui.armed.value) : ''))

/** Focus inside the row points at its track, except on a pair: that points at the partner. */
function onFocusIn(event: FocusEvent) {
  if (!(event.target as Element).closest('.pair-chip')) point(trackId)
}

/** While a track waits, a click anywhere on a row that can be chosen chooses it. */
function onRowClick(event: MouseEvent) {
  if (candidate.value?.blocked !== null) return
  if ((event.target as Element).closest('button, input, a')) return
  ui.choose(trackId)
}
</script>

<template>
  <li
    class="track-row grid grid-cols-[10px_minmax(0,1fr)_auto_auto_auto] items-center gap-x-2 gap-y-0.5 border-b border-rule/60 py-[3px] pr-2 pl-1.5 text-[13px] sm:grid-cols-[10px_minmax(0,1fr)_auto_auto_auto_auto_auto]"
    :class="[
      highlighted ? 'bg-band shadow-[inset_2px_0_0_var(--accent)]' : '',
      armedHere ? 'bg-ok-bg' : '',
      candidate && candidate.blocked === null ? 'cursor-pointer hover:bg-band' : '',
    ]"
    :data-track-id="trackId"
    :data-playlist-id="playlistId"
    :data-left-out="leftOut ? '' : undefined"
    :data-highlighted="highlighted ? '' : undefined"
    @pointerenter="point(trackId)"
    @pointerleave="point(null)"
    @focusin="onFocusIn"
    @focusout="point(null)"
    @click="onRowClick"
  >
    <span
      class="num text-center text-xs font-medium"
      :class="changed === 'joined' ? 'text-ok' : 'text-warn'"
      :title="
        changed
          ? `${changed === 'joined' ? 'Joined' : 'Left'} the set in the last change`
          : undefined
      "
    >
      <template v-if="changed">
        <span aria-hidden="true">{{ changed === 'joined' ? '+' : '−' }}</span>
        <span class="sr-only">{{ changed }} the set in the last change</span>
      </template>
    </span>

    <!-- At phone width the title takes a line of its own, over the values and toggles. -->
    <span
      class="fade col-span-2 min-w-0 truncate sm:col-span-1"
      :title="`${title} · ${track?.artists.join(', ') ?? ''}`"
    >
      <span class="font-medium" data-testid="track-title">{{ title }}</span>
      <span class="ml-1.5 text-muted">{{ track?.artists.join(', ') }}</span>
      <span class="sr-only"> · {{ words }}</span>
    </span>

    <span class="col-span-2 flex min-w-0 items-center justify-end gap-1 sm:col-span-1">
      <span
        v-if="tag"
        class="rounded px-1.5 text-[11px] leading-[18px] whitespace-nowrap"
        :class="
          status?.reason === 'needsData'
            ? 'bg-warn-bg text-warn'
            : status?.reason === 'picked'
              ? 'bg-ok-bg text-ok'
              : 'bg-band text-muted'
        "
        :title="words"
        aria-hidden="true"
        data-testid="reason"
        >{{ tag }}</span
      >
      <button
        v-if="leader"
        type="button"
        class="pair-chip"
        :aria-label="`Follows ${ui.titleOf(leader)}. Show it`"
        :title="`Follows ${ui.titleOf(leader)}`"
        @pointerenter.stop="point(leader)"
        @pointerleave.stop="point(trackId)"
        @focus="point(leader)"
        @click="ui.reveal(leader)"
      >
        <span aria-hidden="true">after</span>
        <span class="truncate">{{ ui.titleOf(leader) }}</span>
      </button>
      <button
        v-if="follower"
        type="button"
        class="pair-chip"
        :aria-label="`Followed by ${ui.titleOf(follower)}. Show it`"
        :title="`Followed by ${ui.titleOf(follower)}`"
        @pointerenter.stop="point(follower)"
        @pointerleave.stop="point(trackId)"
        @focus="point(follower)"
        @click="ui.reveal(follower)"
      >
        <span aria-hidden="true">then</span>
        <span class="truncate">{{ ui.titleOf(follower) }}</span>
      </button>
    </span>

    <button
      type="button"
      class="fade value-button col-start-2 w-[132px] justify-self-start sm:col-start-auto"
      :title="
        camelot?.source === 'manual' ? 'Key set by hand. Click to edit' : 'Click to edit the key'
      "
      @click="ui.edit(trackId)"
    >
      <span class="sr-only">Key of {{ title }}: </span>
      <KeyChip :camelot="camelot?.value ?? null" size="sm" />
      <span v-if="camelot?.source === 'manual'" class="hand" data-testid="by-hand">
        <WsIcon name="pencil" :size="10" /><span class="sr-only">set by hand</span>
      </span>
    </button>

    <button
      type="button"
      class="fade value-button num w-[64px] justify-end"
      :class="bpm ? '' : 'text-warn'"
      :title="bpm?.source === 'manual' ? 'BPM set by hand. Click to edit' : 'Click to edit the BPM'"
      @click="ui.edit(trackId)"
    >
      <span class="sr-only">BPM of {{ title }}: </span>
      <span>{{ bpm?.value ?? '?' }}</span>
      <!-- A slot of its own, so the numbers stay in a column. -->
      <span class="hand w-2.5">
        <template v-if="bpm?.source === 'manual'">
          <WsIcon name="pencil" :size="10" data-testid="by-hand" /><span class="sr-only"
            >set by hand</span
          >
        </template>
      </span>
    </button>

    <span role="group" :aria-label="`Role of ${title}`" class="toggles flex">
      <button
        v-for="option in ROLES"
        :key="option.role"
        type="button"
        class="toggle"
        :class="option.role === 'exclude' ? 'toggle-exclude' : ''"
        :aria-pressed="role === option.role"
        :aria-label="option.label"
        :title="option.label"
        @click="ws.setRole(trackId, role === option.role ? null : option.role)"
      >
        <WsIcon :name="option.icon" />
      </button>
    </span>

    <!-- The link button is not one of the toggles: an opener can have a follower too. -->
    <span class="flex w-[46px] justify-end">
      <button
        v-if="candidate"
        type="button"
        class="choose"
        :disabled="candidate.blocked !== null"
        :aria-label="
          candidate.blocked === null
            ? `Follow ${armedTitle} with ${title}: ${candidate.move?.label ?? ''}`
            : `${title} can’t follow ${armedTitle}: ${candidate.blocked}`
        "
        :title="
          candidate.blocked === null
            ? `Follow ${armedTitle} with this: ${candidate.move?.label ?? ''}`
            : `Can’t follow ${armedTitle}: ${candidate.blocked}`
        "
        @click.stop="ui.choose(trackId)"
      >
        <MoveBadge
          v-if="candidate.move"
          :symbol="candidate.move.symbol"
          :tone="candidate.move.tone"
          :label="candidate.move.label"
        />
        <span v-else class="num text-xs text-muted" aria-hidden="true">?</span>
      </button>
      <button
        v-else
        type="button"
        class="toggle"
        :class="armedHere ? 'toggle-armed' : ''"
        :aria-pressed="armedHere"
        :disabled="armRefusal !== null && !armedHere"
        :aria-label="`Followed by… Choose the track that follows ${title}`"
        :title="
          armRefusal ??
          (armedHere ? 'Waiting for the track that follows. Click to cancel' : 'Followed by…')
        "
        @click.stop="armedHere ? ui.disarm() : ui.arm(trackId)"
      >
        <WsIcon name="follow" />
      </button>
    </span>
  </li>
</template>

<style scoped>
@reference '../../../../app/styles.css';

.track-row {
  content-visibility: auto;
  contain-intrinsic-block-size: auto 29px;
}
/* Left-out rows are dimmed; their controls stay clear. */
.track-row[data-left-out] .fade {
  opacity: 0.5;
}
.value-button {
  @apply flex items-center gap-1 rounded px-0.5 hover:bg-band;
}
.hand {
  @apply inline-flex text-ok;
}
.pair-chip {
  @apply flex max-w-[128px] min-w-0 items-center gap-1 rounded border border-rule px-1.5 text-[11px] leading-[18px] text-muted hover:border-accent hover:text-ink;
}
.toggle {
  @apply flex size-[22px] items-center justify-center rounded text-muted hover:bg-band hover:text-ink disabled:cursor-not-allowed disabled:opacity-40;
}
.toggle[aria-pressed='true'] {
  @apply bg-accent text-surface;
}
.toggle-exclude[aria-pressed='true'] {
  @apply bg-ink text-surface;
}
.toggle-armed[aria-pressed='true'] {
  @apply bg-ok text-surface;
}
.choose {
  @apply flex h-[22px] min-w-[30px] items-center justify-center rounded disabled:cursor-not-allowed disabled:opacity-45;
}
/* Toggles that are off stay quiet until the row is pointed at or focused. */
@media (hover: hover) {
  .track-row:not(:hover):not(:focus-within) .toggle[aria-pressed='false'] {
    opacity: 0.38;
  }
}
</style>
