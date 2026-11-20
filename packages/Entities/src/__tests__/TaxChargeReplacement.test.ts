/**
 * A re-priced order replaces its tax rows instead of adding a second set (#484).
 *
 * Saving a taxed draft and then confirming it ran the pricing walk twice. Each walk re-resolved the
 * tax and wrote its own charge rows, so the confirm found two sets on every line: the line's
 * `LineTax` showed one, booking credited both, and the entry was refused as unbalanced.
 *
 * `DeleteTaxCharges` is driven against a stubbed RunView; `decideCharges` with the tax resolver
 * stubbed.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { views, mockRunCharges } = vi.hoisted(() => ({
    views: [] as Array<{ params: { EntityName: string; ExtraFilter?: string }; results: unknown[] }>,
    mockRunCharges: vi.fn(),
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    class StubRunView {
        async RunView(params: { EntityName: string; ExtraFilter?: string }) {
            const next = views.find((v) => v.params.EntityName === params.EntityName && v.params.ExtraFilter === undefined);
            if (!next) throw new Error(`unexpected RunView of ${params.EntityName}`);
            next.params.ExtraFilter = params.ExtraFilter;
            return { Success: true, Results: next.results };
        }
    }
    return { ...actual, RunView: StubRunView };
});

vi.mock('../pricing/ChargeEngine.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../pricing/ChargeEngine.js')>();
    return { ...actual, RunCharges: (...args: unknown[]) => mockRunCharges(...args) };
});

const { DeleteTaxCharges } = await import('../pricing/ChargeEngine.js');
const { OrderPricingService } = await import('../pricing/OrderPricingService.js');

function queue(entityName: string, results: unknown[]) {
    views.push({ params: { EntityName: entityName }, results });
}

function row(id: string, deleted: string[]) {
    return { ID: id, Delete: vi.fn(async () => { deleted.push(id); return true; }) };
}

beforeEach(() => {
    views.length = 0;
    mockRunCharges.mockReset();
});

describe('DeleteTaxCharges', () => {
    it("removes the lines' earlier tax rows, allocations before their charge", async () => {
        const deleted: string[] = [];
        queue('MJ_BizApps_Orders: Charge Types', [{ ID: 'type-tax' }]);
        queue('MJ_BizApps_Orders: Order Charge Allocations', [{ OrderChargeID: 'charge-tax' }, { OrderChargeID: 'charge-ship' }]);
        queue('MJ_BizApps_Orders: Order Charges', []); // no zero-amount tax rows
        queue('MJ_BizApps_Orders: Order Charges', [row('charge-tax', deleted)]);
        queue('MJ_BizApps_Orders: Order Charge Allocations', [row('alloc-tax', deleted)]);

        await DeleteTaxCharges('order-1', ['line-1'], {} as never, {} as never);

        expect(deleted).toEqual(['alloc-tax', 'charge-tax']);
        const chargeFilter = views[3].params.ExtraFilter ?? '';
        expect(chargeFilter).toContain(`OrderHeaderID = 'order-1'`);
        expect(chargeFilter).toContain(`ChargeTypeID IN ('type-tax')`);
        expect(views[1].params.ExtraFilter).toBe(`OrderLineID IN ('line-1')`);
    });

    it('also removes a zero tax charge no line leads to — a waiver, or a zero rate', async () => {
        const deleted: string[] = [];
        queue('MJ_BizApps_Orders: Charge Types', [{ ID: 'type-tax' }]);
        queue('MJ_BizApps_Orders: Order Charge Allocations', []);
        queue('MJ_BizApps_Orders: Order Charges', [{ ID: 'charge-waived' }]);
        queue('MJ_BizApps_Orders: Order Charge Allocations', []);
        queue('MJ_BizApps_Orders: Order Charges', [row('charge-waived', deleted)]);
        queue('MJ_BizApps_Orders: Order Charge Allocations', []);

        await DeleteTaxCharges('order-1', ['line-1'], {} as never, {} as never);

        expect(deleted).toEqual(['charge-waived']);
        expect(views[2].params.ExtraFilter).toContain('Amount = 0');
    });

    it('reads nothing for a save that priced no lines', async () => {
        await DeleteTaxCharges('order-1', [], {} as never, {} as never);
        expect(views).toEqual([]);
    });

    it('stops when the lines carry no charge rows yet — a first save', async () => {
        queue('MJ_BizApps_Orders: Charge Types', [{ ID: 'type-tax' }]);
        queue('MJ_BizApps_Orders: Order Charge Allocations', []);
        queue('MJ_BizApps_Orders: Order Charges', []);

        await DeleteTaxCharges('order-1', ['line-1'], {} as never, {} as never);

        expect(views.every((v) => v.params.ExtraFilter !== undefined)).toBe(true);
    });

    it('refuses rather than leaving half the old tax behind', async () => {
        queue('MJ_BizApps_Orders: Charge Types', [{ ID: 'type-tax' }]);
        queue('MJ_BizApps_Orders: Order Charge Allocations', [{ OrderChargeID: 'charge-tax' }]);
        queue('MJ_BizApps_Orders: Order Charges', []);
        queue('MJ_BizApps_Orders: Order Charges', [{ ID: 'charge-tax', Delete: async () => true }]);
        queue('MJ_BizApps_Orders: Order Charge Allocations', [
            { ID: 'alloc-tax', Delete: async () => false, LatestResult: { CompleteMessage: 'locked' } },
        ]);

        await expect(DeleteTaxCharges('order-1', ['line-1'], {} as never, {} as never)).rejects.toThrow(/locked/);
    });
});

type Line = { ProductID: string; Quantity: number; UnitPrice: number; LineTax: number; ChargeAmount: number };
type Walk = {
    ctx: Record<string, unknown>;
    out: { TaxReasons: Map<number, string> };
    resolveTaxCharges: () => Promise<unknown[]>;
    resolvedExtendedFor: () => number | null;
    decideCharges: () => Promise<unknown>;
};

function walk(lines: Line[], resolved: unknown[]): Walk {
    const w = new OrderPricingService({ Provider: {} as never, User: {} as never }) as unknown as Walk;
    w.ctx = { CompanyID: 'co-1', Lines: lines, Charges: [] };
    w.out = { TaxReasons: new Map() };
    w.resolveTaxCharges = vi.fn(async () => resolved);
    w.resolvedExtendedFor = () => null;
    return w;
}

describe('OrderPricingService.decideCharges — LineTax follows this walk', () => {
    it('sets each line to the tax this walk decided', async () => {
        const line: Line = { ProductID: 'p', Quantity: 3, UnitPrice: 100, LineTax: 27.38, ChargeAmount: 0 };
        mockRunCharges.mockResolvedValue({
            Charges: [{ Request: { Category: 'Tax' }, Allocations: [{ LineID: '0', Amount: 27.38 }] }],
        });

        await walk([line], [{ Code: 'SalesTax', TargetLineID: '0', Rate: 0.09125 }]).decideCharges();

        expect(line.LineTax).toBe(27.38);
    });

    it('clears tax a saved draft carried when this walk finds none', async () => {
        const line: Line = { ProductID: 'p', Quantity: 3, UnitPrice: 100, LineTax: 27.38, ChargeAmount: 5 };

        const result = await walk([line], []).decideCharges();

        expect(result).toBeNull();
        expect(line.LineTax).toBe(0);
        expect(line.ChargeAmount).toBe(5);
    });
});
