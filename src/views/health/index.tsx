import type { FC } from 'hono/jsx';

import type { HealthCard } from '../../db/queries.js';
import { channelChipClass, channelLabel } from '../../lib/channels.js';
import { Layout } from '../layout.js';

export const HealthView: FC<{
  cards: HealthCard[];
  monthlySpendUsd: number;
  monthlyBudgetUsd: number;
  nowUnix: number;
  isAdmin?: boolean;
}> = ({ cards, monthlySpendUsd, monthlyBudgetUsd, nowUnix, isAdmin = false }) => {
  const ratio = monthlyBudgetUsd > 0 ? monthlySpendUsd / monthlyBudgetUsd : 0;
  const pct = Math.min(100, Math.round(ratio * 100));
  const barColor =
    ratio >= 0.8
      ? 'bg-flowcore-danger'
      : ratio >= 0.5
        ? 'bg-flowcore-warning'
        : 'bg-flowcore-success';

  return (
    <Layout title="Channel Health" active="health">
      <header class="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 class="text-2xl font-semibold text-flowcore-text-primary">
            Channel Health
          </h1>
          <p class="text-flowcore-text-secondary text-sm mt-1">
            One card per channel × competitor. Status reflects the last poll.
          </p>
        </div>
        {isAdmin ? (
          <form
            method="post"
            action="/health/run-all"
            data-testid="run-all-form"
          >
            <button type="submit" class="btn-ghost" data-testid="btn-run-all">
              Run all daily polls now
            </button>
          </form>
        ) : null}
      </header>

      <section
        class="fc-panel p-4 mb-6 flex items-center justify-between gap-6"
        data-testid="kpi-spend-tile"
      >
        <div>
          <div class="text-flowcore-muted text-xs uppercase tracking-wider">
            API spend this month
          </div>
          <div class="text-flowcore-text-primary text-xl font-semibold mt-1 tabular-nums">
            <span data-testid="spend-amount">
              ${monthlySpendUsd.toFixed(2)}
            </span>
            <span class="text-flowcore-text-secondary text-sm">
              {' '}of ${monthlyBudgetUsd.toFixed(2)} cap
            </span>
          </div>
        </div>
        <div class="flex-1 max-w-md">
          <div
            class="h-3 bg-flowcore-bg rounded overflow-hidden"
            data-testid="spend-bar-track"
          >
            <div
              class={`h-full ${barColor}`}
              style={`width:${pct}%`}
              data-testid="spend-bar-fill"
              data-percent={pct}
            ></div>
          </div>
          <p class="text-flowcore-text-secondary text-xs mt-1 text-right tabular-nums">
            {pct}% used
          </p>
        </div>
      </section>

      <div
        class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
        data-testid="health-grid"
      >
        {cards.length === 0 ? (
          <div class="text-flowcore-muted text-sm" data-testid="health-empty">
            No channels configured yet.
          </div>
        ) : (
          cards.map((card) => (
            <HealthCardView card={card} nowUnix={nowUnix} isAdmin={isAdmin} />
          ))
        )}
      </div>
    </Layout>
  );
};

const HealthCardView: FC<{ card: HealthCard; nowUnix: number; isAdmin: boolean }> = ({
  card,
  nowUnix,
  isAdmin,
}) => {
  const borderClass =
    card.state === 'green'
      ? 'border-t-flowcore-success'
      : card.state === 'amber'
        ? 'border-t-flowcore-warning'
        : 'border-t-flowcore-danger';
  const statusColor =
    card.state === 'green'
      ? 'text-flowcore-success'
      : card.state === 'amber'
        ? 'text-flowcore-warning'
        : 'text-flowcore-danger';
  const lastRun = card.lastRunAtUnix
    ? formatRelative(card.lastRunAtUnix, nowUnix)
    : 'never';
  const lastRunIso = card.lastRunAtUnix
    ? new Date(card.lastRunAtUnix * 1000).toISOString()
    : null;
  return (
    <article
      class={`fc-panel p-4 border-t-4 ${borderClass}`}
      data-testid={`health-card-${card.channel}-${card.competitorId}`}
      data-state={card.state}
      data-channel={card.channel}
      data-competitor-id={card.competitorId}
    >
      <header class="flex items-center justify-between mb-3">
        <span class={channelChipClass(card.channel)}>
          {channelLabel(card.channel)}
        </span>
        <span
          class={`text-[11px] font-semibold uppercase tracking-wider ${statusColor}`}
          data-testid="card-state"
        >
          {card.state}
        </span>
      </header>
      <h3 class="text-flowcore-text-primary font-medium text-sm">
        {card.competitorName}
      </h3>
      <dl class="text-xs text-flowcore-text-secondary mt-3 space-y-1">
        <div class="flex justify-between">
          <dt>Last run</dt>
          <dd>
            <time title={lastRunIso ?? ''}>{lastRun}</time>
          </dd>
        </div>
        <div class="flex justify-between">
          <dt>Status</dt>
          <dd class={statusColor}>
            {card.lastStatus ?? 'unknown'}
          </dd>
        </div>
        <div class="flex justify-between">
          <dt>Items fetched</dt>
          <dd class="tabular-nums">{card.itemsFetched}</dd>
        </div>
        {card.errorMessage ? (
          <div class="mt-2">
            <dt class="text-flowcore-danger">Error</dt>
            <dd class="text-flowcore-text-secondary mt-1 break-words">
              {card.errorMessage}
            </dd>
          </div>
        ) : null}
      </dl>
      {isAdmin ? (
        <form
          method="post"
          action={`/health/retry/${card.channel}`}
          class="mt-3"
        >
          <button
            type="submit"
            class="btn-ghost text-xs w-full"
            data-testid={`retry-${card.channel}-${card.competitorId}`}
          >
            Retry now
          </button>
        </form>
      ) : null}
    </article>
  );
};

function formatRelative(unix: number, nowUnix: number): string {
  const diff = nowUnix - unix;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}
