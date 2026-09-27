<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink, type RouteLocationRaw } from 'vue-router'
import { EmptyState } from '@/shared/ui'
import { FOLLOWED_REASON, type PlaylistSummary } from '../domain/types'
import { usePlaylists } from '../model/queries'

const { linkTo } = defineProps<{ linkTo: (playlist: PlaylistSummary) => RouteLocationRaw }>()

const playlists = usePlaylists()
const search = ref('')

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  const all = playlists.data.value ?? []
  return q ? all.filter((p) => p.name.toLowerCase().includes(q)) : all
})

const countLabel = (p: PlaylistSummary) =>
  p.trackCount === null ? '' : `${String(p.trackCount)} track${p.trackCount === 1 ? '' : 's'}`
</script>

<template>
  <section class="grid gap-3" aria-labelledby="playlists-heading">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <h2 id="playlists-heading" class="text-xl font-bold">Your playlists</h2>
      <label class="grid gap-1 text-sm text-muted">
        Search
        <input
          v-model="search"
          type="search"
          class="w-64 max-w-full rounded-lg border border-rule bg-surface px-3 py-1.5 text-ink"
          placeholder="Playlist name"
        />
      </label>
    </div>

    <p v-if="playlists.isPending.value" class="text-muted" role="status">Loading your playlists…</p>
    <EmptyState v-else-if="playlists.isError.value" title="Couldn’t load your playlists">
      {{ playlists.error.value?.message }}
    </EmptyState>
    <EmptyState v-else-if="filtered.length === 0" title="No playlists found">
      {{ search ? 'Nothing matches that name.' : 'Create a playlist in Spotify first.' }}
    </EmptyState>

    <ul v-else class="grid gap-2">
      <li v-for="p in filtered" :key="p.id">
        <component
          :is="p.canMix ? RouterLink : 'div'"
          v-bind="p.canMix ? { to: linkTo(p) } : { 'aria-disabled': 'true' }"
          class="grid grid-cols-[48px_minmax(0,1fr)] items-center gap-x-3.5 rounded-lg border border-rule bg-surface px-3.5 py-2.5"
          :class="p.canMix ? 'hover:border-accent' : 'opacity-70'"
        >
          <img
            v-if="p.imageUrl"
            :src="p.imageUrl"
            alt=""
            width="48"
            height="48"
            class="size-12 rounded object-cover"
          />
          <span v-else class="size-12 rounded bg-band" aria-hidden="true" />
          <span class="grid min-w-0">
            <span class="truncate font-semibold">{{ p.name }}</span>
            <span class="text-[13px] text-muted">
              <span class="num">{{ countLabel(p) }}</span> · by {{ p.ownerName }}
            </span>
            <span v-if="!p.canMix" class="text-[13px] text-warn">
              Followed, can’t be mixed. {{ FOLLOWED_REASON }}
            </span>
          </span>
        </component>
      </li>
    </ul>
  </section>
</template>
