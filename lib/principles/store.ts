/**
 * 原则使用账本 · 站点私有持久化（Upstash Redis REST，零依赖）。
 *
 * 一致性协议（2026-11-17 repair-round-2，替代逐命令 HSETNX 写法）：
 * - 整份账本（events / undo 占位 / catalog）序列化为**一个** `principles:v1:state` 键；
 *   每次事务在内存中完成校验、身份解析、事件与目录更新后，**一次 SET 提交**。
 *   任何步骤抛错都不会写半份状态：不存在「undo 锁已抢、事件未写」的中间态。
 * - 跨进程用 Redis 分布式锁 `principles:v1:lock`（`SET NX PX 10000`）串行化事务；
 *   同进程再加一条 Promise 队列（测试/无 NX 语义的客户端也不会并发写同一快照）。
 * - 身份注册以锁内状态为准：同一完整身份（week+system+eventIndex+正文指纹）首次并发时，
 *   先拿到锁的事务登记 canonical ID，后到者直接读回同一 ID（F3）。
 * - 只有客户端显式 `replaces`（明确编辑关联）才登记正文别名；同槽位不再推断替换（F2）。
 * - 读取（summary/export）只 GET 单键，天然是一致快照；restore 在锁内合并后单次提交。
 * - 命名空间独立：`principles:v1:*`，与财务 `finance:*` 完全隔离。
 *
 * 仅可在服务端 Route Handler import（凭据只来自部署环境变量）。
 */

import { randomUUID } from 'node:crypto';
import {
  PRINCIPLE_USAGE_SCHEMA_VERSION,
  backupChecksum,
  dedupePending,
  payloadHash,
  principleSlotKey,
  summarizeUsage,
  validateBackup,
  validateUsageEvent,
  type PrincipleCatalogEntry,
  type PrincipleUsageBackup,
  type PrincipleUsageEvent,
  type PrincipleUsageEventInput,
  type PrincipleUsageSummary,
} from './contract';

const NS = 'principles:v1';
const KEY_STATE = `${NS}:state`;
const KEY_LOCK = `${NS}:lock`;
const LOCK_TTL_MS = 10_000;
const LOCK_WAIT_MS = 2_000;
const LOCK_RETRY_MS = 15;

export class PrinciplesStoreError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(code: string, message: string, status = 503) {
    super(message);
    this.name = 'PrinciplesStoreError';
    this.code = code;
    this.status = status;
  }
}

export interface PrinciplesStoreConfig { url: string; token: string }

export function principlesStoreConfig(): PrinciplesStoreConfig | null {
  const url = String(process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL ?? '').trim();
  const token = String(process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN ?? '').trim();
  if (!url || !token) return null;
  return { url: url.replace(/\/+$/, ''), token };
}

export function principlesStoreConfigured(): boolean {
  return principlesStoreConfig() !== null;
}

/** Redis 命令执行器（测试注入内存实现，运行时走上游 REST）。 */
export type Redis = (command: Array<string | number>) => Promise<unknown>;

export function createRedisClient(cfg: PrinciplesStoreConfig = requireConfig()): Redis {
  return async (command) => {
    let res: Response;
    try {
      res = await fetch(cfg.url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(command),
        cache: 'no-store',
      });
    } catch {
      throw new PrinciplesStoreError('PRINCIPLES_STORE_UNREACHABLE', '原则私有存储不可达');
    }
    if (!res.ok) {
      throw new PrinciplesStoreError('PRINCIPLES_STORE_UPSTREAM', `原则私有存储返回 HTTP ${res.status}`);
    }
    const payload = (await res.json().catch(() => null)) as { result?: unknown; error?: unknown } | null;
    if (!payload || payload.error) {
      throw new PrinciplesStoreError('PRINCIPLES_STORE_UPSTREAM', '原则私有存储返回错误');
    }
    return payload.result;
  };
}

function requireConfig(): PrinciplesStoreConfig {
  const cfg = principlesStoreConfig();
  if (!cfg) throw new PrinciplesStoreError('PRINCIPLES_STORE_NOT_CONFIGURED', '服务端未配置原则账本私有存储');
  return cfg;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function parseState(raw: string | null): State | null {
  if (raw == null || raw === '') return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new PrinciplesStoreError('PRINCIPLES_STORE_CORRUPT', '原则账本存储内容损坏，已保留原数据');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new PrinciplesStoreError('PRINCIPLES_STORE_CORRUPT', '原则账本存储结构损坏，已保留原数据');
  }
  const state = value as State;
  if (state.version !== PRINCIPLE_USAGE_SCHEMA_VERSION || !Number.isSafeInteger(state.seq) ||
    !state.events || typeof state.events !== 'object' || Array.isArray(state.events) ||
    !state.undo || typeof state.undo !== 'object' || Array.isArray(state.undo) ||
    !state.catalog || typeof state.catalog !== 'object' || Array.isArray(state.catalog)) {
    throw new PrinciplesStoreError('PRINCIPLES_STORE_CORRUPT', '原则账本存储结构损坏，已保留原数据');
  }
  return state;
}

interface State {
  version: typeof PRINCIPLE_USAGE_SCHEMA_VERSION;
  seq: number;
  updatedAt: string;
  events: Record<string, PrincipleUsageEvent>;
  /** targetEventId → undoEventId（同一条 use 只允许一个撤销占位）。 */
  undo: Record<string, string>;
  /** catalog 字段：`id:<id>` JSON / `slot:<slot>` JSON ids / `alias:<fp>` id */
  catalog: Record<string, string>;
}

function emptyState(now: string): State {
  return { version: PRINCIPLE_USAGE_SCHEMA_VERSION, seq: 0, updatedAt: now, events: {}, undo: {}, catalog: {} };
}

/** 同进程串行队列：即使 Redis 客户端不支持 NX（测试替身），也不会并发改写同一快照。 */
let chain: Promise<unknown> = Promise.resolve();
function serialized<T>(task: () => Promise<T>): Promise<T> {
  const run = chain.then(task, task);
  chain = run.then(() => undefined, () => undefined);
  return run;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function withLock<T>(redis: Redis, task: () => Promise<T>): Promise<T> {
  return serialized(async () => {
    const token = randomUUID();
    const deadline = Date.now() + LOCK_WAIT_MS;
    let acquired = false;
    while (!acquired) {
      const result = await redis(['SET', KEY_LOCK, token, 'NX', 'PX', String(LOCK_TTL_MS)]);
      acquired = result === 'OK' || result === 1 || result === true;
      if (acquired) break;
      if (Date.now() >= deadline) {
        throw new PrinciplesStoreError('PRINCIPLES_STORE_BUSY', '原则账本正在被另一台设备写入，请稍后重试', 503);
      }
      await sleep(LOCK_RETRY_MS);
    }
    try {
      return await task();
    } finally {
      // 释放失败不掩盖业务成功：锁有 TTL，最坏 10s 自愈。
      try {
        const owner = asString(await redis(['GET', KEY_LOCK]));
        if (owner === token) await redis(['DEL', KEY_LOCK]);
      } catch { /* TTL 兜底 */ }
    }
  });
}

async function readState(redis: Redis): Promise<State> {
  return parseState(asString(await redis(['GET', KEY_STATE]))) ?? emptyState(new Date().toISOString());
}

async function writeState(redis: Redis, state: State): Promise<void> {
  state.updatedAt = new Date().toISOString();
  await redis(['SET', KEY_STATE, JSON.stringify(state)]);
}

function catalogEntryOf(state: State, id: string): PrincipleCatalogEntry | null {
  const raw = state.catalog[`id:${id}`];
  return raw ? JSON.parse(raw) as PrincipleCatalogEntry : null;
}

function saveCatalogEntry(state: State, entry: PrincipleCatalogEntry): void {
  state.catalog[`id:${entry.id}`] = JSON.stringify(entry);
  const slotField = `slot:${principleSlotKey(entry)}`;
  const ids = state.catalog[slotField] ? JSON.parse(state.catalog[slotField]) as string[] : [];
  if (!ids.includes(entry.id)) state.catalog[slotField] = JSON.stringify([...ids, entry.id]);
  for (const alias of [entry.fingerprint, ...entry.aliases]) {
    if (!state.catalog[`alias:${alias}`]) state.catalog[`alias:${alias}`] = entry.id;
  }
  // 完整身份 → canonical ID：同身份并发时以先登记者为赢家。
  const identityField = `identity:${[entry.week, entry.system, entry.eventIndex, entry.fingerprint]
    .map((part) => String(part).replace(/[|\u241f]/g, ' ').trim()).join('\u241f')}`;
  if (!state.catalog[identityField]) state.catalog[identityField] = entry.id;
}

/**
 * 解析稳定原则 ID（锁内调用）。顺序：完整身份 → 显式 replaces 别名 → 全局指纹别名 → 新建。
 * 同槽位但正文不同 = 不同原则，永不推断为「修订」。
 */
function resolvePrinciple(state: State, input: PrincipleUsageEventInput, now: string): PrincipleCatalogEntry {
  const principle = input.principle;
  const identityField = `identity:${[principle.week, principle.system, principle.eventIndex, principle.fingerprint]
    .map((part) => String(part).replace(/[|\u241f]/g, ' ').trim()).join('\u241f')}`;
  const identityId = state.catalog[identityField];
  if (identityId) {
    const existing = catalogEntryOf(state, identityId);
    if (existing) return { ...existing, title: principle.title || existing.title, lastSeen: now };
  }
  if (principle.replaces) {
    const replacedId = state.catalog[`alias:${principle.replaces}`];
    if (replacedId) {
      const existing = catalogEntryOf(state, replacedId);
      if (existing) {
        state.catalog[`alias:${principle.fingerprint}`] = existing.id;
        const entry: PrincipleCatalogEntry = {
          ...existing,
          title: principle.title || existing.title,
          aliases: Array.from(new Set([...existing.aliases, principle.fingerprint]))
            .filter((alias) => alias !== existing.fingerprint),
          lastSeen: now,
        };
        saveCatalogEntry(state, entry);
        return entry;
      }
    }
  }
  const byAlias = state.catalog[`alias:${principle.fingerprint}`];
  if (byAlias) {
    const existing = catalogEntryOf(state, byAlias);
    if (existing) return { ...existing, title: principle.title || existing.title, lastSeen: now };
  }
  const entry: PrincipleCatalogEntry = {
    id: principle.id,
    week: principle.week,
    system: principle.system,
    eventIndex: principle.eventIndex,
    title: principle.title,
    fingerprint: principle.fingerprint,
    aliases: [],
    firstSeen: now,
    lastSeen: now,
  };
  saveCatalogEntry(state, entry);
  return entry;
}

export interface EventReceipt {
  eventId: string;
  principleId: string;
  seq: number;
  serverTime: string;
  duplicate: boolean;
}

export interface RecordEventsResult {
  accepted: EventReceipt[];
  duplicates: EventReceipt[];
  summary: PrincipleUsageSummary;
}

function summaryOf(state: State, now: string): PrincipleUsageSummary {
  const events = Object.values(state.events).sort((a, b) => a.seq - b.seq || a.eventId.localeCompare(b.eventId));
  const catalog = Object.entries(state.catalog)
    .filter(([field]) => field.startsWith('id:'))
    .map(([, raw]) => JSON.parse(raw) as PrincipleCatalogEntry)
    .sort((a, b) => a.id.localeCompare(b.id));
  return summarizeUsage(events, catalog, now);
}

/** 写入/补写一批事件：校验、幂等、冲突、撤销与身份注册在同一锁事务里一次提交。 */
export async function recordEvents(redis: Redis, rawEvents: unknown, now: Date = new Date()): Promise<RecordEventsResult> {
  if (!Array.isArray(rawEvents) || !rawEvents.length) {
    throw new PrinciplesStoreError('PRINCIPLES_EVENTS_REQUIRED', 'events 必须是非空数组', 400);
  }
  if (rawEvents.length > 200) {
    throw new PrinciplesStoreError('PRINCIPLES_BATCH_TOO_LARGE', '单次最多写入 200 条事件', 400);
  }
  const inputs: PrincipleUsageEventInput[] = [];
  const seen = new Set<string>();
  for (const raw of rawEvents) {
    const checked = validateUsageEvent(raw);
    if (!checked.ok || !checked.value) {
      throw new PrinciplesStoreError('PRINCIPLES_EVENT_INVALID', checked.errors.join('；'), 400);
    }
    if (seen.has(checked.value.eventId)) continue;
    seen.add(checked.value.eventId);
    inputs.push(checked.value);
  }
  const ordered = dedupePending(inputs);
  const nowIso = now.toISOString();

  return withLock(redis, async () => {
    const state = await readState(redis);
    const accepted: EventReceipt[] = [];
    const duplicates: EventReceipt[] = [];

    for (const input of ordered) {
      const hash = payloadHash(input);
      const existing = state.events[input.eventId];
      if (existing) {
        if (existing.payloadHash !== hash) {
          throw new PrinciplesStoreError(
            'PRINCIPLES_EVENT_CONFLICT',
            `事件 ${input.eventId} 已存在且载荷不同，拒绝覆盖`,
            409,
          );
        }
        duplicates.push({
          eventId: existing.eventId, principleId: existing.principleId, seq: existing.seq,
          serverTime: existing.serverTime, duplicate: true,
        });
        continue;
      }

      let target: PrincipleUsageEvent | null = null;
      if (input.op === 'undo') {
        target = state.events[String(input.targetEventId)] ?? null;
        if (!target || target.op !== 'use') {
          throw new PrinciplesStoreError('PRINCIPLES_TARGET_MISSING', '撤销目标不存在或不是一次使用记录', 409);
        }
        const owner = state.undo[target.eventId];
        if (owner && owner !== input.eventId) {
          throw new PrinciplesStoreError('PRINCIPLES_ALREADY_CANCELLED', '这条使用记录已被撤销，不能重复抵消', 409);
        }
      }

      const catalogEntry = resolvePrinciple(state, input, nowIso);
      state.seq += 1;
      const event: PrincipleUsageEvent = {
        ...input,
        principleId: catalogEntry.id,
        serverTime: nowIso,
        seq: state.seq,
        payloadHash: hash,
      };
      state.events[event.eventId] = event;
      if (target) {
        state.undo[target.eventId] = input.eventId;
        state.events[target.eventId] = { ...target, cancelledBy: input.eventId };
      }
      accepted.push({
        eventId: event.eventId, principleId: event.principleId, seq: event.seq,
        serverTime: event.serverTime, duplicate: false,
      });
    }

    // 单次提交：任何上面的校验/冲突都不会留下部分状态。
    await writeState(redis, state);
    return { accepted, duplicates, summary: summaryOf(state, nowIso) };
  });
}

/** 读取计数摘要（单键 GET，天然一致快照）。 */
export async function getSummary(redis: Redis, now: Date = new Date()): Promise<PrincipleUsageSummary> {
  return summaryOf(await readState(redis), now.toISOString());
}

export async function exportBackup(redis: Redis, now: Date = new Date()): Promise<PrincipleUsageBackup> {
  return withLock(redis, async () => {
    const state = await readState(redis);
    const events = Object.values(state.events).sort((a, b) => a.seq - b.seq || a.eventId.localeCompare(b.eventId));
    const catalog = Object.entries(state.catalog)
      .filter(([field]) => field.startsWith('id:'))
      .map(([, raw]) => JSON.parse(raw) as PrincipleCatalogEntry)
      .sort((a, b) => a.id.localeCompare(b.id));
    return {
      version: PRINCIPLE_USAGE_SCHEMA_VERSION,
      exportedAt: now.toISOString(),
      catalog,
      events,
      checksum: backupChecksum(catalog, events),
    };
  });
}

export interface RestoreResult {
  dryRun: boolean;
  imported: number;
  duplicates: number;
  conflicts: string[];
  summary: PrincipleUsageSummary;
}

/**
 * 恢复：校验和通过后，在锁内合并到当前状态并单次提交；重复恢复不倍增。
 * `dryRun=true` 只报告，不写键。
 */
export async function restoreBackup(redis: Redis, body: unknown, options: { dryRun?: boolean } = {}): Promise<RestoreResult> {
  const checked = validateBackup(body);
  if (!checked.ok || !checked.value) {
    throw new PrinciplesStoreError('PRINCIPLES_BACKUP_INVALID', checked.errors.join('；'), 400);
  }
  const backup = checked.value;
  return withLock(redis, async () => {
    const state = await readState(redis);
    const conflicts = backup.events
      .filter((event) => state.events[event.eventId] && state.events[event.eventId].payloadHash !== event.payloadHash)
      .map((event) => event.eventId);
    if (conflicts.length) {
      throw new PrinciplesStoreError(
        'PRINCIPLES_BACKUP_CONFLICT',
        `备份与现有账本有 ${conflicts.length} 个同 ID 不同载荷事件：${conflicts.slice(0, 5).join('、')}`,
        409,
      );
    }
    const fresh = backup.events.filter((event) => !state.events[event.eventId]);
    if (options.dryRun) {
      return {
        dryRun: true, imported: fresh.length,
        duplicates: backup.events.length - fresh.length,
        conflicts: [], summary: summaryOf(state, new Date().toISOString()),
      };
    }
    for (const event of fresh.slice().sort((a, b) => a.seq - b.seq)) {
      state.events[event.eventId] = event;
      if (event.op === 'undo' && event.targetEventId) {
        state.undo[event.targetEventId] = state.undo[event.targetEventId] ?? event.eventId;
        const target = state.events[event.targetEventId];
        if (target) state.events[event.targetEventId] = { ...target, cancelledBy: event.eventId };
      }
      const entry = backup.catalog.find((item) => item.id === event.principleId) ?? {
        id: event.principleId,
        week: event.principle.week,
        system: event.principle.system,
        eventIndex: event.principle.eventIndex,
        title: event.principle.title,
        fingerprint: event.principle.fingerprint,
        aliases: [] as string[],
        firstSeen: event.serverTime,
        lastSeen: event.serverTime,
      };
      saveCatalogEntry(state, entry);
      state.seq = Math.max(state.seq, event.seq);
    }
    await writeState(redis, state);
    return {
      dryRun: false, imported: fresh.length,
      duplicates: backup.events.length - fresh.length,
      conflicts: [], summary: summaryOf(state, new Date().toISOString()),
    };
  });
}
