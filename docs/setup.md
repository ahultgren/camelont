# Setup

## One-time: Spotify developer app (owner only, by hand)

Credentials are handled by the owner, never by an agent.

1. At <https://developer.spotify.com/dashboard>, open the existing app (the one used for
   the Spotify MCP server) → **Edit settings**.
2. Add **both** redirect URIs exactly (no trailing slash):
   - `http://127.0.0.1:5173/camelont/callback` (local dev; Spotify requires the loopback
     IP for http, not `localhost`)
   - `https://andreashultgren.se/camelont/callback` (GitHub Pages)
3. Make sure **Web API** is ticked.
4. **User Management:** add each friend's name and Spotify email. Only allowlisted users
   can log in (development mode), and the app owner needs Premium.
5. Copy the **Client ID** (not the secret; the app never uses a secret).

## Local development

```bash
corepack enable            # provides the pnpm version pinned in package.json
pnpm install
cp .env.example .env.local # then paste the Client ID into VITE_SPOTIFY_CLIENT_ID
pnpm dev                   # http://127.0.0.1:5173/camelont/
```

The dev server must bind `127.0.0.1:5173` with base `/camelont/` so the redirect URI
matches. Common scripts (defined during scaffolding; keep this list in sync):

| Script | Does |
|---|---|
| `pnpm dev` | Vite dev server on `http://127.0.0.1:5173/camelont/` |
| `pnpm build` | type-check (`vue-tsc -b`) + production build, plus the `404.html` copy |
| `pnpm preview` | serve the build on `http://127.0.0.1:4173/camelont/` (E2E runs against this) |
| `pnpm lint` / `pnpm lint:fix` | ESLint (incl. boundaries) |
| `pnpm format` / `pnpm format:check` | Prettier write / check (Markdown is excluded; docs are hand-formatted) |
| `pnpm typecheck` | `vue-tsc -b` |
| `pnpm test` / `pnpm test:watch` | Vitest |
| `pnpm test:coverage` | Vitest with coverage; fails below 90% lines in `**/domain/**` |
| `pnpm test:e2e` | Playwright against `pnpm preview` (build first; first run: `pnpm exec playwright install --with-deps chromium`) |
| `pnpm check` | everything CI runs: lint + format check + typecheck + unit with coverage + build + e2e |

`pnpm install` runs `prepare`, which installs the lefthook git hooks (pre-commit: Prettier
and ESLint on staged files; pre-push: typecheck and unit tests).

## GitHub

- Repo: `ahultgren/camelont` (public).
- **Pages:** Source = **GitHub Actions** (enabled at repo creation). Served at
  `https://andreashultgren.se/camelont/`, because the user site has a custom domain, and
  `ahultgren.github.io/camelont/` redirects there.
- **Actions variable** `VITE_SPOTIFY_CLIENT_ID` (a variable, not a secret; the owner
  sets it):
  ```bash
  gh variable set VITE_SPOTIFY_CLIENT_ID --repo ahultgren/camelont
  ```
- CI builds without a real Client ID (a placeholder is fine for tests; the E2E suite
  mocks Spotify). Only the deploy workflow needs the real one.

## Working in a cloud (remote) Claude Code session

- Needs Node 22+ (24 preferred) and network access to the npm registry. `corepack enable`
  provides pnpm. Create a `.env.local` with any placeholder Client ID so the build works.
- Playwright needs a Chromium. If one is pre-installed (e.g. `/opt/pw-browsers`), point
  `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` at its binary instead of running
  `playwright install`.
- Everything automated (lint, typecheck, unit, E2E) runs with **no Spotify or ReccoBeats
  access**: all network is mocked. Don't call the real APIs from tests.
- A cloud session **can't** log in to Spotify. Real end-to-end verification against a
  Spotify account is done by the owner, locally or on the Pages deploy. Say so plainly
  in handoffs instead of claiming it works.
- Never commit `.env.local`, tokens, or anything under `.private/`.
