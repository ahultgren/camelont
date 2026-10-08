<script setup lang="ts">
import { MOVE_META, type EvaluatedMix } from '@/features/mixing'
import { KeyChip, TONE_TEXT } from '@/shared/ui'
import { formatDuration } from '@/shared/lib'
import { formatBpmDelta, type EntryInfo } from '../domain/layout'

/** Track cards with a connector between each pair: keys, move, BPM change. */
const { mix, info } = defineProps<{ mix: EvaluatedMix; info: ReadonlyMap<string, EntryInfo> }>()
</script>

<template>
  <ol class="grid list-none">
    <template v-for="(track, i) in mix.order" :key="track.id">
      <li
        v-if="i > 0 && mix.transitions[i - 1]"
        class="num flex items-center gap-2 py-1 pl-[27px] text-xs before:mr-1.5 before:h-[18px] before:w-px before:bg-rule"
        :class="TONE_TEXT[MOVE_META[mix.transitions[i - 1]?.move ?? 'clash'].tone]"
      >
        {{ mix.order[i - 1]?.camelot }} → {{ track.camelot }} ·
        {{ MOVE_META[mix.transitions[i - 1]?.move ?? 'clash'].label }}
        <span class="text-muted">{{
          formatBpmDelta(track.bpm - (mix.order[i - 1]?.bpm ?? track.bpm))
        }}</span>
      </li>
      <li
        class="grid grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-x-3.5 gap-y-1 rounded-lg border border-rule bg-surface px-3.5 py-2.5 sm:grid-cols-[28px_minmax(0,1fr)_auto_auto]"
      >
        <span class="num text-[13px] text-muted">{{ i + 1 }}</span>
        <div class="min-w-0">
          <div class="truncate font-semibold">{{ track.label }}</div>
          <div class="truncate text-[13px] text-muted">
            {{ info.get(track.id)?.artists.join(', ') }}
            <template v-if="info.get(track.id)">
              · <span class="num">{{ formatDuration(info.get(track.id)?.durationMs ?? 0) }}</span>
            </template>
          </div>
        </div>
        <KeyChip :camelot="track.camelot" size="sm" />
        <span class="num col-start-2 text-sm sm:col-start-auto sm:min-w-[62px] sm:text-right">
          {{ track.bpm }} <small class="text-[11px] text-muted">BPM</small>
        </span>
      </li>
    </template>
  </ol>
</template>
