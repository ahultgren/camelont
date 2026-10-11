import { inject, type App, type InjectionKey } from 'vue'
import { createIndexedDbStore, type KeyValueStore } from '@/shared/storage'
import { createSetsRepo, type SetsRepo } from '../api/repository'

export interface SetsDeps {
  repo: SetsRepo
  now: () => number
  newId: () => string
  /** A seed for a playlist's random pick (a new one is a reshuffle). */
  newSeed: () => number
  /** How long changes to a set are gathered before they are written. */
  saveDelayMs: number
}

const DEPS: InjectionKey<SetsDeps> = Symbol('camelont.sets')

export interface SetsOptions {
  store?: KeyValueStore
  now?: () => number
  newId?: () => string
  newSeed?: () => number
  saveDelayMs?: number
}

// Short on purpose: a write that starts while the page is being left (reload, closed
// tab) doesn't finish in Chromium, so whatever is still waiting then is lost. 50 ms
// gathers the edits of one gesture and is over before anyone can reload.
const DEFAULT_SAVE_DELAY_MS = 50

/** Wires storage (IndexedDB by default) for the sets store. */
export function installSets(app: App, options: SetsOptions = {}): void {
  app.provide(DEPS, {
    repo: createSetsRepo(options.store ?? createIndexedDbStore('sets')),
    now: options.now ?? Date.now,
    newId: options.newId ?? (() => crypto.randomUUID()),
    newSeed: options.newSeed ?? (() => Math.floor(Math.random() * 2 ** 32)),
    saveDelayMs: options.saveDelayMs ?? DEFAULT_SAVE_DELAY_MS,
  })
}

export function useSetsDeps(): SetsDeps {
  const deps = inject(DEPS)
  if (!deps) throw new Error('installSets() was not called')
  return deps
}
