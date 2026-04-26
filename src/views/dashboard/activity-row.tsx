import type { FC } from 'hono/jsx';

import type { RecentActivityRow } from '../../db/queries.js';
import { channelChipClass, channelLabel } from '../../lib/channels.js';
import {
  IconCheck,
  IconExternalLink,
  IconEye,
  IconX,
} from '../icons.js';

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

const SUMMARY_PLACEHOLDER_PREFIX = '[Pendiente';

export const StatusPill: FC<{ status: string }> = ({ status }) => {
  const cls =
    status === 'useful'
      ? 'pill pill-success'
      : status === 'skip'
        ? 'pill pill-neutral opacity-70'
        : 'pill pill-warning';
  const label =
    status === 'useful' ? 'USEFUL' : status === 'skip' ? 'SKIP' : 'NEW';
  return (
    <span class={cls} data-testid={`status-pill-${status}`} data-status={status}>
      {label}
    </span>
  );
};

export const ActivityRow: FC<{
  row: RecentActivityRow;
  nowUnix?: number;
}> = ({ row, nowUnix }) => {
  const tierLabel = row.competitor?.tier
    ? TIER_LABELS[row.competitor.tier] ?? row.competitor.tier
    : 'INSPIRATION';
  const summary = row.summaryText ?? '';
  const isPlaceholder = summary.startsWith(SUMMARY_PLACEHOLDER_PREFIX);
  const hasSummary = summary && !isPlaceholder;
  const actor = `Sensor · ${ACTIVITY_TYPE_LABELS[row.activityType] ?? row.activityType}`;
  const detectedRel = relativeTime(row.detectedAt, nowUnix);
  const detectedAbs = formatIso(row.detectedAt);

  return (
    <tr
      id={`activity-row-${row.id}`}
      data-testid={`activity-row-${row.id}`}
      data-channel={row.channel}
      data-status={row.status}
    >
      <td class="fc-table__cell">
        <div class="flex items-center gap-3">
          <span class="fc-avatar" aria-hidden="true">
            {(row.competitor?.name ?? '?').charAt(0).toUpperCase()}
          </span>
          <div>
            <div class="font-medium text-flowcore-text-primary">
              {row.competitor?.name ?? 'Inspiration / Keyword'}
            </div>
            <div class="text-[11px] text-flowcore-muted uppercase tracking-wider mt-0.5">
              {tierLabel}
            </div>
          </div>
        </div>
      </td>
      <td class="fc-table__cell">
        <span class={channelChipClass(row.channel)}>
          {channelLabel(row.channel)}
        </span>
      </td>
      <td class="fc-table__cell">
        <div class="text-flowcore-text-primary text-sm font-medium">
          {actor}
        </div>
        <div
          class={
            hasSummary
              ? 'text-flowcore-text-secondary text-xs mt-1 fc-line-clamp-2'
              : 'text-flowcore-muted italic text-xs mt-1'
          }
          title={
            hasSummary
              ? summary
              : 'Llegará después del próximo poll'
          }
        >
          {hasSummary ? summary : 'Summary pending'}
        </div>
      </td>
      <td class="fc-table__cell whitespace-nowrap">
        <span title={detectedAbs} data-testid="detected-at">
          {detectedRel}
        </span>
      </td>
      <td class="fc-table__cell">
        <a
          class="inline-flex items-center justify-center w-7 h-7 rounded text-flowcore-accent hover:bg-flowcore-surface-hover transition-colors"
          href={row.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open source"
        >
          <IconExternalLink />
        </a>
      </td>
      <td class="fc-table__cell">
        <StatusPill status={row.status} />
      </td>
      <td class="fc-table__cell text-right">
        <div class="inline-flex gap-1">
          <button
            type="button"
            class="btn-useful"
            hx-post={`/activities/${row.id}/status`}
            hx-vals={`{"status":"useful"}`}
            hx-target="closest tr"
            hx-swap="outerHTML"
            data-testid={`btn-useful-${row.id}`}
            aria-label="Mark useful"
          >
            <IconCheck />
            <span>Useful</span>
          </button>
          <button
            type="button"
            class="btn-skip"
            hx-post={`/activities/${row.id}/status`}
            hx-vals={`{"status":"skip"}`}
            hx-target="closest tr"
            hx-swap="outerHTML"
            data-testid={`btn-skip-${row.id}`}
            aria-label="Skip"
          >
            <IconX />
            <span>Skip</span>
          </button>
          <a
            class="btn-ghost"
            href={`/activities/${row.id}`}
            data-testid={`btn-detail-${row.id}`}
            aria-label="Detail"
          >
            <IconEye />
            <span class="sr-only">Detail</span>
          </a>
        </div>
      </td>
    </tr>
  );
};

function relativeTime(unix: number, nowUnix?: number): string {
  const now = nowUnix ?? Math.floor(Date.now() / 1000);
  const diff = now - unix;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 30 * 86400) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(unix * 1000).toISOString().slice(0, 10);
}

function formatIso(unix: number): string {
  return new Date(unix * 1000).toISOString();
}
