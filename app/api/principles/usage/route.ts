import { NextResponse } from 'next/server';
import { noStore, requirePrinciplesAuth } from '@/lib/principles/session';
import {
  PrinciplesStoreError,
  createRedisClient,
  getSummary,
  principlesStoreConfigured,
  recordEvents,
} from '@/lib/principles/store';

/**
 * GET  /api/principles/usage —— 读取原则使用计数（跨设备一致的事实来源）
 * POST /api/principles/usage —— 写入一批手动「用过一次 / 撤销」事件
 *
 * 全部需要原则会话；未配置私有存储 503；未登录 401。
 * 写接口幂等：同 eventId 同载荷重复提交只返回原回执，不重复计数。
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function unavailable(): NextResponse {
  return noStore(NextResponse.json(
    { code: 'PRINCIPLES_STORE_NOT_CONFIGURED', message: '服务端未配置原则账本私有存储' },
    { status: 503 },
  ));
}

export async function GET(req: Request): Promise<NextResponse> {
  const denied = requirePrinciplesAuth(req);
  if (denied) return denied;
  if (!principlesStoreConfigured()) return unavailable();
  try {
    return noStore(NextResponse.json(await getSummary(createRedisClient())));
  } catch (error) {
    const code = error instanceof PrinciplesStoreError ? error.code : 'PRINCIPLES_READ_FAILED';
    const status = error instanceof PrinciplesStoreError ? error.status : 503;
    return noStore(NextResponse.json({ code, message: '读取原则使用记录失败' }, { status }));
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  const denied = requirePrinciplesAuth(req);
  if (denied) return denied;
  if (!principlesStoreConfigured()) return unavailable();
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return noStore(NextResponse.json({ code: 'PRINCIPLES_BAD_REQUEST', message: '请求体必须是 JSON' }, { status: 400 }));
  }
  const events = (body as { events?: unknown } | null)?.events;
  try {
    return noStore(NextResponse.json(await recordEvents(createRedisClient(), events)));
  } catch (error) {
    const code = error instanceof PrinciplesStoreError ? error.code : 'PRINCIPLES_WRITE_FAILED';
    const status = error instanceof PrinciplesStoreError ? error.status : 503;
    const message = error instanceof PrinciplesStoreError ? error.message : '写入原则使用记录失败';
    return noStore(NextResponse.json({ code, message }, { status }));
  }
}
