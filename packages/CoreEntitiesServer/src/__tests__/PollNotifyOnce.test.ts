/**
 * A payment waiting for a person is announced once, and does not fail the run (#1033).
 *
 * The whole pass runs for real — `InternalExecute`, `pollProvider` and `handlePayment` — against a
 * faked rail and a faked ledger. What decides "new" is the disposition the `ExternalPayment` row held
 * before the pass, so each case seeds that row (or none) and asserts what was sent.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const PROVIDER_ID = '11111111-2222-4333-8444-555555555555';
const SECOND_PROVIDER_ID = '22222222-2222-4333-8444-555555555555';
const COMPANY_ID = 'cccccccc-2222-4333-8444-555555555555';
const NOTIFY_USER = 'aaaaaaaa-1111-4111-8111-111111111111';
const OWNER_USER = 'bbbbbbbb-1111-4111-8111-111111111111';
const RUNNING_USER = 'dddddddd-1111-4111-8111-111111111111';

interface SeenRow {
    ID: string;
    ExternalPaymentRef: string;
    Disposition: string;
    DispositionReason: string | null;
    PaymentHeaderID: string | null;
    ExternalUpdatedAt: string | null;
}

const mocks = vi.hoisted(() => ({
    seen: [] as SeenRow[],
    payments: [] as unknown[],
    jobs: [] as unknown[],
    sends: [] as Array<{ userId: string; typeNameOrId: string; title: string; message: string; templateData?: Record<string, unknown> }>,
    sendBehaviour: 'ok' as 'ok' | 'throws' | 'refused',
    /** What `RestorePaymentRecord` rebuilds from a stored payload; null rebuilds nothing. */
    restored: null as unknown,
    /** How a second provider behaves; 'none' lists only the first. */
    secondProvider: 'none' as 'none' | 'throws' | 'fault',
}));

vi.mock('@memberjunction/notifications', () => ({
    NotificationEngine: {
        Instance: {
            Config: async () => undefined,
            SendNotification: async (params: (typeof mocks.sends)[number]) => {
                if (mocks.sendBehaviour === 'throws') throw new Error('engine down');
                mocks.sends.push(params);
                if (mocks.sendBehaviour === 'refused') return { success: false, deliveryChannels: { inApp: false, email: false, sms: false }, errors: ['Notification type not found: Payment Needs Review'] };
                return { success: true, deliveryChannels: { inApp: true, email: true, sms: false } };
            },
        },
    },
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        RunView: class {
            async RunView(params: { EntityName: string; ExtraFilter?: string }) {
                if (params.EntityName.includes('External Payments')) {
                    const reappliedOnly = params.ExtraFilter?.includes("Disposition = 'Reapplied'");
                    return { Success: true, Results: reappliedOnly ? mocks.seen.filter((r) => r.Disposition === 'Reapplied') : mocks.seen };
                }
                return { Success: true, Results: [] };
            }
        },
    };
});

vi.mock('@mj-biz-apps/orders-entities', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@mj-biz-apps/orders-entities')>();
    return { ...actual, LoadPollJobs: async () => mocks.jobs };
});

const fakeRail = {
    Config: { PaymentProviderID: PROVIDER_ID, Name: 'Test rail', TypeCode: 'BillCom', CompanyID: COMPANY_ID },
    CheckConfiguration: async () => ({ Success: true }),
    FetchPaymentsSince: async () => ({ Success: true, Value: { Payments: mocks.payments, NewWatermark: '2026-11-01T00:00:00.000Z' } }),
    RestorePaymentRecord: () => mocks.restored,
    GetInvoice: async () => ({ Success: false }),
};

vi.mock('../InvoiceRailResolver.js', () => ({
    ListPaymentSourceProviderIDs: async () => [
        { ID: PROVIDER_ID, CompanyID: COMPANY_ID },
        ...(mocks.secondProvider === 'none' ? [] : [{ ID: SECOND_PROVIDER_ID, CompanyID: COMPANY_ID }]),
    ],
    ResolveInvoiceRail: async (id: string) => {
        if (id !== SECOND_PROVIDER_ID) return fakeRail;
        if (mocks.secondProvider === 'throws') throw new Error('No invoice rail is registered for this provider');
        return {
            ...fakeRail,
            Config: { ...fakeRail.Config, PaymentProviderID: SECOND_PROVIDER_ID, Name: 'Second rail' },
            FetchPaymentsSince: async () => ({ Success: false, Reason: 'rail unreachable' }),
        };
    },
}));

import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { OrdersPollExternalPaymentsInput, OrdersPollExternalPaymentsOutput } from '@mj-biz-apps/orders-entities';
import { PollExternalPaymentsOperation } from '../PollExternalPaymentsOperation.js';
import { IsNewlyWaiting, PAYMENT_NEEDS_REVIEW_NOTIFICATION_TYPE } from '../PaymentReviewNotices.js';

const fakeProvider = {
    GetEntityObject: async () => ({
        InnerLoad: async () => true,
        NewRecord: () => undefined,
        SetMany: () => undefined,
        Save: async () => true,
        Get: () => 'row-id',
        LatestResult: undefined,
    }),
} as unknown as IMetadataProvider;

const user = { ID: RUNNING_USER } as UserInfo;

const UPDATED = '2026-10-30T12:00:00.000Z';

/** A cleared Bill.com payment applied to an invoice Orders did not issue, so it is Unmatched. */
const payment = (over: Record<string, unknown> = {}) => ({
    ExternalPaymentRef: '0rp-legacy-1',
    ExternalCustomerRef: 'cus1',
    Amount: 1250,
    UnappliedAmount: 0,
    PaymentDate: '2026-10-30',
    Status: 'PAID',
    OnlinePayment: false,
    ReceivablesType: 'CHECK',
    CurrencyCode: 'USD',
    UpdatedAt: UPDATED,
    InvoicePayments: [{ ExternalInvoiceRef: 'inv-not-ours', Amount: 1250, PaymentDate: '2026-10-30' }],
    Raw: {},
    ...over,
});

const seenRow = (Disposition: string, ExternalUpdatedAt: string = UPDATED): SeenRow => ({
    ID: 'ext-1',
    ExternalPaymentRef: '0rp-legacy-1',
    Disposition,
    DispositionReason: 'earlier pass',
    PaymentHeaderID: null,
    ExternalUpdatedAt,
});

const liveJob = (who: { NotifyUserID?: string | null; OwnerUserID?: string | null } = { NotifyUserID: NOTIFY_USER, OwnerUserID: OWNER_USER }, preview = false) => ({
    Status: 'Active',
    Configuration: JSON.stringify({ ActionID: 'B8C4D3E2-0A5F-4D72-9E3B-6F2A8C4D0B11', Params: [{ ActionParamID: 'B8C4D3E2-0A5F-4D72-9E3B-6F2A8C4D0B13', Value: String(preview) }] }),
    ...who,
});

interface Runnable {
    InternalExecute(input: OrdersPollExternalPaymentsInput, provider: IMetadataProvider, user: UserInfo): Promise<OrdersPollExternalPaymentsOutput>;
}
const run = () => (new PollExternalPaymentsOperation() as unknown as Runnable).InternalExecute({ Preview: false }, fakeProvider, user);

beforeEach(() => {
    mocks.seen = [];
    mocks.payments = [payment()];
    mocks.jobs = [liveJob()];
    mocks.sends = [];
    mocks.sendBehaviour = 'ok';
    mocks.restored = null;
    mocks.secondProvider = 'none';
});

describe('a poll that leaves payments waiting for a person', () => {
    it('succeeds and sends nothing when the waiting payment is unchanged from an earlier run', async () => {
        mocks.seen = [seenRow('Unmatched')];
        const out = await run();
        expect(out.Success).toBe(true);
        expect(out.ResultCode).toBe('ATTENTION');
        expect(out.Unmatched).toBe(1);
        expect(mocks.sends).toHaveLength(0);
        expect(out.Message).not.toContain('newly need review');
    });

    it('succeeds and sends one notification to the job\'s notify user for a newly unmatched payment', async () => {
        const out = await run();
        expect(out.Success).toBe(true);
        expect(out.ResultCode).toBe('ATTENTION');
        expect(mocks.sends).toHaveLength(1);
        const sent = mocks.sends[0];
        expect(sent.userId).toBe(NOTIFY_USER);
        expect(sent.typeNameOrId).toBe(PAYMENT_NEEDS_REVIEW_NOTIFICATION_TYPE);
        expect(sent.title).toContain('0rp-legacy-1');
        expect(sent.message).toContain('1,250.00');
        expect(sent.message).toContain('Unmatched');
        expect(sent.message).toContain('Payment exceptions');
        expect(sent.templateData).toMatchObject({ PaymentRef: '0rp-legacy-1', Amount: '1,250.00', Disposition: 'Unmatched' });
        expect(out.Message).toContain('1 payment(s) newly need review; 1 notification(s) sent.');
    });

    it('sends one notification when a waiting payment moves to a different waiting state', async () => {
        // Re-applied on the rail last run; the rail has since voided it, so it now needs reversing.
        mocks.seen = [{ ...seenRow('Reapplied', '2026-10-29T12:00:00.000Z'), PaymentHeaderID: '99999999-2222-4333-8444-555555555555' }];
        mocks.payments = [payment({ Status: 'VOID' })];
        const out = await run();
        expect(out.Success).toBe(true);
        expect(out.ReversalNeeded).toBe(1);
        expect(mocks.sends).toHaveLength(1);
        expect(mocks.sends[0].message).toContain('ReversalNeeded');
    });

    it('sends nothing for a payment still in the waiting state it already had, even when the rail touched it', async () => {
        mocks.seen = [seenRow('Unmatched', '2026-10-29T12:00:00.000Z')];
        const out = await run();
        expect(out.Success).toBe(true);
        expect(mocks.sends).toHaveLength(0);
    });

    it('falls back to the job owner, then to the user running the poll', async () => {
        mocks.jobs = [liveJob({ NotifyUserID: null, OwnerUserID: OWNER_USER })];
        await run();
        expect(mocks.sends.map((s) => s.userId)).toEqual([OWNER_USER]);

        mocks.sends = [];
        mocks.jobs = [liveJob({ NotifyUserID: null, OwnerUserID: null })];
        await run();
        expect(mocks.sends.map((s) => s.userId)).toEqual([RUNNING_USER]);
    });

    it.each([
        ['throws', 'engine down'],
        ['refused', 'the type is not seeded'],
    ] as const)('still succeeds when the notification send %s (%s), and says so', async (behaviour) => {
        mocks.sendBehaviour = behaviour;
        const out = await run();
        expect(out.Success).toBe(true);
        expect(out.ResultCode).toBe('ATTENTION');
        expect(out.Message).toContain('0 notification(s) sent, 1 failed');
    });

    it('sends one notification when a re-applied payment the rail no longer returns is re-checked into a different waiting state', async () => {
        // The rail returns nothing this pass; the open Reapplied row is rebuilt from its stored payload.
        mocks.payments = [];
        mocks.seen = [{ ...seenRow('Reapplied', '2026-10-29T12:00:00.000Z'), PaymentHeaderID: '99999999-2222-4333-8444-555555555555', Payload: '{}' } as SeenRow];
        mocks.restored = payment({ Status: 'VOID' });
        const out = await run();
        expect(out.ReversalNeeded).toBe(1);
        expect(mocks.sends).toHaveLength(1);
        expect(mocks.sends[0].message).toContain('ReversalNeeded');
    });

    it('announces what one provider collected when another provider faults', async () => {
        mocks.secondProvider = 'fault';
        const out = await run();
        expect(out.Success).toBe(false);
        expect(out.ResultCode).toBe('ERROR');
        expect(out.Message).toContain('rail unreachable');
        expect(mocks.sends).toHaveLength(1);
        expect(out.Message).toContain('1 payment(s) newly need review; 1 notification(s) sent.');
    });

    it('announces what one provider collected when another provider throws, and keeps its outcomes', async () => {
        mocks.secondProvider = 'throws';
        const out = await run();
        expect(out.Success).toBe(false);
        expect(out.ResultCode).toBe('ERROR');
        expect(out.Message).toContain('No invoice rail is registered');
        expect(out.Unmatched).toBe(1);
        expect(out.Outcomes).toHaveLength(1);
        expect(mocks.sends).toHaveLength(1);
    });

    it('sends nothing while the job is in Preview, so the first live run still announces it', async () => {
        mocks.jobs = [liveJob(undefined, true)];
        const out = await run();
        expect(out.ResultCode).toBe('PREVIEWED');
        expect(mocks.sends).toHaveLength(0);
    });
});

describe('IsNewlyWaiting', () => {
    it.each([
        [null, 'Unmatched', false, true],
        ['Held', 'Unmatched', false, true],
        ['Captured', 'ReversalNeeded', false, true],
        ['Captured', 'Reapplied', false, true],
        ['Unmatched', 'Refused', false, true],
        ['Unmatched', 'Unmatched', false, false],
        ['Reapplied', 'Reapplied', false, false],
        [null, 'Captured', false, false],
        [null, 'Held', false, false],
        [null, 'Unmatched', true, false],
    ] as const)('prior %s → %s (rail-reported %s): %s', (prior, now, railReported, expected) => {
        expect(IsNewlyWaiting(prior, { Disposition: now }, railReported)).toBe(expected);
    });
});
