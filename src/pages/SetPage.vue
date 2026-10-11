<script setup lang="ts">
import { WorkspaceScreen } from '@/features/sets'

defineProps<{ id: string }>()
</script>

<template>
  <!-- The workspace belongs to one set: another ID gets another one. -->
  <WorkspaceScreen :key="id" :set-id="id" :home-to="{ name: 'home' }" />
</template>
