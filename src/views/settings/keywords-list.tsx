import type { FC } from 'hono/jsx';

import type { TargetKeyword } from '../../db/schema.js';
import { Layout, type FlashMessage } from '../layout.js';

const CATEGORY_LABELS: Record<string, string> = {
  well: 'Well',
  plumbing: 'Plumbing',
  both: 'Both',
};

export const KeywordRow: FC<{ keyword: TargetKeyword }> = ({ keyword }) => (
  <tr id={`keyword-row-${keyword.id}`} data-testid={`keyword-row-${keyword.id}`}>
    <td class="fc-table__cell font-medium text-flowcore-text-primary">
      {keyword.keyword}
    </td>
    <td class="fc-table__cell">
      <span class="pill pill-neutral">
        {CATEGORY_LABELS[keyword.category] ?? keyword.category}
      </span>
    </td>
    <td class="fc-table__cell">
      <span
        class={
          keyword.isActive
            ? 'pill pill-success'
            : 'pill pill-neutral opacity-60'
        }
      >
        {keyword.isActive ? 'Active' : 'Inactive'}
      </span>
    </td>
    <td class="fc-table__cell text-right">
      <div class="inline-flex gap-2">
        <button
          type="button"
          class="btn-ghost"
          hx-get={`/settings/keywords/${keyword.id}/edit`}
          hx-target="#modal-root"
          hx-swap="innerHTML"
        >
          Edit
        </button>
        <button
          type="button"
          class="btn-danger"
          hx-delete={`/settings/keywords/${keyword.id}`}
          hx-target={`#keyword-row-${keyword.id}`}
          hx-swap="outerHTML"
          data-confirm={`Delete keyword "${keyword.keyword}"?`}
        >
          Delete
        </button>
      </div>
    </td>
  </tr>
);

export const KeywordsListView: FC<{
  keywords: TargetKeyword[];
  flash?: FlashMessage | null;
}> = ({ keywords, flash }) => (
  <Layout title="Target Keywords" active="settings.keywords" flash={flash}>
    <header class="mb-6 flex items-end justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold text-flowcore-text-primary">
          Target Keywords
        </h1>
        <p class="text-flowcore-text-secondary text-sm mt-1">
          Keywords tracked by the SEO ranking poller.
        </p>
      </div>
      <button
        type="button"
        class="btn-primary"
        hx-get="/settings/keywords/new"
        hx-target="#modal-root"
        hx-swap="innerHTML"
        data-testid="add-keyword"
      >
        + Add Keyword
      </button>
    </header>

    <div class="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
      <KpiTile label="Total Keywords" value={keywords.length} />
      <KpiTile
        label="Active"
        value={keywords.filter((k) => k.isActive).length}
      />
      <KpiTile
        label="Inactive"
        value={keywords.filter((k) => !k.isActive).length}
      />
    </div>

    <div class="table-flowcore-wrapper">
      <table class="table-flowcore" data-testid="keywords-table">
        <thead>
          <tr>
            <th class="fc-table__head">Keyword</th>
            <th class="fc-table__head">Category</th>
            <th class="fc-table__head">Status</th>
            <th class="fc-table__head text-right">Actions</th>
          </tr>
        </thead>
        <tbody id="keywords-tbody" data-testid="keywords-tbody">
          {keywords.length === 0 ? (
            <tr>
              <td colspan={4} class="fc-table__cell text-center text-flowcore-muted">
                No keywords yet.
              </td>
            </tr>
          ) : (
            keywords.map((k) => <KeywordRow keyword={k} />)
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
