# Camelont

Build a harmonically mixed set from your Spotify playlists, in the browser.

A *set* is one or more of your playlists gathered under a name. For each playlist you
choose what it contributes: a BPM range (set on the playlist's own BPM distribution),
tracks to always include or exclude, and an optional limit with random or best-fit
picks. Camelont then proposes several orders in which every transition is a
harmonically compatible move on a directional Camelot chart, shaped by tempo and an
optional energy arc.

Everything happens in one workspace: the tracks on the left, the mix always in view on
the right (tempo chart, alternatives, key wheel, running order), updating in place with
a line that says what each change did. Opener, closer and "followed by" pairs are set
from the track rows or by pinning a transition. Save the mix you like as a new private
playlist; your own playlists are never touched, and sets are kept in this browser.

- Vue 3 + TypeScript + Vite, no backend (Spotify PKCE login)
- Key and BPM from [ReccoBeats](https://reccobeats.com), with manual corrections stored
  on your device

**Status:** implemented and tested with mocked Spotify and ReccoBeats; not yet
verified against a real Spotify account. See [`docs/spec.md`](docs/spec.md), the
screenshots in [`docs/reference/workspace/`](docs/reference/workspace/) and the review
in [`tasks/todo.md`](tasks/todo.md).

Access is limited to users allowlisted on the Spotify developer app (Spotify
development mode). Setup: [`docs/setup.md`](docs/setup.md).
