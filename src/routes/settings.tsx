import { Hono } from 'hono';
import { z } from 'zod';

import type { Db } from '../db/client.js';
import { flash, readFlash } from '../lib/flash.js';
import {
  HANDLE_CHANNELS,
  competitorDomainExists,
  createCompetitor,
  createInspiration,
  createKeyword,
  getCompetitor,
  getInspiration,
  getKeyword,
  inspirationExists,
  keywordExists,
  listCompetitors,
  listInspiration,
  listKeywords,
  softDeleteCompetitor,
  softDeleteInspiration,
  softDeleteKeyword,
  updateCompetitor,
  updateInspiration,
  updateKeyword,
  type CompetitorInput,
  type HandleChannel,
  type InspirationInput,
  type KeywordInput,
} from '../services/settings-repo.js';
import {
  CompetitorRow,
  CompetitorsListView,
} from '../views/settings/competitors-list.js';
import {
  CompetitorForm,
  type CompetitorFormErrors,
  type CompetitorFormValues,
} from '../views/settings/competitor-form.js';
import {
  KeywordRow,
  KeywordsListView,
} from '../views/settings/keywords-list.js';
import {
  KeywordForm,
  type KeywordFormErrors,
  type KeywordFormValues,
} from '../views/settings/keyword-form.js';
import {
  InspirationListView,
  InspirationRow,
} from '../views/settings/inspiration-list.js';
import {
  InspirationForm,
  type InspirationFormErrors,
  type InspirationFormValues,
} from '../views/settings/inspiration-form.js';

const DOMAIN_REGEX = /^[a-z0-9.-]+\.[a-z]{2,}$/i;

const competitorBodySchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  domain: z
    .string()
    .trim()
    .min(3, 'Domain is required')
    .max(180)
    .regex(DOMAIN_REGEX, 'Invalid domain (e.g. example.com)'),
  category: z.enum(['well', 'plumbing', 'both'], {
    errorMap: () => ({ message: 'Category must be well, plumbing, or both' }),
  }),
  tier: z.enum(['local_same_size', 'mondo_100m', 'national', 'inspiration'], {
    errorMap: () => ({ message: 'Tier is invalid' }),
  }),
});

const keywordBodySchema = z.object({
  keyword: z.string().trim().min(1, 'Keyword is required').max(160),
  category: z.enum(['well', 'plumbing', 'both'], {
    errorMap: () => ({ message: 'Category must be well, plumbing, or both' }),
  }),
});

const inspirationBodySchema = z.object({
  kind: z.enum(['account', 'keyword_search'], {
    errorMap: () => ({ message: 'Kind must be account or keyword_search' }),
  }),
  value: z.string().trim().min(1, 'Value is required').max(200),
  channel: z.enum(['tiktok', 'youtube'], {
    errorMap: () => ({ message: 'Channel must be tiktok or youtube' }),
  }),
});

function emptyCompetitorValues(): CompetitorFormValues {
  return {
    name: '',
    domain: '',
    category: '',
    tier: '',
    handles: {},
  };
}

function emptyKeywordValues(): KeywordFormValues {
  return { keyword: '', category: '', isActive: true };
}

function emptyInspirationValues(): InspirationFormValues {
  return { kind: '', value: '', channel: '', isActive: true };
}

function asString(v: FormDataEntryValue | undefined | null): string {
  if (v === null || v === undefined) return '';
  return typeof v === 'string' ? v : '';
}

function isChecked(v: FormDataEntryValue | undefined | null): boolean {
  const s = asString(v).toLowerCase();
  return s === 'on' || s === 'true' || s === '1';
}

function competitorValuesFromForm(form: FormData): CompetitorFormValues {
  const handles: Partial<Record<HandleChannel, string>> = {};
  for (const ch of HANDLE_CHANNELS) {
    const v = asString(form.get(`handle_${ch}`)).trim();
    if (v) handles[ch] = v;
  }
  return {
    name: asString(form.get('name')),
    domain: asString(form.get('domain')),
    category: asString(form.get('category')) as CompetitorFormValues['category'],
    tier: asString(form.get('tier')) as CompetitorFormValues['tier'],
    handles,
  };
}

function flattenZodErrors<T extends Record<string, unknown>>(
  err: z.ZodError,
): T {
  const flat = err.flatten().fieldErrors;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(flat)) {
    if (v && v.length > 0) out[k] = v[0]!;
  }
  return out as T;
}

export function createSettingsRoute(db: Db): Hono {
  const app = new Hono();

  app.get('/', (c) => c.redirect('/settings/competitors'));

  // ─── Competitors ──────────────────────────────────────────────────────────
  app.get('/competitors', (c) => {
    const items = listCompetitors(db, { activeOnly: true });
    return c.html(
      <CompetitorsListView competitors={items} flash={readFlash(c)} />,
    );
  });

  app.get('/competitors/new', (c) =>
    c.html(<CompetitorForm mode="create" values={emptyCompetitorValues()} />),
  );

  app.get('/competitors/:id/edit', (c) => {
    const id = c.req.param('id');
    const competitor = getCompetitor(db, id);
    if (!competitor) return c.text('Competitor not found', 404);
    const handles: Partial<Record<HandleChannel, string>> = {};
    for (const h of competitor.handles) {
      handles[h.channel] = h.handle ?? '';
    }
    const values: CompetitorFormValues = {
      name: competitor.name,
      domain: competitor.domain,
      category: competitor.category,
      tier: competitor.tier,
      handles,
    };
    return c.html(<CompetitorForm mode="edit" id={id} values={values} />);
  });

  app.post('/competitors', async (c) => {
    const form = await c.req.formData();
    const values = competitorValuesFromForm(form);

    const parsed = competitorBodySchema.safeParse({
      name: values.name,
      domain: values.domain,
      category: values.category,
      tier: values.tier,
    });

    if (!parsed.success) {
      const errors = flattenZodErrors<CompetitorFormErrors>(parsed.error);
      return c.html(
        <CompetitorForm mode="create" values={values} errors={errors} />,
        400,
      );
    }

    const normalizedDomain = parsed.data.domain.toLowerCase();
    if (competitorDomainExists(db, normalizedDomain)) {
      return c.html(
        <CompetitorForm
          mode="create"
          values={{ ...values, domain: normalizedDomain }}
          errors={{ domain: 'Domain already exists' }}
        />,
        400,
      );
    }

    const input: CompetitorInput = {
      name: parsed.data.name,
      domain: normalizedDomain,
      category: parsed.data.category,
      tier: parsed.data.tier,
      handles: values.handles,
    };
    const created = createCompetitor(db, input);
    flash(c, 'success', `Competitor "${created.name}" created.`);
    return c.html(<CompetitorRow competitor={created} />, 201);
  });

  app.put('/competitors/:id', async (c) => {
    const id = c.req.param('id');
    const existing = getCompetitor(db, id);
    if (!existing) return c.text('Competitor not found', 404);

    const form = await c.req.formData();
    const values = competitorValuesFromForm(form);

    const parsed = competitorBodySchema.safeParse({
      name: values.name,
      domain: values.domain,
      category: values.category,
      tier: values.tier,
    });

    if (!parsed.success) {
      const errors = flattenZodErrors<CompetitorFormErrors>(parsed.error);
      return c.html(
        <CompetitorForm mode="edit" id={id} values={values} errors={errors} />,
        400,
      );
    }

    const normalizedDomain = parsed.data.domain.toLowerCase();
    if (competitorDomainExists(db, normalizedDomain, id)) {
      return c.html(
        <CompetitorForm
          mode="edit"
          id={id}
          values={{ ...values, domain: normalizedDomain }}
          errors={{ domain: 'Domain already exists' }}
        />,
        400,
      );
    }

    const updated = updateCompetitor(db, id, {
      name: parsed.data.name,
      domain: normalizedDomain,
      category: parsed.data.category,
      tier: parsed.data.tier,
      handles: values.handles,
    });
    if (!updated) return c.text('Competitor not found', 404);
    flash(c, 'success', `Competitor "${updated.name}" updated.`);
    return c.html(<CompetitorRow competitor={updated} />);
  });

  app.delete('/competitors/:id', (c) => {
    const id = c.req.param('id');
    const ok = softDeleteCompetitor(db, id);
    if (!ok) return c.text('Competitor not found', 404);
    flash(c, 'success', 'Competitor archived.');
    return c.html('');
  });

  // ─── Keywords ─────────────────────────────────────────────────────────────
  app.get('/keywords', (c) => {
    const items = listKeywords(db, { activeOnly: true });
    return c.html(<KeywordsListView keywords={items} flash={readFlash(c)} />);
  });

  app.get('/keywords/new', (c) =>
    c.html(<KeywordForm mode="create" values={emptyKeywordValues()} />),
  );

  app.get('/keywords/:id/edit', (c) => {
    const id = c.req.param('id');
    const kw = getKeyword(db, id);
    if (!kw) return c.text('Keyword not found', 404);
    const values: KeywordFormValues = {
      keyword: kw.keyword,
      category: kw.category,
      isActive: kw.isActive,
    };
    return c.html(<KeywordForm mode="edit" id={id} values={values} />);
  });

  app.post('/keywords', async (c) => {
    const form = await c.req.formData();
    const values: KeywordFormValues = {
      keyword: asString(form.get('keyword')),
      category: asString(form.get('category')) as KeywordFormValues['category'],
      isActive: isChecked(form.get('isActive')),
    };
    const parsed = keywordBodySchema.safeParse({
      keyword: values.keyword,
      category: values.category,
    });
    if (!parsed.success) {
      const errors = flattenZodErrors<KeywordFormErrors>(parsed.error);
      return c.html(
        <KeywordForm mode="create" values={values} errors={errors} />,
        400,
      );
    }
    if (keywordExists(db, parsed.data.keyword)) {
      return c.html(
        <KeywordForm
          mode="create"
          values={values}
          errors={{ keyword: 'Keyword already exists' }}
        />,
        400,
      );
    }
    const input: KeywordInput = {
      keyword: parsed.data.keyword,
      category: parsed.data.category,
      isActive: values.isActive,
    };
    const created = createKeyword(db, input);
    flash(c, 'success', `Keyword "${created.keyword}" created.`);
    return c.html(<KeywordRow keyword={created} />, 201);
  });

  app.put('/keywords/:id', async (c) => {
    const id = c.req.param('id');
    const existing = getKeyword(db, id);
    if (!existing) return c.text('Keyword not found', 404);
    const form = await c.req.formData();
    const values: KeywordFormValues = {
      keyword: asString(form.get('keyword')),
      category: asString(form.get('category')) as KeywordFormValues['category'],
      isActive: isChecked(form.get('isActive')),
    };
    const parsed = keywordBodySchema.safeParse({
      keyword: values.keyword,
      category: values.category,
    });
    if (!parsed.success) {
      const errors = flattenZodErrors<KeywordFormErrors>(parsed.error);
      return c.html(
        <KeywordForm mode="edit" id={id} values={values} errors={errors} />,
        400,
      );
    }
    if (keywordExists(db, parsed.data.keyword, id)) {
      return c.html(
        <KeywordForm
          mode="edit"
          id={id}
          values={values}
          errors={{ keyword: 'Keyword already exists' }}
        />,
        400,
      );
    }
    const updated = updateKeyword(db, id, {
      keyword: parsed.data.keyword,
      category: parsed.data.category,
      isActive: values.isActive,
    });
    if (!updated) return c.text('Keyword not found', 404);
    flash(c, 'success', `Keyword "${updated.keyword}" updated.`);
    return c.html(<KeywordRow keyword={updated} />);
  });

  app.delete('/keywords/:id', (c) => {
    const id = c.req.param('id');
    const ok = softDeleteKeyword(db, id);
    if (!ok) return c.text('Keyword not found', 404);
    flash(c, 'success', 'Keyword archived.');
    return c.html('');
  });

  // ─── Inspiration ──────────────────────────────────────────────────────────
  app.get('/inspiration', (c) => {
    const items = listInspiration(db, { activeOnly: true });
    return c.html(<InspirationListView sources={items} flash={readFlash(c)} />);
  });

  app.get('/inspiration/new', (c) =>
    c.html(<InspirationForm mode="create" values={emptyInspirationValues()} />),
  );

  app.get('/inspiration/:id/edit', (c) => {
    const id = c.req.param('id');
    const src = getInspiration(db, id);
    if (!src) return c.text('Inspiration source not found', 404);
    const values: InspirationFormValues = {
      kind: src.kind,
      value: src.value,
      channel: src.channel,
      isActive: src.isActive,
    };
    return c.html(<InspirationForm mode="edit" id={id} values={values} />);
  });

  app.post('/inspiration', async (c) => {
    const form = await c.req.formData();
    const values: InspirationFormValues = {
      kind: asString(form.get('kind')) as InspirationFormValues['kind'],
      value: asString(form.get('value')),
      channel: asString(form.get('channel')) as InspirationFormValues['channel'],
      isActive: isChecked(form.get('isActive')),
    };
    const parsed = inspirationBodySchema.safeParse({
      kind: values.kind,
      value: values.value,
      channel: values.channel,
    });
    if (!parsed.success) {
      const errors = flattenZodErrors<InspirationFormErrors>(parsed.error);
      return c.html(
        <InspirationForm mode="create" values={values} errors={errors} />,
        400,
      );
    }
    if (inspirationExists(db, parsed.data.channel, parsed.data.value)) {
      return c.html(
        <InspirationForm
          mode="create"
          values={values}
          errors={{ value: 'Source already exists for this channel' }}
        />,
        400,
      );
    }
    const input: InspirationInput = {
      kind: parsed.data.kind,
      value: parsed.data.value,
      channel: parsed.data.channel,
      isActive: values.isActive,
    };
    const created = createInspiration(db, input);
    flash(c, 'success', `Source "${created.value}" created.`);
    return c.html(<InspirationRow source={created} />, 201);
  });

  app.put('/inspiration/:id', async (c) => {
    const id = c.req.param('id');
    const existing = getInspiration(db, id);
    if (!existing) return c.text('Inspiration source not found', 404);
    const form = await c.req.formData();
    const values: InspirationFormValues = {
      kind: asString(form.get('kind')) as InspirationFormValues['kind'],
      value: asString(form.get('value')),
      channel: asString(form.get('channel')) as InspirationFormValues['channel'],
      isActive: isChecked(form.get('isActive')),
    };
    const parsed = inspirationBodySchema.safeParse({
      kind: values.kind,
      value: values.value,
      channel: values.channel,
    });
    if (!parsed.success) {
      const errors = flattenZodErrors<InspirationFormErrors>(parsed.error);
      return c.html(
        <InspirationForm mode="edit" id={id} values={values} errors={errors} />,
        400,
      );
    }
    if (inspirationExists(db, parsed.data.channel, parsed.data.value, id)) {
      return c.html(
        <InspirationForm
          mode="edit"
          id={id}
          values={values}
          errors={{ value: 'Source already exists for this channel' }}
        />,
        400,
      );
    }
    const updated = updateInspiration(db, id, {
      kind: parsed.data.kind,
      value: parsed.data.value,
      channel: parsed.data.channel,
      isActive: values.isActive,
    });
    if (!updated) return c.text('Inspiration source not found', 404);
    flash(c, 'success', `Source "${updated.value}" updated.`);
    return c.html(<InspirationRow source={updated} />);
  });

  app.delete('/inspiration/:id', (c) => {
    const id = c.req.param('id');
    const ok = softDeleteInspiration(db, id);
    if (!ok) return c.text('Inspiration source not found', 404);
    flash(c, 'success', 'Source archived.');
    return c.html('');
  });

  return app;
}

// Production wiring: getDb() is itself lazy, so this only opens the DB on first
// /settings request via the route handlers that call it.
import { getDb } from '../db/client.js';

export const settingsRoute: Hono = createSettingsRoute(getDb());
