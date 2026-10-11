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

### 23. The saved BPM is the only BPM; no automatic half/double (2026-10-08)
**Context:** the set tempo of 22 guessed which tracks were listed at double time. It
needed an octave-window heuristic, a second value per track in every mix view
(`87.5 BPM (listed 175)`) and a known case where it folds the wrong way. **Decision
(owner):** the algorithm never halves or doubles. The tempo gap, the arc, peaks, range
and all views use the BPM saved for the track (fetched, or the override), and the gap is
`|a − b| / max(a, b)`. The override dialog's Half/Double buttons are the fix for a
double-time track. Reverses 22 and the half/double tolerance of 10. **Consequence:** a
double-time track is scored and plotted as the fastest in the set until it is overridden.

### 24. The set is the unit of work; several playlists per set (2026-10-08)
**Context:** one playlist per mix made the owner prepare a playlist in Spotify before
every mix, and gave nowhere to keep choices. **Decision (owner):** the first page lists
*sets*. A set has a name, one or more playlists, per-playlist track choices (BPM range,
must-include/exclude marks, a limit with a pick method), mix settings and a chosen mix,
all stored in the browser. Spotify is written to only by "Save to Spotify". The
playlist page goes away; a set with one playlist and no choices is the old behaviour.
Reverses the "whole playlist" part of 11 and "picking a subset from a large pool" in
the old out-of-scope list. Exclusion moves from the mix constraints (8) to the set's
track choices.

### 25. A set works from a stored copy of its playlists, with a change notice (2026-10-08)
**Decision (owner):** adding a playlist stores its tracks in the set. On open the set
checks Spotify and reports "3 new, 1 removed"; nothing changes until the user presses
Update. **Rejected:** always following Spotify (a finished set could change by itself,
and marks would vanish silently); a manual Refresh with no notice (easy to mix a stale
list without knowing).

### 26. Per-playlist limits only; no set-wide size target (2026-10-08)
**Decision (owner):** the set is the sum of what each playlist contributes.
**Not built:** a set-wide track count or duration target. It can be added later as one
more step before the solver.

### 27. Picks are settled before ordering and shown to the user (2026-10-08)
**Context:** a limited playlist needs N tracks chosen, "randomly or best fit".
**Decision (owner):** the picks are made once, before the solver runs, so every
alternative mix has the same tracks. Best fit means fitting the rest of the set (chart
moves and tempo). A pick is visible and can be locked (must-include) or rejected
(exclude). Random picks are a stable draw with a Reshuffle. **Rejected:** letting the
solver choose while ordering (each alternative would have different tracks, which makes
them hard to compare, and the solver would have to stop visiting every track: a large
change to its pruning). **Consequence:** best-fit picks can change when another
playlist's choices change; the app says which.

### 28. The workspace is designed for a laptop (2026-10-08)
**Decision (owner):** sets are built on a laptop or desktop. The "mix stays in view, no
page scroll" promise holds from 1280 × 720 up. Phone width keeps every tool reachable
as tabs under a compact chart, without that promise.

### 31. Best fit: a place in one solved order, then an order-free added cost (2026-10-11)
**Context:** 27 left the best-fit score open. Two were compared, as the plan asked:
(a) cheapest legal insertion into the solver's best order of the fixed tracks, and
(b) a plain neighbour score (cheapest move in + cheapest move out, no ordering). Measured
on the WCS set (29 splits: 12 tracks fixed, 3 picked from the other 8) as the cost the
picks add to the solver's best mix, and as the share of picks that survive removing one
track from the set (WCS and a synthetic three-playlist pool):

| Score | Added cost, 87 picks | Picks kept after one removal |
|---|---|---|
| Solving once per candidate (reference; far too slow) | 15.7 | |
| (a) insertion into the solved order | 20.0 | 65–74% |
| **Chosen** | 31.5 | 88–96% |
| (b) neighbours | 62.9 | 95–98% |
| Random draw (mean of 5) | 132.9 | |

**Decision:** neither alone. `pickBestFit` (`mixing/domain/fit.ts`) ranks a candidate by
(1) whether it has *a place*: the clashes its best slot adds to one clash-free order of
the fixed tracks, from the solver; (2) its *added cost*: the cheapest `a → t → b` over
tracks of the set, less `a → b` when that is one of the two cheapest legal moves out of
a or into b, or a single legal move at an end of the order; (3) its ID. Picks are made
one at a time and join the set and the order, so later picks see earlier ones. With no
fixed tracks the first pick is the middle of the tightest group of candidates (best
possible seed in 4 of 6 trials). All costs are `transitionCost`; the solver is called,
not changed.
**Why not (a):** it scores best, but every edit to the set re-solves the order, and the
insertion costs with it: removing one unrelated track left the picks untouched in only
about 20% of cases (55–80% for the chosen score). The 0.13 it saves per pick is an
eighth of a `+` move. The order is still what proves a pick keeps the set mixable and
finds a track that bridges two groups of keys, so it is kept for that alone.
**Why not (b):** twice the added cost, and no way to tell a track with good neighbours
from one with a place: a track with cheap moves to two tracks that are never adjacent
scores well and makes the set unmixable (the `noPlace` test).
**Not scored: the arc and the mix rules' preferences.** Picks are track choices and
shouldn't change when the arc does (spec §8.4: "the same set and choices always give
the same picks"). Measured too: inserting under the full arc cost was noisy; a
lower-bound arc term halved the added cost under two waves on WCS (41 against 83) but
made no measurable difference on the pool, and the picks then moved with every tempo
in the set. The opener, closer and follow pairs only rule slots out; rules that don't
validate are ignored.
**Adversarial review (2026-10-11),** by an independent reviewer with scratch tests.
Fixed: (1) a track whose one good neighbour sits at an end of the order was charged
for two transitions, one of them a clash, and lost to worse tracks; an end now costs
one move. (2) "No place" was a false alarm for 11 of 12 flagged WCS candidates,
because one order has one slot per neighbouring pair. A flagged track that would win
on cost now gets a second opinion from the solver (at most four runs per call), and a
yes replaces the order. (3) An order with a clash in it (a caller's stale `order`, or
the fallback taken for invalid rules) turned any track that mended that clash into a
"bridge"; such orders are now refused and invalid rules ignored. (4) Costs are compared
on a 1e-9 grid instead of with a tolerance, which was not transitive. (5) The seed
search took 9 s for 50 picks from 1,000 candidates; now 1.1 s. Found solid:
determinism, independence of input order, single-track and ±1 BPM edits (never all
picks moved), mixability under valid rules (0 violations in about 1,300 random sets),
the seed against brute force, degenerate input.
**Known limits:** (i) A place is checked in one order. With the second opinions spent,
a track can still be marked as having none while another order has one; it is then
only picked last. (ii) The score prices a slot; it doesn't look for a track that lets
the solver rearrange the whole mix. On the synthetic singalongs (four tempo clusters,
mix cost 100) the picks added 0.2 as scored, while three random draws happened to
lower the total by 6–9. A track that joins two tempo clusters gets no credit either
(2–3 cost units in the reviewer's example). (iii) On sets of 35+ tracks with a wide
tempo spread the solver's own result moves by several cost units when one track is
added, more than the scores differ, so there the comparison only holds in aggregate.
(iv) The pool is synthetic; a real multi-playlist pool from the owner is still owed
(lesson of 2026-09-28). On it no simple rule dominates (the reviewer's sums over six
cases: chosen 10.2, insertion 10.6, plain neighbours −0.5), so the chosen score's
edge over (b) rests on the WCS set. (v) When the fixed tracks have no clash-free order,
bridging is judged against a greedy order: the reviewer's random sets missed 14–19% of
the rescues a single candidate could make, and 2 of 640 "bridges" didn't rescue.
(vi) A candidate with the key and tempo of a track in the set costs nothing, so
another release of a song already in the set is picked first.
**Cost:** one solver run (k = 1) plus a scan per pick: about 0.1 s for 45 fixed tracks
and 100 candidates, 0.3 s for 100 and 315 with 10 picks, 0.6 s for 10 picks from 1,000
and 2.4 s for 50. Run it in the worker with the solve. When several playlists pick in
turn, passing the previous call's `order` skips the solver run.
