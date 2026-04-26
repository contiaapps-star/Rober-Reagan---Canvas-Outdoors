# Railway — cron schedules como configuración

Railway permite setear `deploy.cronSchedule` en un service para que se
re-deploye automáticamente en horarios fijos. **Pero**: cuando un service
tiene `cronSchedule`, Railway lo trata como cron-only y no lo deja correr
como long-running web. Por eso el sensor usa **3 services en el mismo
proyecto**, cada uno con su archivo de config:

| Service | Config file | Rol | Schedule |
|---|---|---|---|
| `web` | [railway.toml](../railway.toml) | Long-running, sirve dashboard + endpoints | — |
| `cron-daily` | [railway.cron-daily.toml](../railway.cron-daily.toml) | Cron diario, `POST /jobs/poll/daily` | `0 6 * * *` |
| `cron-weekly` | [railway.cron-weekly.toml](../railway.cron-weekly.toml) | Cron semanal, `POST /jobs/poll/weekly` | `0 6 * * 0` |

Los 3 services usan el **mismo repo y el mismo Dockerfile**. Los crons
arrancan con `bash scripts/trigger-cron.sh <channel>` que hace un curl
HTTP al web service. Si el web responde 4xx/5xx, el script sale con
código 1 y la corrida queda como **failed** en el cron history de
Railway.

---

## Setup paso a paso (una sola vez por proyecto)

### 1. Service `web` (ya lo tenés)

Dashboard → Settings → Config-as-code Path: `railway.toml` (default).
Variables: las que ya documentaste en
[docs/api-providers.md](api-providers.md) — todas las API keys, secrets,
etc.

### 2. Service `cron-daily`

1. Dashboard → **+ New** → **GitHub Repo** → mismo repo.
2. Service name: `cron-daily`.
3. Settings → **Config-as-code Path**: `railway.cron-daily.toml`.
4. Settings → **Volumes**: ❌ ninguno (no toca DB).
5. Settings → **Public Networking**: ❌ no expongas puerto.
6. Settings → **Variables**:
   - `WEB_SERVICE_URL` = `https://${{ web.RAILWAY_PUBLIC_DOMAIN }}`
   - `CRON_SECRET` = `${{ web.CRON_SECRET }}`

   Las dobles llaves son las **service references** de Railway —
   resuelven a la URL pública y al secret del service `web` sin tener
   que copiar/pegar valores.

### 3. Service `cron-weekly`

Idéntico al anterior pero apuntando a `railway.cron-weekly.toml`.

---

## Verificar que funciona

### Disparo manual desde el dashboard

Service `cron-daily` → **Deployments** → **Trigger Deploy**. Eso fuerza
una corrida fuera del schedule. Mirá el log:

```
→ POST https://web-production.up.railway.app/jobs/poll/daily
{"runs":[...],"total_items":42,"total_inserted":12,...}
✓ daily poll OK (HTTP 200)
```

### Desde la CLI

```bash
railway service                 # elegí cron-daily
railway run                     # corre localmente con sus env vars
```

O, sin CLI:

```bash
curl -X POST "$WEB_URL/jobs/poll/daily" \
  -H "X-Cron-Secret: $CRON_SECRET"
```

### Health post-corrida

En la web: `/health/channels` muestra el último `poll_run` por canal +
spend acumulado del mes.

```bash
# Vía DB directa (si querés inspeccionar)
railway service                 # elegí web
railway run -- sqlite3 /data/app.db \
  "SELECT channel, status, items_fetched, error_message,
          datetime(started_at,'unixepoch') AS at
   FROM poll_runs ORDER BY started_at DESC LIMIT 20;"
```

---

## Cambiar el schedule

Editá el `.toml` correspondiente, push a `main`. Railway redeploya el
service y el nuevo schedule entra en vigor. Sintaxis estándar de cron
(UTC):

| Cron | Significado |
|---|---|
| `0 6 * * *` | Diario 06:00 UTC |
| `0 */6 * * *` | Cada 6 horas |
| `0 6 * * 0` | Domingos 06:00 UTC |
| `*/15 * * * *` | Cada 15 min (útil para debug, no para prod) |

---

## Por qué no node-cron en proceso

Está prohibido por CLAUDE.md:

> **Scheduling**: Railway cron (NO n8n, NO node-cron en proceso)

Razones:
- Si el service `web` se reinicia (deploy, OOM, etc.), un cron in-process
  se pierde silenciosamente.
- Railway cron es observable: cada corrida queda como un deployment con
  log + status, queryable desde el dashboard.
- Permite escalar el web a múltiples replicas sin disparar el cron N veces.
