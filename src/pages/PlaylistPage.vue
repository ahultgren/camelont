<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import {
  ArcPicker,
  CandidateList,
  ConstraintsPanel,
  DEFAULT_PROFILE,
  mixDescription,
  MixProblems,
  mixPlaylistName,
  useMixPlanner,
} from '@/features/mixing'
import { MixExplorer, type EntryInfo } from '@/features/mix-view'
import { SavePlaylistButton, usePlaylist, usePlaylistContents } from '@/features/playlists'
import { OverridesTransfer, TrackTable, useTrackFeatures } from '@/features/track-features'
import { AppCard, EmptyState, StatTile } from '@/shared/ui'

const props = defineProps<{ id: string }>()

const playlist = usePlaylist(() => props.id)
const contents = usePlaylistContents(() => props.id)
const entries = computed(() => contents.data.value?.entries ?? [])
const skipped = computed(() => contents.data.value?.skipped ?? null)
const skippedCount = computed(() =>
  skipped.value ? skipped.value.localFiles + skipped.value.episodes + skipped.value.unavailable : 0,
)

const trackFeatures = useTrackFeatures(() => entries.value.map((e) => e.trackId))
const planner = useMixPlanner(entries, trackFeatures.features)

const info = computed(
  () =>
    new Map<string, EntryInfo>(
      entries.value.map((e) => [
        e.entryId,
        { title: e.title, artists: e.artists, durationMs: e.durationMs },
      ]),
    ),
)
const excluded = computed(() => new Set(planner.constraints.excluded))
const mixableCount = computed(() => planner.input.value.tracks.length)

const outcome = computed(() => (planner.stale.value ? null : planner.outcome.value))
const candidates = computed(() =>
  outcome.value?.kind === 'solved' ? outcome.value.candidates : [],
)
const selected = ref(0)
watch(candidates, () => {
  selected.value = 0
})
const chosen = computed(() => candidates.value[selected.value] ?? null)
const name = computed(() => playlist.value?.name ?? 'Playlist')

const uriByEntry = computed(() => new Map(entries.value.map((e) => [e.entryId, e.uri])))
const save = computed(() => {
  const mix = chosen.value
  if (!mix) return null
  const arc = planner.arc.value === 'none' ? null : planner.arc.value
  return {
    name: mixPlaylistName(name.value),
    description: mixDescription(mix, DEFAULT_PROFILE, arc, name.value),
    uris: mix.order.map((t) => uriByEntry.value.get(t.id) ?? '').filter((u) => u !== ''),
  }
})
</script>

<template>
  <header class="grid gap-2.5">
    <RouterLink to="/" class="eyebrow hover:text-accent">← Your playlists</RouterLink>
    <h1 class="text-[clamp(28px,5vw,40px)] leading-[1.05] font-bold">{{ name }}</h1>
    <div v-if="contents.data.value" class="flex flex-wrap gap-x-7 gap-y-2">
      <StatTile :value="entries.length" label="tracks" />
      <StatTile :value="mixableCount" label="with key and BPM" />
      <StatTile
        v-if="planner.constraints.excluded.length"
        :value="planner.constraints.excluded.length"
        label="excluded"
      />
    </div>
    <p v-if="skippedCount" class="text-sm text-muted">
      Left out: {{ skipped?.localFiles ? `${skipped.localFiles} local file(s)` : '' }}
      {{ skipped?.episodes ? `${skipped.episodes} episode(s)` : '' }}
      {{ skipped?.unavailable ? `${skipped.unavailable} unavailable track(s)` : '' }}. They can’t be
      mixed.
    </p>
  </header>

  <p v-if="contents.isPending.value" class="text-muted" role="status">Loading the playlist…</p>
  <EmptyState v-else-if="contents.isError.value" title="Couldn’t load this playlist">
    {{ contents.error.value?.message }}
  </EmptyState>
  <EmptyState v-else-if="entries.length === 0" title="This playlist has no tracks to mix">
    Add some tracks in Spotify, then come back.
  </EmptyState>

  <template v-else>
    <section class="grid grid-cols-1 gap-3" aria-labelledby="tracks-heading">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <h2 id="tracks-heading" class="text-xl font-bold">Tracks</h2>
        <OverridesTransfer />
      </div>
      <p v-if="trackFeatures.isLoading.value" class="text-sm text-muted" role="status">
        Looking up keys and BPM…
      </p>
      <p v-if="trackFeatures.providerError.value" class="text-sm text-warn" role="alert">
        ReccoBeats couldn’t be reached ({{ trackFeatures.providerError.value }}). Some tracks have
        no data yet.
        <button type="button" class="underline" @click="trackFeatures.retry()">Try again</button>
      </p>
      <p
        v-if="planner.blockers.value.length"
        class="rounded-lg bg-warn-bg px-3.5 py-2.5 text-sm text-warn"
        role="status"
      >
        {{ planner.blockers.value.length }} track(s) have no key or BPM, so the mix can’t be made
        yet. Fix them, or exclude them from the mix.
      </p>
      <TrackTable :rows="entries" :features="trackFeatures.features.value">
        <template #actions="{ row }">
          <label class="flex items-center gap-1.5 text-[13px] text-muted">
            <input
              type="checkbox"
              :checked="excluded.has(row.entryId)"
              @change="planner.toggleExcluded(row.entryId)"
            />
            Exclude
          </label>
        </template>
      </TrackTable>
    </section>

    <section class="grid grid-cols-1 gap-3" aria-labelledby="settings-heading">
      <h2 id="settings-heading" class="text-xl font-bold">Mix settings</h2>
      <AppCard class="grid grid-cols-1 gap-5 md:grid-cols-[minmax(0,1fr)_280px]">
        <ConstraintsPanel :planner="planner" />
        <ArcPicker v-model="planner.arc.value" />
      </AppCard>
    </section>

    <section class="grid grid-cols-1 gap-3" aria-labelledby="mixes-heading" aria-live="polite">
      <div class="flex items-baseline gap-3">
        <h2 id="mixes-heading" class="text-xl font-bold">Mixes</h2>
        <span v-if="planner.status.value === 'running'" class="text-sm text-muted" role="status">
          Mixing…
        </span>
      </div>

      <EmptyState v-if="planner.blockers.value.length" title="Waiting for key and BPM">
        Every track needs a key and a BPM (or to be excluded) before it can be mixed.
      </EmptyState>
      <MixProblems
        v-else-if="planner.constraintErrors.value.length"
        :tracks="planner.input.value.tracks"
        :errors="planner.constraintErrors.value"
      />
      <MixProblems
        v-else-if="outcome?.kind === 'infeasible'"
        :tracks="planner.input.value.tracks"
        :diagnostics="outcome.diagnostics"
      />
      <EmptyState v-else-if="outcome?.kind === 'empty'" title="Nothing to mix">
        Every track is excluded.
      </EmptyState>
      <EmptyState v-else-if="planner.status.value === 'error'" title="The mixer failed">
        {{ planner.error.value }}
      </EmptyState>

      <template v-if="chosen">
        <p class="text-sm text-muted">
          {{ candidates.length }} different clash-free mix{{ candidates.length === 1 ? '' : 'es' }},
          best first. Pick one to explore and save.
        </p>
        <CandidateList v-model="selected" :candidates="candidates" />
        <h3 class="mt-2 text-lg font-bold">Mix {{ selected + 1 }}</h3>
        <MixExplorer :mix="chosen" :info="info" />
        <AppCard v-if="save">
          <SavePlaylistButton :name="save.name" :description="save.description" :uris="save.uris" />
        </AppCard>
      </template>
    </section>
  </template>
</template>
