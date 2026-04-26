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

// Provider keys — must always be set in tests so env.ts captures them at
// import time and live-mode pollers reach the (MSW-mocked) HTTP layer. We
// override unconditionally because docker-compose .env may pre-populate the
// names with empty strings.
const FORCE_PROVIDER_KEYS: Record<string, string> = {
  ZENROWS_API_KEY: 'test-zenrows-key',
  APIFY_API_TOKEN: 'test-apify-token',
  YOUTUBE_API_KEY: 'test-youtube-key',
  SERPER_API_KEY: 'test-serper-key',
  DATAFORSEO_LOGIN: 'test-dfs-login',
  DATAFORSEO_PASSWORD: 'test-dfs-password',
};
for (const [k, v] of Object.entries(FORCE_PROVIDER_KEYS)) {
  if (!process.env[k]) process.env[k] = v;
}
