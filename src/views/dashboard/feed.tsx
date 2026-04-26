import type { FC } from 'hono/jsx';
import { Fragment } from 'hono/jsx';
import { raw } from 'hono/html';

import type { RecentActivityRow } from '../../db/queries.js';
import type { FilterState } from '../../lib/feed-filters.js';
import { ActivityRow } from './activity-row.js';

export const ACTIVITY_TABLE_ID = 'activity-feed-tbody';
export const FEED_REGION_ID = 'activity-feed';

export const ActivityFeedRegion: FC<{
  rows: RecentActivityRow[];
  state: FilterState;
  nextCursor: string | null;
  hasMore: boolean;
  isAppend: boolean;
  nowUnix?: number;
}> = ({ rows, state, nextCursor, hasMore, isAppend, nowUnix }) => {
  if (isAppend) {
    return (
      <AppendFragment
        rows={rows}
        state={state}
        nextCursor={nextCursor}
        hasMore={hasMore}
        nowUnix={nowUnix}
      />
    );
  }
  return (
    <FullFeedTable
      rows={rows}
      state={state}
      nextCursor={nextCursor}
      hasMore={hasMore}
      nowUnix={nowUnix}
    />
  );
};

const FullFeedTable: FC<{
  rows: RecentActivityRow[];
  state: FilterState;
  nextCursor: string | null;
  hasMore: boolean;
  nowUnix?: number;
}> = ({ rows, state, nextCursor, hasMore, nowUnix }) => {
  if (rows.length === 0) {
    return <EmptyState />;
  }

  return (
    <div class="table-flowcore-wrapper" data-testid="feed-table-wrapper">
      <table class="table-flowcore" data-testid="activity-table">
        <thead>
          <tr>
            <th class="fc-table__head">Competitor</th>
            <th class="fc-table__head">Channel</th>
            <th class="fc-table__head">Activity</th>
            <th class="fc-table__head">
              <SortableHeader
                label="Detected"
                state={state}
                column="detected_at"
              />
            </th>
            <th class="fc-table__head">Source</th>
            <th class="fc-table__head">Status</th>
            <th class="fc-table__head text-right">Actions</th>
          </tr>
        </thead>
        <tbody id="activity-feed-tbody" data-testid="activity-feed-tbody">
          {rows.map((r) => (
            <ActivityRow row={r} nowUnix={nowUnix} />
          ))}
        </tbody>
      </table>
      <LoadMoreOrEnd
        nextCursor={nextCursor}
        hasMore={hasMore}
        state={state}
      />
    </div>
  );
};

const AppendFragment: FC<{
  rows: RecentActivityRow[];
  state: FilterState;
  nextCursor: string | null;
  hasMore: boolean;
  nowUnix?: number;
}> = ({ rows, state, nextCursor, hasMore, nowUnix }) => (
  <Fragment>
    {rows.map((r) => (
      <ActivityRow row={r} nowUnix={nowUnix} />
    ))}
    <LoadMoreOrEnd
      nextCursor={nextCursor}
      hasMore={hasMore}
      state={state}
    />
  </Fragment>
);

const SortableHeader: FC<{
  label: string;
  column: 'detected_at';
  state: FilterState;
}> = ({ label, state }) => {
  const nextSort = state.sort === 'desc' ? 'asc' : 'desc';
  const arrow = state.sort === 'desc' ? '↓' : '↑';
  return (
    <button
      type="button"
      class="fc-sort-header"
      data-testid="sort-detected"
      data-current-sort={state.sort}
      hx-get="/activities/feed"
      hx-include="closest #filters"
      hx-target="#activity-feed"
      hx-swap="innerHTML"
      hx-push-url="true"
      hx-vals={`{"sort":"${nextSort}"}`}
    >
      {label} <span aria-hidden="true">{arrow}</span>
    </button>
  );
};

const LoadMoreOrEnd: FC<{
  nextCursor: string | null;
  hasMore: boolean;
  state: FilterState;
}> = ({ nextCursor, hasMore, state }) => {
  if (!hasMore || !nextCursor) {
    return (
      <div
        class="px-4 py-4 text-center text-flowcore-muted text-xs"
        data-testid="feed-end"
      >
        — end of feed —
        {raw('<!-- end -->')}
      </div>
    );
  }
  return (
    <div
      class="px-4 py-4 text-center"
      data-testid="feed-load-more-wrapper"
      id="feed-load-more"
    >
      <button
        type="button"
        class="btn-ghost"
        data-testid="load-more"
        hx-get={buildLoadMoreUrl(nextCursor, state)}
        hx-target="#activity-feed-tbody"
        hx-swap="beforeend"
        hx-select="tbody#activity-feed-tbody > tr, [data-testid='feed-end'], [data-testid='feed-load-more-wrapper']"
      >
        Load more
      </button>
    </div>
  );
};

function buildLoadMoreUrl(cursor: string, state: FilterState): string {
  const params = new URLSearchParams();
  params.set('cursor', cursor);
  params.set('append', '1');
  if (state.channel) params.set('channel', state.channel);
  if (state.status) params.set('status', state.status);
  if (state.competitorId) params.set('competitor_id', state.competitorId);
  if (state.range) params.set('range', state.range);
  if (state.sort) params.set('sort', state.sort);
  return `/activities/feed?${params.toString()}`;
}

const EmptyState: FC = () => (
  <div
    class="fc-empty-state"
    data-testid="feed-empty"
    role="status"
  >
    <svg
      width="64"
      height="64"
      viewBox="0 0 64 64"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      class="text-flowcore-muted"
    >
      <circle cx="28" cy="28" r="14" />
      <line x1="38" y1="38" x2="52" y2="52" />
    </svg>
    <h2 class="text-flowcore-text-primary text-base font-medium mt-3">
      No activities match your filters
    </h2>
    <p class="text-flowcore-text-secondary text-sm mt-1">
      Try widening the date range or removing the channel filter.
    </p>
    <button
      type="button"
      class="btn-ghost mt-4"
      data-testid="reset-filters"
      hx-get="/activities/feed"
      hx-target="#activity-feed"
      hx-swap="innerHTML"
      hx-push-url="true"
      hx-vals={`{"channel":"","status":"","competitor_id":"","range":"all","sort":"desc"}`}
    >
      Reset filters
    </button>
  </div>
);
