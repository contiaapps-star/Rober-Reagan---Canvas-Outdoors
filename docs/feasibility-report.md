# FlowCore Marketing Sensor — Reporte de Viabilidad

**Fecha**: 2026-04-25
**Revisión sobre**: PRD-flowcore-water.md v1.0 + transcripción de discovery (2026-04-16)
**Estado del proyecto**: pre-construcción (antes de generar fases)

---

## Resumen Ejecutivo

| Severidad | Cantidad | ¿Bloquea inicio del proyecto? |
|-----------|----------|-------------------------------|
| 🔴 BLOQUEANTE                  | **0** | No |
| 🟡 ALTO RIESGO / COMPLEJIDAD   | **3** | No, pero hay que mitigar |
| 🟢 NECESITA DECISIÓN DEL CLIENTE | **6** | No para Fase 0–3, sí para Fase 4+ |

**Veredicto**: El proyecto es **construible end-to-end** con el stack y los proveedores
definidos en el PRD. No hay bloqueantes técnicos absolutos. El prototipo se puede construir
100% con datos sintéticos sin ninguna credencial externa, así que la Fase 0–6 puede
arrancar sin esperar decisiones del cliente. Las decisiones pendientes se vuelven
load-bearing recién al cambiar de "demo mode" a "live mode" en Fase 7 (cutover a producción).

Las tres áreas de alto riesgo — fragilidad de scrapes de TikTok/Meta, costo variable de
Apify, y la latencia "diaria" pedida por Robert — son manejables con degradación elegante
y caching, pero hay que dejarlo explícito en el código y en las expectativas del cliente.

---

## Hallazgos Detallados

### 🟡 1. Fragilidad estructural de los scrapes de TikTok / Meta / Google Ads Transparency

- **Requerimiento**: US2 + US3 — detección diaria de nuevos ads de Meta y nuevos videos
  de TikTok/Shorts vía Apify.
- **Issue**: TikTok rota anti-bot agresivamente; Meta Ad Library cambia su DOM cada pocas
  semanas; Google Ads Transparency Center no tiene API y el render de SerpApi/Apify
  depende del HTML actual. En cualquier semana puede romperse uno (o varios) actores de
  Apify y dejar la columna en blanco para Robert.
- **Por qué**: Son scrapes contra plataformas adversarias que activamente bloquean
  scrapers. La Meta Ad Library API oficial está bloqueada para ads comerciales en US
  (sólo retorna ads políticos / EU) — no hay alternativa "limpia".
- **Severidad**: 🟡 ALTO RIESGO
- **Alternativas propuestas**:
  1. **Aceptar y degradar** — diseñar el sistema para tolerar columnas vacías sin
     romper el dashboard, mostrar un badge "datos no disponibles, último intento N
     horas atrás" por canal/competidor, y alertar en logs (no a Robert) cuando un
     actor falla 3+ días seguidos. *(Recomendado — alineado con el PRD)*
  2. Usar dos actores de Apify por canal en cascada (primario + fallback), incrementa
     ~30% el costo pero reduce gaps.
  3. Para Meta específicamente: explorar si la cuenta de Robert puede pagar Meta Ad
     Manager Pro para acceso semi-oficial. Improbable que valga la pena para 22
     competidores.
- **Decisión requerida del cliente**: Aceptar que algunos días no llegará data en
  algunos canales (modelo "best-effort") vs. presupuesto extra para fallbacks.
- **Impacto en fases**: Afecta Fases 4–6 (live data ingestion). Fase 0–3 no se ven
  afectadas porque trabajamos con seed sintético.

---

### 🟡 2. Costo variable de Apify a escala real

- **Requerimiento**: PRD estima $30–80/mo para Apify, asumiendo 22 competidores × 6
  canales × frecuencia diaria.
- **Issue**: Apify cobra por compute units, no por advertiser-poll. Con 22 advertisers
  en Meta polleados diariamente + 22 cuentas TikTok + búsquedas por keyword + Google
  Ads Transparency, la cuenta puede superar $150–250/mo si no se controla. Robert es
  CEO de un negocio chico — vale la pena evitar sustos en el invoice.
- **Por qué**: La estimación del PRD asumió volúmenes conservadores; el comportamiento
  real depende de cuántos ads/videos retorne cada actor por poll.
- **Severidad**: 🟡 ALTO RIESGO
- **Alternativas propuestas**:
  1. **Implementar cap mensual + budget guard en código** (Recomendado): un job al
     iniciar cada cron lee el spend acumulado vía Apify API y aborta el poll si supera
     el cap configurable en `.env`. Loggear y alertar cuando se alcance 80% del cap.
  2. Pollear cada 2 días en vez de diario para canales caros (Meta + TikTok) — Robert
     dijo "dentro de 24h" pero no exigió "exactamente 24h".
  3. Cachear creativos por hash y evitar re-ingestar si no cambió.
- **Decisión requerida del cliente**: Cap mensual aceptable (sugerido $200/mo combinado
  Apify + DataForSEO + Serper).
- **Impacto en fases**: Afecta Fase 6 (cron real) y Fase 7 (deploy a prod).

---

### 🟡 3. "Detección dentro de 24h" puede no cumplirse para todos los canales

- **Requerimiento**: PRD: "Robert needs to know within 24h when a competitor publishes,
  not weeks later."
- **Issue**: Para websites con sitemap.xml/RSS, 24h es realista. Para sites sin sitemap
  que requieren scraping con hash diff de la página index, el "nuevo post" se detecta
  pero el lag entre publicación → próximo cron puede ser hasta 23h. Para Meta/TikTok,
  Apify a veces tarda 6–24h en devolver ads recién lanzados (lo que la plataforma
  expone). Sumando lag de cron + lag de plataforma, "24h" no es estricto, es ~24–36h
  promedio.
- **Por qué**: Combinación de cron diario + lag de upstream.
- **Severidad**: 🟡 ALTO RIESGO (por expectation management, no técnico)
- **Alternativas propuestas**:
  1. **Documentar SLA realista** en el dashboard ("detección típica 12–36h post-publish")
     y mostrar timestamp `detected_at` vs. `published_at` cuando esté disponible.
     *(Recomendado)*
  2. Subir cadencia de website monitoring a 2× por día (cuesta poco más en ZenRows).
  3. Implementar webhooks RSS para sites que los soporten (pocos competidores los van
     a tener, pero los que sí, dan latencia near-real-time).
- **Decisión requerida del cliente**: Confirmar que "near-daily" (12–36h) es
  aceptable, o pedir cadencia más agresiva en canales específicos.
- **Impacto en fases**: Documentar en Fase 0 (CLAUDE.md) y Fase 6 (cron config).

---

### 🟢 4. Lista final de competidores (22 dominios + handles sociales)

- **Requerimiento**: 22 competidores (~10 well + ~12 plumbing), mix local/mondo/national.
- **Issue**: El PRD lista nombres sintéticos para el prototipo pero pide "Confirmed list
  of 22 competitor domains + social handles" como entregable post-prototype.
- **Severidad**: 🟢 DECISIÓN DEL CLIENTE
- **Decisión requerida**: Robert (o sus agencias PPC/SEO) tiene que entregar:
  - 22 dominios `.com`
  - URL de Facebook page por competidor (formato `facebook.com/<handle>`)
  - Handle de Instagram
  - Handle de TikTok (puede ser null si no tienen)
  - URL del canal de YouTube
- **Alternativas si no llega a tiempo**: Arrancar Fase 7 (cutover a live) sólo con los
  competidores que sí confirmen, e ir agregando incrementalmente. Robert ya pidió UI
  para add/remove competitors, así que esto se hace solo desde el dashboard.
- **Impacto en fases**: Fase 7 (cutover a live data). Fases 0–6 corren con data
  sintética del prototipo.

---

### 🟢 5. Lista final de keywords SEO (5–50 términos)

- **Requerimiento**: US4 — keyword rankings vía Serper.
- **Issue**: PRD dice "Robert's agencies can provide the initial keyword list; design
  for 5–50 keywords with an editable list in the dashboard." El número exacto y los
  términos son TBD.
- **Severidad**: 🟢 DECISIÓN DEL CLIENTE
- **Decisión requerida**: Lista inicial de 5–50 keywords (ej. "water well drilling Fort
  Worth", "plumber Saginaw TX", etc.) — Robert debe pedírsela a su agencia de SEO.
- **Alternativas**: Arrancar con 10–15 keywords seed extraídos de los nombres de las
  páginas top de FlowCore (auto-derivados con Lightweight LLM) y dejar que Robert los
  edite desde el dashboard.
- **Impacto en fases**: Fase 7. Fase 4 (panel SEO) usa seed sintético.

---

### 🟢 6. Lista de cuentas "inspiration" no-competidores (TikTok/Shorts)

- **Requerimiento**: US3 — segunda lista separada de "tradespeople virales" + búsquedas
  por keyword en TikTok/Shorts.
- **Issue**: PRD: "the specific size of this list (and who's on it) wasn't named. Will
  surface during prototype review."
- **Severidad**: 🟢 DECISIÓN DEL CLIENTE
- **Decisión requerida**: ¿Cuántas cuentas inspiration? ¿Qué handles? ¿Qué searches por
  keyword (ej. "water well TikTok", "plumber prank")?
- **Alternativas**: Pre-poblar el prototipo con 5–8 cuentas inspiration sintéticas y 3
  keyword-searches genéricos ("trades", "plumbing fail", "water well drilling") y
  dejar que Robert refine desde la UI de settings.
- **Impacto en fases**: Fase 2 (UI de settings) ya soporta agregarlos. Fase 7 (live).

---

### 🟢 7. ¿Trackear los propios assets de FlowCore como un "competitor"?

- **Requerimiento**: "Discussed But Not Confirmed" en el PRD.
- **Issue**: Útil para tener línea base ("¿estamos publicando más o menos que la
  competencia?") pero nunca se confirmó.
- **Severidad**: 🟢 DECISIÓN DEL CLIENTE
- **Decisión requerida**: Sí/No incluir flowcorewater.com como entrada en la lista de
  monitoreo.
- **Alternativas**: Arrancar sin él — fácil agregarlo después desde el mismo CRUD de
  competidores. No requiere cambios de código.
- **Impacto en fases**: Cero (UI ya lo soporta).

---

### 🟢 8. ¿Daily/weekly digest email?

- **Requerimiento**: "Implied in the 'consumable' framing but never explicitly committed."
- **Severidad**: 🟢 DECISIÓN DEL CLIENTE
- **Decisión requerida**: Sí/No agregar email diario/semanal a Robert con el resumen.
- **Alternativas**: Dejar fuera de V1. Si lo pide después, es ~3h de trabajo (Resend o
  Postmark + un cron que renderiza el feed del día como HTML email).
- **Impacto en fases**: Cero para V1. Posible Fase 7.5 si se aprueba.

---

### 🟢 9. ¿Google Ads bid-level tracking (vs. solo creative/landing page)?

- **Requerimiento**: Ed mencionó al [34:57] "we can track how much they're bidding."
- **Issue**: Requiere SpyFu (~$39/mo) o SEMrush (~$140+/mo). Datos estimados, no exactos.
- **Severidad**: 🟢 DECISIÓN DEL CLIENTE
- **Decisión requerida**: Sí/No agregar SpyFu como tercera fuente.
- **Alternativas**: Default = NO. Robert mismo dijo "not worthwhile tracking Google Ads
  as much because it's the same ad" — evidencia a favor de dejar Google Ads en
  landing-page tracking únicamente.
- **Impacto en fases**: Cero. Si se aprueba después, es un canal adicional ~Fase 4.5.

---

## Próximas Acciones Recomendadas

1. **Inmediato (antes de Fase 0)**: Confirmar con Robert el cap mensual de spend de
   APIs externas (Hallazgo #2) y el SLA de detección "12–36h" (#3). Estos dos van a
   estar reflejados en el `CLAUDE.md`.
2. **Antes de Fase 7 (cutover a live)**: Robert debe entregar #4, #5 y #6.
   Pedírselos por escrito (email del PM) en el momento de aprobar el prototipo.
3. **Diferir indefinidamente**: #7, #8, #9 — quedan en backlog "post-V1". No los
   incluimos en las fases generadas a menos que el cliente los reactive explícitamente.
4. **Mitigación durante construcción**: Implementar `BudgetGuard` (Hallazgo #2) y
   `GracefulChannelDegradation` (Hallazgo #1) como infrastructure cross-cutting en
   Fase 6 — están explícitamente listados en el prompt de esa fase.

---

## Conclusión

**Procedemos a generar las 8 fases.** Ninguna decisión pendiente bloquea el inicio del
proyecto porque las Fases 0–6 corren contra seed data sintético. Las decisiones del
cliente se vuelven load-bearing recién en la Fase 7 (cutover a live), y las marcamos
explícitamente en ese prompt como **"BLOQUEANTE PRE-DEPLOY"**.
