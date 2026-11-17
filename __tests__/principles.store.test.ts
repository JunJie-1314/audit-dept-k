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
  readonly strings = new Map<string, string>();
  readonly expiry = new Map<string, number>();
  private live(key: string): boolean {
    const until = this.expiry.get(key);
    if (until !== undefined && Date.now() >= until) { this.strings.delete(key); this.expiry.delete(key); return false; }
    return this.strings.has(key);
  }
  command = async (args: Array<string | number>): Promise<unknown> => {
    const [name, ...rest] = args.map(String);
    switch (name) {
      case 'GET': return this.live(rest[0]) ? this.strings.get(rest[0]) ?? null : null;
      case 'SET': {
        if (rest.includes('NX') && this.live(rest[0])) return null;
        this.strings.set(rest[0], rest[1]);
        const px = rest.indexOf('PX');
        if (px >= 0) this.expiry.set(rest[0], Date.now() + Number(rest[px + 1]));
        else this.expiry.delete(rest[0]);
        return 'OK';
      }
      case 'DEL': { const had = this.live(rest[0]); this.strings.delete(rest[0]); this.expiry.delete(rest[0]); return had ? 1 : 0; }
      case 'EVAL': {
        const script = String(rest[0]);
        const count = Number(rest[1]);
        const keys = rest.slice(2, 2 + count);
        const argv = rest.slice(2 + count);
        if (script === 'return 1') return 1;
        if (script.includes("redis.call('DEL'")) {
          if (this.live(keys[0]) && (this.strings.get(keys[0]) ?? '') === argv[0]) { this.strings.delete(keys[0]); this.expiry.delete(keys[0]); return 1; }
          return 0;
        }
        if (script.includes('local current')) {
          if ((this.strings.get(keys[0]) ?? '') !== argv[0]) return 0;
          if ((this.strings.get(keys[1]) ?? '') !== (argv[1] ?? '')) return -1;
          if (this.live(keys[2])) return -2;
          this.strings.set(keys[2], argv[2]);
          this.strings.set(keys[3], argv[3]);
          return 1;
        }
        throw new Error('unsupported eval');
      }
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
    // 另一个客户端只读同一命名空间，得到同一份计数（syncedAt 为读取时间，不比）。
    const otherClient = await getSummary(redis);
    expect(otherClient.counts).toEqual(summary.counts);
    expect(otherClient.catalog).toEqual(summary.catalog);
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

describe('原则账本 · repair-round-2 一致性与故障注入', () => {
  it('同身份不同候选ID真正首次并发：单一 canonical，计数 2', async () => {
    const [a, b] = await Promise.all([
      recordEvents(redis, [event({ principle: { ...event().principle, id: 'pr_concurrentA0001' } })]),
      recordEvents(redis, [event({ principle: { ...event().principle, id: 'pr_concurrentB0001' } })]),
    ]);
    const summary = await getSummary(redis);
    expect(summary.catalog).toHaveLength(1);
    expect(summary.total).toBe(2);
    expect(Object.values(summary.counts)).toEqual([2]);
    expect(new Set([...a.accepted.map((row) => row.principleId), ...b.accepted.map((row) => row.principleId)])).toEqual(
      new Set([summary.catalog[0].id]),
    );
  });

  it('不同身份同 slot 并发：各自 canonical，互不串计', async () => {
    const base = event();
    const another = event({
      principle: {
        ...base.principle,
        id: 'pr_sameslot0000000000001',
        title: '没有真正的保密',
        fingerprint: principleFingerprint('没有真正的保密，只有还没传开的秘密'),
      },
    });
    await Promise.all([recordEvents(redis, [base]), recordEvents(redis, [another])]);
    const summary = await getSummary(redis);
    expect(summary.catalog).toHaveLength(2);
    expect(Object.values(summary.counts).sort()).toEqual([1, 1]);
  });

  it('提交响应丢失：整批回滚、锁可释放，同事件重试只记一次', async () => {
    let fail = true;
    const flaky = async (args: Array<string | number>) => {
      // 模拟 COMMIT 的 EVAL 已执行但响应丢失：先让脚本真实执行，再抛网络错误。
      if (fail && args[0] === 'EVAL' && String(args[1]).includes('local current')) {
        fail = false;
        await memory.command(args);
        throw new Error('injected response loss after commit');
      }
      return memory.command(args);
    };
    const use = event();
    await expect(recordEvents(flaky, [use])).rejects.toThrow('injected');
    // 提交已生效（响应丢失），重试读取到已有事件 → duplicate，不重复计数。
    const retry = await recordEvents(flaky, [use]);
    expect(retry.accepted).toHaveLength(0);
    expect(retry.duplicates).toHaveLength(1);
    expect((await getSummary(memory.command)).total).toBe(1);
    // 失败后的锁必须可被后续事务获取。
    await recordEvents(memory.command, [event({ eventId: uniqueId() })]);
    expect((await getSummary(memory.command)).total).toBe(2);
  });

  it('无 EVAL 的版本 CAS：写入前失败不落盘，重试成功且旧版本不能覆盖', async () => {
    let fail = true;
    const noEval = async (args: Array<string | number>) => {
      if (args[0] === 'EVAL') throw new Error('unsupported EVAL');
      if (fail && args[0] === 'SET' && String(args[1]).includes(':state:')) {
        fail = false;
        throw new Error('injected CAS write failure');
      }
      return memory.command(args);
    };
    const use = event();
    const options = { lockTtlMs: 20, lockWaitMs: 500 };
    await expect(recordEvents(noEval, [use], new Date(), options)).rejects.toThrow('injected');
    expect((await getSummary(memory.command)).total).toBe(0);
    await new Promise((resolve) => setTimeout(resolve, 30)); // 无 EVAL：等租约 TTL，绝不客户端 DEL
    const retry = await recordEvents(noEval, [use], new Date(), options);
    expect(retry.accepted).toHaveLength(1);
    expect((await getSummary(memory.command)).total).toBe(1);
  });

  it('同 eventId 不同撤销目标：409 冲突，不产生副作用', async () => {
    const first = event();
    const second = event({ eventId: uniqueId() });
    await recordEvents(redis, [first, second]);
    const undo = { ...event({ eventId: uniqueId() }), op: 'undo' as const, targetEventId: first.eventId };
    await recordEvents(redis, [undo]);
    const conflict = { ...undo, targetEventId: second.eventId };
    await expect(recordEvents(redis, [conflict])).rejects.toMatchObject({ code: 'PRINCIPLES_EVENT_CONFLICT' });
    const summary = await getSummary(redis);
    expect(summary.total).toBe(1);
  });

  it('并发导出与写入：导出是完整一致快照，恢复后仍可继续写', async () => {
    const first = event();
    const pending = event({ eventId: uniqueId(), principle: { ...first.principle, id: 'pr_second000000000000001', fingerprint: principleFingerprint('第二条') } });
    const [backup, write] = await Promise.all([exportBackup(redis), recordEvents(redis, [first, pending])]);
    expect(write.accepted).toHaveLength(2);
    // 导出要么在写入前（0 条）要么在写入后（2 条），checksum 必须自洽。
    expect([0, 2]).toContain(backup.events.length);
    expect(backup.checksum).toBe(backupChecksum(backup.catalog, backup.events));
    const second = memoryRedisInstance();
    if (backup.events.length) {
      await restoreBackup(second.command, backup);
      expect((await getSummary(second.command)).total).toBe(2);
    }
    // 恢复后继续写：新事件成功并入，seq 递增。
    const after = await recordEvents(redis, [event({ eventId: uniqueId() })]);
    expect(after.accepted).toHaveLength(1);
    expect(after.accepted[0].seq).toBeGreaterThan(write.accepted[1].seq);
  });

  it('恢复与写入并发：不覆盖恢复后的新事件，重复恢复不倍增', async () => {
    const source = memoryRedisInstance();
    const use = event();
    await recordEvents(source.command, [use]);
    const backup = await exportBackup(source.command);
    const target = memoryRedisInstance();
    await recordEvents(target.command, [event({ eventId: uniqueId() })]);
    const [restored] = await Promise.all([
      restoreBackup(target.command, backup),
      recordEvents(target.command, [event({ eventId: uniqueId(), principle: { ...use.principle, id: 'pr_parallel0000000000001', fingerprint: principleFingerprint('并发新原则') } })]),
    ]);
    expect(restored.imported).toBe(1);
    const summary = await getSummary(target.command);
    expect(summary.total).toBe(3);
    const again = await restoreBackup(target.command, backup);
    expect(again.imported).toBe(0);
    expect((await getSummary(target.command)).total).toBe(3);
    await recordEvents(target.command, [event({ eventId: uniqueId(), principle: { ...use.principle, id: 'pr_after0000000000000001', fingerprint: principleFingerprint('恢复后新原则') } })]);
    expect((await getSummary(target.command)).total).toBe(4);
  });
});

function memoryRedisInstance(): { command: Redis } {
  const memory = new MemoryRedis();
  return { command: memory.command };
}

describe('原则账本 · repair-round-3 CAS fencing 与原子释放', () => {
  it('旧持有者在提交前被抢先：不覆盖已提交事件，重放后两条都在', async () => {
    const first = event();
    const second = event({ eventId: uniqueId() });
    let injected = false;
    const racing = async (args: Array<string | number>) => {
      if (!injected && args[0] === 'SET' && args[1] === 'principles:v1:state') {
        injected = true;
        // 另一个实例已提交 event2（版本 1），且持有自己的锁。
        const competitor = {
          version: 1, seq: 1, updatedAt: '2026-11-17T04:00:00.000Z',
          events: { [second.eventId]: { ...second, principleId: 'pr_competitor000000001', serverTime: '2026-11-17T04:00:00.000Z', seq: 1, payloadHash: 'competing' } },
          undo: {}, catalog: {},
        };
        await memory.command(['SET', 'principles:v1:state:1', JSON.stringify(competitor)]);
        await memory.command(['SET', 'principles:v1:version', '1']);
        await memory.command(['SET', 'principles:v1:lock', 'other-token']);
      }
      return memory.command(args);
    };
    const result = await recordEvents(racing, [first]);
    expect(result.accepted).toHaveLength(1);
    // 注入的“另一实例”在真实环境会自己释放锁；测试手动清锁以继续读。
    await memory.command(['DEL', 'principles:v1:lock']);
    const summary = await getSummary(memory.command);
    expect(summary.total).toBe(2);
    const backup = await exportBackup(memory.command);
    expect(backup.events.map((row) => row.eventId).sort()).toEqual([first.eventId, second.eventId].sort());
  });

  it('释放用服务端比较删除：GET 后换主也不会删除新持有者锁', async () => {
    let swapped = false;
    const racing = async (args: Array<string | number>) => {
      const value = await memory.command(args);
      if (!swapped && args[0] === 'GET' && args[1] === 'principles:v1:lock') {
        swapped = true;
        // 模拟读取后租约到期、B 获得新锁。
        await memory.command(['SET', 'principles:v1:lock', 'new-owner-token']);
      }
      return value;
    };
    await recordEvents(racing, [event()]);
    expect(await memory.command(['GET', 'principles:v1:lock'])).toBe('new-owner-token');
    // 清理后第三实例仍可进入，证明旧持有者没有留下“已删除”的新锁。
    await memory.command(['DEL', 'principles:v1:lock']);
    await recordEvents(memory.command, [event({ eventId: uniqueId() })]);
    expect((await getSummary(memory.command)).total).toBe(2);
  });

  it('恢复旧备份不回退 seq，恢复后可继续写且序号递增', async () => {
    const first = event();
    await recordEvents(redis, [first]);
    const oldBackup = await exportBackup(redis);
    await recordEvents(redis, [event({ eventId: uniqueId() })]);
    await recordEvents(redis, [event({ eventId: uniqueId() })]);
    const before = await exportBackup(redis);
    const maxBefore = Math.max(...before.events.map((row) => row.seq));
    await restoreBackup(redis, oldBackup);
    const afterRestore = await exportBackup(redis);
    expect(Math.max(...afterRestore.events.map((row) => row.seq))).toBeGreaterThanOrEqual(maxBefore);
    const next = await recordEvents(redis, [event({ eventId: uniqueId() })]);
    expect(next.accepted[0].seq).toBeGreaterThan(maxBefore);
  });
});

describe('原则账本 · repair-round-3 别名完整身份', () => {
  it('显式修订保留旧指纹与新来源身份，导出/恢复后仍可精确重建', async () => {
    const base = event();
    const first = await recordEvents(redis, [base]);
    const canonical = first.accepted[0].principleId;
    const revised = event({
      eventId: uniqueId(),
      principle: {
        ...base.principle,
        id: 'pr_revised00000000000001',
        eventIndex: '11/10 新来源',
        title: '交情用一次少一次（改）',
        fingerprint: principleFingerprint('交情用一次少一次（改）'),
        replaces: base.principle.fingerprint,
      },
    });
    const second = await recordEvents(redis, [revised]);
    expect(second.accepted[0].principleId).toBe(canonical);
    const summary = await getSummary(redis);
    const entry = summary.catalog.find((row) => row.id === canonical)! as unknown as {
      aliases: string[]; aliasIdentities?: Array<{ eventIndex: string; fingerprint: string }>;
    };
    expect(entry.aliases).toContain(revised.principle.fingerprint);
    expect(entry.aliasIdentities?.some((identity) => identity.fingerprint === revised.principle.fingerprint && identity.eventIndex === '11/10 新来源')).toBe(true);

    const backup = await exportBackup(redis);
    const fresh = memoryRedisInstance();
    await restoreBackup(fresh.command, backup);
    const restored = await getSummary(fresh.command);
    const restoredEntry = restored.catalog.find((row) => row.id === canonical)! as unknown as {
      aliasIdentities?: Array<{ eventIndex: string; fingerprint: string }>;
    };
    expect(restoredEntry.aliasIdentities?.some((identity) => identity.eventIndex === '11/10 新来源')).toBe(true);
    expect(restored.total).toBe(2);
  });
});
