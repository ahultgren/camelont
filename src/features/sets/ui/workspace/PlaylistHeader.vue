<script setup lang="ts">
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from 'reka-ui'
import { computed, ref, watch } from 'vue'
import type { PlaylistSelection } from '../../domain/select'
import { describeSkipped, skippedCount } from '../../domain/skipped'
import type { PickMethod, SetPlaylist } from '../../domain/types'
import BpmRangeControl from './BpmRangeControl.vue'
import { useWorkspaceUi } from './context'
import WsIcon from './WsIcon.vue'

/**
 * A playlist's bar over its tracks (spec §9.1): fold, name, tracks in the set out of
 * tracks in the pool, the BPM range on the BPM distribution, the limit, the pick method
 * when there is a limit, the change notice when Spotify changed, and a small menu.
 */
const { playlist, selection, open } = defineProps<{
  playlist: SetPlaylist
  /** The playlist's part of the selection; null until the first one is known. */
  selection: PlaylistSelection | null
  open: boolean
}>()
const emit = defineEmits<{
  toggle: []
  /** Update was pressed: the caller applies it and lists what was dropped. */
  update: []
  remove: []
}>()

const { ws } = useWorkspaceUi()
const id = computed(() => playlist.playlistId)
const choices = computed(() => playlist.choices)
const notice = computed(() => ws.notices.value.get(id.value) ?? null)

const bpms = computed(() => {
  const seen = new Set<string>()
  const known: number[] = []
  for (const { trackId } of playlist.tracks) {
    if (seen.has(trackId)) continue
    seen.add(trackId)
    const bpm = ws.features.value.get(trackId)?.bpm?.value
    if (bpm !== undefined) known.push(bpm)
  }
  return known
})

const counts = computed(() => selection?.counts ?? null)
const REASONS = [
  ['excluded', 'excluded'],
  ['outsideRange', 'outside the BPM range'],
  ['notPicked', 'not picked'],
  ['needsData', 'need key/BPM'],
  ['duplicate', 'in another playlist'],
] as const
/** "8 of 10 tracks in the set · 1 excluded · 1 outside the BPM range". */
const countWords = computed(() => {
  const now = counts.value
  if (!now) return 'Looking up key and BPM'
  const out = REASONS.flatMap(([reason, words]) =>
    now.byReason[reason] > 0 ? [`${String(now.byReason[reason])} ${words}`] : [],
  )
  return [`${String(now.inSet)} of ${String(now.tracks)} tracks in the set`, ...out].join(' · ')
})

// The limit commits when the field is left or Enter is pressed, like the range's ends.
const limitText = ref('')
watch(
  () => choices.value.limit,
  (limit) => {
    limitText.value = limit === null ? '' : String(limit)
  },
  { immediate: true },
)
function commitLimit() {
  const raw = limitText.value.trim()
  const value = raw === '' ? null : Number(raw)
  if (value !== null && (!Number.isFinite(value) || value < 0)) {
    limitText.value = choices.value.limit === null ? '' : String(choices.value.limit)
    return
  }
  ws.setLimit(id.value, value)
}

const METHODS: { value: PickMethod; label: string; title: string }[] = [
  { value: 'random', label: 'Random', title: 'A stable draw; Reshuffle draws again' },
  { value: 'bestFit', label: 'Best fit', title: 'The tracks that fit the rest of the set best' },
]
const mustInclude = computed(() => selection?.counts.byReason.mustInclude ?? 0)
const limitFull = computed(() => choices.value.limit !== null && selection?.limitFilled === true)
const skipped = computed(() => skippedCount(playlist.skipped))

const itemClass =
  'cursor-pointer rounded px-2.5 py-1.5 text-[13px] outline-none data-disabled:cursor-default data-disabled:text-muted data-highlighted:bg-band'
</script>

<template>
  <header class="sticky top-0 z-10 border-b border-rule bg-band">
    <!--
      Every control right of the name has a fixed width and a place of its own, so
      nothing here moves when a limit comes or goes or a notice appears: only the name
      gives way. At phone width they wrap onto three lines that are always the same.
    -->
    <div
      class="flex min-h-[38px] flex-wrap items-center gap-x-2.5 gap-y-1 py-1 pr-1.5 pl-1"
      data-testid="playlist-controls"
    >
      <h3 class="flex min-w-0 flex-1 basis-[150px] max-sm:order-1">
        <button
          type="button"
          class="flex min-w-0 items-center gap-1 rounded py-0.5 text-left hover:text-accent"
          :aria-expanded="open"
          :title="open ? 'Fold away its tracks' : 'Show its tracks'"
          @click="emit('toggle')"
        >
          <WsIcon name="chevron" class="transition-transform" :class="open ? 'rotate-90' : ''" />
          <span class="truncate font-display text-[15px] leading-5 font-bold">{{
            playlist.name
          }}</span>
        </button>
      </h3>

      <span
        class="num min-w-[44px] text-right text-xs whitespace-nowrap max-sm:order-2"
        :title="countWords"
        data-testid="playlist-count"
      >
        <span aria-hidden="true">
          <template v-if="counts">
            <b class="font-medium">{{ counts.inSet }}</b
            ><span class="text-muted">/{{ counts.tracks }}</span>
          </template>
          <span v-else class="text-muted">…</span>
        </span>
        <span class="sr-only">{{ countWords }}</span>
      </span>

      <BpmRangeControl
        class="max-sm:order-4 max-sm:basis-full"
        :bpms="bpms"
        :min="choices.bpmMin"
        :max="choices.bpmMax"
        :name="playlist.name"
        @change="(range) => ws.setBpmRange(id, range)"
      />

      <label class="flex items-center gap-1 text-xs text-muted max-sm:order-5">
        Limit
        <input
          v-model="limitText"
          type="text"
          inputmode="numeric"
          class="num h-6 w-9 rounded border border-rule bg-surface px-1 text-center text-xs text-ink placeholder:text-muted/70 focus:border-accent"
          placeholder="–"
          :aria-label="`Limit of ${playlist.name}`"
          title="The most tracks this playlist contributes. Empty: no limit."
          @change="commitLimit"
          @keydown.enter="commitLimit"
        />
      </label>

      <!--
      The pick method matters only when there is a limit, but its place is always
      there: it must not push the other controls about when it shows.
    -->
      <span
        class="flex h-6 w-[152px] shrink-0 items-center gap-1 max-sm:order-6"
        data-testid="pick-slot"
      >
        <template v-if="choices.limit !== null">
          <span
            role="radiogroup"
            :aria-label="`How ${playlist.name} picks`"
            class="flex overflow-hidden rounded border border-rule text-xs"
          >
            <button
              v-for="method in METHODS"
              :key="method.value"
              type="button"
              role="radio"
              :aria-checked="choices.pick === method.value"
              class="border-l border-rule px-1.5 py-0.5 whitespace-nowrap first:border-l-0"
              :class="
                choices.pick === method.value
                  ? 'bg-accent font-medium text-surface'
                  : 'bg-surface hover:bg-band'
              "
              :title="method.title"
              @click="ws.setPickMethod(id, method.value)"
            >
              {{ method.label }}
            </button>
          </span>
          <button
            v-if="choices.pick === 'random'"
            type="button"
            class="flex size-6 shrink-0 items-center justify-center rounded text-muted hover:bg-surface hover:text-ink"
            :aria-label="`Reshuffle the picks of ${playlist.name}`"
            title="Reshuffle: draw the picks again"
            @click="ws.reshuffle(id)"
          >
            <WsIcon name="shuffle" />
          </button>
        </template>
      </span>

      <DropdownMenuRoot>
        <DropdownMenuTrigger
          class="flex size-6 shrink-0 items-center justify-center rounded max-sm:order-3 text-muted hover:bg-surface hover:text-ink data-[state=open]:bg-surface"
          :aria-label="`More for ${playlist.name}`"
        >
          <WsIcon name="more" />
        </DropdownMenuTrigger>
        <DropdownMenuPortal>
          <DropdownMenuContent
            align="end"
            :side-offset="4"
            class="z-50 grid min-w-[220px] rounded-lg border border-rule bg-surface p-1 text-ink shadow-lg"
          >
            <DropdownMenuItem
              :class="itemClass"
              :disabled="notice?.kind !== 'changed'"
              @select="emit('update')"
            >
              Update from Spotify
              <span v-if="notice?.kind === 'changed'" class="num text-muted">
                · {{ notice.label }}</span
              >
            </DropdownMenuItem>
            <DropdownMenuItem
              :class="itemClass"
              :disabled="notice?.kind === 'checking'"
              @select="void ws.checkPlaylists()"
            >
              Check Spotify for changes
            </DropdownMenuItem>
            <DropdownMenuSeparator class="my-1 h-px bg-rule" />
            <DropdownMenuItem :class="itemClass" class="text-warn" @select="emit('remove')">
              Remove from set…
            </DropdownMenuItem>
            <DropdownMenuLabel
              v-if="skipped > 0"
              class="mt-1 max-w-[260px] border-t border-rule px-2.5 pt-1.5 pb-1 text-xs text-muted"
            >
              {{ describeSkipped(playlist.skipped) }} in this playlist can’t be mixed and
              {{ skipped === 1 ? 'isn’t' : 'aren’t' }} listed.
            </DropdownMenuLabel>
          </DropdownMenuContent>
        </DropdownMenuPortal>
      </DropdownMenuRoot>
    </div>

    <!--
      What is said only now and then goes on a line of its own under the controls:
      Spotify changed, the playlist can't be checked, the limit is full already.
    -->
    <div
      v-if="notice?.kind === 'changed' || notice?.kind === 'cantCheck' || limitFull"
      class="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-rule/70 py-1 pr-1.5 pl-6 text-xs"
    >
      <span
        v-if="notice?.kind === 'changed'"
        class="flex items-center gap-1.5 rounded bg-warn-bg py-0.5 pr-0.5 pl-2 text-warn"
        role="status"
      >
        <span
          ><span class="sr-only">{{ playlist.name }} changed in Spotify: </span
          ><span class="num">{{ notice.label }}</span></span
        >
        <button
          type="button"
          class="rounded bg-surface px-1.5 py-0.5 font-medium text-ink hover:text-accent"
          :aria-label="`Update ${playlist.name}`"
          @click="emit('update')"
        >
          Update
        </button>
      </span>
      <span
        v-else-if="notice?.kind === 'cantCheck'"
        class="rounded bg-surface px-1.5 py-0.5 text-[11px] text-muted"
        :title="notice.message"
        role="status"
      >
        can’t be checked<span class="sr-only">: {{ notice.message }}</span>
      </span>
      <span
        v-if="limitFull"
        class="text-[11px] text-muted"
        title="The must-include tracks alone fill the limit, so nothing more is picked."
      >
        <span class="num">{{ mustInclude }}</span> must-include, limit
        <span class="num">{{ choices.limit }}</span>
      </span>
    </div>
  </header>
</template>
