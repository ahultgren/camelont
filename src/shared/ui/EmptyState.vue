<script setup lang="ts">
defineProps<{ title: string }>()
</script>

<template>
  <div class="grid justify-items-start gap-2 rounded-[10px] border border-dashed border-rule p-6">
    <h2 class="text-lg font-bold">{{ title }}</h2>
    <div class="max-w-[62ch] text-muted"><slot /></div>
    <div v-if="$slots['actions']" class="mt-2 flex flex-wrap gap-2"><slot name="actions" /></div>
  </div>
</template>
