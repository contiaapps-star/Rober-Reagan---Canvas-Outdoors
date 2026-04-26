import { Layout } from './layout.js';

const KPI_LABELS = [
  'New Today',
  'New This Week',
  'Marked Useful',
  'Pending Review',
  'Active Channels',
  'Failed Channels',
] as const;

export const DashboardView = () => (
  <Layout title="Intelligence Board" active="dashboard">
    <header class="mb-6">
      <h1 class="text-2xl font-semibold text-flowcore-text-primary">
        Intelligence Board
      </h1>
      <p class="text-flowcore-text-secondary text-sm mt-1">
        Phase 0 — skeleton only. Activity feed lands in Phase 3.
      </p>
    </header>
    <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      {KPI_LABELS.map((label) => (
        <div class="fc-kpi-tile">
          <span class="fc-kpi-tile__value">—</span>
          <span class="fc-kpi-tile__label">{label}</span>
        </div>
      ))}
    </div>
  </Layout>
);
