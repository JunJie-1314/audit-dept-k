/**
 * 财务私有持久化（Upstash Redis / Vercel Marketplace 集成，REST 协议、零依赖）。
 *
 * - 只存**规范化后的财务快照**与其派生摘要；凭据只来自部署环境变量。
 * - 环境变量兼容两套命名：`KV_REST_API_URL/TOKEN`（Vercel KV 传统命名）
 *   与 `UPSTASH_REDIS_REST_URL/TOKEN`（Upstash 原生命名）。
 * - 未配置即抛 `FINANCE_STORE_NOT_CONFIGURED`（调用方按 503 fail-closed）。
 * - 只读 GET 用于总览/历史；写入只发生在已鉴权的导入接口。
 *
 * 仅可在服务端 import。
 */

import { assertFinanceSnapshot } from './contract';
import type { FinanceSnapshot } from './types';
import { summarize, type FinanceOverview } from './compute';

const KEY_LATEST = 'finance:snapshot:latest';
const KEY_HISTORY = 'finance:history';
const HISTORY_CAP = 60;

export class FinanceStoreError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'FinanceStoreError';
    this.code = code;
  }
}

export interface StoreConfig {
  url: string;
  token: string;
}

export function storeConfig(): StoreConfig | null {
  const url = String(process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL ?? '').trim();
  const token = String(process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN ?? '').trim();
  if (!url || !token) return null;
  return { url: url.replace(/\/+$/, ''), token };
}

/** 是否已配置私有持久化（健康检查/前端提示用，不泄露凭据）。 */
export function storeConfigured(): boolean {
  return storeConfig() !== null;
}

async function redis(command: Array<string | number>, cfg: StoreConfig): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(cfg.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(command),
      cache: 'no-store',
    });
  } catch {
    throw new FinanceStoreError('FINANCE_STORE_UNREACHABLE', '私有存储不可达');
  }
  if (!res.ok) {
    throw new FinanceStoreError('FINANCE_STORE_UPSTREAM', `私有存储返回 HTTP ${res.status}`);
  }
  const payload = (await res.json().catch(() => null)) as { result?: unknown; error?: unknown } | null;
  if (!payload || payload.error) {
    throw new FinanceStoreError('FINANCE_STORE_UPSTREAM', '私有存储返回错误');
  }
  return payload.result;
}

function requireConfig(): StoreConfig {
  const cfg = storeConfig();
  if (!cfg) throw new FinanceStoreError('FINANCE_STORE_NOT_CONFIGURED', '服务端未配置财务私有存储');
  return cfg;
}

/** 读取最新快照（未导入过返回 null）。 */
export async function getSnapshot(): Promise<FinanceSnapshot | null> {
  const cfg = requireConfig();
  const raw = await redis(['GET', KEY_LATEST], cfg);
  if (typeof raw !== 'string' || !raw) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new FinanceStoreError('FINANCE_STORE_CORRUPT', '存储中的财务快照不是合法 JSON');
  }
  // 存储内容同样按契约校验（防止线上被写坏后按脏数据出图）
  return assertFinanceSnapshot(data);
}

export interface FinanceHistoryEntry {
  snapshot_date: string;
  generated_at: string;
  total_assets_cents: number | null;
  total_liabilities_cents: number | null;
  net_worth_cents: number | null;
  available_cash_cents: number | null;
}

function toEntry(snapshot: FinanceSnapshot, overview: FinanceOverview): FinanceHistoryEntry {
  return {
    snapshot_date: snapshot.snapshot_date,
    generated_at: overview.generated_at,
    total_assets_cents: overview.total_assets_cents,
    total_liabilities_cents: overview.total_liabilities_cents,
    net_worth_cents: overview.net_worth_cents,
    available_cash_cents: overview.available_cash_cents,
  };
}

/** 读取历史摘要（最新在前）。 */
export async function getHistory(): Promise<FinanceHistoryEntry[]> {
  const cfg = requireConfig();
  const raw = await redis(['GET', KEY_HISTORY], cfg);
  if (typeof raw !== 'string' || !raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as FinanceHistoryEntry[]) : [];
  } catch {
    throw new FinanceStoreError('FINANCE_STORE_CORRUPT', '存储中的历史不是合法 JSON');
  }
}

/** 写入快照：更新 latest 并追加历史摘要（同日去重、最多 60 条）。 */
export async function putSnapshot(snapshot: FinanceSnapshot): Promise<FinanceHistoryEntry> {
  const cfg = requireConfig();
  const overview = summarize(snapshot);
  const entry = toEntry(snapshot, overview);

  let history: FinanceHistoryEntry[] = [];
  try {
    history = await getHistory();
  } catch {
    history = [];
  }
  const merged = [entry, ...history.filter((h) => h.snapshot_date !== entry.snapshot_date)].slice(0, HISTORY_CAP);

  await redis(['SET', KEY_LATEST, JSON.stringify(snapshot)], cfg);
  await redis(['SET', KEY_HISTORY, JSON.stringify(merged)], cfg);
  return entry;
}
