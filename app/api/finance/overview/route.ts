import { NextResponse } from 'next/server';
import { noStore, requireAuth } from '@/lib/finance/session';
import { getSnapshot, FinanceStoreError, storeConfigured } from '@/lib/finance/store';
import { summarize, DEFAULT_WINDOW_MONTHS } from '@/lib/finance/compute';

/**
 * GET /api/finance/overview —— 总资产/总负债/净资产/可用现金/近期到期/月度净现金流。
 * 必须登录；数据源不可用或未导入时失败关闭（不返回任何真实金额）。
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
    const snapshot = await getSnapshot();
    if (!snapshot) {
      return noStore(
        NextResponse.json({ code: 'FINANCE_NO_DATA', message: '尚未导入财务数据' }, { status: 404 }),
      );
    }
    const windowRaw = Number(new URL(req.url).searchParams.get('window_months') ?? '');
    const windowMonths = Number.isFinite(windowRaw) && windowRaw >= 1 && windowRaw <= 36
      ? Math.floor(windowRaw)
      : DEFAULT_WINDOW_MONTHS;
    const overview = summarize(snapshot, { windowMonths });
    return noStore(NextResponse.json(overview));
  } catch (e) {
    // 只记错误码，不记响应体/数据
    const code = e instanceof FinanceStoreError ? e.code : 'FINANCE_OVERVIEW_FAILED';
    return noStore(
      NextResponse.json({ code, message: '财务数据源不可用' }, { status: 503 }),
    );
  }
}
