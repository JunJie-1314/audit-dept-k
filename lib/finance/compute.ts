/**
 * 财务汇总计算层（三端共用口径：本机 Express / 线上 Next.js / 前端展示）。
 *
 * 计算规则（口径详见 cairn/workbench.md）：
 * - 总资产 = Σ 资产金额（含现金/存款/基金；设备类为非流动，仍计入总资产）。
 * - 总负债 = Σ 负债余额。
 * - 净资产 = 总资产 − 总负债。
 * - 流动资产 = Σ liquidity=liquid 的资产金额。
 * - **可用现金 = Σ liquidity=liquid 的「即时可用额」（available_cents ?? amount_cents）**：
 *   基金显式 available=0 → **浮盈不并入可用现金**；设备 illiquid → 不参与。
 * - **近期到期 = 窗口内负债 `installments[]` 之和 + 窗口内 kind=confirmed 的 out 现金流之和**
 *   （分期只在负债侧记一次，故此式不会重复计入 MacBook）。
 * - **月度净现金流 = 窗口内（收入 − 支出）/ 窗口月数**；支出含负债分期与全部 out 现金流。
 * - **缺失一律置 null（不可用），绝不按 0 处理**；缺失说明并入 `missing`。
 *
 * ⚠️ **本文件是镜像（MIRROR）**：权威实现在主仓库 `workbench/backend/src/finance/compute.ts`。
 */

import type {
  FinanceAsset,
  FinanceCashflow,
  FinanceLiability,
  FinanceSnapshot,
} from './types';
import { FINANCE_SCHEMA_VERSION } from './types';

export const DEFAULT_WINDOW_MONTHS = 6;

export interface OverviewAsset {
  id: string;
  name: string;
  category: string;
  amount_cents: number;
  liquidity: string;
  available_cents: number;
  note?: string;
}

export interface OverviewLiability {
  id: string;
  name: string;
  category: string;
  balance_cents: number;
  rate_note?: string;
  /** 窗口内最近一期到期月（无则 null） */
  next_due_month: string | null;
  next_due_cents: number | null;
  /** 已知分期期数 */
  installment_count: number;
  note?: string;
}

export interface OverviewUpcoming {
  id: string;
  name: string;
  kind: string;
  direction: 'in' | 'out';
  amount_cents: number;
  month: string;
  recurring_monthly?: boolean;
  note?: string;
}

export interface FinanceOverview {
  schema_version: string;
  snapshot_date: string | null;
  currency: string | null;
  generated_at: string;
  total_assets_cents: number | null;
  total_liabilities_cents: number | null;
  net_worth_cents: number | null;
  total_liquid_cents: number | null;
  available_cash_cents: number | null;
  near_term_due_cents: number | null;
  near_term_window_months: number;
  monthly_inflow_cents: number | null;
  monthly_outflow_cents: number | null;
  monthly_net_cashflow_cents: number | null;
  assets: OverviewAsset[];
  liabilities: OverviewLiability[];
  /** 窗口内的现金流（含经常性项目逐月展开） */
  upcoming: OverviewUpcoming[];
  /** 缺失项说明（缺失一律不计为 0） */
  missing: string[];
}

/** `YYYY-MM` + n 个月 */
export function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split('-').map((s) => Number(s));
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${String(ny).padStart(4, '0')}-${String(nm).padStart(2, '0')}`;
}

function windowMonths(snapshotDate: string, count: number): string[] {
  const start = snapshotDate.slice(0, 7); // YYYY-MM
  return Array.from({ length: count }, (_, i) => addMonths(start, i));
}

/** 把现金流按窗口展开为「逐月发生」的条目（recurring 覆盖窗口内每个月） */
function expandCashflows(cashflows: FinanceCashflow[], win: string[]): Array<{ cf: FinanceCashflow; month: string }> {
  const winSet = new Set(win);
  const out: Array<{ cf: FinanceCashflow; month: string }> = [];
  for (const cf of cashflows) {
    if (cf.recurring_monthly) {
      // 经常性项目：month 视为窗口起始，覆盖窗口内所有不早于它的月份
      for (const m of win) if (m >= cf.month) out.push({ cf, month: m });
    } else if (winSet.has(cf.month)) {
      out.push({ cf, month: cf.month });
    }
  }
  return out;
}

export interface SummarizeOptions {
  /** 近期到期/月均现金流的窗口月数，默认 6 */
  windowMonths?: number;
  /** 生成时刻（默认 now；测试可注入以获得确定性） */
  now?: string;
}

/** 由一份财务快照计算总览。纯函数，无副作用。 */
export function summarize(snapshot: FinanceSnapshot, opts: SummarizeOptions = {}): FinanceOverview {
  const windowMonthsCount = Math.max(1, Math.floor(opts.windowMonths ?? DEFAULT_WINDOW_MONTHS));
  const generatedAt = opts.now ?? new Date().toISOString();

  const assets: OverviewAsset[] = snapshot.assets.map((a: FinanceAsset) => ({
    id: a.id,
    name: a.name,
    category: a.category,
    amount_cents: a.amount_cents,
    liquidity: a.liquidity,
    available_cents: a.available_cents ?? a.amount_cents,
    note: a.note,
  }));

  const totalAssets = assets.reduce((s, a) => s + a.amount_cents, 0);
  const totalLiabilities = snapshot.liabilities.reduce((s, l: FinanceLiability) => s + l.balance_cents, 0);

  const liquidAssets = assets.filter((a) => a.liquidity === 'liquid');
  const totalLiquid = liquidAssets.length ? liquidAssets.reduce((s, a) => s + a.amount_cents, 0) : null;
  // 无任何流动资产 → 可用现金不可用（null），而不是 0
  const availableCash = liquidAssets.length
    ? liquidAssets.reduce((s, a) => s + a.available_cents, 0)
    : null;

  const win = windowMonths(snapshot.snapshot_date, windowMonthsCount);

  // 负债侧到期计划
  const liabilityInstallmentsInWindow = snapshot.liabilities.flatMap((l) =>
    (l.installments ?? [])
      .filter((it) => win.includes(it.due_month))
      .map((it) => ({ id: l.id, name: l.name, month: it.due_month, amount_cents: it.amount_cents })),
  );

  const liabilities: OverviewLiability[] = snapshot.liabilities.map((l) => {
    const dues = [...(l.installments ?? [])].sort((a, b) => a.due_month.localeCompare(b.due_month));
    const next = dues.find((it) => it.due_month >= win[0]) ?? dues[0] ?? null;
    return {
      id: l.id,
      name: l.name,
      category: l.category,
      balance_cents: l.balance_cents,
      rate_note: l.rate_note,
      next_due_month: next ? next.due_month : null,
      next_due_cents: next ? next.amount_cents : null,
      installment_count: dues.length,
      note: l.note,
    };
  });

  // 现金流展开
  const occurrences = expandCashflows(snapshot.cashflows, win);
  const inflow = occurrences.filter((o) => o.cf.direction === 'in');
  const outflow = occurrences.filter((o) => o.cf.direction === 'out');

  const inflowTotal = inflow.reduce((s, o) => s + o.cf.amount_cents, 0);
  const outflowCashTotal = outflow.reduce((s, o) => s + o.cf.amount_cents, 0);
  const installmentOutTotal = liabilityInstallmentsInWindow.reduce((s, i) => s + i.amount_cents, 0);
  const outflowTotal = outflowCashTotal + installmentOutTotal;

  // 窗口内无任何现金流且无分期 → 月度净现金流不可用（null）
  const hasAnyFlow = occurrences.length > 0 || liabilityInstallmentsInWindow.length > 0;
  const monthlyInflow = hasAnyFlow ? Math.round(inflowTotal / windowMonthsCount) : null;
  const monthlyOutflow = hasAnyFlow ? Math.round(outflowTotal / windowMonthsCount) : null;
  const monthlyNet = hasAnyFlow ? Math.round((inflowTotal - outflowTotal) / windowMonthsCount) : null;

  // 近期到期 = 负债分期（窗口内） + 已确认 out 现金流（窗口内）
  const confirmedOut = outflow.filter((o) => o.cf.kind === 'confirmed').reduce((s, o) => s + o.cf.amount_cents, 0);
  const nearTermDue = installmentOutTotal + confirmedOut;

  const upcoming: OverviewUpcoming[] = [
    ...occurrences.map((o) => ({
      id: o.cf.id,
      name: o.cf.name,
      kind: o.cf.kind,
      direction: o.cf.direction,
      amount_cents: o.cf.amount_cents,
      month: o.month,
      recurring_monthly: o.cf.recurring_monthly,
      note: o.cf.note,
    })),
    ...liabilityInstallmentsInWindow.map((i) => ({
      id: `${i.id}#due`,
      name: i.name,
      kind: 'confirmed',
      direction: 'out' as const,
      amount_cents: i.amount_cents,
      month: i.month,
      note: '负债到期计划',
    })),
  ].sort((a, b) => a.month.localeCompare(b.month));

  const missing = [...snapshot.missing_fields];
  if (availableCash === null) missing.push('流动资产为空：可用现金不可用');
  if (!hasAnyFlow) missing.push('窗口内无现金流记录：月度净现金流不可用');

  return {
    schema_version: FINANCE_SCHEMA_VERSION,
    snapshot_date: snapshot.snapshot_date ?? null,
    currency: snapshot.currency ?? null,
    generated_at: generatedAt,
    total_assets_cents: totalAssets,
    total_liabilities_cents: totalLiabilities,
    net_worth_cents: totalAssets - totalLiabilities,
    total_liquid_cents: totalLiquid,
    available_cash_cents: availableCash,
    near_term_due_cents: nearTermDue,
    near_term_window_months: windowMonthsCount,
    monthly_inflow_cents: monthlyInflow,
    monthly_outflow_cents: monthlyOutflow,
    monthly_net_cashflow_cents: monthlyNet,
    assets,
    liabilities,
    upcoming,
    missing: Array.from(new Set(missing)),
  };
}
