import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().max(65535).default(3000),
  DATABASE_PATH: z.string().min(1).default('/data/app.db'),
  OPERATION_MODE: z.enum(['demo', 'live']).default('demo'),

  CRON_SECRET: z.string().min(1, 'CRON_SECRET is required'),
  SESSION_SECRET: z
    .string()
    .min(32, 'SESSION_SECRET must be at least 32 characters'),

  MONTHLY_BUDGET_USD: z.coerce.number().positive().default(200),
  BACKLINK_DR_THRESHOLD: z.coerce.number().int().positive().default(30),

  OPENROUTER_API_KEY: z.string().optional(),
  APIFY_API_TOKEN: z.string().optional(),
  ZENROWS_API_KEY: z.string().optional(),
  YOUTUBE_API_KEY: z.string().optional(),
  SERPER_API_KEY: z.string().optional(),
  DATAFORSEO_LOGIN: z.string().optional(),
  DATAFORSEO_PASSWORD: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const formatted = JSON.stringify(result.error.flatten().fieldErrors, null, 2);
    throw new Error(
      `[env] Invalid environment configuration. Check .env against .env.example.\n${formatted}`,
    );
  }

  if (result.data.OPERATION_MODE === 'live') {
    if (!result.data.OPENROUTER_API_KEY) {
      throw new Error(
        '[env] OPERATION_MODE=live requires OPENROUTER_API_KEY to be set.',
      );
    }
  }

  return result.data;
}

export const env: Env = parseEnv();
