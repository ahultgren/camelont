<script setup lang="ts">
defineProps<{ label: string; value: string | number }>()
</script>

<template>
  <div class="num flex items-baseline gap-1 text-[13px] font-medium text-muted">
    <b class="text-[17px] font-medium text-ink">{{ value }}</b>
    <span>{{ label }}</span>
  </div>
</template>
