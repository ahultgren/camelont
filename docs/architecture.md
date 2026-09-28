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
| Routing | vue-router, history mode, base `/camelont/`; `404.html` copy of `index.html` for GitHub Pages deep links |
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
    mix-view/          tempo-arc chart, key wheel, running order, hover card
  shared/
    music/             Camelot kernel: CamelotKey type, parse/format, fromPitchClass, keyName, keyHue
    api/               fetch wrapper (base URL, auth header injection, 429 Retry-After, zod parse, typed errors), paginate()
    storage/           KeyValueStore port + IndexedDB adapter + in-memory adapter (tests)
    ui/                base components: AppButton, AppCard, KeyChip, MoveBadge, StatTile, EmptyState, …
    lib/               seeded PRNG, assertNever, small pure helpers
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
  `mixing → track-features`, `mix-view → mixing, track-features`. Adding an edge is a
  design decision: record it here.
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
  merges with overrides.
- `ui/`: `TrackTable` (key in both notations, BPM, source badge per value, Fix/Edit
  per row, an `actions` slot for the page), `OverrideDialog`, `OverridesTransfer`.

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
- `tempo.ts`: `tempoGap(a, b)`, half/double tolerant, and `tempoLine(bpms)`: BPM per
  position folded the way each gap matched its predecessor (shifted by octaves so most
  tracks keep their listed BPM). Display only; costs use `tempoGap`.
- `arc.ts`: `ArcConfig { preset, signal, weight }`; presets are data (piecewise-linear
  target curves over position 0..1); signals are functions `MixTrack → number | null`
  (BPM first), normalised over the set's range. `arcTermCost` is the per-track term.
  Removing arcs means deleting this file and the one term in `evaluate`.
- `evaluate.ts`: `evaluateMix(order, profile) → EvaluatedMix` (transitions with move +
  cost, transition cost, arc cost + target curve, total cost, clash count, the tempo
  line, stats: move and tone histograms, peaks, opener, closer, BPM range; peaks and
  range are of the tempo line). `transitionCost` and the arc
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
- `model/solver.worker.ts` exposes `solve(request)` via Comlink; `model/solver-client.ts`
  starts one worker per run (cancel = terminate). `model/useMixer` wraps it and cancels
  the run in flight when inputs change or the component unmounts.

**Required tests using the WCS fixture:** the `hand_tuned` and `script_greedy` orders
evaluate as clash-free with the documented move counts (hand-tuned: 9 perfect, 7 boost,
3 drop). The solver finds clash-free orders for the full set, respects each constraint
type, beats greedy from the same opener, matches the hand-tuned order under the
two-waves profile, and reports Bloodstream-style bottlenecks when made infeasible. The
chart equals the JSON for all 576 pairs.

## Mix UI (`mixing/model`, `mixing/ui`, `mix-view`, `pages/PlaylistPage.vue`)

- `mixing/model/mix-input.ts` maps playlist entries + merged track features to
  `MixTrack`s and sets aside entries without data. `useMixPlanner` holds the
  constraints and arc choice, blocks mixing while a track lacks data and isn't
  excluded, validates constraints instantly, and re-solves (debounced 250 ms) whenever
  the input changes; `useMixer` cancels the stale run. The solver client is injectable
  (`installMixing`); without `Worker` it falls back to `inlineSolverClient`.
- `mixing/ui`: `ConstraintsPanel` (first/last track, "must be followed by" pairs; the
  exclude toggles sit on the track table), `ArcPicker`, `CandidateList` (a radio group
  of cards: sparkline, move-tone counts, BPM range, peaks, opener, closer, cost) and
  `MixProblems` (constraint errors and diagnostics in plain language).
- `mix-view`: `TempoArcChart` (hand-built SVG of the tempo line; key-coloured dots, a move badge per
  segment, the arc target dashed, each point focusable with a full `aria-label`, and a
  card on hover/tap/focus), `KeyWheel`, `RunningOrder` (connectors: keys, move, BPM
  change) and `MixExplorer` composing them. Pure geometry lives in
  `mix-view/domain/layout.ts`. The chart scrolls horizontally inside its card on
  narrow screens; row grids use `minmax(0,1fr)` so long titles never widen the page.
- Saving: `mixing/domain/describe.ts` builds the new playlist's name
  (`<source> · Camelot mix`) and description (moves, BPM range, profile, arc; ≤ 300
  characters); `playlists/ui/SavePlaylistButton` creates the private playlist and adds
  the URIs in batches of 100, then links to it. The page is the glue: it maps the
  chosen mix's entry IDs to URIs.

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
| model/ui | Vitest + Testing Library | Behaviour through the DOM, not implementation details |
| app | Playwright | Login (stubbed token), pick playlist, fill a missing key, generate, compare, explore, save. All network mocked. |

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
