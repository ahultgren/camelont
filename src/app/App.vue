<script setup lang="ts">
import { watch } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { LogoutButton, useAuthStore } from '@/features/auth'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

// A failed token refresh logs out; leave pages that need a login.
watch(
  () => auth.loggedIn,
  (loggedIn) => {
    if (!loggedIn && route.meta.requiresAuth) void router.replace({ name: 'home' })
  },
)
</script>

<template>
  <div class="mx-auto grid max-w-[1040px] gap-7 px-4 pt-6 pb-16">
    <nav class="flex items-center justify-between gap-4" aria-label="Main">
      <RouterLink to="/" class="font-display text-lg font-bold tracking-tight">Camelont</RouterLink>
      <LogoutButton v-if="auth.loggedIn" />
    </nav>
    <RouterView />
  </div>
</template>
