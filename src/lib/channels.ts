export type Channel =
  | 'website'
  | 'meta_facebook'
  | 'meta_instagram'
  | 'tiktok'
  | 'youtube'
  | 'google_ads'
  | 'seo_ranking'
  | 'seo_backlink';

export type ChannelChipKind =
  | 'website'
  | 'meta'
  | 'google'
  | 'tiktok'
  | 'youtube'
  | 'seo';

export function channelChipKind(channel: string): ChannelChipKind {
  switch (channel) {
    case 'website':
      return 'website';
    case 'meta_facebook':
    case 'meta_instagram':
      return 'meta';
    case 'google_ads':
      return 'google';
    case 'tiktok':
      return 'tiktok';
    case 'youtube':
      return 'youtube';
    case 'seo_ranking':
    case 'seo_backlink':
      return 'seo';
    default:
      return 'website';
  }
}

export function channelChipClass(channel: string): string {
  return `chip-channel chip-channel-${channelChipKind(channel)}`;
}

const CHANNEL_LABELS: Record<string, string> = {
  website: 'Website',
  meta_facebook: 'Meta · FB',
  meta_instagram: 'Meta · IG',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  google_ads: 'Google Ads',
  seo_ranking: 'SEO Rank',
  seo_backlink: 'SEO Backlink',
};

export function channelLabel(channel: string): string {
  return CHANNEL_LABELS[channel] ?? channel;
}
