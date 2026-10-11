# Plan

What to build is in `docs/spec.md`, and how in `docs/architecture.md`. This file
tracks **progress only**. Tick items as they land. Each phase ends with `pnpm check`
green and a commit.

## Phase 0 — Scaffold & tooling
- [x] Scaffold Vite + Vue + TS with pnpm (`packageManager` pinned, `.nvmrc` = 24); strict tsconfig per architecture.md
- [x] Vite config: base `/camelont/`, dev server `127.0.0.1:5173`, `@/` alias → `src/`
- [x] ESLint flat config (typescript-eslint strict-type-checked, vue, **boundaries** with the layer/feature rules) + Prettier
- [x] Vitest (happy-dom, Testing Library, MSW setup file) + coverage threshold on `**/domain/**`
- [x] Playwright (Chromium, runs against `vite preview`, route-mock helpers for Spotify/ReccoBeats)
- [x] Tailwind v4 via `@tailwindcss/vite`; tokens from `docs/reference/charts/` (light + dark), fonts
- [x] `src/app/config.ts` (zod-validated env), router with empty pages, Pinia, Vue Query
- [x] Empty feature folders with `index.ts` so the boundaries config is exercised; one deliberate violation test proving lint catches it (then remove)
- [x] lefthook (pre-commit: format + lint staged; pre-push: typecheck + unit)
- [x] GitHub Actions: `ci.yml` (lint, typecheck, unit, build, e2e), `deploy.yml` (Pages, uses `vars.VITE_SPOTIFY_CLIENT_ID`), `404.html` fallback
- [x] Update `docs/setup.md` script table to match `package.json`

## Phase 1 — Shared kernel
- [x] `shared/music`: `CamelotKey`, parse/format, `fromPitchClass` (anchors in camelot-chart.md), `keyName`, `keyHue`
- [x] `shared/lib`: seeded PRNG, `assertNever`
- [x] `shared/api`: fetch wrapper (auth header hook, 429 Retry-After, zod parse, typed errors), `paginate`
- [x] `shared/storage`: `KeyValueStore` port, IndexedDB + in-memory adapters
- [x] `shared/ui`: AppButton, AppCard, KeyChip (both notations + hue), MoveBadge, StatTile, EmptyState

## Phase 2 — Mixing domain (test-first, before any UI needs it)
- [x] Copy fixtures: `docs/domain/camelot-chart.json`, `docs/reference/wcs-set.json` → `src/test/fixtures/`
- [x] `chart.ts` + test: all 576 pairs equal the JSON; spot checks
- [x] `tempo.ts`, `profile.ts` (DEFAULT_PROFILE = reference weights)
- [x] `evaluate.ts` + tests: hand_tuned = 9 perfect / 7 boost / 3 drop, clash-free; script_greedy clash-free; stats (peaks, opener/closer, BPM range)
- [x] `constraints.ts` + validation errors
- [x] `arc.ts` (presets none/two waves/steady build, BPM signal)
- [x] `solver/`: digraph, chain collapse, beam + scarcity, local search, diversity, time box. Tests: WCS set solvable; start/end/follows/exclude respected; determinism by seed; beats greedy's cost
- [x] `diagnostics.ts` + tests (e.g. constrain the WCS set so Bloodstream has no legal neighbour)
- [x] Worker + Comlink wrapper, `useMixer` with cancellation

## Phase 3 — Auth
- [x] PKCE (verifier, S256 challenge, state), callback route, token store, refresh with single-flight, 401 retry, logout, route guard
- [x] Tests: MSW for token endpoint; state mismatch rejected

## Phase 4 — Playlists
- [x] `GET /me/playlists` paginated; own/collaborative vs followed (disabled + reason); search; track counts
- [x] `GET /playlists/{id}/items` paginated → domain `Track[]` (skip local files / episodes / null items, report them)

## Phase 5 — Track features
- [x] ReccoBeats client (batches of 40, match by `href`, `key < 0` = unknown, zod)
- [x] Features cache + overrides repo (IndexedDB, versioned schema), merge with per-field provenance
- [x] Override edit dialog (Camelot picker showing both notations, BPM, note)
- [x] Export/import JSON (zod-validated, merge strategy: incoming wins, reported)

## Phase 6 — Mix UI
- [x] Playlist → tracks view with data status + "fix missing" flow
- [x] Constraints panel (start, end, follows, exclude)
- [x] Candidate comparison cards (sparkline + stats), infeasibility view with diagnostics
- [x] Mix explorer: tempo-arc chart (move badges, hover/focus card, arc curve), key wheel, running order with connectors

## Phase 7 — Save
- [x] `POST /me/playlists` (private, name "<source> · Camelot mix", description with profile) → `POST /playlists/{id}/items` batches of 100 → link

## Phase 8 — Ship
- [x] E2E happy path + infeasible path, all mocked (plus PKCE login, guard, 404.html)
- [ ] Deploy to Pages (runs on merge to `main`); owner verifies against real Spotify (agent can't log in)
- [x] Review section below

## Review

**State (2026-09-27):** Phases 0–7 built; Phase 8 E2E done. `pnpm check` is green:
lint incl. boundaries, format, typecheck, 216 unit/component tests (domain line
coverage 98%), build, 5 Playwright specs. Everything external is mocked.

**Not verified:** nothing has run against real Spotify or ReccoBeats. A cloud session
can't log in. Before relying on it, the owner should, on the Pages deploy or locally:
1. log in (checks the redirect URIs and scopes in the dashboard);
2. open a real playlist: check track counts and that followed playlists are disabled
   (the `/me/playlists` count field is read from `items.total` or `tracks.total`,
   since the Feb 2026 shape wasn't confirmed);
3. check ReccoBeats data loads (CORS, batch size 40);
4. save a mix and confirm a new **private** playlist appears and the source is
   unchanged.

**How it went against the plan:**
- The solver is beam search with scarcity pruning, an exact 1-D arc bound, or-opt +
  swap local search and edge penalties for diversity. On the WCS set it beats greedy
  and, under "two waves", returns the user's hand-tuned order as the best mix. 100
  tracks take about 1 s in-process.
- The two-waves preset had to be reshaped after the hand-tuned set (decision #20); a
  generic two-hump curve preferred the greedy order.
- Key names follow the approved charts (3B = D♭ major), not the script (decision #21).
- Test tooling surprises: typescript-eslint doesn't support TypeScript 7 (pinned 6.0);
  eslint-plugin-boundaries v7 has a new config format; a `step="0.1"` BPM input
  rejects valid tempos in happy-dom and could in browsers (now `step="any"`).

**Open questions for the owner:**
- The arc weight (8) and diversity threshold (30% of transitions differ) are first
  guesses; try them on real sets.
- Mixes re-solve automatically 250 ms after any change. If that feels jumpy, a
  "Generate" button is a small change.

## Fix — one set tempo for scoring and display (2026-09-28)

- [x] Charts plotted raw BPM while scoring matched half/double time (first fix: a
  per-mix chained line)
- [x] The arc scored raw BPM (first fix: a majority reference; broke on the owner's set)
- [x] Adversarial review: the reference window was 2.25× wide, results flipped on small
  edits, chart and arc scales drifted apart
- [x] `setTempo`: narrowest one-octave window for the set, placed where most tracks are
  listed; owner's playlist as a regression fixture, plus a stability test
- [x] Tempo gap, arc, chart, sparkline, running order, peaks, range and opener/closer all
  use the set tempo (spec §5.2 changed with the owner's approval; decision #22)

**Review:** on the owner's playlist Price Tag folds to 87.5 and We Are Young to 92.05;
everything else, including Brother (78) and Shut Up and Dance (129.9), is unchanged.
Known limit: a set with two tempo groups and no clear gap between them (e.g. only ~80
and ~120) may fold the wrong way; an override fixes it.

## Change — use the saved BPM only, no automatic half/double (2026-10-08)

Owner's request: the algorithm never halves or doubles a BPM by itself. The only BPM
used is the one saved for the track (fetched, or the override). The Half/Double buttons
in the override dialog stay as the manual fix.

- [x] Tests first: `tempoGap` is the plain relative gap; evaluator, arc and views use
  the saved BPM (a 175 next to 88 is a big gap, a peak and the top of the range)
- [x] Remove `setTempo`; `transitionCost`, the arc signal and the solver read `track.bpm`
- [x] Remove `EvaluatedMix.tempo` and the "(listed …)" display from the mix views
- [x] Docs: spec §4 and §5.2, architecture, decision #23 (reverses #22 and the
  half/double part of #10)
- [x] `pnpm check` green

**Review:** `setTempo`, `EvaluatedMix.tempo`, `ArcScale` and `listedBpm` are gone;
`tempoGap` is `|a − b| / max(a, b)` and everything reads `track.bpm`. On the owner's
playlist Price Tag (175) and We Are Young (184.1) now count as the fastest tracks until
they are halved with an override. Not run against real Spotify.


## Change — sets and a workspace (started 2026-10-08)

Owner's request: (1) work in *sets* built from several playlists, with per-playlist
track choices, stored locally and saved to Spotify only on demand; (2) a workspace where
the effect of every choice is visible at once. Spec: §3 (U2, U11–U16), §8, §9.
Decisions 24–28.

### Step 0 — spec and requirements
- [x] Read the current spec, architecture, decisions and page code
- [x] Owner's answers: per-playlist limits only; stored copy + change notice; picks
  settled before ordering and visible; laptop first
- [x] Rewrite `docs/spec.md` (§1, §3, §4, §5.4, §5.5, §6, new §8 Sets, new §9 Workspace)
- [x] Decisions 24–28
- [x] Owner confirmed the assumptions below (2026-10-10)
- [x] Commit the spec on the `sets-and-workspace` branch

### Assumptions (confirmed by the owner 2026-10-10)
Proposed by the agent and written into the spec; the owner approved them as a whole.

| # | Assumption | Spec | Why |
|---|---|---|---|
| A1 | A track is in a set at most once. **Changed by the owner 2026-10-11:** it is decided by the first playlist that lets it in (unlimited ones first), so it is in the set whenever some playlist would take it; an exclude applies in every playlist (decision 32) | §8.2 | A set shouldn't play a song twice. Replaces today's "duplicates are separate entries". |
| A2 | Tracks without key/BPM are left out and flagged; they no longer block the mix. Only a must-include track without data blocks | §4, §8.3 | With ~15% missing and several playlists, "fix or exclude each one first" would mean dozens of clicks before the first mix. **Changes today's behaviour.** |
| A3 | A track named as opener, closer or in a follow pair counts as must-include | §5.4 | Otherwise narrowing a BPM range or a re-pick silently breaks a rule. |
| A4 | Must-include tracks count toward the limit; if they exceed it they're all in and nothing more is picked | §8.4 | Matches the owner's example (limit 3, one must-include → that one plus two). |
| A5 | BPM range is per playlist only; no set-wide range | §8.3 | As described by the owner. A set-wide default is easy to add if repeating it gets tedious. |
| A6 | Random picks are a stable draw with a Reshuffle button | §8.4 | Picks that change on every recalculation would make the mix jump on unrelated edits. |
| A7 | Saving again creates another new playlist; the set remembers the last link and whether it changed since | §8.5 | Keeps "never modify a playlist" absolute. |
| A8 | No export/import of sets yet (sets live in one browser) | §8.6, §10 | Not asked for. Overrides keep their export. |
| A9 | The chosen alternative is remembered; when inputs change the best new mix is shown | §8.5 | Alternatives have no identity across recalculations. |
| A10 | Best fit ranks against the tracks that are in the set anyway; playlists pick in the order they were added, each seeing the earlier picks | §8.4 | Deterministic and explainable. The exact score is settled in Step 3 on real data. |

### Step 1 — workspace layout prototypes (parallel; no repo changes)
- [x] Three layout directions for §9 on a Design canvas, same realistic state in each
  (several playlists, a range, marks, a limited playlist with picks, five alternatives),
  plus the sets list and a phone variant
- [x] Owner picked the refined direction C (2026-10-10): two columns, playlists as
  header bars on the track list, the mix on the right. Recorded in spec §9.1. It is
  guidance for layout only; the owner finds the prototype's look ugly, so the visual
  design follows spec §7 and the existing components
- [ ] Component split in `architecture.md` (with Step 5)
- [x] Follow pairs: a pin on running-order connectors plus a two-click "Followed by…"
  from a row; no drag-and-drop (owner, 2026-10-10; spec §9.1)
- [x] "Remove from set" lives in a menu on the playlist header bar (spec §9.1)
- [x] Only hand-set values are marked on rows; the edit dialog, opened from the key or
  BPM, shows the full source (decision 29)
- [ ] The prototype's phone board is out of date; redo it with Step 5

### Step 2 — sets domain and storage (parallel with 1 and 3; new files only)
New feature `features/sets`. Proposed edges: `sets → playlists, track-features, mixing`
(record in architecture.md and `FEATURE_EDGES` when built).
- [x] `domain/types.ts`: set, playlist copy, track choices, marks, mix settings, chosen
  mix, last save
- [x] `domain/select.ts` (test first): the §8.3 rule table as one pure function →
  per-track status + reason, per-playlist counts; the pick method is injected
- [x] `domain/random-pick.ts`: stable seeded rank per track (a change in the pool moves
  only the picks it must)
- [x] `domain/playlist-diff.ts`: stored copy vs Spotify → added, removed, and which
  marks and rules a removal drops
- [x] `api/`: sets repository on `KeyValueStore` (`camelont-sets`, `{ v: 1, data }`,
  zod; an unreadable set is reported, not dropped)
- [x] `model/`: sets store (list, create, rename, duplicate, delete, save-as-you-go)

### Step 3 — best-fit ranking (parallel with 1 and 2; `mixing/domain`, new file)
- [x] `mixing/domain/fit.ts` (test first): rank candidate tracks against the tracks
  already in the set, using `moveBetween`, `transitionCost` and `tempoGap` (no second
  scoring implementation). Start from cheapest legal insertion into the best order of
  the fixed tracks; compare with a plain "legal neighbours + tempo distance" score
  → `pickBestFit`; a hybrid won (decision 31)
- [x] Fixtures: the WCS set plus a real multi-playlist pool from the owner (lesson of
  2026-09-28); a stability test (small edits don't reshuffle every pick); edge cases
  (no fixed tracks at all, every playlist limited, nothing insertable)
  → the pool is synthetic (`fit.pool.fixture.json`); **a real pool is still owed**
- [x] Adversarial review of the heuristic before it is wired in
  → five fixes and six known limits, recorded in decision 31

### How steps 4–6 are split (2026-10-11)
Three sessions, the first two in parallel:
- **4** the workspace's model: selection, best fit off the main thread, planner, change
  summary, playlist change check. No pages.
- **5a** the home page: sets list, New set, `/sets/:id` with a stub page, `installSets`.
  The old playlist page stays reachable by URL until 5b replaces it.
- **5b + 6** (after 4 and 5a are merged) the workspace page per spec §9.1, Save to
  Spotify from the set, removing the playlist page, e2e and docs.

### Step 4 — wire sets into mixing
- [ ] The planner takes its tracks, rules and arc from the set; left-out tracks go in as
  `excluded` so diagnostics can name ones that would unblock a mix (U7)
- [ ] Keep the previous result while a new one is worked out (W3); change summary (W4)
- [ ] Playlist change check on open (`snapshot_id`), notice, Update (U16)
- [ ] Remember the chosen alternative (A9)

### Step 5 — workspace UI (after the layout is picked)
- [ ] Home = sets list + New set; routes `/sets/:id`; remove `PlaylistPage` and the
  `/playlists/:id` route
- [ ] The chosen layout: playlists panel with track choices and the BPM range control
  (W8), one track list (W7), mix rules, arc, alternatives, mix views, cross-highlight (W6)
- [ ] Phone variant (W10)

### Step 6 — save and ship
- [ ] Save to Spotify from the set (name = set name); link, time, "changed since" (§8.5)
- [ ] E2E: create a set from two playlists, range + marks + limit, mix, reopen, save;
  playlist-changed notice; infeasible path. All mocked
- [ ] Docs: `architecture.md`, `CLAUDE.md` intro, `setup.md`; `pnpm check` green
- [ ] Owner verifies against real Spotify (agent can't log in)
