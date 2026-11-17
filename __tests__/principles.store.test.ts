// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import {
  PrinciplesStoreError,
  exportBackup,
  getSummary,
  recordEvents,
  restoreBackup,
  type Redis,
} from '@/lib/principles/store';
import {
  backupChecksum,
  newEventId,
  newPrincipleId,
  principleFingerprint,
  type PrincipleUsageEventInput,
} from '@/lib/principles/contract';

/** 最小内存 Redis：只实现账本用到的命令，模拟 Upstash REST 的单命令原子语义。 */
class MemoryRedis {
  readonly hashes = new Map<string, Map<string, string>>();
  readonly strings = new Map<string, string>();
  command = async (args: Array<string | number>): Promise<unknown> => {
    const [name, ...rest] = args.map(String);
    const hash = (key: string) => {
      if (!this.hashes.has(key)) this.hashes.set(key, new Map());
      return this.hashes.get(key)!;
    };
    switch (name) {
      case 'HGET': return hash(rest[0]).get(rest[1]) ?? null;
      case 'HSET': hash(rest[0]).set(rest[1], rest[2]); return 1;
      case 'HSETNX': {
        const h = hash(rest[0]);
        if (h.has(rest[1])) return 0;
        h.set(rest[1], rest[2]);
        return 1;
      }
      case 'HGETALL': return [...hash(rest[0]).entries()].flat();
      case 'INCR': {
        const next = Number(this.strings.get(rest[0]) ?? 0) + 1;
        this.strings.set(rest[0], String(next));
        return next;
      }
      case 'GET': return this.strings.get(rest[0]) ?? null;
      case 'SET': this.strings.set(rest[0], rest[1]); return 'OK';
      default: throw new Error(`unsupported ${name}`);
    }
  };
}

const DEVICE_A = 'dev_aaaabbbb';
const DEVICE_B = 'dev_ccccdddd';
let rng = 0;
const uniqueId = () => newEventId(1700000000000 + rng++, () => 0.5);

function event(over: Partial<PrincipleUsageEventInput> & { principle?: Partial<PrincipleUsageEventInput['principle']> } = {}): PrincipleUsageEventInput {
  const principle = {
    id: newPrincipleId(1700000000000 + rng++, () => 0.25),
    week: 'W46',
    system: 'social',
    eventIndex: '11/09 memo',
    title: '交情用一次少一次',
    fingerprint: principleFingerprint('交情用一次少一次，请人帮忙必须让对方拿到实打实的好处'),
    ...over.principle,
  };
  return {
    version: 1,
    eventId: uniqueId(),
    op: 'use',
    deviceId: DEVICE_A,
    clientTime: '2026-11-17T03:00:00.000Z',
    principle,
    ...over,
  };
}

let redis: Redis;
let memory: MemoryRedis;
beforeEach(() => {
  memory = new MemoryRedis();
  redis = memory.command;
});

describe('原则账本 · 事件协议', () => {
  it('同事件重试幂等：只计一次，返回原回执', async () => {
    const first = event();
    const a = await recordEvents(redis, [first]);
    expect(a.accepted).toHaveLength(1);
    expect(a.summary.total).toBe(1);
    const b = await recordEvents(redis, [first]);
    expect(b.accepted).toHaveLength(0);
    expect(b.duplicates[0].eventId).toBe(first.eventId);
    expect(b.duplicates[0].seq).toBe(a.accepted[0].seq);
    expect(b.summary.total).toBe(1);
  });

  it('同 eventId 不同载荷 → 409，不覆盖原事件', async () => {
    const first = event();
    await recordEvents(redis, [first]);
    const tampered = { ...first, op: 'undo' as const, targetEventId: uniqueId() };
    await expect(recordEvents(redis, [tampered])).rejects.toMatchObject({
      code: 'PRINCIPLES_EVENT_CONFLICT', status: 409,
    });
    expect((await getSummary(redis)).total).toBe(1);
  });

  it('两台设备并发不同事件都保留，同一原则跨端合并到同一稳定 ID', async () => {
    const base = event();
    // 设备 B 没有本地 catalog，候选 ID 不同，但身份（周/系统/事件/正文指纹）相同。
    const other = event({ deviceId: DEVICE_B, eventId: uniqueId(), principle: { ...base.principle, id: newPrincipleId(9, () => 0.4) } });
    // 同槽位另一条原则（真实周记同一天常有多条）保持独立 ID。
    const distinct = event({
      deviceId: DEVICE_B,
      eventId: uniqueId(),
      principle: { ...base.principle, id: newPrincipleId(10, () => 0.5), title: '没有真正的保密', fingerprint: principleFingerprint('没有真正的保密，只有还没传开的秘密') },
    });
    await recordEvents(redis, [base]);
    await recordEvents(redis, [other, distinct]);
    const seenByOtherDevice = await getSummary(redis);
    expect(seenByOtherDevice.total).toBe(3);
    expect(seenByOtherDevice.catalog).toHaveLength(2);
    expect(Object.values(seenByOtherDevice.counts).sort()).toEqual([1, 2]);
  });

  it('撤销抵消具体一次使用，且不能重复抵消、不减负', async () => {
    const use = event();
    await recordEvents(redis, [use]);
    const undo: PrincipleUsageEventInput = {
      version: 1, eventId: uniqueId(), op: 'undo', targetEventId: use.eventId,
      deviceId: DEVICE_B, clientTime: '2026-11-17T04:00:00.000Z', principle: use.principle,
    };
    const result = await recordEvents(redis, [undo]);
    expect(result.summary.total).toBe(0);
    const retry = await recordEvents(redis, [undo]);
    expect(retry.duplicates).toHaveLength(1);
    expect(retry.summary.total).toBe(0);
    const secondUndo: PrincipleUsageEventInput = { ...undo, eventId: uniqueId() };
    await expect(recordEvents(redis, [secondUndo])).rejects.toMatchObject({ code: 'PRINCIPLES_ALREADY_CANCELLED' });
    expect((await getSummary(redis)).total).toBe(0);
  });

  it('撤销先于使用到达（离线队列乱序）→ 目标缺失，待重试', async () => {
    const use = event();
    const undo: PrincipleUsageEventInput = {
      version: 1, eventId: uniqueId(), op: 'undo', targetEventId: use.eventId,
      deviceId: DEVICE_A, clientTime: '2026-11-17T02:00:00.000Z', principle: use.principle,
    };
    await expect(recordEvents(redis, [undo])).rejects.toMatchObject({ code: 'PRINCIPLES_TARGET_MISSING' });
    await recordEvents(redis, [use]);
    const ok = await recordEvents(redis, [undo]);
    expect(ok.summary.total).toBe(0);
  });

  it('稳定 ID：同槽位第二条原则有独立 ID；正文改动用 replaces 保留原 ID 并新增别名', async () => {
    const first = event();
    const second = event({
      eventId: uniqueId(),
      principle: {
        ...first.principle,
        id: newPrincipleId(1, () => 0.3),
        title: '没有真正的保密',
        fingerprint: principleFingerprint('没有真正的保密，只有还没传开的秘密'),
      },
    });
    const saved = await recordEvents(redis, [first, second]);
    expect(saved.summary.catalog).toHaveLength(2);
    const firstId = saved.accepted.find((receipt) => receipt.eventId === first.eventId)!.principleId;
    const secondId = saved.accepted.find((receipt) => receipt.eventId === second.eventId)!.principleId;
    expect(firstId).not.toBe(secondId);

    // 正文小改（旧指纹由客户端在 replaces 里带上）→ 仍是同一个 ID，别名增加。
    const revised: PrincipleUsageEventInput = {
      ...first,
      eventId: uniqueId(),
      clientTime: '2026-11-17T05:00:00.000Z',
      principle: {
        ...first.principle,
        id: newPrincipleId(2, () => 0.1),
        title: '交情用一次少一次（修订）',
        fingerprint: principleFingerprint('交情用一次少一次，请人帮忙先让对方拿到实打实的好处'),
        replaces: first.principle.fingerprint,
      },
    };
    const after = await recordEvents(redis, [revised]);
    expect(after.accepted[0].principleId).toBe(firstId);
    const entry = after.summary.catalog.find((item) => item.id === firstId)!;
    expect(entry.aliases).toContain(revised.principle.fingerprint);
    expect(after.summary.total).toBe(3);
  });

  it('并发同事件（两客户端重试）只计一次，另一请求得到原回执', async () => {
    const use = event();
    const [first, second] = await Promise.all([
      recordEvents(redis, [use]),
      recordEvents(redis, [use]),
    ]);
    expect(first.accepted.length + second.accepted.length).toBe(1);
    expect(first.duplicates.length + second.duplicates.length).toBe(1);
    expect((await getSummary(redis)).total).toBe(1);
    const receipts = [...first.accepted, ...second.duplicates, ...first.duplicates, ...second.accepted];
    expect(new Set(receipts.map((receipt) => receipt.seq)).size).toBe(1);
  });

  it('并发不同事件（两台设备）都保留，跨客户端读一致', async () => {
    const first = event({ deviceId: DEVICE_A });
    const second = event({
      deviceId: DEVICE_B,
      principle: {
        ...first.principle,
        id: newPrincipleId(11, () => 0.6),
        title: '没有真正的保密',
        fingerprint: principleFingerprint('没有真正的保密，只有还没传开的秘密'),
      },
    });
    const [a, b] = await Promise.all([
      recordEvents(redis, [first]),
      recordEvents(redis, [second]),
    ]);
    expect(a.accepted).toHaveLength(1);
    expect(b.accepted).toHaveLength(1);
    const summary = await getSummary(redis);
    expect(summary.total).toBe(2);
    expect(Object.values(summary.counts).sort()).toEqual([1, 1]);
    // 另一个客户端只读同一命名空间，得到同一份计数。
    expect(await getSummary(redis)).toEqual(summary);
  });

  it('并发两个撤销抢同一条使用：只抵消一次，另一个显式失败', async () => {
    const use = event();
    await recordEvents(redis, [use]);
    const undoOne: PrincipleUsageEventInput = {
      version: 1, eventId: uniqueId(), op: 'undo', targetEventId: use.eventId,
      deviceId: DEVICE_A, clientTime: '2026-11-17T07:00:00.000Z', principle: use.principle,
    };
    const undoTwo: PrincipleUsageEventInput = { ...undoOne, eventId: uniqueId(), deviceId: DEVICE_B };
    const results = await Promise.allSettled([
      recordEvents(redis, [undoOne]),
      recordEvents(redis, [undoTwo]),
    ]);
    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({ code: 'PRINCIPLES_ALREADY_CANCELLED' });
    expect((await getSummary(redis)).total).toBe(0);
  });

  it('批量内重复事件去重，计数不重复', async () => {
    const one = event();
    const result = await recordEvents(redis, [one, one, event({ eventId: uniqueId() })]);
    expect(result.summary.total).toBe(2);
  });
});

describe('原则账本 · 备份与恢复', () => {
  it('导出→恢复往返一致；重复恢复不倍增；校验和防篡改', async () => {
    const use = event();
    const undo: PrincipleUsageEventInput = {
      version: 1, eventId: uniqueId(), op: 'undo', targetEventId: use.eventId,
      deviceId: DEVICE_B, clientTime: '2026-11-17T06:00:00.000Z', principle: use.principle,
    };
    await recordEvents(redis, [use, event({ deviceId: DEVICE_B }), undo]);
    const backup = await exportBackup(redis);
    expect(backup.events).toHaveLength(3);
    expect(backup.checksum).toBe(backupChecksum(backup.catalog, backup.events));

    const fresh = new MemoryRedis();
    const firstRestore = await restoreBackup(fresh.command, backup);
    expect(firstRestore.imported).toBe(3);
    expect(firstRestore.summary.total).toBe(1);

    const again = await restoreBackup(fresh.command, backup);
    expect(again.imported).toBe(0);
    expect(again.duplicates).toBe(3);
    expect(again.summary.total).toBe(1);

    const tampered = { ...backup, events: backup.events.slice(0, 2) };
    await expect(restoreBackup(fresh.command, tampered)).rejects.toMatchObject({ code: 'PRINCIPLES_BACKUP_INVALID' });
  });

  it('恢复预演不写入', async () => {
    await recordEvents(redis, [event()]);
    const backup = await exportBackup(redis);
    const fresh = new MemoryRedis();
    const dry = await restoreBackup(fresh.command, backup, { dryRun: true });
    expect(dry.dryRun).toBe(true);
    expect(dry.imported).toBe(1);
    expect((await getSummary(fresh.command)).total).toBe(0);
  });

  it('恢复时同 ID 不同载荷整批拒绝', async () => {
    await recordEvents(redis, [event()]);
    const backup = await exportBackup(redis);
    const conflict = {
      ...backup,
      events: [{ ...backup.events[0], payloadHash: 'deadbeef' }],
    };
    conflict.checksum = backupChecksum(conflict.catalog, conflict.events);
    await expect(restoreBackup(redis, conflict)).rejects.toMatchObject({ code: 'PRINCIPLES_BACKUP_CONFLICT' });
  });
});

describe('原则账本 · 输入校验', () => {
  it('拒绝空批次、超长批次与非法事件', async () => {
    await expect(recordEvents(redis, [])).rejects.toBeInstanceOf(PrinciplesStoreError);
    await expect(recordEvents(redis, [{ version: 1 }])).rejects.toMatchObject({ code: 'PRINCIPLES_EVENT_INVALID' });
    const many = Array.from({ length: 201 }, () => event());
    await expect(recordEvents(redis, many)).rejects.toMatchObject({ code: 'PRINCIPLES_BATCH_TOO_LARGE' });
  });
});
