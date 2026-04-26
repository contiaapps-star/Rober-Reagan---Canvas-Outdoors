# FlowCore Marketing Sensor — PRD v1.0

**Client**: FlowCore Water (portfolio company of Canvas Outdoors) | **Date**: 2026-04-16 | **Build Type**: New

---

## One-Line Summary

Turns ~22 water well and plumbing competitors' public marketing moves — new ads, blog posts, SEO shifts, and viral social content — into a daily intelligence feed for FlowCore's CEO, so marketing ideas are copyable at the speed competitors publish them.

---

## Build Spec

_Share this section with the customer for approval before starting the build._

- Track ~22 competitors' websites daily — catch new blog posts and landing pages within 24 hours of publishing
- Flag new competitor ads on Meta (Facebook + Instagram) and Google as they launch
- Monitor competitor TikTok and YouTube Shorts — plus viral trade videos worth emulating from non-competitor accounts
- Detect competitor SEO moves — new backlinks they acquire and keyword rankings they gain or lose
- Pull everything into one intelligence board, filterable by competitor, channel, and date, with "useful / skip" tagging so insights can feed the Phase 2 content agent

---

## Company & Problem Context

**Company:** FlowCore Water is a 22-year-old home services business headquartered in Saginaw, TX, with branch offices in Southlake and New Fairview. They serve homeowners across North Texas and the DFW metroplex with four service lines: water well drilling and repair, water filtration and treatment, irrigation, and plumbing. Robert Reagan became CEO after Canvas Outdoors (a search-fund-style holding firm) acquired the business in April 2024 and rebranded it from Priceless Water Well Service to FlowCore. Small team — Robert as CEO, Janna as Office Manager, Nashu as Ops Manager, Ryan as Lead Tech, plus field techs and a single plumber. They run ServiceTitan as their ops backbone.

**Problem:** Digital marketing velocity is the biggest drag on the business — Robert called it "the constant drain" at [39:28]. He has a PPC agency and a website SEO agency, but nobody doing social, and no systematic way to see what his competitors are publishing across any channel. His framing at [43:47]: _"I've got experience digitizing and streamlining operations on an RPA level, but I'm terrible with the marketing. If you can help me apply AI to marketing to get sophisticated on what we're generating and how we're finding demand, that would be the perfect complement to what I'm doing operationally."_ Robert is actively vibe-coding his own operational tools (a Slack→ServiceTitan parts restock bot, a FleetPro/ServiceTitan truck allocation reconciler, a marketing spend dashboard, a Texas public water-well records scraper) — the one category he explicitly can't build himself is a marketing intelligence layer. Today, competitor moves slip past him; he'd like to "farm for ideas" across ~22 competitors (mix of local, ~$100M mondo firms, and national names — 10 on the well side, 12 on the plumbing side) because _"marketing, particularly digital marketing — everybody has to expose their strategy online. It's infinitely copyable"_ [42:30]. This build is his first real handoff of a hard problem to someone else.

---

## Developer Brief

- **Competitor website tracking**: ~22 competitor domains polled once daily. Three-tier detection (sitemap.xml → RSS → scraped index page + hash diff) catches new blog posts and new landing pages. Robert needs to know within 24h when a competitor publishes, not weeks later.
- **Competitor ad tracking (Meta, Google, TikTok)**: Robert wants to see new creatives as they launch on Meta/Instagram specifically — those are the ones he and his agencies can genuinely copy. Google Ads tracking is secondary (_"not worthwhile tracking Google Ads as much because it's the same ad, and you're just bidding more"_ [34:57]) and is mostly about landing page changes, not creative. See Implementation Considerations for why the official Meta Ad Library API won't work for US commercial ads.
- **TikTok + YouTube Shorts**: Both competitor accounts AND a curated list of "interesting tradespeople" / keyword searches for viral trade content. Robert has a team member who likes making TikToks and wants to "emulate the viral bandwagon" [42:17]. This channel is about inspiration, not just counter-positioning.
- **SEO monitoring (backlinks + keyword rankings)**: Robert's opening ask was _"actively scan competitor businesses and their websites to understand... where they're ranking"_ [26:52]. Backlinks tell him which authoritative sites are linking to competitors; keyword rankings tell him which terms competitors are winning. Weekly cadence — SEO moves slowly.
- **Single intelligence board**: Everything feeds one dashboard. Sortable/filterable by competitor, channel, date. Robert (or his PPC/SEO agencies) reviews, marks items "useful" or "skip." "Useful" items get persisted in a structured way so the Phase 2 content agent can consume them — this is the handoff point Ed made explicit at [42:25]: _"these opportunities will become, like, tickets eventually that you can do things with in the next agent."_

---

## Prototype

**What the prototype delivers:**
- A fully interactive dashboard pre-loaded with ~22 synthetic competitor profiles (realistic names like "Clearwater Wells TX", "AquaPoint Plumbing North Texas", "Trinity Valley Well Services", etc. — matching the mix Robert described at [40:28]: local same-size, mondo $100M, and national).
- ~80–120 synthetic activity events spread across all 6 channels over the last 30 days: new blog posts with realistic titles and previews, Meta/Instagram ad creatives (image + headline + CTA), Google Ads Transparency entries, TikTok captions + thumbnail placeholders, YouTube Shorts metadata, backlink acquisitions, keyword rank deltas.
- Full filtering UX: by competitor, by channel, by date range, by "useful/skip" status. The daily rhythm is visible — Robert can land on the board and see "here's what moved since yesterday."
- Per-activity detail view with the LLM-generated short summary ("Why this matters") and a mock source link.
- Competitor management UI: add/remove/rename competitors, edit keyword list, toggle which channels track per competitor.

**What's simulated (demo mode):**
- All 6 channel polls return pre-loaded synthetic data instead of live API calls. No Apify / DataForSEO / YouTube API keys required to demo.
- "Summarize this activity" calls use OpenRouter live (so Robert sees real LLM output on real synthetic content).
- No outbound integrations — items marked "useful" persist to SQLite but don't push anywhere yet (Phase 2 consumer doesn't exist).

**To complete (what we need from the customer after prototype approval):**
- Confirmed list of 22 competitor domains + social handles (TikTok, Instagram, Facebook page URLs)
- Confirmed list of 5–50 target keywords to track in SERP
- Confirmed list of "inspiration" non-competitor accounts (trades people, viral handles) + keyword searches for trending trade content
- Budget approval for third-party data subscriptions: Apify (~$30–80/mo), DataForSEO (~$30–75/mo), SerpApi (~$75/mo) OR Apify-only for Google Ads Transparency. Net ~$100–200/mo on top of Railway + stack.md defaults.
- OpenRouter API key (Sagan-provided), YouTube Data API key (free tier, customer obtains)

---

## Stack Suggestions

| Layer | Tool | Rationale |
|-------|------|-----------|
| Hosting | Railway | Sagan default per stack.md. Web app + cron in one service — fits perfectly. |
| Frontend | HTML + Tailwind CSS + htmx | Sagan default per stack.md. This is a dashboard with filters, feeds, and mark-as-useful toggles — pure server-rendered fragment territory. No React needed. |
| Backend | Hono (Node.js + TypeScript) | Sagan default per stack.md. Lightweight API + server-rendered views. |
| Database | SQLite on Railway volume | Per stack.md — low-medium volume default. 22 competitors × ~daily events × 6 channels is trivially small; historical retention of ~1 year is easy. |
| Integrations | Direct API (YouTube, Serper, DataForSEO) + Apify (Meta Ad Library, TikTok, Google Ads Transparency) + ZenRows (competitor websites) | Per stack.md — call clean APIs directly, use Apify for scraped channels without viable APIs. n8n not needed; no multi-step webhook orchestration here. |
| AI | SoTA tier (summarization, clustering) + Lightweight tier (classification, extraction) via OpenRouter | Per stack.md AI tiers. SoTA writes "why this matters" summaries; Lightweight classifies activity type and extracts keyword themes. |
| Scheduling | Railway cron | Per stack.md — never n8n for scheduling. Daily cadence per channel; weekly cadence for SEO. |

**Environment Variables**: `APIFY_API_TOKEN`, `YOUTUBE_API_KEY`, `SERPER_API_KEY`, `ZENROWS_API_KEY`, `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD`, `SERPAPI_API_KEY` (optional — only if using SerpApi over Apify for Google Ads Transparency), `OPENROUTER_API_KEY`

---

## Screen Share Timestamps

_Moments in the recording where the customer shared their screen. Note: the committed build (marketing sensor) was scoped in the second half of the call via audio only — Robert was not sharing his screen when the sensor was decided. Earlier screen shares showed his existing operational tooling, which is useful context but not directly part of this build._

| Timestamp | Screenshots | Description | Relevance |
|-----------|-------------|-------------|-----------|
| 08:45 – 09:30 | 6_07m56s.jpg – 12_09m30s.jpg | Robert's Slack workspace (`#ops-truck-restock` channel) and his self-built FlowCore Ops Console restock UI for Slack→ServiceTitan parts transfer requests | Context: shows his technical capability and existing internal tooling stack. Not part of this build but establishes he can self-serve on operations — the marketing build fills a gap he can't fill himself. |
| 10:42 – 10:58 | 14_10m42s.jpg – 18_10m58s.jpg | FlowCore Ops Console — fleet allocation UI showing truck→technician mapping, unassigned techs, and a live vehicle GPS map | Context: confirms ServiceTitan as the source of operational truth; the sensor build does not touch ServiceTitan. |
| 11:08 – 11:50 | 19_11m08s.jpg – 25_11m50s.jpg | Robert's in-progress marketing spend dashboard (budget burn-up per campaign, revenue and job count tracking) | Relevance: confirms FlowCore is already instrumented on the spend side — the sensor build is about the _input_ side (competitor intel), not the _output_ side (spend tracking). |
| 13:22 – 13:58 | 26_13m22s.jpg – 27_13m28s.jpg | webscope.flowcorewater.com — Robert's Texas public water-well records scraper | Context: Robert is actively scraping public data sources for his own projects — he'll quickly grok how the sensor's scraped channels work. |
| 26:00 – 42:25 | (none — audio-only) | Committed build scoped: 22 competitors, 6 channels (website, Meta, Google, TikTok, YouTube Shorts, SEO), board-style dashboard, "marketing content sensor" framing | Core build definition — read transcript lines 201–362 for full context. |

---

## Key Definitions

| Term | Meaning | Examples |
|------|---------|----------|
| Competitor | A water well, plumbing, or broader home-services company whose marketing Robert wants to track | Mix Robert specified at [40:28]: 2–3 local same-size (~$10M aspirational), 4–5 "mondo" $100M/yr firms, 2–3 national. Split ~10 well + ~12 plumbing. |
| Channel | One of six monitored marketing surfaces | Competitor website, Meta ads, Google ads, TikTok, YouTube Shorts, SEO (backlinks + keyword rankings) |
| Activity | A discrete, timestamped event detected on a channel | "New blog post published", "New Facebook ad launched", "Competitor gained 5 positions for 'water well drilling Fort Worth'", "High-DA backlink acquired" |
| Intelligence Board | The unified dashboard where all activity is aggregated | Single feed with per-channel, per-competitor, per-date filters; "useful/skip" tagging |
| Farming for ideas | Robert's phrase [40:56], endorsed by Ed as the framing | "What's that $100M firm doing on Instagram that we should try?" |
| Inspiration account | A non-competitor whose content Robert wants to emulate | "A tradesperson who does really cool stuff" [33:05] — e.g., specific viral TikTok handles |

---

## User Stories

### User Story 1: Track ~22 competitors' websites for new content daily

**Implementation Considerations:**
- Build a 3-tier detection pipeline per competitor: (1) try `sitemap.xml`, (2) fall back to RSS (`/feed`, `/rss`, `/atom.xml`), (3) fall back to scraping `/blog` and `/news` index pages and hashing for diffs. Engineer should not hardcode one approach — competitor sites vary.
- ZenRows (per stack.md) handles the scrape tier for sites needing JS render or bot-protected sites. `premium_proxy: true` and `js_render: true` are sensible defaults.
- Store URL list per competitor in SQLite. Any new URL since last poll = activity event. Fetch the new page and run a Lightweight-tier OpenRouter model to extract title, summary, and target keyword theme.
- Surface **new landing pages** too, not just `/blog` paths — SEO-focused competitors often publish new service-area or service-type landing pages that matter more than blog posts.
- Graceful degradation: if a single competitor's poll fails (site down, anti-bot escalation), keep others flowing. Flag the failure in a minor UI status, don't block the dashboard.

### User Story 2: Flag new competitor ads on Meta and Google

**Implementation Considerations:**
- **Meta Ad Library API is effectively unavailable for US commercial ads** — the official API only returns political/social-issue ads or EU-served ads. Research already surfaced this blocker. Use **Apify's Facebook Ads Library Scraper** (~$0.30–$1 per 1k ads); no Meta developer approval needed. Do not spend engineering time on the official API.
- **Google Ads Transparency Center has no official API.** Two realistic options: SerpApi's Google Ads Transparency engine (~$75/mo, cleaner JSON) or Apify scrapers (~$0.50–$2 per advertiser-poll, fits existing Apify subscription). Engineer's call — both work.
- **Prioritize Meta/Instagram creative tracking** in the UX. Robert was explicit at [34:57] that Google ads are less copyable (same ad, just bid higher) — treat Google tracking as secondary, mostly surfacing landing-page changes rather than creative variations.
- Store for each ad: advertiser, channel, creative asset (image URL), headline, CTA, first-seen date, still-active flag. Dedupe by creative hash.
- Ed specifically declined **OTT/Connected TV ad tracking** at [31:54] — out of scope; see Discussed But Not Confirmed.

### User Story 3: Monitor TikTok and YouTube Shorts — competitors and viral trade content

**Implementation Considerations:**
- **TikTok Commercial Content Library API is EU-only**; Research API requires academic affiliation. Both are blockers — use Apify TikTok scrapers (several reliable actors) for both competitor handles and keyword searches.
- TikTok anti-bot rotates aggressively. Expect occasional scrape breakage; Apify's managed actors abstract this. Poll daily; tolerate one-day gaps without alerting.
- **YouTube Data API v3 is free** (10k units/day — plenty for 22 channels polled daily). **No native Shorts filter** — fetch `channels.uploads` playlist, then `videos.list` for `contentDetails.duration`; heuristic: duration ≤ 60s + vertical aspect → Shorts. Engineer should verify heuristic on a known Shorts sample during build.
- Robert explicitly wants **two separate lists**: (1) the ~22 competitor accounts, and (2) "inspiration" accounts + keyword searches in the trade space for going-viral content. Treat as distinct lists in the UI; Robert should be able to add/remove on either list.
- Capture for each video: caption/title, view count, engagement counts, thumbnail URL, publish date. Run Lightweight-tier classification: "is this a trade topic?", "is this going viral (outlier engagement)?"

### User Story 4: Detect competitor SEO moves — backlinks and keyword rankings

**Implementation Considerations:**
- **Backlinks**: DataForSEO Backlinks API is the only realistic price point (~$0.02–$0.05 per domain lookup; ~$30–75/mo for 22 competitors polled weekly). Ahrefs/SEMrush API tiers start $400–500/mo — too expensive for this build. Engineer should verify current DataForSEO pricing at build time; it changes.
- **Keyword rankings**: use Serper (already in Sagan stack.md) to query target keywords in Google and parse SERP JSON for competitor domain positions. ~$1 per 1k queries. Robert's agencies can provide the initial keyword list; design for 5–50 keywords with an editable list in the dashboard.
- **Cadence: weekly, not daily** — backlinks and ranks move slowly; daily polling wastes API credits without new signal.
- **Flag meaningful changes only**: competitor gains/loses ≥3 positions, OR acquires a backlink from a domain with high authority. Else the board fills with noise. Engineer should pick a threshold empirically during prototype review.
- Backlink anchor text often reveals competitor keyword targeting — worth passing through to the summary model as a signal.

### User Story 5: Pull everything into one intelligence board with useful/skip tagging

**Implementation Considerations:**
- htmx fragments work beautifully here: each activity row is a server-rendered fragment; filters update the feed via `hx-get` without a full page refresh. Per stack.md.
- Every activity row shows: competitor name + logo, channel badge, timestamp, LLM-generated short summary ("Why this matters"), source link, and useful/skip toggle.
- **Useful/skip persistence is load-bearing for Phase 2.** Store activity records as structured rows: `{id, competitor_id, channel, detected_at, source_url, raw_payload_json, summary_text, status: "new"|"useful"|"skip"}`. Phase 2 content agent will query `status = "useful"` as its input corpus.
- Global filters: channel, competitor, date range, status. Save Robert's last filter state in a session cookie so he lands on his preferred view.
- Competitor management + keyword management should live on the same dashboard — small "settings" area. Robert needs to iterate on the competitor and keyword lists without emailing the dev team.
- Daily digest email to Robert was implied in conversation but not explicitly committed. Leave it out of v1; add later if asked.

---

## Data Sources

| Source | Type | Direction | Integration Method | Notes |
|--------|------|-----------|-------------------|-------|
| Competitor websites (×22) | Web pages | In | ZenRows scrape + sitemap/RSS parse | 3-tier detection. Daily cron. `premium_proxy: true, js_render: true` defaults. |
| Meta Ad Library (FB + IG) | Scraped via vendor | In | Apify Facebook Ads Library scraper | Official API blocks US commercial ads — Apify is the viable path. Daily cron, poll by advertiser page. |
| Google Ads Transparency Center | Scraped via vendor | In | SerpApi Google Ads Transparency engine OR Apify | No official API. Engineer picks based on cost vs. reliability preference. Daily cron. |
| TikTok (competitor + inspiration handles, keyword searches) | Scraped via vendor | In | Apify TikTok scrapers | Research API gated; Commercial Content Library EU-only. Apify is the only realistic path. Daily cron, tolerant to occasional failures. |
| YouTube Shorts (competitor channels + keyword searches) | Official API | In | YouTube Data API v3 | Free 10k units/day. No native Shorts filter — post-filter by duration + aspect. Daily cron. |
| Serper (SERP for keyword rankings) | API | In | Direct API | Sagan default per stack.md. Parse SERP JSON for competitor domain position. Weekly cron. |
| DataForSEO (Backlinks API) | API | In | Direct API | Cheapest viable backlink source (~$30–75/mo). Weekly cron. Verify current pricing at build. |
| OpenRouter | API | Both | Direct API | SoTA for summaries + "why this matters" narration; Lightweight for classification and keyword extraction. Per stack.md. |

---

## Discussed But Not Confirmed

- **Google Ads bid-level tracking (not just creative/landing-page tracking)**: Ed mentioned at [34:57] "we can track how much they're bidding and if that has changed." This is a different data source than the Transparency Center — requires SpyFu (~$39/mo) or SEMrush (~$140+/mo), and even then bid data is estimated. Verify with Robert whether this is in scope for v1 before adding. Default: leave out unless confirmed.
- **OTT / Connected TV ad monitoring**: Robert asked at [31:48] if possible; Ed said at [32:10] it's likely enterprise-tier (Nielsen-level) and too expensive. Effectively declined on the call but preserving in case budget/priorities change.
- **Daily or weekly digest email to Robert**: Implied in the "consumable" framing but never explicitly committed as a deliverable. If Robert wants it, it's a small add on top of the core dashboard. Confirm before building.
- **Self-tracking FlowCore's own marketing in the dashboard**: Not discussed. Including FlowCore as a "competitor" would give Robert a baseline to measure against. Low effort; verify preference.
- **Inspiration-account / viral-keyword list size and composition**: Robert mentioned wanting to track both competitor accounts AND "interesting tradespeople" + keyword searches on TikTok/Shorts, but the specific size of this list (and who's on it) wasn't named. Will surface during prototype review.

---

## Out of Scope (Future Phases)

_These came up on the call but were explicitly deferred or belong to separate builds. Preserved here so nothing is lost._

- **Phase 2 — Content Generation Agent**: Robert's stated downstream vision at [34:10] — _"twice a week, here's three blog posts you could possibly run with"_ + ad copy suggestions + keyword-optimized article drafts. Ed deliberately scoped this out ([25:30], [39:05], [42:25]) so the sensor ships standalone first. This is the natural Phase 2 credit; the sensor's "useful/skip" tagging is built to feed it.
- **Phase 2 — Auto-publish to FlowCore's website**: Robert: "click publish, and that publishes our website." Requires CMS integration; depends on Phase 2 content gen.
- **Slack → ServiceTitan parts restock bot** [08:45 – 10:40]: Robert's active side project; he's building it himself.
- **FleetPro ↔ ServiceTitan truck allocation reconciler** [10:42 – 10:58]: Robert's side project; self-built.
- **Marketing spend dashboard with campaign burn-up** [11:08 – 11:50]: Robert's side project; self-built.
- **Texas public water-well records + property-ownership change detection for direct mail** [11:50 – 12:30]: Robert's side project; self-built.
- **Plumbing permit monitoring for opportunistic homeowner outreach** [12:32]: Long-tail demand gen; Robert called it a future "sustaining gravy" layer.
- **Well-pitch builder with 3-page PDF** (map view + property plan view + elevation drawing) [21:21 – 24:10]: Discussed at length for commercial clients who want blueprint-style pitches; Ed said "could be one project" but scoped the sensor first.
- **M3U TV feed for shop floor sales celebrations** [12:48 – 13:07]: Robert called it "less consequential, more of a morale thing."
- **Estimate follow-up bot (Slack nudge to technicians with half-baked estimates)** [37:19 – 38:35]: Robert described the flow; Ed acknowledged but steered toward the sensor as the v1 pick.
- **Remarketing / renewal reminder agent for past customers pulling from ServiceTitan** [35:32 – 37:00]: Ed described this (modeled on his boiler/ice-machine customers' builds) but Robert didn't commit to it.
- **Case studies auto-generated from field technician Slack photos** [33:00]: _Suggested by Sagan — not confirmed by Robert._ Ed pitched the idea (reviews + field pics → SEO article pipeline); Robert didn't explicitly accept or reject. Preserved for Phase 3.
- **Social media posting automation** (not just monitoring): Robert said at [29:18] he needs to get better at TikTok but didn't commit to posting automation — only to surfacing what's working elsewhere.

---

## Confidence Score

| Dimension | Score | Notes |
|-----------|-------|-------|
| Scope Definition | 4/5 | Tight boundary: monitor, don't generate. Phase 2 content gen cleanly deferred. Four yellow items moved to Discussed But Not Confirmed (Google Ads bid tracking, OTT, digest email, self-tracking) — none are load-bearing. |
| Technical Feasibility | 4/5 | All 6 channels accessible, but three (Meta, Google Ads Transparency, TikTok) require Apify because official APIs are gated/blocked. No insurmountable blockers. ~$100–200/mo of vendor subscriptions on top of stack.md defaults — requires customer budget approval. TikTok scrape fragility is real but manageable with graceful degradation. |
| Customer Impact | 4/5 | Robert named marketing his #1 drain and explicitly asked for this. Agencies (PPC, SEO) ready to consume insights. Not a 5/5 because standalone value of a sensor without the Phase 2 content agent is real-but-partial — the full flywheel (sense → generate → publish) requires Phase 2 to exist. |
| **Overall** | **4/5** | **= lowest of the three (all tied at 4)** |

Solid build. Scope discipline held up — one of several good projects Robert mentioned, focused into a single shippable credit. Main watch-outs: vendor subscription budget (~$100–200/mo), scraping fragility for TikTok/Meta/Google Ads, and setting expectations that the sensor's payoff compounds when Phase 2 lands.

---

## Audit Notes

Every user story traced back to the transcript:
- **US1 (website monitoring)** — explicit at [26:52] and [32:30]; both sides engaged.
- **US2 (Meta/Google ad tracking)** — Meta/Instagram/Google tracking explicit at [30:57]; Meta emphasized as the copyable channel, Google deprioritized to landing-page changes only.
- **US3 (TikTok + YouTube Shorts)** — explicit at [42:00] ("I'd love to just see the organic efforts too") and [42:09] (Ed: "YouTube shorts and TikTok specifically, that could be interesting too").
- **US4 (backlinks + keyword ranks)** — backlinks explicit at [34:00]; keyword ranking was Robert's opening ask at [26:52].
- **US5 (single board)** — Ed's "we bring that in and organize that into, like, a board" at [33:05] is the exact framing; Robert's "marketing content sensor" framing at [42:25] locks it in.

**Moved to Discussed But Not Confirmed during audit** (4 items): Google Ads bid-level tracking (distinct from creative/landing-page tracking), OTT/Connected TV ads, daily/weekly digest email, and self-tracking FlowCore's own marketing. None appeared in any user story; all are verify-before-building.

**No red flags** — no features in the draft lacked transcript basis. The only Sagan-suggested item preserved (not in scope) is case-studies-from-Slack-photos, clearly marked as such in Out of Scope.

**Prototype audit**: Prototype genuinely demonstrates the core problem (systematic competitor visibility) and is fully buildable with synthetic data — no customer credentials required to demo. "To Complete" items are real post-prototype needs: confirmed competitor list, keyword list, inspiration-account list, vendor subscription budget approval. Synthetic data description (22 competitors split across well/plumbing and size tiers) matches Robert's stated competitor mix at [40:28].

**Identity reconciliation**: Folder says "Robert Reagan - Canvas Outdoors" but the URL provided (flowcorewater.com) is the portfolio company. Canvas Outdoors is Robert's employer (a search-fund-style holding firm, active-portfolio page at canvasoutdoors.com confirms FlowCore Water Services, Dallas TX, acquired April 2024). The build is for FlowCore; Canvas Outdoors is noted as parent for context.
