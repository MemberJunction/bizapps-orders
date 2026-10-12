/**
 * What a change of a confirmed order's payment terms is checked against, and how it is applied (#309).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const rows = vi.hoisted(() => ({ byEntity: new Map<string, Record<string, unknown>[]>(), filters: [] as string[] }));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        RunView: class {
            async RunView(params: { EntityName: string; ExtraFilter: string }) {
                rows.filters.push(params.ExtraFilter);
                return { Success: true, Results: rows.byEntity.get(params.EntityName) ?? [] };
            }
        },
    };
});

class FakeOrderEntityServer {
    OrderNumber = 'ORD-7';
    OrderDate: Date | string = '2026-07-01';
    PaymentTermsTypeID: string | null = NET30;
    DueDate: Date | null = null;
    LatestResult = { CompleteMessage: 'refused' };
    Load = vi.fn().mockResolvedValue(true);
    Save = vi.fn().mockResolvedValue(true);
}
vi.mock('../OrderEntityServer.js', () => ({ OrderEntityServer: FakeOrderEntityServer }));

const sanction = vi.hoisted(() => ({ GrantPaymentTermsChange: vi.fn() }));
vi.mock('../PaymentTermsSanction.js', () => sanction);

const NET30 = '11111111-1111-4111-8111-111111111111';
const NET60 = '22222222-2222-4222-8222-222222222222';
const ORDER = '33333333-3333-4333-8333-333333333333';

const { ApplyTermsChange, CheckTermsChange } = await import('../PaymentTermsChange.js');

function world(opts: { status?: string; terms?: string | null; newActive?: boolean; pending?: boolean } = {}) {
    rows.byEntity.set('MJ_BizApps_Orders: Order Headers', [
        {
            ID: ORDER,
            OrderNumber: 'ORD-7',
            Status: opts.status ?? 'Confirmed',
            OrderDate: '2026-07-01',
            DueDate: '2026-07-31',
            PaymentTermsTypeID: opts.terms === undefined ? NET30 : opts.terms,
        },
    ]);
    rows.byEntity.set('MJ_BizApps_Orders: Payment Terms Types', [
        { ID: NET30, Name: 'Net 30', NetDays: 30, IsActive: true },
        { ID: NET60, Name: 'Net 60', NetDays: 60, IsActive: opts.newActive ?? true },
    ]);
    rows.byEntity.set('MJ_BizApps_Orders: Order Concessions', opts.pending ? [{ ID: 'pending-1' }] : []);
}

const ctx = { Provider: {} as never, User: { ID: 'user-1' } as never };
const request = { OrderHeaderID: ORDER, NewPaymentTermsTypeID: NET60 };

afterEach(() => {
    rows.byEntity.clear();
    rows.filters.length = 0;
    vi.clearAllMocks();
});

describe('CheckTermsChange', () => {
    it('reports the prior and new terms, the change in days and the new due date', async () => {
        world();
        expect(await CheckTermsChange(request, ctx)).toEqual({
            OrderHeaderID: ORDER,
            OrderNumber: 'ORD-7',
            PriorPaymentTermsTypeID: NET30,
            PriorTermsName: 'Net 30',
            NewPaymentTermsTypeID: NET60,
            NewTermsName: 'Net 60',
            DaysChange: 30,
            CurrentDueDate: '2026-07-31',
            NewDueDate: '2026-08-30',
        });
    });

    it('treats an order with no terms as due on receipt', async () => {
        world({ terms: null });
        const checked = await CheckTermsChange(request, ctx);
        expect(typeof checked !== 'string' && checked.DaysChange).toBe(60);
    });

    it('refuses an order that is not Confirmed', async () => {
        world({ status: 'Draft' });
        expect(await CheckTermsChange(request, ctx)).toContain('edited on the order itself');
    });

    it('refuses the terms the order already has', async () => {
        world({ terms: NET60 });
        expect(await CheckTermsChange(request, ctx)).toContain('already has these payment terms');
    });

    it('refuses inactive terms', async () => {
        world({ newActive: false });
        expect(await CheckTermsChange(request, ctx)).toBe('Payment terms Net 60 are inactive.');
    });

    it('refuses a second change while one awaits approval', async () => {
        world({ pending: true });
        expect(await CheckTermsChange(request, ctx)).toContain('already has a change of payment terms awaiting approval');
    });
});

describe('ApplyTermsChange', () => {
    function order() {
        const o = new FakeOrderEntityServer();
        (ctx.Provider as unknown as { GetEntityObject: unknown }).GetEntityObject = vi.fn().mockResolvedValue(o);
        return o;
    }

    it('changes the terms and moves the due date to the order date plus the new days, under the sanction', async () => {
        world();
        const o = order();
        await ApplyTermsChange({ OrderHeaderID: ORDER, PriorPaymentTermsTypeID: NET30, NewPaymentTermsTypeID: NET60 }, ctx);
        expect(sanction.GrantPaymentTermsChange).toHaveBeenCalledWith(o);
        expect(o.PaymentTermsTypeID).toBe(NET60);
        expect(o.DueDate?.toISOString().slice(0, 10)).toBe('2026-08-30');
        expect(o.Save).toHaveBeenCalledTimes(1);
    });

    it('refuses when the order has moved off the terms the concession was recorded against', async () => {
        world();
        const o = order();
        o.PaymentTermsTypeID = NET60;
        await expect(
            ApplyTermsChange({ OrderHeaderID: ORDER, PriorPaymentTermsTypeID: NET30, NewPaymentTermsTypeID: NET60 }, ctx),
        ).rejects.toThrow('have changed since this concession was recorded');
        expect(o.Save).not.toHaveBeenCalled();
    });

    it('throws when the order refuses the save, so the approval rolls back', async () => {
        world();
        const o = order();
        o.Save.mockResolvedValueOnce(false);
        await expect(
            ApplyTermsChange({ OrderHeaderID: ORDER, PriorPaymentTermsTypeID: NET30, NewPaymentTermsTypeID: NET60 }, ctx),
        ).rejects.toThrow("ORD-7's payment terms could not be changed: refused");
    });
});
