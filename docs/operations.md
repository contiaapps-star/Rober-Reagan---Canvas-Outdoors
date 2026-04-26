# FlowCore Marketing Sensor — Operations Runbook

This is the on-call / handoff doc for the FlowCore Marketing Sensor. It assumes
you have:

- Railway access to the project
- The Railway CLI (`railway`) installed locally (optional but recommended)
- Docker Desktop installed locally (only for one-off scripts)

For the architecture and stack details, see `CLAUDE.md` in the repo root.
For per-provider API contracts and rate limits, see `docs/api-providers.md`.

---

## 1. Deploy a new version

The Railway project is wired to the GitHub repo. Pushing to the `main` branch
auto-builds the Dockerfile and deploys.

```bash
git push origin main
```

Watch the build:

- Railway dashboard → Deployments → latest
- Or `railway logs --follow`

Roll back: in the Railway dashboard, click the previous green deployment and
choose **Redeploy**.

The build uses `Dockerfile target=runner` (multi-stage). It is deterministic
provided `package-lock.json` is committed.

---

## 2. Add or remove competitors / keywords / inspiration sources

All three are managed from the UI by an admin user — no DB shell required.

- `/settings/competitors` — add/edit/delete competitors and their per-channel handles
- `/settings/keywords` — manage the SEO keyword set
- `/settings/inspiration` — manage TikTok / YouTube inspiration accounts and keyword searches

Soft-delete (`is_active=false`) is the default action; nothing is permanently
removed from the DB so historical activities still link back.

---

## 3. Adjust the budget cap

The cap is enforced by `src/middleware/budget-guard.ts` against the env var
`MONTHLY_BUDGET_USD` (default `200`). To raise or lower it:

1. Railway dashboard → **Variables** → edit `MONTHLY_BUDGET_USD`
2. Click **Deploy** (Railway auto-restarts the service to pick up env changes)
3. Verify on `/health/channels`: the spend tile shows the new cap.

The guard logs `WARN` at 80% utilization and `ERROR` (and aborts the call) at
100%. There is no soft-fail mode — at the cap, paid pollers stop until the
month rolls over OR the cap is raised.

---

## 4. Manual backup

The container ships with `sqlite3` and a backup script. Backups land on the
`backups` Railway volume mounted at `/backups`, with 30-day retention.

### Trigger a backup on demand (Railway)

```bash
railway run "sh /app/scripts/backup.sh"
```

…or attach an SSH-style shell from the Railway dashboard and run:

```bash
sh /app/scripts/backup.sh
```

The cron `0 3 * * *` already runs this daily; manual trigger is only needed
before risky operations (a schema migration, a restore drill).

### Restore from a backup

```bash
# inside the container shell
ls -la /backups
sqlite3 /data/app.db ".restore /backups/backup-20260301T030000Z.db"
# restart the service so the open SQLite handle picks up the restored file
```

After restore, restart the Railway service from the dashboard. Verify by
loading `/health` (should return JSON `status:ok`) and `/health/channels`.

### Local backup (dev)

```bash
docker compose exec app sh /app/scripts/backup.sh
docker compose cp app:/backups ./local-backups
```

---

## 5. Restart the service

- Railway dashboard → **Deployments** → **Restart**
- CLI: `railway redeploy`

If the app is in a crash loop and Railway is auto-restarting, set
`OPERATION_MODE=demo` first to confirm the issue is upstream-API-related vs.
application-level. Demo mode hits no external APIs.

---

## 6. Diagnose a broken channel

1. Open `/health/channels`. Cards are color-coded:
   - **Green** — last poll OK, ≤24h ago
   - **Amber** — last poll OK but >24h ago
   - **Red** — last poll failed
2. Click the failing card or read the `error_message` shown on it. Common patterns:
   - `BudgetExceededError: …` → cap hit. Raise `MONTHLY_BUDGET_USD` or wait for next month.
   - `4xx Unauthorized` from a provider → API key rotated or revoked. Update the
     corresponding env var in Railway.
   - `Timeout / 5xx` → upstream provider is degraded. Wait it out — graceful
     degradation guarantees other pollers keep working.
3. For deep debugging, consult `docs/api-providers.md` for the expected
   request/response shape of that provider.
4. As an admin, you can hit **Retry now** on the card to re-run that channel
   without waiting for the daily cron. Routes:
   - `POST /health/run-all` — runs every daily poller across every active competitor
   - `POST /health/retry/:channel` — runs just one channel for every active competitor

Both routes require `requireRole('admin')`; agency users see no buttons.

### Logs

`railway logs --follow` streams JSON-structured logs (pino). Filter by channel:

```bash
railway logs | jq 'select(.channel=="meta_facebook")'
```

---

## 7. Onboarding a new user

Auth is closed (no self-signup). To create a new user:

```bash
# Inside the running container
railway run "npm run create-user -- --email=jane@partner-agency.com --role=agency"
# Or, via docker compose locally
docker compose exec app npm run create-user -- --email=jane@partner-agency.com --role=agency
```

The script prompts for a password (or accept `--password=…` for non-interactive
runs). Roles:

- `admin` — full access including the admin-only health actions
- `agency` — read+write on dashboard / settings; no run-poll buttons

To reset a password, run the same command — the script is idempotent (existing
emails get their password and role updated).

### Bootstrap admin (first deploy or e2e)

For the first Railway deploy, set both `BOOTSTRAP_ADMIN_EMAIL` and
`BOOTSTRAP_ADMIN_PASSWORD` env vars. On boot, the app creates that admin
idempotently. **Remove these vars after the first login** so the password
isn't sitting in env config.

---

## 8. Required environment variables

Refer to `.env.example` for the canonical list. Critical ones:

| Var | Required | Notes |
|-----|----------|-------|
| `OPERATION_MODE` | yes | `demo` (default) or `live` |
| `CRON_SECRET` | yes | Shared with Railway cron; rotate yearly |
| `SESSION_SECRET` | yes | Min 32 chars; rotating it logs everyone out |
| `MONTHLY_BUDGET_USD` | no | default 200 |
| `BACKLINK_DR_THRESHOLD` | no | default 30 |
| `OPENROUTER_API_KEY` | live only | summaries + extraction |
| `APIFY_API_TOKEN` | live only | Meta Ads, TikTok, Google Ads |
| `ZENROWS_API_KEY` | live only | website scraping |
| `YOUTUBE_API_KEY` | live only | YouTube Shorts |
| `SERPER_API_KEY` | live only | SEO rankings |
| `DATAFORSEO_LOGIN` / `_PASSWORD` | live only | backlinks |

After adding any of these, click **Deploy** in Railway to restart with the new
env. Rotating `SESSION_SECRET` invalidates every session cookie.

---

## 9. Cron jobs

Configured in `railway.toml`:

```
0 6  * * *   POST /jobs/poll/daily   (website + Meta + Google + TikTok + YouTube)
0 6  * * 0   POST /jobs/poll/weekly  (SEO ranking + backlinks)
0 3  * * *   sh /app/scripts/backup.sh
```

All cron commands hit the running web service via HTTP, gated by
`X-Cron-Secret`. To trigger a poll manually for testing:

```bash
curl -fS -X POST "https://${RAILWAY_PUBLIC_DOMAIN}/jobs/poll/daily" \
     -H "X-Cron-Secret: ${CRON_SECRET}"
```

---

## 10. Healthcheck + monitoring

- `GET /health` — JSON probe used by Railway's healthcheck. 200 ⇒ DB reachable.
- `/health/channels` — operator UI. Per-card color shows degradation.

Railway will restart the container if `/health` returns non-200 for several
intervals. Configure paging from the Railway dashboard → **Health** → **Alerts**.

---

## 11. Smoke test after deploy

```bash
# 1. Healthcheck
curl -fsS https://${RAILWAY_PUBLIC_DOMAIN}/health | jq .

# 2. Login (via browser): open the URL, sign in with admin creds.

# 3. Force a poll
curl -fsS -X POST "https://${RAILWAY_PUBLIC_DOMAIN}/jobs/poll/website" \
     -H "X-Cron-Secret: ${CRON_SECRET}" | jq .

# 4. Verify in UI: dashboard should now show new activity.
```

---

## 12. Known limits

- SQLite single-writer model — concurrent writes serialise. Volume is fine for
  the expected scale (≤22 competitors × ~5 channels × daily polls ≈ ~110
  writes/day). If load grows ≥10×, evaluate Postgres.
- `/data` is a single Railway volume — back it up daily (already wired).
- The budget guard estimates spend from a hardcoded cost table
  (`src/config/api-costs.ts`) — actual provider invoices may diverge. Review
  the table when providers change pricing.
