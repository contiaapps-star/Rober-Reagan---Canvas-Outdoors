import { createHmac, timingSafeEqual } from 'node:crypto';
import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2';

import { env } from './env.js';

export const SESSION_COOKIE_NAME = 'fc_session';

// Argon2id params per CLAUDE.md / Phase 7 spec.
const ARGON2_OPTIONS = {
  algorithm: 2 as const, // 2 = Argon2id in @node-rs/argon2
  timeCost: 2,
  memoryCost: 19456,
  parallelism: 1,
};

export async function hashPassword(plain: string): Promise<string> {
  return argonHash(plain, ARGON2_OPTIONS);
}

export async function verifyPassword(
  hashStr: string,
  plain: string,
): Promise<boolean> {
  try {
    return await argonVerify(hashStr, plain);
  } catch {
    return false;
  }
}

// ─── Cookie signing (HMAC-SHA256) ─────────────────────────────────────────────
// Cookie value = base64url(payloadJson) + "." + base64url(hmac)
// Payload = { uid, exp } where exp is unix-seconds.

export type SessionPayload = {
  uid: string;
  exp: number;
};

function b64uEncode(buf: Buffer | string): string {
  const b = typeof buf === 'string' ? Buffer.from(buf, 'utf8') : buf;
  return b
    .toString('base64')
    .replace(/=+$/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function b64uDecode(s: string): Buffer {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  return Buffer.from(padded, 'base64');
}

function sign(payloadStr: string, secret: string): string {
  return b64uEncode(createHmac('sha256', secret).update(payloadStr).digest());
}

export function signSession(
  payload: SessionPayload,
  secret: string = env.SESSION_SECRET,
): string {
  const json = JSON.stringify(payload);
  const enc = b64uEncode(json);
  const mac = sign(enc, secret);
  return `${enc}.${mac}`;
}

export function verifySession(
  cookie: string,
  secret: string = env.SESSION_SECRET,
): SessionPayload | null {
  if (typeof cookie !== 'string' || cookie.length === 0) return null;
  const dot = cookie.indexOf('.');
  if (dot <= 0 || dot === cookie.length - 1) return null;
  const enc = cookie.slice(0, dot);
  const mac = cookie.slice(dot + 1);

  const expected = sign(enc, secret);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let payload: SessionPayload;
  try {
    payload = JSON.parse(b64uDecode(enc).toString('utf8')) as SessionPayload;
  } catch {
    return null;
  }
  if (
    !payload ||
    typeof payload.uid !== 'string' ||
    typeof payload.exp !== 'number'
  ) {
    return null;
  }
  if (payload.exp * 1000 < Date.now()) return null;
  return payload;
}

export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
