# FlowCore Marketing Sensor — Plan de Desarrollo Faseado

**Cliente**: FlowCore Water (Saginaw, TX) | **Build owner**: Sagan AI Practice
**Fecha**: 2026-04-25 | **Versión**: 1.0
**Documento relacionado**: `feasibility-report.md` (lectura obligatoria antes de Fase 7)

---

## Visión General — 8 Fases

| # | Fase | Foco | Tiempo estimado | Validación principal |
|---|------|------|-----------------|----------------------|
| **0** | Setup, Foundations & Docker      | Esqueleto Hono+TS+SQLite+Drizzle+Tailwind+htmx, Docker, healthcheck | 1 día | `docker compose up` → `curl /health` 200 OK |
| **1** | Database & Models                 | Schema Drizzle completo con seed sintético (22 competidores + 80–120 activities) | 1 día | `npm run seed` → tablas pobladas + tests verdes |
| **2** | CRUD / Settings UI                | Settings pages (competitors, keywords, inspiration sources) — htmx fragments | 1.5 días | Robert puede agregar/editar/borrar entidades desde el navegador |
| **3** | Intelligence Board (read path)    | Dashboard principal con KPIs, filters, activity feed, useful/skip toggle | 2 días | Filtrar por canal+competidor+date+status funciona; toggle persiste |
| **4** | LLM Summarization + Demo Pollers  | OpenRouter integration (SoTA + Lightweight) + pollers en `demo` mode | 1.5 días | Cron `POST /jobs/poll/all` genera nuevas activities con summaries reales |
| **5** | Live Pollers (6 canales)          | Implementación real de pollers contra Apify, ZenRows, YouTube, Serper, DataForSEO | 3 días | Switch `OPERATION_MODE=live` y verificar 1 poll real por canal |
| **6** | Activity Detail + Health + Cron + BudgetGuard | Detalle, health view, cron secret, budget guard, graceful degradation | 2 días | Vista health funciona; budget guard aborta cuando se excede cap |
| **7** | Polish, Auth, Tests E2E, Deploy   | Auth Argon2 + sessions, polish visual, E2E con Playwright, deploy Railway | 2 días | App live en Railway; Robert puede loguearse y operar end-to-end |

**Total estimado**: ~13–14 días-dev (un solo dev fullstack senior). Asume Sagan AI
engineer + revisión Sagan PM.

> **Nota sobre tests**: Cada fase tiene `TESTS OBLIGATORIOS` y `GATE DE AVANCE` que
> bloquea la siguiente. Toda la suite corre dentro del container (`docker compose
> exec app npm test`). Los tests no se difieren a Fase 7 — Fase 7 sólo agrega E2E
> con Playwright y coverage targets globales.

---

## Mapa de Dependencias

| Fase | Depende de | Archivos a adjuntar al prompt | Assets necesarios del cliente |
|------|-----------|--------------------------------|-------------------------------|
| 0 | Nada                | PRD-flowcore-water.md + screenshots 9, 14, 20, 26 (para visual style reference) | Ninguno |
| 1 | Fase 0 verde + tests| (CLAUDE.md ya en repo)         | Ninguno (seed sintético) |
| 2 | Fase 1 verde + tests| Screenshots 14, 20 (estilo de tablas/forms) | Ninguno |
| 3 | Fase 2 verde + tests| Screenshots 14, 20             | Ninguno |
| 4 | Fase 3 verde + tests| Ninguno                        | OpenRouter API key (Sagan provee) |
| 5 | Fase 4 verde + tests| Ninguno                        | **Pre-deploy only**: Apify token, ZenRows key, YouTube key, Serper key, DataForSEO login/pass. Para devel, fixtures bastan. |
| 6 | Fase 5 verde + tests| Ninguno                        | Ninguno |
| 7 | Fase 6 verde + tests| Ninguno                        | **BLOQUEANTE**: lista confirmada de 22 competidores (domains + handles), lista de 5–50 keywords, lista de inspiration sources. Ver feasibility-report §4–6. |

> **Header note**: cada celda "Depende de" implícitamente requiere que la suite de tests
> de la fase previa esté **100% verde**. No avanzar con tests rotos o skipped.

---

## FASE 0 — Setup, Foundations & Docker

```
Vamos a arrancar el proyecto "FlowCore Marketing Sensor" desde cero. Adjunto el
PRD-flowcore-water.md y 4 screenshots de referencia (9, 14, 20, 26) que muestran el
estilo visual que Robert ya usa en sus apps internas — el sensor debe seguir el mismo
lenguaje (dark theme + sidebar cyan/teal + KPI tiles + tabla densa).

OBJETIVO DE ESTA FASE:
Setup inicial del proyecto Hono+TypeScript+SQLite+Drizzle+Tailwind+htmx, containerizado
con Docker. Al final debe correr localmente con `docker compose up --build` y responder
en `/health`.

STACK FIJO (NO MODIFICAR — viene del PRD):
- Backend: Hono 4.x sobre Node.js 20 LTS + TypeScript strict
- Frontend: HTML server-rendered (Hono JSX) + Tailwind CSS 3.x + htmx 1.9.x
- Base de datos: SQLite 3 (better-sqlite3 driver) en volumen Docker `db-data:/data/app.db`
- ORM: Drizzle ORM
- Validación: Zod
- Tests: Vitest + Supertest (HTTP) + happy-dom
- Containerización: Docker + Docker Compose (obligatorio)
- Sin React, sin Vue, sin Next.js, sin Postgres, sin Redis, sin BullMQ, sin n8n.
- LLM/integraciones externas: NO en esta fase. OpenRouter llega en Fase 4, pollers
  reales en Fase 5.

TAREAS:

1. Crear estructura de carpetas exactamente así:
   ```
   /src
     /routes        → dashboard.ts, settings.ts, jobs.ts, auth.ts, health.ts
     /views         → layout.tsx, partials/
     /db            → schema.ts, client.ts, migrations/
     /services      → (vacío, pobla en fases siguientes)
     /pollers       → (vacío)
     /pollers/fixtures → (vacío)
     /lib           → env.ts, logger.ts
     /middleware    → error-handler.ts
     /tests         → smoke.test.ts
     index.ts       → entrypoint Hono
   /public          → /css/output.css (compilado por Tailwind), /js/htmx.min.js, /logo.svg placeholder
   /docs            → (este archivo va acá; tambien feasibility-report.md ya está)
   /scripts         → seed.ts (placeholder), backup.sh
   Dockerfile
   docker-compose.yml
   .dockerignore
   .env.example
   .gitignore
   package.json
   tsconfig.json
   drizzle.config.ts
   tailwind.config.ts
   postcss.config.js
   railway.toml
   README.md
   ```

2. `package.json` con scripts:
   ```json
   {
     "scripts": {
       "dev": "tsx watch src/index.ts",
       "build": "tsc && tailwindcss -i ./src/styles.css -o ./public/css/output.css --minify",
       "start": "node dist/index.js",
       "test": "vitest run",
       "test:watch": "vitest",
       "db:generate": "drizzle-kit generate",
       "db:push": "drizzle-kit push",
       "seed": "tsx scripts/seed.ts"
     }
   }
   ```
   Dependencies: `hono`, `@hono/node-server`, `better-sqlite3`, `drizzle-orm`, `zod`,
   `tsx` (dev), `typescript` (dev), `tailwindcss` (dev), `vitest` (dev), `supertest` (dev),
   `@types/node` (dev), `drizzle-kit` (dev), `pino` (logger), `pino-pretty` (dev).

3. `src/lib/env.ts` con Zod schema validando:
   ```
   NODE_ENV: 'development' | 'production' | 'test'
   PORT: number (default 3000)
   DATABASE_PATH: string (default '/data/app.db')
   OPERATION_MODE: 'demo' | 'live' (default 'demo')
   CRON_SECRET: string (required)
   MONTHLY_BUDGET_USD: number (default 200)
   BACKLINK_DR_THRESHOLD: number (default 30)
   OPENROUTER_API_KEY: string (optional, required only if mode=live OR llm-using endpoints)
   APIFY_API_TOKEN: string (optional)
   ZENROWS_API_KEY: string (optional)
   YOUTUBE_API_KEY: string (optional)
   SERPER_API_KEY: string (optional)
   DATAFORSEO_LOGIN: string (optional)
   DATAFORSEO_PASSWORD: string (optional)
   SESSION_SECRET: string (required, min 32 chars)
   ```
   Exportar `env` ya parseado y typesafe. Si parse falla, log + exit(1) al boot.

4. `src/index.ts`: monta Hono app, agrega middleware de logging (pino + request-id),
   error handler, monta `/health` route, `serveStatic` para `/public/*`. Listen en
   `env.PORT`. Healthcheck retorna `{ status: 'ok', mode: env.OPERATION_MODE,
   db: <ping result>, uptime_s: process.uptime() }`.

5. `src/views/layout.tsx`: layout base JSX (Hono JSX) con `<html>`, `<head>` (Tailwind
   CSS link, htmx script, viewport meta), `<body>` con dos slots: `sidebar` y `content`.
   Sidebar tiene brand "FLOWCORE" en cyan + sub-label "MARKETING SENSOR" + nav items
   placeholder (Dashboard / Settings / Health / Sign Out). Usa CSS variables de Tailwind
   para los colores definidos en CLAUDE.md (bg `#0F1419`, surface `#1A2332`, accent
   cyan `#06B6D4`).

6. `tailwind.config.ts`: dark mode default, theme.extend.colors con `flowcore.bg`,
   `flowcore.surface`, `flowcore.accent`, `flowcore.success`, `flowcore.warning`,
   `flowcore.danger`, `flowcore.muted`. Content paths apuntando a `./src/**/*.{ts,tsx}`.

7. `drizzle.config.ts`: dialect `sqlite`, schema en `./src/db/schema.ts`, out en
   `./src/db/migrations`, dbCredentials con `DATABASE_PATH` env.

8. `Dockerfile` multi-stage:
   - Stage 1 `deps`: `node:20-bookworm-slim`, `apt-get install curl tini`, copy
     `package*.json`, `npm ci`.
   - Stage 2 `builder`: copia código + `npm run build`.
   - Stage 3 `runner`: copia `dist/`, `public/`, `node_modules` (production-only),
     `package.json`. WORKDIR `/app`. EXPOSE 3000. HEALTHCHECK con `curl -f
     http://localhost:3000/health`. ENTRYPOINT `["tini","--"]`. CMD `["node","dist/index.js"]`.
     User `node` (built-in non-root del image oficial).

9. `docker-compose.yml`:
   ```yaml
   services:
     app:
       build: .
       ports:
         - "${PORT:-3000}:3000"
       volumes:
         - db-data:/data
         - ./src:/app/src       # dev hot-reload
         - ./public:/app/public
       env_file:
         - .env
       healthcheck:
         test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
         interval: 30s
         timeout: 10s
         retries: 3
       restart: unless-stopped
   volumes:
     db-data:
   ```

10. `.dockerignore`: `.git`, `.env`, `node_modules`, `dist`, `*.db`, `docs/`, `tests/`,
    `coverage/`, `.vscode/`.

11. `railway.toml` apuntando al Dockerfile (no Nixpacks):
    ```toml
    [build]
    builder = "DOCKERFILE"
    dockerfilePath = "Dockerfile"
    [deploy]
    healthcheckPath = "/health"
    healthcheckTimeout = 30
    restartPolicyType = "ON_FAILURE"
    ```

12. `.env.example` con todas las vars listadas en task 3, comentadas + valor de ejemplo.

13. `.gitignore`: `node_modules`, `dist`, `.env`, `*.db`, `coverage/`, `.DS_Store`.

14. `README.md`:
    - Descripción 2 líneas
    - "Run locally": `cp .env.example .env`, set `CRON_SECRET` y `SESSION_SECRET`,
      `docker compose up --build`
    - "Run tests": `docker compose exec app npm test`
    - "Deploy": Railway auto-deploy desde main; ver `railway.toml`
    - Estructura de carpetas (copy de la de task 1)
    - Variables de entorno (link a `.env.example`)

15. **VERIFICAR** que `CLAUDE.md` está en raíz del repo (ya fue creado por el skill
    prd-to-phases). Si falta, ABORTAR la fase y pedirme que lo regenere.

16. Crear `docs/phases/README.md` con índice de las 8 fases (1 línea c/u, links a
    `docs/development-phases.md#fase-N`).

17. `git init`, primer commit `chore: initial setup with docker + hono skeleton`.

TESTS OBLIGATORIOS (escribir y dejar verdes ANTES de cerrar la fase):

- `tests/smoke.test.ts`:
  1. **healthcheck**: GET `/health` retorna 200 + JSON con `status: 'ok'` + `mode`
     coincide con `OPERATION_MODE` env.
  2. **env validation**: importar `src/lib/env` con `OPERATION_MODE=invalid` rompe
     con error claro de Zod.
  3. **layout renders**: render del layout JSX con slots dummy contiene `<title>`,
     `data-tw="loaded"` y el brand "FLOWCORE".
  4. **static serving**: GET `/css/output.css` retorna 200 + content-type CSS (build
     del Tailwind generó el archivo).

Comando para correr la suite (siempre dentro de Docker):
  `docker compose exec app npm test`

ENTREGABLE VALIDABLE:
- `docker compose up --build` levanta el server sin errores y `curl localhost:3000/health`
  retorna 200 OK con JSON correcto.
- El container corre como user no-root.
- `docker compose down && docker compose up` mantiene el volumen `db-data` (verificar
  con `docker volume ls`).
- `docker compose exec app npm test` retorna exit 0 con 4/4 tests pasando.
- CLAUDE.md visible en root del repo.
- `git log` muestra el primer commit.

GATE DE AVANCE (BLOQUEANTE):
NO avances a la Fase 1 hasta que `docker compose exec app npm test` retorne exit code 0
con 100% de los tests pasando. Si algún test falla, ARREGLA EL CÓDIGO (no debilites el
test, no lo skipees, no lo marques como `it.skip` ni `it.todo`) y volvé a correr la
suite hasta que toda pase. Reportá explícitamente el output del último run antes de
continuar.

NO HAGAS en esta fase: modelos de BD reales, UI de dashboard, lógica de pollers,
llamadas a OpenRouter ni a APIs externas, auth, fixtures de seed real. Solo el
esqueleto + Docker + healthcheck + smoke tests.
```

---

## FASE 1 — Database & Models + Seed Sintético

```
Fase 1 del FlowCore Marketing Sensor. Lee CLAUDE.md para contexto completo (sección
"Modelo de Datos" tiene el schema canónico).

OBJETIVO:
Crear el schema completo con Drizzle ORM, generar migraciones, crear seed script con
~22 competidores sintéticos + 80–120 activities sintéticas distribuidas en 30 días.
Sin esto, las fases 2 y 3 no pueden testear nada visualmente.

TAREAS:

1. Crear `src/db/schema.ts` con TODAS las tablas listadas en CLAUDE.md sección "Modelo
   de Datos". Drizzle SQLite syntax. Recordar:

   - **competitors**: PK `id` text uuid, `name` text NOT NULL, `domain` text UNIQUE NOT
     NULL, `category` text CHECK in ('well','plumbing','both'), `tier` text CHECK in
     ('local_same_size','mondo_100m','national','inspiration'), `logo_url` text,
     `is_active` int default 1, `created_at`/`updated_at` int default
     `unixepoch()`.
   - **competitor_handles**: FK `competitor_id` references `competitors(id)` ON DELETE
     CASCADE; UNIQUE(competitor_id, channel).
   - **target_keywords**: como en CLAUDE.md.
   - **inspiration_sources**: como en CLAUDE.md.
   - **activities**: TODOS los campos. `dedupe_hash` UNIQUE NOT NULL. `raw_payload`
     como `text` con json (Drizzle helper `text({ mode: 'json' })`).
   - **poll_runs**, **api_spend_log**: como en CLAUDE.md.
   - **users**, **session_state**: schema sólo (sin endpoints aún). El `users.role`
     CHECK in ('admin','agency').

2. Crear los índices listados en CLAUDE.md:
   - `idx_activities_detected_at` DESC
   - `idx_activities_filters` (competitor_id, channel, status)
   - `idx_activities_dedupe_hash` UNIQUE
   - `idx_poll_runs_health` (channel, started_at DESC)

3. `src/db/client.ts`: exporta `db` (instancia de drizzle), `sqlite` (better-sqlite3
   handle). Pragmas al boot: `journal_mode=WAL`, `synchronous=NORMAL`, `foreign_keys=ON`.

4. Generar migración inicial: `docker compose exec app npm run db:generate`. Verificar
   que el SQL generado matchea el schema (revisar el archivo en `src/db/migrations/`).

5. `scripts/seed.ts`:
   - **Idempotente**: detectar si ya hay competidores y abortar con mensaje claro
     ("DB ya seedeada — borrá `data/app.db` para regenerar"). Flag `--force` permite
     re-seed.
   - Insertar **22 competidores** con nombres realistas (NO usar nombres reales, son
     sintéticos):
     - Wells (10): "Clearwater Wells TX", "Trinity Valley Well Services", "AquaPoint
       Drilling Co.", "North Texas Well Pros", "DeepRock Water Wells", "Lonestar Well &
       Pump", "PrairieFlow Drilling", "BedrockWater Texas", "Nationwide Well Services",
       "AquaCore National" (mix tiers como en feasibility §4).
     - Plumbing (12): "AquaPoint Plumbing North Texas", "Reliant Plumbing DFW",
       "Hometown Plumbers Saginaw", "Five Star Plumbing TX", "Patriot Plumbing
       Services", "BluePipe Plumbers", "MetroPlex Plumbing Pros", "FastFlow Plumbing",
       "Roto-Rooter (national)", "Mr. Rooter Plumbing", "Benjamin Franklin Plumbing",
       "ARS Rescue Rooter".
     - Tiers distribuidos: ~6 local_same_size, ~10 mondo_100m, ~6 national.
   - Para cada competidor, insertar 4–5 `competitor_handles` (website implícito en
     `domain`; agregar meta_facebook, meta_instagram, tiktok, youtube, google_ads).
     Algunos pueden tener handles `null` (ej. competidor sin TikTok).
   - Insertar **15 target_keywords** (mix well + plumbing): "water well drilling Fort
     Worth", "plumber Saginaw TX", "well pump repair North Texas", "water filtration
     DFW", "tankless water heater install", "emergency plumber 24/7", "septic system
     installation", "water softener replacement", "drain cleaning services",
     "irrigation system repair", "well drilling cost", "best plumber near me",
     "water well inspection", "water well drilling near me", "burst pipe repair".
   - Insertar **5 inspiration_sources**: 3 accounts (`@trade_tiktok_pro`,
     `@plumbing_dad`, `@waterwellbob`) + 2 keyword_searches ("plumbing fail viral",
     "water well drilling tiktok").
   - Insertar **80–120 activities** distribuidas en los últimos 30 días:
     * ~30 `new_blog_post` (channel `website`)
     * ~15 `new_landing_page` (channel `website`)
     * ~20 `new_ad_creative` (channel `meta_facebook` o `meta_instagram`)
     * ~5 `new_landing_page` desde Google Ads (channel `google_ads`)
     * ~15 `new_video` (channel `tiktok`)
     * ~10 `new_video` (channel `youtube`)
     * ~10 `rank_change` (channel `seo_ranking`)
     * ~5 `new_backlink` (channel `seo_backlink`)
   - Para cada activity:
     * `detected_at` random en últimos 30 días
     * `published_at` 0–24h antes de `detected_at`
     * `source_url` realista (`https://<competitor.domain>/blog/<slug>` etc.)
     * `dedupe_hash` único (sha256 de `competitor_id + channel + source_url + index`)
     * `raw_payload` JSON con campos plausibles según canal
     * `summary_text` placeholder ("[Pendiente generar con LLM en Fase 4]") — NO
       llamar a OpenRouter en esta fase
     * `themes_extracted` `["pricing","local-seo"]` placeholder
     * `status`: 70% `new`, 20% `useful`, 10% `skip` (distribución para que el
       dashboard tenga visual variety en Fase 3)
   - Insertar **5 `poll_runs`** dummy: 4 con `status=ok`, 1 con `status=failed` y
     `error_message` realista ("Apify actor timeout after 60s").
   - Insertar **2 `api_spend_log`** dummy para mes actual: `apify` $42.30, `openrouter`
     $3.10.
   - Insertar **1 user admin** dummy: email `robert@flowcorewater.com`, password_hash
     placeholder ("[set en Fase 7]"), role `admin`.

6. Comando CLI: `docker compose exec app npm run seed` ejecuta el script. Loguear
   cantidades insertadas por tabla al finalizar.

7. Helper `src/db/queries.ts` con queries reutilizables para Fase 3:
   - `getRecentActivities(limit, filters)` — lista paginada con joins a competitors
   - `countActivitiesByStatus()` — para los KPI tiles
   - `getCompetitorsActive()` — para el dropdown de filtros
   - Cada query con tipos retornados strict (Drizzle infiere).

TESTS OBLIGATORIOS (escribir y dejar verdes ANTES de cerrar la fase):

- `tests/db/schema.test.ts`:
  1. **migrations apply clean**: `migrate()` programático sobre DB en memoria
     (`:memory:`) corre sin errores y crea las 9 tablas esperadas.
  2. **CRUD básico de Competitor**: insert + select + update + delete funciona; FK
     ON DELETE CASCADE elimina handles.
  3. **dedupe_hash unique**: insertar dos `activities` con el mismo `dedupe_hash`
     lanza UNIQUE constraint error.
  4. **enum CHECK constraints**: insertar competitor con `category='invalid'` lanza
     error de CHECK.
  5. **JSON column funciona**: insertar `raw_payload: { foo: 'bar' }` y leerlo
     retorna el objeto deserializado.

- `tests/db/seed.test.ts`:
  6. **seed idempotente**: correr `seed()` dos veces sin `--force` lanza error;
     con `--force` borra y recrea.
  7. **seed counts correctos**: post-seed: `competitors.count === 22`,
     `target_keywords.count === 15`, `inspiration_sources.count === 5`,
     `activities.count` between 80 y 120.
  8. **distribución de status**: aprox 70/20/10 para new/useful/skip (test con
     tolerancia ±10%).

- `tests/db/queries.test.ts`:
  9. **getRecentActivities con filtro de canal**: retorna solo activities del canal
     pedido, ordenado por `detected_at DESC`.
  10. **countActivitiesByStatus**: retorna las 3 categorías con counts > 0.

Comando para correr la suite (siempre dentro de Docker):
  `docker compose exec app npm test`

ENTREGABLE VALIDABLE:
- `docker compose exec app npm run db:push` aplica el schema sin errores.
- `docker compose exec app npm run seed` carga la data sintética; output muestra
  counts por tabla.
- `sqlite3 data/app.db ".tables"` lista las 9 tablas esperadas.
- `docker compose exec app npm test` retorna exit code 0 con 10/10 tests pasando.

GATE DE AVANCE (BLOQUEANTE):
NO avances a la Fase 2 hasta que `docker compose exec app npm test` retorne exit code 0
con 100% de los tests pasando. Si algún test falla, ARREGLA EL CÓDIGO (no debilites el
test, no lo skipees, no lo marques `it.todo`) y volvé a correr la suite hasta que toda
pase. Reportá explícitamente el output del último run antes de continuar.

NO HAGAS: rutas HTTP que no sean `/health` (ya existe), templates de UI, llamadas a
LLM, llamadas a APIs externas, auth real (sólo el row dummy en users). Solo schema,
seed, queries y sus tests.
```

---

## FASE 2 — Settings UI (CRUD competitors / keywords / inspiration)

```
Fase 2 del FlowCore Marketing Sensor. Lee CLAUDE.md y revisá los modelos creados en
Fase 1. Adjunto screenshots 14 y 20 — el estilo visual (sidebar dark + KPI tiles +
tabla densa) tiene que matchear esos.

OBJETIVO:
CRUD completo de Competitors, Target Keywords e Inspiration Sources desde el navegador,
usando htmx para fragments parciales (sin full page refresh). Robert necesita poder
agregar/editar/borrar las 3 entidades sin tocar la DB ni pedir al dev.

TAREAS:

1. `src/views/layout.tsx`: completar el sidebar con nav real:
   - Dashboard (`/`)
   - Settings → expandible: Competitors (`/settings/competitors`), Keywords
     (`/settings/keywords`), Inspiration (`/settings/inspiration`)
   - Health (`/health/channels`)
   - Sign Out (placeholder en esta fase, real en Fase 7)
   Item activo se resalta con bg `flowcore.surface` y border-left de 3px en
   `flowcore.accent`.

2. `src/routes/settings.ts`: rutas:
   - `GET /settings/competitors` → tabla full HTML (layout completo)
   - `GET /settings/competitors/new` → modal form fragment
   - `POST /settings/competitors` → crea + retorna fragmento del row insertado
     (`hx-target` apunta al `<tbody>` con `hx-swap="afterbegin"`)
   - `GET /settings/competitors/:id/edit` → form fragment para editar
   - `PUT /settings/competitors/:id` → update + retorna row actualizado
   - `DELETE /settings/competitors/:id` → soft delete (set `is_active=false`) +
     retorna `<tr>` vacío con `hx-swap="outerHTML"`
   - Análogos para `/settings/keywords` y `/settings/inspiration`

3. Templates en `src/views/settings/`:
   - `competitors-list.tsx`: tabla con columnas Name, Domain, Category, Tier, Channels
     (chips con handles activos), Active toggle, Actions
   - `competitor-form.tsx`: form con campos name, domain, category select,
     tier select, y sección "Handles" con un input por canal (meta_facebook,
     meta_instagram, tiktok, youtube_channel_id, google_ads_advertiser_id)
   - `keywords-list.tsx` + `keyword-form.tsx` (más simple — keyword text + category +
     toggle activo)
   - `inspiration-list.tsx` + `inspiration-form.tsx` (kind select [account |
     keyword_search] + value text + channel select [tiktok | youtube] + toggle)

4. JavaScript vanilla mínimo en `public/js/settings.js`:
   - Solo helpers para confirm dialogs ("¿Borrar competidor?") y toggle del
     dropdown del sidebar Settings. Todo lo demás vía htmx.

5. Validación server-side con Zod en cada POST/PUT:
   - Domain: regex `/^[a-z0-9.-]+\.[a-z]{2,}$/i` lowercase
   - Tier: solo los enums permitidos
   - Errores se renderizan inline en el form (htmx swap del fragment con errores
     marcados en rojo)

6. Mensajes flash globales: helper `flash(c, type, message)` que setea cookie corta
   (5s) leída por el layout. Tipos: success (verde), error (rojo).

7. CSS adicional en `src/styles.css` con clases utility para chips, pills, tabla:
   - `.chip-channel-website`, `.chip-channel-meta`, etc. (color por canal según
     CLAUDE.md sección Visual Specs)
   - `.btn-primary` (cyan), `.btn-danger` (red), `.btn-ghost` (transparent border)
   - `.table-flowcore` con padding y hover correctos.

TESTS OBLIGATORIOS (escribir y dejar verdes ANTES de cerrar la fase):

- `tests/routes/settings-competitors.test.ts`:
  1. **GET /settings/competitors** retorna 200 + HTML con la palabra
     "Competitors" + tabla con 22 rows (después del seed).
  2. **POST /settings/competitors** con body válido inserta y retorna fragmento
     `<tr>` con el name+domain.
  3. **POST con domain duplicado** retorna 400 + form fragment con el mensaje
     "Domain already exists".
  4. **POST con category=invalid** retorna 400 + error de Zod legible.
  5. **PUT /settings/competitors/:id** actualiza name y retorna fragmento con el
     nuevo name.
  6. **DELETE /settings/competitors/:id** marca `is_active=false`, NO borra row de
     la DB; siguiente GET no muestra la row.
  7. **GET /settings/competitors/:id/edit** con id inexistente retorna 404.

- `tests/routes/settings-keywords.test.ts` (análogo, 4 tests).
- `tests/routes/settings-inspiration.test.ts` (análogo, 4 tests).

- `tests/views/render.test.ts`:
  12. **render del sidebar marca el item activo correcto** según pathname.
  13. **render de chip por canal usa la clase CSS correcta** (`chip-channel-meta`
      para `meta_facebook`).

Comando para correr la suite (siempre dentro de Docker):
  `docker compose exec app npm test`

ENTREGABLE VALIDABLE:
- Levantar `docker compose up`, ir a `http://localhost:3000/settings/competitors`,
  ver los 22 competidores seedeados, agregar uno nuevo desde el modal, editarlo,
  borrarlo. Todo sin full page refresh (verificar en Network tab que sólo viajan
  fragmentos).
- Lo mismo para keywords e inspiration.
- `docker compose exec app npm test` retorna exit 0 con todos los tests pasando.

GATE DE AVANCE (BLOQUEANTE):
NO avances a la Fase 3 hasta que `docker compose exec app npm test` retorne exit 0 con
100% de los tests pasando. Si algún test falla, ARREGLA EL CÓDIGO (no debilites, no
skipees) y volvé a correr la suite hasta que toda pase. Reportá explícitamente el
output del último run antes de continuar.

NO HAGAS: dashboard de actividades (es Fase 3), llamadas a LLM, pollers, auth real,
detail view de activities. Solo CRUD de las 3 entidades de configuración + sidebar
funcional + estilos.
```

---

## FASE 3 — Intelligence Board (read path + useful/skip)

```
Fase 3 del FlowCore Marketing Sensor. Lee CLAUDE.md sección "Vista 1 — Dashboard".
Esta fase construye la vista CORE que Robert va a usar todos los días. Es la razón de
ser del producto.

OBJETIVO:
Dashboard `/` que muestra el feed de activities con KPI tiles, chip filters por canal/
fecha/status, dropdown filter por competidor, y toggle inline useful/skip vía htmx.
Trabaja contra los ~80–120 activities seedeados en Fase 1 — no requiere pollers todavía.

TAREAS:

1. `src/routes/dashboard.ts`:
   - `GET /` → render full HTML con KPIs + filtros + tabla de activities
   - `GET /activities/feed` → fragment de la tabla (para htmx swap cuando cambian
     filtros). Acepta query params: `channel`, `competitor_id`, `status`, `range`
     (today | 7d | 30d | all), `cursor` (para paginación con "Load more").
   - `POST /activities/:id/status` → body `{ status: 'useful' | 'skip' | 'new' }`
     persiste, registra `status_changed_by` (placeholder hasta Fase 7),
     `status_changed_at = now`. Retorna fragmento con el pill actualizado.

2. KPI tiles en el header (`src/views/dashboard/kpi-row.tsx`):
   - **New Today**: count de activities con `detected_at >= start_of_today_utc`
   - **New This Week**: count desde inicio de semana (lunes)
   - **Marked Useful**: count con `status='useful'` (all-time)
   - **Pending Review**: count con `status='new'` (all-time)
   - **Active Channels**: count distinct de canales con al menos 1 poll OK <24h
   - **Failed Channels**: count distinct de canales con último poll `failed`
     en últimas 24h. Si > 0, color tile en `flowcore.danger`.

3. Chip filters (`src/views/dashboard/filters.tsx`):
   - Date range: `Today | 7d | 30d | All` (default 7d)
   - Channel: `All | Website | Meta | Google | TikTok | YouTube | SEO` (channel SEO
     unifica `seo_ranking` + `seo_backlink`)
   - Status: `All | New | Useful | Skip` (default `All`)
   - Competitor: `<select>` con search (datalist) — todos los competidores activos
   - Cada chip y el select tiene `hx-get="/activities/feed"` con `hx-include` del
     resto de los filtros, `hx-target="#activity-feed"`, `hx-swap="innerHTML"`,
     `hx-push-url="true"` (URL refleja los filtros).
   - Last filter state persistido en cookie `flowcore_filter_state` (JSON), leído
     en `GET /` para restaurar al cargar.

4. Activity feed table (`src/views/dashboard/activity-row.tsx`):
   - Columnas: Avatar(32×32) + Competitor name + tier badge | Channel badge color
     | Activity type + summary (2 líneas truncadas) | Detected (relative time) |
     Source link icon | Status pill | Action buttons (Useful ✓ / Skip ✕ / Detail 👁)
   - Botón Useful: `<button hx-post="/activities/:id/status"
     hx-vals='{"status":"useful"}' hx-target="closest tr">`. Igual para Skip.
   - Si el `summary_text` es el placeholder ("[Pendiente generar...]"), mostrar
     "Summary pending" en gris itálica + tooltip "Llegará después del próximo poll".

5. Paginación: cursor-based (`detected_at` + `id` como tiebreaker). Retornar 25 rows
   por request. Botón "Load more" al final de la tabla con `hx-get` y
   `hx-swap="beforeend"`.

6. Empty state: cuando los filtros no devuelven nada, mostrar SVG ilustración
   minimalista + texto "No activities match your filters" + botón "Reset filters".

7. Sortable: por default `detected_at DESC`. Click en encabezado de columna
   "Detected" toggle ASC/DESC (htmx con param `sort=detected_at:asc|desc`).

8. **NO** implementar auth real — todo público en esta fase. Fase 7 lo cubre.

TESTS OBLIGATORIOS (escribir y dejar verdes ANTES de cerrar la fase):

- `tests/routes/dashboard.test.ts`:
  1. **GET /** retorna 200 + HTML con todos los KPI tiles renderizados con números
     coherentes con el seed.
  2. **GET /activities/feed?channel=website** retorna sólo rows de canal website.
  3. **GET /activities/feed?status=useful** retorna sólo activities con
     `status='useful'`.
  4. **GET /activities/feed?range=today** retorna sólo activities detectadas hoy
     (UTC).
  5. **GET /activities/feed?competitor_id=<id>** filtra por competidor.
  6. **POST /activities/:id/status** con body `{status:'useful'}` persiste y retorna
     fragment con la pill verde.
  7. **POST /activities/:id/status** con status inválido retorna 400.
  8. **POST /activities/<inexistente>/status** retorna 404.
  9. **Cursor pagination**: dos requests consecutivos retornan rows distintos sin
     overlap; tercer request retorna `<!-- end -->` cuando no hay más.
  10. **Filter state cookie**: POST a `/` con header `Cookie:
      flowcore_filter_state={"channel":"meta_facebook"}` renderiza el feed con ese
      filter pre-aplicado.

- `tests/views/dashboard.test.ts`:
  11. **render del KPI "Failed Channels" con count=0** usa color neutro; con count>0
      usa `flowcore.danger`.
  12. **render de activity row con summary placeholder** muestra "Summary pending".
  13. **chip badge por canal**: 7 canales soportados, cada uno tiene su color en
      `chip-channel-*`.

Comando para correr la suite (siempre dentro de Docker):
  `docker compose exec app npm test`

ENTREGABLE VALIDABLE:
- Abrir `http://localhost:3000/`, ver el feed con ~80–120 rows del seed.
- Cambiar filtros (canal, fecha, competidor, status) y ver el feed actualizar sin
  full page refresh.
- Click en "Useful" en una row → pill cambia a verde sin refresh.
- Click en "Load more" trae los siguientes 25 rows.
- Cookie filter state: filtrar, recargar página, los filtros siguen aplicados.
- `docker compose exec app npm test` exit 0 con 13/13 tests pasando.

GATE DE AVANCE (BLOQUEANTE):
NO avances a la Fase 4 hasta que `docker compose exec app npm test` retorne exit 0 con
100% de los tests pasando. Si algún test falla, ARREGLA EL CÓDIGO (no debilites, no
skipees) y volvé a correr la suite hasta que toda pase. Reportá explícitamente el
output del último run antes de continuar.

NO HAGAS: pollers, llamadas a OpenRouter, detail view modal (es Fase 6), health view
(es Fase 6), cron endpoints (es Fase 6), auth (Fase 7). Solo el read path + toggle
useful/skip + filtros.
```

---

## FASE 4 — LLM Summarization + Demo Pollers (fixtures)

```
Fase 4 del FlowCore Marketing Sensor. Lee CLAUDE.md sección "Stack" (subsección AI
tiers) y "Detección de actividad — qué cuenta como evento nuevo".

OBJETIVO:
Implementar (1) el servicio de LLM via OpenRouter (SoTA para summaries + Lightweight
para clasificación de temas), y (2) los 6 pollers en modo `demo` (cargan fixtures
desde JSON y generan activities con dedupe + summary). Al final, correr el cron
manualmente debe insertar activities nuevas y poblar `summary_text` reemplazando los
placeholders del seed.

TAREAS:

1. `src/services/llm-summarizer.ts`:
   - `summarizeActivity(activity, competitor): Promise<{ summary: string,
     themes: string[] }>` — llama OpenRouter con prompt estructurado:
     ```
     System: You are a marketing intelligence analyst. Given a competitor activity
     in the home services trade (water wells / plumbing), produce:
     1. A 1-sentence "Why this matters to FlowCore" summary (<25 words, plain
        English, action-oriented).
     2. 2–4 themes as comma-separated tags (e.g., "pricing", "local-seo", "viral",
        "promo", "service-area-expansion").
     Reply as compact JSON: {"summary":"...","themes":["..."]}
     ```
   - SoTA tier para summary: modelo `anthropic/claude-sonnet-4-6`.
   - Lightweight tier para classification fallback si SoTA timeouts: modelo
     `anthropic/claude-haiku-4-5`.
   - Timeout 15s. Retry 1 vez con backoff 2s. Si ambos fallan, persistir
     `summary_text="[Summary unavailable — retry on next poll]"` y `themes=[]` SIN
     bloquear el flow.
   - Logger.info con tokens used + model + duration + cost (estimado con tarifas
     hardcoded en `config/api-costs.ts`).
   - **Persistir el cost** en `api_spend_log` (provider=`openrouter`, mes actual).

2. `src/services/dedupe.ts`:
   - `computeDedupeHash(channel, payload): string` — sha256 según reglas de CLAUDE.md
     "Detección de actividad". Una función por canal:
     * website: `sha256(competitor_id + ":" + url)` (URL canonicalizada — lowercase,
       sin trailing slash, sin query string excepto si es el path real)
     * meta: `sha256(advertiser_id + ":" + image_url + ":" + headline + ":" + cta + ":" + landing_url)`
     * google_ads: `sha256(advertiser_id + ":" + landing_page_url)`
     * tiktok: `sha256(handle + ":" + aweme_id)`
     * youtube: `sha256(channel_id + ":" + video_id)`
     * seo_ranking: `sha256(competitor_id + ":" + keyword + ":" + week_iso)` (un
       evento por keyword × semana × competidor — re-aparece próxima semana sólo si
       hubo cambio ≥3 posiciones)
     * seo_backlink: `sha256(competitor_id + ":" + referring_domain)`
   - `existsByHash(hash): Promise<boolean>` consulta la tabla.

3. `src/pollers/base.ts`: interfaz común:
   ```ts
   interface Poller {
     channel: ChannelEnum;
     poll(competitorId: string | null): Promise<{ items: PollItem[],
       cost_usd_est: number }>;
   }
   ```
   Y `runPoller(poller, competitor)` que:
   - Crea row en `poll_runs` con `started_at=now, status='ok'`
   - Llama `poller.poll(competitor_id)`
   - Para cada item: dedupe → insertar activity si nuevo → llamar
     `summarizeActivity` async (no esperar todos en paralelo, batch de 5 con
     concurrency limiter)
   - Cierra row con `finished_at, status, items_fetched, cost_usd_estimated`
   - Si `poller.poll()` lanza, marca `status='failed', error_message=err.message`
     y NO interrumpe los siguientes pollers (caller maneja el array).

4. Implementar **6 pollers en modo demo** (`src/pollers/`):
   - `website.ts`, `meta.ts`, `google-ads.ts`, `tiktok.ts`, `youtube.ts`,
     `seo-ranking.ts`, `seo-backlinks.ts`. (7 archivos = 6 canales lógicos + SEO
     dividido).
   - **En modo demo**: cada `poll()` lee de `pollers/fixtures/<channel>.json`
     (1 archivo por canal) y retorna 0–3 items random simulando que "hubo actividad
     hoy". Items semi-aleatorios pero determinísticos por seed (`PRNG(seed=
     date_iso + channel)`) para que cada día genere diferente data pero un mismo
     día sea reproducible.
   - **En modo live**: stub que lanza `throw new Error("Live mode pending in
     Fase 5")`. Esto fuerza que los tests de Fase 4 corran con `OPERATION_MODE=demo`.
   - Crear los 7 fixtures con 5–10 entries c/u, payloads realistas (revisar APIs
     reales para que el shape sea fiel — ej. Apify Meta scraper retorna `ad_id`,
     `image_url`, `headline`, `body_text`, `cta_text`, `link_url`, `first_seen_at`).

5. `src/services/polling-orchestrator.ts`:
   - `runDailyPoll()`: itera competidores activos × pollers daily (website, meta,
     google_ads, tiktok, youtube), llama `runPoller` con concurrency 3. Retorna
     resumen `{ runs: PollRun[], total_items: number, total_cost: number }`.
   - `runWeeklyPoll()`: itera competidores × pollers weekly (seo_ranking,
     seo_backlinks). Mismo shape de retorno.

6. Endpoints en `src/routes/jobs.ts` (sin auth aún, sólo cron secret):
   - `POST /jobs/poll/daily` — middleware `cronSecret` valida header
     `X-Cron-Secret == env.CRON_SECRET`. Llama `runDailyPoll()`. Retorna 200 + JSON
     con summary.
   - `POST /jobs/poll/weekly` — mismo, llama `runWeeklyPoll()`.
   - `POST /jobs/poll/:channel` — para debug manual (un canal específico).

7. Agregar al `seed.ts` la opción de generar fixtures iniciales si no existen.

TESTS OBLIGATORIOS (escribir y dejar verdes ANTES de cerrar la fase):

- `tests/services/llm-summarizer.test.ts`:
  1. **happy path**: mockear OpenRouter con response válido, `summarizeActivity`
     retorna `{summary, themes}` y persiste cost en api_spend_log.
  2. **timeout retry**: primer call timeout, segundo OK → retorna result correcto.
  3. **ambos fallan**: ambos timeout → retorna fallback `summary_text` con
     "[Summary unavailable...]" + themes vacío + NO lanza error.
  4. **JSON malformado del LLM**: mockear response sin JSON parseable → fallback
     graceful con summary_text raw del LLM (truncado a 200 chars) + themes vacío.

- `tests/services/dedupe.test.ts`:
  5. **website hash es estable**: mismo URL canonicalizada → mismo hash.
  6. **website URL con trailing slash**: trailing slash NO debe cambiar hash.
  7. **meta hash incluye landing_url**: cambiar landing_url → hash distinto.
  8. **seo_ranking hash es week-based**: mismo keyword + competidor en distintos
     días de la misma semana → mismo hash.
  9. **existsByHash**: insertar activity, luego buscar por hash → retorna true.

- `tests/pollers/website.test.ts` (y análogos para los otros 6):
  10. **website demo poll** retorna 0–3 items determinísticos por (date, channel).
  11. **website demo poll**: shape de los items matchea el `PollItem` interface.
  12. **website live poll** lanza error "Live mode pending in Fase 5" (verifica que
      el switch de modo funciona).

- `tests/services/polling-orchestrator.test.ts`:
  13. **runDailyPoll**: con seed cargado + OpenRouter mockeado, inserta activities
      nuevas y NO duplica las existentes (dedupe funciona).
  14. **runDailyPoll** registra cada poll en `poll_runs`.
  15. **un poller que falla NO bloquea otros**: forzar website.poll a throw,
      verificar que los otros 5 corren OK y total_items > 0.
  16. **summary se genera para todos los items nuevos**: post-poll, todas las
      activities recién insertadas tienen `summary_text != placeholder`.

- `tests/routes/jobs.test.ts`:
  17. **POST /jobs/poll/daily sin secret** retorna 401.
  18. **POST /jobs/poll/daily con secret válido** retorna 200 + JSON summary.
  19. **POST /jobs/poll/website con secret** corre sólo ese canal.

Comando para correr la suite (siempre dentro de Docker):
  `docker compose exec app npm test`

ENTREGABLE VALIDABLE:
- `OPENROUTER_API_KEY` configurada en `.env`.
- `curl -X POST http://localhost:3000/jobs/poll/daily -H "X-Cron-Secret: <secret>"`
  retorna 200 + JSON con `{ runs: [...], total_items: N, total_cost: $X.XX }`.
- Recargar el dashboard `/` → aparecen activities nuevas con summaries reales del
  LLM (no placeholder).
- `sqlite3 data/app.db "SELECT provider, spend_usd FROM api_spend_log"` muestra
  spend de openrouter > $0.
- Test suite pasa al 100% (~19 tests nuevos).

GATE DE AVANCE (BLOQUEANTE):
NO avances a la Fase 5 hasta que `docker compose exec app npm test` retorne exit 0 con
100% de los tests pasando. Si algún test falla, ARREGLA EL CÓDIGO (no debilites, no
skipees, no marques `xfail`) y volvé a correr la suite hasta que toda pase. Reportá
explícitamente el output del último run antes de continuar.

NO HAGAS: implementar pollers en modo `live` (es Fase 5), Activity Detail view (Fase
6), Health view (Fase 6), Budget Guard (Fase 6), auth (Fase 7). Solo demo pollers +
LLM + dedupe + orchestrator + cron endpoints con secret.
```

---

## FASE 5 — Live Pollers (6 canales reales)

```
Fase 5 del FlowCore Marketing Sensor. Lee CLAUDE.md sección "Stack" (integraciones
externas) y feasibility-report.md §1 (fragilidad de scrapes — afecta diseño).

OBJETIVO:
Implementar la versión `live` de los 6 pollers (7 archivos) contra Apify, ZenRows,
YouTube Data API v3, Serper y DataForSEO. El switch `OPERATION_MODE=live` los activa.
Modo `demo` sigue funcionando intacto.

TAREAS:

1. **Website poller live** (`src/pollers/website.ts`):
   - 3-tier detection según CLAUDE.md:
     * Tier 1: GET `https://<domain>/sitemap.xml`. Si 200, parse XML, extraer todas
       las `<loc>` URLs. Filtrar por `lastmod >= last_poll_ts` si está disponible.
     * Tier 2: GET `https://<domain>/feed`, `/rss`, `/atom.xml`. Parse RSS/Atom.
     * Tier 3: ZenRows scrape de `/blog` y `/news`. Hash del HTML body. Si hash
       distinto al último guardado en `competitors.last_index_hash` (campo nuevo,
       agregar migración), comparar URLs en `<a href>` y detectar las nuevas.
   - Para cada URL nueva: scrape la página (ZenRows con `js_render=true`,
     `premium_proxy=true` por default), extraer título y primer párrafo,
     PollItem con `activity_type='new_blog_post'` o `new_landing_page` (heurística:
     si URL contiene `/blog/` o `/news/` → blog post; else → landing_page).
   - Cliente HTTP: `undici` (Node nativo). Wrapper `fetchWithRetry(url, opts, retries=2)`.

2. **Meta ads poller live** (`src/pollers/meta.ts`):
   - Apify actor: `apify/facebook-ads-library-scraper` (verificar nombre actual al
     build time). Input: `{ urls: [`https://www.facebook.com/${handle}`],
     activeOnly: true, count: 50 }`.
   - Llamada: `POST https://api.apify.com/v2/acts/<actor_id>/run-sync-get-dataset-items?token=<token>`.
   - Parse cada item: `ad_archive_id`, `creative_image_url`, `headline`, `body_text`,
     `cta_text`, `link_url`, `first_seen_at`. PollItem con `activity_type='new_ad_creative'`.

3. **Google ads poller live** (`src/pollers/google-ads.ts`):
   - Apify actor: `apify/google-ads-transparency-center` o equivalente. Input por
     `advertiser_id` (estraído del handle config).
   - Por cada ad: foco en `landing_page_url`. Sólo emitir PollItem si
     `landing_page_url` no se vio antes (dedupe ya cubre esto).
   - PollItem con `activity_type='new_landing_page'` y `channel='google_ads'`.

4. **TikTok poller live** (`src/pollers/tiktok.ts`):
   - Apify actor: `apify/tiktok-scraper` (handles) + `apify/tiktok-search-scraper`
     (keyword searches).
   - Por cada video: `aweme_id`, `caption`, `view_count`, `like_count`,
     `comment_count`, `thumbnail_url`, `create_time`. PollItem con
     `activity_type='new_video'`.

5. **YouTube poller live** (`src/pollers/youtube.ts`):
   - YouTube Data API v3:
     * `GET /youtube/v3/channels?id=<channel_id>&part=contentDetails&key=<key>` →
       extraer `uploads_playlist_id`.
     * `GET /youtube/v3/playlistItems?playlistId=<uploads_id>&part=contentDetails&maxResults=20`
       → lista de videoIds.
     * `GET /youtube/v3/videos?id=<videoIds>&part=contentDetails,snippet,statistics`
       → para cada uno: filtrar por `duration ≤ 60s` (parse ISO 8601 PT##S) Y
       thumbnail aspect vertical (height > width).
   - PollItem con `activity_type='new_video'`, `channel='youtube'`.

6. **SEO ranking poller live** (`src/pollers/seo-ranking.ts`):
   - Cadencia weekly. Para cada (competidor × keyword activo): query Serper:
     `POST https://google.serper.dev/search` body `{ q: keyword, gl: 'us',
     hl: 'en', num: 100 }`.
   - Parse `organic` results, encontrar la posición del `competitor.domain` en los
     top 100 (null si no aparece).
   - Comparar con la última `position` registrada para ese (competitor, keyword)
     en activities pasadas. Si delta absoluto ≥3 (configurable), emitir PollItem
     `activity_type='rank_change'` con payload `{ keyword, old_position, new_position,
     delta }`.

7. **SEO backlinks poller live** (`src/pollers/seo-backlinks.ts`):
   - Cadencia weekly. DataForSEO Backlinks API:
     `POST https://api.dataforseo.com/v3/backlinks/backlinks/live` con
     `{ target: domain, mode: 'one_per_domain', limit: 100, order_by:
     ['rank,desc'], filters: [['first_seen','>',iso_last_week]] }`.
   - Para cada nuevo `referring_domain` con `domain_rating >=
     env.BACKLINK_DR_THRESHOLD`: PollItem `activity_type='new_backlink'`,
     payload `{ referring_domain, dr, anchor_text }`.

8. **Migración nueva**: agregar `competitors.last_index_hash` (text, nullable),
   `competitors.last_polled_at` (int, nullable). Generar y aplicar.

9. Cada poller live respeta `env.OPERATION_MODE`:
   ```ts
   export async function poll(competitorId: string) {
     if (env.OPERATION_MODE === 'demo') return demoPoll(competitorId);
     return livePoll(competitorId);
   }
   ```

10. Validación post-fetch: cada poller pasa la respuesta cruda por un Zod schema
    estricto antes de mapear a PollItem. Si la respuesta no parsea (Apify cambió el
    shape), throw error claro identificando el campo faltante. El orchestrator
    captura esto y registra `poll_runs.status='failed', error_message=<detalle>`.

11. Documentar en `docs/api-providers.md` (nuevo): para cada poller, el actor/endpoint
    exacto, la versión del schema esperado, y un ejemplo de payload de respuesta.
    Esto es load-bearing — cuando el scrape se rompa en producción, hay que poder
    diagnosticar rápido.

TESTS OBLIGATORIOS:

- `tests/pollers/website-live.test.ts`:
  1. **sitemap.xml exitoso** parsea y retorna URLs nuevas (mockear undici con MSW).
  2. **fallback a RSS cuando sitemap 404**: mock 404 en sitemap → fetch RSS → parse OK.
  3. **fallback a hash diff cuando sitemap+RSS fallan**.
  4. **ZenRows con js_render=true**: verifica que el header `apikey` y los params
     correctos van en la request.

- `tests/pollers/meta-live.test.ts`:
  5. **Apify call shape correcto**: header Authorization Bearer, body con `urls`,
     `activeOnly`, `count`.
  6. **Schema válido del response**: parsea fixture realista; campos faltantes →
     throws con error descriptivo.

- `tests/pollers/google-ads-live.test.ts`:
  7. mismo patrón (1–2 tests).

- `tests/pollers/tiktok-live.test.ts`:
  8. **dual actor**: handles + keyword_search → llama 2 actores distintos.

- `tests/pollers/youtube-live.test.ts`:
  9. **filtro shorts**: video con duration=120s NO se emite; con 45s + vertical SÍ;
     con 45s + landscape NO.

- `tests/pollers/seo-ranking-live.test.ts`:
  10. **delta < 3 NO emite evento**: posición pasa de 5 → 6 → no emit.
  11. **delta ≥ 3 emite rank_change** con payload correcto.

- `tests/pollers/seo-backlinks-live.test.ts`:
  12. **DR < threshold filtrado**: backlink con DR=20 con threshold=30 NO emite.

- `tests/integration/end-to-end-live.test.ts` (con MSW interceptando todo):
  13. **runDailyPoll en modo live** con todos los upstreams mockeados → genera
      activities nuevas en todos los canales sin errores.
  14. **un upstream 503 NO bloquea los demás canales**: mock Apify down → meta
      poller falla pero website + youtube pasan.

Comando para correr la suite (siempre dentro de Docker):
  `docker compose exec app npm test`

ENTREGABLE VALIDABLE:
- Setear `.env` con keys reales o mocks (modo testing usa MSW).
- Switch a `OPERATION_MODE=live`, run `curl -X POST localhost:3000/jobs/poll/website
  -H "X-Cron-Secret: <secret>"` con UN competidor real cuyo sitemap sepamos que
  funciona (ej. cualquier competitor con WordPress) → ver al menos 1 activity nueva
  insertada.
- Test suite 100% verde con todos los upstreams mockeados (no se llama a APIs reales
  en CI).

GATE DE AVANCE (BLOQUEANTE):
NO avances a la Fase 6 hasta que `docker compose exec app npm test` retorne exit 0 con
100% de los tests pasando. Si algún test falla, ARREGLA EL CÓDIGO. Reportá
explícitamente el output del último run.

NO HAGAS: BudgetGuard (es Fase 6), Activity Detail view (Fase 6), Health view (Fase 6),
auth (Fase 7), deploy a Railway (Fase 7). Solo los pollers live + tests + docs.
```

---

## FASE 6 — Activity Detail + Health View + Cron + BudgetGuard + Graceful Degradation

```
Fase 6 del FlowCore Marketing Sensor. Lee CLAUDE.md secciones "Vista 4 — Health",
"Vista 5 — Activity Detail", "Budget Guard" y "Graceful Degradation".

OBJETIVO:
Cerrar el flujo end-to-end: vista de detalle por actividad, vista de salud por canal,
configurar Railway cron real, implementar BudgetGuard middleware y graceful
degradation visible en UI.

TAREAS:

1. **Activity Detail view** (`src/routes/dashboard.ts` extendido):
   - `GET /activities/:id` → render layout con detalle completo:
     * Columna izquierda: metadata (competitor, channel, dates, dedupe_hash) +
       `raw_payload` pretty-printed con `<pre>`+ syntax highlighting básico.
     * Columna derecha: rendered preview según canal:
       - Meta/Google ad: `<img src=image_url>` + headline + cta + landing link.
       - TikTok/YouTube: `<img src=thumbnail_url>` + caption + view count + link.
       - Website blog/landing: title + first paragraph + open-link button.
       - SEO ranking: gráfico de barras simple (CSS only) old vs new position.
       - SEO backlink: referring_domain + DR + anchor_text + link.
     * "Why this matters" card destacada arriba derecha (border-left cyan, padding
       generoso): el `summary_text`.
     * Botones grandes Useful / Skip al pie.
     * Audit log: rows con `status_changed_by` + `status_changed_at`.

2. **Health view** (`src/routes/health.ts` extendido — `/health` ya existe como JSON):
   - `GET /health/channels` → grid de cards (uno por canal × competidor activo donde
     ese canal está habilitado).
   - Card layout:
     * Borde top color: verde si último poll OK <24h (30 días para weekly), ámbar
       si OK pero stale, rojo si último poll `failed`.
     * Title: `<channel_badge> <competitor_name>`
     * Body: "Last run: <relative time>", "Status: ok | failed | partial",
       "Items fetched: N", "Error: <message>" (si falló).
     * Botón "Retry now" → `POST /jobs/poll/:channel?competitor_id=:id`
       (admin-only — placeholder hasta auth Fase 7).
   - KPI tile arriba: `API spend this month: $XX.XX of $200 cap` con barra de
     progreso. Color: verde <50%, ámbar 50–80%, rojo >80%.
   - Botón "Run all daily polls now" arriba derecha (admin-only).

3. **BudgetGuard middleware** (`src/middleware/budget-guard.ts`):
   - Antes de cada poll caro (Apify, ZenRows, Serper, DataForSEO, OpenRouter):
     consulta `api_spend_log` para mes actual.
   - Si total `>= env.MONTHLY_BUDGET_USD` → bloquea, throw `BudgetExceededError`.
   - Si `>= 0.8 * MONTHLY_BUDGET_USD` → loguea warn con `pino`.
   - Cost estimado por API call con tarifas hardcoded en `config/api-costs.ts`:
     * `apify`: $0.05 por advertiser-poll (Meta), $0.03 por handle (TikTok/YouTube),
       $0.05 por advertiser (Google Ads).
     * `zenrows`: $0.001 por request (estimado conservador).
     * `serper`: $0.001 por query.
     * `dataforseo`: $0.04 por domain backlink lookup.
     * `openrouter`: calcular real por tokens (input × $X/1k + output × $Y/1k según
       modelo). Usar precios actuales de claude-sonnet-4-6 y claude-haiku-4-5.

4. **Graceful Degradation** en `src/services/polling-orchestrator.ts`:
   - Tracking: en cada `runPoller`, si `status='failed'` para (channel × competitor)
     N días seguidos (consultar `poll_runs` históricos):
     * N >= 3 → marcar canal-competidor como `degraded` (campo nuevo en
       `competitors`: `degraded_channels` JSON array).
     * N >= 7 → marcar como `broken` y emitir log ERROR.
   - El dashboard `/` lee `degraded_channels` y muestra banner ámbar arriba si
     hay canales degraded; banner rojo si broken. Click en banner → `/health/channels`.

5. **Railway cron config** (`railway.toml`):
   ```toml
   [[deploy.cron]]
   schedule = "0 6 * * *"
   command = "curl -X POST https://${RAILWAY_PUBLIC_DOMAIN}/jobs/poll/daily -H 'X-Cron-Secret: ${CRON_SECRET}'"

   [[deploy.cron]]
   schedule = "0 6 * * 0"
   command = "curl -X POST https://${RAILWAY_PUBLIC_DOMAIN}/jobs/poll/weekly -H 'X-Cron-Secret: ${CRON_SECRET}'"
   ```

6. **Migración nueva**: `competitors.degraded_channels` (text JSON, default `'[]'`),
   `competitors.last_polled_at` (ya existe de Fase 5).

7. Detail view tiene URL compartible (Robert puede mandar el link a la agencia PPC
   por Slack). No requiere auth en esta fase pero los datos sensibles (raw_payload
   con keys) NO deben aparecer — sanitizar el payload antes de renderizar.

TESTS OBLIGATORIOS:

- `tests/routes/activity-detail.test.ts`:
  1. **GET /activities/:id** retorna 200 + HTML con summary, channel, raw_payload.
  2. **GET /activities/:id con id inválido** retorna 404.
  3. **GET /activities/:id sanitiza raw_payload**: payload con key `apify_api_key`
     NO aparece en el HTML output.
  4. **POST status desde detail page** funciona y redirige back al detail.

- `tests/routes/health.test.ts`:
  5. **GET /health/channels** retorna grid con 1 card por canal × competidor
     activo.
  6. **card de canal failed >24h** muestra borde rojo + botón Retry.
  7. **KPI spend tile**: muestra el total del mes con cap.

- `tests/middleware/budget-guard.test.ts`:
  8. **spend < 80% del cap**: middleware no bloquea, no warn.
  9. **spend entre 80–100%**: warn logged, no bloquea.
  10. **spend >= 100%**: throws BudgetExceededError.
  11. **estimar cost por provider**: para cada provider, verificar que el cost
      calculado es coherente con la tarifa hardcoded.

- `tests/services/graceful-degradation.test.ts`:
  12. **3 polls fallidos seguidos** marca el canal como degraded.
  13. **7 polls fallidos seguidos** marca como broken.
  14. **1 poll OK después de 3 fallos** resetea degraded.

- `tests/integration/cron-flow.test.ts`:
  15. **POST /jobs/poll/daily con secret** corre todos los pollers y la respuesta
      incluye costs.
  16. **dashboard banner**: con un competitor con degraded_channels, GET /
      muestra banner ámbar.

Comando para correr la suite (siempre dentro de Docker):
  `docker compose exec app npm test`

ENTREGABLE VALIDABLE:
- `/activities/<id>` muestra detalle completo con preview correcto según canal.
- `/health/channels` muestra grid con todos los canales × competidores; canales
  failed visibles en rojo.
- Forzar `MONTHLY_BUDGET_USD=0.01` y correr poll → BudgetGuard aborta y se ve en logs.
- Forzar 3 fallos consecutivos en un canal (mock) → card en /health pasa a ámbar +
  banner en `/`.
- Test suite 100% verde.

GATE DE AVANCE (BLOQUEANTE):
NO avances a la Fase 7 hasta que `docker compose exec app npm test` retorne exit 0 con
100% de los tests pasando. Reportá el output del último run.

NO HAGAS: auth Argon2 (Fase 7), deploy a Railway (Fase 7), Playwright E2E (Fase 7).
Solo detail view + health view + budget guard + graceful + cron config.
```

---

## FASE 7 — Polish, Auth, Tests E2E, Deploy a Railway

```
Fase 7 (final) del FlowCore Marketing Sensor. Lee CLAUDE.md y feasibility-report.md.

OBJETIVO:
Sistema production-ready en Railway. Auth con Argon2 + sessions, polish visual,
suite E2E con Playwright, backup script, deploy verificado, documentación de
operaciones.

ANTES DE EMPEZAR — chequear con Robert (BLOQUEANTE PRE-DEPLOY):
- [ ] Lista confirmada de 22 competidores con domains + handles (feasibility §4).
- [ ] Lista confirmada de 5–50 keywords (feasibility §5).
- [ ] Lista confirmada de inspiration sources (feasibility §6).
- [ ] Cap mensual confirmado (feasibility §2 — sugerido $200/mo).
- [ ] SLA 12–36h confirmado (feasibility §3).

Si alguno de los 5 puntos NO está confirmado, AVISA al PM antes de proceder. Podés
arrancar las tareas técnicas de auth + polish + tests + deploy infra mientras se
resuelven, pero NO hacer cutover a `OPERATION_MODE=live` hasta que estén los 5.

TAREAS:

1. **AUTENTICACIÓN** (`src/routes/auth.ts` + `src/middleware/auth.ts`):
   - `GET /auth/login` → form simple (email + password)
   - `POST /auth/login` → valida con `argon2.verify`, crea cookie sesión firmada
     (`@hono/cookie` + HMAC con `SESSION_SECRET`). Cookie `httpOnly`, `secure` (en
     prod), `sameSite=lax`, expira 30 días.
   - `POST /auth/logout` → limpia cookie + redirect a login.
   - `requireAuth` middleware: lee cookie, valida HMAC, carga user; redirect a
     /auth/login si no.
   - `requireRole('admin')` para los botones "Run all polls now" y "Retry now".
   - CLI script `scripts/create-user.ts`: crea user inicial Robert (`role=admin`)
     con password hashed Argon2id (params: t=2, m=19456 KB, p=1).
   - **Aplicar `requireAuth`** a TODO excepto `/auth/login`, `/health` (JSON),
     `/jobs/*` (esos ya tienen `cronSecret`).

2. **POLISH VISUAL**:
   - Loading states: durante htmx requests, agregar spinner sutil al área de target
     (clase `.htmx-indicator` con animación CSS).
   - Empty states con SVG ilustración en cada vista (dashboard sin matches,
     settings sin items, health sin channels).
   - Mensajes de error toast: top-right corner, fade out 5s.
   - Mobile: al menos legible en 375px (Robert revisa desde el iPhone). NO
     necesita ser pixel-perfect mobile — pero el dashboard y el detail tienen que
     ser usables.
   - Favicon + título de página por route.
   - Logo SVG: usar el logo "FLOWCORE" en cyan, mismo estilo que los screenshots
     del ops console (Robert ya tiene asset; pedírselo. Si no llega, generar
     placeholder text-based con CSS).
   - Verificar contraste WCAG AA en todos los pares de color.

3. **MANEJO DE ERRORES**:
   - 404 page custom (con sidebar normal + mensaje + botón back).
   - 500 page custom (sin stack trace en prod; sí en dev).
   - Try/catch global en `src/middleware/error-handler.ts` que loguea con `pino`
     y retorna response consistente (HTML para routes browser, JSON para `/jobs/*`).

4. **TESTING COMPLETO**:
   - **Coverage targets**: `pollers/`, `services/`, `middleware/` ≥ 80%; global ≥
     65%. Script `npm run test:coverage`.
   - **Suite E2E con Playwright** (`tests/e2e/`):
     a. `auth.spec.ts`: login con creds correctas → dashboard; con creds incorrectas
        → mensaje de error.
     b. `dashboard-flow.spec.ts`: login → ver feed → click filter Meta → feed
        actualiza → click "Useful" en una row → pill cambia.
     c. `settings-flow.spec.ts`: login → /settings/competitors → agregar competitor
        nuevo → aparece en la tabla → editarlo → borrarlo (soft).
     d. `detail-and-health.spec.ts`: click en un detail link → vista de detalle
        carga → status toggle desde detail funciona; ir a /health/channels → ver
        grid.
   - Playwright corre dentro de Docker (`docker compose -f docker-compose.yml -f
     docker-compose.test.yml run e2e`).

5. **DOCKER PRODUCTION-READY**:
   - Revisar `Dockerfile`: ya tiene multi-stage de Fase 0. Verificar:
     * Imagen final < 200 MB (`docker images | grep flowcore-sensor`).
     * No copia tests, docs, .git.
     * User no-root.
     * `tini` como PID 1.
   - Crear `docker-compose.prod.yml`:
     ```yaml
     services:
       app:
         build:
           context: .
           target: runner
         volumes:
           - db-data:/data       # Solo data, NO source code
         env_file:
           - .env.production
         restart: unless-stopped
         logging:
           driver: json-file
           options:
             max-size: "10m"
             max-file: "3"
     volumes:
       db-data:
     ```
   - `scripts/backup.sh`:
     ```bash
     #!/bin/sh
     TS=$(date -u +%Y%m%dT%H%M%SZ)
     docker compose exec -T app sqlite3 /data/app.db ".backup /data/backup-$TS.db"
     # Subir a Railway volume snapshot o S3 si está configurado
     # Retención 30 días
     find /backups -name "backup-*.db" -mtime +30 -delete
     ```
   - Test: `docker build .` completa sin warnings; `docker compose down && docker
     compose up` → data persiste.

6. **DEPLOY A RAILWAY**:
   - Verificar `railway.toml` apunta a Dockerfile (no Nixpacks).
   - Configurar volume persistente en Railway dashboard (`/data`).
   - Setear env vars en Railway (TODAS las requeridas + las opcionales que aplican
     en live mode):
     `OPERATION_MODE=live`, `CRON_SECRET`, `SESSION_SECRET`, `OPENROUTER_API_KEY`,
     `APIFY_API_TOKEN`, `ZENROWS_API_KEY`, `YOUTUBE_API_KEY`, `SERPER_API_KEY`,
     `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD`, `MONTHLY_BUDGET_USD=200`,
     `BACKLINK_DR_THRESHOLD=30`.
   - `git push railway main` (o conectar GitHub en Railway).
   - Smoke test post-deploy:
     * `curl https://<app>.railway.app/health` → 200 OK.
     * Login con creds de Robert.
     * `curl -X POST https://<app>/jobs/poll/website?competitor_id=<one_real>
       -H "X-Cron-Secret: <secret>"` → ver activity nueva.
   - Verificar que los 2 cron jobs están registrados en Railway dashboard.

7. **BACKUP**:
   - Script corre 1× por día via Railway cron (3am UTC) además del polling.
   - Backups van a volumen `/backups` (segundo volume Railway), retención 30 días.
   - Documentar restore: `docker compose exec app sqlite3 /data/app.db ".restore
     /backups/backup-XXX.db"`.

8. **DOCUMENTACIÓN** (`docs/operations.md` nuevo):
   - "Cómo actualizar la app": `git push railway main` → auto-deploy. Verificar
     en logs.
   - "Cómo agregar competidores nuevos": vía UI `/settings/competitors`.
   - "Cómo ajustar el budget cap": cambiar env `MONTHLY_BUDGET_USD` en Railway +
     restart service.
   - "Cómo hacer backup manual": comando `scripts/backup.sh`.
   - "Cómo reiniciar si algo falla": Railway dashboard → Restart, o via CLI.
   - "Cómo diagnosticar un canal roto": `/health/channels` → ver error_message →
     consultar `docs/api-providers.md` por shape esperado.
   - "Onboarding de un nuevo agency user": `scripts/create-user.ts --email=<>
     --role=agency`.

9. **MONITOREO**:
   - Railway built-in metrics (CPU, RAM, requests).
   - `pino` logs JSON estructurados → Railway captura → ver con `railway logs`.
   - Healthcheck Railway configurado (`/health`).
   - Alertar (email a PM Sagan) si healthcheck falla N veces seguidas — Railway
     soporta esto en dashboard.

10. **CHECKLIST FINAL** (verificar antes de entregar):
    - [ ] `docker compose up --build` desde máquina limpia funciona.
    - [ ] `docker compose exec app npm test` 100% verde (suite completa).
    - [ ] `docker compose exec app npm run test:coverage` cumple targets.
    - [ ] Playwright E2E suite 100% verde.
    - [ ] Deploy a Railway live.
    - [ ] Robert puede loguearse en producción con sus creds.
    - [ ] 2 cron jobs registrados y disparando.
    - [ ] Backup corrió al menos 1 vez exitosamente.
    - [ ] `OPERATION_MODE=live` y al menos 1 poll real generó actividad nueva.
    - [ ] BudgetGuard probado en prod (forzar threshold bajo y verificar bloqueo).
    - [ ] `/health/channels` muestra todos verdes después del primer poll OK.
    - [ ] Robert + 1 agency user accedieron y operaron end-to-end.
    - [ ] `docs/operations.md` entregado al PM Sagan.

TESTS OBLIGATORIOS (además de mantener verde toda la suite previa):

- `tests/routes/auth.test.ts`:
  1. **POST /auth/login con creds correctas** retorna 302 + set-cookie.
  2. **POST /auth/login con creds incorrectas** retorna 401 + form con error.
  3. **GET / sin cookie** redirect a /auth/login.
  4. **GET / con cookie inválida (HMAC tampered)** redirect a /auth/login.
  5. **POST /auth/logout** limpia cookie.
  6. **requireRole('admin') con user=agency** retorna 403.

- `tests/middleware/error-handler.test.ts`:
  7. **route que throws en prod** retorna 500 HTML sin stack.
  8. **mismo en dev** incluye stack trace.

- `tests/e2e/*.spec.ts` — 4 specs listados en task 4. Total ~12 acciones
  cubiertas.

Comando para correr la suite (siempre dentro de Docker):
  `docker compose exec app npm test && docker compose -f docker-compose.yml -f
  docker-compose.test.yml run --rm e2e`

ENTREGABLE VALIDABLE:
- App live en `https://<railway>.railway.app`.
- Robert se loguea, ve el feed con data real (post primer poll), filtra,
  marca useful/skip.
- Cron diario y semanal disparan y registran en logs.
- Backup runeó al menos 1 vez.
- Documentación handoff entregada.
- Test suite 100% verde + Playwright 100% verde.

GATE DE AVANCE (FINAL — antes de entregar):
NO declares la fase completa hasta que:
1. `docker compose exec app npm test` exit 0 con 100% pasando.
2. Playwright E2E suite exit 0 con 100% pasando.
3. Coverage cumple targets (`pollers/`, `services/`, `middleware/` ≥80%; global ≥65%).
4. Smoke test en producción pasa (login + 1 poll real).
5. Checklist final task 10 todos los ítems marcados.
Reportá el output de los 3 comandos de tests + URL de producción + screenshot del
dashboard con data real al PM Sagan.

NO HAGAS: nuevas features fuera de PRD, refactor del schema, cambiar el stack,
agregar dependencies "nice to have". Solo lo listado arriba.
```

---

## Tips para trabajar con Claude Code en este proyecto

1. **Pegá UN prompt por sesión**. No mezcles fases en la misma conversación de
   Claude Code. Cada fase está diseñada para fit en una sola sesión sin overflow
   de contexto.

2. **Empezá CADA prompt con: "Lee CLAUDE.md primero"**. Está literalmente en el
   prompt template, pero verificá que Claude Code haya leído el archivo antes de
   tipear código (debería usar la tool `Read` apenas arrancar).

3. **Cuando un test falle**, NO le dejes a Claude Code "skipearlo para avanzar". El
   GATE es bloqueante. Si hay un test mal escrito (no mal código), pedirle
   explícitamente: "Verificá que el test refleja lo que dice el PRD/CLAUDE.md;
   si está mal, corregilo. Si está bien, arreglá el código."

4. **Para Fase 5 (live pollers)**: Apify y los demás providers cambian su shape
   sin avisar. Si un poller que andaba se rompe, primero revisá `docs/api-providers.md`
   contra el shape actual (un curl manual y comparar). Probable causa #1: el actor
   de Apify cambió de versión.

5. **El BudgetGuard de Fase 6 es load-bearing**. Robert es CEO de un negocio
   chico — un invoice de $400 inesperado va a doler. Antes del cutover a live
   en Fase 7, **forzá un test manual** poniendo `MONTHLY_BUDGET_USD=0.01` y
   verificá que los pollers abortan.

6. **Demo mode tiene que seguir funcionando POST-Fase 5**. Si un dev levanta el
   proyecto en su máquina sin keys, debe poder ver el dashboard funcional sin
   crashes. Este invariante está testeado pero verificalo manualmente cada tanto.

7. **Phase 2 (content gen agent) está OUT OF SCOPE V1**. El esquema lo soporta
   (`status='useful'`), pero NO implementes el generator en este credit. Es otro
   credit Sagan separado.

8. **Si Robert pide algo nuevo durante el build** (ej. "podemos agregar Reddit?"),
   redirigilo al PM Sagan: es un cambio de scope que requiere una conversación
   sobre credit / costo. El sensor de V1 son los 6 canales del PRD, no más.

9. **Logs en producción**: `pino` JSON estructurado. Para grep manual, usar
   `railway logs --filter "level=ERROR"` o equivalente. No agregues `console.log`
   sueltos.

10. **El handoff a Phase 2 (content gen agent) usa la tabla `activities` con
    `status='useful'`**. NO renombres esa columna ni cambies el enum. Eso es
    contrato con el siguiente credit.
