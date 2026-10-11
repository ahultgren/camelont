<script setup lang="ts">
import { computed } from 'vue'

/** A small line of values with optional per-point colours (e.g. BPM coloured by key). */
const {
  values,
  colors = [],
  width = 200,
  height = 44,
  radius = 3,
  label,
} = defineProps<{
  values: readonly number[]
  colors?: readonly string[]
  width?: number
  height?: number
  /** Dot size; small for a line of many points. */
  radius?: number
  label: string
}>()

const PAD = computed(() => radius + 1)
const points = computed(() => {
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const pad = PAD.value
  const step = values.length > 1 ? (width - 2 * pad) / (values.length - 1) : 0
  return values.map((v, i) => ({
    x: pad + i * step,
    y: pad + ((max - v) / span) * (height - 2 * pad),
    color: colors[i] ?? 'var(--muted)',
  }))
})
</script>

<template>
  <svg
    :viewBox="`0 0 ${width} ${height}`"
    :width="width"
    :height="height"
    role="img"
    :aria-label="label"
  >
    <polyline
      fill="none"
      stroke="var(--muted)"
      :stroke-width="radius < 2.5 ? 1 : 1.5"
      stroke-linejoin="round"
      :points="points.map((p) => `${p.x},${p.y}`).join(' ')"
    />
    <circle
      v-for="(p, i) in points"
      :key="i"
      :cx="p.x"
      :cy="p.y"
      :r="radius"
      :fill="p.color"
      stroke="var(--surface)"
      :stroke-width="radius < 2.5 ? 0.5 : 1.5"
    />
  </svg>
</template>
