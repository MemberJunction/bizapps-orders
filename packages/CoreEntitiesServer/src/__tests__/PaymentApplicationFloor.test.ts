/**
 * The application floor (D20, 30 Oct): an order's applied total may go below zero only by the credit the order itself
 * carries (a return or credit memo worth less than nothing). Cash is still never un-applied past what was applied.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ order: {} as Record<string, unknown>, lines: [] as Array<{ ID: string; Amount: number }> }));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        RunView: class {
            async RunView(p: { EntityName: string }) {
                if (p.EntityName.endsWith('Order Headers')) return { Success: true, Results: [db.order] };
                return { Success: true, Results: db.lines };
            }
        },
    };
});

const { PaymentLineEntityServer } = await import('../PaymentLineEntityServer.js');

const ORDER = '11111111-0000-4000-8000-0000000000a1';

async function check(amount: number): Promise<string | null> {
    const line = Object.create(PaymentLineEntityServer.prototype) as Record<string, unknown>;
    for (const [k, v] of Object.entries({ OrderHeaderID: ORDER, Amount: amount, ID: null, ProviderToUse: {}, ContextCurrentUser: {} })) {
        Object.defineProperty(line, k, { value: v });
    }
    return (line as unknown as { checkApplicationTotal(): Promise<string | null> }).checkApplicationTotal();
}

beforeEach(() => {
    db.lines = [];
});

describe('the application floor', () => {
    it('a credit order worth -599 (nothing paid): spending its whole credit (-599) is allowed', async () => {
        db.order = { ID: ORDER, OrderNumber: 'ORD-CR', TotalGross: -599, Balance: -599, AmountPaid: 0 };
        expect(await check(-599)).toBeNull();
    });
    it('…but not a cent more than it carries', async () => {
        db.order = { ID: ORDER, OrderNumber: 'ORD-CR', TotalGross: -599, Balance: -599, AmountPaid: 0 };
        expect(await check(-599.01)).toMatch(/carries 599 of credit, so there is nothing more to un-apply/);
    });
    it('…nor again once spent (-599 already applied)', async () => {
        db.order = { ID: ORDER, OrderNumber: 'ORD-CR', TotalGross: -599, Balance: 0, AmountPaid: -599 };
        db.lines = [{ ID: 'pl-1', Amount: -599 }];
        expect(await check(-1)).toMatch(/nothing more to un-apply/);
    });
    it('a PARTLY spent credit (Balance -299, 300 already applied): the remaining 299 spends (value = Balance + AmountPaid, not Balance)', async () => {
        db.order = { ID: ORDER, OrderNumber: 'ORD-CR', TotalGross: -599, Balance: -299, AmountPaid: -300 };
        db.lines = [{ ID: 'pl-1', Amount: -300 }];
        expect(await check(-299)).toBeNull();
        expect(await check(-299.01)).toMatch(/nothing more to un-apply/);
    });
    it('a 1,000 return that booked a 600 credit memo: 600 spends, not 1,000 (the value, not TotalGross)', async () => {
        db.order = { ID: ORDER, OrderNumber: 'ORD-RT', TotalGross: -1000, Balance: -600, AmountPaid: 0 };
        expect(await check(-600)).toBeNull();
        expect(await check(-601)).toMatch(/carries 600 of credit/);
    });
    it('control: an ordinary order (worth 599, 599 paid) still refuses un-applying more cash than was applied', async () => {
        db.order = { ID: ORDER, OrderNumber: 'ORD-1', TotalGross: 599, Balance: 0, AmountPaid: 599 };
        db.lines = [{ ID: 'pl-1', Amount: 599 }];
        expect(await check(-599)).toBeNull();
        expect(await check(-600)).toMatch(/Only 599 has ever been applied, so there is nothing more to un-apply/);
    });
    it('control: an order worth 0 with nothing paid refuses any negative application', async () => {
        db.order = { ID: ORDER, OrderNumber: 'ORD-0', TotalGross: 0, Balance: 0, AmountPaid: 0 };
        expect(await check(-1)).toMatch(/nothing more to un-apply/);
    });
});
