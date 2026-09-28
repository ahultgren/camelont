<script setup lang="ts">
import { computed } from 'vue'
import type { EvaluatedMix } from '@/features/mixing'
import { keyName } from '@/shared/music'
import { keyColor } from '@/shared/ui'
import { keyCounts, wheelCells } from '../domain/layout'

/** Keys used: outer ring major (B), inner ring minor (A), with counts (7B×5). */
const { mix } = defineProps<{ mix: EvaluatedMix }>()
const counts = computed(() => keyCounts(mix.order.map((t) => t.camelot)))
const cells = wheelCells()
const summary = computed(() =>
  [...counts.value].map(([k, c]) => `${k} ${keyName(k)} × ${String(c)}`).join(', '),
)
</script>

<template>
  <svg
    viewBox="0 0 220 220"
    class="mx-auto block w-full max-w-[230px]"
    role="img"
    :aria-label="`Keys used: ${summary}`"
  >
    <g v-for="cell in cells" :key="cell.key">
      <path :d="cell.path" :fill="counts.get(cell.key) ? keyColor(cell.key) : 'var(--band)'">
        <title>
          {{ cell.key }} · {{ keyName(cell.key)
          }}{{ counts.get(cell.key) ? ` · ${String(counts.get(cell.key))} tracks` : '' }}
        </title>
      </path>
      <text
        :x="cell.labelX"
        :y="cell.labelY + 3.5"
        text-anchor="middle"
        class="num"
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
