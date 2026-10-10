import { defineStore } from 'pinia'
import { computed, onScopeDispose, shallowRef } from 'vue'
import type { UnreadableSet } from '../api/repository'
import {
  addPlaylist as withPlaylist,
  cleanName,
  duplicateSet,
  newSet,
  type PlaylistCopy,
} from '../domain/set'
import type { MixSet } from '../domain/types'
import { useSetsDeps } from './deps'

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

/**
 * The user's sets, kept on this device and saved as they change (spec §8.6): there is
 * no save button. Sets are replaced, never mutated; every change goes through `update`.
 */
export const useSetsStore = defineStore('sets', () => {
  const deps = useSetsDeps()
  const byId = shallowRef<ReadonlyMap<string, MixSet>>(new Map())
  /** Stored sets that failed validation. They stay in storage until deleted. */
  const unreadable = shallowRef<readonly UnreadableSet[]>([])
  const loaded = shallowRef(false)
  const loadError = shallowRef<string | null>(null)
  /** Why the last write failed; null once every set is stored again. */
  const saveError = shallowRef<string | null>(null)

  // Sets changed since their last write, written together after a short delay. A write
  // stores the set as it is when the write runs, and writes run one at a time, so
  // quick successive edits end in storage in the order they were made.
  const unsaved = new Set<string>()
  const failed = new Set<string>()
  const removed = new Set<string>()
  let timer: ReturnType<typeof setTimeout> | null = null
  let writes: Promise<void> = Promise.resolve()

  const attempt = (id: string, write: () => Promise<void>): void => {
    writes = writes.then(async () => {
      try {
        await write()
        failed.delete(id)
        if (failed.size === 0) saveError.value = null
      } catch (error) {
        failed.add(id)
        saveError.value = messageOf(error)
      }
    })
  }

  /** Writes every unsaved change now. Resolves when storage is up to date. */
  function flush(): Promise<void> {
    if (timer !== null) clearTimeout(timer)
    timer = null
    const ids = [...unsaved]
    unsaved.clear()
    for (const id of ids) {
      attempt(id, async () => {
        const set = byId.value.get(id)
        if (!set) return
        try {
          await deps.repo.put(set)
        } catch (error) {
          unsaved.add(id) // tried again with the next change or flush
          throw error
        }
      })
    }
    return writes
  }

  const put = (set: MixSet, when: 'now' | 'soon'): void => {
    byId.value = new Map(byId.value).set(set.id, set)
    removed.delete(set.id)
    unsaved.add(set.id)
    if (when === 'now') void flush()
    else timer ??= setTimeout(() => void flush(), deps.saveDelayMs)
  }

  const ready: Promise<void> = deps.repo
    .all()
    .then((stored) => {
      const kept = (id: string) => !removed.has(id)
      // Changes made while loading win over what was stored.
      byId.value = new Map([
        ...stored.sets.filter((set) => kept(set.id)).map((set) => [set.id, set] as const),
        ...byId.value,
      ])
      unreadable.value = stored.unreadable.filter((set) => kept(set.id) && !byId.value.has(set.id))
    })
    .catch((error: unknown) => {
      loadError.value = messageOf(error)
    })
    .finally(() => {
      loaded.value = true
    })

  /** Newest edit first. */
  const list = computed(() =>
    [...byId.value.values()].sort(
      (a, b) => b.editedAt - a.editedAt || b.createdAt - a.createdAt || a.id.localeCompare(b.id),
    ),
  )

  const get = (id: string): MixSet | undefined => byId.value.get(id)

  function create(input: { name: string; playlists: readonly PlaylistCopy[] }): MixSet {
    const set = input.playlists.reduce(
      (soFar, copy) => withPlaylist(soFar, copy, deps.newSeed()),
      newSet({ id: deps.newId(), name: input.name, now: deps.now() }),
    )
    put(set, 'now')
    return set
  }

  /**
   * Any change to a set: `change` returns the new set (or the same one for no change).
   * The edit time is stamped here and the set is written shortly after.
   */
  function update(id: string, change: (set: MixSet) => MixSet): MixSet | null {
    const current = byId.value.get(id)
    if (!current) return null
    const changed = change(current)
    if (changed === current) return current
    const next = { ...changed, id, createdAt: current.createdAt, editedAt: deps.now() }
    put(next, 'soon')
    return next
  }

  /** A blank name is ignored. */
  const rename = (id: string, name: string): MixSet | null =>
    update(id, (set) => {
      const clean = cleanName(name)
      return clean === null || clean === set.name ? set : { ...set, name: clean }
    })

  function duplicate(id: string): MixSet | null {
    const original = byId.value.get(id)
    if (!original) return null
    const copy = duplicateSet(original, { id: deps.newId(), now: deps.now() })
    put(copy, 'now')
    return copy
  }

  /** Deletes a set (or an unreadable one) from this device. Spotify is not touched. */
  function remove(id: string): Promise<void> {
    const next = new Map(byId.value)
    next.delete(id)
    byId.value = next
    unreadable.value = unreadable.value.filter((set) => set.id !== id)
    unsaved.delete(id)
    removed.add(id)
    attempt(id, () => deps.repo.remove(id))
    return writes
  }

  const addPlaylist = (id: string, copy: PlaylistCopy): MixSet | null =>
    update(id, (set) => withPlaylist(set, copy, deps.newSeed()))

  /** Draws a playlist's random picks again (spec §8.4). */
  const reshuffle = (id: string, playlistId: string): MixSet | null =>
    update(id, (set) => ({
      ...set,
      playlists: set.playlists.map((playlist) =>
        playlist.playlistId === playlistId
          ? { ...playlist, choices: { ...playlist.choices, seed: deps.newSeed() } }
          : playlist,
      ),
    }))

  // Leaving or hiding the page must not lose the last edits.
  const flushWhenHidden = () => {
    if (document.visibilityState === 'hidden') void flush()
  }
  const flushOnLeave = () => void flush()
  document.addEventListener('visibilitychange', flushWhenHidden)
  window.addEventListener('pagehide', flushOnLeave)
  onScopeDispose(() => {
    document.removeEventListener('visibilitychange', flushWhenHidden)
    window.removeEventListener('pagehide', flushOnLeave)
  })

  return {
    list,
    unreadable,
    loaded,
    ready,
    loadError,
    saveError,
    get,
    create,
    update,
    rename,
    duplicate,
    remove,
    addPlaylist,
    reshuffle,
    flush,
  }
})
