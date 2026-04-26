import { defineConfig } from 'vitest/config';

// Set env defaults before vitest spawns workers, so tests that statically
// import modules depending on src/lib/env.ts (db client, routes, etc.) can
// be loaded without the test file itself having to wire env first.
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
// Force provider keys (override empty .env values) so live-mode tests reach
// MSW. These are picked up by env.ts at module import.
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

export default defineConfig({
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'hono/jsx',
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.{ts,tsx}'],
    globals: false,
    setupFiles: ['./tests/helpers/setup-env.ts'],
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
});
