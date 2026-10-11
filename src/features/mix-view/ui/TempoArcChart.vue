<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef } from 'vue'
import { MOVE_META, type EvaluatedMix } from '@/features/mixing'
import { describeEnergy, keyName } from '@/shared/music'
import { EnergyChip, KeyChip, keyColor, TONE_COLOR } from '@/shared/ui'
import { chartWidth, linearX, linearY, niceRange, type EntryInfo } from '../domain/layout'

/**
 * The primary view: BPM per position, dots coloured by key, the chart move on each
 * segment, the arc target when one is set, and a card on hover, tap or focus. It is
 * drawn at its real size, as wide as its box, and scrolls sideways once the tracks
 * no longer fit.
 */
const {
  mix,
  info,
  highlighted = null,
  height = 190,
} = defineProps<{
  mix: EvaluatedMix
  info: ReadonlyMap<string, EntryInfo>
  /** A track pointed at in another view. */
  highlighted?: string | null
  height?: number
}>()
const emit = defineEmits<{
  /** The track under the pointer or with focus; null when it leaves. */
  point: [trackId: string | null]
  select: [trackId: string]
}>()

// The chart fills its box: the box's width is measured, not assumed.
const box = useTemplateRef<HTMLElement>('box')
const boxWidth = ref(480)
let observer: ResizeObserver | null = null
onMounted(() => {
  const el = box.value
  if (!el) return
  if (el.clientWidth > 0) boxWidth.value = el.clientWidth
  if (typeof ResizeObserver === 'undefined') return
  observer = new ResizeObserver(() => {
    if (el.clientWidth > 0) boxWidth.value = el.clientWidth
  })
  observer.observe(el)
})
onBeforeUnmount(() => observer?.disconnect())

const frame = computed(() => ({
  width: chartWidth(mix.order.length, boxWidth.value),
  height,
  left: 34,
  right: 14,
  top: 28,
  bottom: 22,
}))
const axis = computed(() => {
  const bpms = mix.order.map((t) => t.bpm)
  return niceRange(Math.min(...bpms), Math.max(...bpms))
})
const x = computed(() => linearX(frame.value, mix.order.length))
const y = computed(() => linearY(frame.value, axis.value.min, axis.value.max))

const points = computed(() =>
  mix.order.map((track, i) => ({ track, i, cx: x.value(i), cy: y.value(track.bpm) })),
)

const badges = computed(() =>
  mix.transitions.map((t, j) => {
    const a = points.value[j]
    const b = points.value[j + 1]
    const meta = MOVE_META[t.move]
    const cx = ((a?.cx ?? 0) + (b?.cx ?? 0)) / 2
    const cy = Math.min(a?.cy ?? 0, b?.cy ?? 0) - 12
    return { meta, cx, cy, w: meta.symbol.length * 5.6 + 6, color: TONE_COLOR[meta.tone] }
  }),
)

const arcLine = computed(() => {
  const arc = mix.arc
  if (!arc) return null
  const { min, max } = arc.range
  return arc.target
    .map((t, i) => `${String(x.value(i))},${String(y.value(min + t * (max - min)))}`)
    .join(' ')
})

const active = ref<number | null>(null)
const activePoint = computed(() => (active.value === null ? null : points.value[active.value]))
const into = computed(() => {
  const i = active.value
  if (i === null || i === 0) return null
  const t = mix.transitions[i - 1]
  const from = mix.order[i - 1]
  return t && from ? { meta: MOVE_META[t.move], from } : null
})
const pointedOut = computed(() =>
  highlighted === null ? null : (points.value.find((p) => p.track.id === highlighted) ?? null),
)

function enter(i: number) {
  active.value = i
  emit('point', mix.order[i]?.id ?? null)
}
function leave() {
  active.value = null
  emit('point', null)
}

const pointLabel = (i: number) => {
  const t = mix.order[i]
  if (!t) return ''
  const move = i > 0 ? mix.transitions[i - 1] : undefined
  const moveText = move
    ? `, ${MOVE_META[move.move].label} from ${mix.order[i - 1]?.camelot ?? ''}`
    : ''
  const energyText = t.energy === null ? '' : `, ${describeEnergy(t.energy).toLowerCase()}`
  return `${String(i + 1)}. ${t.label}, ${t.camelot}, ${keyName(t.camelot)}, ${String(t.bpm)} BPM${energyText}${moveText}`
}

/** Every position is numbered while they fit; then every fifth, and the first and last. */
const numbered = (i: number) => {
  const count = mix.order.length
  const step = (frame.value.width - frame.value.left - frame.value.right) / Math.max(1, count - 1)
  return step >= 17 || i === 0 || i === count - 1 || (i + 1) % 5 === 0
}

/** Card position as a share of the chart so it follows the SVG. */
const cardStyle = computed(() => {
  const p = activePoint.value
  if (!p) return {}
  const top = (p.cy / frame.value.height) * 100
  return {
    left: `clamp(4px, ${String(p.cx - 120)}px, calc(100% - 244px))`,
    top: top > 50 ? `${String(p.cy - 12)}px` : `${String(p.cy + 14)}px`,
    transform: top > 50 ? 'translateY(-100%)' : 'none',
  }
})
</script>

<template>
  <div ref="box" class="relative overflow-x-auto overflow-y-hidden">
    <div class="relative" :style="{ width: `${String(frame.width)}px` }">
      <svg
        :viewBox="`0 0 ${String(frame.width)} ${String(height)}`"
        :width="frame.width"
        :height="height"
        class="block"
        role="group"
        aria-label="Tempo arc: BPM per track, with the chart move between each pair"
        @pointerleave="leave"
      >
        <g aria-hidden="true">
          <template v-for="v in axis.ticks" :key="v">
            <line
              :x1="frame.left"
              :x2="frame.width - frame.right"
              :y1="y(v)"
              :y2="y(v)"
              stroke="var(--rule)"
            />
            <text
              :x="frame.left - 7"
              :y="y(v) + 3.5"
              text-anchor="end"
              class="num"
              font-size="10"
              fill="var(--muted)"
            >
              {{ v }}
            </text>
          </template>
          <line
            v-if="pointedOut"
            :x1="pointedOut.cx"
            :x2="pointedOut.cx"
            :y1="frame.top - 8"
            :y2="height - frame.bottom + 4"
            stroke="var(--accent)"
            stroke-width="1"
            opacity="0.45"
            data-testid="chart-guide"
          />
          <polyline
            v-if="arcLine"
            :points="arcLine"
            fill="none"
            stroke="var(--accent)"
            stroke-width="1.5"
            stroke-dasharray="4 4"
            opacity="0.7"
          />
          <polyline
            fill="none"
            stroke="var(--muted)"
            stroke-width="1.5"
            stroke-linejoin="round"
            :points="points.map((p) => `${String(p.cx)},${String(p.cy)}`).join(' ')"
          />
          <g v-for="(b, j) in badges" :key="j">
            <rect
              :x="b.cx - b.w / 2"
              :y="b.cy - 8"
              :width="b.w"
              height="13"
              rx="3.5"
              fill="var(--surface)"
              :stroke="b.color"
            />
            <text
              :x="b.cx"
              :y="b.cy + 2"
              text-anchor="middle"
              font-size="9.5"
              font-weight="500"
              class="num"
              :fill="b.color"
            >
              {{ b.meta.symbol }}
            </text>
          </g>
          <template v-for="p in points" :key="p.track.id">
            <circle
              v-if="p.track.id === highlighted"
              :cx="p.cx"
              :cy="p.cy"
              r="9.5"
              fill="var(--surface)"
              stroke="var(--accent)"
              stroke-width="2"
            />
            <circle
              :cx="p.cx"
              :cy="p.cy"
              r="5.5"
              :fill="keyColor(p.track.camelot)"
              stroke="var(--surface)"
              stroke-width="1.5"
            />
            <text
              v-if="numbered(p.i)"
              :x="p.cx"
              :y="height - 6"
              text-anchor="middle"
              font-size="9.5"
              class="num"
              :font-weight="p.track.id === highlighted ? 600 : 400"
              :fill="p.track.id === highlighted ? 'var(--accent)' : 'var(--muted)'"
            >
              {{ p.i + 1 }}
            </text>
          </template>
        </g>
        <circle
          v-for="p in points"
          :key="`hit-${p.track.id}`"
          :cx="p.cx"
          :cy="p.cy"
          r="10"
          fill="transparent"
          tabindex="0"
          role="img"
          class="cursor-pointer outline-none focus-visible:stroke-accent focus-visible:stroke-2"
          :aria-label="pointLabel(p.i)"
          :data-highlighted="p.track.id === highlighted ? '' : undefined"
          @pointerenter="enter(p.i)"
          @focus="enter(p.i)"
          @blur="leave"
          @click="emit('select', p.track.id)"
        />
      </svg>

      <div
        v-if="activePoint"
        class="pointer-events-none absolute z-10 grid w-[240px] gap-0.5 rounded-lg border border-rule bg-surface px-2.5 py-2 text-[13px] leading-snug shadow-lg"
        :style="cardStyle"
        data-testid="point-card"
      >
        <div class="font-semibold">{{ activePoint.i + 1 }}. {{ activePoint.track.label }}</div>
        <div class="text-muted">{{ info.get(activePoint.track.id)?.artists.join(', ') }}</div>
        <div class="flex flex-wrap items-center gap-1.5">
          <KeyChip :camelot="activePoint.track.camelot" size="sm" />
          <span class="num">· {{ activePoint.track.bpm }} BPM</span>
          <span class="num" aria-hidden="true">· energy</span>
          <EnergyChip :energy="activePoint.track.energy" />
        </div>
        <div v-if="into" class="num text-xs" :style="{ color: TONE_COLOR[into.meta.tone] }">
          {{ into.meta.symbol }} {{ into.meta.label }} from {{ into.from.camelot }}
        </div>
      </div>
    </div>
  </div>
</template>
