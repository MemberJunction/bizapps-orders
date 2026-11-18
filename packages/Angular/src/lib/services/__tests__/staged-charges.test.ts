import { describe, expect, it, vi } from 'vitest';
import type { OrderHeaderEntity } from '@mj-biz-apps/orders-entities';

/**
 * #838 — the header total left out charges entered by hand: neither pricing path was sent the
 * order's unsaved charge rows, and the local walk's line copies dropped the charges a saved line
 * already carried. The walk is stubbed; these check what the scheduler hands it.
 */

const { priceInputs } = vi.hoisted(() => ({ priceInputs: [] as Array<Record<string, unknown>> }));

vi.mock('@memberjunction/core', async (importActual) => {
    const actual = await importActual<typeof import('@memberjunction/core')>();
    class FakeMetadata {
        static Provider = {};
        CurrentUser = {};
        async GetEntityObject() {
            return { NewRecord() {} };
        }
    }
    return { ...actual, Metadata: FakeMetadata };
});

vi.mock('@mj-biz-apps/orders-entities', async (importActual) => {
    const actual = await importActual<typeof import('@mj-biz-apps/orders-entities')>();
    class FakePricingService {
        async Price(input: { Lines: Array<Record<string, number>> } & Record<string, unknown>) {
            priceInputs.push(input);
            for (const line of input.Lines) line.UnitPrice = 100;
            return { PriceComponents: new Map(), TaxReasons: new Map(), EngineDefaults: new Map() };
        }
    }
    return {
        ...actual,
        CanPriceOrderLocally: async () => ({ CanPriceLocally: true }),
        OrderPricingService: FakePricingService,
        LoadOrdersEngine: async () => undefined,
        OrdersEngine: {
            Instance: {
                ChargeTypeByID: (id: string) => (id === 'CT-SHIP' ? { Code: 'Shipping' } : undefined),
            },
        },
    };
});

const { MJOPricingScheduler, StagedCharges } = await import('../pricing-scheduler.service');

function order(charges: unknown[], chargeAmount = 0): OrderHeaderEntity {
    const line = {
        ID: 'L1',
        ProductID: 'P1',
        Quantity: 1,
        DiscountPct: 0,
        DiscountAmount: 0,
        ChargeAmount: chargeAmount,
        GetFieldByName: () => undefined,
    };
    return {
        ID: 'O1',
        CompanyID: 'C1',
        PromotionCodes: { Codes: [] },
        Adjustments: { Items: [] },
        Charges: { Items: charges },
        Lines: { Items: [line], Count: 1 },
    } as unknown as OrderHeaderEntity;
}

describe('StagedCharges', () => {
    it('turns unsaved charge rows into requests by code, skipping saved rows and unknown types', async () => {
        const requests = await StagedCharges(
            order([
                { IsSaved: false, ChargeTypeID: 'CT-SHIP', Amount: 15, Rate: null },
                { IsSaved: true, ChargeTypeID: 'CT-SHIP', Amount: 99, Rate: null },
                { IsSaved: false, ChargeTypeID: 'CT-GONE', Amount: 5, Rate: null },
            ]),
        );
        expect(requests).toEqual([{ Code: 'Shipping', Amount: 15, Rate: null }]);
    });
});

describe('local pricing — hand-entered charges', () => {
    it('sends staged charges to the walk', async () => {
        priceInputs.length = 0;
        await new MJOPricingScheduler().PriceNow(
            order([{ IsSaved: false, ChargeTypeID: 'CT-SHIP', Amount: 15, Rate: null }]),
            () => undefined,
        );
        expect(priceInputs[0].Charges).toEqual([{ Code: 'Shipping', Amount: 15, Rate: null }]);
    });

    it('keeps the charges a saved line already carries in the gross total', async () => {
        const states: Array<{ Result: { Totals: { GrossTotal: number } } | null }> = [];
        await new MJOPricingScheduler().PriceNow(order([], 12), (s) => states.push(s as never));
        expect(states.at(-1)?.Result?.Totals.GrossTotal).toBe(112);
    });
});
