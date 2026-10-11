/**
 * 财务快照契约校验（fail-closed）。
 *
 * 手写校验、零第三方依赖——线上站点仓库要能原样镜像（serverless 不便引入 schema 库）。
 * 任何一条不满足即整体拒绝：导入接口在校验失败时**不落库**。
 *
 * ⚠️ **本文件是镜像（MIRROR）**：权威实现在主仓库 `workbench/backend/src/finance/contract.ts`。
 */

import {
  FINANCE_SCHEMA_VERSION,
  type AssetCategory,
  type CashflowKind,
  type FinanceAsset,
  type FinanceCashflow,
  type FinanceInstallment,
  type FinanceLiability,
  type FinanceSnapshot,
  type LiabilityCategory,
  type Liquidity,
} from './types';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

const ASSET_CATEGORIES: readonly AssetCategory[] = ['cash', 'deposit', 'fund', 'device', 'receivable', 'other'];
const LIABILITY_CATEGORIES: readonly LiabilityCategory[] = ['student_loan', 'installment', 'credit', 'other'];
const LIQUIDITIES: readonly Liquidity[] = ['liquid', 'illiquid'];
const CASHFLOW_KINDS: readonly CashflowKind[] = ['confirmed', 'estimated'];

export class FinanceContractError extends Error {
  readonly errors: string[];
  constructor(errors: string[]) {
    super(`财务快照契约校验失败（${errors.length} 项）：${errors.slice(0, 3).join('；')}`);
    this.name = 'FinanceContractError';
    this.errors = errors;
  }
}

export type ValidationResult =
  | { ok: true; value: FinanceSnapshot }
  | { ok: false; errors: string[] };

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v);
}

function isNonEmptyStr(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

/** 校验并规范化一份财务快照；不修改入参。 */
export function validateFinanceSnapshot(input: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isObj(input)) return { ok: false, errors: ['根节点必须是对象'] };

  const schema = input.schema_version;
  if (schema !== FINANCE_SCHEMA_VERSION) {
    errors.push(`schema_version 必须为 "${FINANCE_SCHEMA_VERSION}"，实际为 ${JSON.stringify(schema)}`);
  }
  if (!isNonEmptyStr(input.snapshot_date) || !DATE_RE.test(input.snapshot_date)) {
    errors.push('snapshot_date 必须是 YYYY-MM-DD');
  }
  if (!isNonEmptyStr(input.currency)) errors.push('currency 必须是非空字符串');

  const assets = validateAssets(input.assets, errors);
  const liabilities = validateLiabilities(input.liabilities, errors);
  const cashflows = validateCashflows(input.cashflows, errors);

  const missingFields = input.missing_fields;
  if (missingFields !== undefined && !Array.isArray(missingFields)) {
    errors.push('missing_fields 必须是字符串数组');
  }
  const missing = Array.isArray(missingFields)
    ? missingFields.filter(isNonEmptyStr)
    : [];

  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    value: {
      schema_version: FINANCE_SCHEMA_VERSION,
      snapshot_date: input.snapshot_date as string,
      currency: input.currency as string,
      assets,
      liabilities,
      cashflows,
      missing_fields: missing,
      source: typeof input.source === 'string' ? input.source : undefined,
      note: typeof input.note === 'string' ? input.note : undefined,
      generated_at: typeof input.generated_at === 'string' ? input.generated_at : undefined,
    },
  };
}

function validateAssets(raw: unknown, errors: string[]): FinanceAsset[] {
  if (!Array.isArray(raw)) {
    errors.push('assets 必须是数组');
    return [];
  }
  const out: FinanceAsset[] = [];
  raw.forEach((a, i) => {
    const at = `assets[${i}]`;
    if (!isObj(a)) return void errors.push(`${at} 必须是对象`);
    if (!isNonEmptyStr(a.id)) errors.push(`${at}.id 必须是非空字符串`);
    if (!isNonEmptyStr(a.name)) errors.push(`${at}.name 必须是非空字符串`);
    if (!ASSET_CATEGORIES.includes(a.category as AssetCategory)) {
      errors.push(`${at}.category 非法：${JSON.stringify(a.category)}`);
    }
    if (!isInt(a.amount_cents)) errors.push(`${at}.amount_cents 必须是整数分`);
    if (!LIQUIDITIES.includes(a.liquidity as Liquidity)) {
      errors.push(`${at}.liquidity 必须是 liquid 或 illiquid`);
    }
    if (a.available_cents !== undefined && !isInt(a.available_cents)) {
      errors.push(`${at}.available_cents 必须是整数分或不填`);
    }
    out.push({
      id: a.id as string,
      name: a.name as string,
      category: a.category as AssetCategory,
      amount_cents: a.amount_cents as number,
      liquidity: a.liquidity as Liquidity,
      available_cents: a.available_cents as number | undefined,
      note: typeof a.note === 'string' ? a.note : undefined,
    });
  });
  return out;
}

function validateLiabilities(raw: unknown, errors: string[]): FinanceLiability[] {
  if (!Array.isArray(raw)) {
    errors.push('liabilities 必须是数组');
    return [];
  }
  const out: FinanceLiability[] = [];
  raw.forEach((l, i) => {
    const at = `liabilities[${i}]`;
    if (!isObj(l)) return void errors.push(`${at} 必须是对象`);
    if (!isNonEmptyStr(l.id)) errors.push(`${at}.id 必须是非空字符串`);
    if (!isNonEmptyStr(l.name)) errors.push(`${at}.name 必须是非空字符串`);
    if (!LIABILITY_CATEGORIES.includes(l.category as LiabilityCategory)) {
      errors.push(`${at}.category 非法：${JSON.stringify(l.category)}`);
    }
    if (!isInt(l.balance_cents)) errors.push(`${at}.balance_cents 必须是整数分`);

    let installments: FinanceInstallment[] | undefined;
    if (l.installments !== undefined) {
      if (!Array.isArray(l.installments)) {
        errors.push(`${at}.installments 必须是数组`);
      } else {
        installments = [];
        l.installments.forEach((it, j) => {
          const iat = `${at}.installments[${j}]`;
          if (!isObj(it)) return void errors.push(`${iat} 必须是对象`);
          if (!isNonEmptyStr(it.due_month) || !MONTH_RE.test(it.due_month)) {
            errors.push(`${iat}.due_month 必须是 YYYY-MM`);
          }
          if (!isInt(it.amount_cents)) errors.push(`${iat}.amount_cents 必须是整数分`);
          installments!.push({
            due_month: it.due_month as string,
            amount_cents: it.amount_cents as number,
            note: typeof it.note === 'string' ? it.note : undefined,
          });
        });
      }
    }
    out.push({
      id: l.id as string,
      name: l.name as string,
      category: l.category as LiabilityCategory,
      balance_cents: l.balance_cents as number,
      rate_note: typeof l.rate_note === 'string' ? l.rate_note : undefined,
      installments,
      note: typeof l.note === 'string' ? l.note : undefined,
    });
  });
  return out;
}

function validateCashflows(raw: unknown, errors: string[]): FinanceCashflow[] {
  if (!Array.isArray(raw)) {
    errors.push('cashflows 必须是数组');
    return [];
  }
  const out: FinanceCashflow[] = [];
  raw.forEach((c, i) => {
    const at = `cashflows[${i}]`;
    if (!isObj(c)) return void errors.push(`${at} 必须是对象`);
    if (!isNonEmptyStr(c.id)) errors.push(`${at}.id 必须是非空字符串`);
    if (!isNonEmptyStr(c.name)) errors.push(`${at}.name 必须是非空字符串`);
    if (!CASHFLOW_KINDS.includes(c.kind as CashflowKind)) {
      errors.push(`${at}.kind 必须是 confirmed 或 estimated`);
    }
    if (c.direction !== 'in' && c.direction !== 'out') errors.push(`${at}.direction 必须是 in 或 out`);
    if (!isInt(c.amount_cents) || (c.amount_cents as number) < 0) {
      errors.push(`${at}.amount_cents 必须是非负整数分`);
    }
    if (!isNonEmptyStr(c.month) || !MONTH_RE.test(c.month)) errors.push(`${at}.month 必须是 YYYY-MM`);
    if (c.recurring_monthly !== undefined && typeof c.recurring_monthly !== 'boolean') {
      errors.push(`${at}.recurring_monthly 必须是布尔值`);
    }
    out.push({
      id: c.id as string,
      name: c.name as string,
      kind: c.kind as CashflowKind,
      direction: c.direction as 'in' | 'out',
      amount_cents: c.amount_cents as number,
      month: c.month as string,
      recurring_monthly: c.recurring_monthly as boolean | undefined,
      note: typeof c.note === 'string' ? c.note : undefined,
    });
  });
  return out;
}

/** 解析 JSON 文本并校验；解析失败也归入契约错误。 */
export function parseFinanceSnapshot(text: string): ValidationResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, errors: ['不是合法 JSON'] };
  }
  return validateFinanceSnapshot(data);
}

/** 校验失败即抛 FinanceContractError（供 fail-closed 的调用点使用）。 */
export function assertFinanceSnapshot(input: unknown): FinanceSnapshot {
  const res = validateFinanceSnapshot(input);
  if (!res.ok) throw new FinanceContractError(res.errors);
  return res.value;
}
