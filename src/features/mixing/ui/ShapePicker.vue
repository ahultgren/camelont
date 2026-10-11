<script setup lang="ts">
import type { ArcSignalId } from '../domain/arc'
import type { MixShaping } from '../domain/profile'
import ArcPicker from './ArcPicker.vue'

/**
 * How the mix is shaped beyond keys and tempo: the arc, what the arc follows, and the
 * two energy switches. Each is one term of the cost, so any of them can be combined.
 * The controls are laid out by the parent's row (`contents`), so they wrap with whatever
 * else is on it.
 */
const model = defineModel<MixShaping>({ required: true })

const change = (part: Partial<MixShaping>) => {
  model.value = { ...model.value, ...part }
}

const SIGNALS: { value: ArcSignalId; name: string; description: string }[] = [
  { value: 'bpm', name: 'BPM', description: 'The arc follows the tempo.' },
  { value: 'energy', name: 'Energy', description: 'The arc follows the tracks’ energy.' },
]
const SWITCHES = [
  {
    key: 'energySteps',
    name: 'Energy steps',
    description: 'Climb in small steps of energy; a fall may be sudden.',
  },
  {
    key: 'keyLift',
    name: 'Key lift',
    description:
      'Prefer key boosts where the energy rises and key drops where it falls, and avoid the opposite.',
  },
] as const
</script>

<template>
  <div class="contents">
    <ArcPicker :model-value="model.arc" @update:model-value="(arc) => change({ arc })" />
    <fieldset
      class="flex min-w-0 items-center gap-2 disabled:opacity-50"
      :disabled="model.arc === 'none'"
      :title="model.arc === 'none' ? 'Choose an arc first.' : undefined"
    >
      <legend class="sr-only">What the arc follows</legend>
      <span class="text-xs text-muted" aria-hidden="true">by</span>
      <div class="flex overflow-hidden rounded-md border border-rule text-xs">
        <label
          v-for="signal in SIGNALS"
          :key="signal.value"
          class="border-l border-rule px-2 py-1 first:border-l-0 has-focus-visible:outline-2 has-focus-visible:-outline-offset-2 has-focus-visible:outline-accent"
          :class="[
            model.arcSignal === signal.value
              ? 'bg-accent font-medium text-surface'
              : 'text-ink hover:bg-band',
            model.arc === 'none' ? 'cursor-not-allowed' : 'cursor-pointer',
          ]"
          :title="signal.description"
        >
          <input
            type="radio"
            name="arc-signal"
            class="sr-only"
            :value="signal.value"
            :checked="model.arcSignal === signal.value"
            @change="change({ arcSignal: signal.value })"
          />
          {{ signal.name }}
        </label>
      </div>
    </fieldset>
    <button
      v-for="option in SWITCHES"
      :key="option.key"
      type="button"
      class="rounded-md border px-2 py-1 text-xs"
      :class="
        model[option.key]
          ? 'border-accent bg-accent font-medium text-surface'
          : 'border-rule text-ink hover:bg-band'
      "
      :aria-pressed="model[option.key]"
      :title="option.description"
      @click="change({ [option.key]: !model[option.key] })"
    >
      {{ option.name }}
    </button>
  </div>
</template>
