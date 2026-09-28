<script setup lang="ts">
const { as = 'section' } = defineProps<{ as?: string }>()
</script>

<template>
  <component :is="as" class="rounded-[10px] border border-rule bg-surface p-[18px]">
    <slot />
  </component>
</template>
