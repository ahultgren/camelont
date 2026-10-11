<script setup lang="ts">
import { computed, nextTick, useTemplateRef, watch } from 'vue'
import { MOVE_META, type EvaluatedMix } from '@/features/mixing'
import { keyName } from '@/shared/music'
import { EnergyChip, KeyChip, TONE_TEXT } from '@/shared/ui'
import { formatBpmDelta, type EntryInfo } from '../domain/layout'

/**
 * The mix as a list: a line per track (key, BPM, energy) and a connector between each
 * pair (keys, move, BPM change). A connector can be pinned: "keep these two together". Keys are Camelot
 * codes, with the key names in the tooltip.
 */
const {
  mix,
  info,
  highlighted = null,
  pinned = [],
} = defineProps<{
  mix: EvaluatedMix
  info: ReadonlyMap<string, EntryInfo>
  /** A track pointed at in another view. */
  highlighted?: string | null
  /** Pairs that are kept together, as [from, to] track IDs. */
  pinned?: readonly (readonly [string, string])[]
}>()
const emit = defineEmits<{
  /** The track under the pointer or with focus; null when it leaves. */
  point: [trackId: string | null]
  select: [trackId: string]
  pin: [from: string, to: string]
  unpin: [from: string, to: string]
}>()

const pinnedKeys = computed(() => new Set(pinned.map(([from, to]) => `${from}>${to}`)))
const isPinned = (from: string, to: string) => pinnedKeys.value.has(`${from}>${to}`)

const steps = computed(() =>
  mix.order.map((track, i) => {
    const before = i > 0 ? mix.order[i - 1] : undefined
    const transition = i > 0 ? mix.transitions[i - 1] : undefined
    return {
      track,
      before,
      meta: transition ? MOVE_META[transition.move] : null,
      delta: before ? formatBpmDelta(track.bpm - before.bpm) : '',
      pinned: before ? isPinned(before.id, track.id) : false,
    }
  }),
)

// A track pointed at elsewhere is brought into view here; pointing here moves nothing.
const list = useTemplateRef<HTMLElement>('list')
let pointingHere = false
watch(
  () => highlighted,
  async (trackId) => {
    if (trackId === null || pointingHere) return
    await nextTick()
    const row = list.value?.querySelector<HTMLElement>('[data-highlighted]')
    // Not every test DOM scrolls.
    if (typeof row?.scrollIntoView === 'function') row.scrollIntoView({ block: 'nearest' })
  },
)
function point(trackId: string | null) {
  pointingHere = trackId !== null
  emit('point', trackId)
}
</script>

<template>
  <ol ref="list" class="grid list-none" aria-label="Running order">
    <template v-for="(step, i) in steps" :key="step.track.id">
      <li
        v-if="step.before && step.meta"
        class="num flex items-center gap-1.5 py-px pl-[9px] text-[11px] leading-4"
        :class="TONE_TEXT[step.meta.tone]"
      >
        <span class="h-4 w-px bg-rule" aria-hidden="true" />
        <span
          class="ml-3 min-w-0 truncate"
          :title="`${keyName(step.before.camelot)} → ${keyName(step.track.camelot)}`"
        >
          {{ step.before.camelot }} → {{ step.track.camelot }} · {{ step.meta.label }}
          <span class="text-muted">{{ step.delta }}</span>
        </span>
        <button
          type="button"
          class="ml-auto flex size-5 shrink-0 items-center justify-center rounded"
          :class="
            step.pinned ? 'bg-accent text-surface' : 'text-muted hover:bg-band hover:text-ink'
          "
          :aria-pressed="step.pinned"
          :aria-label="`Keep ${step.before.label} and ${step.track.label} together`"
          :title="
            step.pinned ? 'Kept together. Click to let them part.' : 'Keep these two together'
          "
          @click="
            step.pinned
              ? emit('unpin', step.before.id, step.track.id)
              : emit('pin', step.before.id, step.track.id)
          "
        >
          <svg viewBox="0 0 16 16" class="size-3" fill="currentColor" aria-hidden="true">
            <path
              d="M9.8 1.2 14.8 6.2 13.7 7.3 12.9 7 10.6 9.3 10.9 12.2 9.8 13.3 6.9 10.4 3.1 14.2 1.8 14.2 1.8 12.9 5.6 9.1 2.7 6.2 3.8 5.1 6.7 5.4 9 3.1 8.7 2.3Z"
            />
          </svg>
        </button>
      </li>
      <li
        class="grid cursor-default grid-cols-[20px_minmax(0,1fr)_auto_auto_auto] items-center gap-x-2 rounded-md px-1 py-[3px] text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-accent"
        :class="step.track.id === highlighted ? 'bg-band' : ''"
        :data-highlighted="step.track.id === highlighted ? '' : undefined"
        tabindex="0"
        @pointerenter="point(step.track.id)"
        @pointerleave="point(null)"
        @focus="point(step.track.id)"
        @blur="point(null)"
        @click="emit('select', step.track.id)"
        @keydown.enter="emit('select', step.track.id)"
      >
        <span class="num text-right text-[11px] text-muted">{{ i + 1 }}</span>
        <span class="min-w-0 truncate">
          <span class="font-medium" data-testid="order-title">{{ step.track.label }}</span>
          <span class="ml-1.5 text-muted">{{ info.get(step.track.id)?.artists.join(', ') }}</span>
        </span>
        <KeyChip :camelot="step.track.camelot" size="sm" />
        <span class="num min-w-[38px] text-right text-xs">{{ step.track.bpm }}</span>
        <EnergyChip :energy="step.track.energy" />
      </li>
    </template>
  </ol>
</template>
