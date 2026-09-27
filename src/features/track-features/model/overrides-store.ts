import { defineStore } from 'pinia'
import { shallowRef } from 'vue'
import { err, ok, type Result } from '@/shared/lib'
import { parseOverridesFile, serialiseOverrides } from '../api/repositories'
import type { Override } from '../domain/features'
import { mergeOverrides, type ImportReport } from '../domain/overrides'
import { useTrackFeatureDeps } from './deps'

export type OverrideInput = Omit<Override, 'updatedAt'>

/** Manual corrections, persisted on this device. They always beat fetched data. */
export const useOverridesStore = defineStore('overrides', () => {
  const deps = useTrackFeatureDeps()
  const byTrack = shallowRef<ReadonlyMap<string, Override>>(new Map())
  const loaded = shallowRef(false)

  const ready = deps.overrides.all().then((all) => {
    byTrack.value = new Map([...all.map((o) => [o.trackId, o] as const), ...byTrack.value])
    loaded.value = true
  })

  const replace = (changes: readonly Override[], removed: readonly string[] = []) => {
    const next = new Map(byTrack.value)
    for (const o of changes) next.set(o.trackId, o)
    for (const id of removed) next.delete(id)
    byTrack.value = next
  }

  async function save(input: OverrideInput): Promise<void> {
    if (input.camelot === null && input.bpm === null && !input.note) return clear(input.trackId)
    const override: Override = { ...input, updatedAt: deps.now() }
    replace([override])
    await deps.overrides.put(override)
  }

  async function clear(trackId: string): Promise<void> {
    replace([], [trackId])
    await deps.overrides.remove(trackId)
  }

  async function importText(text: string): Promise<Result<ImportReport, string>> {
    await ready
    const parsed = parseOverridesFile(text)
    if (!parsed.ok) return err(parsed.error)
    const { changed, report } = mergeOverrides(byTrack.value, parsed.overrides)
    replace(changed)
    await deps.overrides.putMany(changed)
    return ok(report)
  }

  function exportText(): string {
    return serialiseOverrides([...byTrack.value.values()], new Date(deps.now()))
  }

  return { byTrack, loaded, ready, save, clear, importText, exportText }
})
