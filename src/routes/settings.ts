import { Hono } from 'hono';

// Phase 0 placeholder. Real handlers (competitors, keywords, inspiration sources)
// land in Phase 2.
export const settingsRoute = new Hono();

settingsRoute.get('/', (c) => c.redirect('/settings/competitors'));
