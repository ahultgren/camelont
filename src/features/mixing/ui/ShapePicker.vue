<script setup lang="ts">
import { computed } from 'vue'
import { describeBalance, type MixShaping } from '../domain/profile'
import ArcPicker from './ArcPicker.vue'

/**
 * How the mix is shaped beyond keys and tempo: the arc, what the arc follows (a slider
 * from BPM to energy), and the switches. Each is one term of the cost, so any of them can be combined.
 * The controls are laid out by the parent's row (`contents`), so they wrap with whatever
 * else is on it.
 */
const model = defineModel<MixShaping>({ required: true })

const change = (part: Partial<MixShaping>) => {
  model.value = { ...model.value, ...part }
}

const followed = computed(() => describeBalance(model.value.arcBalance))
const setBalance = (event: Event) => {
  change({ arcBalance: Number((event.target as HTMLInputElement).value) })
}
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
    <label
      class="flex min-w-0 items-center gap-1.5 text-xs text-muted"
      :class="model.arc === 'none' ? 'cursor-not-allowed opacity-50' : ''"
      :title="model.arc === 'none' ? 'Choose an arc first.' : `The arc follows ${followed}.`"
    >
      <span aria-hidden="true">by BPM</span>
      <input
        type="range"
        min="0"
        max="1"
        step="0.05"
        class="w-24 accent-(--accent) disabled:cursor-not-allowed"
        aria-label="What the arc follows, from BPM to energy"
        :aria-valuetext="followed"
        :value="model.arcBalance"
        :disabled="model.arc === 'none'"
        @input="setBalance"
      />
      <span aria-hidden="true">Energy</span>
    </label>
    <button
      type="button"
      class="rounded-md border px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-50"
      :class="
        model.keysFollowArc && model.arc !== 'none'
          ? 'border-accent bg-accent font-medium text-surface'
          : 'border-rule text-ink enabled:hover:bg-band'
      "
      :disabled="model.arc === 'none'"
      :aria-pressed="model.keysFollowArc"
      :title="
        model.arc === 'none'
          ? 'Choose an arc first.'
          : 'Where the arc rises, only perfect and + moves; where it falls, only perfect and − moves.'
      "
      @click="change({ keysFollowArc: !model.keysFollowArc })"
    >
      Keys follow arc
    </button>
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
