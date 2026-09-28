<script setup lang="ts">
import { keyColor, MoveBadge, SparkLine } from '@/shared/ui'
import { formatKey } from '@/shared/music'
import type { EvaluatedMix } from '../domain/evaluate'

/** The alternative mixes side by side, each with a tempo sparkline and stats (U8). */
defineProps<{ candidates: readonly EvaluatedMix[] }>()
const selected = defineModel<number>({ required: true })

const trackLabel = (mix: EvaluatedMix, id: string | null) => {
  const i = mix.order.findIndex((x) => x.id === id)
  const t = mix.order[i]
  return t ? `${t.label} (${formatKey(t.camelot)}, ${String(mix.tempo[i] ?? t.bpm)})` : '–'
}
const range = (mix: EvaluatedMix) =>
  mix.stats.bpmRange ? `${String(mix.stats.bpmRange.min)}–${String(mix.stats.bpmRange.max)}` : '–'
</script>

<template>
  <div
    role="radiogroup"
    aria-label="Alternative mixes"
    class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
  >
    <button
      v-for="(mix, i) in candidates"
      :key="i"
      type="button"
      role="radio"
      :aria-checked="selected === i"
      class="grid min-w-0 gap-2 rounded-[10px] border bg-surface p-4 text-left"
      :class="
        selected === i ? 'border-accent ring-1 ring-accent' : 'border-rule hover:border-accent'
      "
      @click="selected = i"
    >
      <span class="flex items-baseline justify-between gap-2">
        <span class="font-display text-base font-bold">Mix {{ i + 1 }}</span>
        <span class="num text-[13px] text-muted">cost {{ mix.totalCost.toFixed(1) }}</span>
      </span>
      <SparkLine
        :values="mix.tempo"
        :colors="mix.order.map((t) => keyColor(t.camelot))"
        :width="240"
        :label="`Tempo of mix ${i + 1}, ${range(mix)} BPM`"
      />
      <span class="flex flex-wrap gap-1.5 text-xs">
        <span class="inline-flex items-center gap-1"
          ><MoveBadge symbol="=" tone="perfect" label="perfect" /><span class="num">{{
            mix.stats.toneCounts.perfect
          }}</span></span
        >
        <span class="inline-flex items-center gap-1"
          ><MoveBadge symbol="+" tone="boost" label="boost" /><span class="num">{{
            mix.stats.toneCounts.boost
          }}</span></span
        >
        <span class="inline-flex items-center gap-1"
          ><MoveBadge symbol="−" tone="drop" label="drop" /><span class="num">{{
            mix.stats.toneCounts.drop
          }}</span></span
        >
        <span class="inline-flex items-center gap-1"
          ><MoveBadge symbol="~" tone="mood" label="mood" /><span class="num">{{
            mix.stats.toneCounts.mood
          }}</span></span
        >
      </span>
      <dl class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 text-[13px]">
        <dt class="text-muted">BPM</dt>
        <dd class="num">{{ range(mix) }}</dd>
        <dt class="text-muted">Peaks</dt>
        <dd class="num">
          {{ mix.stats.peaks.map((p) => `#${String(p.index + 1)}`).join(', ') || 'none' }}
        </dd>
        <dt class="text-muted">Opens</dt>
        <dd class="truncate">{{ trackLabel(mix, mix.stats.opener) }}</dd>
        <dt class="text-muted">Closes</dt>
        <dd class="truncate">{{ trackLabel(mix, mix.stats.closer) }}</dd>
      </dl>
    </button>
  </div>
</template>
