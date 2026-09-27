# Camelont

Browser-only Vue 3 + TypeScript SPA that reorders a Spotify playlist into a harmonic
mix using the user's directional Camelot chart, compares alternative mixes on a
BPM/key chart, and saves the chosen mix as a new Spotify playlist. No backend: Spotify
PKCE login, and key/BPM come from ReccoBeats.

## Read first

| Doc | Role | Changes when… |
|---|---|---|
| `docs/spec.md` | **What** the app is (end state, user stories, rules) | product intent changes (ask the owner) |
| `docs/domain/camelot-chart.json` + `.md` | **The mixing rules.** The JSON is canonical. | never without the owner |
| `docs/architecture.md` | **How** it's built: stack, layout, boundaries, engine design | the code's structure changes (keep in sync) |
| `docs/decisions.md` | **Why**: numbered decisions | a decision is made or reversed (append) |
| `docs/research.md` + `docs/reference/` | prior findings, API gotchas, the WCS fixture, visual reference | new findings |
| `docs/setup.md` | local/CI/Pages/Spotify setup | tooling changes |
| `tasks/todo.md` | the current plan and progress | continuously |
| `tasks/lessons.md` | mistakes not to repeat | after every correction |

Precedence when they disagree: chart JSON > spec > decisions > architecture > everything
else. If the spec seems wrong, ask; don't silently diverge.

## Workflow

- Plan in `tasks/todo.md` (checkable items) before non-trivial work; tick items off as
  you go; add a review section when done.
- Read `tasks/lessons.md` at session start. Add a lesson after any correction.
- Test first for `domain/` code. Every behaviour change comes with tests.
- **Definition of done:** `pnpm check` is green (lint incl. boundaries, typecheck, unit,
  build, e2e), and docs touched by the change are updated in the same commit.
- Commits: small, imperative subject (`Add chart move lookup`), body explains why.
  Conventional-commit prefixes aren't used.
- Don't claim something works against real Spotify unless it was run against real
  Spotify. Cloud sessions can't log in; say so.

## Architecture rules (summary; details in docs/architecture.md)

- Layers: `app → pages → features → shared`. Features: `auth`, `playlists`,
  `track-features`, `mixing`, `mix-view`.
- A feature is `domain/` (pure TS, no Vue, no I/O) · `api/` (I/O + zod) · `model/`
  (stores/composables) · `ui/` · `index.ts` (the only import surface).
- Cross-feature imports only via `index.ts`. `shared` never imports upward. Enforced by
  eslint-plugin-boundaries. Never disable the rule; move the code instead.
- Validate every external payload with zod at the `api/` boundary. Domain code never
  sees DTOs.
- `evaluateMix` is the single source of truth for scoring (solver and UI both use it).
- Read `import.meta.env` only in `src/app/config.ts`.
- DRY: shared concepts (Camelot key, key name, key hue, move metadata) have exactly one
  implementation.

## Hard constraints

- **Never modify the source playlist.** Saving always creates a new private playlist.
- **Clashes are forbidden** in generated mixes. The chart is directional and
  deliberately non-textbook (e.g. `2A → 3B` is a clash, `nA → nB` is `+`). Don't
  "correct" it.
- Spotify `audio-features` is closed to this app. Don't use it. Use
  `/playlists/{id}/items` and `POST /me/playlists` (Feb 2026 API). No Spotify SDK.
- Scopes: `playlist-read-private playlist-read-collaborative playlist-modify-private`
  only.
- Show every key in both notations (`11B · A major`) and every value's source.
- No secrets in the repo. The Client ID comes from `VITE_SPOTIFY_CLIENT_ID`. `.private/`
  is git-ignored local research; never commit it or copy from it.
- Tests never hit real Spotify or ReccoBeats. Mock with MSW or Playwright routes.

## Commands

See the script table in `docs/setup.md` (keep it in sync with `package.json`).
