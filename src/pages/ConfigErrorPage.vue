<script setup lang="ts">
defineProps<{ message: string }>()
</script>

<template>
  <main class="mx-auto grid max-w-[640px] gap-3 px-4 py-16">
    <h1 class="text-3xl font-bold">Camelont isn’t configured</h1>
    <p class="text-muted">{{ message }}</p>
  </main>
</template>
