<script setup lang="ts">
import { ARC_PRESETS } from '../domain/arc'
import type { ArcChoice } from '../domain/arc'

/** The arc the mix is shaped to: none, or one of the presets. */
const model = defineModel<ArcChoice>({ required: true })

const options: { value: ArcChoice; name: string; description: string }[] = [
  { value: 'none', name: 'No arc', description: 'Only smooth keys and tempo.' },
  ...Object.values(ARC_PRESETS).map((p) => ({
    value: p.id,
    name: p.name,
    description: p.description,
  })),
]
</script>

<template>
  <fieldset class="flex min-w-0 items-center gap-2">
    <legend class="sr-only">Arc</legend>
    <span class="text-xs text-muted" aria-hidden="true">Arc</span>
    <div class="flex overflow-hidden rounded-md border border-rule text-xs">
      <label
        v-for="o in options"
        :key="o.value"
        class="cursor-pointer border-l border-rule px-2 py-1 first:border-l-0 has-focus-visible:outline-2 has-focus-visible:-outline-offset-2 has-focus-visible:outline-accent"
        :class="model === o.value ? 'bg-accent font-medium text-surface' : 'text-ink hover:bg-band'"
        :title="o.description"
      >
        <input v-model="model" type="radio" name="arc" :value="o.value" class="sr-only" />
        {{ o.name }}
      </label>
    </div>
  </fieldset>
</template>
