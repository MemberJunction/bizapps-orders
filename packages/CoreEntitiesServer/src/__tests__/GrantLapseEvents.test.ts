/**
 * #857: a grant whose ValidTo passes with nothing saved is announced once as GrantStatusChanged.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    hasConsumers: vi.fn(() => true),
    record: vi.fn(async () => 'event-1' as string | null),
}));

vi.mock('../OutboundEvents.js', () => ({
    HasOutboundConsumers: () => mocks.hasConsumers(),
    RecordOutboundEvent: (...args: unknown[]) => mocks.record(...(args as [])),
}));

vi.mock('@memberjunction/core', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@memberjunction/core')>()),
    LogError: vi.fn(),
}));

import { LapsedGrantsSQL, RecordLapsedGrantEvents } from '../GrantLapseEvents.js';

const G1 = '11111111-1111-4111-8111-111111111111';
const G2 = '22222222-2222-4222-8222-222222222222';

function provider(ids: string[], failLoad: string[] = []) {
    const tx: string[] = [];
    const sql: string[] = [];
    return {
        tx,
        sql,
        ExecuteSQL: vi.fn(async (q: string) => {
            sql.push(q);
            return ids.map((ID) => ({ ID }));
        }),
        BeginTransaction: vi.fn(async () => void tx.push('begin')),
        CommitTransaction: vi.fn(async () => void tx.push('commit')),
        RollbackTransaction: vi.fn(async () => void tx.push('rollback')),
        GetEntityObject: vi.fn(async () => {
            let id = '';
            return {
                get ID() {
                    return id;
                },
                Load: vi.fn(async (v: string) => {
                    id = v;
                    return !failLoad.includes(v);
                }),
                OrderHeaderIDForEvent: vi.fn(async () => 'order-1'),
                LapsePayload: vi.fn(async () => ({ GrantID: id, ToStatus: 'Expired', Lapsed: true })),
            };
        }),
    };
}

beforeEach(() => {
    mocks.hasConsumers.mockReset().mockReturnValue(true);
    mocks.record.mockReset().mockResolvedValue('event-1');
});

describe('LapsedGrantsSQL', () => {
    it('takes Active grants whose ValidTo passed within the lookback and have no event since', () => {
        const q = LapsedGrantsSQL(50);
        expect(q).toMatch(/TOP \(50\)/);
        expect(q).toMatch(/g\.Status = 'Active'/);
        expect(q).toMatch(/g\.ValidTo < SYSDATETIMEOFFSET\(\)/);
        expect(q).toMatch(/DATEADD\(DAY, -7, SYSDATETIMEOFFSET\(\)\)/);
        expect(q).toMatch(/NOT EXISTS[\s\S]*e\.OccurredAt >= g\.ValidTo/);
    });

    it('falls back to the defaults for a bad cap or lookback', () => {
        expect(LapsedGrantsSQL(0)).toMatch(/TOP \(200\)/);
        expect(LapsedGrantsSQL(10, -1)).toMatch(/-7,/);
    });
});

describe('RecordLapsedGrantEvents', () => {
    it('reads nothing when no consumer wants GrantStatusChanged', async () => {
        mocks.hasConsumers.mockReturnValue(false);
        const p = provider([G1]);
        expect(await RecordLapsedGrantEvents(p as never, {} as never)).toBe(0);
        expect(p.ExecuteSQL).not.toHaveBeenCalled();
    });

    it('records one GrantStatusChanged per lapsed grant, each in its own transaction', async () => {
        const p = provider([G1, G2]);
        expect(await RecordLapsedGrantEvents(p as never, {} as never)).toBe(2);
        expect(mocks.record).toHaveBeenCalledTimes(2);
        expect(mocks.record.mock.calls[0][0]).toMatchObject({
            EventType: 'GrantStatusChanged',
            OrderHeaderID: 'order-1',
            EntitlementGrantID: G1,
            Payload: { ToStatus: 'Expired', Lapsed: true },
        });
        expect(p.tx).toEqual(['begin', 'commit', 'begin', 'commit']);
    });

    it('skips a grant that fails, rolls it back, and carries on', async () => {
        mocks.record.mockRejectedValueOnce(new Error('write failed'));
        const p = provider([G1, G2]);
        expect(await RecordLapsedGrantEvents(p as never, {} as never)).toBe(1);
        expect(p.tx).toEqual(['begin', 'rollback', 'begin', 'commit']);
    });

    it('skips a grant that cannot be loaded', async () => {
        const p = provider([G1, G2], [G1]);
        expect(await RecordLapsedGrantEvents(p as never, {} as never)).toBe(1);
    });
});
