/**
 * Unit tests for opening a payment intent. No network, no database — the driver lookup and the
 * metadata provider are both stood in for.
 *
 * WHAT IS WORTH PROVING HERE. This is the step that was missing entirely, so none of its failure
 * modes has ever been exercised by anything:
 *
 *   IT MUST NOT WRITE A ROW WHEN THE GATEWAY REFUSED. A `PaymentIntent` recorded for an intent that
 *   was never opened is a row every later webhook fails to match, and a payment that can never be
 *   captured. Refusal is a normal outcome and must leave no trace.
 *
 *   A RETRY MUST NOT OPEN A SECOND INTENT. `ProviderIntentID` is UNIQUE, and a gateway given a
 *   repeated idempotency key returns the SAME intent — so a retried call arrives holding an id we
 *   already have. Inserting would violate the constraint; the correct answer is to return what we
 *   hold. Against a saved instrument, getting this wrong charges the customer twice.
 *
 *   A FAILURE TO RECORD MUST THROW, NOT REFUSE. If the gateway opened an intent and we could not
 *   write it down, real money is in flight against an intent this application cannot recognise. That
 *   is a fault; a refusal the caller might swallow would lose it.
 *
 *   THE CLIENT SECRET MUST NOT BE PERSISTED. It authorises a browser to confirm this one intent. It
 *   is an output, never a column.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { CreateIntentRequest, CreateIntentResult } from '../BasePaymentProvider.js';

// The service resolves its driver through this module. Stubbing it is what lets the SERVICE's own
// logic — validate, dedup, write, report — be tested without a provider row or a gateway.
const driverResponse: { Next: CreateIntentResult; LastRequest: CreateIntentRequest | null } = {
    Next: { Success: true, ProviderIntentID: 'pi_1', Status: 'Processing' },
    LastRequest: null,
};

vi.mock('../PaymentProviderResolver.js', () => ({
    ResolvePaymentProvider: async () => ({
        CreateIntent: async (request: CreateIntentRequest) => {
            driverResponse.LastRequest = request;
            return driverResponse.Next;
        },
    }),
}));

const { OpenPaymentIntent } = await import('../PaymentIntentService.js');

const PROVIDER_ID = '11111111-1111-1111-1111-111111111111';
const USER = { ID: 'user-1' } as unknown as UserInfo;

interface Recorded {
    /** Field bags of every row that actually saved. */
    Saved: Array<Record<string, unknown>>;
    /** Id returned by the dedup lookup, or null for "we hold nothing". */
    Existing: string | null;
    SaveSucceeds: boolean;
}

/** Covers exactly the two things the service touches: the dedup `RunView` and the row it writes. */
function fakeProvider(state: Recorded): IMetadataProvider {
    return {
        RunView: async () => ({ Success: true, Results: state.Existing ? [{ ID: state.Existing }] : [] }),
        GetEntityObject: async () => {
            const fields: Record<string, unknown> = {};
            const api: Record<string, unknown> = {
                NewRecord: () => undefined,
                Set: (k: string, v: unknown) => {
                    fields[k] = v;
                },
                Get: (k: string) => (k === 'ID' ? 'new-intent-row' : fields[k]),
                Save: async () => {
                    if (state.SaveSucceeds) state.Saved.push(fields);
                    return state.SaveSucceeds;
                },
                LatestResult: { CompleteMessage: 'the database said no' },
            };
            // A REAL entity exposes every column as a generated get/set pair that delegates to
            // Get/Set, so production code writes `row.Status = …` rather than `row.Set('Status', …)`.
            // The proxy gives the double that same surface — without it the double is not a stand-in
            // for the class under test, it is a stand-in for an older, weaker one.
            return new Proxy(api, {
                get: (target, prop: string) =>
                    prop in target ? target[prop] : (target.Get as (k: string) => unknown)(prop),
                set: (target, prop: string, value) => {
                    if (prop in target) target[prop] = value;
                    else fields[prop] = value;
                    return true;
                },
            });
        },
    } as unknown as IMetadataProvider;
}

const fresh = (over: Partial<Recorded> = {}): Recorded => ({ Saved: [], Existing: null, SaveSucceeds: true, ...over });

const open = (state: Recorded, over: Record<string, unknown> = {}) =>
    OpenPaymentIntent(
        { PaymentProviderID: PROVIDER_ID, Amount: 250, CurrencyCode: 'USD', ...over } as Parameters<
            typeof OpenPaymentIntent
        >[0],
        fakeProvider(state),
        USER,
    );

beforeEach(() => {
    driverResponse.Next = { Success: true, ProviderIntentID: 'pi_1', Status: 'Processing' };
    driverResponse.LastRequest = null;
});

describe('OpenPaymentIntent — refusing before it asks', () => {
    it('refuses a non-positive amount and never calls the gateway', async () => {
        const state = fresh();
        for (const amount of [0, -5, Number.NaN]) {
            const result = await open(state, { Amount: amount });
            expect(result.Success).toBe(false);
            expect(result.Reason).toMatch(/Cannot open a payment intent/);
        }
        expect(driverResponse.LastRequest).toBeNull();
        expect(state.Saved).toHaveLength(0);
    });

    it('refuses without a provider id', async () => {
        const state = fresh();
        const result = await open(state, { PaymentProviderID: '' });
        expect(result.Success).toBe(false);
        expect(result.Reason).toMatch(/PaymentProviderID/);
        expect(state.Saved).toHaveLength(0);
    });
});

describe('OpenPaymentIntent — the happy path', () => {
    it('records the intent and returns OUR row id, not just the gateway’s', async () => {
        // `PaymentIntentID` is what Orders.CapturePayment takes. Returning only the gateway's id would
        // leave the caller unable to link the payment.
        const state = fresh();
        const result = await open(state);
        expect(result.Success).toBe(true);
        expect(result.PaymentIntentID).toBe('new-intent-row');
        expect(result.ProviderIntentID).toBe('pi_1');
        expect(state.Saved).toHaveLength(1);
    });

    it('writes the gateway status, the amount and the parties', async () => {
        const state = fresh();
        await open(state, {
            OrderHeaderID: '33333333-3333-3333-3333-333333333333',
            BillToOrganizationID: '44444444-4444-4444-4444-444444444444',
        });
        const row = state.Saved[0];
        expect(row.Status).toBe('Processing');
        expect(row.Amount).toBe(250);
        expect(row.OrderHeaderID).toBe('33333333-3333-3333-3333-333333333333');
        expect(row.BillToOrganizationID).toBe('44444444-4444-4444-4444-444444444444');
    });

    it('NEVER persists the client secret, but does return it', async () => {
        // A bearer credential in a table reporting reads. The row deliberately has no column for it.
        driverResponse.Next = {
            Success: true,
            ProviderIntentID: 'pi_1',
            Status: 'RequiresPayment',
            ClientSecret: 'pi_1_secret_shhh',
        };
        const state = fresh();
        const result = await open(state);
        expect(result.ClientSecret).toBe('pi_1_secret_shhh');
        expect(JSON.stringify(state.Saved[0])).not.toContain('secret');
    });

    it('defaults an unreadable status to Processing rather than to a confident answer', async () => {
        // Same rule MapStripeIntentStatus follows: Succeeded books cash that may not exist, Failed
        // abandons a payment that may be fine.
        driverResponse.Next = { Success: true, ProviderIntentID: 'pi_1' };
        const state = fresh();
        await open(state);
        expect(state.Saved[0].Status).toBe('Processing');
    });

    it('passes a saved instrument through — the recurring-renewal path', async () => {
        const state = fresh();
        await open(state, { ProviderInstrumentRef: 'pm_saved', ProviderCustomerRef: 'cus_1' });
        expect(driverResponse.LastRequest?.ProviderInstrumentRef).toBe('pm_saved');
        expect(driverResponse.LastRequest?.ProviderCustomerRef).toBe('cus_1');
    });
});

describe('OpenPaymentIntent — when the gateway refuses', () => {
    it('leaves NO ROW behind', async () => {
        // A recorded intent the gateway never opened is a row every webhook fails to match.
        driverResponse.Next = { Success: false, Reason: 'the bank account is closed' };
        const state = fresh();
        const result = await open(state);
        expect(result.Success).toBe(false);
        expect(result.Reason).toBe('the bank account is closed');
        expect(state.Saved).toHaveLength(0);
    });

    it('refuses when the gateway succeeds but names no intent', async () => {
        // Success with nothing to record is not success — there would be no id to settle against.
        driverResponse.Next = { Success: true, Status: 'Processing' };
        const state = fresh();
        const result = await open(state);
        expect(result.Success).toBe(false);
        expect(state.Saved).toHaveLength(0);
    });
});

describe('OpenPaymentIntent — the retry that must not charge twice', () => {
    it('REUSES the row when the gateway returns an intent we already hold', async () => {
        // The idempotency-key path. Stripe returns the SAME intent for a repeated key, so a retry
        // arrives with an id already in our table — where ProviderIntentID is UNIQUE. Inserting would
        // violate the constraint; the answer is to return what we hold.
        const state = fresh({ Existing: 'intent-row-from-first-call' });
        const result = await open(state, { IdempotencyKey: 'renewal-2026-10-01' });
        expect(result.Success).toBe(true);
        expect(result.WasExisting).toBe(true);
        expect(result.PaymentIntentID).toBe('intent-row-from-first-call');
        expect(state.Saved).toHaveLength(0);
    });

    it('forwards the idempotency key to the gateway, which is what makes the reuse possible', async () => {
        const state = fresh();
        await open(state, { IdempotencyKey: 'renewal-2026-10-01' });
        expect(driverResponse.LastRequest?.IdempotencyKey).toBe('renewal-2026-10-01');
    });

    it('still returns the client secret on a reused intent', async () => {
        // A caller retrying a checkout needs the secret to confirm; it is not ours to withhold merely
        // because the row predates this call.
        driverResponse.Next = { Success: true, ProviderIntentID: 'pi_1', Status: 'RequiresPayment', ClientSecret: 's' };
        const result = await open(fresh({ Existing: 'existing-row' }));
        expect(result.ClientSecret).toBe('s');
    });
});

describe('OpenPaymentIntent — when we cannot record what the gateway opened', () => {
    it('THROWS rather than refusing', async () => {
        // Real money is in flight against an intent this application cannot recognise. A refusal the
        // caller might swallow would lose that; a throw puts it in front of somebody.
        const state = fresh({ SaveSucceeds: false });
        await expect(open(state)).rejects.toThrow(/Could not record payment intent pi_1/);
    });
});
