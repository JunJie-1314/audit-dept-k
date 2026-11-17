import { NextResponse } from 'next/server';
import {
  isPrinciplesAuthenticated,
  issuePrinciplesToken,
  noStore,
  principlesCookie,
  principlesPassword,
  principlesSessionConfig,
  verifyPrinciplesPassword,
} from '@/lib/principles/session';

/**
 * POST   /api/principles/session —— 口令登录，签发独立的原则会话 Cookie
 * DELETE /api/principles/session —— 注销
 * GET    /api/principles/session —— 登录态 / 是否已配置（前端据此显示「已同步 / 未同步」）
 *
 * 与财务登录完全独立：独立 cookie、独立环境变量、令牌带 aud=principles。
 * 未配置一律 503 fail-closed；只回错误码，不回显口令，不记录请求体。
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<NextResponse> {
  const cfg = principlesSessionConfig();
  const expected = principlesPassword();
  if (!cfg || !expected) {
    return noStore(NextResponse.json(
      { code: 'PRINCIPLES_AUTH_NOT_CONFIGURED', message: '服务端未配置原则账本鉴权（缺少口令或签名密钥）' },
      { status: 503 },
    ));
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return noStore(NextResponse.json({ code: 'PRINCIPLES_BAD_REQUEST', message: '请求体必须是 JSON' }, { status: 400 }));
  }
  const password = typeof (body as { password?: unknown } | null)?.password === 'string'
    ? (body as { password: string }).password : '';
  if (!password || !verifyPrinciplesPassword(password, expected)) {
    return noStore(NextResponse.json({ code: 'PRINCIPLES_AUTH_FAILED', message: '口令不正确' }, { status: 401 }));
  }
  const res = NextResponse.json({ ok: true, expires_in: cfg.ttlSeconds });
  res.cookies.set(principlesCookie(issuePrinciplesToken(cfg.secret, cfg.ttlSeconds), cfg.ttlSeconds));
  return noStore(res);
}

export async function DELETE(): Promise<NextResponse> {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(principlesCookie('', 0));
  return noStore(res);
}

export async function GET(req: Request): Promise<NextResponse> {
  const cfg = principlesSessionConfig();
  return noStore(NextResponse.json({
    authenticated: !!cfg && isPrinciplesAuthenticated(req),
    configured: !!cfg && !!principlesPassword(),
    mode: 'online',
  }));
}
