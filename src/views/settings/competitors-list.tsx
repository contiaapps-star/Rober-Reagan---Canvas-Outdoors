import type { FC } from 'hono/jsx';

import { channelChipClass, channelLabel } from '../../lib/channels.js';
import type { CompetitorWithHandles } from '../../services/settings-repo.js';
import { Layout, type FlashMessage } from '../layout.js';

export const TIER_LABELS: Record<string, string> = {
  local_same_size: 'Local',
  mondo_100m: 'Mondo',
  national: 'National',
  inspiration: 'Inspiration',
};

export const CATEGORY_LABELS: Record<string, string> = {
  well: 'Well',
  plumbing: 'Plumbing',
  both: 'Both',
};

export const CompetitorRow: FC<{ competitor: CompetitorWithHandles }> = ({
  competitor,
}) => (
  <tr id={`competitor-row-${competitor.id}`} data-testid={`competitor-row-${competitor.id}`}>
    <td class="fc-table__cell">
      <div class="font-medium text-flowcore-text-primary">{competitor.name}</div>
      <div class="text-[11px] text-flowcore-muted uppercase tracking-wider mt-0.5">
        {TIER_LABELS[competitor.tier] ?? competitor.tier}
      </div>
    </td>
    <td class="fc-table__cell">
      <a
        href={`https://${competitor.domain}`}
        target="_blank"
        rel="noopener noreferrer"
        class="text-flowcore-accent hover:underline"
        data-testid={`competitor-domain-${competitor.id}`}
      >
        {competitor.domain}
      </a>
    </td>
    <td class="fc-table__cell">
      <span class="pill pill-neutral">
        {CATEGORY_LABELS[competitor.category] ?? competitor.category}
      </span>
    </td>
    <td class="fc-table__cell">
      <span class="pill pill-neutral">
        {TIER_LABELS[competitor.tier] ?? competitor.tier}
      </span>
    </td>
    <td class="fc-table__cell">
      <div class="flex flex-wrap gap-1">
        {competitor.handles
          .filter((h) => h.isActive)
          .map((h) => (
            <span class={channelChipClass(h.channel)} title={h.handle ?? ''}>
              {channelLabel(h.channel)}
              {h.handle ? `: ${h.handle}` : ''}
            </span>
          ))}
        {competitor.handles.filter((h) => h.isActive).length === 0 ? (
          <span class="text-flowcore-muted text-xs">— no handles —</span>
        ) : null}
      </div>
    </td>
    <td class="fc-table__cell">
      <span
        class={
          competitor.isActive
            ? 'pill pill-success'
            : 'pill pill-neutral opacity-60'
        }
      >
        {competitor.isActive ? 'Active' : 'Inactive'}
      </span>
    </td>
    <td class="fc-table__cell text-right">
      <div class="inline-flex gap-2">
        <button
          type="button"
          class="btn-ghost"
          hx-get={`/settings/competitors/${competitor.id}/edit`}
          hx-target="#modal-root"
          hx-swap="innerHTML"
        >
          Edit
        </button>
        <button
          type="button"
          class="btn-danger"
          hx-delete={`/settings/competitors/${competitor.id}`}
          hx-target={`#competitor-row-${competitor.id}`}
          hx-swap="outerHTML"
          data-confirm={`Delete competitor "${competitor.name}"?`}
        >
          Delete
        </button>
      </div>
    </td>
  </tr>
);

export const CompetitorsListView: FC<{
  competitors: CompetitorWithHandles[];
  flash?: FlashMessage | null;
}> = ({ competitors, flash }) => {
  const total = competitors.length;
  const active = competitors.filter((c) => c.isActive).length;
  const local = competitors.filter((c) => c.tier === 'local_same_size').length;
  const national = competitors.filter((c) => c.tier === 'national').length;

  return (
    <Layout title="Competitors" active="settings.competitors" flash={flash}>
      <header class="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 class="text-2xl font-semibold text-flowcore-text-primary">
            Competitors
          </h1>
          <p class="text-flowcore-text-secondary text-sm mt-1">
            Track marketing activity for the competitors below.
          </p>
        </div>
        <button
          type="button"
          class="btn-primary"
          hx-get="/settings/competitors/new"
          hx-target="#modal-root"
          hx-swap="innerHTML"
          data-testid="add-competitor"
        >
          + Add Competitor
        </button>
      </header>

      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <KpiTile label="Total Competitors" value={total} />
        <KpiTile label="Active" value={active} />
        <KpiTile label="Local Same-Size" value={local} />
        <KpiTile label="National" value={national} />
      </div>

      <div class="table-flowcore-wrapper">
        <table class="table-flowcore" data-testid="competitors-table">
          <thead>
            <tr>
              <th class="fc-table__head">Name</th>
              <th class="fc-table__head">Domain</th>
              <th class="fc-table__head">Category</th>
              <th class="fc-table__head">Tier</th>
              <th class="fc-table__head">Channels</th>
              <th class="fc-table__head">Status</th>
              <th class="fc-table__head text-right">Actions</th>
            </tr>
          </thead>
          <tbody id="competitors-tbody" data-testid="competitors-tbody">
            {competitors.length === 0 ? (
              <tr>
                <td colspan={7} class="fc-table__cell text-center text-flowcore-muted">
                  No competitors yet — click + Add Competitor to start.
                </td>
              </tr>
            ) : (
              competitors.map((c) => <CompetitorRow competitor={c} />)
            )}
          </tbody>
        </table>
      </div>
    </Layout>
  );
};

const KpiTile: FC<{ label: string; value: number }> = ({ label, value }) => (
  <div class="fc-kpi-tile">
    <span class="fc-kpi-tile__value">{value}</span>
    <span class="fc-kpi-tile__label">{label}</span>
  </div>
);
