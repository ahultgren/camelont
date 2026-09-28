<script setup lang="ts">
import { computed, ref } from 'vue'
import { MOVE_META, type EvaluatedMix } from '@/features/mixing'
import { keyName } from '@/shared/music'
import { KeyChip, keyColor, TONE_COLOR } from '@/shared/ui'
import {
  chartWidth,
  linearX,
  linearY,
  listedBpm,
  niceRange,
  type EntryInfo,
} from '../domain/layout'

/**
 * The primary view: set tempo per position (BPM with half/double time folded, as the
 * scoring sees it), dots coloured by key, the chart move on each
 * segment, the arc target when one is set, and a card on hover, tap or focus.
 */
const { mix, info } = defineProps<{ mix: EvaluatedMix; info: ReadonlyMap<string, EntryInfo> }>()

const HEIGHT = 300
const frame = computed(() => ({
  width: chartWidth(mix.order.length),
  height: HEIGHT,
  left: 40,
  right: 16,
  top: 34,
  bottom: 34,
}))
const axis = computed(() => {
  const range = mix.arc?.range
  const values = range ? [...mix.tempo, range.min, range.max] : mix.tempo
  return niceRange(Math.min(...values), Math.max(...values))
})
const x = computed(() => linearX(frame.value, mix.order.length))
const y = computed(() => linearY(frame.value, axis.value.min, axis.value.max))

const points = computed(() =>
  mix.order.map((track, i) => {
    const bpm = mix.tempo[i] ?? track.bpm
    return { track, i, bpm, listed: listedBpm(bpm, track.bpm), cx: x.value(i), cy: y.value(bpm) }
  }),
)

const badges = computed(() =>
  mix.transitions.map((t, j) => {
    const a = points.value[j]
    const b = points.value[j + 1]
    const meta = MOVE_META[t.move]
    const cx = ((a?.cx ?? 0) + (b?.cx ?? 0)) / 2
    const cy = Math.min(a?.cy ?? 0, b?.cy ?? 0) - 13
    return { meta, cx, cy, w: meta.symbol.length * 6.6 + 8, color: TONE_COLOR[meta.tone] }
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

const pointLabel = (i: number) => {
  const t = mix.order[i]
  const p = points.value[i]
  if (!t || !p) return ''
  const move = i > 0 ? mix.transitions[i - 1] : undefined
  const moveText = move
    ? `, ${MOVE_META[move.move].label} from ${mix.order[i - 1]?.camelot ?? ''}`
    : ''
  return `${String(i + 1)}. ${t.label}, ${t.camelot}, ${keyName(t.camelot)}, ${String(p.bpm)} BPM${p.listed ? ` ${p.listed}` : ''}${moveText}`
}

/** Card position as a share of the chart so it follows the responsive SVG. */
const cardStyle = computed(() => {
  const p = activePoint.value
  if (!p) return {}
  const left = (p.cx / frame.value.width) * 100
  const top = (p.cy / frame.value.height) * 100
  return {
    left: `clamp(4px, calc(${String(left)}% - 130px), calc(100% - 264px))`,
    top: top > 45 ? `calc(${String(top)}% - 12px)` : `calc(${String(top)}% + 16px)`,
    transform: top > 45 ? 'translateY(-100%)' : 'none',
  }
})
</script>

<template>
  <div class="relative overflow-x-auto">
    <div class="relative" :style="{ minWidth: `${String(Math.min(frame.width, 520))}px` }">
      <svg
        :viewBox="`0 0 ${String(frame.width)} ${String(HEIGHT)}`"
        class="block h-auto w-full"
        role="group"
        aria-label="Tempo arc: BPM per track, with the chart move between each pair"
        @pointerleave="active = null"
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
              :x="frame.left - 8"
              :y="y(v) + 4"
              text-anchor="end"
              class="num"
              font-size="11"
              fill="var(--muted)"
            >
              {{ v }}
            </text>
          </template>
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
              :y="b.cy - 9"
              :width="b.w"
              height="15"
              rx="4"
              fill="var(--surface)"
              :stroke="b.color"
            />
            <text
              :x="b.cx"
              :y="b.cy + 2.5"
              text-anchor="middle"
              font-size="11"
              font-weight="500"
              class="num"
              :fill="b.color"
            >
              {{ b.meta.symbol }}
            </text>
          </g>
          <template v-for="p in points" :key="p.track.id">
            <circle
              :cx="p.cx"
              :cy="p.cy"
              r="6"
              :fill="keyColor(p.track.camelot)"
              stroke="var(--surface)"
              stroke-width="2"
            />
            <text
              :x="p.cx"
              :y="HEIGHT - frame.bottom + 18"
              text-anchor="middle"
              font-size="10.5"
              class="num"
              fill="var(--muted)"
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
          r="13"
          fill="transparent"
          tabindex="0"
          role="img"
          class="cursor-pointer outline-none focus-visible:stroke-accent focus-visible:stroke-2"
          :aria-label="pointLabel(p.i)"
          @pointerenter="active = p.i"
          @focus="active = p.i"
          @blur="active = null"
          @click="active = p.i"
        />
      </svg>

      <div
        v-if="activePoint"
        class="pointer-events-none absolute z-10 grid w-[260px] gap-0.5 rounded-lg border border-rule bg-surface px-2.5 py-2 text-[13px] leading-snug shadow-lg"
        :style="cardStyle"
        data-testid="point-card"
      >
        <div class="font-semibold">{{ activePoint.i + 1 }}. {{ activePoint.track.label }}</div>
        <div class="text-muted">{{ info.get(activePoint.track.id)?.artists.join(', ') }}</div>
        <div class="flex flex-wrap items-center gap-1.5">
          <KeyChip :camelot="activePoint.track.camelot" size="sm" />
          <span class="num"
            >· {{ activePoint.bpm }} BPM
            <span v-if="activePoint.listed" class="text-muted">{{ activePoint.listed }}</span></span
          >
        </div>
        <div v-if="into" class="num text-xs" :style="{ color: TONE_COLOR[into.meta.tone] }">
          {{ into.meta.symbol }} {{ into.meta.label }} from {{ into.from.camelot }} ·
          {{ keyName(into.from.camelot) }}
        </div>
      </div>
    </div>
  </div>
  <div class="num mt-2 flex flex-wrap gap-x-3.5 gap-y-1 text-xs text-muted">
    <span class="text-ok">= perfect</span>
    <span class="text-accent">+ ++ +++ boost</span>
    <span>− −− −−− drop</span>
    <span class="text-warn">~ mood</span>
    <span v-if="mix.arc" class="text-accent">- - arc target</span>
    <span>Hover, tap or focus a dot for its key</span>
  </div>
</template>
