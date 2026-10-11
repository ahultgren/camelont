# Camelont

Mix a Spotify playlist with the Camelot wheel, in the browser.

Camelont proposes several orders for your tracks in which every transition is a
harmonically compatible move on a directional Camelot chart, shaped by tempo and an
optional energy arc. Explore each one as a BPM/key progression chart, then save your
favourite as a new playlist. Your source playlists are never touched.

After login the first page lists your *sets*: one or more of your playlists gathered
under a name, kept in this browser. **New set** makes one; a set can be renamed,
duplicated and deleted, and none of that changes anything in Spotify.

- Vue 3 + TypeScript + Vite, no backend (Spotify PKCE login)
- Key and BPM from [ReccoBeats](https://reccobeats.com), with manual corrections stored
  on your device

**Status:** implemented and tested with mocked Spotify and ReccoBeats; not yet
verified against a real Spotify account. Sets are being built: the list and New set are
in place, mixing a set is not yet. Until it is, the mixer for a single playlist is at
`/playlists/<playlist id>`. See [`docs/spec.md`](docs/spec.md) and the
review in [`tasks/todo.md`](tasks/todo.md).

Access is limited to users allowlisted on the Spotify developer app (Spotify
development mode). Setup: [`docs/setup.md`](docs/setup.md).
