<script setup lang="ts" generic="Row extends TrackRow">
import { computed, shallowRef } from 'vue'
import { AppButton, KeyChip } from '@/shared/ui'
import { isMixable, type TrackFeatures } from '../domain/features'
import OverrideDialog from './OverrideDialog.vue'
import SourceBadge from './SourceBadge.vue'
import type { TrackRow } from './track-row'

/** Every track with its key (both notations), BPM and where each value came from. */
const { rows, features } = defineProps<{
  rows: readonly Row[]
  features: ReadonlyMap<string, TrackFeatures>
}>()

defineSlots<{ actions?: (props: { row: Row; mixable: boolean }) => unknown }>()

const editing = shallowRef<Row | null>(null)
function edit(row: Row) {
  editing.value = row
}
const dialogOpen = computed({
  get: () => editing.value !== null,
  set: (open: boolean) => {
    if (!open) editing.value = null
  },
})
</script>

<template>
  <ol class="grid gap-1.5">
    <li
      v-for="(row, i) in rows"
      :key="row.entryId"
      class="grid grid-cols-[28px_1fr_auto] items-center gap-x-3.5 gap-y-1 rounded-lg border bg-surface px-3.5 py-2.5 sm:grid-cols-[28px_1fr_auto_auto_auto]"
      :class="isMixable(features.get(row.trackId)) ? 'border-rule' : 'border-warn'"
    >
      <span class="num text-[13px] text-muted">{{ i + 1 }}</span>
      <div class="min-w-0">
        <div class="truncate font-semibold">{{ row.title }}</div>
        <div class="truncate text-[13px] text-muted">{{ row.artists.join(', ') }}</div>
        <div v-if="features.get(row.trackId)?.note" class="text-xs text-muted italic">
          {{ features.get(row.trackId)?.note }}
        </div>
      </div>
      <div class="col-start-2 flex items-center gap-1.5 sm:col-start-auto">
        <KeyChip :camelot="features.get(row.trackId)?.camelot?.value ?? null" size="sm" />
        <SourceBadge
          v-if="features.get(row.trackId)?.camelot"
          :source="features.get(row.trackId)?.camelot?.source ?? 'reccobeats'"
        />
      </div>
      <div class="col-start-2 flex items-center gap-1.5 sm:col-start-auto">
        <span
          class="num min-w-[70px] text-right text-sm"
          :class="features.get(row.trackId)?.bpm ? '' : 'text-warn'"
        >
          {{ features.get(row.trackId)?.bpm?.value ?? '?' }} <small class="text-muted">BPM</small>
        </span>
        <SourceBadge
          v-if="features.get(row.trackId)?.bpm"
          :source="features.get(row.trackId)?.bpm?.source ?? 'reccobeats'"
        />
      </div>
      <div
        class="col-start-3 row-start-1 flex items-center gap-2 sm:col-start-auto sm:row-start-auto"
      >
        <slot name="actions" :row="row" :mixable="isMixable(features.get(row.trackId))" />
        <AppButton
          :variant="isMixable(features.get(row.trackId)) ? 'ghost' : 'primary'"
          :aria-label="`${isMixable(features.get(row.trackId)) ? 'Edit' : 'Fix'} key and BPM of ${row.title}`"
          @click="edit(row)"
        >
          {{ isMixable(features.get(row.trackId)) ? 'Edit' : 'Fix' }}
        </AppButton>
      </div>
    </li>
  </ol>
  <OverrideDialog
    v-if="editing"
    v-model:open="dialogOpen"
    :track-id="editing.trackId"
    :label="editing.title"
    :features="features.get(editing.trackId)"
  />
</template>
