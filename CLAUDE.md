# FlowCore Marketing Sensor — Guía de Contexto

## Propósito

Sistema de inteligencia competitiva diaria para FlowCore Water (Saginaw, TX — water well +
plumbing services, ~22 años en el mercado, parte de Canvas Outdoors desde abril 2024).
Convierte los movimientos públicos de marketing de ~22 competidores (websites, Meta ads,
Google ads, TikTok, YouTube Shorts, SEO) en un único feed accionable para Robert Reagan
(CEO) y sus agencias de PPC/SEO. Equipo chico (Robert + Janna + Nashu + Ryan + field
techs); el sistema NO es para uso de field techs — es para Robert y dos agencias externas.

**Frase clave de Robert** [42:30 transcripción]: *"Marketing, particularly digital
marketing — everybody has to expose their strategy online. It's infinitely copyable."*

Este es el **Sensor** (Phase 1). El **Generador de contenido** (Phase 2 deferida) leerá
los items marcados `useful` para producir borradores de blog/ads. La columna `status` del
modelo `Activity` es el contrato de handoff hacia Phase 2 — NO romperla.

---

## Stack FIJO (del PRD, NO modificar)

- **Hosting**: Railway (web + cron en un servicio)
- **Frontend**: HTML server-rendered + Tailwind CSS + htmx (NO React, NO Vue, NO SPA)
- **Backend**: Hono (Node.js + TypeScript)
- **Database**: SQLite en Railway volume (NO Postgres, NO MySQL)
- **Scheduling**: Railway cron (NO n8n, NO node-cron en proceso)
- **Integraciones externas (live mode)**:
  - ZenRows → scrape de websites de competidores (3-tier: sitemap → RSS → hash diff)
  - Apify → Meta Ads Library, TikTok, Google Ads Transparency Center
  - YouTube Data API v3 → Shorts (filtro por duración ≤60s + aspect vertical)
  - Serper → SERP / keyword rankings
  - DataForSEO Backlinks API → backlinks
  - OpenRouter → SoTA tier para "why this matters" summaries; Lightweight tier para
    classification + keyword extraction
- **AI tiers (vía OpenRouter)**:
  - SoTA: summaries y "why this matters" (modelo: claude-sonnet-4-6 o equivalente)
  - Lightweight: clasificación y extracción de temas (modelo: claude-haiku-4-5 o gpt-4.1-mini)
- **Containerización: Docker + Docker Compose** (obligatorio, independiente del PRD)

**Lo que NO está permitido**: cambiar el stack. No proponer Next.js, React, Postgres,
Redis, Celery, BullMQ, n8n, ni ninguna alternativa "porque es mejor". Si una limitación
del stack obliga a un workaround, dejarlo escrito en este archivo y seguir.

---

## Docker Setup

El proyecto corre 100% en Docker. Nunca asumir que las dependencias están instaladas en
el host.

- **Desarrollo**: `docker compose up --build` (monta `./src:/app/src` para hot-reload)
- **Tests**: `docker compose exec app npm test`
- **Producción**: `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d`
- **DB vive en volumen Docker** (`db-data:/data/app.db`), NO dentro del container
- **Cron jobs corren con Railway cron** apuntando a endpoints HTTP (`POST /jobs/poll/:channel`)
  protegidos con `X-Cron-Secret` header
- **Dependencias de sistema**: `curl` (healthcheck), `tini` (PID 1 correcto en Node)
- Al agregar deps Node nuevas, agregarlas a `package.json` Y rebuild la imagen

---

## Reglas de Negocio Críticas (NO NEGOCIABLES)

### Detección de actividad — qué cuenta como "evento nuevo"

- **Website**: Una URL nueva en el sitemap/RSS/hash-of-index que no existía en el último
  poll. NO contar cambios menores en páginas existentes (footer dates, etc.).
- **Meta ad**: Una creative_hash nueva por advertiser, donde `creative_hash =
  sha256(image_url + headline + cta + landing_url)`. Dedupe por hash — el mismo ad
  reaparecido NO genera evento nuevo.
- **Google ad**: Una landing_page_url nueva por advertiser. Robert dijo [34:57] *"not
  worthwhile tracking Google Ads as much because it's the same ad, and you're just
  bidding more"* — por eso este canal trackea landing pages, NO creative variations.
- **TikTok**: Un video_id nuevo (de `aweme_id` que retorna Apify) por handle. Para
  keyword-searches, dedupe por video_id global.
- **YouTube Shorts**: Un video_id nuevo por canal donde `duration ≤ 60s` Y aspect
  ratio vertical (`height > width` en thumbnail). El segundo filtro es crítico — sin él
  metés videos largos también.
- **SEO keyword ranking**: Un cambio de posición ≥3 posiciones (subió o bajó) por
  competidor × keyword. Cambios de ±1 o ±2 son ruido.
- **SEO backlink**: Un nuevo dominio referente con `Domain Rating ≥ 30` (umbral
  configurable en `.env` como `BACKLINK_DR_THRESHOLD`). Dominios de baja autoridad
  generan ruido.

### Cadencia de polls

- **Daily** (cron 06:00 UTC): website, Meta ads, Google ads, TikTok, YouTube Shorts
- **Weekly** (cron domingo 06:00 UTC): SEO keyword rankings, backlinks
- Robert: *"detected within 24h"* — por la combinación cron + lag upstream, el SLA real
  documentado es **12–36h**. Mostrar `detected_at` en cada activity row.

### Modos de operación

El sistema tiene DOS modos, controlados por env `OPERATION_MODE`:
- `demo` (default en dev y para el prototipo): todos los pollers retornan data desde
  fixtures pre-cargados. NO se llama a Apify/ZenRows/etc.
- `live`: se llama a las APIs reales. OpenRouter SÍ se llama en ambos modos (Robert
  tiene que ver summaries reales sobre data sintética en demo).

### Useful/Skip — el contrato hacia Phase 2

- Todo `Activity` se persiste con `status = 'new'` por default.
- Robert (o agency) toggle `status` a `'useful'` o `'skip'` desde la UI.
- Phase 2 (content gen agent, no en V1) consultará `WHERE status = 'useful'` como
  corpus. **NO renombrar la columna ni cambiar enum**.

### Budget Guard (load-bearing)

- Antes de cada poll caro (Apify, DataForSEO, Serper), un middleware lee el spend
  acumulado del mes actual desde `api_spend_log` y aborta si supera `MONTHLY_BUDGET_USD`
  (default $200, configurable). Loggear con nivel `WARN` cuando 80% alcanzado;
  `ERROR` + abort cuando 100%.
- El spend se estima por API call con tarifas hardcoded (`config/api_costs.ts`) — NO se
  consulta el invoice real en tiempo real (lento + caro).

### Graceful Degradation

- Un poll que falla (timeout, 4xx, 5xx, scrape rota) NO bloquea otros pollers.
- Cada poll registra resultado en `poll_runs` con `status: 'ok' | 'failed' | 'partial'`,
  `error_message`, `items_fetched`, `duration_ms`.
- En el dashboard, un canal que falló N días seguidos (default 3) muestra badge ámbar
  "Datos no disponibles — último intento Xh ago".
- N≥7 días → badge rojo "Canal roto, requiere atención del dev".

---

## Modelo de Datos (schema lógico)

Tablas SQLite (snake_case en SQL, camelCase en TypeScript via Drizzle ORM):

- **competitors**: `id` (uuid), `name` (text), `domain` (text unique), `category`
  (enum: `well` | `plumbing` | `both`), `tier` (enum: `local_same_size` | `mondo_100m`
  | `national` | `inspiration`), `logo_url` (text, nullable), `created_at`, `updated_at`,
  `is_active` (bool, default true)
- **competitor_handles**: `id`, `competitor_id` (FK), `channel` (enum: `meta_facebook` |
  `meta_instagram` | `tiktok` | `youtube` | `google_ads`), `handle` (text — page slug,
  username, channel_id), `is_active` (bool)
- **target_keywords**: `id`, `keyword` (text), `category` (enum: `well` | `plumbing` |
  `both`), `is_active` (bool), `created_at`
- **inspiration_sources**: `id`, `kind` (enum: `account` | `keyword_search`), `value`
  (text), `channel` (enum: `tiktok` | `youtube`), `is_active` (bool)
- **activities**: `id` (uuid), `competitor_id` (FK, nullable — null para inspiration y
  keyword searches), `inspiration_source_id` (FK, nullable), `channel` (enum, mismo set
  que `competitor_handles.channel` + `website` + `seo_ranking` + `seo_backlink`),
  `activity_type` (enum: `new_blog_post` | `new_landing_page` | `new_ad_creative` |
  `new_video` | `rank_change` | `new_backlink`), `detected_at` (timestamp), `published_at`
  (timestamp, nullable), `source_url` (text), `dedupe_hash` (text, indexed),
  `raw_payload` (json), `summary_text` (text, nullable — viene del SoTA LLM),
  `themes_extracted` (json array de strings — del Lightweight LLM), `status` (enum:
  `new` | `useful` | `skip`, default `new`), `status_changed_by` (text, nullable),
  `status_changed_at` (timestamp, nullable)
- **poll_runs**: `id`, `channel` (text), `competitor_id` (nullable), `started_at`,
  `finished_at`, `status` (enum: `ok` | `failed` | `partial`), `error_message`
  (text, nullable), `items_fetched` (int), `cost_usd_estimated` (decimal)
- **api_spend_log**: `id`, `provider` (enum: `apify` | `zenrows` | `serper` |
  `dataforseo` | `youtube` | `openrouter`), `month` (text, format `YYYY-MM`),
  `spend_usd` (decimal, default 0), `last_updated`
- **users**: `id`, `email` (text unique), `password_hash` (text), `role` (enum:
  `admin` | `agency`), `created_at`, `last_login_at` (nullable). Solo Robert + 1–2
  agency users — auth simple Argon2 + cookie session.
- **session_state** (KV simple): `user_id` (FK), `key` (text), `value` (json) — para
  guardar último filter state del dashboard.

**Índices críticos**:
- `activities(detected_at DESC)` — query principal del feed
- `activities(competitor_id, channel, status)` — filtros del feed
- `activities(dedupe_hash)` UNIQUE — prevenir duplicados
- `poll_runs(channel, started_at DESC)` — health view

---

## Especificaciones Visuales

### Estilo visual base — del existing tooling de Robert (screenshots 9–25)

Robert ya construyó FlowCore Ops Console (su Slack restock UI, fleet allocation, marketing
spend dashboard). El sensor debe **seguir el mismo lenguaje visual** — Robert ya está
acostumbrado y va a saltar de una app a la otra sin fricción.

- **Tema**: dark mode primario, fondo `#0F1419` (casi-negro azulado), surfaces `#1A2332`
- **Sidebar**: ancho ~220px, fondo `#0F1419`, fuente blanca, item activo con accent
  cyan/teal `#06B6D4` (background sutil + texto cyan)
- **Brand mark**: "FLOWCORE" en cyan top-left del sidebar (font-weight bold, tracking
  amplio). Sub-label "OPS CONSOLE" / acá será "MARKETING SENSOR" en gris claro.
- **KPI tiles** (top de cada vista): row de 4–7 tiles con número grande cyan y label en
  caps gris. Misma altura, mismo padding (~24px). Ver screenshot 14 (`Restock Requests`
  → `Total Requests 228 | Historical Imports 228 | Transfer Requested 228 | Drafted 0
  | Pending 0 | Picked 0 | Awaiting Review 228`).
- **Chips de filtro** (debajo de KPIs): chips azul oscuro con texto blanco — `Open Only
  (228) | All Statuses (228) | Transfer Requested (228) | ...`. Adaptamos: `Today | Last
  7 Days | Last 30 Days | All` + `All Channels | Website | Meta | Google | TikTok |
  YouTube | SEO`.
- **Tabla principal**: rows con padding generoso (~16px vertical), border bottom sutil
  `#1F2937`, hover `#1A2332`. Columnas con dropdown filter icons (ícono embudo). Robert
  espera poder filtrar por columna en hover.
- **Acciones inline**: botones pill amarillo-amber `#F59E0B` para "Need Review", verde
  `#10B981` para "Useful", gris `#6B7280` para "Skip".
- **Typography**: font-family system stack (`-apple-system, BlinkMacSystemFont, sans-serif`).
  Headings en peso semibold, body regular. Tamaño base 14px (denso, profesional —
  Robert prefiere densidad sobre breathing room, según se ve en los screenshots).

### Vista 1 — Dashboard / Intelligence Board (`/`)

- Header con título "Intelligence Board" + sub-label "Last updated: <timestamp>"
- Row de 6 KPI tiles: `New Today` | `New This Week` | `Marked Useful` | `Pending Review`
  | `Active Channels` | `Failed Channels` (este último en rojo si > 0)
- Row de chip filters (descrita arriba)
- Activity table con columnas:
  - Avatar/logo (32×32 rounded) + Competitor name (con tier badge `LOCAL` | `MONDO` |
    `NATIONAL` | `INSPIRATION` en gris)
  - Channel badge (color-coded: website=blue, meta=violet, google=red, tiktok=pink,
    youtube=red-orange, seo=green)
  - Activity type + summary text (2 líneas, ellipsis al cortar)
  - Detected at (relative: "3h ago", absolute on hover)
  - Source link icon (external link)
  - Status pill (`NEW` ámbar / `USEFUL` verde / `SKIP` gris)
  - Action buttons: ✓ Useful / ✕ Skip / 👁 Detail
- Click en row abre modal/drawer con detalle (raw payload + LLM summary completo)
- Empty state: ilustración minimalista + texto "No new activity yet — your sensor wakes
  up at 06:00 UTC"

### Vista 2 — Settings: Competitors (`/settings/competitors`)

- Tabla de 22 competidores con: name, domain, category, tier, channels-enabled (chips),
  is_active toggle, edit/delete actions
- Botón "+ Add Competitor" arriba a la derecha → modal con form (name, domain,
  category, tier + handles para cada canal)
- Inline editing de handles (click en el chip `meta:flowcorewater_official` → input)

### Vista 3 — Settings: Keywords + Inspiration (`/settings/keywords`)

- Dos secciones lado a lado: `Target Keywords` (5–50 items) y `Inspiration Sources`
  (accounts + keyword searches)
- Add/remove inline (htmx fragment swap)
- Toggle `is_active` por item

### Vista 4 — Health (`/health/channels`)

- Grid de cards, una por canal × competidor
- Color de borde: verde si último poll OK <24h, ámbar si OK pero >24h, rojo si failed
- Card muestra: canal+competitor, last_run timestamp, status, items_fetched, error_message
  (si aplica), botón "Retry now" (admin-only)
- KPI tile arriba: "API spend this month: $XX.XX of $200 cap"

### Vista 5 — Activity Detail (modal o `/activities/:id`)

- Layout 2 columnas: izquierda = metadata + raw payload pretty-printed; derecha =
  rendered preview (image preview para ads, embed para videos, link preview para blog
  posts)
- Sección "Why this matters" arriba a la derecha — output del SoTA LLM en card destacada
- Botones grandes Useful / Skip al fondo
- Audit log: quién marcó qué status y cuándo

---

## Convenciones de Código

- **Estructura de carpetas**:
  ```
  /src
    /routes/         → cada dominio en su archivo: dashboard.ts, settings.ts, jobs.ts, auth.ts
    /views/          → JSX-via-Hono o templates HTML; partials para htmx fragments en /views/partials
    /db/             → schema.ts (Drizzle), client.ts, migrations/
    /services/       → polling-orchestrator.ts, llm-summarizer.ts, dedupe.ts, budget-guard.ts
    /pollers/        → uno por canal: website.ts, meta.ts, google-ads.ts, tiktok.ts, youtube.ts, seo-ranking.ts, seo-backlinks.ts
    /pollers/fixtures/ → JSON de seed para demo mode (uno por canal)
    /lib/            → utils, formatters, env loader
    /middleware/     → auth.ts, cron-secret.ts, error-handler.ts
    /tests/          → mirror de la estructura: tests/services/, tests/pollers/, tests/routes/
  /public/           → CSS compilado, JS sueltos, fonts, logos
  /docs/             → development-phases.md, feasibility-report.md, this CLAUDE.md vive en root
  /scripts/          → seed.ts, backup.sh, reset-db.sh
  Dockerfile, docker-compose.yml, docker-compose.prod.yml, .dockerignore
  package.json, tsconfig.json, drizzle.config.ts, tailwind.config.ts
  ```
- **Naming**: archivos `kebab-case.ts`, exports `camelCase` para funciones, `PascalCase`
  para tipos/clases. Routes exportan `app: Hono` y se montan en `/src/index.ts`.
- **TypeScript**: strict mode ON. Sin `any` salvo en `raw_payload` (justified).
- **Validación**: zod en boundaries (request body, env, payloads de pollers antes de
  persistir).
- **Tests**: vitest + @testing-library para fragments. Cobertura mínima 80% en
  `services/` y `pollers/` (lógica de negocio); 60% global aceptable.
- **htmx idiomas**: usar `hx-get`/`hx-post` para fragmentos parciales que retornan HTML,
  `hx-target` y `hx-swap="innerHTML"` o `outerHTML` según corresponda. NO usar JSON
  endpoints excepto para `POST /activities/:id/status` que retorna fragmento de la pill
  actualizada.
- **Commits**: convenciones Conventional Commits (`feat:`, `fix:`, `chore:`, `test:`).
- **Currency / numbers**: spend mostrado con `Intl.NumberFormat('en-US', { style: 'currency',
  currency: 'USD' })`. Fechas relativas con `Intl.RelativeTimeFormat`.

---

## Fuera de Scope V1 (NO implementar)

- **Phase 2 — Content Generation Agent**: blog drafts + ad copy + auto-publish desde
  items `useful`. El sensor SOLO detecta y tagea. No se generan posts.
- **OTT / Connected TV ad monitoring**: declinado en discovery [32:10] — enterprise tier
  Nielsen-only, demasiado caro para 1 prospect.
- **Daily/weekly digest email a Robert**: leave out de V1; agregar si Robert lo pide
  explícitamente post-prototype.
- **Self-tracking de FlowCore como competidor**: no incluido por default; ver
  feasibility-report §7.
- **Google Ads bid-level tracking** (SpyFu/SEMrush): default NO; Robert dijo Google ads
  son menos copyable.
- **Slack → ServiceTitan parts restock bot**: side project de Robert, lo está haciendo
  él mismo.
- **FleetPro ↔ ServiceTitan reconciler**: side project de Robert.
- **Marketing spend dashboard con burn-up**: side project de Robert.
- **Texas water-well records + property-ownership change detection**: side project de Robert.
- **Plumbing permit monitoring**: deferred ("sustaining gravy" futuro).
- **Well-pitch builder PDF (3-page)**: discutido pero out of scope; podría ser otro
  credit Sagan en el futuro.
- **M3U TV feed para shop floor**: morale only, deferred.
- **Estimate follow-up bot**: discutido pero el sensor ganó el slot V1.
- **Remarketing/renewal agent contra ServiceTitan**: ejemplo que Ed mostró, no committed.
- **Case studies auto-generadas desde fotos de techs**: sugerido por Sagan, no confirmado.
- **Auto-posting a redes sociales**: el sensor MONITOREA, no postea. Robert dijo
  necesita mejorar en TikTok pero no committed a auto-posting.
