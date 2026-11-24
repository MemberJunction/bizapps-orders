/**
 * Orders.RefundPayment issues a refund only against an approved request while refund approval is on
 * (bc-aidp-next-golive#355), checked before Preview and before any write, and marks the request Issued
 * inside the refund's transaction. No database.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const PAYMENT = 'AAAAAAAA-0000-0000-0000-000000000001';
const COMPANY = 'BBBBBBBB-0000-0000-0000-000000000001';
const CALLER = 'CCCCCCCC-0000-0000-0000-000000000001';

const h = vi.hoisted(() => ({
    threshold: null as number | null,
    openRequest: null as null | { ID: string; Amount: number; RequestedByUserID: string; Status: string },
    openRequestCalls: 0,
    loadAllocations: vi.fn(async () => [] as unknown[]),
    beginTransaction: vi.fn(async () => undefined),
    commitTransaction: vi.fn(async () => undefined),
    rollbackTransaction: vi.fn(async () => undefined),
    markIssued: vi.fn(async () => undefined),
}));

// The finance gate (bc-aidp-next-golive#454) has its own tests; these drive what comes after it.
vi.mock('../ReversalAuthority.js', () => ({ ReversalGate: () => null, WithGatewayRecord: (fn: () => Promise<unknown>) => fn() }));
vi.mock('../OrdersSettings.js', () => ({
    OrdersSettings: {
        Load: vi.fn(async () => undefined),
        get RefundApprovalThreshold() {
            return h.threshold;
        },
    },
}));
vi.mock('@memberjunction/generic-database-provider', () => ({ UserCache: { Instance: { GetSystemUser: () => ({ ID: 'SYSTEM' }) } } }));
vi.mock('../RefundRequest.js', () => ({
    OpenRefundRequestFor: vi.fn(async () => {
        h.openRequestCalls++;
        return h.openRequest;
    }),
    MarkRefundRequestIssued: h.markIssued,
}));

vi.mock('../PaymentReversalFactory.js', () => ({
    LoadAppliedAllocations: h.loadAllocations,
    BuildUnapplyLines: vi.fn(async () => []),
    CreateReversingPayment: vi.fn(async () => ({ ID: 'REFUND-1', Number: 'PAY-000099', JournalEntryID: null })),
}));

vi.mock('@mj-biz-apps/orders-entities', () => ({
    OrdersRefundPaymentOperation: class {},
    RequireUUID: (v: string) => v,
}));

vi.mock('@memberjunction/global', () => ({ RegisterClass: () => () => {}, UUIDsEqual: (a?: string, b?: string) => !!a && !!b && a.toLowerCase() === b.toLowerCase() }));

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
function run(input: Parameters<Execute>[0], userID = CALLER) {
    const op = new RefundPaymentOperation() as unknown as { InternalExecute: (i: unknown, p: unknown, u: unknown) => ReturnType<Execute> };
    const provider = { BeginTransaction: h.beginTransaction, CommitTransaction: h.commitTransaction, RollbackTransaction: h.rollbackTransaction };
    return op.InternalExecute(input, provider, { ID: userID });
}

const approved = (amount = 250) => ({ ID: 'REQ-1', Amount: amount, RequestedByUserID: CALLER, Status: 'Approved' });

describe('Orders.RefundPayment — refund approval', () => {
    beforeEach(() => {
        h.threshold = null;
        h.openRequest = null;
        h.openRequestCalls = 0;
        h.loadAllocations.mockReset().mockResolvedValue([]);
        h.beginTransaction.mockClear();
        h.markIssued.mockClear();
    });

    it('reads no request while approval is off', async () => {
        const out = await run({ PaymentHeaderID: PAYMENT, Amount: 250 });
        expect(h.openRequestCalls).toBe(0);
        expect(out.Message).toMatch(/not applied to any order/);
    });

    it('refuses without an approved request and writes nothing', async () => {
        h.threshold = 500;
        const out = await run({ PaymentHeaderID: PAYMENT, Amount: 250 });
        expect(out).toEqual({ Success: false, Message: expect.stringMatching(/Refunds need approval first/), RemainingRefundable: 700 });
        expect(h.loadAllocations).not.toHaveBeenCalled();
        expect(h.beginTransaction).not.toHaveBeenCalled();
    });

    it('refuses in Preview too, so a confirmation screen shows it', async () => {
        h.threshold = 500;
        const out = await run({ PaymentHeaderID: PAYMENT, Preview: true });
        expect(out.Success).toBe(false);
    });

    it('refuses the approver issuing someone else\'s approved refund', async () => {
        h.threshold = 500;
        h.openRequest = approved();
        const out = await run({ PaymentHeaderID: PAYMENT, Amount: 250 }, 'DDDDDDDD-0000-0000-0000-000000000001');
        expect(out.Message).toMatch(/issued by the person who requested it/);
    });

    it('does not check approval for a refund the amount checks already refuse', async () => {
        h.threshold = 500;
        const out = await run({ PaymentHeaderID: PAYMENT, Amount: 5000 });
        expect(out.Message).toMatch(/only 700 remains refundable/);
        expect(h.openRequestCalls).toBe(0);
    });

    it('exempts a gateway refund booked by the system user', async () => {
        h.threshold = 500;
        const out = await run({ PaymentHeaderID: PAYMENT, Amount: 250, ProviderRefundID: 're_1' }, 'SYSTEM');
        expect(h.openRequestCalls).toBe(0);
        expect(out.Message).toMatch(/not applied to any order/);
    });

    it('issues the approved refund and marks the request Issued inside the transaction', async () => {
        h.threshold = 500;
        h.openRequest = approved();
        h.loadAllocations.mockResolvedValue([{ OrderHeaderID: 'O1', Amount: 1000 }]);
        const out = await run({ PaymentHeaderID: PAYMENT, Amount: 250 });
        expect(out.Success).toBe(true);
        expect(h.markIssued).toHaveBeenCalledWith('REQ-1', 'REFUND-1', expect.anything(), expect.anything());
        expect(h.markIssued.mock.invocationCallOrder[0]).toBeLessThan(h.commitTransaction.mock.invocationCallOrder.at(-1) ?? 0);
    });
});
