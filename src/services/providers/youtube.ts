import { fetchJson } from '../../lib/http.js';

export const YOUTUBE_BASE = 'https://www.googleapis.com/youtube/v3';

export type YouTubeChannelsResponse = {
  items?: Array<{
    id?: string;
    contentDetails?: {
      relatedPlaylists?: { uploads?: string };
    };
  }>;
};

export type YouTubePlaylistItemsResponse = {
  items?: Array<{
    contentDetails?: { videoId?: string };
  }>;
};

export type YouTubeVideoItem = {
  id: string;
  contentDetails: { duration: string };
  snippet: {
    title: string;
    publishedAt: string;
    channelId: string;
    thumbnails?: Record<
      string,
      { url: string; width?: number; height?: number }
    >;
  };
  statistics?: {
    viewCount?: string;
    likeCount?: string;
    commentCount?: string;
  };
};

export type YouTubeVideosResponse = {
  items?: YouTubeVideoItem[];
};

export async function getUploadsPlaylistId(
  apiKey: string,
  channelId: string,
): Promise<string | null> {
  const url = `${YOUTUBE_BASE}/channels?id=${encodeURIComponent(
    channelId,
  )}&part=contentDetails&key=${encodeURIComponent(apiKey)}`;
  const data = await fetchJson<YouTubeChannelsResponse>(url, {
    method: 'GET',
    timeoutMs: 15_000,
  });
  const id = data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  return id ?? null;
}

export async function listPlaylistVideoIds(
  apiKey: string,
  playlistId: string,
  maxResults: number = 20,
): Promise<string[]> {
  const url = `${YOUTUBE_BASE}/playlistItems?playlistId=${encodeURIComponent(
    playlistId,
  )}&part=contentDetails&maxResults=${maxResults}&key=${encodeURIComponent(
    apiKey,
  )}`;
  const data = await fetchJson<YouTubePlaylistItemsResponse>(url, {
    method: 'GET',
    timeoutMs: 15_000,
  });
  return (data.items ?? [])
    .map((it) => it.contentDetails?.videoId)
    .filter((v): v is string => typeof v === 'string' && v.length > 0);
}

export async function getVideoDetails(
  apiKey: string,
  videoIds: string[],
): Promise<YouTubeVideoItem[]> {
  if (videoIds.length === 0) return [];
  const ids = videoIds.join(',');
  const url = `${YOUTUBE_BASE}/videos?id=${encodeURIComponent(
    ids,
  )}&part=contentDetails,snippet,statistics&key=${encodeURIComponent(apiKey)}`;
  const data = await fetchJson<YouTubeVideosResponse>(url, {
    method: 'GET',
    timeoutMs: 15_000,
  });
  return data.items ?? [];
}

// Parse ISO 8601 duration `PT##H##M##S` into seconds. YouTube returns ints
// (no fractional seconds).
export function parseIsoDurationSeconds(iso: string): number {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
  if (!match) return 0;
  const h = match[1] ? Number(match[1]) : 0;
  const m = match[2] ? Number(match[2]) : 0;
  const s = match[3] ? Number(match[3]) : 0;
  return h * 3600 + m * 60 + s;
}

// Pick the best thumbnail (highest resolution) and return its dimensions.
export function pickPrimaryThumbnail(item: YouTubeVideoItem): {
  url: string | null;
  width: number;
  height: number;
} {
  const thumbs = item.snippet?.thumbnails ?? {};
  // Preference order — YouTube returns these in this rough order.
  const order = ['maxres', 'standard', 'high', 'medium', 'default'];
  for (const key of order) {
    const t = thumbs[key];
    if (t && typeof t.url === 'string') {
      return {
        url: t.url,
        width: Number(t.width ?? 0),
        height: Number(t.height ?? 0),
      };
    }
  }
  return { url: null, width: 0, height: 0 };
}
