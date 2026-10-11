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
- **Energy is unverified, not known to be wrong.** Brother (78 BPM) has energy 0.929.
  That was first read as an error; the owner says it is right: the song has a lot of
  energy for its tempo (2026-10-11). So energy and tempo are separate, and how accurate
  ReccoBeats energy is across a set is still to be spot-checked.
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

## 4. What "energy" means in the chart (researched 2026-10-11)

Web research only; nothing here was built or tested by ear. Mixed In Key's (MIK) pages
are marketing and workflow content, not evidence, and their DJ-set analyses (Armin van
Buuren, Diplo) are videos that were not watched.

### The symbols describe the key's direction, not the tracks' energy

In semitones, the chart's columns are:

| Chart | The key moves | MIK's name for it |
|---|---|---|
| `+` / `−` | a fifth up / down (also minor → relative major, and back) | the basic ±1 mix; no energy claim |
| `++` / `−−` | 3 semitones up / down | "Pay Attention Mix" (up only) |
| `+++` / `−−−` | 2 semitones up / down | "Energy Boost" (up only) |
| `(+++)` / `(−−−)` | 1 semitone up / down | "Jaws Mix", "Armin van Buuren variation" (up only) |

- `+++` is the pop "key change for the last chorus": the tonal centre steps up and the
  *transition* feels like a lift. It says nothing about how intense the next song is.
- MIK keeps intensity on a separate axis, its 1–10 **Energy Level** per track, and says
  so: "A key change alone does not guarantee a rise in energy", and the wheel numbers
  are "positions on the wheel, not semitones or energy ratings".
- **MIK never names or recommends the drops.** `−−`, `−−−` and `(−−−)` look like the
  chart-maker's mirror image of the boosts. The `+/++/+++` chart itself could not be
  traced to MIK; MIK coined "Energy Boost", and the chart reads as a third-party
  synthesis of their named moves.

### How MIK says to use the moves

- Learn and mostly use same key and ±1. Boosts are a spice: "every 20-30 minutes, but
  not ALL the time", when the room needs a lift or the next section should feel bigger.
  Jaws and Pay Attention are for peak moments, timed to a breakdown or build-up.
- Energy Level: stay or move one step; a bigger jump (9 → 5) is a deliberate reset.
  Their reading of Armin's Ultra 2017 set: 7 8 8 8 7 7 7 8 8 8 7 7 8 7 7. Skrillex drops
  to a 4 after a run of anthems, on purpose.
- The strong effect is both at once: Armin opens 12A → 7A (the semitone lift) while the
  Energy Level goes 7 → 8.
- Order of filters when picking the next track: key, then BPM, then Energy Level.

### What it means for this app

- A key lift and a tempo/intensity change are independent forces. Aligned, they hit
  harder; opposed, they cancel and the transition sounds smooth. Higher Love (4B, 107) →
  a slower 6B song is `+++` and is not a lift: the key steps up while the tempo falls.
- A `−−−` during a BPM climb is the same cancellation in reverse: legal, but it blunts
  the climb.
- **The hand-tuned set already does this, unplanned.** Of its four `+++`, two sit on a
  rise or level tempo (Try → I Want To Break Free +4.9; Stolen Dance → Stand By Me 0)
  and two cushion a fall (Counting Stars → Bloodstream −31; Higher Love → We Are Young
  −15). Its peak arrives on a `−` (I Want To Break Free → Pompeii, +18.5).
- The solver can't tell these apart: `+++` and `−−−` cost the same and the arc reads
  BPM only.
- Ideas, not decisions: score a transition's key direction against the arc's slope at
  that point; let a profile choose between aligning and cancelling; cap or space the
  `++`/`+++`/`(+++)` moves so they stay rare.

### Caveats

- No study was found showing that a key step up raises perceived energy.
- In 200,000 real DJ transitions (MixReady), two-step moves were under-represented:
  6.0% against 8.3% by chance. Direction was not split. Only 22% of transitions were
  Camelot-compatible at all (16.7% by chance).
- All of it comes from club DJing with long blends. With a gap between songs, the key
  lift is probably weaker than tempo and the song's own intensity.

### Where a per-track energy value could come from

| Source | Energy | Lookup | Cost | Fit |
|---|---|---|---|---|
| ReccoBeats | 0–1 | Spotify ID | free, no key | Already fetched with key and BPM. Accuracy not yet checked (§1). |
| SoundStat | 0–1 | Spotify ID | API key; pay per newly analysed track | A possible second opinion. CORS not checked. |
| Soundcharts | 0–1 | catalogue match | commercial | Too heavy for this app. |
| Cyanite | low/medium/high/variable, or 0–1 (sources disagree) | upload the audio | 5 free analyses a month, then quoted | No: needs the audio file. |
| Mixed In Key | 1–10 | none: written to the file's tags | desktop licence | No API. |
| GetSongBPM | none (tempo, key, danceability, acousticness) | name or its own ID | free with a backlink | No. |

- The Spotify-style `energy` is one model's guess at intensity, on its own scale. MIK's
  Energy Level is a different measure (high-frequency content and how aggressive the
  production is) and exists only in files the user owns.
- Nothing found gives MIK-style levels by Spotify ID. The realistic options are
  ReccoBeats energy as a hint, a second provider to cross-check it, or a value the user
  sets by hand like a key override.

### Sources

- MIK: [Energy Boost tutorial](https://mixedinkey.com/harmonic-mixing-guide/energy-boost-dj-mixing-tutorial/),
  [Camelot wheel](https://mixedinkey.com/camelot-wheel/),
  [changing energy with the wheel](https://mixedinkey.com/workflows/change-energy-with-camelot-wheel/),
  [Jaws Mix](https://mixedinkey.com/jaws-mix/),
  [Pay Attention Mix](https://mixedinkey.com/pay-attention-mix/),
  [Energy Level detection](https://mixedinkey.com/workflows/use-energy-level-detection/),
  [sorting by Energy Level](https://mixedinkey.com/harmonic-mixing-guide/sorting-playlists-by-energy-level/),
  [World's best DJs](https://mixedinkey.com/harmonic-mixing-guide/worlds-best-djs/)
- [MixReady: does mixing in key matter?](https://mixready.art/research/does-mixing-in-key-matter)
- [DJ.Studio: harmonic matches explained](https://help.dj.studio/en/articles/8118455-harmonic-matches-explained)
- Energy data: [SoundStat](https://soundstat.info/),
  [Soundcharts audio features](https://soundcharts.com/audio-features-api),
  [Cyanite API docs](https://api-docs.cyanite.ai/docs/legacy/classifier-overview/),
  [GetSongBPM API](https://getsongbpm.com/api)

## 5. User preferences (evidenced; don't extrapolate)

- The observed WCS set spans 78–127 BPM (most tracks 87–119). It's one set, not a rule.
- Arc over local smoothness: slow opener OK, one slow breather mid-set, close near a
  peak, not on the slowest song.
- Expects corrections to stick and wants to see where each value came from.
- Works from the printed chart, not rules of thumb.
