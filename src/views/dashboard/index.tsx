import type { FC } from 'hono/jsx';

import type {
  ActiveCompetitor,
  DegradedCompetitor,
  KpiCounts,
  RecentActivityRow,
} from '../../db/queries.js';
import type { FilterState } from '../../lib/feed-filters.js';
import { Layout, type FlashMessage } from '../layout.js';
import { ActivityFeedRegion } from './feed.js';
import { FiltersBar } from './filters.js';
import { KpiRow } from './kpi-row.js';

export const DashboardView: FC<{
  counts: KpiCounts;
  rows: RecentActivityRow[];
  state: FilterState;
  competitors: ActiveCompetitor[];
  nextCursor: string | null;
  hasMore: boolean;
  lastUpdatedIso: string;
  nowUnix?: number;
  flash?: FlashMessage | null;
  degraded?: DegradedCompetitor[];
}> = ({
  counts,
  rows,
  state,
  competitors,
  nextCursor,
  hasMore,
  lastUpdatedIso,
  nowUnix,
  flash,
  degraded = [],
}) => (
  <Layout title="Intelligence Board" active="dashboard" flash={flash}>
    {degraded.length > 0 ? <DegradedBanner degraded={degraded} /> : null}
    <header class="mb-6 flex items-end justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold text-flowcore-text-primary">
          Intelligence Board
        </h1>
        <p
          class="text-flowcore-text-secondary text-sm mt-1"
          data-testid="last-updated"
        >
          Last updated: {lastUpdatedIso}
        </p>
      </div>
    </header>
    <KpiRow counts={counts} />
    <FiltersBar state={state} competitors={competitors} />
    <div id="activity-feed" data-testid="activity-feed">
      <ActivityFeedRegion
        rows={rows}
        state={state}
        nextCursor={nextCursor}
        hasMore={hasMore}
        isAppend={false}
        nowUnix={nowUnix}
      />
    </div>
  </Layout>
);

// degraded_channels entries shaped as "channel" → degraded ; or "channel:broken"
// → broken (after N≥7 consecutive failures). The banner switches color based
// on whether any channel is broken.
const DegradedBanner: FC<{ degraded: import('../../db/queries.js').DegradedCompetitor[] }> = ({
  degraded,
}) => {
  const isBroken = degraded.some((d) =>
    d.channels.some((c) => c.endsWith(':broken')),
  );
  const labels = degraded
    .map(
      (d) =>
        `${d.name} (${d.channels
          .map((c) => c.replace(':broken', ''))
          .join(', ')})`,
    )
    .join('; ');
  const cls = isBroken
    ? 'fc-banner fc-banner--broken'
    : 'fc-banner fc-banner--degraded';
  return (
    <a
      href="/health/channels"
      class={cls}
      data-testid={isBroken ? 'banner-broken' : 'banner-degraded'}
      role="status"
    >
      <strong>
        {isBroken ? 'Broken channels:' : 'Degraded channels:'}
      </strong>{' '}
      {labels} — view health →
    </a>
  );
};
