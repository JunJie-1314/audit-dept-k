// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  FINANCE_SESSION_COOKIE,
  issueToken,
  verifyToken,
  verifyPassword,
  sessionConfig,
  financePassword,
  isAuthenticated,
} from '@/lib/finance/session';
import { POST as sessionPost, DELETE as sessionDelete, GET as sessionGet } from '@/app/api/finance/session/route';
import { GET as overviewGet } from '@/app/api/finance/overview/route';
import { GET as historyGet } from '@/app/api/finance/history/route';
import { POST as importPost } from '@/app/api/finance/import/route';
import { FINANCE_SCHEMA_VERSION } from '@/lib/finance/types';

const SECRET = 'test-secret-please-16chars-min';
const PASSWORD = 'correct-horse-battery';

function req(url: string, init: RequestInit = {}): Request {
  return new Request(`https://kaudit.cn${url}`, init);
}

function authed(url: string, init: RequestInit = {}): Request {
  const token = issueToken(SECRET, 3600);
  const headers = new Headers(init.headers);
  headers.set('cookie', `${FINANCE_SESSION_COOKIE}=${token}`);
  return req(url, { ...init, headers });
}

function fakeSnapshot(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema_version: FINANCE_SCHEMA_VERSION,
    snapshot_date: '2026-10-11',
    currency: 'CNY',
    assets: [{ id: 'c', name: '现金', category: 'cash', amount_cents: 100, liquidity: 'liquid' }],
    liabilities: [{ id: 'l', name: '贷款', category: 'student_loan', balance_cents: 50 }],
    cashflows: [{ id: 'f', name: '奖学金', kind: 'estimated', direction: 'in', amount_cents: 200, month: '2026-11' }],
    missing_fields: [],
    ...over,
  };
}

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env.FINANCE_SESSION_SECRET = SECRET;
  process.env.FINANCE_PASSWORD = PASSWORD;
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.restoreAllMocks();
});

describe('lib/finance/session', () => {
  it('口令比较常量时间且拒绝错误口令', () => {
    expect(verifyPassword(PASSWORD, PASSWORD)).toBe(true);
    expect(verifyPassword('nope', PASSWORD)).toBe(false);
    expect(verifyPassword('', PASSWORD)).toBe(false);
    expect(verifyPassword(PASSWORD + 'x', PASSWORD)).toBe(false);
  });

  it('签名令牌可校验、篡改与过期即失败', () => {
    const now = Date.now();
    const token = issueToken(SECRET, 60, now);
    expect(verifyToken(token, SECRET, now)).toBe(true);
    expect(verifyToken(token, 'another-secret-16chars!!', now)).toBe(false);
    expect(verifyToken(`${token}x`, SECRET, now)).toBe(false);
    expect(verifyToken(token, SECRET, now + 61_000)).toBe(false);
    expect(verifyToken('garbage', SECRET, now)).toBe(false);
  });

  it('密钥过短视为未配置（fail-closed）', () => {
    process.env.FINANCE_SESSION_SECRET = 'short';
    expect(sessionConfig()).toBeNull();
    process.env.FINANCE_PASSWORD = '';
    expect(financePassword()).toBeNull();
  });

  it('isAuthenticated 只认有效 cookie', () => {
    const good = authed('/x');
    expect(isAuthenticated(good)).toBe(true);
    expect(isAuthenticated(req('/x'))).toBe(false);
  });
});

describe('POST/DELETE/GET /api/finance/session', () => {
  it('未配置口令 → 503 fail-closed', async () => {
    delete process.env.FINANCE_PASSWORD;
    const res = await sessionPost(req('/api/finance/session', { method: 'POST', body: JSON.stringify({ password: PASSWORD }) }));
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe('FINANCE_AUTH_NOT_CONFIGURED');
  });

  it('错误口令 → 401 且不签发 cookie', async () => {
    const res = await sessionPost(req('/api/finance/session', { method: 'POST', body: JSON.stringify({ password: 'wrong' }) }));
    expect(res.status).toBe(401);
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('正确口令 → 200 且 cookie 为 HttpOnly; Secure; SameSite=Strict', async () => {
    const res = await sessionPost(req('/api/finance/session', { method: 'POST', body: JSON.stringify({ password: PASSWORD }) }));
    expect(res.status).toBe(200);
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain(`${FINANCE_SESSION_COOKIE}=`);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/Secure/i);
    expect(setCookie).toMatch(/SameSite=Strict/i);
    expect(res.headers.get('cache-control')).toContain('no-store');
  });

  it('DELETE 清空 cookie', async () => {
    const res = await sessionDelete();
    expect(res.status).toBe(200);
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toMatch(/Max-Age=0/i);
  });

  it('GET 返回登录态', async () => {
    const res = await sessionGet(authed('/api/finance/session'));
    expect((await res.json()).authenticated).toBe(true);
  });
});

describe('受保护路由：未登录一律拒绝', () => {
  it('overview 未登录 → 401', async () => {
    const res = await overviewGet(req('/api/finance/overview'));
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe('FINANCE_UNAUTHORIZED');
  });

  it('history 未登录 → 401', async () => {
    expect((await historyGet(req('/api/finance/history'))).status).toBe(401);
  });

  it('import 未登录 → 401', async () => {
    const res = await importPost(req('/api/finance/import', { method: 'POST', body: JSON.stringify(fakeSnapshot()) }));
    expect(res.status).toBe(401);
  });
});

describe('受保护路由：已登录但存储未配置 → 503 fail-closed', () => {
  it('overview/history/import 均 503', async () => {
    expect((await overviewGet(authed('/api/finance/overview'))).status).toBe(503);
    expect((await historyGet(authed('/api/finance/history'))).status).toBe(503);
    expect((await importPost(authed('/api/finance/import', { method: 'POST', body: JSON.stringify(fakeSnapshot()) }))).status).toBe(503);
  });
});

describe('导入接口：契约校验失败不落库', () => {
  beforeEach(() => {
    process.env.KV_REST_API_URL = 'https://redis.example/';
    process.env.KV_REST_API_TOKEN = 'token';
  });

  it('非法快照 → 400 且不发任何写命令', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ result: 'OK' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const res = await importPost(
      authed('/api/finance/import', { method: 'POST', body: JSON.stringify({ schema_version: 'wrong' }) }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('FINANCE_CONTRACT_INVALID');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('合法快照 → 200 且写入 latest/history', async () => {
    const commands: unknown[] = [];
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const cmd = JSON.parse(String(init?.body));
      commands.push(cmd);
      // GET history 返回空数组；其余返回 OK
      const result = cmd[0] === 'GET' ? null : 'OK';
      return new Response(JSON.stringify({ result }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const res = await importPost(
      authed('/api/finance/import', { method: 'POST', body: JSON.stringify({ snapshot: fakeSnapshot() }) }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).snapshot_date).toBe('2026-10-11');
    const sets = commands.filter((c) => Array.isArray(c) && (c as string[])[0] === 'SET');
    expect(sets.length).toBe(2);
  });
});

describe('总览接口：已登录 + 已配置存储', () => {
  beforeEach(() => {
    process.env.KV_REST_API_URL = 'https://redis.example';
    process.env.KV_REST_API_TOKEN = 'token';
  });

  it('无数据 → 404 FINANCE_NO_DATA', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ result: null }), { status: 200 })));
    const res = await overviewGet(authed('/api/finance/overview'));
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe('FINANCE_NO_DATA');
  });

  it('有数据 → 200 返回总览且不缓存', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ result: JSON.stringify(fakeSnapshot()) }), { status: 200 })));
    const res = await overviewGet(authed('/api/finance/overview'));
    expect(res.status).toBe(200);
    const ov = await res.json();
    expect(ov.total_assets_cents).toBe(100);
    expect(ov.net_worth_cents).toBe(50);
    expect(res.headers.get('cache-control')).toContain('no-store');
  });
});
