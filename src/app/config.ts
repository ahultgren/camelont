import { z } from 'zod'

const EnvSchema = z.object({
  VITE_SPOTIFY_CLIENT_ID: z
    .string()
    .min(1, 'VITE_SPOTIFY_CLIENT_ID is not set (see docs/setup.md)'),
  BASE_URL: z.string(),
})

export interface AppConfig {
  spotifyClientId: string
  /** Router base, e.g. `/camelont/`. */
  baseUrl: string
  /** Absolute Spotify redirect URI; must match the dashboard exactly. */
  redirectUri: string
}

export type ConfigResult = { ok: true; config: AppConfig } | { ok: false; error: string }

/** The only place that reads `import.meta.env`. */
export function loadConfig(
  env: Record<string, unknown> = import.meta.env,
  origin: string = window.location.origin,
): ConfigResult {
  const parsed = EnvSchema.safeParse(env)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => i.message).join('; ') }
  }
  const baseUrl = parsed.data.BASE_URL
  return {
    ok: true,
    config: {
      spotifyClientId: parsed.data.VITE_SPOTIFY_CLIENT_ID,
      baseUrl,
      redirectUri: `${origin}${baseUrl}callback`,
    },
  }
}
