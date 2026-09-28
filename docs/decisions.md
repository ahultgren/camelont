# Decision log

Short ADR-style records. Add a new entry rather than rewriting an old one. When a
decision is reversed, mark the old one *Superseded by #N*.

---

### 1. Browser-only SPA, Spotify PKCE, no backend (2026-09-27)
**Context:** a personal tool for the owner and a few friends. **Decision:** static Vue SPA;
Spotify Authorization Code + PKCE in the browser; ReccoBeats called directly (CORS
verified open). **Consequences:** no shared storage, so overrides are per device
(→ #6). No client secret, so no Spotify endpoints that need one.

### 2. Spotify development mode, one Client ID at build time (2026-09-27)
**Context:** extended quota is only granted to organisations. **Decision:** reuse the
owner's existing Spotify developer app, add friends to its allowlist, and inject
`VITE_SPOTIFY_CLIENT_ID` at build time. **Rejected:** bring-your-own Client ID (too
technical for friends).

### 3. GitHub Pages, public repo `ahultgren/camelont` (2026-09-27)
Served at `https://andreashultgren.se/camelont/` (the owner's custom domain on their GitHub user site; HTTPS enforced). History-mode routing with a `404.html` fallback, base path `/camelont/`. The Client ID
isn't secret under PKCE; it's stored as an Actions *variable*.

### 4. The user's directional chart is the only rule set, kept as data (2026-09-27)
**Context:** the user replaced the textbook symmetric Camelot rule with their own chart
(see `domain/camelot-chart.md`). They may tweak it after experimenting. **Decision:**
the chart is data equal to `domain/camelot-chart.json`. Tests assert all 576 pairs
against that file. **Not built:** chart editing or selecting between charts.

### 5. Chart and profile are separate; the profile is data (2026-09-27)
**Context:** the user wants to experiment with priorities ("lots of +++"). **Decision:**
the chart says which moves exist; a `MixProfile` says what they cost, plus the tempo
weight and an optional arc. Only the default profile ships. Adding profiles later needs
no solver or chart change.

### 6. Overrides in IndexedDB with JSON export/import (2026-09-27)
**Rejected:** browser-only with no export (can't move between devices); storing in a
Spotify playlist description (hacky, 300-char limit).

### 7. Clashes are forbidden; the user resolves infeasibility (2026-09-27)
**Decision:** generated mixes contain only chart moves. If none exists, explain why
(blocking tracks and constraints) and let the user exclude tracks or change
constraints. **Rejected:** auto-suggesting a minimal removal set; a "fewest clashes"
fallback.

### 8. Constraints: start, end, follows, exclude (2026-09-27)
**Decision:** no positional pinning; the user doesn't think in positions. "A must be
followed by B" pairs may chain. **Rejected:** "track X at position N".

### 9. Energy arc is an optional, removable cost term; BPM signal first (2026-09-27)
**Context:** the hand-tuned "two waves" set is the quality bar, but the user isn't sure
how arcs should work yet. **Decision:** `arc.ts` holds presets (data) and signals
(functions), and contributes one term to `evaluate`. The signal is pluggable, so
ReccoBeats energy (unreliable: see research) can be added later. Removing arcs touches
one file and one term.

### 10. Tempo: relative gap, half/double tolerant, raw BPM displayed (2026-09-27)
**Rejected:** folding BPM into a profile tempo window; a hard max jump. The user fixes
displayed BPM with overrides.

### 11. Up to ~100 tracks, whole playlist; solver in a Web Worker (2026-09-27)
Beam search + legality-preserving local search, deterministic by seed, time-boxed.
**Not built:** choosing a subset from a large pool.

### 12. Mixes are not hand-editable (2026-09-27)
The user changes constraints and regenerates. The evaluator stays separate from the
solver anyway (it scores the reference orders), so editing could be added later.

### 13. Tailwind v4 + Reka UI + own components; the WCS pages' visual language (2026-09-27)
**Rejected:** full component libraries (generic look, heavy). Fonts, key hues and badge
colours carry over from `reference/charts/`.

### 14. English only, no i18n layer (2026-09-27)

### 15. Own thin Spotify client, no SDK (2026-09-27)
The official TS SDK targets routes removed in Feb 2026 (`/playlists/{id}/tracks`,
`POST /users/{id}/playlists`).

### 16. Feature-oriented architecture with enforced boundaries (2026-09-27)
**Context:** "Shortcuts proliferate." **Decision:** `app → pages → features → shared`,
features talk only via `index.ts`, each feature is split into `domain/api/model/ui`,
and eslint-plugin-boundaries makes violations fail CI. See `architecture.md`.

### 17. Saving always creates a new private playlist (2026-09-27)
The source playlist is never modified. Reordering in place isn't offered.

### 18. The chart image is not committed (2026-09-27)
It's a third-party image. The committed spec is the hand transcription
(`domain/camelot-chart.json`), cross-checked against the reference script with zero
mismatches over 576 pairs.

### 19. Self-hosted fonts (2026-09-27)
**Context:** the reference pages load Google Fonts, but the spec allows network calls only
to Spotify and ReccoBeats. **Decision:** bundle the three families via Fontsource.

### 20. The two-waves preset is modelled on the hand-tuned WCS set (2026-09-27)
**Context:** a generic two-hump curve scored the greedy order (82) better than the
user's hand-tuned order on the arc term, so it pulled mixes away from the quality bar.
**Decision:** the preset follows the hand-tuned shape (slow opener, peak about a third
in, breather, a second wave that dips, a high close). With it the solver rediscovers
the hand-tuned order as its best mix for the WCS set. Revisit when the owner has
opinions about arcs for other sets.

### 21. Key names follow the approved reference charts (2026-09-27)
Flats, except F♯ major and C♯/F♯ minor: `3B` is D♭ major (as in the reference charts
and the WCS fixture), not C♯ major as the reference script printed.

### 22. One set tempo per track, for scoring and display (2026-09-28)
**Context:** listed BPMs are sometimes double the danced tempo (Price Tag 175, We Are
Young 184.1). The pairwise half/double-tolerant gap scored those transitions as smooth,
but the charts plotted raw BPM, and the arc scored raw BPM, so it steered them onto
peaks and squashed everyone else's level. **Decision:** every BPM is folded once per set
into one octave (spec §5.2): the narrowest one-octave window holding the whole set,
placed where most tracks are listed. The tempo gap, the arc and all mix views use it,
with the listed BPM in parentheses. Track lists stay raw. **Rejected:** a per-mix line
chained from each neighbour's half/double match (order-dependent, so the arc and the
BPM range couldn't share it, and it drifted from the arc's scale); a reference BPM that
keeps the most tracks unfolded under the pairwise matcher (its window is 2.25× wide, not
an octave, and it left the owner's double-time tracks unfolded). Replaces the pairwise
gap of 10; a set with no clear gap between tempo groups may fold the wrong way, and an
override fixes it.
