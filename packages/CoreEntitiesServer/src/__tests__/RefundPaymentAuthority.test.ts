/**
 * Orders.RefundPayment consults the refund authority (bc-aidp-next-golive#320 §3) before Preview and
 * before any write, with what the payment's refunds would come to. No database.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const PAYMENT = 'AAAAAAAA-0000-0000-0000-000000000001';
const COMPANY = 'BBBBBBBB-0000-0000-0000-000000000001';

const h = vi.hoisted(() => ({
    refusal: null as string | null,
    authorityCalls: [] as Array<{ PaymentNumber: string; ReceivingCompanyID: string; RefundedTotalAfter: number; ProviderRefundID?: string | null }>,
    loadAllocations: vi.fn(async () => [] as unknown[]),
    beginTransaction: vi.fn(async () => undefined),
}));

vi.mock('../RefundAuthority.js', () => ({
    CheckRefundAuthority: vi.fn(async (request: (typeof h.authorityCalls)[number]) => {
        h.authorityCalls.push(request);
        return h.refusal;
    }),
}));

vi.mock('../PaymentReversalFactory.js', () => ({
    LoadAppliedAllocations: h.loadAllocations,
    BuildUnapplyLines: vi.fn(),
    CreateReversingPayment: vi.fn(),
}));

vi.mock('@mj-biz-apps/orders-entities', () => ({
    OrdersRefundPaymentOperation: class {},
    RequireUUID: (v: string) => v,
}));

vi.mock('@memberjunction/global', () => ({ RegisterClass: () => () => {} }));

vi.mock('@memberjunction/core', () => ({
    BaseRemotableOperation: class {},
    LogError: vi.fn(),
    RunView: class {
        async RunView(p: { ExtraFilter: string }) {
            if (p.ExtraFilter.startsWith('ReversesPaymentHeaderID')) return { Success: true, Results: [{ Amount: -300 }] };
            return {
                Success: true,
                Results: [{ ID: PAYMENT, PaymentNumber: 'PAY-000008', ReceivingCompanyID: COMPANY, Amount: 1000, ProcessingFeeAmount: 0, Status: 'Captured' }],
            };
        }
    },
}));

const { RefundPaymentOperation } = await import('../RefundPaymentOperation.js');

type Execute = (input: { PaymentHeaderID: string; Amount?: number; Preview?: boolean; ProviderRefundID?: string }) => Promise<{ Success: boolean; Message?: string; RemainingRefundable?: number }>;
function run(input: Parameters<Execute>[0]) {
    const op = new RefundPaymentOperation() as unknown as { InternalExecute: (i: unknown, p: unknown, u: unknown) => ReturnType<Execute> };
    return op.InternalExecute(input, { BeginTransaction: h.beginTransaction }, { ID: 'user-1' });
}

describe('Orders.RefundPayment — refund authority', () => {
    beforeEach(() => {
        h.refusal = null;
        h.authorityCalls = [];
        h.loadAllocations.mockClear();
        h.beginTransaction.mockClear();
    });

    it('passes the payment\'s refunds including this one, and the gateway refund id', async () => {
        await run({ PaymentHeaderID: PAYMENT, Amount: 250, ProviderRefundID: 're_1' });
        expect(h.authorityCalls).toEqual([{ PaymentNumber: 'PAY-000008', ReceivingCompanyID: COMPANY, RefundedTotalAfter: 550, ProviderRefundID: 're_1' }]);
    });

    it('returns the refusal and writes nothing', async () => {
        h.refusal = 'Issuing a refund needs the role.';
        const out = await run({ PaymentHeaderID: PAYMENT, Amount: 250 });
        expect(out).toEqual({ Success: false, Message: 'Issuing a refund needs the role.', RemainingRefundable: 700 });
        expect(h.loadAllocations).not.toHaveBeenCalled();
        expect(h.beginTransaction).not.toHaveBeenCalled();
    });

    it('refuses in Preview too, so the confirmation screen shows it', async () => {
        h.refusal = 'Only the company approver may issue this refund.';
        const out = await run({ PaymentHeaderID: PAYMENT, Preview: true });
        expect(out.Success).toBe(false);
        expect(h.authorityCalls[0].RefundedTotalAfter).toBe(1000);
    });

    it('does not consult the authority for a refund the amount checks already refuse', async () => {
        const out = await run({ PaymentHeaderID: PAYMENT, Amount: 5000 });
        expect(out.Success).toBe(false);
        expect(out.Message).toMatch(/only 700 remains refundable/);
        expect(h.authorityCalls).toEqual([]);
    });

    it('continues to the existing checks when the authority allows it', async () => {
        const out = await run({ PaymentHeaderID: PAYMENT, Amount: 250 });
        expect(h.loadAllocations).toHaveBeenCalled();
        expect(out.Message).toMatch(/not applied to any order/);
    });
});
