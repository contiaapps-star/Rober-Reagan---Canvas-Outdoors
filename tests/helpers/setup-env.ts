// Loaded by vitest before any test imports. Sets the env vars needed by
// src/lib/env.ts so that modules importing the env (db/client, routes, etc.)
// can be loaded statically in tests.

const TEST_ENV: Record<string, string> = {
  NODE_ENV: 'test',
  PORT: '3000',
  DATABASE_PATH: ':memory:',
  OPERATION_MODE: 'demo',
  CRON_SECRET: 'test-cron-secret',
  SESSION_SECRET: 'a'.repeat(48),
  MONTHLY_BUDGET_USD: '200',
  BACKLINK_DR_THRESHOLD: '30',
};

for (const [k, v] of Object.entries(TEST_ENV)) {
  if (process.env[k] === undefined) process.env[k] = v;
}
