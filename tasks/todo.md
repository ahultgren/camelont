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
