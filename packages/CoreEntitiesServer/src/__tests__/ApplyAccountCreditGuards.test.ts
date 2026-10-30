/**
 * Orders.ApplyAccountCredit's guards, now that the floor lets a return or cancellation credit be spent (D20):
 * a credit settles only its own customer's orders, and two spends of one credit at once spend it once.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const SOURCE = '3f2504e0-4f89-41d3-9a0c-0305e82c3401';
const TARGET = '3f2504e0-4f89-41d3-9a0c-0305e82c3402';

const db = vi.hoisted(() => ({
    orders: new Map<string, Record<string, unknown>>(),
    /** Applied to the source when its row lock is taken: what another request committed meanwhile. */
    spentMeanwhile: 0,
    /** Applied to the target when its row lock is taken: another credit or payment settled it meanwhile. */
    paidMeanwhile: 0,
    log: [] as string[],
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        LogError: () => undefined,
        RunView: class {
            async RunView(p: { EntityName: string; ExtraFilter?: string }) {
                if (p.EntityName.endsWith('Order Headers')) {
                    const id = /ID='([^']+)'/.exec(p.ExtraFilter ?? '')?.[1] ?? '';
                    return { Success: true, Results: db.orders.has(id) ? [{ ...db.orders.get(id) }] : [] };
                }
                if (p.EntityName.endsWith('Payment Types')) return { Success: true, Results: [{ ID: 'type-ac' }] };
                return { Success: true, Results: [] };
            }
        },
    };
});
vi.mock('@mj-biz-apps/orders-entities', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@mj-biz-apps/orders-entities')>();
    return { ...actual, LoadOrdersEngine: async () => undefined, OrdersEngine: { Instance: { PaymentTypeByCode: () => ({ ID: 'type-ac' }) } } };
});

const { BusinessTimeZoneEngine } = await import('@mj-biz-apps/common-entities');
const { ApplyAccountCreditOperation, SameCustomerRefusal } = await import('../ApplyAccountCreditOperation.js');

const order = (id: string, over: Record<string, unknown>) => db.orders.set(id, { ID: id, OrderNumber: id === SOURCE ? 'ORD-CR' : 'ORD-RENEW', Status: 'Confirmed', TotalGross: 0, CompanyID: 'c', BillToOrganizationID: null, BillToPersonID: null, ...over });

function entity(): Record<string, unknown> {
    const lines: unknown[] = [];
    return { NewRecord: () => true, Save: async () => (db.log.push('SAVE'), true), Lines: { Add: (l: unknown) => lines.push(l) }, LatestResult: null, ID: 'x' };
}
const provider = {
    GetEntityObject: async () => entity(),
    BeginTransaction: async () => void db.log.push('BEGIN'),
    CommitTransaction: async () => void db.log.push('COMMIT'),
    RollbackTransaction: async () => void db.log.push('ROLLBACK'),
    ExecuteSQL: async (q: string) => {
        if (/UPDLOCK, ROWLOCK/.test(q)) {
            const id = /ID = '([^']+)'/.exec(q)?.[1];
            db.log.push(id === SOURCE ? 'LOCK source' : 'LOCK target');
            if (id === SOURCE) {
                const s = db.orders.get(SOURCE)!;
                s.Balance = Number(s.Balance) + db.spentMeanwhile;
            } else {
                const t = db.orders.get(TARGET)!;
                t.Balance = Number(t.Balance) - db.paidMeanwhile;
            }
            return [];
        }
        return [{ Seq: 7 }];
    },
} as never;
const run = (Amount?: number) =>
    (new ApplyAccountCreditOperation() as unknown as { InternalExecute(i: unknown, p: unknown, u: unknown): Promise<{ Success: boolean; Message?: string }> }).InternalExecute(
        { SourceOrderHeaderID: SOURCE, TargetOrderHeaderID: TARGET, Amount },
        provider,
        { ID: 'u' },
    );

beforeEach(() => {
    db.orders.clear();
    db.spentMeanwhile = 0;
    db.paidMeanwhile = 0;
    db.log = [];
    vi.spyOn(BusinessTimeZoneEngine.Instance, 'Config').mockResolvedValue(undefined as never);
});

describe('SameCustomerRefusal', () => {
    const o = (BillToOrganizationID: string | null, BillToPersonID: string | null, OrderNumber = 'ORD') => ({ OrderNumber, BillToOrganizationID, BillToPersonID });
    it("an organization's credit settles that organization's orders, whoever the contact is", () => {
        expect(SameCustomerRefusal(o('org-A', 'p1'), o('ORG-a', 'p2'))).toBeNull();
        expect(SameCustomerRefusal(o('org-A', 'p1'), o('org-B', 'p1'))).toMatch(/belongs to its organization/);
        expect(SameCustomerRefusal(o('org-A', null), o(null, 'p1'))).toMatch(/belongs to its organization/);
    });
    it("a person's credit settles only that person's own person-billed orders", () => {
        expect(SameCustomerRefusal(o(null, 'p1'), o(null, 'P1'))).toBeNull();
        expect(SameCustomerRefusal(o(null, 'p1'), o(null, 'p2'))).toMatch(/belongs to the person/);
        expect(SameCustomerRefusal(o(null, 'p1'), o('org-A', 'p1'))).toMatch(/belongs to the person/);
    });
    it('a credit billed to no one settles nothing', () => {
        expect(SameCustomerRefusal(o(null, null), o(null, null))).toMatch(/billed to no customer/);
    });
});

describe('Orders.ApplyAccountCredit', () => {
    it("another customer's order: refused before anything is written", async () => {
        order(SOURCE, { Balance: -599, BillToPersonID: 'jane' });
        order(TARGET, { Balance: 599, BillToPersonID: 'john' });
        const out = await run();
        expect(out.Success).toBe(false);
        expect(out.Message).toMatch(/billed to someone else/);
        expect(db.log).toEqual([]);
    });
    it('control: the same customer: applied, under the source lock', async () => {
        order(SOURCE, { Balance: -599, BillToPersonID: 'jane' });
        order(TARGET, { Balance: 599, BillToPersonID: 'jane' });
        const out = await run();
        expect(out.Success, out.Message).toBe(true);
        // Both rows, in id order (source …401 before target …402), before anything else.
        expect(db.log.slice(0, 3)).toEqual(['BEGIN', 'LOCK source', 'LOCK target']);
        expect(db.log).toContain('COMMIT');
    });
    it('two spends of one credit at once: the second finds it spent under the lock: rolled back, nothing written', async () => {
        order(SOURCE, { Balance: -599, BillToPersonID: 'jane' });
        order(TARGET, { Balance: 599, BillToPersonID: 'jane' });
        db.spentMeanwhile = 599;
        const out = await run(599);
        expect(out.Success).toBe(false);
        expect(out.Message).toMatch(/spent meanwhile/);
        expect(db.log).toEqual(['BEGIN', 'LOCK source', 'LOCK target', 'ROLLBACK']);
    });
    it('…and a spend that still fits what is left after the other one goes ahead', async () => {
        order(SOURCE, { Balance: -599, BillToPersonID: 'jane' });
        order(TARGET, { Balance: 599, BillToPersonID: 'jane' });
        db.spentMeanwhile = 299;
        const out = await run(300);
        expect(out.Success, out.Message).toBe(true);
    });
    it('a few cents over what is left after the other spend (300.03 of 300): refused (the tolerance is half a cent)', async () => {
        order(SOURCE, { Balance: -599, BillToPersonID: 'jane' });
        order(TARGET, { Balance: 599, BillToPersonID: 'jane' });
        db.spentMeanwhile = 299;
        expect((await run(300.03)).Success).toBe(false);
    });
    it('two credits applied to one order at once: the second finds it settled under the lock and does not over-pay it', async () => {
        order(SOURCE, { Balance: -599, BillToPersonID: 'jane' });
        order(TARGET, { Balance: 599, BillToPersonID: 'jane' });
        db.paidMeanwhile = 599;
        const out = await run(599);
        expect(out.Success).toBe(false);
        expect(out.Message).toMatch(/paid meanwhile/);
        expect(db.log).toContain('ROLLBACK');
    });
    it('the figures returned are the ones read under the locks', async () => {
        order(SOURCE, { Balance: -599, BillToPersonID: 'jane' });
        order(TARGET, { Balance: 599, BillToPersonID: 'jane' });
        db.spentMeanwhile = 99;
        const out = (await run(300)) as { Success: boolean; RemainingCredit?: number; TargetBalanceAfter?: number };
        expect(out).toMatchObject({ Success: true, RemainingCredit: 200, TargetBalanceAfter: 299 });
    });
});
