import type { Context } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';

export type FlashType = 'success' | 'error';

export type Flash = {
  type: FlashType;
  message: string;
};

const COOKIE_NAME = 'fc_flash';

export function flash(c: Context, type: FlashType, message: string): void {
  const value = encodeURIComponent(JSON.stringify({ type, message }));
  setCookie(c, COOKIE_NAME, value, {
    maxAge: 5,
    path: '/',
    httpOnly: false,
    sameSite: 'Lax',
  });
}

export function readFlash(c: Context): Flash | null {
  const raw = getCookie(c, COOKIE_NAME);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as Flash;
    if (
      parsed &&
      (parsed.type === 'success' || parsed.type === 'error') &&
      typeof parsed.message === 'string'
    ) {
      setCookie(c, COOKIE_NAME, '', { maxAge: 0, path: '/' });
      return parsed;
    }
  } catch {
    // ignore malformed cookie
  }
  return null;
}
