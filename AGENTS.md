# AGENTS.md

A guide for AI coding agents (and humans) working on this repository. Read it before making changes.
If your change makes anything here wrong, update this file in the same change.

## What this is

Cronspiracy is a self-hosted scheduling poll ("when can everyone make it?").

- **No logins.** Links are the only identity: a share link, a secret admin link, and per-voter edit links.
- **One container.** A single Node process serves the HTML pages, a JSON API and the static assets, and stores
  everything in one SQLite file.
- **90s hacker look.** The UI is styled like a CRT terminal, but the copy stays plain enough for non-technical users.

## Commands

```sh
pnpm install
pnpm dev        # dev server on :5173; uses ./data and PUBLIC_URL=http://localhost:5173 by default
pnpm test       # Vitest unit tests (src/**/*.test.ts)
pnpm check      # svelte-kit sync + svelte-check (TypeScript)
pnpm build      # production build to ./build
PUBLIC_URL=http://localhost:3000 node server.js   # run the production build
docker compose up -d --build
```

Before you finish a change, run `pnpm check` and `pnpm test`. Both must pass with 0 errors and 0 warnings.

## Layout

```
src/
  hooks.server.ts          Request pipeline: client-IP hash, Origin check, read rate limit, security headers,
                           hourly maintenance (expiry + backups)
  app.css                  Global theme: CSS tokens per [data-theme] (green / amber / paper), controls, panels
  lib/
    types.ts               Shared types (PollView, Participant, VoteValue …) and LIMITS (field length caps)
    dates.ts               Plain-date maths ('YYYY-MM-DD' strings in UTC), calendar grid, timezone helpers
    builder.ts             Date builder state → option list (range + weekdays + overrides × time slots)
    score.ts               Tally + best option (score = yes + ½ maybe, ties → fewer "no")
    markup.ts              Markdown-lite renderer (escape everything, then links/bold/italic/line breaks)
    calendar.ts            .ics generation + Google/Outlook "add event" URLs
    format.ts              Option labels for display
    banner.ts              ASCII banner (generated with `figlet -f slant`)
    client/api.ts          fetch wrapper: sends token headers, throws ClientError with a human message
    client/store.ts        localStorage "My polls" (admin/edit tokens per poll), remembered name
    components/
      DateBuilder.svelte   The date picker (quick picks, range, weekday chips, calendar, time slots)
      PollScreen.svelte    Poll page: header, vote draft, desktop grid + mobile cards, save bar
      AdminPanel.svelte    Organiser controls (shown on the admin URL)
      FinalBanner.svelte   "Decision locked in" banner + calendar links
      CopyField.svelte     Read-only input + copy button
    server/
      config.ts            Zod-validated env config (exits on invalid config; dev defaults when not production)
      db.ts                node:sqlite connection, append-only MIGRATIONS array (PRAGMA user_version), tx(), maintenance()
      polls.ts             ALL database reads/writes + input validation. Routes stay thin and call into this
      errors.ts            ApiError, api() wrapper → `{ error: { code, message } }`
      ids.ts               Poll ids (base58 ×10), tokens (32 random bytes), sha256, constant-time compare
      ip.ts                Client IP resolution with TRUSTED_PROXIES (cloudflare/private shortcuts) + daily-salted hash
      ratelimit.ts         In-memory token buckets (create / vote / read)
  routes/
    +page.svelte           Create wizard (What → When → Settings → Done)
    p/[id]/                Public poll page (SSR) and event.ics
    p/[id]/admin/[token]/  Admin page (same PollScreen with adminToken)
    mine/, about/          My polls (client-only), about/privacy
    api/                   JSON API (see below)
    healthz/               { ok, db } for the Docker healthcheck
docker-entrypoint.sh       Fixes /data ownership, then drops to the node user
server.js                  Production entry: sets adapter-node's ORIGIN from PUBLIC_URL, imports ./build
```

## HTTP API

| Method | Path | Auth |
|---|---|---|
| POST | `/api/polls` | anyone (rate-limited, honeypot `website`) |
| GET / PATCH / DELETE | `/api/polls/:id` | GET: anyone. PATCH/DELETE: `X-Admin-Token` |
| POST | `/api/polls/:id/close`, `/reopen`, `/final` (`{ optionId \| null }`) | admin |
| GET | `/api/polls/:id/export.csv` | admin (header or `?token=`) |
| POST | `/api/polls/:id/participants` | anyone → `{ participantId, editToken }` |
| PUT / DELETE | `/api/polls/:id/participants/:pid` | `X-Edit-Token` of that row, or admin |

GET requests can send `X-Edit-Token` and `X-Admin-Token`. These affect what the response reveals, through the
`votesHidden`, `hideNames`, `youId` and `isAdmin` fields.

## Invariants: do not break these

- **Privacy.**
  - No cookies, no sessions, no analytics, no third-party requests (fonts are bundled through `@fontsource`).
  - Never log or store raw IPs. Only `hashIp()` output may be stored or logged.
- **Tokens.** The DB only ever stores `sha256(token)`. Compare with `tokenMatches()`, which is constant-time. Never
  return an admin or edit token except once, in the create response.
- **Errors.** Every API failure is `{ error: { code, message } }` with a proper status code. Throw
  `new ApiError(status, CODE, message)` from `polls.ts` and wrap handlers in `api()`. The message must say what
  happened **and** what the user should do next.
- **Validation lives in `server/polls.ts`** (Zod schemas). Field caps come from `LIMITS` in `lib/types.ts`, which the
  client uses too.
- **Dates.**
  - Whole-day options are plain `'YYYY-MM-DD'` strings with no timezone. Do date arithmetic on them with the helpers
    in `lib/dates.ts`, which use UTC internally. Never use `new Date('2026-11-08')` arithmetic in local time.
  - Timed options are stored as local date + `HH:MM` + the poll's IANA timezone. Convert them with
    `zonedToInstant()`.
- **Hydration-safe formatting.** Format dates with the `locale` from the root layout load (taken from the
  Accept-Language header), so the server and the client render the same text. Anything viewer-specific, such as the
  viewer's timezone, is computed in `onMount`.
- **Hidden votes.** When `hide_votes` is on and the viewer is neither the admin nor an existing voter, `pollView()`
  returns no participants or votes, only `participantCount`. Keep that check server-side.
- **Migrations** are append-only. Add a new string to `MIGRATIONS` in `db.ts`; never edit an existing one.
- **Build-time safety.** `vite build` imports server modules. Guard side effects with `building` from
  `$app/environment`. `config.ts` and `db.ts` already do this.
- **Dependencies.** Keep runtime dependencies near zero. Everything goes in `devDependencies` so adapter-node
  bundles it, and the Docker runtime stage copies only `build/`, `server.js` and `package.json`. Justify any new
  dependency in the PR.

## UI conventions

- Svelte 5 runes (`$state`, `$derived`, `$props`). No stores, and no UI framework.
- Colours come only from CSS tokens (`--fg`, `--dim`, `--faint`, `--yes`, `--maybe`, `--no`, `--link`, …) defined per
  theme in `app.css`. New UI must look right in all three themes. Check `paper`, the light theme, specifically.
- `VT323` (the class `.pixel`, or h1–h3) is for headings and buttons only. Body text uses the system monospace stack.
- **Accessibility.**
  - Real `<button>`s with `aria-pressed` for toggles.
  - Never rely on colour alone (✔ ~ ✘ icons plus text labels).
  - Tap targets of at least 44px.
  - Respect `prefers-reduced-motion`.
- **Mobile first.**
  - The poll page renders both the desktop grid and the mobile cards, and CSS switches between them at 640px.
  - Fixed bottom bars carry the main action.
- **Copy.** Hacker flavour belongs in headings and labels, such as "ADMIN CONSOLE · ROOT ACCESS". Instructions and
  errors stay plain and friendly.
- **No browser dialogs.** Don't use `confirm()` or `alert()`. Use the "click again to confirm" pattern (see `armed`
  in PollScreen and AdminPanel).

## Testing

- Pure logic (`dates`, `builder`, `score`, `markup`, `calendar`) gets Vitest tests next to the file (`*.test.ts`).
- For server or API changes, start `pnpm dev` and exercise the endpoint with `curl`. Check both the happy path and
  the error JSON.
- For UI changes, check a desktop width (around 1280px) and a phone width (around 390px).

## Gotchas

- **pnpm version.** `packageManager` is pinned to pnpm 8 because the lockfile is format 6.0, and newer pnpm versions
  in Docker refuse it. If you upgrade pnpm, regenerate the lockfile and update the pin together.
- **`node:sqlite` warning.** `node:sqlite` prints an ExperimentalWarning on some Node versions. That's expected; the
  Dockerfile silences it.
- **Rate limiter state** is in memory, so it resets on restart. That's fine for a single instance, which is the only
  deployment model.
- **Docker data folder.** Docker creates a missing bind-mount folder as root. `docker-entrypoint.sh` starts as
  root, chowns `DATA_DIR` to `node` (uid 1000), and then runs the app through `su-exec`. Don't add `USER node`
  to the Dockerfile; that would bring back "unable to open database file".
- **SvelteKit form actions are not used.** All mutations go through the JSON API with token headers. The Origin check
  happens in `hooks.server.ts`.
- **Edit links** use the URL fragment (`/p/<id>#edit=<pid>.<token>`) so the token never reaches the server or the
  logs. `PollScreen` stores it in localStorage on load, then strips it from the URL.
