<script setup lang="ts">
import { computed, ref, useTemplateRef, watch } from 'vue'
import {
  binInRange,
  bpmHistogram,
  rangeOnScale,
  scaleToRange,
  type BpmHistogram,
} from '../../domain/bpm-histogram'

/**
 * A playlist's BPM range, set on its own BPM distribution (spec W8): the bars a range
 * leaves out are faded as the handles move. Either end can be left open: an empty
 * field, or a handle at the end of the scale.
 */
const { bpms, min, max, name } = defineProps<{
  /** The saved BPM of every track of the playlist that has one. */
  bpms: readonly number[]
  min: number | null
  max: number | null
  /** The playlist's name, for labels. */
  name: string
}>()
const emit = defineEmits<{ change: [range: { min: number | null; max: number | null }] }>()

const W = 148
const H = 26
const PAD = 5

const histogram = computed(() => bpmHistogram(bpms))
const onScale = computed(() =>
  histogram.value ? rangeOnScale(histogram.value, { min, max }) : null,
)
const x = (scale: BpmHistogram, bpm: number) =>
  PAD + ((bpm - scale.min) / (scale.max - scale.min)) * (W - 2 * PAD)

const bars = computed(() => {
  const scale = histogram.value
  if (!scale) return []
  const width = (W - 2 * PAD) / scale.bins.length
  return scale.bins.map((count, index) => {
    const height = count === 0 ? 0 : Math.max(2, (count / scale.peak) * (H - 6))
    return {
      x: PAD + index * width + 1,
      y: H - 3 - height,
      width: Math.max(1, width - 2),
      height,
      inside: binInRange(scale, index, { min, max }),
    }
  })
})

type End = 'min' | 'max'
const valueOf = (end: End) => (end === 'min' ? min : max)

/** Sets one end, never past the other; null leaves it open. */
function setEnd(end: End, value: number | null) {
  const other = end === 'min' ? max : min
  let next = value
  if (next !== null && other !== null)
    next = end === 'min' ? Math.min(next, other) : Math.max(next, other)
  if (next === valueOf(end)) return
  emit('change', end === 'min' ? { min: next, max } : { min, max: next })
}

function setOnScale(end: End, value: number) {
  const scale = histogram.value
  if (scale) setEnd(end, scaleToRange(scale, end, value))
}

// ── Fields ─────────────────────────────────────────────────────────────────────────
// A field shows the stored end and commits on Enter or when it is left, so typing "85"
// doesn't first cut the playlist at 8.
const text = ref({ min: '', max: '' })
watch(
  () => [min, max] as const,
  ([lo, hi]) => {
    text.value = { min: lo === null ? '' : String(lo), max: hi === null ? '' : String(hi) }
  },
  { immediate: true },
)
function commit(end: End) {
  const raw = text.value[end].trim()
  const value = raw === '' ? null : Number(raw)
  if (value !== null && !Number.isFinite(value)) {
    text.value = { ...text.value, [end]: valueOf(end) === null ? '' : String(valueOf(end)) }
    return
  }
  setEnd(end, value)
}

// ── Handles ────────────────────────────────────────────────────────────────────────
const svg = useTemplateRef<SVGSVGElement>('svg')
const dragging = ref<End | null>(null)

function bpmAt(clientX: number): number | null {
  const scale = histogram.value
  const box = svg.value?.getBoundingClientRect()
  if (!scale || !box || box.width === 0) return null
  const inner = ((clientX - box.left) / box.width) * W
  const share = Math.min(1, Math.max(0, (inner - PAD) / (W - 2 * PAD)))
  return scale.min + share * (scale.max - scale.min)
}
function startDrag(event: PointerEvent, end?: End) {
  const bpm = bpmAt(event.clientX)
  const at = onScale.value
  if (bpm === null || !at) return
  // A press on the bars takes the nearer handle.
  dragging.value = end ?? (Math.abs(bpm - at.min) <= Math.abs(bpm - at.max) ? 'min' : 'max')
  ;(event.currentTarget as Element).setPointerCapture(event.pointerId)
  setOnScale(dragging.value, bpm)
  event.preventDefault()
}
function drag(event: PointerEvent) {
  if (dragging.value === null) return
  const bpm = bpmAt(event.clientX)
  if (bpm !== null) setOnScale(dragging.value, bpm)
}

function onKey(event: KeyboardEvent, end: End) {
  const scale = histogram.value
  const at = onScale.value
  if (!scale || !at) return
  const here = at[end]
  const moves: Record<string, number> = {
    ArrowLeft: here - 1,
    ArrowDown: here - 1,
    ArrowRight: here + 1,
    ArrowUp: here + 1,
    PageDown: here - scale.step,
    PageUp: here + scale.step,
    // Its own end of the scale: open.
    Home: end === 'min' ? scale.min : at.min,
    End: end === 'max' ? scale.max : at.max,
  }
  const next = moves[event.key]
  if (next === undefined) return
  event.preventDefault()
  setOnScale(end, next)
}

const HANDLES = [
  { end: 'min', label: 'Lowest BPM' },
  { end: 'max', label: 'Highest BPM' },
] as const
const valueText = (end: End) => {
  const value = valueOf(end)
  return value === null ? 'open' : `${String(value)} BPM`
}
const summary = computed(() => {
  if (min === null && max === null) return 'Any BPM'
  if (min === null) return `Up to ${String(max)} BPM`
  if (max === null) return `From ${String(min)} BPM`
  return `${String(min)}–${String(max)} BPM`
})
const fieldClass =
  'num h-6 w-11 rounded border border-rule bg-surface px-1 text-center text-xs placeholder:text-muted/70 focus:border-accent'
</script>

<template>
  <div
    class="flex items-center gap-1"
    role="group"
    :aria-label="`BPM range of ${name}`"
    :title="summary"
  >
    <input
      v-model="text.min"
      type="text"
      inputmode="decimal"
      :class="fieldClass"
      placeholder="min"
      :aria-label="`Lowest BPM of ${name}`"
      @change="commit('min')"
      @keydown.enter="commit('min')"
    />
    <svg
      v-if="histogram && onScale"
      ref="svg"
      :viewBox="`0 0 ${W} ${H}`"
      :width="W"
      :height="H"
      class="shrink-0 touch-none"
      @pointerdown="startDrag($event)"
      @pointermove="drag"
      @pointerup="dragging = null"
      @pointercancel="dragging = null"
    >
      <line :x1="PAD" :x2="W - PAD" :y1="H - 2.5" :y2="H - 2.5" stroke="var(--rule)" />
      <rect
        v-for="(bar, i) in bars"
        :key="i"
        :x="bar.x"
        :y="bar.y"
        :width="bar.width"
        :height="bar.height"
        rx="1"
        :fill="bar.inside ? 'var(--accent)' : 'var(--muted)'"
        :opacity="bar.inside ? 0.7 : 0.28"
        :data-inside="bar.inside ? '' : undefined"
      />
      <line
        :x1="x(histogram, onScale.min)"
        :x2="x(histogram, onScale.max)"
        :y1="H - 2.5"
        :y2="H - 2.5"
        stroke="var(--accent)"
        stroke-width="2"
      />
      <g
        v-for="handle in HANDLES"
        :key="handle.end"
        role="slider"
        tabindex="0"
        class="cursor-ew-resize outline-none"
        :aria-label="`${handle.label} of ${name}`"
        :aria-valuemin="histogram.min"
        :aria-valuemax="histogram.max"
        :aria-valuenow="onScale[handle.end]"
        :aria-valuetext="valueText(handle.end)"
        @keydown="onKey($event, handle.end)"
        @pointerdown.stop="startDrag($event, handle.end)"
        @pointermove="drag"
        @pointerup="dragging = null"
        @pointercancel="dragging = null"
      >
        <!-- A wide, clear target around a slim handle. -->
        <rect
          :x="x(histogram, onScale[handle.end]) - 6"
          y="0"
          width="12"
          :height="H"
          fill="transparent"
        />
        <rect
          :x="x(histogram, onScale[handle.end]) - 1.5"
          y="1"
          width="3"
          :height="H - 2"
          rx="1.5"
          class="handle"
          :fill="valueOf(handle.end) === null ? 'var(--muted)' : 'var(--accent)'"
        />
      </g>
    </svg>
    <input
      v-model="text.max"
      type="text"
      inputmode="decimal"
      :class="fieldClass"
      placeholder="max"
      :aria-label="`Highest BPM of ${name}`"
      @change="commit('max')"
      @keydown.enter="commit('max')"
    />
  </div>
</template>

<style scoped>
g:focus-visible .handle {
  stroke: var(--ink);
  stroke-width: 1.5;
}
</style>
