# Architecture

How the app is built. The *what* is in [`spec.md`](spec.md) and the *why* is in
[`decisions.md`](decisions.md). This document is kept up to date as the code evolves.

## Stack

| Concern | Choice |
|---|---|
| Package manager / runtime | pnpm (via corepack, pinned in `packageManager`), Node 24 LTS (`.nvmrc`) |
| Build | Vite |
| UI | Vue 3 (`<script setup lang="ts">`, Composition API only) |
| Language | TypeScript 6.0 (typescript-eslint does not support 7 yet), `strict` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`; `vue-tsc` for type checks |
| Routing | vue-router, history mode, base `/camelont/`; `404.html` copy of `index.html` for GitHub Pages deep links. Routes: `/` (intro and login, or the sets list, with export and import of corrections), `/callback`, `/sets/:id` (a set's workspace; `meta.fullScreen`: it lays out the whole window itself) |
| Client state | Pinia (setup stores) |
| Server state | TanStack Vue Query (Spotify + ReccoBeats reads; caching, retries, dedupe) |
| Validation | zod, at every boundary: Spotify, ReccoBeats, IndexedDB reads, JSON import |
| Persistence | IndexedDB via `idb-keyval`, behind a `KeyValueStore` port |
| Worker | Web Worker via Vite's `new Worker(new URL(…), { type: 'module' })` + Comlink |
| Styling | Tailwind CSS v4 (`@tailwindcss/vite`), design tokens as CSS custom properties in `@theme` (`src/app/styles.css`); fonts self-hosted via Fontsource; Reka UI for accessible primitives (dialog, combobox, tooltip, …) when needed; own components |
| Charts | Hand-built SVG Vue components (no chart library); tiny local scale helpers |
| Unit/component tests | Vitest + @testing-library/vue + happy-dom; MSW for HTTP |
| E2E | Playwright (Chromium) against the Vite preview build; Spotify + ReccoBeats mocked via `page.route` |
| Lint/format | ESLint flat config (typescript-eslint strict-type-checked, eslint-plugin-vue recommended, eslint-plugin-boundaries) + Prettier |
| Hooks | lefthook: pre-commit = lint-staged style format + lint on staged files; pre-push = typecheck + unit tests |
| CI/CD | GitHub Actions: `ci.yml` (lint, typecheck, unit, build, e2e) on PRs and `main`; `deploy.yml` (build → GitHub Pages) on `main` |

## Source layout

```
src/
  app/                 bootstrap: main.ts, App.vue, router, query client, pinia, global CSS/tokens, layout
  pages/               one component per route; composes features, holds no business logic
  features/
    auth/              PKCE login, callback, token store + refresh, route guard, logout
    playlists/         list own playlists, load playlist items, save mix as new playlist
    track-features/    ReccoBeats provider, overrides repo, merge → TrackFeatures, edit dialog, import/export
    mixing/            chart, profiles, evaluator, constraints, arc, solver (+ worker), diagnostics; constraint + candidate UI
    mix-view/          tempo-arc chart, key wheel, running order (with pins), hover card
    sets/              the set (playlist copies, track choices, marks, mix settings), which tracks are in it, the workspace
  shared/
    music/             Camelot kernel: CamelotKey type, parse/format, fromPitchClass, keyName, keyHue
    api/               fetch wrapper (base URL, auth header injection, 429 Retry-After, zod parse, typed errors), paginate()
    storage/           KeyValueStore port + IndexedDB adapter + in-memory adapter (tests)
    ui/                base components: AppButton, AppCard, KeyChip, EnergyMeter, MoveBadge, StatTile, EmptyState, …
    lib/               seeded PRNG, string hash, assertNever, small pure helpers
e2e/                   Playwright specs + fixtures + route mocks
docs/                  spec, architecture, decisions, domain, research, reference
```

### Feature anatomy

Every feature has the same shape. Leave out folders a feature doesn't need, but never
invent new top-level ones:

```
features/<name>/
  domain/     pure TypeScript: types, rules, algorithms. No Vue, no I/O. Most tests live here.
  api/        I/O: HTTP clients, zod schemas, DTO → domain mapping. No Vue.
  model/      Pinia stores, Vue Query composables, composables wiring domain + api.
  ui/         Vue components for this feature.
  index.ts    the public API. The only file other layers may import.
```

Tests sit next to the code (`foo.ts` + `foo.test.ts`). Shared test fixtures live in
`src/test/fixtures/` (e.g. the WCS set copied from `docs/reference/wcs-set.json`, and
the chart JSON).

### Dependency rules (enforced by eslint-plugin-boundaries)

```
app → pages → features → shared
```

- `shared/*` imports nothing from `features`, `pages` or `app`.
- A feature imports `shared/*` and **other features only via their `index.ts`**. No
  circular feature dependencies. Allowed edges today: `playlists → auth`,
  `mixing → track-features`, `mix-view → mixing, track-features`,
  `sets → playlists, track-features, mixing, mix-view` (the set workspace reads
  playlists, looks up key and BPM, picks and mixes, and shows the mix with mix-view's
  chart, wheel and running order; `mixing` and `mix-view` never import `sets`). Adding
  an edge is a design decision: record it here.
- Inside a feature: `ui → (model, domain)`, `model → (api, domain)`, `api → domain`;
  `domain` imports only `shared/music` and `shared/lib`. `ui` may use domain types and
  pure helpers (e.g. move metadata), never `api`.
- Cross-feature imports come from a feature's `ui` or `model` only; `api` and `domain`
  stay self-contained (e.g. `mixing/domain` defines its own `MixTrack` input instead of
  importing `TrackFeatures`).
- `domain/`, `shared/music` and `shared/lib` import no packages at all (no Vue, no I/O);
  a separate `no-restricted-imports` rule enforces this, since boundaries only governs
  local files.
- Test helpers in `src/test/` (MSW server, fixtures) may be imported only by `*.test.ts`.
- `pages` import features and shared, never feature internals.

The rules live in `eslint.config.ts` (`FEATURE_EDGES` lists the cross-feature edges).
If you need to break a rule, the design is wrong. Move the code (usually down into
`shared` or into the owning feature's public API) instead of adding an eslint-disable.

## Data flow

```
Spotify ──(auth: PKCE)──▶ playlists/api ──▶ Track[] (id, uri, title, artists, durationMs)
                                              │
ReccoBeats ──▶ track-features/api ──┐         ▼
IndexedDB overrides ────────────────┴─▶ track-features/model: merge → TrackFeatures
                                              │  (camelot, bpm, energy?, source per field)
                                              ▼
mixing/model ── MixRequest {tracks, constraints, profileId, k, seed} ──▶ Worker(solver)
                                              │
                                              ▼
                         MixResult {candidates: EvaluatedMix[]} | Infeasible {diagnostics}
                                              │
                          mix-view (charts)  ◀┘ ──▶ playlists/api: save as new playlist
```

The same flow for a set (the workspace, `sets/model/useSetWorkspace`):

```
sets store (IndexedDB) ──▶ MixSet: playlist copies, track choices, marks, mix rules, arc
        │                        ▲ every edit, as it is made
        │ pool track IDs         │
        ▼                        │
track-features/model ──▶ key + BPM per track (overrides applied)
        │
        ▼
sets/domain selectTracks ◀── best-fit answers ◀── Worker(pickBestFit), one playlist at a time
        │ Selection: status per track, counts, tracks in the set, blockers
        ▼
problems found without the solver (rule errors, must-include without data, empty set)
        │ none
        ▼
MixRequest {tracks in the set + left-out tracks as excluded, rules, arc} ──▶ Worker(solver)
        │
        ▼
view: mix (alternatives, the shown one) | problems, kept until the next one is ready
        + what the update changed (ChangeSummary)

Spotify ──(playlists/api readPlaylist)──▶ change notice per playlist ──(Update)──▶ MixSet
```

- Domain types never carry DTO shapes. `api/` maps DTOs to domain types.
- Track identity everywhere is the Spotify track ID (22-char base62). Duplicates of the
  same track in one playlist are treated as distinct *entries* (`entryId` = the track ID
  for the first occurrence, `<trackId>#2`, `#3`… for later ones; position-independent)
  but share features by track ID.
- Playlist items that can't be mixed (local files, episodes, removed tracks) are
  skipped and counted, so the UI can say what was left out.

## Track features (`features/track-features`)

- `domain/features.ts`: `FetchedFeatures` (the provider's answer, including "not
  found"), `Override` (null fields are not overridden), and `mergeFeatures` → per-field
  `Sourced<T> { value, source: 'reccobeats' | 'manual' }`. Overrides always win, field by
  field. A track is mixable only with both a key and a BPM.
- `api/reccobeats.ts` implements a `FeatureProvider` (the seam for a second opinion):
  batches of 40, rows matched by `href`, each row validated on its own, `key < 0` →
  no key, BPM rounded to 0.1.
- `api/repositories.ts`: the features cache and the overrides repo on the
  `KeyValueStore` port (IndexedDB databases `camelont-features` and
  `camelont-overrides`). Records are `{ v: 1, data }`; anything that fails the zod
  schema reads as missing. "Not found" answers are retried after a week.
- Export/import: a versioned JSON file (`app: "camelont", kind: "track-overrides",
  version: 1, overrides: [...]`), validated with zod; on import the incoming values
  win, and the report counts added, updated and unchanged overrides.
- `model/`: `installTrackFeatures(app)` wires storage and the provider;
  `useOverridesStore` (Pinia); `useTrackFeatures(trackIds)` reads the cache, fetches
  the rest per batch (a failed batch degrades to missing data plus a message), and
  merges with overrides. `isLoading` is true from the moment the list of track IDs
  changes until the answer for that list is there (an answer says which list it is
  for), so a caller can hold what it showed instead of treating new tracks as lacking
  data.
- `ui/`: `OverrideDialog` (key, BPM with Half and Double, a note; next to each field a
  `SourceBadge` says where the value in use came from, and what ReccoBeats answered is
  quoted above them) and `OverridesTransfer` (export and import, on the home page). The
  track list itself belongs to the set workspace, which marks only hand-set values on a
  row (decision 29) and opens this dialog from a row's key or BPM.

## Mixing engine (`features/mixing/domain`)

The heart of the app, pure TS and fully unit tested.

- `types.ts`: `MixTrack { id, label, camelot, bpm, energy }`, the engine's own input
  (the entry ID, a label for messages, and the features). `mixing/model` maps merged
  track features to it, so the domain never imports another feature.
- `chart.ts`: `Move` union (`perfect | boost1 | boost2 | boost3 | boost3Alt | drop1 |
  drop2 | drop3 | drop3Alt | mood`), `MOVE_META` (symbol, label, tone; plus `clash`
  for evaluating given orders), the chart as wheel arithmetic (the table in
  `camelot-chart.md`), and `moveBetween(from, to): Move | null`. A test asserts all 576
  pairs equal the JSON.
- `profile.ts`: `MixProfile { id, name, moveCost: Record<Move, number>, clashCost,
  tempoWeight, arc: ArcConfig | null }`. `DEFAULT_PROFILE` reproduces the reference
  weights; `withArc(profile, arc)` applies the user's arc choice.
- `tempo.ts`: `tempoGap(a, b)`, the relative gap between two saved BPMs (spec §5.2).
  Nothing halves or doubles a BPM; scoring and every view read `track.bpm`.
- `arc.ts`: `ArcConfig { preset, signal, weight }`; presets are data (piecewise-linear
  target curves over position 0..1); signals are functions `MixTrack → number | null`
  (BPM first), normalised over the set's range. `arcTermCost` is the per-track term.
  Removing arcs means deleting this file and the one term in `evaluate`.
- `evaluate.ts`: `evaluateMix(order, profile) → EvaluatedMix` (transitions with move +
  cost, transition cost, arc cost + target curve, total cost, clash count, stats: move
  and tone histograms, peaks, opener, closer, BPM range). `transitionCost` and the arc
  term are the primitives. **The solver and the UI both use these.** They are the
  single source of truth for scoring; a test checks the solver's path cost equals
  `evaluateMix` exactly.
- `constraints.ts`: `MixConstraints { start, end, follows: [from, to][], excluded }`
  and `validateConstraints` → typed errors (unknown/excluded track in a constraint,
  start = end, self-follow, clash pair, branch out/in, cycle, start with a required
  predecessor, end with a required successor, a chain joining start to end too early),
  plus `describeConstraintError` for plain-English messages.
- `solver/`:
  1. `problem.ts`: collapse follow-chains into blocks (a block's in-key is its first
     track, its out-key its last) and build the legal-move digraph between blocks.
     Clashes are never edges. Edge and arc costs are precomputed from `evaluate.ts`.
  2. `search.ts`: beam search over partial paths. Each state tracks, per unvisited
     block, how many predecessors and successors are still available; a block that
     can no longer be reached, two blocks that can only follow the current one, or too
     many dead ends prune the state (this is how low-degree tracks like Bloodstream
     get placed instead of stranded). States are ranked by cost so far + a lower bound
     on the rest (cheapest incoming edges + an exact 1-D bound on the arc term) + a
     scarcity penalty (Warnsdorff-style). Extensions are pre-ranked by a cheap
     estimate and only the most promising are materialised. A depth-first search with
     the same pruning is the fallback when the beam loses every path.
  3. `local-search.ts`: or-opt (move 1–3 blocks) and pairwise swaps, keeping every
     edge legal, under the full objective including the arc.
  4. `diversity.ts` + `solve.ts`: up to k + 1 rounds; each round penalises the edges
     earlier results used, so later rounds explore different orders. Keep the top k by
     cost where each pair differs in at least 30% of adjacencies.
  Deterministic given `seed` (`shared/lib/prng`). An 8 s time limit is a safety net
  only (results are deterministic unless it's reached); 100 tracks take about 1 s.
- `diagnostics.ts`: when no path is found, explain it. Structural checks: tracks with
  no possible neighbour at all, tracks nothing can precede (or follow) given the start
  (end), more such tracks than can open (close) the mix, and several tracks competing
  for the same only neighbour. Each names excluded tracks that would fit. Otherwise a
  generic "no clash-free order was found" message listing the tightest tracks as
  exclusion candidates.
- `fit.ts`: `pickBestFit({ fixed, candidates, count, profile, constraints?, order? })`
  → the picks, a score for every candidate, and the order used. It chooses a limited
  playlist's best-fit tracks before the solver orders anything (spec §8.4, decision 31).
  Picks are made one at a time, each seeing the earlier ones, by: (1) *a place*: the
  clashes the track's best slot adds to one clash-free order of the fixed tracks
  (`solveMix` with k = 1, or the caller's `order` when playlists pick in turn), so a
  pick with a place cannot make a mixable set unmixable, and a track that mends a
  clash of an unmixable set comes first; (2) *added cost*: the cheapest
  `a → track → b` over tracks of the set, less `a → b` when b is one of a's two
  cheapest legal successors (or a one of b's two cheapest predecessors), or one legal
  move at an end of the order; (3) the ID. A track with no slot in that one order that
  would win on cost gets a second opinion from the solver (at most four per call).
  With no fixed tracks it starts from the middle of the tightest group of candidates.
  Every cost is `transitionCost`; the arc is ignored on purpose, and mix rules that
  don't validate are ignored. The solver is not changed. It costs one solver run plus
  a scan per pick: about 0.1 s for 45 fixed tracks and 100 candidates, 0.3 s for 100
  and 315 with 10 picks, 2.4 s for 50 picks from 1,000, so it belongs in the worker
  next to the solve.
- `model/solver.worker.ts` exposes `solve(request)` and `fit(request)` (best fit holds a
  solver run of its own, so it never runs on the main thread) via Comlink;
  `model/solver-client.ts` starts one worker per run (cancel = terminate) and has a
  client for each: `SolverClient` and `FitClient`, both injectable through
  `installMixing`, both falling back to an in-process client where there is no
  `Worker`. `model/useLatestRun` runs one piece of work at a time and drops a result
  that was superseded; `useMixer` (solve) and `useFitter` (best fit) are that, with
  their client. The worker imports `domain/` only, never a feature's `index.ts`, so no
  UI code ends up in its bundle.
- `profile.ts` `profileForArc(choice)` is the default profile with the user's arc
  choice (`ArcChoice`: a preset or none). `describeDiagnostic(d, name, wording?)` can
  call the tracks kept out of the mix something other than "excluded" and stop naming
  them after a few; a set can leave hundreds out.

**Required tests using the WCS fixture:** the `hand_tuned` and `script_greedy` orders
evaluate as clash-free with the documented move counts (hand-tuned: 9 perfect, 7 boost,
3 drop). The solver finds clash-free orders for the full set, respects each constraint
type, beats greedy from the same opener, matches the hand-tuned order under the
two-waves profile, and reports Bloodstream-style bottlenecks when made infeasible. The
chart equals the JSON for all 576 pairs.

## Mix views and mixing UI (`mixing/model`, `mixing/ui`, `mix-view`)

These know nothing about sets: they take a mix and say what the user did. The set
workspace (below) composes them.

- `mixing/model/mix-input.ts` maps tracks + merged track features to `MixTrack`s and
  sets aside the ones without data. `useMixer` and `useFitter` run the solver and best
  fit one at a time (`useLatestRun`); the clients are injectable (`installMixing`) and
  fall back to in-process ones where there is no `Worker`.
- `mixing/ui`: `CandidateList` (the alternatives as a radio group of small cards:
  number, cost, a tempo sparkline, moves by kind; BPM range, peaks, opener and closer
  are in each card's label and tooltip) and `ArcPicker` (a segmented radio group).
- `mix-view`: `TempoArcChart` (hand-built SVG; key-coloured dots, a move badge per
  segment, the arc target dashed, each point focusable with a full `aria-label`, and a
  card on hover/tap/focus with the track's key, BPM and energy), `KeyWheel` and `RunningOrder` (a line per track and a
  connector per pair: keys, move, BPM change). Pure geometry lives in
  `mix-view/domain/layout.ts`.
  - **One track, everywhere (W6).** Each of the three takes `highlighted` (a track ID)
    and emits `point` (the track under the pointer or with focus, or null); the chart
    and the running order also emit `select` on a click. The chart marks the track with
    a ring and a guide line, the wheel outlines its key (and points at the first track
    of a key), the running order tints its row and scrolls it into view when the
    pointing happens elsewhere.
  - **Pins.** `RunningOrder` takes `pinned` (pairs of track IDs) and emits `pin` /
    `unpin` from a toggle on each connector: "keep these two together" (spec §9.1).
  - **Size.** The chart is drawn 1:1 at the width of its box (measured with a
    `ResizeObserver`) and the `height` it is given; once a track would get less than
    20 px it grows wider than the box and scrolls sideways inside it. Position numbers
    thin out to every fifth when they no longer fit.
- Saving: `mixing/domain/describe.ts` builds the playlist's description (moves, BPM
  range, profile, arc; ≤ 300 characters). `playlists` writes: `api/save.ts` has
  `createPlaylist` and `replacePlaylist`, each returning its outcome as a value, and
  `api/spotify-api.ts` the calls under them (`createPrivatePlaylist`, `addItems`,
  `setItems`, `updateDetails`) and `playlistAccess` (whose a playlist is now: mine,
  not mine, gone). `model/usePlaylistSaver` hands them out and refreshes the list of
  playlists after a write. Which playlist may be written to is not decided there: see
  "Save" under the workspace page.
- `playlists/ui/PlaylistPicker` lists the user's playlists (searchable; followed ones
  are shown but can't be used, with the reason). Each row is a checkbox and
  `v-model:selected` holds the chosen playlists in the order they were ticked, named
  above the list so a search can't hide them. `taken` disables playlists a set already
  has. New set and the workspace's Add playlists both use it.

## Sets (`features/sets`)

The set is the unit of work (spec §8). Its `domain/` and `api/` use the feature's own
shapes and import no other feature. `model/` is where a set meets the rest of the app:
it reads playlists (`playlists`), looks up key and BPM (`track-features`) and picks and
mixes (`mixing`), mapping to and from those features' types in `model/mix-request.ts`.
A set names a track by its track ID (it holds a track once), and that ID is the mixer's
entry ID. `ui/` uses the playlists feature (to choose playlists, and to save), the
track-features feature (the edit dialog), `mixing`'s alternatives and arc picker and
`mix-view`'s chart, wheel and running order: the workspace is where they meet.

- `domain/types.ts`: `MixSet { id, name, createdAt, editedAt, playlists, marks, mix,
  chosenMix, lastSave }`. A `SetPlaylist` is the stored copy of a Spotify playlist (its
  tracks as read, `snapshotId`, `readAt`, and `skipped`: the local files, episodes and
  unavailable tracks the copy leaves out) plus its `TrackChoices { bpmMin, bpmMax, limit,
  pick: 'random' | 'bestFit', seed }`. `marks` (`mustInclude | exclude`) are keyed by
  track ID on the set: a mark belongs to the track, in every playlist that has it. `MixSettings` holds
  opener, closer, follow pairs and the arc choice; `ChosenMix` the track order;
  `LastSave` the link, the time, and the name and order that were written.
- `domain/set-summary.ts` (`poolSize`, the sets list's track count), `domain/skipped.ts`
  (what a copy leaves out, in words).
- `domain/track-list.ts`: `visibleRows(rows, facts, { text, status, sort })`, the one
  track list's filter (words in title or artist, accents folded; in the set / left out /
  needs data) and sort (playlist order, BPM, key in wheel order; rows without the value
  last), applied inside each playlist (W7).
- `domain/bpm-histogram.ts`: a playlist's BPM distribution on a scale of whole steps
  (5 BPM, wider for a wide spread), which bars a range lets through, and the mapping
  between a place on that scale and a range end: the scale's own end means "open" (W8).
- `domain/follow.ts`: follow pairs as a row makes them (spec §9.1). `followBlock(rules,
  from, to)` says why `to` can't follow `from` (itself, follows it already, has a
  leader, would close the chain, is the opener), `armBlock` why a track can have no
  follower (the closer), `withFollower` gives a track its follower in place of the one
  it had. Whether the pair is a chart move is asked of `mixing` in `ui/`.
- `domain/set.ts`: `newSet`, `addPlaylist` (a playlist is in a set once), `duplicateSet`
  (a deep copy that hasn't been saved to Spotify), `ruleTrackIds` (the tracks named in a
  mix rule) and `saveState` → `never | saved | changed`: a set has changed since its
  save when saving now would write another name or track order.
- `domain/select.ts`: `selectTracks(input) → Selection`, the rules of spec §8.2–8.4 and
  **the only place that decides which tracks are in a set**. Input: the playlists with
  their choices, the marks, the rule track IDs (they count as must-include), key and BPM
  per track, and a `PickFn`. An excluded track is out in every playlist that has it. A
  playlist *lets a track in* when the track is must-include, or has key and BPM with the
  BPM inside that playlist's range. One playlist *decides* each track: the first that
  lets it in and has no limit, else the first that lets it in (there it counts toward
  the limit or competes for a place; a track that isn't picked is not passed on). The
  first pass settles every status that needs no pick; the second lets the limited
  playlists that have more candidates than places pick, in the order they were added.
  Each `PickRequest` carries the playlist's method and seed, how many to pick, the
  candidates (the tracks that playlist decides, minus must-includes), and the tracks
  already in the set: everything settled in the first pass, in any playlist, plus
  earlier picks. The answer is held to its contract (candidates only, never more than
  asked). When no more tracks are available than the limit leaves room for, they are all
  in, no pick is made, and earlier picks see them as in the set. Output: a row per
  playlist track with the status that playlist shows: the deciding playlist the real one
  (`in | mustInclude | picked | notPicked`), another playlist that would take the track
  `duplicate` with the deciding playlist, and a playlist that wouldn't its own reason
  (`outsideRange | needsData`); `excluded` shows in all. Also counts per playlist by the
  status its rows show, `statusByTrack` (the deciding playlist's status), the tracks in
  the set in pool order (a track sits where its deciding playlist lists it), and the
  blockers (must-include tracks without key or BPM). `statusLabel` puts a status in the
  spec's words.
- `domain/random-pick.ts`: the random pick method. `randomRank(seed, trackId)` is a
  hash of both (`shared/lib` `hashString` seeding the PRNG), and `randomPick` takes the
  lowest ranks. A rank doesn't depend on the other candidates, so the same seed gives the
  same picks and a track joining or leaving the candidates changes at most one pick.
  Reshuffle is a new seed.
- `domain/playlist-diff.ts`: `diffPlaylist(set, playlistId, fresh)` → tracks added and
  removed (by track ID, each once; a new order is no change) and what an update would
  drop; `playlistRemoval(set, playlistId)` gives the same answer for removing a whole
  playlist. `Dropped` lists the tracks that leave the pool, their marks, and the mix
  rules naming them. A track another playlist of the set still has leaves nothing
  behind. `updatePlaylist` and `removePlaylist` make the change through the same
  function, so what is announced is what is dropped. `describeDropped` puts a
  `Dropped` in words, a line per kind, for the Remove confirmation and for the note
  after an Update. The chosen mix is not touched
  here: it is checked against the current selection when it is read (track data can
  change outside the set too).
- `domain/select-set.ts`: `selectForSet(input, bestFitAnswers)` is `selectTracks` with
  the real pick methods: the random draw, and best fit from the answers at hand. Best
  fit runs in a worker, so an answer may not be there yet: the first pick without one
  comes back as `missing` and the selection is then a draft, in which every status
  that needs no pick (and so the blockers) is final.
- `domain/edits.ts`: every edit the workspace makes, as a function for the store's
  `update`: `withBpmRange`, `withLimit`, `withPickMethod`, `withMark`, `withOpener`,
  `withCloser`, `withFollow`, `withoutFollow`, `withArc`, `withChosenMix`, `withSave`
  (the last save, with the saved mix as the chosen one), and
  `roleOf` / `withRole` for the row's toggle group (spec §9.1: at most one of opener,
  closer, must-include, exclude). An edit returns the same set when nothing changes
  and replaces only the part it changes; the workspace relies on that to know what to
  redo.
- `domain/mix-problems.ts`: what stops a mix before the solver is asked, in the set's
  words: `excludedInRules` (a mix rule naming an excluded track is an error that names
  the rule, spec §5.4), `describeBlocker` (a must-include track without key or BPM,
  with the mark or rule that keeps it in), `describeEmptySet`. The rules themselves
  (cycles, branches, clashing pairs) are checked by `mixing`'s `validateConstraints`.
- `domain/change-summary.ts`: `summariseChange(before, after)` (spec W4) compares two
  settled states (tracks in the set, picks per playlist, the shown mix): tracks that
  joined and left, picks that went out and came in per playlist, tracks and cost
  before and after, whether the order changed. A pick change is a track that came or
  went through a pick: a locked pick, or a track that stays when a limit arrives, is
  none. `describeSummary` words it for the page: tracks before → after, who joined and
  left, each playlist's picks out and in (a track that came or went through a pick is
  named there, not twice), and the cost before → after.
- `domain/set.ts` also has `chosenIndex(chosen, alternatives)`: the stored mix is used
  only if it is one of the alternatives as they are now (track data can change
  outside the set). `playlist-diff.ts` has `describeChange` → "3 new, 1 removed".
- `api/repository.ts`: `createSetsRepo(store)` on the `KeyValueStore` port (IndexedDB
  database `camelont-sets`), one record per set, keyed by set ID and shaped
  `{ v: 1, data }`. `all()` returns `{ sets, unreadable }`: a record that fails the zod
  schema, has another version, or sits under the wrong key is reported as an
  `UnreadableSet { id, name, problem }` and left in storage untouched, never dropped or
  half-loaded (spec §6). `put` validates before writing, so nothing is stored that
  couldn't be read back.
- `model/`: `installSets(app, options)` wires storage and the injectable clock, ID and
  seed sources (called from `app/plugins.ts`; tests get in-memory storage through
  `src/test/render.ts`). `useSetsStore` (Pinia) holds the sets as immutable values: `list` (newest edit
  first), `get`, `unreadable`, `create({ name, playlists })`, `rename`, `duplicate`,
  `remove`, `addPlaylist`, `reshuffle`, and `update(id, change)` for everything else,
  where `change` is a pure function such as `removePlaylist`. There is no save step
  (spec §8.6): `update` stamps the edit time and the set is written about 50 ms later,
  together with any other waiting changes (short, because a write started while the
  page is being left doesn't finish in Chromium); create, duplicate and delete are written at
  once. Writes run one at a time and store the set as it is when the write runs, so
  quick successive edits can't overtake each other. Waiting changes are flushed when
  the page is hidden or left. A failed write shows in `saveError` and is tried again
  with the next change; a failed load shows in `loadError`.
- `ui/`: `SetsList` is the home page once logged in (spec U2, U12): the sets, newest
  edit first, each with its name (the link that opens it), its playlists, a track
  count, the last edit and whether it was saved to Spotify (with the link). The count
  is the chosen mix's length when the set has one and otherwise the pool's size, named
  as such: "tracks in the set" needs key and BPM data, which the
  list doesn't load. Rename and delete are dialogs (the delete one says Spotify isn't
  touched), duplicate is immediate. Unreadable sets are listed below by ID with the
  reason and can be deleted; `loadError` and `saveError` are shown as alerts.
  `NewSetDialog` (spec U2, §8.1–8.2) takes a name and one or more playlists
  (`PlaylistPicker`). `model/useCreateSet` then reads each playlist with
  `model/useReadPlaylists` (the playlists feature's `usePlaylistReader`: the playlist
  as it is in Spotify now, with its `snapshot_id`, so the first change check reads no
  tracks again), one at a time with the progress shown, and creates the set only when
  all are read: a failed read creates nothing, names the playlist, and a retry reads
  only what is still missing. A blank name becomes the first chosen playlist's name.
  Items that can't be mixed are skipped and counted in the copy; when there were any,
  the dialog names them per playlist before the set is opened. The workspace's Add
  playlists reads the same way.

### The set workspace (`sets/model/useSetWorkspace.ts`)

`useSetWorkspace(setId)` is everything the workspace page of one set sits on. It
belongs to one set for as long as it lives: the page gives its component the set ID as
`key`. What it returns:

| | |
|---|---|
| `status`, `statusMessage`, `set` | the set, live from the store; an ID that isn't on this device is `missing`, a stored set that fails validation `unreadable` (reported, never thrown) |
| `tracks`, `features`, `featuresLoading`, `providerError`, `retryFeatures` | the pool by track ID, and key/BPM with sources for each (overrides applied) |
| `selection`, `picking` | `Selection`: status and reason per track, counts and `limitFilled` per playlist, the tracks in the set, blockers |
| `view`, `updating`, `summary`, `retry` | the mix (alternatives, the shown one, whether it is the stored choice) or the problems in its place; what the last update changed |
| `notices`, `checkPlaylists`, `updatePlaylist` | the change check against Spotify |
| `adding`, `addPlaylists`, `cancelAdd`, `removalOf`, `removePlaylist` | the set's playlists (U13): add (read first, all or none), what a removal takes with it, and the removal |
| `rename`, `saveInput`, `saveState`, `recordSave`, `recordIncompleteSave` | the set's name; what a save to Spotify would write now (a description, the shown mix's URIs and order); never / saved / changed; recording a save, or one that reached its playlist but fell short |
| `pointedTrackId` | one shared ref for cross-highlighting (W6) |
| `setBpmRange`, `setLimit`, `setPickMethod`, `reshuffle`, `setMark`, `setRole`, `setOpener`, `setCloser`, `addFollow`, `setFollower`, `removeFollow`, `setArc`, `chooseAlternative` | edits, each written through the store at once |

How it works:

- **Steps, each a computed over the part of the set it needs.** The set is an
  immutable value, nothing is deeply reactive (`shallowRef` and `computed` only), and
  edits keep the identity of what they don't touch. So the pool is rebuilt only when a
  playlist's track list changes, tracks are selected again only when playlists, marks,
  rule tracks or track data change, and the arc or a chosen alternative re-selects
  nothing. With 1,000 tracks in the pool an edit costs about a millisecond on the main
  thread.
- **Best fit and the synchronous selection.** `selectTracks` takes a synchronous pick
  function, and best fit must run in the worker. The selection therefore runs on the
  main thread with the best-fit answers at hand (`selectForSet`); a pick without an
  answer is worked out in the worker and the selection is made again. An answer is
  kept under everything it depends on (the candidates and the tracks in the set with
  their key and BPM, the count, the mix rules, the order handed on), so only a change
  to one of those asks again. **Why not select and solve together in the worker:** the
  track list wants every status at once, also when the mix takes a second; a range
  that has no best-fit playlist behind it then never waits for a worker; and the
  worker would have to import the sets feature, while `mixing` (which owns the worker)
  must not. The cost is one worker round trip per best-fit playlist that has to pick
  again, in the order the playlists were added. Each answer's `order` is handed to the
  next request (decision 31), so playlists picking in turn share one solver run.
- **Problems that need no solver** are found on whatever selection is at hand, also a
  draft: a rule naming an excluded track, a must-include track without key or BPM, the
  rules themselves (`validateConstraints` on the tracks in the set), an empty set.
  They replace the result at once (W9).
- **The solver's request** is the tracks in the set plus every mixable left-out track
  as `excluded`, so the existing diagnostics name left-out tracks that would unblock an
  impossible mix (U7); at most five are named per message, all are in the diagnostic.
  Outcomes are kept by request (the last eight, like the fit answers), so going back
  to a state needs no solve.
- **One piece of work at a time**: the fit a selection waits for, then the solve. Edits
  are gathered for 150 ms; the first result after opening and the solve that follows a
  fit start at once. A result that was superseded is dropped (`useLatestRun`).
- **Settling (W3).** `view` is the last settled result: a mix or problems. While a
  newer one is worked out it stays and `updating` is true; it is `opening` only before
  the first. `selection` likewise keeps its last value while picks are worked out
  (`picking`) or new tracks' data is loading. A failed worker is a `failed` problem,
  not retried until the input changes or `retry` is called.
- **Change summary (W4).** Each settled result is compared with the one before it. The
  first has no summary, and an update that changes nothing that is shown leaves the
  last summary standing. Choosing another alternative is not an update, but the next
  summary's "cost before" is the cost of the mix that was on screen.
- **The chosen alternative (spec §8.5).** `chooseAlternative` stores the order in the
  set. The first mix after opening shows the stored one if `chosenIndex` finds it among
  the alternatives; after a change that gives other alternatives the best one is
  shown; an update that leaves the alternatives as they are keeps the shown one. A
  stored mix that is not what is shown is removed from the set, so `saveState` stays
  true to what a save would write. That is the one edit the workspace makes by itself
  (it stamps the set's edit time, also when it happens on opening).
- **Playlist change check (`usePlaylistChanges`, spec §8.2).** When the set is there,
  each playlist is read with `playlists`' `readPlaylist(id, storedSnapshotId)`:
  `GET /playlists/{id}`, and its items only when the `snapshot_id` differs from the
  stored one (or Spotify gives none). The notice per playlist is `checking`,
  `unchanged`, `changed` (added and removed tracks from `diffPlaylist`, and the label)
  or `cantCheck` (`gone`: 404/403; `notYours`: only followed, for which Spotify gives
  no tracks; `failed`: Spotify couldn't be reached). The same tracks in another order
  or under another name are no change. `updatePlaylist(id)` applies the copy that was
  read through `updatePlaylist` and returns what was dropped. Nothing is ever written
  to Spotify here.

- **Saving (spec §8.5).** The workspace never talks to Spotify to write: `useSaveSet`
  does, for the save dialog, and tells the workspace what was written. `recordSave`
  stores the playlist ID, the link, the time, the name and the order, and makes the
  saved mix the chosen one, so the set reads as `saved` until it gives another mix.
  `LastSave.playlistId` came later than the first stored sets: reading one without it
  takes the ID from the stored link, or leaves it null (then nothing can be replaced).

Tests drive the composable through `src/test/set-app.ts` (the app's plugins without a
page): an in-memory store, MSW for Spotify, a fake feature provider, and in-process or
gated solver and fit clients.

### The workspace page (`sets/ui/workspace/`, `pages/SetPage.vue`)

`SetPage` only gives `WorkspaceScreen` the set ID, as prop and as `key`. The route has
`meta.fullScreen`, so `App.vue` renders it without the app's header and page width: the
workspace is `100dvh` high and nothing but its own areas scrolls (W1, W2).

```
WorkspaceScreen          useSetWorkspace + provideWorkspaceUi; top bar (back, name, save)
├─ TrackColumn           filter, sort, Add playlists; the "Followed by…" notice; the list
│  └─ PlaylistGroup      one per playlist: rows through visibleRows
│     ├─ PlaylistHeader  fold, name, in set / in pool, BpmRangeControl, limit, pick
│     │                  method (only with a limit) + Reshuffle, change notice, menu
│     └─ TrackRow        one line per track
├─ ChangeSummaryLine     W4
├─ MixResult             headline + TempoArcChart, or the problems, or "working"
├─ MixControls           CandidateList, ArcPicker, the pairs
├─ MixOrder              KeyWheel + RunningOrder with pins
├─ AddPlaylistsDialog
└─ SaveDialog            SaveForm on useSaveSet: name, name clash, replace or create
```

- **`context.ts`** is what these share besides the set (`provideWorkspaceUi` /
  `useWorkspaceUi`): the track being edited (one `OverrideDialog`, in `TrackColumn`),
  the track that waits for a follower, a request to bring a row into view, and the
  sets of tracks that joined and left in the last change. Components read the set
  through `ui.ws`, so nothing is passed down but IDs.
- **Layout.** From 1024 px (`useWide`) two columns, `3fr 2fr`: the track column scrolls
  by itself, playlist headers stick to its top; the mix column never scrolls, its
  running order does (`flex-1 min-h-0`). Below that width the same components are
  stacked: `MixResult` with a lower chart on top, then tabs (Tracks, Mix, Order) whose
  panels are hidden, not removed, so a tab keeps its scroll, filter and folds (W5, W10).
- **`TrackRow`.** Title and artist; a reason tag only when the app decided (outside
  range, not picked, picked, needs key/BPM, in ‹playlist›; "looking up" while a new
  track has no status); the pairs it is in ("after …", "then …"; pointing at one
  highlights the partner, a click shows it); key (`KeyChip`) and BPM as buttons into
  the edit dialog (a pointer, a frame on hover, "Edit key and BPM" in the tooltip and
  the accessible name), with a pencil only on a value set by hand; the energy
  (`EnergyMeter`, display only, hidden at phone width); one group of four toggles
  (`setRole`, at most one on); and the link button. Every row carries its status in
  the spec's words (`statusLabel`) for assistive tech; left-out rows are dimmed, their
  controls are not. Rows use `content-visibility: auto`, so a pool of 1,000 costs
  layout only for what is on screen; a row re-renders only when something it reads
  changed.
- **`PlaylistHeader` keeps its controls in place.** Right of the name every control has
  a fixed width: the count, the range, the limit, a place kept for the pick method and
  Reshuffle (empty without a limit) and the menu. Only the name gives way, so entering
  or clearing a limit, or switching the method, moves nothing. What shows only now and
  then (the change notice with Update, "can't be checked", "N must-include, limit M")
  is on a line of its own under the controls. At phone width the controls wrap onto
  three lines that are always the same (name, count, menu / range / limit, method). An
  e2e compares the controls' positions to the pixel at 1280, 1440 and 375 px.
- **`BpmRangeControl` (W8).** The playlist's histogram with a handle per end and a
  field per end. Bars a range leaves out are faded as the handle moves. A handle is a
  `role="slider"`: arrows ±1, Page keys ± one bar, Home/End to its own end of the
  scale, which means "open"; a field commits on Enter or when it is left, and an empty
  one is open.
- **"Followed by…" (spec §9.1).** The link button arms a row (`ui.armed`). While a
  track waits, the notice above the list names it; every other row shows the move the
  pair would make (`moveBetween` → `MoveBadge`) on a button that completes the pair, or
  says why it can't (a clash, `followBlock`'s reasons, excluded, no key); a click
  anywhere on a row that can be chosen chooses it too. Esc, Cancel or the armed button
  cancel. The list is scrolled by the notice's height when it appears, so the row under
  the pointer stays put. A pair is made with `setFollower`: arming a pair's second
  track extends the chain, arming its first replaces the follower.
- **`MixResult` (W3, W9).** A mix: headline numbers, "Updating…" while `ws.updating`
  (the last mix stays), the chart. Problems: the same box holds each `message` and the
  fixes `problem-fixes.ts` offers for it (set key and BPM, stop excluding, remove the
  pair, always include a left-out track that would fit, exclude the track that can't be
  placed, try again). Before the first result: one quiet line in a box of the same
  height.
- **Cross-highlight (W6)** is `ws.pointedTrackId`: rows, pairs, the chart, the wheel
  and the running order write it on pointer and focus and read it for their mark. A
  click in the chart, the running order or a pair asks `ui.reveal`, and `TrackColumn`
  unfolds the playlist that decides the track, drops a filter that hides it and scrolls
  the row into view.
- **Playlists (U13).** The header's menu (Reka `DropdownMenu`) has Update, Check again
  and Remove from set, and says what the copy skipped. Update shows `describeDropped`
  under the header until dismissed; Remove asks first, with the same words.
- **Save (spec §8.5, decision 41).** The top bar's button only opens `SaveDialog`;
  `SaveForm` is made each time it opens and sits on `sets/model/useSaveSet`, which asks
  Spotify how things are then. Nothing is written before the form is confirmed.
  - *Name.* Starts from the last save's name, else the set's; blank can't be saved. The
    set is not renamed. `nameCheck` compares it, trimmed and without case, with the
    playlists the user owns (the whole list, refetched when the dialog opens): taken is
    a warning, never a block, and a list that couldn't be read says "couldn't check".
    The playlist being replaced doesn't count against its own name.
  - *Replace or create.* `target` is `none` (never saved), `checking`, `allowed` or
    `refused` with a one-line reason. Allowed needs all of: the last save has a playlist
    ID; no set on this device has that playlist as a source (`replaceRefusal`, over
    every set in the store); Spotify still has it; the logged-in user owns it
    (`playlistAccess`; collaborating is not owning). Replace is the default when allowed
    and the confirm button says which it is. The same checks run again inside `save`
    right before the first write. A playlist that merely has the same name is never a
    target.
  - *Writing* is the playlists feature's (`api/save.ts`, through `usePlaylistSaver`).
    Create: `POST /me/playlists`, then `POST …/items` in hundreds. Replace:
    `PUT /playlists/{id}/items` with the first hundred, `POST …/items` for the rest,
    then `PUT /playlists/{id}` for name and description. The two `PUT` routes are not
    verified against the Feb 2026 API. Every failure is a value with a kind: the first
    write answering 404/405 is `unavailable` (the dialog says replacing isn't available
    and offers a new playlist; it isn't offered again in that dialog), 403 is
    `forbidden`, a failure after the first write is `incomplete` (the playlist is
    remembered with no mix counted as saved, and trying again starts the replace over;
    a new playlist that was created but not filled is remembered the same way, so the
    retry fills it instead of making another), and tracks in but name not taken counts
    as saved with a note.
  - *Afterwards* `recordSave` stores playlist ID, link, time, name and order, and the
    saved mix becomes the chosen one. `saveState` compares orders only: the playlist's
    name is its own. `SaveStatus` shows "Saved ‹time›" or "Changed since the save of
    ‹time›" with the link.
  - *The rule, with its tests:* apart from a playlist a save has just created, the only
    playlist ever written to is the one the set's own last save created
    (`useSaveSet.test.ts`, "the rule"; the e2e's `sourceWrites` stays empty).

Tests: `src/test/workspace.ts` opens a stored set built from the WCS fixture in the
real component tree (MSW for Spotify and ReccoBeats, the solver in-process) and the
`workspace-*.test.ts` files drive it through the DOM.

## Auth (`features/auth`)

- PKCE S256 with `state` (`domain/pkce.ts`). The verifier and state go in
  `sessionStorage` during the redirect and are cleared on callback; tokens go in
  `localStorage` (`camelont.auth.tokens`: access token, expiry, refresh token, scope),
  validated with zod on read.
- `redirect_uri` = `${location.origin}${import.meta.env.BASE_URL}callback`, built in
  `app/config.ts`. Register both the local and the Pages URL in the Spotify dashboard
  (see `setup.md`).
- `model/session.ts` is plain TypeScript (`createAuthSession`); `installAuth(app, …)`
  provides it and `useAuthStore` (Pinia) exposes `loggedIn`, `login`, `logout`,
  `handleCallback` and a `tokenSource` for API clients.
- The shared HTTP client asks the token source for a valid token (refreshing when
  < 60 s left, with a single in-flight refresh), retries a 401 once after a refresh,
  and the session logs out if the refresh fails. `App.vue` then leaves pages that need
  a login; `requireLogin` guards routes with `meta.requiresAuth`.
- Scopes: `playlist-read-private playlist-read-collaborative playlist-modify-private`.

## Config

- `VITE_SPOTIFY_CLIENT_ID`: required. Locally in `.env.local` (git-ignored); in CI and
  Pages from the GitHub Actions **variable** of the same name (it's public under PKCE,
  not a secret).
- `import.meta.env` is read in exactly one place (`src/app/config.ts`), validated with
  zod, and exported as typed config.

## Testing strategy

| Layer | Tool | What |
|---|---|---|
| domain | Vitest | Exhaustive: chart (576 pairs), camelot conversion anchors, tempo, evaluator, constraints, solver properties, diagnostics |
| api | Vitest + MSW | Request shape, pagination, 429 handling, DTO mapping, zod rejection of bad payloads |
| model/ui | Vitest + Testing Library | Behaviour through the DOM, not implementation details. The workspace is tested as a whole tree on a stored set (`src/test/workspace.ts`) |
| app | Playwright | Login (stubbed token); sets: create one from two playlists, reopen after a reload, rename, duplicate, delete, a failed read and its retry, phone width; the workspace: fix a missing key from a row, a range, a mark, a limit with picks, the change summary, a follow pair both ways, an alternative, reload and find it as left, save under a chosen name with the duplicate-name warning; saving again by replacing, by creating another, and replace refused once the saved playlist is a source; the header's controls staying put when a limit comes and goes; a playlist changed in Spotify and Update; "no mix possible" and its fix; no page scroll at 1280 × 720 and 1440 × 900 with the mix in view; phone tabs. All network mocked. `e2e/workspace-shots.spec.ts` takes the screenshots in `docs/reference/workspace/` and runs only with `SHOTS=1`. |

Coverage thresholds apply to `domain/` (≥ 90% lines). The rest is judged by behaviour
coverage, not a number.

## Conventions

- Names: files `kebab-case.ts`, components `PascalCase.vue`, composables `useThing.ts`,
  stores `useThingStore`.
- No `any`, no non-null `!` without a comment, and no default exports except `.vue`
  files.
- Errors: typed `Result`-style returns in domain code where failure is expected
  (infeasible, invalid constraints). Exceptions only for programmer errors and I/O.
- UI text: sentence case, plain English, and keys always in both notations via
  `KeyChip`.
- Accessibility: every interactive SVG element is focusable with an `aria-label`.
