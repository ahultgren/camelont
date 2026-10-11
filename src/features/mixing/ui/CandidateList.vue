<script setup lang="ts">
import { keyColor, SparkLine } from '@/shared/ui'
import type { EvaluatedMix } from '../domain/evaluate'

/**
 * The alternative mixes side by side (U8): each with its cost, a tempo sparkline and
 * its moves by kind; the rest of its stats (BPM range, peaks, opener, closer) are in
 * its label and tooltip.
 */
defineProps<{ candidates: readonly EvaluatedMix[] }>()
const selected = defineModel<number>({ required: true })

const titleOf = (mix: EvaluatedMix, id: string | null) =>
  mix.order.find((track) => track.id === id)?.label ?? '–'
const range = (mix: EvaluatedMix) =>
  mix.stats.bpmRange ? `${String(mix.stats.bpmRange.min)}–${String(mix.stats.bpmRange.max)}` : '–'
const peaks = (mix: EvaluatedMix) =>
  mix.stats.peaks.map((peak) => `#${String(peak.index + 1)}`).join(', ') || 'none'

const TONES = [
  { tone: 'perfect', symbol: '=', word: 'perfect', color: 'text-ok' },
  { tone: 'boost', symbol: '+', word: 'boost', color: 'text-accent' },
  { tone: 'drop', symbol: '−', word: 'drop', color: 'text-muted' },
  { tone: 'mood', symbol: '~', word: 'mood', color: 'text-warn' },
] as const

const describe = (mix: EvaluatedMix, i: number) =>
  [
    `Mix ${String(i + 1)}`,
    `cost ${mix.totalCost.toFixed(1)}`,
    ...TONES.map(({ tone, word }) => `${String(mix.stats.toneCounts[tone])} ${word}`),
    `${range(mix)} BPM`,
    `peaks ${peaks(mix)}`,
    `opens with ${titleOf(mix, mix.stats.opener)}`,
    `closes with ${titleOf(mix, mix.stats.closer)}`,
  ].join(', ')
</script>

<template>
  <div role="radiogroup" aria-label="Alternative mixes" class="flex gap-1.5 overflow-x-auto p-px">
    <button
      v-for="(mix, i) in candidates"
      :key="i"
      type="button"
      role="radio"
      :aria-checked="selected === i"
      :aria-label="describe(mix, i)"
      :title="describe(mix, i)"
      class="grid min-w-[86px] flex-1 gap-0.5 rounded-md border px-1.5 pt-1 pb-1.5 text-left"
      :class="
        selected === i
          ? 'border-accent bg-surface ring-1 ring-accent'
          : 'border-rule bg-surface hover:border-accent'
      "
      @click="selected = i"
    >
      <span class="num flex items-baseline justify-between gap-1 text-[11px]" aria-hidden="true">
        <span class="font-medium" :class="selected === i ? 'text-accent' : 'text-muted'">{{
          i + 1
        }}</span>
        <span class="text-xs font-medium">{{ mix.totalCost.toFixed(1) }}</span>
      </span>
      <SparkLine
        :values="mix.order.map((t) => t.bpm)"
        :colors="mix.order.map((t) => keyColor(t.camelot))"
        :width="72"
        :height="22"
        :radius="1.6"
        :label="`Tempo of mix ${i + 1}, ${range(mix)} BPM`"
        class="h-auto w-full"
      />
      <span class="num flex justify-between text-[10px] leading-3" aria-hidden="true">
        <span v-for="t in TONES" :key="t.tone" :class="t.color"
          >{{ t.symbol }}{{ mix.stats.toneCounts[t.tone] }}</span
        >
      </span>
    </button>
  </div>
</template>
