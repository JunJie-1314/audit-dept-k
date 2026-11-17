/**
 * 原则使用账本 · 站点私有持久化（Upstash Redis REST，零依赖）。
 *
 * 一致性协议：只接受 Redis Lua 原子提交与 compare-delete 释放。
 * 不支持 EVAL、网络错误、CAS 拒绝均不降级为分步写入；队列可按事件 ID 重试。
 * 不可变版本状态与当前指针在同一脚本提交；旧单键账本只读/可导出，拒写待迁移。
 * 别名完整身份属于共享契约与备份校验和，恢复只消费已校验数据。
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
const KEY_VERSION = `${NS}:version`;
const KEY_LOCK = `${NS}:lock`;
const DEFAULT_LOCK_TTL_MS = 10_000;
const DEFAULT_LOCK_WAIT_MS = 2_000;
const LOCK_RETRY_MS = 15;
const COMMIT_ATTEMPTS = 8;

// 旧单键 state 永不写入；新格式以不可变状态键和原子版本指针为权威。
const stateKey = (version: number): string => `${KEY_STATE}:${version}`;

const COMMIT_LUA = `if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
local current = redis.call('GET', KEYS[2]) or ''
if current ~= ARGV[2] then return -1 end
if (redis.call('GET', KEYS[4]) or '') ~= ARGV[5] then return -1 end
if ARGV[5] == '' and redis.call('EXISTS', KEYS[5]) == 1 then return -3 end
if redis.call('SET', KEYS[3], ARGV[3], 'NX') == false then return -2 end
redis.call('SET', KEYS[4], ARGV[4])
return 1`;

const RELEASE_LUA = `if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end
return 0`;

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

type AliasIdentity = import('./contract').PrincipleIdentity;
type CatalogEntry = PrincipleCatalogEntry;

interface State {
  version: typeof PRINCIPLE_USAGE_SCHEMA_VERSION;
  seq: number;
  updatedAt: string;
  events: Record<string, PrincipleUsageEvent>;
  /** targetEventId → undoEventId（同一条 use 只允许一个撤销占位）。 */
  undo: Record<string, string>;
  /** catalog 字段：`id:<id>` JSON / `slot:<slot>` JSON ids / `alias:<fp>` id / `identity:<...>` id */
  catalog: Record<string, string>;
}

interface Current {
  version: number;
  raw: string;
  state: State;
  legacy?: boolean;
  pointer?: string;
}

function parseState(raw: string | null, version: number): Current {
  if (raw === null) {
    return {
      version: 0,
      raw: '',
      state: { version: PRINCIPLE_USAGE_SCHEMA_VERSION, seq: 0, updatedAt: new Date().toISOString(), events: {}, undo: {}, catalog: {} },
    };
  }
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
  return { version, raw, state };
}

/** 同进程串行队列：减少无谓 CAS 重试；跨进程仍由锁 + 版本 CAS 保证。 */
let chain: Promise<unknown> = Promise.resolve();
function serialized<T>(task: () => Promise<T>): Promise<T> {
  const run = chain.then(task, task);
  chain = run.then(() => undefined, () => undefined);
  return run;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function readCurrent(redis: Redis): Promise<Current> {
  const pointer = asString(await redis(['GET', KEY_VERSION]));
  if (pointer === null) {
    const legacy = asString(await redis(['GET', KEY_STATE]));
    if (legacy !== null) return { ...parseState(legacy, 0), legacy: true };
    // 先前分步提交遗留孤儿状态时不能默认为新账本。
    if (await redis(['GET', stateKey(1)]) !== null || await redis(['GET', stateKey(0)]) !== null) {
      // 指针可能刚由另一实例发布，重读一次后取该不可变快照。
      if (await redis(['GET', KEY_VERSION]) !== null) return readCurrent(redis);
      throw new PrinciplesStoreError('PRINCIPLES_STORE_CORRUPT', '账本存在未发布的状态，已保留原数据，请恢复版本指针');
    }
    return parseState(null, 0);
  }
  if (!/^[1-9][0-9]*$/.test(pointer) || !Number.isSafeInteger(Number(pointer))) {
    throw new PrinciplesStoreError('PRINCIPLES_STORE_CORRUPT', '原则账本版本号损坏，已保留原数据');
  }
  const raw = asString(await redis(['GET', stateKey(Number(pointer))]));
  if (!raw) throw new PrinciplesStoreError('PRINCIPLES_STORE_CORRUPT', '版本指向的账本缺失，已停止写入');
  return { ...parseState(raw, Number(pointer)), pointer };
}

export interface StoreOptions {
  lockTtlMs?: number;
  lockWaitMs?: number;
}

async function withLock<T>(redis: Redis, options: StoreOptions, task: (token: string) => Promise<T>): Promise<T> {
  return serialized(async () => {
    const token = randomUUID();
    const ttl = options.lockTtlMs ?? DEFAULT_LOCK_TTL_MS;
    const deadline = Date.now() + (options.lockWaitMs ?? DEFAULT_LOCK_WAIT_MS);
    let acquired = false;
    while (!acquired) {
      const result = await redis(['SET', KEY_LOCK, token, 'NX', 'PX', String(ttl)]);
      acquired = result === 'OK' || result === 1 || result === true;
      if (acquired) break;
      if (Date.now() >= deadline) {
        throw new PrinciplesStoreError('PRINCIPLES_STORE_BUSY', '原则账本正在被另一台设备写入，请稍后重试', 503);
      }
      await sleep(LOCK_RETRY_MS);
    }
    try {
      return await task(token);
    } finally {
      await releaseLock(redis, token);
    }
  });
}

/** 原子释放；失败等待 TTL，绝不客户端 GET/DEL。 */
async function releaseLock(redis: Redis, token: string): Promise<void> {
  try { await redis(['EVAL', RELEASE_LUA, '1', KEY_LOCK, token]); }
  catch { /* 清理失败不改变业务结果；租约最终过期。 */ }
}

interface CommitResult { ok: boolean; reason?: 'lock' | 'version' }

async function commitState(redis: Redis, token: string, current: Current, next: State): Promise<CommitResult> {
  next.updatedAt = new Date().toISOString();
  const result = Number(await redis([
    'EVAL', COMMIT_LUA, '5', KEY_LOCK, stateKey(current.version),
    stateKey(current.version + 1), KEY_VERSION, KEY_STATE,
    token, current.raw, JSON.stringify(next), String(current.version + 1), current.pointer ?? '',
  ]));
  if (result === 1) return { ok: true };
  if (result === -3) throw new PrinciplesStoreError('PRINCIPLES_MIGRATION_REQUIRED', '旧账本已保留，请先导出并迁移后再写入');
  if (result === -2) throw new PrinciplesStoreError('PRINCIPLES_STORE_CORRUPT', '下一版本已有未发布状态，已保留原数据，请恢复版本指针');
  if (result === 0 || result === -1) return { ok: false, reason: result === 0 ? 'lock' : 'version' };
  throw new PrinciplesStoreError('PRINCIPLES_STORE_UPSTREAM', '原则账本返回未知提交结果，请重试');
}

/** 在锁内反复 CAS 提交，冲突时重读最新状态重放（事件按 eventId 幂等）。 */
async function transact<T>(
  redis: Redis,
  options: StoreOptions,
  apply: (state: State) => T,
  persist = true,
): Promise<{ result: T; state: State }> {
  for (let attempt = 0; attempt < COMMIT_ATTEMPTS; attempt++) {
    const committed = await withLock(redis, options, async (token) => {
      const current = await readCurrent(redis);
      if (persist && current.legacy) throw new PrinciplesStoreError('PRINCIPLES_MIGRATION_REQUIRED', '旧账本已保留，可导出备份；迁移前不接受新写入');
      const state = structuredClone(current.state);
      const result = apply(state);
      if (!persist) return { result, state };
      const commit = await commitState(redis, token, current, state);
      return commit.ok ? { result, state } : null;
    });
    if (committed) return committed;
    // CAS 拒绝后重新获得租约、读取最新快照，绝不沿旧租约降级写入。
  }
  throw new PrinciplesStoreError('PRINCIPLES_STORE_BUSY', '原则账本并发冲突，请稍后重试', 503);
}

function catalogEntryOf(state: State, id: string): CatalogEntry | null {
  const raw = state.catalog[`id:${id}`];
  return raw ? JSON.parse(raw) as CatalogEntry : null;
}

const identityField = (identity: { week: string; system: string; eventIndex: string; fingerprint: string }): string =>
  `identity:${[identity.week, identity.system, identity.eventIndex, identity.fingerprint]
    .map((part) => String(part).replace(/[|\u241f]/g, ' ').trim()).join('\u241f')}`;

function saveCatalogEntry(state: State, entry: CatalogEntry): void {
  const previous = catalogEntryOf(state, entry.id);
  if (previous) entry = { ...previous, title: entry.title, lastSeen: entry.lastSeen,
    aliases: Array.from(new Set([...previous.aliases, ...entry.aliases, entry.fingerprint]))
      .filter(alias => alias !== previous.fingerprint),
    aliasIdentities: [...(previous.aliasIdentities ?? []), entry, ...(entry.aliasIdentities ?? [])]
      .map(({ week, system, eventIndex, fingerprint }) => ({ week, system, eventIndex, fingerprint })),
  };
  const seen = new Set<string>();
  const identities: AliasIdentity[] = [
    { week: entry.week, system: entry.system, eventIndex: entry.eventIndex, fingerprint: entry.fingerprint },
    ...(entry.aliasIdentities ?? []),
  ].filter((identity) => {
    const key = identityField(identity);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  state.catalog[`id:${entry.id}`] = JSON.stringify({ ...entry, aliasIdentities: identities });
  const slotField = `slot:${principleSlotKey(entry)}`;
  const ids = state.catalog[slotField] ? JSON.parse(state.catalog[slotField]) as string[] : [];
  if (!ids.includes(entry.id)) state.catalog[slotField] = JSON.stringify([...ids, entry.id]);
  for (const alias of [entry.fingerprint, ...entry.aliases]) {
    if (!state.catalog[`alias:${alias}`]) state.catalog[`alias:${alias}`] = entry.id;
  }
  for (const identity of identities) {
    if (!state.catalog[identityField(identity)]) state.catalog[identityField(identity)] = entry.id;
  }
}

/**
 * 解析稳定原则 ID（锁内调用）。顺序：完整身份 → 显式 replaces 别名 → 全局指纹别名 → 新建。
 * 同槽不同正文是不同原则；只有显式 replaces 才登记别名并记录该别名的完整来源身份。
 */
function resolvePrinciple(state: State, input: PrincipleUsageEventInput, now: string): CatalogEntry {
  const principle = input.principle;
  const identity = {
    week: principle.week, system: principle.system,
    eventIndex: principle.eventIndex, fingerprint: principle.fingerprint,
  };
  const identityId = state.catalog[identityField(identity)];
  if (identityId) {
    const existing = catalogEntryOf(state, identityId);
    if (existing) return { ...existing, title: principle.title || existing.title, lastSeen: now };
  }
  if (principle.replaces) {
    const replacedId = state.catalog[`alias:${principle.replaces}`];
    if (replacedId) {
      const existing = catalogEntryOf(state, replacedId);
      if (existing) {
        const aliases = Array.from(new Set([...existing.aliases, principle.fingerprint]))
          .filter((alias) => alias !== existing.fingerprint);
        const aliasIdentities = [
          ...(existing.aliasIdentities ?? []),
          identity,
        ];
        const entry: CatalogEntry = {
          ...existing,
          title: principle.title || existing.title,
          aliases,
          aliasIdentities,
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
  const entry: CatalogEntry = {
    id: principle.id,
    week: principle.week,
    system: principle.system,
    eventIndex: principle.eventIndex,
    title: principle.title,
    fingerprint: principle.fingerprint,
    aliases: [],
    aliasIdentities: [identity],
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
    .map(([, raw]) => JSON.parse(raw) as CatalogEntry)
    .sort((a, b) => a.id.localeCompare(b.id)) as PrincipleCatalogEntry[];
  return summarizeUsage(events, catalog, now);
}

/** 写入/补写一批事件：校验、幂等、冲突、撤销与身份注册在同一事务内一次提交。 */
export async function recordEvents(
  redis: Redis,
  rawEvents: unknown,
  now: Date = new Date(),
  options: StoreOptions = {},
): Promise<RecordEventsResult> {
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

  const { result, state } = await transact(redis, options, (draft) => {
    const accepted: EventReceipt[] = [];
    const duplicates: EventReceipt[] = [];
    for (const input of ordered) {
      const hash = payloadHash(input);
      const existing = draft.events[input.eventId];
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
        target = draft.events[String(input.targetEventId)] ?? null;
        if (!target || target.op !== 'use') {
          throw new PrinciplesStoreError('PRINCIPLES_TARGET_MISSING', '撤销目标不存在或不是一次使用记录', 409);
        }
        const owner = draft.undo[target.eventId];
        if (owner && owner !== input.eventId) {
          throw new PrinciplesStoreError('PRINCIPLES_ALREADY_CANCELLED', '这条使用记录已被撤销，不能重复抵消', 409);
        }
      }
      const catalogEntry = resolvePrinciple(draft, input, nowIso);
      draft.seq += 1;
      const event: PrincipleUsageEvent = {
        ...input,
        principleId: catalogEntry.id,
        serverTime: nowIso,
        seq: draft.seq,
        payloadHash: hash,
      };
      draft.events[event.eventId] = event;
      if (target) {
        draft.undo[target.eventId] = input.eventId;
        draft.events[target.eventId] = { ...target, cancelledBy: input.eventId };
      }
      accepted.push({
        eventId: event.eventId, principleId: event.principleId, seq: event.seq,
        serverTime: event.serverTime, duplicate: false,
      });
    }
    return { accepted, duplicates };
  });

  return { ...result, summary: summaryOf(state, nowIso) };
}

/** 读取计数摘要（读当前版本单键，天然一致快照）。 */
export async function getSummary(redis: Redis, now: Date = new Date()): Promise<PrincipleUsageSummary> {
  return summaryOf((await readCurrent(redis)).state, now.toISOString());
}

export async function exportBackup(redis: Redis, now: Date = new Date(), options: StoreOptions = {}): Promise<PrincipleUsageBackup> {
  return withLock(redis, options, async () => {
    const { state } = await readCurrent(redis);
    const events = Object.values(state.events).sort((a, b) => a.seq - b.seq || a.eventId.localeCompare(b.eventId));
    const catalog = Object.entries(state.catalog)
      .filter(([field]) => field.startsWith('id:'))
      .map(([, raw]) => JSON.parse(raw) as CatalogEntry)
      .sort((a, b) => a.id.localeCompare(b.id)) as PrincipleCatalogEntry[];
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
 * 恢复：校验和通过后，在锁内合并到当前状态并提交下一版本；重复恢复不倍增，seq 不回退。
 * `dryRun=true` 只报告，不写键。
 */
export async function restoreBackup(
  redis: Redis,
  body: unknown,
  options: StoreOptions & { dryRun?: boolean } = {},
): Promise<RestoreResult> {
  const checked = validateBackup(body);
  if (!checked.ok || !checked.value) {
    throw new PrinciplesStoreError('PRINCIPLES_BACKUP_INVALID', checked.errors.join('；'), 400);
  }
  const backup = checked.value;
  const { result, state } = await transact(redis, options, (draft) => {
    const conflicts = backup.events
      .filter((event) => draft.events[event.eventId] && draft.events[event.eventId].payloadHash !== event.payloadHash)
      .map((event) => event.eventId);
    if (conflicts.length) {
      throw new PrinciplesStoreError(
        'PRINCIPLES_BACKUP_CONFLICT',
        `备份与现有账本有 ${conflicts.length} 个同 ID 不同载荷事件：${conflicts.slice(0, 5).join('、')}`,
        409,
      );
    }
    const fresh = backup.events.filter((event) => !draft.events[event.eventId]);
    if (options.dryRun) {
      return { dryRun: true, imported: fresh.length, duplicates: backup.events.length - fresh.length, conflicts: [] };
    }
    for (const event of fresh.slice().sort((a, b) => a.seq - b.seq)) {
      draft.events[event.eventId] = event;
      if (event.op === 'undo' && event.targetEventId) {
        draft.undo[event.targetEventId] = draft.undo[event.targetEventId] ?? event.eventId;
        const target = draft.events[event.targetEventId];
        if (target) draft.events[event.targetEventId] = { ...target, cancelledBy: event.eventId };
      }
      const entry = (backup.catalog.find((item) => item.id === event.principleId) ?? {
        id: event.principleId,
        week: event.principle.week,
        system: event.principle.system,
        eventIndex: event.principle.eventIndex,
        title: event.principle.title,
        fingerprint: event.principle.fingerprint,
        aliases: [] as string[],
        firstSeen: event.serverTime,
        lastSeen: event.serverTime,
      }) as CatalogEntry;
      saveCatalogEntry(draft, entry);
      // seq 只前进：恢复旧备份不能把已提交的更高 seq 回退。
      draft.seq = Math.max(draft.seq, event.seq);
    }
    return { dryRun: false, imported: fresh.length, duplicates: backup.events.length - fresh.length, conflicts: [] };
  }, !options.dryRun);
  return { ...result, summary: summaryOf(state, new Date().toISOString()) };
}
