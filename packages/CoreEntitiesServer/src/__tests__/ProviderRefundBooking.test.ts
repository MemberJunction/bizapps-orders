/**
 * A refund made at the gateway is booked in Orders, or put on finance's review list (#476).
 * No network, no database: Stripe answers from fixtures shaped like its test-mode responses.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GatewayRefund, WebhookEvent } from '../BasePaymentProvider.js';

const INTENT_ID = 'aaaaaaaa-2222-4333-8444-555555555555';
const PAYMENT_ID = 'bbbbbbbb-2222-4333-8444-555555555555';

const state = vi.hoisted(() => ({
    payments: [] as Array<Record<string, unknown>>,
    held: [] as Array<{ Amount: number; ProviderRefundID: string | null }>,
    refundCalls: [] as Array<Record<string, unknown>>,
    refundRefuses: false,
    raised: [] as Array<Record<string, unknown>>,
    typeActive: true,
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        LogStatus: () => undefined,
        LogError: () => undefined,
        RunView: class {
            async RunView(params: { ExtraFilter?: string }) {
                if (params.ExtraFilter?.includes('ReversesPaymentHeaderID =')) return { Success: true, Results: state.held };
                return { Success: true, Results: state.payments };
            }
        },
    };
});

vi.mock('../RefundPaymentOperation.js', () => ({
    RefundPaymentOperation: class {
        async ExecuteServer(input: Record<string, unknown>) {
            state.refundCalls.push(input);
            if (state.refundRefuses) return { Success: true, Output: { Success: false, Message: 'only 10 remains refundable' } };
            return { Success: true, Output: { Success: true, RefundPaymentNumber: `PAY-R${state.refundCalls.length}` } };
        }
    },
}));

vi.mock('../AccountingBridge.js', () => ({
    GetActiveFinanceExceptionType: async () => (state.typeActive ? { Code: 'PROVIDER_REFUND_NOT_BOOKED', IsActive: true, Configuration: {} } : null),
    RaiseFinanceExceptions: async (exceptions: Array<Record<string, unknown>>) => {
        state.raised.push(...exceptions);
        return { Success: true, Results: exceptions.map((_, i) => ({ Index: i, Created: true })) };
    },
}));

vi.mock('../calendar-day.js', () => ({ CalendarDayOrToday: async () => new Date('2026-10-08T00:00:00') }));

import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import {
    BookProviderRefunds,
    PlanProviderRefundBooking,
    UnmatchedGatewayRefunds,
} from '../ProviderRefundBooking.js';
import { StripePaymentProvider, StripeRefundFromObject } from '../StripePaymentProvider.js';
import type { BasePaymentProvider } from '../BasePaymentProvider.js';

const refund = (id: string, amount: number, createdSec = 1759917600): GatewayRefund => ({
    ProviderRefundID: id,
    ProviderChargeID: 'ch_test_1',
    Amount: amount,
    CurrencyCode: 'USD',
    Status: 'succeeded',
    CreatedAt: new Date(createdSec * 1000),
});

describe('PlanProviderRefundBooking', () => {
    const base = { GatewayRefundedTotal: 30, PaymentStatus: 'Captured', CapturedAmount: 100, Held: [], GatewayRefunds: [refund('re_1', 30)] };

    it('books a refund made only at the gateway', () => {
        const plan = PlanProviderRefundBooking(base);
        expect(plan.Action).toBe('Book');
        expect(plan.Action === 'Book' && plan.Refunds.map((r) => r.ProviderRefundID)).toEqual(['re_1']);
    });

    it('books nothing when the refund was already recorded by hand with its id', () => {
        expect(PlanProviderRefundBooking({ ...base, Held: [{ Amount: 30, ProviderRefundID: 're_1' }] }).Action).toBe('None');
    });

    it('books nothing when it was recorded by hand without an id but for the same total', () => {
        expect(PlanProviderRefundBooking({ ...base, Held: [{ Amount: 30, ProviderRefundID: null }] }).Action).toBe('None');
    });

    it('books only the new partial refund when an earlier one was recorded by hand without an id', () => {
        const plan = PlanProviderRefundBooking({
            ...base,
            GatewayRefundedTotal: 50,
            Held: [{ Amount: 30, ProviderRefundID: null }],
            GatewayRefunds: [refund('re_1', 30, 1759917600), refund('re_2', 20, 1759921200)],
        });
        expect(plan.Action === 'Book' && plan.Refunds.map((r) => r.ProviderRefundID)).toEqual(['re_2']);
    });

    it('sends a refund on a payment that is not captured to review', () => {
        expect(PlanProviderRefundBooking({ ...base, PaymentStatus: 'Pending' }).Action).toBe('Review');
        expect(PlanProviderRefundBooking({ ...base, PaymentStatus: null }).Action).toBe('Review');
    });

    it('sends more refunded than captured to review', () => {
        expect(PlanProviderRefundBooking({ ...base, GatewayRefundedTotal: 120, GatewayRefunds: [refund('re_1', 120)] }).Action).toBe('Review');
    });

    it('sends refunds whose amounts do not add up to review', () => {
        expect(PlanProviderRefundBooking({ ...base, GatewayRefunds: [refund('re_1', 25)] }).Action).toBe('Review');
    });

    it('sends Orders holding more than the gateway reports to review', () => {
        expect(PlanProviderRefundBooking({ ...base, Held: [{ Amount: 40, ProviderRefundID: null }] }).Action).toBe('Review');
    });

    it('matches a hand-recorded refund to the oldest gateway refund of that amount', () => {
        const left = UnmatchedGatewayRefunds(
            [{ Amount: 10, ProviderRefundID: null }],
            [refund('re_b', 10, 1759921200), refund('re_a', 10, 1759917600)],
        );
        expect(left.map((r) => r.ProviderRefundID)).toEqual(['re_b']);
    });
});

describe('StripePaymentProvider.ListRefunds', () => {
    it('lists a charge\'s refunds across pages, converting minor units', async () => {
        const driver = new StripePaymentProvider();
        driver.Config = {
            ID: 'p', TypeCode: 'Stripe', CompanyID: 'c', Name: 'Test account', CredentialsRef: null, IsLiveMode: true,
            Capabilities: { SupportsTokenization: true, SupportsRefund: true, SupportsWebhooks: true },
        };
        driver.Credentials = { ApiKey: 'sk_test_fixture' };
        const urls: string[] = [];
        const pages = [
            { object: 'list', has_more: true, data: [{ id: 're_test_1', object: 'refund', amount: 1250, currency: 'usd', status: 'succeeded', charge: 'ch_test_1', created: 1759917600 }] },
            { object: 'list', has_more: false, data: [{ id: 're_test_2', object: 'refund', amount: 500, currency: 'usd', status: 'pending', charge: 'ch_test_1', created: 1759921200 }] },
        ];
        const orig = globalThis.fetch;
        globalThis.fetch = (async (input: RequestInfo | URL) => {
            urls.push(String(input));
            return new Response(JSON.stringify(pages[urls.length - 1]), { status: 200 });
        }) as typeof fetch;
        try {
            const result = await driver.ListRefunds({ ProviderChargeID: 'ch_test_1' });
            expect(result.Success).toBe(true);
            expect(result.Refunds?.map((r) => [r.ProviderRefundID, r.Amount, r.Status])).toEqual([
                ['re_test_1', 12.5, 'succeeded'],
                ['re_test_2', 5, 'pending'],
            ]);
            expect(urls[0]).toContain('/refunds?charge=ch_test_1');
            expect(urls[1]).toContain('starting_after=re_test_1');
        } finally {
            globalThis.fetch = orig;
        }
    });

    it('reads an expanded charge on a refund object', () => {
        expect(StripeRefundFromObject({ id: 're_x', amount: 100, currency: 'jpy', charge: { id: 'ch_x' }, status: 'succeeded' })).toMatchObject({
            ProviderChargeID: 'ch_x',
            Amount: 100,
        });
    });
});

describe('BookProviderRefunds', () => {
    const user = {} as UserInfo;
    const provider = {} as IMetadataProvider;
    let listed: GatewayRefund[] = [];
    const driver = {
        Config: { CompanyID: 'company-of-provider' },
        ListRefunds: async () => ({ Success: true, Refunds: listed }),
    } as unknown as BasePaymentProvider;
    const event = (amount: number): WebhookEvent => ({
        EventID: 'evt_test_r1',
        Kind: 'charge.refunded',
        ProviderChargeID: 'ch_test_1',
        ProviderIntentID: 'pi_test_1',
        Amount: amount,
        CurrencyCode: 'USD',
    });

    beforeEach(() => {
        state.payments = [{ ID: PAYMENT_ID, PaymentNumber: 'PAY-1', ReceivingCompanyID: 'company-1', Amount: 100, Status: 'Captured', ProviderChargeID: 'ch_test_1' }];
        state.held = [];
        state.refundCalls = [];
        state.refundRefuses = false;
        state.raised = [];
        state.typeActive = true;
        listed = [refund('re_test_1', 30)];
    });

    it('books a test-mode refund made at the gateway with no manual step, through Orders.RefundPayment', async () => {
        const out = await BookProviderRefunds(event(30), INTENT_ID, driver, provider, user);
        expect(state.refundCalls).toEqual([
            expect.objectContaining({ PaymentHeaderID: PAYMENT_ID, Amount: 30, ProviderRefundID: 're_test_1' }),
        ]);
        expect(out.Booked).toHaveLength(1);
        expect(state.raised).toHaveLength(0);
    });

    it('does not book a refund already recorded with Orders.RefundPayment', async () => {
        state.held = [{ Amount: 30, ProviderRefundID: 're_test_1' }];
        await BookProviderRefunds(event(30), INTENT_ID, driver, provider, user);
        expect(state.refundCalls).toHaveLength(0);
        expect(state.raised).toHaveLength(0);
    });

    it('raises a finance exception when Orders.RefundPayment refuses', async () => {
        state.refundRefuses = true;
        const out = await BookProviderRefunds(event(30), INTENT_ID, driver, provider, user);
        expect(out.ReviewReason).toMatch(/refused/);
        expect(state.raised).toEqual([
            expect.objectContaining({
                TypeCode: 'PROVIDER_REFUND_NOT_BOOKED',
                SourceEntityName: 'MJ_BizApps_Orders: Payment Headers',
                SourceRecordID: PAYMENT_ID,
                CompanyID: 'company-1',
                Amount: 30,
                DedupeKey: 'ch_test_1|30',
            }),
        ]);
    });

    it('raises against the intent, in the provider\'s company, when Orders has no payment for the charge', async () => {
        state.payments = [];
        await BookProviderRefunds(event(30), INTENT_ID, driver, provider, user);
        expect(state.refundCalls).toHaveLength(0);
        expect(state.raised[0]).toMatchObject({
            SourceEntityName: 'MJ_BizApps_Orders: Payment Intents',
            SourceRecordID: INTENT_ID,
            CompanyID: 'company-of-provider',
        });
    });

    it('raises nothing, but still logs, when the exception type is switched off', async () => {
        state.payments = [];
        state.typeActive = false;
        const out = await BookProviderRefunds(event(30), INTENT_ID, driver, provider, user);
        expect(out.ReviewReason).toBeTruthy();
        expect(state.raised).toHaveLength(0);
    });
});
