<script setup lang="ts">
import { computed } from 'vue'
import { CandidateList, NO_SHAPING, ShapePicker, type MixShaping } from '@/features/mixing'
import { useWorkspaceUi } from './context'
import WsIcon from './WsIcon.vue'

/** What shapes the order: which alternative is shown, the shaping, and the follow pairs. */
const ui = useWorkspaceUi()
const { ws } = ui

const view = computed(() => ws.view.value)
const shownIndex = computed({
  get: () => (view.value.kind === 'mix' ? view.value.shownIndex : 0),
  set: (index: number) => {
    ws.chooseAlternative(index)
  },
})
const shape = computed<MixShaping>({
  get: () => {
    const mix = ws.set.value?.mix
    return mix
      ? {
          arc: mix.arc,
          arcSignal: mix.arcSignal,
          energySteps: mix.energySteps,
          keyLift: mix.keyLift,
        }
      : NO_SHAPING
  },
  set: (shaping) => {
    ws.setShape(shaping)
  },
})
const pairs = computed(() => ws.set.value?.mix.follows ?? [])
const point = (trackId: string | null) => {
  ws.pointedTrackId.value = trackId
}
</script>

<template>
  <div class="grid min-w-0 gap-2">
    <CandidateList
      v-if="view.kind === 'mix'"
      v-model="shownIndex"
      :candidates="view.alternatives"
    />

    <div class="flex flex-wrap items-center gap-x-2 gap-y-1.5">
      <ShapePicker v-model="shape" />
      <div
        class="flex min-w-0 flex-1 basis-40 flex-wrap items-center gap-1"
        aria-label="Follow pairs"
        role="group"
      >
        <span class="text-xs text-muted">Pairs</span>
        <span
          v-if="pairs.length === 0"
          class="text-xs text-muted"
          title="Pin a transition in the running order, or use “Followed by…” on a track."
        >
          none
        </span>
        <ul v-else class="contents">
          <li
            v-for="[from, to] in pairs"
            :key="`${from}>${to}`"
            class="flex max-w-full min-w-0 items-center rounded border border-rule bg-surface pl-1.5 text-xs"
          >
            <button
              type="button"
              class="max-w-[110px] truncate hover:text-accent"
              :title="`Show ${ui.titleOf(from)}`"
              @pointerenter="point(from)"
              @pointerleave="point(null)"
              @focus="point(from)"
              @blur="point(null)"
              @click="ui.reveal(from)"
            >
              {{ ui.titleOf(from) }}
            </button>
            <span class="px-1 text-muted" aria-hidden="true">→</span>
            <span class="sr-only"> is followed by </span>
            <button
              type="button"
              class="max-w-[110px] truncate hover:text-accent"
              :title="`Show ${ui.titleOf(to)}`"
              @pointerenter="point(to)"
              @pointerleave="point(null)"
              @focus="point(to)"
              @blur="point(null)"
              @click="ui.reveal(to)"
            >
              {{ ui.titleOf(to) }}
            </button>
            <button
              type="button"
              class="ml-0.5 flex size-5 items-center justify-center rounded text-muted hover:bg-band hover:text-ink"
              :aria-label="`Remove the pair ${ui.titleOf(from)} → ${ui.titleOf(to)}`"
              title="Remove this pair"
              @click="ws.removeFollow(from, to)"
            >
              <WsIcon name="close" :size="11" />
            </button>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>
