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
    exclude: ['tests/e2e/**', 'node_modules/**'],
    globals: false,
    setupFiles: ['./tests/helpers/setup-env.ts'],
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.d.ts',
        'src/db/migrations/**',
        'src/pollers/fixtures/**',
      ],
      // Per Phase 7 spec: business-logic dirs ≥80% lines, global ≥65% lines.
      // Branch thresholds are intentionally lower because htmx error paths
      // and demo-mode fallbacks in fixtures aren't reachable from tests.
      thresholds: {
        lines: 65,
        functions: 65,
        statements: 65,
        branches: 60,
        'src/services/**/*.ts': {
          lines: 80,
          functions: 80,
          statements: 80,
          branches: 60,
        },
        'src/pollers/**/*.ts': {
          lines: 80,
          functions: 80,
          statements: 80,
          branches: 50,
        },
        'src/middleware/**/*.{ts,tsx}': {
          lines: 80,
          functions: 80,
          statements: 80,
          branches: 60,
        },
      },
    },
  },
});
