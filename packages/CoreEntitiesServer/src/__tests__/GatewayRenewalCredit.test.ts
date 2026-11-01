/**
 * GatewayRenewalCredit (D20): one per-term "refunded and not yet credited", and the refund door that credits it the
 * credit-note way: a money-only credit order, APPLIED to the renewal (Orders.ApplyAccountCredit), so the renewal owes
 * paid − refunded. A fake provider holding the rows; the gateway's refund comes from `RetrieveCharge`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface Row {
    [key: string]: unknown;
}

const LINE = '11111111-0000-4000-8000-000000000001';
const ORDER = '11111111-0000-4000-8000-0000000000a1';
const SUB = '11111111-0000-4000-8000-0000000000b1';
const CREDIT_ORDER = '11111111-0000-4000-8000-0000000000d1';
const OTHER_CREDIT = '11111111-0000-4000-8000-0000000000d2';

const state = vi.hoisted(() => ({
    origin: 'ProviderPayment' as string,
    renews: true,
    event: { Source: 'Gateway', ChargeID: 'ch_renew', AmountPaid: 599 } as Record<string, unknown> | null,
    refunded: 200,
    /** Reversal lines against the renewal line, as the database holds them now. */
    reversals: [] as Row[],
    /** What another worker commits while this one waits for the lock. */
    meanwhile: [] as Row[],
    /** Order balances by id (the renewal owes what the refund's cash un-applied; a credit order is negative). */
    balances: new Map<string, number>(),
    saved: [] as Row[],
    alerts: [] as Row[],
    log: [] as string[],
    memos: [] as Row[],
    applyRefusal: null as string | null,
    /** Order rows locked, in the order they were locked. */
    orderLocks: [] as string[],
    /** Refuse only applications from this credit order (null: all of them), and spend it when refusing. */
    refuseOnly: null as string | null,
    spendOnRefusal: false,
    applyAttempts: [] as string[],
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        LogError: () => undefined,
        RunView: class {
            async RunView(p: { EntityName: string; ExtraFilter?: string }) {
                const f = p.ExtraFilter ?? '';
                if (p.EntityName.endsWith('Order Lines') && f.startsWith('ReversesOrderLineID')) return { Success: true, Results: state.reversals };
                if (p.EntityName.endsWith('Order Lines')) {
                    return { Success: true, Results: [{ ID: LINE, OrderHeaderID: ORDER, RenewsSubscriptionID: state.renews ? SUB : null, ProductID: 'p', Quantity: 1, CompanyID: 'c' }] };
                }
                if (p.EntityName.endsWith('Order Headers') && f.includes('Balance > 0.005')) {
                    return { Success: true, Results: (state.balances.get(ORDER) ?? 0) > 0.005 && state.origin === 'ProviderPayment' ? [{ ID: ORDER }] : [] };
                }
                if (p.EntityName.endsWith('Order Headers') && f.includes('Balance <')) {
                    const ids = [...f.matchAll(/'([^']+)'/g)].map((m) => m[1]);
                    return { Success: true, Results: ids.filter((i) => (state.balances.get(i) ?? 0) < -0.005).map((ID) => ({ ID })) };
                }
                if (p.EntityName.endsWith('Order Headers')) {
                    const id = /ID='([^']+)'/.exec(f)?.[1] ?? ORDER;
                    return {
                        Success: true,
                        Results: [{ ID: id, OrderNumber: id === ORDER ? 'ORD-RENEW' : 'ORD-CR', Origin: id === ORDER ? state.origin : null, CompanyID: 'c', BillToOrganizationID: null, BillToPersonID: 'per', Balance: state.balances.get(id) ?? 0 }],
                    };
                }
                if (p.EntityName.endsWith('Subscription Events')) {
                    return { Success: true, Results: state.event ? [{ EventData: JSON.stringify(state.event) }] : [] };
                }
                if (p.EntityName.endsWith('Subscription Terms')) {
                    return { Success: true, Results: [{ ID: '11111111-0000-4000-8000-0000000000c1', Amount: 599, Status: 'Active', StartDate: '2027-10-31', EndDate: '2028-10-30' }] };
                }
                if (p.EntityName.endsWith('Order Concessions')) return { Success: true, Results: state.memos };
                if (p.EntityName.endsWith('Subscriptions')) return { Success: true, Results: [{ SubscriptionNumber: 'SUB-000110' }] };
                return { Success: true, Results: [] };
            }
        },
    };
});
vi.mock('../checkoutCaptureAlert.js', () => ({
    raiseProviderSubscriptionAlert: async (a: Row) => {
        state.alerts.push(a);
        return true;
    },
}));
vi.mock('../OrderLineEntityServer.js', () => ({ MarkAsOrdersOwnWrite: () => undefined }));
vi.mock('../ApplyAccountCreditOperation.js', () => ({
    LockOrderRows: async (_p: unknown, ids: string[]) => void state.orderLocks.push(...[...new Set(ids.map((i) => i.toLowerCase()))].sort()),
    ApplyAccountCreditOperation: class {
        async ExecuteServer(input: { SourceOrderHeaderID: string; TargetOrderHeaderID: string; Amount: number }) {
            if (state.applyRefusal && (state.refuseOnly == null || state.refuseOnly === input.SourceOrderHeaderID)) {
                state.applyAttempts.push(`${input.Amount} from ${input.SourceOrderHeaderID === CREDIT_ORDER ? 'credit' : 'other'}`);
                if (state.spendOnRefusal) state.balances.set(input.SourceOrderHeaderID, 0);
                return { Success: true, Output: { Success: false, Message: state.applyRefusal } };
            }
            state.log.push(`APPLY ${input.Amount} from ${input.SourceOrderHeaderID === CREDIT_ORDER ? 'credit' : input.SourceOrderHeaderID === OTHER_CREDIT ? 'other' : '?'} to renewal`);
            state.balances.set(input.SourceOrderHeaderID, (state.balances.get(input.SourceOrderHeaderID) ?? 0) + input.Amount);
            state.balances.set(input.TargetOrderHeaderID, (state.balances.get(input.TargetOrderHeaderID) ?? 0) - input.Amount);
            return { Success: true, Output: { Success: true } };
        }
    },
}));

import { BusinessTimeZoneEngine } from '@mj-biz-apps/common-entities';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { ApplyGatewayCredit, CreditGatewayRenewalRefund, SettleGatewayRenewalCredits, CreditReversalQuantity, GatewayRenewalCreditFor, IsGatewayChargeFullyRefunded } from '../GatewayRenewalCredit.js';
import { IsMoneyOnlyReversal } from '../SubscriptionEntityServer.js';

function entity(kind: string): Row {
    const lines: Row[] = [];
    const row: Row = {
        kind,
        ID: CREDIT_ORDER,
        OrderNumber: 'ORD-CREDIT',
        NewRecord: () => undefined,
        Lines: { Add: (l: Row) => lines.push(l) },
        LatestResult: { CompleteMessage: '' },
        Save: async () => {
            state.saved.push({ kind, lines, moneyOnly: IsMoneyOnlyReversal(row), ...Object.fromEntries(Object.entries(row).filter(([, v]) => typeof v !== 'function' && typeof v !== 'object')) });
            // The credit order is booked: its line reverses the renewal's, and its balance is the credit.
            const l = lines[0];
            const total = Math.round(Number(l.Quantity) * Number(l.UnitPrice) * 100) / 100;
            state.reversals.push({ OrderHeaderID: CREDIT_ORDER, LineTotalNet: total, Quantity: l.Quantity });
            state.balances.set(CREDIT_ORDER, (state.balances.get(CREDIT_ORDER) ?? 0) + total);
            return true;
        },
    };
    return row;
}
const provider = {
    GetEntityObject: async (name: string) => entity(name.replace('MJ_BizApps_Orders: ', '')),
    BeginTransaction: async () => void state.log.push('BEGIN'),
    CommitTransaction: async () => void state.log.push('COMMIT'),
    RollbackTransaction: async () => void state.log.push('ROLLBACK'),
    ExecuteSQL: async (q: string) => {
        if (!/UPDLOCK/.test(q)) return void state.log.push('sql');
        const table = /FROM __mj_BizAppsOrders\.(\w+) WITH/.exec(q)?.[1];
        const id = /ID = '([^']+)'/.exec(q)?.[1];
        // Order-row locks are recorded apart (their ORDER is what matters); the log keeps the subscription lock.
        if (table === 'OrderHeader') return void state.orderLocks.push(String(id));
        state.log.push(`LOCK ${table} ${id}`);
        // What the other worker committed is visible once the lock is ours.
        for (const r of state.meanwhile.splice(0)) {
            state.reversals.push(r);
            state.balances.set(String(r.OrderHeaderID), (state.balances.get(String(r.OrderHeaderID)) ?? 0) + Number(r.LineTotalNet));
        }
    },
} as unknown as IMetadataProvider;
const user = {} as UserInfo;
let chargeReads: string[] = [];
const driver = {
    RetrieveCharge: async () => {
        chargeReads.push(state.log.some((l) => l.startsWith('LOCK')) && !state.log.includes('COMMIT') && !state.log.includes('ROLLBACK') ? 'under the lock' : 'before the lock');
        return { Success: true, Charge: { AmountRefunded: state.refunded } };
    },
} as never;

/** The renewal owes what the refund's cash un-applied (Orders.RefundPayment ran just before). */
const refundBooked = (amount: number) => state.balances.set(ORDER, amount);
const owes = () => Math.round((state.balances.get(ORDER) ?? 0) * 100) / 100;

beforeEach(() => {
    state.origin = 'ProviderPayment';
    state.renews = true;
    state.event = { Source: 'Gateway', ChargeID: 'ch_renew', AmountPaid: 599 };
    state.refunded = 200;
    state.reversals = [];
    state.meanwhile = [];
    state.balances = new Map();
    state.saved = [];
    state.alerts = [];
    state.log = [];
    state.memos = [];
    state.applyRefusal = null;
    state.orderLocks = [];
    state.refuseOnly = null;
    state.spendOnRefusal = false;
    state.applyAttempts = [];
    chargeReads = [];
    refundBooked(200);
    vi.spyOn(BusinessTimeZoneEngine.Instance, 'Config').mockResolvedValue(undefined as never);
});

describe('GatewayRenewalCreditFor: one per-term position', () => {
    it('refunded − credited, never more than was paid', async () => {
        state.refunded = 700;
        state.reversals = [{ OrderHeaderID: OTHER_CREDIT, LineTotalNet: -150 }];
        state.memos = [{ CreditMemoAmount: 100, ScheduleReduction: null }];
        expect(await GatewayRenewalCreditFor(LINE, driver, provider, user)).toMatchObject({ ChargeID: 'ch_renew', Paid: 599, Refunded: 599, Credited: 250, Outstanding: 349 });
    });
    it('NET of tax: a $1,200 + $60 renewal refunded in full ($1,260) credits $1,200, the line; half refunded credits $600', async () => {
        state.event = { Source: 'Gateway', ChargeID: 'ch_renew', AmountPaid: 1260, Tax: 60 };
        state.refunded = 1260;
        expect(await GatewayRenewalCreditFor(LINE, driver, provider, user)).toMatchObject({ Paid: 1200, Refunded: 1200, Outstanding: 1200 });
        state.refunded = 630;
        expect(await GatewayRenewalCreditFor(LINE, driver, provider, user)).toMatchObject({ Paid: 1200, Refunded: 600 });
    });
    it('credited MORE than refunded (a person credited by hand): nothing outstanding, never negative', async () => {
        state.reversals = [{ OrderHeaderID: OTHER_CREDIT, LineTotalNet: -300 }];
        expect(await GatewayRenewalCreditFor(LINE, driver, provider, user)).toMatchObject({ Refunded: 200, Credited: 300, Outstanding: 0 });
    });
    it('not a gateway renewal (an order Orders billed; a checkout sale): null, so no door credits it', async () => {
        state.origin = 'Widget';
        expect(await GatewayRenewalCreditFor(LINE, driver, provider, user)).toBeNull();
        state.origin = 'ProviderPayment';
        state.renews = false;
        expect(await GatewayRenewalCreditFor(LINE, driver, provider, user)).toBeNull();
    });
});

describe('IsGatewayChargeFullyRefunded: the one rule D19 skips a refunded term by (#989 review)', () => {
    it('a $0 renewal (the 100%-off coupon path: Paid 0, Refunded 0) is NOT fully refunded: it is free coverage, still valid', () => {
        expect(IsGatewayChargeFullyRefunded({ Paid: 0, Refunded: 0 })).toBe(false);
    });
    it('nothing paid can never read as refunded, whatever the refund figure says (negative or rounding noise included)', () => {
        expect(IsGatewayChargeFullyRefunded({ Paid: 0, Refunded: 5 })).toBe(false);
        expect(IsGatewayChargeFullyRefunded({ Paid: -1, Refunded: 0 })).toBe(false);
        expect(IsGatewayChargeFullyRefunded({ Paid: 0.004, Refunded: 0 })).toBe(false);
    });
    it('a paid renewal refunded to the cent is fully refunded; one cent short is not; an over-refund is', () => {
        expect(IsGatewayChargeFullyRefunded({ Paid: 599, Refunded: 599 })).toBe(true);
        expect(IsGatewayChargeFullyRefunded({ Paid: 599, Refunded: 598.99 })).toBe(false);
        expect(IsGatewayChargeFullyRefunded({ Paid: 599, Refunded: 0 })).toBe(false);
        expect(IsGatewayChargeFullyRefunded({ Paid: 599, Refunded: 600 })).toBe(true);
        expect(IsGatewayChargeFullyRefunded({ Paid: 599, Refunded: 598.999 })).toBe(true);
        // To the cent on BOTH sides: a sub-cent tail on what was paid is not a cent left unrefunded.
        expect(IsGatewayChargeFullyRefunded({ Paid: 599.004, Refunded: 599 })).toBe(true);
    });
});

describe('CreditGatewayRenewalRefund: the refund door (D20, the credit-note model)', () => {
    it('a $200 refund, no cancel: a money-only credit order, APPLIED to the renewal (owes 0), under the subscription lock, one notice', async () => {
        const out = await CreditGatewayRenewalRefund(LINE, driver, provider, user);
        expect(out.Credited).toBe(200);
        expect(state.log).toEqual(['BEGIN', `LOCK Subscription ${SUB}`, 'APPLY 200 from credit to renewal', 'COMMIT']);
        const order = state.saved.find((r) => r.kind === 'Order Headers')!;
        expect(order).toMatchObject({ OrderType: 'Cancellation', moneyOnly: true });
        expect(owes()).toBe(0);
        expect(state.balances.get(CREDIT_ORDER)).toBe(0);
        expect(state.alerts.map((a) => a.Code)).toEqual(['GatewayRenewalRefunded']);
        expect(String(state.alerts[0].Reason)).toMatch(/applied 200\.00 of it to the renewal, which now owes nothing.*Access is unchanged/);
        // One notice per credit: keyed by the credit, so a later refund's notice is not swallowed by this open one.
        expect(state.alerts[0].Key).toBe('ORD-CREDIT');
    });
    it('a FULL refund: the same, the renewal owes 0 (no amount change, so no zero limit and no acknowledgment role)', async () => {
        state.refunded = 599;
        refundBooked(599);
        const out = await CreditGatewayRenewalRefund(LINE, driver, provider, user);
        expect(out.Credited).toBe(599);
        expect(owes()).toBe(0);
        const line = (state.saved.find((r) => r.kind === 'Order Headers')!.lines as Row[])[0];
        expect(line.Quantity).toBe(-1);
    });
    it('a replay: nothing outstanding and nothing left to apply: rolled back, no second credit, no second notice', async () => {
        await CreditGatewayRenewalRefund(LINE, driver, provider, user);
        state.saved = [];
        state.alerts = [];
        state.log = [];
        const out = await CreditGatewayRenewalRefund(LINE, driver, provider, user);
        expect(out.Credited).toBe(0);
        expect(state.saved).toEqual([]);
        expect(state.alerts).toEqual([]);
        expect(state.log).toContain('ROLLBACK');
    });
    it('the gateway is read once, BEFORE the lock (never a gateway round trip while the subscription is locked)', async () => {
        await CreditGatewayRenewalRefund(LINE, driver, provider, user);
        expect(chargeReads).toEqual(['before the lock']);
    });
    it('R6-4: a tail too small to split (0.9999 of the line reversed, 0.05 more refunded of 0.15 left): HELD, nothing booked, a person told, no throw', async () => {
        state.refunded = 598.9;
        refundBooked(0.05);
        state.reversals = [{ OrderHeaderID: OTHER_CREDIT, LineTotalNet: -598.85, Quantity: -0.9999 }];
        const out = await CreditGatewayRenewalRefund(LINE, driver, provider, user);
        expect(out.Credited).toBe(0);
        expect(out.Message).toMatch(/0\.05 held/);
        expect(state.saved).toEqual([]);
        expect(String(state.alerts[0].Reason)).toMatch(/too small to split off what is left of its line/);
        expect(state.log).toContain('COMMIT');
        // …and the refund that FINISHES the line credits all that is owed (0.15) on the last step.
        state.refunded = 599;
        refundBooked(0.15);
        const done = await CreditGatewayRenewalRefund(LINE, driver, provider, user);
        expect(done.Credited).toBe(0.15);
        const line = (state.saved.find((r) => r.kind === 'Order Headers')!.lines as Row[])[0];
        expect(line.Quantity).toBe(-0.0001);
        expect(owes()).toBe(0);
    });
    it('decides on the figure read UNDER the lock: 100 credited by a cancel meanwhile → 100 more, not 200; both applied', async () => {
        state.meanwhile = [{ OrderHeaderID: OTHER_CREDIT, LineTotalNet: -100 }];
        const out = await CreditGatewayRenewalRefund(LINE, driver, provider, user);
        expect(out.Credited).toBe(100);
        expect(state.log.filter((l) => l.startsWith('APPLY')).sort()).toEqual(['APPLY 100 from credit to renewal', 'APPLY 100 from other to renewal']);
        // The credit BOOKED is the figure under the lock too (100), not the pre-lock 200.
        const line = (state.saved.find((r) => r.kind === 'Order Headers')!.lines as Row[])[0];
        expect(Math.round(Math.abs(Number(line.Quantity) * Number(line.UnitPrice)) * 100) / 100).toBe(100);
        expect(owes()).toBe(0);
    });
    it('the whole refund credited by a cancel meanwhile: nothing booked, its credit applied to the renewal', async () => {
        state.meanwhile = [{ OrderHeaderID: OTHER_CREDIT, LineTotalNet: -200 }];
        const out = await CreditGatewayRenewalRefund(LINE, driver, provider, user);
        expect(out.Credited).toBe(0);
        expect(state.saved).toEqual([]);
        expect(state.log).toEqual(['BEGIN', `LOCK Subscription ${SUB}`, 'APPLY 200 from other to renewal', 'COMMIT']);
        expect(owes()).toBe(0);
    });
    it("the refund's cash not yet un-applied (the renewal owes nothing yet): credited, held on the credit order, the Task says so", async () => {
        refundBooked(0);
        const out = await CreditGatewayRenewalRefund(LINE, driver, provider, user);
        expect(out.Credited).toBe(200);
        expect(state.balances.get(CREDIT_ORDER)).toBe(-200);
        expect(String(state.alerts[0].Reason)).toMatch(/applied 0\.00 of it/);
    });
    it('…and once the cash is un-applied, the next delivery applies the credit already booked (no second credit)', async () => {
        refundBooked(0);
        await CreditGatewayRenewalRefund(LINE, driver, provider, user);
        refundBooked(200);
        state.saved = [];
        const out = await CreditGatewayRenewalRefund(LINE, driver, provider, user);
        expect(out.Credited).toBe(0);
        expect(state.saved).toEqual([]);
        expect(owes()).toBe(0);
    });
    it('R7-1: an OLDER credit order spent meanwhile (a person on the Account Credit page): skipped, the new credit still booked and applied, never undone', async () => {
        state.reversals = [{ OrderHeaderID: OTHER_CREDIT, LineTotalNet: -100 }];
        state.balances.set(OTHER_CREDIT, -100);
        refundBooked(300);
        state.refunded = 300;
        state.applyRefusal = 'Order ORD-CR now has only 0 of credit (it was spent meanwhile)';
        state.refuseOnly = OTHER_CREDIT;
        state.spendOnRefusal = true;
        const out = await CreditGatewayRenewalRefund(LINE, driver, provider, user);
        expect(out.Credited).toBe(200);
        expect(state.log).toContain('COMMIT');
        expect(state.log).not.toContain('ROLLBACK');
        expect(state.log.filter((l) => l.startsWith('APPLY'))).toEqual(['APPLY 200 from credit to renewal']);
        // Tried once, re-read: nothing left on it, so not tried again.
        expect(state.applyAttempts).toEqual(['100 from other']);
        expect(owes()).toBe(100);
    });
    it('a refusal that persists: tried twice, then left (Skipped) for the nightly sweep, and the Task says so', async () => {
        state.applyRefusal = 'no';
        const out = await CreditGatewayRenewalRefund(LINE, driver, provider, user);
        expect(out.Credited).toBe(200);
        expect(state.applyAttempts).toEqual(['200 from credit', '200 from credit']);
        expect(state.log).toContain('COMMIT');
        expect(String(state.alerts[0].Reason)).toMatch(/could not be applied now.*no: the nightly sync tries again/);
    });
    it('locks the renewal and every credit order in ONE order (by id) before applying', async () => {
        state.reversals = [{ OrderHeaderID: OTHER_CREDIT, LineTotalNet: -50 }];
        state.balances.set(OTHER_CREDIT, -50);
        refundBooked(250);
        state.refunded = 250;
        await CreditGatewayRenewalRefund(LINE, driver, provider, user);
        expect(state.orderLocks).toEqual([ORDER, CREDIT_ORDER, OTHER_CREDIT].map((i) => i.toLowerCase()).sort());
    });
    it('the refund that finishes the line (599 refunded, 299.50 and half the line already credited): reverses the REST, 0.5', async () => {
        state.refunded = 599;
        refundBooked(599);
        state.reversals = [{ OrderHeaderID: OTHER_CREDIT, LineTotalNet: -299.5, Quantity: -0.5 }];
        state.balances.set(OTHER_CREDIT, 0);
        const out = await CreditGatewayRenewalRefund(LINE, driver, provider, user);
        expect(out.Credited).toBe(299.5);
        const line = (state.saved.find((r) => r.kind === 'Order Headers')!.lines as Row[])[0];
        expect(line.Quantity).toBe(-0.5);
        expect(line.UnitPrice).toBe(599);
        // The first credit order is already spent (balance 0): it is skipped, never a zero-amount application.
        expect(state.log.filter((l) => l.startsWith('APPLY'))).toEqual(['APPLY 299.5 from credit to renewal']);
    });
    it('a $200 slice: quantity 0.3339 at a unit price stated to 4dp (598.9817), so the credit is 200 to the cent', async () => {
        await CreditGatewayRenewalRefund(LINE, driver, provider, user);
        const line = (state.saved.find((r) => r.kind === 'Order Headers')!.lines as Row[])[0];
        expect(line.Quantity).toBe(-0.3339);
        expect(line.UnitPrice).toBe(598.9817);
        expect(Math.round(Math.abs(Number(line.Quantity) * Number(line.UnitPrice)) * 100) / 100).toBe(200);
    });
    it('a ONE-CENT refund: still a valid credit line (0.0001 of the line), exactly 0.01', async () => {
        state.refunded = 0.01;
        refundBooked(0.01);
        const out = await CreditGatewayRenewalRefund(LINE, driver, provider, user);
        expect(out.Credited).toBe(0.01);
        const line = (state.saved.find((r) => r.kind === 'Order Headers')!.lines as Row[])[0];
        expect(line.Quantity).toBe(-0.0001);
        expect(Math.round(Math.abs(Number(line.Quantity) * Number(line.UnitPrice)) * 100) / 100).toBe(0.01);
    });
    it('the credit is spread from TODAY within the term (its service start), never before the term or after it', async () => {
        vi.useFakeTimers();
        try {
            for (const [now, start] of [
                ['2028-03-15T18:00:00Z', '2028-03-15'],
                ['2027-06-01T18:00:00Z', '2027-10-31'],
                ['2029-02-01T18:00:00Z', '2028-10-30'],
            ]) {
                vi.setSystemTime(new Date(now));
                state.saved = [];
                state.reversals = [];
                state.balances = new Map();
                refundBooked(200);
                await CreditGatewayRenewalRefund(LINE, driver, provider, user);
                const line = (state.saved.find((r) => r.kind === 'Order Headers')!.lines as Row[])[0];
                expect((line.ServicePeriodStart as Date).toISOString().slice(0, 10)).toBe(start);
            }
        } finally {
            vi.useRealTimers();
        }
    });
    it('the gateway cannot be read: it throws (never credits on a guess)', async () => {
        const blind = { RetrieveCharge: async () => ({ Success: false, Reason: '503' }) } as never;
        await expect(CreditGatewayRenewalRefund(LINE, blind, provider, user)).rejects.toThrow(/could not read charge ch_renew/);
    });
});

describe('ApplyGatewayCredit: what the cancel door calls too', () => {
    it('applies each credit order up to what the renewal owes, never more', async () => {
        refundBooked(150);
        state.reversals = [{ OrderHeaderID: OTHER_CREDIT, LineTotalNet: -200 }];
        state.balances.set(OTHER_CREDIT, -200);
        expect(await ApplyGatewayCredit(LINE, provider, user)).toEqual({ Applied: 150, RenewalBalance: 0, Skipped: [] });
        expect(state.balances.get(OTHER_CREDIT)).toBe(-50);
    });
    it("R7-2: a cancel's ONE credit order carrying slices of two renewals: this renewal takes only its own slice", async () => {
        // OTHER_CREDIT holds 900 of credit, but only 300 of it reverses THIS renewal's line (600 is renewal 2's).
        refundBooked(500);
        state.reversals = [{ OrderHeaderID: OTHER_CREDIT, LineTotalNet: -300 }];
        state.balances.set(OTHER_CREDIT, -900);
        expect(await ApplyGatewayCredit(LINE, provider, user)).toMatchObject({ Applied: 300, RenewalBalance: 200 });
        expect(state.balances.get(OTHER_CREDIT)).toBe(-600);
    });
    it('stops once the renewal owes nothing: a second credit order is left on account, not applied', async () => {
        refundBooked(100);
        state.reversals = [
            { OrderHeaderID: OTHER_CREDIT, LineTotalNet: -100 },
            { OrderHeaderID: CREDIT_ORDER, LineTotalNet: -50 },
        ];
        state.balances.set(OTHER_CREDIT, -100);
        state.balances.set(CREDIT_ORDER, -50);
        expect(await ApplyGatewayCredit(LINE, provider, user)).toEqual({ Applied: 100, RenewalBalance: 0, Skipped: [] });
        expect(state.log).toEqual(['APPLY 100 from other to renewal']);
        expect(state.balances.get(CREDIT_ORDER)).toBe(-50);
    });
    it('control: a renewal Orders billed itself (not ProviderPayment) takes nothing', async () => {
        state.origin = 'Widget';
        state.reversals = [{ OrderHeaderID: OTHER_CREDIT, LineTotalNet: -200 }];
        state.balances.set(OTHER_CREDIT, -200);
        expect((await ApplyGatewayCredit(LINE, provider, user)).Applied).toBe(0);
        expect(state.log).toEqual([]);
    });
});

describe("SettleGatewayRenewalCredits: the sync's sweep", () => {
    it('nothing on account (the usual case): no transaction, no lock, nothing applied', async () => {
        state.reversals = [{ OrderHeaderID: OTHER_CREDIT, LineTotalNet: -200 }];
        state.balances.set(OTHER_CREDIT, 0);
        expect(await SettleGatewayRenewalCredits(SUB, provider, user)).toBe(0);
        expect(state.log).toEqual([]);
    });
    it('a credit order with a residue but a renewal that owes nothing (e.g. a tax share): no transaction', async () => {
        refundBooked(0);
        state.reversals = [{ OrderHeaderID: OTHER_CREDIT, LineTotalNet: -200 }];
        state.balances.set(OTHER_CREDIT, -30);
        expect(await SettleGatewayRenewalCredits(SUB, provider, user)).toBe(0);
        expect(state.log).toEqual([]);
    });
    it("a cancel's credit booked while the renewal owed nothing, now owed (the refund's cash un-applied): applied under the subscription lock", async () => {
        state.reversals = [{ OrderHeaderID: OTHER_CREDIT, LineTotalNet: -200 }];
        state.balances.set(OTHER_CREDIT, -200);
        expect(await SettleGatewayRenewalCredits(SUB, provider, user)).toBe(200);
        expect(state.log).toEqual(['BEGIN', `LOCK Subscription ${SUB}`, 'APPLY 200 from other to renewal', 'COMMIT']);
        expect(owes()).toBe(0);
        // Idempotent: run again, nothing.
        state.log = [];
        expect(await SettleGatewayRenewalCredits(SUB, provider, user)).toBe(0);
        expect(state.log).toEqual([]);
    });
});

describe('CreditReversalQuantity: the one rule for how much of the line a money credit reverses', () => {
    const q = (Credit: number, Credited: number, AlreadyReversed: number, Paid = 1200, Quantity = 1) =>
        CreditReversalQuantity({ Quantity, AlreadyReversed, Credit, Paid, Credited });
    it('three thirds of a $1,200 line: the last takes what is left, so the slices sum to the line exactly', () => {
        const a = q(400, 0, 0);
        const b = q(400, 400, a);
        const c = q(400, 800, a + b);
        expect([a, b, c].every((x) => x === 0.3333 || x === 0.3334)).toBe(true);
        expect(Math.round((a + b + c) * 1e4) / 1e4).toBe(1);
    });
    it('the finishing credit is the one that EQUALS what is left (>=, not >): it takes the whole remainder', () => {
        expect(q(600, 600, 0.5)).toBe(0.5);
        expect(q(599.99, 600, 0.5)).toBe(0.4999);
    });
    it('R5-2: $1,199.95 then $0.05 — the first slice never takes the whole line, so the 5 cents still reverses', () => {
        const a = q(1199.95, 0, 0);
        expect(a).toBe(0.9999);
        expect(q(0.05, 1199.95, a)).toBe(0.0001);
    });
    it('every two-way cent split of $1,200 is reversible, and the two slices sum to exactly the line', () => {
        const bad: number[] = [];
        for (let cents = 1; cents < 120_000; cents++) {
            const first = cents / 100;
            const a = q(first, 0, 0);
            const b = q(Math.round((1200 - first) * 100) / 100, first, a);
            if (!(a > 0 && b > 0 && Math.round((a + b) * 1e4) === 1e4)) bad.push(first);
        }
        expect(bad).toEqual([]);
    });
    it('sized from what is still owed back: after 600 credited on 0.5 reversed, 300 more is half of what is left', () => {
        expect(q(300, 600, 0.5)).toBe(0.25);
        // AlreadyReversed counts: with nothing reversed yet the same 300 of the 600 left is a quarter of the line
        expect(q(300, 0, 0, 1200)).toBe(0.25);
        expect(q(300, 600, 0)).toBe(0.5);
    });
    it('R6-4: 1,199.80, 0.10, 0.05, 0.05 — never a throw; the 0.05 that cannot be split is held (0), the one that finishes takes the rest', () => {
        const a = q(1199.8, 0, 0);
        const b = q(0.1, 1199.8, a);
        expect([a, b]).toEqual([0.9998, 0.0001]);
        expect(q(0.05, 1199.9, a + b)).toBe(0);
        // Held, so still owed: the next refund finishing the line (both 0.05s: 0.10) takes the last 0.0001.
        expect(q(0.1, 1199.9, a + b)).toBe(0.0001);
    });
    it('M4 boundary: with exactly 0.0002 left, a non-finishing credit takes 0.0001 and leaves 0.0001 for the finish', () => {
        expect(q(0.05, 1199.8, 0.9998)).toBe(0.0001);
        expect(q(0.2, 1199.8, 0.9998)).toBe(0.0002);
    });
    it('a sub-step credit (1 cent of $1,200) is the smallest step, never 0', () => {
        expect(q(0.01, 0, 0)).toBe(0.0001);
    });
    it('nothing of the line left: 0 (held), never a throw', () => {
        expect(q(1, 0, 1)).toBe(0);
    });
});
