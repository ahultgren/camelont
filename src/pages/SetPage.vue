<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { poolSize, useSetsStore } from '@/features/sets'
import { EmptyState } from '@/shared/ui'

// A stand-in until the workspace (spec §9) is built: it shows that the set opens.
const props = defineProps<{ id: string }>()

const sets = useSetsStore()
const set = computed(() => sets.get(props.id))
const unreadable = computed(() => sets.unreadable.find((stored) => stored.id === props.id))
</script>

<template>
  <header class="grid gap-2.5">
    <RouterLink :to="{ name: 'home' }" class="eyebrow hover:text-accent">← Your sets</RouterLink>
    <h1 v-if="set" class="text-[clamp(28px,5vw,40px)] leading-[1.05] font-bold">
      {{ set.name }}
    </h1>
  </header>

  <template v-if="set">
    <section class="grid gap-2" aria-labelledby="set-playlists-heading">
      <h2 id="set-playlists-heading" class="text-xl font-bold">Playlists</h2>
      <ul class="grid gap-2">
        <li
          v-for="playlist in set.playlists"
          :key="playlist.playlistId"
          class="flex flex-wrap items-baseline justify-between gap-x-4 rounded-lg border border-rule bg-surface px-3.5 py-2.5"
        >
          <span class="font-semibold">{{ playlist.name }}</span>
          <span class="num text-[13px] text-muted">{{ poolSize([playlist]) }} tracks</span>
        </li>
      </ul>
    </section>
    <p class="text-muted">The workspace for mixing a set isn’t built yet.</p>
  </template>
  <p v-else-if="!sets.loaded" class="text-muted" role="status">Loading the set…</p>
  <EmptyState v-else-if="unreadable" title="This set can’t be read">
    <span class="num">{{ unreadable.id }}</span
    >: {{ unreadable.problem }} It is still stored on this device.
  </EmptyState>
  <EmptyState v-else title="Set not found">
    No set with this address is stored on this device.
  </EmptyState>
</template>
