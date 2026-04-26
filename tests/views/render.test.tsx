import { describe, expect, it } from 'vitest';

import { Layout } from '../../src/views/layout.js';
import { channelChipClass, channelChipKind } from '../../src/lib/channels.js';

describe('Layout sidebar', () => {
  it('marks the dashboard nav item active when active="dashboard"', () => {
    const html = (
      <Layout title="X" active="dashboard">
        <p>x</p>
      </Layout>
    ).toString();

    expect(html).toContain('href="/"');
    expect(html).toMatch(
      /href="\/"[^>]*class="fc-sidebar__nav-item fc-sidebar__nav-item--active"/,
    );
    expect(html).not.toMatch(
      /href="\/health\/channels"[^>]*fc-sidebar__nav-item--active/,
    );
  });

  it('marks the Settings group active and Competitors sub-link active when on /settings/competitors', () => {
    const html = (
      <Layout title="Competitors" active="settings.competitors">
        <p>x</p>
      </Layout>
    ).toString();

    expect(html).toMatch(
      /href="\/settings\/competitors"[^>]*fc-sidebar__nav-sub-item--active/,
    );
    expect(html).toContain('data-open="true"');
    expect(html).toMatch(
      /aria-expanded="true"[^>]*data-active="true"|data-active="true"[^>]*aria-expanded="true"/,
    );
  });

  it('marks the Health nav item active when active="health"', () => {
    const html = (
      <Layout title="Health" active="health">
        <p>x</p>
      </Layout>
    ).toString();

    expect(html).toMatch(
      /href="\/health\/channels"[^>]*fc-sidebar__nav-item--active/,
    );
    expect(html).not.toMatch(
      /href="\/"[^>]*fc-sidebar__nav-item--active/,
    );
  });
});

describe('channelChipClass', () => {
  it('uses chip-channel-meta for both meta_facebook and meta_instagram', () => {
    expect(channelChipKind('meta_facebook')).toBe('meta');
    expect(channelChipKind('meta_instagram')).toBe('meta');
    expect(channelChipClass('meta_facebook')).toBe('chip-channel chip-channel-meta');
    expect(channelChipClass('meta_instagram')).toBe('chip-channel chip-channel-meta');
  });

  it('uses the correct chip class for each channel family', () => {
    expect(channelChipClass('website')).toContain('chip-channel-website');
    expect(channelChipClass('google_ads')).toContain('chip-channel-google');
    expect(channelChipClass('tiktok')).toContain('chip-channel-tiktok');
    expect(channelChipClass('youtube')).toContain('chip-channel-youtube');
    expect(channelChipClass('seo_ranking')).toContain('chip-channel-seo');
    expect(channelChipClass('seo_backlink')).toContain('chip-channel-seo');
  });
});
