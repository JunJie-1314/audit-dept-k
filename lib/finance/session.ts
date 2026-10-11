/**
 * 财务会话（服务端鉴权）——短期 HMAC 签名 Cookie。
 *
 * 单用户口令登录：口令、签名密钥只来自**部署环境变量**（不落仓库、不进前端）。
 * Cookie 属性固定 `HttpOnly; Secure; SameSite=Strict`，默认 8 小时有效。
 * 未配置即 fail-closed（503），绝不降级成「无鉴权放行」。
 *
 * 仅可在服务端（Route Handler）import —— 绝不引入客户端组件。
 */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';

export const FINANCE_SESSION_COOKIE = 'k_finance_session';
export const DEFAULT_TTL_SECONDS = 8 * 3600;
const MAX_TTL_SECONDS = 24 * 3600;

export interface SessionConfig {
  secret: string;
  ttlSeconds: number;
}

/** 读取签名密钥配置；密钥过短视为未配置。 */
export function sessionConfig(): SessionConfig | null {
  const secret = String(process.env.FINANCE_SESSION_SECRET ?? '');
  if (secret.length < 16) return null;
  const raw = Number(process.env.FINANCE_SESSION_TTL_SECONDS ?? '');
  const ttl = Number.isFinite(raw) && raw > 0 ? Math.min(Math.floor(raw), MAX_TTL_SECONDS) : DEFAULT_TTL_SECONDS;
  return { secret, ttlSeconds: ttl };
}

/** 读取登录口令；未配置返回 null。 */
export function financePassword(): string | null {
  const pw = String(process.env.FINANCE_PASSWORD ?? '');
  return pw.length > 0 ? pw : null;
}

/** 常量时间比较口令（长度不等时也执行一次比较以削弱时序信号）。 */
export function verifyPassword(input: string, expected: string): boolean {
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

/** 签发会话令牌：`payload.signature`（payload 含 exp 与随机 nonce）。 */
export function issueToken(secret: string, ttlSeconds: number, nowMs: number = Date.now()): string {
  const exp = Math.floor(nowMs / 1000) + ttlSeconds;
  const payload = Buffer.from(
    JSON.stringify({ exp, n: randomBytes(8).toString('base64url') }),
    'utf8',
  ).toString('base64url');
  return `${payload}.${sign(payload, secret)}`;
}

/** 校验令牌签名与有效期（常量时间比较签名）。 */
export function verifyToken(token: string, secret: string, nowMs: number = Date.now()): boolean {
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [payload, sig] = parts;
  if (!payload || !sig) return false;
  const expected = sign(payload, secret);
  const a = Buffer.from(sig, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { exp?: unknown };
    return typeof data.exp === 'number' && data.exp * 1000 > nowMs;
  } catch {
    return false;
  }
}

/** 从 Cookie 头里取指定 cookie（不依赖 next/headers 的异步 API）。 */
export function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return null;
}

/** 请求是否已持有有效财务会话。 */
export function isAuthenticated(req: Request): boolean {
  const cfg = sessionConfig();
  if (!cfg) return false;
  const token = readCookie(req, FINANCE_SESSION_COOKIE);
  return !!token && verifyToken(token, cfg.secret);
}

/** 统一加 no-store（财务响应禁止被中间层/浏览器缓存）。 */
export function noStore(res: NextResponse): NextResponse {
  res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.headers.set('Pragma', 'no-cache');
  return res;
}

/** 未登录时返回 401 响应；已登录返回 null。 */
export function requireAuth(req: Request): NextResponse | null {
  if (isAuthenticated(req)) return null;
  return noStore(
    NextResponse.json({ code: 'FINANCE_UNAUTHORIZED', message: '需要登录后才能访问财务数据' }, { status: 401 }),
  );
}
