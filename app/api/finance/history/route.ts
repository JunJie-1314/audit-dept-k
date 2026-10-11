import { NextResponse } from 'next/server';
import { noStore, requireAuth } from '@/lib/finance/session';
import { getHistory, FinanceStoreError, storeConfigured } from '@/lib/finance/store';

/**
 * GET /api/finance/history —— 历史快照摘要（最新在前）。
 * 必须登录；未配置存储时失败关闭。
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<NextResponse> {
  const denied = requireAuth(req);
  if (denied) return denied;

  if (!storeConfigured()) {
    return noStore(
      NextResponse.json({ code: 'FINANCE_STORE_NOT_CONFIGURED', message: '服务端未配置财务私有存储' }, { status: 503 }),
    );
  }

  try {
    const entries = await getHistory();
    return noStore(NextResponse.json({ entries }));
  } catch (e) {
    const code = e instanceof FinanceStoreError ? e.code : 'FINANCE_HISTORY_FAILED';
    return noStore(NextResponse.json({ code, message: '财务历史源不可用' }, { status: 503 }));
  }
}
