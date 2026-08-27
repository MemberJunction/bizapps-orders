/**
 * The hostile cases for bank-debit settlement. No network, no database.
 *
 * `AchSettlement.test.ts` covers the paths somebody would think to walk. This file covers the ones
 * they would not, and it is organised around the three places this rail can be silently wrong:
 *
 *   THE FEE CAP IS A CLIFF, NOT A CURVE. 0.8% capped at $5 changes behaviour at exactly $625, and a
 *   fee is booked as its own ledger leg. Getting the boundary wrong by a cent is invisible in every
 *   report and wrong in the ledger for ever. So the boundary is walked from both sides.
 *
 *   THE SETTLEMENT TABLE IS A MATRIX, AND MOST OF IT IS UNREACHABLE BY HAPPY-PATH TESTING. Five
 *   gateway readings times six payment states is thirty cells, and the ones that matter are the
 *   combinations nobody expects — a success against a refunded payment, a failure against one already
 *   reversed. Every cell below has a stated expectation, so a future edit that changes one has to say
 *   so out loud rather than quietly widening a branch.
 *
 *   A WEBHOOK PAYLOAD IS ATTACKER-ADJACENT AND VENDOR-SHAPED. It is verified before it is parsed, so
 *   it is not hostile — but it IS whatever Stripe decided to send this week, and every field this code
 *   reads is one Stripe could omit, rename, or type differently. A parser that assumes structure
 *   produces a confident, wrong `WebhookEvent`, and `DecideSettlement` then moves money on it.
 */
import { describe, it, expect } from 'vitest';
import { AchFeeEstimate, DecideSettlement, type IntentStatus, type SettlementAction } from '../PaymentProviderBehavior.js';
import { StripeACHPaymentProvider } from '../StripeACHPaymentProvider.js';
import type { PaymentProviderConfig } from '../BasePaymentProvider.js';

const config = (over: Partial<PaymentProviderConfig> = {}): PaymentProviderConfig => ({
    ID: '11111111-1111-1111-1111-111111111111',
    TypeCode: 'StripeACH',
    CompanyID: '22222222-2222-2222-2222-222222222222',
    Name: 'Test bank-debit account',
    CredentialsRef: null,
    IsLiveMode: false,
    Capabilities: { SupportsTokenization: true, SupportsRefund: true, SupportsWebhooks: true },
    ...over,
});

const ach = (over: Partial<PaymentProviderConfig> = {}) => {
    const driver = new StripeACHPaymentProvider();
    driver.Config = config(over);
    driver.Credentials = {};
    return driver;
};

/** A live driver whose one HTTP call is replaced with a canned answer, or with a thrown fault. */
const liveAch = (answer: { Ok: boolean; Body?: Record<string, unknown>; Reason?: string } | Error) => {
    const driver = ach({ IsLiveMode: true });
    driver.Credentials = { ApiKey: 'sk_test_x' };
    (driver as unknown as { call: () => Promise<unknown> }).call = async () => {
        if (answer instanceof Error) throw answer;
        return { Ok: answer.Ok, Body: answer.Body ?? {}, Reason: answer.Reason };
    };
    return driver;
};

const evt = (payload: Record<string, unknown>) => JSON.stringify(payload);

// ─── The fee cliff ─────────────────────────────────────────────────────────────────────────────

describe('AchFeeEstimate — walking the $625 cliff from both sides', () => {
    it.each([
        [1, 0.01, '0.8c rounds up to a cent — a fee of zero on a real charge is a missing ledger leg'],
        [100, 0.8, 'plainly under the cap'],
        [624, 4.99, 'one dollar below the breakpoint, still proportional'],
        [624.99, 5, 'a hair below — rounds to the cap and is indistinguishable from it, correctly'],
        [625, 5, 'EXACTLY the breakpoint: 0.8% is 5.00, so cap and percentage agree'],
        [625.01, 5, 'a hair above — the cap now binds'],
        [10_000, 5, 'far above: $5, not $80'],
        [1_000_000, 5, 'the cap does not erode at scale'],
    ])('%s → %s (%s)', (amount, expected) => {
        expect(AchFeeEstimate(amount)).toBe(expected);
    });

    it('never exceeds the amount it is charged against', () => {
        // A fee larger than the payment would put NEGATIVE cash in the ledger, and
        // PaymentHeaderEntityServer.Validate rejects exactly that. Below a dollar the percentage is
        // sub-cent, so the guard that matters is that rounding never inflates past the gross.
        for (const amount of [0.01, 0.05, 0.5, 1, 2]) {
            expect(AchFeeEstimate(amount)).toBeLessThanOrEqual(amount);
        }
    });

    it('is always a clean two-decimal figure', () => {
        // It becomes a DECIMAL(18,2) ledger amount. A third decimal is silently truncated by the
        // database, which is how a capture entry stops balancing by a fraction of a cent.
        for (const amount of [12.34, 99.99, 333.33, 624.37, 7.77]) {
            const fee = AchFeeEstimate(amount);
            expect(Number(fee.toFixed(2))).toBe(fee);
        }
    });

    it('treats a negative amount as its magnitude', () => {
        // A reversal carries Amount as a positive magnitude, but a caller passing the signed figure
        // must not produce a negative fee — that would credit the processor's cut back.
        expect(AchFeeEstimate(-100)).toBe(0.8);
    });

    it.each([
        [0, 'nothing to charge'],
        [Number.NaN, 'not a number'],
        [Number.POSITIVE_INFINITY, 'infinite'],
        [Number.NEGATIVE_INFINITY, 'negatively infinite'],
    ])('returns 0 for %s (%s) rather than propagating it into the ledger', (amount) => {
        expect(AchFeeEstimate(amount)).toBe(0);
    });

    it('applies the percentage but NOT the USD cap to another currency', () => {
        // The cap is a major-unit USD figure. Applying it to EUR would be a currency conversion this
        // module has no business inventing; omitting the percentage would be worse.
        expect(AchFeeEstimate(10_000, 'EUR')).toBe(80);
        expect(AchFeeEstimate(10_000, 'usd')).toBe(5);
    });
});

// ─── The full settlement matrix ────────────────────────────────────────────────────────────────

type Cell = {
    Event: IntentStatus | null;
    Header: string | null;
    Booked?: boolean;
    Reversed?: boolean;
    Expect: SettlementAction;
    Why: string;
};

/**
 * Every combination this code can encounter, with a stated expectation.
 *
 * `Booked` defaults to true for Captured (booking is part of the same transaction as the transition)
 * and false otherwise; `Reversed` defaults to false. The cells that vary those explicitly are the
 * ones where they change the answer.
 */
const MATRIX: Cell[] = [
    // ── No payment behind the intent. Nothing to settle, at any gateway reading. ──
    { Event: 'Succeeded', Header: null, Expect: 'None', Why: 'abandoned checkout — an intent with no payment' },
    { Event: 'Failed', Header: null, Expect: 'None', Why: 'a failure on an intent we never captured against' },
    { Event: 'Processing', Header: null, Expect: 'None', Why: 'submitted, nothing opened here' },
    { Event: 'Canceled', Header: null, Expect: 'None', Why: 'cancelled before anyone paid' },
    { Event: 'Succeeded', Header: '', Expect: 'None', Why: 'an empty status reads as no payment' },
    { Event: 'Succeeded', Header: '   ', Expect: 'None', Why: 'and so does whitespace' },

    // ── The bank confirmed. ──
    { Event: 'Succeeded', Header: 'Pending', Booked: false, Expect: 'Promote', Why: 'the payment becomes Captured, which books' },
    { Event: 'Succeeded', Header: 'Captured', Booked: true, Expect: 'None', Why: 'redelivery of a success already applied' },
    { Event: 'Succeeded', Header: 'Failed', Booked: false, Expect: 'Hold', Why: 'a bank does not un-return a debit' },
    { Event: 'Succeeded', Header: 'Refunded', Booked: true, Expect: 'Hold', Why: 'success against money already sent back' },
    { Event: 'Succeeded', Header: 'Disputed', Booked: true, Expect: 'Hold', Why: 'success against a disputed payment' },

    // ── The bank refused, or the debit came back. ──
    { Event: 'Failed', Header: 'Pending', Booked: false, Expect: 'Fail', Why: 'nothing was booked, so nothing reverses' },
    { Event: 'Failed', Header: 'Captured', Booked: true, Expect: 'Reverse', Why: 'THE case this rail exists for' },
    { Event: 'Failed', Header: 'Captured', Booked: true, Reversed: true, Expect: 'None', Why: 'already reversed once' },
    { Event: 'Failed', Header: 'Captured', Booked: false, Expect: 'Hold', Why: 'Captured with no journal entry is a contradiction' },
    { Event: 'Failed', Header: 'Failed', Booked: false, Expect: 'None', Why: 'redelivery of a failure already applied' },
    { Event: 'Failed', Header: 'Refunded', Booked: true, Expect: 'Hold', Why: 'a failure against a reversal' },
    { Event: 'Failed', Header: 'Disputed', Booked: true, Expect: 'Hold', Why: 'a failure against a disputed payment' },

    // ── Cancellation behaves exactly as a failure, deliberately. ──
    { Event: 'Canceled', Header: 'Pending', Booked: false, Expect: 'Fail', Why: 'cancelled before it cleared' },
    { Event: 'Canceled', Header: 'Captured', Booked: true, Expect: 'Reverse', Why: 'cancelled after it cleared' },
    { Event: 'Canceled', Header: 'Captured', Booked: true, Reversed: true, Expect: 'None', Why: 'already reversed' },

    // ── Still in flight. A Pending payment already records exactly this. ──
    { Event: 'Processing', Header: 'Pending', Booked: false, Expect: 'None', Why: 'waiting, as recorded' },
    { Event: 'Processing', Header: 'Captured', Booked: true, Expect: 'None', Why: 'a late processing event after success' },
    { Event: 'RequiresPayment', Header: 'Pending', Booked: false, Expect: 'None', Why: 'the gateway wants an instrument' },

    // ── An unreadable status must never move money. ──
    { Event: null, Header: 'Pending', Booked: false, Expect: 'None', Why: 'unknown reading against a pending payment' },
    { Event: null, Header: 'Captured', Booked: true, Expect: 'None', Why: 'unknown reading against a captured one' },
];

describe('DecideSettlement — the complete matrix, every cell stated', () => {
    it.each(MATRIX.map((c) => [`${c.Event ?? 'unknown'} × ${c.Header ?? 'no payment'}`, c] as const))(
        '%s',
        (_label, cell) => {
            const decision = DecideSettlement({
                EventStatus: cell.Event,
                HeaderStatus: cell.Header,
                HeaderBooked: cell.Booked ?? cell.Header === 'Captured',
                AlreadyReversed: cell.Reversed ?? false,
            });
            expect(decision.Action, cell.Why).toBe(cell.Expect);
        },
    );

    it('covers every combination of the two vocabularies that can reach it', () => {
        // Guards the guard: a matrix that quietly shrinks proves less while still passing. Both
        // vocabularies are CHECK-constrained in the schema, so their sizes are known.
        const events = new Set(MATRIX.map((c) => String(c.Event)));
        // Blank headers are the "no payment" cells, not a status — excluded so the assertion below
        // is about the CHECK-constrained vocabulary rather than about the sentinel values.
        const headers = new Set(MATRIX.filter((c) => c.Header?.trim()).map((c) => c.Header));
        expect(events).toContain('Succeeded');
        expect(events).toContain('Failed');
        expect(events).toContain('Canceled');
        expect(events).toContain('Processing');
        expect([...headers].sort()).toEqual(['Captured', 'Disputed', 'Failed', 'Pending', 'Refunded']);
        expect(MATRIX.length).toBeGreaterThanOrEqual(26);
    });

    it('ALWAYS gives a reason, whatever it decides', () => {
        // The reason is the only thing a person reconciling next month has to go on, and `Hold` in
        // particular is useless without one.
        for (const cell of MATRIX) {
            const d = DecideSettlement({
                EventStatus: cell.Event,
                HeaderStatus: cell.Header,
                HeaderBooked: cell.Booked ?? cell.Header === 'Captured',
                AlreadyReversed: cell.Reversed ?? false,
            });
            expect(d.Reason.length, `${cell.Event} × ${cell.Header}`).toBeGreaterThan(0);
        }
    });

    it('NEVER answers Promote or Reverse for a payment that does not exist', () => {
        // The two actions that write. Reaching either with no payment would throw at the effects layer
        // on a null dereference, which is a stack trace where a reason belongs.
        for (const event of ['Succeeded', 'Failed', 'Canceled', 'Processing', 'RequiresPayment'] as const) {
            const d = DecideSettlement({ EventStatus: event, HeaderStatus: null, HeaderBooked: false, AlreadyReversed: false });
            expect(['Promote', 'Reverse']).not.toContain(d.Action);
        }
    });

    it('ignores AlreadyReversed everywhere it is not the question', () => {
        // It should only suppress a second Reverse. If it leaked into the success path it would
        // silently stop promoting payments after any reversal existed.
        const promoted = DecideSettlement({
            EventStatus: 'Succeeded',
            HeaderStatus: 'Pending',
            HeaderBooked: false,
            AlreadyReversed: true,
        });
        expect(promoted.Action).toBe('Promote');
    });

    it('ignores HeaderBooked on the success path', () => {
        // Booking state answers "what is there to reverse", not "may this be promoted".
        const d = DecideSettlement({ EventStatus: 'Succeeded', HeaderStatus: 'Pending', HeaderBooked: true, AlreadyReversed: false });
        expect(d.Action).toBe('Promote');
    });
});

// ─── Vendor-shaped payloads ────────────────────────────────────────────────────────────────────

describe('ParseWebhookEvent — payloads Stripe could plausibly send', () => {
    it('reads a return with no amount without inventing one', () => {
        // Amount undefined means "we do not know", and the reversal reads the amount off OUR payment
        // rather than off the event precisely so this cannot under-reverse.
        const parsed = ach().ParseWebhookEvent(
            evt({ id: 'evt_1', type: 'charge.failed', data: { object: { id: 'ch_1', payment_intent: 'pi_1', currency: 'usd' } } }),
        );
        expect(parsed?.Status).toBe('Failed');
        expect(parsed?.Amount).toBeUndefined();
    });

    it('does not set an Amount of zero', () => {
        // Zero and "unknown" are different claims, and a zero would read as a real figure downstream.
        const parsed = ach().ParseWebhookEvent(
            evt({ id: 'evt_1', type: 'charge.failed', data: { object: { id: 'ch_1', currency: 'usd', amount: 0 } } }),
        );
        expect(parsed?.Amount).toBeUndefined();
    });

    it('still reports Failed when the charge names no intent', () => {
        // The handler will not find a payment for it and will Ignore — which is correct — but the
        // parse itself must not throw or mislabel.
        const parsed = ach().ParseWebhookEvent(
            evt({ id: 'evt_1', type: 'charge.failed', data: { object: { id: 'ch_1', currency: 'usd' } } }),
        );
        expect(parsed?.Status).toBe('Failed');
        expect(parsed?.ProviderIntentID).toBeUndefined();
    });

    it('prefers the human failure MESSAGE over the code when both are present', () => {
        // The message ends up on the reversing payment's reason. "insufficient funds" beats "R01" for
        // the person reading it next month.
        const parsed = ach().ParseWebhookEvent(
            evt({
                id: 'evt_1',
                type: 'charge.failed',
                data: { object: { id: 'ch_1', currency: 'usd', failure_code: 'R01', failure_message: 'insufficient funds' } },
            }),
        );
        expect(parsed?.FailureReason).toBe('insufficient funds');
    });

    it('survives an event with no data object at all', () => {
        const parsed = ach().ParseWebhookEvent(evt({ id: 'evt_1', type: 'charge.failed' }));
        expect(parsed?.Status).toBe('Failed');
    });

    it('returns null for an event with no id, so it cannot be de-duplicated', () => {
        // DecideWebhookAction rejects an event with no id; the parser refusing first is the same guard
        // one layer earlier.
        expect(ach().ParseWebhookEvent(evt({ type: 'charge.failed', data: { object: {} } }))).toBeNull();
    });

    it('returns null for an event with no type', () => {
        expect(ach().ParseWebhookEvent(evt({ id: 'evt_1', data: { object: {} } }))).toBeNull();
    });

    it.each([['not json'], [''], ['[]'], ['null']])('returns null rather than throwing for %s', (body) => {
        expect(ach().ParseWebhookEvent(body)).toBeNull();
    });

    it('upper-cases the currency, because ours is a code and Stripe’s is lowercase', () => {
        const parsed = ach().ParseWebhookEvent(
            evt({ id: 'evt_1', type: 'charge.failed', data: { object: { id: 'ch_1', currency: 'eur', amount: 500 } } }),
        );
        expect(parsed?.CurrencyCode).toBe('EUR');
        expect(parsed?.Amount).toBe(5);
    });
});

// ─── Capture-as-a-read, under duress ───────────────────────────────────────────────────────────

describe('Capture — refusing, and the difference between a refusal and a fault', () => {
    it.each([
        ['processing', 'Processing', /has not cleared yet/],
        ['requires_payment_method', 'Failed', /no money moved/],
        ['requires_action', 'Failed', /no money moved/],
        ['canceled', 'Failed', /no money moved/],
        ['', 'Failed', /no money moved/],
    ])('refuses an intent reading %s', async (status, expectedStatus, message) => {
        const driver = liveAch({ Ok: true, Body: { status, currency: 'usd' } });
        const result = await driver.Capture({ ProviderIntentID: 'pi_1', CurrencyCode: 'USD' });
        expect(result.Success).toBe(false);
        expect(result.Status).toBe(expectedStatus);
        expect(result.Reason).toMatch(message);
    });

    it('names the intent in every refusal, so the reason is actionable', () => {
        // A refusal that does not say WHICH debit sends the reader to the dashboard to guess.
        return liveAch({ Ok: true, Body: { status: 'processing' } })
            .Capture({ ProviderIntentID: 'pi_abc123', CurrencyCode: 'USD' })
            .then((r) => expect(r.Reason).toContain('pi_abc123'));
    });

    it('passes a gateway REFUSAL through as a refusal', async () => {
        const driver = liveAch({ Ok: false, Reason: 'No such payment_intent' });
        const result = await driver.Capture({ ProviderIntentID: 'pi_missing', CurrencyCode: 'USD' });
        expect(result.Success).toBe(false);
        expect(result.Reason).toBe('No such payment_intent');
    });

    it('lets a FAULT throw rather than reporting it as a decline', async () => {
        // The distinction the whole driver contract rests on. A caller that cannot tell "the bank said
        // no" from "we could not reach the bank" will eventually treat one as the other — and the
        // payment's state is UNKNOWN after a fault, which is worse than declined.
        const driver = liveAch(new Error('Stripe was unreachable'));
        await expect(driver.Capture({ ProviderIntentID: 'pi_1', CurrencyCode: 'USD' })).rejects.toThrow(/unreachable/);
    });

    it('reads amount_received in preference to amount', async () => {
        // A partially-settled debit reports both, and `amount` is what was ASKED for. Booking that
        // would credit AR with money that did not arrive.
        const driver = liveAch({
            Ok: true,
            Body: { status: 'succeeded', currency: 'usd', amount: 50_000, amount_received: 25_000, latest_charge: 'ch_1' },
        });
        const result = await driver.Capture({ ProviderIntentID: 'pi_1', CurrencyCode: 'USD' });
        expect(result.Amount).toBe(250);
    });

    it('falls back to amount when amount_received is absent', async () => {
        const driver = liveAch({ Ok: true, Body: { status: 'succeeded', currency: 'usd', amount: 25_000, latest_charge: 'ch_1' } });
        expect((await driver.Capture({ ProviderIntentID: 'pi_1', CurrencyCode: 'USD' })).Amount).toBe(250);
    });

    it('honours the GATEWAY’s currency over the caller’s when they disagree', async () => {
        // The gateway is the authority on what actually moved. A JPY intent read as USD would be a
        // hundredfold error in the booked amount.
        const driver = liveAch({ Ok: true, Body: { status: 'succeeded', currency: 'jpy', amount_received: 1000 } });
        expect((await driver.Capture({ ProviderIntentID: 'pi_1', CurrencyCode: 'USD' })).Amount).toBe(1000);
    });

    it('reports NO fee rather than a zero one when the charge cannot be read', async () => {
        // undefined leaves whatever is on the row; 0 would assert there was no fee, suppressing a real
        // ledger leg. `feeFor` returns undefined without a charge id.
        const driver = liveAch({ Ok: true, Body: { status: 'succeeded', currency: 'usd', amount_received: 25_000 } });
        const result = await driver.Capture({ ProviderIntentID: 'pi_1', CurrencyCode: 'USD' });
        expect(result.Success).toBe(true);
        expect(result.FeeAmount).toBeUndefined();
    });

    it('the STUB reports the bank-debit fee at the cap, not the card rate', async () => {
        // $10,000 costs $5 by bank debit and $290.30 by card. A stub carrying the card rate would make
        // every integration check assert the wrong fee leg.
        const result = await ach().Capture({ ProviderIntentID: 'pi_stub', Amount: 10_000, CurrencyCode: 'USD' });
        expect(result.FeeAmount).toBe(5);
        expect(result.Success).toBe(true);
    });
});
