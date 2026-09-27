<script setup lang="ts">
import { AppButton } from '@/shared/ui'
import { useAuthStore } from '../model/auth-store'

const auth = useAuthStore()
</script>

<template>
  <AppButton variant="ghost" @click="auth.logout()">Log out</AppButton>
</template>
