import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const VALID_ENV = {
  NODE_ENV: 'test',
  PORT: '3000',
  DATABASE_PATH: ':memory:',
  OPERATION_MODE: 'demo',
  CRON_SECRET: 'test-cron-secret',
  SESSION_SECRET: 'a'.repeat(48),
  MONTHLY_BUDGET_USD: '200',
  BACKLINK_DR_THRESHOLD: '30',
} as const;

const ENV_KEYS = [
  ...Object.keys(VALID_ENV),
  'OPENROUTER_API_KEY',
  'APIFY_API_TOKEN',
  'ZENROWS_API_KEY',
  'YOUTUBE_API_KEY',
  'SERPER_API_KEY',
  'DATAFORSEO_LOGIN',
  'DATAFORSEO_PASSWORD',
] as const;

const originalEnv: Record<string, string | undefined> = {};

function applyValidEnv() {
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
  for (const [k, v] of Object.entries(VALID_ENV)) {
    process.env[k] = v;
  }
}

beforeAll(() => {
  for (const key of ENV_KEYS) {
    originalEnv[key] = process.env[key];
  }
  applyValidEnv();
});

afterAll(() => {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
});

afterEach(() => {
  applyValidEnv();
  vi.resetModules();
});

describe('healthcheck', () => {
  it('GET /health returns 200 with status=ok and matching mode', async () => {
    vi.resetModules();
    applyValidEnv();
    const { app } = await import('../src/index.js');

    const res = await app.request('/health');
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      status: string;
      mode: string;
      db: { ok: boolean };
      uptime_s: number;
    };
    expect(body.status).toBe('ok');
    expect(body.mode).toBe(process.env.OPERATION_MODE);
    expect(body.db.ok).toBe(true);
    expect(typeof body.uptime_s).toBe('number');
  });
});

describe('env validation', () => {
  it('throws a Zod-flavored error when OPERATION_MODE is invalid', async () => {
    vi.resetModules();
    applyValidEnv();
    process.env.OPERATION_MODE = 'invalid-mode';

    await expect(import('../src/lib/env.js')).rejects.toThrow(
      /Invalid environment configuration/i,
    );
  });

  it('error message identifies the offending field (OPERATION_MODE)', async () => {
    vi.resetModules();
    applyValidEnv();
    process.env.OPERATION_MODE = 'invalid-mode';

    await expect(import('../src/lib/env.js')).rejects.toThrow(/OPERATION_MODE/);
  });
});

describe('layout', () => {
  it('renders <title>, data-tw="loaded", and the FLOWCORE brand', async () => {
    vi.resetModules();
    applyValidEnv();
    const { Layout } = await import('../src/views/layout.js');

    const tree = (
      <Layout title="Test View" active="dashboard">
        <p>dummy slot</p>
      </Layout>
    );
    const html = tree.toString();

    expect(html).toContain('<title>');
    expect(html).toContain('data-tw="loaded"');
    expect(html).toContain('FLOWCORE');
    expect(html).toContain('dummy slot');
    expect(html).toContain('Marketing Sensor');
  });
});

describe('static assets', () => {
  it('GET /css/output.css returns 200 with a CSS content-type', async () => {
    vi.resetModules();
    applyValidEnv();
    const { app } = await import('../src/index.js');

    const res = await app.request('/css/output.css');
    expect(res.status).toBe(200);

    const contentType = res.headers.get('content-type') ?? '';
    expect(contentType.toLowerCase()).toMatch(/css/);
  });
});
