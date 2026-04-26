# API Providers — Live Mode Reference

This document describes every external API the live pollers depend on.
**Load-bearing**: when an upstream scrape breaks in production, this is the
file to check before opening provider dashboards. Schema fixtures here are
the ones the Zod parsers in `src/pollers/*.ts` enforce.

| Channel | File | Provider | Endpoint / Actor | Cost env knob |
|---------|------|----------|------------------|---------------|
| website | [src/pollers/website.ts](../src/pollers/website.ts) | ZenRows + native fetch | `https://api.zenrows.com/v1/` (`apikey`, `url`, `js_render`, `premium_proxy`) — falls back to `https://<domain>/sitemap.xml` and RSS first | `ZENROWS_API_KEY` |
| meta | [src/pollers/meta.ts](../src/pollers/meta.ts) | Apify | actor `apify~facebook-ads-library-scraper` via `POST /v2/acts/<id>/run-sync-get-dataset-items` | `APIFY_API_TOKEN` |
| google_ads | [src/pollers/google-ads.ts](../src/pollers/google-ads.ts) | Apify | actor `apify~google-ads-transparency-scraper` via `POST /v2/acts/<id>/run-sync-get-dataset-items` | `APIFY_API_TOKEN` |
| tiktok | [src/pollers/tiktok.ts](../src/pollers/tiktok.ts) | Apify (dual) | actor `apify~tiktok-scraper` (handles) + actor `apify~tiktok-search-scraper` (keyword searches) | `APIFY_API_TOKEN` |
| youtube | [src/pollers/youtube.ts](../src/pollers/youtube.ts) | YouTube Data API v3 | `GET /youtube/v3/channels`, `GET /youtube/v3/playlistItems`, `GET /youtube/v3/videos` | `YOUTUBE_API_KEY` |
| seo_ranking | [src/pollers/seo-ranking.ts](../src/pollers/seo-ranking.ts) | Serper | `POST https://google.serper.dev/search` | `SERPER_API_KEY` |
| seo_backlink | [src/pollers/seo-backlinks.ts](../src/pollers/seo-backlinks.ts) | DataForSEO | `POST /v3/backlinks/backlinks/live` (HTTP Basic auth) | `DATAFORSEO_LOGIN` + `DATAFORSEO_PASSWORD` |

The Apify actor names live in
[src/services/providers/apify.ts](../src/services/providers/apify.ts) under
`APIFY_ACTORS` — change them in one place, not in each poller.

---

## Website (3-tier)

The poller tries these in order; the first tier that returns ≥1 URL wins.

1. **Tier 1 — sitemap.xml**: `GET https://<domain>/sitemap.xml`. We parse
   either a `<urlset>` directly or follow up to 3 entries from a
   `<sitemapindex>`. Each `<url><loc>` becomes a candidate.
2. **Tier 2 — RSS / Atom**: tries `/feed`, `/rss`, `/atom.xml`, `/feed.xml`,
   `/rss.xml` in order. Parses RSS 2.0 (`rss > channel > item > link`) and
   Atom (`feed > entry > link[@href]`).
3. **Tier 3 — hash diff via ZenRows**: scrapes `/blog` and `/news` with
   `js_render=true&premium_proxy=true`, hashes the combined HTML, and
   compares to `competitors.last_index_hash`. If changed: extracts every
   `<a href>`, absolutizes against the domain, and emits the deltas. The
   new hash is persisted along with `competitors.last_polled_at`.

Each candidate URL is then re-scraped through ZenRows for the title and
first paragraph. URLs containing `/blog/` or `/news/` are tagged
`new_blog_post`; everything else is `new_landing_page`.

**Schema cap**: the poller scrapes at most 10 candidate pages per run.
Dedupe (via `dedupe_hash = sha256(competitor_id:canonicalized_url)`) skips
URLs we've already seen across runs.

---

## Meta Ads Library (Apify)

Actor: `apify~facebook-ads-library-scraper`. We send one POST per
configured handle:

```json
{ "urls": ["https://www.facebook.com/<handle>"], "activeOnly": true, "count": 50 }
```

Auth: `Authorization: Bearer ${APIFY_API_TOKEN}`. The Apify endpoint blocks
until the run finishes (we use `run-sync-get-dataset-items`, default
60-second timeout).

**Expected response shape** (parsed by the Zod schema in `src/pollers/meta.ts`):

```jsonc
[
  {
    "ad_archive_id": "1234567890",      // required
    "page_name": "AquaPoint",
    "page_id": "fb-page-001",
    "publisher_platform": ["facebook"], // ["instagram"] → emits meta_instagram
    "snapshot": {
      "title": "Spring well-drilling promo",
      "body": { "text": "..." },        // can also be a plain string
      "cta_text": "Learn More",
      "link_url": "https://example.com/promo",
      "images": [{ "original_image_url": "https://..." }]
    },
    "start_date": 1714000000              // unix seconds
  }
]
```

If a required field is missing, `MetaAdItemSchema.safeParse(...)` throws
`meta live: response item failed schema for handle <h>: <field>: <reason>`.
The orchestrator marks the poll_run as `status='failed'` with that string in
`error_message`.

---

## Google Ads Transparency Center (Apify)

Actor: `apify~google-ads-transparency-scraper`. Input:

```json
{ "advertiserIds": ["<advertiser_id>"], "limit": 50 }
```

We only emit `new_landing_page` activities and dedupe by
`sha256(advertiser_id : canonicalized landing_page_url)`. Robert's directive
is to track landing-page-level changes, not creative variations.

Tolerated landing fields (in order): `landing_page_url`, `landing_url`,
`final_url`. If none are present we skip the row silently.

---

## TikTok (Apify, dual actor)

Two separate actors:

- `apify~tiktok-scraper` — input `{ "profiles": ["<handle>"], "resultsPerPage": 30 }`.
  One call per competitor that has a `tiktok` handle.
- `apify~tiktok-search-scraper` — input `{ "hashtags": ["<query>"], "resultsPerPage": 20 }`.
  One call per active row in `inspiration_sources` where
  `kind='keyword_search' AND channel='tiktok'`.

Both responses are normalized through `TikTokItemSchema` — fields used:
`id`/`aweme_id`, `text`/`desc`, `createTime`/`create_time`, `playCount`,
`diggCount`, `commentCount`, `shareCount`, `authorMeta.name`,
`videoMeta.duration`, `videoMeta.coverUrl`, `webVideoUrl`. Dedupe key:
`sha256(handle : aweme_id)`.

---

## YouTube Data API v3

Three sequential calls per channel:

1. `GET /youtube/v3/channels?id=<channel_id>&part=contentDetails&key=<key>`
   → extract `items[0].contentDetails.relatedPlaylists.uploads`.
2. `GET /youtube/v3/playlistItems?playlistId=<uploads_id>&part=contentDetails&maxResults=20&key=<key>`
   → list of `videoId`s.
3. `GET /youtube/v3/videos?id=<id1,id2,...>&part=contentDetails,snippet,statistics&key=<key>`.

**Shorts filter** (load-bearing — see CLAUDE.md): for each video we keep
only those where `parseIsoDurationSeconds(contentDetails.duration) ≤ 60`
**and** the primary thumbnail is vertical (`height > width`). The second
filter is critical — without it long-form videos sneak in via short edits.

---

## Serper

Endpoint: `POST https://google.serper.dev/search` with header
`X-API-KEY: ${SERPER_API_KEY}`.

```json
{ "q": "<keyword>", "gl": "us", "hl": "en", "num": 100 }
```

We iterate `response.organic[*]` looking for the first link whose hostname
matches the competitor's `domain` (case-insensitive, with/without `www.`).
That position is compared against the last `new_position` we recorded for
`(competitor_id, keyword)` in `activities`. We emit a `rank_change` only
when one of:

- there is no prior recording (anchor with `delta=0`), **or**
- `|new_position - previous_position| ≥ 3`.

If the competitor falls out of the top-100 entirely, we record
`new_position=null` with `delta=100`.

---

## DataForSEO Backlinks

Endpoint: `POST https://api.dataforseo.com/v3/backlinks/backlinks/live` with
HTTP Basic auth (`base64(login:password)`). Body:

```json
[{
  "target": "<domain>",
  "mode": "one_per_domain",
  "limit": 100,
  "order_by": ["rank,desc"],
  "filters": [["first_seen", ">", "<YYYY-MM-DD>"]]
}]
```

We parse `tasks[0].result[0].items[*]` and emit a `new_backlink` for every
referring domain whose `domain_from_rank` (DR) is `≥ env.BACKLINK_DR_THRESHOLD`
(default 30, configurable via `.env`).

Dedupe key: `sha256(competitor_id : referring_domain)`.

---

## Cost guard wiring

Every poll persists `poll_runs.cost_usd_estimated` in cents. The estimate
is the sum of per-call tarifas from
[src/config/api-costs.ts](../src/config/api-costs.ts):

```
apify     0.05  USD per actor run
zenrows   0.002 USD per scrape
serper    0.001 USD per query
dataforseo 0.05 USD per request
youtube   0     USD (free quota)
```

Phase 6 will read these into the budget guard middleware.

---

## Schema-changed troubleshooting

When a provider quietly changes their response shape:

1. Check `poll_runs.error_message` — if it starts with
   `<channel> live: response item failed schema:`, Zod tells you the exact
   path of the missing/wrong field.
2. Open the corresponding schema at
   [src/pollers/&lt;channel&gt;.ts](../src/pollers/), e.g. `MetaAdItemSchema`,
   `GoogleAdsItemSchema`, `TikTokItemSchema`, etc.
3. Compare to the latest Apify run page (datasets tab) or the provider's
   API docs.
4. Either widen the schema (use `.optional()` / `.nullish()` for the
   moved/renamed field) or update the mapping function — re-run the test
   suite.
