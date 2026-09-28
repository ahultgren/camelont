<script setup lang="ts">
import { computed, ref } from 'vue'
import { formatKey } from '@/shared/music'
import { AppButton } from '@/shared/ui'
import type { MixTrack } from '../domain/types'
import type { MixPlanner } from '../model/useMixPlanner'

/** Start, end, "A must be followed by B" pairs, and exclusions (decision #8). */
const { planner } = defineProps<{ planner: MixPlanner }>()

const excluded = computed(() => new Set(planner.constraints.excluded))
const included = computed(() => planner.input.value.tracks.filter((t) => !excluded.value.has(t.id)))
const byId = computed(() => new Map(planner.input.value.tracks.map((t) => [t.id, t])))
const optionLabel = (t: MixTrack) => `${t.label} (${formatKey(t.camelot)}, ${String(t.bpm)} BPM)`
const nameOf = (id: string) => byId.value.get(id)?.label ?? id

const followFrom = ref('')
const followTo = ref('')
function addFollow() {
  if (!followFrom.value || !followTo.value) return
  planner.addFollow(followFrom.value, followTo.value)
  followFrom.value = ''
  followTo.value = ''
}

const selectClass = 'w-full min-w-0 rounded-lg border border-rule bg-surface px-3 py-2 text-sm'
</script>

<template>
  <div class="grid min-w-0 grid-cols-1 gap-4">
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <label class="grid gap-1 text-sm font-semibold">
        First track
        <select
          :value="planner.constraints.start ?? ''"
          :class="selectClass"
          @change="planner.setStart(($event.target as HTMLSelectElement).value || null)"
        >
          <option value="">Any</option>
          <option v-for="t in included" :key="t.id" :value="t.id">{{ optionLabel(t) }}</option>
        </select>
      </label>
      <label class="grid gap-1 text-sm font-semibold">
        Last track
        <select
          :value="planner.constraints.end ?? ''"
          :class="selectClass"
          @change="planner.setEnd(($event.target as HTMLSelectElement).value || null)"
        >
          <option value="">Any</option>
          <option v-for="t in included" :key="t.id" :value="t.id">{{ optionLabel(t) }}</option>
        </select>
      </label>
    </div>

    <fieldset class="grid gap-2">
      <legend class="mb-1 text-sm font-semibold">Must be followed by</legend>
      <ul v-if="planner.constraints.follows.length" class="grid gap-1">
        <li
          v-for="([from, to], i) in planner.constraints.follows"
          :key="`${from}>${to}`"
          class="flex items-center justify-between gap-2 rounded-lg bg-band px-3 py-1.5 text-sm"
        >
          <span>{{ nameOf(from) }} → {{ nameOf(to) }}</span>
          <AppButton
            variant="ghost"
            :aria-label="`Remove ${nameOf(from)} → ${nameOf(to)}`"
            @click="planner.removeFollow(i)"
          >
            Remove
          </AppButton>
        </li>
      </ul>
      <div class="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
        <select v-model="followFrom" :class="selectClass" aria-label="Track">
          <option value="">Track…</option>
          <option v-for="t in included" :key="t.id" :value="t.id">{{ optionLabel(t) }}</option>
        </select>
        <select v-model="followTo" :class="selectClass" aria-label="is followed by">
          <option value="">…is followed by</option>
          <option v-for="t in included" :key="t.id" :value="t.id">{{ optionLabel(t) }}</option>
        </select>
        <AppButton variant="secondary" :disabled="!followFrom || !followTo" @click="addFollow"
          >Add pair</AppButton
        >
      </div>
    </fieldset>

    <p class="text-sm text-muted">
      <span class="num">{{ planner.includedCount.value }}</span> tracks in the mix<template
        v-if="planner.constraints.excluded.length"
        >, <span class="num">{{ planner.constraints.excluded.length }}</span> excluded</template
      >. Exclude tracks in the list above.
    </p>
  </div>
</template>
