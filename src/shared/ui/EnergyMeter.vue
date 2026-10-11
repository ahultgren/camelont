<script setup lang="ts">
import { computed } from 'vue'

/** A track's energy (0..1, as the provider reports it): a short bar and a number out of 100. */
const { energy } = defineProps<{ energy: number | null }>()

const level = computed(() => (energy === null ? null : Math.round(energy * 100)))
const words = computed(() =>
  level.value === null ? 'Energy unknown' : `Energy ${String(level.value)} of 100`,
)
</script>

<template>
  <span
    class="inline-flex items-center gap-1 whitespace-nowrap text-muted"
    :title="words"
    data-testid="energy"
  >
    <span class="h-1 w-6 overflow-hidden rounded-full bg-rule" aria-hidden="true">
      <span class="block h-full bg-muted" :style="{ width: `${String(level ?? 0)}%` }" />
    </span>
    <span class="num w-[3ch] text-right text-xs" aria-hidden="true">{{ level ?? '–' }}</span>
    <span class="sr-only">{{ words }}</span>
  </span>
</template>
