/**
 * `Orders.ReplacePaymentSchedule` around the planner: the lock taken inside the transaction, the
 * read of payments that name an instalment, and the codes a caller sees. The database is a stub that
 * records statements; the operation is real.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ORDER = 'aaaaaaaa-2222-4333-8444-555555555555';
const CO = 'cccccccc-0000-4000-8000-000000000001';
const ROW1 = 'dddddddd-0000-4000-8000-000000000001';

const mocks = vi.hoisted(() => ({
    /** The order as the first read sees it. */
    order: undefined as Record<string, unknown> | undefined,
    rows: [] as Array<Record<string, unknown>>,
    named: [] as Array<Record<string, unknown>>,
    lines: [] as Array<Record<string, unknown>>,
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    const results = (name: string) => {
        if (name.includes('Order Header Payment Schedules')) return mocks.rows;
        if (name.includes('Order Headers')) return mocks.order ? [mocks.order] : [];
        if (name.includes('Order Lines')) return mocks.lines;
        if (name.includes('Payment Lines')) return mocks.named;
        return [];
    };
    return {
        ...actual,
        LogError: () => undefined,
        RunView: class {
            static FromMetadataProvider() {
                return {
                    RunViews: async (params: Array<{ EntityName: string }>) =>
                        params.map((p) => ({ Success: true, Results: results(p.EntityName) })),
                };
            }
        },
    };
});

vi.mock('../ReversalScheduleReduction.js', () => ({ AppliedScheduleReductions: async () => [] }));

import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { OrdersReplacePaymentScheduleInput, OrdersReplacePaymentScheduleOutput } from '@mj-biz-apps/orders-entities';
import { ReplacePaymentScheduleOperation } from '../ReplacePaymentScheduleOperation.js';

interface Db {
    log: string[];
    /** The order's status as the locked re-read sees it. */
    lockedStatus: string | null;
    platform?: string;
}
let db: Db;

function provider(): IMetadataProvider {
    return {
        get PlatformKey() {
            return db.platform;
        },
        BeginTransaction: async () => void db.log.push('begin'),
        CommitTransaction: async () => void db.log.push('commit'),
        RollbackTransaction: async () => void db.log.push('rollback'),
        ExecuteSQL: async (sql: string) => {
            db.log.push(`sql:${sql}`);
            return db.lockedStatus === null ? [] : [{ Status: db.lockedStatus }];
        },
        GetEntityObject: async () => {
            const entity: Record<string, unknown> = {
                ID: 'new-row',
                NewRecord: () => undefined,
                Load: async (id: string) => {
                    entity.ID = id;
                    return true;
                },
                Save: async () => {
                    db.log.push(`save:${entity.InstallmentNumber}`);
                    return true;
                },
                Delete: async () => {
                    db.log.push(`delete:${entity.ID}`);
                    return true;
                },
                LatestResult: undefined,
            };
            return entity;
        },
    } as unknown as IMetadataProvider;
}

interface Callable {
    InternalExecute(i: OrdersReplacePaymentScheduleInput, p: IMetadataProvider, u: UserInfo): Promise<OrdersReplacePaymentScheduleOutput>;
}
const replace = (input: Partial<OrdersReplacePaymentScheduleInput>) =>
    (new ReplacePaymentScheduleOperation() as unknown as Callable).InternalExecute(
        { OrderHeaderID: ORDER, Rows: [], ...input } as OrdersReplacePaymentScheduleInput,
        provider(),
        {} as UserInfo,
    );

const TWO = [
    { DueDate: '2026-11-01', Amount: 5000 },
    { DueDate: '2027-11-01', Amount: 5000 },
];

beforeEach(() => {
    db = { log: [], lockedStatus: 'Quoted' };
    mocks.order = { ID: ORDER, OrderNumber: 'ORD-1', Status: 'Quoted', CompanyID: CO };
    mocks.rows = [];
    mocks.named = [];
    mocks.lines = [{ CompanyID: CO, LineTotalGross: 10000 }];
});

describe('the order status, re-read under a lock inside the transaction', () => {
    it('locks the order row before any write, then writes and commits', async () => {
        const out = await replace({ Rows: TWO });
        expect(out.Success).toBe(true);
        expect(db.log[0]).toBe('begin');
        expect(db.log[1]).toMatch(/^sql:SELECT Status FROM __mj_BizAppsOrders\.OrderHeader WITH \(UPDLOCK, HOLDLOCK\) WHERE ID = 'aaaaaaaa-/);
        expect(db.log.slice(2)).toEqual(['save:1', 'save:2', 'commit']);
    });

    it('uses FOR UPDATE on PostgreSQL', async () => {
        db.platform = 'postgresql';
        await replace({ Rows: TWO });
        expect(db.log[1]).toMatch(/^sql:SELECT "Status" FROM __mj_BizAppsOrders\."OrderHeader" WHERE "ID" = '.*' FOR UPDATE;$/);
    });

    it('refuses, writing nothing, when the order was confirmed without a schedule since the first read', async () => {
        db.lockedStatus = 'Confirmed';
        const out = await replace({ Rows: TWO });
        expect(out.Success).toBe(false);
        expect(out.Code).toBe('BILLED_WITHOUT_SCHEDULE');
        expect(db.log.filter((l) => !l.startsWith('sql:'))).toEqual(['begin', 'rollback']);
    });

    it('refuses when the order was voided since the first read', async () => {
        db.lockedStatus = 'Voided';
        const out = await replace({ Rows: TWO });
        expect(out.Code).toBe('ORDER_VOIDED');
        expect(db.log).not.toContain('commit');
    });

    it('goes ahead when the order was confirmed with a schedule since the first read', async () => {
        mocks.rows = [{ ID: ROW1, CompanyID: CO, InstallmentNumber: 1, DueDate: '2026-11-01', Amount: 10000, AmountPaid: 0, Status: 'Scheduled' }];
        db.lockedStatus = 'Confirmed';
        const out = await replace({ Rows: TWO });
        expect(out.Success).toBe(true);
        expect(db.log.at(-1)).toBe('commit');
    });

    it('fails as WRITE_FAILED and rolls back when the order row is gone', async () => {
        db.lockedStatus = null;
        const out = await replace({ Rows: TWO });
        expect(out.Code).toBe('WRITE_FAILED');
        expect(db.log.at(-1)).toBe('rollback');
    });

    it('takes no lock on a preview', async () => {
        const out = await replace({ Rows: TWO, Preview: true });
        expect(out.Success).toBe(true);
        expect(db.log).toEqual([]);
    });
});

describe('payments that name an instalment', () => {
    it('refuses to re-date a row a payment names, before opening a transaction', async () => {
        mocks.rows = [{ ID: ROW1, CompanyID: CO, InstallmentNumber: 1, DueDate: '2027-11-01', Amount: 10000, AmountPaid: 500, Status: 'Scheduled' }];
        mocks.named = [{ OrderHeaderPaymentScheduleID: ROW1.toUpperCase() }];
        const out = await replace({ Rows: TWO });
        expect(out.Code).toBe('PAID_ROW_CHANGED');
        expect(out.Message).toContain('Instalment 1 of order ORD-1');
        expect(db.log).toEqual([]);
    });

    it('re-dates the same row when no payment names it', async () => {
        mocks.rows = [{ ID: ROW1, CompanyID: CO, InstallmentNumber: 1, DueDate: '2027-11-01', Amount: 10000, AmountPaid: 500, Status: 'Scheduled' }];
        const out = await replace({ Rows: TWO });
        expect(out.Success).toBe(true);
    });
});

describe('input codes', () => {
    it('answers a malformed OrderHeaderID with INVALID_ORDER_ID', async () => {
        const out = await replace({ OrderHeaderID: 'not-a-uuid', Rows: TWO });
        expect(out.Code).toBe('INVALID_ORDER_ID');
    });
});
