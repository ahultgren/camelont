<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  ALL_CAMELOT_KEYS,
  energyFromLevel,
  energyLevel,
  formatKey,
  isEnergyLevel,
  MAX_ENERGY_LEVEL,
  parseCamelot,
  type CamelotKey,
} from '@/shared/music'
import { AppButton, AppDialog, KeyChip } from '@/shared/ui'
import { isValidBpm, MAX_BPM, MIN_BPM, type TrackFeatures } from '../domain/features'
import { useOverridesStore } from '../model/overrides-store'
import SourceBadge from './SourceBadge.vue'

const props = defineProps<{ trackId: string; label: string; features: TrackFeatures | undefined }>()
const open = defineModel<boolean>('open', { required: true })

const store = useOverridesStore()
const existing = computed(() => store.byTrack.get(props.trackId))
const fetched = computed(() => (props.features?.fetched?.found ? props.features.fetched : null))

const key = ref<string>('')
// v-model on a number input yields a number (or '' when empty).
const bpm = ref<string | number>('')
/** The level, 0–10: energy is edited as it is shown. */
const energy = ref<string | number>('')
const note = ref('')

watch(
  open,
  (isOpen) => {
    if (!isOpen) return
    key.value = props.features?.camelot?.value ?? ''
    bpm.value = props.features?.bpm ? String(props.features.bpm.value) : ''
    energy.value = props.features?.energy ? String(energyLevel(props.features.energy.value)) : ''
    note.value = existing.value?.note ?? ''
  },
  { immediate: true },
)

const numberIn = (field: string | number) => {
  const raw = String(field).trim()
  return raw === '' ? null : Number(raw)
}
const bpmNumber = computed(() => numberIn(bpm.value))
const bpmError = computed(() =>
  bpmNumber.value !== null && !isValidBpm(bpmNumber.value)
    ? `BPM must be between ${String(MIN_BPM)} and ${String(MAX_BPM)}.`
    : null,
)

const level = computed(() => numberIn(energy.value))
const fetchedLevel = computed(() =>
  fetched.value?.energy == null ? null : energyLevel(fetched.value.energy),
)
const energyError = computed(() =>
  level.value !== null && !isEnergyLevel(level.value)
    ? `Energy must be a whole number from 0 to ${String(MAX_ENERGY_LEVEL)}.`
    : null,
)

const scale = (factor: number) => {
  if (bpmNumber.value !== null) bpm.value = String(Math.round(bpmNumber.value * factor * 10) / 10)
}

/**
 * Only values that differ from the fetched ones are stored as overrides. Energy is
 * compared as the level it is shown as, so saving a track untouched keeps what was
 * fetched instead of its rounded level.
 */
async function save() {
  if (bpmError.value || energyError.value) return
  const camelot: CamelotKey | null = parseCamelot(key.value)
  await store.save({
    trackId: props.trackId,
    label: props.label,
    camelot: camelot !== null && camelot !== fetched.value?.camelot ? camelot : null,
    bpm:
      bpmNumber.value !== null && bpmNumber.value !== fetched.value?.bpm ? bpmNumber.value : null,
    energy:
      level.value !== null && level.value !== fetchedLevel.value
        ? energyFromLevel(level.value)
        : null,
    note: note.value.trim() || null,
  })
  open.value = false
}

async function reset() {
  await store.clear(props.trackId)
  open.value = false
}
</script>

<template>
  <AppDialog
    v-model:open="open"
    :title="`Key, BPM and energy: ${label}`"
    description="Your values are stored on this device and always win over fetched data."
  >
    <form class="grid gap-4" novalidate @submit.prevent="save">
      <p class="text-sm text-muted">
        <template v-if="fetched">
          ReccoBeats says
          <KeyChip v-if="fetched.camelot" :camelot="fetched.camelot" size="sm" />
          <span v-else class="num">no key</span>,
          <span class="num">{{ fetched.bpm ?? '?' }} BPM</span>, energy
          <span class="num">{{ fetchedLevel ?? '?' }}</span
          >.
        </template>
        <template v-else>ReccoBeats has no data for this track.</template>
      </p>

      <div class="grid gap-1 text-sm font-medium">
        <!-- Where the value in use now came from (spec U3). -->
        <div class="flex items-center gap-2">
          <label for="override-key">Key</label>
          <SourceBadge v-if="features?.camelot" :source="features.camelot.source" />
          <span v-else class="text-xs font-normal text-warn">no value yet</span>
        </div>
        <select
          id="override-key"
          v-model="key"
          class="num rounded-lg border border-rule bg-surface px-3 py-2"
        >
          <option value="">No key</option>
          <option v-for="k in ALL_CAMELOT_KEYS" :key="k" :value="k">{{ formatKey(k) }}</option>
        </select>
      </div>

      <div class="grid gap-1 text-sm font-medium">
        <div class="flex items-center gap-2">
          <label for="override-bpm">BPM</label>
          <SourceBadge v-if="features?.bpm" :source="features.bpm.source" />
          <span v-else class="text-xs font-normal text-warn">no value yet</span>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <input
            id="override-bpm"
            v-model="bpm"
            type="number"
            inputmode="decimal"
            step="any"
            :min="MIN_BPM"
            :max="MAX_BPM"
            class="num w-28 rounded-lg border border-rule bg-surface px-3 py-2"
            :aria-invalid="bpmError ? 'true' : undefined"
            aria-describedby="override-bpm-help"
          />
          <AppButton variant="secondary" @click="scale(0.5)">Half</AppButton>
          <AppButton variant="secondary" @click="scale(2)">Double</AppButton>
        </div>
        <p
          id="override-bpm-help"
          class="text-xs font-normal"
          :class="bpmError ? 'text-warn' : 'text-muted'"
        >
          {{
            bpmError ?? 'Detectors often report double time; halve it if the dance tempo is slower.'
          }}
        </p>
      </div>

      <div class="grid gap-1 text-sm font-medium">
        <div class="flex items-center gap-2">
          <label for="override-energy">Energy</label>
          <SourceBadge v-if="features?.energy" :source="features.energy.source" />
          <span v-else class="text-xs font-normal text-warn">no value yet</span>
        </div>
        <input
          id="override-energy"
          v-model="energy"
          type="number"
          inputmode="numeric"
          step="1"
          min="0"
          :max="MAX_ENERGY_LEVEL"
          class="num w-28 rounded-lg border border-rule bg-surface px-3 py-2"
          :aria-invalid="energyError ? 'true' : undefined"
          aria-describedby="override-energy-help"
        />
        <p
          id="override-energy-help"
          class="text-xs font-normal"
          :class="energyError ? 'text-warn' : 'text-muted'"
        >
          {{
            energyError ??
            `From 0 (calm) to ${String(MAX_ENERGY_LEVEL)} (intense). Shown on the track; no mix uses it.`
          }}
        </p>
      </div>

      <label class="grid gap-1 text-sm font-medium">
        Note or source <span class="font-normal text-muted">(optional)</span>
        <input
          v-model="note"
          type="text"
          maxlength="500"
          class="rounded-lg border border-rule bg-surface px-3 py-2"
          placeholder="e.g. Chordify, checked by ear"
        />
      </label>

      <div class="flex flex-wrap justify-between gap-2">
        <AppButton v-if="existing" variant="danger" @click="reset">Use fetched data</AppButton>
        <span v-else />
        <div class="flex gap-2">
          <AppButton variant="secondary" @click="open = false">Cancel</AppButton>
          <AppButton type="submit" :disabled="!!bpmError || !!energyError">Save</AppButton>
        </div>
      </div>
    </form>
  </AppDialog>
</template>
