import { Hono } from 'hono';
import { DashboardView } from '../views/dashboard.js';

export const dashboardRoute = new Hono();

dashboardRoute.get('/', (c) => c.html(DashboardView()));
