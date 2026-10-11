<script setup lang="ts">
import { computed } from 'vue'
import { TempoArcChart, totalMinutes, type EntryInfo } from '@/features/mix-view'
import { useWorkspaceUi } from './context'
import { fixesFor } from './problem-fixes'

/**
 * Where the mix is shown (spec W1, W3, W9): its headline numbers and tempo chart, or,
 * in the same place, what stops it with a way out. The last result stays while a new
 * one is worked out.
 */
const { chartHeight = 190 } = defineProps<{ chartHeight?: number }>()

const ui = useWorkspaceUi()
const { ws } = ui

const info = computed(() => {
  const all = new Map<string, EntryInfo>()
  for (const track of ws.tracks.value.values()) {
    all.set(track.trackId, {
      title: track.title,
      artists: track.artists,
      durationMs: track.durationMs,
    })
  }
  return all
})

const mix = computed(() => (ws.view.value.kind === 'mix' ? ws.view.value.shown : null))
const problems = computed(() => (ws.view.value.kind === 'problems' ? ws.view.value.problems : []))

const range = computed(() => {
  const found = mix.value?.stats.bpmRange
  return found ? `${String(found.min)}–${String(found.max)}` : '–'
})
const minutes = computed(() =>
  totalMinutes((mix.value?.order ?? []).map((t) => info.value.get(t.id)?.durationMs ?? 0)),
)
const MOVES = [
  { tone: 'perfect', symbol: '=', word: 'perfect', color: 'text-ok' },
  { tone: 'boost', symbol: '+', word: 'boost', color: 'text-accent' },
  { tone: 'drop', symbol: '−', word: 'drop', color: 'text-muted' },
  { tone: 'mood', symbol: '~', word: 'mood', color: 'text-warn' },
] as const

const point = (trackId: string | null) => {
  ws.pointedTrackId.value = trackId
}
/** More tracks than the solver is quick with (spec §6). */
const SLOW_ABOVE = 100
</script>

<template>
  <section
    class="grid min-w-0 gap-1.5"
    aria-label="The mix"
    :aria-busy="ws.updating.value || ws.view.value.kind === 'opening'"
  >
    <template v-if="mix">
      <div class="flex flex-wrap items-baseline gap-x-3.5 gap-y-0.5" data-testid="headline">
        <dl class="num contents text-xs text-muted">
          <div class="flex items-baseline gap-1">
            <dd class="text-[15px] font-medium text-ink">{{ mix.order.length }}</dd>
            <dt>tracks</dt>
          </div>
          <div class="flex items-baseline gap-1">
            <dd class="text-[15px] font-medium text-ink">{{ minutes }}</dd>
            <dt>min</dt>
          </div>
          <div class="flex items-baseline gap-1">
            <dd class="text-[15px] font-medium text-ink">{{ range }}</dd>
            <dt>BPM</dt>
          </div>
          <div class="flex items-baseline gap-1.5">
            <dt class="sr-only">Moves</dt>
            <dd class="flex gap-1.5 text-[13px] font-medium">
              <span v-for="move in MOVES" :key="move.tone" :class="move.color" :title="move.word">
                <span aria-hidden="true">{{ move.symbol }}</span
                >{{ mix.stats.toneCounts[move.tone] }}<span class="sr-only"> {{ move.word }}</span>
              </span>
            </dd>
          </div>
          <div class="flex items-baseline gap-1">
            <dt>cost</dt>
            <dd class="text-[15px] font-medium text-ink">{{ mix.totalCost.toFixed(1) }}</dd>
          </div>
        </dl>
        <span
          v-if="ws.updating.value"
          role="status"
          class="ml-auto flex items-center gap-1.5 text-xs text-accent"
        >
          <span class="size-1.5 animate-pulse rounded-full bg-accent" aria-hidden="true" />
          Updating…
        </span>
      </div>
      <p v-if="mix.order.length > SLOW_ABOVE" class="text-xs text-muted">
        More than {{ SLOW_ABOVE }} tracks in the set: mixing may be slow.
      </p>
      <TempoArcChart
        :mix="mix"
        :info="info"
        :height="chartHeight"
        :highlighted="ws.pointedTrackId.value"
        data-testid="tempo-chart"
        @point="point"
        @select="ui.reveal"
      />
    </template>

    <!-- Problems stand where the mix would be, each with a way out (W9). -->
    <div
      v-else-if="problems.length"
      class="grid content-start gap-2 overflow-y-auto rounded-lg border border-warn bg-warn-bg p-3"
      :style="{
        minHeight: `${String(chartHeight + 26)}px`,
        maxHeight: `${String(chartHeight + 110)}px`,
      }"
      role="alert"
      data-testid="problems"
    >
      <div class="flex items-baseline gap-2">
        <h3 class="font-display text-[15px] font-bold">No mix yet</h3>
        <span v-if="ws.updating.value" class="text-xs text-muted" role="status">Updating…</span>
      </div>
      <ul class="grid gap-2.5 text-[13px] leading-snug">
        <li v-for="problem in problems" :key="problem.message" class="grid gap-1">
          <p>{{ problem.message }}</p>
          <div v-if="fixesFor(problem, ui).length" class="flex flex-wrap gap-1.5">
            <button
              v-for="fix in fixesFor(problem, ui)"
              :key="fix.label"
              type="button"
              class="rounded border border-rule bg-surface px-2 py-0.5 text-xs font-medium hover:border-accent hover:text-accent"
              @click="fix.run()"
            >
              {{ fix.label }}
            </button>
          </div>
        </li>
      </ul>
    </div>

    <div
      v-else
      class="grid place-items-center rounded-lg border border-dashed border-rule text-[13px] text-muted"
      :style="{ minHeight: `${String(chartHeight + 26)}px` }"
      role="status"
    >
      {{ ws.featuresLoading.value ? 'Looking up keys and tempos…' : 'Working out the mix…' }}
    </div>
  </section>
</template>
