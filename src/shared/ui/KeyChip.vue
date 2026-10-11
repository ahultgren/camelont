<script setup lang="ts">
import { computed } from 'vue'
import { keyName, type CamelotKey } from '@/shared/music'
import { keyColor } from './key-color'

/**
 * A key as its coloured Camelot code ("11B"). The key name ("A major") is the tooltip,
 * and is in the text for assistive tech, which a tooltip doesn't reach.
 */
const { camelot, size = 'md' } = defineProps<{
  camelot: CamelotKey | null
  size?: 'sm' | 'md'
}>()

const name = computed(() => (camelot ? keyName(camelot) : 'unknown key'))
</script>

<template>
  <!-- `relative` keeps the sr-only name inside the chip: left to a far ancestor, it would
       stay put while a list scrolls and stretch the page. -->
  <span
    class="num relative inline-block rounded-[5px] text-center font-medium whitespace-nowrap text-chip-ink"
    :class="size === 'sm' ? 'min-w-8 px-1 text-xs' : 'min-w-10 px-[7px] py-0.5 text-[13px]'"
    :style="camelot ? { background: keyColor(camelot) } : undefined"
    :title="camelot ? name : 'Unknown key'"
    :data-missing="camelot ? undefined : ''"
    data-testid="key"
    >{{ camelot ?? '?' }}<span class="sr-only"> · {{ name }}</span></span
  >
</template>

<style scoped>
[data-missing] {
  background: var(--warn-bg);
  color: var(--warn);
}
</style>
