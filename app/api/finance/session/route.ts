import { NextResponse } from 'next/server';
import {
  FINANCE_SESSION_COOKIE,
  financePassword,
  isAuthenticated,
  issueToken,
  noStore,
  sessionConfig,
  verifyPassword,
} from '@/lib/finance/session';

/**
 * POST   /api/finance/session —— 口令登录，签发短期 HttpOnly 会话 Cookie
 * DELETE /api/finance/session —— 注销并清除 Cookie
 * GET    /api/finance/session —— 查询当前登录态（前端据此渲染登录/导入入口）
 *
 * fail-closed：未配置口令/密钥一律 503，绝不匿名放行。
 * 只回错误码，不回显口令，也不记录请求体。
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<NextResponse> {
  const cfg = sessionConfig();
  const expected = financePassword();
  if (!cfg || !expected) {
    return noStore(
      NextResponse.json(
        { code: 'FINANCE_AUTH_NOT_CONFIGURED', message: '服务端未配置财务鉴权（缺少口令或签名密钥）' },
        { status: 503 },
      ),
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return noStore(NextResponse.json({ code: 'FINANCE_BAD_REQUEST', message: '请求体必须是 JSON' }, { status: 400 }));
  }
  const password = typeof (body as { password?: unknown } | null)?.password === 'string'
    ? ((body as { password: string }).password)
    : '';

  if (!password || !verifyPassword(password, expected)) {
    // 不区分「未提供」与「错误」，避免信息泄露；不记录输入
    return noStore(NextResponse.json({ code: 'FINANCE_AUTH_FAILED', message: '口令不正确' }, { status: 401 }));
  }

  const token = issueToken(cfg.secret, cfg.ttlSeconds);
  const res = NextResponse.json({ ok: true, expires_in: cfg.ttlSeconds });
  res.cookies.set({
    name: FINANCE_SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/',
    maxAge: cfg.ttlSeconds,
  });
  return noStore(res);
}

export async function DELETE(): Promise<NextResponse> {
  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: FINANCE_SESSION_COOKIE,
    value: '',
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/',
    maxAge: 0,
  });
  return noStore(res);
}

export async function GET(req: Request): Promise<NextResponse> {
  const cfg = sessionConfig();
  return noStore(
    NextResponse.json({
      authenticated: !!cfg && isAuthenticated(req),
      configured: !!cfg && !!financePassword(),
      mode: 'online',
    }),
  );
}
