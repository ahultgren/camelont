import type { KeyValueStore } from '@/shared/storage'
import type { FetchedFeatures, Override } from '../domain/features'
import { buildExport, type OverridesExport } from '../domain/overrides'
import { OverridesFile, STORAGE_VERSION, StoredFetched, StoredOverride } from './schemas'

/** Cache of provider answers, keyed by track ID. */
export function createFeaturesCache(store: KeyValueStore) {
  return {
    async getMany(trackIds: readonly string[]): Promise<Map<string, FetchedFeatures>> {
      const values = await store.getMany(trackIds)
      const out = new Map<string, FetchedFeatures>()
      values.forEach((raw, i) => {
        const parsed = StoredFetched.safeParse(raw)
        const id = trackIds[i]
        if (parsed.success && id !== undefined) out.set(id, parsed.data.data)
      })
      return out
    },
    async putMany(features: readonly FetchedFeatures[]): Promise<void> {
      await store.setMany(
        features.map((f) => [f.trackId, { v: STORAGE_VERSION, data: f }] as const),
      )
    },
  }
}

export type FeaturesCache = ReturnType<typeof createFeaturesCache>

/** Manual overrides, keyed by track ID. */
export function createOverridesRepo(store: KeyValueStore) {
  return {
    async all(): Promise<Override[]> {
      const out: Override[] = []
      for (const [, raw] of await store.entries()) {
        const parsed = StoredOverride.safeParse(raw)
        if (parsed.success) out.push(parsed.data.data)
      }
      return out
    },
    async put(override: Override): Promise<void> {
      await store.set(override.trackId, { v: STORAGE_VERSION, data: override })
    },
    async putMany(overrides: readonly Override[]): Promise<void> {
      await store.setMany(
        overrides.map((o) => [o.trackId, { v: STORAGE_VERSION, data: o }] as const),
      )
    },
    async remove(trackId: string): Promise<void> {
      await store.delete(trackId)
    },
  }
}

export type OverridesRepo = ReturnType<typeof createOverridesRepo>

export type ParsedImport = { ok: true; overrides: Override[] } | { ok: false; error: string }

/** Validates an imported export file. */
export function parseOverridesFile(text: string): ParsedImport {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return { ok: false, error: 'This file isn’t JSON.' }
  }
  const parsed = OverridesFile.safeParse(json)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const where = issue?.path.length ? ` (at ${issue.path.join('.')})` : ''
    return {
      ok: false,
      error: `This isn’t a Camelont overrides file: ${issue?.message ?? 'invalid'}${where}.`,
    }
  }
  return { ok: true, overrides: parsed.data.overrides }
}

export function serialiseOverrides(overrides: readonly Override[], now: Date): string {
  const file: OverridesExport = buildExport(overrides, now)
  return `${JSON.stringify(file, null, 2)}\n`
}
