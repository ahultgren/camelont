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
- [x] Component split in `architecture.md` (with Step 5)
- [x] Follow pairs: a pin on running-order connectors plus a two-click "Followed by…"
  from a row; no drag-and-drop (owner, 2026-10-10; spec §9.1)
- [x] "Remove from set" lives in a menu on the playlist header bar (spec §9.1)
- [x] Only hand-set values are marked on rows; the edit dialog, opened from the key or
  BPM, shows the full source (decision 29)
- [x] The prototype's phone board is out of date; redo it with Step 5
  → not redrawn on the canvas: the phone layout was built (tabs under the chart) and its
  screenshots are in `docs/reference/workspace/`

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
- [x] The planner takes its tracks, rules and arc from the set; left-out tracks go in as
  `excluded` so diagnostics can name ones that would unblock a mix (U7)
- [x] Keep the previous result while a new one is worked out (W3); change summary (W4)
- [x] Playlist change check on open (`snapshot_id`), notice, Update (U16)
- [x] Remember the chosen alternative (A9)

### Step 5 — workspace UI (after the layout is picked)
- [x] Home = sets list + New set; route `/sets/:id` (5a)
  - [x] `installSets` in `app/plugins.ts` and `src/test/render.ts`; route `/sets/:id`
    with a stub `SetPage` (name, playlists, pool sizes, not found / unreadable)
  - [x] `PlaylistPicker` selection mode (link mode kept for the old page)
  - [x] `sets/ui/SetsList`: rows, rename, duplicate, delete, unreadable sets, load and
    save errors; the home page shows it when logged in
  - [x] `sets/ui/NewSetDialog`: name + playlists, reads the tracks, progress, retry,
    skipped items; edge `sets → playlists`
  - [x] E2E for the sets flow; the old mixer's e2e opens `/playlists/wcs` directly
  - [x] Docs: `architecture.md`, `README.md`
- [x] Remove `PlaylistPage` and the `/playlists/:id` route (5b)
- [x] The chosen layout: playlists panel with track choices and the BPM range control
  (W8), one track list (W7), mix rules, arc, alternatives, mix views, cross-highlight (W6)
- [x] Phone variant (W10)

#### Review of 5a (2026-10-11)
`VITE_SPOTIFY_CLIENT_ID=ci-placeholder-client-id pnpm check` exits 0: 41 test files /
415 unit tests, 8 e2e. Nothing was run against real Spotify.

For 5b to pick up:
- `sets/ui/useCreateSet.ts` (reading playlists, then creating the set) and
  `sets/ui/set-summary.ts` (`poolSize`, `trackCountLabel`) sit in `ui/` only because
  `sets/model` and `sets/domain` belonged to the parallel session. Move them down.
- The stored copy is made with `snapshotId: null` (the items route gives none) and
  `readAt` from `Date.now()` (the store's clock isn't exposed). The change check needs
  the snapshot ID from somewhere.
- A set has no field for the items skipped when a playlist was read, so the count is
  shown once, in the New set dialog, and is gone afterwards.
- The store sets `loaded` a tick after the sets appear; show the sets before testing
  `loaded` (as `SetsList` and the stub `SetPage` do).
- After a delete, keyboard focus falls back to the page: `AppDialog` has no hook for
  where focus goes on close.
- The logged-out intro and `PlaylistPage`'s "← Your playlists" link still describe the
  single-playlist app.

#### Plan for 5b + 6 (2026-10-11)
Where the code goes: the workspace UI is `sets/ui/workspace/` (new edge `sets → mix-view`;
`mixing` and `mix-view` never import `sets`), on `useSetWorkspace`. `SetPage.vue` only
keys it by set ID. The app shell gives the route the full window.
- [x] 5a leftovers: `useCreateSet` → `model/`, `set-summary` → `domain/`, New set stores
  `snapshot_id` (reads through `usePlaylistReader`), intro text
- [x] Model: `addPlaylists` / `removePlaylist` / `removalOf`, `rename`, `recordSave` on
  `useSetWorkspace` (tests first); pure helpers in `domain/` (track list filter and sort,
  BPM histogram, follow-pair checks)
- [x] `mix-view`: highlight prop + event on chart, wheel and running order; pins on the
  running order's connectors; dense forms for the mix column
- [x] `mixing/ui`: dense alternatives and arc picker; remove `ConstraintsPanel`,
  `MixProblems`, `useMixPlanner`
- [x] Workspace: top bar, track column (playlist header bars, BPM range control, rows,
  toggle group, filter and sort, armed "Followed by…"), mix column (summary, headline,
  chart, alternatives, arc, pairs, wheel, running order, problems in place)
- [x] Add playlists, Remove from set with what goes with it, Update with what was dropped
- [x] Save to Spotify from the set; link, time, changed since
- [x] Phone: tabs under a compact chart
- [x] Remove `PlaylistPage`, `/playlists/:id`, `TrackTable`, what only they used
- [x] E2E as set flows; no-page-scroll test at 1280 × 720 and 1440 × 900
- [x] Screenshots in `docs/reference/workspace/`; docs; `pnpm check`

#### Review of 5b + 6 (2026-10-11)
`VITE_SPOTIFY_CLIENT_ID=ci-placeholder-client-id pnpm check` exits 0: 56 test files /
633 unit tests, domain line coverage 99.02%, build ok, 12 e2e (the 7 screenshot tests
are skipped unless `SHOTS=1`). Nothing was run against real Spotify.

What was built is described in `docs/architecture.md` ("The workspace page"); the
screenshots are in `docs/reference/workspace/`.

Measured in Chromium against the built app, a pool of 1,000 tracks with 100 in the set:
the workspace opens in 1.6 s; typing a filter, marking a row, setting a range and arming
"Followed by…" each land in 0.1–0.3 s; one task over 50 ms (101 ms) in the whole run.

Choices where the spec left room (for the owner to confirm):
- Giving a track that already has a follower another one replaces the first; a track
  can't be chosen as a follower when it would clash, has a leader already, would close
  the chain, is the opener, is excluded or has no key. The closer, an excluded track
  and a track without a key can't be armed.
- Saving makes the saved mix the chosen one (so "saved" holds until the set gives
  another mix or gets another name).
- The BPM range's handles snap to whole BPM; the end of the scale means "open".
- Range and limit fields commit on Enter or when left, not per keystroke.
- The status filter and the sort apply inside every playlist; a click on a track in the
  chart, the running order or a pair clears a filter that hides its row.
- The workspace has no Log out button; it is on the sets list.
- Export and import of corrections moved to the home page.
- The headline also shows the mix's length in minutes.
- Two columns from 1024 px; below that the phone layout.

Left open:
- An edit made in the last ~0.4 s before a reload could be lost: the sets store wrote
  400 ms after an edit and its write on `pagehide` does not complete in Chromium (found
  by the e2e, which waits for the write). Narrowed after the merge: the store now
  writes 50 ms after an edit. A write cut off by leaving the page is still lost.
- Keyboard: every row control, chart point and running-order row is a tab stop. It all
  works, but a pool of 1,000 is a long way to tab; arrow-key navigation inside the list
  would be the fix.
- Sorting is ascending only.
- After deleting a set on the home page, focus still falls back to the page (from the
  review of 5a).
- The app's JavaScript is one 530 kB chunk (the workspace is imported by the home
  page's feature index); splitting it is a build concern, not done.

### Step 6 — save and ship
- [x] Save to Spotify from the set (name = set name); link, time, "changed since" (§8.5)
- [x] E2E: create a set from two playlists, range + marks + limit, mix, reopen, save;
  playlist-changed notice; infeasible path. All mocked
- [x] Docs: `architecture.md`, `CLAUDE.md` intro, `setup.md`; `pnpm check` green
- [ ] Owner verifies against real Spotify (agent can't log in)

## Fixes after the owner's first real session (2026-10-11)

- [x] Key and BPM on a track row look clickable (pointer, hover, focus)
- [x] Entering or clearing a limit moves no other control in the playlist header
- [x] Save to Spotify asks for the playlist's name, warns about an existing playlist
  with that name, and offers replace-or-create when the set saved before (spec §8.5,
  decision 41)

### Review (2026-10-11)
- **Key and BPM**: a pointer, a frame on hover, "Edit key and BPM" in the tooltip and the
  accessible name; every button in the app now has a pointer (Tailwind 4 leaves them
  without). The row keeps its height (checked in the e2e).
- **Header**: every control right of the playlist's name has a fixed width and the pick
  method a place that is kept when it isn't shown; notices went to a line of their own
  under the controls. An e2e compares positions to the pixel at 1280, 1440 and 375 px.
- **Save**: built as spec §8.5 and decision 41 say; the rules as built are in
  `docs/architecture.md` ("Save" under the workspace page).

Not verified: `PUT /playlists/{id}/items` and `PUT /playlists/{id}` against real Spotify
(the Feb 2026 API is only known to have GET items, POST /me/playlists and POST items).
If the first answers 404 or 405 the dialog says replacing isn't available and offers a
new playlist. Nothing here was run against real Spotify.

Choices made, for the owner:
- A save that fails half-way is remembered: the playlist stays the set's own with no
  mix counted as saved, so the next save replaces it from the start instead of leaving
  a second half-filled playlist. This also covers a new playlist that was created but
  not filled.
- When the tracks were replaced but Spotify didn't take the new name, the save counts
  and the dialog says so; the set remembers the name the playlist still has.
- Only playlists the user owns count for the duplicate-name warning and for replacing;
  a collaborative playlist of someone else's does neither.
- After a 404/405 on replacing, that dialog offers only a new playlist; opening the
  dialog again tries afresh.


## Change — show each track's energy (2026-10-11)

The owner wants to spot-check ReccoBeats energy before anything uses it. Display only:
no scoring, arc or solver change.

- [x] `shared/ui/EnergyMeter`: energy 0..1 as a short bar and a number out of 100;
  unknown shown as such
- [x] Track row: energy after BPM (laptop width; a phone row has no room)
- [x] Chart hover card: energy after BPM
- [x] Tests, spec U3 and §9.1, architecture, decision 42; `pnpm check` green

### Review (2026-10-11)
- The value was already fetched and stored (`TrackFeatures.energy`), so only the display
  is new: `EnergyMeter` on the track row and in the chart's hover card.
- Hidden on a phone's track rows: the second line is full. The hover card shows it at
  every width.
- Screenshots retaken (the phone ones didn't change). `pnpm check` green.
- Not done: energy in the running order (its titles are already cut short), editing
  energy, any use of it in scoring.


## Change — Camelot-only keys, and energy as an editable 0–10 level (2026-10-11)

The owner's five points. No change to scoring, the arc, the solver or the chart data:
energy stays unused by the mix.

Keys (decision 43):
- [x] `KeyChip` shows the Camelot code only; the key name is its tooltip and sr-only text
- [x] Track row, running order (track lines and connectors), hover card (key and
  "from 12B"), edit dialog ("ReccoBeats says"; the select keeps both notations)
- [x] Problem and rule messages name a track as "Bloodstream (2A)"
- [x] CLAUDE.md, spec (U3, §7, §9.1), architecture; tests; screenshots

Energy (decision 44):
- [x] `shared/music/energy.ts`: the one conversion between stored 0..1 and the shown
  level 0–10, the words for it, and the hue of a level
- [x] `Override.energy` (0..1): `mergeFeatures`, `overridden`, import merge, the store's
  "nothing left to store" rule
- [x] zod: stored overrides and export files without `energy` still load (old-shape tests)
- [x] A test that tracks differing only in energy give the same mixes and costs
- [x] `EnergyChip` replaces `EnergyMeter`: no bar, a chip whose hue runs with the level,
  the number always shown; unknown shown as such
- [x] Edit dialog: energy field with source and what ReccoBeats said; wording "Key, BPM
  and energy" everywhere the dialog is named
- [x] Track row: energy is a way into the dialog like key and BPM, with the pencil when
  set by hand; shown at phone width too
- [x] Running order: energy on every track line; hover card keeps it
- [x] Spec, architecture, README; tests; screenshots looked at in light and dark,
  laptop and phone (contrast)
- [x] `pnpm check` green; merged into `main`

### Review (2026-10-11)
- **Keys.** `KeyChip` is the one place: the Camelot code, the key name as tooltip and
  sr-only text. Track rows, the running order (its connectors got a tooltip with both
  names), the hover card and "ReccoBeats says" in the dialog follow from it; messages
  say "Bloodstream (2A)". The key's options in the dialog keep both notations. The key
  wheel already showed codes with the name in a tooltip and its label.
- **Energy.** 0..1 in the code and in storage, a level 0–10 on screen and in the
  dialog, with `shared/music/energy.ts` as the only conversion. `EnergyChip` replaces
  `EnergyMeter`: a pill with the number, hue 220 − 22 × level. Contrast of the ink on
  the chip, computed for every level: 5.1–12.0 light, 4.8–11.3 dark.
- **Editing.** `Override.energy`, merged field by field; the pencil on the row, the
  source badge and "ReccoBeats says … energy 7" in the dialog. A record or a file
  without the field reads as `energy: null` at the zod boundary (tested with old-shape
  records in the repo, the import and a workspace test), so no version was bumped.
- **No mix changed.** `solve.test.ts` runs the WCS set with its fetched energies, with
  none and with two other spreads, with and without an arc: same orders, same costs.
  A workspace test sets an energy and finds the mix as it was.
- **Looked at:** the retaken screenshots at 1280 × 720 and 1440 × 900 in light and dark,
  the edit dialog in both (new: `edit-dialog-*.png`), and the phone's track list and
  running order in both (the dark phone views and the hover card only in passing, not
  kept). Energy fits a phone row.
- A snag on the way: an sr-only span inside a scrolling list stretched the page until
  the chip that holds it became `position: relative` (the "page never scrolls" e2e
  caught it).

Not verified: nothing here was run against real Spotify or ReccoBeats.

Merged into `main` from this worktree. The owner's folder was on `mix-experiments` by
then and stays there (his choice); that branch still has to take `main` in, with
conflicts in the docs and the screenshots to resolve.

Choices made, for the owner:
- Whole numbers, no decimal. The WCS set's known energies land on 4, 6, 7, 8 and 9.
- A filled chip, not a coloured number, and a pill so it isn't taken for a key.
- The dialog and everything naming it say "Key, BPM and energy"; "needs key/BPM" and
  "Set key and BPM of …" stay, since a mix needs only those two.
- The hover card writes "· energy" before the chip, since a bare number says little
  there; the card's key name can't be a tooltip (the pointer can't enter the card).
- An energy saved at the level ReccoBeats' value already shows is not stored.
