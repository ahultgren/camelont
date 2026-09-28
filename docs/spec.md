# Camelont — product spec

This document describes the **intended end state** of the app. It changes only when the
product intent changes, not as work progresses. Progress lives in `tasks/todo.md`; the
reasoning behind choices lives in `docs/decisions.md`.

## 1. Purpose

Camelont reorders a Spotify playlist into a **harmonically mixed set** using the Camelot
system and the user's own directional compatibility chart. It proposes several valid
mixes, shows each as a BPM/key progression chart, and saves the chosen one as a new
Spotify playlist.

The first user is a West Coast Swing DJ/dancer mixing 15–100-track playlists. The app
runs entirely in the browser: no backend, Spotify login via OAuth PKCE.

## 2. Users and access

- The owner plus friends allowlisted in the Spotify developer dashboard (Spotify
  development mode). One Spotify Client ID, configured at build time.
- Only playlists the logged-in user **owns** (or collaborates on) can be mixed. Spotify
  returns no track list for followed playlists. Those are listed but disabled, with an
  explanation: copy the playlist into one you own in Spotify first.

## 3. User stories

| # | As a user I can… | Acceptance |
|---|---|---|
| U1 | log in with Spotify and stay logged in across reloads; log out | PKCE with `state`; the token refreshes silently; logout clears all tokens. |
| U2 | choose a playlist from my account | Paginated list with name, image, track count and owner; searchable; followed playlists disabled with the reason. |
| U3 | see every track's key and BPM, with where each value came from | Each track shows its Camelot code **and** key name ("11B · A major"), its BPM, and a source badge (ReccoBeats / manual). Tracks with no data are clearly marked. |
| U4 | correct or fill in a track's key/BPM | Edit dialog: Camelot key, BPM, optional note or source. The override persists on this device and always beats fetched data. Export/import all overrides as JSON. |
| U5 | mix the playlist using the Camelot system | Generates mixes where **every** transition is a move in the chart (§5). Runs off the main thread, and the UI stays responsive at 100 tracks. |
| U6 | set constraints | Start track, end track, "track A must be followed by track B" (repeatable, forms chains), excluded tracks. |
| U7 | understand why no mix is possible | If no clash-free order exists, the app names the blocking tracks or constraints in plain language (e.g. "Bloodstream (2A) can only follow 12A and precede 1B; none are available"). The user fixes it by excluding tracks or changing constraints. |
| U8 | choose between different possible mixes | Several distinct valid mixes, side by side, each with a tempo sparkline and stats: move distribution, peaks, opener and closer, BPM range, total cost. |
| U9 | explore a mix | Tempo-arc chart with a move badge between points and a hover/tap card per track; a key wheel; a running order with transition connectors (§7). |
| U10 | choose a mixing profile, optionally with an energy arc | Default profile = the reference weights (§5.3). Arc presets: none, two waves, steady build. |
| U11 | save a mix as a new playlist in my account | Creates a **new private** playlist with the tracks in mix order and links to it. The source playlist is never modified. |

## 4. Track data

- Spotify's audio-features endpoint is closed to new apps. Key, mode, tempo and energy
  come from **ReccoBeats** (`GET https://api.reccobeats.com/v1/audio-features?ids=…`),
  called directly from the browser (CORS is open).
- Coverage is partial (~15% of tracks missing), and keys are sometimes wrong, especially
  relative major/minor swaps at the same wheel number. So:
  - manual overrides are first-class, persisted locally (IndexedDB), exportable and
    importable as JSON, and always win over fetched data;
  - every value shows its source;
  - fetched features are cached locally, so a playlist isn't refetched on every visit.
- A track without a key or BPM can't be mixed. It is flagged until the user fills it in
  or excludes it.
- Track lists show BPM **raw**. Half- and double-time are handled in the comparison
  (§5.2), and a user who wants a different value sets an override.
- Mix charts and the running order show BPM **as the comparison matched it**: a track
  compared with its neighbour at half or double time is plotted at that tempo, so the
  line shows what the scoring saw. The listed BPM is shown alongside, e.g.
  `87.5 BPM (listed 175)`.

## 5. Mixing rules

### 5.1 The chart (fixed rules)

The user's directional Camelot compatibility chart decides which transitions are legal
and what each one is called. It is specified in `docs/domain/camelot-chart.md`, and the
canonical data is `docs/domain/camelot-chart.json`, a transcription of the original
chart image verified against the reference script for all 576 key pairs.

Moves: `perfect`, energy boost `+`/`++`/`+++` (plus a weaker `(+++)` alternative),
energy drop `−`/`−−`/`−−−` (plus a weaker `(−−−)`), and `mood` change. **Anything not in
the chart is a clash, and clashes are never allowed in a generated mix.**

The chart is directional: `8A → 8B` is `+`, `8B → 8A` is `−`, and `2A → 3B` is a clash
while `1B → 2A` is `perfect`.

### 5.2 Tempo

The relative tempo gap between neighbours, tolerant of half/double time:

```
gap(a, b) = min(|a − b|, |2a − b|, |a − 2b|) / max(a, b)
```

### 5.3 Profiles (tunable scoring)

A profile turns a mix into a cost, and lower cost is better. It is kept separate from
the chart, so the scoring can change without touching the rules. A profile contains:

- a cost per move. The default reproduces the reference script: perfect 0; `+`/`−` 1;
  `+++`/`−−−` 2; `++`/`−−` 3; `(+++)`/`(−−−)`/mood 4;
- a tempo weight (default 20, so a 10% gap ≈ one `+++`);
- an optional **energy arc**: a target curve over set position (presets: two waves,
  steady build), a signal it applies to (BPM at first, as the set tempo: halved or
  doubled into the octave most of the set is listed in; energy can be added later), and
  a weight.

Mix cost = Σ transitions (move cost + tempo weight × gap) + arc weight × Σ deviation of
the signal from the target curve. Only the default profile ships at first. The design
must allow more profiles later (e.g. "favour +++") without changing the chart or the
solver.

### 5.4 Constraints

Start track, end track, ordered "A → B" follow pairs (chains allowed), and exclusions.
Follow pairs that form a cycle, branch (A → B and A → C), or are themselves a clash are
reported as constraint errors before solving.

### 5.5 Alternatives

The solver returns up to *k* (default 5) valid mixes, best cost first. They must be
**meaningfully different**: two mixes that share most of their adjacencies count as the
same mix. Results are deterministic for the same input and seed.

## 6. Non-functional requirements

- **No backend.** Static SPA on GitHub Pages; everything else runs in the browser.
- **Privacy.** Tokens and overrides stay on the device. Nothing is sent anywhere except
  Spotify and ReccoBeats. Only the scopes needed are requested:
  `playlist-read-private playlist-read-collaborative playlist-modify-private`.
- **Performance.** A 100-track playlist gives its first results within ~2 s on a laptop.
  The solver runs in a Web Worker.
- **Resilience.** Honour Spotify `429 Retry-After`. ReccoBeats failures degrade to
  "missing data", never to a crash. All external payloads are validated at the boundary.
- **Accessibility.** Keyboard reachable, and chart points focusable with labels. Colour
  is never the only carrier of meaning: move badges carry a symbol, keys carry text.
- **Responsive.** Works at phone width; charts scroll horizontally when needed.
- **Themes.** Light and dark, following the system.

## 7. Visual language

Carried over from the reference pages in `docs/reference/charts/`, which are the look the
user already approved:

- Fonts: Bricolage Grotesque (headings), IBM Plex Sans (body), IBM Plex Mono (numbers,
  keys, codes).
- Cool indigo neutrals; accent `#3A4BD8`; ok `#2E7D5B`; warn `#B4540F` (light theme; full
  token set in the reference HTML).
- **Key colour is derived from the wheel:** `hue = ((n − 1) × 30 + 330) mod 360`. Major
  (B) and minor (A) share the hue at two lightness levels.
- **Move badges:** `=` perfect (green), `+ ++ +++` boost (accent), `− −− −−−` drop (muted),
  `~` mood (warn). A `✗` clash exists only when evaluating an imported or legacy order.
- **Every key is shown in both notations** wherever it appears: `11B · A major`.
- **Tempo-arc chart** (the primary view): x = set position, y = BPM (auto-ranged), a line
  through the points coloured by key, a move badge above each segment, optional arc
  target curve, hover/tap/focus card (position, title, artist, Camelot + key name, BPM,
  the move into this track and where it came from).
- **Key wheel:** two rings (outer major, inner minor); used keys filled with their
  colour and a count (`7B×5`).
- **Running order:** track cards with a connector between each pair (from → to key,
  move name, BPM delta), coloured like the badges.

## 8. Out of scope (for now)

Hand-editing a generated mix (drag/reorder); picking a subset from a large pool;
multiple languages; a backend or shared storage; modifying existing playlists; playback;
automatic BPM halving; a second data provider or in-browser audio analysis; public
(non-allowlisted) access.

## 9. Likely future directions

These shape the design without being built: more profiles ("lots of +++", stricter
tempo), energy as an arc signal, user-drawn arcs, chart tweaks, second-opinion key data
with relative-key-swap warnings. Keep the seams (chart as data, profile as data, arc as
a separate scoring term, provider behind an interface) so these slot in cleanly.
