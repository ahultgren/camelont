import { computed, shallowRef } from 'vue'
import { usePlaylists, usePlaylistSaver } from '@/features/playlists'
import {
  describeFailure,
  describeRefusal,
  namesake,
  replaceRefusal,
  type SaveMode,
} from '../domain/save'
import { useSetsStore } from './sets-store'
import type { SetWorkspace } from './useSetWorkspace'

/** Whether a save may replace the playlist the set saved before (spec §8.5). */
export type ReplaceTarget =
  /** The set has no last save: there is nothing to replace, and no choice to make. */
  | { status: 'none' }
  | { status: 'checking' }
  /** `name` is the playlist's name in Spotify now; `savedAt` when the set saved it. */
  | { status: 'allowed'; playlistId: string; name: string; savedAt: number }
  /** Only a new playlist can be saved; `reason` says why, in one line. */
  | { status: 'refused'; reason: string }

/** Whether one of the user's own playlists already has a name. */
export type NameCheck =
  | { kind: 'free' }
  | { kind: 'checking' }
  /** `name` as the existing playlist spells it. Never a reason not to save. */
  | { kind: 'taken'; name: string }
  /** The user's playlists couldn't be listed, so nobody knows. */
  | { kind: 'unchecked'; reason: string }

export type SaveResult =
  /** `note`: something the user should know although the save went through. */
  { ok: true; replaced: boolean; note: string | null } | { ok: false; message: string }

type Workspace = Pick<SetWorkspace, 'set' | 'saveInput' | 'recordSave' | 'recordIncompleteSave'>

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

/**
 * Saving a set's mix to Spotify, as the save dialog needs it (spec §8.5): the name to
 * start from, whether that name is taken, whether the playlist of the last save may be
 * replaced, and the save itself. Make one when the dialog opens: it looks at Spotify
 * then, and again right before it writes.
 *
 * The one rule everything here serves: the only playlist that is ever written to,
 * apart from a newly created one, is the playlist this set's own last save created,
 * and only while it exists, is the user's, and is no set's source.
 */
export function useSaveSet(ws: Workspace) {
  const sets = useSetsStore()
  const saver = usePlaylistSaver()
  const playlists = usePlaylists()
  // The list may be minutes old: what matters is which names are taken now.
  void playlists.refetch()

  const lastSave = computed(() => ws.set.value?.lastSave ?? null)
  /** The name used last time, or the set's name for a first save. */
  const defaultName = computed(() => lastSave.value?.name ?? ws.set.value?.name ?? '')

  // ── May the last save's playlist be replaced? ────────────────────────────────────
  const target = shallowRef<ReplaceTarget>({ status: 'none' })
  /** Spotify turned the replace down as a route: it won't work on another try either. */
  let replaceUnavailable = false
  let checks = 0

  /** Asks the sets on this device, then Spotify. A later check replaces an earlier one. */
  async function check(): Promise<ReplaceTarget> {
    const mine = ++checks
    const settle = (found: ReplaceTarget) => {
      if (mine === checks) target.value = found
      return found
    }
    const last = lastSave.value
    if (!last) return settle({ status: 'none' })
    if (replaceUnavailable) {
      return settle({
        status: 'refused',
        reason: 'Spotify doesn’t accept replacing a playlist’s tracks, so this saves a new one.',
      })
    }
    const refusal = replaceRefusal(last, sets.list)
    if (refusal) return settle({ status: 'refused', reason: describeRefusal(refusal) })
    // `replaceRefusal` found an ID; this keeps the type narrow.
    const { playlistId } = last
    if (playlistId === null) return settle({ status: 'none' })
    if (target.value.status !== 'allowed') settle({ status: 'checking' })
    try {
      const access = await saver.access(playlistId)
      switch (access.kind) {
        case 'mine':
          return settle({
            status: 'allowed',
            playlistId,
            name: access.name,
            savedAt: last.savedAt,
          })
        case 'notYours':
          return settle({
            status: 'refused',
            reason: 'The playlist saved before is no longer yours, so this saves a new one.',
          })
        case 'gone':
          return settle({
            status: 'refused',
            reason: 'The playlist saved before is no longer in Spotify, so this saves a new one.',
          })
      }
    } catch (error) {
      return settle({
        status: 'refused',
        reason: `The playlist saved before couldn’t be checked (${messageOf(error)}), so this saves a new one.`,
      })
    }
  }
  void check()

  // ── Is the name taken? ───────────────────────────────────────────────────────────
  /**
   * Whether one of the user's own playlists has this name already. When replacing, the
   * playlist being replaced doesn't count.
   */
  function nameCheck(name: string, mode: SaveMode): NameCheck {
    if (name.trim() === '') return { kind: 'free' }
    if (playlists.isFetching.value) return { kind: 'checking' }
    if (playlists.isError.value || !playlists.data.value) {
      return { kind: 'unchecked', reason: playlists.error.value?.message ?? 'no answer' }
    }
    const replacing =
      mode === 'replace' && target.value.status === 'allowed' ? target.value.playlistId : null
    const own = playlists.data.value.filter((playlist) => playlist.owned)
    const taken = namesake(name, own, replacing)
    return taken ? { kind: 'taken', name: taken.name } : { kind: 'free' }
  }

  // ── The save ─────────────────────────────────────────────────────────────────────
  const saving = shallowRef(false)

  async function write(name: string, mode: SaveMode): Promise<SaveResult> {
    const input = ws.saveInput.value
    const playlistName = name.trim()
    if (!input) return { ok: false, message: 'There is no mix to save yet.' }
    if (playlistName === '') return { ok: false, message: 'The playlist needs a name.' }
    const request = { name: playlistName, description: input.description, uris: input.uris }

    if (mode === 'create') {
      const outcome = await saver.create(request)
      if (outcome.ok) {
        ws.recordSave({
          playlistId: outcome.id,
          url: outcome.url,
          name: playlistName,
          order: input.order,
        })
        return { ok: true, replaced: false, note: null }
      }
      if (outcome.created) {
        // It exists, short of tracks: remembered, so the next try can replace it.
        ws.recordIncompleteSave({
          playlistId: outcome.created.id,
          url: outcome.created.url,
          name: playlistName,
        })
      }
      return {
        ok: false,
        message: describeFailure('create', outcome.kind, playlistName, outcome.reason),
      }
    }

    // Right before writing: is it still the set's own playlist, the user's, no source?
    const now = await check()
    const last = lastSave.value
    if (now.status !== 'allowed' || !last) {
      const why = now.status === 'refused' ? now.reason : 'There is no playlist to replace.'
      return { ok: false, message: `${why} Nothing was written.` }
    }
    const outcome = await saver.replace(now.playlistId, request)
    if (outcome.ok) {
      ws.recordSave({
        playlistId: now.playlistId,
        url: last.url,
        // What the playlist is called in Spotify, should the new name not have been taken.
        name: outcome.detailsFailed === null ? playlistName : now.name,
        order: input.order,
      })
      return {
        ok: true,
        replaced: true,
        note:
          outcome.detailsFailed === null
            ? null
            : `The tracks of “${now.name}” were replaced, but Spotify didn’t take the new name and description (${outcome.detailsFailed}).`,
      }
    }
    if (outcome.kind === 'incomplete') {
      ws.recordIncompleteSave({ playlistId: now.playlistId, url: last.url, name: now.name })
    }
    if (outcome.kind === 'unavailable') replaceUnavailable = true
    return {
      ok: false,
      message: describeFailure('replace', outcome.kind, now.name, outcome.reason),
    }
  }

  /**
   * Saves the shown mix under `name`: over the last save's playlist, or as a new one.
   * Nothing is written unless this is called. Afterwards `target` is up to date.
   */
  async function save(name: string, mode: SaveMode): Promise<SaveResult> {
    if (saving.value) return { ok: false, message: 'A save is under way.' }
    saving.value = true
    try {
      const result = await write(name, mode)
      // The next save is about another playlist, or about this one in another state.
      if (!result.ok) await check()
      return result
    } finally {
      saving.value = false
    }
  }

  return {
    defaultName,
    lastSave,
    /** Whether replacing is offered; checked when made, and again by a replace. */
    target: computed(() => target.value),
    nameCheck,
    saving: computed(() => saving.value),
    save,
  }
}

export type SaveSet = ReturnType<typeof useSaveSet>
