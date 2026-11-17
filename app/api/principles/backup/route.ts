import { NextResponse } from 'next/server';
import { noStore, requirePrinciplesAuth } from '@/lib/principles/session';
import {
  PrinciplesStoreError,
  createRedisClient,
  exportBackup,
  principlesStoreConfigured,
  restoreBackup,
} from '@/lib/principles/store';

/**
 * GET  /api/principles/backup —— 导出完整账本（catalog + events + checksum）
 * POST /api/principles/backup —— 恢复：全量校验 + 校验和；`dryRun: true` 只预演
 *
 * 恢复按 eventId 合并，重复恢复不会加倍；与现有账本同 ID 不同载荷时整批拒绝（409）。
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
    return noStore(NextResponse.json(await exportBackup(createRedisClient())));
  } catch (error) {
    const code = error instanceof PrinciplesStoreError ? error.code : 'PRINCIPLES_EXPORT_FAILED';
    return noStore(NextResponse.json({ code, message: '导出原则账本失败' }, { status: 503 }));
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
  const payload = body as { backup?: unknown; dryRun?: unknown } | null;
  const backup = payload?.backup ?? body;
  const dryRun = payload?.dryRun === true;
  try {
    return noStore(NextResponse.json(await restoreBackup(createRedisClient(), backup, { dryRun })));
  } catch (error) {
    const code = error instanceof PrinciplesStoreError ? error.code : 'PRINCIPLES_RESTORE_FAILED';
    const status = error instanceof PrinciplesStoreError ? error.status : 503;
    const message = error instanceof PrinciplesStoreError ? error.message : '恢复原则账本失败';
    return noStore(NextResponse.json({ code, message }, { status }));
  }
}
