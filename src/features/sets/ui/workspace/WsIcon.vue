<script setup lang="ts">
/** The workspace's few icons, drawn on a 16 px grid in the current colour. */
export type IconName = keyof typeof PATHS

const PATHS = {
  opener: ['M3 3v10', 'M6.5 3.8v8.4L13 8z'],
  closer: ['M13 3v10', 'M3 3.8v8.4L9.5 8z'],
  include: ['M3 8.6l3.2 3.2L13 4.8'],
  exclude: ['M8 2.5a5.5 5.5 0 1 0 0 11a5.5 5.5 0 1 0 0-11', 'M4.2 11.8l7.6-7.6'],
  follow: ['M3.5 3v4a3 3 0 0 0 3 3h6', 'M10 7.2l2.8 2.8L10 12.8'],
  chevron: ['M6 3.5L10.5 8L6 12.5'],
  back: ['M10 3.5L5.5 8L10 12.5'],
  close: ['M4 4l8 8', 'M12 4l-8 8'],
  plus: ['M8 3v10', 'M3 8h10'],
  shuffle: [
    'M2 4.5h2.2c2.6 0 3.6 7 6.2 7H13',
    'M11 9.5l2 2-2 2',
    'M2 11.5h2.2c.9 0 1.6-.8 2.2-1.9',
    'M8.6 6c.5-.9 1.1-1.5 1.8-1.5H13',
    'M11 2.5l2 2-2 2',
  ],
  pencil: ['M2.8 13.2l.7-2.9l7.4-7.4l2.2 2.2l-7.4 7.4z'],
  more: ['M3.5 8h.01', 'M8 8h.01', 'M12.5 8h.01'],
} as const

const { name, size = 14 } = defineProps<{ name: IconName; size?: number }>()
</script>

<template>
  <svg
    viewBox="0 0 16 16"
    :width="size"
    :height="size"
    fill="none"
    stroke="currentColor"
    :stroke-width="name === 'more' ? 2.2 : 1.6"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    class="shrink-0"
  >
    <path v-for="d in PATHS[name]" :key="d" :d="d" />
  </svg>
</template>
