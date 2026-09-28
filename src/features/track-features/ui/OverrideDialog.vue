<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ALL_CAMELOT_KEYS, formatKey, parseCamelot, type CamelotKey } from '@/shared/music'
import { AppButton, AppDialog } from '@/shared/ui'
import { isValidBpm, MAX_BPM, MIN_BPM, type TrackFeatures } from '../domain/features'
import { useOverridesStore } from '../model/overrides-store'

const props = defineProps<{ trackId: string; label: string; features: TrackFeatures | undefined }>()
const open = defineModel<boolean>('open', { required: true })

const store = useOverridesStore()
const existing = computed(() => store.byTrack.get(props.trackId))
const fetched = computed(() => (props.features?.fetched?.found ? props.features.fetched : null))

const key = ref<string>('')
// v-model on a number input yields a number (or '' when empty).
const bpm = ref<string | number>('')
const note = ref('')

watch(
  open,
  (isOpen) => {
    if (!isOpen) return
    key.value = props.features?.camelot?.value ?? ''
    bpm.value = props.features?.bpm ? String(props.features.bpm.value) : ''
    note.value = existing.value?.note ?? ''
  },
  { immediate: true },
)

const bpmNumber = computed(() => {
  const raw = String(bpm.value).trim()
  return raw === '' ? null : Number(raw)
})
const bpmError = computed(() =>
  bpmNumber.value !== null && !isValidBpm(bpmNumber.value)
    ? `BPM must be between ${String(MIN_BPM)} and ${String(MAX_BPM)}.`
    : null,
)

const scale = (factor: number) => {
  if (bpmNumber.value !== null) bpm.value = String(Math.round(bpmNumber.value * factor * 10) / 10)
}

/** Only values that differ from the fetched ones are stored as overrides. */
async function save() {
  if (bpmError.value) return
  const camelot: CamelotKey | null = parseCamelot(key.value)
  await store.save({
    trackId: props.trackId,
    label: props.label,
    camelot: camelot !== null && camelot !== fetched.value?.camelot ? camelot : null,
    bpm:
      bpmNumber.value !== null && bpmNumber.value !== fetched.value?.bpm ? bpmNumber.value : null,
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
    :title="`Key and BPM: ${label}`"
    description="Your values are stored on this device and always win over fetched data."
  >
    <form class="grid gap-4" novalidate @submit.prevent="save">
      <p class="text-sm text-muted">
        <template v-if="fetched">
          ReccoBeats says
          <span class="num">{{ fetched.camelot ? formatKey(fetched.camelot) : 'no key' }}</span
          >, <span class="num">{{ fetched.bpm ?? '?' }} BPM</span>.
        </template>
        <template v-else>ReccoBeats has no data for this track.</template>
      </p>

      <label class="grid gap-1 text-sm font-medium">
        Key
        <select v-model="key" class="num rounded-lg border border-rule bg-surface px-3 py-2">
          <option value="">No key</option>
          <option v-for="k in ALL_CAMELOT_KEYS" :key="k" :value="k">{{ formatKey(k) }}</option>
        </select>
      </label>

      <div class="grid gap-1 text-sm font-medium">
        <label for="override-bpm">BPM</label>
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
          <AppButton type="submit" :disabled="!!bpmError">Save</AppButton>
        </div>
      </div>
    </form>
  </AppDialog>
</template>
