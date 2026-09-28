<script setup lang="ts">
import { RouterLink } from 'vue-router'
</script>

<template>
  <section class="grid gap-3">
    <h1 class="text-3xl font-bold">Page not found</h1>
    <p><RouterLink class="text-accent underline" to="/">Back to your playlists</RouterLink></p>
  </section>
</template>
