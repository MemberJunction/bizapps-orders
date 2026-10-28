/**
 * A held manual discount is refused on a walk that books the order on the same save (golive #328).
 *
 * `AuthorizeManualDiscount` holds an over-cap discount for approval instead of refusing it, and the
 * confirm gate that would hold the order has already run by the time a booking walk prices it. So a
 * discount staged in the same save as Confirm is refused, while the same discount on a draft save is
 * recorded with neither an authority nor an approver, which is what the confirm gate later reads.
 *
 * `decidePromotions` with the promotion engine and the authorization stubbed.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockRunPromotions, mockAuthorize } = vi.hoisted(() => ({
    mockRunPromotions: vi.fn(),
    mockAuthorize: vi.fn(),
}));

vi.mock('../pricing/PromotionEngine.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../pricing/PromotionEngine.js')>();
    return {
        ...actual,
        RunPromotions: (...args: unknown[]) => mockRunPromotions(...args),
        AuthorizeManualDiscount: (...args: unknown[]) => mockAuthorize(...args),
    };
});

const { OrderPricingService } = await import('../pricing/OrderPricingService.js');

type Line = { ID: string; ProductID: string; Quantity: number; UnitPrice: number; DiscountPct: number; DiscountAmount: number };
type Walk = {
    ctx: Record<string, unknown>;
    out: { UnusableCodes: unknown[] };
    loadProductForPricing: () => Promise<null>;
    loadCompanyPolicy: () => Promise<{ AllowPromotionStacking: boolean; StackingMode: string }>;
    decidePromotions: () => Promise<{ Applications: Array<Record<string, unknown>> } | null>;
};

const HELD = { AuthorityID: null, NeedsApproval: true, ApprovedByUserID: null, Held: 'A 50% discount is outside this user\'s SalesAuthority and needs approval.' };

function walk(line: Line, booking: boolean | undefined): Walk {
    const w = new OrderPricingService({ Provider: {} as never, User: { ID: 'user-1' } as never }) as unknown as Walk;
    w.ctx = {
        CompanyID: 'co-1',
        Lines: [line],
        PromotionCodes: [],
        ManualDiscounts: [{ OrderLineID: '0', Percent: 0.5, Reason: 'giveaway' }],
        Booking: booking,
    };
    w.out = { UnusableCodes: [] };
    w.loadProductForPricing = async () => null;
    w.loadCompanyPolicy = async () => ({ AllowPromotionStacking: false, StackingMode: 'Sequential' });
    return w;
}

const line = (): Line => ({ ID: 'line-1', ProductID: 'p', Quantity: 10, UnitPrice: 100, DiscountPct: 0, DiscountAmount: 0 });

beforeEach(() => {
    mockRunPromotions.mockReset().mockResolvedValue({ Applications: [], PerLine: new Map(), Unusable: [] });
    mockAuthorize.mockReset().mockResolvedValue(HELD);
});

describe('OrderPricingService.decidePromotions — a held manual discount', () => {
    it('is refused on a booking walk, naming the hold and how to proceed', async () => {
        const l = line();

        await expect(walk(l, true).decidePromotions()).rejects.toThrow(
            /^Manual discount refused: A 50% discount is outside .* needs approval\. Save the order without confirming it/,
        );
        expect(l.DiscountAmount).toBe(0);
    });

    it('is recorded with no authority and no approver on a draft save', async () => {
        const l = line();

        const run = await walk(l, false).decidePromotions();

        expect(run?.Applications).toEqual([
            expect.objectContaining({ OrderLineID: '0', Amount: 500, AuthorizedBySalesAuthorityID: null, ApprovedByUserID: null }),
        ]);
        expect(l.DiscountAmount).toBe(500);
    });

    it('is recorded when the walk does not say it books', async () => {
        const l = line();

        await walk(l, undefined).decidePromotions();

        expect(l.DiscountAmount).toBe(500);
    });

    it('a discount within the cap is granted on a booking walk', async () => {
        mockAuthorize.mockResolvedValue({ AuthorityID: 'authority-1', NeedsApproval: false, ApprovedByUserID: null });
        const l = line();

        const run = await walk(l, true).decidePromotions();

        expect(run?.Applications[0]).toMatchObject({ AuthorizedBySalesAuthorityID: 'authority-1' });
        expect(l.DiscountAmount).toBe(500);
    });
});
