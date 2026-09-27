<script setup lang="ts">
import { computed } from 'vue'
import type { EvaluatedMix } from '@/features/mixing'
import { AppCard, StatTile } from '@/shared/ui'
import { totalMinutes, type EntryInfo } from '../domain/layout'
import KeyWheel from './KeyWheel.vue'
import RunningOrder from './RunningOrder.vue'
import TempoArcChart from './TempoArcChart.vue'

/** One mix, explored: tempo arc, keys used and the running order (U9). */
const { mix, info } = defineProps<{ mix: EvaluatedMix; info: ReadonlyMap<string, EntryInfo> }>()

const minutes = computed(() => totalMinutes(mix.order.map((t) => info.get(t.id)?.durationMs ?? 0)))
const range = computed(() =>
  mix.stats.bpmRange ? `${String(mix.stats.bpmRange.min)}–${String(mix.stats.bpmRange.max)}` : '–',
)
const keys = computed(() => new Set(mix.order.map((t) => t.camelot)).size)
</script>

<template>
  <div class="grid grid-cols-1 gap-5">
    <div class="flex flex-wrap gap-x-7 gap-y-2">
      <StatTile :value="mix.order.length" label="tracks" />
      <StatTile :value="minutes" label="min" />
      <StatTile :value="range" label="BPM" />
      <StatTile :value="keys" label="keys" />
    </div>
    <div class="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_250px]">
      <AppCard class="min-w-0">
        <h3 class="text-[19px] font-bold">Tempo arc</h3>
        <p class="mb-2.5 text-[13px] text-muted">
          BPM per track, dots coloured by key, with the chart move between each pair.
        </p>
        <TempoArcChart :mix="mix" :info="info" />
      </AppCard>
      <AppCard>
        <h3 class="text-[19px] font-bold">Keys used</h3>
        <p class="mb-2.5 text-[13px] text-muted">Outer ring major (B), inner ring minor (A).</p>
        <KeyWheel :mix="mix" />
      </AppCard>
    </div>
    <section aria-labelledby="running-order-heading" class="grid gap-2">
      <h3 id="running-order-heading" class="text-[19px] font-bold">Running order</h3>
      <RunningOrder :mix="mix" :info="info" />
    </section>
  </div>
</template>
