// Public API of the auth feature. Other layers import only from here.
export { SPOTIFY_SCOPES } from './domain/pkce'
export { installAuth, useAuthStore } from './model/auth-store'
export { requireLogin } from './model/guard'
export type { CallbackResult } from './model/session'
export { default as LoginButton } from './ui/LoginButton.vue'
export { default as LogoutButton } from './ui/LogoutButton.vue'
