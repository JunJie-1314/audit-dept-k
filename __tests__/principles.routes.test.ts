// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  PRINCIPLES_SESSION_COOKIE,
  issuePrinciplesToken,
  principlesSessionConfig,
  verifyPrinciplesToken,
} from '@/lib/principles/session';
import { issueToken as issueFinanceToken } from '@/lib/finance/session';
import { POST as sessionPost, DELETE as sessionDelete, GET as sessionGet } from '@/app/api/principles/session/route';
import { GET as usageGet, POST as usagePost } from '@/app/api/principles/usage/route';
import { GET as backupGet, POST as backupPost } from '@/app/api/principles/backup/route';
import { newEventId, newPrincipleId, principleFingerprint, type PrincipleUsageEventInput } from '@/lib/principles/contract';

/** 与 store 测试同款的极简内存 Redis（Upstash REST 单命令语义）。 */
class MemoryRedis {
  readonly strings = new Map<string, string>();
  readonly expiry = new Map<string, number>();
  private live(key: string): boolean {
    const until = this.expiry.get(key);
    if (until !== undefined && Date.now() >= until) { this.strings.delete(key); this.expiry.delete(key); return false; }
    return this.strings.has(key);
  }
  command = async (args: Array<string | number>): Promise<unknown> => {
    const [name, ...rest] = args.map(String);
    switch (name) {
      case 'GET': return this.live(rest[0]) ? this.strings.get(rest[0]) ?? null : null;
      case 'SET': {
        if (rest.includes('NX') && this.live(rest[0])) return null;
        this.strings.set(rest[0], rest[1]);
        const px = rest.indexOf('PX');
        if (px >= 0) this.expiry.set(rest[0], Date.now() + Number(rest[px + 1]));
        else this.expiry.delete(rest[0]);
        return 'OK';
      }
      case 'DEL': { const had = this.live(rest[0]); this.strings.delete(rest[0]); this.expiry.delete(rest[0]); return had ? 1 : 0; }
      case 'EVAL': {
        const script = String(rest[0]);
        const count = Number(rest[1]);
        const keys = rest.slice(2, 2 + count);
        const argv = rest.slice(2 + count);
        if (script === 'return 1') return 1;
        if (script.includes("redis.call('DEL'")) {
          if (this.live(keys[0]) && (this.strings.get(keys[0]) ?? '') === argv[0]) { this.strings.delete(keys[0]); this.expiry.delete(keys[0]); return 1; }
          return 0;
        }
        if (script.includes('local current')) {
          if ((this.strings.get(keys[0]) ?? '') !== argv[0]) return 0;
          if ((this.strings.get(keys[1]) ?? '') !== (argv[1] ?? '')) return -1;
          if (this.live(keys[2])) return -2;
          this.strings.set(keys[2], argv[2]);
          this.strings.set(keys[3], argv[3]);
          return 1;
        }
        throw new Error('unsupported eval');
      }
      default: throw new Error(`unsupported ${name}`);
    }
  };
}

const SECRET = 'principles-test-secret-16';
const PASSWORD = 'principles-password';
const ORIGINAL_ENV = { ...process.env };
let memory: MemoryRedis;

function req(url: string, init: RequestInit = {}): Request {
  return new Request(`https://kaudit.cn${url}`, init);
}

function withCookie(url: string, init: RequestInit = {}, cookieName = PRINCIPLES_SESSION_COOKIE, token = issuePrinciplesToken(SECRET, 3600)): Request {
  const headers = new Headers(init.headers);
  headers.set('cookie', `${cookieName}=${token}`);
  return req(url, { ...init, headers });
}

function sampleEvent(over: Partial<PrincipleUsageEventInput> = {}): PrincipleUsageEventInput {
  return {
    version: 1,
    eventId: newEventId(1700000000000, () => 0.5),
    op: 'use',
    deviceId: 'dev_routes01',
    clientTime: '2026-11-17T03:00:00.000Z',
    principle: {
      id: newPrincipleId(1700000000000, () => 0.5),
      week: 'W46',
      system: 'social',
      eventIndex: '11/09 memo',
      title: '交情用一次少一次',
      fingerprint: principleFingerprint('交情用一次少一次'),
    },
    ...over,
  };
}

beforeEach(() => {
  memory = new MemoryRedis();
  process.env.PRINCIPLES_SESSION_SECRET = SECRET;
  process.env.PRINCIPLES_PASSWORD = PASSWORD;
  process.env.KV_REST_API_URL = 'https://fake-upstash.local';
  process.env.KV_REST_API_TOKEN = 'fake-token';
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
    const command = JSON.parse(String(init?.body ?? '[]')) as Array<string | number>;
    const result = await memory.command(command);
    return new Response(JSON.stringify({ result }), {
      status: 200, headers: { 'content-type': 'application/json' },
    });
  }));
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('/api/principles/session', () => {
  it('未配置口令/密钥 → 503 fail-closed', async () => {
    delete process.env.PRINCIPLES_PASSWORD;
    const res = await sessionPost(req('/api/principles/session', { method: 'POST', body: JSON.stringify({ password: PASSWORD }) }));
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe('PRINCIPLES_AUTH_NOT_CONFIGURED');
  });

  it('错误口令 401 且不签发 Cookie', async () => {
    const res = await sessionPost(req('/api/principles/session', { method: 'POST', body: JSON.stringify({ password: 'nope' }) }));
    expect(res.status).toBe(401);
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('正确口令签发独立 HttpOnly; Secure; SameSite=Strict Cookie', async () => {
    const res = await sessionPost(req('/api/principles/session', { method: 'POST', body: JSON.stringify({ password: PASSWORD }) }));
    expect(res.status).toBe(200);
    const cookie = res.headers.get('set-cookie') ?? '';
    expect(cookie).toContain(`${PRINCIPLES_SESSION_COOKIE}=`);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Secure/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(cookie).toContain('Path=/api/principles');
    const token = decodeURIComponent(cookie.split(';')[0].split('=')[1]);
    const payload = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString('utf8'));
    expect(payload.aud).toBe('principles');
    expect(res.headers.get('cache-control')).toContain('no-store');
  });

  it('财务令牌不能串权限（aud 不同，即使 secret 相同）', async () => {
    const financeToken = issueFinanceToken(SECRET, 3600);
    expect(verifyPrinciplesToken(financeToken, SECRET)).toBe(false);
    const res = await usageGet(withCookie('/api/principles/usage', {}, PRINCIPLES_SESSION_COOKIE, financeToken));
    expect(res.status).toBe(401);
  });

  it('GET 报告登录态；DELETE 清空 Cookie', async () => {
    expect((await (await sessionGet(req('/api/principles/session'))).json()).authenticated).toBe(false);
    const authed = await sessionGet(withCookie('/api/principles/session'));
    expect((await authed.json()).authenticated).toBe(true);
    const deleted = await sessionDelete();
    expect(deleted.headers.get('set-cookie')).toContain(`${PRINCIPLES_SESSION_COOKIE}=`);
    expect(deleted.headers.get('set-cookie')).toMatch(/Max-Age=0/i);
  });

  it('密钥过短视为未配置', () => {
    process.env.PRINCIPLES_SESSION_SECRET = 'short';
    expect(principlesSessionConfig()).toBeNull();
  });
});

describe('/api/principles/usage', () => {
  it('未登录 401；未配置存储 503', async () => {
    expect((await usageGet(req('/api/principles/usage'))).status).toBe(401);
    expect((await usagePost(req('/api/principles/usage', { method: 'POST', body: JSON.stringify({ events: [sampleEvent()] }) }))).status).toBe(401);
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    const res = await usageGet(withCookie('/api/principles/usage'));
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe('PRINCIPLES_STORE_NOT_CONFIGURED');
  });

  it('登录后可写入并读回；重试幂等', async () => {
    const event = sampleEvent();
    const first = await usagePost(withCookie('/api/principles/usage', {
      method: 'POST', body: JSON.stringify({ events: [event] }),
    }));
    expect(first.status).toBe(200);
    const firstBody = await first.json();
    expect(firstBody.accepted).toHaveLength(1);
    expect(firstBody.summary.total).toBe(1);

    const retry = await usagePost(withCookie('/api/principles/usage', {
      method: 'POST', body: JSON.stringify({ events: [event] }),
    }));
    expect(retry.status).toBe(200);
    const retryBody = await retry.json();
    expect(retryBody.duplicates).toHaveLength(1);
    expect(retryBody.summary.total).toBe(1);

    const read = await usageGet(withCookie('/api/principles/usage'));
    expect(read.status).toBe(200);
    expect((await read.json()).total).toBe(1);
    expect(read.headers.get('cache-control')).toContain('no-store');
  });

  it('非法请求体 400；同 ID 不同载荷 409', async () => {
    const bad = await usagePost(withCookie('/api/principles/usage', { method: 'POST', body: JSON.stringify({ events: [{ version: 1 }] }) }));
    expect(bad.status).toBe(400);
    const event = sampleEvent();
    await usagePost(withCookie('/api/principles/usage', { method: 'POST', body: JSON.stringify({ events: [event] }) }));
    const conflict = await usagePost(withCookie('/api/principles/usage', {
      method: 'POST', body: JSON.stringify({ events: [{ ...event, op: 'undo', targetEventId: newEventId(2, () => 0.2) }] }),
    }));
    expect(conflict.status).toBe(409);
    expect((await conflict.json()).code).toBe('PRINCIPLES_EVENT_CONFLICT');
  });
});

describe('/api/principles/backup', () => {
  it('未登录 401；登录后导出→预演→恢复→重复恢复不倍增', async () => {
    expect((await backupGet(req('/api/principles/backup'))).status).toBe(401);
    await usagePost(withCookie('/api/principles/usage', { method: 'POST', body: JSON.stringify({ events: [sampleEvent()] }) }));
    const exported = await backupGet(withCookie('/api/principles/backup'));
    expect(exported.status).toBe(200);
    const backup = await exported.json();
    expect(backup.checksum).toMatch(/^[0-9a-f]{8}$/);
    expect(backup.events).toHaveLength(1);

    // 清空账本，模拟换设备/重建后恢复。
    memory.strings.clear();
    const dry = await backupPost(withCookie('/api/principles/backup', {
      method: 'POST', body: JSON.stringify({ backup, dryRun: true }),
    }));
    expect((await dry.json()).dryRun).toBe(true);
    expect((await (await usageGet(withCookie('/api/principles/usage'))).json()).total).toBe(0);

    const restored = await backupPost(withCookie('/api/principles/backup', {
      method: 'POST', body: JSON.stringify({ backup }),
    }));
    expect((await restored.json()).imported).toBe(1);
    const again = await backupPost(withCookie('/api/principles/backup', {
      method: 'POST', body: JSON.stringify({ backup }),
    }));
    expect((await again.json()).imported).toBe(0);
    expect((await (await usageGet(withCookie('/api/principles/usage'))).json()).total).toBe(1);
  });

  it('校验和被篡改 → 400 且不写入', async () => {
    await usagePost(withCookie('/api/principles/usage', { method: 'POST', body: JSON.stringify({ events: [sampleEvent()] }) }));
    const backup = await (await backupGet(withCookie('/api/principles/backup'))).json();
    const res = await backupPost(withCookie('/api/principles/backup', {
      method: 'POST', body: JSON.stringify({ backup: { ...backup, checksum: '00000000' } }),
    }));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('PRINCIPLES_BACKUP_INVALID');
  });
});
