import { Hono } from 'hono';

// Phase 0 placeholder. Real cron-triggered pollers (POST /jobs/poll/:channel
// guarded by X-Cron-Secret) land in Phase 5.
export const jobsRoute = new Hono();
