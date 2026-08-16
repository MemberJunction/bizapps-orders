/**
 * StripeACHPaymentProvider — collecting by US bank debit, where "paid" is an opinion for four days.
 *
 * IT IS A SUBCLASS BECAUSE IT IS THE SAME GATEWAY. Stripe treats a bank debit as a PaymentIntent with
 * a different payment-method type, so the auth, the form encoding, the error reading, the signature
 * verification and the fee lookup are all identical to the card driver's. A separate top-level class
 * would have copied every one of them, and the copies would have drifted the first time Stripe changed
 * a response shape. What genuinely differs is small enough to read in one screen, and it is all here.
 *
 * IT IS A SEPARATE `PaymentProviderType` ROW because the two rails are different money. They settle on
 * different timescales, cost different amounts (0.8% capped at $5 against 2.9% + 30c), fail for
 * different reasons, and — the one that matters operationally — a bank debit can be TAKEN BACK after
 * it has been booked. Configuring them as one provider would mean an operator could not turn one off,
 * and every fee expectation in the system would have to branch on the instrument rather than the
 * account.
 *
 * ═══ THE THING THAT MAKES THIS RAIL DIFFERENT ═══
 *
 * A card answers at the till. A bank debit answers up to four business days later, and it can answer a
 * SECOND time — insufficient funds, account closed, "I never authorised this" — weeks after the money
 * appeared to arrive. So there is no moment at which `Capture` can honestly report that cash moved,
 * and the driver does not pretend there is:
 *
 *   `CreateIntent`  submits the debit           → the intent is `Processing`
 *   `Capture`       READS what the bank said    → it does not capture anything; see below
 *   the webhook     promotes, fails, or reverses the payment when the answer arrives
 *
 * `Capture` IS A READ, AND THAT IS NOT A HACK. `PaymentHeaderEntityServer.settleWithProvider` calls it
 * for one purpose: to ask the gateway what actually moved, because the gateway is the authority on the
 * amount and the fee. For a card the answer requires an action; for a bank debit the action already
 * happened and the answer is a lookup. Overriding it to POST `/capture` would fail — there is nothing
 * to capture — and inventing a second method would fork the one path that books cash. So `Capture`
 * asks Stripe for the intent, refuses unless it says `succeeded`, and reports the real amount and the
 * real fee. Every line of `PaymentHeaderEntityServer` stays as it was.
 *
 * WHAT THIS DRIVER DOES NOT DO. It does not collect or verify a bank account, and it does not capture
 * a NACHA authorisation. Both belong to a SetupIntent flow the customer walks through once, and its
 * output — a `us_bank_account` payment method plus the mandate Stripe retains against it — is what
 * arrives here as `ProviderInstrumentRef`. Building that flow into a back-office capture path would
 * put a consent screen behind an API call nobody is watching.
 *
 * CONNECTS TO:
 *   BASE:    ./StripePaymentProvider.ts — auth, HTTP, form encoding, signature, fee lookup
 *   PURE:    ./PaymentProviderBehavior.ts — AchFeeEstimate, DecideSettlement
 *   EFFECTS: ./PaymentSettlement.ts — what the webhook does with the answer
 *   DOC:     plans/archive/bizapps-orders-master.md D19, D37
 */
import { RegisterClass } from '@memberjunction/global';
import { BasePaymentProvider, type CaptureRequest, type CaptureResult, type CreateIntentRequest, type WebhookEvent } from './BasePaymentProvider.js';
import { StripePaymentProvider } from './StripePaymentProvider.js';
import { AchFeeEstimate, FromMinorUnits, type IntentStatus } from './PaymentProviderBehavior.js';

/**
 * Stripe's payment-method type for a US bank debit. Its own constant because it appears in the intent
 * body and in the refusal messages, and a typo in either is a runtime surprise rather than a build one.
 */
const US_BANK_ACCOUNT = 'us_bank_account';

/**
 * The events this rail acts on.
 *
 * `payment_intent.processing` is here so the SUBMISSION is recorded rather than inferred from silence —
 * without it, a payment sits `Pending` for four days with nothing on the intent to say the bank ever
 * heard about it, and an operator cannot tell "submitted, waiting" from "never sent".
 *
 * BOTH `charge.failed` AND `payment_intent.payment_failed` ARE HANDLED, DELIBERATELY. A debit that
 * fails before settling and one RETURNED after settling are different events at Stripe, and which
 * arrives when is exactly the sort of detail this code should not be confident about. Handling both is
 * safe rather than sloppy: `DecideSettlement` keys off the PAYMENT'S state, not the event's name, so a
 * failure against a `Pending` payment fails it and a failure against a `Captured` one reverses it — no
 * matter which of the two names Stripe used. The duplicate case costs nothing either, because
 * `ProviderEventID` makes a second delivery of the SAME event a no-op and a second DIFFERENT event
 * resolves to `None` once the first has been applied.
 */
const ACH_HANDLED = [
    'payment_intent.processing',
    'payment_intent.succeeded',
    'payment_intent.payment_failed',
    'payment_intent.canceled',
    'charge.failed',
    'charge.refunded',
] as const;

@RegisterClass(BasePaymentProvider, 'StripeACH')
export class StripeACHPaymentProvider extends StripePaymentProvider {
    /**
     * The declaration that changes who books the cash. See `BasePaymentProvider.SettlesAsynchronously` —
     * with this true, a caller leaves the payment `Pending` and the webhook promotes it.
     */
    public override get SettlesAsynchronously(): boolean {
        return true;
    }

    public override get HandledEventKinds(): readonly string[] {
        return ACH_HANDLED;
    }

    /** A submitted debit is already in flight; it never waits for an instrument the way a card does. */
    protected override get StubIntentStatus(): IntentStatus {
        return 'Processing';
    }

    /** 0.8% capped at $5 — see `AchFeeEstimate` for why the stub reports a fee at all. */
    protected override StubFeeFor(amount: number, currencyCode: string): number {
        return AchFeeEstimate(amount, currencyCode);
    }

    /**
     * Pin the intent to the bank-debit rail.
     *
     * EXPLICIT RATHER THAN `automatic_payment_methods`. Letting Stripe choose would make the rail a
     * property of the account's dashboard settings, so the same code could open a card intent on one
     * deployment and a bank debit on another — with a fee, a settlement delay and a reversal risk that
     * differ by a factor of four and several days. The provider row says which rail this is; the
     * request should say the same thing.
     */
    protected override DecorateIntentBody(body: Record<string, string>, _request: CreateIntentRequest): void {
        body['payment_method_types[0]'] = US_BANK_ACCOUNT;
    }

    /**
     * Ask the bank what happened. Nothing is captured here — see the header.
     *
     * REFUSES ON ANYTHING BUT `succeeded`, and the two refusals say different things on purpose.
     * "Still processing" is the ordinary case — somebody captured too early, and they should wait for
     * the webhook — while a failure means the debit will not clear and waiting is pointless. Both come
     * back as refusals rather than exceptions, because neither is a fault: the gateway answered.
     */
    public override async Capture(request: CaptureRequest): Promise<CaptureResult> {
        if (this.useStub) {
            const amount = request.Amount ?? 0;
            return {
                Success: true,
                Amount: amount,
                FeeAmount: this.StubFeeFor(amount, request.CurrencyCode),
                ProviderChargeID: `ch_stub_ach_${request.ProviderIntentID.slice(-12)}`,
                Status: 'Succeeded',
            };
        }

        const read = await this.call('GET', `/payment_intents/${encodeURIComponent(request.ProviderIntentID)}`);
        if (!read.Ok) return { Success: false, Reason: read.Reason };

        const status = String(read.Body.status ?? '');
        if (status !== 'succeeded') {
            return {
                Success: false,
                Status: status === 'processing' ? 'Processing' : 'Failed',
                Reason:
                    status === 'processing'
                        ? `The bank debit ${request.ProviderIntentID} has not cleared yet — it is still processing. ` +
                          `A bank debit settles on the bank's schedule, so this payment will be captured by the ` +
                          `webhook when the answer arrives rather than by asking again now.`
                        : `The bank debit ${request.ProviderIntentID} reads '${status}' at Stripe, so no money moved. ` +
                          `Capturing it would book cash that does not exist.`,
            };
        }

        const currency = (read.Body.currency as string) ?? request.CurrencyCode;
        const charge = this.latestCharge(read.Body);
        const receivedMinor = Number(read.Body.amount_received ?? read.Body.amount ?? 0);

        return {
            Success: true,
            Amount: FromMinorUnits(receivedMinor, currency),
            // UNDEFINED rather than zero when it cannot be read — the same rule as the card path, and
            // for the same reason: "we do not know the fee" must not be recorded as "there was no fee".
            FeeAmount: await this.feeFor(charge, currency),
            ProviderChargeID: charge ?? undefined,
            Status: 'Succeeded',
        };
    }

    /**
     * Read a `charge.failed`, which the base driver has no reason to know about.
     *
     * THIS IS THE RETURN, and it is the event this whole rail exists to survive. It can arrive after
     * the payment has been booked, in which case `charge.failed` is the only notice that money which
     * appeared to arrive has gone back out. The base handles `payment_intent.*` and `charge.refunded`
     * correctly, so everything else defers to it.
     *
     * The failure MESSAGE is carried through verbatim. Stripe writes it for a human ("insufficient
     * funds", "no account"), and it ends up on the reversing payment's reason — which is the only place
     * anyone reconciling next month will look.
     */
    public override ParseWebhookEvent(rawBody: string): WebhookEvent | null {
        const event = super.ParseWebhookEvent(rawBody);
        if (!event || event.Kind !== 'charge.failed') return event;

        let object: Record<string, unknown>;
        try {
            const payload = JSON.parse(rawBody) as Record<string, unknown>;
            object = ((payload.data as Record<string, unknown>)?.object ?? {}) as Record<string, unknown>;
        } catch {
            return event;
        }

        const currency = ((object.currency as string) ?? 'usd').toUpperCase();
        event.ProviderChargeID = (object.id as string | undefined) ?? event.ProviderChargeID;
        event.ProviderIntentID = (object.payment_intent as string | undefined) ?? event.ProviderIntentID;
        event.Status = 'Failed';

        const minor = Number(object.amount ?? 0);
        if (Number.isFinite(minor) && minor > 0) event.Amount = FromMinorUnits(minor, currency);

        const message = object.failure_message ?? object.failure_code;
        if (message) event.FailureReason = String(message);

        return event;
    }
}

/** Tree-shaking anchor — call from the server bootstrap so @RegisterClass is retained. */
export function LoadStripeACHPaymentProvider(): void {
    // intentionally empty
}
