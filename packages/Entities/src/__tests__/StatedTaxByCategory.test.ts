/**
 * A stated tax is recognised by its charge type's category, not by its code (#562).
 *
 * The walk skipped tax resolution only when a stated code contained "tax", so a stated `VAT` was
 * charged on top of the sales tax resolved from the ship-to address.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockResolveTax, taxTypes } = vi.hoisted(() => ({
    mockResolveTax: vi.fn(),
    taxTypes: [] as Array<{ ID: string; Code: string }>,
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    class StubRunView {
        async RunView(params: { EntityName: string; ExtraFilter?: string }) {
            if (params.EntityName !== 'MJ_BizApps_Orders: Charge Types' || params.ExtraFilter !== `Category = 'Tax'`) {
                throw new Error(`unexpected RunView of ${params.EntityName}`);
            }
            return { Success: true, Results: taxTypes };
        }
    }
    return { ...actual, RunView: StubRunView };
});

vi.mock('../pricing/TaxResolver.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../pricing/TaxResolver.js')>();
    return { ...actual, ResolveTax: (...args: unknown[]) => mockResolveTax(...args) };
});

const { OrderPricingService } = await import('../pricing/OrderPricingService.js');
const { StatesTaxCharge } = await import('../pricing/ChargeEngine.js');

type Walk = {
    ctx: Record<string, unknown>;
    out: { TaxReasons: Map<number, string> };
    loadAddress: (id: string) => Promise<unknown>;
    resolveLineTaxability: (productID: string) => Promise<unknown>;
    resolveTaxCharges: (chargeable: Array<{ ID: string; Net: number }>, provider: unknown, user: unknown) => Promise<Array<Record<string, unknown>>>;
};

function walk(charges: Array<{ Code: string; Rate?: number }>): Walk {
    const w = new OrderPricingService({ Provider: {} as never, User: {} as never }) as unknown as Walk;
    w.ctx = { CompanyID: 'co-1', OrderDate: '2026-10-12', ShipToAddressID: 'addr-1', Lines: [{ ProductID: 'prod-1' }], Charges: charges };
    w.out = { TaxReasons: new Map() };
    w.loadAddress = vi.fn(async () => ({ Country: 'US', StateProvince: 'MD', City: 'Baltimore', PostalCode: '21201' }));
    w.resolveLineTaxability = vi.fn(async () => ({ IsTaxable: true, TaxCategory: null, DecidedAt: 'Default' }));
    return w;
}

beforeEach(() => {
    taxTypes.length = 0;
    taxTypes.push({ ID: 'type-sales', Code: 'SalesTax' }, { ID: 'type-vat', Code: 'VAT' });
    mockResolveTax.mockReset();
    mockResolveTax.mockResolvedValue({ ExemptReason: null, Layers: [{ Rate: 0.06, TaxJurisdictionID: 'jur-md', TaxRateID: 'rate-md' }] });
});

describe('OrderPricingService.resolveTaxCharges — stated tax by category', () => {
    it('a stated VAT stops resolution, as a stated SalesTax does', async () => {
        const out = await walk([{ Code: 'VAT', Rate: 0.02 }]).resolveTaxCharges([{ ID: '0', Net: 1000 }], {}, {});

        expect(out).toEqual([]);
        expect(mockResolveTax).not.toHaveBeenCalled();
    });

    it('a non-tax charge whose code contains "tax" does not stop resolution', async () => {
        const out = await walk([{ Code: 'TaxPrepFee' }]).resolveTaxCharges([{ ID: '0', Net: 1000 }], {}, {});

        expect(out).toEqual([{ Code: 'SalesTax', TargetLineID: '0', Rate: 0.06, TaxJurisdictionID: 'jur-md', TaxRateID: 'rate-md' }]);
    });
});

describe('StatesTaxCharge', () => {
    it('matches codes case-insensitively', async () => {
        expect(await StatesTaxCharge(['vat'], {} as never, {} as never)).toBe(true);
        expect(await StatesTaxCharge(['Shipping'], {} as never, {} as never)).toBe(false);
    });

    it('reads nothing when no charge was stated', async () => {
        taxTypes.length = 0;
        expect(await StatesTaxCharge([], {} as never, {} as never)).toBe(false);
    });
});
