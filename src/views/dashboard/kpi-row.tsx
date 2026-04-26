import type { FC } from 'hono/jsx';

import type { KpiCounts } from '../../db/queries.js';

export const KPI_ROW_ID = 'kpi-row';

export const KpiRow: FC<{ counts: KpiCounts; oob?: boolean }> = ({
  counts,
  oob,
}) => (
  <div
    id={KPI_ROW_ID}
    class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6"
    data-testid="kpi-row"
    {...(oob ? { 'hx-swap-oob': 'outerHTML' } : {})}
  >
    <KpiTile
      testId="kpi-new-today"
      label="New Today"
      value={counts.newToday}
    />
    <KpiTile
      testId="kpi-new-this-week"
      label="New This Week"
      value={counts.newThisWeek}
    />
    <KpiTile
      testId="kpi-marked-useful"
      label="Marked Useful"
      value={counts.markedUseful}
    />
    <KpiTile
      testId="kpi-pending-review"
      label="Pending Review"
      value={counts.pendingReview}
    />
    <KpiTile
      testId="kpi-active-channels"
      label="Active Channels"
      value={counts.activeChannels}
    />
    <KpiTile
      testId="kpi-failed-channels"
      label="Failed Channels"
      value={counts.failedChannels}
      tone={counts.failedChannels > 0 ? 'danger' : 'neutral'}
    />
  </div>
);

export const KpiTile: FC<{
  testId: string;
  label: string;
  value: number;
  tone?: 'neutral' | 'danger';
}> = ({ testId, label, value, tone = 'neutral' }) => {
  const cls =
    tone === 'danger' ? 'fc-kpi-tile fc-kpi-tile--danger' : 'fc-kpi-tile';
  const valueCls =
    tone === 'danger'
      ? 'fc-kpi-tile__value fc-kpi-tile__value--danger'
      : 'fc-kpi-tile__value';
  return (
    <div class={cls} data-testid={testId} data-tone={tone}>
      <span class={valueCls}>{value}</span>
      <span class="fc-kpi-tile__label">{label}</span>
    </div>
  );
};
