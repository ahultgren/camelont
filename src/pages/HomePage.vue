<script setup lang="ts">
import { useRouter } from 'vue-router'
import { LoginButton, useAuthStore } from '@/features/auth'
import { SetsList } from '@/features/sets'
import { OverridesTransfer } from '@/features/track-features'

const auth = useAuthStore()
const router = useRouter()
const linkTo = (setId: string) => ({ name: 'set', params: { id: setId } })
</script>

<template>
  <template v-if="!auth.loggedIn">
    <header class="grid gap-2.5">
      <div class="eyebrow">Camelot mixing for Spotify</div>
      <h1 class="text-[clamp(30px,6vw,46px)] leading-[1.05] font-bold">Camelont</h1>
      <p class="max-w-[62ch] text-muted">
        Build a harmonically mixed set from your playlists. You choose which tracks each playlist
        contributes; every transition is a move on your Camelot chart, shaped by tempo and an
        optional energy arc. Your playlists are never changed: a mix is saved as a new one.
      </p>
    </header>
    <div>
      <LoginButton />
    </div>
  </template>
  <template v-else>
    <SetsList :link-to="linkTo" @created="(set) => router.push(linkTo(set.id))" />
    <section class="grid gap-2 border-t border-rule pt-5" aria-labelledby="corrections-heading">
      <h2 id="corrections-heading" class="text-base font-bold">Key, BPM and energy corrections</h2>
      <p class="max-w-[62ch] text-[13px] text-muted">
        The keys, tempos and energies you set by hand apply in every set and stay on this device.
        Export them to move them to another browser.
      </p>
      <OverridesTransfer />
    </section>
  </template>
</template>
