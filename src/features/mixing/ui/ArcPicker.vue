<script setup lang="ts">
import { ARC_PRESETS } from '../domain/arc'
import type { ArcChoice } from '../model/useMixPlanner'

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
  <fieldset class="grid gap-2">
    <legend class="mb-1 text-sm font-semibold">Energy arc (by BPM)</legend>
    <label
      v-for="o in options"
      :key="o.value"
      class="flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2"
      :class="model === o.value ? 'border-accent' : 'border-rule'"
    >
      <input v-model="model" type="radio" name="arc" :value="o.value" class="mt-1" />
      <span>
        <span class="font-medium">{{ o.name }}</span>
        <span class="block text-[13px] text-muted">{{ o.description }}</span>
      </span>
    </label>
  </fieldset>
</template>
