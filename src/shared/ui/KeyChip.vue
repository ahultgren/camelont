<script setup lang="ts">
import { computed } from 'vue'
import { keyName, type CamelotKey } from '@/shared/music'
import { keyColor } from './key-color'

/** A key in both notations: coloured Camelot chip + key name ("11B · A major"). */
const { camelot, size = 'md' } = defineProps<{
  camelot: CamelotKey | null
  size?: 'sm' | 'md'
}>()

const name = computed(() => (camelot ? keyName(camelot) : 'unknown key'))
</script>

<template>
  <!-- One line on purpose: the space between the spans is part of the text ("11B · A major"). -->
  <!-- prettier-ignore -->
  <span class="inline-flex items-center whitespace-nowrap"><span class="num inline-block rounded-[5px] text-center font-medium text-chip-ink" :class="size === 'sm' ? 'min-w-8 px-1 text-xs' : 'min-w-10 px-[7px] py-0.5 text-[13px]'" :style="camelot ? { background: keyColor(camelot) } : undefined" :data-missing="camelot ? undefined : ''">{{ camelot ?? '?' }}</span>&#32;<span class="ml-1 text-muted" :class="size === 'sm' ? 'text-xs' : 'text-[13px]'">· {{ name }}</span></span>
</template>

<style scoped>
[data-missing] {
  background: var(--warn-bg);
  color: var(--warn);
}
</style>
