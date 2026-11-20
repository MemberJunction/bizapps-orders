/**
 * What the POLL writes for a HubSpot payment (#482), run through the real `handlePayment` against a
 * faked ledger (the same harness as `PollReappliedResolution.test.ts`).
 *
 * The cases: money HubSpot only recorded, or collected through the company's own Stripe account, is
 * set aside and never captured; a succeeded HubSpot-collected payment is Unmatched with the rail's
 * reason, because no invoice lookup can match it; a processing one is held; and a captured HubSpot
 * payment is never compared against invoice applications HubSpot does not report.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
    paymentLineReads: 0,
    written: undefined as Record<string, unknown> | undefined,
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        RunView: class {
            async RunView(params: { EntityName: string }) {
                if (params.EntityName.includes('Payment Lines')) mocks.paymentLineReads++;
                return { Success: true, Results: [] };
            }
        },
    };
});

import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { NormalizeHubSpotPayment } from '../HubSpotPaymentsRail.js';
import { PollExternalPaymentsOperation } from '../PollExternalPaymentsOperation.js';
import type { RailPaymentRecord } from '../BaseInvoiceRail.js';

const PROVIDER_ID = '11111111-2222-4333-8444-555555555555';
const HEADER_ID = '99999999-2222-4333-8444-555555555555';
const COMPANY_ID = 'cccccccc-2222-4333-8444-555555555555';

const fakeProvider = {
    GetEntityObject: async () => ({
        InnerLoad: async () => true,
        NewRecord: () => undefined,
        SetMany: (fields: Record<string, unknown>) => {
            mocks.written = { ...(mocks.written ?? {}), ...fields };
        },
        Save: async () => true,
        Get: () => HEADER_ID,
        LatestResult: undefined,
    }),
} as unknown as IMetadataProvider;

const fakeRail = { Config: { PaymentProviderID: PROVIDER_ID, Name: 'HubSpot — portal A', TypeCode: 'HubSpotPayments', CompanyID: COMPANY_ID } };

const hubspot = (over: Record<string, unknown> = {}): RailPaymentRecord =>
    NormalizeHubSpotPayment('9001', {
        hs_initial_amount: '250.00',
        hs_fees_amount: '7.55',
        hs_latest_status: 'succeeded',
        hs_processor_type: 'hs_payments',
        hs_payment_method_type: 'card',
        hs_currency_code: 'USD',
        hs_initiated_date: '2026-10-01T14:00:00.000Z',
        hs_lastmodifieddate: '2026-10-01T14:05:00.000Z',
        ...over,
    });

interface Callable {
    handlePayment(
        rail: unknown,
        p: RailPaymentRecord,
        prior: unknown,
        preview: boolean,
        bookingCurrency: string,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<{ Disposition: string; Reason: string }>;
}

function poll(p: RailPaymentRecord, prior: unknown = null) {
    const op = new PollExternalPaymentsOperation() as unknown as Callable;
    return op.handlePayment(fakeRail, p, prior, false, 'USD', fakeProvider, {} as UserInfo);
}

beforeEach(() => {
    mocks.written = undefined;
    mocks.paymentLineReads = 0;
});

describe('a HubSpot payment the poll reads', () => {
    it('is Unmatched with the gross, fee and net when HubSpot collected it and it succeeded', async () => {
        const out = await poll(hubspot());
        expect(out.Disposition).toBe('Unmatched');
        expect(out.Reason).toContain('242.45 USD net');
        expect(mocks.written?.Disposition).toBe('Unmatched');
        expect(mocks.written?.PaymentHeaderID ?? null).toBeNull();
    });

    it('is held while HubSpot is still processing it', async () => {
        const out = await poll(hubspot({ hs_latest_status: 'processing' }));
        expect(out.Disposition).toBe('Held');
        expect(out.Reason).toContain('HubSpot');
    });

    it('is set aside, never captured, when it went through the company\'s own Stripe account', async () => {
        const out = await poll(hubspot({ hs_processor_type: 'byo_stripe' }));
        expect(out.Disposition).toBe('Ignored');
        expect(mocks.written?.Disposition).toBe('Ignored');
        expect(mocks.written?.DispositionReason).toMatch(/own Stripe account/);
    });

    it('is set aside when HubSpot only recorded money collected elsewhere', async () => {
        const out = await poll(hubspot({ hs_processor_type: 'none', hs_payment_method_type: 'check' }));
        expect(out.Disposition).toBe('Ignored');
    });

    it('is not compared against invoice applications once captured — HubSpot reports none', async () => {
        const prior = { ID: 'ext-1', ExternalPaymentRef: '9001', Disposition: 'Captured', DispositionReason: 'Captured by hand.', PaymentHeaderID: HEADER_ID, ExternalUpdatedAt: '2026-10-01T14:05:00.000Z' };
        const out = await poll(hubspot(), prior);
        expect(out.Disposition).toBe('Ignored');
        expect(mocks.paymentLineReads).toBe(0);
    });

    it('is reported for a person when a captured payment is partly refunded', async () => {
        const prior = { ID: 'ext-1', ExternalPaymentRef: '9001', Disposition: 'Captured', DispositionReason: 'Captured by hand.', PaymentHeaderID: HEADER_ID, ExternalUpdatedAt: '2026-10-01T14:05:00.000Z' };
        const out = await poll(hubspot({ hs_latest_status: 'partially_refunded' }), prior);
        expect(out.Disposition).toBe('ReversalNeeded');
    });
});
