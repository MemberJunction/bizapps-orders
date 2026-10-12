/**
 * A reversal line's tax is settled from its origin and never resolved from the order's address.
 *
 * `resolveTaxCharges` is driven directly with the address read and the resolver stubbed, so the
 * test sees which lines were resolved and which charges came back.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockResolveTax } = vi.hoisted(() => ({ mockResolveTax: vi.fn() }));

vi.mock('../pricing/TaxResolver.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../pricing/TaxResolver.js')>();
    return { ...actual, ResolveTax: (...args: unknown[]) => mockResolveTax(...args) };
});

const { OrderPricingService } = await import('../pricing/OrderPricingService.js');

type Line = { ProductID: string };
type Walk = {
    ctx: Record<string, unknown>;
    out: { TaxReasons: Map<number, string> };
    loadAddress: (id: string) => Promise<unknown>;
    resolveLineTaxability: (productID: string) => Promise<unknown>;
    resolveTaxCharges: (chargeable: Array<{ ID: string; Net: number }>, provider: unknown, user: unknown) => Promise<Array<Record<string, unknown>>>;
};

const SETTLED = { Code: 'SalesTax', Amount: -7.25, TaxJurisdictionID: 'jur-origin', TaxRateID: 'rate-origin' };

function walk(lines: Line[], settled: Map<Line, unknown[]>, shipTo: string | null): Walk {
    const w = new OrderPricingService({ Provider: {} as never, User: {} as never }) as unknown as Walk;
    w.ctx = { CompanyID: 'co-1', OrderDate: '2026-09-25', ShipToAddressID: shipTo, Lines: lines, Charges: [], SettledTax: settled };
    w.out = { TaxReasons: new Map() };
    w.loadAddress = vi.fn(async () => ({ Country: 'US', StateProvince: 'TX', City: 'Austin', PostalCode: '73301' }));
    w.resolveLineTaxability = vi.fn(async () => ({ IsTaxable: true, TaxCategory: null, DecidedAt: 'Default' }));
    return w;
}

beforeEach(() => {
    mockResolveTax.mockReset();
    mockResolveTax.mockResolvedValue({ ExemptReason: null, Layers: [{ Rate: 0.0625, TaxJurisdictionID: 'jur-now', TaxRateID: 'rate-now' }] });
});

describe('OrderPricingService.resolveTaxCharges — settled tax', () => {
    it("targets a reversal line's settled charges at it and does not resolve it from the address", async () => {
        const reversal = { ProductID: 'prod-1' };
        const w = walk([reversal], new Map([[reversal, [SETTLED]]]), 'addr-now');

        const out = await w.resolveTaxCharges([{ ID: '0', Net: -100 }], {}, {});

        expect(out).toEqual([{ ...SETTLED, TargetLineID: '0' }]);
        expect(mockResolveTax).not.toHaveBeenCalled();
    });

    it('refunds tax on a return that names no address', async () => {
        const reversal = { ProductID: 'prod-1' };
        const w = walk([reversal], new Map([[reversal, [SETTLED]]]), null);

        expect(await w.resolveTaxCharges([{ ID: '0', Net: -100 }], {}, {})).toEqual([{ ...SETTLED, TargetLineID: '0' }]);
    });

    it('an empty settlement means no tax, not "resolve it"', async () => {
        const reversal = { ProductID: 'prod-1' };
        const w = walk([reversal], new Map([[reversal, []]]), 'addr-now');

        expect(await w.resolveTaxCharges([{ ID: '0', Net: -100 }], {}, {})).toEqual([]);
        expect(mockResolveTax).not.toHaveBeenCalled();
    });

    it('still resolves the other lines from the address', async () => {
        const reversal = { ProductID: 'prod-1' };
        const sale = { ProductID: 'prod-2' };
        const w = walk([reversal, sale], new Map([[reversal, [SETTLED]]]), 'addr-now');

        const out = await w.resolveTaxCharges([{ ID: '0', Net: -100 }, { ID: '1', Net: 50 }], {}, {});

        expect(out).toEqual([
            { ...SETTLED, TargetLineID: '0' },
            { Code: 'SalesTax', TargetLineID: '1', Rate: 0.0625, TaxJurisdictionID: 'jur-now', TaxRateID: 'rate-now' },
        ]);
        expect(mockResolveTax).toHaveBeenCalledTimes(1);
    });

    it('a stated tax charge still wins over everything', async () => {
        const reversal = { ProductID: 'prod-1' };
        const w = walk([reversal], new Map([[reversal, [SETTLED]]]), 'addr-now');
        w.ctx.Charges = [{ Code: 'SalesTax', Rate: 0.05 }];

        expect(await w.resolveTaxCharges([{ ID: '0', Net: -100 }], {}, {})).toEqual([]);
    });
});
