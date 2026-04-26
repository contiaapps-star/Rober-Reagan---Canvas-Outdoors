import type { FC } from 'hono/jsx';

import type { ActiveCompetitor } from '../../db/queries.js';
import type { DateRange, FilterState } from '../../lib/feed-filters.js';

const RANGE_OPTIONS: { value: DateRange; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7 Days' },
  { value: '30d', label: 'Last 30 Days' },
  { value: 'all', label: 'All Time' },
];

const CHANNEL_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'All Channels' },
  { value: 'website', label: 'Website' },
  { value: 'meta', label: 'Meta' },
  { value: 'google', label: 'Google' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'seo', label: 'SEO' },
];

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'All Statuses' },
  { value: 'new', label: 'New' },
  { value: 'useful', label: 'Useful' },
  { value: 'skip', label: 'Skip' },
];

const FEED_HX_TARGET = '#activity-feed';

export const FILTERS_BAR_ID = 'filters';

export const FiltersBar: FC<{
  state: FilterState;
  competitors: ActiveCompetitor[];
  oob?: boolean;
}> = ({ state, competitors, oob }) => (
  <section
    id={FILTERS_BAR_ID}
    class="mb-4 flex flex-col gap-3"
    data-testid="filters-bar"
    {...(oob ? { 'hx-swap-oob': 'outerHTML' } : {})}
  >
    <ChipGroup
      testId="range-chips"
      label="Range"
      name="range"
      options={RANGE_OPTIONS.map((o) => ({
        value: o.value,
        label: o.label,
      }))}
      currentValue={state.range}
    />
    <ChipGroup
      testId="channel-chips"
      label="Channel"
      name="channel"
      options={CHANNEL_OPTIONS}
      currentValue={state.channel}
    />
    <ChipGroup
      testId="status-chips"
      label="Status"
      name="status"
      options={STATUS_OPTIONS}
      currentValue={state.status}
    />
    <CompetitorSelect
      currentId={state.competitorId}
      competitors={competitors}
    />
    <input type="hidden" name="sort" value={state.sort} id="filter-sort" />
  </section>
);

const ChipGroup: FC<{
  testId: string;
  label: string;
  name: string;
  options: { value: string; label: string }[];
  currentValue: string;
}> = ({ testId, label, name, options, currentValue }) => (
  <div class="flex items-center gap-2 flex-wrap" data-testid={testId}>
    <span class="text-flowcore-text-secondary text-xs uppercase tracking-wider w-20">
      {label}
    </span>
    {options.map((o) => (
      <button
        type="button"
        class={
          o.value === currentValue
            ? 'fc-chip fc-chip--active'
            : 'fc-chip'
        }
        data-filter-name={name}
        data-filter-value={o.value}
        data-active={o.value === currentValue ? 'true' : 'false'}
        hx-get="/activities/feed"
        hx-include="closest #filters"
        hx-target={FEED_HX_TARGET}
        hx-swap="innerHTML"
        hx-push-url="true"
        hx-vals={`js:{${name}:'${o.value}'}`}
      >
        {o.label}
      </button>
    ))}
    <input type="hidden" name={name} value={currentValue} data-filter-input={name} />
  </div>
);

const CompetitorSelect: FC<{
  currentId: string;
  competitors: ActiveCompetitor[];
}> = ({ currentId, competitors }) => (
  <div class="flex items-center gap-2" data-testid="competitor-select">
    <span class="text-flowcore-text-secondary text-xs uppercase tracking-wider w-20">
      Competitor
    </span>
    <select
      name="competitor_id"
      class="fc-input max-w-xs"
      data-testid="competitor-select-input"
      hx-get="/activities/feed"
      hx-include="closest #filters"
      hx-target={FEED_HX_TARGET}
      hx-swap="innerHTML"
      hx-push-url="true"
      hx-trigger="change"
    >
      <option value="" selected={currentId === ''}>
        All competitors
      </option>
      {competitors.map((c) => (
        <option value={c.id} selected={c.id === currentId}>
          {c.name}
        </option>
      ))}
    </select>
  </div>
);
