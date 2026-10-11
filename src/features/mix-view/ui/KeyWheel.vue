<script setup lang="ts">
import { computed } from 'vue'
import type { EvaluatedMix } from '@/features/mixing'
import { keyName } from '@/shared/music'
import { keyColor } from '@/shared/ui'
import { keyCounts, wheelCells } from '../domain/layout'

/** Keys used: outer ring major (B), inner ring minor (A), with counts (7B×5). */
const { mix, highlighted = null } = defineProps<{
  mix: EvaluatedMix
  /** A track pointed at in another view: its key is marked. */
  highlighted?: string | null
}>()
const emit = defineEmits<{
  /** The first track in the key under the pointer or with focus; null when it leaves. */
  point: [trackId: string | null]
}>()

const counts = computed(() => keyCounts(mix.order.map((t) => t.camelot)))
const cells = wheelCells()
const summary = computed(() =>
  [...counts.value].map(([k, c]) => `${k} ${keyName(k)} × ${String(c)}`).join(', '),
)
const firstIn = computed(() => {
  const first = new Map<string, string>()
  for (const track of mix.order) if (!first.has(track.camelot)) first.set(track.camelot, track.id)
  return first
})
const highlightedKey = computed(
  () => mix.order.find((track) => track.id === highlighted)?.camelot ?? null,
)
const label = (key: (typeof cells)[number]['key']) => {
  const count = counts.value.get(key) ?? 0
  return `${key} · ${keyName(key)}${count ? ` · ${String(count)} ${count === 1 ? 'track' : 'tracks'}` : ''}`
}
</script>

<template>
  <svg
    viewBox="0 0 220 220"
    class="mx-auto block h-auto w-full max-w-[230px]"
    role="group"
    :aria-label="`Keys used: ${summary}`"
  >
    <g v-for="cell in cells" :key="cell.key">
      <path
        :d="cell.path"
        :fill="counts.get(cell.key) ? keyColor(cell.key) : 'var(--band)'"
        :stroke="cell.key === highlightedKey ? 'var(--ink)' : 'none'"
        stroke-width="2.5"
        :tabindex="counts.get(cell.key) ? 0 : undefined"
        :role="counts.get(cell.key) ? 'img' : undefined"
        :aria-label="counts.get(cell.key) ? label(cell.key) : undefined"
        :data-highlighted="cell.key === highlightedKey ? '' : undefined"
        class="outline-none focus-visible:stroke-accent focus-visible:stroke-[2.5]"
        @pointerenter="emit('point', firstIn.get(cell.key) ?? null)"
        @pointerleave="emit('point', null)"
        @focus="emit('point', firstIn.get(cell.key) ?? null)"
        @blur="emit('point', null)"
      >
        <title>{{ label(cell.key) }}</title>
      </path>
      <text
        :x="cell.labelX"
        :y="cell.labelY + 3.5"
        text-anchor="middle"
        class="num pointer-events-none"
        :font-size="counts.get(cell.key) ? 10.5 : 9"
        :font-weight="counts.get(cell.key) ? 600 : 400"
        :fill="counts.get(cell.key) ? 'var(--chip-ink)' : 'var(--muted)'"
        aria-hidden="true"
      >
        {{
          (counts.get(cell.key) ?? 0) > 1 ? `${cell.key}×${String(counts.get(cell.key))}` : cell.key
        }}
      </text>
    </g>
  </svg>
</template>
