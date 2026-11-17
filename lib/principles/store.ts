/**
 * 原则使用账本 · 站点私有持久化（Upstash Redis REST，零依赖）。
 *
 * 事件协议（与 workbench/shared/principles/contract.ts 同契约）：
 * - 事件按 `eventId` 用 `HSETNX` 原子占位：同 ID 同载荷 = 幂等重试（返回原回执）；
 *   同 ID 不同载荷 = 409 冲突。两台设备并发不同事件各自成功，不会互相覆盖。
 * - 撤销用 `HSETNX undo:<targetEventId>` 抢占，保证同一条 use 只被抵消一次；
 *   已抵消后再次撤销是幂等重试（返回原回执），不把计数减成负数。
 * - 计数是**派生值**：每次读取都从事件重算，计数缓存坏了也不会把账本写丢。
 * - catalog 负责稳定原则 ID：ID 由服务端在首见时生成并持久登记（不从序号/正文哈希派生）；
 *   同一槽位（week+system+eventIndex）正文改动时沿用原 ID，只新增正文指纹别名。
 * - 命名空间独立：`principles:v1:*`，与财务 `finance:*` 完全隔离。
 *
 * 仅可在服务端 Route Handler import（凭据只来自部署环境变量）。
 */

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
const KEY_EVENTS = `${NS}:events`;
const KEY_CATALOG = `${NS}:catalog`;
const KEY_UNDO = `${NS}:undo`;
const KEY_SEQ = `${NS}:seq`;

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

function parseObject<T>(raw: string | null, code: string): T | null {
  if (raw == null || raw === '') return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new PrinciplesStoreError(code, '原则账本存储内容损坏，已保留原数据');
  }
}

/** HGETALL 兼容两种上游返回（平铺数组 / 对象）。 */
function hashPairs(raw: unknown): Array<[string, string]> {
  if (Array.isArray(raw)) {
    const pairs: Array<[string, string]> = [];
    for (let i = 0; i + 1 < raw.length; i += 2) pairs.push([String(raw[i]), String(raw[i + 1])]);
    return pairs;
  }
  if (raw && typeof raw === 'object') {
    return Object.entries(raw as Record<string, unknown>).map(([key, value]) => [key, String(value)]);
  }
  return [];
}

async function readEvents(redis: Redis): Promise<PrincipleUsageEvent[]> {
  const pairs = hashPairs(await redis(['HGETALL', KEY_EVENTS]));
  const events: PrincipleUsageEvent[] = [];
  for (const [, raw] of pairs) {
    const event = parseObject<PrincipleUsageEvent>(raw, 'PRINCIPLES_STORE_CORRUPT');
    if (event && typeof event.eventId === 'string') events.push(event);
  }
  return events.sort((a, b) => a.seq - b.seq || a.eventId.localeCompare(b.eventId));
}

async function readCatalog(redis: Redis): Promise<PrincipleCatalogEntry[]> {
  const pairs = hashPairs(await redis(['HGETALL', KEY_CATALOG]));
  const entries: PrincipleCatalogEntry[] = [];
  for (const [field, raw] of pairs) {
    if (!field.startsWith('id:')) continue;
    const entry = parseObject<PrincipleCatalogEntry>(raw, 'PRINCIPLES_STORE_CORRUPT');
    if (entry && typeof entry.id === 'string') entries.push(entry);
  }
  return entries.sort((a, b) => a.id.localeCompare(b.id));
}

async function saveCatalogEntry(redis: Redis, entry: PrincipleCatalogEntry): Promise<void> {
  await redis(['HSET', KEY_CATALOG, `id:${entry.id}`, JSON.stringify(entry)]);
  const slotField = `slot:${principleSlotKey(entry)}`;
  const raw = asString(await redis(['HGET', KEY_CATALOG, slotField]));
  const ids = parseObject<string[]>(raw, 'PRINCIPLES_STORE_CORRUPT') ?? [];
  if (!ids.includes(entry.id)) {
    await redis(['HSET', KEY_CATALOG, slotField, JSON.stringify([...ids, entry.id])]);
  }
  for (const alias of [entry.fingerprint, ...entry.aliases]) {
    await redis(['HSETNX', KEY_CATALOG, `alias:${alias}`, entry.id]);
  }
}

/**
 * 解析稳定原则 ID。顺序：槽位内指纹命中 → 槽位唯一则沿用并登记新指纹（正文改动保留 ID）
 * → 全局指纹别名 → 新建 ID 注册。返回 canonical ID 与（可能新增的）catalog 条目。
 */
async function resolvePrinciple(
  redis: Redis,
  input: PrincipleUsageEventInput,
  now: string,
): Promise<PrincipleCatalogEntry> {
  const { principle } = input;
  const slotField = `slot:${principleSlotKey(principle)}`;
  const slotIds = parseObject<string[]>(asString(await redis(['HGET', KEY_CATALOG, slotField])), 'PRINCIPLES_STORE_CORRUPT') ?? [];
  const load = async (id: string) => parseObject<PrincipleCatalogEntry>(
    asString(await redis(['HGET', KEY_CATALOG, `id:${id}`])), 'PRINCIPLES_STORE_CORRUPT',
  );

  for (const id of slotIds) {
    const entry = await load(id);
    if (entry && (entry.fingerprint === principle.fingerprint || entry.aliases.includes(principle.fingerprint))) {
      return { ...entry, title: principle.title || entry.title, lastSeen: now };
    }
  }
  if (principle.replaces) {
    // 客户端明确告知「正文改过」：沿用旧指纹对应的 ID，只新增别名。
    for (const id of slotIds) {
      const existing = await load(id);
      if (existing && (existing.fingerprint === principle.replaces || existing.aliases.includes(principle.replaces))) {
        const aliases = Array.from(new Set([...existing.aliases, principle.fingerprint]))
          .filter((alias) => alias !== existing.fingerprint);
        const entry: PrincipleCatalogEntry = {
          ...existing,
          title: principle.title || existing.title,
          aliases,
          lastSeen: now,
        };
        await redis(['HSET', KEY_CATALOG, `alias:${principle.fingerprint}`, existing.id]);
        return entry;
      }
    }
  }
  const byAlias = asString(await redis(['HGET', KEY_CATALOG, `alias:${principle.fingerprint}`]));
  if (byAlias) {
    const existing = await load(byAlias);
    if (existing) return { ...existing, title: principle.title || existing.title, lastSeen: now };
  }
  const id = principle.id;
  const entry: PrincipleCatalogEntry = {
    id,
    week: principle.week,
    system: principle.system,
    eventIndex: principle.eventIndex,
    title: principle.title,
    fingerprint: principle.fingerprint,
    aliases: [],
    firstSeen: now,
    lastSeen: now,
  };
  await saveCatalogEntry(redis, entry);
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

/** 写入/补写一批事件；校验、幂等、冲突与撤销语义都在这里。 */
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
  const accepted: EventReceipt[] = [];
  const duplicates: EventReceipt[] = [];
  const nowIso = now.toISOString();

  for (const input of ordered) {
    const hash = payloadHash(input);
    const existingRaw = asString(await redis(['HGET', KEY_EVENTS, input.eventId]));
    if (existingRaw) {
      const existing = parseObject<PrincipleUsageEvent>(existingRaw, 'PRINCIPLES_STORE_CORRUPT');
      if (!existing) continue;
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
      const targetRaw = asString(await redis(['HGET', KEY_EVENTS, String(input.targetEventId)]));
      target = parseObject<PrincipleUsageEvent>(targetRaw, 'PRINCIPLES_STORE_CORRUPT');
      if (!target || target.op !== 'use') {
        throw new PrinciplesStoreError('PRINCIPLES_TARGET_MISSING', '撤销目标不存在或不是一次使用记录', 409);
      }
      const claimed = Number(await redis(['HSETNX', KEY_UNDO, target.eventId, input.eventId]));
      const owner = asString(await redis(['HGET', KEY_UNDO, target.eventId]));
      if (claimed !== 1 && owner !== input.eventId) {
        throw new PrinciplesStoreError('PRINCIPLES_ALREADY_CANCELLED', '这条使用记录已被撤销，不能重复抵消', 409);
      }
    }

    const catalogEntry = await resolvePrinciple(redis, input, nowIso);
    const seq = Number(await redis(['INCR', KEY_SEQ]));
    const event: PrincipleUsageEvent = {
      ...input,
      principleId: catalogEntry.id,
      serverTime: nowIso,
      seq: Number.isFinite(seq) ? seq : 0,
      payloadHash: hash,
    };
    if (target) {
      const updatedTarget: PrincipleUsageEvent = { ...target, cancelledBy: input.eventId };
      await redis(['HSET', KEY_EVENTS, target.eventId, JSON.stringify(updatedTarget)]);
    }
    const inserted = Number(await redis(['HSETNX', KEY_EVENTS, input.eventId, JSON.stringify(event)]));
    if (inserted !== 1) {
      // 同事件并发重试：读回已写入的事件，载荷一致按幂等回执处理。
      const raced = parseObject<PrincipleUsageEvent>(
        asString(await redis(['HGET', KEY_EVENTS, input.eventId])), 'PRINCIPLES_STORE_CORRUPT',
      );
      if (raced && raced.payloadHash === hash) {
        duplicates.push({
          eventId: raced.eventId, principleId: raced.principleId, seq: raced.seq,
          serverTime: raced.serverTime, duplicate: true,
        });
        continue;
      }
      throw new PrinciplesStoreError('PRINCIPLES_EVENT_CONFLICT', '同 eventId 的并发写入载荷不同，拒绝覆盖', 409);
    }
    await saveCatalogEntry(redis, { ...catalogEntry, lastSeen: nowIso });
    accepted.push({
      eventId: event.eventId, principleId: event.principleId, seq: event.seq,
      serverTime: event.serverTime, duplicate: false,
    });
  }

  return { accepted, duplicates, summary: await getSummary(redis) };
}

/** 读取计数摘要（计数从事件重算，不信任缓存）。 */
export async function getSummary(redis: Redis, now: Date = new Date()): Promise<PrincipleUsageSummary> {
  const [events, catalog] = await Promise.all([readEvents(redis), readCatalog(redis)]);
  return summarizeUsage(events, catalog, now.toISOString());
}

export async function exportBackup(redis: Redis, now: Date = new Date()): Promise<PrincipleUsageBackup> {
  const [events, catalog] = await Promise.all([readEvents(redis), readCatalog(redis)]);
  return {
    version: PRINCIPLE_USAGE_SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    catalog,
    events,
    checksum: backupChecksum(catalog, events),
  };
}

export interface RestoreResult {
  dryRun: boolean;
  imported: number;
  duplicates: number;
  conflicts: string[];
  summary: PrincipleUsageSummary;
}

/**
 * 恢复：全量校验 + 校验和通过后才写入；按 eventId 合并，重复恢复不会加倍。
 * `dryRun=true` 只报告将导入的条数，不写任何键。
 */
export async function restoreBackup(redis: Redis, body: unknown, options: { dryRun?: boolean } = {}): Promise<RestoreResult> {
  const checked = validateBackup(body);
  if (!checked.ok || !checked.value) {
    throw new PrinciplesStoreError('PRINCIPLES_BACKUP_INVALID', checked.errors.join('；'), 400);
  }
  const backup = checked.value;
  const conflicts: string[] = [];
  let imported = 0;
  let duplicates = 0;
  const existingBySlot = new Map<string, PrincipleUsageEvent>();

  for (const event of backup.events) {
    const existingRaw = asString(await redis(['HGET', KEY_EVENTS, event.eventId]));
    const existing = parseObject<PrincipleUsageEvent>(existingRaw, 'PRINCIPLES_STORE_CORRUPT');
    if (existing) {
      if (existing.payloadHash !== event.payloadHash) conflicts.push(event.eventId);
      else duplicates += 1;
      continue;
    }
    imported += 1;
    existingBySlot.set(event.eventId, event);
  }
  if (conflicts.length) {
    throw new PrinciplesStoreError(
      'PRINCIPLES_BACKUP_CONFLICT',
      `备份与现有账本有 ${conflicts.length} 个同 ID 不同载荷事件：${conflicts.slice(0, 5).join('、')}`,
      409,
    );
  }
  if (options.dryRun) {
    return { dryRun: true, imported, duplicates, conflicts, summary: await getSummary(redis) };
  }

  const ordered = backup.events.slice().sort((a, b) => a.seq - b.seq);
  for (const event of ordered) {
    if (!existingBySlot.has(event.eventId)) continue;
    const inserted = Number(await redis(['HSETNX', KEY_EVENTS, event.eventId, JSON.stringify(event)]));
    if (inserted !== 1) continue;
    if (event.op === 'undo' && event.targetEventId) {
      const target = parseObject<PrincipleUsageEvent>(
        asString(await redis(['HGET', KEY_EVENTS, event.targetEventId])), 'PRINCIPLES_STORE_CORRUPT',
      );
      if (target) {
        await redis(['HSET', KEY_EVENTS, event.targetEventId, JSON.stringify({ ...target, cancelledBy: event.eventId })]);
      }
      await redis(['HSETNX', KEY_UNDO, event.targetEventId, event.eventId]);
    }
    const entry = backup.catalog.find((item) => item.id === event.principleId);
    await saveCatalogEntry(redis, entry ?? {
      id: event.principleId,
      week: event.principle.week,
      system: event.principle.system,
      eventIndex: event.principle.eventIndex,
      title: event.principle.title,
      fingerprint: event.principle.fingerprint,
      aliases: [],
      firstSeen: event.serverTime,
      lastSeen: event.serverTime,
    });
  }
  const maxSeq = ordered.reduce((max, event) => Math.max(max, event.seq), 0);
  const currentSeq = Number(asString(await redis(['GET', KEY_SEQ])) ?? 0);
  if (maxSeq > currentSeq) await redis(['SET', KEY_SEQ, String(maxSeq)]);

  return { dryRun: false, imported, duplicates, conflicts, summary: await getSummary(redis) };
}
