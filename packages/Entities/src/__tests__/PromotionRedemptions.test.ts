/**
 * Redemption limits count orders, not adjustment rows, and a spent limit is reported (#561).
 *
 * An order-level promotion writes one adjustment row per line its amount is allocated to, and a
 * line-level one a row per line it discounts. Counting rows let a two-line order spend two of a
 * code's uses. The promotion the limit then stopped was dropped without a reason, so the customer
 * saw no discount and no explanation.
 *
 * `RunPromotions` runs against a RunView stubbed per entity.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { results } = vi.hoisted(() => ({ results: new Map<string, unknown[]>() }));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    class StubRunView {
        async RunView(params: { EntityName: string }) {
            return { Success: true, Results: results.get(params.EntityName) ?? [] };
        }
    }
    return { ...actual, RunView: StubRunView };
});

const { RunPromotions } = await import('../pricing/PromotionEngine.js');

const PROMOTION_ID = '11111111-1111-1111-1111-111111111111';
const CODE_ID = '22222222-2222-2222-2222-222222222222';
const TYPE_ID = '33333333-3333-3333-3333-333333333333';
const CUSTOMER = '44444444-4444-4444-4444-444444444444';
const ORDER_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ORDER_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

function setup(opts: {
    appliesAt: 'Line' | 'Order';
    maxRedemptions?: number | null;
    maxPerCustomer?: number | null;
    codeMax?: number | null;
    /** Adjustment rows other orders hold for this promotion, one per order named. */
    adjustments: string[];
}) {
    results.clear();
    results.set('MJ_BizApps_Orders: Promotion Codes', [
        {
            ID: CODE_ID,
            PromotionID: PROMOTION_ID,
            Code: 'SAVE10',
            Status: 'Active',
            MaxRedemptions: opts.codeMax ?? null,
            EffectiveFrom: null,
            EffectiveTo: null,
        },
    ]);
    results.set('MJ_BizApps_Orders: Promotions', [
        {
            ID: PROMOTION_ID,
            Code: 'SAVE10',
            Name: 'Ten off',
            PromotionTypeID: TYPE_ID,
            CompanyID: null,
            Value: 0.1,
            AppliesAt: opts.appliesAt,
            AllowsStacking: false,
            StackSequence: 0,
            MaxRedemptions: opts.maxRedemptions ?? null,
            MaxRedemptionsPerCustomer: opts.maxPerCustomer ?? null,
            MinimumOrderAmount: null,
            MinimumQuantity: null,
            EffectiveFrom: null,
            EffectiveTo: null,
            QualifierKey: null,
            Status: 'Active',
        },
    ]);
    results.set('MJ_BizApps_Orders: Promotion Types', [{ ID: TYPE_ID, Code: 'PercentOff' }]);
    results.set(
        'MJ_BizApps_Orders: Order Adjustments',
        opts.adjustments.map((o) => ({ PromotionID: PROMOTION_ID, PromotionCodeID: CODE_ID, OrderHeaderID: o })),
    );
    results.set('MJ_BizApps_Orders: Order Headers', [
        { ID: ORDER_A, BillToOrganizationID: CUSTOMER, BillToPersonID: null },
        { ID: ORDER_B, BillToOrganizationID: null, BillToPersonID: null },
    ]);
}

const line = (id: string, net: number) => ({
    ID: id,
    ProductID: '55555555-5555-5555-5555-555555555555',
    ProductCategoryID: null,
    Quantity: 1,
    Net: net,
    Entity: {} as never,
});

const run = (codes = ['save10']) =>
    RunPromotions(
        {
            OrderHeaderID: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
            CompanyID: '66666666-6666-6666-6666-666666666666',
            OrganizationID: CUSTOMER,
            PersonID: null,
            AsOf: new Date('2026-10-12'),
            Codes: codes,
            Lines: [line('line-1', 300), line('line-2', 100)],
            StackingMode: 'Sequential',
            AllowStacking: false,
        },
        {} as never,
        {} as never,
    );

const discount = (r: Awaited<ReturnType<typeof run>>) => [...r.PerLine.values()].reduce((s, v) => s + v, 0);

beforeEach(() => results.clear());

describe('redemption limits count orders', () => {
    it('an order-level promotion allocated to two lines is one redemption', async () => {
        setup({ appliesAt: 'Order', maxRedemptions: 2, adjustments: [ORDER_A, ORDER_A] });
        const r = await run();
        expect(discount(r)).toBe(40);
        expect(r.Unusable).toEqual([]);
    });

    it('a line-level promotion on two lines is one redemption', async () => {
        setup({ appliesAt: 'Line', maxRedemptions: 2, adjustments: [ORDER_A, ORDER_A] });
        const r = await run();
        expect(discount(r)).toBe(40);
    });

    it("the per-customer limit counts that customer's orders", async () => {
        setup({ appliesAt: 'Order', maxPerCustomer: 2, adjustments: [ORDER_A, ORDER_A, ORDER_B] });
        const r = await run();
        expect(discount(r)).toBe(40);
    });

    it("a code's own limit counts orders", async () => {
        setup({ appliesAt: 'Order', codeMax: 2, adjustments: [ORDER_A, ORDER_A] });
        const r = await run();
        expect(discount(r)).toBe(40);
    });
});

describe('a spent limit is reported', () => {
    it('against the code as typed, once, for an order-level promotion', async () => {
        setup({ appliesAt: 'Order', maxRedemptions: 2, adjustments: [ORDER_A, ORDER_B] });
        const r = await run();
        expect(discount(r)).toBe(0);
        expect(r.Unusable).toEqual([{ Code: 'save10', Reason: 'this code has reached its redemption limit' }]);
    });

    it('once for a line-level promotion screened against two lines', async () => {
        setup({ appliesAt: 'Line', maxRedemptions: 1, adjustments: [ORDER_B] });
        const r = await run();
        expect(discount(r)).toBe(0);
        expect(r.Unusable).toEqual([{ Code: 'save10', Reason: 'this code has reached its redemption limit' }]);
    });

    it('with its own reason when the customer has used up their share', async () => {
        setup({ appliesAt: 'Order', maxPerCustomer: 1, adjustments: [ORDER_A, ORDER_B] });
        const r = await run();
        expect(discount(r)).toBe(0);
        expect(r.Unusable).toEqual([
            { Code: 'save10', Reason: 'this customer has reached the redemption limit for this code' },
        ]);
    });

    it("when the code's own limit is spent although the promotion has none", async () => {
        setup({ appliesAt: 'Order', codeMax: 1, adjustments: [ORDER_B] });
        const r = await run();
        expect(discount(r)).toBe(0);
        expect(r.Unusable).toEqual([{ Code: 'save10', Reason: 'this code has reached its redemption limit' }]);
    });
});
