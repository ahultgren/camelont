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
*Partly superseded by #41: a set may replace the playlist it saved before.*
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

### 29. Only hand-set values are marked; the full source is in the edit dialog (2026-10-10)
**Context:** the workspace's track rows are one line each, and a source badge on every
key and BPM was most of the noise. **Decision (owner):** a value set by hand carries a
small mark; an unmarked value came from ReccoBeats. Clicking the key or BPM opens the
edit dialog, which shows each value's full source. Relaxes the earlier rule that every
value shows its source wherever it appears.

### 30. Follow pairs are pinned or picked, not dragged (2026-10-10)
**Context:** with tracks grouped under several foldable playlists, the owner asked how
to connect two tracks, possibly from different playlists. **Decision (owner):** two
ways: a pin on the connector between two neighbours in the running order, and a
"Followed by…" button on a track row that arms it until the next row is chosen, showing
each candidate's chart move and refusing clashes. **Rejected as the main way:**
drag-and-drop (reads as reordering, fails when the target is folded or far away, no
keyboard path). It may come later as a shortcut for the second way.

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

### 32. A shared track goes to a playlist that would take it; marks are set-wide (2026-10-11)
**Context:** the first build gave a track to the first playlist that had it, even when
that playlist's BPM range left it out, so a track another playlist would have taken
stayed out of the set. **Decision (owner):** a track in several playlists is decided by
the first playlist that lets it in and has no limit, else by the first that lets it in
(it then competes for that playlist's limit), so it is in the set whenever some
playlist would take it. Exclude and must-include belong to the track: an excluded track
is excluded in every playlist. **Not built:** passing a track that wasn't picked on to
a later limited playlist (picks would then depend on each other in both directions).

### 33. Tracks are selected on the main thread; best fit answers from the worker (2026-10-11)
**Context:** `selectTracks` is synchronous and best fit is too slow for the main thread.
**Decision:** the selection runs on the main thread with the best-fit answers at hand; a
pick without an answer is worked out in the solver worker and the selection is made
again. Answers are kept by what they depend on (candidates, tracks in the set, count,
mix rules, the order handed on), so the arc or an unrelated edit never picks again.
**Rejected:** selecting and solving together in the worker (the track list would wait
for the mix to show its statuses, and the worker would need the sets feature, which
`mixing` must not import). **Cost:** one worker round trip per best-fit playlist that
picks again.

### 34. A stored chosen mix that is not on screen is forgotten (2026-10-11)
**Context:** the set remembers the chosen alternative (spec §8.5), but alternatives have
no identity across recalculations. **Decision:** the stored mix is shown on opening only
if it is one of the alternatives worked out then; after a change the best mix is shown.
In both cases a stored mix that differs from the shown one is removed from the set, so
"changed since the last save" reflects what a save would write. **Consequence:** opening
a set whose stored mix went stale (an override made elsewhere) edits the set.

### 35. The workspace UI belongs to the sets feature (2026-10-11)
**Decision:** the workspace's components live in `features/sets/ui/workspace`, with the
new edge `sets → mix-view`. The mix views stay ignorant of sets: they take the
highlighted track and the pinned transitions as props and report clicks as events.
The page only keys the workspace by set ID.

### 36. "Followed by…" gives a track its one follower, and refuses what can't work (2026-10-11)
**Decision:** choosing a follower for a track that already has one replaces it. While a
track is armed, a row can't be chosen if it would clash, already has a leader, would
close the chain, is the opener, is excluded or has no key; the closer, an excluded
track and a track without a key can't be armed. **Why:** the mistake is stopped on the
row instead of becoming a rule error to fix afterwards.

### 37. Saving to Spotify makes the saved mix the chosen one (2026-10-11)
So "changed since the last save" means exactly: a save now would write something else.

### 38. The track list is not virtualised (2026-10-11)
Rows stay in the DOM with `content-visibility: auto`. Measured once in Chromium with a
pool of 1,000 tracks and 100 in the set: the set opens in 1.6 s, and filter, mark, range
and arming each land in 0.1–0.3 s. **Rejected for now:** a virtual list (it complicates
keyboard focus, find-in-page and scrolling to a track from the chart). Revisit if real
pools feel slow.

### 39. Corrections export/import lives on the home page (2026-10-11)
Overrides belong to tracks, not to a set (spec §4), so their export and import sit with
the sets list rather than in a set's workspace.

### 40. Sets are written 50 ms after an edit (2026-10-11)
**Context:** the store gathered changes for 400 ms, and a write started while the page
is being left does not finish in Chromium, so an edit just before a reload was lost.
**Decision:** gather for 50 ms. That still joins the edits of one gesture and is over
before anyone can reload. **Not solved:** a write cut off mid-flight by leaving the page.

### 41. Saving asks for a name, and may replace the set's own earlier playlist (2026-10-11)
**Context:** every save created another playlist named after the set. Spotify allows
identical names, so nothing was overwritten, but saving a set several times left a row
of look-alike playlists, and the name couldn't be chosen. **Decision (owner):** Save to
Spotify opens a dialog with the playlist's name, warns when one of the user's playlists
already has it, and, when this set saved a playlist before, offers to replace that
playlist's tracks or create another. Only the playlist the set itself created can be
replaced, while it still exists, is the user's, and is no set's source. **Rejected:**
replacing any playlist with the same name (a collision with a hand-made playlist could
wipe it); never replacing (the duplicates were the complaint). Partly supersedes 17 and
assumption A7. **Unverified:** that the Feb 2026 API still has the replace-items and
change-details routes; if not, replacing is not offered.

### 42. Energy is shown on tracks before anything uses it (2026-10-11)
**Context:** ReccoBeats energy has been fetched since the start and was written off as
unreliable on one example (Brother, 78 BPM, 0.929), which the owner says is right.
Research (research.md §4) suggests energy as a second signal next to BPM. **Decision
(owner):** show each track's energy, out of 100, on the track row and the chart's hover
card, so its accuracy can be judged on real sets first. It can't be edited, and scoring,
the arc and the solver are unchanged. Amends the "unreliable" in decision 9.

### 43. A key is shown as its Camelot code; the key name is a tooltip (2026-10-11)
**Context:** every key was shown in both notations (`11B · A major`), a hard rule since
the first spec. On a track row and in the running order the name took more room than
the title could spare, and the energy had nowhere to go. **Decision (owner):** wherever
a key is shown, show only the Camelot code. The key name is the code's tooltip, and is
in the text for assistive tech (accessible names, sr-only text), which a tooltip
doesn't reach. The list of keys to choose from in the edit dialog still spells out both,
and messages name a track as "Bloodstream (2A)". **Not reachable by tooltip:** the
chart's hover card, which the pointer can't enter; its point's label, the track row and
the running order carry the name. Reverses the "both notations" rule of the first spec
and of CLAUDE.md.

### 44. Energy is a level from 0 to 10, coloured, editable, and in the running order (2026-10-11)
**Context:** decision 42 showed energy out of 100 with a small bar, read-only, on the
track row and the hover card. The owner finds that ReccoBeats energy matches how the
songs feel, and wants to read it at a glance and correct it. **Decision (owner):**
- Energy is shown as a whole number from 0 to 10 (ReccoBeats' 0–1, rounded). It stays
  0–1 in storage and in the code; `shared/music/energy.ts` is the one conversion.
- No bar. The number sits on a chip whose hue runs with the level: blue at 0, through
  green and yellow, to red at 10 (`hue = 220 − 22 × level`), at the saturation and
  lightness of a major key's chip. The chip's ink has a contrast of 4.8 or more on
  every level in both themes. The number is always shown, so colour is never the only
  carrier.
- Energy can be set by hand, in the same dialog as key and BPM ("Key, BPM and energy"),
  with the same pencil mark, source badge and "ReccoBeats says". It is part of an
  override, stored and exported as 0–1; overrides and files from before have no energy
  and read as "not set by hand".
- It is on every track line of the running order, in the hover card, and on the track
  row at phone width too (the key name made room, decision 43).

Scoring, the arc and the solver are unchanged: no mix uses energy, and a test holds
that. An edited energy is part of a mix request's cache key, so it asks the solver
again and gets the same mixes. **Chosen by the agent, for the owner to confirm:** whole
numbers (no decimal); a level is a pill and a key a rounded rectangle, to tell the two
coloured chips apart; an energy saved at the level ReccoBeats' value already shows is
not stored as an override. Amends 42.

### 45. Energy shapes a mix through three switches, as experiments (2026-10-11)
**Context:** the owner checked ReccoBeats energy by ear and it matches; it says more
about how a set feels than BPM, while BPM still decides what is danceable next to what.
The chart's `+`/`−` are the key's direction, a property of the transition, not of the
tracks (research.md §4). Which of these belongs in the cost, and how strongly, can only
be judged by listening. **Decision (owner):** build the candidates as separate terms the
user switches on next to the arc, to compare by ear before settling: the arc follows BPM
or energy; **energy steps** (a climb between neighbours costs, a fall much less); **key
lift** (a key move that goes with the change in energy is cheaper, one against it
dearer). Each is one term in `evaluate`, the tempo term stays in every combination, and
with all of them off the cost is what it was, so decision 44's "no mix uses energy"
holds until a switch is on. The weights are first guesses.
**Rejected for now:** separate named algorithms (three terms give eight combinations
and show which term does what); phases in place of a curve and a budget for big moves
(larger builds, to be judged after these); sliders for the weights (next, once it is
known which terms matter). **Open:** whether any of this becomes the default.
