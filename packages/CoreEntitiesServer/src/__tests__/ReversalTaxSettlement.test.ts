/**
 * `applyReversalOrigin` settles each reversal line's tax from its origin (#266).
 *
 * Driven on the real prototype with the origin lookups stubbed, so the test sees what the line's
 * settled tax is: its share of the origin's charges, counting earlier lines of the same return, and
 * nothing at all when the origin was billed by instalment.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockContext, mockTax, mockInstalment } = vi.hoisted(() => ({
    mockContext: vi.fn(),
    mockTax: vi.fn(),
    mockInstalment: vi.fn(),
}));

vi.mock('../ReversalResolver.js', () => ({
    LoadReversalContext: (...args: unknown[]) => mockContext(...args),
    LoadOriginTaxCharges: (...args: unknown[]) => mockTax(...args),
    OriginBilledByInstalment: (...args: unknown[]) => mockInstalment(...args),
}));

const { OrderEntityServer } = await import('../OrderEntityServer.js');

const ORIGIN_LINE = '66666666-6666-4666-8666-666666666666';

interface FakeLine {
    LineNumber: number;
    ProductID: string;
    Quantity: number;
    UnitPrice: number | null;
    DiscountPct: number | null;
    DiscountAmount: number | null;
    ServicePeriodStart: Date | null;
    ServicePeriodEnd: Date | null;
    ShipToAddressID: string | null;
    ReversesOrderLineID: string | null;
    GetFieldByName(name: string): { Dirty: boolean };
}

type Settling = {
    applyReversalOrigin(line: FakeLine): Promise<boolean>;
    _settledTax: Map<FakeLine, Array<{ Amount: number; TaxJurisdictionID: string | null }>>;
};

const reversal = (n: number, quantity: number): FakeLine => ({
    LineNumber: n,
    ProductID: 'prod-1',
    Quantity: quantity,
    UnitPrice: null,
    DiscountPct: null,
    DiscountAmount: null,
    ServicePeriodStart: null,
    ServicePeriodEnd: null,
    ShipToAddressID: null,
    ReversesOrderLineID: ORIGIN_LINE,
    GetFieldByName: () => ({ Dirty: false }),
});

function orderWith(lines: FakeLine[]): Settling {
    const instance = Object.create(OrderEntityServer.prototype) as Settling;
    for (const [name, value] of Object.entries({
        Lines: { Items: lines },
        MoneyLocked: false,
        ProviderToUse: {},
        ContextCurrentUser: { ID: 'user-1' },
        _settledTax: new Map(),
        _inheritedAddresses: new Map(),
    })) {
        Object.defineProperty(instance, name, { value, writable: true });
    }
    return instance;
}

const STATE = { Code: 'SalesTax', Amount: 8.25, TaxJurisdictionID: 'jur-state', TaxRateID: null };
const CITY = { Code: 'SalesTax', Amount: 1, TaxJurisdictionID: 'jur-city', TaxRateID: null };

beforeEach(() => {
    mockContext.mockReset();
    mockTax.mockReset();
    mockInstalment.mockReset();
    mockContext.mockResolvedValue({
        Origin: { ID: ORIGIN_LINE, ProductID: 'prod-1', Quantity: 3, UnitPrice: 33.33, DiscountPct: 0, LineTax: 9.25, OrderHeaderID: 'o-1', CompanyID: 'co-1' },
        AlreadyReversed: 0,
    });
    mockTax.mockResolvedValue([STATE, CITY]);
    mockInstalment.mockResolvedValue(false);
});

describe('OrderEntityServer.applyReversalOrigin — settled tax', () => {
    it("settles the line's share of every jurisdiction the origin was taxed in", async () => {
        const line = reversal(1, -1);
        const order = orderWith([line]);

        await order.applyReversalOrigin(line);

        expect(order._settledTax.get(line)?.map((c) => [c.TaxJurisdictionID, c.Amount])).toEqual([
            ['jur-state', -2.75],
            ['jur-city', -0.33],
        ]);
    });

    it('counts earlier lines of the same return against the same sale line', async () => {
        const first = reversal(1, -1);
        const second = reversal(2, -2);
        const order = orderWith([first, second]);

        await order.applyReversalOrigin(first);
        await order.applyReversalOrigin(second);

        const cityTotal = [first, second].flatMap((l) => order._settledTax.get(l) ?? [])
            .filter((c) => c.TaxJurisdictionID === 'jur-city')
            .reduce((s, c) => s + c.Amount, 0);
        expect(order._settledTax.get(second)?.map((c) => c.Amount)).toEqual([-5.5, -0.67]);
        expect(Math.round(cityTotal * 100) / 100).toBe(-1);
    });

    it('settles no tax when the origin was billed by instalment, and does not read its charges', async () => {
        mockInstalment.mockResolvedValue(true);
        const line = reversal(1, -1);
        const order = orderWith([line]);

        await order.applyReversalOrigin(line);

        expect(order._settledTax.get(line)).toEqual([]);
        expect(mockTax).not.toHaveBeenCalled();
    });
});
