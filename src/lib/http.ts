import { logger } from './logger.js';

export type FetchImpl = typeof fetch;

export type FetchWithRetryOptions = RequestInit & {
  retries?: number;
  timeoutMs?: number;
  fetchImpl?: FetchImpl;
  retryOn?: (status: number) => boolean;
  // Backoff base in ms; actual wait is base * 2^attempt.
  backoffMs?: number;
  sleep?: (ms: number) => Promise<void>;
};

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_BACKOFF_MS = 250;
const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

function shouldRetryStatus(status: number): boolean {
  return status === 408 || status === 429 || (status >= 500 && status < 600);
}

export class HttpError extends Error {
  public readonly status: number;
  public readonly url: string;
  public readonly bodyExcerpt: string;
  constructor(url: string, status: number, bodyExcerpt: string) {
    super(`HTTP ${status} ${url} :: ${bodyExcerpt.slice(0, 200)}`);
    this.name = 'HttpError';
    this.url = url;
    this.status = status;
    this.bodyExcerpt = bodyExcerpt;
  }
}

export async function fetchWithRetry(
  url: string,
  opts: FetchWithRetryOptions = {},
): Promise<Response> {
  const retries = Math.max(0, opts.retries ?? 2);
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const retryOn = opts.retryOn ?? shouldRetryStatus;
  const backoffMs = opts.backoffMs ?? DEFAULT_BACKOFF_MS;
  const sleep = opts.sleep ?? defaultSleep;

  if (typeof fetchImpl !== 'function') {
    throw new Error('global fetch is not available');
  }

  let lastErr: unknown = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(url, { ...opts, signal: controller.signal });
      if (!res.ok && retryOn(res.status) && attempt < retries) {
        const text = await res.text().catch(() => '');
        logger.warn(
          { url, status: res.status, attempt },
          'fetchWithRetry got retryable status — retrying',
        );
        lastErr = new HttpError(url, res.status, text);
        await sleep(backoffMs * Math.pow(2, attempt));
        continue;
      }
      return res;
    } catch (err) {
      lastErr = err;
      const isAbort =
        (err instanceof Error && err.name === 'AbortError') ||
        (err instanceof DOMException && err.name === 'AbortError');
      if (attempt < retries) {
        logger.warn(
          {
            url,
            attempt,
            err: err instanceof Error ? err.message : String(err),
            timeout: isAbort,
          },
          'fetchWithRetry transport error — retrying',
        );
        await sleep(backoffMs * Math.pow(2, attempt));
        continue;
      }
    } finally {
      clearTimeout(tid);
    }
  }
  if (lastErr instanceof Error) throw lastErr;
  throw new Error(`fetchWithRetry exhausted retries on ${url}`);
}

export async function fetchJson<T>(
  url: string,
  opts: FetchWithRetryOptions = {},
): Promise<T> {
  const res = await fetchWithRetry(url, opts);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new HttpError(url, res.status, body);
  }
  return (await res.json()) as T;
}

export async function fetchText(
  url: string,
  opts: FetchWithRetryOptions = {},
): Promise<{ status: number; text: string }> {
  const res = await fetchWithRetry(url, opts);
  const text = await res.text();
  return { status: res.status, text };
}
