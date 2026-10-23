/**
 * A deferred line books its discount as it earns (golive #328 follow-up).
 *
 * Booking credits Deferred Revenue with the net, and each release debits Deferred for its slice,
 * debits Sales Discounts for its share of the discount and credits Sales for both — so Deferred
 * clears to zero and Sales and Sales Discounts reach the gross and the discount over the term.
 * Before, booking credited Deferred with the gross and debited the discount, while the releases
 * were built from the net, leaving the discount in Deferred for good.
 *
 * A fully discounted deferred line books nothing: no booking entry and no zero-amount releases,
 * which accounting would refuse as MALFORMED_DRAFT.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OrdersEngine } from '@mj-biz-apps/orders-entities';
import { OrderJournalEntryFactory, type OrderLineDraft } from '../OrderJournalEntryFactory.js';
import { GL_ROLE, GLAccountResolutionError } from '../GLAccountResolver.js';
import '../RevenueRecognition.js';

const resolver = {
    Resolve: async (role: string): Promise<string> => `gl-${role}`,
    TakeResolved: () => [],
};

const PRODUCT = { ID: 'p-1', CompanyID: 'c-1', ProductCategoryID: null, ProductTypeID: 'pt-1', RevenueRecognitionTypeID: 'rr-1', Name: 'BB-CORE-R01' };
const EVEN = { ID: 'rr-1', Code: 'EVEN', DriverClass: 'EvenOverTime', IsDeferred: true, ScheduleBasis: 'AtBooking' };

let withSalesDiscounts = true;

function line(overrides: Record<string, unknown>) {
    return {
        ID: 'l-1',
        LineNumber: 1,
        ProductID: 'p-1',
        CompanyID: 'c-1',
        Quantity: 1,
        UnitPrice: 11000,
        ExtendedAmount: 11000,
        DiscountPct: 0,
        DiscountAmount: 0,
        LineTotalNet: 11000,
        LineTax: 0,
        ChargeAmount: 0,
        ServicePeriodStart: '2026-01-01',
        ServicePeriodEnd: '2026-12-31',
        DimensionID: null,
        DimensionValueID: null,
        ...overrides,
    } as never;
}

async function build(l: never): Promise<OrderLineDraft[]> {
    const factory = new OrderJournalEntryFactory(resolver as never, 'ol', 'st', 'ct', {} as never, {} as never);
    return factory.BuildDrafts({ OrderNumber: 'ORD-1', CompanyID: 'c-1' } as never, [l]);
}

function sum(drafts: OrderLineDraft[], account: string, side: 'DebitAmount' | 'CreditAmount'): number {
    const total = drafts.flatMap((d) => d.Draft.Lines).filter((x) => x.GLAccountID === account).reduce((t, x) => t + (x[side] ?? 0), 0);
    return Math.round(total * 100) / 100;
}

beforeEach(() => {
    withSalesDiscounts = true;
    const proto = OrderJournalEntryFactory.prototype as unknown as Record<string, unknown>;
    vi.spyOn(proto, 'loadProducts' as never).mockResolvedValue(new Map([['p-1', PRODUCT]]) as never);
    vi.spyOn(proto, 'loadGiftCardTypeIDs' as never).mockResolvedValue(new Set() as never);
    vi.spyOn(proto, 'loadRevRecTypes' as never).mockResolvedValue(new Map([['rr-1', EVEN]]) as never);
    vi.spyOn(proto, 'loadLineDimensions' as never).mockResolvedValue(new Map() as never);
    vi.spyOn(proto, 'effectiveDateOf' as never).mockResolvedValue('2026-01-01' as never);
    vi.spyOn(proto, 'chargeCreditsFor' as never).mockResolvedValue([] as never);
    vi.spyOn(OrdersEngine.Instance, 'ProductTypeByID').mockReturnValue(undefined as never);
    resolver.Resolve = async (role: string) => {
        if (role === GL_ROLE.SalesDiscounts && !withSalesDiscounts) {
            throw new GLAccountResolutionError(role, 'p-1', 'NotLinked', 'not linked');
        }
        return `gl-${role.replace(/ /g, '')}`;
    };
});

afterEach(() => vi.restoreAllMocks());

describe('a partly discounted deferred line with Sales Discounts linked', () => {
    it('books Deferred at the net and releases the discount with the revenue, so Deferred clears', async () => {
        const drafts = await build(line({ DiscountPct: 0.2, LineTotalNet: 8800 }));
        const booking = drafts.filter((d) => d.IsBooking);
        const releases = drafts.filter((d) => !d.IsBooking);

        expect(sum(booking, 'gl-AccountsReceivable', 'DebitAmount')).toBe(8800);
        expect(sum(booking, 'gl-DeferredRevenue', 'CreditAmount')).toBe(8800);
        expect(sum(booking, 'gl-SalesDiscounts', 'DebitAmount')).toBe(0);

        expect(releases).toHaveLength(12);
        expect(sum(releases, 'gl-DeferredRevenue', 'DebitAmount')).toBe(8800);
        expect(sum(releases, 'gl-SalesDiscounts', 'DebitAmount')).toBe(2200);
        expect(sum(releases, 'gl-Sales', 'CreditAmount')).toBe(11000);

        // Deferred ends at zero: credited the net at booking, debited the net by the releases.
        expect(sum(drafts, 'gl-DeferredRevenue', 'CreditAmount') - sum(drafts, 'gl-DeferredRevenue', 'DebitAmount')).toBe(0);
    });

    it('slices the discount so the shares sum to it exactly when a slice does not divide evenly', async () => {
        // 1,000 off 10,000 over 7 months: 142.857… a month, so per-slice rounding would drift.
        const drafts = await build(
            line({ UnitPrice: 10000, ExtendedAmount: 10000, DiscountAmount: 1000, LineTotalNet: 9000, ServicePeriodEnd: '2026-07-31' }),
        );
        const releases = drafts.filter((d) => !d.IsBooking);
        expect(releases).toHaveLength(7);
        expect(sum(releases, 'gl-SalesDiscounts', 'DebitAmount')).toBe(1000);
        expect(sum(releases, 'gl-Sales', 'CreditAmount')).toBe(10000);
        for (const r of releases) {
            expect(sum([r], 'gl-DeferredRevenue', 'DebitAmount') + sum([r], 'gl-SalesDiscounts', 'DebitAmount')).toBeCloseTo(
                sum([r], 'gl-Sales', 'CreditAmount'),
                2,
            );
        }
    });
});

describe('a partly discounted deferred line with no Sales Discounts account', () => {
    it('nets the discount into the revenue (plan D11): Deferred and Sales both at the net', async () => {
        withSalesDiscounts = false;
        const drafts = await build(line({ DiscountPct: 0.2, LineTotalNet: 8800 }));
        expect(sum(drafts, 'gl-DeferredRevenue', 'CreditAmount')).toBe(8800);
        expect(sum(drafts, 'gl-DeferredRevenue', 'DebitAmount')).toBe(8800);
        expect(sum(drafts, 'gl-Sales', 'CreditAmount')).toBe(8800);
        expect(drafts.flatMap((d) => d.Draft.Lines).some((x) => x.GLAccountID === 'gl-SalesDiscounts')).toBe(false);
    });
});

describe('a fully discounted deferred line', () => {
    it('books nothing at all, even with Sales Discounts linked', async () => {
        // No booking entry: crediting Deferred with the gross would leave it there with nothing to
        // release it. No releases: each would be a zero-amount line accounting refuses.
        const drafts = await build(line({ DiscountPct: 1, LineTotalNet: 0 }));
        expect(drafts).toEqual([]);
    });
});

describe('an up-front discounted line is unchanged', () => {
    it('credits Sales with the gross and debits the discount at booking', async () => {
        const UPFRONT = { ...EVEN, Code: 'UPFRONT', DriverClass: 'UpFront', IsDeferred: false };
        vi.spyOn(OrderJournalEntryFactory.prototype as never, 'loadRevRecTypes' as never).mockResolvedValue(
            new Map([['rr-1', UPFRONT]]) as never,
        );
        const drafts = await build(line({ DiscountPct: 0.2, LineTotalNet: 8800 }));
        expect(drafts).toHaveLength(1);
        expect(sum(drafts, 'gl-Sales', 'CreditAmount')).toBe(11000);
        expect(sum(drafts, 'gl-SalesDiscounts', 'DebitAmount')).toBe(2200);
        expect(sum(drafts, 'gl-AccountsReceivable', 'DebitAmount')).toBe(8800);
    });
});

describe('a discounted percentage-of-completion line', () => {
    it('books Deferred at the net with no discount, because each progress catch-up debits its own share', async () => {
        // BuildProgressDraft debits a share of the discount on every catch-up. Debiting it at
        // booking as well counted it twice and left the discount in Deferred.
        const POC = { ...EVEN, Code: 'POC', DriverClass: 'EvenOverTime', ScheduleBasis: 'OnMeasurement' };
        vi.spyOn(OrderJournalEntryFactory.prototype as never, 'loadRevRecTypes' as never).mockResolvedValue(
            new Map([['rr-1', POC]]) as never,
        );
        const drafts = await build(line({ DiscountPct: 0.2, LineTotalNet: 8800 }));
        expect(drafts).toHaveLength(1);
        expect(sum(drafts, 'gl-DeferredRevenue', 'CreditAmount')).toBe(8800);
        expect(sum(drafts, 'gl-SalesDiscounts', 'DebitAmount')).toBe(0);
    });
});
