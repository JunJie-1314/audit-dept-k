/**
 * 原则会话（服务端鉴权）——与财务会话**独立**的短期 HMAC 签名 Cookie。
 *
 * 与 lib/finance/session.ts 的差别（有意为之，防止跨域权限串联）：
 * - 独立 cookie：`k_principles_session`；
 * - 独立环境变量：`PRINCIPLES_SESSION_SECRET` / `PRINCIPLES_PASSWORD`；
 * - 令牌 payload 带 `aud: "principles"`，校验时必须命中；财务令牌没有 aud，
 *   即使两个 secret 被误配成同一个，也不能拿财务令牌读/写原则账本。
 *
 * fail-closed：secret < 16 字符或口令为空 = 未配置（503），绝不匿名放行。
 * 仅可在服务端 Route Handler import。
 */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';

export const PRINCIPLES_SESSION_COOKIE = 'k_principles_session';
export const PRINCIPLES_TOKEN_AUDIENCE = 'principles';
export const DEFAULT_TTL_SECONDS = 30 * 24 * 3600;
const MAX_TTL_SECONDS = 90 * 24 * 3600;

export interface PrinciplesSessionConfig {
  secret: string;
  ttlSeconds: number;
}

export function principlesSessionConfig(): PrinciplesSessionConfig | null {
  const secret = String(process.env.PRINCIPLES_SESSION_SECRET ?? '');
  if (secret.length < 16) return null;
  const raw = Number(process.env.PRINCIPLES_SESSION_TTL_SECONDS ?? '');
  const ttl = Number.isFinite(raw) && raw > 0 ? Math.min(Math.floor(raw), MAX_TTL_SECONDS) : DEFAULT_TTL_SECONDS;
  return { secret, ttlSeconds: ttl };
}

export function principlesPassword(): string | null {
  const password = String(process.env.PRINCIPLES_PASSWORD ?? '');
  return password.length > 0 ? password : null;
}

export function verifyPrinciplesPassword(input: string, expected: string): boolean {
  const a = Buffer.from(input, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) {
    timingSafeEqual(b, b);
    return false;
  }
  return timingSafeEqual(a, b);
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export function issuePrinciplesToken(secret: string, ttlSeconds: number, nowMs: number = Date.now()): string {
  const exp = Math.floor(nowMs / 1000) + ttlSeconds;
  const payload = Buffer.from(JSON.stringify({
    aud: PRINCIPLES_TOKEN_AUDIENCE,
    exp,
    n: randomBytes(8).toString('base64url'),
  }), 'utf8').toString('base64url');
  return `${payload}.${sign(payload, secret)}`;
}

export function verifyPrinciplesToken(token: string, secret: string, nowMs: number = Date.now()): boolean {
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [payload, sig] = parts;
  if (!payload || !sig) return false;
  const expected = sign(payload, secret);
  const a = Buffer.from(sig, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { aud?: unknown; exp?: unknown };
    return data.aud === PRINCIPLES_TOKEN_AUDIENCE && typeof data.exp === 'number' && data.exp * 1000 > nowMs;
  } catch {
    return false;
  }
}

export function readPrinciplesCookie(req: Request, name: string = PRINCIPLES_SESSION_COOKIE): string | null {
  const header = req.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return null;
}

export function isPrinciplesAuthenticated(req: Request): boolean {
  const cfg = principlesSessionConfig();
  if (!cfg) return false;
  const token = readPrinciplesCookie(req);
  return !!token && verifyPrinciplesToken(token, cfg.secret);
}

export function noStore(res: NextResponse): NextResponse {
  res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.headers.set('Pragma', 'no-cache');
  return res;
}

export function requirePrinciplesAuth(req: Request): NextResponse | null {
  if (isPrinciplesAuthenticated(req)) return null;
  return noStore(NextResponse.json(
    { code: 'PRINCIPLES_UNAUTHORIZED', message: '需要登录后才能读写原则使用记录' },
    { status: 401 },
  ));
}

/** 会话 cookie 的固定属性（登录与注销共用）。 */
export function principlesCookie(token: string, maxAge: number): {
  name: string; value: string; httpOnly: true; secure: true; sameSite: 'strict'; path: string; maxAge: number;
} {
  return {
    name: PRINCIPLES_SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/api/principles',
    maxAge,
  };
}
