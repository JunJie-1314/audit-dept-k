/**
 * 个人财务数据契约（canonical contract）· schema `finance.snapshot.v1`
 *
 * 设计原则（对齐 K 的理财助手铁律与 AGENTS 口径）：
 * - **金额一律整数分（cents）存储**，展示层自行转元；杜绝浮点误差。
 * - 缺失字段**绝不当 0**：写进 `missing_fields`，由计算层显式标记为「不可用」。
 * - 资产带**流动性**（liquid / illiquid）与**即时可用额**（available_cents）两层区分：
 *   现金「可用」；基金可赎回但**浮盈不得并入可用现金**；设备为非流动资产、不计入可用现金。
 * - 分期（MacBook）只在负债侧记一次（`installments[]` = 到期计划），**不重复计作消费**。
 * - 未到账收入（奖学金/实习/新贷）按 `kind` 区分「已确认计划 confirmed」与「预计 estimated」。
 *
 * ⚠️ **本文件是镜像（MIRROR）**：权威实现在主仓库 `workbench/backend/src/finance/types.ts`。
 * serverless 无法跨仓库 import，故此处保存逐字副本；两侧 `FINANCE_SCHEMA_VERSION` 必须一致。
 * 改动请先改权威实现，再同步本镜像。
 */

export const FINANCE_SCHEMA_VERSION = 'finance.snapshot.v1';

export type Currency = string; // 目前 'CNY'

/** 资产的流动性：liquid（可较快变现）/ illiquid（非流动，如设备） */
export type Liquidity = 'liquid' | 'illiquid';

/** 资产类别 */
export type AssetCategory =
  | 'cash'
  | 'deposit'
  | 'fund'
  | 'device'
  | 'receivable'
  | 'other';

/** 负债类别 */
export type LiabilityCategory =
  | 'student_loan'
  | 'installment'
  | 'credit'
  | 'other';

/** 现金流口径：confirmed = 已确认计划；estimated = 预计（不确定性较高） */
export type CashflowKind = 'confirmed' | 'estimated';

export interface FinanceAsset {
  id: string;
  name: string;
  category: AssetCategory;
  /** 金额（整数分） */
  amount_cents: number;
  liquidity: Liquidity;
  /**
   * 可即时动用金额（整数分）。缺省 = amount_cents。
   * 基金/受限账户应显式给 0（或受限可用额），使之**不计入可用现金**。
   * 仅对 liquid 资产有意义。
   */
  available_cents?: number;
  note?: string;
}

/** 负债的到期计划项（如分期每月应还）；`due_month` 形如 `YYYY-MM` */
export interface FinanceInstallment {
  due_month: string;
  amount_cents: number;
  note?: string;
}

export interface FinanceLiability {
  id: string;
  name: string;
  category: LiabilityCategory;
  /** 剩余本金 / 余额（整数分） */
  balance_cents: number;
  /** 利率说明（如「LPR5Y-70bp，在读贴息」）——只描述，不参与计算 */
  rate_note?: string;
  /** 到期计划（分期/还款计划）；空数组 = 无已知分期 */
  installments?: FinanceInstallment[];
  note?: string;
}

export interface FinanceCashflow {
  id: string;
  name: string;
  kind: CashflowKind;
  direction: 'in' | 'out';
  /** 金额（整数分，正数；方向由 direction 决定） */
  amount_cents: number;
  /** 发生月份 `YYYY-MM` */
  month: string;
  /** 是否经常性（月度重复）；true 时 `month` 表示窗口起始月 */
  recurring_monthly?: boolean;
  note?: string;
}

export interface FinanceSnapshot {
  schema_version: string;
  /** 快照日期 `YYYY-MM-DD` */
  snapshot_date: string;
  currency: Currency;
  assets: FinanceAsset[];
  liabilities: FinanceLiability[];
  cashflows: FinanceCashflow[];
  /** 来源未提供的字段清单（绝不当 0）；计算层会并入 overview.missing */
  missing_fields: string[];
  /** 数据来源描述（不写账号/凭据） */
  source?: string;
  note?: string;
  generated_at?: string;
}
