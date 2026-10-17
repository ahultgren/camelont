<script setup lang="ts">
import { computed } from 'vue'
import { describeEnergy, energyLevel } from '@/shared/music'
import { energyColor } from './energy-color'

/**
 * A track's energy (0..1) as its level, 0–10, on a chip whose hue runs with the level:
 * blue for calm, red for intense. The number is always there, so the colour is never
 * the only carrier.
 */
const { energy } = defineProps<{ energy: number | null }>()

const words = computed(() => describeEnergy(energy))
</script>

<template>
  <!-- `relative` keeps the sr-only words inside the chip (see KeyChip). -->
  <span
    class="num relative inline-block min-w-[22px] rounded-full px-1 text-center text-xs font-medium whitespace-nowrap text-chip-ink"
    :style="energy === null ? undefined : { background: energyColor(energy) }"
    :title="words"
    :data-missing="energy === null ? '' : undefined"
    data-testid="energy"
    ><span aria-hidden="true">{{ energy === null ? '–' : energyLevel(energy) }}</span
    ><span class="sr-only">{{ words }}</span></span
  >
</template>

<style scoped>
[data-missing] {
  background: var(--band);
  color: var(--muted);
}
</style>
