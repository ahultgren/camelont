import type { KeyValueStore } from '@/shared/storage'
import type { MixSet } from '../domain/types'
import { MixSetSchema, STORAGE_VERSION, StoredSet, StoredSetName, StoredVersion } from './schemas'

/** A stored set that failed validation. It stays in storage until the user deletes it. */
export interface UnreadableSet {
  /** The key it is stored under. */
  id: string
  /** Its name, when that much can still be read. */
  name: string | null
  problem: string
}

export interface StoredSets {
  sets: MixSet[]
  unreadable: UnreadableSet[]
}

function describeProblem(id: string, raw: unknown): string {
  const version = StoredVersion.safeParse(raw)
  if (version.success && version.data.v !== STORAGE_VERSION) {
    return `It was stored in format version ${version.data.v}; this app reads version ${STORAGE_VERSION}.`
  }
  const parsed = StoredSet.safeParse(raw)
  if (parsed.success) return `It is stored as “${id}” but says its ID is “${parsed.data.data.id}”.`
  const issue = parsed.error.issues[0]
  const where = issue?.path.length ? ` (at ${issue.path.join('.')})` : ''
  return `${issue?.message ?? 'Invalid data'}${where}.`
}

/** Sets, keyed by set ID. */
export function createSetsRepo(store: KeyValueStore) {
  return {
    /**
     * Every stored set. One that fails validation is reported with its ID, never
     * dropped or half-loaded (spec §6), and is left in storage as it is.
     */
    async all(): Promise<StoredSets> {
      const result: StoredSets = { sets: [], unreadable: [] }
      for (const [id, raw] of await store.entries()) {
        const parsed = StoredSet.safeParse(raw)
        if (parsed.success && parsed.data.data.id === id) result.sets.push(parsed.data.data)
        else {
          const named = StoredSetName.safeParse(raw)
          result.unreadable.push({
            id,
            name: named.success ? named.data.data.name : null,
            problem: describeProblem(id, raw),
          })
        }
      }
      return result
    },
    /** Validates before writing, so nothing is stored that couldn't be read back. */
    async put(set: MixSet): Promise<void> {
      const data = MixSetSchema.parse(set)
      await store.set(data.id, { v: STORAGE_VERSION, data })
    },
    async remove(id: string): Promise<void> {
      await store.delete(id)
    },
  }
}

export type SetsRepo = ReturnType<typeof createSetsRepo>
