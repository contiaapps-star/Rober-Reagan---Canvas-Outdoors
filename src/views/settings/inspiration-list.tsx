import type { FC } from 'hono/jsx';

import type { InspirationSource } from '../../db/schema.js';
import { channelChipClass, channelLabel } from '../../lib/channels.js';
import { Layout, type FlashMessage } from '../layout.js';

const KIND_LABELS: Record<string, string> = {
  account: 'Account',
  keyword_search: 'Keyword Search',
};

export const InspirationRow: FC<{ source: InspirationSource }> = ({ source }) => (
  <tr id={`inspiration-row-${source.id}`} data-testid={`inspiration-row-${source.id}`}>
    <td class="fc-table__cell font-medium text-flowcore-text-primary">
      {source.value}
    </td>
    <td class="fc-table__cell">
      <span class="pill pill-neutral">
        {KIND_LABELS[source.kind] ?? source.kind}
      </span>
    </td>
    <td class="fc-table__cell">
      <span class={channelChipClass(source.channel)}>
        {channelLabel(source.channel)}
      </span>
    </td>
    <td class="fc-table__cell">
      <span
        class={
          source.isActive
            ? 'pill pill-success'
            : 'pill pill-neutral opacity-60'
        }
      >
        {source.isActive ? 'Active' : 'Inactive'}
      </span>
    </td>
    <td class="fc-table__cell text-right">
      <div class="inline-flex gap-2">
        <button
          type="button"
          class="btn-ghost"
          hx-get={`/settings/inspiration/${source.id}/edit`}
          hx-target="#modal-root"
          hx-swap="innerHTML"
        >
          Edit
        </button>
        <button
          type="button"
          class="btn-danger"
          hx-delete={`/settings/inspiration/${source.id}`}
          hx-target={`#inspiration-row-${source.id}`}
          hx-swap="outerHTML"
          data-confirm={`Delete inspiration source "${source.value}"?`}
        >
          Delete
        </button>
      </div>
    </td>
  </tr>
);

export const InspirationListView: FC<{
  sources: InspirationSource[];
  flash?: FlashMessage | null;
}> = ({ sources, flash }) => (
  <Layout title="Inspiration Sources" active="settings.inspiration" flash={flash}>
    <header class="mb-6 flex items-end justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold text-flowcore-text-primary">
          Inspiration Sources
        </h1>
        <p class="text-flowcore-text-secondary text-sm mt-1">
          Out-of-vertical accounts and keyword searches that inspire content.
        </p>
      </div>
      <button
        type="button"
        class="btn-primary"
        hx-get="/settings/inspiration/new"
        hx-target="#modal-root"
        hx-swap="innerHTML"
        data-testid="add-inspiration"
      >
        + Add Source
      </button>
    </header>

    <div class="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
      <KpiTile label="Total Sources" value={sources.length} />
      <KpiTile
        label="Accounts"
        value={sources.filter((s) => s.kind === 'account').length}
      />
      <KpiTile
        label="Keyword Searches"
        value={sources.filter((s) => s.kind === 'keyword_search').length}
      />
    </div>

    <div class="table-flowcore-wrapper">
      <table class="table-flowcore" data-testid="inspiration-table">
        <thead>
          <tr>
            <th class="fc-table__head">Value</th>
            <th class="fc-table__head">Kind</th>
            <th class="fc-table__head">Channel</th>
            <th class="fc-table__head">Status</th>
            <th class="fc-table__head text-right">Actions</th>
          </tr>
        </thead>
        <tbody id="inspiration-tbody" data-testid="inspiration-tbody">
          {sources.length === 0 ? (
            <tr>
              <td colspan={5} class="fc-table__cell text-center text-flowcore-muted">
                No inspiration sources yet.
              </td>
            </tr>
          ) : (
            sources.map((s) => <InspirationRow source={s} />)
          )}
        </tbody>
      </table>
    </div>
  </Layout>
);

const KpiTile: FC<{ label: string; value: number }> = ({ label, value }) => (
  <div class="fc-kpi-tile">
    <span class="fc-kpi-tile__value">{value}</span>
    <span class="fc-kpi-tile__label">{label}</span>
  </div>
);
