# Camelont

Mix a Spotify playlist with the Camelot wheel, in the browser.

Pick one of your playlists and Camelont proposes several orders in which every
transition is a harmonically compatible move on a directional Camelot chart, shaped by
tempo and an optional energy arc. Explore each one as a BPM/key progression chart, then
save your favourite as a new playlist. Your source playlist is never touched.

- Vue 3 + TypeScript + Vite, no backend (Spotify PKCE login)
- Key and BPM from [ReccoBeats](https://reccobeats.com), with manual corrections stored
  on your device

**Status:** specification and plan done; implementation not started.
See [`docs/spec.md`](docs/spec.md) and [`tasks/todo.md`](tasks/todo.md).

Access is limited to users allowlisted on the Spotify developer app (Spotify
development mode). Setup: [`docs/setup.md`](docs/setup.md).
