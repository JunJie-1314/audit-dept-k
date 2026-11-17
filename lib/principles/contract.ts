/**
 * 原则使用账本 · 跨端共享契约（2026-11-17，K 台 1117）。
 *
 * 设计约束（来自需求与只读核对）：
 * - **稳定原则 ID 不是正文哈希**：正文会改，ID 由服务端注册表（catalog）持久登记，
 *   客户端离线时先用自己的候选 ID，同步后由回执换成服务端 canonical ID；
 *   身份定位靠 `week + system + eventIndex + 正文指纹别名`，正文改动只新增别名，不换 ID。
 * - **事件唯一 ID**：每次手动「用过一次」/「撤销」生成一个 UUID 事件，重试同 ID 同 payload
 *   返回原回执；同 ID 不同 payload 必须 409。
 * - **撤销只抵消一次**：undo 指向具体 use 事件；已抵消的 use 再次撤销是幂等无操作，计数不减负。
 * - 只由手动操作产生事件；阅读、展开、筛选都不增计。
 * - 纯函数、零依赖：前端直接 import；后端与站点用各自镜像实现并以本文件为准绳做契约测试。
 */

export const PRINCIPLE_USAGE_SCHEMA_VERSION = 1 as const;

export type PrincipleUsageOp = 'use' | 'undo';

/** 原则在周报数据里的原始身份（生成候选 ID 用；不写回周报）。 */
export interface PrincipleIdentity {
  week: string;
  system: string;
  eventIndex: string;
  /** 正文指纹（归一化后的短哈希），只作别名，不作永久身份。 */
  fingerprint: string;
}

/** 客户端提交的事件载荷（服务端会补 serverTime / seq / canonical principleId）。 */
export interface PrincipleUsageEventInput {
  version: typeof PRINCIPLE_USAGE_SCHEMA_VERSION;
  eventId: string;
  op: PrincipleUsageOp;
  targetEventId?: string;
  deviceId: string;
  clientTime: string;
  principle: {
    /** 客户端候选 ID（离线也能计数）；服务端按 catalog 解析成 canonical ID。 */
    id: string;
    week: string;
    system: string;
    eventIndex: string;
    title: string;
    fingerprint: string;
    /** 正文改动时由客户端携带旧指纹：同槽位改用原 ID，只新增别名（不新建原则）。 */
    replaces?: string;
  };
}

export interface PrincipleUsageEvent extends PrincipleUsageEventInput {
  /** 服务端 canonical 原则 ID（catalog 登记；客户端候选 ID 只作别名）。 */
  principleId: string;
  serverTime: string;
  seq: number;
  /** 事件载荷哈希：同 eventId 不同载荷判定冲突。 */
  payloadHash: string;
  /** 已被哪个 undo 事件抵消（仅 use 事件）。 */
  cancelledBy?: string;
}

export interface PrincipleCatalogEntry {
  id: string;
  week: string;
  system: string;
  eventIndex: string;
  title: string;
  fingerprint: string;
  /** 正文改动保留 ID：新增的正文指纹别名。 */
  aliases: string[];
  firstSeen: string;
  lastSeen: string;
}

export interface PrincipleUsageSummary {
  version: typeof PRINCIPLE_USAGE_SCHEMA_VERSION;
  counts: Record<string, number>;
  total: number;
  catalog: PrincipleCatalogEntry[];
  syncedAt: string;
}

export interface PrincipleUsageBackup {
  version: typeof PRINCIPLE_USAGE_SCHEMA_VERSION;
  exportedAt: string;
  catalog: PrincipleCatalogEntry[];
  events: PrincipleUsageEvent[];
  checksum: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEVICE_RE = /^[A-Za-z0-9_-]{4,64}$/;
const ID_RE = /^pr_[A-Za-z0-9_-]{8,64}$/;
const HASH_RE = /^[0-9a-f]{8,32}$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

/** 正文归一化：全半角、大小写、空白与标点差异不改变指纹（也避免把排版当新原则）。 */
export function normalizePrincipleText(text: unknown): string {
  return String(text ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\u3000]+/g, '')
    .replace(/[\p{P}\p{S}]+/gu, '');
}

/** 32 位 FNV-1a：跨端确定性（不依赖 crypto，浏览器/Node 结果一致），只作指纹别名。 */
export function fnv1a32(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/** 正文指纹：归一化正文的短哈希，用于别名匹配与展示去重。 */
export function principleFingerprint(text: unknown): string {
  return fnv1a32(normalizePrincipleText(text));
}

function cleanKeyPart(value: unknown): string {
  return String(value ?? '').replace(/[|\u241f]/g, ' ').trim();
}

/**
 * 槽位键：一周内同一「来源事件」可能沉淀多条原则（真实周记里 `11/09 memo` 就有多条），
 * 所以槽位只按 week + system + eventIndex 定位候选 ID 集合，具体是哪条由正文指纹别名判定。
 */
export function principleSlotKey(identity: Pick<PrincipleIdentity, 'week' | 'system' | 'eventIndex'>): string {
  return [cleanKeyPart(identity.week), cleanKeyPart(identity.system), cleanKeyPart(identity.eventIndex)].join('\u241f');
}

/** 身份键：槽位 + 正文指纹（完整定位；目录里同一 ID 可挂多个指纹别名）。 */
export function identityKey(identity: Pick<PrincipleIdentity, 'week' | 'system' | 'eventIndex' | 'fingerprint'>): string {
  return [principleSlotKey(identity), String(identity.fingerprint ?? '')].join('\u241f');
}

/** 生成新的稳定事件 ID（离线也可生成；crypto.randomUUID 不可用时退回时间+随机）。 */
export function newEventId(now: number = Date.now(), random: () => number = Math.random): string {
  const cryptoApi = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
  const rand = () => Math.floor(random() * 0x100000000).toString(16).padStart(8, '0');
  const time = now.toString(16).padStart(12, '0');
  return `${time.slice(0, 8)}-${time.slice(8, 12)}-4${rand().slice(0, 3)}-8${rand().slice(0, 3)}-${rand()}${rand().slice(0, 4)}`;
}

/** 生成候选原则 ID（首见时）；由客户端/服务端注册表持有，不从序号或正文哈希派生。 */
export function newPrincipleId(now: number = Date.now(), random: () => number = Math.random): string {
  const cryptoApi = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  const raw = cryptoApi?.randomUUID ? cryptoApi.randomUUID().replace(/-/g, '') : newEventId(now, random).replace(/-/g, '');
  return `pr_${raw.slice(0, 24)}`;
}

/** 稳定设备 ID（首见生成后持久保存；只用于区分来源，不参与计数去重）。 */
export function newDeviceId(now: number = Date.now(), random: () => number = Math.random): string {
  return `dev_${fnv1a32(`${now}:${random()}`)}${fnv1a32(`${random()}:${now}`)}`;
}

export interface ValidationResult<T> {
  ok: boolean;
  value?: T;
  errors: string[];
}

function bad(errors: string[]): { ok: false; errors: string[] } {
  return { ok: false, errors };
}

function textField(value: unknown, name: string, max: number, errors: string[]): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) {
    errors.push(`${name} 必须是非空字符串且不超过 ${max} 字`);
    return '';
  }
  return value.trim();
}

/** 校验单个事件载荷（服务端入口与离线队列写回共用）。 */
export function validateUsageEvent(body: unknown): ValidationResult<PrincipleUsageEventInput> {
  const errors: string[] = [];
  if (!body || typeof body !== 'object' || Array.isArray(body)) return bad(['事件必须是对象']);
  const value = body as Record<string, unknown>;
  if (value.version !== PRINCIPLE_USAGE_SCHEMA_VERSION) errors.push(`version 必须为 ${PRINCIPLE_USAGE_SCHEMA_VERSION}`);
  const eventId = textField(value.eventId, 'eventId', 64, errors);
  if (eventId && !UUID_RE.test(eventId)) errors.push('eventId 必须是 UUID（v4 等标准格式）');
  const op = value.op;
  if (op !== 'use' && op !== 'undo') errors.push('op 只能是 use 或 undo');
  const deviceId = textField(value.deviceId, 'deviceId', 64, errors);
  if (deviceId && !DEVICE_RE.test(deviceId)) errors.push('deviceId 只能包含字母、数字、下划线与短横线');
  const clientTime = textField(value.clientTime, 'clientTime', 40, errors);
  if (clientTime && (!ISO_RE.test(clientTime) || !Number.isFinite(Date.parse(clientTime)))) {
    errors.push('clientTime 必须是 UTC ISO 时间');
  }
  const targetEventId = value.targetEventId == null ? undefined : String(value.targetEventId);
  if (op === 'undo') {
    if (!targetEventId) errors.push('撤销事件必须指向 targetEventId');
    else if (!UUID_RE.test(targetEventId)) errors.push('targetEventId 必须是 UUID');
  } else if (targetEventId) {
    errors.push('use 事件不能携带 targetEventId');
  }
  const principle = value.principle && typeof value.principle === 'object' && !Array.isArray(value.principle)
    ? value.principle as Record<string, unknown> : null;
  if (!principle) {
    errors.push('principle 必须是对象');
    return bad(errors);
  }
  const id = textField(principle.id, 'principle.id', 64, errors);
  if (id && !ID_RE.test(id)) errors.push('principle.id 必须是 pr_ 开头的稳定 ID');
  const week = textField(principle.week, 'principle.week', 32, errors);
  const system = textField(principle.system, 'principle.system', 32, errors);
  const eventIndex = textField(principle.eventIndex, 'principle.eventIndex', 300, errors);
  const title = textField(principle.title, 'principle.title', 2000, errors);
  const fingerprint = textField(principle.fingerprint, 'principle.fingerprint', 32, errors);
  if (fingerprint && !HASH_RE.test(fingerprint)) errors.push('principle.fingerprint 必须是 8–32 位小写十六进制');
  const replaces = principle.replaces == null ? undefined : String(principle.replaces);
  if (replaces !== undefined && !HASH_RE.test(replaces)) errors.push('principle.replaces 必须是旧正文指纹');
  if (errors.length) return bad(errors);
  return {
    ok: true,
    errors: [],
    value: {
      version: PRINCIPLE_USAGE_SCHEMA_VERSION,
      eventId,
      op: op as PrincipleUsageOp,
      ...(targetEventId ? { targetEventId } : {}),
      deviceId,
      clientTime,
      principle: {
        id, week, system, eventIndex, title, fingerprint,
        ...(replaces !== undefined ? { replaces } : {}),
      },
    },
  };
}

/** 事件载荷哈希：判定「同 eventId 是否同一事件」。服务端字段不参与。 */
export function payloadHash(event: PrincipleUsageEventInput): string {
  return fnv1a32(JSON.stringify([
    event.version, event.eventId, event.op, event.targetEventId ?? '',
    event.deviceId, event.clientTime,
    event.principle.id, event.principle.week, event.principle.system,
    event.principle.eventIndex, event.principle.title, event.principle.fingerprint,
    event.principle.replaces ?? '',
  ]));
}

/** 校验校验和（备份/恢复用）。 */
export function backupChecksum(catalog: PrincipleCatalogEntry[], events: PrincipleUsageEvent[]): string {
  const canonical = (list: unknown) => JSON.stringify(list);
  const items = [...catalog].sort((a, b) => a.id.localeCompare(b.id)).map((entry) => [
    entry.id, entry.week, entry.system, entry.eventIndex, entry.title, entry.fingerprint,
    [...entry.aliases].sort(), entry.firstSeen, entry.lastSeen,
  ]);
  const rows = [...events].sort((a, b) => a.seq - b.seq).map((event) => [
    event.version, event.eventId, event.op, event.targetEventId ?? '', event.deviceId,
    event.clientTime, event.principleId, event.principle.week, event.principle.system,
    event.principle.eventIndex, event.principle.title, event.principle.fingerprint,
    event.serverTime, event.seq, event.payloadHash, event.cancelledBy ?? '',
  ]);
  return fnv1a32(canonical(items) + canonical(rows));
}

/** 按事件顺序计算计数：use 记 1，undo 抵消其目标的 use 且只抵消一次；计数永不为负。 */
export function computeCounts(
  events: Array<Pick<PrincipleUsageEvent, 'eventId' | 'op' | 'targetEventId' | 'principleId' | 'principle'>>,
  resolveId: (event: Pick<PrincipleUsageEvent, 'principleId' | 'principle'>) => string = (event) => event.principleId,
): { counts: Record<string, number>; total: number; active: Set<string>; cancelled: Set<string> } {
  const counts: Record<string, number> = {};
  const active = new Set<string>();
  const cancelled = new Set<string>();
  const byId = new Map(events.map((event) => [event.eventId, event]));
  for (const event of events) {
    if (event.op === 'use') {
      if (cancelled.has(event.eventId)) continue;
      active.add(event.eventId);
      const id = resolveId(event);
      counts[id] = (counts[id] ?? 0) + 1;
    } else {
      const target = event.targetEventId ? byId.get(event.targetEventId) : undefined;
      if (!target || target.op !== 'use' || cancelled.has(target.eventId)) continue;
      cancelled.add(target.eventId);
      const id = resolveId(target);
      const next = (counts[id] ?? 0) - 1;
      if (next > 0) counts[id] = next;
      else delete counts[id];
    }
  }
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
  return { counts, total, active, cancelled };
}

/** 校验备份结构 + 校验和；恢复前必须全量通过。 */
export function validateBackup(body: unknown): ValidationResult<PrincipleUsageBackup> {
  const errors: string[] = [];
  if (!body || typeof body !== 'object' || Array.isArray(body)) return bad(['备份必须是对象']);
  const value = body as Record<string, unknown>;
  if (value.version !== PRINCIPLE_USAGE_SCHEMA_VERSION) errors.push(`version 必须为 ${PRINCIPLE_USAGE_SCHEMA_VERSION}`);
  if (typeof value.exportedAt !== 'string' || !Number.isFinite(Date.parse(value.exportedAt))) errors.push('exportedAt 不合法');
  const catalog = Array.isArray(value.catalog) ? value.catalog : null;
  const events = Array.isArray(value.events) ? value.events : null;
  if (!catalog) errors.push('catalog 必须是数组');
  if (!events) errors.push('events 必须是数组');
  if (!catalog || !events) return bad(errors);
  const catalogEntries: PrincipleCatalogEntry[] = [];
  for (const raw of catalog) {
    const entry = raw as Record<string, unknown>;
    if (!entry || typeof entry !== 'object' || !ID_RE.test(String(entry.id ?? '')) ||
      typeof entry.week !== 'string' || typeof entry.system !== 'string' ||
      typeof entry.eventIndex !== 'string' || typeof entry.title !== 'string' ||
      !HASH_RE.test(String(entry.fingerprint ?? '')) || !Array.isArray(entry.aliases) ||
      !entry.aliases.every((alias) => HASH_RE.test(String(alias))) ||
      typeof entry.firstSeen !== 'string' || typeof entry.lastSeen !== 'string') {
      errors.push(`catalog 条目不合法：${String((entry as Record<string, unknown>)?.id ?? '?')}`);
      continue;
    }
    catalogEntries.push({
      id: String(entry.id), week: String(entry.week), system: String(entry.system),
      eventIndex: String(entry.eventIndex), title: String(entry.title),
      fingerprint: String(entry.fingerprint), aliases: (entry.aliases as unknown[]).map(String),
      firstSeen: String(entry.firstSeen), lastSeen: String(entry.lastSeen),
    });
  }
  const eventsOut: PrincipleUsageEvent[] = [];
  for (const raw of events) {
    const checked = validateUsageEvent({
      version: raw && typeof raw === 'object' ? (raw as Record<string, unknown>).version : undefined,
      eventId: (raw as Record<string, unknown>)?.eventId,
      op: (raw as Record<string, unknown>)?.op,
      targetEventId: (raw as Record<string, unknown>)?.targetEventId,
      deviceId: (raw as Record<string, unknown>)?.deviceId,
      clientTime: (raw as Record<string, unknown>)?.clientTime,
      principle: (raw as Record<string, unknown>)?.principle,
    });
    const event = raw as Record<string, unknown>;
    if (!checked.ok || !checked.value) {
      errors.push(`事件不合法：${String(event?.eventId ?? '?')}`);
      continue;
    }
    if (!ID_RE.test(String(event.principleId ?? '')) || !Number.isSafeInteger(event.seq) ||
      typeof event.serverTime !== 'string' || !HASH_RE.test(String(event.payloadHash ?? '')) ||
      (event.cancelledBy != null && !UUID_RE.test(String(event.cancelledBy)))) {
      errors.push(`事件服务端字段不合法：${String(event?.eventId ?? '?')}`);
      continue;
    }
    eventsOut.push({
      ...checked.value,
      principleId: String(event.principleId),
      serverTime: String(event.serverTime),
      seq: Number(event.seq),
      payloadHash: String(event.payloadHash),
      ...(event.cancelledBy != null ? { cancelledBy: String(event.cancelledBy) } : {}),
    });
  }
  if (errors.length) return bad(errors);
  const checksum = backupChecksum(catalogEntries, eventsOut);
  if (value.checksum !== checksum) return bad(['备份校验和不匹配：文件可能被改动或截断']);
  return { ok: true, errors: [], value: { version: PRINCIPLE_USAGE_SCHEMA_VERSION, exportedAt: String(value.exportedAt), catalog: catalogEntries, events: eventsOut, checksum } };
}

/** 离线队列：同 eventId 去重（保留最早），顺序按 clientTime 稳定排序。 */
export function dedupePending<T extends Pick<PrincipleUsageEventInput, 'eventId' | 'clientTime'>>(events: T[]): T[] {
  const seen = new Set<string>();
  const kept: T[] = [];
  for (const event of events) {
    if (seen.has(event.eventId)) continue;
    seen.add(event.eventId);
    kept.push(event);
  }
  return kept.sort((a, b) => a.clientTime.localeCompare(b.clientTime) || a.eventId.localeCompare(b.eventId));
}

/** 服务端事件 → 摘要（catalog 内 canonical 映射；未登记的身份按事件自身 ID 计数）。 */
export function summarizeUsage(
  events: PrincipleUsageEvent[],
  catalog: PrincipleCatalogEntry[],
  syncedAt: string,
): PrincipleUsageSummary {
  const canonical = new Map<string, string>();
  for (const entry of catalog) {
    canonical.set(entry.id, entry.id);
    for (const alias of entry.aliases) {
      if (!canonical.has(alias)) canonical.set(alias, entry.id);
    }
  }
  const { counts, total } = computeCounts(events, (event) => canonical.get(event.principleId) ?? event.principleId);
  return {
    version: PRINCIPLE_USAGE_SCHEMA_VERSION,
    counts,
    total,
    catalog: [...catalog].sort((a, b) => a.id.localeCompare(b.id)),
    syncedAt,
  };
}
