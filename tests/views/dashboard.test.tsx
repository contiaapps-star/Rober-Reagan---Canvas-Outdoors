import { describe, expect, it } from 'vitest';

import type { RecentActivityRow } from '../../src/db/queries.js';
import { ActivityRow } from '../../src/views/dashboard/activity-row.js';
import { KpiTile } from '../../src/views/dashboard/kpi-row.js';
import { channelChipClass } from '../../src/lib/channels.js';

describe('KPI Failed Channels tile color', () => {
  it('uses neutral tone (no danger class) when failedChannels=0', () => {
    const html = (
      <KpiTile
        testId="kpi-failed-channels"
        label="Failed Channels"
        value={0}
        tone="neutral"
      />
    ).toString();

    expect(html).not.toContain('fc-kpi-tile--danger');
    expect(html).not.toContain('fc-kpi-tile__value--danger');
    expect(html).toContain('data-tone="neutral"');
  });

  it('uses flowcore.danger styling when failedChannels>0', () => {
    const html = (
      <KpiTile
        testId="kpi-failed-channels"
        label="Failed Channels"
        value={3}
        tone="danger"
      />
    ).toString();

    expect(html).toContain('fc-kpi-tile--danger');
    expect(html).toContain('fc-kpi-tile__value--danger');
    expect(html).toContain('data-tone="danger"');
    expect(html).toContain('>3<');
  });
});

describe('ActivityRow placeholder summary', () => {
  it('shows "Summary pending" when summary_text is the seed placeholder', () => {
    const row: RecentActivityRow = {
      id: 'row-1',
      channel: 'website',
      activityType: 'new_blog_post',
      detectedAt: Math.floor(Date.now() / 1000) - 3600,
      publishedAt: null,
      sourceUrl: 'https://example.com/post',
      summaryText: '[Pendiente generar con LLM en Fase 4]',
      status: 'new',
      competitor: {
        id: 'c-1',
        name: 'Example Co',
        domain: 'example.com',
        tier: 'local_same_size',
        category: 'plumbing',
      },
    };

    const html = (<ActivityRow row={row} />).toString();
    expect(html).toContain('Summary pending');
    expect(html).toContain('italic');
    expect(html).toContain('Llegará después del próximo poll');
    // The placeholder text itself is not rendered.
    expect(html).not.toContain('Pendiente generar con LLM');
  });
});

describe('Channel chip kinds — all 7 channels supported', () => {
  it('maps each channel value to its chip-channel-* class', () => {
    expect(channelChipClass('website')).toContain('chip-channel-website');
    expect(channelChipClass('meta_facebook')).toContain('chip-channel-meta');
    expect(channelChipClass('meta_instagram')).toContain('chip-channel-meta');
    expect(channelChipClass('google_ads')).toContain('chip-channel-google');
    expect(channelChipClass('tiktok')).toContain('chip-channel-tiktok');
    expect(channelChipClass('youtube')).toContain('chip-channel-youtube');
    expect(channelChipClass('seo_ranking')).toContain('chip-channel-seo');
    expect(channelChipClass('seo_backlink')).toContain('chip-channel-seo');
  });
});
