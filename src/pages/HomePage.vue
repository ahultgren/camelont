<script setup lang="ts">
import { LoginButton, useAuthStore } from '@/features/auth'
import { PlaylistPicker, type PlaylistSummary } from '@/features/playlists'

const auth = useAuthStore()
const linkTo = (p: PlaylistSummary) => ({ name: 'playlist', params: { id: p.id } })
</script>

<template>
  <header class="grid gap-2.5">
    <div class="eyebrow">Camelot mixing for Spotify</div>
    <h1 class="text-[clamp(30px,6vw,46px)] leading-[1.05] font-bold">Camelont</h1>
    <p class="max-w-[62ch] text-muted">
      Reorder one of your playlists into a harmonic mix: every transition is a move on your Camelot
      chart, shaped by tempo and an optional energy arc. Your playlist is never changed; the mix is
      saved as a new one.
    </p>
  </header>
  <div v-if="!auth.loggedIn">
    <LoginButton />
  </div>
  <PlaylistPicker v-else :link-to="linkTo" />
</template>
