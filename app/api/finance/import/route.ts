import { NextResponse } from 'next/server';
import { noStore, requireAuth } from '@/lib/finance/session';
import { putSnapshot, FinanceStoreError, storeConfigured } from '@/lib/finance/store';
import { validateFinanceSnapshot } from '@/lib/finance/contract';

/**
 * POST /api/finance/import —— 接收本机文件导入的规范化财务快照。
 *
 * - 必须登录；
 * - 请求体 = 快照本身，或 `{ snapshot: <快照> }`；
 * - **契约校验失败一律 400 且不落库**（fail-closed）；
 * - 不记录请求体。
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<NextResponse> {
  const denied = requireAuth(req);
  if (denied) return denied;

  if (!storeConfigured()) {
    return noStore(
      NextResponse.json({ code: 'FINANCE_STORE_NOT_CONFIGURED', message: '服务端未配置财务私有存储' }, { status: 503 }),
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return noStore(NextResponse.json({ code: 'FINANCE_BAD_REQUEST', message: '请求体必须是 JSON' }, { status: 400 }));
  }

  const candidate = (body as { snapshot?: unknown } | null)?.snapshot ?? body;
  const result = validateFinanceSnapshot(candidate);
  if (!result.ok) {
    // 不落库；只回契约错误明细（不含金额）
    return noStore(
      NextResponse.json(
        { code: 'FINANCE_CONTRACT_INVALID', message: '财务快照契约校验失败，未写入', errors: result.errors },
        { status: 400 },
      ),
    );
  }

  try {
    const entry = await putSnapshot(result.value);
    return noStore(NextResponse.json({ ok: true, snapshot_date: entry.snapshot_date }));
  } catch (e) {
    const code = e instanceof FinanceStoreError ? e.code : 'FINANCE_IMPORT_FAILED';
    return noStore(NextResponse.json({ code, message: '导入写入失败' }, { status: 503 }));
  }
}
