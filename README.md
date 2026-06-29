# Marketplace (live engineering exercise)

A small two-sided marketplace. Customers place orders with merchants, and customers can hold
store credit. It is a deliberately small but real codebase: a TypeScript monorepo with a web app,
an HTTP API, and a Postgres database.

This repo is for a live working session. **Before your session, get set up with the steps below and
confirm the app runs in your browser.** Your interviewer will share the task at the start of the
call, so there is nothing to pre-build. Skimming the conventions below will help you hit the ground
running.

---

## Stack

| Layer | Tech |
|---|---|
| Monorepo | pnpm workspaces + Turborepo |
| Web (`apps/web`) | Vite + React 18 + TypeScript |
| API (`apps/api`) | Express + TypeScript (run with tsx) |
| Database (`packages/db`) | Postgres 17, forward-only SQL migrations |
| Tests | Vitest (+ React Testing Library on the web) |
| Auth | JSON Web Tokens issued by a dev-only login route |

## Prerequisites

You need Node, pnpm, and Docker. This runs on macOS, Linux, and Windows (via WSL2). Exact
install method is up to you; here is the short version.

- **Node 20+** — from [nodejs.org](https://nodejs.org), or a version manager (nvm / fnm / volta).
  An `.nvmrc` is included, so `nvm use` picks the right version.
- **pnpm 10** — simplest via Corepack, which ships with Node:
  `corepack enable && corepack prepare pnpm@latest --activate` (or `npm i -g pnpm`).
- **Docker** — runs the local Postgres container:
  - **macOS:** Docker Desktop, or a no-Desktop setup with Colima
    (`brew install colima docker docker-compose && colima start`).
  - **Windows:** Docker Desktop with the WSL2 backend, and run everything below from a WSL2
    (Ubuntu) shell where you also install Node and pnpm. Don't mix PowerShell and WSL.
  - **Linux:** Docker Engine plus the Compose plugin from your distro.

Sanity check before you start: `node -v` (>= 20), `pnpm -v` (>= 10), `docker info` (daemon
running), `docker compose version`.

## Quickstart

```bash
cp .env.example .env          # defaults match docker-compose.yml
docker compose up -d          # start Postgres on localhost:5432
pnpm install
pnpm db:migrate               # apply migrations
pnpm db:seed                  # insert seed users + orders
pnpm dev                      # start the API (:4000) and web app (:5173)
```

Open http://localhost:5173 and use the dev login buttons to sign in as a seeded user.
To reset the database to a clean seeded state at any time: `pnpm db:reset`.

### Getting an API token (for curl / Postman)

```bash
curl -s localhost:4000/auth/login -H 'content-type: application/json' \
  -d '{"email":"bob.merchant@example.com"}'
# -> { "token": "..." }  then send  Authorization: Bearer <token>
```

Seeded users: `alice.customer@example.com`, `dave.customer@example.com`,
`bob.merchant@example.com`, `mia.merchant@example.com`, `carol.admin@example.com`.

---

## Conventions

- **Money is always integer cents.** Never use floats for money.
- **Migrations are forward-only.** Never edit a migration that has already been applied; add a new
  numbered file in `packages/db/migrations/`. Constrain your tables sensibly.
- **Authorization is enforced server-side**, and ownership is checked per row, not just per role.
  Keep it testable.
- **Validate input** at the API boundary.
- **Match the surrounding code style.** Read the existing code before you add to it.

## Testing

```bash
pnpm test                                   # full suite via turbo
pnpm --filter @app/api test                 # one package
pnpm --filter @app/api exec vitest run src/__tests__/money.test.ts   # one file
```

The shipped tests do not require a database (they cover pure money and authorization logic, and the
web screen with a mocked client). If you add database-backed integration tests, document how to run
them.

## Repo map

```text
apps/
  api/   Express API. routes/, auth/ (token, policy, middleware), domain/ (money), __tests__/
  web/   Vite + React. api/client, hooks/, components/, screens/
packages/
  db/    migrations/, seed/, src/ (pool, query, row types, migration runner)
```

## Troubleshooting

- **`docker compose` not found:** older installs use `docker-compose` (with a hyphen). Same commands.
- **Port already in use (5432 / 4000 / 5173):** stop the other process or change the port
  (`DATABASE_URL` / `API_PORT` in `.env`, or run Vite with `--port`). On macOS/Linux:
  `lsof -ti:5432 | xargs kill`.
- **API logs `ECONNREFUSED` or "Could not reach Postgres":** the database container isn't up or
  migrations haven't run. `docker compose up -d`, wait a few seconds, then `pnpm db:migrate`.
- **Reset to a clean slate:** `pnpm db:reset` re-applies migrations and re-seeds. To wipe the
  Postgres volume entirely: `docker compose down -v`.
- **Windows:** run everything inside WSL2 (Ubuntu), not PowerShell, so Node, pnpm, and Docker
  share one Linux environment.
- **Stuck for more than ~15 minutes on setup?** Email us. A broken environment is on us, not you.

## What is intentionally NOT here

No Supabase, no cloud, no CI. Everything runs locally. Keep your changes self-contained and runnable
with the quickstart above.
