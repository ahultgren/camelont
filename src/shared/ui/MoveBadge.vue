<script setup lang="ts">
import { TONE_TEXT, type MoveTone } from './tone'

/** A transition badge: symbol + colour, with the move name for assistive tech. */
defineProps<{ symbol: string; tone: MoveTone; label: string }>()
</script>

<template>
  <span
    class="num inline-flex min-w-7 items-center justify-center rounded border border-current bg-surface px-1.5 text-xs leading-5 font-medium"
    :class="TONE_TEXT[tone]"
    :title="label"
  >
    <span aria-hidden="true">{{ symbol }}</span>
    <span class="sr-only">{{ label }}</span>
  </span>
</template>
