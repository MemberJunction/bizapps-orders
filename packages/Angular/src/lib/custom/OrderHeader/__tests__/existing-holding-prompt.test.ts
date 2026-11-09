// The component's import graph reaches `@angular/common`, whose partially-compiled
// injectables fall back to JIT. Loading the compiler is all that costs; nothing here
// bootstraps Angular or instantiates the component.
import '@angular/compiler';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OrdersEngine, type mjBizAppsOrdersOrderLineEntity } from '@mj-biz-apps/orders-entities';
import * as OrdersQueries from '../../../data/orders-queries';
import { MJOOrderLinesEditorComponent } from '../order-lines-editor.component';
import type { MJOExistingHolding, MJOProductOption } from '../../../data/orders-queries';

/**
 * Extend-or-new subscription prompt in `MJOOrderLinesEditorComponent` (golive #299, #866).
 *
 * Covers the holding lookup via stubbed `GetExistingHolding`, the prompt's coverage-end display,
 * the read-only continuation start under `ExtendExisting`, keeping the line's dates under
 * `CreateNew`, and clearing the stored answer when the line's product changes.
 */

const PROD_HELD = '11111111-1111-4111-8111-111111111111';
const PROD_UNHELD = '22222222-2222-4222-8222-222222222222';
const ORG_ID = '33333333-3333-4333-8333-333333333333';

const d = (s: string) => new Date(`${s}T00:00:00Z`);

function seedEngine(): void {
    const engine = OrdersEngine.Instance as unknown as Record<string, unknown>;
    engine._products = [
        { ID: PROD_HELD, Name: 'Annual Membership', SubscriptionTypeID: 'st-annual' },
        { ID: PROD_UNHELD, Name: 'Journal Subscription', SubscriptionTypeID: 'st-annual' },
    ];
    engine._productTypes = [];
    engine._subscriptionTypes = [{ ID: 'st-annual', StartMode: 'Immediate', DefaultTermMonths: 12, BillingCadence: 'Annual' }];
}

beforeEach(seedEngine);
afterEach(() => {
    vi.restoreAllMocks();
    const engine = OrdersEngine.Instance as unknown as Record<string, unknown>;
    engine._products = [];
    engine._subscriptionTypes = [];
});

const option = (ID: string): MJOProductOption => ({
    ID,
    Name: ID,
    SKU: '',
    TypeName: 'Membership',
    ProductTypeID: 't',
    OrderLineExtensionEntity: null,
    CompanyName: '',
    CompanyID: '',
    ListPrice: 1200,
    Taxable: false,
    MaxQuantityPerLine: null,
    SubscriptionTypeID: 'st-annual',
    ContainsSubscription: false,
});

function editor(orderDate = '2026-10-20') {
    const c = Object.create(MJOOrderLinesEditorComponent.prototype) as MJOOrderLinesEditorComponent;
    Object.assign(c as object, {
        EditMode: true,
        Catalog: [option(PROD_HELD), option(PROD_UNHELD)],
        _order: {
            OrderDate: d(orderDate),
            MoneyLocked: false,
            BillToOrganizationID: ORG_ID,
            BillToPersonID: null,
            ShipToOrganizationID: null,
            ShipToPersonID: null,
        },
        cdr: { detectChanges: vi.fn() },
        continuationStarts: new Map(),
        loadingContinuations: new Set(),
        holdings: new Map(),
        loadingHoldings: new Set(),
        holdingProductByLine: new Map(),
    });
    return c;
}

const makeLine = (ProductID: string, start: string | null = '2026-11-01', end: string | null = null) =>
    ({
        ID: 'line-1',
        ProductID,
        ShipToOrganizationID: null,
        ShipToPersonID: null,
        ServicePeriodStart: start ? d(start) : null,
        ServicePeriodEnd: end ? d(end) : null,
        RenewsSubscriptionID: null,
        SubscriptionAction: null,
    }) as unknown as mjBizAppsOrdersOrderLineEntity;

const HELD_SUBSCRIPTION: MJOExistingHolding = {
    SubscriptionID: 'sub-42',
    SubscriptionNumber: 'SUB-0042',
    Status: 'Active',
    LatestTermEnd: d('2027-06-30'),
    Reactivation: null,
};

/** Flush microtasks queued by the fire-and-forget `loadHolding` read. */
const flushHoldingLookup = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('order-lines-editor extend-or-new subscription prompt (#866)', () => {
    it('shows no prompt when GetExistingHolding returns null and does not re-query once cached', async () => {
        const spy = vi.spyOn(OrdersQueries, 'GetExistingHolding').mockResolvedValue(null);
        const c = editor();
        const l = makeLine(PROD_UNHELD);

        expect(c.ExistingHoldingFor(l)).toBeNull();
        await flushHoldingLookup();

        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy).toHaveBeenCalledWith(PROD_UNHELD, ORG_ID, null);
        expect(c.ExistingHoldingFor(l)).toBeNull();
        expect(c.TermStartIsDictated(l)).toBe(false);
        expect(spy).toHaveBeenCalledTimes(1);
    });

    it('surfaces the holding and its coverage end when the subscriber already holds the product', async () => {
        const spy = vi.spyOn(OrdersQueries, 'GetExistingHolding').mockResolvedValue(HELD_SUBSCRIPTION);
        const c = editor();
        const l = makeLine(PROD_HELD);

        expect(c.ExistingHoldingFor(l)).toBeNull();
        await flushHoldingLookup();

        expect(spy).toHaveBeenCalledTimes(1);
        const holding = c.ExistingHoldingFor(l);
        expect(holding).toEqual(HELD_SUBSCRIPTION);
        expect(c.HoldingCoverageEnd(holding!)).toBe('2027-06-30');
        expect(c.HoldingContinuationStart(holding!)).toBe('2027-07-01');
    });

    it('selecting ExtendExisting stores the answer and locks the term start to the continuation date', async () => {
        vi.spyOn(OrdersQueries, 'GetExistingHolding').mockResolvedValue(HELD_SUBSCRIPTION);
        const c = editor();
        const l = makeLine(PROD_HELD, '2026-11-01');

        c.ExistingHoldingFor(l);
        await flushHoldingLookup();

        c.SetSubscriptionAction(l, 'ExtendExisting');
        expect(l.SubscriptionAction).toBe('ExtendExisting');
        expect(c.TermStartIsDictated(l)).toBe(true);
        expect(c.ContinuationStartValue(l)).toBe('2027-07-01');
        expect(c.TermEndValue(l)).toBe('2028-06-30');
    });

    it('selecting CreateNew stores the answer and keeps the line\u2019s own start and end dates', async () => {
        vi.spyOn(OrdersQueries, 'GetExistingHolding').mockResolvedValue(HELD_SUBSCRIPTION);
        const c = editor();
        const l = makeLine(PROD_HELD, '2026-11-01');

        c.ExistingHoldingFor(l);
        await flushHoldingLookup();

        c.SetSubscriptionAction(l, 'CreateNew');
        expect(l.SubscriptionAction).toBe('CreateNew');
        expect(c.TermStartIsDictated(l)).toBe(false);
        expect(c.TermStartValue(l)).toBe('2026-11-01');
        expect(c.TermEndValue(l)).toBe('2027-10-31');
    });

    it('clears SubscriptionAction when the line\u2019s product changes', async () => {
        vi.spyOn(OrdersQueries, 'GetExistingHolding').mockImplementation(async (productID) =>
            productID === PROD_HELD ? HELD_SUBSCRIPTION : null,
        );
        const c = editor();
        const l = makeLine(PROD_HELD, '2026-11-01');

        c.ExistingHoldingFor(l);
        await flushHoldingLookup();
        c.SetSubscriptionAction(l, 'ExtendExisting');
        expect(l.SubscriptionAction).toBe('ExtendExisting');
        expect(c.TermStartIsDictated(l)).toBe(true);

        // Switching the line to a different product drops the answer recorded for the previous one.
        l.ProductID = PROD_UNHELD;
        expect(c.ExistingHoldingFor(l)).toBeNull();
        await flushHoldingLookup();

        expect(l.SubscriptionAction).toBeNull();
        expect(c.TermStartIsDictated(l)).toBe(false);
        expect(c.ExistingHoldingFor(l)).toBeNull();
    });
});
