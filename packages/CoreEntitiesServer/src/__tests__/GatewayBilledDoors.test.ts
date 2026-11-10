/**
 * The doors around a gateway-billed subscription, pinned at unit level (E2b).
 *
 * A subscription a payment gateway bills (`ProviderSubscriptionID` set) changes only where the gateway is
 * told. The shared entity guards its own columns; these are the OTHER doors that could change what the
 * customer holds while the gateway keeps charging, each previously pinned only by integration checks:
 *
 *   (a) a concession that changes the term (Duration, Shift, Seats, a lower amount), refused when recorded
 *   (b) ... and refused again when an existing Pending one is approved (it may predate the gateway link)
 *   (c) a return of the sale that sold the subscription, refused unless it is the cancel's own reversal
 *   (d) a fresh start whose subscription's gateway id changed since the order decided, refused
 *   (e) a fresh start retires the old gateway id only under the sanction
 *
 * Each drives the real method on the real prototype (`Object.create`, the house pattern), with only the
 * database reads replaced: `RunView` answers from the rows below, and the subscription a fresh start loads
 * is a real `SubscriptionEntityServer` whose `Save` runs the shared entity's real `Validate`.
 *
 * Fixture: Jane's SUB-000110, billed by Stripe as sub_jane, on term TERM; Acme's SUB-000204, invoiced
 * through Bill.com (no gateway id), on term TERM_UNLINKED.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const SUB_BILLED = '11111111-1111-4111-8111-111111111111';
const SUB_UNLINKED = '22222222-2222-4222-8222-222222222222';
const TERM = '33333333-3333-4333-8333-333333333333';
const TERM_UNLINKED = '44444444-4444-4444-8444-444444444444';
const LINE = '55555555-5555-4555-8555-555555555555';
const ORIGIN_LINE = '66666666-6666-4666-8666-666666666666';

const db = vi.hoisted(() => ({
    subscriptions: [] as Array<{ ID: string; SubscriptionNumber: string; ProviderSubscriptionID: string | null }>,
    terms: [] as Array<{ ID: string; OrderLineID: string; SubscriptionID: string }>,
    reads: [] as string[],
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        RunView: class {
            async RunView(params: { EntityName: string; ExtraFilter?: string }) {
                const filter = params.ExtraFilter ?? '';
                db.reads.push(params.EntityName);
                if (params.EntityName.endsWith('Subscription Terms')) {
                    return { Success: true, Results: db.terms.filter((t) => filter.includes(t.ID) || filter.includes(t.OrderLineID)) };
                }
                if (params.EntityName.endsWith('Subscriptions')) {
                    let rows = db.subscriptions.filter((s) => filter.includes(s.ID));
                    // The concession's read asks SQL for the billed ones only; honour it as SQL would.
                    if (filter.includes('ProviderSubscriptionID IS NOT NULL')) rows = rows.filter((s) => s.ProviderSubscriptionID != null);
                    return { Success: true, Results: rows };
                }
                return { Success: true, Results: [] };
            }
        },
    };
});

const reversalContext = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('../ReversalResolver.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../ReversalResolver.js')>();
    return {
        ...actual,
        LoadReversalContext: vi.fn().mockImplementation(() => Promise.resolve(reversalContext.current)),
        LoadOriginTaxCharges: vi.fn().mockResolvedValue([]),
    };
});

const { OrderConcessionEntityServer } = await import('../OrderConcessionEntityServer.js');
const { OrderEntityServer } = await import('../OrderEntityServer.js');
const { SubscriptionEntityServer, SanctionCancellationReversal } = await import('../SubscriptionEntityServer.js');
const { SubscriptionEntity } = await import('@mj-biz-apps/orders-entities');

beforeEach(() => {
    db.subscriptions = [
        { ID: SUB_BILLED, SubscriptionNumber: 'SUB-000110', ProviderSubscriptionID: 'sub_jane' },
        { ID: SUB_UNLINKED, SubscriptionNumber: 'SUB-000204', ProviderSubscriptionID: null },
    ];
    db.terms = [
        { ID: TERM, OrderLineID: LINE, SubscriptionID: SUB_BILLED },
        { ID: TERM_UNLINKED, OrderLineID: '77777777-7777-4777-8777-777777777777', SubscriptionID: SUB_UNLINKED },
    ];
    db.reads = [];
});

afterEach(() => {
    vi.clearAllMocks();
});

// ─── (a) + (b) Concessions ────────────────────────────────────────────────────────────────────────────

/** What the gateway refusal says, for Jane's term. */
const CONCESSION_REFUSAL = /Subscription SUB-000110 is billed by the payment gateway \(sub_jane\).*Make the change at the gateway\./;
/** Returned by the stubbed next step, so a Save that reaches it proves the gateway check let it through. */
const PAST_THE_GATEWAY = 'reached the concession checks past the gateway';

type Kind = 'Duration' | 'Shift' | 'Seats' | 'AmountChange';

function concession(opts: {
    kind: Kind | 'Price';
    termID?: string | null;
    orderLineID?: string | null;
    /** An existing concession being decided, rather than one being recorded. */
    deciding?: { to: 'Approved' | 'Rejected' };
}) {
    const row = Object.create(OrderConcessionEntityServer.prototype) as Record<string, unknown> & {
        Save(): Promise<boolean>;
        RegisterResultHistoryEntry: ReturnType<typeof vi.fn>;
    };
    const values: Record<string, unknown> = {
        ID: 'concession-1',
        DeliveryForm: opts.kind === 'AmountChange' ? 'Price' : opts.kind,
        NewAmount: opts.kind === 'AmountChange' ? 400 : null,
        Status: opts.deciding ? opts.deciding.to : 'Pending',
        SubscriptionTermID: opts.termID === undefined ? TERM : opts.termID,
        OrderLineID: opts.orderLineID ?? null,
    };
    for (const name of Object.keys(values)) {
        Object.defineProperty(row, name, { get: () => values[name], set: (v) => (values[name] = v) });
    }
    Object.defineProperty(row, 'IsSaved', { value: !!opts.deciding });
    Object.defineProperty(row, 'Fields', { value: [] });
    Object.defineProperty(row, 'ContextCurrentUser', { value: { ID: 'user-1' } });
    Object.defineProperty(row, 'ProviderToUse', { value: {} });
    row.GetFieldByName = (name: string) => (name === 'Status' && opts.deciding ? { Dirty: true, OldValue: 'Pending' } : { Dirty: false });
    row.RegisterResultHistoryEntry = vi.fn();
    row.prepareNew = vi.fn().mockResolvedValue(PAST_THE_GATEWAY);
    row.applyDecision = vi.fn().mockResolvedValue(PAST_THE_GATEWAY);
    return row;
}

const rejection = (row: ReturnType<typeof concession>) => (row.RegisterResultHistoryEntry.mock.calls[0]?.[0] as { Message: string } | undefined)?.Message;

const KINDS: Kind[] = ['Duration', 'Shift', 'Seats', 'AmountChange'];

describe('(a) a concession that changes a gateway-billed term is refused when recorded', () => {
    it.each(KINDS)('refuses a %s concession on Jane\'s Stripe-billed term, before any other check', async (kind) => {
        const row = concession({ kind });
        expect(await row.Save()).toBe(false);
        expect(rejection(row)).toMatch(CONCESSION_REFUSAL);
        expect(row.prepareNew).not.toHaveBeenCalled();
    });

    it('names a lower amount as such', async () => {
        const row = concession({ kind: 'AmountChange' });
        await row.Save();
        expect(rejection(row)).toMatch(/A lower amount concession here/);
    });

    it('finds the term through the order line when the concession names no term', async () => {
        const row = concession({ kind: 'Seats', termID: null, orderLineID: LINE });
        expect(await row.Save()).toBe(false);
        expect(rejection(row)).toMatch(CONCESSION_REFUSAL);
    });

    it.each(KINDS)('lets a %s concession on Acme\'s Bill.com-invoiced term through to the usual checks', async (kind) => {
        const row = concession({ kind, termID: TERM_UNLINKED });
        expect(await row.Save()).toBe(false);
        expect(rejection(row)).toBe(PAST_THE_GATEWAY);
        expect(row.prepareNew).toHaveBeenCalledTimes(1);
    });

    it('lets a Price concession that prices the sale itself through, even on a gateway-billed term', async () => {
        const row = concession({ kind: 'Price' });
        await row.Save();
        expect(rejection(row)).toBe(PAST_THE_GATEWAY);
        // Not a term change, so the term is not even read.
        expect(db.reads).toEqual([]);
    });
});

describe('(b) ... and refused again when an existing Pending one is approved', () => {
    it.each(KINDS)('refuses approving a Pending %s concession once its term is gateway-billed', async (kind) => {
        const row = concession({ kind, deciding: { to: 'Approved' } });
        expect(await row.Save()).toBe(false);
        expect(rejection(row)).toMatch(CONCESSION_REFUSAL);
        expect(row.applyDecision).not.toHaveBeenCalled();
    });

    it('lets the same concession be Rejected: declining it changes nothing at the gateway', async () => {
        const row = concession({ kind: 'Duration', deciding: { to: 'Rejected' } });
        await row.Save();
        expect(rejection(row)).toBe(PAST_THE_GATEWAY);
        expect(row.applyDecision).toHaveBeenCalledTimes(1);
    });

    it('lets an approval on an unlinked term through to the decision', async () => {
        const row = concession({ kind: 'Shift', termID: TERM_UNLINKED, deciding: { to: 'Approved' } });
        await row.Save();
        expect(rejection(row)).toBe(PAST_THE_GATEWAY);
    });
});

// ─── (c) Returns ──────────────────────────────────────────────────────────────────────────────────────

type Returning = { applyReversalOrigin(line: unknown): Promise<boolean> };

function returnOrder(): Returning {
    const order = Object.create(OrderEntityServer.prototype) as Returning;
    const line = returnLine();
    for (const [name, value] of Object.entries({
        Lines: { Items: [line] },
        MoneyLocked: false,
        OrderDate: new Date('2026-10-01T00:00:00Z'),
        ProviderToUse: {},
        ContextCurrentUser: { ID: 'user-1' },
        _settledTax: new Map(),
        _inheritedAddresses: new Map(),
    })) {
        Object.defineProperty(order, name, { value, writable: true });
    }
    (order as unknown as { line: unknown }).line = line;
    return order;
}

function returnLine() {
    return {
        LineNumber: 1,
        ProductID: 'prod-1',
        Quantity: -1,
        UnitPrice: null,
        DiscountPct: null,
        DiscountAmount: null,
        ServicePeriodStart: null,
        ServicePeriodEnd: null,
        ShipToAddressID: null,
        ReversesOrderLineID: ORIGIN_LINE,
        GetFieldByName: () => ({ Dirty: false }),
    };
}

function originSelling(subscriptionID: string | null) {
    reversalContext.current = {
        Origin: {
            ID: ORIGIN_LINE,
            ProductID: 'prod-1',
            Quantity: 1,
            UnitPrice: 599,
            DiscountPct: 0,
            LineTax: 0,
            OrderHeaderID: 'o-1',
            CompanyID: 'co-1',
            SubscriptionID: subscriptionID,
        },
        AlreadyReversed: 0,
        ScheduleRows: [],
        PriorReversals: [],
        OriginScheduled: false,
    };
}

const lineOf = (order: Returning) => (order as unknown as { line: unknown }).line;

describe('(c) a return of the sale of a gateway-billed subscription', () => {
    it('is refused: it would credit Jane and end her access while Stripe keeps charging', async () => {
        originSelling(SUB_BILLED);
        const order = returnOrder();
        await expect(order.applyReversalOrigin(lineOf(order))).rejects.toThrow(
            /Order line 1: the line it returns sold subscription SUB-000110, which the payment gateway bills \(sub_jane\)\..*Cancel the subscription instead/,
        );
    });

    it("passes when it is the cancel's own reversal, marked by SanctionCancellationReversal", async () => {
        originSelling(SUB_BILLED);
        const order = returnOrder();
        SanctionCancellationReversal(order);
        await expect(order.applyReversalOrigin(lineOf(order))).resolves.toBe(true);
        // The mark skips the gateway question entirely.
        expect(db.reads).not.toContain('MJ_BizApps_Orders: Subscriptions');
    });

    it("marking ANOTHER order does not let this one through (the mark is per order object)", async () => {
        originSelling(SUB_BILLED);
        SanctionCancellationReversal(returnOrder());
        const order = returnOrder();
        await expect(order.applyReversalOrigin(lineOf(order))).rejects.toThrow(/payment gateway bills \(sub_jane\)/);
    });

    it('passes for a subscription no gateway bills, and for a sale that sold no subscription', async () => {
        originSelling(SUB_UNLINKED);
        const unlinked = returnOrder();
        await expect(unlinked.applyReversalOrigin(lineOf(unlinked))).resolves.toBe(true);

        originSelling(null);
        const plain = returnOrder();
        await expect(plain.applyReversalOrigin(lineOf(plain))).resolves.toBe(true);
    });
});

// ─── (d) + (e) A fresh start ──────────────────────────────────────────────────────────────────────────

/**
 * A real `SubscriptionEntityServer` held without metadata: its columns are tracked here (value, loaded
 * value, dirty), and `Save` runs the shared entity's REAL `Validate`, so a write the sanction does not
 * cover is refused exactly as on a server.
 */
function loadedSubscription(loaded: { ProviderSubscriptionID: string | null; Status?: string }) {
    const sub = Object.create(SubscriptionEntityServer.prototype) as InstanceType<typeof SubscriptionEntityServer> & Record<string, unknown>;
    const initial: Record<string, unknown> = {
        ID: SUB_BILLED,
        SubscriptionNumber: 'SUB-000110',
        Status: loaded.Status ?? 'Canceled',
        CanceledAt: new Date('2026-09-01T00:00:00Z'),
        EndDate: new Date('2026-12-31T00:00:00Z'),
        AutoRenew: false,
        ProductID: 'prod-1',
        SubscriptionTypeID: 'type-1',
        StartDate: new Date('2025-10-30T00:00:00Z'),
        MigratesToSubscriptionID: null,
        MigratesFromSubscriptionID: null,
        PaymentProviderID: loaded.ProviderSubscriptionID ? 'stripe-account' : null,
        ProviderSubscriptionID: loaded.ProviderSubscriptionID,
    };
    const fields = new Map(Object.entries(initial).map(([n, v]) => [n, { Name: n, Value: v, OldValue: v, Dirty: false }]));
    for (const [name, field] of fields) {
        Object.defineProperty(sub, name, {
            get: () => field.Value,
            set: (v) => {
                field.Value = v;
                field.Dirty = v !== field.OldValue;
            },
        });
    }
    Object.defineProperty(sub, 'IsSaved', { value: true });
    Object.defineProperty(sub, 'GetFieldByName', { value: (n: string) => fields.get(n) });
    Object.defineProperty(sub, 'Get', { value: (n: string) => fields.get(n)?.Value });
    const saves: Array<{ Success: boolean; Message?: string }> = [];
    Object.defineProperty(sub, 'LatestResult', { get: () => ({ CompleteMessage: saves.at(-1)?.Message }) });
    Object.defineProperty(sub, 'Save', {
        value: vi.fn(async () => {
            const result = sub.Validate();
            saves.push({ Success: result.Success, Message: result.Errors.map((e) => e.Message).join('; ') });
            return result.Success;
        }),
    });
    return { sub, saves };
}

// The generated validators are not what this is about; the shared entity's gateway rules run for real.
const generatedParent = Object.getPrototypeOf(SubscriptionEntity.prototype) as { Validate: () => unknown };
let originalValidate: () => unknown;
beforeEach(() => {
    originalValidate = generatedParent.Validate;
    generatedParent.Validate = () => ({ Success: true, Errors: [] });
});
afterEach(() => {
    generatedParent.Validate = originalValidate;
});

type Touching = {
    touchExistingSubscription(
        decision: { Action: string; SubscriptionID: string; Term?: { TermNumber: number } },
        isRenewal: boolean,
        options?: unknown,
        displacedStart?: unknown,
        renewedOnto?: unknown,
        retireGatewaySubscriptionID?: string,
    ): Promise<string>;
    logSubscriptionEvent: ReturnType<typeof vi.fn>;
};

function orderLoading(sub: unknown): Touching {
    const order = Object.create(OrderEntityServer.prototype) as Touching;
    Object.defineProperty(order, 'ProviderToUse', { value: { GetEntityObject: vi.fn().mockResolvedValue(sub) } });
    Object.defineProperty(order, 'ContextCurrentUser', { value: { ID: 'user-1' } });
    order.logSubscriptionEvent = vi.fn().mockResolvedValue(undefined);
    return order;
}

const REACTIVATE = { Action: 'Reactivate', SubscriptionID: SUB_BILLED, Term: { TermNumber: 3 } };

describe('(d) a fresh start whose subscription changed since the order decided is refused', () => {
    it('refuses when the gateway id is now another one (linked again since)', async () => {
        const { sub } = loadedSubscription({ ProviderSubscriptionID: 'sub_relinked' });
        const order = orderLoading(sub);
        await expect(order.touchExistingSubscription(REACTIVATE, false, undefined, undefined, undefined, 'sub_jane')).rejects.toThrow(
            'Subscription SUB-000110 changed while this order was confirmed (its payment gateway id is now sub_relinked, not sub_jane); confirm the order again.',
        );
        expect(sub.Save).not.toHaveBeenCalled();
        expect(sub.ProviderSubscriptionID).toBe('sub_relinked');
    });

    it('refuses when the gateway id is now empty', async () => {
        const { sub } = loadedSubscription({ ProviderSubscriptionID: null });
        await expect(orderLoading(sub).touchExistingSubscription(REACTIVATE, false, undefined, undefined, undefined, 'sub_jane')).rejects.toThrow(
            /its payment gateway id is now empty, not sub_jane\); confirm the order again\./,
        );
        expect(sub.Save).not.toHaveBeenCalled();
    });

    it('refuses retiring an id on anything but a reactivation', async () => {
        const { sub } = loadedSubscription({ ProviderSubscriptionID: 'sub_jane' });
        await expect(
            orderLoading(sub).touchExistingSubscription({ ...REACTIVATE, Action: 'ExtendExisting' }, false, undefined, undefined, undefined, 'sub_jane'),
        ).rejects.toThrow(/confirm the order again/);
        expect(sub.ProviderSubscriptionID).toBe('sub_jane');
    });
});

describe('(e) a fresh start retires the old gateway id under the sanction', () => {
    it('clears the id and account and reactivates, and the shared entity accepts the save', async () => {
        const { sub, saves } = loadedSubscription({ ProviderSubscriptionID: 'sub_jane' });
        const order = orderLoading(sub);

        await expect(order.touchExistingSubscription(REACTIVATE, false, undefined, undefined, undefined, 'sub_jane')).resolves.toBe(SUB_BILLED);

        expect(saves).toEqual([{ Success: true, Message: '' }]);
        expect(sub.ProviderSubscriptionID).toBeNull();
        expect(sub.PaymentProviderID).toBeNull();
        expect(sub.Status).toBe('Active');
        expect(sub.AutoRenew).toBe(true);
        expect(order.logSubscriptionEvent).toHaveBeenCalledWith(
            SUB_BILLED,
            'Activated',
            undefined,
            expect.objectContaining({ RetiredProviderSubscriptionID: 'sub_jane' }),
        );
    });

    it('control: the same writes on a subscription nobody sanctioned are refused by the shared entity', () => {
        const { sub } = loadedSubscription({ ProviderSubscriptionID: 'sub_jane' });
        sub.ProviderSubscriptionID = null;
        sub.PaymentProviderID = null;
        sub.Status = 'Active';
        const result = sub.Validate();
        expect(result.Success).toBe(false);
        expect(result.Errors[0].Message).toMatch(/The payment gateway bills this subscription \(sub_jane\)/);
    });
});
