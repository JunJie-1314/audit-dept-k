// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { validateFinanceSnapshot, assertFinanceSnapshot } from '@/lib/finance/contract';
import { summarize, addMonths, DEFAULT_WINDOW_MONTHS } from '@/lib/finance/compute';
import { FINANCE_SCHEMA_VERSION } from '@/lib/finance/types';
import { storeConfig, storeConfigured } from '@/lib/finance/store';

/** 合成快照（脱敏）：现金 10 元即用 / 基金 5 元 / 设备 8 元；贷款 20；分期 6 */
const SYNTH = {
  schema_version: FINANCE_SCHEMA_VERSION,
  snapshot_date: '2026-10-11',
  currency: 'CNY',
  assets: [
    { id: 'cash', name: '即用现金', category: 'cash', amount_cents: 1000, liquidity: 'liquid', available_cents: 1000 },
    { id: 'fund', name: '基金', category: 'fund', amount_cents: 500, liquidity: 'liquid', available_cents: 0 },
    { id: 'device', name: '设备', category: 'device', amount_cents: 800, liquidity: 'illiquid' },
  ],
  liabilities: [
    { id: 'loan', name: '助学贷款', category: 'student_loan', balance_cents: 2000 },
    { id: 'inst', name: '六期免息', category: 'installment', balance_cents: 600, installments: [{ due_month: '2026-11', amount_cents: 100 }] },
  ],
  cashflows: [{ id: 'in', name: '奖学金', kind: 'estimated', direction: 'in', amount_cents: 1500, month: '2026-11' }],
  missing_fields: [],
} as const;

describe('镜像健全性：契约与计算口径与主仓库一致', () => {
  it('schema 版本号为 v1', () => {
    expect(FINANCE_SCHEMA_VERSION).toBe('finance.snapshot.v1');
  });

  it('合法快照通过、非法快照被拒', () => {
    expect(validateFinanceSnapshot(SYNTH).ok).toBe(true);
    expect(validateFinanceSnapshot({ ...SYNTH, snapshot_date: '2026/10/11' }).ok).toBe(false);
    expect(validateFinanceSnapshot({ ...SYNTH, assets: [{ id: 'a', name: 'x', category: 'cash', amount_cents: 1.5, liquidity: 'liquid' }] }).ok).toBe(false);
  });

  it('总览口径：净资产 / 可用现金（基金与设备不计入） / 近期到期', () => {
    const ov = summarize(assertFinanceSnapshot(SYNTH), { now: '2026-10-11T00:00:00.000Z' });
    expect(ov.total_assets_cents).toBe(2300);
    expect(ov.total_liabilities_cents).toBe(2600);
    expect(ov.net_worth_cents).toBe(-300);
    expect(ov.available_cash_cents).toBe(1000);
    expect(ov.near_term_due_cents).toBe(100);
    expect(ov.near_term_window_months).toBe(DEFAULT_WINDOW_MONTHS);
  });

  it('缺失不当 0：无流动资金 → 可用现金 null', () => {
    const ov = summarize(assertFinanceSnapshot({ ...SYNTH, assets: [SYNTH.assets[2]] }));
    expect(ov.available_cash_cents).toBeNull();
  });

  it('addMonths 跨年正确', () => {
    expect(addMonths('2026-10', 3)).toBe('2027-01');
  });
});

describe('镜像健全性：持久化配置 fail-closed', () => {
  it('未配置环境变量时 storeConfigured 为 false', () => {
    const saved = { ...process.env };
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    expect(storeConfigured()).toBe(false);
    expect(storeConfig()).toBeNull();
    process.env = saved;
  });
});
