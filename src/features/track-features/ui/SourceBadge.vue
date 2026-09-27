<script setup lang="ts">
import { SOURCE_LABEL, type FeatureSource } from '../domain/features'

defineProps<{ source: FeatureSource }>()
</script>

<template>
  <span
    class="num inline-block rounded px-1.5 text-[11px] leading-[18px] font-medium"
    :class="source === 'manual' ? 'bg-ok-bg text-ok' : 'bg-band text-muted'"
    :title="`Source: ${SOURCE_LABEL[source]}`"
    >{{ SOURCE_LABEL[source] }}</span
  >
</template>
