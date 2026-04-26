# FlowCore Marketing Sensor

Daily competitive-intelligence feed for FlowCore Water (Saginaw, TX). Phase 0
delivers the Hono + SQLite + Tailwind + htmx skeleton, containerized with Docker.
Pollers, LLM summarization, auth, and the live dashboard arrive in later phases.

## Run locally

```bash
cp .env.example .env
# Edit .env and set CRON_SECRET and SESSION_SECRET (≥32 chars).
docker compose up --build
```

The server is on http://localhost:3000. Smoke check: `curl http://localhost:3000/health`.

## Run tests

```bash
docker compose exec app npm test
```

Vitest runs inside the container against the same SQLite native binding the
server uses. Do **not** run `npm test` on the host — the host's `node_modules`
will have a Windows / macOS build of `better-sqlite3` that won't load in Linux.

## Deploy

Railway auto-deploys from `main` using the [`Dockerfile`](./Dockerfile) target
`runner`. See [`railway.toml`](./railway.toml) for the build + healthcheck config.

For local production-mode runs:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

## Folder structure

```
/src
  /routes/       dashboard.ts, settings.ts, jobs.ts, auth.ts, health.ts
  /views/        layout.tsx, partials/
  /db/           schema.ts, client.ts, migrations/
  /services/     (Phase 4-5: polling-orchestrator, llm-summarizer, dedupe, budget-guard)
  /pollers/      (Phase 5: one file per channel)
  /pollers/fixtures/   (Phase 5: demo-mode JSON)
  /lib/          env.ts, logger.ts
  /middleware/   error-handler.ts
  index.ts       Hono entrypoint + middleware wiring
/public          /css/output.css (Tailwind build), /js/htmx.min.js, /logo.svg
/tests           smoke.test.tsx (Phase 0); mirror src/ from Phase 1 onward
/scripts         seed.ts, backup.sh
/docs            development-phases.md, feasibility-report.md, phases/README.md
Dockerfile, docker-compose.yml, docker-compose.prod.yml
package.json, tsconfig.json, drizzle.config.ts, tailwind.config.ts, railway.toml
```

## Environment variables

All env vars are documented and validated by [`src/lib/env.ts`](./src/lib/env.ts).
Copy [`.env.example`](./.env.example) and fill in `CRON_SECRET` and `SESSION_SECRET`
(everything else has sensible defaults for `OPERATION_MODE=demo`).

## Stack

Hono 4 · Node 20 · TypeScript strict · SQLite (better-sqlite3) · Drizzle ORM ·
Tailwind 3 · htmx 1.9 · Zod · Vitest. Containerized via Docker Compose; deployed
on Railway. The stack is **fixed** — see [`CLAUDE.md`](./CLAUDE.md) for the
authoritative non-negotiables.
