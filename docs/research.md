# Research findings

What was learned before this repo existed, from mixing a real 20-track West Coast Swing
set with a Python script and two hand-built chart pages (September 2026). The artifacts
are in [`reference/`](reference/):

| File | What it is |
|---|---|
| `reference/camelot.py` | The original CLI: ReccoBeats lookup, Camelot conversion, chart grading, **greedy** ordering. The baseline to beat, not a design to copy. |
| `reference/wcs-set.json` | The 20-track set with corrected key/BPM and provenance notes, plus three orders: `original`, `hand_tuned` (the target quality), `script_greedy` (the baseline). **Use it as the main test fixture.** |
| `reference/charts/*.html` | The two published chart pages (hand-tuned and greedy). Self-contained, open in a browser. The visual reference for the mix view. |

## 1. Track data sources

### Spotify audio features: unavailable

`GET /audio-features` and `/audio-analysis` return 403 for apps created after
2024-11-27. Don't plan around them, and don't trust tutorials that use them.

### ReccoBeats: the provider

```
GET https://api.reccobeats.com/v1/audio-features?ids=<comma-separated Spotify track IDs>
```

- No API key, no auth, free. **CORS is open** (verified 2026-09-27: it echoes any
  `Origin` and allows `GET`), so the SPA calls it directly.
- Batches of 40 IDs worked; the real limit isn't documented. No rate-limit headers were
  observed. Back off on errors anyway.
- Response: `{"content": [row, …]}`. Each row has `id` (ReccoBeats' own UUID, **not** the
  Spotify ID), `href` (`https://open.spotify.com/track/<spotifyId>`), `isrc`, `key`
  (0–11, −1 = unknown), `mode` (1 = major), `tempo`, `energy`, `danceability`, `valence`,
  `acousticness`, `instrumentalness`, `liveness`, `loudness`, `speechiness`.
- **Match rows by `href`, never by position.** Rows come back reordered, and unknown
  tracks are silently absent (still a 200). `{"content": []}` is a valid "none known"
  answer.
- Sample row:
  ```json
  {"id":"e159e9ce-da10-4edf-ab4c-a49e793a7dfc","href":"https://open.spotify.com/track/4Ub8UsjWuewQrPhuepfVpd","isrc":"GBAAA1200795","acousticness":0.0755,"danceability":0.679,"energy":0.715,"instrumentalness":0.0,"key":9,"liveness":0.271,"loudness":-6.383,"mode":1,"speechiness":0.0407,"tempo":127.435,"valence":0.571}
  ```
- A server-side caller needs an explicit `User-Agent` (Python's default got a 403).
  Browsers are fine.

### Quality of the data (design for it)

- **Coverage gap:** 3 of 20 tracks had no row, including well-known songs. Rows are per
  *recording*: another release of the same song may exist, but it's only a hint (see the
  next point).
- **Relative-key confusion:** detectors often swap a key for its relative major/minor
  (same notes). Lemon Tree: a different release gave G minor (6A); the right answer is
  B♭ major (6B). Blank Space came back C major (8B) and is F major (7B). An A/B swap
  silently changes which moves are legal, so show provenance and make overrides easy.
- **Double-time BPM:** Price Tag (175 → 87.5), We Are Young (184 → 92) and Lemon Tree
  (176 → 88) were reported at double the danced tempo and corrected by hand.
- **Energy is unreliable:** Brother, a 78 BPM ballad, has energy 0.929. Don't drive an
  arc from energy alone. BPM comes first.
- Manual values came from Chordify, Tunebat/SongBPM and Spotify's own key display. None
  of those is integrated. GetSongBPM (free, needs an attribution backlink), SoundStat and
  AcousticBrainz are candidates for a future second opinion.

## 2. Spotify Web API (as of the February 2026 changes)

- Playlist items: `GET /playlists/{id}/items` (the old `/tracks` path is gone). The
  response is nested as `items[].item`, not `items[].track`.
- Create a playlist: `POST /me/playlists` (`POST /users/{id}/playlists` was removed).
- Add items: `POST /playlists/{id}/items`, up to 100 URIs per call.
- `GET /me/playlists`: paginated, max 50 per page. Real accounts have 70+ playlists, and
  one playlist here has ~2,000 tracks.
- **Only playlists the user owns return their items.** Followed ones return metadata
  only, so detect that case rather than rendering an empty list.
- Removed endpoints that are easy to reach for by accident: Get Several Tracks/Albums/
  Artists, Artist Top Tracks, other users' profiles/playlists, browse categories,
  markets. Track objects no longer have `popularity`, `external_ids` or
  `available_markets`, and user objects no longer have `email`, `country` or `product`.
- `GET /search` now caps `limit` at 10.
- **No SDK:** the official `@spotify/web-api-ts-sdk` predates these changes and targets
  removed routes.
- PKCE: `response_type=code`, `code_challenge_method=S256`, `state` recommended. The
  token endpoint takes `grant_type`, `code`, `redirect_uri`, `client_id` and
  `code_verifier` as form-urlencoded. A refresh may or may not return a new refresh
  token; keep the old one if it doesn't. Redirect URIs must match exactly; for local
  http use the loopback IP `http://127.0.0.1:<port>`, not `localhost`.
- **Development mode:** a small allowlist of users added by hand in the dashboard, and
  the app owner needs Premium.
- Similar playlist names are common (e.g. "WCS" vs "West Coast Swing 2026"). Always show
  track counts and use IDs.

## 3. Mixing lessons from the WCS set

- **The chart is directional and user-specific.** A symmetric textbook rule was tried
  first and rejected. See [`domain/camelot-chart.md`](domain/camelot-chart.md).
- **Greedy nearest-neighbour is the known failure.** `script_greedy` keeps every
  transition legal, yet it has no first peak, runs the 7B block backwards
  (105 → 96 → 87.5), peaks three tracks from the end and closes on the slowest song. It
  can't plan or save a track for later.
- **Scarcity matters.** Bloodstream (2A) had only two legal neighbours in the set (after
  12A, before 1B). Place low-degree tracks first, or the search strands them.
- **What the hand-tuned order did:** a slow opener (Brother, 78), wave 1 climbing through
  an 11B run to Pompeii (127), a breather (Bloodstream, 91) between the waves, wave 2
  through 3B/4B, dropping to 87.5, then a long 7B climb closing at Safe and Sound (118).
  It used only perfect, +, − and +++. Long same-key runs during a climb let tempo carry
  the rise.
- **The useful comparison axes between mixes** were where the peaks fall, the closer,
  the move distribution, and whether any transition is off-chart.
- **The chart view is the interface.** The mix as a text table was "hard to read". The
  labelled tempo-arc chart is what made it reviewable. The user asked for the move
  symbol **on the chart between points**, and for hover showing **both** Camelot and
  the key name.
- The user wanted to compare two orders as **separate views** rather than a merged
  toggle.
- The source playlist is never modified. Results always go to a new playlist.

## 4. User preferences (evidenced; don't extrapolate)

- The observed WCS set spans 78–127 BPM (most tracks 87–119). It's one set, not a rule.
- Arc over local smoothness: slow opener OK, one slow breather mid-set, close near a
  peak, not on the slowest song.
- Expects corrections to stick and wants to see where each value came from.
- Works from the printed chart, not rules of thumb.
