import { ApiError } from '@/shared/api'
import type { CreateOutcome, ReplaceOutcome, SaveRequest, WriteFailure } from '../domain/types'
import { ADD_BATCH, type SpotifyApi } from './spotify-api'

/**
 * The two ways a save writes to Spotify, with every failure as a value: what kind it
 * is and what Spotify said, so the save dialog can say what happened and what can be
 * done about it.
 */

const reasonOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

const statusOf = (error: unknown): number | null =>
  error instanceof ApiError && error.kind === 'http' ? error.status : null

/** A failure before anything was written. */
function refused(error: unknown): WriteFailure {
  const status = statusOf(error)
  const kind =
    status === 404 || status === 405 ? 'unavailable' : status === 403 ? 'forbidden' : 'failed'
  return { ok: false, kind, reason: reasonOf(error) }
}

/** A new private playlist with these tracks, in order. */
export async function createPlaylist(
  api: SpotifyApi,
  request: SaveRequest,
): Promise<CreateOutcome> {
  let created: { id: string; url: string }
  try {
    created = await api.createPrivatePlaylist(request.name, request.description)
  } catch (error) {
    const failure = refused(error)
    // There is no other way to save than creating: a missing route is just a failure.
    return {
      ...failure,
      kind: failure.kind === 'unavailable' ? 'failed' : failure.kind,
      created: null,
    }
  }
  try {
    await api.addItems(created.id, request.uris)
  } catch (error) {
    return { ok: false, kind: 'incomplete', reason: reasonOf(error), created }
  }
  return { ok: true, ...created }
}

/**
 * Replaces a playlist's tracks, then its name and description. The caller has made
 * sure the playlist is one that may be replaced (spec §8.5); nothing here decides that.
 *
 * The first write is the one that replaces: if Spotify refuses it, the playlist is as
 * it was. After it, a failure leaves the playlist short of tracks (`incomplete`);
 * doing the whole replace again puts that right.
 */
export async function replacePlaylist(
  api: SpotifyApi,
  playlistId: string,
  request: SaveRequest,
): Promise<ReplaceOutcome> {
  try {
    await api.setItems(playlistId, request.uris.slice(0, ADD_BATCH))
  } catch (error) {
    return refused(error)
  }
  try {
    await api.addItems(playlistId, request.uris.slice(ADD_BATCH))
  } catch (error) {
    return { ok: false, kind: 'incomplete', reason: reasonOf(error) }
  }
  try {
    await api.updateDetails(playlistId, { name: request.name, description: request.description })
  } catch (error) {
    return { ok: true, detailsFailed: reasonOf(error) }
  }
  return { ok: true, detailsFailed: null }
}
