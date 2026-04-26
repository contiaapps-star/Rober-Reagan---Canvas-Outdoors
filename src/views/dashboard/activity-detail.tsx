import type { FC } from 'hono/jsx';

import type { ActivityDetailRow } from '../../db/queries.js';
import { channelChipClass, channelLabel } from '../../lib/channels.js';
import { Layout } from '../layout.js';

const TIER_LABELS: Record<string, string> = {
  local_same_size: 'Local',
  mondo_100m: 'Mondo',
  national: 'National',
  inspiration: 'Inspiration',
};

const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  new_blog_post: 'Blog post',
  new_landing_page: 'Landing page',
  new_ad_creative: 'Ad creative',
  new_video: 'Video',
  rank_change: 'Rank change',
  new_backlink: 'Backlink',
};

// Keys that must NEVER appear in the rendered payload — credentials, tokens
// and other sensitive material that pollers may have stuffed into rawPayload.
const SENSITIVE_KEY_PATTERNS: RegExp[] = [
  /api[_-]?key/i,
  /token/i,
  /secret/i,
  /password/i,
  /credential/i,
  /authorization/i,
  /bearer/i,
];

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERNS.some((re) => re.test(key));
}

export function sanitizePayload(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((v) => sanitizePayload(v));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (isSensitiveKey(k)) {
        out[k] = '[REDACTED]';
      } else {
        out[k] = sanitizePayload(v);
      }
    }
    return out;
  }
  return value;
}

function payloadString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function payloadNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function payloadGet(payload: Record<string, unknown>, key: string): unknown {
  return payload[key];
}

const Preview: FC<{ row: ActivityDetailRow; payload: Record<string, unknown> }> = ({
  row,
  payload,
}) => {
  switch (row.channel) {
    case 'meta_facebook':
    case 'meta_instagram':
    case 'google_ads':
      return <AdPreview row={row} payload={payload} />;
    case 'tiktok':
    case 'youtube':
      return <VideoPreview row={row} payload={payload} />;
    case 'website':
      return <WebsitePreview row={row} payload={payload} />;
    case 'seo_ranking':
      return <SeoRankingPreview row={row} payload={payload} />;
    case 'seo_backlink':
      return <SeoBacklinkPreview row={row} payload={payload} />;
    default:
      return <p class="text-flowcore-text-secondary text-sm">No preview available.</p>;
  }
};

const AdPreview: FC<{
  row: ActivityDetailRow;
  payload: Record<string, unknown>;
}> = ({ row, payload }) => {
  const imageUrl = payloadString(payloadGet(payload, 'image_url'));
  const headline = payloadString(payloadGet(payload, 'headline'));
  const cta = payloadString(payloadGet(payload, 'cta'));
  const landingUrl = payloadString(payloadGet(payload, 'landing_url'));
  const keyword = payloadString(payloadGet(payload, 'keyword_targeted'));
  const bid = payloadNumber(payloadGet(payload, 'bid_estimate_usd'));
  return (
    <div class="space-y-3" data-testid="preview-ad">
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={headline || 'Ad creative'}
          class="rounded border border-flowcore-border max-w-full"
        />
      ) : null}
      {headline ? (
        <h3 class="text-flowcore-text-primary font-semibold text-base">
          {headline}
        </h3>
      ) : null}
      {keyword ? (
        <p class="text-sm text-flowcore-text-secondary">
          Keyword targeted: <span class="font-medium">{keyword}</span>
        </p>
      ) : null}
      {bid !== null ? (
        <p class="text-sm text-flowcore-text-secondary">
          Bid estimate: ${bid.toFixed(2)}
        </p>
      ) : null}
      {cta ? <p class="text-sm">CTA: {cta}</p> : null}
      {landingUrl ? (
        <a
          class="text-flowcore-accent hover:underline text-sm"
          href={landingUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open landing page ↗
        </a>
      ) : (
        <a
          class="text-flowcore-accent hover:underline text-sm"
          href={row.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open source ↗
        </a>
      )}
    </div>
  );
};

const VideoPreview: FC<{
  row: ActivityDetailRow;
  payload: Record<string, unknown>;
}> = ({ row, payload }) => {
  const thumb =
    payloadString(payloadGet(payload, 'thumbnail_url')) ||
    payloadString(payloadGet(payload, 'thumbnail'));
  const caption =
    payloadString(payloadGet(payload, 'caption')) ||
    payloadString(payloadGet(payload, 'title'));
  const views =
    payloadNumber(payloadGet(payload, 'view_count')) ??
    payloadNumber(payloadGet(payload, 'views')) ??
    payloadNumber(payloadGet(payload, 'likes'));
  const duration = payloadNumber(payloadGet(payload, 'duration_s'));
  return (
    <div class="space-y-3" data-testid="preview-video">
      {thumb ? (
        <img
          src={thumb}
          alt={caption || 'Video thumbnail'}
          class="rounded border border-flowcore-border max-w-full"
        />
      ) : null}
      {caption ? (
        <p class="text-flowcore-text-primary text-sm font-medium">{caption}</p>
      ) : null}
      <div class="text-xs text-flowcore-text-secondary space-y-1">
        {duration !== null ? <p>Duration: {duration}s</p> : null}
        {views !== null ? (
          <p>Engagement: {Number(views).toLocaleString('en-US')}</p>
        ) : null}
      </div>
      <a
        class="text-flowcore-accent hover:underline text-sm"
        href={row.sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
      >
        Open video ↗
      </a>
    </div>
  );
};

const WebsitePreview: FC<{
  row: ActivityDetailRow;
  payload: Record<string, unknown>;
}> = ({ row, payload }) => {
  const title = payloadString(payloadGet(payload, 'title'));
  const firstParagraph =
    payloadString(payloadGet(payload, 'first_paragraph')) ||
    payloadString(payloadGet(payload, 'excerpt'));
  return (
    <div class="space-y-3" data-testid="preview-website">
      {title ? (
        <h3 class="text-flowcore-text-primary font-semibold text-base">{title}</h3>
      ) : null}
      {firstParagraph ? (
        <p class="text-flowcore-text-secondary text-sm leading-relaxed">
          {firstParagraph}
        </p>
      ) : null}
      <a
        class="btn-ghost"
        href={row.sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
      >
        Open page ↗
      </a>
    </div>
  );
};

const SeoRankingPreview: FC<{
  row: ActivityDetailRow;
  payload: Record<string, unknown>;
}> = ({ row, payload }) => {
  const keyword = payloadString(payloadGet(payload, 'keyword'));
  const previous = payloadNumber(payloadGet(payload, 'previous_position'));
  const next = payloadNumber(payloadGet(payload, 'new_position'));
  const safePrev = previous ?? 0;
  const safeNext = next ?? 0;
  // CSS-only bar chart: max bar = 50.
  const barW = (n: number) => `${Math.min(100, n * 2)}%`;
  return (
    <div class="space-y-3" data-testid="preview-seo-ranking">
      <p class="text-flowcore-text-primary font-semibold">{keyword || 'Keyword'}</p>
      <div class="space-y-2 text-xs text-flowcore-text-secondary">
        <div>
          <div class="flex justify-between">
            <span>Old position</span>
            <span>{safePrev}</span>
          </div>
          <div
            class="h-3 bg-flowcore-bg rounded mt-1 overflow-hidden"
            data-testid="bar-old"
          >
            <div
              class="h-full bg-flowcore-muted"
              style={`width:${barW(safePrev)}`}
            ></div>
          </div>
        </div>
        <div>
          <div class="flex justify-between">
            <span>New position</span>
            <span>{safeNext}</span>
          </div>
          <div
            class="h-3 bg-flowcore-bg rounded mt-1 overflow-hidden"
            data-testid="bar-new"
          >
            <div
              class="h-full bg-flowcore-accent"
              style={`width:${barW(safeNext)}`}
            ></div>
          </div>
        </div>
      </div>
      <a
        class="text-flowcore-accent hover:underline text-sm"
        href={row.sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
      >
        Open report ↗
      </a>
    </div>
  );
};

const SeoBacklinkPreview: FC<{
  row: ActivityDetailRow;
  payload: Record<string, unknown>;
}> = ({ row, payload }) => {
  const referring = payloadString(payloadGet(payload, 'referring_domain'));
  const dr = payloadNumber(payloadGet(payload, 'domain_rating'));
  const anchor = payloadString(payloadGet(payload, 'anchor_text'));
  return (
    <div class="space-y-2 text-sm" data-testid="preview-seo-backlink">
      <p class="text-flowcore-text-primary font-medium">{referring}</p>
      {dr !== null ? <p>Domain Rating: {dr}</p> : null}
      {anchor ? <p>Anchor: "{anchor}"</p> : null}
      <a
        class="text-flowcore-accent hover:underline"
        href={row.sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
      >
        Open backlink ↗
      </a>
    </div>
  );
};

const StatusActions: FC<{ row: ActivityDetailRow }> = ({ row }) => (
  <form
    method="post"
    action={`/activities/${row.id}/status?return_to=detail`}
    class="flex gap-3 mt-6"
    data-testid="status-actions"
  >
    <button
      type="submit"
      name="status"
      value="useful"
      class="btn-useful"
      data-testid="detail-btn-useful"
    >
      ✓ Mark Useful
    </button>
    <button
      type="submit"
      name="status"
      value="skip"
      class="btn-skip"
      data-testid="detail-btn-skip"
    >
      ✕ Skip
    </button>
  </form>
);

export const ActivityDetailView: FC<{ row: ActivityDetailRow }> = ({ row }) => {
  const sanitized = sanitizePayload(row.rawPayload) as Record<string, unknown>;
  const tier = row.competitor?.tier
    ? TIER_LABELS[row.competitor.tier] ?? row.competitor.tier
    : '—';
  const detected = new Date(row.detectedAt * 1000).toISOString();
  const published = row.publishedAt
    ? new Date(row.publishedAt * 1000).toISOString()
    : 'unknown';
  const summary = row.summaryText ?? '';
  const themes = row.themesExtracted.length ? row.themesExtracted.join(', ') : '—';
  const statusChangedAt = row.statusChangedAt
    ? new Date(row.statusChangedAt * 1000).toISOString()
    : null;
  const activityTypeLabel =
    ACTIVITY_TYPE_LABELS[row.activityType] ?? row.activityType;

  return (
    <Layout title="Activity Detail" active="dashboard">
      <header class="mb-6">
        <a
          href="/"
          class="text-flowcore-text-secondary text-xs hover:text-flowcore-text-primary"
          data-testid="back-link"
        >
          ← Back to feed
        </a>
        <h1
          class="text-2xl font-semibold text-flowcore-text-primary mt-2"
          data-testid="detail-title"
        >
          Activity Detail
        </h1>
      </header>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section
          class="space-y-4 fc-panel p-5"
          data-testid="detail-metadata"
          aria-labelledby="metadata-h"
        >
          <h2
            id="metadata-h"
            class="text-flowcore-text-primary font-semibold text-base"
          >
            Metadata
          </h2>
          <dl class="grid grid-cols-2 gap-y-2 text-sm">
            <dt class="text-flowcore-text-secondary">Competitor</dt>
            <dd
              class="text-flowcore-text-primary font-medium"
              data-testid="meta-competitor"
            >
              {row.competitor?.name ?? '—'} ({tier})
            </dd>
            <dt class="text-flowcore-text-secondary">Channel</dt>
            <dd data-testid="meta-channel">
              <span class={channelChipClass(row.channel)}>
                {channelLabel(row.channel)}
              </span>
            </dd>
            <dt class="text-flowcore-text-secondary">Activity</dt>
            <dd data-testid="meta-activity-type">{activityTypeLabel}</dd>
            <dt class="text-flowcore-text-secondary">Detected</dt>
            <dd data-testid="meta-detected">{detected}</dd>
            <dt class="text-flowcore-text-secondary">Published</dt>
            <dd data-testid="meta-published">{published}</dd>
            <dt class="text-flowcore-text-secondary">Status</dt>
            <dd data-testid="meta-status">{row.status.toUpperCase()}</dd>
            <dt class="text-flowcore-text-secondary">Themes</dt>
            <dd data-testid="meta-themes">{themes}</dd>
            <dt class="text-flowcore-text-secondary">Source</dt>
            <dd>
              <a
                href={row.sourceUrl}
                class="text-flowcore-accent hover:underline break-all"
                target="_blank"
                rel="noopener noreferrer"
                data-testid="meta-source"
              >
                {row.sourceUrl}
              </a>
            </dd>
            <dt class="text-flowcore-text-secondary">Dedupe hash</dt>
            <dd
              class="text-flowcore-muted text-xs break-all"
              data-testid="meta-dedupe"
            >
              {row.dedupeHash}
            </dd>
          </dl>

          <div>
            <h3 class="text-flowcore-text-primary font-semibold text-sm mb-2 mt-4">
              Raw payload
            </h3>
            <pre
              class="fc-pre text-xs overflow-x-auto p-3 rounded bg-flowcore-bg border border-flowcore-border"
              data-testid="raw-payload"
            >
              {JSON.stringify(sanitized, null, 2)}
            </pre>
          </div>
        </section>

        <section class="space-y-4">
          <div
            class="fc-panel p-5 border-l-4 border-flowcore-accent"
            data-testid="why-this-matters"
          >
            <h2 class="text-flowcore-text-primary font-semibold text-base mb-2">
              Why this matters
            </h2>
            <p
              class="text-flowcore-text-primary text-sm leading-relaxed"
              data-testid="summary-body"
            >
              {summary || 'Summary pending — will arrive on next poll.'}
            </p>
          </div>

          <div class="fc-panel p-5" data-testid="detail-preview">
            <h2 class="text-flowcore-text-primary font-semibold text-base mb-3">
              Preview
            </h2>
            <Preview row={row} payload={sanitized} />
          </div>

          <StatusActions row={row} />

          <div class="fc-panel p-5" data-testid="audit-log">
            <h2 class="text-flowcore-text-primary font-semibold text-base mb-2">
              Audit log
            </h2>
            {row.statusChangedBy ? (
              <p class="text-sm text-flowcore-text-secondary">
                <span class="font-medium text-flowcore-text-primary">
                  {row.statusChangedBy}
                </span>{' '}
                changed status to{' '}
                <span class="font-medium text-flowcore-text-primary">
                  {row.status.toUpperCase()}
                </span>{' '}
                at <time>{statusChangedAt}</time>
              </p>
            ) : (
              <p class="text-sm text-flowcore-muted italic">
                No status changes yet.
              </p>
            )}
          </div>
        </section>
      </div>
    </Layout>
  );
};
