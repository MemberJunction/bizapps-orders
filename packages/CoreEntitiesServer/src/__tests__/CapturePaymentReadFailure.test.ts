/**
 * A capture whose READ fails is retryable; one whose read SUCCEEDS and finds nothing is not (#967).
 *
 * `CapturePaymentOperation` read the orders it allocates to and refused every id the read did not
 * return as `OrderNotFound`, without checking `Success`. A read that timed out waiting on another
 * transaction's lock therefore said "Order … does not exist." with a code
 * `checkoutCaptureRetry.ts` classes as terminal, and a charged buyer was left with no payment
 * booked. Boston's SR53 run on #947 is the case on record.
 *
 * What these tests hold, each one against the real operation with only `RunView` and the orders
 * engine replaced:
 *   - a FAILED read (Success false, or a throw) of the orders, of the tender, or of the payment it
 *     reads back is a read-failure blocker, and the checkout's classifier calls it retryable;
 *   - a read that SUCCEEDS with no rows keeps its terminal code (the control: a missing order is
 *     still missing);
 *   - before `OrderNotFound` the missing ids, and only those, are read once more past the cache,
 *     and an order the second read finds is captured;
 *   - a capture that cannot read its payment back rolls the payment back rather than committing a
 *     payment it reports as failed.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface ViewParams {
    EntityName: string;
    ExtraFilter?: string;
    BypassCache?: boolean;
}
type ViewAnswer = { Success: boolean; Results?: unknown[]; ErrorMessage?: string };

const mocks = vi.hoisted(() => ({
    /** Every RunView the operation issued, in order. */
    calls: [] as ViewParams[],
    /** Answers a RunView. Tests replace it; the default succeeds with no rows. */
    answer: (_p: ViewParams): ViewAnswer | Promise<ViewAnswer> => ({ Success: true, Results: [] }),
    /** What the orders engine's tender cache holds. */
    tender: undefined as undefined | { ID: string; Code: string; IsActive: boolean; IsReversal: boolean },
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        RunView: class {
            RunView = vi.fn().mockImplementation(async (params: ViewParams) => {
                mocks.calls.push(params);
                return mocks.answer(params);
            });
        },
    };
});

vi.mock('@mj-biz-apps/orders-entities', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@mj-biz-apps/orders-entities')>();
    return {
        ...actual,
        LoadOrdersEngine: vi.fn().mockResolvedValue(undefined),
        OrdersEngine: { Instance: { PaymentTypeByCode: () => mocks.tender } },
    };
});

import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { OrdersCapturePaymentInput, OrdersCapturePaymentOutput } from '@mj-biz-apps/orders-entities';
import { CapturePaymentOperation } from '../CapturePaymentOperation.js';
import { TERMINAL_CAPTURE_BLOCKER_CODES, isCaptureRefusalRetryable } from '../checkoutCaptureRetry.js';

const COMPANY = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const ORG = '3f2504e0-4f89-41d3-9a0c-0305e82c3302';
const ORDER_A = '3f2504e0-4f89-41d3-9a0c-0305e82c3303';
const ORDER_B = '3f2504e0-4f89-41d3-9a0c-0305e82c3304';
const PAYMENT = '3f2504e0-4f89-41d3-9a0c-0305e82c3305';
const TENDER = { ID: '3f2504e0-4f89-41d3-9a0c-0305e82c3306', Code: 'Cash', IsActive: true, IsReversal: false };
const TIMEOUT = 'Timeout: Request failed to complete in 60000ms';

const ORDERS = 'Order Headers';
const TYPES = 'Payment Types';
const HEADERS = 'Payment Headers';

const orderRow = (id: string) => ({ ID: id, OrderNumber: `ORD-${id.slice(-4)}`, CompanyID: COMPANY, Status: 'Confirmed' });
const idsIn = (p: ViewParams): string[] => [...(p.ExtraFilter ?? '').matchAll(/'([0-9a-f-]{36})'/gi)].map((m) => m[1].toLowerCase());
const callsTo = (fragment: string) => mocks.calls.filter((c) => c.EntityName.includes(fragment));

const input = (orders: string[] = [ORDER_A], extra: Partial<OrdersCapturePaymentInput> = {}): OrdersCapturePaymentInput =>
    ({
        ReceivingCompanyID: COMPANY,
        BillToOrganizationID: ORG,
        TenderCode: 'Cash',
        Amount: 10 * orders.length,
        Allocations: orders.map((id) => ({ OrderHeaderID: id, Amount: 10 })),
        ...extra,
    }) as unknown as OrdersCapturePaymentInput;

function makeProvider() {
    return {
        BeginTransaction: vi.fn().mockResolvedValue(undefined),
        CommitTransaction: vi.fn().mockResolvedValue(undefined),
        RollbackTransaction: vi.fn().mockResolvedValue(undefined),
    };
}

type Internals = {
    InternalExecute(i: OrdersCapturePaymentInput, p: IMetadataProvider, u: UserInfo): Promise<OrdersCapturePaymentOutput>;
    writePayment: (...args: unknown[]) => Promise<string>;
    readEntries: (...args: unknown[]) => Promise<unknown[]>;
};

/** The real operation, with the write itself (entity saves) stubbed so a test reaches the reads around it. */
function makeOp() {
    const op = new CapturePaymentOperation() as unknown as Internals;
    const write = vi.fn().mockResolvedValue(PAYMENT);
    op.writePayment = write;
    op.readEntries = vi.fn().mockResolvedValue([]);
    return { op, write };
}

async function run(i: OrdersCapturePaymentInput) {
    const { op, write } = makeOp();
    const provider = makeProvider();
    const out = await op.InternalExecute(i, provider as unknown as IMetadataProvider, { ID: 'user-1' } as unknown as UserInfo);
    return { out, write, provider, codes: (out.Blockers ?? []).map((b) => b.Code ?? '') };
}

/** The payment read-back, answered as a booked payment. */
const paymentRow = { ID: PAYMENT, PaymentNumber: 'PAY-000001', Status: 'Captured', Amount: 10, ProcessingFeeAmount: 0, NetAmount: 10 };

beforeEach(() => {
    mocks.calls = [];
    mocks.tender = TENDER;
    mocks.answer = (p) => {
        if (p.EntityName.includes(ORDERS)) return { Success: true, Results: idsIn(p).map(orderRow) };
        if (p.EntityName.includes(HEADERS)) return { Success: true, Results: p.ExtraFilter?.startsWith('ID =') ? [paymentRow] : [] };
        return { Success: true, Results: [] };
    };
});

describe('the order read (step 4)', () => {
    it('a FAILED read is OrderReadFailed, carrying the read error, and the checkout retries it', async () => {
        mocks.answer = (p) => (p.EntityName.includes(ORDERS) ? { Success: false, Results: [], ErrorMessage: TIMEOUT } : { Success: true, Results: [] });
        const { out, write, codes } = await run(input());
        expect(out.Success).toBe(false);
        expect(codes).toEqual(['OrderReadFailed']);
        expect(out.Blockers?.[0]?.Message).toContain(TIMEOUT);
        expect(out.Message).not.toMatch(/does not exist/);
        expect(isCaptureRefusalRetryable(codes)).toBe(true);
        expect(write).not.toHaveBeenCalled();
    });

    it('a read that THROWS is OrderReadFailed too', async () => {
        mocks.answer = (p) => {
            if (p.EntityName.includes(ORDERS)) throw new Error('Connection lost - read ECONNRESET');
            return { Success: true, Results: [] };
        };
        const { codes, out, write } = await run(input());
        expect(codes).toEqual(['OrderReadFailed']);
        expect(out.Blockers?.[0]?.Message).toContain('ECONNRESET');
        expect(isCaptureRefusalRetryable(codes)).toBe(true);
        expect(write).not.toHaveBeenCalled();
    });

    it('CONTROL: a read that succeeds with no rows is still OrderNotFound, terminal, after one re-read', async () => {
        mocks.answer = (p) => (p.EntityName.includes(ORDERS) ? { Success: true, Results: [] } : { Success: true, Results: [] });
        const { codes, out, write } = await run(input());
        expect(codes).toEqual(['OrderNotFound']);
        expect(out.Message).toMatch(/does not exist/);
        expect(isCaptureRefusalRetryable(codes)).toBe(false);
        expect(write).not.toHaveBeenCalled();
        const reads = callsTo(ORDERS);
        expect(reads).toHaveLength(2);
        expect(reads[1].BypassCache).toBe(true);
    });

    it('an order the first read misses and the re-read finds is captured', async () => {
        let orderReads = 0;
        mocks.answer = (p) => {
            if (p.EntityName.includes(ORDERS)) return { Success: true, Results: ++orderReads === 1 ? [] : idsIn(p).map(orderRow) };
            if (p.EntityName.includes(HEADERS)) return { Success: true, Results: p.ExtraFilter?.startsWith('ID =') ? [paymentRow] : [] };
            return { Success: true, Results: [] };
        };
        const { out, write, provider } = await run(input());
        expect(out.Success).toBe(true);
        expect(out.PaymentHeaderID).toBe(PAYMENT);
        expect(write).toHaveBeenCalledTimes(1);
        expect(provider.CommitTransaction).toHaveBeenCalledTimes(1);
    });

    it('re-reads ONLY the ids the first read did not return, once', async () => {
        let orderReads = 0;
        mocks.answer = (p) => {
            if (p.EntityName.includes(ORDERS)) {
                orderReads++;
                return { Success: true, Results: idsIn(p).filter((id) => orderReads > 1 || id === ORDER_A.toLowerCase()).map(orderRow) };
            }
            if (p.EntityName.includes(HEADERS)) return { Success: true, Results: p.ExtraFilter?.startsWith('ID =') ? [paymentRow] : [] };
            return { Success: true, Results: [] };
        };
        const { out } = await run(input([ORDER_A, ORDER_B]));
        expect(out.Success).toBe(true);
        const reads = callsTo(ORDERS);
        expect(reads).toHaveLength(2);
        expect(idsIn(reads[1])).toEqual([ORDER_B.toLowerCase()]);
    });

    it('a re-read that FAILS is OrderReadFailed, not OrderNotFound', async () => {
        let orderReads = 0;
        mocks.answer = (p) => {
            if (p.EntityName.includes(ORDERS)) return ++orderReads === 1 ? { Success: true, Results: [] } : { Success: false, ErrorMessage: TIMEOUT };
            return { Success: true, Results: [] };
        };
        const { codes } = await run(input());
        expect(codes).toEqual(['OrderReadFailed']);
        expect(isCaptureRefusalRetryable(codes)).toBe(true);
    });

    it('a found order belonging to another company is still OrderCompanyMismatch, with no re-read', async () => {
        mocks.answer = (p) =>
            p.EntityName.includes(ORDERS)
                ? { Success: true, Results: idsIn(p).map((id) => ({ ...orderRow(id), CompanyID: ORG })) }
                : { Success: true, Results: [] };
        const { codes } = await run(input());
        expect(codes).toEqual(['OrderCompanyMismatch']);
        expect(callsTo(ORDERS)).toHaveLength(1);
    });
});

describe('the tender (step 3)', () => {
    it('an engine miss is checked against the table, and a FAILED read is TenderReadFailed, retryable', async () => {
        mocks.tender = undefined;
        const base = mocks.answer;
        mocks.answer = (p) => (p.EntityName.includes(TYPES) ? { Success: false, ErrorMessage: TIMEOUT } : base(p));
        const { codes, out, write } = await run(input());
        expect(codes).toEqual(['TenderReadFailed']);
        expect(out.Blockers?.[0]?.Message).toContain(TIMEOUT);
        expect(isCaptureRefusalRetryable(codes)).toBe(true);
        expect(write).not.toHaveBeenCalled();
    });

    it('CONTROL: an engine miss the table confirms is UnknownTender, terminal', async () => {
        mocks.tender = undefined;
        const { codes } = await run(input());
        expect(codes).toEqual(['UnknownTender']);
        expect(isCaptureRefusalRetryable(codes)).toBe(false);
        expect(callsTo(TYPES)).toHaveLength(1);
        expect(callsTo(TYPES)[0].BypassCache).toBe(true);
    });

    it('a tender the engine has not loaded but the table holds is used', async () => {
        mocks.tender = undefined;
        const base = mocks.answer;
        mocks.answer = (p) => (p.EntityName.includes(TYPES) ? { Success: true, Results: [TENDER] } : base(p));
        const { out, write } = await run(input());
        expect(out.Success).toBe(true);
        expect(write.mock.calls[0][1]).toMatchObject({ paymentTypeID: TENDER.ID });
    });

    it('an engine hit reads no table', async () => {
        await run(input());
        expect(callsTo(TYPES)).toHaveLength(0);
    });
});

describe('the payment read-back (project)', () => {
    it('a FAILED read-back is PaymentReadFailed, retryable, and the payment is rolled back, not committed', async () => {
        const base = mocks.answer;
        mocks.answer = (p) => (p.EntityName.includes(HEADERS) && p.ExtraFilter?.startsWith('ID =') ? { Success: false, ErrorMessage: TIMEOUT } : base(p));
        const { codes, out, provider } = await run(input());
        expect(out.Success).toBe(false);
        expect(codes).toEqual(['PaymentReadFailed']);
        expect(isCaptureRefusalRetryable(codes)).toBe(true);
        expect(provider.CommitTransaction).not.toHaveBeenCalled();
        expect(provider.RollbackTransaction).toHaveBeenCalledTimes(1);
    });

    it('CONTROL: a read-back that succeeds with no row is still PaymentNotFound, and is rolled back too', async () => {
        const base = mocks.answer;
        mocks.answer = (p) => (p.EntityName.includes(HEADERS) && p.ExtraFilter?.startsWith('ID =') ? { Success: true, Results: [] } : base(p));
        const { codes, provider } = await run(input());
        expect(codes).toEqual(['PaymentNotFound']);
        expect(isCaptureRefusalRetryable(codes)).toBe(false);
        expect(provider.CommitTransaction).not.toHaveBeenCalled();
    });

    it('a repeat found by its idempotency key whose read-back FAILS is PaymentReadFailed', async () => {
        mocks.answer = (p) => {
            if (p.EntityName.includes(HEADERS)) {
                return p.ExtraFilter?.startsWith('IdempotencyKey') ? { Success: true, Results: [{ ID: PAYMENT }] } : { Success: false, ErrorMessage: TIMEOUT };
            }
            return { Success: true, Results: [] };
        };
        const { codes, write } = await run(input([ORDER_A], { IdempotencyKey: 'checkout-complete:abc' } as Partial<OrdersCapturePaymentInput>));
        expect(codes).toEqual(['PaymentReadFailed']);
        expect(write).not.toHaveBeenCalled();
    });
});

describe('the read-failure codes and the checkout classifier', () => {
    it('none is terminal', () => {
        for (const code of ['OrderReadFailed', 'TenderReadFailed', 'PaymentReadFailed']) {
            expect(TERMINAL_CAPTURE_BLOCKER_CODES.has(code)).toBe(false);
            expect(isCaptureRefusalRetryable([code])).toBe(true);
        }
    });
});
